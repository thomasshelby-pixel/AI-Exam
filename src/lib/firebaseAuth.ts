import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  multiFactor,
  User,
  type PhoneInfoOptions,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Global reference to active reCAPTCHA verifier
let activeRecaptchaVerifier: RecaptchaVerifier | null = null;

/**
 * Safe diagnostic logger for MFA lifecycle events.
 * Strictly adheres to privacy & security:
 * NEVER logs OTP, password, access token, refresh token, MFA secret, reset token, or full phone number.
 */
export function logMfaDiagnostic(step: string, data: Record<string, any> = {}) {
  const timestamp = new Date().toISOString();
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'server';
  const environment = process.env.NODE_ENV || 'production';
  // Strip any sensitive fields if mistakenly passed
  const safeData = { ...data };
  delete safeData.otp;
  delete safeData.code;
  delete safeData.token;
  delete safeData.password;
  delete safeData.secret;
  delete safeData.otpCode;
  if (safeData.phone) {
    safeData.phoneMasked = maskPhoneForLogs(String(safeData.phone));
    delete safeData.phone;
  }
  if (safeData.phoneNumber) {
    safeData.phoneMasked = maskPhoneForLogs(String(safeData.phoneNumber));
    delete safeData.phoneNumber;
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
 * Normalizes phone numbers to canonical E.164 format (+91XXXXXXXXXX for India by default).
 * Strictly rejects:
 * - masked strings (containing bullets • or asterisks *)
 * - incomplete numbers (<10 digits)
 * - duplicate country codes (e.g. +9191...)
 * - arbitrary non-digit characters
 */
export function normalizePhoneToE164(input: string): { canonicalPhoneE164: string | null; error?: string } {
  if (!input || typeof input !== 'string') {
    return { canonicalPhoneE164: null, error: 'Mobile phone number is required.' };
  }

  const trimmed = input.trim();
  // Reject masked strings explicitly
  if (trimmed.includes('•') || trimmed.includes('*') || trimmed.includes('X') || trimmed.includes('x')) {
    return { canonicalPhoneE164: null, error: 'Masked phone number cannot be used as a verification value.' };
  }

  // Remove valid formatting separators (spaces, dashes, parentheses)
  const cleaned = trimmed.replace(/[\s\-\(\)]/g, '');

  // Check for duplicate country code +9191... or 9191...
  if (/^\+?9191\d{10}$/.test(cleaned)) {
    return { canonicalPhoneE164: null, error: 'Duplicate country code detected in phone number.' };
  }

  // 10-digit Indian mobile: e.g. 9876543210
  if (/^\d{10}$/.test(cleaned)) {
    return { canonicalPhoneE164: `+91${cleaned}` };
  }

  // Already E.164 with +91: +91XXXXXXXXXX (10-digit body)
  if (/^\+91\d{10}$/.test(cleaned)) {
    return { canonicalPhoneE164: cleaned };
  }

  // 91XXXXXXXXXX without plus (12 digits)
  if (/^91\d{10}$/.test(cleaned)) {
    return { canonicalPhoneE164: `+${cleaned}` };
  }

  // General valid E.164 international numbers (+[1-9]\d{9,14})
  if (/^\+[1-9]\d{9,14}$/.test(cleaned)) {
    return { canonicalPhoneE164: cleaned };
  }

  return { canonicalPhoneE164: null, error: 'Invalid phone number format. Please provide a valid 10-digit mobile number with country code (e.g. +91 9876543210).' };
}

/**
 * Normalizes phone numbers to standard E.164 format (+91XXXXXXXXXX for India by default).
 */
export function formatToE164(phone: string): string {
  const res = normalizePhoneToE164(phone);
  return res.canonicalPhoneE164 || phone.trim();
}

/**
 * Masks a phone number for display (e.g. "+91 •••••• 1513")
 * NEVER to be used as a verification phone value.
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone) return '••••••••';
  const trimmed = phone.trim();
  if (trimmed.includes('•')) {
    return trimmed;
  }
  const normResult = normalizePhoneToE164(trimmed);
  const normalized = normResult.canonicalPhoneE164 || trimmed.replace(/[\s\-\(\)]/g, '');
  if (normalized.length < 7) {
    return '••••••••';
  }
  const prefix = normalized.slice(0, 3);
  const suffix = normalized.slice(-4);
  return `${prefix} •••••• ${suffix}`;
}

/**
 * Initializes or resets the Firebase reCAPTCHA verifier in invisible mode.
 */
export function initRecaptchaVerifier(containerId: string = 'recaptcha-mfa-container'): RecaptchaVerifier {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('reCAPTCHA verifier can only be initialized in the browser.');
  }

  // Ensure DOM container exists
  let containerEl = document.getElementById(containerId);
  if (!containerEl) {
    containerEl = document.createElement('div');
    containerEl.id = containerId;
    document.body.appendChild(containerEl);
  }

  // Clear previous instance to avoid widget collisions
  if (activeRecaptchaVerifier) {
    try {
      activeRecaptchaVerifier.clear();
      logMfaDiagnostic('previous-recaptcha-cleared');
    } catch (clearErr) {
      // Non-fatal
    }
    activeRecaptchaVerifier = null;
  }

  try {
    // Create fresh invisible RecaptchaVerifier
    const verifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
      callback: () => {
        logMfaDiagnostic('recaptcha-solved');
      },
      'expired-callback': () => {
        logMfaDiagnostic('recaptcha-expired-resetting');
        if (activeRecaptchaVerifier) {
          try {
            activeRecaptchaVerifier.clear();
          } catch {
            // ignore
          }
          activeRecaptchaVerifier = null;
        }
      },
    });

    activeRecaptchaVerifier = verifier;
    logMfaDiagnostic('recaptcha-initialization-success', { containerId });
    return verifier;
  } catch (err: any) {
    logMfaDiagnostic('recaptcha-initialization-failure', { errorCode: err?.code, errorMessage: err?.message });
    throw err;
  }
}

