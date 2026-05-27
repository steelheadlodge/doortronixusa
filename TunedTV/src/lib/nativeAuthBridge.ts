import type { NativeAuthResult } from './nativeAuth';

export function buildSignInWithIdTokenScript(result: NativeAuthResult) {
  const payload: { provider: NativeAuthResult['provider']; token: string; nonce?: string } = {
    provider: result.provider,
    token: result.token,
  };
  if (result.nonce) {
    payload.nonce = result.nonce;
  }

  return `
    (function () {
      var payload = ${JSON.stringify(payload)};
      var attempts = 0;
      function finish(bridgeResult) {
        window.dispatchEvent(new CustomEvent('tunedtv:auth:result', { detail: bridgeResult || { ok: false } }));
        if (bridgeResult && bridgeResult.ok) {
          window.dispatchEvent(new CustomEvent('tunedtv:auth:success'));
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'tunedtv:auth:result',
              ok: true
            }));
          }
          window.location.replace('https://tunedtv.com/');
          return;
        }
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'tunedtv:auth:result',
            ok: false,
            error: bridgeResult && bridgeResult.error
          }));
        }
        window.dispatchEvent(new CustomEvent('tunedtv:auth:cancelled', {
          detail: { error: (bridgeResult && bridgeResult.error) || 'Sign-in failed' }
        }));
      }
      function tryBridge() {
        var bridge = window.__tunedtvNativeAuth;
        if (bridge && bridge.signInWithIdToken) {
          bridge.signInWithIdToken(payload).then(finish).catch(function (err) {
            finish({ ok: false, error: (err && err.message) || 'signInWithIdToken failed' });
          });
          return;
        }
        if (attempts++ < 50) {
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

export function buildAuthCancelledScript(error?: string) {
  return `
    (function () {
      window.dispatchEvent(new CustomEvent('tunedtv:auth:cancelled', {
        detail: { error: ${JSON.stringify(error ?? 'Sign in cancelled')} }
      }));
    })();
    true;
  `;
}

export type WebAuthRequest = {
  type: 'tunedtv:auth:request';
  provider: 'google' | 'apple';
  requestId?: string;
};

export type WebAuthResult = {
  type: 'tunedtv:auth:result';
  ok: boolean;
  error?: string;
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
  try {
    var hrefDescriptor = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
    if (hrefDescriptor && hrefDescriptor.set) {
      Object.defineProperty(window.location, 'href', {
        configurable: true,
        enumerable: true,
        get: hrefDescriptor.get
          ? function () { return hrefDescriptor.get.call(window.location); }
          : undefined,
        set: function (url) { hrefDescriptor.set.call(window.location, guardUrl(String(url))); }
      });
    }
  } catch (e) {}
  var open = window.open;
  window.open = function (url) {
    if (url && isBlockedOAuthUrl(String(url))) {
      requestNative(providerFromUrl(String(url)));
      return null;
    }
    return open.apply(window, arguments);
  };
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var link = target.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href');
    if (!href || !isBlockedOAuthUrl(href)) return;
    event.preventDefault();
    event.stopPropagation();
    requestNative(providerFromUrl(href));
  }, true);
})();
true;
`;

// Prevent horizontal drift, zoom, and rubber-band overscroll in the WebView shell.
export const IOS_VIEWPORT_LOCK = `
(function () {
  if (!/TunedTV-iOS/i.test(navigator.userAgent)) return;
  function lockViewport() {
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.documentElement.appendChild(meta);
    }
    meta.setAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
    );
    if (!document.getElementById('tunedtv-native-lock')) {
      var style = document.createElement('style');
      style.id = 'tunedtv-native-lock';
      style.textContent =
        'html, body { overflow-x: hidden !important; width: 100% !important; max-width: 100% !important; overscroll-behavior-x: none; }';
      document.documentElement.appendChild(style);
    }
  }
  lockViewport();
  document.addEventListener('DOMContentLoaded', lockViewport);
})();
true;
`;

export const IOS_WEBVIEW_INJECT =
  IOS_AUTH_GUARD + '\n' + IOS_VIEWPORT_LOCK;

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

export function parseWebAuthResult(raw: string): WebAuthResult | null {
  try {
    const message = JSON.parse(raw) as WebAuthResult;
    if (message.type === 'tunedtv:auth:result' && typeof message.ok === 'boolean') {
      return message;
    }
  } catch {
    return null;
  }
  return null;
}
