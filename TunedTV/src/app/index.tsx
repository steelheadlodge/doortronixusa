import { WebView } from 'react-native-webview';
import { StyleSheet, SafeAreaView, Linking } from 'react-native';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <WebView
        source={{ uri: 'https://tunedtv.com' }}
        style={styles.webview}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(request) => {
          if (request.url.includes('tunedtv.com')) {
            return true;
          }
          Linking.openURL(request.url);
          return false;
        }}
      />
    </SafeAreaView>
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
});
