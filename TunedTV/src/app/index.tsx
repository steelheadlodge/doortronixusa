import { WebView } from 'react-native-webview';
import { StyleSheet, View, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRef } from 'react';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

// Only open the auth sheet at the start of Supabase OAuth.
// Intercepting accounts.google.com separately breaks the flow (blank page).
function isSupabaseOAuthStart(url: string) {
  return url.includes('supabase.co/auth/v1/authorize');
}

function isOAuthCallback(url: string) {
  return url.includes('tunedtv.com') && (url.includes('code=') || url.includes('access_token='));
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const authSessionOpen = useRef(false);

  async function handleOAuth(url: string) {
    if (authSessionOpen.current) return;
    authSessionOpen.current = true;
    try {
      const result = await WebBrowser.openAuthSessionAsync(url, 'https://tunedtv.com', {
        preferEphemeralSession: false,
      });
      if (result.type === 'success' && result.url) {
        webViewRef.current?.injectJavaScript(
          `window.location.replace(${JSON.stringify(result.url)}); true;`
        );
      } else {
        webViewRef.current?.reload();
      }
    } finally {
      authSessionOpen.current = false;
    }
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
          if (isOAuthCallback(navState.url)) {
            webViewRef.current?.reload();
          }
        }}
        onShouldStartLoadWithRequest={(request) => {
          if (request.url.includes('tunedtv.com')) {
            return true;
          }
          if (isSupabaseOAuthStart(request.url)) {
            handleOAuth(request.url);
            return false;
          }
          Linking.openURL(request.url);
          return false;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  webview: {
    flex: 1,
  },
});
