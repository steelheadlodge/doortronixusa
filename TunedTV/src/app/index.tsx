import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { StyleSheet, View, Linking, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRef, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import NativeSignIn from '../components/NativeSignIn';

type AuthState = 'loading' | 'signed_out' | 'signed_in';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [sessionToken, setSessionToken] = useState<{ access: string; refresh: string } | null>(null);
  const [showEmailAuth, setShowEmailAuth] = useState(false);

  useEffect(() => {
    checkExistingSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setSessionToken({
          access: session.access_token,
          refresh: session.refresh_token,
        });
        setAuthState('signed_in');
      } else if (event === 'SIGNED_OUT') {
        setSessionToken(null);
        setAuthState('signed_out');
        setShowEmailAuth(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function checkExistingSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setSessionToken({
        access: session.access_token,
        refresh: session.refresh_token,
      });
      setAuthState('signed_in');
    } else {
      setAuthState('signed_out');
    }
  }

  function handleNativeSignInSuccess(accessToken: string, refreshToken: string) {
    setSessionToken({ access: accessToken, refresh: refreshToken });
    setAuthState('signed_in');
  }

  function handleSkipToEmail() {
    setShowEmailAuth(true);
  }

  function injectSessionIntoWebView() {
    if (!webViewRef.current || !sessionToken) return;
    
    const script = `
      (function() {
        try {
          const session = {
            access_token: '${sessionToken.access}',
            refresh_token: '${sessionToken.refresh}',
            token_type: 'bearer'
          };
          localStorage.setItem('supabase.auth.token', JSON.stringify({ currentSession: session }));
          window.postMessage(JSON.stringify({ type: 'NATIVE_SESSION_INJECTED' }), '*');
        } catch(e) {
          console.error('Session injection failed:', e);
        }
      })();
      true;
    `;
    webViewRef.current.injectJavaScript(script);
  }

  function handleWebViewMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'SIGN_OUT') {
        supabase.auth.signOut();
      }
    } catch (e) {
      // Ignore non-JSON messages
    }
  }

  if (authState === 'loading') {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (authState === 'signed_out' && !showEmailAuth) {
    return (
      <NativeSignIn
        onSignInSuccess={handleNativeSignInSuccess}
        onSkipToEmail={handleSkipToEmail}
      />
    );
  }

  const webViewUrl = showEmailAuth 
    ? 'https://tunedtv.com?native=1&show_email_auth=1'
    : 'https://tunedtv.com';

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <WebView
        ref={webViewRef}
        userAgent={Platform.OS === 'ios' ? 'TunedTV-iOS/1.0' : 'TunedTV-Android/1.0'}
        source={{ uri: webViewUrl }}
        style={styles.webview}
        setSupportMultipleWindows={false}
        onLoadEnd={() => {
          if (sessionToken) {
            injectSessionIntoWebView();
          }
        }}
        onMessage={handleWebViewMessage}
        onShouldStartLoadWithRequest={(request) => {
          if (request.url.includes('tunedtv.com')) {
            return true;
          }
          if (request.url.includes('accounts.google.com') || request.url.includes('appleid.apple.com')) {
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
