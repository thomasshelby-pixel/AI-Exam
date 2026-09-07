import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { BrandLogo } from '../../components/common/BrandLogo';
import { FileCheck2, Lock, Mail, User, Phone, BookOpen, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';

interface LoginPageProps {
  initialMode?: 'login' | 'register';
  onSuccess: (user: any) => void;
  onNavigateHome: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ initialMode = 'login', onSuccess, onNavigateHome }) => {
  const { login, register, demoLogin } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [icaiRegNo, setIcaiRegNo] = useState('');
  const [caLevel, setCaLevel] = useState<'FOUNDATION' | 'INTERMEDIATE' | 'FINAL'>('INTERMEDIATE');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [forgotPasswordMsg, setForgotPasswordMsg] = useState('');

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      const loggedInUser = await login(email, password);
      onSuccess(loggedInUser);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid credentials or login failure';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

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

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8 bg-[#f1f5f9] text-slate-800">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-7 shadow-sm relative">
        {/* Header with Official Brand Logo */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <BrandLogo variant="full" size="sm" onClick={onNavigateHome} />
          </div>
          <h2 className="text-lg font-black tracking-tight text-slate-900 mt-2">
            {mode === 'login' ? 'Sign in to Your Account' : 'Create Student Account'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {mode === 'login'
              ? 'Access your CA answer sheet evaluations and step-marking reports'
              : 'Sign up today and get your first 2 answer sheets evaluated free'}
          </p>
        </div>

        {/* Free Tier Callout on Register */}
        {mode === 'register' && (
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
                <label className="text-xs font-semibold text-slate-700">Password</label>
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
              id="login-submit-btn"
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm transition shadow-sm flex items-center justify-center gap-1.5 mt-2 cursor-pointer"
            >
              {isLoading ? (
                <span>Verifying credentials...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* 1-Click Fast Access for Evaluators / Testers */}
            <div className="pt-2 border-t border-slate-100">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-center mb-2">
                1-Click Quick Access
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  id="btn-demo-student"
                  onClick={async () => {
                    try {
                      setIsLoading(true);
                      setErrorMessage('');
                      const loggedIn = await demoLogin('STUDENT');
                      onSuccess(loggedIn);
                    } catch (err: unknown) {
                      setErrorMessage(err instanceof Error ? err.message : 'Demo login failed');
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-800 text-[11px] font-bold text-center transition cursor-pointer"
                >
                  🎓 Demo Student
                </button>
                <button
                  type="button"
                  id="btn-demo-user"
                  onClick={async () => {
                    try {
                      setIsLoading(true);
                      setErrorMessage('');
                      const loggedIn = await demoLogin('CURRENT_USER');
                      onSuccess(loggedIn);
                    } catch (err: unknown) {
                      setErrorMessage(err instanceof Error ? err.message : 'Login failed');
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold text-center transition cursor-pointer"
                >
                  ⚡ Active Account
                </button>
                <button
                  type="button"
                  id="btn-demo-admin"
                  onClick={async () => {
                    try {
                      setIsLoading(true);
                      setErrorMessage('');
                      const loggedIn = await demoLogin('SUPER_ADMIN');
                      onSuccess(loggedIn);
                    } catch (err: unknown) {
                      setErrorMessage(err instanceof Error ? err.message : 'Admin login failed');
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-purple-200 bg-purple-50/70 hover:bg-purple-100 text-purple-800 text-[11px] font-bold text-center transition cursor-pointer"
                >
                  🛡️ Super Admin
                </button>
                <button
                  type="button"
                  id="btn-demo-institute"
                  onClick={async () => {
                    try {
                      setIsLoading(true);
                      setErrorMessage('');
                      const loggedIn = await demoLogin('INSTITUTE');
                      onSuccess(loggedIn);
                    } catch (err: unknown) {
                      setErrorMessage(err instanceof Error ? err.message : 'Institute login failed');
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50/70 hover:bg-amber-100 text-amber-800 text-[11px] font-bold text-center transition cursor-pointer"
                >
                  🏛️ Institute Admin
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Registration Form */}
        {mode === 'register' && (
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

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone (Optional)</label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    id="register-phone"
                    type="tel"
                    placeholder="+91 98765..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-8 pr-2 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    id="register-password"
                    type="password"
                    required
                    placeholder="Min. 8 chars"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-8 pr-2 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
              </div>
            </div>

            <button
              id="register-submit-btn"
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm transition shadow-sm flex items-center justify-center gap-1.5 mt-3 cursor-pointer"
            >
              {isLoading ? (
                <span>Creating your account...</span>
              ) : (
                <>
                  <span>Claim 2 Free Evaluations & Register</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="mt-5 pt-4 border-t border-slate-200 text-center">
          <p className="text-[11px] text-slate-500">
            Secure 256-bit authentication. By continuing, you agree to our Terms of Service & Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
};
