import React, { useState, useEffect, useCallback } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  useParams,
} from 'react-router-dom';
import {
  ShieldAlert,
  Clock,
  Home,
  FileCheck2,
  BookOpen,
  Building2,
  LayoutGrid,
  BrainCircuit,
  ClipboardList,
  TrendingUp,
  CreditCard,
  UserRound,
  Search,
  Bell,
  Menu,
  X,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { QuickResumeModal } from './components/auth/QuickResumeModal.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { LegalConsentGate } from './components/auth/LegalConsentGate.js';
import { Navbar } from './components/layout/Navbar.js';
import { Footer } from './components/layout/Footer.js';
import { CreditPurchaseModal } from './components/common/CreditPurchaseModal.js';
import { LandingPage } from './pages/public/LandingPage.js';
import { AndroidDownloadPage } from './pages/public/AndroidDownloadPage.js';
import { PricingPage } from './pages/public/PricingPage.js';
import { HowItWorksPage } from './pages/public/HowItWorksPage.js';
import { LegalPage } from './pages/public/LegalPage.js';
import { TermsPage } from './pages/public/TermsPage.js';
import { PrivacyPolicyPage } from './pages/public/PrivacyPolicyPage.js';
import { RefundPolicyPage } from './pages/public/RefundPolicyPage.js';
import { ContactPage } from './pages/public/ContactPage.js';
import { ReviewsPage } from './pages/public/ReviewsPage.js';
import { LoginPage } from './pages/auth/LoginPage.js';
import { UnifiedAuthPage } from './pages/auth/UnifiedAuthPage.js';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage.js';
import { EmailOtpVerificationPage } from './pages/auth/EmailOtpVerificationPage.js';
import { PrivateAdminAccessPage } from './pages/auth/PrivateAdminAccessPage.js';
import { InstituteAuthPage } from './pages/auth/InstituteAuthPage.js';
import { StudentDashboard } from './pages/student/StudentDashboard.js';
import { StudyPlannerPage } from './pages/student/StudyPlannerPage.js';
import { UploadEvaluation } from './pages/student/UploadEvaluation.js';
import { MyEvaluations } from './pages/student/MyEvaluations.js';
import { StudentProfilePage } from './pages/student/StudentProfilePage.js';
import { StudentEnrollmentsPage } from './pages/student/StudentEnrollmentsPage.js';
import { EvaluationReportView } from './pages/student/EvaluationReportView.js';
import { PersonalExaminerProfilePage } from './pages/student/PersonalExaminerProfilePage.js';
import { InstitutePortal } from './pages/institute/InstitutePortal.js';
import { AdminPortal } from './pages/admin/AdminPortal.js';
import { McqArenaDashboard } from './pages/student/McqArenaDashboard.js';
import { McqPracticeSessionPage } from './pages/student/McqPracticeSessionPage.js';
import { McqWrongVaultPage } from './pages/student/McqWrongVaultPage.js';
import { McqBookmarksPage } from './pages/student/McqBookmarksPage.js';
import { McqProgressPage } from './pages/student/McqProgressPage.js';
import { McqAdminPortal } from './pages/admin/McqAdminPortal.js';
import { McqAdminLoginPage } from './pages/auth/McqAdminLoginPage.js';
import { EvaluationResult } from './types/index.js';
import { apiRequest } from './api/client.js';
import { featureApi } from './api/featureClient.js';
import { FeatureUnavailable } from './components/common/FeatureUnavailable.js';
import { DisclaimerModal } from './components/student/DisclaimerModal.js';

// Wrapper for Evaluation Report that enforces disclaimer gate before rendering evaluation content
const EvaluationReportWrapper: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // If result was passed via navigation state
  const passedResult = (location.state as any)?.result as EvaluationResult | undefined;
  const [report, setReport] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isCheckingDisclaimer, setIsCheckingDisclaimer] = useState<boolean>(true);
  const [isDisclaimerAcknowledged, setIsDisclaimerAcknowledged] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Step 1: Verify disclaimer status before rendering any evaluation content
  const checkDisclaimerStatus = useCallback(async () => {
    try {
      setIsCheckingDisclaimer(true);
      const res = await apiRequest<{ acknowledged: boolean; currentVersion: string }>('/api/student/disclaimer/status');
      if (res.acknowledged) {
        setIsDisclaimerAcknowledged(true);
        if (passedResult) {
          setReport(passedResult);
          setLoading(false);
        }
      } else {
        setIsDisclaimerAcknowledged(false);
        setLoading(false);
      }
    } catch {
      // In case of error checking disclaimer, enforce modal for safety
      setIsDisclaimerAcknowledged(false);
      setLoading(false);
    } finally {
      setIsCheckingDisclaimer(false);
    }
  }, [passedResult]);

  useEffect(() => {
    checkDisclaimerStatus();
  }, [checkDisclaimerStatus]);

  const fetchReport = useCallback(async (isPolling = false) => {
    if (!id) return;
    try {
      const res = await apiRequest<{
        evaluation: {
          status?: string;
          rejection_reason?: string;
          document_validation_status?: string;
          error_message?: string;
          raw_result_json?: string;
          resultJson?: EvaluationResult;
        };
      }>(`/api/student/evaluations/${id}`);

      const evalData = res.evaluation;
      const canonicalDisplayId = (evalData as any)?.display_id || (evalData as any)?.displayId;
      if (canonicalDisplayId && id !== canonicalDisplayId && !id.startsWith('CEA-')) {
        navigate(`/student/evaluations/${canonicalDisplayId}`, { replace: true, state: location.state });
      }
      if (evalData?.status === 'REJECTED') {
        setError(
          `Evaluation rejected. Reason: ${evalData.rejection_reason || (evalData.document_validation_status === 'DUPLICATE_ACCOUNT_UPLOAD' ? evalData.error_message : '') || 'The rejection reason was not recorded. Please contact support for a review.'}`
        );
        setLoading(false);
        return;
      }

      if (evalData?.resultJson) {
        setReport(evalData.resultJson);
        setLoading(false);
        return;
      }

      if (evalData?.raw_result_json) {
        try {
          setReport(JSON.parse(evalData.raw_result_json));
          setLoading(false);
          return;
        } catch {
          // continue
        }
      }

      if (evalData?.status === 'FAILED') {
        setError(
          evalData.error_message ||
            'Evaluation could not be completed. No credits were deducted. Please retry your upload.'
        );
        setLoading(false);
        return;
      }

      // If in progress, show progress and poll
      if (
        evalData?.status === 'QUEUED' ||
        evalData?.status === 'PENDING' ||
        evalData?.status === 'UPLOADING' ||
        evalData?.status === 'READING_ANSWER_SHEET' ||
        evalData?.status === 'EVALUATING_ANSWERS' ||
        evalData?.status === 'PROCESSING'
      ) {
        setProcessingStatus(
          (evalData as any).progress_message ||
          (evalData.status === 'READING_ANSWER_SHEET'
            ? 'Analyzing handwritten pages and optical handwriting...'
            : evalData.status === 'EVALUATING_ANSWERS'
            ? 'Executing ICAI step-by-step mark allocation...'
            : evalData.status === 'QUEUED'
            ? 'Queued for evaluation. Starting examiner pipeline...'
            : 'Synthesizing verified evaluation report...')
        );

        setTimeout(() => fetchReport(true), 2500);
        return;
      }

      if (!isPolling) {
        setError('Evaluation report not found or still generating. Please check My Evaluations in a moment.');
        setLoading(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load report';
      if (msg.includes('disclaimer') || msg.includes('DISCLAIMER_REQUIRED')) {
        setIsDisclaimerAcknowledged(false);
        setLoading(false);
        return;
      }
      setError(msg);
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id || isCheckingDisclaimer || !isDisclaimerAcknowledged) return;
    if (report) {
      setLoading(false);
      return;
    }
    fetchReport();
  }, [id, isCheckingDisclaimer, isDisclaimerAcknowledged, report, fetchReport]);

  // While disclaimer status is loading, render neutral loading state (NO evaluation flash)
  if (isCheckingDisclaimer) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <div>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Verifying evaluation access permissions...
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Validating student exam advisory acknowledgement status.
          </p>
        </div>
      </div>
    );
  }

  // If disclaimer is not acknowledged, BLOCK evaluation and show mandatory modal
  if (!isDisclaimerAcknowledged) {
    return (
      <>
        <div className="py-24 flex flex-col items-center justify-center gap-4 text-center px-4">
          <div className="w-10 h-10 border-3 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Evaluation Disclaimer Required
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Please review and acknowledge the evaluation advisory terms to access this report.
            </p>
          </div>
        </div>
        <DisclaimerModal
          isOpen={true}
          onAcknowledge={() => {
            setIsDisclaimerAcknowledged(true);
            if (passedResult) {
              setReport(passedResult);
              setLoading(false);
            } else {
              setLoading(true);
              fetchReport();
            }
          }}
        />
      </>
    );
  }

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <div>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {processingStatus || 'Loading verified evaluation report...'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Validating step marks, working notes calculations, and examiner remarks.
          </p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-md mx-auto my-20 p-6 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-xl text-center space-y-4 shadow-sm">
        <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{error || 'Report not available'}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => navigate('/student/dashboard')}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
          >
            Dashboard
          </button>
          <button
            onClick={() => navigate('/student/upload')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
          >
            Upload Answer Sheet
          </button>
        </div>
      </div>
    );
  }

  return (
    <EvaluationReportView
      evaluationResult={report}
      onBack={() => navigate('/student/dashboard')}
      onRefresh={fetchReport}
    />
  );
};

