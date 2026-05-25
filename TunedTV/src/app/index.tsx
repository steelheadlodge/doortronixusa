import { WebView } from 'react-native-webview';
import { StyleSheet, View, Linking, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const OAUTH_REDIRECT = 'tunedtv://auth/callback';
const WEB_OAUTH_CALLBACK = 'https://tunedtv.com/~oauth/callback';
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

function withNativeRedirect(url: string) {
  const parsed = new URL(url);
  parsed.searchParams.set('redirect_to', OAUTH_REDIRECT);
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
  return `${WEB_OAUTH_CALLBACK}${authTailFromNativeUrl(nativeUrl)}`;
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

// Force Supabase OAuth to redirect back into the native app (runs before page JS).
const IOS_OAUTH_PATCH = `
(function () {
  if (!/TunedTV-iOS/i.test(navigator.userAgent)) return;
  var REDIRECT = ${JSON.stringify(OAUTH_REDIRECT)};
  function patchUrl(url) {
    if (!url || url.indexOf('supabase.co/auth/v1/authorize') === -1) return url;
    try {
      var parsed = new URL(url, window.location.href);
      parsed.searchParams.set('redirect_to', REDIRECT);
      return parsed.toString();
    } catch (e) {
      return url;
    }
  }
  var assign = window.location.assign.bind(window.location);
  window.location.assign = function (url) { return assign(patchUrl(url)); };
  var replace = window.location.replace.bind(window.location);
  window.location.replace = function (url) { return replace(patchUrl(url)); };
  document.addEventListener('click', function (event) {
    var el = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!el) return;
    var href = el.getAttribute('href');
    var next = patchUrl(href);
    if (next && next !== href) el.setAttribute('href', next);
  }, true);
})();
true;
`;

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

      const authUrl = withNativeRedirect(url);

      try {
        const result = await WebBrowser.openAuthSessionAsync(authUrl, OAUTH_REDIRECT, {
          preferEphemeralSession: false,
          showInRecents: false,
        });

        if (result.type === 'success' && result.url) {
          completeAuthInWebView(result.url);
        } else {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl?.startsWith(OAUTH_REDIRECT)) {
            completeAuthInWebView(initialUrl);
          } else {
            webViewRef.current?.reload();
          }
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
      if (url.startsWith(OAUTH_REDIRECT)) {
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
        injectedJavaScriptBeforeContentLoaded={Platform.OS === 'ios' ? IOS_OAUTH_PATCH : undefined}
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
