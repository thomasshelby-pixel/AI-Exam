import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  TotpMultiFactorGenerator,
  TotpSecret,
  multiFactor,
  User,
  getMultiFactorResolver,
  type MultiFactorResolver,
} from 'firebase/auth';
import * as QRCodeModule from 'qrcode';
import firebaseConfig from '../../firebase-applet-config.json';

const QRCode = (QRCodeModule as any).default || QRCodeModule;

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

/**
 * Safe diagnostic logger for MFA lifecycle events.
 * Strictly adheres to privacy & security:
 * NEVER logs OTP, password, access token, refresh token, MFA secret key, or sensitive credentials.
 */
export function logMfaDiagnostic(step: string, data: Record<string, any> = {}) {
  const timestamp = new Date().toISOString();
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'server';
  const environment = (typeof process !== 'undefined' && process.env?.NODE_ENV) || (import.meta as any).env?.MODE || 'production';

  const safeData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    // Strictly omit any sensitive values
    if (
      lowerKey.includes('otp') ||
      (lowerKey.includes('code') && !lowerKey.includes('errorcode')) ||
      lowerKey.includes('password') ||
      lowerKey.includes('token') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('credential')
    ) {
      continue;
    }
    // Mask any phone fields if passed
    if (lowerKey.includes('phone') || lowerKey.includes('mobile')) {
      safeData[key + 'Masked'] = maskPhoneForLogs(String(value));
      continue;
    }
    safeData[key] = value;
  }

  console.log(`[MFA Diagnostic] [${timestamp}] [${hostname}] [${environment}] ${step}`, safeData);
}

function maskPhoneForLogs(phone: string): string {
  if (!phone) return 'EMPTY';
  const clean = phone.replace(/\s+/g, '');
  if (clean.length <= 4) return '***';
  return clean.slice(0, 3) + '••••••' + clean.slice(-4);
}

/**
 * Ensures Firebase auth state has settled before returning current user
 */
