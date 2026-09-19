import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Copy,
  Check,
  RefreshCw,
  X,
  Lock,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  QrCode,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import {
  generateTotpSetup,
  enrollFirebaseTotpFactor,
  mapFirebaseTotpAuthError,
  logMfaDiagnostic,
  getFirebaseEnrolledTotpFactors,
  type TotpSetupData,
} from '../../lib/firebaseAuth.js';

export type MfaUiState = 'INITIALIZING' | 'READY' | 'VERIFYING' | 'VERIFIED' | 'ERROR';

export const MfaModal: React.FC = () => {
  const {
    user,
    mfaChallenge,
    cancelMfaChallenge,
    closeMfaModal,
    verifyMfaChallenge,
    verifyMfaEnroll,
    syncMfaFactor,
  } = useAuth();

  const isEnrollMode = mfaChallenge?.mode === 'ENROLL';
  const isMandatoryRole =
    mfaChallenge?.role === 'INSTITUTE_ADMIN' ||
    mfaChallenge?.role === 'SUPER_ADMIN' ||
    user?.role === 'INSTITUTE_ADMIN' ||
    user?.role === 'SUPER_ADMIN';

  const [mfaState, setMfaState] = useState<MfaUiState>('INITIALIZING');
  const [totpSetup, setTotpSetup] = useState<TotpSetupData | null>(null);
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'QR' | 'MANUAL'>('QR');
  const [trustDevice, setTrustDevice] = useState<boolean>(true);

  // Input refs for 6-digit OTP code
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const isSubmittingRef = useRef<boolean>(false);
  const hasInitializedRef = useRef<boolean>(false);

  // Initialize or reset modal state when challenge opens
  useEffect(() => {
    if (mfaChallenge?.isOpen) {
      if (hasInitializedRef.current) return;
      hasInitializedRef.current = true;

      setMfaState('INITIALIZING');
      setOtpDigits(['', '', '', '', '', '']);
      setErrorMsg('');
      setSuccessMsg('');
      setCopiedKey(false);
      setActiveTab('QR');
      isSubmittingRef.current = false;

      logMfaDiagnostic('mfa-modal-opened', {
        mode: mfaChallenge.mode,
        role: mfaChallenge.role,
      });

      // If in ENROLL mode, first check if user already has an enrolled TOTP factor
      if (mfaChallenge.mode === 'ENROLL') {
        if (user?.mfaEnabled) {
          logMfaDiagnostic('totp-factor-already-enabled-in-user-state');
          setMfaState('VERIFIED');
          setSuccessMsg('Two-Factor Authentication is already active on your account.');
          if (mfaChallenge.onSuccess && user) {
            mfaChallenge.onSuccess(user);
          }
          setTimeout(() => {
            closeMfaModal();
          }, 1200);
          return;
        }

        getFirebaseEnrolledTotpFactors().then(async ({ hasTotpFactor }) => {
          if (hasTotpFactor) {
            logMfaDiagnostic('totp-factor-present-in-firebase');
            setMfaState('VERIFIED');
            setSuccessMsg('Two-Factor Authentication factor is already enrolled.');
            try {
              const syncedUser = await syncMfaFactor();
              if (mfaChallenge.onSuccess && syncedUser) {
                mfaChallenge.onSuccess(syncedUser);
              }
            } catch {
              // Non-fatal
            }
            setTimeout(() => {
              closeMfaModal();
            }, 1200);
            return;
          }

          // Generate TOTP secret & QR code
          loadTotpSetup();
        });
      } else {
        // CHALLENGE mode: Immediately ready for 6-digit code entry
        setMfaState('READY');
        setTimeout(() => {
          inputRefs.current[0]?.focus();
        }, 150);
      }
    } else {
      hasInitializedRef.current = false;
      isSubmittingRef.current = false;
    }
  }, [mfaChallenge?.isOpen, mfaChallenge?.mode, user?.mfaEnabled]);

  const loadTotpSetup = async () => {
    try {
      setMfaState('INITIALIZING');
      setErrorMsg('');
      const targetEmail = user?.email || 'admin@caexamcheckerai.com';
      const setup = await generateTotpSetup(targetEmail, 'CA Exam Checker AI');
      setTotpSetup(setup);
      setMfaState('READY');
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 200);
    } catch (err: any) {
      logMfaDiagnostic('generate-totp-setup-failed', { error: err?.message });
      setMfaState('ERROR');
      setErrorMsg(mapFirebaseTotpAuthError(err));
    }
  };

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

    // Single digit input
    if (cleaned.length === 1) {
      const newDigits = [...otpDigits];
      newDigits[index] = cleaned;
      setOtpDigits(newDigits);
      if (index < 5) {
        inputRefs.current[index + 1]?.focus();
      } else {
        // Auto-submit when 6th digit entered
        const code = [...newDigits.slice(0, 5), cleaned].join('');
        if (code.length === 6) {
          executeVerification(code);
        }
      }
      return;
    }

    // Pasted multiple digits
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

    if (newDigits.join('').length === 6) {
      executeVerification(newDigits.join(''));
    }
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

    if (digits.length === 6) {
      executeVerification(digits.join(''));
    }
  };

  const copySecretKey = () => {
    if (!totpSetup?.secretKey) return;
    navigator.clipboard.writeText(totpSetup.secretKey).then(() => {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2500);
    });
  };

  const fullOtp = otpDigits.join('');

  /**
   * Dispatches verification for either ENROLL or CHALLENGE mode
   */
  const executeVerification = async (codeToVerify?: string) => {
    const code = (codeToVerify || fullOtp).trim().replace(/\D/g, '');
    if (code.length !== 6) {
      setErrorMsg('Please enter the complete 6-digit code from your authenticator app.');
      return;
    }

    if (isSubmittingRef.current || mfaState === 'VERIFYING') {
      return;
    }

    isSubmittingRef.current = true;
    setMfaState('VERIFYING');
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (isEnrollMode) {
        logMfaDiagnostic('executing-enrollment-verification');
        // Step 1: Enroll with Firebase Identity Platform if native session exists
        let idToken: string | undefined;
        try {
          const fbEnroll = await enrollFirebaseTotpFactor(totpSetup?.secret, code);
          idToken = fbEnroll.idToken;
        } catch (fbErr: any) {
          logMfaDiagnostic('firebase-enrollment-fallback-notice', { error: fbErr?.message });
        }

        // Step 2: Finalize enrollment and store state with backend
        const verifiedUser = await verifyMfaEnroll(code);
        setMfaState('VERIFIED');
        setSuccessMsg('Two-Factor Authentication has been successfully enabled.');

        setTimeout(() => {
          closeMfaModal();
        }, 1200);
      } else {
        logMfaDiagnostic('executing-challenge-verification');
        // CHALLENGE mode: verify code and complete login
        const verifiedUser = await verifyMfaChallenge(code);
        setMfaState('VERIFIED');
        setSuccessMsg('Identity verified. Continuing to portal...');

        setTimeout(() => {
          closeMfaModal();
        }, 1000);
      }
    } catch (err: any) {
      logMfaDiagnostic('mfa-verification-failed', {
        errorCode: err?.code,
        errorMessage: err?.message,
      });
      setMfaState('ERROR');
      const userErr = mapFirebaseTotpAuthError(err);
      setErrorMsg(userErr || 'Verification failed. Please ensure the code matches your authenticator app.');
      // Clear OTP digits on error for quick retry
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeVerification();
  };

  return (
    <div
      id="mfa-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mfa-modal-title"
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                {isEnrollMode ? <KeyRound className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
              </div>
              <div>
                <h3 id="mfa-modal-title" className="text-base font-bold text-slate-900 dark:text-white">
                  {isEnrollMode ? 'Set Up Authenticator App' : 'Two-Factor Authentication'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {isEnrollMode
                    ? 'Use Google Authenticator, Microsoft Authenticator, or another compatible app'
                    : 'Enter the 6-digit code shown in your authenticator app'}
                </p>
              </div>
            </div>

            {/* Close button (allowed only for non-mandatory contexts) */}
            {!isMandatoryRole && (
              <button
                type="button"
                onClick={cancelMfaChallenge}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Mandatory notice for administrative roles */}
          {isMandatoryRole && (
            <div className="mt-3 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 rounded-xl flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
                Mandatory Security Requirement for Administrative Accounts
              </span>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[calc(100vh-180px)] overflow-y-auto">
          {/* Success Banner */}
          {successMsg && (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                {successMsg}
              </span>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs font-medium text-rose-800 dark:text-rose-300 leading-relaxed">
                {errorMsg}
              </div>
            </div>
          )}

          {/* ENROLL MODE: QR Code & Manual Key View */}
          {isEnrollMode && (
            <div className="space-y-4">
              {/* Step indicator */}
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 pb-1">
                <span>Step 1 of 2: Scan QR or Enter Key</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('QR')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                      activeTab === 'QR'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <QrCode className="w-3.5 h-3.5" />
                      QR Code
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('MANUAL')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                      activeTab === 'MANUAL'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <KeyRound className="w-3.5 h-3.5" />
                      Manual Key
                    </span>
                  </button>
                </div>
              </div>

              {/* QR Code Tab */}
              {activeTab === 'QR' ? (
                <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700">
                  {totpSetup?.qrDataUrl ? (
                    <div className="bg-white p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                      <img
                        src={totpSetup.qrDataUrl}
                        alt="TOTP Setup QR Code"
                        className="w-44 h-44 object-contain rounded-md"
                      />
                    </div>
                  ) : (
                    <div className="w-44 h-44 bg-slate-200 dark:bg-slate-700 rounded-xl flex items-center justify-center animate-pulse">
                      <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
                    </div>
                  )}

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center mt-3 max-w-xs leading-relaxed">
                    Open your authenticator app (Google Authenticator, Microsoft Authenticator, or 1Password) and scan the QR code above.
                  </p>
                </div>
              ) : (
                /* Manual Key Tab */
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      Account / Identifier
                    </label>
                    <div className="text-xs font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
                      {totpSetup?.accountEmail || user?.email || 'Admin'}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      Manual Setup Key (Time-based, 30s)
                    </label>
                    <div className="flex items-center justify-between gap-2 p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-900 dark:text-white">
                      <span className="font-bold tracking-wider select-all break-all">
                        {totpSetup?.formattedKey || totpSetup?.secretKey || '...'}
                      </span>
                      <button
                        type="button"
                        onClick={copySecretKey}
                        className="px-2.5 py-1.5 text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 transition flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        {copiedKey ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-600 font-bold">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Select &quot;Add account manually&quot; in your authenticator app and paste this secret key. Set the type to <strong>Time-based</strong>.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* OTP Input Section (Used in both ENROLL and CHALLENGE modes) */}
          <form onSubmit={handleManualSubmit} className="space-y-4 pt-1">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {isEnrollMode
                    ? 'Step 2: Enter the 6-Digit Authenticator Code'
                    : 'Authenticator Code (6 digits)'}
                </label>
                <span className="text-[11px] text-slate-400">Rotates every 30s</span>
              </div>

              {/* 6 Digit Input Boxes */}
              <div className="flex items-center justify-between gap-2 sm:gap-2.5" onPaste={handlePaste}>
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => { inputRefs.current[idx] = el; }}
                    id={`otp-input-${idx}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    disabled={mfaState === 'VERIFYING' || mfaState === 'VERIFIED'}
                    className="w-12 h-14 text-center text-xl font-bold font-mono text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition disabled:opacity-50"
                  />
                ))}
              </div>
            </div>

            {/* Device Trust Checkbox */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="trust-device-checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded-sm border-slate-300 dark:border-slate-600 focus:ring-blue-500 cursor-pointer"
              />
              <label
                htmlFor="trust-device-checkbox"
                className="text-xs text-slate-600 dark:text-slate-400 select-none cursor-pointer"
              >
                Trust this device for 365 days
              </label>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <button
                type="submit"
                id="mfa-verify-btn"
                disabled={fullOtp.length !== 6 || mfaState === 'VERIFYING' || mfaState === 'VERIFIED'}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {mfaState === 'VERIFYING' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying Code...</span>
                  </>
                ) : mfaState === 'VERIFIED' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    <span>Verified</span>
                  </>
                ) : (
                  <>
                    <span>{isEnrollMode ? 'Verify & Enable MFA' : 'Verify & Continue'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Cancel / Sign-in with another account option */}
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={cancelMfaChallenge}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition cursor-pointer"
                >
                  {isMandatoryRole ? 'Cancel & Return to Sign In' : 'Cancel'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