// Student-facing workspace shell: dark glassmorphism UI shared across student routes.
const StudentWorkspaceLayout: React.FC<{
  children: React.ReactNode;
  onOpenCreditsModal: (config?: any) => void;
}> = ({ children, onOpenCreditsModal }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ca_exam_student_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [navSearch, setNavSearch] = useState('');
  const [isArenaLinkAvailable, setIsArenaLinkAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setIsArenaLinkAvailable(false);
      return () => { active = false; };
    }
    featureApi.checkAccess('mcq_arena')
      .then((result) => {
        if (active) setIsArenaLinkAvailable(Boolean(result.allowed));
      })
      .catch(() => {
        if (active) setIsArenaLinkAvailable(false);
      });
    return () => { active = false; };
  }, [user?.id]);

  const navigationItems: Array<{ label: string; icon: React.ElementType; path?: string; action?: string }> = [
    { label: 'Dashboard', icon: Home, path: '/student/dashboard' },
    { label: 'Evaluate Answer Sheet', icon: FileCheck2, path: '/student/upload' },
    { label: 'Institute Hub', icon: Building2, path: '/student/institute' },
    { label: 'MCQ Arena', icon: LayoutGrid, path: '/mcq-arena' },
    { label: 'Study Planner', icon: BrainCircuit, path: '/student/study-planner' },
    { label: 'My Evaluations', icon: ClipboardList, path: '/student/evaluations' },
    { label: 'Performance Profile', icon: TrendingUp, path: '/student/examiner-profile' },
    { label: 'Plans & Credits', icon: CreditCard, action: 'credits' },
    { label: 'Profile & Settings', icon: UserRound, path: '/student/profile' },
  ];
  const filteredNavigation = navigationItems.filter((item) =>
    (item.label !== 'MCQ Arena' || isArenaLinkAvailable) &&
    item.label.toLowerCase().includes(navSearch.trim().toLowerCase())
  );
  const toggleSidebarCollapsed = () => {
    setIsSidebarCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem('ca_exam_student_sidebar_collapsed', String(next));
      } catch {
        // Sidebar preference is optional when browser storage is unavailable.
      }
      return next;
    });
  };

  const handleStudentLogout = async () => {
    setMobileNavOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };
  const studentName = String(user?.fullName || 'CA Student').trim();
  const studentInitial = studentName.charAt(0).toUpperCase() || 'S';
  const courseLevel = String((profile as any)?.ca_level || (user as any)?.caLevel || 'CA Student')
    .replaceAll('_', ' ');

  const goToNavigationItem = (item: typeof navigationItems[number]) => {
    setMobileNavOpen(false);
    setNavSearch('');
    if ('action' in item && item.action === 'credits') {
      onOpenCreditsModal();
      return;
    }
    if ('path' in item && item.path) navigate(item.path);
  };

  const renderSidebarContent = (forceExpanded = false) => {
    const collapsed = isSidebarCollapsed && !forceExpanded;

    return (
      <>
        <div className={'flex ' + (collapsed ? 'flex-col items-center gap-3' : 'items-start justify-between gap-2')}>
          <button
            type="button"
            onClick={() => navigate('/student/dashboard')}
            className={'flex min-w-0 items-center text-left ' + (collapsed ? 'w-full justify-center' : 'flex-1 gap-3')}
            aria-label="CA Exam Checker AI dashboard"
            title={collapsed ? 'CA Exam Checker AI dashboard' : undefined}
          >
            <img
              src="/favicon.svg"
              alt="CA Exam Checker AI logo"
              className="h-12 w-12 shrink-0 rounded-2xl object-contain drop-shadow-[0_0_22px_rgba(59,130,246,0.28)]"
              width={48}
              height={48}
              fetchPriority="high"
            />
            {!collapsed && (
              <span className="min-w-0">
                <span className="block text-[15px] font-extrabold leading-tight tracking-tight text-white">CA Exam</span>
                <span className="block text-[15px] font-extrabold leading-tight tracking-tight text-white">Checker AI</span>
                <span className="mt-1 block text-[10px] leading-4 text-blue-200/75">Smarter Practice, Better Results.</span>
              </span>
            )}
          </button>

          {!forceExpanded && (
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] p-2 text-blue-100 transition hover:border-cyan-200/25 hover:bg-white/[0.09] hover:text-white"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          )}
        </div>

        <div className={'mt-6 space-y-1.5 ' + (collapsed ? 'w-full' : '')}>
          {filteredNavigation.map((item) => {
            const Icon = item.icon;
            const active = Boolean(item.path && (
              item.path === '/student/dashboard'
                ? location.pathname === '/student/dashboard'
                : location.pathname === item.path || location.pathname.startsWith(item.path + '/')
            ));
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => goToNavigationItem(item)}
                title={collapsed ? item.label : undefined}
                aria-label={item.label}
                className={
                  'group flex w-full items-center rounded-xl border py-3 text-[12px] font-semibold transition-all duration-200 ' +
                  (collapsed ? 'justify-center px-2 ' : 'gap-3 px-3 text-left ') +
                  (active
                    ? 'border-cyan-300/50 bg-gradient-to-r from-blue-600/90 via-blue-500/70 to-cyan-500/45 text-white shadow-[0_0_24px_rgba(36,131,255,0.2)]'
                    : 'border-transparent text-slate-300/85 hover:border-white/10 hover:bg-white/[0.06] hover:text-white')
                }
              >
                <Icon className={'h-4 w-4 shrink-0 ' + (active ? 'text-cyan-100' : 'text-blue-200/80 group-hover:text-white')} />
                {!collapsed && <span className="min-w-0 flex-1 text-left">{item.label}</span>}
                {!collapsed && active && <ChevronRight className="h-3.5 w-3.5 text-cyan-100" />}
                {!collapsed && item.label === 'MCQ Arena' && (
                  <span className="rounded-full border border-fuchsia-300/30 bg-fuchsia-500/20 px-1.5 py-0.5 text-[9px] font-bold text-fuchsia-200">PLAY</span>
                )}
              </button>
            );
          })}
          {filteredNavigation.length === 0 && !collapsed && (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400">
              No matching destination.
            </p>
          )}
        </div>

        <div className="mt-auto space-y-2 pt-6">
          {collapsed ? (
            <button
              type="button"
              onClick={() => onOpenCreditsModal()}
              title="View plans and credits"
              aria-label="View plans and credits"
              className="flex w-full items-center justify-center rounded-xl border border-indigo-300/20 bg-gradient-to-br from-indigo-500/15 via-blue-500/10 to-fuchsia-500/15 p-3 text-amber-300 transition hover:border-indigo-200/40 hover:bg-white/[0.08]"
            >
              <Sparkles className="h-4 w-4" />
            </button>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-indigo-300/20 bg-gradient-to-br from-indigo-500/15 via-blue-500/10 to-fuchsia-500/15 p-4 shadow-[0_14px_45px_rgba(7,12,38,0.25)] backdrop-blur-xl">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Sparkles className="h-4 w-4 text-amber-300" />
                Your CA Study Space
              </div>
              <p className="mt-2 text-[11px] leading-5 text-blue-100/70">
                Practice consistently, review your marks and build your exam confidence.
              </p>
              <button
                type="button"
                onClick={() => onOpenCreditsModal()}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-gradient-to-r from-blue-500 to-fuchsia-500 px-3 py-2.5 text-[11px] font-bold text-white shadow-lg shadow-blue-900/30 transition hover:brightness-110"
              >
                View Plans <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleStudentLogout()}
            title={collapsed ? 'Log out' : undefined}
            aria-label="Log out"
            className={'flex w-full items-center rounded-xl border border-rose-300/15 bg-rose-500/[0.04] py-3 text-[12px] font-semibold text-rose-200/90 transition hover:border-rose-300/35 hover:bg-rose-500/10 hover:text-rose-100 ' + (collapsed ? 'justify-center px-2' : 'gap-3 px-3')}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="flex-1 text-left">Log out</span>}
          </button>

          {!collapsed && <p className="px-2 pt-2 text-[10px] text-slate-500">CA Exam Checker AI · Student Workspace</p>}
        </div>
      </>
    );
  };

  return (
    <div className="student-glass-workspace dark relative min-h-screen overflow-x-clip text-slate-100">
      <div className="student-glass-ambient student-glass-ambient-one" aria-hidden="true" />
      <div className="student-glass-ambient student-glass-ambient-two" aria-hidden="true" />

      <aside className={"student-glass-sidebar fixed inset-y-0 left-0 z-40 hidden " + (isSidebarCollapsed ? "w-[84px]" : "w-[252px]") + " flex-col overflow-y-auto px-3 py-4 transition-[width] duration-200 lg:flex"}>
        {renderSidebarContent()}
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
            aria-label="Close student navigation"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="student-glass-sidebar absolute inset-y-0 left-0 flex w-[min(84vw,300px)] flex-col overflow-y-auto px-4 py-4 shadow-2xl">
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={() => setMobileNavOpen(false)} className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/10" aria-label="Close menu">
                <X className="h-4 w-4" />
              </button>
            </div>
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}

      <div className={"min-w-0 transition-[padding] duration-200 " + (isSidebarCollapsed ? "lg:pl-[84px]" : "lg:pl-[252px]")}>
        <header className="student-glass-topbar sticky top-0 z-30 flex min-h-[76px] items-center gap-3 px-4 py-3 sm:px-6 xl:px-8">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-slate-200 hover:bg-white/[0.09] lg:hidden"
            aria-label="Open student navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 sm:hidden">
            <p className="text-[9px] font-extrabold uppercase tracking-[.2em] text-cyan-200/65">CA Exam Checker AI</p>
            <p className="truncate text-sm font-extrabold text-white">
              {navigationItems.find((item) => item.path && (
                item.path === '/student/dashboard'
                  ? location.pathname === item.path
                  : location.pathname === item.path || location.pathname.startsWith(item.path + '/')
              ))?.label || 'Student Workspace'}
            </p>
          </div>
          <div className="hidden min-w-0 flex-1 sm:block">
            <label className="relative flex max-w-[560px] items-center">
              <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-blue-200/60" />
              <input
                type="search"
                value={navSearch}
                onChange={(event) => setNavSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && filteredNavigation[0]) {
                    event.preventDefault();
                    goToNavigationItem(filteredNavigation[0]);
                  }
                  if (event.key === 'Escape') setNavSearch('');
                }}
                placeholder="Search your study workspace..."
                aria-label="Search student workspace navigation"
                className="student-glass-search w-full rounded-2xl border border-blue-200/15 py-3 pl-10 pr-4 text-xs text-slate-100 outline-none transition placeholder:text-slate-400/80 focus:border-cyan-300/50 focus:ring-2 focus:ring-blue-400/20"
              />
              <kbd className="absolute right-3 rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-slate-400">ENTER</kbd>
            </label>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => {
                if (location.pathname === '/student/dashboard') {
                  window.dispatchEvent(new Event('student:open-notifications'));
                } else {
                  navigate('/student/dashboard', { state: { openNotifications: true } });
                }
              }}
              className="relative rounded-xl border border-white/10 bg-white/[0.035] p-2.5 text-blue-100 transition hover:border-blue-200/25 hover:bg-white/[0.08]"
              title="Open notifications"
              aria-label="Open notifications"
            >
              <Bell className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate('/student/profile')}
              className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.035] p-1.5 pr-2.5 text-left transition hover:border-blue-200/25 hover:bg-white/[0.07] sm:pr-3"
              title="Open your profile"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-blue-200/30 bg-gradient-to-br from-cyan-400 via-blue-600 to-fuchsia-500 text-sm font-black text-white shadow-[0_0_22px_rgba(59,130,246,0.3)]">
                {studentInitial}
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block max-w-[160px] truncate text-xs font-bold text-white">{studentName}</span>
                <span className="block max-w-[160px] truncate text-[10px] capitalize text-blue-200/70">{courseLevel}</span>
              </span>
              <ChevronRight className="hidden h-3.5 w-3.5 rotate-90 text-slate-400 sm:block" />
            </button>
          </div>
        </header>

        <main className="student-glass-page min-h-[calc(100vh-76px)] min-w-0 px-3 py-4 pb-28 sm:px-5 sm:py-6 sm:pb-28 xl:px-8 lg:pb-6">
          {children}
        </main>
      </div>

      <nav className="student-mobile-bottom-nav lg:hidden" aria-label="Student quick navigation">
        {[
          { label: 'Home', icon: Home, path: '/student/dashboard' },
          { label: 'Evaluate', icon: FileCheck2, path: '/student/upload' },
          { label: 'Institute', icon: Building2, path: '/student/institute' },
          { label: 'Results', icon: ClipboardList, path: '/student/evaluations' },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = item.path === '/student/dashboard'
            ? location.pathname === item.path
            : location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => { setMobileNavOpen(false); navigate(item.path); }}
              className={'student-mobile-bottom-nav-item' + (isActive ? ' is-active' : '')}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="student-mobile-bottom-nav-icon"><Icon className="h-[18px] w-[18px]" /></span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

// Main layout for public and student screens
const PublicAndStudentLayout: React.FC<{
  children: React.ReactNode;
  onOpenCreditsModal: (config?: any) => void;
}> = ({ children, onOpenCreditsModal }) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Derive currentView key for Navbar highlighting
  const pathname = location.pathname;
  let currentView = 'home';
  if (pathname === '/download') currentView = 'android-download';
  if (pathname === '/how-it-works') currentView = 'how-it-works';
  else if (pathname === '/pricing') currentView = 'pricing';
  else if (pathname === '/reviews') currentView = 'reviews';
  else if (pathname === '/legal') currentView = 'legal';
  else if (pathname === '/contact') currentView = 'contact';
  else if (pathname === '/login') currentView = 'login';
  else if (pathname === '/register') currentView = 'register';
  else if (pathname === '/features') currentView = 'features';
  else if (pathname.startsWith('/student/upload')) currentView = 'student-upload';
  else if (pathname.startsWith('/student/evaluations')) currentView = 'student-evaluations';
  else if (pathname.startsWith('/student/examiner-profile')) currentView = 'student-examiner-profile';
  else if (pathname.startsWith('/student')) currentView = 'student-dashboard';

  const handleNavigate = (view: string) => {
    switch (view) {
      case 'home':
      case 'landing':
        navigate('/');
        break;
      case 'android-download':
        navigate('/download');
        break;
      case 'how-it-works':
        navigate('/how-it-works');
        break;
      case 'pricing':
        navigate('/pricing');
        break;
      case 'reviews':
        navigate('/reviews');
        break;
      case 'legal':
        navigate('/legal');
        break;
      case 'contact':
        navigate('/contact');
        break;
      case 'login':
        navigate('/login');
        break;
      case 'register':
        navigate('/register');
        break;
      case 'student-dashboard':
        navigate('/student/dashboard');
        break;
      case 'student-upload':
        navigate('/student/upload');
        break;
      case 'student-evaluations':
        navigate('/student/evaluations');
        break;
      case 'student-examiner-profile':
        navigate('/student/examiner-profile');
        break;
      case 'student-profile':
        navigate('/student/profile');
        break;
      case 'features':
        if (location.pathname === '/' || location.pathname === '') {
          const el = document.getElementById('features');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth' });
          } else {
            navigate('/features');
          }
        } else {
          navigate('/features');
        }
        break;
      case 'arena':
        navigate('/arena');
        break;
      case 'mcq-admin':
        navigate('/mcq-admin');
        break;
      case 'institute-dashboard':
        navigate('/institute/dashboard');
        break;
      case 'admin-dashboard':
        navigate('/admin/dashboard');
        break;
      default:
        navigate('/');
        break;
    }
  };

  if (pathname.startsWith('/student')) {
    return (
      <StudentWorkspaceLayout onOpenCreditsModal={onOpenCreditsModal}>
        {children}
      </StudentWorkspaceLayout>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f1f5f9] dark:bg-slate-950 text-[#1e293b] dark:text-slate-100 font-sans selection:bg-blue-600 selection:text-white transition-colors duration-150">
      <Navbar
        currentView={currentView}
        onNavigate={handleNavigate}
        onOpenCreditsModal={onOpenCreditsModal}
      />
      <main className="flex-1 w-full min-w-0">{children}</main>
      <Footer onNavigate={handleNavigate} />
    </div>
  );
};

