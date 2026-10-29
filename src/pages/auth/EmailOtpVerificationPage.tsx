import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCw, ShieldCheck, AlertCircle, MailCheck, LockKeyhole, Sparkles } from 'lucide-react';
import { BrandLogo } from '../../components/common/BrandLogo.js';
import { OtpVaultAnimation } from '../../components/auth/OtpVaultAnimation.js';
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
    <main className="dark relative isolate min-h-[calc(100vh-4rem)] overflow-hidden bg-[#050a16] px-4 py-7 text-white sm:px-6 sm:py-10 lg:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 top-[-9rem] h-[28rem] w-[28rem] rounded-full bg-cyan-500/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 bottom-[-10rem] h-[30rem] w-[30rem] rounded-full bg-blue-600/10 blur-3xl" />

      <div className="relative mx-auto w-full max-w-6xl">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <BrandLogo variant="full" size="md" onClick={() => navigate('/')} />
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-400/[0.06] px-3.5 py-2 text-xs font-semibold text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]" />
            Secure verification
          </div>
        </header>

        <section className="grid overflow-hidden rounded-[30px] border border-white/10 bg-[#0c1526]/90 shadow-[0_32px_100px_rgba(0,0,0,.42)] backdrop-blur-2xl lg:grid-cols-[1fr_1.05fr]">
          <aside className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-[#0d2030] via-[#0a1727] to-[#08111f] p-5 sm:p-8 lg:border-b-0 lg:border-r lg:p-9 xl:p-11">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-70 [background-image:radial-gradient(rgba(103,232,249,.16)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
            <div aria-hidden="true" className="pointer-events-none absolute -right-16 top-10 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="relative">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.2em] text-cyan-200">
                <Sparkles className="h-3.5 w-3.5" />
                Identity protection
              </div>
              <h1 className="max-w-md text-3xl font-black leading-tight tracking-tight sm:text-4xl">
                One code.
                <span className="block bg-gradient-to-r from-cyan-200 via-sky-300 to-blue-400 bg-clip-text text-transparent">Your secure workspace.</span>
              </h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">
                Confirm that you own this email address before your CA Exam Checker AI account is activated.
              </p>
            </div>

            <div className="relative mx-auto my-5 max-w-md sm:my-7">
              <OtpVaultAnimation status={stage} hero />
            </div>

            <div className="relative grid grid-cols-3 gap-2 border-t border-white/10 pt-5 sm:gap-3">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                <MailCheck className="mb-2 h-4 w-4 text-cyan-300" />
                <p className="text-[11px] font-bold text-slate-200">Code sent</p>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">Check your inbox</p>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                <LockKeyhole className="mb-2 h-4 w-4 text-cyan-300" />
                <p className="text-[11px] font-bold text-slate-200">Verify</p>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">6-digit code</p>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                <ShieldCheck className="mb-2 h-4 w-4 text-cyan-300" />
                <p className="text-[11px] font-bold text-slate-200">Activate</p>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">Account ready</p>
              </div>
            </div>
          </aside>

          <div className="p-5 sm:p-8 lg:p-9 xl:p-12">
            <button type="button" onClick={() => navigate('/register')} className="mb-8 inline-flex items-center gap-2 text-xs font-semibold text-slate-400 transition hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Back to account details
            </button>

            <div className="mb-7">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,.08)]">
                <MailCheck className="h-6 w-6" />
              </div>
              <p className="text-[10px] font-extrabold uppercase tracking-[.22em] text-cyan-300">Step 02 · Verify email</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Check your inbox</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">Enter the one-time code we sent to the email linked to your new account.</p>
            </div>

            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-cyan-200"><MailCheck className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-400">Verification email sent to</p>
                <p className="mt-1 break-all font-mono text-sm font-bold text-slate-100">{pending?.maskedEmail || 'your email address'}</p>
              </div>
              <span className="shrink-0 rounded-full border border-emerald-300/15 bg-emerald-300/[0.07] px-2.5 py-1 text-[10px] font-bold text-emerald-300">10 min</span>
            </div>

            {notice && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] p-3.5 text-xs leading-5 text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{notice}</span>
              </div>
            )}
            {error && (
              <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-300/20 bg-rose-400/[0.06] p-3.5 text-xs leading-5 text-rose-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-6">
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <label htmlFor="email-verification-code" className="text-sm font-bold text-slate-200">Your 6-digit code</label>
                  <span className="text-[10px] font-semibold text-slate-500">Single-use · Email OTP</span>
                </div>
                <div className="relative cursor-text" onClick={() => otpInputRef.current?.focus()}>
                  <div aria-hidden="true" className="grid grid-cols-6 gap-2 sm:gap-2.5">
                    {Array.from({ length: 6 }, (_, index) => (
                      <div key={index} className={`flex h-14 items-center justify-center rounded-xl border text-xl font-black transition sm:h-16 sm:text-2xl ${otpCode.length === index ? 'border-cyan-300 bg-cyan-300/[0.08] text-white shadow-[0_0_0_3px_rgba(34,211,238,.07)]' : otpCode[index] ? 'border-white/20 bg-white/[0.06] text-slate-100' : 'border-white/10 bg-[#07111f] text-slate-700'}`}>
                        {otpCode[index] || <span className="text-base font-normal text-slate-700">•</span>}
                      </div>
                    ))}
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
                <p id="email-otp-help" className="mt-3 text-xs leading-5 text-slate-500">Paste the code from your email or type each digit. The code expires in 10 minutes.</p>
              </div>

              <button type="submit" disabled={isVerifying || stage === 'success' || otpCode.trim().length !== 6} className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-cyan-200/20 bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-4 text-sm font-extrabold text-white shadow-[0_12px_30px_rgba(37,99,235,.22)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45">
                {isVerifying ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Verifying securely…</> : stage === 'success' ? <><CheckCircle2 className="h-4 w-4" /> Email verified</> : <>Verify email & activate account <ArrowRight className="h-4 w-4" /></>}
              </button>
            </form>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
              <button type="button" onClick={() => navigate('/register')} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 transition hover:text-white">
                <ArrowLeft className="h-4 w-4" /> Edit account details
              </button>
              <button type="button" disabled={resendSeconds > 0 || isResending || isVerifying || stage === 'success'} onClick={handleResend} className="inline-flex items-center gap-2 text-xs font-bold text-cyan-300 transition hover:text-cyan-200 disabled:cursor-not-allowed disabled:text-slate-600">
                <RotateCw className={`h-4 w-4 ${isResending ? 'animate-spin' : ''}`} />{resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : isResending ? 'Sending code…' : 'Resend code'}
              </button>
            </div>

            <p className="mt-7 flex items-start gap-2 text-[11px] leading-5 text-slate-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              Your code is single-use. We activate your account only after the server confirms the code is valid.
            </p>
          </div>
        </section>

        <p className="mt-5 text-center text-[11px] text-slate-600">CA Exam Checker AI · Checked Like an Examiner</p>
      </div>
    </main>
  );
};
