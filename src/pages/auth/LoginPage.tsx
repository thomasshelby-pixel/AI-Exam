import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { BrandLogo } from '../../components/common/BrandLogo';
import { SuspendedAccountView } from '../../components/auth/SuspendedAccountView.js';
import { SrnInputField } from '../../components/common/SrnInputField.js';
import { validateSrn } from '../../utils/srnValidator.js';
import {
  FileCheck2,
  Lock,
  Mail,
  User,
  Phone,
  BookOpen,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  GraduationCap,
  Tag,
  Eye,
  EyeOff,
  ShieldCheck,
  X,
  Building2,
} from 'lucide-react';

interface LoginPageProps {
  initialMode?: 'login' | 'register';
  onSuccess: (user: any) => void;
  onNavigateHome: () => void;
  onSwitchToInstitute?: () => void;
  onBackToSelector?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  initialMode = 'login',
  onSuccess,
  onNavigateHome,
  onSwitchToInstitute,
  onBackToSelector,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, socialLogin, register, initiateRegister, suspendedAccount, clearSuspension } = useAuth();
  const accountDeletedMessage = (location.state as any)?.accountDeletedMessage;
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [icaiRegNo, setIcaiRegNo] = useState('');
  const [caLevel, setCaLevel] = useState<'FOUNDATION' | 'INTERMEDIATE' | 'FINAL'>('INTERMEDIATE');
  const [referralCode, setReferralCode] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [forgotPasswordMsg, setForgotPasswordMsg] = useState('');

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    setErrorMessage('');
    if (mode === 'register' && (!termsAccepted || !privacyAccepted)) {
      setErrorMessage('Please accept both the Privacy Policy and all Terms & Conditions before creating your account.');
      return;
    }
    setIsLoading(true);
    try {
      const consent = mode === 'register'
        ? { termsAccepted: true, privacyAccepted: true, termsVersion: '2.0', privacyVersion: '2.0' }
        : undefined;
      const loggedInUser = await socialLogin(provider, undefined, consent);
      onSuccess(loggedInUser);
    } catch (err: any) {
      if (
        err?.status === 'SUSPENDED' ||
        err?.accountStatus === 'SUSPENDED' ||
        err?.code === 'ACCOUNT_SUSPENDED' ||
        err?.suspension ||
        err?.data?.suspension
      ) {
        return;
      }
      let message: string;
      if (err?.code === 'auth/popup-closed-by-user') {
        message = 'Sign-in was cancelled.';
      } else if (err?.code === 'auth/operation-not-allowed') {
        message = `${provider === 'apple' ? 'Apple' : 'Google'} Sign-In is not enabled in Firebase Authentication yet.`;
      } else if (err?.code === 'auth/unauthorized-domain') {
        message = 'This website domain is not authorized for Firebase Sign-In. Add the current website domain in Firebase Authentication → Settings → Authorized domains.';
      } else if (provider === 'apple' && ['auth/invalid-credential', 'auth/invalid-oauth-client-id', 'auth/missing-or-invalid-nonce', 'auth/invalid-continue-uri'].includes(err?.code)) {
        message = 'Apple Sign-In needs its Firebase and Apple Developer credentials configured correctly. Check the Services ID, Team ID, Key ID, private key, and the return URL https://auth.caexamcheckerai.com/__/auth/handler.';
      } else if (err?.code === 'auth/popup-blocked') {
        message = 'Your browser blocked the sign-in popup. Allow popups for this site and try again.';
      } else {
        message = err instanceof Error ? err.message : 'Social sign-in failed. Please try again.';
      }
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle standard student/user email-password login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      const loggedInUser = await login(email, password, 'STUDENT');
      onSuccess(loggedInUser);
    } catch (err: any) {
      if (
        err?.status === 'SUSPENDED' ||
        err?.accountStatus === 'SUSPENDED' ||
        err?.code === 'ACCOUNT_SUSPENDED' ||
        err?.suspension ||
        err?.data?.suspension
      ) {
        // SuspendedAccountView will be rendered via suspendedAccount context
        return;
      }
      const msg = err instanceof Error ? err.message : 'Invalid credentials or login failure';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle registration submission: calls backend to validate inputs and dispatch 6-digit OTP
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!termsAccepted || !privacyAccepted) {
      setErrorMessage('Please tick both checkboxes: Privacy Policy consent and agreement to all Terms & Conditions.');
      return;
    }

    const srnValidation = validateSrn(icaiRegNo);
    if (!srnValidation.isValid) {
      setErrorMessage(srnValidation.error || 'Please provide a valid ICAI Registration Number (e.g. CRO0123456).');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    setIsLoading(true);

    try {
      const data = await initiateRegister({
        email: email.trim().toLowerCase(),
        password,
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        icaiRegistrationNumber: srnValidation.normalized,
        caLevel,
        referralCode: referralCode.trim() || undefined,
        termsAccepted: true,
        privacyAccepted: true,
        termsVersion: '2.0',
        privacyVersion: '2.0',
      });

      if (data.requiresOtpVerification) {
        const verificationEmail = data.email || email.trim().toLowerCase();
        const verificationMaskedEmail = data.emailMasked || verificationEmail;
        const cooldownSeconds = data.cooldownSeconds || 60;
        const successMessage = data.message || `A 6-digit verification code has been dispatched to ${verificationMaskedEmail}.`;
        const cooldownUntil = Date.now() + cooldownSeconds * 1000;
        sessionStorage.setItem('ca_pending_email_otp', JSON.stringify({ email: verificationEmail, maskedEmail: verificationMaskedEmail, message: successMessage, cooldownUntil }));
        navigate('/verify-email', { state: { email: verificationEmail, maskedEmail: verificationMaskedEmail, message: successMessage, cooldownUntil } });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setErrorMessage('Please enter your email address above first.');
      return;
    }
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setForgotPasswordMsg(data.message || 'If an account exists with this email address, a password reset link has been dispatched to your inbox. The link will expire in 1 hour.');
    } catch {
      setErrorMessage('Failed to request password reset. Please contact support.');
    }
  };

  // If user account is suspended, render the formal revocation appeal view
  if (suspendedAccount) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-8 bg-[#f1f5f9]">
        <SuspendedAccountView
          suspension={suspendedAccount}
          onClose={() => {
            clearSuspension();
            setErrorMessage('');
          }}
        />
      </div>
    );
  }

  return (
    <div className="dark relative isolate min-h-[calc(100vh-5rem)] overflow-hidden bg-[#050a16] px-4 py-8 text-white sm:px-6 sm:py-10 lg:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 -top-36 h-[28rem] w-[28rem] rounded-full bg-cyan-500/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -right-40 h-[30rem] w-[30rem] rounded-full bg-blue-600/10 blur-3xl" />
      <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 overflow-hidden rounded-[30px] border border-white/10 bg-[#0c1526]/95 shadow-[0_32px_100px_rgba(0,0,0,.42)] backdrop-blur-2xl lg:grid-cols-[0.86fr_1.14fr]">
        <aside className="relative hidden flex-col justify-between overflow-hidden border-b border-white/10 bg-gradient-to-br from-[#0d2030] via-[#0a1727] to-[#08111f] p-8 lg:flex lg:border-b-0 lg:border-r xl:p-10">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-70 [background-image:radial-gradient(rgba(103,232,249,.14)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 top-10 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative">
            <BrandLogo variant="full" size="md" onClick={onNavigateHome} />
            <div className="mt-14 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.2em] text-cyan-200"><ShieldCheck className="h-3.5 w-3.5" /> Secure student workspace</div>
            <h1 className="mt-5 max-w-md text-3xl font-black leading-tight tracking-tight xl:text-4xl">{mode === 'login' ? 'Welcome back to your CA workspace.' : 'Build your next CA success story.'}</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">{mode === 'login' ? 'Continue your preparation with clear evaluations, step-marking reports, and a workspace built around your CA journey.' : 'Create your account to unlock structured practice, examiner-style feedback, and your first two free answer-sheet checks.'}</p>
          </div>
          <div className="relative my-10 space-y-3">
            <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3.5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/[0.07] text-cyan-200"><FileCheck2 className="h-5 w-5" /></div><div><p className="text-sm font-bold text-slate-100">ICAI-style step checking</p><p className="mt-1 text-xs text-slate-400">Working notes and method marks matter.</p></div></div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3.5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-200"><CheckCircle2 className="h-5 w-5" /></div><div><p className="text-sm font-bold text-slate-100">Clear, actionable feedback</p><p className="mt-1 text-xs text-slate-400">Understand where marks were gained or lost.</p></div></div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3.5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-300/15 bg-blue-300/[0.07] text-blue-200"><Lock className="h-5 w-5" /></div><div><p className="text-sm font-bold text-slate-100">Secure account access</p><p className="mt-1 text-xs text-slate-400">Your account and study progress in one place.</p></div></div>
          </div>
          <div className="relative flex items-center justify-between border-t border-white/10 pt-5 text-[11px] text-slate-500"><span>CA EXAM CHECKER AI</span><span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> System online</span></div>
        </aside>
        <div className="min-w-0 p-5 sm:p-8 lg:p-9 xl:p-11">
        {/* Header with Brand Logo */}
        <div className="text-center mb-6">
          <div className="mb-4 flex justify-center lg:hidden">
            <BrandLogo variant="full" size="sm" onClick={onNavigateHome} />
          </div>
          <div className="mx-auto mb-3 inline-flex w-fit items-center justify-center gap-1.5 rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-1.5 text-xs font-semibold text-cyan-200">
            <GraduationCap className="w-3.5 h-3.5" />
            <span>CA Student Portal</span>
          </div>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">
            {mode === 'login' ? 'Sign in to Your Account' : 'Create Your Account'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {mode === 'login'
              ? 'Access your CA answer sheet evaluations and step-marking reports'
              : 'Sign up today and get your first 2 answer sheets evaluated free'}
          </p>
        </div>

        {/* Free Tier Callout on Register */}
        {mode === 'register' && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] p-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-200/20 bg-cyan-300/[0.12] text-[10px] font-black text-cyan-100">
              FREE
            </div>
            <div className="text-xs">
              <p className="font-bold text-cyan-100">2 Free Answer Sheet Checks</p>
              <p className="text-slate-600 dark:text-slate-300">Full paper evaluation with ICAI step marking & working notes check.</p>
            </div>
          </div>
        )}

        {/* Feedback alerts */}
        {accountDeletedMessage && (
          <div
            id="account-deleted-success-banner"
            className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100 text-xs sm:text-sm font-medium flex items-center gap-2.5 shadow-xs"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{accountDeletedMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {forgotPasswordMsg && (
          <div className="mb-4 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{forgotPasswordMsg}</span>
          </div>
        )}

        {/* Mode Switch Tabs */}
        <div className="mb-6 flex rounded-xl border border-white/10 bg-white/[0.035] p-1">
          <button type="button" onClick={() => { setMode('login'); setErrorMessage(''); }} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition ${mode === 'login' ? 'bg-cyan-300/[0.12] text-cyan-100 shadow-sm ring-1 ring-cyan-200/10' : 'text-slate-400 hover:text-white'}`}>Sign In</button>
          <button type="button" onClick={() => { setMode('register'); setErrorMessage(''); }} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition ${mode === 'register' ? 'bg-cyan-300/[0.12] text-cyan-100 shadow-sm ring-1 ring-cyan-200/10' : 'text-slate-400 hover:text-white'}`}>Create Account</button>
        </div>

                {/* Login Form */}
        {mode === 'login' && (
          <div className="space-y-4">
            <form onSubmit={handleLoginSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    id="login-email"
                    type="email"
                    required
                    placeholder="student@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 dark:focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Password</label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    id="login-password"
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 dark:focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                    aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                id="btn-login-submit"
                type="submit"
                disabled={isLoading}
                className="w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-xs hover:shadow transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="pt-3 space-y-2.5">
                <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest font-semibold text-slate-400 dark:text-slate-500">
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                  <span>Or continue with</span>
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                </div>

                <button
                  id="btn-google-sign-in"
                  type="button"
                  onClick={() => handleSocialLogin('google')}
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold text-xs sm:text-sm transition disabled:opacity-50 flex items-center justify-center gap-2.5"
                >
                  <svg aria-hidden="true" viewBox="0 0 48 48" className="w-4 h-4 shrink-0">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" transform="translate(0 5)"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.74 7.18l7.27 5.64c4.25-3.92 6.71-9.7 6.71-17.29Z"/>
                    <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.12.76-4.59l-7.98-6.2A23.86 23.86 0 0 0 0 24c0 3.88.93 7.56 2.56 10.79l7.97-6.2Z" transform="translate(0 0)"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.94-2.14 15.92-5.81l-7.27-5.64c-2.02 1.35-4.6 2.15-8.65 2.15-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.2C6.51 43.62 14.62 48 24 48Z" transform="translate(0 0)"/>
                  </svg>
                  <span>{isLoading ? 'Signing in…' : 'Continue with Google'}</span>
                </button>


                <p className="text-[10px] leading-relaxed text-center text-slate-500 dark:text-slate-400">
                  New students can create an account with Google. After sign-in, complete your ICAI registration number to unlock student features; phone number is optional.
                </p>
              </div>
            </form>
          </div>
        )}

        {/* Student Registration Form */}
        {mode === 'register' && (
          <div className="space-y-4">
            <form onSubmit={handleRegisterSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    id="register-fullname"
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 dark:focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    id="register-email"
                    type="email"
                    required
                    placeholder="student@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 dark:focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Strict ICAI SRN Validation Input Field */}
              <div className="space-y-1">
                <SrnInputField
                  id="register-icai-no"
                  value={icaiRegNo}
                  onChange={setIcaiRegNo}
                  required={true}
                  label="ICAI Student Registration Number (SRN)"
                  showHelperText={true}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">CA Exam Level</label>
                <select
                  id="register-ca-level"
                  value={caLevel}
                  onChange={(e) => setCaLevel(e.target.value as 'FOUNDATION' | 'INTERMEDIATE' | 'FINAL')}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 dark:focus:border-blue-500"
                >
                  <option value="FOUNDATION">CA Foundation</option>
                  <option value="INTERMEDIATE">CA Intermediate</option>
                  <option value="FINAL">CA Final</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Phone Number (Optional)</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    id="register-phone"
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 dark:focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    id="register-password"
                    type={showRegisterPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 dark:focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                    aria-label={showRegisterPassword ? 'Hide password' : 'Show password'}
                  >
                    {showRegisterPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Referral / Promo Code (Optional)
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">Optional</span>
                </div>
                <div className="relative">
                  <Tag className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    id="register-referral-code"
                    type="text"
                    placeholder="Enter referral / promo code"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white uppercase font-mono placeholder:normal-case focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 dark:focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-3">
                <label className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={privacyAccepted}
                    onChange={(e) => setPrivacyAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                    required
                  />
                  <span>
                    I have read and consent to the updated{' '}
                    <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="font-semibold text-blue-600 dark:text-blue-400 underline">Privacy Policy</a>,
                    including the use of relevant account, usage, device and security information to detect and investigate suspected misuse.
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                    required
                  />
                  <span>
                    I agree with all the{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="font-semibold text-blue-600 dark:text-blue-400 underline">Terms &amp; Conditions</a>,
                    including the rules against abusing any free or paid facility and possible account suspension, termination or closure/deletion after notice and a reasonable opportunity to respond, as applicable.
                  </span>
                </label>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Current policy version: 2.0 · Effective 27 October 2026</p>
              </div>

              <button
                id="btn-register-submit"
                type="submit"
                disabled={isLoading}
                className="w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-xs hover:shadow transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Creating Account...</span>
                  </>
                ) : (
                  <>
                    <span>Create Student Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="pt-3 space-y-2.5">
                <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest font-semibold text-slate-400 dark:text-slate-500">
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                  <span>Or sign up with</span>
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                </div>
                <button
                  id="btn-google-signup"
                  type="button"
                  onClick={() => handleSocialLogin('google')}
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold text-xs sm:text-sm transition disabled:opacity-50 flex items-center justify-center gap-2.5"
                >
                  <svg aria-hidden="true" viewBox="0 0 48 48" className="w-4 h-4 shrink-0">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" transform="translate(0 5)"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.74 7.18l7.27 5.64c4.25-3.92 6.71-9.7 6.71-17.29Z"/>
                    <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.12.76-4.59l-7.98-6.2A23.86 23.86 0 0 0 0 24c0 3.88.93 7.56 2.56 10.79l7.97-6.2Z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.94-2.14 15.92-5.81l-7.27-5.64c-2.02 1.35-4.6 2.15-8.65 2.15-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.2C6.51 43.62 14.62 48 24 48Z"/>
                  </svg>
                  <span>{isLoading ? 'Signing up…' : 'Sign up with Google'}</span>
                </button>
                <p className="text-[10px] leading-relaxed text-center text-slate-500 dark:text-slate-400">
                  Your account will open with a profile-completion prompt. ICAI registration number is required; phone number is optional. Google signup follows the same student eligibility checks.
                </p>
              </div>

              <p className="text-[10px] text-center text-slate-500 dark:text-slate-400 pt-1">
                Your choices are recorded with the accepted document versions and timestamp. You can review either document before selecting the checkbox.
              </p>
            </form>
          </div>
        )}

        {/* Switch to Institute Portal */}
        <div className="mt-6 border-t border-white/10 pt-5 text-center text-xs text-slate-400">
          <span>Are you a CA Coaching Academy or Faculty? </span>
          <button
            id="btn-goto-institute-portal"
            type="button"
            onClick={() => {
              if (onSwitchToInstitute) {
                onSwitchToInstitute();
              } else {
                navigate('/institute/login');
              }
            }}
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-bold ml-1 hover:underline cursor-pointer"
          >
            Go to Institute Portal →
          </button>
        </div>

        {/* Terms notice */}
        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-500">
          By signing in or registering, you agree to our{' '}
          <a href="/legal" className="text-blue-600 dark:text-blue-400 hover:underline">
            Terms of Service
          </a>{' '}
          and acknowledge our strict adherence to ICAI examination guidelines.
        </p>
        </div>
      </div>
    </div>
  );
};
