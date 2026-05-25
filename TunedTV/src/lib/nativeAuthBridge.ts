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
      function done() {
        window.location.replace('https://tunedtv.com/');
      }
      function tryBridge() {
        var bridge = window.__tunedtvNativeAuth;
        if (bridge && bridge.signInWithIdToken) {
          bridge.signInWithIdToken(payload).then(function (r) {
            if (r && r.ok) done();
          }).catch(function () {});
          return;
        }
        if (attempts++ < 30) {
          setTimeout(tryBridge, 100);
          return;
        }
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
