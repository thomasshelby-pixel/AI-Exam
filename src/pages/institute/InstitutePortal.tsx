import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { apiRequest } from '../../api/client.js';
import {
  Building2,
  LayoutDashboard,
  Users,
  GraduationCap,
  Layers,
  FileText,
  FileCheck2,
  Award,
  BarChart3,
  Calendar,
  Bell,
  Settings,
  Search,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Lock,
  ChevronRight,
  Clock,
  ExternalLink,
  Edit3,
  LogOut,
} from 'lucide-react';

export const InstitutePortal: React.FC = () => {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  // Determine subroute from pathname
  const pathParts = location.pathname.split('/').filter(Boolean);
  // /institute or /institute/dashboard -> 'dashboard'
  const activeSection = pathParts[1] || 'dashboard';
  const subId = pathParts[2]; // e.g. student id if /institute/students/:id

  // Data states
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Dashboard & Overview
  const [dashboardData, setDashboardData] = useState<any>(null);

  // Profile
  const [profileData, setProfileData] = useState<any>(null);
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    address: '',
    website: '',
    contactPerson: '',
  });

  // Students
  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<any>(null);
  const [showAddStudentModal, setShowAddStudentModal] = useState<boolean>(false);
  const [newStudentForm, setNewStudentForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    icaiRegistrationNumber: '',
    caLevel: 'INTERMEDIATE',
    batchId: '',
  });

  // Batches
  const [batchesList, setBatchesList] = useState<any[]>([]);
  const [showCreateBatchModal, setShowCreateBatchModal] = useState<boolean>(false);
  const [newBatchForm, setNewBatchForm] = useState({
    name: '',
    courseLevel: 'INTERMEDIATE',
    targetAttempt: 'May 2026',
    description: '',
  });

  // Assignments & Tests
  const [assignmentsList, setAssignmentsList] = useState<any[]>([]);
  const [testsList, setTestsList] = useState<any[]>([]);
  const [showCreateTestModal, setShowCreateTestModal] = useState<boolean>(false);
  const [newTestForm, setNewTestForm] = useState({
    title: '',
    subjectKey: 'inter_advanced_accounting',
    subjectName: 'Advanced Accounting',
    maximumMarks: '100',
    instructions: '',
    timeLimitMinutes: '180',
    deadline: '',
    batchId: '',
  });

  // Evaluations, Results, Analytics
  const [evaluationsList, setEvaluationsList] = useState<any[]>([]);
  const [resultsData, setResultsData] = useState<any>(null);
  const [analyticsData, setAnalyticsData] = useState<any>(null);

  // Subscription, Notifications, Settings
  const [subscriptionData, setSubscriptionData] = useState<any>(null);
  const [notificationsList, setNotificationsList] = useState<any[]>([]);
  const [settingsData, setSettingsData] = useState<any>(null);

  // Fetch section data
  const loadSectionData = async () => {
    try {
      setLoadingData(true);
      setErrorMsg('');

      switch (activeSection) {
        case 'dashboard': {
          const res = await apiRequest<any>('/api/institute/dashboard');
          setDashboardData(res);
          break;
        }
        case 'profile': {
          const res = await apiRequest<{ institute: any }>('/api/institute/profile');
          setProfileData(res.institute);
          if (res.institute) {
            setProfileForm({
              name: res.institute.name || '',
              phone: res.institute.phone || '',
              address: res.institute.address || '',
              website: res.institute.website || '',
              contactPerson: res.institute.contact_person || '',
            });
          }
          break;
        }
        case 'students': {
          if (subId) {
            const detailRes = await apiRequest<any>(`/api/institute/students/${subId}`);
            setSelectedStudentDetail(detailRes);
          } else {
            const res = await apiRequest<{ students: any[] }>(`/api/institute/students?search=${encodeURIComponent(studentSearch)}`);
            setStudentsList(res.students || []);
          }
          const batchRes = await apiRequest<{ batches: any[] }>('/api/institute/batches');
          setBatchesList(batchRes.batches || []);
          break;
        }
        case 'batches': {
          const res = await apiRequest<{ batches: any[] }>('/api/institute/batches');
          setBatchesList(res.batches || []);
          break;
        }
        case 'assignments': {
          const res = await apiRequest<{ assignments: any[] }>('/api/institute/assignments');
          setAssignmentsList(res.assignments || []);
          const bRes = await apiRequest<{ batches: any[] }>('/api/institute/batches');
          setBatchesList(bRes.batches || []);
          break;
        }
        case 'tests': {
          const res = await apiRequest<{ tests: any[] }>('/api/institute/tests');
          setTestsList(res.tests || []);
          const bRes = await apiRequest<{ batches: any[] }>('/api/institute/batches');
          setBatchesList(bRes.batches || []);
          break;
        }
        case 'evaluations': {
          const res = await apiRequest<{ evaluations: any[] }>('/api/institute/evaluations');
          setEvaluationsList(res.evaluations || []);
          break;
        }
        case 'results': {
          const res = await apiRequest<any>('/api/institute/results');
          setResultsData(res);
          break;
        }
        case 'analytics': {
          const res = await apiRequest<any>('/api/institute/analytics');
          setAnalyticsData(res);
          break;
        }
        case 'subscription': {
          const res = await apiRequest<any>('/api/institute/subscription');
          setSubscriptionData(res);
          break;
        }
        case 'notifications': {
          const res = await apiRequest<{ notifications: any[] }>('/api/institute/notifications');
          setNotificationsList(res.notifications || []);
          break;
        }
        case 'settings': {
          const res = await apiRequest<any>('/api/institute/settings');
          setSettingsData(res);
          break;
        }
        default:
          break;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load institute data';
      setErrorMsg(msg);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && (user?.role === 'INSTITUTE_ADMIN' || user?.role === 'SUPER_ADMIN')) {
      loadSectionData();
    }
  }, [activeSection, subId, isAuthenticated, user]);

  // Update Profile
  const handleUpdateProfile = async () => {
    try {
      await apiRequest('/api/institute/profile', {
        method: 'PUT',
        body: JSON.stringify(profileForm),
      });
      setSuccessMsg('Institute profile saved successfully.');
      loadSectionData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save profile');
    }
  };

  // Create Student
  const handleCreateStudent = async () => {
    if (!newStudentForm.fullName || !newStudentForm.email) {
      setErrorMsg('Student name and email are required');
      return;
    }
    try {
      await apiRequest('/api/institute/students', {
        method: 'POST',
        body: JSON.stringify(newStudentForm),
      });
      setShowAddStudentModal(false);
      setNewStudentForm({
        fullName: '',
        email: '',
        phone: '',
        icaiRegistrationNumber: '',
        caLevel: 'INTERMEDIATE',
        batchId: '',
      });
      setSuccessMsg('Student enrolled successfully.');
      loadSectionData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to enroll student');
    }
  };

  // Create Batch
  const handleCreateBatch = async () => {
    if (!newBatchForm.name) {
      setErrorMsg('Batch name is required');
      return;
    }
    try {
      await apiRequest('/api/institute/batches', {
        method: 'POST',
        body: JSON.stringify(newBatchForm),
      });
      setShowCreateBatchModal(false);
      setNewBatchForm({
        name: '',
        courseLevel: 'INTERMEDIATE',
        targetAttempt: 'May 2026',
        description: '',
      });
      setSuccessMsg('Batch created successfully.');
      loadSectionData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create batch');
    }
  };

  // Create Scheduled Test
  const handleCreateTest = async () => {
    if (!newTestForm.title || !newTestForm.deadline) {
      setErrorMsg('Test title and submission deadline are required');
      return;
    }
    try {
      await apiRequest('/api/institute/tests', {
        method: 'POST',
        body: JSON.stringify(newTestForm),
      });
      setShowCreateTestModal(false);
      setNewTestForm({
        title: '',
        subjectKey: 'inter_advanced_accounting',
        subjectName: 'Advanced Accounting',
        maximumMarks: '100',
        instructions: '',
        timeLimitMinutes: '180',
        deadline: '',
        batchId: '',
      });
      setSuccessMsg('Mock Test scheduled successfully.');
      loadSectionData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to schedule test');
    }
  };

  // RBAC GUARD
  if (isLoading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm font-semibold text-slate-600">Verifying Institute Authorization...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md w-full text-center shadow-lg">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 border border-blue-200">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Institute Portal Sign-In</h2>
          <p className="text-xs text-slate-500 mb-6">
            Please sign in with your authorized coaching institute or academy credentials to access your portal.
          </p>
          <button
            onClick={() => navigate('/login?redirect=/institute/dashboard')}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition"
          >
            Sign In as Institute Administrator
          </button>
        </div>
      </div>
    );
  }

  if (user?.role !== 'INSTITUTE_ADMIN' && user?.role !== 'SUPER_ADMIN') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="bg-white border border-rose-200 rounded-xl p-8 max-w-md w-full text-center shadow-lg">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-200">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied (HTTP 403)</h2>
          <p className="text-xs text-slate-500 mb-6">
            Your current account role is Student. The Institute Portal is restricted to verified CA coaching academies and institutional partners.
          </p>
          <button
            onClick={() => navigate('/student/dashboard')}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-sm transition"
          >
            Return to Student Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Institute navigation items
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'profile', label: 'Institute Profile', icon: Building2 },
    { id: 'students', label: 'Students', icon: GraduationCap },
    { id: 'batches', label: 'Batches', icon: Layers },
    { id: 'assignments', label: 'Assignments', icon: FileText },
    { id: 'tests', label: 'Tests / Mock Tests', icon: Clock },
    { id: 'evaluations', label: 'Evaluations', icon: FileCheck2 },
    { id: 'results', label: 'Results & Rankings', icon: Award },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'subscription', label: 'Subscription & Quota', icon: Calendar },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex">
      {/* Institute Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800">
        <div className="p-4 border-b border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="truncate">
            <h1 className="text-sm font-bold text-white tracking-wide truncate">Institute Portal</h1>
            <p className="text-[10px] text-indigo-400 font-medium truncate">Coaching Management</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(`/institute/${item.id}`)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800 text-[11px] text-slate-400 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="truncate pr-2">
              <p className="text-white font-bold truncate">{user?.fullName}</p>
              <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
            </div>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shrink-0">
              INSTITUTE
            </span>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
            <button
              onClick={() => navigate('/')}
              className="flex-1 py-1.5 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-semibold transition text-center cursor-pointer"
            >
              Public Site
            </button>
            <button
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className="py-1.5 px-2.5 rounded bg-rose-900/30 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 hover:text-white text-[10px] font-semibold transition flex items-center gap-1 cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-3 h-3" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-slate-900 capitalize tracking-tight">
              {navItems.find((n) => n.id === activeSection)?.label || 'Overview'}
            </h2>
            <span className="text-xs text-slate-400">/institute/{activeSection}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadSectionData}
              disabled={loadingData}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>
        </header>

        {/* Alerts */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg('')} className="text-rose-600 hover:text-rose-900 font-bold">✕</button>
          </div>
        )}

        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg('')} className="text-emerald-600 hover:text-emerald-900 font-bold">✕</button>
          </div>
        )}

        {/* Dynamic Section Rendering */}
        <main className="flex-1 overflow-y-auto p-6">
          {loadingData && (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" />
              <p className="text-xs text-slate-500">Loading {activeSection} data...</p>
            </div>
          )}

          {!loadingData && (
            <>
              {/* 1. DASHBOARD */}
              {activeSection === 'dashboard' && dashboardData && (
                <div className="space-y-6">
                  {/* Top Metric Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                      <p className="text-xs text-slate-500 font-medium">Enrolled Students</p>
                      <p className="text-xl font-bold text-slate-900 mt-1">{dashboardData.metrics?.totalStudents || 0}</p>
                      <p className="text-[10px] text-indigo-600 mt-1">
                        Quota: {dashboardData.metrics?.totalStudents || 0} / {dashboardData.institute?.max_students || 500}
                      </p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                      <p className="text-xs text-slate-500 font-medium">Active Batches</p>
                      <p className="text-xl font-bold text-slate-900 mt-1">{dashboardData.metrics?.totalBatches || 0}</p>
                      <p className="text-[10px] text-emerald-600 mt-1">Foundation / Inter / Final</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                      <p className="text-xs text-slate-500 font-medium">Evaluations Completed</p>
                      <p className="text-xl font-bold text-slate-900 mt-1">{dashboardData.metrics?.totalEvaluations || 0}</p>
                      <p className="text-[10px] text-blue-600 mt-1">Student Answer Sheets</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                      <p className="text-xs text-slate-500 font-medium">Batch Average Score</p>
                      <p className="text-xl font-bold text-slate-900 mt-1">
                        {Math.round((dashboardData.metrics?.averageScore || 0) * 10) / 10}%
                      </p>
                      <p className="text-[10px] text-purple-600 mt-1">ICAI Step Marking Standard</p>
                    </div>
                  </div>

                  {/* Batches & Recent Submissions */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center justify-between">
                        <span>Active Batches</span>
                        <Link to="/institute/batches" className="text-indigo-600 hover:underline text-[11px] normal-case font-normal">View all</Link>
                      </h3>
                      <div className="space-y-3">
                        {dashboardData.batches?.length === 0 && (
                          <p className="text-xs text-slate-400 italic">No batches created yet.</p>
                        )}
                        {dashboardData.batches?.map((b: any) => (
                          <div key={b.id} className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                            <div>
                              <p className="font-bold text-slate-800">{b.name}</p>
                              <p className="text-[10px] text-slate-500">{b.course_level} • Target: {b.target_attempt || 'May 2026'}</p>
                            </div>
                            <span className="font-mono font-bold text-indigo-600 text-xs">{b.student_count || 0} students</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center justify-between">
                        <span>Recent Student Evaluations</span>
                        <Link to="/institute/evaluations" className="text-indigo-600 hover:underline text-[11px] normal-case font-normal">View all</Link>
                      </h3>
                      <div className="space-y-3">
                        {dashboardData.recentEvaluations?.length === 0 && (
                          <p className="text-xs text-slate-400 italic">No evaluations yet.</p>
                        )}
                        {dashboardData.recentEvaluations?.map((ev: any) => (
                          <div key={ev.id} className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                            <div>
                              <p className="font-bold text-slate-800">{ev.student_name}</p>
                              <p className="text-[10px] text-slate-500">{ev.subject_name}</p>
                            </div>
                            <div className="text-right">
                              <span className="font-mono font-bold text-indigo-600 text-sm">{ev.total_marks}/{ev.maximum_marks}</span>
                              <p className="text-[10px] text-slate-400">{ev.percentage}%</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. PROFILE */}
              {activeSection === 'profile' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs max-w-xl">
                  <div className="mb-5">
                    <h3 className="text-sm font-bold text-slate-900">Institute Profile & Branding</h3>
                    <p className="text-xs text-slate-500">Official details registered for your coaching organization</p>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Institute Name</label>
                      <input
                        type="text"
                        value={profileForm.name}
                        onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Contact Person / Director</label>
                      <input
                        type="text"
                        value={profileForm.contactPerson}
                        onChange={(e) => setProfileForm({ ...profileForm, contactPerson: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Phone Number</label>
                      <input
                        type="text"
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Campus Address</label>
                      <input
                        type="text"
                        value={profileForm.address}
                        onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Official Website</label>
                      <input
                        type="text"
                        value={profileForm.website}
                        onChange={(e) => setProfileForm({ ...profileForm, website: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                      />
                    </div>

                    <button
                      onClick={handleUpdateProfile}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition cursor-pointer"
                    >
                      Save Profile Changes
                    </button>
                  </div>
                </div>
              )}

              {/* 3. STUDENTS (List or Detail) */}
              {activeSection === 'students' && !subId && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex flex-col sm:flex-row gap-3 items-center justify-between mb-5">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="relative w-full sm:w-64">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search enrolled students..."
                          value={studentSearch}
                          onChange={(e) => setStudentSearch(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && loadSectionData()}
                          className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => setShowAddStudentModal(true)}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Enroll Student
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          <th className="py-2.5 px-3 font-bold">Student Name</th>
                          <th className="py-2.5 px-3 font-bold">ICAI Registration</th>
                          <th className="py-2.5 px-3 font-bold">Batch</th>
                          <th className="py-2.5 px-3 font-bold">Status</th>
                          <th className="py-2.5 px-3 font-bold">Evaluations</th>
                          <th className="py-2.5 px-3 font-bold">Avg Score</th>
                          <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {studentsList.map((st) => (
                          <tr key={st.id} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3">
                              <p className="font-bold text-slate-900">{st.full_name}</p>
                              <p className="text-[11px] text-slate-400">{st.email}</p>
                            </td>
                            <td className="py-2.5 px-3 font-mono">{st.icai_registration_number || 'N/A'}</td>
                            <td className="py-2.5 px-3">{st.batch_name || 'Unassigned'}</td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                st.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {st.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold">{st.evaluations_count || 0}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-indigo-600">
                              {st.average_percentage !== null ? `${Math.round(st.average_percentage)}%` : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() => navigate(`/institute/students/${st.id}`)}
                                className="px-2 py-1 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                              >
                                View Performance
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* STUDENT DETAIL VIEW */}
              {activeSection === 'students' && subId && selectedStudentDetail && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => navigate('/institute/students')}
                      className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-semibold"
                    >
                      ← Back to Student Roster
                    </button>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">{selectedStudentDetail.student?.full_name}</h3>
                        <p className="text-xs text-slate-500">{selectedStudentDetail.student?.email} • {selectedStudentDetail.student?.phone || 'No phone'}</p>
                        <p className="text-xs text-slate-600 mt-2 font-mono">
                          ICAI Reg: {selectedStudentDetail.student?.icai_registration_number || 'N/A'} • Level: {selectedStudentDetail.student?.ca_level}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-1 rounded text-xs font-bold bg-indigo-50 text-indigo-700">
                          Batch: {selectedStudentDetail.membership?.batch_name || 'Unassigned'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4">Evaluation History</h4>
                    <div className="space-y-3">
                      {selectedStudentDetail.evaluations?.map((ev: any) => (
                        <div key={ev.id} className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                          <div>
                            <p className="font-bold text-slate-800">{ev.subject_name}</p>
                            <p className="text-[10px] text-slate-400">{new Date(ev.created_at).toLocaleDateString()}</p>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-indigo-600">{ev.total_marks}/{ev.maximum_marks} ({ev.percentage}%)</span>
                            <p className="text-[10px] text-slate-500">Grade: {ev.grade || 'Pass'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 4. BATCHES */}
              {activeSection === 'batches' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Coaching Batches & Cohorts</h3>
                      <p className="text-xs text-slate-500">Group students into syllabus classes and exam attempt batches</p>
                    </div>
                    <button
                      onClick={() => setShowCreateBatchModal(true)}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Create New Batch
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {batchesList.map((b) => (
                      <div key={b.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 shadow-xs">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-xs text-slate-900">{b.name}</h4>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700">
                            {b.course_level}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mb-3">{b.description || 'Target: ' + b.target_attempt}</p>
                        <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-200">
                          <span className="font-mono text-slate-600 font-bold">{b.student_count || 0} Students</span>
                          <span className="text-[10px] text-slate-400">Target: {b.target_attempt}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 5. ASSIGNMENTS */}
              {activeSection === 'assignments' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Institute Homework & Answer Writing Practice</h3>
                      <p className="text-xs text-slate-500">Assign specific question sets with ICAI step marking rules</p>
                    </div>
                    <button
                      onClick={() => setShowCreateTestModal(true)}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      New Assignment
                    </button>
                  </div>

                  <div className="space-y-3">
                    {assignmentsList.length === 0 && (
                      <p className="text-xs text-slate-400 italic py-4">No assignments published yet.</p>
                    )}
                    {assignmentsList.map((a) => (
                      <div key={a.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50/60 text-xs flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{a.title}</p>
                          <p className="text-slate-500">{a.subject_name} • Max Marks: {a.maximum_marks}</p>
                          <p className="text-[10px] text-slate-400 mt-1">Due: {new Date(a.deadline).toLocaleDateString()}</p>
                        </div>
                        <span className="font-mono font-bold text-indigo-600 text-sm">{a.submissions_count || 0} Submissions</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 6. TESTS */}
              {activeSection === 'tests' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Mock Tests & Exam Simulation</h3>
                      <p className="text-xs text-slate-500">Full 3-hour timed exam papers with auto AI step-evaluation</p>
                    </div>
                    <button
                      onClick={() => setShowCreateTestModal(true)}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Schedule Mock Test
                    </button>
                  </div>

                  <div className="space-y-3">
                    {testsList.length === 0 && (
                      <p className="text-xs text-slate-400 italic py-4">No tests scheduled yet.</p>
                    )}
                    {testsList.map((t) => (
                      <div key={t.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50/60 text-xs flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{t.title}</p>
                          <p className="text-slate-500">{t.subject_name} • Duration: {t.time_limit_minutes || 180} mins</p>
                          <p className="text-[10px] text-slate-400 mt-1">Exam Date: {new Date(t.deadline).toLocaleString()}</p>
                        </div>
                        <span className="font-mono font-bold text-indigo-600 text-sm">{t.submissions_count || 0} Evaluated</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 7. EVALUATIONS */}
              {activeSection === 'evaluations' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Institute Student Evaluations</h3>
                      <p className="text-xs text-slate-500">Answer sheets checked under your institute license</p>
                    </div>
                    <span className="text-xs text-slate-500">{evaluationsList.length} evaluations</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          <th className="py-2.5 px-3 font-bold">Student</th>
                          <th className="py-2.5 px-3 font-bold">Batch</th>
                          <th className="py-2.5 px-3 font-bold">Subject</th>
                          <th className="py-2.5 px-3 font-bold">Marks</th>
                          <th className="py-2.5 px-3 font-bold">Percentage</th>
                          <th className="py-2.5 px-3 font-bold">Status</th>
                          <th className="py-2.5 px-3 font-bold">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {evaluationsList.map((ev) => (
                          <tr key={ev.id} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3 font-bold text-slate-800">{ev.student_name}</td>
                            <td className="py-2.5 px-3 text-slate-500">{ev.batch_name || 'General'}</td>
                            <td className="py-2.5 px-3">{ev.subject_name}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-indigo-600">
                              {ev.total_marks}/{ev.maximum_marks}
                            </td>
                            <td className="py-2.5 px-3 font-mono">{ev.percentage}%</td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">
                                {ev.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-400">{new Date(ev.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 8. RESULTS */}
              {activeSection === 'results' && resultsData && (
                <div className="space-y-6">
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                    <h3 className="text-sm font-bold text-slate-900 mb-1">Batch Performance & Ranks</h3>
                    <p className="text-xs text-slate-500 mb-4">Top performing students across evaluated mock tests</p>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                            <th className="py-2.5 px-3 font-bold">Rank</th>
                            <th className="py-2.5 px-3 font-bold">Student</th>
                            <th className="py-2.5 px-3 font-bold">Batch</th>
                            <th className="py-2.5 px-3 font-bold">Tests Taken</th>
                            <th className="py-2.5 px-3 font-bold">Average Score</th>
                            <th className="py-2.5 px-3 font-bold">Highest Score</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {resultsData.rankList?.map((r: any, idx: number) => (
                            <tr key={r.id} className="hover:bg-slate-50/80">
                              <td className="py-2.5 px-3 font-mono font-bold text-indigo-600">#{idx + 1}</td>
                              <td className="py-2.5 px-3 font-bold text-slate-900">{r.full_name}</td>
                              <td className="py-2.5 px-3 text-slate-500">{r.batch_name || 'General'}</td>
                              <td className="py-2.5 px-3 font-mono">{r.evaluations_count}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-indigo-600">
                                {Math.round(r.average_percentage)}%
                              </td>
                              <td className="py-2.5 px-3 font-mono text-emerald-600">{r.highest_score}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* 9. ANALYTICS */}
              {activeSection === 'analytics' && analyticsData && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-900 mb-1">Subject Mastery & Weakness Analysis</h3>
                  <p className="text-xs text-slate-500 mb-4">Identify areas where your students are losing step marks</p>

                  <div className="space-y-3">
                    {analyticsData.subjectStats?.map((s: any, idx: number) => (
                      <div key={idx} className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-bold text-slate-800">{s.subject_name}</p>
                          <p className="text-[10px] text-slate-400">{s.total_evaluations} evaluations • Pass Count: {s.pass_count}</p>
                        </div>
                        <span className="font-mono font-bold text-indigo-600 text-sm">
                          {Math.round(s.avg_score)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 10. SUBSCRIPTION */}
              {activeSection === 'subscription' && subscriptionData && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs max-w-xl">
                  <h3 className="text-sm font-bold text-slate-900 mb-1">Institutional Plan & Student Quota</h3>
                  <p className="text-xs text-slate-500 mb-4">License details managed by Super Admin</p>

                  <div className="space-y-3 text-xs border-t border-slate-100 pt-3">
                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                      <span className="text-slate-500">Plan Type</span>
                      <span className="font-mono font-bold text-indigo-700">{subscriptionData.plan}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                      <span className="text-slate-500">Account Status</span>
                      <span className="font-mono font-bold text-emerald-600">{subscriptionData.status}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                      <span className="text-slate-500">Enrolled Students</span>
                      <span className="font-mono font-bold text-slate-800">{subscriptionData.activeStudents}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                      <span className="text-slate-500">Maximum Student Seat Quota</span>
                      <span className="font-mono font-bold text-slate-800">{subscriptionData.maxStudents}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                      <span className="text-slate-500">Remaining Seats</span>
                      <span className="font-mono font-bold text-indigo-600">{subscriptionData.remainingSeats}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                      <span className="text-slate-500">Expiration</span>
                      <span className="font-mono font-bold text-slate-700">
                        {subscriptionData.expiresAt ? new Date(subscriptionData.expiresAt).toLocaleDateString() : 'Active Partner License'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 11. NOTIFICATIONS */}
              {activeSection === 'notifications' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-900 mb-1">Institute Notifications</h3>
                  <p className="text-xs text-slate-500 mb-4">Official platform announcements and system alerts</p>

                  <div className="space-y-3">
                    {notificationsList.length === 0 && (
                      <p className="text-xs text-slate-400 italic py-4">No notifications yet.</p>
                    )}
                    {notificationsList.map((n) => (
                      <div key={n.id} className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">{n.title}</span>
                          <span className="text-[10px] text-slate-400">{new Date(n.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-slate-600 mt-1">{n.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 12. SETTINGS */}
              {activeSection === 'settings' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs max-w-xl">
                  <h3 className="text-sm font-bold text-slate-900 mb-1">Institute Preferences</h3>
                  <p className="text-xs text-slate-500 mb-4">Configure evaluation criteria thresholds</p>

                  <div className="space-y-4 text-xs">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Strict Passing Threshold (%)</label>
                      <input
                        type="number"
                        defaultValue="50"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"
                      />
                      <span className="text-[10px] text-slate-400">ICAI Aggregate requirement is 50%</span>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <input type="checkbox" id="notifySubmissions" defaultChecked className="rounded border-slate-300" />
                      <label htmlFor="notifySubmissions" className="text-slate-700 font-medium">
                        Notify institute admin when a student completes an evaluation
                      </label>
                    </div>

                    <button
                      onClick={() => setSuccessMsg('Settings updated successfully.')}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition cursor-pointer"
                    >
                      Save Preferences
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Enroll Student Modal */}
      {showAddStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 shadow-xl text-slate-800">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Enroll New Student</h3>
            <p className="text-xs text-slate-500 mb-4">Add student to your coaching institute roster</p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Student Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={newStudentForm.fullName}
                  onChange={(e) => setNewStudentForm({ ...newStudentForm, fullName: e.target.value })}
                  className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Student Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. rahul@gmail.com"
                  value={newStudentForm.email}
                  onChange={(e) => setNewStudentForm({ ...newStudentForm, email: e.target.value })}
                  className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    placeholder="Mobile number"
                    value={newStudentForm.phone}
                    onChange={(e) => setNewStudentForm({ ...newStudentForm, phone: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">ICAI Reg No.</label>
                  <input
                    type="text"
                    placeholder="e.g. NRO0123456"
                    value={newStudentForm.icaiRegistrationNumber}
                    onChange={(e) => setNewStudentForm({ ...newStudentForm, icaiRegistrationNumber: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Assign to Batch</label>
                <select
                  value={newStudentForm.batchId}
                  onChange={(e) => setNewStudentForm({ ...newStudentForm, batchId: e.target.value })}
                  className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50"
                >
                  <option value="">No Batch Assigned (General)</option>
                  {batchesList.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.course_level})</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setShowAddStudentModal(false)}
                  className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateStudent}
                  className="px-3 py-1.5 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
                >
                  Enroll Student
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Batch Modal */}
      {showCreateBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 shadow-xl text-slate-800">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Create New Coaching Batch</h3>
            <p className="text-xs text-slate-500 mb-4">Organize students by syllabus and exam target</p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Batch Name</label>
                <input
                  type="text"
                  placeholder="e.g. May 2026 Inter Rankers Batch"
                  value={newBatchForm.name}
                  onChange={(e) => setNewBatchForm({ ...newBatchForm, name: e.target.value })}
                  className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Level</label>
                  <select
                    value={newBatchForm.courseLevel}
                    onChange={(e) => setNewBatchForm({ ...newBatchForm, courseLevel: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50"
                  >
                    <option value="FOUNDATION">Foundation</option>
                    <option value="INTERMEDIATE">Intermediate</option>
                    <option value="FINAL">Final</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Target Attempt</label>
                  <input
                    type="text"
                    value={newBatchForm.targetAttempt}
                    onChange={(e) => setNewBatchForm({ ...newBatchForm, targetAttempt: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Fast-track comprehensive answer checking"
                  value={newBatchForm.description}
                  onChange={(e) => setNewBatchForm({ ...newBatchForm, description: e.target.value })}
                  className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setShowCreateBatchModal(false)}
                  className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateBatch}
                  className="px-3 py-1.5 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
                >
                  Create Batch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Test Modal */}
      {showCreateTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 shadow-xl text-slate-800">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Schedule Mock Test / Assignment</h3>
            <p className="text-xs text-slate-500 mb-4">Set deadline and instructions for students</p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Test Title</label>
                <input
                  type="text"
                  placeholder="e.g. Advanced Accounting Full Syllabus Mock Test I"
                  value={newTestForm.title}
                  onChange={(e) => setNewTestForm({ ...newTestForm, title: e.target.value })}
                  className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Subject</label>
                  <select
                    value={newTestForm.subjectKey}
                    onChange={(e) => {
                      const opt = e.target.selectedOptions[0]?.text;
                      setNewTestForm({ ...newTestForm, subjectKey: e.target.value, subjectName: opt || e.target.value });
                    }}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50"
                  >
                    <option value="inter_advanced_accounting">Advanced Accounting</option>
                    <option value="inter_law">Corporate and Other Laws</option>
                    <option value="inter_taxation">Taxation (Income Tax & GST)</option>
                    <option value="inter_costing">Cost & Management Accounting</option>
                    <option value="inter_audit">Auditing & Ethics</option>
                    <option value="inter_fmsm">FM & SM</option>
                    <option value="final_fr">Financial Reporting (Final)</option>
                    <option value="final_afm">Advanced Financial Management (Final)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Max Marks</label>
                  <input
                    type="number"
                    value={newTestForm.maximumMarks}
                    onChange={(e) => setNewTestForm({ ...newTestForm, maximumMarks: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Submission Deadline</label>
                <input
                  type="datetime-local"
                  value={newTestForm.deadline}
                  onChange={(e) => setNewTestForm({ ...newTestForm, deadline: e.target.value })}
                  className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Instructions / Specific Syllabus</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Answer all 5 questions. Working notes carry step marks."
                  value={newTestForm.instructions}
                  onChange={(e) => setNewTestForm({ ...newTestForm, instructions: e.target.value })}
                  className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setShowCreateTestModal(false)}
                  className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTest}
                  className="px-3 py-1.5 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
                >
                  Schedule Test
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
