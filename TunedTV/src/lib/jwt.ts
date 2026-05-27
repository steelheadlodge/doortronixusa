function base64UrlToString(base64Url: string): string {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  if (typeof globalThis.atob !== 'function') {
    return '';
  }
  return globalThis.atob(padded);
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const json = base64UrlToString(parts[1]);
    if (!json) {
      return null;
    }
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getJwtNonceClaim(token: string): string | null {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.nonce !== 'string' || !payload.nonce) {
    return null;
  }
  return payload.nonce;
}
