import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Lock,
  Mail,
  KeyRound,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Smartphone,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import { McqArenaLogo } from '../../components/common/McqArenaLogo.js';
import { useAuth } from '../../context/AuthContext.js';
import { apiRequest } from '../../api/client.js';

export interface ServerTotpSetupData {
  secretKey: string;
  formattedKey: string;
  otpauthUri: string;
  qrDataUrl: string;
  account: string;
  accountEmail: string;
}

export const McqAdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [email, setEmail] = useState<string>('priyatca15@gmail.com');
  const [password, setPassword] = useState<string>('');
  const [totpCode, setTotpCode] = useState<string>('');
  
  // Authoritative Flow states: 'PASSWORD' | 'ENROLL' | 'CHALLENGE'
  const [authStep, setAuthStep] = useState<'PASSWORD' | 'ENROLL' | 'CHALLENGE'>('PASSWORD');
  const [mfaSessionToken, setMfaSessionToken] = useState<string>('');
  const [totpSetup, setTotpSetup] = useState<ServerTotpSetupData | null>(null);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [trustDevice, setTrustDevice] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // If already logged in as MCQ_ADMIN or SUPER_ADMIN, automatically redirect
  useEffect(() => {
    if (user) {
      const roleUpper = (user.role || '').toUpperCase();
      if (roleUpper === 'MCQ_ADMIN' || roleUpper === 'SUPER_ADMIN') {
        navigate('/mcq-admin');
      }
    }
  }, [user, navigate]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      // 1. Attempt login with device trust tokens if available in storage
      const storedTrustToken = localStorage.getItem('ca_trust_token') || localStorage.getItem('ca_device_trust_token') || undefined;
      const res = await apiRequest<any>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          trustToken: storedTrustToken,
        }),
      });

      // 2. Authoritative MFA State Check from Backend (Never rely on frontend/localStorage)
      if (res.mfaRequired) {
        setMfaSessionToken(res.mfaSessionToken || '');

        const isEnrollmentRequired =
          res.mfaState === 'MFA_NOT_ENROLLED' ||
          res.mfaState === 'MFA_RESET_REQUIRED' ||
          res.mfaEnrolled === false;

        if (isEnrollmentRequired) {
          // Use persistent server-generated TOTP setup
          if (res.totpSetup && res.totpSetup.qrDataUrl) {
            setTotpSetup(res.totpSetup);
          } else {
            // Retrieve persistent setup from backend without regenerating secret
            const setupRes = await apiRequest<{ success: boolean; totpSetup: ServerTotpSetupData }>(
              `/api/auth/mfa/setup?mfaSessionToken=${encodeURIComponent(res.mfaSessionToken || '')}`
            );
            if (setupRes?.totpSetup) {
              setTotpSetup(setupRes.totpSetup);
            } else {
              throw new Error('Failed to generate MFA QR setup.');
            }
          }
          setTotpCode('');
          setAuthStep('ENROLL');
        } else {
          // Normal Verification Challenge: Strictly NO QR code shown
          setTotpSetup(null);
          setTotpCode('');
          setAuthStep('CHALLENGE');
        }
        setLoading(false);
        return;
      }

      // 3. Otherwise login succeeded directly (device trusted for 365 days)
      if (res.token && res.user) {
        localStorage.setItem('ca_exam_checker_token', res.token);
        localStorage.setItem('auth_token', res.token);
        localStorage.setItem('ca_token', res.token);
        window.dispatchEvent(new Event('auth-changed'));
        navigate('/mcq-admin');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid credentials or access denied.');
    } finally {
      setLoading(false);
    }
  };

  // FIRST-TIME ENROLLMENT / RE-ENROLLMENT VERIFICATION
  const handleEnrollVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode || totpCode.trim().length !== 6) {
      setErrorMsg('Please enter the 6-digit verification code from your authenticator app.');
      return;
    }
    if (!totpSetup) {
      setErrorMsg('Enrollment session expired. Please restart sign in.');
      return;
    }

    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await apiRequest<any>('/api/auth/mfa/enroll/verify', {
        method: 'POST',
        body: JSON.stringify({
          otpCode: totpCode.trim(),
          mfaSessionToken,
          secretKey: totpSetup.secretKey,
          trustDevice,
        }),
      });

      if (!res.success && !res.token) {
        throw new Error(res.error || 'Failed to verify and activate Authenticator.');
      }

      const activeToken = res.token;
      if (activeToken) {
        localStorage.setItem('ca_exam_checker_token', activeToken);
        localStorage.setItem('auth_token', activeToken);
        localStorage.setItem('ca_token', activeToken);
      }
      if (res.trustToken) {
        localStorage.setItem('ca_trust_token', res.trustToken);
        localStorage.setItem('ca_device_trust_token', res.trustToken);
      }

      window.dispatchEvent(new Event('auth-changed'));
      navigate('/mcq-admin');
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid 6-digit code. Please verify against your authenticator app time.');
    } finally {
      setLoading(false);
    }
  };

  // SUBSEQUENT LOGIN TOTP CHALLENGE (MFA ALREADY ENROLLED)
  const handleTotpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode || totpCode.trim().length !== 6) {
      setErrorMsg('Please enter a valid 6-digit verification code.');
      return;
    }

    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await apiRequest<any>('/api/auth/mfa/verify-challenge', {
        method: 'POST',
        body: JSON.stringify({
          mfaSessionToken,
          otpCode: totpCode.trim(),
          trustDevice,
        }),
      });

      if (res.token && res.user) {
        localStorage.setItem('ca_exam_checker_token', res.token);
        localStorage.setItem('auth_token', res.token);
        localStorage.setItem('ca_token', res.token);
        if (res.trustToken) {
          localStorage.setItem('ca_trust_token', res.trustToken);
          localStorage.setItem('ca_device_trust_token', res.trustToken);
        }
        window.dispatchEvent(new Event('auth-changed'));
        navigate('/mcq-admin');
      } else {
        throw new Error('Verification completed but session could not be established.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copySetupKey = () => {
    if (!totpSetup) return;
    navigator.clipboard.writeText(totpSetup.secretKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background glow accents */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-8 space-y-6 relative z-10">
        {/* Official MCQ Arena Branding Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <McqArenaLogo size="lg" theme="dark" withGlow />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tracking-widest uppercase bg-amber-500/20 text-amber-400 border border-amber-500/40 mt-2">
            <ShieldCheck className="w-3.5 h-3.5" /> MCQ ADMIN PORTAL
          </div>
          <p className="text-xs text-slate-400">
            Authoritative Content & Question Bank Management
          </p>
        </div>

        {errorMsg && (
          <div className="p-3.5 bg-rose-950/60 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* STEP 1: PASSWORD LOGIN */}
        {authStep === 'PASSWORD' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-amber-400" /> Admin Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="priyatca15@gmail.com"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" /> Admin Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Multi-Factor Authentication (TOTP) is mandatory for MCQ Admin accounts.</span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-slate-950 text-xs font-black rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Verifying Credentials...
                </>
              ) : (
                <>
                  Proceed to Security Check <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 2A: IF MFA IS NOT ENROLLED OR RESET REQUIRED -> SHOW MFA SETUP SCREEN */}
        {authStep === 'ENROLL' && totpSetup && (
          <form onSubmit={handleEnrollVerify} className="space-y-4">
            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                Set Up Authenticator
              </h3>
              <p className="text-xs text-slate-300">
                Secure your admin account by connecting an authenticator app.
              </p>
              <div className="pt-2 text-left text-xs text-slate-400 space-y-1">
                <p className="font-semibold text-slate-300">1. Scan this QR code using:</p>
                <div className="flex items-center gap-2 pl-3 text-[11px] text-amber-300 font-medium">
                  <span>Google Authenticator</span>
                  <span>•</span>
                  <span>Microsoft Authenticator</span>
                  <span>•</span>
                  <span>Authy</span>
                </div>
              </div>
            </div>

            {/* REAL DYNAMIC QR CODE FROM VALID OTPAUTH URI */}
            <div className="flex justify-center p-3 bg-white rounded-xl shadow-inner max-w-[210px] mx-auto border-2 border-amber-500/50">
              <img
                src={totpSetup.qrDataUrl}
                alt="Authenticator QR Code"
                className="w-44 h-44 object-contain"
              />
            </div>

            {/* MANUAL SETUP KEY */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5 text-center">
              <div className="text-[11px] text-slate-400 font-semibold">Can't scan the QR?</div>
              <div className="text-[11px] text-slate-400">Manual setup key:</div>
              <div className="flex items-center justify-center gap-2">
                <code className="text-xs font-mono font-black text-amber-400 tracking-wider">
                  {totpSetup.formattedKey}
                </code>
                <button
                  type="button"
                  onClick={copySetupKey}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                  title="Copy setup key"
                >
                  {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="text-[10px] text-slate-500 pt-0.5">
                Account: <span className="text-slate-300 font-medium">MCQ Admin ({email})</span>
              </div>
            </div>

            {/* 6-DIGIT VERIFICATION CODE */}
            <div>
              <label className="block text-center text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                6-DIGIT VERIFICATION CODE
              </label>
              <input
                type="text"
                maxLength={6}
                autoFocus
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="_ _ _ _ _ _"
                className="w-full px-4 py-3 bg-slate-950 text-center tracking-[0.5em] font-mono font-black text-xl border border-slate-700 rounded-xl text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="rounded border-slate-700 text-amber-600 focus:ring-amber-500"
              />
              <span>Trust this browser for 365 days</span>
            </label>

            <button
              type="submit"
              disabled={loading || totpCode.length !== 6}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Verifying & Enabling...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Verify & Enable MFA
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthStep('PASSWORD');
                setTotpCode('');
                setErrorMsg(null);
              }}
              className="w-full text-center text-xs text-slate-400 hover:text-white transition-colors"
            >
              ← Back to Password
            </button>
          </form>
        )}

        {/* STEP 2B: IF MFA IS ALREADY ENROLLED -> ONLY THEN SHOW AUTHENTICATOR VERIFICATION (NO QR CODE) */}
        {authStep === 'CHALLENGE' && (
          <form onSubmit={handleTotpVerify} className="space-y-4">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 text-center">
              <div className="flex items-center justify-center gap-2 text-sm font-bold text-amber-400 uppercase tracking-wide">
                <Smartphone className="w-4 h-4" /> Authenticator Verification
              </div>
              <p className="text-xs text-slate-300">
                Enter the 6-digit verification code from your authenticator app.
              </p>
            </div>

            <div>
              <label className="block text-center text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                6-Digit Security Code
              </label>
              <input
                type="text"
                maxLength={6}
                autoFocus
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="_ _ _ _ _ _"
                className="w-full px-4 py-3 bg-slate-950 text-center tracking-[0.5em] font-mono font-black text-xl border border-slate-700 rounded-xl text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="rounded border-slate-700 text-amber-600 focus:ring-amber-500"
              />
              <span>Trust this browser for 365 days</span>
            </label>

            <button
              type="submit"
              disabled={loading || totpCode.length !== 6}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Verifying Code...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Verify & Access Portal
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthStep('PASSWORD');
                setTotpCode('');
                setErrorMsg(null);
              }}
              className="w-full text-center text-xs text-slate-400 hover:text-white transition-colors"
            >
              ← Back to Password
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default McqAdminLoginPage;