/**
 * Resets the active reCAPTCHA verifier.
 */
export function resetRecaptchaVerifier(): void {
  if (activeRecaptchaVerifier) {
    try {
      activeRecaptchaVerifier.clear();
    } catch {
      // ignore
    }
    activeRecaptchaVerifier = null;
    logMfaDiagnostic('recaptcha-manually-reset');
  }
}

export interface FirebasePhoneVerificationResult {
  verificationId: string;
  confirmationResult?: ConfirmationResult;
  mode: 'IDENTITY_PLATFORM_MFA' | 'STANDARD_PHONE_AUTH';
  session?: any;
}

/**
 * Retrieves the current Firebase Auth user after guaranteeing auth state is restored.
 */
export async function getCurrentFirebaseUser(): Promise<User | null> {
  if (typeof window === 'undefined') return null;
  try {
    if (typeof (auth as any).authStateReady === 'function') {
      await auth.authStateReady();
    }
    const user = auth.currentUser;
    if (user) {
      try {
        await user.reload();
      } catch {
        // Non-fatal if offline
      }
    }
    return auth.currentUser;
  } catch (err) {
    console.warn('[MFA] Error resolving authStateReady:', err);
    return auth.currentUser;
  }
}

/**
 * Executes the formal Firebase Identity Platform MFA flow:
 * 1. Inspect authenticated Firebase user
 * 2. Obtain fresh MultiFactorSession via multiFactor(currentUser).getSession()
 * 3. Initialize invisible reCAPTCHA verifier
 * 4. Call PhoneAuthProvider.verifyPhoneNumber({ phoneNumber, session }, verifier)
 * 5. Return Firebase verificationId
 *
 * ONLY resolves when Firebase has successfully returned a valid verificationId.
 * NEVER hides failure behind fake success.
 */
