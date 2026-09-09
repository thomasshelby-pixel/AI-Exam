import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { BrandLogo } from '../../components/common/BrandLogo';
import { SuspendedAccountView } from '../../components/auth/SuspendedAccountView.js';
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
  Building2,
  GraduationCap,
  Tag,
} from 'lucide-react';

interface LoginPageProps {
  initialMode?: 'login' | 'register';
  onSuccess: (user: any) => void;
  onNavigateHome: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ initialMode = 'login', onSuccess, onNavigateHome }) => {
  const navigate = useNavigate();
  const { login, register, suspendedAccount, clearSuspension } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [accountType, setAccountType] = useState<'STUDENT' | 'INSTITUTE'>('STUDENT');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [icaiRegNo, setIcaiRegNo] = useState('');
  const [caLevel, setCaLevel] = useState<'FOUNDATION' | 'INTERMEDIATE' | 'FINAL'>('INTERMEDIATE');
  const [referralCode, setReferralCode] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [forgotPasswordMsg, setForgotPasswordMsg] = useState('');

  // Handle standard student/user email-password login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      const loggedInUser = await login(email, password);
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

  // Handle registration
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (accountType === 'INSTITUTE') {
      navigate('/institute/register');
      return;
    }

    if (!icaiRegNo.trim()) {
      setErrorMessage('Please provide your ICAI Registration Number (e.g. CRO1234567, NRO, WRO, SRO, ERO).');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    setIsLoading(true);

    try {
      const newUser = await register({
        email,
        password,
        fullName,
        phone: phone || undefined,
        icaiRegistrationNumber: icaiRegNo.trim().toUpperCase(),
        caLevel,
        referralCode: referralCode.trim() || undefined,
      });
      onSuccess(newUser);
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
      setForgotPasswordMsg(data.message || 'Password reset link sent to your registered email.');
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
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8 bg-[#f1f5f9] text-slate-800">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-7 shadow-sm relative">
        {/* Header with Brand Logo */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <BrandLogo variant="full" size="sm" onClick={onNavigateHome} />
          </div>
          <h2 className="text-lg font-black tracking-tight text-slate-900 mt-2">
            {mode === 'login' ? 'Sign in to Your Account' : 'Create Your Account'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {mode === 'login'
              ? 'Access your CA answer sheet evaluations and step-marking reports'
              : 'Sign up today and get your first 2 answer sheets evaluated free'}
          </p>
        </div>

        {/* Account Type Selection during registration */}
        {mode === 'register' && (
          <div className="mb-5">
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Are you registering as:
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setAccountType('STUDENT')}
                className={`p-3 rounded-lg border text-left transition flex flex-col items-start gap-1 cursor-pointer ${
                  accountType === 'STUDENT'
                    ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600 text-blue-900'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <GraduationCap className="w-4 h-4 text-blue-600" />
                  <span>CA Student</span>
                </div>
                <span className="text-[10px] text-slate-500">Individual exam aspirant</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAccountType('INSTITUTE');
                  navigate('/institute/register');
                }}
                className={`p-3 rounded-lg border text-left transition flex flex-col items-start gap-1 cursor-pointer ${
                  accountType === 'INSTITUTE'
                    ? 'border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600 text-indigo-900'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <span>Coaching Institute</span>
                </div>
                <span className="text-[10px] text-slate-500">Academy / Educator batch</span>
              </button>
            </div>
          </div>
        )}

        {/* Free Tier Callout on Register (Student) */}
        {mode === 'register' && accountType === 'STUDENT' && (
          <div className="mb-5 p-3 rounded-lg bg-blue-50 border border-blue-200 flex items-center gap-3">
            <div className="w-7 h-7 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">
              FREE
            </div>
            <div className="text-xs">
              <p className="font-bold text-blue-900">2 Free Answer Sheet Checks</p>
              <p className="text-slate-600">Full paper evaluation with ICAI step marking & working notes check.</p>
            </div>
          </div>
        )}

        {/* Feedback alerts */}
        {errorMessage && (
          <div className="mb-4 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {forgotPasswordMsg && (
          <div className="mb-4 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{forgotPasswordMsg}</span>
          </div>
        )}

        {/* Mode Switch Tabs */}
        <div className="flex p-1 rounded-lg bg-slate-100 mb-5 border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMessage('');
            }}
            className={`flex-1 py-1.5 text-xs font-bold rounded transition ${
              mode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
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
              mode === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Login Form */}
        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="login-email"
                  type="email"
                  required
                  placeholder="student@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">Password</label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-[11px] text-blue-600 hover:underline font-medium"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="login-password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
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
          </form>
        )}

        {/* Student Registration Form */}
        {mode === 'register' && accountType === 'STUDENT' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="register-fullname"
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="register-email"
                  type="email"
                  required
                  placeholder="student@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ICAI Reg. Number</label>
                <input
                  id="register-icai-no"
                  type="text"
                  required
                  placeholder="CRO1234567"
                  value={icaiRegNo}
                  onChange={(e) => setIcaiRegNo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-900 uppercase focus:outline-none focus:bg-white focus:border-blue-600 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">CA Level</label>
                <div className="relative">
                  <select
                    id="register-ca-level"
                    value={caLevel}
                    onChange={(e) => setCaLevel(e.target.value as 'FOUNDATION' | 'INTERMEDIATE' | 'FINAL')}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  >
                    <option value="FOUNDATION">CA Foundation</option>
                    <option value="INTERMEDIATE">CA Intermediate</option>
                    <option value="FINAL">CA Final</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number (Optional)</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="register-phone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="register-password"
                  type="password"
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
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
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-900 uppercase font-mono placeholder:normal-case focus:outline-none focus:bg-white focus:border-blue-600"
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
          </form>
        )}

        {/* Coaching Institute Portal Gateway Link */}
        <div className="mt-6 pt-4 border-t border-slate-100">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">Coaching Institute Portal</p>
                <p className="text-[11px] text-slate-500">Dedicated portal for CA academies</p>
              </div>
            </div>
            <button
              type="button"
              id="btn-switch-institute-portal"
              onClick={() => navigate('/institute/login')}
              className="px-2.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition shrink-0 cursor-pointer"
            >
              Portal Login →
            </button>
          </div>
        </div>

        {/* Terms notice */}
        <p className="text-[10px] text-slate-400 text-center mt-4 leading-relaxed">
          By signing in or registering, you agree to our{' '}
          <a href="/legal" className="text-blue-600 hover:underline">
            Terms of Service
          </a>{' '}
          and acknowledge our strict adherence to ICAI examination guidelines.
        </p>
      </div>
    </div>
  );
};