// Login Screen with smart role and redirect query handling
const LoginRoute: React.FC<{ mode: 'login' | 'register' }> = ({ mode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();

  // If already authenticated, redirect immediately based on role
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      const searchParams = new URLSearchParams(location.search);
      const redirectUrl = searchParams.get('redirect');
      const normEmail = (user.email || '').toLowerCase().trim();
      const isMcqAdmin = (user.role || '').toUpperCase() === 'MCQ_ADMIN' || normEmail === 'priyatca15@gmail.com';

      const normRole = (user.role || '').toUpperCase().replace(/\s+/g, '_');
      const isInstituteAdmin = normRole === 'INSTITUTE_ADMIN' || normRole === 'INSTITUTE';

      if (redirectUrl && !redirectUrl.startsWith('/login')) {
        if (isMcqAdmin && (redirectUrl === '/admin' || redirectUrl.startsWith('/admin/') || redirectUrl === '/super-admin' || redirectUrl.startsWith('/super-admin/'))) {
          navigate('/mcq-admin', { replace: true });
          return;
        }
        if (isInstituteAdmin && (redirectUrl === '/admin' || redirectUrl.startsWith('/admin/') || redirectUrl === '/super-admin' || redirectUrl.startsWith('/super-admin/'))) {
          navigate('/institute/dashboard', { replace: true });
          return;
        }
        navigate(redirectUrl, { replace: true });
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
  }, [isAuthenticated, isLoading, user, location.search, navigate]);

  const handleLoginSuccess = (loggedInUser: any) => {
    const searchParams = new URLSearchParams(location.search);
    const redirectUrl = searchParams.get('redirect');

    const activeUser = loggedInUser || user;
    const role = (activeUser?.role || '').toUpperCase().replace(/\s+/g, '_');
    const email = (activeUser?.email || '').toLowerCase().trim();
    const isMcqAdmin = role === 'MCQ_ADMIN' || email === 'priyatca15@gmail.com';
    const isInstituteAdmin = role === 'INSTITUTE_ADMIN' || role === 'INSTITUTE';

    if (redirectUrl && !redirectUrl.startsWith('/login')) {
      if (isMcqAdmin && (redirectUrl === '/admin' || redirectUrl.startsWith('/admin/') || redirectUrl === '/super-admin' || redirectUrl.startsWith('/super-admin/'))) {
        navigate('/mcq-admin', { replace: true });
        return;
      }
      if (isInstituteAdmin && (redirectUrl === '/admin' || redirectUrl.startsWith('/admin/') || redirectUrl === '/super-admin' || redirectUrl.startsWith('/super-admin/'))) {
        navigate('/institute/dashboard', { replace: true });
        return;
      }
      navigate(redirectUrl, { replace: true });
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

  return (
    <LoginPage
      initialMode={mode}
      onSuccess={handleLoginSuccess}
      onNavigateHome={() => navigate('/')}
    />
  );
};

// Protected Student Route Guard
const ProtectedStudentRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, isLoading, isSessionLocked, lockedUser } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Preserve workspace state only if session is genuinely locked with locked user info for QuickResumeModal
  if (isSessionLocked && lockedUser) {
    return <>{children}</>;
  }

  if (!isAuthenticated || !user) {
    const redirectTarget = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirectTarget}`} replace />;
  }

  return <>{children}</>;
};

// Protected MCQ Admin Route Guard
const ProtectedMcqAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, isLoading, isSessionLocked, lockedUser } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Preserve workspace state when session is locked for quick resume
  if (isSessionLocked && lockedUser) {
    return <>{children}</>;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const roleUpper = (user.role || '').toUpperCase();
  if (roleUpper !== 'MCQ_ADMIN' && roleUpper !== 'SUPER_ADMIN') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Protected MCQ Arena Route Guard — strictly restricts access to Super Admin, MCQ Admin, and allowlisted testers
const ProtectedArenaRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);
  const [accessInfo, setAccessInfo] = useState<{
    featureName?: string;
    status?: 'TESTING' | 'DISABLED' | 'ENABLED' | 'COMING_SOON';
    studentMessage?: string;
  }>({});

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setIsCheckingAccess(false);
      setIsAllowed(false);
      return;
    }

    const roleUpper = (user.role || '').toUpperCase().replace(/\s+/g, '_');
    if (roleUpper === 'SUPER_ADMIN' || roleUpper === 'ADMIN' || roleUpper === 'MCQ_ADMIN') {
      setIsAllowed(true);
      setIsCheckingAccess(false);
      return;
    }

    featureApi
      .checkAccess('mcq_arena')
      .then((res) => {
        setIsAllowed(Boolean(res.allowed));
        setAccessInfo({
          featureName: res.featureName,
          status: res.status,
          studentMessage: res.studentMessage,
        });
      })
      .catch(() => {
        setIsAllowed(false);
      })
      .finally(() => {
        setIsCheckingAccess(false);
      });
  }, [isAuthenticated, user]);

  if (isLoading || isCheckingAccess) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login?redirect=/arena" replace />;
  }

  if (!isAllowed) {
    return (
      <FeatureUnavailable
        featureKey="mcq_arena"
        featureName={accessInfo.featureName || 'MCQ Arena'}
        status={accessInfo.status || 'TESTING'}
        studentMessage={
          accessInfo.studentMessage ||
          "MCQ Arena is currently restricted and undergoing private testing. Public access will be available soon."
        }
        onBack={() => {
          window.location.href = '/student/dashboard';
        }}
      />
    );
  }

  return <>{children}</>;
};

// Protected Super Admin Route Guard
// Automatically routes Institute Admin to Institute Portal rather than hitting 403 Access Denied
const ProtectedSuperAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, isLoading, isSessionLocked, lockedUser } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // When a session is locked, validate the saved account role before preserving
  // the workspace. A student's locked session must never render the admin shell.
  if (isSessionLocked && lockedUser) {
    const lockedRoleUpper = (lockedUser.role || '').toUpperCase().replaceAll(' ', '_');
    const lockedEmail = (lockedUser.email || '').toLowerCase().trim();
    if (lockedRoleUpper === 'SUPER_ADMIN' || lockedRoleUpper === 'ADMIN') return <>{children}</>;
    if (lockedRoleUpper === 'MCQ_ADMIN' || lockedEmail === 'priyatca15@gmail.com') {
      return <Navigate to="/mcq-admin" replace />;
    }
    if (lockedRoleUpper === 'INSTITUTE_ADMIN' || lockedRoleUpper === 'INSTITUTE') {
      return <Navigate to="/institute/dashboard" replace />;
    }
    return <Navigate to="/" replace />;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/" replace />;
  }

  const roleUpper = (user.role || '').toUpperCase().replaceAll(' ', '_');
  const normEmail = (user.email || '').toLowerCase().trim();

  if (roleUpper === 'MCQ_ADMIN' || normEmail === 'priyatca15@gmail.com') {
    return <Navigate to="/mcq-admin" replace />;
  }

  if (roleUpper === 'INSTITUTE_ADMIN' || roleUpper === 'INSTITUTE') {
    return <Navigate to="/institute/dashboard" replace />;
  }

  if (roleUpper !== 'SUPER_ADMIN' && roleUpper !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isSessionLocked, lockSession } = useAuth();
  const [isCreditsModalOpen, setIsCreditsModalOpen] = useState<boolean>(false);
  const [creditsModalConfig, setCreditsModalConfig] = useState<any>(undefined);

  const handleOpenCreditsModal = (config?: any) => {
    setCreditsModalConfig(config);
    setIsCreditsModalOpen(true);
  };

  // Global 30-minute Inactivity Session Timeout Handler (Security Compliance)
  useEffect(() => {
    if (!isAuthenticated || isSessionLocked) return;

    // 30 minutes in milliseconds
    const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
    let timeoutId: NodeJS.Timeout;

    const performAutoLock = () => {
      lockSession();
    };

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(performAutoLock, INACTIVITY_TIMEOUT_MS);
    };

    const userActivityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    let lastActivity = Date.now();

    const handleActivity = () => {
      const now = Date.now();
      // Throttle event handlers to once every 2 seconds
      if (now - lastActivity > 2000) {
        lastActivity = now;
        resetTimer();
      }
    };

    userActivityEvents.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Start initial timer
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      userActivityEvents.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [isAuthenticated, isSessionLocked, lockSession]);

  return (
    <>
      {isAuthenticated && user?.role === 'STUDENT' && user.suspiciousActivityWarning && (
        <div
          role="alert"
          className="sticky top-0 z-[100] border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm dark:border-amber-800 dark:bg-amber-950/95 dark:text-amber-100"
        >
          <div className="mx-auto flex max-w-7xl items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700 dark:text-amber-300" />
            <div>
              <p className="font-semibold">Account Security Warning</p>
              <p className="mt-1 text-sm leading-5">
                We detected suspicious activity involving the same answer sheet being submitted from multiple accounts.
                Repeated attempts to bypass evaluation limits may lead to account suspension or manual review.
                If this is legitimate testing, please contact support.
              </p>
            </div>
          </div>
        </div>
      )}
      <Routes>
        {/* Private, unlinked back-office entry. Do not expose through public navigation. */}
        <Route path="/admin-login" element={<PrivateAdminAccessPage />} />

        {/* ============================================================ */}
        {/* SUPER ADMIN PORTAL ROUTES — Dedicated Full Screen Backoffice */}
        {/* ============================================================ */}
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route
          path="/admin/*"
          element={
            <ProtectedSuperAdminRoute>
              <AdminPortal />
            </ProtectedSuperAdminRoute>
          }
        />
        <Route
          path="/super-admin"
          element={
            <ProtectedSuperAdminRoute>
              <AdminPortal />
            </ProtectedSuperAdminRoute>
          }
        />
        <Route
          path="/super-admin/*"
          element={
            <ProtectedSuperAdminRoute>
              <AdminPortal />
            </ProtectedSuperAdminRoute>
          }
        />

        {/* ============================================================ */}
        {/* MCQ ADMIN PORTAL ROUTES — Dedicated Content Management */}
        {/* ============================================================ */}
        <Route path="/mcq-admin/login" element={<McqAdminLoginPage />} />
        <Route
          path="/mcq-admin"
          element={
            <ProtectedMcqAdminRoute>
              <McqAdminPortal />
            </ProtectedMcqAdminRoute>
          }
        />
        <Route
          path="/mcq-admin/*"
          element={
            <ProtectedMcqAdminRoute>
              <McqAdminPortal />
            </ProtectedMcqAdminRoute>
          }
        />

        {/* ============================================================ */}
        {/* INSTITUTE PORTAL ROUTES — Dedicated Full Screen Backoffice */}
        {/* ============================================================ */}
        <Route path="/institute/login" element={<InstituteAuthPage initialMode="login" />} />
        <Route path="/institute/register" element={<InstituteAuthPage initialMode="register" />} />
        <Route path="/institute" element={<Navigate to="/institute/dashboard" replace />} />
        <Route path="/institute/*" element={<InstitutePortal />} />

        {/* ============================================================ */}
        {/* PUBLIC & STUDENT ROUTES — Wrapped with Main Navbar & Footer */}
        {/* ============================================================ */}
        <Route
          path="/"
          element={
            <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
              <LandingPage
                onNavigateRegister={() => navigate('/register')}
                onNavigateLogin={() => navigate('/login')}
                onNavigatePricing={() => navigate('/pricing')}
                onNavigateHowItWorks={() => navigate('/how-it-works')}
                onNavigateReviews={() => navigate('/reviews')}
              />
            </PublicAndStudentLayout>
          }
        />

        <Route
          path="/download"
          element={
            <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
              <AndroidDownloadPage />
            </PublicAndStudentLayout>
          }
        />

        <Route
          path="/how-it-works"
          element={
            <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
              <HowItWorksPage onNavigateRegister={() => navigate('/register')} />
            </PublicAndStudentLayout>
          }
        />

        <Route
          path="/features"
          element={
            <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
              <LandingPage
                onNavigateRegister={() => navigate('/register')}
                onNavigateLogin={() => navigate('/login')}
                onNavigatePricing={() => navigate('/pricing')}
                onNavigateHowItWorks={() => navigate('/how-it-works')}
                onNavigateReviews={() => navigate('/reviews')}
                initialSection="features"
              />
            </PublicAndStudentLayout>
          }
        />

        <Route
          path="/pricing"
          element={
            <PublicAndStudentLayout onOpenCreditsModal={handleOpenCreditsModal}>
              <PricingPage
                onNavigateRegister={() => navigate('/register')}
                onOpenCreditsModal={handleOpenCreditsModal}
                isLoggedIn={isAuthenticated}
              />
            </PublicAndStudentLayout>
          }
        />

        <Route
          path="/legal"
          element={
            <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
              <LegalPage />
            </PublicAndStudentLayout>
          }
        />

        <Route
          path="/terms"
          element={
            <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
              <TermsPage />
            </PublicAndStudentLayout>
          }
        />

        <Route
          path="/terms-of-service"
          element={<Navigate to="/terms" replace />}
        />

        <Route
          path="/privacy-policy"
          element={
            <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
              <PrivacyPolicyPage />
            </PublicAndStudentLayout>
          }
        />

        <Route
          path="/privacy"
          element={<Navigate to="/privacy-policy" replace />}
        />

        <Route
          path="/refund-policy"
          element={
            <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
              <RefundPolicyPage />
            </PublicAndStudentLayout>
          }
        />

        <Route
          path="/refund"
          element={<Navigate to="/refund-policy" replace />}
        />

        <Route
          path="/contact"
          element={
            <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
              <ContactPage />
            </PublicAndStudentLayout>
          }
        />

        <Route
          path="/reviews"
          element={
            <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
              <ReviewsPage
                user={user}
                onNavigateLogin={() => navigate('/login')}
                onNavigateRegister={() => navigate('/register')}
                onNavigateStudentPortal={() => navigate('/student/dashboard')}
              />
            </PublicAndStudentLayout>
          }
        />

        <Route
          path="/login"
          element={
            <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
              <UnifiedAuthPage initialMode="login" />
            </PublicAndStudentLayout>
          }
        />

        <Route
          path="/register"
          element={
            <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
              <UnifiedAuthPage initialMode="register" defaultType="student" />
            </PublicAndStudentLayout>
          }
        />

        <Route
          path="/verify-email"
          element={
            <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
              <EmailOtpVerificationPage />
            </PublicAndStudentLayout>
          }
        />

        <Route
          path="/reset-password"
          element={
            <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
              <ResetPasswordPage />
            </PublicAndStudentLayout>
          }
        />

        {/* Protected Student Portal */}
        <Route path="/student" element={<Navigate to="/student/dashboard" replace />} />

        <Route
          path="/student/dashboard"
          element={
            <ProtectedStudentRoute>
              <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
                <StudentDashboard
                  onNavigateUpload={() => navigate('/student/upload')}
                  onNavigateEvaluations={() => navigate('/student/evaluations')}
                  onViewReport={(id) => navigate(`/student/evaluations/${id}`)}
                  onOpenCreditsModal={() => setIsCreditsModalOpen(true)}
                  onNavigateProfile={() => navigate('/student/profile')}
                  onNavigateEnrollments={() => navigate('/student/institute')}
                  onNavigateExaminerProfile={() => navigate('/student/examiner-profile')}
                />
              </PublicAndStudentLayout>
            </ProtectedStudentRoute>
          }
        />

        <Route
          path="/student/study-planner"
          element={
            <ProtectedStudentRoute>
              <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
                <StudyPlannerPage />
              </PublicAndStudentLayout>
            </ProtectedStudentRoute>
          }
        />

        <Route path="/student/enrollments" element={<Navigate to="/student/institute" replace />} />

        <Route
          path="/student/institute"
          element={
            <ProtectedStudentRoute>
              <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
                <StudentEnrollmentsPage
                  onNavigateUpload={(instituteId, materialId) =>
                    navigate('/student/upload', {
                      state: {
                        initialEvaluationType: 'INSTITUTE',
                        instituteId,
                        materialId,
                      },
                    })
                  }
                  onNavigateDashboard={() => navigate('/student/dashboard')}
                />
              </PublicAndStudentLayout>
            </ProtectedStudentRoute>
          }
        />

        <Route
          path="/student/upload"
          element={
            <ProtectedStudentRoute>
              <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
                <UploadEvaluation
                  onEvaluationComplete={(id, result) =>
                    navigate(`/student/evaluations/${id}`, { state: { result } })
                  }
                  onOpenCreditsModal={() => setIsCreditsModalOpen(true)}
                />
              </PublicAndStudentLayout>
            </ProtectedStudentRoute>
          }
        />

        <Route
          path="/student/evaluations"
          element={
            <ProtectedStudentRoute>
              <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
                <MyEvaluations
                  onViewReport={(id) => navigate(`/student/evaluations/${id}`)}
                  onNavigateUpload={() => navigate('/student/upload')}
                />
              </PublicAndStudentLayout>
            </ProtectedStudentRoute>
          }
        />

        <Route
          path="/student/examiner-profile"
          element={
            <ProtectedStudentRoute>
              <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
                <PersonalExaminerProfilePage
                  onNavigateUpload={() => navigate('/student/upload')}
                  onNavigateDashboard={() => navigate('/student/dashboard')}
                  onViewReport={(id) => navigate(`/student/evaluations/${id}`)}
                />
              </PublicAndStudentLayout>
            </ProtectedStudentRoute>
          }
        />

        <Route
          path="/student/profile"
          element={
            <ProtectedStudentRoute>
              <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
                <StudentProfilePage
                  onNavigateDashboard={() => navigate('/student/dashboard')}
                  onOpenCreditsModal={() => setIsCreditsModalOpen(true)}
                  initialSection="profile"
                />
              </PublicAndStudentLayout>
            </ProtectedStudentRoute>
          }
        />

        <Route
          path="/student/security"
          element={
            <ProtectedStudentRoute>
              <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
                <StudentProfilePage
                  onNavigateDashboard={() => navigate('/student/dashboard')}
                  onOpenCreditsModal={() => setIsCreditsModalOpen(true)}
                  initialSection="security"
                />
              </PublicAndStudentLayout>
            </ProtectedStudentRoute>
          }
        />

        <Route
          path="/student/settings"
          element={
            <ProtectedStudentRoute>
              <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
                <StudentProfilePage
                  onNavigateDashboard={() => navigate('/student/dashboard')}
                  onOpenCreditsModal={() => setIsCreditsModalOpen(true)}
                  initialSection="security"
                />
              </PublicAndStudentLayout>
            </ProtectedStudentRoute>
          }
        />

        <Route
          path="/student/account-security"
          element={
            <ProtectedStudentRoute>
              <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
                <StudentProfilePage
                  onNavigateDashboard={() => navigate('/student/dashboard')}
                  onOpenCreditsModal={() => setIsCreditsModalOpen(true)}
                  initialSection="security"
                />
              </PublicAndStudentLayout>
            </ProtectedStudentRoute>
          }
        />

        <Route
          path="/student/evaluations/:id"
          element={
            <ProtectedStudentRoute>
              <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
                <EvaluationReportWrapper />
              </PublicAndStudentLayout>
            </ProtectedStudentRoute>
          }
        />

        {/* ============================================================ */}
        {/* MCQ ARENA STUDENT ROUTES — Authenticated & Authorized Practice */}
        {/* ============================================================ */}
        <Route
          path="/arena"
          element={
            <ProtectedArenaRoute>
              <McqArenaDashboard />
            </ProtectedArenaRoute>
          }
        />
        <Route
          path="/mcq-arena"
          element={
            <ProtectedArenaRoute>
              <McqArenaDashboard />
            </ProtectedArenaRoute>
          }
        />
        <Route
          path="/arena/session/:sessionId"
          element={
            <ProtectedArenaRoute>
              <McqPracticeSessionPage />
            </ProtectedArenaRoute>
          }
        />
        <Route
          path="/arena/wrong-vault"
          element={
            <ProtectedArenaRoute>
              <McqWrongVaultPage />
            </ProtectedArenaRoute>
          }
        />
        <Route
          path="/arena/bookmarks"
          element={
            <ProtectedArenaRoute>
              <McqBookmarksPage />
            </ProtectedArenaRoute>
          }
        />
        <Route
          path="/arena/progress"
          element={
            <ProtectedArenaRoute>
              <McqProgressPage />
            </ProtectedArenaRoute>
          }
        />

        {/* Catch-all fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Global Real Razorpay Checkout Modal */}
      <CreditPurchaseModal
        isOpen={isCreditsModalOpen}
        onClose={() => {
          setIsCreditsModalOpen(false);
          setCreditsModalConfig(undefined);
        }}
        onSuccess={() => {
          setIsCreditsModalOpen(false);
          setCreditsModalConfig(undefined);
        }}
        initialConfig={creditsModalConfig}
      />

      {/* Global Inactivity Quick Resume Modal */}
      <QuickResumeModal isOpen={isSessionLocked} />
    </>
  );
};

let fallbackWebsiteVisitorId = '';

function getWebsiteVisitorId(): string {
  const storageKey = 'ca_exam_website_visitor_id';
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved && /^[A-Za-z0-9_-]{16,80}$/.test(saved)) return saved;
  } catch {
    // Some private browsing modes block localStorage; keep an in-memory ID for this tab.
    if (fallbackWebsiteVisitorId) return fallbackWebsiteVisitorId;
  }

  const randomPart = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const visitorId = `v_${randomPart}`;
  try {
    localStorage.setItem(storageKey, visitorId);
  } catch {
    fallbackWebsiteVisitorId = visitorId;
  }
  return visitorId;
}

function WebsiteVisitTracker() {
  const location = useLocation();

  useEffect(() => {
    const pathname = location.pathname || '/';
    // Marketing analytics intentionally excludes authenticated portals so admins,
    // students, and institute staff do not inflate public visitor counts.
    if (/^\/(admin|super-admin|mcq-admin|mcq-arena|student|institute|arena)(\/|$)/i.test(pathname)) return;

    const visitorId = getWebsiteVisitorId();
    // Store route paths only; never send query strings that could contain identifiers.
    void fetch('/api/public/analytics/visit', {
      method: 'POST',
      credentials: 'omit',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ visitorId, pagePath: pathname.slice(0, 180) }),
    }).catch(() => {
      // Analytics is best-effort and must never block website navigation.
    });
  }, [location.pathname]);

  return null;
}

export default function App() {
  const baseUrl = (import.meta as any).env?.BASE_URL || '/';
  return (
    <BrowserRouter basename={baseUrl}>
      <WebsiteVisitTracker />
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <LegalConsentGate />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