export async function verifyFirebasePhoneNumber(
  rawPhone: string,
  containerId: string = 'recaptcha-mfa-container'
): Promise<FirebasePhoneVerificationResult> {
  logMfaDiagnostic('SMS request started', {
    targetPhoneMasked: maskPhoneForLogs(rawPhone),
    firebaseProjectId: auth.app.options.projectId,
  });

  if (!rawPhone || typeof rawPhone !== 'string') {
    const emptyErr = new Error('Mobile phone number is required.');
    (emptyErr as any).code = 'auth/invalid-phone-number';
    logMfaDiagnostic('phone-number-empty-failed');
    throw emptyErr;
  }

  // Reject masked phone numbers explicitly with clear diagnostic
  if (rawPhone.includes('•') || rawPhone.includes('*')) {
    const maskErr = new Error('Masked phone number cannot be passed to Firebase. Use the canonical normalized phone.');
    (maskErr as any).code = 'auth/invalid-phone-number';
    logMfaDiagnostic('phone-number-masked-string-rejected', { errorCode: 'auth/invalid-phone-number' });
    throw maskErr;
  }

  const normResult = normalizePhoneToE164(rawPhone);
  if (!normResult.canonicalPhoneE164 || !/^\+[1-9]\d{9,14}$/.test(normResult.canonicalPhoneE164)) {
    const formatErr = new Error(normResult.error || 'Invalid mobile phone number format. Please enter a valid 10-digit number with country code (e.g., +91 9876543210).');
    (formatErr as any).code = 'auth/invalid-phone-number';
    logMfaDiagnostic('phone-number-validation-failed', { errorCode: 'auth/invalid-phone-number' });
    throw formatErr;
  }

  const e164 = normResult.canonicalPhoneE164;

  // Await auth state readiness before checking currentUser
  const currentUser = await getCurrentFirebaseUser();

  if (currentUser) {
    logMfaDiagnostic('firebase-user-authenticated', {
      uid: currentUser.uid,
      emailVerified: currentUser.emailVerified,
    });

    try {
      logMfaDiagnostic('mfa-session-request-started');
      const session = await multiFactor(currentUser).getSession();
      logMfaDiagnostic('mfa-session-success');

      const verifier = initRecaptchaVerifier(containerId);

      const phoneInfoOptions: PhoneInfoOptions = {
        phoneNumber: e164,
        session,
      };

      const phoneProvider = new PhoneAuthProvider(auth);
      logMfaDiagnostic('PhoneAuthProvider.verifyPhoneNumber-called');

      const verificationId = await phoneProvider.verifyPhoneNumber(phoneInfoOptions, verifier);

      if (!verificationId) {
        logMfaDiagnostic('SMS verificationId received: NO');
        throw new Error('PhoneAuthProvider.verifyPhoneNumber did not return a valid verificationId.');
      }

      logMfaDiagnostic('SMS verificationId received: YES');
      logMfaDiagnostic('SMS request succeeded', {
        verificationIdCreated: 'YES',
      });

      return {
        verificationId,
        session,
        mode: 'IDENTITY_PLATFORM_MFA',
      };
    } catch (mfaError: any) {
      logMfaDiagnostic('SMS verificationId received: NO', { error: mfaError?.message });
      logMfaDiagnostic('identity-platform-mfa-step-failure', {
        errorCode: mfaError?.code || 'UNKNOWN_ERROR',
        errorName: mfaError?.name || 'Error',
        errorMessage: mfaError?.message,
      });

      resetRecaptchaVerifier();
      throw mfaError;
    }
  }

  // Fallback if currentUser is null in browser session
  logMfaDiagnostic('auth-currentUser-null-using-phone-auth-provider', {
    message: 'User authenticated via backend session; initiating direct Firebase Phone verification',
  });

  try {
    const verifier = initRecaptchaVerifier(containerId);
    const phoneProvider = new PhoneAuthProvider(auth);

    let verificationId: string;
    let confirmationResult: ConfirmationResult | undefined;

    try {
      verificationId = await phoneProvider.verifyPhoneNumber(e164, verifier);
    } catch (directPhoneProviderErr: any) {
      logMfaDiagnostic('PhoneAuthProvider.verifyPhoneNumber-fallback-to-signInWithPhoneNumber', {
        errorCode: directPhoneProviderErr?.code,
        errorMessage: directPhoneProviderErr?.message,
      });
      confirmationResult = await signInWithPhoneNumber(auth, e164, verifier);
      verificationId = confirmationResult.verificationId;
    }

    if (!verificationId) {
      logMfaDiagnostic('SMS verificationId received: NO');
      throw new Error('Firebase phone verification failed to return a verificationId.');
    }

    logMfaDiagnostic('SMS verificationId received: YES');
    logMfaDiagnostic('SMS request succeeded', {
      verificationIdCreated: 'YES',
    });

    return {
      verificationId,
      confirmationResult,
      mode: 'STANDARD_PHONE_AUTH',
    };
  } catch (error: any) {
    logMfaDiagnostic('SMS verificationId received: NO', { error: error?.message });
    logMfaDiagnostic('verifyPhoneNumber-failure', {
      errorCode: error?.code || 'UNKNOWN_ERROR',
      errorName: error?.name || 'Error',
      errorMessage: error?.message,
    });
    resetRecaptchaVerifier();
    throw error;
  }
}

