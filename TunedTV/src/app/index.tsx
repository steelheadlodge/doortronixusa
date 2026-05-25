import { WebView } from 'react-native-webview';
import { StyleSheet, View, Linking, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

// Supabase/Lovable only allow https redirect URLs — not tunedtv://
const SUPABASE_REDIRECT = 'https://tunedtv.com/~oauth/callback';
// iOS auth session listens for this after the web callback page bridges tokens back
const APP_OAUTH_REDIRECT = 'tunedtv://auth/callback';
const SUPABASE_STORAGE_KEY = 'sb-pbjxfitpjocaooxxafri-auth-token';

function isSupabaseOAuthStart(url: string) {
  return url.includes('supabase.co/auth/v1/authorize');
}

function isOAuthProviderUrl(url: string) {
  return (
    url.includes('accounts.google.com') ||
    url.includes('appleid.apple.com') ||
    url.includes('supabase.co/auth/v1/')
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

function withSupabaseRedirect(url: string) {
  const parsed = new URL(url);
  parsed.searchParams.set('redirect_to', SUPABASE_REDIRECT);
  return parsed.toString();
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

function buildSessionInjection(params: Record<string, string>) {
  if (!params.access_token) {
    return null;
  }
  const expiresIn = Number.parseInt(params.expires_in ?? '3600', 10);
  const session = {
    access_token: params.access_token,
    refresh_token: params.refresh_token ?? '',
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    token_type: params.token_type ?? 'bearer',
    provider_token: params.provider_token,
    provider_refresh_token: params.provider_refresh_token,
  };
  return `
    (function () {
      try {
        localStorage.setItem(
          ${JSON.stringify(SUPABASE_STORAGE_KEY)},
          ${JSON.stringify(JSON.stringify(session))}
        );
      } catch (e) {}
      window.location.replace('https://tunedtv.com/');
    })();
    true;
  `;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const authSessionOpen = useRef(false);
  const [authInProgress, setAuthInProgress] = useState(false);
  const [webUri, setWebUri] = useState('https://tunedtv.com');

  const stopWebViewOAuth = useCallback(() => {
    webViewRef.current?.stopLoading();
  }, []);

  const completeAuthInWebView = useCallback((resultUrl: string) => {
    const params = parseAuthParams(resultUrl);
    const sessionScript = buildSessionInjection(params);

    if (sessionScript) {
      webViewRef.current?.injectJavaScript(sessionScript);
      return;
    }

    setWebUri(toWebCallbackUrl(resultUrl));
  }, []);

  const handleOAuth = useCallback(
    async (url: string) => {
      if (authSessionOpen.current) return;
      authSessionOpen.current = true;
      setAuthInProgress(true);
      stopWebViewOAuth();

      const authUrl = withSupabaseRedirect(url);

      try {
        const result = await WebBrowser.openAuthSessionAsync(authUrl, APP_OAUTH_REDIRECT, {
          preferEphemeralSession: false,
          showInRecents: false,
        });

        if (result.type === 'success' && result.url) {
          completeAuthInWebView(result.url);
        } else {
          webViewRef.current?.reload();
        }
      } finally {
        authSessionOpen.current = false;
        setAuthInProgress(false);
      }
    },
    [completeAuthInWebView, stopWebViewOAuth]
  );

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url.startsWith(APP_OAUTH_REDIRECT)) {
        completeAuthInWebView(url);
      }
    });
    return () => subscription.remove();
  }, [completeAuthInWebView]);

  function handleExternalUrl(url: string) {
    if (isOAuthProviderUrl(url)) {
      if (isSupabaseOAuthStart(url)) {
        handleOAuth(url);
      }
      return;
    }
    Linking.openURL(url);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <WebView
        ref={webViewRef}
        userAgent={Platform.OS === 'ios' ? 'TunedTV-iOS/1.0' : 'TunedTV-Android/1.0'}
        source={{ uri: webUri }}
        style={styles.webview}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        onNavigationStateChange={(navState) => {
          const { url } = navState;

          if (isOAuthCallback(url)) {
            setWebUri('https://tunedtv.com/');
            return;
          }

          if (isOAuthProviderUrl(url)) {
            stopWebViewOAuth();
            if (isSupabaseOAuthStart(url) && !authSessionOpen.current) {
              handleOAuth(url);
            }
          }
        }}
        onShouldStartLoadWithRequest={(request) => {
          const { url, isTopFrame } = request;
          if (isTopFrame === false) {
            return true;
          }

          if (isAllowedInWebView(url)) {
            return true;
          }

          if (isOAuthCallback(url)) {
            return true;
          }

          if (isOAuthProviderUrl(url)) {
            if (isSupabaseOAuthStart(url)) {
              handleOAuth(url);
            }
            return false;
          }

          handleExternalUrl(url);
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
