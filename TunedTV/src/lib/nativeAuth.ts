import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  GoogleSignin,
  isCancelledResponse,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import { getJwtNonceClaim } from './jwt';

const GOOGLE_IOS_CLIENT_ID =
  '585609408161-7clkl3840gq1j05k9pc2jl36mcumsi60.apps.googleusercontent.com';
const GOOGLE_WEB_CLIENT_ID =
  '585609408161-eqk6rdk1kfd2rn94brlet4jp50eejo13.apps.googleusercontent.com';

export type NativeAuthProvider = 'apple' | 'google';

export type NativeAuthResult = {
  provider: NativeAuthProvider;
  token: string;
  nonce?: string;
};

let configured = false;

export function configureNativeAuth() {
  if (configured) {
    return;
  }
  GoogleSignin.configure({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
  configured = true;
}

async function createNoncePair() {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce
  );
  return { rawNonce, hashedNonce };
}

export async function signInNatively(provider: NativeAuthProvider): Promise<NativeAuthResult | null> {
  configureNativeAuth();

  if (provider === 'apple') {
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      throw new Error('Sign in with Apple is not available on this device');
    }

    const { rawNonce, hashedNonce } = await createNoncePair();

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        throw new Error('Apple sign-in did not return an identity token');
      }

      return {
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      };
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code: string }).code)
          : '';
      if (code.includes('CANCELED') || code.includes('CANCELLED')) {
        return null;
      }
      throw error;
    }
  }

  const { rawNonce, hashedNonce } = await createNoncePair();

  await GoogleSignin.signOut().catch(() => undefined);
  const response = await GoogleSignin.signIn({ nonce: hashedNonce } as Parameters<
    typeof GoogleSignin.signIn
  >[0]);
  if (isCancelledResponse(response)) {
    return null;
  }
  if (!isSuccessResponse(response)) {
    throw new Error('Google sign-in failed');
  }

  let idToken = response.data.idToken;
  if (!idToken) {
    const tokens = await GoogleSignin.getTokens();
    idToken = tokens.idToken;
  }
  if (!idToken) {
    throw new Error('Google sign-in did not return an ID token');
  }

  const tokenNonce = getJwtNonceClaim(idToken);
  if (!tokenNonce) {
    return { provider: 'google', token: idToken };
  }

  if (tokenNonce !== hashedNonce) {
    throw new Error(
      'Google sign-in nonce mismatch — install the latest app build and try again'
    );
  }

  return { provider: 'google', token: idToken, nonce: rawNonce };
}
