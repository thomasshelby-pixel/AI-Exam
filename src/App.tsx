import React, { useState, useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  useParams,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { Navbar } from './components/layout/Navbar.js';
import { Footer } from './components/layout/Footer.js';
import { CreditPurchaseModal } from './components/common/CreditPurchaseModal.js';
import { LandingPage } from './pages/public/LandingPage.js';
import { PricingPage } from './pages/public/PricingPage.js';
import { HowItWorksPage } from './pages/public/HowItWorksPage.js';
import { LegalPage } from './pages/public/LegalPage.js';
import { ContactPage } from './pages/public/ContactPage.js';
import { LoginPage } from './pages/auth/LoginPage.js';
import { StudentDashboard } from './pages/student/StudentDashboard.js';
import { UploadEvaluation } from './pages/student/UploadEvaluation.js';
import { MyEvaluations } from './pages/student/MyEvaluations.js';
import { EvaluationReportView } from './pages/student/EvaluationReportView.js';
import { InstitutePortal } from './pages/institute/InstitutePortal.js';
import { AdminPortal } from './pages/admin/AdminPortal.js';
import { EvaluationResult } from './types/index.js';
import { apiRequest } from './api/client.js';

// Wrapper for Evaluation Report that fetches data if directly navigated
const EvaluationReportWrapper: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    const fetchReport = async () => {
      try {
        setLoading(true);
        const res = await apiRequest<{ evaluation: { raw_result_json: string } }>(
          `/api/student/evaluations/${id}`
        );
        if (res.evaluation?.raw_result_json) {
          setReport(JSON.parse(res.evaluation.raw_result_json));
        } else {
          setError('Evaluation report not found.');
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load report');
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [id]);

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-semibold text-slate-600">Loading verified evaluation report...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-md mx-auto my-20 p-6 bg-white border border-rose-200 rounded-xl text-center space-y-4 shadow-sm">
        <p className="text-sm font-bold text-rose-600">{error || 'Report not available'}</p>
        <button
          onClick={() => navigate('/student/dashboard')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
        >
          Return to Student Dashboard
        </button>
      </div>
    );
  }

  return (
    <EvaluationReportView
      evaluationResult={report}
      onBack={() => navigate('/student/dashboard')}
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
  else if (pathname === '/legal') currentView = 'legal';
  else if (pathname === '/contact') currentView = 'contact';
  else if (pathname === '/login') currentView = 'login';
  else if (pathname === '/register') currentView = 'register';
  else if (pathname.startsWith('/student/upload')) currentView = 'student-upload';
  else if (pathname.startsWith('/student/evaluations')) currentView = 'student-evaluations';
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
    <div className="min-h-screen flex flex-col bg-[#f1f5f9] text-[#1e293b] font-sans selection:bg-blue-600 selection:text-white">
      <Navbar
        currentView={currentView}
        onNavigate={handleNavigate}
        onOpenCreditsModal={onOpenCreditsModal}
      />
      <main className="flex-1">{children}</main>
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
  const { isAuthenticated } = useAuth();
  const [isCreditsModalOpen, setIsCreditsModalOpen] = useState<boolean>(false);

  return (
    <>
      <Routes>
        {/* ============================================================ */}
        {/* SUPER ADMIN PORTAL ROUTES — Dedicated Full Screen Backoffice */}
        {/* ============================================================ */}
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/*" element={<AdminPortal />} />

        {/* ============================================================ */}
        {/* INSTITUTE PORTAL ROUTES — Dedicated Full Screen Backoffice */}
        {/* ============================================================ */}
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
          path="/contact"
          element={
            <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
              <ContactPage />
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
                  onEvaluationComplete={(id) => navigate(`/student/evaluations/${id}`)}
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
          path="/student/evaluations/:id"
          element={
            <ProtectedStudentRoute>
              <PublicAndStudentLayout onOpenCreditsModal={() => setIsCreditsModalOpen(true)}>
                <EvaluationReportWrapper />
              </PublicAndStudentLayout>
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
    </>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
