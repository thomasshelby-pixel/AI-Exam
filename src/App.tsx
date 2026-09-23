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
import { ShieldAlert, Clock } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { Navbar } from './components/layout/Navbar.js';
import { Footer } from './components/layout/Footer.js';
import { CreditPurchaseModal } from './components/common/CreditPurchaseModal.js';
import { LandingPage } from './pages/public/LandingPage.js';
import { PricingPage } from './pages/public/PricingPage.js';
import { HowItWorksPage } from './pages/public/HowItWorksPage.js';
import { LegalPage } from './pages/public/LegalPage.js';
import { TermsPage } from './pages/public/TermsPage.js';
import { PrivacyPolicyPage } from './pages/public/PrivacyPolicyPage.js';
import { RefundPolicyPage } from './pages/public/RefundPolicyPage.js';
import { ContactPage } from './pages/public/ContactPage.js';
import { ReviewsPage } from './pages/public/ReviewsPage.js';
import { LoginPage } from './pages/auth/LoginPage.js';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage.js';
import { InstituteAuthPage } from './pages/auth/InstituteAuthPage.js';
import { StudentDashboard } from './pages/student/StudentDashboard.js';
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

// Wrapper for Evaluation Report that fetches data if directly navigated
const EvaluationReportWrapper: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // If result was already passed directly via navigation state, initialize with it
  const passedResult = (location.state as any)?.result as EvaluationResult | undefined;
  const [report, setReport] = useState<EvaluationResult | null>(passedResult || null);
  const [loading, setLoading] = useState<boolean>(!passedResult);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [error, setError] = useState<string>('');

  const fetchReport = useCallback(async (isPolling = false) => {
    if (!id) return;
    try {
      const res = await apiRequest<{
        evaluation: {
          status?: string;
          error_message?: string;
          raw_result_json?: string;
          resultJson?: EvaluationResult;
        };
      }>(`/api/student/evaluations/${id}`);

      const evalData = res.evaluation;
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
      setError(err instanceof Error ? err.message : 'Failed to load report');
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (passedResult) {
      setLoading(false);
      return;
    }
    fetchReport();
  }, [id, passedResult, fetchReport]);

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <div>
          <p className="text-sm font-bold text-slate-800">
            {processingStatus || 'Loading verified evaluation report...'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Validating step marks, working notes calculations, and examiner remarks.
          </p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-md mx-auto my-20 p-6 bg-white border border-rose-200 rounded-xl text-center space-y-4 shadow-sm">
        <p className="text-sm font-bold text-rose-600">{error || 'Report not available'}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => navigate('/student/dashboard')}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
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

// Main layout for public and student screens
const PublicAndStudentLayout: React.FC<{
  children: React.ReactNode;
  onOpenCreditsModal: () => void;
}> = ({ children, onOpenCreditsModal }) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Derive currentView key for Navbar highlighting
  const pathname = location.pathname;
  let currentView = 'home';
  if (pathname === '/how-it-works') currentView = 'how-it-works';
  else if (pathname === '/pricing') currentView = 'pricing';
  else if (pathname === '/reviews') currentView = 'reviews';
  else if (pathname === '/legal') currentView = 'legal';
  else if (pathname === '/contact') currentView = 'contact';
  else if (pathname === '/login') currentView = 'login';
  else if (pathname === '/register') currentView = 'register';
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
      if (redirectUrl && !redirectUrl.startsWith('/login')) {
        navigate(redirectUrl, { replace: true });
        return;
      }
      if (user.role === 'SUPER_ADMIN' || (user.role as string) === 'ADMIN') {
        navigate('/admin/dashboard', { replace: true });
      } else if (user.role === 'INSTITUTE_ADMIN') {
        navigate('/institute/dashboard', { replace: true });
      } else if (user.role === 'MCQ_ADMIN') {
        navigate('/mcq-admin', { replace: true });
      } else {
        navigate('/student/dashboard', { replace: true });
      }
    }
  }, [isAuthenticated, isLoading, user, location.search, navigate]);

  const handleLoginSuccess = (loggedInUser: any) => {
    const searchParams = new URLSearchParams(location.search);
    const redirectUrl = searchParams.get('redirect');

    if (redirectUrl && !redirectUrl.startsWith('/login')) {
      navigate(redirectUrl, { replace: true });
      return;
    }

    const role = loggedInUser?.role || user?.role;
    if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
      navigate('/admin/dashboard', { replace: true });
    } else if (role === 'INSTITUTE_ADMIN') {
      navigate('/institute/dashboard', { replace: true });
    } else if (role === 'MCQ_ADMIN') {
      navigate('/mcq-admin', { replace: true });
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
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login?redirect=/student/dashboard" replace />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const [isCreditsModalOpen, setIsCreditsModalOpen] = useState<boolean>(false);
  const [sessionTimedOut, setSessionTimedOut] = useState<boolean>(false);

  // Global 30-minute Inactivity Session Timeout Handler (Security Compliance)
  useEffect(() => {
    if (!isAuthenticated) return;

    // 30 minutes in milliseconds
    const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
    let timeoutId: NodeJS.Timeout;

    const performAutoLogout = async () => {
      try {
        await logout();
      } catch (err) {
        console.warn('[SessionTimeout] Logout failed:', err);
      } finally {
        setSessionTimedOut(true);
      }
    };

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(performAutoLogout, INACTIVITY_TIMEOUT_MS);
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
  }, [isAuthenticated, logout]);

  return (
    <>
      <Routes>
        {/* ============================================================ */}
        {/* SUPER ADMIN PORTAL ROUTES — Dedicated Full Screen Backoffice */}
        {/* ============================================================ */}
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/*" element={<AdminPortal />} />

        {/* ============================================================ */}
        {/* MCQ ADMIN PORTAL ROUTES — Dedicated Content Management */}
        {/* ============================================================ */}
        <Route path="/mcq-admin/login" element={<McqAdminLoginPage />} />
        <Route path="/mcq-admin" element={<McqAdminPortal />} />
        <Route path="/mcq-admin/*" element={<McqAdminPortal />} />

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
          path="/how-it-works"
          element={
            <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
              <HowItWorksPage onNavigateRegister={() => navigate('/register')} />
            </PublicAndStudentLayout>
          }
        />

        <Route
          path="/pricing"
          element={
            <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
              <PricingPage
                onNavigateRegister={() => navigate('/register')}
                onOpenCreditsModal={() => setIsCreditsModalOpen(true)}
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
              <LoginRoute mode="login" />
            </PublicAndStudentLayout>
          }
        />

        <Route
          path="/register"
          element={
            <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
              <LoginRoute mode="register" />
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
                  onNavigateEnrollments={() => navigate('/student/enrollments')}
                  onNavigateExaminerProfile={() => navigate('/student/examiner-profile')}
                />
              </PublicAndStudentLayout>
            </ProtectedStudentRoute>
          }
        />

        <Route
          path="/student/enrollments"
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
        {/* MCQ ARENA STUDENT ROUTES — Authenticated CA Student Practice */}
        {/* ============================================================ */}
        <Route
          path="/arena"
          element={
            <ProtectedStudentRoute>
              <McqArenaDashboard />
            </ProtectedStudentRoute>
          }
        />
        <Route
          path="/arena/session/:sessionId"
          element={
            <ProtectedStudentRoute>
              <McqPracticeSessionPage />
            </ProtectedStudentRoute>
          }
        />
        <Route
          path="/arena/wrong-vault"
          element={
            <ProtectedStudentRoute>
              <McqWrongVaultPage />
            </ProtectedStudentRoute>
          }
        />
        <Route
          path="/arena/bookmarks"
          element={
            <ProtectedStudentRoute>
              <McqBookmarksPage />
            </ProtectedStudentRoute>
          }
        />
        <Route
          path="/arena/progress"
          element={
            <ProtectedStudentRoute>
              <McqProgressPage />
            </ProtectedStudentRoute>
          }
        />

        {/* Catch-all fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Global Real Razorpay Checkout Modal */}
      <CreditPurchaseModal
        isOpen={isCreditsModalOpen}
        onClose={() => setIsCreditsModalOpen(false)}
        onSuccess={() => setIsCreditsModalOpen(false)}
      />

      {/* Global Inactivity Session Timeout Compliance Modal */}
      {sessionTimedOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-amber-50 dark:bg-amber-950/40 rounded-full flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Session Timed Out</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                For your security and regulatory examination compliance, your session was automatically logged out after 30 minutes of inactivity.
              </p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700 flex items-center gap-2.5 text-left text-xs text-slate-600 dark:text-slate-300">
              <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
              <span>Unsaved progress is protected. Please log in again to resume your examination workspace.</span>
            </div>
            <button
              onClick={() => {
                setSessionTimedOut(false);
                navigate('/login');
              }}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm cursor-pointer"
            >
              Log In to Continue
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default function App() {
  const baseUrl = (import.meta as any).env?.BASE_URL || '/';
  return (
    <BrowserRouter basename={baseUrl}>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
