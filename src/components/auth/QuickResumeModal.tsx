import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, ArrowRight, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

interface QuickResumeModalProps {
  isOpen: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const QuickResumeModal: React.FC<QuickResumeModalProps> = ({
  isOpen,
  onSuccess,
  onCancel,
}) => {
  const {
    lockedUser,
    resumeSessionWithPassword,
    resumeSessionWithGoogle,
    switchAccountOrLogout,
  } = useAuth();

  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !lockedUser) return null;

  const isGoogleUser = lockedUser.authProvider === 'google';

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter your password to resume.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await resumeSessionWithPassword(password);
      setPassword('');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Incorrect password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleResume = async () => {
    setLoading(true);
    setError(null);
    try {
      await resumeSessionWithGoogle();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Google re-authentication failed. Please try again or switch account.');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchAccount = async () => {
    if (onCancel) onCancel();
    await switchAccountOrLogout();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 animate-in zoom-in-95 duration-150">
        {/* Header Icon */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-blue-50 dark:bg-blue-950/60 rounded-2xl flex items-center justify-center mx-auto text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 shadow-sm">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Quick Resume
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Your examination session was locked due to 30 minutes of inactivity.
            <br />
            <strong className="text-slate-800 dark:text-slate-200">Your unsaved work and application state are preserved.</strong>
          </p>
        </div>

        {/* User Badge */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
            {(lockedUser.fullName || lockedUser.email || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {lockedUser.fullName || 'CA Student / Administrator'}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {lockedUser.email}
            </div>
          </div>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
            {lockedUser.role?.replace('_', ' ') || 'ACTIVE'}
          </span>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        {isGoogleUser ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-400 text-center">
              Re-authenticate with Google Single Sign-On to resume instantly:
            </p>
            <button
              type="button"
              onClick={handleGoogleResume}
              disabled={loading}
              className="w-full py-2.5 px-4 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-100 font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              {loading ? 'Re-authenticating...' : 'Resume with Google'}
            </button>
          </div>
        ) : (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Account Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password to unlock"
                  autoFocus
                  required
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <span>Resume Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Also allow Google if account might be SSO linked */}
            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
              <span className="flex-shrink mx-2 text-[11px] text-slate-400 uppercase font-medium">Or</span>
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleResume}
              disabled={loading}
              className="w-full py-2 px-3 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>Resume using Google Sign-In</span>
            </button>
          </form>
        )}

        {/* Footer: Switch account */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            State protected
          </span>
          <button
            type="button"
            onClick={handleSwitchAccount}
            className="text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 font-medium flex items-center gap-1 cursor-pointer transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Switch account / Log out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
