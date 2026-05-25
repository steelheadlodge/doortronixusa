import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  GoogleSignin,
  isCancelledResponse,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';

const GOOGLE_IOS_CLIENT_ID =
  '585609408161-7clkl3840gq1j05k9pc2jl36mcumsi60.apps.googleusercontent.com';
const GOOGLE_WEB_CLIENT_ID =
  '585609408161-eqk6rdk1kfd2rn94brlet4jp50eejo13.apps.googleusercontent.com';

export type NativeAuthProvider = 'apple' | 'google';

export type NativeAuthResult =
  | { provider: 'apple'; token: string; nonce: string }
  | { provider: 'google'; token: string };

let configured = false;

export function configureNativeAuth() {
  if (configured) {
    return;
  }
  GoogleSignin.configure({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });
  configured = true;
}

export async function signInNatively(provider: NativeAuthProvider): Promise<NativeAuthResult | null> {
  configureNativeAuth();

  if (provider === 'apple') {
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      throw new Error('Sign in with Apple is not available on this device');
    }

    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce
    );

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
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ERR_REQUEST_CANCELED'
      ) {
        return null;
      }
      throw error;
    }
  }

  const response = await GoogleSignin.signIn();
  if (isCancelledResponse(response)) {
    return null;
  }
  if (!isSuccessResponse(response)) {
    throw new Error('Google sign-in failed');
  }

  const idToken = response.data.idToken;
  if (!idToken) {
    throw new Error('Google sign-in did not return an ID token');
  }

  return { provider: 'google', token: idToken };
}
