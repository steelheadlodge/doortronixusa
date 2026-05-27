const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const NONCE_MARKER = 'options[@"nonce"]';
const ORIGINAL_SIGN_IN =
  '[GIDSignIn.sharedInstance signInWithPresentingViewController:presentingViewController hint:hint additionalScopes:scopes completion:^(GIDSignInResult * _Nullable signInResult, NSError * _Nullable error) {';
const PATCHED_SIGN_IN =
  '[GIDSignIn.sharedInstance signInWithPresentingViewController:presentingViewController hint:hint additionalScopes:scopes nonce:nonce completion:^(GIDSignInResult * _Nullable signInResult, NSError * _Nullable error) {';

function patchGoogleSignInNativeModule(projectRoot) {
  const mmPath = path.join(
    projectRoot,
    'node_modules/@react-native-google-signin/google-signin/ios/RNGoogleSignin.mm'
  );

  if (!fs.existsSync(mmPath)) {
    return;
  }

  let contents = fs.readFileSync(mmPath, 'utf8');
  if (contents.includes(NONCE_MARKER)) {
    return;
  }

  if (!contents.includes(ORIGINAL_SIGN_IN)) {
    return;
  }

  contents = contents.replace(
    '      NSString* hint = options[@"loginHint"];\n      NSArray* scopes = self.scopes;',
    '      NSString* hint = options[@"loginHint"];\n      NSString* nonce = options[@"nonce"];\n      NSArray* scopes = self.scopes;'
  );
  contents = contents.replace(ORIGINAL_SIGN_IN, PATCHED_SIGN_IN);
  fs.writeFileSync(mmPath, contents);
}

function withGoogleSignInNonce(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      patchGoogleSignInNativeModule(config.modRequest.projectRoot);
      return config;
    },
  ]);
}

module.exports = withGoogleSignInNonce;
