import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { apiRequest } from '../../api/client.js';
import { MaterialManagement } from '../../components/admin/MaterialManagement.js';
import { EvaluationControls } from '../../components/admin/EvaluationControls.js';
import { ModelManagement } from '../../components/admin/ModelManagement.js';
import { AdminPromoCodesSection } from './AdminPromoCodesSection.js';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Building2,
  BookOpen,
  Layers,
  FileText,
  HelpCircle,
  CheckSquare,
  FileCheck2,
  DollarSign,
  CreditCard,
  Calendar,
  BarChart3,
  Bell,
  Headphones,
  Gift,
  Sparkles,
  Settings,
  ScrollText,
  Search,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Trash2,
  ShieldCheck,
  Lock,
  ExternalLink,
  ChevronRight,
  ArrowUpRight,
  UserX,
  UserCheck,
  LogOut,
  Brain,
  ShieldAlert,
  AlertOctagon,
} from 'lucide-react';

export const AdminPortal: React.FC = () => {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Determine current active subroute from pathname
  const pathParts = location.pathname.split('/').filter(Boolean);
  // /admin or /admin/dashboard -> 'dashboard'
  const activeSection = pathParts[1] || 'dashboard';

  // Sub-view data states
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Dashboard Overview
  const [dashboardData, setDashboardData] = useState<any>(null);

  // Users & Students
  const [usersList, setUsersList] = useState<any[]>([]);
  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState<string>('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('ALL');
  const [creditAdjustModal, setCreditAdjustModal] = useState<{ student: any; delta: string; reason: string } | null>(null);

  // Institutes
  const [institutesList, setInstitutesList] = useState<any[]>([]);

  // Courses & Subjects
  const [coursesData, setCoursesData] = useState<any>(null);
  const [subjectsList, setSubjectsList] = useState<any[]>([]);

  // Papers, Questions, Model Answers
  const [papersList, setPapersList] = useState<any[]>([]);
  const [questionsList, setQuestionsList] = useState<any[]>([]);
  const [modelAnswersList, setModelAnswersList] = useState<any[]>([]);
  const [showUploadPaperModal, setShowUploadPaperModal] = useState<boolean>(false);
  const [newPaperForm, setNewPaperForm] = useState({
    level: 'INTERMEDIATE',
    materialType: 'MTP',
    modelGroup: 'GROUP_1',
    subjectKey: 'inter_advanced_accounting',
    subjectName: 'Advanced Accounting',
    attempt: 'May 2026',
    questionPaperTitle: '',
    questionPaperText: '',
    suggestedAnswersText: '',
    markingSchemeText: '',
  });

  // Evaluations
  const [evaluationsList, setEvaluationsList] = useState<any[]>([]);
  const [selectedEvalDetail, setSelectedEvalDetail] = useState<any>(null);

  // Pricing
  const [pricingSettings, setPricingSettings] = useState<any>({});
  const [pricingForm, setPricingForm] = useState({
    pricePerCredit: '10',
    freeTierEvaluations: '2',
    defaultInstituteQuota: '500',
    supportEmail: 'caexamchecker.support@gmail.com',
    instagramUrl: 'https://insta.openinapp.co/utw2r',
  });

  // Payments & Subscriptions
  const [paymentsList, setPaymentsList] = useState<any[]>([]);
  const [subscriptionsList, setSubscriptionsList] = useState<any[]>([]);

  // Analytics, Notifications, Support, Free-Access, Settings, Audit-Logs
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [notificationsList, setNotificationsList] = useState<any[]>([]);
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '', targetRole: 'ALL' });
  const [supportTickets, setSupportTickets] = useState<any[]>([]);
  const [ticketReplyModal, setTicketReplyModal] = useState<{ ticket: any; reply: string } | null>(null);
  const [freeAccessList, setFreeAccessList] = useState<any[]>([]);
  const [newFreeEmail, setNewFreeEmail] = useState<string>('');
  const [newFreeReason, setNewFreeReason] = useState<string>('');
  const [settingsData, setSettingsData] = useState<any>(null);
  const [auditLogsList, setAuditLogsList] = useState<any[]>([]);

  // Suspension Modal State
  const [suspendModal, setSuspendModal] = useState<{ user: any; reason: string; internalNote: string } | null>(null);

  // Revocation Requests State
  const [revocationRequests, setRevocationRequests] = useState<any[]>([]);
  const [revocationStatusFilter, setRevocationStatusFilter] = useState<string>('ALL');
  const [revocationReviewModal, setRevocationReviewModal] = useState<{ request: any; decision: 'APPROVED' | 'REJECTED'; reply: string } | null>(null);

  // Referral Campaigns & AI30 State
  const [referralCampaigns, setReferralCampaigns] = useState<any[]>([]);
  const [referralRedemptions, setReferralRedemptions] = useState<any[]>([]);
  const [editingCampaign, setEditingCampaign] = useState<{
    code: string;
    campaign_name: string;
    max_redemptions: number;
    max_evaluations: number;
    is_active: number;
  } | null>(null);

  // Load section data based on active section
  const loadActiveSectionData = async () => {
    try {
      setLoadingData(true);
      setErrorMsg('');

      switch (activeSection) {
        case 'materials':
        case 'rules':
        case 'promo-codes':
        case 'referrals': {
          // Handled self-contained within dedicated components
          break;
        }
        case 'dashboard': {
          const res = await apiRequest<any>('/api/admin/dashboard');
          setDashboardData(res);
          break;
        }
        case 'users': {
          const res = await apiRequest<{ users: any[] }>(`/api/admin/users?role=${userRoleFilter === 'ALL' ? '' : userRoleFilter}&search=${encodeURIComponent(userSearch)}`);
          setUsersList(res.users || []);
          break;
        }
        case 'students': {
          const res = await apiRequest<{ students: any[] }>(`/api/admin/students?search=${encodeURIComponent(userSearch)}`);
          setStudentsList(res.students || []);
          break;
        }
        case 'institutes': {
          const res = await apiRequest<{ institutes: any[] }>('/api/admin/institutes');
          setInstitutesList(res.institutes || []);
          break;
        }
        case 'courses': {
          const res = await apiRequest<any>('/api/admin/courses');
          setCoursesData(res);
          break;
        }
        case 'subjects': {
          const res = await apiRequest<{ subjects: any[] }>('/api/admin/subjects');
          setSubjectsList(res.subjects || []);
          break;
        }
        case 'papers': {
          const res = await apiRequest<{ papers: any[] }>('/api/admin/papers');
          setPapersList(res.papers || []);
          break;
        }
        case 'questions': {
          const res = await apiRequest<{ questions: any[] }>('/api/admin/questions');
          setQuestionsList(res.questions || []);
          break;
        }
        case 'model-answers': {
          const res = await apiRequest<{ modelAnswers: any[] }>('/api/admin/model-answers');
          setModelAnswersList(res.modelAnswers || []);
          break;
        }
        case 'evaluations': {
          const res = await apiRequest<{ evaluations: any[] }>('/api/admin/evaluations');
          setEvaluationsList(res.evaluations || []);
          break;
        }
        case 'pricing': {
          const res = await apiRequest<{ settings: any }>('/api/admin/pricing');
          setPricingSettings(res.settings || {});
          setPricingForm({
            pricePerCredit: res.settings?.PRICE_PER_CREDIT_INR || '10',
            freeTierEvaluations: res.settings?.FREE_TIER_EVALUATIONS || '2',
            defaultInstituteQuota: res.settings?.DEFAULT_INSTITUTE_QUOTA || '500',
            supportEmail: res.settings?.SUPPORT_EMAIL || 'caexamchecker.support@gmail.com',
            instagramUrl: res.settings?.INSTAGRAM_URL || 'https://insta.openinapp.co/utw2r',
          });
          break;
        }
        case 'payments': {
          const res = await apiRequest<{ orders: any[] }>('/api/admin/payments');
          setPaymentsList(res.orders || []);
          break;
        }
        case 'subscriptions': {
          const res = await apiRequest<{ subscriptions: any[] }>('/api/admin/subscriptions');
          setSubscriptionsList(res.subscriptions || []);
          break;
        }
        case 'analytics': {
          const res = await apiRequest<any>('/api/admin/analytics');
          setAnalyticsData(res);
          break;
        }
        case 'notifications': {
          const res = await apiRequest<{ notifications: any[] }>('/api/admin/notifications');
          setNotificationsList(res.notifications || []);
          break;
        }
        case 'support': {
          const res = await apiRequest<{ tickets: any[] }>('/api/admin/support');
          setSupportTickets(res.tickets || []);
          break;
        }
        case 'free-access': {
          const res = await apiRequest<{ entitlements: any[] }>('/api/admin/free-access');
          setFreeAccessList(res.entitlements || []);
          break;
        }
        case 'settings': {
          const res = await apiRequest<any>('/api/admin/settings');
          setSettingsData(res);
          break;
        }
        case 'audit-logs': {
          const res = await apiRequest<{ logs: any[] }>('/api/admin/audit-logs');
          setAuditLogsList(res.logs || []);
          break;
        }
        case 'revocation-requests': {
          const query = revocationStatusFilter === 'ALL' ? '' : `?status=${revocationStatusFilter}`;
          const res = await apiRequest<{ requests: any[] }>(`/api/admin/revocation-requests${query}`);
          setRevocationRequests(res.requests || []);
          break;
        }
        default:
          break;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load section data';
      setErrorMsg(msg);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN')) {
      loadActiveSectionData();
    }
  }, [activeSection, revocationStatusFilter, isAuthenticated, user]);

  // Handle User Status toggle
  const handleToggleUserStatus = async (targetUser: any) => {
    if (targetUser.status === 'ACTIVE') {
      // Open modal to enter explicit suspension reason
      setSuspendModal({
        user: targetUser,
        reason: 'Violation of academic integrity and examination terms of use.',
        internalNote: '',
      });
      return;
    }

    // Direct reactivation
    try {
      await apiRequest(`/api/admin/users/${targetUser.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'ACTIVE' }),
      });
      setSuccessMsg(`User ${targetUser.full_name} has been reinstated to ACTIVE status.`);
      loadActiveSectionData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update user status');
    }
  };

  // Confirm Suspension with mandatory reason
  const handleConfirmSuspension = async () => {
    if (!suspendModal) return;
    if (!suspendModal.reason.trim()) {
      setErrorMsg('Please specify a valid reason for suspension.');
      return;
    }
    try {
      await apiRequest(`/api/admin/users/${suspendModal.user.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({
          status: 'SUSPENDED',
          reason: suspendModal.reason.trim(),
          internalNote: suspendModal.internalNote.trim(),
        }),
      });
      setSuccessMsg(`User ${suspendModal.user.full_name} has been suspended.`);
      setSuspendModal(null);
      loadActiveSectionData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to suspend user');
    }
  };

  // Handle Revocation Review (Approve or Reject)
  const handleReviewRevocation = async () => {
    if (!revocationReviewModal) return;
    try {
      await apiRequest(`/api/admin/revocation-requests/${revocationReviewModal.request.id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision: revocationReviewModal.decision,
          adminReply: revocationReviewModal.reply.trim(),
        }),
      });
      setSuccessMsg(`Appeal has been ${revocationReviewModal.decision.toLowerCase()} successfully.`);
      setRevocationReviewModal(null);
      loadActiveSectionData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to process appeal review');
    }
  };

  // Handle Credit Adjustment
  const handleAdjustCredits = async () => {
    if (!creditAdjustModal) return;
    try {
      await apiRequest(`/api/admin/students/${creditAdjustModal.student.id}/adjust-credits`, {
        method: 'POST',
        body: JSON.stringify({
          creditsDelta: Number(creditAdjustModal.delta),
          reason: creditAdjustModal.reason,
        }),
      });
      setSuccessMsg('Credits adjusted successfully');
      setCreditAdjustModal(null);
      loadActiveSectionData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Credit adjustment failed');
    }
  };

  // Handle Grant Permanent Free Access
  const handleGrantFreeAccess = async () => {
    if (!newFreeEmail.includes('@')) {
      setErrorMsg('Please enter a valid email address');
      return;
    }
    try {
      await apiRequest('/api/admin/free-access', {
        method: 'POST',
        body: JSON.stringify({ email: newFreeEmail, reason: newFreeReason }),
      });
      setNewFreeEmail('');
      setNewFreeReason('');
      setSuccessMsg('Permanent free access granted');
      loadActiveSectionData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to grant free access');
    }
  };

  // Handle Revoke Free Access
  const handleRevokeFreeAccess = async (id: string) => {
    if (!confirm('Are you sure you want to revoke permanent free access for this email?')) return;
    try {
      await apiRequest(`/api/admin/free-access/${id}`, { method: 'DELETE' });
      setSuccessMsg('Permanent free access revoked');
      loadActiveSectionData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to revoke access');
    }
  };

  // Handle Update Referral Campaign (e.g. AI30)
  const handleUpdateCampaign = async () => {
    if (!editingCampaign) return;
    try {
      await apiRequest(`/api/admin/referrals/campaigns/${editingCampaign.code}`, {
        method: 'PUT',
        body: JSON.stringify({
          max_redemptions: Number(editingCampaign.max_redemptions),
          max_evaluations: Number(editingCampaign.max_evaluations),
          is_active: Number(editingCampaign.is_active),
        }),
      });
      setSuccessMsg(`Campaign ${editingCampaign.code} updated successfully.`);
      setEditingCampaign(null);
      loadActiveSectionData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update campaign');
    }
  };

  // Handle Update Pricing
  const handleSavePricing = async () => {
    try {
      await apiRequest('/api/admin/pricing', {
        method: 'PUT',
        body: JSON.stringify(pricingForm),
      });
      setSuccessMsg('Pricing settings updated successfully');
      loadActiveSectionData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save pricing');
    }
  };

  // Handle Broadcast Notification
  const handleSendBroadcast = async () => {
    if (!broadcastForm.title || !broadcastForm.message) {
      setErrorMsg('Title and message are required');
      return;
    }
    try {
      await apiRequest('/api/admin/notifications/broadcast', {
        method: 'POST',
        body: JSON.stringify(broadcastForm),
      });
      setBroadcastForm({ title: '', message: '', targetRole: 'ALL' });
      setSuccessMsg('Broadcast notification sent');
      loadActiveSectionData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send broadcast');
    }
  };

  // Handle Support Reply
  const handleReplyTicket = async () => {
    if (!ticketReplyModal || !ticketReplyModal.reply) return;
    try {
      await apiRequest(`/api/admin/support/${ticketReplyModal.ticket.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ reply: ticketReplyModal.reply, status: 'RESOLVED' }),
      });
      setSuccessMsg('Reply submitted & ticket marked resolved');
      setTicketReplyModal(null);
      loadActiveSectionData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reply to ticket');
    }
  };

  // Handle Upload Paper
  const handleUploadPaper = async () => {
    if (!newPaperForm.questionPaperTitle || !newPaperForm.questionPaperText || !newPaperForm.suggestedAnswersText) {
      setErrorMsg('Please enter Paper Title, Question Paper text, and Suggested Answers text');
      return;
    }
    try {
      await apiRequest('/api/admin/materials', {
        method: 'POST',
        body: JSON.stringify(newPaperForm),
      });
      setShowUploadPaperModal(false);
      setSuccessMsg('Reference Question Paper uploaded successfully');
      loadActiveSectionData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to upload paper');
    }
  };

  // RBAC GUARD: Check Authentication & Role
  if (isLoading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm font-semibold text-slate-600">Verifying Super Admin Authorization...</p>
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
          <h2 className="text-xl font-bold text-slate-900 mb-2">Administrator Sign-In Required</h2>
          <p className="text-xs text-slate-500 mb-6">
            The Super Admin Portal is protected by server-side role authentication. Please sign in with your verified administrator credentials.
          </p>
          <button
            onClick={() => navigate('/login?redirect=/admin/dashboard')}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition"
          >
            Sign In as Administrator
          </button>
        </div>
      </div>
    );
  }

  if (user?.role !== 'SUPER_ADMIN' && user?.role !== 'ADMIN') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="bg-white border border-rose-200 rounded-xl p-8 max-w-md w-full text-center shadow-lg">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-200">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied (HTTP 403)</h2>
          <p className="text-xs text-slate-500 mb-6">
            Your current account role (<span className="font-semibold text-rose-600">{user?.role}</span>) does not have permission to access the Super Admin Portal. This incident has been logged.
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

  // Navigation Items for Admin Sidebar
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'materials', label: 'Material Management', icon: FileCheck2 },
    { id: 'rules', label: 'Evaluation Controls', icon: ShieldCheck },
    { id: 'ai-models', label: 'AI Models & Fallbacks', icon: Brain },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'students', label: 'Students', icon: GraduationCap },
    { id: 'institutes', label: 'Institutes', icon: Building2 },
    { id: 'courses', label: 'Courses', icon: BookOpen },
    { id: 'subjects', label: 'Subjects', icon: Layers },
    { id: 'papers', label: 'Papers', icon: FileText },
    { id: 'questions', label: 'Questions', icon: HelpCircle },
    { id: 'model-answers', label: 'Model Answers', icon: CheckSquare },
    { id: 'evaluations', label: 'Evaluations', icon: FileCheck2 },
    { id: 'pricing', label: 'Pricing', icon: DollarSign },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'subscriptions', label: 'Subscriptions', icon: Calendar },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'support', label: 'Support', icon: Headphones },
    { id: 'free-access', label: 'Permanent Free', icon: Gift },
    { id: 'promo-codes', label: 'Promo Codes', icon: Sparkles },
    { id: 'revocation-requests', label: 'Revocation Requests', icon: ShieldAlert },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'audit-logs', label: 'Audit Logs', icon: ScrollText },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex">
      {/* Admin Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800">
        <div className="p-4 border-b border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide">Super Admin</h1>
            <p className="text-[10px] text-blue-400 font-medium">CA Exam Checker AI</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              activeSection === item.id ||
              (item.id === 'promo-codes' && activeSection === 'referrals');
            return (
              <button
                key={item.id}
                onClick={() => navigate(`/admin/${item.id}`)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
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
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
              {user?.role}
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

      {/* Main Admin Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Admin Header Bar */}
        <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-slate-900 capitalize tracking-tight">
              {navItems.find((n) => n.id === activeSection)?.label || 'Overview'}
            </h2>
            <span className="text-xs text-slate-400">/admin/{activeSection}</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Real-time Indicator */}
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Database Connected
            </div>

            <button
              onClick={loadActiveSectionData}
              disabled={loadingData}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        </header>

        {/* Status Alerts */}
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

        {/* Dynamic Section Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {loadingData && (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
              <p className="text-xs text-slate-500">Loading {activeSection} data...</p>
            </div>
          )}

          {!loadingData && (
            <>
              {/* MATERIAL MANAGEMENT */}
              {activeSection === 'materials' && (
                <MaterialManagement
                  onNotify={(msg, type) => {
                    if (type === 'success') setSuccessMsg(msg);
                    else setErrorMsg(msg);
                  }}
                />
              )}

              {/* EVALUATION CONTROLS & RULES */}
              {activeSection === 'rules' && (
                <EvaluationControls
                  onNotify={(msg, type) => {
                    if (type === 'success') setSuccessMsg(msg);
                    else setErrorMsg(msg);
                  }}
                />
              )}

              {/* MULTI-MODEL AI ARCHITECTURE & CONTROLS */}
              {activeSection === 'ai-models' && (
                <ModelManagement
                  onNotify={(msg, type) => {
                    if (type === 'success') setSuccessMsg(msg);
                    else setErrorMsg(msg);
                  }}
                />
              )}

              {/* 1. DASHBOARD */}
              {activeSection === 'dashboard' && dashboardData && (
                <div className="space-y-6">
                  {/* Top Stats Metrics */}
                  <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                      <p className="text-xs text-slate-500 font-medium">Total Users</p>
                      <p className="text-xl font-bold text-slate-900 mt-1">{dashboardData.metrics?.totalUsers || 0}</p>
                      <p className="text-[10px] text-blue-600 mt-1">Platform Accounts</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                      <p className="text-xs text-slate-500 font-medium">Students</p>
                      <p className="text-xl font-bold text-slate-900 mt-1">{dashboardData.metrics?.totalStudents || 0}</p>
                      <p className="text-[10px] text-emerald-600 mt-1">Active Aspirants</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                      <p className="text-xs text-slate-500 font-medium">Institutes</p>
                      <p className="text-xl font-bold text-slate-900 mt-1">{dashboardData.metrics?.totalInstitutes || 0}</p>
                      <p className="text-[10px] text-indigo-600 mt-1">Institutional Partners</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                      <p className="text-xs text-slate-500 font-medium">Evaluations</p>
                      <p className="text-xl font-bold text-slate-900 mt-1">{dashboardData.metrics?.totalEvaluations || 0}</p>
                      <p className="text-[10px] text-purple-600 mt-1">Completed Papers</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                      <p className="text-xs text-slate-500 font-medium">Revenue (INR)</p>
                      <p className="text-xl font-bold text-slate-900 mt-1">₹{dashboardData.metrics?.totalRevenueINR || 0}</p>
                      <p className="text-[10px] text-amber-600 mt-1">Razorpay Verified</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                      <p className="text-xs text-slate-500 font-medium">Permanent Free</p>
                      <p className="text-xl font-bold text-slate-900 mt-1">{dashboardData.metrics?.permanentFreeAccounts || 0}</p>
                      <p className="text-[10px] text-slate-400 mt-1">Lifetime Entitled</p>
                    </div>
                  </div>

                  {/* Recent Activity & Recent Evaluations */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center justify-between">
                        <span>Recent Completed Evaluations</span>
                        <Link to="/admin/evaluations" className="text-blue-600 hover:underline text-[11px] normal-case font-normal">View all</Link>
                      </h3>
                      <div className="space-y-3">
                        {dashboardData.recentEvaluations?.length === 0 && (
                          <p className="text-xs text-slate-400 italic">No evaluations recorded yet.</p>
                        )}
                        {dashboardData.recentEvaluations?.map((ev: any) => (
                          <div key={ev.id} className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                            <div>
                              <p className="font-bold text-slate-800">{ev.subject_name}</p>
                              <p className="text-[10px] text-slate-500">{ev.student_name} ({ev.level})</p>
                            </div>
                            <div className="text-right">
                              <span className="font-mono font-bold text-blue-600 text-sm">{ev.total_marks}/{ev.maximum_marks}</span>
                              <p className="text-[10px] text-slate-400">{ev.percentage}%</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center justify-between">
                        <span>System Audit Trail</span>
                        <Link to="/admin/audit-logs" className="text-blue-600 hover:underline text-[11px] normal-case font-normal">View all</Link>
                      </h3>
                      <div className="space-y-3">
                        {dashboardData.recentLogs?.map((log: any) => (
                          <div key={log.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-700">{log.action}</span>
                              <span className="text-[10px] text-slate-400">{new Date(log.created_at).toLocaleTimeString()}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">{log.details || 'System operation executed'}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. USERS */}
              {activeSection === 'users' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex flex-col sm:flex-row gap-3 items-center justify-between mb-5">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="relative w-full sm:w-64">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search users by name, email..."
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && loadActiveSectionData()}
                          className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600"
                        />
                      </div>
                      <select
                        value={userRoleFilter}
                        onChange={(e) => setUserRoleFilter(e.target.value)}
                        className="py-1.5 px-3 text-xs rounded-lg border border-slate-200 bg-slate-50"
                      >
                        <option value="ALL">All Roles</option>
                        <option value="STUDENT">Student</option>
                        <option value="INSTITUTE_ADMIN">Institute Admin</option>
                        <option value="ADMIN">Admin</option>
                        <option value="SUPER_ADMIN">Super Admin</option>
                      </select>
                      <button
                        onClick={loadActiveSectionData}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
                      >
                        Filter
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">{usersList.length} users registered</p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          <th className="py-2.5 px-3 font-bold">User</th>
                          <th className="py-2.5 px-3 font-bold">Role</th>
                          <th className="py-2.5 px-3 font-bold">Status</th>
                          <th className="py-2.5 px-3 font-bold">ICAI Reg</th>
                          <th className="py-2.5 px-3 font-bold">Credits</th>
                          <th className="py-2.5 px-3 font-bold">Joined</th>
                          <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {usersList.map((u) => (
                          <tr key={u.id} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3">
                              <p className="font-bold text-slate-900">{u.full_name}</p>
                              <p className="text-[11px] text-slate-400">{u.email}</p>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                                {u.role}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                u.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}>
                                {u.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono">{u.icai_registration_number || '—'}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-blue-600">{u.purchased_credits || 0}</td>
                            <td className="py-2.5 px-3 text-slate-400">{new Date(u.created_at).toLocaleDateString()}</td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() => handleToggleUserStatus(u)}
                                className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                                  u.status === 'ACTIVE'
                                    ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                }`}
                              >
                                {u.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 3. STUDENTS */}
              {activeSection === 'students' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Student Profiles & Credit Management</h3>
                      <p className="text-xs text-slate-500">Super Admin credit overrides and ICAI attempt details</p>
                    </div>
                    <p className="text-xs text-slate-500">{studentsList.length} enrolled students</p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          <th className="py-2.5 px-3 font-bold">Student</th>
                          <th className="py-2.5 px-3 font-bold">ICAI Registration</th>
                          <th className="py-2.5 px-3 font-bold">Level</th>
                          <th className="py-2.5 px-3 font-bold">Evaluations</th>
                          <th className="py-2.5 px-3 font-bold">Free Used</th>
                          <th className="py-2.5 px-3 font-bold">Credits</th>
                          <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {studentsList.map((st) => (
                          <tr key={st.id} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3">
                              <p className="font-bold text-slate-900">{st.full_name}</p>
                              <p className="text-[11px] text-slate-400">{st.email}</p>
                              {st.permanent_free_active && (
                                <span className="text-[9px] font-bold text-emerald-600">Permanent Free Access</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono">{st.icai_registration_number || 'N/A'}</td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">
                                {st.ca_level || 'INTERMEDIATE'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold">{st.evaluations_count || 0}</td>
                            <td className="py-2.5 px-3 font-mono">{st.free_evaluations_used || 0}/2</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-blue-600">{st.purchased_credits || 0}</td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() => setCreditAdjustModal({ student: st, delta: '5', reason: 'Admin adjustment' })}
                                className="px-2 py-1 rounded text-[10px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
                              >
                                Adjust Credits
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 4. INSTITUTES */}
              {activeSection === 'institutes' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Coaching Institutes & Academies</h3>
                      <p className="text-xs text-slate-500">Multi-tenant institutional licensing & student capacity</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          <th className="py-2.5 px-3 font-bold">Institute Name</th>
                          <th className="py-2.5 px-3 font-bold">Code</th>
                          <th className="py-2.5 px-3 font-bold">Contact Email</th>
                          <th className="py-2.5 px-3 font-bold">Status</th>
                          <th className="py-2.5 px-3 font-bold">Students</th>
                          <th className="py-2.5 px-3 font-bold">Max Quota</th>
                          <th className="py-2.5 px-3 font-bold">Expires</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {institutesList.map((inst) => (
                          <tr key={inst.id} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3 font-bold text-slate-900">{inst.name}</td>
                            <td className="py-2.5 px-3 font-mono">{inst.code}</td>
                            <td className="py-2.5 px-3 text-slate-500">{inst.email}</td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                inst.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}>
                                {inst.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-blue-600">{inst.active_count || 0}</td>
                            <td className="py-2.5 px-3 font-mono">{inst.max_students || 500}</td>
                            <td className="py-2.5 px-3 text-slate-400">
                              {inst.subscription_expires_at ? new Date(inst.subscription_expires_at).toLocaleDateString() : 'Lifetime'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 5. COURSES */}
              {activeSection === 'courses' && coursesData && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {coursesData.courses?.map((c: any) => (
                      <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-bold text-slate-900">{c.name}</h4>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">
                            {c.papersCount} Papers
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mb-4">{c.passingRule}</p>
                        <div className="space-y-2 border-t border-slate-100 pt-3">
                          {c.subjects && (
                            <ul className="text-xs text-slate-600 space-y-1">
                              {c.subjects.map((sub: string, i: number) => (
                                <li key={i} className="flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                                  {sub}
                                </li>
                              ))}
                            </ul>
                          )}
                          {c.groups && c.groups.map((grp: any, idx: number) => (
                            <div key={idx} className="mb-2">
                              <p className="text-[11px] font-bold text-slate-700">{grp.group}</p>
                              <ul className="text-xs text-slate-600 space-y-1 mt-1 pl-2">
                                {grp.subjects.map((s: string, sIdx: number) => (
                                  <li key={sIdx} className="flex items-center gap-1.5">
                                    <span className="w-1 h-1 rounded-full bg-slate-400"></span>
                                    {s}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 6. SUBJECTS */}
              {activeSection === 'subjects' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Official ICAI Syllabus Subjects (16 Total)</h3>
                      <p className="text-xs text-slate-500">Foundation, Intermediate & Final subject registry</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {subjectsList.map((sub) => (
                      <div key={sub.key} className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-slate-800">{sub.name}</p>
                          <p className="text-[10px] text-slate-500">{sub.level} • {sub.code} {sub.group ? `(${sub.group})` : ''}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-700">
                          {sub.papersUploaded} MTPs
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 7. PAPERS */}
              {activeSection === 'papers' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Official Reference Question Papers & MTPs</h3>
                      <p className="text-xs text-slate-500">Uploaded ICAI suggested papers used for ground truth step marking</p>
                    </div>
                    <button
                      onClick={() => setShowUploadPaperModal(true)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Add Question Paper
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          <th className="py-2.5 px-3 font-bold">Paper Title</th>
                          <th className="py-2.5 px-3 font-bold">Subject</th>
                          <th className="py-2.5 px-3 font-bold">Level</th>
                          <th className="py-2.5 px-3 font-bold">Attempt</th>
                          <th className="py-2.5 px-3 font-bold">QP Size</th>
                          <th className="py-2.5 px-3 font-bold">Model Answer Size</th>
                          <th className="py-2.5 px-3 font-bold">Uploaded By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {papersList.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3 font-bold text-slate-900">{p.question_paper_title}</td>
                            <td className="py-2.5 px-3">{p.subject_name}</td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                                {p.level}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono">{p.attempt}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-500">{p.qp_chars} chars</td>
                            <td className="py-2.5 px-3 font-mono text-emerald-600">{p.sa_chars} chars</td>
                            <td className="py-2.5 px-3 text-slate-400">{p.uploaded_by}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 8. QUESTIONS REPOSITORY */}
              {activeSection === 'questions' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Parsed Question Repository</h3>
                      <p className="text-xs text-slate-500">Structured ICAI questions extracted from official papers</p>
                    </div>
                    <span className="text-xs text-slate-500">{questionsList.length} questions cataloged</span>
                  </div>

                  <div className="space-y-3">
                    {questionsList.map((q) => (
                      <div key={q.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50/60">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-xs text-blue-700">{q.subject} ({q.attempt})</span>
                          <span className="text-[10px] text-slate-400">{q.paperTitle}</span>
                        </div>
                        <p className="text-xs text-slate-700 whitespace-pre-wrap">{q.textPreview}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 9. MODEL ANSWERS */}
              {activeSection === 'model-answers' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Model Answers & Step Marking Keys</h3>
                      <p className="text-xs text-slate-500">Official ICAI suggested answers used by evaluation engine</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {modelAnswersList.map((ma) => (
                      <div key={ma.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50/60">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-xs text-slate-900">{ma.question_paper_title} ({ma.subject_name})</h4>
                          <span className="text-[10px] font-mono text-slate-500">{ma.attempt}</span>
                        </div>
                        <div className="mt-2 text-xs font-mono bg-white p-3 rounded border border-slate-200 max-h-48 overflow-y-auto whitespace-pre-wrap text-slate-700">
                          {ma.suggested_answers_text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 10. EVALUATIONS */}
              {activeSection === 'evaluations' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Student Answer Sheet Evaluations</h3>
                      <p className="text-xs text-slate-500">Real evaluation records across all students</p>
                    </div>
                    <span className="text-xs text-slate-500">{evaluationsList.length} records</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          <th className="py-2.5 px-3 font-bold">Evaluation ID</th>
                          <th className="py-2.5 px-3 font-bold">Student</th>
                          <th className="py-2.5 px-3 font-bold">Subject</th>
                          <th className="py-2.5 px-3 font-bold">Marks</th>
                          <th className="py-2.5 px-3 font-bold">Score %</th>
                          <th className="py-2.5 px-3 font-bold">Status</th>
                          <th className="py-2.5 px-3 font-bold">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {evaluationsList.map((ev) => (
                          <tr key={ev.id} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3 font-mono text-slate-500">{ev.id}</td>
                            <td className="py-2.5 px-3">
                              <p className="font-bold text-slate-800">{ev.student_name}</p>
                              <p className="text-[10px] text-slate-400">{ev.student_email}</p>
                            </td>
                            <td className="py-2.5 px-3 font-medium">{ev.subject_name}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-blue-600">
                              {ev.total_marks !== null ? `${ev.total_marks}/${ev.maximum_marks}` : '—'}
                            </td>
                            <td className="py-2.5 px-3 font-mono">{ev.percentage !== null ? `${ev.percentage}%` : '—'}</td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                ev.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                              }`}>
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

              {/* 11. PRICING */}
              {activeSection === 'pricing' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs max-w-xl">
                  <div className="mb-5">
                    <h3 className="text-sm font-bold text-slate-900">System Pricing & Evaluation Quota</h3>
                    <p className="text-xs text-slate-500">Database-driven pricing rules applied across platform</p>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Price Per Credit (INR)</label>
                      <input
                        type="number"
                        value={pricingForm.pricePerCredit}
                        onChange={(e) => setPricingForm({ ...pricingForm, pricePerCredit: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600"
                      />
                      <span className="text-[10px] text-slate-400">Default: ₹10 per paper evaluation</span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Free Tier Evaluations (Individual Students)</label>
                      <input
                        type="number"
                        value={pricingForm.freeTierEvaluations}
                        onChange={(e) => setPricingForm({ ...pricingForm, freeTierEvaluations: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600"
                      />
                      <span className="text-[10px] text-slate-400">Default: 2 free evaluations</span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Default Institute Student Quota</label>
                      <input
                        type="number"
                        value={pricingForm.defaultInstituteQuota}
                        onChange={(e) => setPricingForm({ ...pricingForm, defaultInstituteQuota: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Official Support Email</label>
                      <input
                        type="text"
                        value={pricingForm.supportEmail}
                        onChange={(e) => setPricingForm({ ...pricingForm, supportEmail: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Official Instagram Link</label>
                      <input
                        type="text"
                        value={pricingForm.instagramUrl}
                        onChange={(e) => setPricingForm({ ...pricingForm, instagramUrl: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <button
                      onClick={handleSavePricing}
                      className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs transition"
                    >
                      Save Pricing Settings
                    </button>
                  </div>
                </div>
              )}

              {/* 12. PAYMENTS */}
              {activeSection === 'payments' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Razorpay Payment Orders & Transactions</h3>
                      <p className="text-xs text-slate-500">Real transaction records verified cryptographically</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          <th className="py-2.5 px-3 font-bold">Order ID</th>
                          <th className="py-2.5 px-3 font-bold">Student</th>
                          <th className="py-2.5 px-3 font-bold">Credits</th>
                          <th className="py-2.5 px-3 font-bold">Amount (INR)</th>
                          <th className="py-2.5 px-3 font-bold">Status</th>
                          <th className="py-2.5 px-3 font-bold">Razorpay Payment ID</th>
                          <th className="py-2.5 px-3 font-bold">Created At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paymentsList.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3 font-mono text-slate-700">{p.razorpay_order_id || p.id}</td>
                            <td className="py-2.5 px-3">
                              <p className="font-bold text-slate-900">{p.student_name}</p>
                              <p className="text-[10px] text-slate-400">{p.student_email}</p>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-blue-600">{p.quantity}</td>
                            <td className="py-2.5 px-3 font-mono font-bold">₹{p.amount_paise / 100}</td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                p.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                              }`}>
                                {p.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-500">{p.razorpay_payment_id || '—'}</td>
                            <td className="py-2.5 px-3 text-slate-400">{new Date(p.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 13. SUBSCRIPTIONS */}
              {activeSection === 'subscriptions' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Institute Subscriptions</h3>
                      <p className="text-xs text-slate-500">Plan lifecycle: PENDING, ACTIVE, EXPIRED, CANCELLED</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          <th className="py-2.5 px-3 font-bold">Institute</th>
                          <th className="py-2.5 px-3 font-bold">Plan</th>
                          <th className="py-2.5 px-3 font-bold">Status</th>
                          <th className="py-2.5 px-3 font-bold">Enrolled</th>
                          <th className="py-2.5 px-3 font-bold">Capacity</th>
                          <th className="py-2.5 px-3 font-bold">Expiration Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {subscriptionsList.map((sub) => (
                          <tr key={sub.id} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3 font-bold text-slate-900">{sub.name}</td>
                            <td className="py-2.5 px-3 font-mono text-blue-700">{sub.subscription_plan}</td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                sub.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}>
                                {sub.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold">{sub.active_students || 0}</td>
                            <td className="py-2.5 px-3 font-mono">{sub.max_students || 500}</td>
                            <td className="py-2.5 px-3 text-slate-500">
                              {sub.subscription_expires_at ? new Date(sub.subscription_expires_at).toLocaleDateString() : 'Active Ongoing'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 14. ANALYTICS */}
              {activeSection === 'analytics' && analyticsData && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {analyticsData.levelStats?.map((ls: any) => (
                      <div key={ls.level} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                        <p className="text-xs text-slate-500 font-medium">{ls.level}</p>
                        <p className="text-xl font-bold text-slate-900 mt-1">{ls.evaluations_count} evaluations</p>
                        <p className="text-xs text-blue-600 mt-1">Avg Score: {Math.round((ls.average_percentage || 0) * 10) / 10}%</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Top Evaluated Subjects</h4>
                    <div className="space-y-2">
                      {analyticsData.topSubjects?.map((ts: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 text-xs">
                          <span className="font-medium text-slate-800">{ts.subject_name}</span>
                          <div className="flex items-center gap-4">
                            <span className="font-mono text-slate-500">{ts.eval_count} checks</span>
                            <span className="font-mono font-bold text-blue-600">{Math.round((ts.avg_score || 0) * 10) / 10}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 15. NOTIFICATIONS */}
              {activeSection === 'notifications' && (
                <div className="space-y-6">
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs max-w-xl">
                    <h3 className="text-sm font-bold text-slate-900 mb-1">Broadcast System Notification</h3>
                    <p className="text-xs text-slate-500 mb-4">Send in-app notification alerts to students or institutes</p>

                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Target Audience</label>
                        <select
                          value={broadcastForm.targetRole}
                          onChange={(e) => setBroadcastForm({ ...broadcastForm, targetRole: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"
                        >
                          <option value="ALL">All Users</option>
                          <option value="STUDENT">Students Only</option>
                          <option value="INSTITUTE_ADMIN">Institutes Only</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Notification Title</label>
                        <input
                          type="text"
                          placeholder="e.g. ICAI May 2026 MTP Series I Released"
                          value={broadcastForm.title}
                          onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Message Content</label>
                        <textarea
                          rows={3}
                          placeholder="Enter broadcast message details..."
                          value={broadcastForm.message}
                          onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <button
                        onClick={handleSendBroadcast}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition"
                      >
                        Send Broadcast
                      </button>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Recent Notifications Sent</h4>
                    <div className="space-y-2">
                      {notificationsList.map((n) => (
                        <div key={n.id} className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800">{n.title}</span>
                            <span className="text-[10px] text-slate-400">{new Date(n.created_at).toLocaleDateString()}</span>
                          </div>
                          <p className="text-slate-600 mt-1">{n.message}</p>
                          <p className="text-[10px] text-slate-400 mt-1">Recipient: {n.user_email || 'Broadcast'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 16. SUPPORT TICKETS */}
              {activeSection === 'support' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Student Support Inquiries</h3>
                      <p className="text-xs text-slate-500">Official CA Exam Checker inquiry tickets</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {supportTickets.length === 0 && (
                      <p className="text-xs text-slate-400 italic py-4">No support tickets found.</p>
                    )}
                    {supportTickets.map((t) => (
                      <div key={t.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50/60 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-slate-900">{t.subject}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            t.status === 'RESOLVED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {t.status}
                          </span>
                        </div>
                        <p className="text-slate-500 text-[11px] mb-2">From: {t.name} ({t.email})</p>
                        <p className="text-slate-700 bg-white p-3 rounded border border-slate-100 mb-2">{t.message}</p>
                        {t.admin_reply ? (
                          <div className="p-2.5 rounded bg-blue-50 border border-blue-100 text-blue-900">
                            <span className="font-bold text-[10px]">Admin Reply: </span>
                            {t.admin_reply}
                          </div>
                        ) : (
                          <button
                            onClick={() => setTicketReplyModal({ ticket: t, reply: '' })}
                            className="px-3 py-1 bg-blue-600 text-white rounded font-bold text-xs hover:bg-blue-700"
                          >
                            Reply & Resolve
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 17. PERMANENT FREE ACCESS */}
              {activeSection === 'free-access' && (
                <div className="space-y-6">
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs max-w-xl">
                    <h3 className="text-sm font-bold text-slate-900 mb-1">Grant Permanent Free Entitlement</h3>
                    <p className="text-xs text-slate-500 mb-4">
                      Permanent free access grants unlimited answer sheet evaluations without credits.
                    </p>

                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Student / Founder Email</label>
                        <input
                          type="email"
                          placeholder="e.g. student@gmail.com"
                          value={newFreeEmail}
                          onChange={(e) => setNewFreeEmail(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Reason / Entitlement Basis</label>
                        <input
                          type="text"
                          placeholder="e.g. Core Founder / Verified System Lifetime Access"
                          value={newFreeReason}
                          onChange={(e) => setNewFreeReason(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                        />
                      </div>
                      <button
                        onClick={handleGrantFreeAccess}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition"
                      >
                        Grant Permanent Free Access
                      </button>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Active Permanent Free Accounts</h4>
                    <div className="divide-y divide-slate-100">
                      {freeAccessList.map((item) => (
                        <div key={item.id} className="py-3 flex items-center justify-between text-xs">
                          <div>
                            <p className="font-bold text-slate-900">{item.email}</p>
                            <p className="text-[11px] text-slate-500">{item.reason}</p>
                            <p className="text-[10px] text-slate-400">Granted by {item.granted_by} on {new Date(item.created_at).toLocaleDateString()}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">
                              Active
                            </span>
                            <button
                              onClick={() => handleRevokeFreeAccess(item.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                              title="Revoke Access"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 17B. PROMO CODES & REFERRAL CAMPAIGNS */}
              {(activeSection === 'promo-codes' || activeSection === 'referrals') && (
                <AdminPromoCodesSection />
              )}

              {/* 18. SETTINGS */}
              {activeSection === 'settings' && settingsData && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs max-w-xl space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">System Environment & Diagnostics</h3>
                    <p className="text-xs text-slate-500">Live runtime gateway status and server configuration</p>
                  </div>

                  <div className="space-y-2 text-xs border-t border-slate-100 pt-3">
                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                      <span className="text-slate-500">Database Engine</span>
                      <span className="font-mono font-bold text-slate-800">{settingsData.environment?.database}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                      <span className="text-slate-500">Server Port</span>
                      <span className="font-mono font-bold text-slate-800">{settingsData.environment?.port}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                      <span className="text-slate-500">Razorpay Gateway Configured</span>
                      <span className={`font-mono font-bold ${settingsData.environment?.razorpayConfigured ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {settingsData.environment?.razorpayConfigured ? 'YES (Live Gateway Active)' : 'Pending (.env secrets)'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                      <span className="text-slate-500">Gemini AI Evaluation Model</span>
                      <span className={`font-mono font-bold ${settingsData.environment?.geminiConfigured ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {settingsData.environment?.geminiConfigured ? 'Configured & Ready' : 'Pending GEMINI_API_KEY'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                      <span className="text-slate-500">Immutable Audit Logs Stored</span>
                      <span className="font-mono font-bold text-blue-600">{settingsData.auditLogCount}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-50">
                      <span className="text-slate-500">Registered Accounts in DB</span>
                      <span className="font-mono font-bold text-slate-800">{settingsData.totalUsers}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 19. AUDIT LOGS */}
              {activeSection === 'audit-logs' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Immutable System Audit Trail</h3>
                      <p className="text-xs text-slate-500">Cryptographically verifiable actions and security events</p>
                    </div>
                    <span className="text-xs text-slate-500">{auditLogsList.length} recorded events</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          <th className="py-2.5 px-3 font-bold">Event Action</th>
                          <th className="py-2.5 px-3 font-bold">User / Actor</th>
                          <th className="py-2.5 px-3 font-bold">Entity</th>
                          <th className="py-2.5 px-3 font-bold">Details</th>
                          <th className="py-2.5 px-3 font-bold">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {auditLogsList.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{log.action}</td>
                            <td className="py-2.5 px-3 text-slate-700">{log.user_email || log.user_id || 'SYSTEM'}</td>
                            <td className="py-2.5 px-3 text-slate-500">{log.entity_type} ({log.entity_id || '—'})</td>
                            <td className="py-2.5 px-3 text-slate-600">{log.details}</td>
                            <td className="py-2.5 px-3 text-slate-400">{new Date(log.created_at).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 20. REVOCATION REQUESTS */}
              {activeSection === 'revocation-requests' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-rose-600" />
                        Account Suspension Revocation Appeals
                      </h3>
                      <p className="text-xs text-slate-500">
                        Review formal student and institute appeals, examine reasons, and render binding reinstatement verdicts
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((filter) => (
                        <button
                          key={filter}
                          onClick={() => setRevocationStatusFilter(filter)}
                          className={`px-3 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                            revocationStatusFilter === filter
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {filter}
                        </button>
                      ))}
                      <button
                        onClick={loadActiveSectionData}
                        className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                        title="Refresh list"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {revocationRequests.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs">
                      <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                      <p className="font-semibold text-slate-600">No revocation requests found</p>
                      <p className="text-[11px] mt-1">There are no appeals matching the current filter.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                            <th className="py-2.5 px-3 font-bold">User</th>
                            <th className="py-2.5 px-3 font-bold">Suspension Reason</th>
                            <th className="py-2.5 px-3 font-bold">Appeal Statement</th>
                            <th className="py-2.5 px-3 font-bold">Status</th>
                            <th className="py-2.5 px-3 font-bold">Submitted</th>
                            <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {revocationRequests.map((req) => (
                            <tr key={req.id} className="hover:bg-slate-50/80">
                              <td className="py-2.5 px-3">
                                <p className="font-bold text-slate-900">{req.user_name}</p>
                                <p className="text-[11px] text-slate-400">{req.user_email}</p>
                                <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 text-slate-600">
                                  {req.user_role}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 max-w-xs">
                                <p className="text-rose-900 font-medium line-clamp-2">
                                  {req.suspension_reason || 'Administrative suspension'}
                                </p>
                                {req.suspended_at && (
                                  <p className="text-[10px] text-slate-400 mt-0.5">
                                    {new Date(req.suspended_at).toLocaleDateString()}
                                  </p>
                                )}
                              </td>
                              <td className="py-2.5 px-3 max-w-sm">
                                <p className="font-bold text-slate-800">{req.appeal_reason}</p>
                                <p className="text-slate-600 text-[11px] line-clamp-2 mt-0.5">{req.explanation}</p>
                                {req.supporting_info && (
                                  <p className="text-slate-400 text-[10px] mt-0.5">Info: {req.supporting_info}</p>
                                )}
                                {req.admin_reply && (
                                  <div className="mt-1 p-1.5 rounded bg-slate-100 border border-slate-200 text-[11px]">
                                    <span className="font-bold text-slate-700">Reply: </span>
                                    <span className="text-slate-600">{req.admin_reply}</span>
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  req.status === 'APPROVED'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : req.status === 'REJECTED'
                                    ? 'bg-rose-50 text-rose-700'
                                    : 'bg-amber-50 text-amber-700'
                                }`}>
                                  {req.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-400">
                                {new Date(req.created_at).toLocaleDateString()}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {req.status === 'PENDING' ? (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => setRevocationReviewModal({
                                        request: req,
                                        decision: 'APPROVED',
                                        reply: 'Your appeal has been accepted. Account access has been fully restored.',
                                      })}
                                      className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => setRevocationReviewModal({
                                        request: req,
                                        decision: 'REJECTED',
                                        reply: 'Your appeal has been denied due to non-compliance with examination integrity policies.',
                                      })}
                                      className="px-2 py-1 rounded text-[10px] font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic">Resolved</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Credit Adjust Modal */}
      {creditAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl max-w-sm w-full p-5 shadow-xl text-slate-800">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Adjust Student Credits</h3>
            <p className="text-xs text-slate-500 mb-4">{creditAdjustModal.student.full_name} ({creditAdjustModal.student.email})</p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Credits Delta (positive or negative)</label>
                <input
                  type="number"
                  value={creditAdjustModal.delta}
                  onChange={(e) => setCreditAdjustModal({ ...creditAdjustModal, delta: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Reason</label>
                <input
                  type="text"
                  value={creditAdjustModal.reason}
                  onChange={(e) => setCreditAdjustModal({ ...creditAdjustModal, reason: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setCreditAdjustModal(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdjustCredits}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                >
                  Confirm Adjustment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Paper Modal */}
      {showUploadPaperModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-5 shadow-xl text-slate-800 max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Add ICAI Question Paper & Model Answer</h3>
            <p className="text-xs text-slate-500 mb-4">Reference ground truth used for AI step-marking</p>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Level</label>
                  <select
                    value={newPaperForm.level}
                    onChange={(e) => setNewPaperForm({ ...newPaperForm, level: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50"
                  >
                    <option value="FOUNDATION">CA Foundation</option>
                    <option value="INTERMEDIATE">CA Intermediate</option>
                    <option value="FINAL">CA Final</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Attempt</label>
                  <input
                    type="text"
                    value={newPaperForm.attempt}
                    onChange={(e) => setNewPaperForm({ ...newPaperForm, attempt: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Paper Title</label>
                <input
                  type="text"
                  placeholder="e.g. ICAI Mock Test Paper Series I - Advanced Accounting"
                  value={newPaperForm.questionPaperTitle}
                  onChange={(e) => setNewPaperForm({ ...newPaperForm, questionPaperTitle: e.target.value })}
                  className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Question Paper Text</label>
                <textarea
                  rows={4}
                  placeholder="Paste question paper questions..."
                  value={newPaperForm.questionPaperText}
                  onChange={(e) => setNewPaperForm({ ...newPaperForm, questionPaperText: e.target.value })}
                  className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50 font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Suggested Answers Text</label>
                <textarea
                  rows={4}
                  placeholder="Paste suggested answers & working notes..."
                  value={newPaperForm.suggestedAnswersText}
                  onChange={(e) => setNewPaperForm({ ...newPaperForm, suggestedAnswersText: e.target.value })}
                  className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50 font-mono text-[11px]"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setShowUploadPaperModal(false)}
                  className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUploadPaper}
                  className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                >
                  Upload Paper
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ticket Reply Modal */}
      {ticketReplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 shadow-xl text-slate-800">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Reply to Student Inquiry</h3>
            <p className="text-xs text-slate-500 mb-3">{ticketReplyModal.ticket.subject} from {ticketReplyModal.ticket.email}</p>

            <div className="space-y-3 text-xs">
              <div className="p-2.5 rounded bg-slate-50 border border-slate-100 text-slate-700 max-h-32 overflow-y-auto">
                {ticketReplyModal.ticket.message}
              </div>
              <textarea
                rows={3}
                placeholder="Enter admin response..."
                value={ticketReplyModal.reply}
                onChange={(e) => setTicketReplyModal({ ...ticketReplyModal, reply: e.target.value })}
                className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50 focus:bg-white"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setTicketReplyModal(null)}
                  className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReplyTicket}
                  className="px-3 py-1.5 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700"
                >
                  Send Reply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suspend User Modal */}
      {suspendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white border border-rose-200 rounded-xl max-w-md w-full p-5 shadow-xl text-slate-800">
            <div className="flex items-center gap-2.5 mb-3 text-rose-600">
              <AlertOctagon className="w-5 h-5" />
              <h3 className="text-sm font-bold text-slate-900">Suspend User Account</h3>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Suspending <strong className="text-slate-900">{suspendModal.user.full_name}</strong> ({suspendModal.user.email}). The user will immediately be blocked from evaluations and will see this exact suspension reason.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Public Suspension Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Reason displayed directly to the student upon login/access attempt..."
                  value={suspendModal.reason}
                  onChange={(e) => setSuspendModal({ ...suspendModal, reason: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Internal Administrative Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Confidential remarks for admin audit logs..."
                  value={suspendModal.internalNote}
                  onChange={(e) => setSuspendModal({ ...suspendModal, internalNote: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-slate-400"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setSuspendModal(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSuspension}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                >
                  Confirm Suspension
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Revocation Review Modal */}
      {revocationReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-5 shadow-xl text-slate-800">
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              Review Revocation Appeal: {revocationReviewModal.decision === 'APPROVED' ? 'Approve Reinstatement' : 'Reject Appeal'}
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Candidate: <strong className="text-slate-800">{revocationReviewModal.request.user_name}</strong> ({revocationReviewModal.request.user_email})
            </p>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5 mb-3">
              <div>
                <span className="font-bold text-slate-700">Appeal Basis: </span>
                <span className="text-slate-900">{revocationReviewModal.request.appeal_reason}</span>
              </div>
              <div>
                <span className="font-bold text-slate-700">Explanation: </span>
                <span className="text-slate-800">{revocationReviewModal.request.explanation}</span>
              </div>
              {revocationReviewModal.request.supporting_info && (
                <div>
                  <span className="font-bold text-slate-700">Supporting Info: </span>
                  <span className="text-slate-800">{revocationReviewModal.request.supporting_info}</span>
                </div>
              )}
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Administrator Response / Note to User
                </label>
                <textarea
                  rows={3}
                  value={revocationReviewModal.reply}
                  onChange={(e) => setRevocationReviewModal({ ...revocationReviewModal, reply: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setRevocationReviewModal(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReviewRevocation}
                  className={`px-4 py-1.5 rounded-lg text-white font-bold cursor-pointer ${
                    revocationReviewModal.decision === 'APPROVED'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  Confirm {revocationReviewModal.decision}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