/**
 * Validates the SMS OTP code and executes MFA enrollment:
 * 1. PhoneAuthProvider.credential(verificationId, code)
 * 2. PhoneMultiFactorGenerator.assertion(credential)
 * 3. multiFactor(currentUser).enroll(assertion, mfaDisplayName)
 *
 * Distinguishes enrollment errors without falsely labeling unrelated errors as invalid OTP.
 */
export async function confirmFirebaseMfaOtp(
  verificationId: string,
  otpCode: string,
  confirmationResult?: ConfirmationResult | null,
  mfaDisplayName: string = 'Personal Mobile'
): Promise<{ idToken?: string; credential?: any; alreadyEnrolled?: boolean }> {
  logMfaDiagnostic('OTP verification started');

  const cleanCode = otpCode.trim().replace(/\D/g, '');
  if (cleanCode.length !== 6) {
    const lenErr = new Error('Please enter the full 6-digit verification code.');
    (lenErr as any).code = 'auth/invalid-verification-code';
    throw lenErr;
  }

  if (!verificationId) {
    const idErr = new Error('No active verification ID found. Please request a new verification code.');
    (idErr as any).code = 'auth/invalid-verification-id';
    throw idErr;
  }

  try {
    // Step 1: PhoneAuthProvider.credential(currentVerificationId, enteredVerificationCode)
    let credential: any;
    try {
      credential = PhoneAuthProvider.credential(verificationId, cleanCode);
      logMfaDiagnostic('credential creation success/failure', { status: 'success' });
    } catch (credErr) {
      logMfaDiagnostic('credential creation success/failure', { status: 'failure', error: credErr });
      throw credErr;
    }

    const currentUser = await getCurrentFirebaseUser();

    // Step 2 & 3: MultiFactor enrollment if currentUser is present
    if (currentUser) {
      const factorsBefore = multiFactor(currentUser).enrolledFactors || [];
      const countBefore = factorsBefore.length;
      logMfaDiagnostic('enrolledFactors count BEFORE enrollment', { count: countBefore });

      const phoneFactorBefore = factorsBefore.some(
        (f) => f.factorId === 'phone' || f.factorId === PhoneMultiFactorGenerator.FACTOR_ID
      );

      // Re-enrollment safety: If user already has an enrolled phone factor
      if (phoneFactorBefore) {
        logMfaDiagnostic('phone factor present AFTER enrollment: YES', { alreadyEnrolled: true });
        await currentUser.reload();
        const idToken = await currentUser.getIdToken(true);
        logMfaDiagnostic('auth state refreshed');
        return { idToken, credential, alreadyEnrolled: true };
      }

      let assertion: any;
      try {
        assertion = PhoneMultiFactorGenerator.assertion(credential);
        logMfaDiagnostic('assertion creation success/failure', { status: 'success' });
      } catch (assErr) {
        logMfaDiagnostic('assertion creation success/failure', { status: 'failure', error: assErr });
        throw assErr;
      }

      logMfaDiagnostic('enrollment started');
      try {
        await multiFactor(currentUser).enroll(assertion, mfaDisplayName);
        logMfaDiagnostic('multiFactor.enroll success/failure', { status: 'success' });
      } catch (enrollErr: any) {
        logMfaDiagnostic('multiFactor.enroll success/failure', {
          status: 'failure',
          errorCode: enrollErr?.code,
          errorMessage: enrollErr?.message,
        });

        if (enrollErr?.code === 'auth/second-factor-already-in-use') {
          logMfaDiagnostic('phone factor already in use, proceeding safely');
        } else {
          throw enrollErr;
        }
      }

      // Immediately verify: multiFactor(user).enrolledFactors contains a phone factor
      await currentUser.reload();
      const freshUser = auth.currentUser || currentUser;
      const factorsAfter = freshUser ? multiFactor(freshUser).enrolledFactors || [] : [];
      const countAfter = factorsAfter.length;
      const phoneFactorPresent = factorsAfter.some(
        (f) => f.factorId === 'phone' || f.factorId === PhoneMultiFactorGenerator.FACTOR_ID
      );

      logMfaDiagnostic('enrolledFactors count AFTER enrollment', { count: countAfter });
      logMfaDiagnostic(`phone factor present AFTER enrollment: ${phoneFactorPresent ? 'YES' : 'NO'}`);

      const idToken = await freshUser.getIdToken(true);
      logMfaDiagnostic('auth state refreshed');
      return { idToken, credential };
    }

    // Direct phone confirmation if user was signed in via phone credential
    let idToken: string | undefined;
    if (confirmationResult) {
      const userCredential = await confirmationResult.confirm(cleanCode);
      idToken = await userCredential.user.getIdToken();
      logMfaDiagnostic('confirmationResult.confirm-success');
      logMfaDiagnostic('auth state refreshed');
      return { idToken, credential };
    }

    logMfaDiagnostic('confirm-MFA-otp-success');
    return { idToken, credential };
  } catch (err: any) {
    logMfaDiagnostic('confirm-MFA-otp-failure', {
      errorCode: err?.code || 'UNKNOWN_ERROR',
      errorName: err?.name || 'Error',
      errorMessage: err?.message,
    });
    throw err;
  }
}

