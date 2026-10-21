import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Lock, ShieldCheck, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

const isSuperAdmin = (role: unknown) => {
  const normalized = String(role || '').trim().toUpperCase().replace(/\\s+/g, '_');
  return normalized === 'SUPER_ADMIN' || normalized === 'ADMIN';
};

/**
 * Unlinked sign-in entry for the back-office. Do not add this route to public
 * navigation, marketing pages, sitemaps, or account-type selection.
 * Authorization is still enforced by the server and this is not a security
 * boundary by URL secrecy alone.
 */
export const PrivateAdminAccessPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'Secure access';
    let meta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const createdMeta = !meta;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    const previousRobots = meta.content;
    meta.content = 'noindex, nofollow, noarchive';
    return () => {
      document.title = originalTitle;
      if (meta) {
        if (createdMeta) meta.remove();
        else meta.content = previousRobots;
      }
    };
  }, []);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    if (isSuperAdmin(user.role)) navigate('/admin/dashboard', { replace: true });
    else navigate('/', { replace: true });
  }, [isAuthenticated, isLoading, user, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const authenticatedUser = await login(email.trim().toLowerCase(), password, 'SUPER_ADMIN');
      if (!isSuperAdmin(authenticatedUser?.role)) {
        await logout();
        setError('Invalid credentials or access denied.');
        return;
      }
      navigate('/admin/dashboard', { replace: true });
    } catch {
      // Keep the same message for invalid credentials and portal-scope failures.
      setError('Invalid credentials or access denied.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center" role="status" aria-label="Loading secure access"><div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" /></div>;
  }

  if (isAuthenticated && user && !isSuperAdmin(user.role)) return null;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 flex items-center justify-center">
      <section className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-extrabold tracking-tight">Secure access</p>
            <p className="mt-0.5 text-xs text-slate-400">Authorized accounts only</p>
          </div>
        </div>

        <div className="mb-5">
          <h1 className="text-xl font-black tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm leading-5 text-slate-400">Use your authorized account credentials to continue.</p>
        </div>

        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-xs leading-5 text-rose-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-300">Email</span>
            <input
              autoComplete="username"
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
              placeholder="Email address"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-300">Password</span>
            <span className="flex overflow-hidden rounded-xl border border-slate-700 bg-slate-950 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/30">
              <input
                autoComplete="current-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-white outline-none"
                placeholder="Password"
              />
              <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="px-3 text-slate-400 hover:text-white">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>

          <button type="submit" disabled={submitting || !email.trim() || !password} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
            <KeyRound className="h-4 w-4" /> {submitting ? 'Verifying…' : 'Continue'}
          </button>
        </form>

        <p className="mt-5 flex items-start gap-2 border-t border-slate-800 pt-4 text-[11px] leading-5 text-slate-500">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Access is verified server-side. Multi-factor verification may be required.
        </p>
      </section>
    </main>
  );
};
