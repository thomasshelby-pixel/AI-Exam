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


interface PhoneOtpConfig {
  phoneOtpEnabled: boolean;
  phoneOtpSetupIncomplete: boolean;
  widgetId?: string;
  widgetToken?: string;
}

declare global {
  interface Window {
    initSendOTP?: (configuration: Record<string, unknown>) => void;
    sendOtp?: (identifier: string, success?: (data: unknown) => void, failure?: (error: unknown) => void) => void;
    verifyOtp?: (otp: string, success?: (data: unknown) => void, failure?: (error: unknown) => void, requestId?: string) => void;
    retryOtp?: (channel: string | null, success?: (data: unknown) => void, failure?: (error: unknown) => void, requestId?: string) => void;
  }
}

let msg91SdkLoadPromise: Promise<void> | null = null;

function loadMsg91Sdk(): Promise<void> {
  if (typeof window.initSendOTP === 'function') return Promise.resolve();
  if (msg91SdkLoadPromise) return msg91SdkLoadPromise;
  msg91SdkLoadPromise = new Promise<void>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>('script[data-msg91-otp-sdk="true"]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://verify.msg91.com/otp-provider.js';
      script.async = true;
      script.dataset.msg91OtpSdk = 'true';
    }
    script.addEventListener('load', () => {
      if (typeof window.initSendOTP === 'function') resolve();
      else reject(new Error('MSG91 OTP SDK unavailable.'));
    }, { once: true });
    script.addEventListener('error', () => reject(new Error('MSG91 OTP SDK failed to load.')), { once: true });
    if (!script.isConnected) document.head.appendChild(script);
  }).catch((error) => {
    msg91SdkLoadPromise = null;
    throw error;
  });
  return msg91SdkLoadPromise;
}

function getMsg91Identifier(rawPhone: string): string | null {
  let digits = String(rawPhone || '').replace(/\D/g, '');
  if (digits.length === 10) digits = '91' + digits;
  return digits.length === 12 && digits.startsWith('91') ? digits : null;
}

