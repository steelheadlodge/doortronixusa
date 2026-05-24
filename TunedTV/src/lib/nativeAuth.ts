import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';
import { Platform } from 'react-native';

// Initialize (placeholder for future Google Sign-In)
export function configureGoogleSignIn() {
  // Google Sign-In will be added in a future update
}

// Apple Sign-In (iOS only)
export async function signInWithApple(): Promise<{ session: any; error: any }> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return { session: null, error: new Error('No identity token received from Apple') };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error) {
      return { session: null, error };
    }

    return { session: data.session, error: null };
  } catch (error: any) {
    if (error.code === 'ERR_REQUEST_CANCELED') {
      return { session: null, error: null };
    }
    return { session: null, error };
  }
}

// Google Sign-In - placeholder for future implementation
export async function signInWithGoogle(): Promise<{ session: any; error: any }> {
  return { session: null, error: new Error('Google Sign-In coming soon. Please use Apple or Email.') };
}

// Check if Apple Sign-In is available (iOS 13+)
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return await AppleAuthentication.isAvailableAsync();
}

// Sign out
export async function signOutNative() {
  await supabase.auth.signOut();
}

// Get the current session access token for WebView injection
export async function getSessionToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}
