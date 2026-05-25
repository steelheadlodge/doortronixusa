import { WebView } from 'react-native-webview';
import { StyleSheet, View, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

function isOAuthUrl(url: string) {
  return (
    url.includes('appleid.apple.com') ||
    url.includes('accounts.google.com') ||
    url.includes('oauth.lovable.app') ||
    url.includes('/~oauth/')
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  async function handleOAuth(url: string) {
    await WebBrowser.openAuthSessionAsync(url, 'https://tunedtv.com');
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <WebView
        userAgent={Platform.OS === 'ios' ? 'TunedTV-iOS/1.0' : 'TunedTV-Android/1.0'}
        source={{ uri: 'https://tunedtv.com' }}
        style={styles.webview}
        sharedCookiesEnabled
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(request) => {
          if (request.url.includes('tunedtv.com')) {
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