function extractMsg91RequestId(value: unknown, depth = 0): string | null {
  if (depth > 5 || !value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractMsg91RequestId(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const obj = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(obj)) {
    if (/^(reqid|req_id|requestid|request_id|request-id)$/i.test(key) && (typeof item === 'string' || typeof item === 'number')) return String(item);
    // MSG91's Web SDK commonly returns the send/retry request ID in `message`.
    if (key.toLowerCase() === 'message' && typeof item === 'string' && /^[A-Za-z0-9]{8,}$/.test(item.trim())) return item.trim();
  }
  for (const item of Object.values(obj)) {
    const found = extractMsg91RequestId(item, depth + 1);
    if (found) return found;
  }
  return null;
}

function extractMsg91AccessToken(value: unknown, depth = 0): string | null {
  if (depth > 6 || value == null) return null;
  const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  if (typeof value === 'string') return jwtPattern.test(value.trim()) ? value.trim() : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractMsg91AccessToken(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  for (const key of ['accessToken', 'access_token', 'access-token', 'jwt', 'token', 'message', 'data']) {
    if (key in obj) {
      const found = extractMsg91AccessToken(obj[key], depth + 1);
      if (found) return found;
    }
  }
  for (const item of Object.values(obj)) {
    const found = extractMsg91AccessToken(item, depth + 1);
    if (found) return found;
  }
  return null;
}

function getMsg91ErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['message', 'error', 'reason', 'description']) {
      if (typeof obj[key] === 'string' && (obj[key] as string).trim()) return (obj[key] as string).trim();
    }
  }
  return fallback;
}

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
  const { login, register, initiateRegister, verifyRegisterOtp, verifyRegisterPhoneOtp, resendRegisterOtp, suspendedAccount, clearSuspension } = useAuth();
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
  const [phoneOtpConfig, setPhoneOtpConfig] = useState<PhoneOtpConfig | null>(null);
  const [phoneOtpConfigStatus, setPhoneOtpConfigStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [phoneOtpMode, setPhoneOtpMode] = useState(false);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtpRequestId, setPhoneOtpRequestId] = useState<string | null>(null);
  const [msg91SdkReady, setMsg91SdkReady] = useState(false);

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

  // Read the public widget configuration from the server; never expose the server Authkey.
  React.useEffect(() => {
    let active = true;
    fetch('/api/auth/registration-otp-config', { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('OTP configuration request failed.');
        return await response.json() as Partial<PhoneOtpConfig>;
      })
      .then((data) => {
        if (!active) return;
        setPhoneOtpConfigStatus('ready');
        const configured = data.phoneOtpEnabled === true &&
          typeof data.widgetId === 'string' && Boolean(data.widgetId.trim()) &&
          typeof data.widgetToken === 'string' && Boolean(data.widgetToken.trim());
        setPhoneOtpConfig({
          phoneOtpEnabled: configured,
          phoneOtpSetupIncomplete: data.phoneOtpSetupIncomplete === true,
          widgetId: configured ? data.widgetId : undefined,
          widgetToken: configured ? data.widgetToken : undefined,
        });
      })
      .catch(() => {
        if (active) {
          setPhoneOtpConfigStatus('error');
          setPhoneOtpConfig({ phoneOtpEnabled: false, phoneOtpSetupIncomplete: false });
        }
      });
    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    if (!isVerifyingOtp || !phoneOtpMode || !phoneOtpConfig?.phoneOtpEnabled ||
        !phoneOtpConfig.widgetId || !phoneOtpConfig.widgetToken) {
      setMsg91SdkReady(false);
      return;
    }
    let cancelled = false;
    const identifier = getMsg91Identifier(phone);
    if (!identifier) {
      setErrorMessage('Enter a valid 10-digit Indian mobile number before requesting an OTP.');
      return;
    }
    loadMsg91Sdk().then(() => {
      if (cancelled) return;
      if (typeof window.initSendOTP !== 'function') throw new Error('MSG91 OTP SDK unavailable.');
      window.initSendOTP!({
        widgetId: phoneOtpConfig.widgetId,
        tokenAuth: phoneOtpConfig.widgetToken,
        identifier,
        exposeMethods: true,
        captchaRenderId: 'msg91-captcha',
        success: () => {},
        failure: (error: unknown) => {
          if (!cancelled) setErrorMessage(getMsg91ErrorMessage(error, 'Mobile verification failed. Please try again.'));
        },
      });
      setMsg91SdkReady(true);
    }).catch(() => {
      if (!cancelled) {
        setMsg91SdkReady(false);
        setErrorMessage('Could not load mobile verification. Please refresh and try again.');
      }
    });
    return () => { cancelled = true; };
  }, [isVerifyingOtp, phoneOtpMode, phoneOtpConfig, phone]);

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
    if (phoneOtpConfigStatus === 'loading') {
      setErrorMessage('Please wait while secure registration settings are loaded.');
      return;
    }
    if (phoneOtpConfigStatus === 'error') {
      setErrorMessage('Could not confirm registration settings. Refresh the page before trying again.');
      return;
    }
    if (phoneOtpConfig?.phoneOtpSetupIncomplete) {
      setErrorMessage('Mobile verification is not configured yet. Please try again later.');
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
      });

      if (data.requiresPhoneOtpVerification) {
        if (!phoneOtpConfig?.phoneOtpEnabled || !phoneOtpConfig.widgetId || !phoneOtpConfig.widgetToken) {
          setErrorMessage('Mobile OTP is enabled on the server, but widget settings did not load. Refresh the page and try again; no student account has been created.');
          return;
        }
        setIsVerifyingOtp(true);
        setPhoneOtpMode(true);
        setPhoneOtpSent(false);
        setPhoneOtpRequestId(null);
        setPendingEmail(data.email || email.trim().toLowerCase());
        setMaskedEmail(data.phoneMasked || phone);
        setResendCooldown(0);
        setOtpSuccessMessage(data.message || 'Your mobile number is ready for verification. Request an OTP to continue.');
        setOtpCode('');
      } else if (data.requiresOtpVerification) {
        setIsVerifyingOtp(true);
        setPhoneOtpMode(false);
        setPhoneOtpSent(false);
        setPhoneOtpRequestId(null);
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

  // Handle OTP verification for mobile (MSG91) or email signup.
  const handleOtpVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const cleanOtp = otpCode.trim();
    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setErrorMessage('Please enter a valid 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    if (phoneOtpMode) {
      if (!phoneOtpRequestId) {
        setIsLoading(false);
        setErrorMessage('The OTP request reference is missing. Please edit the details and request a new OTP.');
        return;
      }
      if (typeof window.verifyOtp !== 'function') {
        setIsLoading(false);
        setErrorMessage('Mobile verification is not ready. Refresh the page and request a new OTP.');
        return;
      }
      try {
        window.verifyOtp(cleanOtp, (verificationData: unknown) => {
          const accessToken = extractMsg91AccessToken(verificationData);
          if (!accessToken) {
            setIsLoading(false);
            setErrorMessage('MSG91 did not return a verification token. Please request a new OTP and try again.');
            return;
          }
          void verifyRegisterPhoneOtp(pendingEmail || email.trim().toLowerCase(), accessToken)
            .then((activatedUser) => onSuccess(activatedUser))
            .catch((err: unknown) => setErrorMessage(err instanceof Error ? err.message : 'Mobile verification failed. Please try again.'))
            .finally(() => setIsLoading(false));
        }, (error: unknown) => {
          setIsLoading(false);
          setErrorMessage(getMsg91ErrorMessage(error, 'Incorrect or expired OTP. Please try again.'));
        }, phoneOtpRequestId || undefined);
      } catch (error: unknown) {
        setIsLoading(false);
        setErrorMessage(getMsg91ErrorMessage(error, 'Mobile verification failed. Please try again.'));
      }
      return;
    }

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

  // Resend via MSG91 widget or the existing email OTP endpoint.
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isLoading) return;
    setErrorMessage('');
    setIsLoading(true);

    if (phoneOtpMode) {
      if (typeof window.retryOtp !== 'function') {
        setIsLoading(false);
        setErrorMessage('Mobile resend is not ready. Please refresh the page and try again.');
        return;
      }
      try {
        window.retryOtp(null, (data: unknown) => {
          const newRequestId = extractMsg91RequestId(data);
          if (newRequestId) setPhoneOtpRequestId(newRequestId);
          setResendCooldown(60);
          setOtpSuccessMessage('A new verification code has been requested for your mobile number.');
          setOtpCode('');
          setIsLoading(false);
        }, (error: unknown) => {
          setErrorMessage(getMsg91ErrorMessage(error, 'Could not resend the mobile OTP. Please try again.'));
          setIsLoading(false);
        }, phoneOtpRequestId || undefined);
      } catch (error: unknown) {
        setErrorMessage(getMsg91ErrorMessage(error, 'Could not resend the mobile OTP. Please try again.'));
        setIsLoading(false);
      }
      return;
    }

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

  const handleSendPhoneOtp = () => {
    setErrorMessage('');
    if (isLoading) return;
    const identifier = getMsg91Identifier(phone);
    if (!identifier) {
      setErrorMessage('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (!msg91SdkReady || typeof window.sendOtp !== 'function') {
      setErrorMessage('Mobile verification is still loading. Please wait a moment and try again.');
      return;
    }

    setIsLoading(true);
    try {
      window.sendOtp(identifier, (data: unknown) => {
        const requestId = extractMsg91RequestId(data);
        if (!requestId) {
          setPhoneOtpSent(false);
          setIsLoading(false);
          setErrorMessage('MSG91 did not return the OTP request ID required for verification. Please try sending the OTP again.');
          return;
        }
        setPhoneOtpRequestId(requestId);
        setPhoneOtpSent(true);
        setOtpCode('');
        setResendCooldown(60);
        setOtpSuccessMessage('OTP sent. Enter the 6-digit code received on your mobile.');
        setIsLoading(false);
      }, (error: unknown) => {
        setIsLoading(false);
        setErrorMessage(getMsg91ErrorMessage(error, 'Could not send SMS OTP. Please check your number and try again.'));
      });
    } catch (error: unknown) {
      setIsLoading(false);
      setErrorMessage(getMsg91ErrorMessage(error, 'Could not send SMS OTP. Please try again.'));
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
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{phoneOtpMode ? 'Verify Your Mobile Number' : 'Verify Your Email Address'}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                {phoneOtpMode ? (phoneOtpSent ? 'We sent a 6-digit verification code to' : 'Send a verification code to') : 'We sent a 6-digit verification code to'}
              </p>
              <p className="text-xs font-mono font-bold text-blue-700 dark:text-blue-300 mt-0.5">
                {maskedEmail || email}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                Code expires in <strong>{phoneOtpMode ? '15 minutes' : '10 minutes'}</strong>. Single-use only.
              </p>
            </div>

            {otpSuccessMessage && (
              <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{otpSuccessMessage}</span>
              </div>
            )}

            {phoneOtpMode && <div id="msg91-captcha" className="flex justify-center min-h-2" />}

            {phoneOtpMode && !phoneOtpSent && (
              <div className="space-y-3">
                <button
                  id="btn-send-mobile-otp"
                  type="button"
                  onClick={handleSendPhoneOtp}
                  disabled={isLoading || !msg91SdkReady}
                  className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-xs transition disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? 'Sending OTP...' : !msg91SdkReady ? 'Loading secure verification...' : 'Send OTP to Mobile'}
                </button>
              </div>
            )}

            {(!phoneOtpMode || phoneOtpSent) && (
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
            )}
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

              {/* Notice for previous Google sign-in users */}
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-[11px] text-slate-500 dark:text-slate-400">
                <span>Signed up previously using Google? Click </span>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="font-semibold text-blue-600 dark:text-blue-400 hover:underline inline"
                >
                  Forgot password?
                </button>
                <span> to set an account password and sign in directly.</span>
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
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Phone Number {phoneOtpConfig?.phoneOtpEnabled || phoneOtpConfig?.phoneOtpSetupIncomplete ? '(Required for verification)' : '(Optional)'}</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    id="register-phone"
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required={Boolean(phoneOtpConfig?.phoneOtpEnabled || phoneOtpConfig?.phoneOtpSetupIncomplete)}
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
                disabled={isLoading || phoneOtpConfigStatus !== 'ready'}
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