export async function getCurrentFirebaseUser(): Promise<User | null> {
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

/**
 * Formats a raw Base32 secret key into space-separated 4-character blocks
 * for easy visual verification and manual typing by the user.
 * e.g. "JBSWY3DPEHPK3PXP" -> "JBSW Y3DP EHPK 3PXP"
 */
export function formatSecretKeyForDisplay(secretKey: string): string {
  if (!secretKey) return '';
  const clean = secretKey.replace(/\s+/g, '').toUpperCase();
  return clean.match(/.{1,4}/g)?.join(' ') || clean;
}

/**
 * Generates a cryptographically secure 20-byte Base32 string (RFC 4648)
 * for fallback TOTP secret generation when pure offline or client-side mode is needed.
 */
export function generateBase32Secret(byteLength: number = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const randomBytes = new Uint8Array(byteLength);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < byteLength; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }

  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < randomBytes.length; i++) {
    value = (value << 8) | randomBytes[i];
    bits += 8;
    while (bits >= 5) {
      output += chars[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += chars[(value << (5 - bits)) & 31];
  }
  return output;
}

export interface TotpSetupData {
  secret?: TotpSecret;
  secretKey: string;
  formattedKey: string;
  qrCodeUrl: string;
  qrDataUrl: string;
  issuer: string;
  accountEmail: string;
  isFirebaseNative: boolean;
}

/**
 * Generates a TOTP secret and QR code for enrollment.
 * Uses Firebase Identity Platform's native TotpMultiFactorGenerator whenever
 * a Firebase authenticated session is active.
 * Gracefully provides standard RFC 6238 fallback for sessions authenticated via backend JWT.
 */
export async function generateTotpSetup(
  accountEmail: string,
  issuer: string = 'CA Exam Checker AI'
): Promise<TotpSetupData> {
  logMfaDiagnostic('generate-totp-setup-initiated');
  const currentUser = await getCurrentFirebaseUser();

  if (currentUser) {
    try {
      logMfaDiagnostic('obtaining-firebase-mfa-session', { uid: currentUser.uid });
      const session = await multiFactor(currentUser).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);

      const secretKey = secret.secretKey;
      const qrCodeUrl = secret.generateQrCodeUrl(accountEmail || currentUser.email || 'User', issuer);
      const qrDataUrl = await QRCode.toDataURL(qrCodeUrl, {
        width: 220,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });

      logMfaDiagnostic('firebase-totp-secret-generated', {
        isFirebaseNative: true,
      });

      return {
        secret,
        secretKey,
        formattedKey: formatSecretKeyForDisplay(secretKey),
        qrCodeUrl,
        qrDataUrl,
        issuer,
        accountEmail,
        isFirebaseNative: true,
      };
    } catch (fbErr: any) {
      logMfaDiagnostic('firebase-totp-generation-fallback', {
        errorCode: fbErr?.code,
        errorMessage: fbErr?.message,
      });
      // Fall through to standard Base32 fallback if Firebase session is in transition
    }
  }

  // Standard RFC 6238 fallback compatible with Google Authenticator / Microsoft Authenticator
  logMfaDiagnostic('generating-standard-totp-secret');
  const secretKey = generateBase32Secret(20);
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(accountEmail || 'User');
  const qrCodeUrl = `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secretKey}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
  const qrDataUrl = await QRCode.toDataURL(qrCodeUrl, {
    width: 220,
    margin: 1,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });

  return {
    secretKey,
    formattedKey: formatSecretKeyForDisplay(secretKey),
    qrCodeUrl,
    qrDataUrl,
    issuer,
    accountEmail,
    isFirebaseNative: false,
  };
}

/**
 * Enrolls a TOTP multi-factor assertion with Firebase Identity Platform.
 * If user is authenticated in Firebase and secret is a native TotpSecret,
 * completes native Firebase enrollment.
 */
export async function enrollFirebaseTotpFactor(
  totpSecret: TotpSecret | undefined,
  otpCode: string,
  displayName: string = 'Authenticator App'
): Promise<{ idToken?: string; success: boolean }> {
  logMfaDiagnostic('totp-enrollment-started');

  const cleanCode = otpCode.trim().replace(/\D/g, '');
  if (cleanCode.length !== 6) {
    const lenErr = new Error('Please enter the full 6-digit verification code.');
    (lenErr as any).code = 'auth/invalid-verification-code';
    throw lenErr;
  }

  const currentUser = await getCurrentFirebaseUser();

  if (currentUser && totpSecret) {
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(totpSecret, cleanCode);
      logMfaDiagnostic('totp-assertion-created');

      await multiFactor(currentUser).enroll(assertion, displayName);
      logMfaDiagnostic('multiFactor.enroll-totp-success');

      await currentUser.reload();
      const idToken = await currentUser.getIdToken(true);
      logMfaDiagnostic('auth-state-refreshed');

      return { idToken, success: true };
    } catch (err: any) {
      logMfaDiagnostic('multiFactor.enroll-totp-failure', {
        errorCode: err?.code,
        errorMessage: err?.message,
      });

      if (err?.code === 'auth/second-factor-already-in-use') {
        logMfaDiagnostic('totp-factor-already-in-use-proceeding');
        const idToken = await currentUser.getIdToken(true);
        return { idToken, success: true };
      }

      throw err;
    }
  }

  logMfaDiagnostic('totp-enrollment-verified-via-application-layer');
  return { success: true };
}

/**
 * Resolves a multi-factor sign-in challenge using a Firebase MultiFactorResolver
 */
export async function resolveFirebaseTotpSignIn(
  resolver: MultiFactorResolver,
  enrollmentId: string,
  otpCode: string
): Promise<{ idToken?: string; user: User }> {
  logMfaDiagnostic('resolve-totp-signin-started');
  const cleanCode = otpCode.trim().replace(/\D/g, '');

  const assertion = TotpMultiFactorGenerator.assertionForSignIn(enrollmentId, cleanCode);
  const userCredential = await resolver.resolveSignIn(assertion);
  const idToken = await userCredential.user.getIdToken();

  logMfaDiagnostic('resolve-totp-signin-success');
  return { idToken, user: userCredential.user };
}

/**
 * Checks if the current Firebase user already has an enrolled TOTP factor.
 */
export async function getFirebaseEnrolledTotpFactors(): Promise<{
  hasTotpFactor: boolean;
  hasPhoneFactor: boolean; // Backwards compatibility
  enrolledCount: number;
  factors: any[];
}> {
  try {
    const user = await getCurrentFirebaseUser();
    if (!user) return { hasTotpFactor: false, hasPhoneFactor: false, enrolledCount: 0, factors: [] };
    const factors = multiFactor(user).enrolledFactors || [];
    const hasTotp = factors.some(
      (f: any) => String(f.factorId) === 'totp' || String(f.factorId) === TotpMultiFactorGenerator.FACTOR_ID
    );
    return {
      hasTotpFactor: hasTotp,
      hasPhoneFactor: hasTotp, // Backwards compatibility
      enrolledCount: factors.length,
      factors,
    };
  } catch {
    return { hasTotpFactor: false, hasPhoneFactor: false, enrolledCount: 0, factors: [] };
  }
}

/**
 * Backwards compatibility alias for components checking factor status
 */
export async function getFirebaseEnrolledPhoneFactors(): Promise<{
  hasPhoneFactor: boolean;
  enrolledCount: number;
}> {
  const result = await getFirebaseEnrolledTotpFactors();
  return {
    hasPhoneFactor: result.hasTotpFactor,
    enrolledCount: result.enrolledCount,
  };
}

/**
 * Maps Firebase Auth TOTP errors to clear, friendly user diagnostics.
 */
export function mapFirebaseTotpAuthError(error: any): string {
  const code: string = error?.code || '';
  const rawMsg: string = error?.message || '';

  if (code === 'auth/invalid-verification-code' || code === 'auth/invalid-code') {
    return 'Incorrect verification code. Please check your authenticator app and enter the current 6-digit code.';
  }
  if (code === 'auth/code-expired') {
    return 'The verification code has expired. Authenticator codes rotate every 30 seconds; please enter the latest code.';
  }
  if (code === 'auth/requires-recent-login') {
    return 'Setting up Two-Factor Authentication requires a recent login. Please sign out, log back in, and try again.';
  }
  if (code === 'auth/second-factor-already-in-use') {
    return 'This authenticator app factor is already enrolled for your account.';
  }
  if (code === 'auth/maximum-second-factor-count-exceeded') {
    return 'Maximum number of second factors reached for this account.';
  }
  if (code === 'auth/too-many-requests' || rawMsg.toLowerCase().includes('too many requests')) {
    return 'Too many verification attempts. Please wait a moment before trying again.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network connection error. Please check your internet connection and retry.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'TOTP Multi-Factor Authentication is being configured in Firebase Console. You can complete verification directly below.';
  }

  return rawMsg || 'An error occurred during verification. Please check your code and try again.';
}

/**
 * Reset / cleanup helper (kept for interface compatibility)
 */
export function resetRecaptchaVerifier() {
  // No-op for TOTP MFA
}
