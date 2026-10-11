import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { BrandLogo } from '../../components/common/BrandLogo.js';
import { LoginPage } from './LoginPage.js';
import { InstituteAuthPage } from './InstituteAuthPage.js';
import {
  GraduationCap,
  Building2,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Users,
  FileCheck2,
  Lock,
} from 'lucide-react';

export type AccountPortalType = 'select' | 'student' | 'institute';

interface UnifiedAuthPageProps {
  initialMode?: 'login' | 'register';
  defaultType?: 'student' | 'institute';
}

export const UnifiedAuthPage: React.FC<UnifiedAuthPageProps> = ({
  initialMode = 'login',
  defaultType,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();

  const searchParams = new URLSearchParams(location.search);
  const typeParam = (searchParams.get('type') || searchParams.get('accountType') || '').toLowerCase();
  const planParam = searchParams.get('plan') || searchParams.get('planId') || '';
  const redirectParam = searchParams.get('redirect') || '';
  const modeParam = searchParams.get('mode') as 'login' | 'register' | null;

  // Determine initial account portal selection
  const determineInitialPortal = (): AccountPortalType => {
    if (typeParam === 'institute') return 'institute';
    if (typeParam === 'student') return 'student';
    // If an institute plan is selected, pre-route directly to Institute
    if (planParam && planParam.toLowerCase().startsWith('inst_')) return 'institute';
    // If redirect indicates institute
    if (redirectParam && redirectParam.startsWith('/institute')) return 'institute';
    // If redirect indicates student
    if (redirectParam && redirectParam.startsWith('/student')) return 'student';
    if (defaultType) return defaultType;
    return 'select';
  };

  const [activePortal, setActivePortal] = useState<AccountPortalType>(determineInitialPortal);
  const [authMode, setAuthMode] = useState<'login' | 'register'>(modeParam || initialMode);

  // Sync when URL query parameters change
  useEffect(() => {
    const updatedType = (searchParams.get('type') || searchParams.get('accountType') || '').toLowerCase();
    const updatedPlan = searchParams.get('plan') || searchParams.get('planId') || '';
    const updatedRedirect = searchParams.get('redirect') || '';

    if (updatedType === 'institute' || (updatedPlan && updatedPlan.toLowerCase().startsWith('inst_')) || updatedRedirect.startsWith('/institute')) {
      setActivePortal('institute');
    } else if (updatedType === 'student' || updatedRedirect.startsWith('/student')) {
      setActivePortal('student');
    }
  }, [location.search]);

  // Handle immediate redirection if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      const normEmail = (user.email || '').toLowerCase().trim();
      const normRole = (user.role || '').toUpperCase().replace(/\s+/g, '_');
      const isMcqAdmin = normRole === 'MCQ_ADMIN' || normEmail === 'priyatca15@gmail.com';
      const isInstituteAdmin = normRole === 'INSTITUTE_ADMIN' || normRole === 'INSTITUTE';

      if (redirectParam && !redirectParam.startsWith('/login')) {
        if (isMcqAdmin && (redirectParam.startsWith('/admin') || redirectParam.startsWith('/super-admin'))) {
          navigate('/mcq-admin', { replace: true });
          return;
        }
        if (isInstituteAdmin && (redirectParam.startsWith('/admin') || redirectParam.startsWith('/super-admin'))) {
          navigate('/institute/dashboard', { replace: true });
          return;
        }
        navigate(redirectParam, { replace: true });
        return;
      }

      if (isMcqAdmin) {
        navigate('/mcq-admin', { replace: true });
      } else if (isInstituteAdmin) {
        navigate('/institute/dashboard', { replace: true });
      } else if (user.role === 'SUPER_ADMIN' || (user.role as string) === 'ADMIN') {
        navigate('/admin/dashboard', { replace: true });
      } else {
        navigate('/student/dashboard', { replace: true });
      }
    }
  }, [isAuthenticated, isLoading, user, redirectParam, navigate]);

  const handleLoginSuccess = (loggedInUser: any) => {
    const activeUser = loggedInUser || user;
    const role = (activeUser?.role || '').toUpperCase().replace(/\s+/g, '_');
    const email = (activeUser?.email || '').toLowerCase().trim();
    const isMcqAdmin = role === 'MCQ_ADMIN' || email === 'priyatca15@gmail.com';
    const isInstituteAdmin = role === 'INSTITUTE_ADMIN' || role === 'INSTITUTE';

    if (redirectParam && !redirectParam.startsWith('/login')) {
      if (isMcqAdmin && (redirectParam.startsWith('/admin') || redirectParam.startsWith('/super-admin'))) {
        navigate('/mcq-admin', { replace: true });
        return;
      }
      if (isInstituteAdmin && (redirectParam.startsWith('/admin') || redirectParam.startsWith('/super-admin'))) {
        navigate('/institute/dashboard', { replace: true });
        return;
      }
      navigate(redirectParam, { replace: true });
      return;
    }

    if (isMcqAdmin) {
      navigate('/mcq-admin', { replace: true });
    } else if (isInstituteAdmin) {
      navigate('/institute/dashboard', { replace: true });
    } else if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
      navigate('/admin/dashboard', { replace: true });
    } else {
      navigate('/student/dashboard', { replace: true });
    }
  };

  // If Student flow is selected
  if (activePortal === 'student') {
    return (
      <div className="relative min-h-[85vh] flex flex-col justify-center">
        {/* Top Account Navigation Bar */}
        <div className="max-w-md mx-auto w-full px-4 pt-4 pb-2 flex items-center justify-between text-xs">
          <button
            id="btn-back-to-selector"
            type="button"
            onClick={() => setActivePortal('select')}
            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 font-semibold transition cursor-pointer"
          >
            <span>← Change Account Type</span>
          </button>
          <button
            id="btn-switch-to-institute"
            type="button"
            onClick={() => {
              setActivePortal('institute');
              setAuthMode('login');
            }}
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-bold transition flex items-center gap-1 cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Institute Portal →</span>
          </button>
        </div>

        <LoginPage
          initialMode={authMode}
          onSuccess={handleLoginSuccess}
          onNavigateHome={() => navigate('/')}
          onSwitchToInstitute={() => {
            setActivePortal('institute');
            setAuthMode('login');
          }}
          onBackToSelector={() => setActivePortal('select')}
        />
      </div>
    );
  }

  // If Institute flow is selected
  if (activePortal === 'institute') {
    return (
      <div className="relative min-h-[85vh] flex flex-col justify-center">
        {/* Top Account Navigation Bar */}
        <div className="max-w-md mx-auto w-full px-4 pt-4 pb-2 flex items-center justify-between text-xs">
          <button
            id="btn-back-to-selector-from-inst"
            type="button"
            onClick={() => setActivePortal('select')}
            className="text-slate-400 hover:text-white flex items-center gap-1 font-semibold transition cursor-pointer"
          >
            <span>← Change Account Type</span>
          </button>
          <button
            id="btn-switch-to-student"
            type="button"
            onClick={() => {
              setActivePortal('student');
              setAuthMode('login');
            }}
            className="text-blue-400 hover:text-blue-300 font-bold transition flex items-center gap-1 cursor-pointer"
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Student Portal →</span>
          </button>
        </div>

        <InstituteAuthPage
          initialMode={authMode}
          onSuccess={handleLoginSuccess}
          onSwitchToStudent={() => {
            setActivePortal('student');
            setAuthMode('login');
          }}
          onBackToSelector={() => setActivePortal('select')}
          preservedPlanId={planParam || undefined}
        />
      </div>
    );
  }

  // Default: Unified Account Type Selection Screen
  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center px-4 py-12 text-slate-900 dark:text-slate-100">
      <div className="w-full max-w-3xl space-y-8">
        {/* Header with Brand Logo */}
        <div className="text-center space-y-3">
          <div className="flex justify-center mb-2">
            <BrandLogo variant="full" size="md" onClick={() => navigate('/')} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            Sign In to CA Exam Checker AI
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-lg mx-auto">
            Please choose your account type to continue to the verified evaluation and examination portal.
          </p>
        </div>

        {/* Two Clearly Separated Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* OPTION 1: CA STUDENT */}
          <div
            id="auth-type-student-card"
            className="group bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl p-6 sm:p-7 flex flex-col justify-between transition-all duration-200 shadow-xs hover:shadow-lg relative"
          >
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  CA Aspirant
                </span>
              </div>

              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Student Portal</span>
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                  For CA Foundation, Intermediate, and Final students checking handwritten mock answer sheets.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>2 Free Evaluations upon signup</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Line-by-line ICAI step marking rubrics</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Continuous student evaluation history</span>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 pt-6 mt-4">
              <button
                id="btn-select-student-signin"
                type="button"
                onClick={() => {
                  setActivePortal('student');
                  setAuthMode('login');
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Sign In as Student</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                id="btn-select-student-register"
                type="button"
                onClick={() => {
                  setActivePortal('student');
                  setAuthMode('register');
                }}
                className="w-full py-2 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Create Account (2 Free Checks)</span>
              </button>
            </div>
          </div>

          {/* OPTION 2: COACHING INSTITUTE */}
          <div
            id="auth-type-institute-card"
            className="group bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl p-6 sm:p-7 flex flex-col justify-between transition-all duration-200 shadow-xs hover:shadow-lg relative"
          >
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Building2 className="w-6 h-6" />
                </div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Institutes & Faculties
                </span>
              </div>

              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Institute Portal</span>
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                  For CA coaching academies, test series providers, and faculties managing student batches.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Student roster & multi-batch management</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Custom question papers & answer ground truth</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Batch rank lists & faculty analytics</span>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 pt-6 mt-4">
              <button
                id="btn-select-institute-signin"
                type="button"
                onClick={() => {
                  setActivePortal('institute');
                  setAuthMode('login');
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Sign In as Institute</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                id="btn-select-institute-register"
                type="button"
                onClick={() => {
                  setActivePortal('institute');
                  setAuthMode('register');
                }}
                className="w-full py-2 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Register Coaching Institute</span>
              </button>
            </div>
          </div>
        </div>

        {/* Security & Regulatory Footnote */}
        <div className="text-center pt-4 border-t border-slate-200 dark:border-slate-800">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>
              Bank-grade 256-bit encryption. Strict adherence to ICAI Examination Marking Schemes.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};
