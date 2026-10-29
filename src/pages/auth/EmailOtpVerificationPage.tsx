import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, MailCheck, RotateCw, ShieldCheck, AlertCircle, LockKeyhole } from 'lucide-react';
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
    if (!pending) { navigate('/register', { replace: true }); return; }
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
      await new Promise((resolve) => window.setTimeout(resolve, 1050));
      navigate('/student/dashboard', { replace: true });
    } catch (err) {
      setStage('ready');
      setError(err instanceof Error ? err.message : 'Verification failed. Please check the code and try again.');
    } finally { setIsVerifying(false); }
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the code. Please try again.');
    } finally { setIsResending(false); }
  };

  return (
    <main className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-4 py-10 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <div className="w-full max-w-xl">
        <div className="text-center mb-7">
          <div className="flex justify-center mb-5"><BrandLogo variant="full" size="md" onClick={() => navigate('/')} /></div>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-slate-900 text-cyan-200 shadow-lg shadow-cyan-950/20"><LockKeyhole className="h-6 w-6" /></div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-600 dark:text-cyan-300">Secure account activation</p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight">Verify your email</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">One quick step to unlock your CA Exam Checker AI account.</p>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 sm:p-7">
          <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-4 text-center dark:border-blue-900 dark:bg-blue-950/40 sm:p-5">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20"><MailCheck className="h-7 w-7" /></div>
            <h2 className="text-base font-bold">Check your inbox</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">We sent a 6-digit verification code to</p>
            <p className="mt-1 break-all font-mono text-sm font-bold text-blue-700 dark:text-blue-300">{pending?.maskedEmail || 'your email address'}</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Code expires in <strong>10 minutes</strong>. Single-use only.</p>
          </div>

          {notice && <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{notice}</span></div>}
          {error && <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

          <form onSubmit={handleVerify} className="mt-5 space-y-5">
            <div>
              <label htmlFor="email-verification-code" className="mb-2 block text-center text-sm font-semibold text-slate-700 dark:text-slate-200">Enter your 6-digit code</label>
              <input id="email-verification-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus placeholder="123456" value={otpCode} disabled={isVerifying || stage === 'success'} onChange={(event) => { setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setStage('ready'); setError(''); }} className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-center font-mono text-2xl font-extrabold tracking-[0.45em] text-slate-900 outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-500/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-cyan-400" />
            </div>

            <OtpVaultAnimation status={stage} />

            <button type="submit" disabled={isVerifying || stage === 'success' || otpCode.trim().length !== 6} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              {isVerifying ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Verifying securely…</> : <>Verify & Activate Account <ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
            <button type="button" onClick={() => navigate('/register')} className="inline-flex items-center gap-1.5 text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"><ArrowLeft className="h-4 w-4" /> Edit registration details</button>
            <button type="button" disabled={resendSeconds > 0 || isResending || isVerifying} onClick={handleResend} className="inline-flex items-center gap-1.5 font-semibold text-blue-600 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400">
              <RotateCw className={`h-4 w-4 ${isResending ? 'animate-spin' : ''}`} />{resendSeconds > 0 ? `Resend in ${resendSeconds}s` : isResending ? 'Sending…' : 'Resend code'}
            </button>
          </div>
        </section>
        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400"><ShieldCheck className="h-4 w-4 text-emerald-500" />Your code is single-use and verified securely by the server.</div>
      </div>
    </main>
  );
};
