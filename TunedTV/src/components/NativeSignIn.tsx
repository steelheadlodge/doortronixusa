import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

interface NativeSignInProps {
  onSignInSuccess: (accessToken: string, refreshToken: string) => void;
  onSkipToEmail: () => void;
}

export default function NativeSignIn({ onSignInSuccess, onSkipToEmail }: NativeSignInProps) {
  const insets = useSafeAreaInsets();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    }
  }, []);

  async function handleAppleSignIn() {
    try {
      setLoading(true);
      setError(null);
      
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (credential.identityToken) {
        const { data, error: authError } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });

        if (authError) {
          setError(authError.message);
        } else if (data.session) {
          onSignInSuccess(data.session.access_token, data.session.refresh_token);
        }
      }
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        setError(e.message || 'Apple Sign-In failed');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>TunedTV</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>
      </View>

      <View style={styles.buttonsContainer}>
        {appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={12}
            style={styles.appleButton}
            onPress={handleAppleSignIn}
          />
        ) : null}
        
        {loading ? <ActivityIndicator style={styles.loader} color="#fff" /> : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={styles.emailButton}
          onPress={onSkipToEmail}
          disabled={loading}
        >
          <Text style={styles.emailText}>Continue with Email</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>
        By continuing, you agree to our Terms of Service and Privacy Policy
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
  },
  title: {
    fontSize: 42,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#999',
  },
  buttonsContainer: {
    width: '100%',
  },
  appleButton: {
    width: '100%',
    height: 56,
    marginBottom: 16,
  },
  loader: {
    position: 'absolute',
    right: 20,
  },
  errorText: {
    color: '#ff4444',
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 14,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#333',
  },
  dividerText: {
    color: '#666',
    paddingHorizontal: 16,
    fontSize: 14,
  },
  emailButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#444',
  },
  emailText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  footer: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
