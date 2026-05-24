import { WebView } from 'react-native-webview';
import { StyleSheet, View, Linking, Platform, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user?.email || null);
    });
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <WebView
        userAgent={Platform.OS === 'ios' ? 'TunedTV-iOS/1.0' : 'TunedTV-Android/1.0'}
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
