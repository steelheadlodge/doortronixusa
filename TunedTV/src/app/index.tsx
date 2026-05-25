import { WebView } from 'react-native-webview';
import { StyleSheet, View, Linking, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { configureNativeAuth, signInNatively } from '@/lib/nativeAuth';
import {
  buildAuthCancelledScript,
  buildSignInWithIdTokenScript,
  IOS_WEBVIEW_INJECT,
  parseWebAuthRequest,
} from '@/lib/nativeAuthBridge';

WebBrowser.maybeCompleteAuthSession();

const APP_OAUTH_REDIRECT = 'tunedtv://auth/callback';
const SUPABASE_REDIRECT = 'https://tunedtv.com/~oauth/callback';

function isSupabaseOAuthStart(url: string) {
  return url.includes('supabase.co/auth/v1/authorize');
}

function isLovableOAuthUrl(url: string) {
  return url.includes('oauth.lovable.app');
}

function isSocialOAuthUrl(url: string) {
  return (
    isSupabaseOAuthStart(url) ||
    isLovableOAuthUrl(url) ||
    url.includes('accounts.google.com') ||
    url.includes('appleid.apple.com')
  );
}

function isOAuthCallback(url: string) {
  return (
    url.includes('tunedtv.com') &&
    (url.includes('code=') || url.includes('access_token=') || url.includes('error='))
  );
}

function isAllowedInWebView(url: string) {
  return url.includes('tunedtv.com') && !isOAuthCallback(url);
}

function getSocialProviderFromUrl(url: string): 'apple' | 'google' | null {
  try {
    const provider = new URL(url).searchParams.get('provider');
    if (provider === 'apple' || provider === 'google') {
      return provider;
    }
  } catch {
    // ignore
  }
  if (url.includes('appleid.apple.com') || url.includes('provider=apple')) {
    return 'apple';
  }
  if (url.includes('accounts.google.com') || url.includes('provider=google')) {
    return 'google';
  }
  return null;
}

function authTailFromNativeUrl(nativeUrl: string) {
  const marker = 'auth/callback';
  const idx = nativeUrl.indexOf(marker);
  if (idx !== -1) {
    return nativeUrl.slice(idx + marker.length);
  }
  const hashIndex = nativeUrl.indexOf('#');
  if (hashIndex !== -1) {
    return nativeUrl.slice(hashIndex);
  }
  const queryIndex = nativeUrl.indexOf('?');
  if (queryIndex !== -1) {
    return nativeUrl.slice(queryIndex);
  }
  return '';
}

function toWebCallbackUrl(nativeUrl: string) {
  return `${SUPABASE_REDIRECT}${authTailFromNativeUrl(nativeUrl)}`;
}

function parseAuthParams(url: string) {
  const tail = authTailFromNativeUrl(url);
  const paramString = tail.startsWith('#')
    ? tail.slice(1)
    : tail.startsWith('?')
      ? tail.slice(1)
      : tail;
  return Object.fromEntries(new URLSearchParams(paramString));
}

function buildSetSessionScript(params: Record<string, string>, resultUrl: string) {
  if (!params.access_token) {
    return null;
  }
  const session = {
    access_token: params.access_token,
    refresh_token: params.refresh_token ?? '',
  };
  const fallback = toWebCallbackUrl(resultUrl);
  return `
    (function () {
      var session = ${JSON.stringify(session)};
      var fallback = ${JSON.stringify(fallback)};
      var attempts = 0;
      function done() { window.location.replace('https://tunedtv.com/'); }
      function tryBridge() {
        var bridge = window.__tunedtvNativeAuth;
        if (bridge && bridge.setSession) {
          bridge.setSession(session).then(done).catch(done);
          return;
        }
        if (attempts++ < 30) { setTimeout(tryBridge, 100); return; }
        window.location.replace(fallback);
      }
      tryBridge();
    })();
    true;
  `;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const nativeAuthInProgress = useRef(false);
  const pendingNativeProvider = useRef<'apple' | 'google' | null>(null);
  const [authInProgress, setAuthInProgress] = useState(false);
  const [webUri, setWebUri] = useState('https://tunedtv.com');

  useEffect(() => {
    configureNativeAuth();
  }, []);

  const stopWebViewOAuth = useCallback(() => {
    webViewRef.current?.stopLoading();
  }, []);

  const completeOAuthInWebView = useCallback((resultUrl: string) => {
    const params = parseAuthParams(resultUrl);
    const sessionScript = buildSetSessionScript(params, resultUrl);
    if (sessionScript) {
      webViewRef.current?.injectJavaScript(sessionScript);
      return;
    }
    setWebUri(toWebCallbackUrl(resultUrl));
  }, []);

  const completeNativeAuthInWebView = useCallback((result: NonNullable<Awaited<ReturnType<typeof signInNatively>>>) => {
    webViewRef.current?.injectJavaScript(buildSignInWithIdTokenScript(result));
  }, []);

  const handleNativeAuthRequest = useCallback(
    async (provider: 'google' | 'apple') => {
      if (nativeAuthInProgress.current) {
        return;
      }
      nativeAuthInProgress.current = true;
      pendingNativeProvider.current = provider;
      setAuthInProgress(true);
      stopWebViewOAuth();

      try {
        const result = await signInNatively(provider);
        if (result) {
          completeNativeAuthInWebView(result);
        } else {
          webViewRef.current?.injectJavaScript(buildAuthCancelledScript());
        }
      } catch {
        webViewRef.current?.injectJavaScript(buildAuthCancelledScript());
      } finally {
        nativeAuthInProgress.current = false;
        pendingNativeProvider.current = null;
        setAuthInProgress(false);
      }
    },
    [completeNativeAuthInWebView, stopWebViewOAuth]
  );

  const interceptIosSocialOAuth = useCallback(
    (url: string) => {
      if (Platform.OS !== 'ios' || !isSocialOAuthUrl(url)) {
        return false;
      }
      stopWebViewOAuth();
      const provider = getSocialProviderFromUrl(url) ?? pendingNativeProvider.current;
      if (provider && !nativeAuthInProgress.current) {
        handleNativeAuthRequest(provider);
      }
      return true;
    },
    [handleNativeAuthRequest, stopWebViewOAuth]
  );

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url.startsWith(APP_OAUTH_REDIRECT)) {
        completeOAuthInWebView(url);
      }
    });
    return () => subscription.remove();
  }, [completeOAuthInWebView]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <WebView
        ref={webViewRef}
        userAgent={Platform.OS === 'ios' ? 'TunedTV-iOS/1.0' : 'TunedTV-Android/1.0'}
        source={{ uri: webUri }}
        style={styles.webview}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        scalesPageToFit={false}
        injectedJavaScriptBeforeContentLoaded={Platform.OS === 'ios' ? IOS_WEBVIEW_INJECT : undefined}
        onMessage={(event) => {
          if (Platform.OS !== 'ios') {
            return;
          }
          const request = parseWebAuthRequest(event.nativeEvent.data);
          if (request) {
            pendingNativeProvider.current = request.provider;
            handleNativeAuthRequest(request.provider);
          }
        }}
        onNavigationStateChange={(navState) => {
          const { url } = navState;
          if (isOAuthCallback(url)) {
            setWebUri('https://tunedtv.com/');
            return;
          }
          if (Platform.OS === 'ios') {
            interceptIosSocialOAuth(url);
          }
        }}
        onShouldStartLoadWithRequest={(request) => {
          const { url, isTopFrame } = request;
          if (isTopFrame === false) {
            return true;
          }
          if (isAllowedInWebView(url) || isOAuthCallback(url)) {
            return true;
          }
          if (Platform.OS === 'ios' && interceptIosSocialOAuth(url)) {
            return false;
          }
          if (url.startsWith('http')) {
            Linking.openURL(url);
          }
          return false;
        }}
      />
      {authInProgress && (
        <View style={styles.authOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
  },
  authOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