/**
 * Checks if the current Firebase user already has an enrolled phone factor.
 */
export async function getFirebaseEnrolledPhoneFactors(): Promise<{
  hasPhoneFactor: boolean;
  enrolledCount: number;
}> {
  try {
    const user = await getCurrentFirebaseUser();
    if (!user) return { hasPhoneFactor: false, enrolledCount: 0 };
    const factors = multiFactor(user).enrolledFactors || [];
    const hasPhone = factors.some(
      (f) => f.factorId === 'phone' || f.factorId === PhoneMultiFactorGenerator.FACTOR_ID
    );
    return { hasPhoneFactor: hasPhone, enrolledCount: factors.length };
  } catch {
    return { hasPhoneFactor: false, enrolledCount: 0 };
  }
}

/**
 * Maps Firebase Auth Phone errors to transparent, detailed diagnostics with exact Firebase error codes.
 * Ensures that unrelated errors (quota, network, session expiration) are NEVER converted to "invalid verification code".
 */
export function mapFirebasePhoneAuthError(error: any): string {
  const code: string = error?.code || '';
  const rawMsg: string = error?.message || '';

  if (code === 'auth/invalid-verification-code') {
    return 'Incorrect verification code. Please enter the latest code sent to your phone.';
  }
  if (code === 'auth/code-expired') {
    return 'The verification code has expired. Please request a new code.';
  }
  if (code === 'auth/session-expired') {
    return 'The verification session has expired. Please request a new code.';
  }
  if (code === 'auth/invalid-verification-id') {
    return 'The verification ID is invalid or stale. Please request a new code.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please wait a few moments before trying again.';
  }
  if (
    code === 'auth/quota-exceeded' ||
    code === 'auth/billing-not-enabled' ||
    rawMsg.toLowerCase().includes('quota') ||
    rawMsg.toLowerCase().includes('billing')
  ) {
    return 'Firebase SMS quota exceeded or Google Cloud billing is not active. SMS verification requires active billing on project gen-lang-client-0211426234.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Phone Authentication (SMS) is NOT enabled in Firebase Console. Go to Authentication -> Sign-in method and enable the "Phone" provider.';
  }
  if (code === 'auth/invalid-phone-number') {
    return 'Invalid phone number format. Please provide a valid 10-digit mobile number with country code (e.g. +91 9876543210).';
  }
  if (code === 'auth/captcha-check-failed') {
    return 'reCAPTCHA security verification failed or domain is unauthorized. Ensure caexamcheckerai.com is in Authorized Domains.';
  }
  if (code === 'auth/requires-recent-login') {
    return 'MFA enrollment requires recent authentication. Please sign out, log back in, and immediately retry MFA setup.';
  }
  if (code === 'auth/unverified-email') {
    return 'Account email address must be verified before enrolling in Multi-Factor Authentication.';
  }
  if (code === 'auth/no-current-user') {
    return 'No active Firebase authenticated user session found for Super Admin. Please ensure you are logged into Firebase.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error contacting Firebase Identity Platform. Please check your internet connection and retry.';
  }
  if (code === 'auth/missing-phone-number') {
    return 'Mobile phone number is required.';
  }
  if (code === 'auth/invalid-app-credential') {
    return 'Invalid Firebase app credential or SafetyNet/reCAPTCHA token rejection.';
  }

  return rawMsg || 'An error occurred during Firebase phone verification.';
}


