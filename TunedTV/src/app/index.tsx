import { WebView } from 'react-native-webview';
import { StyleSheet, View, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRef } from 'react';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

function isOAuthUrl(url: string) {
  return (
    url.includes('appleid.apple.com') ||
    url.includes('accounts.google.com') ||
    url.includes('oauth.lovable.app') ||
    url.includes('/~oauth/') ||
    url.includes('supabase.co/auth/v1/authorize')
  );
}

function isOAuthCallback(url: string) {
  return url.includes('tunedtv.com') && (url.includes('code=') || url.includes('access_token='));
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);

  async function handleOAuth(url: string) {
    const result = await WebBrowser.openAuthSessionAsync(url, 'https://tunedtv.com');
    if (result.type === 'success' || result.type === 'dismiss') {
      webViewRef.current?.reload();
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
          if (request.url.includes('tunedtv.com') && !isOAuthUrl(request.url)) {
            return true;
          }
          if (isOAuthUrl(request.url)) {
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
