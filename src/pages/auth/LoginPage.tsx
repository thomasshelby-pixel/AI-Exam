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
  MailCheck,
  ArrowLeft,
  RotateCw,
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
  const { login, socialLogin, register, initiateRegister, verifyRegisterOtp, resendRegisterOtp, suspendedAccount, clearSuspension } = useAuth();
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

  // OTP Verification states for new student registrations
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [otpSuccessMessage, setOtpSuccessMessage] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [forgotPasswordMsg, setForgotPasswordMsg] = useState('');

  // Countdown timer effect for OTP resend cooldown
  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    setErrorMessage('');
    setIsLoading(true);
    try {
      const loggedInUser = await socialLogin(provider);
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
      });

      if (data.requiresOtpVerification) {
        setIsVerifyingOtp(true);
        setPendingEmail(data.email || email.trim().toLowerCase());
        setMaskedEmail(data.emailMasked || email.trim().toLowerCase());
        setResendCooldown(data.cooldownSeconds || 60);
        setOtpSuccessMessage(data.message || `A 6-digit verification code has been dispatched to ${data.emailMasked || email}.`);
        setOtpCode('');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle OTP verification submission
  const handleOtpVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanOtp = otpCode.trim();
    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setErrorMessage('Please enter a valid 6-digit verification code.');
      return;
    }

    setIsLoading(true);

    try {
      const activatedUser = await verifyRegisterOtp(pendingEmail || email.trim().toLowerCase(), cleanOtp);
      onSuccess(activatedUser);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification failed. Please try again.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle resend OTP request
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isLoading) return;
    setErrorMessage('');
    setIsLoading(true);

    try {
      const data = await resendRegisterOtp(pendingEmail || email.trim().toLowerCase());
      setResendCooldown(data.cooldownSeconds || 60);
      setOtpSuccessMessage(data.message || 'A fresh 6-digit verification code has been dispatched to your email.');
      setOtpCode('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resend code. Please try again.';
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
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-7 shadow-sm relative">
        {/* Header with Brand Logo */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <BrandLogo variant="full" size="sm" onClick={onNavigateHome} />
          </div>
          <div className="flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 text-xs font-semibold mx-auto w-fit mb-2">
            <GraduationCap className="w-3.5 h-3.5" />
            <span>CA Student Portal</span>
          </div>
          <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white mt-1">
            {mode === 'login' ? 'Sign in to Your Account' : 'Create Your Account'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {mode === 'login'
              ? 'Access your CA answer sheet evaluations and step-marking reports'
              : 'Sign up today and get your first 2 answer sheets evaluated free'}
          </p>
        </div>

        {/* Free Tier Callout on Register */}
        {mode === 'register' && (
          <div className="mb-5 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 flex items-center gap-3">
            <div className="w-7 h-7 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">
              FREE
            </div>
            <div className="text-xs">
              <p className="font-bold text-blue-900 dark:text-blue-300">2 Free Answer Sheet Checks</p>
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

        {/* Mode Switch Tabs (hidden during OTP verification) */}
        {!isVerifyingOtp && (
          <div className="flex p-1 rounded-lg bg-slate-100 dark:bg-slate-800 mb-5 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMessage('');
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded transition ${
                mode === 'login'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMessage('');
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded transition ${
                mode === 'register'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Email OTP Verification Screen */}
        {isVerifyingOtp && (
          <div id="email-otp-verification-section" className="space-y-4">
            <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <MailCheck className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Verify Your Email Address</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                We sent a 6-digit verification code to
              </p>
              <p className="text-xs font-mono font-bold text-blue-700 dark:text-blue-300 mt-0.5">
                {maskedEmail || email}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                Code expires in <strong>10 minutes</strong>. Single-use only.
              </p>
            </div>

            {otpSuccessMessage && (
              <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{otpSuccessMessage}</span>
              </div>
            )}

            <form onSubmit={handleOtpVerifySubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 text-center">
                  Enter 6-Digit Verification Code
                </label>
                <div className="relative">
                  <input
                    id="input-verification-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    required
                    autoFocus
                    placeholder="123456"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full py-2.5 px-3 rounded-lg bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 text-center text-xl font-mono font-bold tracking-widest text-slate-900 dark:text-white focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 dark:focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                id="btn-verify-otp-submit"
                type="submit"
                disabled={isLoading || otpCode.trim().length !== 6}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-xs hover:shadow transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <>
                    <span>Verify & Activate Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between pt-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setIsVerifyingOtp(false);
                    setErrorMessage('');
                    setOtpSuccessMessage('');
                  }}
                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Edit Details</span>
                </button>

                <button
                  id="btn-resend-otp"
                  type="button"
                  disabled={resendCooldown > 0 || isLoading}
                  onClick={handleResendOtp}
                  className={`font-semibold flex items-center gap-1.5 transition ${
                    resendCooldown > 0 || isLoading
                      ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed'
                      : 'text-blue-600 dark:text-blue-400 hover:underline cursor-pointer'
                  }`}
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  {resendCooldown > 0 ? (
                    <span>Resend in {resendCooldown}s</span>
                  ) : (
                    <span>Resend Code</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Login Form */}
        {!isVerifyingOtp && mode === 'login' && (
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
        {!isVerifyingOtp && mode === 'register' && (
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

              <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 pt-1">
                By creating an account, you agree to our{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                  Privacy Policy
                </a>
                .
              </p>
            </form>
          </div>
        )}

        {/* Switch to Institute Portal */}
        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
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
        <p className="text-[10px] text-slate-400 dark:text-slate-400 text-center mt-6 leading-relaxed">
          By signing in or registering, you agree to our{' '}
          <a href="/legal" className="text-blue-600 dark:text-blue-400 hover:underline">
            Terms of Service
          </a>{' '}
          and acknowledge our strict adherence to ICAI examination guidelines.
        </p>
      </div>
    </div>
  );
};
