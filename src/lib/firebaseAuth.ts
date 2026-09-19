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
 * Normalizes phone numbers to standard E.164 format (+91XXXXXXXXXX for India by default).
 */
export function formatToE164(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.trim().replace(/[\s\-\(\)]/g, '');
  if (/^\d{10}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }
  if (/^91\d{10}$/.test(cleaned)) {
    return `+${cleaned}`;
  }
  if (/^\+\d{10,15}$/.test(cleaned)) {
    return cleaned;
  }
  if (/^\d{11,15}$/.test(cleaned)) {
    return `+${cleaned}`;
  }
  return cleaned;
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
}

/**
 * Executes the formal Firebase Identity Platform MFA flow:
 * 1. Super Admin is authenticated
 * 2. User email is verified
 * 3. Recent authentication/re-authentication succeeds if required
 * 4. multiFactor(user).getSession() succeeds
 * 5. RecaptchaVerifier initializes successfully
 * 6. PhoneInfoOptions is created correctly
 * 7. PhoneAuthProvider.verifyPhoneNumber(...) is actually called
 * 8. verifyPhoneNumber returns a verificationId
 *
 * ONLY resolves when Firebase has successfully returned a valid verificationId.
 * NEVER hides failure behind fake success.
 */
export async function verifyFirebasePhoneNumber(
  rawPhone: string,
  containerId: string = 'recaptcha-mfa-container'
): Promise<FirebasePhoneVerificationResult> {
  logMfaDiagnostic('MFA-setup-started', {
    targetPhoneMasked: maskPhoneForLogs(rawPhone),
    firebaseProjectId: auth.app.options.projectId,
  });

  const e164 = formatToE164(rawPhone);
  if (!/^\+[1-9]\d{9,14}$/.test(e164)) {
    const formatErr = new Error('Invalid mobile phone number format. Please enter a valid 10-digit number (e.g., 9876543210).');
    (formatErr as any).code = 'auth/invalid-phone-number';
    logMfaDiagnostic('phone-number-validation-failed', { errorCode: 'auth/invalid-phone-number' });
    throw formatErr;
  }

  // Step 1: Inspect Firebase Auth current user
  const currentUser = auth.currentUser;

  if (currentUser) {
    logMfaDiagnostic('firebase-user-authenticated', {
      uid: currentUser.uid,
      emailVerified: currentUser.emailVerified,
    });

    // Step 2: Check email verification if required by project policy
    if (!currentUser.emailVerified) {
      logMfaDiagnostic('firebase-user-email-unverified', {
        emailVerified: false,
      });
    }

    try {
      // Step 4: multiFactor(user).getSession()
      logMfaDiagnostic('mfa-session-request-started');
      const session = await multiFactor(currentUser).getSession();
      logMfaDiagnostic('mfa-session-success');

      // Step 5: RecaptchaVerifier initializes successfully
      const verifier = initRecaptchaVerifier(containerId);

      // Step 6: PhoneInfoOptions is created correctly
      const phoneInfoOptions: PhoneInfoOptions = {
        phoneNumber: e164,
        session,
      };
      logMfaDiagnostic('phone-info-options-created', { hasSession: !!session });

      // Step 7: PhoneAuthProvider.verifyPhoneNumber(...) is actually called
      const phoneProvider = new PhoneAuthProvider(auth);
      logMfaDiagnostic('PhoneAuthProvider.verifyPhoneNumber-called');

      // Step 8: verifyPhoneNumber returns a verificationId
      const verificationId = await phoneProvider.verifyPhoneNumber(phoneInfoOptions, verifier);

      if (!verificationId) {
        throw new Error('PhoneAuthProvider.verifyPhoneNumber did not return a valid verificationId.');
      }

      logMfaDiagnostic('verifyPhoneNumber-success', { hasVerificationId: true });
      return {
        verificationId,
        mode: 'IDENTITY_PLATFORM_MFA',
      };
    } catch (mfaError: any) {
      logMfaDiagnostic('identity-platform-mfa-step-failure', {
        errorCode: mfaError?.code || 'UNKNOWN_ERROR',
        errorMessage: mfaError?.message,
      });

      // Reset reCAPTCHA on failure so user can retry cleanly
      resetRecaptchaVerifier();
      throw mfaError;
    }
  }

  // Fallback if currentUser is null (client logged into app via application backend session)
  logMfaDiagnostic('auth-currentUser-null-using-phone-auth-provider', {
    message: 'User authenticated via backend session; initiating direct Firebase Phone verification',
  });

  try {
    // Step 5: RecaptchaVerifier initializes successfully
    const verifier = initRecaptchaVerifier(containerId);

    // Step 7: PhoneAuthProvider / signInWithPhoneNumber called
    const phoneProvider = new PhoneAuthProvider(auth);
    logMfaDiagnostic('direct-phone-verification-called');

    // Call verifyPhoneNumber or signInWithPhoneNumber
    let verificationId: string;
    let confirmationResult: ConfirmationResult | undefined;

    try {
      verificationId = await phoneProvider.verifyPhoneNumber(e164, verifier);
    } catch (directPhoneProviderErr: any) {
      logMfaDiagnostic('PhoneAuthProvider.verifyPhoneNumber-string-failed-trying-signInWithPhoneNumber', {
        errorCode: directPhoneProviderErr?.code,
        errorMessage: directPhoneProviderErr?.message,
      });
      confirmationResult = await signInWithPhoneNumber(auth, e164, verifier);
      verificationId = confirmationResult.verificationId;
    }

    if (!verificationId) {
      throw new Error('Firebase phone verification failed to return a verificationId.');
    }

    logMfaDiagnostic('verifyPhoneNumber-success', { hasVerificationId: true });
    return {
      verificationId,
      confirmationResult,
      mode: 'STANDARD_PHONE_AUTH',
    };
  } catch (error: any) {
    logMfaDiagnostic('verifyPhoneNumber-failure', {
      errorCode: error?.code || 'UNKNOWN_ERROR',
      errorMessage: error?.message,
    });
    resetRecaptchaVerifier();
    throw error;
  }
}

