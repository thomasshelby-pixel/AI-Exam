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
  FileText,
  Download,
  LifeBuoy,
  ArrowLeft,
  Key,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import type { User } from '../../types/index.js';
import {
  generateTotpSetup,
  enrollFirebaseTotpFactor,
  mapFirebaseTotpAuthError,
  logMfaDiagnostic,
  getFirebaseEnrolledTotpFactors,
  type TotpSetupData,
} from '../../lib/firebaseAuth.js';
import { formatDateTimeIST } from '../../utils/timezone.js';
import { useTrustedDevice } from '../../hooks/useTrustedDevice.js';

export type MfaUiState = 'INITIALIZING' | 'READY' | 'VERIFYING' | 'VERIFIED' | 'SHOWING_RECOVERY_CODES' | 'ERROR';

export const MfaModal: React.FC = () => {
  const {
    user,
    setUser,
    setToken,
    mfaChallenge,
    cancelMfaChallenge,
    closeMfaModal,
    completeMfaChallenge,
    switchMfaMode,
    verifyMfaChallenge,
    verifyMfaEnroll,
    verifyMfaRecoveryCode,
    submitManualRecoveryRequest,
    syncMfaFactor,
  } = useAuth();

  const isEnrollMode = mfaChallenge?.mode === 'ENROLL';
  const isRecoveryCodeMode = mfaChallenge?.mode === 'RECOVERY_CODE';
  const isManualRecoveryMode = mfaChallenge?.mode === 'MANUAL_RECOVERY';

  const isMandatoryRole =
    mfaChallenge?.role === 'INSTITUTE_ADMIN' ||
    mfaChallenge?.role === 'SUPER_ADMIN' ||
    user?.role === 'INSTITUTE_ADMIN' ||
    user?.role === 'SUPER_ADMIN';

  const [mfaState, setMfaState] = useState<MfaUiState>('INITIALIZING');
  const [totpSetup, setTotpSetup] = useState<TotpSetupData | null>(null);
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [recoveryCodeInput, setRecoveryCodeInput] = useState<string>('');
  const [newlyGeneratedCodes, setNewlyGeneratedCodes] = useState<string[]>([]);
  const [copiedCodes, setCopiedCodes] = useState<boolean>(false);

  // Manual Recovery Request form state
  const [recoveryEmail, setRecoveryEmail] = useState<string>('');
  const [recoveryPhone, setRecoveryPhone] = useState<string>('');
  const [recoverySrn, setRecoverySrn] = useState<string>('');
  const [recoveryReason, setRecoveryReason] = useState<string>('');
  const [recoverySubmittedId, setRecoverySubmittedId] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'QR' | 'MANUAL'>('QR');
  const [trustDevice, setTrustDevice] = useState<boolean>(true);

  // useTrustedDevice hook checking HttpOnly cookie and handling server-side TOTP validation
  const {
    isTrusted: isBrowserTrusted,
    isLoading: isCheckingBrowserTrust,
    trustExpiresAt,
    validateTotp: validateTotpViaHook,
  } = useTrustedDevice({
    mfaSessionToken: mfaChallenge?.mfaSessionToken,
  });

  // Input refs for 6-digit OTP code
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const isSubmittingRef = useRef<boolean>(false);
  const hasInitializedRef = useRef<boolean>(false);
  const verifiedUserRef = useRef<User | null>(null);

  // Initialize or reset modal state when challenge opens or mode changes
  useEffect(() => {
    if (mfaChallenge?.isOpen) {
      setErrorMsg('');
      setSuccessMsg('');
      setCopiedKey(false);
      isSubmittingRef.current = false;
      verifiedUserRef.current = null;

      if (mfaChallenge.mode === 'RECOVERY_CODE') {
        setMfaState('READY');
        setRecoveryCodeInput('');
        return;
      }

      if (mfaChallenge.mode === 'MANUAL_RECOVERY') {
        setMfaState('READY');
        setRecoveryEmail(user?.email || '');
        setRecoveryPhone(user?.phone || '');
        setRecoveryReason('');
        setRecoverySubmittedId(null);
        return;
      }

      if (mfaChallenge.mode === 'ENROLL') {
        setOtpDigits(['', '', '', '', '', '']);
        setActiveTab('QR');

        // Priority 1: Use server-provided totpSetup directly if passed from login challenge
        if (mfaChallenge.totpSetup) {
          setTotpSetup(mfaChallenge.totpSetup);
          setMfaState('READY');
          setTimeout(() => {
            inputRefs.current[0]?.focus();
          }, 200);
          return;
        }

        // Priority 2: When an active mfaSessionToken is present (e.g. fresh enrollment or after MFA reset),
        // we must NOT auto-bypass based on stale cached client credentials! Always load fresh setup:
        if (mfaChallenge.mfaSessionToken) {
          loadTotpSetup();
          return;
        }

        if (user?.mfaEnabled) {
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

          loadTotpSetup();
        });
      } else {
        // CHALLENGE mode
        setMfaState('READY');
        setOtpDigits(['', '', '', '', '', '']);
        setTimeout(() => {
          inputRefs.current[0]?.focus();
        }, 150);
      }
    } else {
      hasInitializedRef.current = false;
      isSubmittingRef.current = false;
      verifiedUserRef.current = null;
    }
  }, [mfaChallenge?.isOpen, mfaChallenge?.mode]);

  const loadTotpSetup = async () => {
    try {
      setMfaState('INITIALIZING');
      setErrorMsg('');

      // If we have an mfaSessionToken, attempt to query authoritative server setup first
      if (mfaChallenge?.mfaSessionToken) {
        try {
          const res = await (window as any).fetch(
            `/api/auth/mfa/setup?mfaSessionToken=${encodeURIComponent(mfaChallenge.mfaSessionToken)}`
          );
          if (res.ok) {
            const data = await res.json();
            if (data?.totpSetup) {
              setTotpSetup(data.totpSetup);
              setMfaState('READY');
              setTimeout(() => {
                inputRefs.current[0]?.focus();
              }, 200);
              return;
            }
          }
        } catch (setupErr) {
          console.warn('[MfaModal] Could not fetch server setup, falling back:', setupErr);
        }
      }

      const targetEmail = user?.email || mfaChallenge?.email || 'user';
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
   * Dispatches verification for ENROLL or CHALLENGE mode
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
        try {
          await enrollFirebaseTotpFactor(totpSetup?.secret, code);
        } catch (fbErr: any) {
          logMfaDiagnostic('firebase-enrollment-fallback-notice', { error: fbErr?.message });
        }

        const res = await (window as any).fetch('/api/auth/mfa/enroll/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            otpCode: code,
            mfaSessionToken: mfaChallenge?.mfaSessionToken,
            secretKey: totpSetup?.secretKey || (totpSetup?.secret as any)?.secretKey,
          }),
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to verify and finalize enrollment.');
        }

        if (data.token) {
          localStorage.setItem('ca_exam_checker_token', data.token);
          setToken(data.token);
        }
        if (data.trustToken) {
          localStorage.setItem('ca_device_trust_token', data.trustToken);
          if (data.user?.id) {
            localStorage.setItem(`ca_device_trust_token_${data.user.id}`, data.trustToken);
          }
        }

        const verifiedUser: User = {
          ...data.user,
          mfaEnabled: true,
          mfaVerified: true,
        };
        verifiedUserRef.current = verifiedUser;
        setUser(verifiedUser);

        if (data.recoveryCodes && Array.isArray(data.recoveryCodes) && data.recoveryCodes.length > 0) {
          setNewlyGeneratedCodes(data.recoveryCodes);
          setMfaState('SHOWING_RECOVERY_CODES');
          setSuccessMsg('Two-Factor Authentication is active! Please save your one-time recovery codes.');
        } else {
          setMfaState('VERIFIED');
          setSuccessMsg('Two-Factor Authentication has been successfully enabled.');
          completeMfaChallenge(verifiedUser);
        }
      } else {
        logMfaDiagnostic('executing-challenge-verification');
        await verifyMfaChallenge(code);
        setMfaState('VERIFIED');
        setSuccessMsg(
          trustDevice
            ? 'Device verified successfully. This device is trusted for 365 days.'
            : 'Access granted.'
        );
      }
    } catch (err: any) {
      logMfaDiagnostic('mfa-verification-failed', {
        errorCode: err?.code,
        errorMessage: err?.message,
      });
      setMfaState('ERROR');
      const userErr = mapFirebaseTotpAuthError(err);
      setErrorMsg(userErr || err.message || 'Verification failed. Please ensure the code matches your authenticator app.');
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  /**
   * Dispatches verification for a one-time recovery code
   */
  const handleRecoveryCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = recoveryCodeInput.trim();
    if (!clean) {
      setErrorMsg('Please enter your recovery code.');
      return;
    }

    setMfaState('VERIFYING');
    setErrorMsg('');
    try {
      const res = await verifyMfaRecoveryCode(clean);
      setMfaState('VERIFIED');
      setSuccessMsg(
        res.warning || `Recovery code accepted. ${res.remainingCodes} recovery code(s) remaining.`
      );
      setTimeout(() => {
        closeMfaModal();
      }, 1500);
    } catch (err: any) {
      setMfaState('ERROR');
      setErrorMsg(err.message || 'Invalid or previously used recovery code.');
    }
  };

  /**
   * Submits a manual recovery request when all factors are lost
   */
  const handleManualRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryEmail || !recoveryReason.trim()) {
      setErrorMsg('Please provide your registered email address and reason for recovery.');
      return;
    }

    setMfaState('VERIFYING');
    setErrorMsg('');
    try {
      const res = await submitManualRecoveryRequest({
        email: recoveryEmail,
        phone: recoveryPhone,
        srnRegNo: recoverySrn,
        reason: recoveryReason,
      });
      setMfaState('VERIFIED');
      setRecoverySubmittedId(res.requestId || 'REQ-CONFIRMED');
      setSuccessMsg(res.message || 'Recovery request submitted for administrator verification.');
    } catch (err: any) {
      setMfaState('ERROR');
      setErrorMsg(err.message || 'Failed to submit account recovery request.');
    }
  };

  const copyAllRecoveryCodes = () => {
    if (newlyGeneratedCodes.length === 0) return;
    const text = [
      'CA EXAM CHECKER AI - ONE-TIME RECOVERY CODES',
      'Generated: ' + formatDateTimeIST(new Date(), true),
      'Keep these codes strictly private and offline. Each code can only be used once.',
      '------------------------------------------------',
      ...newlyGeneratedCodes.map((c, i) => `${i + 1}. ${c}`),
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2500);
    });
  };

  const downloadRecoveryCodesFile = () => {
    if (newlyGeneratedCodes.length === 0) return;
    const text = [
      'CA EXAM CHECKER AI - ONE-TIME RECOVERY CODES',
      'Generated: ' + formatDateTimeIST(new Date(), true),
      'Keep these codes strictly private and offline. Each code can only be used once.',
      '------------------------------------------------',
      ...newlyGeneratedCodes.map((c, i) => `${i + 1}. ${c}`),
    ].join('\n');

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ca-exam-checker-recovery-codes-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      id="mfa-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mfa-modal-title"
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="relative px-4 sm:px-6 pt-5 sm:pt-6 pb-3 sm:pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shrink-0">
                {isEnrollMode || mfaState === 'SHOWING_RECOVERY_CODES' ? (
                  <KeyRound className="w-5 h-5" />
                ) : isRecoveryCodeMode ? (
                  <Key className="w-5 h-5" />
                ) : isManualRecoveryMode ? (
                  <LifeBuoy className="w-5 h-5" />
                ) : (
                  <ShieldCheck className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <h3 id="mfa-modal-title" className="text-base font-bold text-slate-900 dark:text-white truncate">
                  {mfaState === 'SHOWING_RECOVERY_CODES'
                    ? 'Save Your Recovery Codes'
                    : isEnrollMode
                    ? 'Set Up Authenticator App'
                    : isRecoveryCodeMode
                    ? 'Enter Recovery Code'
                    : isManualRecoveryMode
                    ? 'Manual Account Recovery'
                    : 'Two-Factor Authentication'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {mfaState === 'SHOWING_RECOVERY_CODES'
                    ? 'Store these one-time codes safely. They let you sign in if you lose your device.'
                    : isEnrollMode
                    ? 'Use Google Authenticator, Microsoft Authenticator, or another compatible app'
                    : isRecoveryCodeMode
                    ? 'Use one of your 8-character recovery codes (e.g. 4K9M-72XP)'
                    : isManualRecoveryMode
                    ? 'Submit identity verification details for administrator review'
                    : 'Enter the 6-digit code shown in your authenticator app'}
                </p>
              </div>
            </div>

            {/* Close button (allowed only for non-mandatory contexts or when done) */}
            {(!isMandatoryRole || mfaState === 'SHOWING_RECOVERY_CODES') && (
              <button
                type="button"
                onClick={mfaState === 'SHOWING_RECOVERY_CODES' ? closeMfaModal : cancelMfaChallenge}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Mandatory notice for administrative roles */}
          {isMandatoryRole && !isManualRecoveryMode && mfaState !== 'SHOWING_RECOVERY_CODES' && (
            <div className="mt-3 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 rounded-xl flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
                Mandatory Security Requirement for Administrative Accounts
              </span>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 max-h-[calc(100vh-140px)] overflow-y-auto">
          {/* Success Banner */}
          {successMsg && (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
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

          {/* ========================================================= */}
          {/* SCREEN: SHOWING NEW RECOVERY CODES AFTER ENROLLMENT       */}
          {/* ========================================================= */}
          {mfaState === 'SHOWING_RECOVERY_CODES' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                  Important: Save these codes now
                </p>
                <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                  Each code can be used <strong>once</strong> to sign in if you lose your phone or authenticator app. We cannot display these codes again after this screen.
                </p>
              </div>

              {/* 10 Codes Grid */}
              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold text-slate-800 dark:text-slate-100">
                {newlyGeneratedCodes.map((code, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 text-center tracking-widest select-all"
                  >
                    <span className="text-[10px] text-slate-400 mr-1.5 font-normal">#{idx + 1}</span>
                    {code}
                  </div>
                ))}
              </div>

              {/* Copy & Download Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={copyAllRecoveryCodes}
                  className="flex-1 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedCodes ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-600 font-bold">Copied All Codes</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy All Codes</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={downloadRecoveryCodesFile}
                  className="flex-1 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download (.txt)</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  const finalUser = verifiedUserRef.current || user;
                  if (finalUser) {
                    completeMfaChallenge(finalUser);
                  } else {
                    closeMfaModal();
                  }
                }}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>I Have Safely Saved My Recovery Codes</span>
              </button>
            </div>
          )}

          {/* ========================================================= */}
          {/* SCREEN: RECOVERY CODE CHALLENGE (Alternative to TOTP)     */}
          {/* ========================================================= */}
          {isRecoveryCodeMode && mfaState !== 'SHOWING_RECOVERY_CODES' && (
            <form onSubmit={handleRecoveryCodeSubmit} className="space-y-4">
              <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-900 dark:text-blue-200 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-blue-600 shrink-0" />
                  Single-Use Recovery Code
                </p>
                <p className="text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
                  Enter one of the 8-character recovery codes generated when you set up Two-Factor Authentication. That code will be retired immediately upon use.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Recovery Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. 4K9M-72XP"
                  value={recoveryCodeInput}
                  onChange={(e) => setRecoveryCodeInput(e.target.value.toUpperCase())}
                  autoFocus
                  disabled={mfaState === 'VERIFYING' || mfaState === 'VERIFIED'}
                  className="w-full py-3 px-4 text-center font-mono text-base sm:text-lg tracking-widest font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:border-blue-600 focus:outline-none transition uppercase"
                />
              </div>

              <button
                type="submit"
                disabled={!recoveryCodeInput.trim() || mfaState === 'VERIFYING' || mfaState === 'VERIFIED'}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {mfaState === 'VERIFYING' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <>
                    <span>Verify Recovery Code & Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => switchMfaMode('CHALLENGE')}
                  className="text-blue-600 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Use Authenticator App
                </button>
                <button
                  type="button"
                  onClick={() => switchMfaMode('MANUAL_RECOVERY')}
                  className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                >
                  Lost all recovery codes?
                </button>
              </div>
            </form>
          )}

          {/* ========================================================= */}
          {/* SCREEN: MANUAL ACCOUNT RECOVERY (Lost All Factors)        */}
          {/* ========================================================= */}
          {isManualRecoveryMode && mfaState !== 'SHOWING_RECOVERY_CODES' && (
            <div className="space-y-4">
              {recoverySubmittedId ? (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-3 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <div>
                    <h4 className="font-bold text-sm text-emerald-900 dark:text-emerald-200">
                      Recovery Ticket Submitted
                    </h4>
                    <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1">
                      Reference ID: <span className="font-mono font-bold">{recoverySubmittedId}</span>
                    </p>
                  </div>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-relaxed text-left pt-1">
                    Your request has been securely queued. To prevent account takeovers, our administrator will verify your registered email and ICAI credentials manually before re-enabling access.
                  </p>
                  <button
                    type="button"
                    onClick={cancelMfaChallenge}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Return to Login Page
                  </button>
                </div>
              ) : (
                <form onSubmit={handleManualRecoverySubmit} className="space-y-3">
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200">
                    <p className="font-semibold flex items-center gap-1 mb-1">
                      <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                      Zero Automated Bypass Policy
                    </p>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                      To safeguard exam submissions, evaluations, and institutional data, Two-Factor Authentication cannot be instantly bypassed. An administrator will review your request.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Registered Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      placeholder="e.g. ca.student@gmail.com"
                      className="w-full py-2 px-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Contact Phone
                      </label>
                      <input
                        type="tel"
                        value={recoveryPhone}
                        onChange={(e) => setRecoveryPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="w-full py-2 px-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        ICAI SRN / Reg No
                      </label>
                      <input
                        type="text"
                        value={recoverySrn}
                        onChange={(e) => setRecoverySrn(e.target.value.toUpperCase())}
                        placeholder="e.g. CRO0123456"
                        className="w-full py-2 px-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-blue-600 focus:outline-none uppercase"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Reason for Recovery *
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={recoveryReason}
                      onChange={(e) => setRecoveryReason(e.target.value)}
                      placeholder="Explain what happened to your authenticator device and recovery codes..."
                      className="w-full py-2 px-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-blue-600 focus:outline-none resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={mfaState === 'VERIFYING' || !recoveryEmail || !recoveryReason.trim()}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {mfaState === 'VERIFYING' ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Submitting Request...</span>
                      </>
                    ) : (
                      <span>Submit Verification Request</span>
                    )}
                  </button>

                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => switchMfaMode('CHALLENGE')}
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back to 2FA Code
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* SCREEN: STANDARD TOTP CHALLENGE & ENROLLMENT               */}
          {/* ========================================================= */}
          {!isRecoveryCodeMode && !isManualRecoveryMode && mfaState !== 'SHOWING_RECOVERY_CODES' && (
            <>
              {/* ENROLL MODE: QR Code & Manual Key View */}
              {isEnrollMode && (
                <div className="space-y-4">
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

              {/* OTP Input Section */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  executeVerification();
                }}
                className="space-y-4 pt-1"
              >
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
                  <div className="flex items-center justify-center gap-1.5 sm:gap-2.5 overflow-x-hidden" onPaste={handlePaste}>
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
                        className="w-10 sm:w-12 h-12 sm:h-14 text-center text-lg sm:text-xl font-bold font-mono text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition disabled:opacity-50 shrink-0"
                      />
                    ))}
                  </div>
                </div>

                {/* Browser Trust Status (from useTrustedDevice HttpOnly cookie check) */}
                <div className="pt-1">
                  {isBrowserTrusted ? (
                    <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div className="text-[11px] text-emerald-800 dark:text-emerald-300">
                        <span className="font-semibold">Trusted Browser recognized.</span> Secure HttpOnly credential valid until{' '}
                        {trustExpiresAt ? new Date(trustExpiresAt).toLocaleDateString() : '365 days'}.
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                      <div className="text-[11px] text-slate-600 dark:text-slate-300">
                        <span className="font-medium text-slate-900 dark:text-white">Untrusted browser detected.</span> TOTP validation required to authenticate and establish 365-day device trust.
                      </div>
                    </div>
                  )}
                </div>

                {/* Device Trust Checkbox */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="trust-device-checkbox"
                    checked={trustDevice}
                    onChange={(e) => setTrustDevice(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded-sm border-slate-300 dark:border-slate-600 focus:ring-blue-500 cursor-pointer"
                  >
                  </input>
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

                  {/* Fallback Options for CHALLENGE Mode */}
                  {!isEnrollMode && (
                    <div className="flex flex-col items-center gap-1.5 pt-2 text-xs border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => switchMfaMode('RECOVERY_CODE')}
                        className="text-blue-600 hover:underline font-medium cursor-pointer"
                      >
                        Use a one-time recovery code instead
                      </button>
                      <button
                        type="button"
                        onClick={() => switchMfaMode('MANUAL_RECOVERY')}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-[11px] cursor-pointer"
                      >
                        Lost authenticator and recovery codes?
                      </button>
                    </div>
                  )}

                  {/* Cancel Option */}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};
