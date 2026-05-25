import type { NativeAuthResult } from './nativeAuth';

export function buildSignInWithIdTokenScript(result: NativeAuthResult) {
  const payload =
    result.provider === 'apple'
      ? { provider: 'apple', token: result.token, nonce: result.nonce }
      : { provider: 'google', token: result.token };

  return `
    (function () {
      var payload = ${JSON.stringify(payload)};
      var attempts = 0;
      function finish(bridgeResult) {
        window.dispatchEvent(new CustomEvent('tunedtv:auth:result', { detail: bridgeResult || { ok: false } }));
        if (bridgeResult && bridgeResult.ok) {
          window.dispatchEvent(new CustomEvent('tunedtv:auth:success'));
          window.location.replace('https://tunedtv.com/profile');
          return;
        }
        window.dispatchEvent(new CustomEvent('tunedtv:auth:cancelled'));
      }
      function tryBridge() {
        var bridge = window.__tunedtvNativeAuth;
        if (bridge && bridge.signInWithIdToken) {
          bridge.signInWithIdToken(payload).then(finish).catch(function () { finish({ ok: false }); });
          return;
        }
        if (attempts++ < 30) {
          setTimeout(tryBridge, 100);
          return;
        }
        finish({ ok: false, error: 'Native auth bridge not ready' });
      }
      tryBridge();
    })();
    true;
  `;
}

export function buildAuthCancelledScript() {
  return `
    (function () {
      window.dispatchEvent(new CustomEvent('tunedtv:auth:cancelled'));
    })();
    true;
  `;
}

export type WebAuthRequest = {
  type: 'tunedtv:auth:request';
  provider: 'google' | 'apple';
  requestId?: string;
};

// Block web OAuth navigations on iOS — native SDK handles Apple/Google instead.
export const IOS_AUTH_GUARD = `
(function () {
  if (!/TunedTV-iOS/i.test(navigator.userAgent)) return;
  function providerFromUrl(url) {
    if (!url) return null;
    if (url.indexOf('provider=apple') !== -1 || url.indexOf('appleid.apple.com') !== -1) return 'apple';
    if (url.indexOf('provider=google') !== -1 || url.indexOf('accounts.google.com') !== -1) return 'google';
    return null;
  }
  function isBlockedOAuthUrl(url) {
    return url && (
      url.indexOf('oauth.lovable.app') !== -1 ||
      url.indexOf('supabase.co/auth/v1/authorize') !== -1 ||
      url.indexOf('appleid.apple.com') !== -1 ||
      url.indexOf('accounts.google.com') !== -1
    );
  }
  function requestNative(provider) {
    if (window.ReactNativeWebView && provider) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'tunedtv:auth:request',
        provider: provider
      }));
    }
  }
  function guardUrl(url) {
    if (!isBlockedOAuthUrl(url)) return url;
    requestNative(providerFromUrl(url));
    return 'https://tunedtv.com/';
  }
  var assign = window.location.assign.bind(window.location);
  var replace = window.location.replace.bind(window.location);
  window.location.assign = function (url) { return assign(guardUrl(url)); };
  window.location.replace = function (url) { return replace(guardUrl(url)); };
})();
true;
`;

export function parseWebAuthRequest(raw: string): WebAuthRequest | null {
  try {
    const message = JSON.parse(raw) as WebAuthRequest;
    if (message.type === 'tunedtv:auth:request' && (message.provider === 'google' || message.provider === 'apple')) {
      return message;
    }
  } catch {
    return null;
  }
  return null;
}
