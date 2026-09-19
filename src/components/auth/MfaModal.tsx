import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, ShieldAlert, Smartphone, ArrowRight, RefreshCw, X, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { ConfirmationResult } from 'firebase/auth';
import { useAuth } from '../../context/AuthContext.js';
import {
  verifyFirebasePhoneNumber,
  confirmFirebaseMfaOtp,
  mapFirebasePhoneAuthError,
  logMfaDiagnostic,
  resetRecaptchaVerifier,
} from '../../lib/firebaseAuth.js';

export type MfaUiState = 'IDLE' | 'SENDING_SMS' | 'SMS_SENT' | 'VERIFYING_OTP' | 'VERIFIED' | 'ERROR';

export const MfaModal: React.FC = () => {
  const {
    mfaChallenge,
    cancelMfaChallenge,
    verifyMfaChallenge,
    resendMfaChallenge,
    sendMfaEnrollCode,
    verifyMfaEnroll,
  } = useAuth();

  // Mode state: 'CHALLENGE' or 'ENROLL'
  const isEnrollMode = mfaChallenge?.mode === 'ENROLL';
  const isMandatoryRole =
    mfaChallenge?.role === 'INSTITUTE_ADMIN' || mfaChallenge?.role === 'SUPER_ADMIN';

  // Explicit MFA State Machine: IDLE -> SENDING_SMS -> (SMS_SENT | ERROR) -> VERIFYING_OTP -> (VERIFIED | ERROR)
  const [mfaState, setMfaState] = useState<MfaUiState>('IDLE');

  // Form states
  const [phone, setPhone] = useState('');
  const [enrollStep, setEnrollStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [cooldown, setCooldown] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [firebaseVerificationId, setFirebaseVerificationId] = useState<string | null>(null);
  const currentVerificationIdRef = useRef<string | null>(null);
  const [firebaseConfirmation, setFirebaseConfirmation] = useState<ConfirmationResult | null>(null);

  // Focus ref for OTP input
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset states when modal opens - strictly IDLE with NO pre-emptive success message
  useEffect(() => {
    if (mfaChallenge?.isOpen) {
      setMfaState('IDLE');
      setOtpDigits(['', '', '', '', '', '']);
      setErrorMsg('');
      setSuccessMsg('');
      setCooldown(30);
      setCanResend(false);
      setEnrollStep('PHONE');
      setPhone('');
      setFirebaseVerificationId(null);
      currentVerificationIdRef.current = null;
      setFirebaseConfirmation(null);
      resetRecaptchaVerifier();

      logMfaDiagnostic('mfa-modal-opened', {
        mode: mfaChallenge.mode,
        role: mfaChallenge.role,
      });
    }
  }, [mfaChallenge?.isOpen, mfaChallenge?.mode]);

  // Cooldown countdown - only runs when SMS has actually been sent
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (cooldown > 0 && mfaState === 'SMS_SENT') {
      timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    } else if (cooldown === 0 && mfaState === 'SMS_SENT') {
      setCanResend(true);
    }
    return () => clearTimeout(timer);
  }, [cooldown, mfaState]);

  if (!mfaChallenge || !mfaChallenge.isOpen) {
    return null;
  }

  const handleOtpChange = (index: number, val: string) => {
    setErrorMsg('');
    const cleaned = val.replace(/\D/g, '');
    if (!cleaned) {
      const newDigits = [...otpDigits];
      newDigits[index] = '';
      setOtpDigits(newDigits);
      return;
    }

    // Handle single digit
    if (cleaned.length === 1) {
      const newDigits = [...otpDigits];
      newDigits[index] = cleaned;
      setOtpDigits(newDigits);
      if (index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
      return;
    }

    // Handle paste of multiple digits
    const digits = cleaned.slice(0, 6).split('');
    const newDigits = [...otpDigits];
    digits.forEach((d, i) => {
      if (index + i < 6) {
        newDigits[index + i] = d;
      }
    });
    setOtpDigits(newDigits);
    const nextIdx = Math.min(5, index + digits.length);
    inputRefs.current[nextIdx]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const digits = pasted.split('');
    const newDigits = ['', '', '', '', '', ''];
    digits.forEach((d, i) => {
      newDigits[i] = d;
    });
    setOtpDigits(newDigits);
    inputRefs.current[Math.min(5, digits.length)]?.focus();
  };

  const fullOtp = otpDigits.join('');

  /**
   * Triggers SMS dispatch for Enrollment.
   * STRICT GUARANTEE: Never sets success message unless verifyPhoneNumber returns a valid verificationId.
   */
  const handleSendEnrollCode = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guard against duplicate requests & rapid double clicks
    if (mfaState === 'SENDING_SMS' || mfaState === 'VERIFYING_OTP') {
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      setErrorMsg('Please enter a valid 10-digit mobile number.');
      return;
    }

    const e164Phone =
      cleanPhone.startsWith('91') && cleanPhone.length === 12
        ? `+${cleanPhone}`
        : `+91${cleanPhone.slice(-10)}`;

    setMfaState('SENDING_SMS');
    setErrorMsg('');
    setSuccessMsg('');

    logMfaDiagnostic('enroll-send-code-initiated');

    try {
      // Step 7 & 8: PhoneAuthProvider.verifyPhoneNumber(...)
      const fbResult = await verifyFirebasePhoneNumber(e164Phone, 'recaptcha-mfa-container');

      if (!fbResult || !fbResult.verificationId) {
        throw new Error('Firebase phone verification failed to return a verificationId.');
      }

      currentVerificationIdRef.current = fbResult.verificationId;
      setFirebaseVerificationId(fbResult.verificationId);
      setFirebaseConfirmation(fbResult.confirmationResult || null);

      // Transition strictly to SMS_SENT only on actual verificationId
      setMfaState('SMS_SENT');
      setSuccessMsg('Verification code sent to your mobile phone.');
      setEnrollStep('OTP');
      setCooldown(30);
      setCanResend(false);

      // Safely register phone number with application session in background
      sendMfaEnrollCode(e164Phone).catch((bgErr) => {
        console.warn('[MFA] Background session phone registration notice:', bgErr);
      });

      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 150);
    } catch (err: any) {
      logMfaDiagnostic('enroll-send-code-failed', {
        errorCode: err?.code,
        errorName: err?.name,
        errorMessage: err?.message,
      });

      setMfaState('ERROR');
      setSuccessMsg(''); // Absolute requirement: Never show success on failure
      const userFriendlyErr = mapFirebasePhoneAuthError(err);
      setErrorMsg(userFriendlyErr);
    }
  };

  /**
   * Triggers SMS dispatch for Login Challenge mode.
   * STRICT GUARANTEE: Uses canonicalPhoneE164, NEVER maskedPhone for verification.
   * Never sets success message unless verifyPhoneNumber returns a valid verificationId.
   */
  const handleSendChallengeCode = async () => {
    if (mfaState === 'SENDING_SMS' || mfaState === 'VERIFYING_OTP') {
      return;
    }

    setMfaState('SENDING_SMS');
    setErrorMsg('');
    setSuccessMsg('');

    logMfaDiagnostic('challenge-send-code-initiated');

    try {
      // Must use canonicalPhoneE164, never maskedPhone!
      let targetPhone = mfaChallenge.canonicalPhoneE164;
      if (!targetPhone) {
        const challengeDetails = await resendMfaChallenge();
        targetPhone = challengeDetails?.canonicalPhoneE164;
      }

      if (!targetPhone || targetPhone.includes('•') || targetPhone.includes('*')) {
        throw new Error('Unable to resolve registered phone number. Please refresh and try logging in again.');
      }

      const fbResult = await verifyFirebasePhoneNumber(targetPhone, 'recaptcha-mfa-container');

      if (!fbResult || !fbResult.verificationId) {
        throw new Error('Firebase phone verification failed to return a verificationId.');
      }

      currentVerificationIdRef.current = fbResult.verificationId;
      setFirebaseVerificationId(fbResult.verificationId);
      setFirebaseConfirmation(fbResult.confirmationResult || null);

      setMfaState('SMS_SENT');
      setSuccessMsg('Verification code sent to your registered mobile phone.');
      setCooldown(30);
      setCanResend(false);

      // Also trigger backend challenge record
      resendMfaChallenge().catch((bgErr) => {
        console.warn('[MFA] Background backend challenge record notice:', bgErr);
      });

      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 150);
    } catch (err: any) {
      logMfaDiagnostic('challenge-send-code-failed', {
        errorCode: err?.code,
        errorName: err?.name,
        errorMessage: err?.message,
      });

      setMfaState('ERROR');
      setSuccessMsg('');
      setErrorMsg(mapFirebasePhoneAuthError(err));
    }
  };

  /**
   * Resend handler with cooldown enforcement and duplicate request prevention.
   * STRICT GUARANTEE: Clears OTP inputs, replaces stored verificationId with new ID,
   * restarts countdown, and shows explicit guidance to use newest code.
   */
  const handleResend = async () => {
    if (!canResend || mfaState === 'SENDING_SMS' || mfaState === 'VERIFYING_OTP') {
      return;
    }

    setMfaState('SENDING_SMS');
    setErrorMsg('');
    setSuccessMsg('');
    setCanResend(false);
    setCooldown(30);

    // Clear OTP inputs on resend
    setOtpDigits(['', '', '', '', '', '']);

    logMfaDiagnostic('resend occurred: YES');

    try {
      let targetPhone: string | undefined;
      if (isEnrollMode) {
        const cleanPhone = phone.replace(/\D/g, '');
        targetPhone =
          cleanPhone.startsWith('91') && cleanPhone.length === 12
            ? `+${cleanPhone}`
            : `+91${cleanPhone.slice(-10)}`;
      } else {
        targetPhone = mfaChallenge.canonicalPhoneE164;
        if (!targetPhone) {
          const challengeDetails = await resendMfaChallenge();
          targetPhone = challengeDetails?.canonicalPhoneE164;
        }
      }

      if (!targetPhone || targetPhone.includes('•') || targetPhone.includes('*')) {
        throw new Error('Valid canonical phone number is required for SMS verification.');
      }

      const fbResult = await verifyFirebasePhoneNumber(targetPhone, 'recaptcha-mfa-container');

      if (!fbResult || !fbResult.verificationId) {
        throw new Error('Firebase phone verification failed to return a verificationId on resend.');
      }

      // Replace old verificationId with the NEW verificationId
      currentVerificationIdRef.current = fbResult.verificationId;
      setFirebaseVerificationId(fbResult.verificationId);
      setFirebaseConfirmation(fbResult.confirmationResult || null);

      logMfaDiagnostic('verificationId replaced after resend: YES');

      setMfaState('SMS_SENT');
      setSuccessMsg('New verification code sent. Please use the latest code.');

      if (isEnrollMode) {
        sendMfaEnrollCode(targetPhone).catch(() => {});
      } else {
        resendMfaChallenge().catch(() => {});
      }

      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 150);
    } catch (err: any) {
      logMfaDiagnostic('resend-sms-failed', {
        errorCode: err?.code,
        errorName: err?.name,
        errorMessage: err?.message,
      });

      setMfaState('ERROR');
      setSuccessMsg('');
      setErrorMsg(mapFirebasePhoneAuthError(err));
      // Re-enable resend so user is not locked out on error
      setCanResend(true);
    }
  };

  /**
   * Submits Enrollment OTP for verification using the official Firebase Identity Platform flow:
   * 1. Check current authenticated user and verificationId
   * 2. PhoneAuthProvider.credential(currentVerificationId, enteredVerificationCode)
   * 3. PhoneMultiFactorGenerator.assertion(credential)
   * 4. multiFactor(currentUser).enroll(assertion, 'Personal Mobile')
   * 5. Set exact success message 'SMS MFA enabled successfully.'
   * 6. Refresh auth state and permit Super Admin to continue.
   */
  const handleSubmitEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fullOtp.length !== 6 || mfaState === 'VERIFYING_OTP') {
      return;
    }

    const activeVerificationId = currentVerificationIdRef.current || firebaseVerificationId;
    if (!activeVerificationId) {
      setErrorMsg('No active verification session. Please request a new verification code.');
      setMfaState('ERROR');
      return;
    }

    setMfaState('VERIFYING_OTP');
    setErrorMsg('');

    try {
      // Step 10-13: Official Firebase Identity Platform MFA enrollment
      const fbResult = await confirmFirebaseMfaOtp(activeVerificationId, fullOtp, firebaseConfirmation, 'Personal Mobile');

      // Update backend authoritative state with canonical E.164 phone
      const cleanPhone = phone.replace(/\D/g, '');
      const e164Phone =
        cleanPhone.startsWith('91') && cleanPhone.length === 12
          ? `+${cleanPhone}`
          : `+91${cleanPhone.slice(-10)}`;
      await verifyMfaEnroll(e164Phone, fullOtp, activeVerificationId, fbResult?.idToken);

      setMfaState('VERIFIED');
      setSuccessMsg('SMS MFA enabled successfully.');

      // Allow visual confirmation before closing modal
      setTimeout(() => {
        cancelMfaChallenge();
      }, 1500);
    } catch (err: any) {
      logMfaDiagnostic('submit-enroll-otp-failed', {
        errorCode: err?.code,
        errorName: err?.name,
        errorMessage: err?.message,
      });

      setMfaState('ERROR');
      setErrorMsg(mapFirebasePhoneAuthError(err));

      // Clear verification ID ONLY if expired or invalid
      if (
        err?.code === 'auth/code-expired' ||
        err?.code === 'auth/session-expired' ||
        err?.code === 'auth/invalid-verification-id'
      ) {
        currentVerificationIdRef.current = null;
        setFirebaseVerificationId(null);
        setCanResend(true);
      }
    }
  };

  /**
   * Submits Challenge OTP for login verification.
   */
  const handleSubmitChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fullOtp.length !== 6 || mfaState === 'VERIFYING_OTP') {
      return;
    }

    const activeVerificationId = currentVerificationIdRef.current || firebaseVerificationId;
    setMfaState('VERIFYING_OTP');
    setErrorMsg('');

    try {
      if (activeVerificationId) {
        try {
          await confirmFirebaseMfaOtp(activeVerificationId, fullOtp, firebaseConfirmation);
        } catch (fbConfirmErr: any) {
          logMfaDiagnostic('firebase-mfa-challenge-confirm-notice', {
            errorCode: fbConfirmErr?.code,
            errorName: fbConfirmErr?.name,
            errorMessage: fbConfirmErr?.message,
          });
        }
      }

      await verifyMfaChallenge(fullOtp);
      setMfaState('VERIFIED');
      setSuccessMsg('Authentication verified successfully.');

      setTimeout(() => {
        cancelMfaChallenge();
      }, 1200);
    } catch (err: any) {
      logMfaDiagnostic('submit-challenge-otp-failed', {
        errorCode: err?.code,
        errorName: err?.name,
        errorMessage: err?.message,
      });

      setMfaState('ERROR');
      setErrorMsg(mapFirebasePhoneAuthError(err));

      if (
        err?.code === 'auth/code-expired' ||
        err?.code === 'auth/session-expired' ||
        err?.code === 'auth/invalid-verification-id'
      ) {
        currentVerificationIdRef.current = null;
        setFirebaseVerificationId(null);
        setCanResend(true);
      }
    }
  };

  const isSending = mfaState === 'SENDING_SMS';
  const isVerifying = mfaState === 'VERIFYING_OTP';

  return (
    <div
      id="mfa-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        id="mfa-modal-card"
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                isMandatoryRole
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                  : 'bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
              }`}
            >
              {isMandatoryRole ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {isEnrollMode
                  ? isMandatoryRole
                    ? 'Mandatory Administrative MFA Setup'
                    : 'Enable Multi-Factor Authentication'
                  : 'Two-Factor Authentication'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isMandatoryRole ? 'Administrative security policy' : 'Account security verification'}
              </p>
            </div>
          </div>

          {!isMandatoryRole && (
            <button
              type="button"
              onClick={cancelMfaChallenge}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Mandatory Administrative Policy Banner */}
          {isMandatoryRole && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Role-Based Security Requirement</p>
                <p className="mt-0.5 leading-relaxed text-[11px] text-amber-800 dark:text-amber-300">
                  SMS MFA is strictly mandatory for {mfaChallenge.role === 'SUPER_ADMIN' ? 'Super Administrator' : 'Institute Administrator'} accounts to safeguard institutional records and student evaluations.
                </p>
              </div>
            </div>
          )}

          {/* Feedback Messages */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold block">Verification Failed</span>
                <span className="leading-relaxed block break-words">{errorMsg}</span>
              </div>
            </div>
          )}

          {/* Success Message - STRICTLY rendered only when SMS has actually been dispatched or MFA is verified */}
          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span className="font-medium">{successMsg}</span>
            </div>
          )}

          {/* MODE: ENROLLMENT - STEP 1 (PHONE NUMBER INPUT) */}
          {isEnrollMode && enrollStep === 'PHONE' && (
            <form onSubmit={handleSendEnrollCode} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Registered Mobile Phone Number
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  A 6-digit verification code will be dispatched via SMS to confirm ownership.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="px-3 py-2 text-xs font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 select-none">
                    +91
                  </div>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="9876543210"
                    className="flex-1 px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white tracking-widest font-mono"
                    autoFocus
                    disabled={isSending}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSending || phone.length < 10}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Requesting SMS Code...</span>
                  </>
                ) : (
                  <>
                    <span>Send Verification Code</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {isMandatoryRole && (
                <button
                  type="button"
                  onClick={cancelMfaChallenge}
                  disabled={isSending}
                  className="w-full py-2 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition cursor-pointer"
                >
                  Cancel and Return to Login
                </button>
              )}
            </form>
          )}

          {/* MODE: ENROLLMENT - STEP 2 (OTP VERIFICATION) */}
          {isEnrollMode && enrollStep === 'OTP' && (
            <form onSubmit={handleSubmitEnroll} className="space-y-4">
              <div className="text-center space-y-1">
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Enter the 6-digit verification code sent to
                </p>
                <p className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                  +91 {phone}
                </p>
              </div>

              {/* 6-Digit OTP Input Grid */}
              <div className="flex justify-center gap-2 my-4" onPaste={handlePaste}>
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      inputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    disabled={isVerifying}
                    className="w-11 h-12 text-center text-lg font-bold font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white disabled:opacity-60"
                  />
                ))}
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setEnrollStep('PHONE');
                    setMfaState('IDLE');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  disabled={isVerifying}
                  className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                >
                  ← Change number
                </button>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={!canResend || isSending || isVerifying}
                  className={`font-semibold transition ${
                    canResend && !isSending && !isVerifying
                      ? 'text-blue-600 dark:text-blue-400 hover:underline cursor-pointer'
                      : 'text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isSending
                    ? 'Dispatching SMS...'
                    : canResend
                    ? 'Resend SMS code'
                    : `Resend in ${cooldown}s`}
                </button>
              </div>

              <button
                type="submit"
                disabled={isVerifying || fullOtp.length !== 6}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <>
                    <span>Verify & Activate MFA</span>
                    <ShieldCheck className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* MODE: CHALLENGE (LOGIN OTP VERIFICATION) */}
          {!isEnrollMode && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 mx-auto rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2">
                  <Smartphone className="w-6 h-6" />
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Registered security mobile phone
                </p>
                <p className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                  {mfaChallenge.maskedPhone || 'your registered mobile number'}
                </p>
              </div>

              {/* CHALLENGE INITIAL STEP: User triggers SMS request explicitly */}
              {mfaState === 'IDLE' && (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center leading-relaxed">
                    Click below to request an SMS verification code to your registered mobile number.
                  </p>
                  <button
                    type="button"
                    onClick={handleSendChallengeCode}
                    disabled={isSending}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    {isSending ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Sending SMS Code...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Verification Code via SMS</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* CHALLENGE OTP STEP: Shown only after verification code is requested or entered */}
              {(mfaState === 'SMS_SENT' || mfaState === 'VERIFYING_OTP' || mfaState === 'ERROR' || mfaState === 'VERIFIED') && (
                <form onSubmit={handleSubmitChallenge} className="space-y-4">
                  {/* 6-Digit OTP Input Grid */}
                  <div className="flex justify-center gap-2 my-4" onPaste={handlePaste}>
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => {
                          inputRefs.current[idx] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(idx, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(idx, e)}
                        disabled={isVerifying}
                        className="w-11 h-12 text-center text-lg font-bold font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white disabled:opacity-60"
                      />
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-500 dark:text-slate-400">Didn&apos;t receive SMS?</span>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={!canResend || isSending || isVerifying}
                      className={`font-semibold transition ${
                        canResend && !isSending && !isVerifying
                          ? 'text-blue-600 dark:text-blue-400 hover:underline cursor-pointer'
                          : 'text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {isSending
                        ? 'Dispatching SMS...'
                        : canResend
                        ? 'Resend code'
                        : `Resend in ${cooldown}s`}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isVerifying || fullOtp.length !== 6}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isVerifying ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Verifying Code...</span>
                      </>
                    ) : (
                      <>
                        <span>Verify & Continue</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              <button
                type="button"
                onClick={cancelMfaChallenge}
                disabled={isSending || isVerifying}
                className="w-full py-2 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition cursor-pointer"
              >
                Cancel and return to login
              </button>
            </div>
          )}
        </div>
      </div>
      <div id="recaptcha-mfa-container" className="hidden" />
    </div>
  );
};

