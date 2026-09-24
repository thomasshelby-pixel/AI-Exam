import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  BookOpen,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit3,
  CheckCircle,
  Clock,
  Layers,
  BarChart2,
  Lock,
  LogOut,
  RefreshCw,
  AlertCircle,
  Eye,
  X,
  Save,
  CheckCircle2,
  Smartphone,
  Laptop,
  KeyRound,
  Copy,
  Check,
  PlusCircle,
  Shield,
  ArrowLeft,
} from 'lucide-react';
import { McqArenaLogo } from '../../components/common/McqArenaLogo.js';
import { mcqApi } from '../../api/mcqClient.js';
import { apiRequest } from '../../api/client.js';
import { generateTotpSetup, TotpSetupData } from '../../lib/firebaseAuth.js';
import {
  McqQuestion,
  McqAdminStats,
  McqCourse,
  McqQuestionType,
  McqDifficulty,
  McqStatus,
} from '../../types/index.js';
import { useAuth } from '../../context/AuthContext.js';

export const McqAdminPortal: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout, isLoading, isAuthenticated } = useAuth();
  const isSuperAdmin = (user?.role || '').toUpperCase() === 'SUPER_ADMIN';

  const [activeTab, setActiveTab] = useState<'overview' | 'bank' | 'add' | 'security'>('overview');
  const [stats, setStats] = useState<McqAdminStats | null>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(true);

  // Security & MFA state
  const [authenticators, setAuthenticators] = useState<any[]>([]);
  const [trustedDevices, setTrustedDevices] = useState<any[]>([]);
  const [loadingSecurity, setLoadingSecurity] = useState<boolean>(false);
  const [showAddAuthModal, setShowAddAuthModal] = useState<boolean>(false);
  const [newAuthLabel, setNewAuthLabel] = useState<string>('Priya iPhone 15');
  const [newAuthSetup, setNewAuthSetup] = useState<TotpSetupData | null>(null);
  const [newAuthCode, setNewAuthCode] = useState<string>('');
  const [submittingAuth, setSubmittingAuth] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);

  // Password change state
  const [currPassword, setCurrPassword] = useState<string>('');
  const [newPasswordVal, setNewPasswordVal] = useState<string>('');
  const [confirmPasswordVal, setConfirmPasswordVal] = useState<string>('');
  const [passwordUpdating, setPasswordUpdating] = useState<boolean>(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Question bank state
  const [questions, setQuestions] = useState<McqQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [filterCourse, setFilterCourse] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected question for viewing / editing
  const [editingQuestion, setEditingQuestion] = useState<Partial<McqQuestion> | null>(null);
  const [viewingQuestion, setViewingQuestion] = useState<McqQuestion | null>(null);

  // New question form state
  const [newQuestion, setNewQuestion] = useState<Partial<McqQuestion>>({
    course: 'CA_INTERMEDIATE',
    subject: 'Corporate and Other Laws',
    chapter: '',
    topic: '',
    questionType: 'normal',
    caseStudyScenario: '',
    difficulty: 'moderate',
    source: 'ICAI Module',
    attempt: 'May 2025',
    amendmentVersion: 'New Scheme 2024',
    questionText: '',
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    correctAnswer: 'A',
    explanation: '',
    reference: '',
    status: 'published',
  });
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
  const [formFeedback, setFormFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Guard: Ensure user has MCQ_ADMIN or SUPER_ADMIN
  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated || !user) {
      navigate('/mcq-admin/login');
      return;
    }

    const roleUpper = (user.role || '').toUpperCase();
    if (roleUpper !== 'MCQ_ADMIN' && roleUpper !== 'SUPER_ADMIN') {
      navigate('/student/dashboard');
    }
  }, [user, isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    loadStats();
    loadQuestions();
  }, [filterCourse, filterStatus, page]);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const data = await mcqApi.getAdminStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load admin stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadQuestions = async () => {
    setLoadingQuestions(true);
    try {
      const res = await mcqApi.getAdminQuestions({
        course: filterCourse !== 'ALL' ? filterCourse : undefined,
        status: filterStatus !== 'ALL' ? filterStatus : undefined,
        search: searchQuery || undefined,
        page,
        limit: 15,
      });
      setQuestions(res.questions || []);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error('Failed to load questions:', err);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadQuestions();
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormFeedback(null);

    try {
      await mcqApi.createAdminQuestion(newQuestion);
      setFormFeedback({ type: 'success', message: 'Question created and published to question bank!' });
      // Reset text inputs
      setNewQuestion((prev) => ({
        ...prev,
        questionText: '',
        caseStudyScenario: '',
        optionA: '',
        optionB: '',
        optionC: '',
        optionD: '',
        explanation: '',
        reference: '',
      }));
      loadStats();
      loadQuestions();
    } catch (err: any) {
      setFormFeedback({ type: 'error', message: err.message || 'Failed to create question.' });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleUpdateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion || !editingQuestion.id) return;
    setFormSubmitting(true);

    try {
      await mcqApi.updateAdminQuestion(editingQuestion.id, editingQuestion);
      setEditingQuestion(null);
      loadQuestions();
      loadStats();
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this MCQ from the question bank?')) return;
    try {
      await mcqApi.deleteAdminQuestion(id);
      loadQuestions();
      loadStats();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleStatusChange = async (id: string, newStatus: McqStatus) => {
    try {
      await mcqApi.bulkUpdateStatus([id], newStatus);
      setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, status: newStatus } : q)));
      loadStats();
    } catch (err: any) {
      alert(`Status update failed: ${err.message}`);
    }
  };

  // Load Security Details (Authenticators & Trusted Devices)
  const loadSecurityDetails = async () => {
    setLoadingSecurity(true);
    try {
      const authRes = await apiRequest<{ authenticators: any[] }>('/api/auth/mfa/authenticators');
      setAuthenticators(authRes.authenticators || []);

      const devRes = await apiRequest<{ trustedDevices: any[] }>('/api/auth/mfa/trusted-devices');
      setTrustedDevices(devRes.trustedDevices || []);
    } catch (err) {
      console.error('Failed to load security details:', err);
    } finally {
      setLoadingSecurity(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'security') {
      loadSecurityDetails();
    }
  }, [activeTab]);

  const handleOpenAddAuthenticator = async () => {
    setShowAddAuthModal(true);
    setAuthError(null);
    setAuthSuccess(null);
    setNewAuthCode('');
    try {
      const res = await apiRequest<{ success: boolean; setup: any }>(
        `/api/auth/mfa/device/new-setup?label=${encodeURIComponent(newAuthLabel.trim() || 'Authenticator Device')}`
      );
      if (res.setup) {
        setNewAuthSetup(res.setup);
      } else {
        throw new Error('Could not obtain authenticator setup.');
      }
    } catch (err: any) {
      setAuthError('Failed to generate authenticator QR code.');
    }
  };

  const handleEnrollBackupAuthenticator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAuthCode || newAuthCode.trim().length !== 6) {
      setAuthError('Please enter a valid 6-digit verification code.');
      return;
    }
    if (!newAuthSetup) return;

    setSubmittingAuth(true);
    setAuthError(null);
    try {
      await apiRequest('/api/auth/mfa/backup-authenticator/enroll', {
        method: 'POST',
        body: JSON.stringify({
          label: newAuthLabel.trim() || 'MCQ Admin Authenticator',
          secretKey: newAuthSetup.secretKey,
          verificationCode: newAuthCode.trim(),
        }),
      });

      setAuthSuccess('New Authenticator successfully enrolled.');
      setShowAddAuthModal(false);
      loadSecurityDetails();
    } catch (err: any) {
      setAuthError(err.message || 'Failed to verify and add authenticator.');
    } finally {
      setSubmittingAuth(false);
    }
  };

  const handleRemoveAuthenticator = async (authId: string, label: string) => {
    if (authenticators.length <= 1) {
      alert('Cannot remove the only registered authenticator. At least one MFA method is required for MCQ Admin.');
      return;
    }
    if (!confirm(`Are you sure you want to remove authenticator "${label}"?`)) {
      return;
    }

    try {
      await apiRequest('/api/auth/mfa/authenticators/remove', {
        method: 'POST',
        body: JSON.stringify({ authenticatorId: authId }),
      });
      loadSecurityDetails();
    } catch (err: any) {
      alert(err.message || 'Failed to remove authenticator.');
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    if (!confirm('Revoke trusted access for this device? Next login will require TOTP verification.')) {
      return;
    }
    try {
      await apiRequest('/api/auth/mfa/trusted-devices/revoke', {
        method: 'POST',
        body: JSON.stringify({ deviceId }),
      });
      loadSecurityDetails();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke device.');
    }
  };

  const handleRevokeAllDevices = async () => {
    if (!confirm('Revoke all trusted browsers? All sessions will require fresh TOTP verification.')) {
      return;
    }
    try {
      await apiRequest('/api/auth/mfa/trusted-devices/revoke-all', {
        method: 'POST',
      });
      loadSecurityDetails();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke trusted devices.');
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);
    if (!currPassword || !newPasswordVal) {
      setPasswordFeedback({ type: 'error', message: 'Current password and new password are required.' });
      return;
    }
    if (newPasswordVal.length < 8) {
      setPasswordFeedback({ type: 'error', message: 'New password must be at least 8 characters long.' });
      return;
    }
    if (newPasswordVal !== confirmPasswordVal) {
      setPasswordFeedback({ type: 'error', message: 'New password and confirmation do not match.' });
      return;
    }

    setPasswordUpdating(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: currPassword,
          newPassword: newPasswordVal,
          confirmPassword: confirmPasswordVal,
        }),
      });
      setPasswordFeedback({ type: 'success', message: 'Admin password changed successfully.' });
      setCurrPassword('');
      setNewPasswordVal('');
      setConfirmPasswordVal('');
    } catch (err: any) {
      setPasswordFeedback({ type: 'error', message: err.message || 'Failed to change password.' });
    } finally {
      setPasswordUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
          <p className="text-sm font-semibold text-slate-300">Verifying Admin Authorization...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user || (user.role !== 'MCQ_ADMIN' && user.role !== 'SUPER_ADMIN')) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* 1. ADMIN HEADER */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <McqArenaLogo size="sm" theme="dark" withGlow />
          <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30">
            MCQ Admin Portal
          </span>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-xs font-bold">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'overview' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            📊 Overview
          </button>
          <button
            onClick={() => setActiveTab('bank')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'bank' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            📚 Question Bank
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'add' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            ➕ Add Question
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'security' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            🔒 Security
          </button>
        </div>

        {/* User Badge, Super Admin indicator & Logout */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => navigate('/admin/dashboard')}
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 transition cursor-pointer"
              title="Return to Super Admin Dashboard"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Super Admin Dashboard</span>
            </button>
          )}

          <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
            {isSuperAdmin ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1 shrink-0">
                <ShieldCheck className="w-3 h-3 text-purple-400" />
                Super Admin Access
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 shrink-0">
                <Shield className="w-3 h-3 text-amber-400" />
                MCQ Admin
              </span>
            )}

            <div className="hidden md:flex flex-col text-right text-xs">
              <span className="font-bold text-slate-200">
                {isSuperAdmin ? 'Signed in as Super Admin' : (user?.fullName || 'MCQ Admin')}
              </span>
              <span className="text-[10px] text-slate-400 truncate max-w-[150px]">{user?.email}</span>
            </div>
          </div>

          <button
            onClick={() => {
              logout();
              navigate(isSuperAdmin ? '/login' : '/mcq-admin/login');
            }}
            title={isSuperAdmin ? 'Sign Out of Super Admin' : 'Log Out'}
            className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. BODY CONTENT */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Super Admin Direct Access Banner */}
        {isSuperAdmin && (
          <div className="bg-gradient-to-r from-purple-950/70 via-indigo-950/50 to-slate-900 border border-purple-800/50 rounded-2xl p-4 px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-600/30 text-purple-300 border border-purple-500/40 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-purple-300" />
              </div>
              <div>
                <p className="font-bold text-white flex items-center gap-2">
                  <span>Super Admin Privilege Active</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-900/60 border border-purple-700/60 text-purple-200">
                    role = super_admin
                  </span>
                </p>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Direct Super Admin access via your central authenticated session. No duplicate passwords, TOTP codes, or secondary credentials.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/admin/dashboard')}
              className="text-xs font-bold text-purple-200 hover:text-white px-3.5 py-1.5 rounded-xl bg-purple-900/50 hover:bg-purple-800/70 border border-purple-700/60 transition shrink-0 text-center cursor-pointer flex items-center justify-center gap-1.5 self-start sm:self-auto"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Super Admin</span>
            </button>
          </div>
        )}
        {/* TAB 1: OVERVIEW & STATS */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-white">Content Overview & Health</h2>
                <p className="text-xs text-slate-400">
                  Real-time question bank statistics, course distribution, and learner engagement.
                </p>
              </div>
              <button
                onClick={loadStats}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingStats ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/80">
                <div className="text-xs font-bold uppercase text-slate-400 mb-1">Total Question Bank</div>
                <div className="text-3xl font-black text-white">{stats?.totalQuestions || 0}</div>
                <div className="text-[11px] text-emerald-400 mt-1">
                  {stats?.publishedCount || 0} Published & Live
                </div>
              </div>

              <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/80">
                <div className="text-xs font-bold uppercase text-slate-400 mb-1">Course Breakdown</div>
                <div className="text-xs font-semibold text-slate-300 space-y-1 mt-2">
                  <div className="flex justify-between">
                    <span>Foundation:</span> <span className="font-bold">{stats?.byCourse.CA_FOUNDATION || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Intermediate:</span> <span className="font-bold">{stats?.byCourse.CA_INTERMEDIATE || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Final:</span> <span className="font-bold">{stats?.byCourse.CA_FINAL || 0}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/80">
                <div className="text-xs font-bold uppercase text-slate-400 mb-1">Question Formats</div>
                <div className="text-xs font-semibold text-slate-300 space-y-1 mt-2">
                  <div className="flex justify-between">
                    <span>Normal MCQs:</span> <span className="font-bold">{stats?.byType.normal || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Case-Based MCQs:</span> <span className="font-bold text-indigo-400">{stats?.byType.case_based || 0}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/80">
                <div className="text-xs font-bold uppercase text-slate-400 mb-1">Learner Sessions</div>
                <div className="text-3xl font-black text-blue-400">{stats?.totalSessionsAttempted || 0}</div>
                <div className="text-[11px] text-slate-400 mt-1">Total student practice sessions</div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="p-6 bg-gradient-to-r from-blue-950/60 to-indigo-950/60 border border-blue-800/40 rounded-2xl flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white">Ready to author new CA questions?</h3>
                <p className="text-xs text-blue-200/80">
                  Create single MCQs or comprehensive Case Study Scenarios with full statutory citations.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('add')}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/25 transition-all"
              >
                <Plus className="w-4 h-4" /> Add Question
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: QUESTION BANK */}
        {activeTab === 'bank' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/80 flex flex-col md:flex-row items-center justify-between gap-4">
              <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search question text, chapter, reference..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </form>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <select
                  value={filterCourse}
                  onChange={(e) => {
                    setFilterCourse(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-semibold text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ALL">All Courses</option>
                  <option value="CA_FOUNDATION">CA Foundation</option>
                  <option value="CA_INTERMEDIATE">CA Intermediate</option>
                  <option value="CA_FINAL">CA Final</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => {
                    setFilterStatus(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-semibold text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="published">Published</option>
                  <option value="review">Under Review</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            {/* Questions Table */}
            <div className="bg-slate-800/80 rounded-2xl border border-slate-700/80 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/60 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-700/60">
                    <tr>
                      <th className="py-3 px-4">Course & Subject</th>
                      <th className="py-3 px-4">Question</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Difficulty</th>
                      <th className="py-3 px-4">Correct</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/40">
                    {loadingQuestions ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          Loading questions...
                        </td>
                      </tr>
                    ) : questions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          No questions matching the selected filters.
                        </td>
                      </tr>
                    ) : (
                      questions.map((q) => (
                        <tr key={q.id} className="hover:bg-slate-750/50 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-slate-200">
                            <div>{q.course.replace('CA_', '')}</div>
                            <div className="text-[10px] text-slate-400 truncate max-w-xs">{q.subject}</div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-300 max-w-md">
                            <div className="truncate font-medium">{q.questionText}</div>
                            <div className="text-[10px] text-slate-500 truncate">{q.chapter}</div>
                          </td>
                          <td className="py-3.5 px-4 capitalize text-slate-300">
                            {q.questionType.replace('_', ' ')}
                          </td>
                          <td className="py-3.5 px-4 capitalize font-semibold">
                            <span
                              className={
                                q.difficulty === 'easy'
                                  ? 'text-emerald-400'
                                  : q.difficulty === 'hard'
                                  ? 'text-rose-400'
                                  : 'text-amber-400'
                              }
                            >
                              {q.difficulty}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-black text-emerald-400">
                            Option {q.correctAnswer}
                          </td>
                          <td className="py-3.5 px-4">
                            <select
                              value={q.status}
                              onChange={(e) => handleStatusChange(q.id, e.target.value as McqStatus)}
                              className="px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-[11px] font-bold text-slate-300"
                            >
                              <option value="published">Published</option>
                              <option value="review">Review</option>
                              <option value="draft">Draft</option>
                              <option value="archived">Archived</option>
                            </select>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setViewingQuestion(q)}
                                title="Preview Question"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditingQuestion(q)}
                                title="Edit Question"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-700 transition-colors"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteQuestion(q.id)}
                                title="Delete Question"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-700 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="p-3.5 px-4 bg-slate-900/60 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
                <span>Page {page} of {totalPages}</span>
                <div className="flex gap-1.5">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ADD QUESTION */}
        {activeTab === 'add' && (
          <div className="bg-slate-800/80 rounded-2xl border border-slate-700/80 p-6 space-y-6">
            <div>
              <h2 className="text-xl font-black text-white">Add New CA Question</h2>
              <p className="text-xs text-slate-400">
                Enter structured question metadata, case scenarios, 4 options, authoritative ICAI solution, and standard references.
              </p>
            </div>

            {formFeedback && (
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                  formFeedback.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
                }`}
              >
                {formFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                )}
                <span>{formFeedback.message}</span>
              </div>
            )}

            <form onSubmit={handleCreateQuestion} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Course Level *</label>
                  <select
                    value={newQuestion.course}
                    onChange={(e) => setNewQuestion({ ...newQuestion, course: e.target.value as McqCourse })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                  >
                    <option value="CA_FOUNDATION">CA Foundation</option>
                    <option value="CA_INTERMEDIATE">CA Intermediate</option>
                    <option value="CA_FINAL">CA Final</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Subject *</label>
                  <input
                    type="text"
                    required
                    value={newQuestion.subject}
                    onChange={(e) => setNewQuestion({ ...newQuestion, subject: e.target.value })}
                    placeholder="e.g. Corporate and Other Laws"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Chapter *</label>
                  <input
                    type="text"
                    required
                    value={newQuestion.chapter}
                    onChange={(e) => setNewQuestion({ ...newQuestion, chapter: e.target.value })}
                    placeholder="e.g. Management & Administration"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Question Type</label>
                  <select
                    value={newQuestion.questionType}
                    onChange={(e) => setNewQuestion({ ...newQuestion, questionType: e.target.value as McqQuestionType })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                  >
                    <option value="normal">Normal MCQ</option>
                    <option value="case_based">Case-Based MCQ</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Difficulty</label>
                  <select
                    value={newQuestion.difficulty}
                    onChange={(e) => setNewQuestion({ ...newQuestion, difficulty: e.target.value as McqDifficulty })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                  >
                    <option value="easy">Easy</option>
                    <option value="moderate">Moderate</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Source</label>
                  <input
                    type="text"
                    value={newQuestion.source}
                    onChange={(e) => setNewQuestion({ ...newQuestion, source: e.target.value as any })}
                    placeholder="ICAI Module / PYQ / RTP / MTP"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Exam Attempt</label>
                  <input
                    type="text"
                    value={newQuestion.attempt}
                    onChange={(e) => setNewQuestion({ ...newQuestion, attempt: e.target.value })}
                    placeholder="e.g. May 2025"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              {/* Case Study Scenario (Optional or Required for Case-Based) */}
              {newQuestion.questionType === 'case_based' && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    ICAI Case Scenario / Background Text *
                  </label>
                  <textarea
                    rows={4}
                    value={newQuestion.caseStudyScenario || ''}
                    onChange={(e) => setNewQuestion({ ...newQuestion, caseStudyScenario: e.target.value })}
                    placeholder="Provide the comprehensive factual case background..."
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white font-mono"
                  />
                </div>
              )}

              {/* Question Text */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Question Prompt *</label>
                <textarea
                  rows={3}
                  required
                  value={newQuestion.questionText}
                  onChange={(e) => setNewQuestion({ ...newQuestion, questionText: e.target.value })}
                  placeholder="Enter the precise MCQ question text..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              {/* Options A, B, C, D */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(['A', 'B', 'C', 'D'] as const).map((opt) => (
                  <div key={opt}>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Option {opt} *</label>
                    <input
                      type="text"
                      required
                      value={newQuestion[`option${opt}` as keyof McqQuestion] as string || ''}
                      onChange={(e) =>
                        setNewQuestion({ ...newQuestion, [`option${opt}`]: e.target.value })
                      }
                      placeholder={`Enter text for Option ${opt}`}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Correct Answer *</label>
                  <select
                    value={newQuestion.correctAnswer}
                    onChange={(e) => setNewQuestion({ ...newQuestion, correctAnswer: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-black text-emerald-400"
                  >
                    <option value="A">Option A</option>
                    <option value="B">Option B</option>
                    <option value="C">Option C</option>
                    <option value="D">Option D</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Statutory / ICAI Standard Citation
                  </label>
                  <input
                    type="text"
                    value={newQuestion.reference || ''}
                    onChange={(e) => setNewQuestion({ ...newQuestion, reference: e.target.value })}
                    placeholder="e.g. Companies Act 2013, Section 103(1)(a)(ii) & Module Ch 7"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              {/* Explanation */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Authoritative Step-by-Step Explanation *
                </label>
                <textarea
                  rows={4}
                  required
                  value={newQuestion.explanation}
                  onChange={(e) => setNewQuestion({ ...newQuestion, explanation: e.target.value })}
                  placeholder="Provide rigorous legal, standard, or numerical justification..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white leading-relaxed"
                />
              </div>

              <button
                type="submit"
                disabled={formSubmitting}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-500/25 transition-all flex items-center gap-2"
              >
                {formSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Save and Publish Question
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: SECURITY & MFA SETTINGS */}
        {activeTab === 'security' && (
          <div className="bg-slate-800/80 rounded-2xl border border-slate-700/80 p-6 space-y-8">
            {isSuperAdmin && (
              <div className="p-4 sm:p-5 bg-gradient-to-r from-purple-950/80 via-slate-900 to-indigo-950/80 border border-purple-800/60 rounded-xl space-y-3">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-purple-400" />
                  <h3 className="text-sm font-bold text-white">Centralized Super Admin Security Architecture</h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-900/60 border border-purple-700/60 text-purple-200">
                    Active Session: {user?.email}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  As Super Administrator, your access to the MCQ Admin Portal inherits your existing authenticated session and MFA verification. No secondary password or separate TOTP secret is generated for your account. The separate MCQ Admin account (<code className="text-amber-300 font-mono">priyatca15@gmail.com</code>) maintains independent credentials and MFA enrollment.
                </p>
                <div className="pt-1 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate('/admin/users')}
                    className="text-xs font-bold text-purple-200 hover:text-white px-3.5 py-1.5 rounded-lg bg-purple-900/60 hover:bg-purple-800/80 border border-purple-700/70 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Manage Platform Users & MFA in Super Admin Portal</span>
                    <ArrowLeft className="w-3 h-3 rotate-180" />
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-700">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <ShieldCheck className="w-6 h-6 text-amber-400" /> MCQ Admin Security & Authenticators
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Mandatory TOTP Multi-Factor Authentication policy and 365-day trusted device token management.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenAddAuthenticator}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-slate-950 text-xs font-black rounded-xl shadow-md transition-all self-start sm:self-auto"
              >
                <PlusCircle className="w-4 h-4" /> Add Authenticator
              </button>
            </div>

            {authSuccess && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{authSuccess}</span>
              </div>
            )}

            {/* SECTION 1: AUTHENTICATOR DEVICES */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-400" /> Authenticator Devices
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Connect multiple authenticator apps (Google Authenticator, Microsoft Authenticator, Authy).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenAddAuthenticator}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-md transition-all self-start sm:self-auto"
                >
                  <PlusCircle className="w-4 h-4" /> + Add Authenticator Device
                </button>
              </div>

              {loadingSecurity ? (
                <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" /> Loading authenticator devices...
                </div>
              ) : authenticators.length === 0 ? (
                <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-700/60 text-xs text-slate-400">
                  Primary Authenticator is active for {user?.email}. You can register additional devices (e.g. Work Laptop, Backup Mobile).
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {authenticators.map((auth, idx) => (
                    <div
                      key={auth.id || idx}
                      className="p-4 bg-slate-900/90 rounded-xl border border-slate-700/80 flex items-start justify-between gap-3 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 text-base">🟢</div>
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-2">
                            <span>{auth.label || `Device ${idx + 1}`}</span>
                          </div>
                          <div className="text-[11px] text-emerald-400 font-semibold mt-0.5">
                            Active
                          </div>
                          <div className="text-[10px] text-slate-400 mt-1">
                            Added: {auth.createdAt ? new Date(auth.createdAt).toLocaleDateString('en-IN') : 'Enrolled'}
                            {auth.lastUsedAt && ` • Last used: ${new Date(auth.lastUsedAt).toLocaleDateString('en-IN')}`}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveAuthenticator(auth.id, auth.label || `Device ${idx + 1}`)}
                        disabled={authenticators.length <= 1}
                        title={authenticators.length <= 1 ? 'Cannot revoke the only active device' : 'Revoke this device'}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-400 border border-slate-700 transition-colors text-[11px] font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SECTION 2: 365-DAY TRUSTED DEVICES */}
            <div className="space-y-3 pt-4 border-t border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Laptop className="w-4 h-4 text-emerald-400" /> 365-Day Trusted Browsers & Devices
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Trusted devices authenticate using cryptographically verified tokens for 365 days.
                  </p>
                </div>
                {trustedDevices.length > 0 && (
                  <button
                    type="button"
                    onClick={handleRevokeAllDevices}
                    className="px-3 py-1.5 bg-rose-950/60 border border-rose-800 text-rose-300 hover:bg-rose-900/60 text-xs font-bold rounded-lg transition-colors"
                  >
                    Revoke All Devices
                  </button>
                )}
              </div>

              {trustedDevices.length === 0 ? (
                <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-700/40 text-xs text-slate-400">
                  No trusted devices are currently registered. Check the "Trust this browser for 365 days" box on next login to register this device.
                </div>
              ) : (
                <div className="space-y-2">
                  {trustedDevices.map((dev) => (
                    <div
                      key={dev.id}
                      className="p-3 px-4 bg-slate-900/60 rounded-xl border border-slate-700/60 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <Laptop className="w-4 h-4 text-blue-400 shrink-0" />
                        <div>
                          <div className="font-bold text-slate-200 flex items-center gap-2">
                            <span>{dev.deviceName || `${dev.browser || 'Browser'} on ${dev.os || 'OS'}`}</span>
                            {dev.isCurrentDevice && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
                                Current Browser
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Trusted on: {dev.trustedAt ? new Date(dev.trustedAt).toLocaleDateString('en-IN') : 'Active'} • Expires: {dev.expiresAt ? new Date(dev.expiresAt).toLocaleDateString('en-IN') : 'In 365 Days'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRevokeDevice(dev.id)}
                        className="px-3 py-1 rounded bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-400 border border-slate-700 transition-colors text-[11px] font-bold"
                      >
                        Revoke Trust
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SECTION 3: CHANGE ADMIN PASSWORD */}
            <div className="space-y-4 pt-4 border-t border-slate-700">
              <div>
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400" /> Update Admin Password
                </h3>
                <p className="text-[11px] text-slate-400">
                  Update your MCQ Admin password. Password changes do not reset your registered TOTP authenticators.
                </p>
              </div>

              {passwordFeedback && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    passwordFeedback.type === 'success'
                      ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                      : 'bg-rose-950/60 border-rose-800 text-rose-300'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{passwordFeedback.message}</span>
                </div>
              )}

              <form onSubmit={handleUpdatePassword} className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">Current Password</label>
                  <input
                    type="password"
                    required
                    value={currPassword}
                    onChange={(e) => setCurrPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">New Password (Min 8 chars)</label>
                  <input
                    type="password"
                    required
                    value={newPasswordVal}
                    onChange={(e) => setNewPasswordVal(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    required
                    value={confirmPasswordVal}
                    onChange={(e) => setConfirmPasswordVal(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>

                <div className="sm:col-span-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={passwordUpdating}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow transition-all disabled:opacity-50"
                  >
                    {passwordUpdating ? 'Updating Password...' : 'Save New Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      {/* ADD BACKUP AUTHENTICATOR MODAL */}
      {showAddAuthModal && newAuthSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-700 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-amber-400" />
                <span className="text-sm font-bold text-white">Add Authenticator</span>
              </div>
              <button onClick={() => setShowAddAuthModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {authError && (
              <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleEnrollBackupAuthenticator} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Device / Authenticator Name
                </label>
                <input
                  type="text"
                  required
                  value={newAuthLabel}
                  onChange={(e) => setNewAuthLabel(e.target.value)}
                  placeholder="e.g. Priya iPhone 15 or MacBook"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              {/* QR Code */}
              <div className="flex justify-center p-3 bg-white rounded-xl border border-amber-500/50 max-w-[190px] mx-auto shadow-inner">
                <img
                  src={newAuthSetup.qrDataUrl}
                  alt="New Authenticator QR"
                  className="w-40 h-40 object-contain"
                />
              </div>

              {/* Manual Key */}
              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-center space-y-1">
                <div className="text-[10px] text-slate-400">Manual Setup Key:</div>
                <div className="flex items-center justify-center gap-2">
                  <code className="text-xs font-mono font-bold text-amber-400 tracking-wider">
                    {newAuthSetup.formattedKey}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(newAuthSetup.secretKey);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    }}
                    className="p-1 rounded text-slate-400 hover:text-white"
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  6-Digit Verification Code from this app
                </label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={newAuthCode}
                  onChange={(e) => setNewAuthCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full px-3 py-2 bg-slate-950 text-center tracking-[0.4em] font-mono font-bold text-lg border border-slate-700 rounded-xl text-amber-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAuthModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAuth || newAuthCode.length !== 6}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow transition-all disabled:opacity-50"
                >
                  {submittingAuth ? 'Verifying...' : 'Verify & Add Device'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </main>

      {/* VIEW PREVIEW MODAL */}
      {viewingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-slate-800 rounded-2xl border border-slate-700 p-6 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700">
              <span className="text-xs font-black uppercase text-blue-400">
                {viewingQuestion.course.replace('CA_', '')} • {viewingQuestion.subject}
              </span>
              <button onClick={() => setViewingQuestion(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {viewingQuestion.caseStudyScenario && (
              <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-700/60 text-xs text-slate-300 whitespace-pre-line">
                <div className="font-bold text-indigo-400 mb-1">Case Scenario:</div>
                {viewingQuestion.caseStudyScenario}
              </div>
            )}

            <div className="text-base font-bold text-white">{viewingQuestion.questionText}</div>

            <div className="space-y-2">
              {(['A', 'B', 'C', 'D'] as const).map((opt) => (
                <div
                  key={opt}
                  className={`p-3 rounded-xl border text-xs flex items-center gap-3 ${
                    viewingQuestion.correctAnswer === opt
                      ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200 font-bold'
                      : 'border-slate-700 bg-slate-900/60 text-slate-300'
                  }`}
                >
                  <span className="w-6 h-6 rounded-md bg-slate-800 flex items-center justify-center font-black">
                    {opt}
                  </span>
                  <span>{viewingQuestion[`option${opt}` as keyof McqQuestion] as string}</span>
                  {viewingQuestion.correctAnswer === opt && (
                    <span className="ml-auto text-[10px] uppercase font-bold text-emerald-400">
                      Correct Answer
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="p-4 bg-blue-950/40 border border-blue-900/60 rounded-xl space-y-2 text-xs text-slate-300">
              <div className="font-bold text-blue-300">ICAI Explanation:</div>
              <div className="leading-relaxed">{viewingQuestion.explanation}</div>
              {viewingQuestion.reference && (
                <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-700">
                  Ref: {viewingQuestion.reference}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-slate-800 rounded-2xl border border-slate-700 p-6 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700">
              <span className="text-sm font-bold text-white">Edit Question</span>
              <button onClick={() => setEditingQuestion(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateQuestion} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Question Prompt</label>
                <textarea
                  rows={3}
                  required
                  value={editingQuestion.questionText || ''}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, questionText: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(['A', 'B', 'C', 'D'] as const).map((opt) => (
                  <div key={opt}>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Option {opt}</label>
                    <input
                      type="text"
                      required
                      value={(editingQuestion[`option${opt}` as keyof McqQuestion] as string) || ''}
                      onChange={(e) =>
                        setEditingQuestion({ ...editingQuestion, [`option${opt}`]: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Correct Answer</label>
                <select
                  value={editingQuestion.correctAnswer || 'A'}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, correctAnswer: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-bold text-emerald-400"
                >
                  <option value="A">Option A</option>
                  <option value="B">Option B</option>
                  <option value="C">Option C</option>
                  <option value="D">Option D</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Explanation</label>
                <textarea
                  rows={3}
                  required
                  value={editingQuestion.explanation || ''}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, explanation: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingQuestion(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