/**
 * Validates the SMS OTP code using:
 * Step 10: User enters OTP
 * Step 11: PhoneAuthProvider.credential(verificationId, otp)
 * Step 12: PhoneMultiFactorGenerator.assertion(credential)
 * Step 13: multiFactor(user).enroll(assertion, 'Personal Mobile')
 */
export async function confirmFirebaseMfaOtp(
  verificationId: string,
  otpCode: string,
  confirmationResult?: ConfirmationResult | null
): Promise<{ idToken?: string; credential?: any }> {
  logMfaDiagnostic('confirm-MFA-otp-started', { hasVerificationId: !!verificationId });

  const cleanCode = otpCode.trim().replace(/\D/g, '');
  if (cleanCode.length !== 6) {
    const lenErr = new Error('Please enter the full 6-digit verification code.');
    (lenErr as any).code = 'auth/invalid-verification-code';
    throw lenErr;
  }

  try {
    // Step 11: PhoneAuthProvider.credential(...)
    const credential = PhoneAuthProvider.credential(verificationId, cleanCode);
    logMfaDiagnostic('phone-auth-credential-created');

    // Step 12 & 13: MultiFactor enrollment if currentUser is present
    if (auth.currentUser) {
      try {
        const assertion = PhoneMultiFactorGenerator.assertion(credential);
        logMfaDiagnostic('phone-multifactor-assertion-created');
        await multiFactor(auth.currentUser).enroll(assertion, 'Personal Mobile');
        logMfaDiagnostic('multiFactor.enroll-success');
      } catch (enrollErr: any) {
        logMfaDiagnostic('multiFactor.enroll-failure', {
          errorCode: enrollErr?.code,
          errorMessage: enrollErr?.message,
        });
        throw enrollErr;
      }
    }

    let idToken: string | undefined;
    if (confirmationResult) {
      const userCredential = await confirmationResult.confirm(cleanCode);
      idToken = await userCredential.user.getIdToken();
      logMfaDiagnostic('confirmationResult.confirm-success');
    }

    logMfaDiagnostic('confirm-MFA-otp-success');
    return { idToken, credential };
  } catch (err: any) {
    logMfaDiagnostic('confirm-MFA-otp-failure', {
      errorCode: err?.code || 'UNKNOWN_ERROR',
      errorMessage: err?.message,
    });
    throw err;
  }
}

/**
 * Maps Firebase Auth Phone errors to transparent, detailed diagnostics with exact Firebase error codes.
 */
export function mapFirebasePhoneAuthError(error: any): string {
  const code: string = error?.code || '';
  const rawMsg: string = error?.message || '';

  const prefix = code ? `[Firebase Error: ${code}] ` : '';

  if (code === 'auth/operation-not-allowed') {
    return `${prefix}Phone Authentication (SMS) is NOT enabled in this Firebase project. Go to Firebase Console -> Authentication -> Sign-in method and enable the "Phone" provider.`;
  }
  if (
    code === 'auth/quota-exceeded' ||
    code === 'auth/billing-not-enabled' ||
    rawMsg.toLowerCase().includes('quota') ||
    rawMsg.toLowerCase().includes('billing')
  ) {
    return `${prefix}Firebase SMS quota exceeded or Google Cloud Billing account is not linked. SMS verification requires active Cloud Billing on project gen-lang-client-0211426234.`;
  }
  if (code === 'auth/too-many-requests') {
    return `${prefix}Too many SMS requests sent from this IP or to this mobile number. Firebase has temporarily throttled requests. Please wait a few minutes before retrying.`;
  }
  if (code === 'auth/invalid-phone-number') {
    return `${prefix}Invalid phone number format. Please provide a valid 10-digit mobile number with country code (e.g. +91 9876543210).`;
  }
  if (code === 'auth/captcha-check-failed') {
    return `${prefix}reCAPTCHA security verification failed or domain is unauthorized. Ensure caexamcheckerai.com is in Authorized Domains in Firebase Console.`;
  }
  if (code === 'auth/invalid-verification-code') {
    return `${prefix}Incorrect 6-digit verification code. Please check your SMS and enter the exact 6 digits.`;
  }
  if (code === 'auth/code-expired') {
    return `${prefix}The verification code has expired. Please request a new verification code.`;
  }
  if (code === 'auth/requires-recent-login') {
    return `${prefix}MFA enrollment requires recent authentication. Please sign out, log back in, and immediately retry MFA setup.`;
  }
  if (code === 'auth/unverified-email') {
    return `${prefix}Account email address must be verified before enrolling in Multi-Factor Authentication.`;
  }
  if (code === 'auth/network-request-failed') {
    return `${prefix}Network error contacting Firebase Identity Platform. Please check your connection and retry.`;
  }
  if (code === 'auth/missing-phone-number') {
    return `${prefix}Mobile phone number is required.`;
  }
  if (code === 'auth/invalid-app-credential') {
    return `${prefix}Invalid Firebase app credential or SafetyNet/reCAPTCHA token rejection.`;
  }

  return `${prefix}${rawMsg || 'An error occurred during Firebase phone verification.'}`;
}


