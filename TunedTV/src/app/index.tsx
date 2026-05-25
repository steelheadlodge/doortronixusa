import { WebView } from 'react-native-webview';
import { StyleSheet, View, Linking, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const OAUTH_REDIRECT = 'https://tunedtv.com';

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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const authSessionOpen = useRef(false);
  const pendingOAuthUrl = useRef<string | null>(null);
  const [authInProgress, setAuthInProgress] = useState(false);

  function stopWebViewOAuth() {
    webViewRef.current?.stopLoading();
  }

  async function handleOAuth(url: string) {
    if (authSessionOpen.current) return;
    authSessionOpen.current = true;
    pendingOAuthUrl.current = url;
    setAuthInProgress(true);
    stopWebViewOAuth();

    try {
      const result = await WebBrowser.openAuthSessionAsync(url, OAUTH_REDIRECT, {
        preferEphemeralSession: false,
        showInRecents: false,
      });

      if (result.type === 'success' && result.url) {
        webViewRef.current?.injectJavaScript(
          `window.location.replace(${JSON.stringify(result.url)}); true;`
        );
      } else {
        // Shared cookies from the auth session should still apply after reload.
        webViewRef.current?.reload();
      }
    } finally {
      authSessionOpen.current = false;
      pendingOAuthUrl.current = null;
      setAuthInProgress(false);
    }
  }

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

          // Catch OAuth navigations that slip past onShouldStartLoadWithRequest.
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

          // Never load Google/Apple/Supabase auth inside the WebView — Google blocks it.
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
