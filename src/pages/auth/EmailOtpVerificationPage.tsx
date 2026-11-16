import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCw, ShieldCheck, AlertCircle, MailCheck } from 'lucide-react';
import { BrandLogo } from '../../components/common/BrandLogo.js';
import { useAuth } from '../../context/AuthContext.js';

interface PendingEmailOtp {
  email: string;
  maskedEmail: string;
  message: string;
  cooldownUntil: number;
}

export const EmailOtpVerificationPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyRegisterOtp, resendRegisterOtp } = useAuth();
  const otpInputRef = useRef<HTMLInputElement | null>(null);
  const pending = useMemo<PendingEmailOtp | null>(() => {
    const state = (location.state || {}) as Partial<PendingEmailOtp>;
    if (state.email) return {
      email: state.email,
      maskedEmail: state.maskedEmail || state.email,
      message: state.message || 'A 6-digit verification code has been sent to your email.',
      cooldownUntil: Number(state.cooldownUntil) || Date.now(),
    };
    try {
      const saved = sessionStorage.getItem('ca_pending_email_otp');
      if (!saved) return null;
      const parsed = JSON.parse(saved) as Partial<PendingEmailOtp>;
      if (!parsed.email) return null;
      return {
        email: parsed.email,
        maskedEmail: parsed.maskedEmail || parsed.email,
        message: parsed.message || 'A 6-digit verification code has been sent to your email.',
        cooldownUntil: Number(parsed.cooldownUntil) || Date.now(),
      };
    } catch { return null; }
  }, [location.state]);

  const [otpCode, setOtpCode] = useState('');
  const [stage, setStage] = useState<'ready' | 'verifying' | 'success'>('ready');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(pending?.cooldownUntil || Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!pending) {
      navigate('/register', { replace: true });
      return;
    }
    setNotice(pending.message);
    setCooldownUntil(pending.cooldownUntil);
  }, [pending, navigate]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const resendSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pending || !/^\d{6}$/.test(otpCode.trim()) || isVerifying) return;
    setError('');
    setIsVerifying(true);
    setStage('verifying');
    try {
      await verifyRegisterOtp(pending.email, otpCode.trim());
      setStage('success');
      sessionStorage.removeItem('ca_pending_email_otp');
      await new Promise((resolve) => window.setTimeout(resolve, 1150));
      navigate('/student/dashboard', { replace: true });
    } catch (err) {
      setStage('ready');
      setError(err instanceof Error ? err.message : 'Verification failed. Please check the code and try again.');
      setOtpCode('');
      window.setTimeout(() => otpInputRef.current?.focus(), 50);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!pending || resendSeconds > 0 || isResending || isVerifying) return;
    setError('');
    setIsResending(true);
    try {
      const result = await resendRegisterOtp(pending.email);
      const nextUntil = Date.now() + (result.cooldownSeconds || 60) * 1000;
      const nextNotice = result.message || 'A fresh 6-digit verification code has been sent to your email.';
      setCooldownUntil(nextUntil);
      setNotice(nextNotice);
      sessionStorage.setItem('ca_pending_email_otp', JSON.stringify({ ...pending, message: nextNotice, cooldownUntil: nextUntil }));
      setOtpCode('');
      setStage('ready');
      otpInputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the code. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950 sm:px-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <BrandLogo variant="full" size="md" onClick={() => navigate('/')} />
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <button
            type="button"
            onClick={() => navigate('/register')}
            className="mb-6 inline-flex items-center gap-2 text-xs font-semibold text-slate-600 transition hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-300"
          >
            <ArrowLeft className="h-4 w-4" /> Back to account details
          </button>

          <div className="mb-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
              <MailCheck className="h-5 w-5" />
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">Email verification</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Verify your email</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
              Enter the 6-digit verification code sent to your email address.
            </p>
          </div>

          <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
            <p className="text-xs text-slate-500 dark:text-slate-400">Verification code sent to</p>
            <p className="mt-1 break-all text-sm font-semibold text-slate-900 dark:text-slate-100">
              {pending?.maskedEmail || 'your email address'}
            </p>
          </div>

          {notice && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {error && (
            <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-5">
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <label htmlFor="email-verification-code" className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Verification code
                </label>
                <span className="text-xs text-slate-500 dark:text-slate-400">6 digits</span>
              </div>

              <div
                className="relative cursor-text"
                onClick={() => otpInputRef.current?.focus()}
                role="group"
                aria-label="Six digit verification code"
              >
                <div aria-hidden="true" className="grid grid-cols-6 gap-2 sm:gap-3">
                  {Array.from({ length: 6 }, (_, index) => {
                    const isActive = otpCode.length === index && otpCode.length < 6;
                    const hasDigit = Boolean(otpCode[index]);
                    return (
                      <div
                        key={index}
                        className={`flex h-12 items-center justify-center rounded-lg border text-xl font-semibold tabular-nums transition-colors sm:h-14 sm:text-2xl ${
                          isActive
                            ? 'border-blue-600 bg-blue-50 text-slate-900 ring-2 ring-blue-100 dark:border-blue-400 dark:bg-blue-950/50 dark:text-white dark:ring-blue-900/50'
                            : hasDigit
                              ? 'border-slate-300 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white'
                              : 'border-slate-300 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-500'
                        }`}
                      >
                        {otpCode[index] || <span className="text-slate-300 dark:text-slate-600">–</span>}
                      </div>
                    );
                  })}
                </div>
                <input
                  ref={otpInputRef}
                  id="email-verification-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  autoFocus
                  aria-label="Enter the six-digit email verification code"
                  aria-describedby="email-otp-help"
                  value={otpCode}
                  disabled={isVerifying || stage === 'success'}
                  onChange={(event) => {
                    setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                    setStage('ready');
                    setError('');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && otpCode.length === 6) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  className="absolute inset-0 h-full w-full cursor-text opacity-0"
                />
              </div>
              <p id="email-otp-help" className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                You can type the code or paste all six digits at once. The code expires in 10 minutes.
              </p>
            </div>

            <button
              type="submit"
              disabled={isVerifying || stage === 'success' || otpCode.trim().length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isVerifying
                ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Verifying…</>
                : stage === 'success'
                  ? <><CheckCircle2 className="h-4 w-4" /> Email verified</>
                  : <>Verify email <ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 dark:border-slate-700">
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 transition hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-300"
            >
              <ArrowLeft className="h-4 w-4" /> Edit details
            </button>
            <button
              type="button"
              disabled={resendSeconds > 0 || isResending || isVerifying || stage === 'success'}
              onClick={handleResend}
              className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 transition hover:text-blue-800 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-blue-400 dark:hover:text-blue-300"
            >
              <RotateCw className={`h-4 w-4 ${isResending ? 'animate-spin' : ''}`} />
              {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : isResending ? 'Sending code…' : 'Resend code'}
            </button>
          </div>

          <p className="mt-6 flex items-start gap-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            Your account is activated only after the server confirms that the code is valid.
          </p>
        </section>

        <p className="mt-5 text-center text-[11px] text-slate-500 dark:text-slate-400">
          CA Exam Checker AI · Checked Like an Examiner
        </p>
      </div>
    </main>
  );
};
