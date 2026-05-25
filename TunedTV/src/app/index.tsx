import { WebView } from 'react-native-webview';
import { StyleSheet, View, Linking, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

// HTTPS redirects don't return to the app on iOS (needs Associated Domains).
// Custom scheme lets ASWebAuthenticationSession hand tokens back to the app.
const OAUTH_REDIRECT = 'tunedtv://auth/callback';
const WEB_OAUTH_CALLBACK = 'https://tunedtv.com/~oauth/callback';

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

function withNativeRedirect(url: string) {
  const parsed = new URL(url);
  parsed.searchParams.set('redirect_to', OAUTH_REDIRECT);
  return parsed.toString();
}

function toWebCallbackUrl(nativeUrl: string) {
  const hashIndex = nativeUrl.indexOf('#');
  if (hashIndex !== -1) {
    return `${WEB_OAUTH_CALLBACK}${nativeUrl.slice(hashIndex)}`;
  }
  const queryIndex = nativeUrl.indexOf('?');
  if (queryIndex !== -1) {
    return `${WEB_OAUTH_CALLBACK}${nativeUrl.slice(queryIndex)}`;
  }
  return WEB_OAUTH_CALLBACK;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const authSessionOpen = useRef(false);
  const [authInProgress, setAuthInProgress] = useState(false);

  function stopWebViewOAuth() {
    webViewRef.current?.stopLoading();
  }

  function completeAuthInWebView(resultUrl: string) {
    const webUrl = toWebCallbackUrl(resultUrl);
    webViewRef.current?.injectJavaScript(
      `window.location.replace(${JSON.stringify(webUrl)}); true;`
    );
  }

  async function handleOAuth(url: string) {
    if (authSessionOpen.current) return;
    authSessionOpen.current = true;
    setAuthInProgress(true);
    stopWebViewOAuth();

    const authUrl = withNativeRedirect(url);

    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, OAUTH_REDIRECT, {
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
  }

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url.startsWith(OAUTH_REDIRECT)) {
        completeAuthInWebView(url);
      }
    });
    return () => subscription.remove();
  }, []);

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
        source={{ uri: 'https://tunedtv.com' }}
        style={styles.webview}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        onNavigationStateChange={(navState) => {
          const { url } = navState;

          if (isOAuthCallback(url)) {
            webViewRef.current?.reload();
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
          const { url } = request;

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
