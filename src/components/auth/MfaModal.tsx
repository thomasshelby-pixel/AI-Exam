import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, ShieldAlert, Smartphone, ArrowRight, RefreshCw, X, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

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

  // Form states
  const [phone, setPhone] = useState('');
  const [enrollStep, setEnrollStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [cooldown, setCooldown] = useState(30);
  const [canResend, setCanResend] = useState(false);

  // Focus ref for OTP input
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset states when modal opens
  useEffect(() => {
    if (mfaChallenge?.isOpen) {
      setOtpDigits(['', '', '', '', '', '']);
      setErrorMsg('');
      setSuccessMsg('');
      setCooldown(30);
      setCanResend(false);
      setEnrollStep('PHONE');
      setPhone('');

      if (!isEnrollMode) {
        // Auto focus first OTP digit
        setTimeout(() => {
          inputRefs.current[0]?.focus();
        }, 150);
      }
    }
  }, [mfaChallenge?.isOpen, mfaChallenge?.mode]);

  // Cooldown countdown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (cooldown > 0 && (enrollStep === 'OTP' || !isEnrollMode)) {
      timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    } else if (cooldown === 0) {
      setCanResend(true);
    }
    return () => clearTimeout(timer);
  }, [cooldown, enrollStep, isEnrollMode]);

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

  // Submit Challenge OTP
  const handleSubmitChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fullOtp.length !== 6) {
      setErrorMsg('Please enter the full 6-digit verification code.');
      return;
    }

    setErrorMsg('');
    setIsLoading(true);
    try {
      await verifyMfaChallenge(fullOtp);
    } catch (err: any) {
      setErrorMsg(err?.message || err?.data?.error || 'Invalid verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Send Code for Enrollment
  const handleSendEnrollCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      setErrorMsg('Please enter a valid 10-digit mobile number.');
      return;
    }

    setErrorMsg('');
    setIsLoading(true);
    try {
      await sendMfaEnrollCode(phone);
      setEnrollStep('OTP');
      setCooldown(30);
      setCanResend(false);
      setSuccessMsg(`Verification code sent to your mobile phone.`);
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 150);
    } catch (err: any) {
      setErrorMsg(err?.message || err?.data?.error || 'Failed to dispatch verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  // Submit Enrollment OTP
  const handleSubmitEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fullOtp.length !== 6) {
      setErrorMsg('Please enter the full 6-digit verification code.');
      return;
    }

    setErrorMsg('');
    setIsLoading(true);
    try {
      await verifyMfaEnroll(phone, fullOtp);
    } catch (err: any) {
      setErrorMsg(err?.message || err?.data?.error || 'Invalid verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Resend Handler
  const handleResend = async () => {
    if (!canResend) return;
    setErrorMsg('');
    setCanResend(false);
    setCooldown(30);
    try {
      if (isEnrollMode) {
        await sendMfaEnrollCode(phone);
        setSuccessMsg('A new verification code has been dispatched via SMS.');
      } else {
        await resendMfaChallenge();
        setSuccessMsg('A fresh verification code has been dispatched via SMS.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to resend code. Please wait and try again.');
    }
  };

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
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
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
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || phone.length < 10}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
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
                  className="w-full py-2 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition"
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
                    className="w-11 h-12 text-center text-lg font-bold font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                  />
                ))}
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => setEnrollStep('PHONE')}
                  className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  ← Change number
                </button>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={!canResend}
                  className={`font-semibold ${
                    canResend
                      ? 'text-blue-600 dark:text-blue-400 hover:underline cursor-pointer'
                      : 'text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {canResend ? 'Resend SMS code' : `Resend in ${cooldown}s`}
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading || fullOtp.length !== 6}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Verify & Activate MFA</span>
                    <ShieldCheck className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* MODE: CHALLENGE (STANDARD LOGIN OTP VERIFICATION) */}
          {!isEnrollMode && (
            <form onSubmit={handleSubmitChallenge} className="space-y-4">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 mx-auto rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2">
                  <Smartphone className="w-6 h-6" />
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Enter the 6-digit verification code sent to
                </p>
                <p className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                  {mfaChallenge.maskedPhone || 'your registered mobile number'}
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
                    className="w-11 h-12 text-center text-lg font-bold font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                  />
                ))}
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500 dark:text-slate-400">Didn&apos;t receive SMS?</span>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={!canResend}
                  className={`font-semibold ${
                    canResend
                      ? 'text-blue-600 dark:text-blue-400 hover:underline cursor-pointer'
                      : 'text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {canResend ? 'Resend code' : `Resend in ${cooldown}s`}
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading || fullOtp.length !== 6}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Verify & Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={cancelMfaChallenge}
                className="w-full py-2 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition"
              >
                Cancel and return to login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
