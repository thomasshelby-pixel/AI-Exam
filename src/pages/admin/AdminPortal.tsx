import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { apiRequest } from '../../api/client.js';
import { MaterialManagement } from '../../components/admin/MaterialManagement.js';
import { EvaluationControls } from '../../components/admin/EvaluationControls.js';
import { ModelManagement } from '../../components/admin/ModelManagement.js';
import { AdminPromoCodesSection } from './AdminPromoCodesSection.js';
import { AdminDataCleanupSection } from './AdminDataCleanupSection.js';
import { getAttemptsForLevel, fetchExamAttempts, ExamAttempt } from '../../lib/attempts.js';
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
  AlertTriangle,
  Eye,
  FlaskConical,
  Power,
  Filter,
  X,
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
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [studentLevelFilter, setStudentLevelFilter] = useState<string>('ALL');
  const [studentClassificationFilter, setStudentClassificationFilter] = useState<string>('ALL');
  const [creditAdjustModal, setCreditAdjustModal] = useState<{ student: any; delta: string; reason: string } | null>(null);
  const [deleteStudentModal, setDeleteStudentModal] = useState<{ student: any } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  const [isDeletingStudent, setIsDeletingStudent] = useState<boolean>(false);
  const [deleteStudentError, setDeleteStudentError] = useState<string | null>(null);
  const [viewStudentModal, setViewStudentModal] = useState<{ student: any; details?: any; loading: boolean } | null>(null);
  const [isUpdatingClassification, setIsUpdatingClassification] = useState<boolean>(false);

  // Institutes
  const [institutesList, setInstitutesList] = useState<any[]>([]);
  const [instituteSearch, setInstituteSearch] = useState<string>('');
  const [instituteStatusFilter, setInstituteStatusFilter] = useState<string>('ALL');
  const [instituteClassificationFilter, setInstituteClassificationFilter] = useState<string>('ALL');
  const [viewInstituteModal, setViewInstituteModal] = useState<{ institute: any } | null>(null);
  const [deleteInstituteModal, setDeleteInstituteModal] = useState<{ institute: any } | null>(null);
  const [deleteInstituteConfirmText, setDeleteInstituteConfirmText] = useState<string>('');
  const [isDeletingInstitute, setIsDeletingInstitute] = useState<boolean>(false);
  const [deleteInstituteError, setDeleteInstituteError] = useState<string | null>(null);
  const [isUpdatingInstituteClassification, setIsUpdatingInstituteClassification] = useState<boolean>(false);

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

  const [paperModalAttempts, setPaperModalAttempts] = useState<ExamAttempt[]>(() =>
    getAttemptsForLevel(newPaperForm.level)
  );

  useEffect(() => {
    let isMounted = true;
    fetchExamAttempts(newPaperForm.level).then((attempts) => {
      if (isMounted && attempts.length > 0) {
        setPaperModalAttempts(attempts);
        if (!attempts.some((a) => a.attemptLabel === newPaperForm.attempt)) {
          const defaultMay26 = attempts.find((a) => a.attemptLabel === 'May 2026');
          setNewPaperForm((prev) => ({
            ...prev,
            attempt: defaultMay26 ? defaultMay26.attemptLabel : attempts[0].attemptLabel,
          }));
        }
      }
    });
    return () => {
      isMounted = false;
    };
  }, [newPaperForm.level]);

  // Evaluations
  const [evaluationsList, setEvaluationsList] = useState<any[]>([]);
  const [selectedEvalDetail, setSelectedEvalDetail] = useState<any>(null);
  const [evalSearch, setEvalSearch] = useState<string>('');
  const [evalLevelFilter, setEvalLevelFilter] = useState<string>('ALL');
  const [evalStatusFilter, setEvalStatusFilter] = useState<string>('ALL');
  const [evalClassificationFilter, setEvalClassificationFilter] = useState<string>('ALL');
  const [evalSourceFilter, setEvalSourceFilter] = useState<string>('ALL');

  // Single evaluation delete modal
  const [deleteEvalModal, setDeleteEvalModal] = useState<{ evaluation: any } | null>(null);
  const [deleteEvalConfirmText, setDeleteEvalConfirmText] = useState<string>('');
  const [deleteEvalReason, setDeleteEvalReason] = useState<string>('Testing / Development cleanup');
  const [deleteEvalCustomReason, setDeleteEvalCustomReason] = useState<string>('');
  const [isDeletingEval, setIsDeletingEval] = useState<boolean>(false);
  const [deleteEvalError, setDeleteEvalError] = useState<string | null>(null);

  // Bulk evaluations delete modal
  const [selectedEvaluationIds, setSelectedEvaluationIds] = useState<string[]>([]);
  const [bulkDeleteEvalModalOpen, setBulkDeleteEvalModalOpen] = useState<boolean>(false);
  const [bulkDeleteEvalConfirmText, setBulkDeleteEvalConfirmText] = useState<string>('');
  const [bulkDeleteEvalReason, setBulkDeleteEvalReason] = useState<string>('Testing / Development cleanup');
  const [bulkDeleteEvalCustomReason, setBulkDeleteEvalCustomReason] = useState<string>('');
  const [isBulkDeletingEval, setIsBulkDeletingEval] = useState<boolean>(false);
  const [bulkDeleteEvalError, setBulkDeleteEvalError] = useState<string | null>(null);

  // View evaluation inspection details modal
  const [viewEvaluationModal, setViewEvaluationModal] = useState<any | null>(null);
  const [isLoadingEvaluationDetails, setIsLoadingEvaluationDetails] = useState<boolean>(false);
  const [viewEvaluationDetailsError, setViewEvaluationDetailsError] = useState<string | null>(null);

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
  const [paymentSearch, setPaymentSearch] = useState<string>('');
  const [paymentClassificationFilter, setPaymentClassificationFilter] = useState<string>('ALL');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('ALL');
  
  // Single delete modal
  const [deletePaymentModal, setDeletePaymentModal] = useState<{ order: any } | null>(null);
  const [deletePaymentConfirmText, setDeletePaymentConfirmText] = useState<string>('');
  const [deletePaymentReason, setDeletePaymentReason] = useState<string>('Testing');
  const [deletePaymentCustomReason, setDeletePaymentCustomReason] = useState<string>('');
  const [isDeletingPayment, setIsDeletingPayment] = useState<boolean>(false);
  const [deletePaymentError, setDeletePaymentError] = useState<string | null>(null);

  // Bulk selection & bulk delete modal
  const [selectedPaymentOrderIds, setSelectedPaymentOrderIds] = useState<string[]>([]);
  const [bulkDeletePaymentModalOpen, setBulkDeletePaymentModalOpen] = useState<boolean>(false);
  const [bulkDeletePaymentConfirmText, setBulkDeletePaymentConfirmText] = useState<string>('');
  const [bulkDeletePaymentReason, setBulkDeletePaymentReason] = useState<string>('Testing');
  const [bulkDeletePaymentCustomReason, setBulkDeletePaymentCustomReason] = useState<string>('');
  const [isBulkDeletingPayment, setIsBulkDeletingPayment] = useState<boolean>(false);
  const [bulkDeletePaymentError, setBulkDeletePaymentError] = useState<string | null>(null);

  // View order details modal
  const [viewPaymentOrderModal, setViewPaymentOrderModal] = useState<any | null>(null);
  const [isLoadingOrderDetails, setIsLoadingOrderDetails] = useState<boolean>(false);
  const [viewOrderDetailsError, setViewOrderDetailsError] = useState<string | null>(null);

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
          const queryParams = new URLSearchParams();
          if (studentSearch.trim()) queryParams.set('search', studentSearch.trim());
          if (studentLevelFilter !== 'ALL') queryParams.set('caLevel', studentLevelFilter);
          if (studentClassificationFilter !== 'ALL') queryParams.set('classification', studentClassificationFilter);
          const res = await apiRequest<{ students: any[] }>(`/api/admin/students?${queryParams.toString()}`);
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
          const queryParams = new URLSearchParams();
          if (evalSearch.trim()) queryParams.set('search', evalSearch.trim());
          if (evalLevelFilter !== 'ALL') queryParams.set('level', evalLevelFilter);
          if (evalStatusFilter !== 'ALL') queryParams.set('status', evalStatusFilter);
          if (evalClassificationFilter !== 'ALL') queryParams.set('classification', evalClassificationFilter);
          if (evalSourceFilter !== 'ALL') queryParams.set('source', evalSourceFilter);
          const res = await apiRequest<{ evaluations: any[] }>(`/api/admin/evaluations?${queryParams.toString()}`);
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
  }, [
    activeSection,
    revocationStatusFilter,
    studentSearch,
    studentLevelFilter,
    studentClassificationFilter,
    evalSearch,
    evalLevelFilter,
    evalStatusFilter,
    evalClassificationFilter,
    evalSourceFilter,
    isAuthenticated,
    user,
  ]);

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

  // Permanently Delete Student Account (Super Admin Only)
  const handlePermanentlyDeleteStudent = async () => {
    if (!deleteStudentModal) return;
    if (deleteConfirmText.trim() !== 'DELETE') {
      setDeleteStudentError('You must type DELETE exactly to enable and confirm permanent deletion.');
      return;
    }

    setIsDeletingStudent(true);
    setDeleteStudentError(null);

    try {
      const res = await apiRequest<{ success: boolean; message: string }>(
        `/api/admin/students/${deleteStudentModal.student.id}`,
        { method: 'DELETE' }
      );

      setSuccessMsg(res.message || `Student ${deleteStudentModal.student.full_name} (${deleteStudentModal.student.email}) has been permanently deleted.`);
      setDeleteStudentModal(null);
      setDeleteConfirmText('');
      if (viewStudentModal?.student?.id === deleteStudentModal.student.id) {
        setViewStudentModal(null);
      }
      loadActiveSectionData();
    } catch (err: any) {
      setDeleteStudentError(err instanceof Error ? err.message : 'Failed to permanently delete student account');
    } finally {
      setIsDeletingStudent(false);
    }
  };

  // View Student Full Details Modal
  const handleOpenViewStudent = async (student: any) => {
    setViewStudentModal({ student, loading: true });
    try {
      const res = await apiRequest<{ student: any; recentEvaluations: any[]; creditLedger: any[] }>(
        `/api/admin/students/${student.id}`
      );
      setViewStudentModal({
        student: res.student || student,
        details: res,
        loading: false,
      });
    } catch {
      setViewStudentModal({ student, loading: false });
    }
  };

  // Toggle Student Account Classification (NORMAL vs TEST)
  const handleToggleStudentClassification = async (studentId: string, currentClassification: string) => {
    const nextClassification = currentClassification === 'TEST' ? 'NORMAL' : 'TEST';
    setIsUpdatingClassification(true);
    try {
      await apiRequest(`/api/admin/students/${studentId}/classification`, {
        method: 'PATCH',
        body: JSON.stringify({ classification: nextClassification }),
      });
      setSuccessMsg(`Student classification successfully updated to ${nextClassification}.`);
      if (viewStudentModal && viewStudentModal.student.id === studentId) {
        setViewStudentModal(prev => prev ? {
          ...prev,
          student: { ...prev.student, account_classification: nextClassification },
        } : null);
      }
      loadActiveSectionData();
    } catch (err: any) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update classification');
    } finally {
      setIsUpdatingClassification(false);
    }
  };

  // Toggle Institute Status (ACTIVE vs SUSPENDED)
  const handleToggleInstituteStatus = async (instituteId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await apiRequest(`/api/admin/institutes/${instituteId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      setSuccessMsg(`Institute status updated to ${nextStatus}.`);
      if (viewInstituteModal && viewInstituteModal.institute.id === instituteId) {
        setViewInstituteModal(prev => prev ? {
          ...prev,
          institute: { ...prev.institute, status: nextStatus },
        } : null);
      }
      loadActiveSectionData();
    } catch (err: any) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update institute status');
    }
  };

  // Toggle Institute Classification (NORMAL vs TEST)
  const handleToggleInstituteClassification = async (instituteId: string, currentClassification: string) => {
    const nextClassification = currentClassification === 'TEST' ? 'NORMAL' : 'TEST';
    setIsUpdatingInstituteClassification(true);
    try {
      await apiRequest(`/api/admin/institutes/${instituteId}/classification`, {
        method: 'PUT',
        body: JSON.stringify({ classification: nextClassification }),
      });
      setSuccessMsg(`Institute classification updated to ${nextClassification}.`);
      if (viewInstituteModal && viewInstituteModal.institute.id === instituteId) {
        setViewInstituteModal(prev => prev ? {
          ...prev,
          institute: { ...prev.institute, account_classification: nextClassification },
        } : null);
      }
      loadActiveSectionData();
    } catch (err: any) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update institute classification');
    } finally {
      setIsUpdatingInstituteClassification(false);
    }
  };

  // Permanently Delete Institute Account (Super Admin Only)
  const handlePermanentlyDeleteInstitute = async () => {
    if (!deleteInstituteModal) return;
    if (deleteInstituteConfirmText.trim() !== 'DELETE') {
      setDeleteInstituteError('You must type DELETE exactly to enable and confirm permanent deletion.');
      return;
    }

    setIsDeletingInstitute(true);
    setDeleteInstituteError(null);

    try {
      const res = await apiRequest<{ success: boolean; message: string }>(
        `/api/admin/institutes/${deleteInstituteModal.institute.id}`,
        { method: 'DELETE' }
      );

      setSuccessMsg(res.message || `Institute ${deleteInstituteModal.institute.name} has been permanently deleted.`);
      setDeleteInstituteModal(null);
      setDeleteInstituteConfirmText('');
      if (viewInstituteModal?.institute?.id === deleteInstituteModal.institute.id) {
        setViewInstituteModal(null);
      }
      loadActiveSectionData();
    } catch (err: any) {
      setDeleteInstituteError(err instanceof Error ? err.message : 'Failed to permanently delete institute');
    } finally {
      setIsDeletingInstitute(false);
    }
  };

  // View Order Details
  const handleViewOrderDetails = async (orderId: string) => {
    setIsLoadingOrderDetails(true);
    setViewOrderDetailsError(null);
    try {
      const res = await apiRequest<{ order: any }>(`/api/admin/payments/orders/${orderId}`);
      setViewPaymentOrderModal(res.order);
    } catch (err: any) {
      setViewOrderDetailsError(err instanceof Error ? err.message : 'Failed to load order details');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load order details');
    } finally {
      setIsLoadingOrderDetails(false);
    }
  };

  // Permanently Delete Single Payment Order (Super Admin)
  const handlePermanentlyDeletePayment = async () => {
    if (!deletePaymentModal) return;
    if (deletePaymentConfirmText.trim() !== 'DELETE') {
      setDeletePaymentError('You must type DELETE exactly to confirm permanent deletion.');
      return;
    }

    setIsDeletingPayment(true);
    setDeletePaymentError(null);

    const finalReason = deletePaymentReason === 'Other' && deletePaymentCustomReason.trim()
      ? `Other: ${deletePaymentCustomReason.trim()}`
      : deletePaymentReason;

    try {
      const res = await apiRequest<{ success: boolean; message: string }>(
        `/api/admin/payments/orders/${deletePaymentModal.order.id}`,
        {
          method: 'DELETE',
          body: JSON.stringify({
            reason: finalReason,
            notes: deletePaymentCustomReason.trim(),
          }),
        }
      );

      setSuccessMsg(res.message || `Payment order ${deletePaymentModal.order.id} deleted successfully.`);
      const deletedId = deletePaymentModal.order.id;
      setDeletePaymentModal(null);
      setDeletePaymentConfirmText('');
      setDeletePaymentReason('Testing');
      setDeletePaymentCustomReason('');
      if (viewPaymentOrderModal?.id === deletedId) {
        setViewPaymentOrderModal(null);
      }
      setSelectedPaymentOrderIds((prev) => prev.filter((id) => id !== deletedId));
      loadActiveSectionData();
    } catch (err: any) {
      setDeletePaymentError(err instanceof Error ? err.message : 'Failed to delete payment order');
    } finally {
      setIsDeletingPayment(false);
    }
  };

  // Bulk Delete Payment Orders (Super Admin)
  const handleBulkDeletePayments = async () => {
    if (selectedPaymentOrderIds.length === 0) return;
    if (bulkDeletePaymentConfirmText.trim() !== 'DELETE') {
      setBulkDeletePaymentError('You must type DELETE exactly to confirm bulk deletion.');
      return;
    }

    setIsBulkDeletingPayment(true);
    setBulkDeletePaymentError(null);

    const finalReason = bulkDeletePaymentReason === 'Other' && bulkDeletePaymentCustomReason.trim()
      ? `Other: ${bulkDeletePaymentCustomReason.trim()}`
      : bulkDeletePaymentReason;

    try {
      const res = await apiRequest<{ success: boolean; message: string; deletedCount: number }>(
        '/api/admin/payments/orders/bulk-delete',
        {
          method: 'POST',
          body: JSON.stringify({
            orderIds: selectedPaymentOrderIds,
            reason: finalReason,
            notes: bulkDeletePaymentCustomReason.trim(),
          }),
        }
      );

      setSuccessMsg(res.message || `Successfully deleted ${res.deletedCount} payment orders.`);
      setBulkDeletePaymentModalOpen(false);
      setBulkDeletePaymentConfirmText('');
      setBulkDeletePaymentReason('Testing');
      setBulkDeletePaymentCustomReason('');
      setSelectedPaymentOrderIds([]);
      loadActiveSectionData();
    } catch (err: any) {
      setBulkDeletePaymentError(err instanceof Error ? err.message : 'Failed to bulk delete payment orders');
    } finally {
      setIsBulkDeletingPayment(false);
    }
  };

  // View Evaluation Inspection Details (Super Admin & Admin)
  const handleViewEvaluationDetails = async (evaluationId: string) => {
    setIsLoadingEvaluationDetails(true);
    setViewEvaluationDetailsError(null);
    try {
      const res = await apiRequest<any>(`/api/admin/evaluations/${evaluationId}/details`);
      setViewEvaluationModal(res);
    } catch (err: any) {
      setViewEvaluationDetailsError(err instanceof Error ? err.message : 'Failed to load evaluation details');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load evaluation details');
    } finally {
      setIsLoadingEvaluationDetails(false);
    }
  };

  // Permanently Delete Single Evaluation (Super Admin only)
  const handlePermanentlyDeleteEvaluation = async () => {
    if (!deleteEvalModal) return;
    if (deleteEvalConfirmText.trim() !== 'DELETE') {
      setDeleteEvalError('You must type DELETE exactly to confirm permanent deletion.');
      return;
    }

    setIsDeletingEval(true);
    setDeleteEvalError(null);

    const finalReason = deleteEvalReason === 'Other' && deleteEvalCustomReason.trim()
      ? `Other: ${deleteEvalCustomReason.trim()}`
      : deleteEvalReason;

    try {
      const res = await apiRequest<{ success: boolean; message: string }>(
        `/api/admin/evaluations/${deleteEvalModal.evaluation.id}`,
        {
          method: 'DELETE',
          body: JSON.stringify({
            reason: finalReason,
            notes: deleteEvalCustomReason.trim(),
          }),
        }
      );

      setSuccessMsg(res.message || `Evaluation ${deleteEvalModal.evaluation.id} deleted successfully.`);
      const deletedId = deleteEvalModal.evaluation.id;
      setDeleteEvalModal(null);
      setDeleteEvalConfirmText('');
      setDeleteEvalReason('Testing / Development cleanup');
      setDeleteEvalCustomReason('');
      if (viewEvaluationModal?.evaluation?.id === deletedId) {
        setViewEvaluationModal(null);
      }
      setSelectedEvaluationIds((prev) => prev.filter((id) => id !== deletedId));
      loadActiveSectionData();
    } catch (err: any) {
      setDeleteEvalError(err instanceof Error ? err.message : 'Failed to delete evaluation');
    } finally {
      setIsDeletingEval(false);
    }
  };

  // Bulk Delete Evaluations (Super Admin only)
  const handleBulkDeleteEvaluations = async () => {
    if (selectedEvaluationIds.length === 0) return;
    if (bulkDeleteEvalConfirmText.trim() !== 'DELETE ALL') {
      setBulkDeleteEvalError('You must type DELETE ALL exactly to confirm bulk deletion.');
      return;
    }

    setIsBulkDeletingEval(true);
    setBulkDeleteEvalError(null);

    const finalReason = bulkDeleteEvalReason === 'Other' && bulkDeleteEvalCustomReason.trim()
      ? `Other: ${bulkDeleteEvalCustomReason.trim()}`
      : bulkDeleteEvalReason;

    try {
      const res = await apiRequest<{ success: boolean; message: string; deletedCount: number }>(
        '/api/admin/evaluations/bulk-delete',
        {
          method: 'POST',
          body: JSON.stringify({
            evaluationIds: selectedEvaluationIds,
            reason: finalReason,
            notes: bulkDeleteEvalCustomReason.trim(),
          }),
        }
      );

      setSuccessMsg(res.message || `Successfully deleted ${res.deletedCount} evaluations.`);
      setBulkDeleteEvalModalOpen(false);
      setBulkDeleteEvalConfirmText('');
      setBulkDeleteEvalReason('Testing / Development cleanup');
      setBulkDeleteEvalCustomReason('');
      setSelectedEvaluationIds([]);
      loadActiveSectionData();
    } catch (err: any) {
      setBulkDeleteEvalError(err instanceof Error ? err.message : 'Failed to bulk delete evaluations');
    } finally {
      setIsBulkDeletingEval(false);
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
    { id: 'data-cleanup', label: 'Test Data Cleanup', icon: Trash2 },
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
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Student Profiles & Account Governance</h3>
                      <p className="text-xs text-slate-500">Super Admin account oversight, credit adjustments, and permanent deletion controls</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                        {studentsList.length} {studentsList.length === 1 ? 'student' : 'students'} listed
                      </span>
                    </div>
                  </div>

                  {/* Search and Filters */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="sm:col-span-6 relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Search student name, email, or ICAI reg..."
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <select
                        value={studentLevelFilter}
                        onChange={(e) => setStudentLevelFilter(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                      >
                        <option value="ALL">All Levels</option>
                        <option value="FOUNDATION">CA Foundation</option>
                        <option value="INTERMEDIATE">CA Intermediate</option>
                        <option value="FINAL">CA Final</option>
                      </select>
                    </div>
                    <div className="sm:col-span-3">
                      <select
                        value={studentClassificationFilter}
                        onChange={(e) => setStudentClassificationFilter(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                      >
                        <option value="ALL">All Classifications</option>
                        <option value="NORMAL">Normal Students Only</option>
                        <option value="TEST">Test Accounts Only</option>
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          <th className="py-2.5 px-3 font-bold">Student</th>
                          <th className="py-2.5 px-3 font-bold">Classification</th>
                          <th className="py-2.5 px-3 font-bold">Status</th>
                          <th className="py-2.5 px-3 font-bold">ICAI Reg</th>
                          <th className="py-2.5 px-3 font-bold">Level</th>
                          <th className="py-2.5 px-3 font-bold">Evaluations</th>
                          <th className="py-2.5 px-3 font-bold">Credits</th>
                          <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {studentsList.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-8 text-center text-slate-400">
                              No students found matching current search or filters.
                            </td>
                          </tr>
                        ) : (
                          studentsList.map((st) => (
                            <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-3">
                                <div className="flex items-start gap-2">
                                  <div>
                                    <p className="font-bold text-slate-900">{st.full_name}</p>
                                    <p className="text-[11px] text-slate-400">{st.email}</p>
                                    {st.permanent_free_active && (
                                      <span className="inline-flex items-center gap-1 mt-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                        <Sparkles className="w-2.5 h-2.5" /> Permanent Free Access
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                {st.account_classification === 'TEST' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                    TEST
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700">
                                    NORMAL
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3">
                                {st.status === 'ACTIVE' ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                                    ACTIVE
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700">
                                    SUSPENDED
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 font-mono text-slate-700">{st.icai_registration_number || '—'}</td>
                              <td className="py-3 px-3">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">
                                  {st.ca_level || 'INTERMEDIATE'}
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                <span className="font-mono font-bold text-slate-900">{st.evaluations_count || 0}</span>
                                {st.average_percentage !== null && st.average_percentage !== undefined && (
                                  <span className="text-[10px] text-slate-400 block">
                                    Avg: {Math.round(st.average_percentage)}%
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 font-mono font-bold text-blue-600">
                                {st.purchased_credits || 0}
                              </td>
                              <td className="py-3 px-3 text-right">
                                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                  {/* 1. View */}
                                  <button
                                    onClick={() => handleOpenViewStudent(st)}
                                    className="px-2 py-1 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition flex items-center gap-1"
                                    title="View full student profile and records"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    View
                                  </button>

                                  {/* 2. Suspend / Reactivate */}
                                  <button
                                    onClick={() => handleToggleUserStatus(st)}
                                    className={`px-2 py-1 rounded text-[11px] font-semibold transition flex items-center gap-1 ${
                                      st.status === 'ACTIVE'
                                        ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                    }`}
                                    title={st.status === 'ACTIVE' ? 'Temporarily suspend student account' : 'Reactivate suspended student account'}
                                  >
                                    {st.status === 'ACTIVE' ? (
                                      <>
                                        <UserX className="w-3.5 h-3.5" />
                                        Suspend
                                      </>
                                    ) : (
                                      <>
                                        <UserCheck className="w-3.5 h-3.5" />
                                        Reactivate
                                      </>
                                    )}
                                  </button>

                                  {/* 3. Adjust Credits */}
                                  <button
                                    onClick={() => setCreditAdjustModal({ student: st, delta: '5', reason: 'Admin adjustment' })}
                                    className="px-2 py-1 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition flex items-center gap-1"
                                    title="Adjust student credit balance"
                                  >
                                    <DollarSign className="w-3.5 h-3.5" />
                                    Credits
                                  </button>

                                  {/* 4. Delete Student (Super Admin Only) */}
                                  <button
                                    onClick={() => {
                                      setDeleteStudentModal({ student: st });
                                      setDeleteConfirmText('');
                                      setDeleteStudentError(null);
                                    }}
                                    className="px-2 py-1 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800 border border-rose-200 transition flex items-center gap-1"
                                    title="Permanently delete student account (Irreversible)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                    Delete Student
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 4. INSTITUTES */}
              {activeSection === 'institutes' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Coaching Institutes & Academies</h3>
                      <p className="text-xs text-slate-500">Multi-tenant institutional licensing, classification, and lifecycle controls</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">
                        {institutesList.filter((inst) => {
                          const matchesSearch =
                            (inst.name || '').toLowerCase().includes(instituteSearch.toLowerCase()) ||
                            (inst.code || '').toLowerCase().includes(instituteSearch.toLowerCase()) ||
                            (inst.email || '').toLowerCase().includes(instituteSearch.toLowerCase());
                          const matchesStatus =
                            instituteStatusFilter === 'ALL' || inst.status === instituteStatusFilter;
                          const matchesClassification =
                            instituteClassificationFilter === 'ALL' ||
                            (inst.account_classification || 'NORMAL') === instituteClassificationFilter;
                          return matchesSearch && matchesStatus && matchesClassification;
                        }).length} of {institutesList.length} Institutes
                      </span>
                    </div>
                  </div>

                  {/* Filter & Search Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search name, code, email..."
                          value={instituteSearch}
                          onChange={(e) => setInstituteSearch(e.target.value)}
                          className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 w-52 sm:w-64"
                        />
                      </div>

                      {/* Status Filter */}
                      <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
                        <Filter className="w-3 h-3 text-slate-400" />
                        <span className="text-slate-500 text-[11px] font-medium">Status:</span>
                        <select
                          value={instituteStatusFilter}
                          onChange={(e) => setInstituteStatusFilter(e.target.value)}
                          className="bg-transparent border-none text-xs font-semibold text-slate-700 focus:outline-hidden cursor-pointer"
                        >
                          <option value="ALL">All Statuses</option>
                          <option value="ACTIVE">Active Only</option>
                          <option value="SUSPENDED">Suspended Only</option>
                        </select>
                      </div>

                      {/* Classification Filter */}
                      <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
                        <FlaskConical className="w-3 h-3 text-amber-500" />
                        <span className="text-slate-500 text-[11px] font-medium">Type:</span>
                        <select
                          value={instituteClassificationFilter}
                          onChange={(e) => setInstituteClassificationFilter(e.target.value)}
                          className="bg-transparent border-none text-xs font-semibold text-slate-700 focus:outline-hidden cursor-pointer"
                        >
                          <option value="ALL">All Types</option>
                          <option value="NORMAL">Production (Normal)</option>
                          <option value="TEST">Test (Demo / Staging)</option>
                        </select>
                      </div>
                    </div>

                    {(instituteSearch || instituteStatusFilter !== 'ALL' || instituteClassificationFilter !== 'ALL') && (
                      <button
                        onClick={() => {
                          setInstituteSearch('');
                          setInstituteStatusFilter('ALL');
                          setInstituteClassificationFilter('ALL');
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>

                  {/* Institutes Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          <th className="py-2.5 px-3 font-bold">Institute Name & Classification</th>
                          <th className="py-2.5 px-3 font-bold">Code</th>
                          <th className="py-2.5 px-3 font-bold">Contact Email</th>
                          <th className="py-2.5 px-3 font-bold">Status</th>
                          <th className="py-2.5 px-3 font-bold">Students</th>
                          <th className="py-2.5 px-3 font-bold">Max Quota</th>
                          <th className="py-2.5 px-3 font-bold">Expires</th>
                          <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {institutesList
                          .filter((inst) => {
                            const matchesSearch =
                              (inst.name || '').toLowerCase().includes(instituteSearch.toLowerCase()) ||
                              (inst.code || '').toLowerCase().includes(instituteSearch.toLowerCase()) ||
                              (inst.email || '').toLowerCase().includes(instituteSearch.toLowerCase());
                            const matchesStatus =
                              instituteStatusFilter === 'ALL' || inst.status === instituteStatusFilter;
                            const matchesClassification =
                              instituteClassificationFilter === 'ALL' ||
                              (inst.account_classification || 'NORMAL') === instituteClassificationFilter;
                            return matchesSearch && matchesStatus && matchesClassification;
                          })
                          .map((inst) => (
                            <tr key={inst.id} className="hover:bg-slate-50/80">
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900">{inst.name}</span>
                                  {inst.account_classification === 'TEST' ? (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1">
                                      <FlaskConical className="w-2.5 h-2.5" />
                                      TEST
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                      PRODUCTION
                                    </span>
                                  )}
                                </div>
                                {inst.contact_person && (
                                  <span className="text-[11px] text-slate-400 block">{inst.contact_person}</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-purple-700">{inst.code}</td>
                              <td className="py-2.5 px-3 text-slate-500">{inst.email}</td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    inst.status === 'ACTIVE'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-rose-50 text-rose-700'
                                  }`}
                                >
                                  {inst.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-blue-600">
                                {inst.active_count || 0}
                              </td>
                              <td className="py-2.5 px-3 font-mono">{inst.max_students || 500}</td>
                              <td className="py-2.5 px-3 text-slate-400">
                                {inst.subscription_expires_at
                                  ? new Date(inst.subscription_expires_at).toLocaleDateString()
                                  : 'Lifetime'}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {/* View Details */}
                                  <button
                                    onClick={() => setViewInstituteModal({ institute: inst })}
                                    className="px-2 py-1 rounded text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center gap-1 cursor-pointer"
                                    title="View institute details"
                                  >
                                    <Eye className="w-3 h-3" />
                                    View
                                  </button>

                                  {/* Suspend / Activate Toggle */}
                                  <button
                                    onClick={() => handleToggleInstituteStatus(inst.id, inst.status)}
                                    className={`px-2 py-1 rounded text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer ${
                                      inst.status === 'ACTIVE'
                                        ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                    }`}
                                    title={inst.status === 'ACTIVE' ? 'Suspend Institute' : 'Activate Institute'}
                                  >
                                    <Power className="w-3 h-3" />
                                    {inst.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                                  </button>

                                  {/* Delete Institute (Super Admin Only) */}
                                  <button
                                    onClick={() => {
                                      setDeleteInstituteModal({ institute: inst });
                                      setDeleteInstituteConfirmText('');
                                      setDeleteInstituteError(null);
                                    }}
                                    className="px-2 py-1 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800 border border-rose-200 transition flex items-center gap-1 cursor-pointer"
                                    title="Permanently delete institute account (Irreversible)"
                                  >
                                    <Trash2 className="w-3 h-3 text-rose-600" />
                                    Delete Institute
                                  </button>
                                </div>
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
              {activeSection === 'evaluations' && (() => {
                const filteredEvaluations = evaluationsList.filter((ev) => {
                  const matchesSearch =
                    !evalSearch.trim() ||
                    (ev.id || '').toLowerCase().includes(evalSearch.toLowerCase()) ||
                    (ev.student_name || '').toLowerCase().includes(evalSearch.toLowerCase()) ||
                    (ev.student_email || '').toLowerCase().includes(evalSearch.toLowerCase()) ||
                    (ev.subject_name || '').toLowerCase().includes(evalSearch.toLowerCase()) ||
                    (ev.paper || '').toLowerCase().includes(evalSearch.toLowerCase()) ||
                    (ev.institute_name || '').toLowerCase().includes(evalSearch.toLowerCase());
                  const matchesLevel = evalLevelFilter === 'ALL' || (ev.level || '').toUpperCase() === evalLevelFilter;
                  const matchesStatus = evalStatusFilter === 'ALL' || (ev.status || '').toUpperCase() === evalStatusFilter;
                  const matchesClassification =
                    evalClassificationFilter === 'ALL' ||
                    (ev.account_classification || 'NORMAL') === evalClassificationFilter;
                  const matchesSource =
                    evalSourceFilter === 'ALL' ||
                    (ev.evaluation_source || 'PUBLIC') === evalSourceFilter;
                  return matchesSearch && matchesLevel && matchesStatus && matchesClassification && matchesSource;
                });

                const allVisibleSelected =
                  filteredEvaluations.length > 0 &&
                  filteredEvaluations.every((ev) => selectedEvaluationIds.includes(ev.id));
                const someVisibleSelected =
                  filteredEvaluations.some((ev) => selectedEvaluationIds.includes(ev.id)) && !allVisibleSelected;

                const toggleSelectAll = () => {
                  if (allVisibleSelected) {
                    const visibleIds = new Set(filteredEvaluations.map((ev) => ev.id));
                    setSelectedEvaluationIds((prev) => prev.filter((id) => !visibleIds.has(id)));
                  } else {
                    const visibleIds = filteredEvaluations.map((ev) => ev.id);
                    setSelectedEvaluationIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
                  }
                };

                const toggleSelectOne = (id: string) => {
                  setSelectedEvaluationIds((prev) =>
                    prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
                  );
                };

                const hasActiveFilters =
                  evalSearch.trim() !== '' ||
                  evalLevelFilter !== 'ALL' ||
                  evalStatusFilter !== 'ALL' ||
                  evalClassificationFilter !== 'ALL' ||
                  evalSourceFilter !== 'ALL';

                return (
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <FileCheck2 className="w-4 h-4 text-blue-600" />
                          Student Answer Sheet Evaluations
                        </h3>
                        <p className="text-xs text-slate-500">
                          Audit, inspect, verify & permanently delete student evaluation records across all tiers
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-500">
                          {filteredEvaluations.length} of {evaluationsList.length} Evaluations
                        </span>
                      </div>
                    </div>

                    {/* Search & Filter Controls */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                        {/* Search Input */}
                        <div className="lg:col-span-2 relative">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search student, email, ID, subject, paper..."
                            value={evalSearch}
                            onChange={(e) => setEvalSearch(e.target.value)}
                            className="w-full pl-9 pr-8 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:outline-hidden focus:border-blue-500 transition"
                          />
                          {evalSearch && (
                            <button
                              onClick={() => setEvalSearch('')}
                              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* CA Level Filter */}
                        <div>
                          <select
                            value={evalLevelFilter}
                            onChange={(e) => setEvalLevelFilter(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-hidden focus:border-blue-500 cursor-pointer"
                          >
                            <option value="ALL">All CA Levels</option>
                            <option value="FOUNDATION">CA Foundation</option>
                            <option value="INTERMEDIATE">CA Intermediate</option>
                            <option value="FINAL">CA Final</option>
                          </select>
                        </div>

                        {/* Status Filter */}
                        <div>
                          <select
                            value={evalStatusFilter}
                            onChange={(e) => setEvalStatusFilter(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-hidden focus:border-blue-500 cursor-pointer"
                          >
                            <option value="ALL">All Statuses</option>
                            <option value="COMPLETED">Completed</option>
                            <option value="PROCESSING">Processing</option>
                            <option value="FAILED">Failed</option>
                            <option value="PENDING">Pending</option>
                          </select>
                        </div>

                        {/* Classification Filter (Test vs Normal) */}
                        <div>
                          <select
                            value={evalClassificationFilter}
                            onChange={(e) => setEvalClassificationFilter(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-hidden focus:border-blue-500 cursor-pointer"
                          >
                            <option value="ALL">All Classifications</option>
                            <option value="TEST">Test Records [TEST]</option>
                            <option value="NORMAL">Production [NORMAL]</option>
                          </select>
                        </div>
                      </div>

                      {/* Second Row: Source filter + Reset button */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-slate-500">Source:</span>
                          <div className="flex items-center gap-1">
                            {['ALL', 'PUBLIC', 'INSTITUTE'].map((src) => (
                              <button
                                key={src}
                                onClick={() => setEvalSourceFilter(src)}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                                  evalSourceFilter === src
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {src === 'ALL' ? 'All Sources' : src === 'PUBLIC' ? 'Public Student' : 'Institute'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {hasActiveFilters && (
                          <button
                            onClick={() => {
                              setEvalSearch('');
                              setEvalLevelFilter('ALL');
                              setEvalStatusFilter('ALL');
                              setEvalClassificationFilter('ALL');
                              setEvalSourceFilter('ALL');
                            }}
                            className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                            Reset All Filters
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Bulk Selection Bar */}
                    {selectedEvaluationIds.length > 0 && (
                      <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
                          <span className="font-bold text-blue-900">
                            {selectedEvaluationIds.length} evaluations selected
                          </span>
                          <button
                            onClick={() => setSelectedEvaluationIds([])}
                            className="text-[11px] text-blue-700 hover:text-blue-900 font-medium underline cursor-pointer ml-1"
                          >
                            Deselect all
                          </button>
                        </div>

                        {user?.role === 'SUPER_ADMIN' && (
                          <button
                            onClick={() => {
                              setBulkDeleteEvalModalOpen(true);
                              setBulkDeleteEvalConfirmText('');
                              setBulkDeleteEvalReason('Testing / Development cleanup');
                              setBulkDeleteEvalCustomReason('');
                              setBulkDeleteEvalError(null);
                            }}
                            className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete Selected ({selectedEvaluationIds.length})
                          </button>
                        )}
                      </div>
                    )}

                    {/* Evaluations Table */}
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                            <th className="py-2.5 px-3 w-8 text-center">
                              <input
                                type="checkbox"
                                checked={allVisibleSelected}
                                ref={(el) => {
                                  if (el) el.indeterminate = someVisibleSelected;
                                }}
                                onChange={toggleSelectAll}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                title="Select / deselect all visible evaluations"
                              />
                            </th>
                            <th className="py-2.5 px-3 font-bold">Evaluation ID / Tags</th>
                            <th className="py-2.5 px-3 font-bold">Student</th>
                            <th className="py-2.5 px-3 font-bold">Subject & Paper</th>
                            <th className="py-2.5 px-3 font-bold">Marks</th>
                            <th className="py-2.5 px-3 font-bold">Score %</th>
                            <th className="py-2.5 px-3 font-bold">Status</th>
                            <th className="py-2.5 px-3 font-bold">Date</th>
                            <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredEvaluations.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="py-8 text-center text-slate-400">
                                No evaluations found matching the selected criteria.
                              </td>
                            </tr>
                          ) : (
                            filteredEvaluations.map((ev) => {
                              const isSelected = selectedEvaluationIds.includes(ev.id);
                              return (
                                <tr
                                  key={ev.id}
                                  className={`transition ${
                                    isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50/80'
                                  }`}
                                >
                                  {/* Checkbox */}
                                  <td className="py-2.5 px-3 text-center">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleSelectOne(ev.id)}
                                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    />
                                  </td>

                                  {/* Evaluation ID & Badges */}
                                  <td className="py-2.5 px-3">
                                    <div className="space-y-1">
                                      <p className="font-mono font-medium text-slate-700">{ev.id}</p>
                                      <div className="flex flex-wrap items-center gap-1">
                                        {ev.account_classification === 'TEST' && (
                                          <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-bold">
                                            TEST
                                          </span>
                                        )}
                                        {ev.evaluation_source === 'INSTITUTE' || ev.institute_name ? (
                                          <span className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[9px] font-bold truncate max-w-[120px]" title={ev.institute_name || 'Institute'}>
                                            {ev.institute_name || 'INSTITUTE'}
                                          </span>
                                        ) : (
                                          <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 text-[9px] font-medium">
                                            PUBLIC
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </td>

                                  {/* Student */}
                                  <td className="py-2.5 px-3">
                                    <p className="font-bold text-slate-800">{ev.student_name || '—'}</p>
                                    <p className="text-[10px] text-slate-400 truncate max-w-[160px]" title={ev.student_email}>
                                      {ev.student_email || '—'}
                                    </p>
                                    {ev.icai_registration_number && (
                                      <span className="text-[9px] font-mono text-slate-500">
                                        ICAI: {ev.icai_registration_number}
                                      </span>
                                    )}
                                  </td>

                                  {/* Subject & Paper */}
                                  <td className="py-2.5 px-3">
                                    <p className="font-semibold text-slate-800">{ev.subject_name || '—'}</p>
                                    <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                                      <span className="font-medium text-blue-600">{ev.level}</span>
                                      {ev.attempt && <span>• {ev.attempt}</span>}
                                      {ev.paper && <span>• Paper {ev.paper}</span>}
                                    </div>
                                  </td>

                                  {/* Marks */}
                                  <td className="py-2.5 px-3 font-mono font-bold text-blue-600">
                                    {ev.total_marks !== null ? `${ev.total_marks}/${ev.maximum_marks || 100}` : '—'}
                                  </td>

                                  {/* Score % */}
                                  <td className="py-2.5 px-3">
                                    <div className="flex items-center gap-1 font-mono">
                                      <span className="font-bold text-slate-800">
                                        {ev.percentage !== null ? `${ev.percentage}%` : '—'}
                                      </span>
                                      {ev.grade && (
                                        <span className="px-1 py-0.2 rounded bg-slate-100 text-slate-700 text-[9px] font-bold">
                                          {ev.grade}
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Status */}
                                  <td className="py-2.5 px-3">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        ev.status === 'COMPLETED'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : ev.status === 'FAILED'
                                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                                      }`}
                                    >
                                      {ev.status}
                                    </span>
                                  </td>

                                  {/* Date */}
                                  <td className="py-2.5 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                                    {new Date(ev.created_at).toLocaleDateString()}
                                  </td>

                                  {/* Actions: View & Delete */}
                                  <td className="py-2.5 px-3 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      {/* View Details Action */}
                                      <button
                                        onClick={() => handleViewEvaluationDetails(ev.id)}
                                        className="p-1.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-500 hover:text-blue-600 transition cursor-pointer"
                                        title="View Evaluation Details"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                      </button>

                                      {/* Super Admin Permanent Delete Action */}
                                      {user?.role === 'SUPER_ADMIN' && (
                                        <button
                                          onClick={() => {
                                            setDeleteEvalModal({ evaluation: ev });
                                            setDeleteEvalConfirmText('');
                                            setDeleteEvalReason(
                                              ev.account_classification === 'TEST'
                                                ? 'Testing / Development cleanup'
                                                : 'Administrative cleanup'
                                            );
                                            setDeleteEvalCustomReason('');
                                            setDeleteEvalError(null);
                                          }}
                                          className="p-1.5 rounded-lg border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-500 hover:text-rose-600 transition cursor-pointer"
                                          title="Permanently Delete Evaluation (Super Admin)"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

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
              {activeSection === 'payments' && (() => {
                const filteredOrders = paymentsList.filter((p) => {
                  const matchesSearch =
                    !paymentSearch.trim() ||
                    (p.razorpay_order_id || p.id || '').toLowerCase().includes(paymentSearch.toLowerCase()) ||
                    (p.student_name || '').toLowerCase().includes(paymentSearch.toLowerCase()) ||
                    (p.student_email || '').toLowerCase().includes(paymentSearch.toLowerCase()) ||
                    (p.razorpay_payment_id || '').toLowerCase().includes(paymentSearch.toLowerCase());
                  const matchesClassification =
                    paymentClassificationFilter === 'ALL' ||
                    (p.account_classification || 'NORMAL') === paymentClassificationFilter;
                  const matchesStatus =
                    paymentStatusFilter === 'ALL' ||
                    (p.status || '').toUpperCase() === paymentStatusFilter;
                  return matchesSearch && matchesClassification && matchesStatus;
                });

                const allVisibleSelected =
                  filteredOrders.length > 0 &&
                  filteredOrders.every((p) => selectedPaymentOrderIds.includes(p.id));
                const someVisibleSelected =
                  filteredOrders.some((p) => selectedPaymentOrderIds.includes(p.id)) && !allVisibleSelected;

                const toggleSelectAll = () => {
                  if (allVisibleSelected) {
                    const visibleIds = new Set(filteredOrders.map((p) => p.id));
                    setSelectedPaymentOrderIds((prev) => prev.filter((id) => !visibleIds.has(id)));
                  } else {
                    const visibleIds = filteredOrders.map((p) => p.id);
                    setSelectedPaymentOrderIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
                  }
                };

                const toggleSelectOne = (id: string) => {
                  setSelectedPaymentOrderIds((prev) =>
                    prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
                  );
                };

                return (
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-blue-600" />
                          Razorpay Payment Orders & Transactions
                        </h3>
                        <p className="text-xs text-slate-500">
                          Complete payment ledger management, verification & administrative record cleanup
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-500">
                          {filteredOrders.length} of {paymentsList.length} Orders
                        </span>
                      </div>
                    </div>

                    {/* Filter & Search Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Search order ID, student, payment ID..."
                            value={paymentSearch}
                            onChange={(e) => setPaymentSearch(e.target.value)}
                            className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 w-56 sm:w-72"
                          />
                        </div>

                        {/* Classification Filter */}
                        <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
                          <FlaskConical className="w-3 h-3 text-amber-500" />
                          <span className="text-slate-500 text-[11px] font-medium">Type:</span>
                          <select
                            value={paymentClassificationFilter}
                            onChange={(e) => setPaymentClassificationFilter(e.target.value)}
                            className="bg-transparent border-none text-xs font-semibold text-slate-700 focus:outline-hidden cursor-pointer"
                          >
                            <option value="ALL">All Types</option>
                            <option value="NORMAL">Production (Normal)</option>
                            <option value="TEST">Test Orders</option>
                          </select>
                        </div>

                        {/* Status Filter */}
                        <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
                          <Filter className="w-3 h-3 text-blue-500" />
                          <span className="text-slate-500 text-[11px] font-medium">Status:</span>
                          <select
                            value={paymentStatusFilter}
                            onChange={(e) => setPaymentStatusFilter(e.target.value)}
                            className="bg-transparent border-none text-xs font-semibold text-slate-700 focus:outline-hidden cursor-pointer"
                          >
                            <option value="ALL">All Statuses</option>
                            <option value="SUCCESS">SUCCESS</option>
                            <option value="PENDING">PENDING</option>
                            <option value="FAILED">FAILED</option>
                          </select>
                        </div>
                      </div>

                      {(paymentSearch || paymentClassificationFilter !== 'ALL' || paymentStatusFilter !== 'ALL') && (
                        <button
                          onClick={() => {
                            setPaymentSearch('');
                            setPaymentClassificationFilter('ALL');
                            setPaymentStatusFilter('ALL');
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                        >
                          Reset Filters
                        </button>
                      )}
                    </div>

                    {/* Bulk Selection Bar */}
                    {selectedPaymentOrderIds.length > 0 && (
                      <div className="flex items-center justify-between p-3 bg-rose-50/80 border border-rose-200 rounded-xl text-xs text-rose-900 transition-all">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                          <span className="font-bold">
                            {selectedPaymentOrderIds.length} {selectedPaymentOrderIds.length === 1 ? 'order' : 'orders'} selected
                          </span>
                          <span className="text-slate-500 font-normal">
                            (Total amount: ₹{
                              paymentsList
                                .filter((p) => selectedPaymentOrderIds.includes(p.id))
                                .reduce((sum, p) => sum + (p.amount_paise || 0) / 100, 0)
                            })
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedPaymentOrderIds([])}
                            className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg font-semibold transition cursor-pointer"
                          >
                            Deselect All
                          </button>
                          <button
                            onClick={() => {
                              setBulkDeletePaymentModalOpen(true);
                              setBulkDeletePaymentConfirmText('');
                              setBulkDeletePaymentError(null);
                              setBulkDeletePaymentReason('Testing');
                              setBulkDeletePaymentCustomReason('');
                            }}
                            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete Selected ({selectedPaymentOrderIds.length})
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                            <th className="py-2.5 px-3 w-10 text-center">
                              <input
                                type="checkbox"
                                checked={allVisibleSelected}
                                ref={(el) => {
                                  if (el) el.indeterminate = someVisibleSelected;
                                }}
                                onChange={toggleSelectAll}
                                className="w-3.5 h-3.5 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                                title="Select all visible orders"
                              />
                            </th>
                            <th className="py-2.5 px-3 font-bold">Order ID & Type</th>
                            <th className="py-2.5 px-3 font-bold">Student</th>
                            <th className="py-2.5 px-3 font-bold">Credits</th>
                            <th className="py-2.5 px-3 font-bold">Amount (INR)</th>
                            <th className="py-2.5 px-3 font-bold">Status</th>
                            <th className="py-2.5 px-3 font-bold">Razorpay Payment ID</th>
                            <th className="py-2.5 px-3 font-bold">Created At</th>
                            <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredOrders.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="py-8 text-center text-slate-400">
                                No payment orders match your filter criteria.
                              </td>
                            </tr>
                          ) : (
                            filteredOrders.map((p) => {
                              const isSelected = selectedPaymentOrderIds.includes(p.id);
                              return (
                                <tr
                                  key={p.id}
                                  className={`transition-colors ${
                                    isSelected ? 'bg-rose-50/40 hover:bg-rose-50/60' : 'hover:bg-slate-50/80'
                                  }`}
                                >
                                  <td className="py-2.5 px-3 text-center">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleSelectOne(p.id)}
                                      className="w-3.5 h-3.5 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                                    />
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-slate-700">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-semibold">{p.razorpay_order_id || p.id}</span>
                                      {p.account_classification === 'TEST' ? (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                          TEST
                                        </span>
                                      ) : (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                          PROD
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <p className="font-bold text-slate-900">{p.student_name}</p>
                                    <p className="text-[10px] text-slate-400">{p.student_email}</p>
                                  </td>
                                  <td className="py-2.5 px-3 font-mono font-bold text-blue-600">{p.quantity}</td>
                                  <td className="py-2.5 px-3 font-mono font-bold">₹{p.amount_paise / 100}</td>
                                  <td className="py-2.5 px-3">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        p.status === 'SUCCESS'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : p.status === 'FAILED'
                                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                                      }`}
                                    >
                                      {p.status}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-slate-500">
                                    {p.razorpay_payment_id || '—'}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-400">
                                    {new Date(p.created_at).toLocaleDateString()}
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        onClick={() => handleViewOrderDetails(p.id)}
                                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                                        title="View order details"
                                      >
                                        <Eye className="w-3 h-3" />
                                        View
                                      </button>
                                      <button
                                        onClick={() => {
                                          setDeletePaymentModal({ order: p });
                                          setDeletePaymentConfirmText('');
                                          setDeletePaymentReason('Testing');
                                          setDeletePaymentCustomReason('');
                                          setDeletePaymentError(null);
                                        }}
                                        className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                                        title="Delete payment order record"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                        Delete
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

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

              {/* 21. TEST DATA CLEANUP */}
              {activeSection === 'data-cleanup' && (
                <AdminDataCleanupSection onDataChanged={loadActiveSectionData} />
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

      {/* Delete Student Confirmation Modal (Super Admin Only) */}
      {deleteStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-rose-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-800 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0 text-rose-600">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">Permanently Delete Student Account</h3>
                  <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                    SUPER ADMIN ONLY
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  This action cannot be undone. Please review the student information before proceeding.
                </p>
              </div>
            </div>

            {/* Target Student Identity Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-4 text-xs space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-slate-400 text-[11px] block">Student Name</span>
                  <span className="font-bold text-slate-900 text-sm">{deleteStudentModal.student.full_name}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 text-[11px] block">Account Classification</span>
                  {deleteStudentModal.student.account_classification === 'TEST' ? (
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      TEST ACCOUNT
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-700">
                      NORMAL STUDENT
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60">
                <div>
                  <span className="text-slate-400 text-[11px] block">Email</span>
                  <span className="font-mono text-slate-700">{deleteStudentModal.student.email}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">ICAI Registration</span>
                  <span className="font-mono text-slate-700">{deleteStudentModal.student.icai_registration_number || 'Not Registered'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">CA Level</span>
                  <span className="font-medium text-slate-700">{deleteStudentModal.student.ca_level || 'INTERMEDIATE'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Credits / Evaluations</span>
                  <span className="font-medium text-slate-700">
                    {deleteStudentModal.student.purchased_credits || 0} credits • {deleteStudentModal.student.evaluations_count || 0} evals
                  </span>
                </div>
              </div>
            </div>

            {/* Permanent Warning Box */}
            <div className="p-3.5 rounded-xl bg-rose-50/80 border border-rose-200 mb-4 text-xs text-rose-900 space-y-1.5">
              <p className="font-bold flex items-center gap-1.5 text-rose-800">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                Permanent Account Deletion Warning:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-rose-800/90 text-[11px]">
                <li>The student will be <strong>immediately logged out</strong> and will no longer be able to log in.</li>
                <li>All student-owned <strong>evaluations, answer sheets, and credit balances</strong> will be permanently deleted.</li>
                {deleteStudentModal.student.account_classification === 'TEST' ? (
                  <li className="text-amber-800 font-semibold">
                    Test Account Cleanup: Any promo or referral codes redeemed by this test account will be released back to production campaigns.
                  </li>
                ) : (
                  <li>This is a permanent deletion. The student cannot recover their examination evaluations or notes.</li>
                )}
                <li className="text-slate-600">
                  <em>Financial audit record retention: Successful Razorpay transaction records and tax receipts are safely archived in an anonymized audit vault to fulfill statutory accounting obligations.</em>
                </li>
              </ul>
            </div>

            {/* Confirmation Input */}
            <div className="mb-4 text-xs space-y-2">
              <label className="block font-bold text-slate-800">
                To confirm permanent deletion, type <span className="font-mono text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">DELETE</span> in all caps:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => {
                  setDeleteConfirmText(e.target.value);
                  setDeleteStudentError(null);
                }}
                placeholder="Type DELETE to confirm"
                className={`w-full px-3 py-2 rounded-lg border text-sm font-mono transition ${
                  deleteConfirmText === 'DELETE'
                    ? 'border-emerald-500 bg-emerald-50/40 text-emerald-900 focus:ring-2 focus:ring-emerald-500'
                    : 'border-slate-300 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-rose-400'
                }`}
                autoFocus
              />
              {deleteConfirmText === 'DELETE' ? (
                <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Confirmation verified. The delete button is now enabled.
                </p>
              ) : (
                <p className="text-[11px] text-slate-400">
                  The button below remains disabled until &quot;DELETE&quot; is entered exactly.
                </p>
              )}
            </div>

            {/* Error Message */}
            {deleteStudentError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-100 border border-rose-300 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{deleteStudentError}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2.5 justify-end pt-2 border-t border-slate-100 text-xs">
              <button
                onClick={() => {
                  setDeleteStudentModal(null);
                  setDeleteConfirmText('');
                  setDeleteStudentError(null);
                }}
                disabled={isDeletingStudent}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePermanentlyDeleteStudent}
                disabled={deleteConfirmText !== 'DELETE' || isDeletingStudent}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                {isDeletingStudent ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Deleting Student Account...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Permanently Delete Student
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Student Details Modal */}
      {viewStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl text-slate-800 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-base">
                  {viewStudentModal.student.full_name?.charAt(0) || 'S'}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    {viewStudentModal.student.full_name}
                    {viewStudentModal.student.status === 'ACTIVE' ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                        ACTIVE
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">
                        SUSPENDED
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500">{viewStudentModal.student.email}</p>
                </div>
              </div>

              {/* Classification toggle button */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    handleToggleStudentClassification(
                      viewStudentModal.student.id,
                      viewStudentModal.student.account_classification || 'NORMAL'
                    )
                  }
                  disabled={isUpdatingClassification}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 ${
                    viewStudentModal.student.account_classification === 'TEST'
                      ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                  title="Click to toggle between NORMAL and TEST account classification"
                >
                  <RefreshCw className={`w-3 h-3 ${isUpdatingClassification ? 'animate-spin' : ''}`} />
                  Class: {viewStudentModal.student.account_classification === 'TEST' ? 'TEST' : 'NORMAL'}
                </button>
              </div>
            </div>

            {/* Student Information Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-slate-400 block font-medium">CA Level</span>
                <span className="text-xs font-bold text-slate-900 mt-0.5 block">
                  {viewStudentModal.student.ca_level || 'INTERMEDIATE'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-slate-400 block font-medium">ICAI Reg Number</span>
                <span className="text-xs font-bold font-mono text-slate-900 mt-0.5 block">
                  {viewStudentModal.student.icai_registration_number || 'N/A'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-slate-400 block font-medium">Purchased Credits</span>
                <span className="text-xs font-bold font-mono text-blue-600 mt-0.5 block">
                  {viewStudentModal.student.purchased_credits || 0}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-slate-400 block font-medium">Free Evals Used</span>
                <span className="text-xs font-bold font-mono text-slate-900 mt-0.5 block">
                  {viewStudentModal.student.free_evaluations_used || 0}/2
                </span>
              </div>
            </div>

            {/* Extra details (Affiliation, Joined, Phone) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-xs">
              <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50">
                <span className="text-slate-400 text-[10px] block">Institute Affiliation</span>
                <span className="font-semibold text-slate-800">
                  {viewStudentModal.details?.student?.institute_name || 'Self-Registered (Direct)'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50">
                <span className="text-slate-400 text-[10px] block">Registered Phone</span>
                <span className="font-mono text-slate-800">{viewStudentModal.student.phone || 'None'}</span>
              </div>
              <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50">
                <span className="text-slate-400 text-[10px] block">Joined On</span>
                <span className="text-slate-800">
                  {viewStudentModal.student.created_at
                    ? new Date(viewStudentModal.student.created_at).toLocaleDateString()
                    : '—'}
                </span>
              </div>
            </div>

            {/* Recent Evaluations */}
            <div className="mb-5">
              <h4 className="text-xs font-bold text-slate-800 mb-2">Recent Evaluations</h4>
              {viewStudentModal.loading ? (
                <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading evaluations...
                </div>
              ) : viewStudentModal.details?.recentEvaluations?.length ? (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="py-2 px-3">Subject / Paper</th>
                        <th className="py-2 px-3">Score</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3 text-right">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewStudentModal.details.recentEvaluations.map((ev: any) => (
                        <tr key={ev.id} className="hover:bg-slate-50/60">
                          <td className="py-2 px-3 font-medium text-slate-800">
                            {ev.subject_name || ev.paper_title || 'Evaluation'}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold">
                            {ev.total_marks_obtained !== null ? `${ev.total_marks_obtained}/${ev.total_marks_possible || 100}` : '—'}
                            {ev.percentage !== null && (
                              <span className="text-[10px] text-slate-400 ml-1 font-normal">
                                ({Math.round(ev.percentage)}%)
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-700">
                              {ev.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-slate-400">
                            {ev.created_at ? new Date(ev.created_at).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 text-center text-xs text-slate-400">
                  No evaluations submitted yet.
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs">
              <button
                onClick={() => {
                  const st = viewStudentModal.student;
                  setViewStudentModal(null);
                  setDeleteStudentModal({ student: st });
                  setDeleteConfirmText('');
                  setDeleteStudentError(null);
                }}
                className="px-3 py-1.5 rounded-lg text-rose-700 hover:bg-rose-50 border border-rose-200 font-bold transition flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Student
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const st = viewStudentModal.student;
                    setCreditAdjustModal({ student: st, delta: '5', reason: 'Admin adjustment' });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold transition flex items-center gap-1"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  Adjust Credits
                </button>
                <button
                  onClick={() => {
                    handleToggleUserStatus(viewStudentModal.student);
                  }}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1 ${
                    viewStudentModal.student.status === 'ACTIVE'
                      ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  {viewStudentModal.student.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                </button>
                <button
                  onClick={() => setViewStudentModal(null)}
                  className="px-4 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Institute Confirmation Modal (Super Admin Only) */}
      {deleteInstituteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-rose-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-800 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0 text-rose-600">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">Permanently Delete Institute</h3>
                  <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                    SUPER ADMIN ONLY
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  This action cannot be undone. Please review the institute details before proceeding.
                </p>
              </div>
            </div>

            {/* Institute Details Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 text-xs space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                <span className="text-slate-500 font-medium">Institute Name:</span>
                <span className="font-bold text-slate-900">{deleteInstituteModal.institute.name}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                <span className="text-slate-500 font-medium">Institute Code:</span>
                <span className="font-mono font-bold text-purple-700">{deleteInstituteModal.institute.code}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                <span className="text-slate-500 font-medium">Contact Email:</span>
                <span className="font-mono text-slate-700">{deleteInstituteModal.institute.email}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                <span className="text-slate-500 font-medium">Active Students Quota:</span>
                <span className="font-mono font-bold text-slate-800">
                  {deleteInstituteModal.institute.active_count || 0} / {deleteInstituteModal.institute.max_students || 500}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Classification:</span>
                {deleteInstituteModal.institute.account_classification === 'TEST' ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1">
                    <FlaskConical className="w-2.5 h-2.5" />
                    TEST (Demo / Staging)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                    PRODUCTION (Normal)
                  </span>
                )}
              </div>
            </div>

            {/* Warning Notices */}
            <div className="space-y-2 mb-4">
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <div className="space-y-1">
                  <p className="font-bold">Permanent Data Removal Warning:</p>
                  <p className="text-[11px] leading-relaxed">
                    All institute-owned batches, test papers, and institute-specific mock evaluations will be permanently purged from the database.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
                <div className="space-y-0.5">
                  <p className="font-bold">Zero-Student Deletion Guarantee:</p>
                  <p className="text-[11px] leading-relaxed text-blue-700">
                    Deleting this institute will <strong>NEVER</strong> delete student platform accounts. Affiliated students will automatically convert to independent direct learners and retain their personal history and credits.
                  </p>
                </div>
              </div>

              {deleteInstituteModal.institute.account_classification !== 'TEST' && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <p className="text-[11px] font-semibold">
                    CAUTION: This institute is classified as PRODUCTION. Ensure all operational and contractual obligations are concluded.
                  </p>
                </div>
              )}
            </div>

            {/* Confirmation Input Field */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                To confirm deletion, please type <span className="font-mono text-rose-600 font-black">DELETE</span> below:
              </label>
              <input
                type="text"
                value={deleteInstituteConfirmText}
                onChange={(e) => setDeleteInstituteConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 transition"
              />
            </div>

            {/* Error Message */}
            {deleteInstituteError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{deleteInstituteError}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2.5 justify-end pt-2 border-t border-slate-100 text-xs">
              <button
                onClick={() => {
                  setDeleteInstituteModal(null);
                  setDeleteInstituteConfirmText('');
                  setDeleteInstituteError(null);
                }}
                disabled={isDeletingInstitute}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold transition disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handlePermanentlyDeleteInstitute}
                disabled={deleteInstituteConfirmText !== 'DELETE' || isDeletingInstitute}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm cursor-pointer"
              >
                {isDeletingInstitute ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Deleting Institute...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Permanently Delete Institute
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Institute Details Modal */}
      {viewInstituteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 shadow-2xl text-slate-800 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-base">
                  {viewInstituteModal.institute.name?.charAt(0) || 'I'}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    {viewInstituteModal.institute.name}
                    {viewInstituteModal.institute.status === 'ACTIVE' ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                        ACTIVE
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">
                        SUSPENDED
                      </span>
                    )}
                  </h3>
                  <p className="text-xs font-mono text-purple-700 font-bold">{viewInstituteModal.institute.code}</p>
                </div>
              </div>

              {/* Classification toggle */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    handleToggleInstituteClassification(
                      viewInstituteModal.institute.id,
                      viewInstituteModal.institute.account_classification || 'NORMAL'
                    )
                  }
                  disabled={isUpdatingInstituteClassification}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
                    viewInstituteModal.institute.account_classification === 'TEST'
                      ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                  title="Click to toggle between NORMAL and TEST institute classification"
                >
                  <RefreshCw className={`w-3 h-3 ${isUpdatingInstituteClassification ? 'animate-spin' : ''}`} />
                  Class: {viewInstituteModal.institute.account_classification === 'TEST' ? 'TEST' : 'NORMAL'}
                </button>
              </div>
            </div>

            {/* Institute Information Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-4">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-slate-400 block font-medium">Contact Person</span>
                <span className="text-xs font-bold text-slate-900 mt-0.5 block">
                  {viewInstituteModal.institute.contact_person || 'Not Specified'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-slate-400 block font-medium">Contact Email</span>
                <span className="text-xs font-mono text-slate-700 mt-0.5 block truncate">
                  {viewInstituteModal.institute.email}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-slate-400 block font-medium">Contact Phone</span>
                <span className="text-xs font-mono text-slate-700 mt-0.5 block">
                  {viewInstituteModal.institute.phone || '—'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-slate-400 block font-medium">Enrolled Students</span>
                <span className="text-xs font-bold font-mono text-blue-600 mt-0.5 block">
                  {viewInstituteModal.institute.active_count || 0}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-slate-400 block font-medium">Max Student Quota</span>
                <span className="text-xs font-bold font-mono text-slate-900 mt-0.5 block">
                  {viewInstituteModal.institute.max_students || 500}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-slate-400 block font-medium">Subscription Expires</span>
                <span className="text-xs font-semibold text-slate-800 mt-0.5 block">
                  {viewInstituteModal.institute.subscription_expires_at
                    ? new Date(viewInstituteModal.institute.subscription_expires_at).toLocaleDateString()
                    : 'Lifetime Plan'}
                </span>
              </div>
            </div>

            {viewInstituteModal.institute.address && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs mb-4">
                <span className="text-slate-400 text-[11px] block font-medium mb-0.5">Physical Campus / Office Address</span>
                <p className="text-slate-700">{viewInstituteModal.institute.address}</p>
              </div>
            )}

            {/* Footer Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-100 text-xs">
              <button
                onClick={() => {
                  const inst = viewInstituteModal.institute;
                  setViewInstituteModal(null);
                  setDeleteInstituteModal({ institute: inst });
                  setDeleteInstituteConfirmText('');
                  setDeleteInstituteError(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Institute
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    handleToggleInstituteStatus(viewInstituteModal.institute.id, viewInstituteModal.institute.status);
                    setViewInstituteModal(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1 cursor-pointer ${
                    viewInstituteModal.institute.status === 'ACTIVE'
                      ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  {viewInstituteModal.institute.status === 'ACTIVE' ? 'Suspend Institute' : 'Activate Institute'}
                </button>
                <button
                  onClick={() => setViewInstituteModal(null)}
                  className="px-4 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Payment Modal (Single Order - Super Admin) */}
      {deletePaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-rose-200 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0 text-rose-600">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">Delete Payment Order</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Permanent removal of payment & transaction record from database
                </p>
              </div>
            </div>

            {/* Order Summary */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-4 text-xs space-y-2">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/80">
                <span className="text-slate-500 font-medium">Order ID:</span>
                <span className="font-mono font-bold text-slate-800">
                  {deletePaymentModal.order.razorpay_order_id || deletePaymentModal.order.id}
                </span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/80">
                <span className="text-slate-500 font-medium">Student:</span>
                <div className="text-right">
                  <p className="font-semibold text-slate-800">{deletePaymentModal.order.student_name}</p>
                  <p className="text-[10px] text-slate-400">{deletePaymentModal.order.student_email}</p>
                </div>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/80">
                <span className="text-slate-500 font-medium">Amount:</span>
                <span className="font-mono font-bold text-slate-900">
                  ₹{(deletePaymentModal.order.amount_paise || 0) / 100}
                </span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/80">
                <span className="text-slate-500 font-medium">Credits:</span>
                <span className="font-mono font-bold text-blue-600">{deletePaymentModal.order.quantity}</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/80">
                <span className="text-slate-500 font-medium">Status:</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    deletePaymentModal.order.status === 'SUCCESS'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {deletePaymentModal.order.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Created Date:</span>
                <span className="text-slate-700">
                  {new Date(deletePaymentModal.order.created_at).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Clear Warning About Razorpay Reversal */}
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-amber-950">Important Razorpay Notice:</p>
                  <p className="text-[11px] leading-relaxed text-amber-900">
                    Local records will be deleted without reversing Razorpay payments. Deleting this local order record removes it from the CA Exam Checker database and credit ledger. It does NOT automatically trigger a refund or reversal on Razorpay. Any financial refund must be processed separately through your Razorpay merchant dashboard.
                  </p>
                </div>
              </div>
            </div>

            {/* Deletion Reason Dropdown */}
            <div className="mb-3">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Reason for Deletion:
              </label>
              <select
                value={deletePaymentReason}
                onChange={(e) => setDeletePaymentReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 cursor-pointer"
              >
                <option value="Testing">Testing</option>
                <option value="Duplicate">Duplicate</option>
                <option value="Incorrect test transaction">Incorrect test transaction</option>
                <option value="Development data">Development data</option>
                <option value="Other">Other (specify below)</option>
              </select>
            </div>

            {/* Custom Notes / Explanation if 'Other' */}
            {deletePaymentReason === 'Other' && (
              <div className="mb-3">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Explanation / Notes:
                </label>
                <input
                  type="text"
                  placeholder="Enter short explanation..."
                  value={deletePaymentCustomReason}
                  onChange={(e) => setDeletePaymentCustomReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                />
              </div>
            )}

            {/* Confirmation Input */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                To confirm deletion, type <span className="font-mono text-rose-600 font-black">DELETE</span>:
              </label>
              <input
                type="text"
                value={deletePaymentConfirmText}
                onChange={(e) => setDeletePaymentConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 transition"
              />
            </div>

            {deletePaymentError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{deletePaymentError}</span>
              </div>
            )}

            <div className="flex gap-2.5 justify-end pt-2 border-t border-slate-100 text-xs">
              <button
                onClick={() => {
                  setDeletePaymentModal(null);
                  setDeletePaymentConfirmText('');
                  setDeletePaymentReason('Testing');
                  setDeletePaymentCustomReason('');
                  setDeletePaymentError(null);
                }}
                disabled={isDeletingPayment}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold transition disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handlePermanentlyDeletePayment}
                disabled={deletePaymentConfirmText !== 'DELETE' || isDeletingPayment}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm cursor-pointer"
              >
                {isDeletingPayment ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Deleting Order...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Order
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Payment Modal (Super Admin) */}
      {bulkDeletePaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-rose-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0 text-rose-600">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">
                  Bulk Delete Payment Orders ({selectedPaymentOrderIds.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Permanent removal of selected payment orders & transactions from database
                </p>
              </div>
            </div>

            {/* Orders Summary List */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-xs">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
                <span className="font-bold text-slate-700">
                  {selectedPaymentOrderIds.length} Selected Orders
                </span>
                <span className="font-mono font-bold text-slate-900">
                  Total: ₹{
                    paymentsList
                      .filter((p) => selectedPaymentOrderIds.includes(p.id))
                      .reduce((sum, p) => sum + (p.amount_paise || 0) / 100, 0)
                  }
                </span>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {paymentsList
                  .filter((p) => selectedPaymentOrderIds.includes(p.id))
                  .map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between py-1 px-2 rounded bg-white border border-slate-100 text-[11px]"
                    >
                      <div className="truncate flex items-center gap-1.5">
                        <span className="font-mono font-medium text-slate-800">
                          {p.razorpay_order_id || p.id}
                        </span>
                        <span className="text-slate-400">({p.student_name})</span>
                      </div>
                      <span className="font-mono font-bold text-slate-700">₹{(p.amount_paise || 0) / 100}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Clear Warning About Razorpay Reversal */}
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-amber-950">Important Razorpay Notice:</p>
                  <p className="text-[11px] leading-relaxed text-amber-900">
                    Local records will be deleted without reversing Razorpay payments. All selected local order records will be removed from the CA Exam Checker database and credit ledger. Razorpay transactions are not automatically refunded. If refunds are needed, please issue them manually via your Razorpay merchant dashboard.
                  </p>
                </div>
              </div>
            </div>

            {/* Deletion Reason Dropdown */}
            <div className="mb-3">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Reason for Bulk Deletion:
              </label>
              <select
                value={bulkDeletePaymentReason}
                onChange={(e) => setBulkDeletePaymentReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 cursor-pointer"
              >
                <option value="Testing">Testing</option>
                <option value="Duplicate">Duplicate</option>
                <option value="Incorrect test transaction">Incorrect test transaction</option>
                <option value="Development data">Development data</option>
                <option value="Other">Other (specify below)</option>
              </select>
            </div>

            {/* Custom Notes / Explanation if 'Other' */}
            {bulkDeletePaymentReason === 'Other' && (
              <div className="mb-3">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Explanation / Notes:
                </label>
                <input
                  type="text"
                  placeholder="Enter short explanation..."
                  value={bulkDeletePaymentCustomReason}
                  onChange={(e) => setBulkDeletePaymentCustomReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                />
              </div>
            )}

            {/* Confirmation Input */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                To confirm deletion of all {selectedPaymentOrderIds.length} orders, type{' '}
                <span className="font-mono text-rose-600 font-black">DELETE</span>:
              </label>
              <input
                type="text"
                value={bulkDeletePaymentConfirmText}
                onChange={(e) => setBulkDeletePaymentConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 transition"
              />
            </div>

            {bulkDeletePaymentError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{bulkDeletePaymentError}</span>
              </div>
            )}

            <div className="flex gap-2.5 justify-end pt-2 border-t border-slate-100 text-xs">
              <button
                onClick={() => {
                  setBulkDeletePaymentModalOpen(false);
                  setBulkDeletePaymentConfirmText('');
                  setBulkDeletePaymentReason('Testing');
                  setBulkDeletePaymentCustomReason('');
                  setBulkDeletePaymentError(null);
                }}
                disabled={isBulkDeletingPayment}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold transition disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDeletePayments}
                disabled={bulkDeletePaymentConfirmText !== 'DELETE' || isBulkDeletingPayment}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm cursor-pointer"
              >
                {isBulkDeletingPayment ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Deleting {selectedPaymentOrderIds.length} Orders...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Permanently Delete ({selectedPaymentOrderIds.length}) Orders
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Payment Order Details Modal */}
      {viewPaymentOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Payment Order Details</h3>
                  <p className="text-xs font-mono text-slate-500">{viewPaymentOrderModal.id}</p>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  viewPaymentOrderModal.status === 'SUCCESS'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : viewPaymentOrderModal.status === 'FAILED'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {viewPaymentOrderModal.status}
              </span>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Classification Banner */}
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 font-medium">Record Classification:</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    viewPaymentOrderModal.account_classification === 'TEST'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {viewPaymentOrderModal.account_classification || 'NORMAL'}
                </span>
              </div>

              {/* Student Details */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <p className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">Student Information</p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Name:</span>
                    <span className="font-semibold text-slate-900">{viewPaymentOrderModal.student_name || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Email:</span>
                    <span className="font-semibold text-slate-900">{viewPaymentOrderModal.student_email || '—'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400 block text-[10px]">Student ID:</span>
                    <span className="font-mono text-slate-600">{viewPaymentOrderModal.student_id || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Financial & Order Details */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <p className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">Financials & Quantities</p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Amount:</span>
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      ₹{(viewPaymentOrderModal.amount_paise || 0) / 100}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Credits Included:</span>
                    <span className="font-mono font-bold text-blue-600 text-sm">
                      {viewPaymentOrderModal.quantity}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Currency:</span>
                    <span className="font-mono text-slate-700">{viewPaymentOrderModal.currency || 'INR'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Amount in Paise:</span>
                    <span className="font-mono text-slate-700">{viewPaymentOrderModal.amount_paise}</span>
                  </div>
                </div>
              </div>

              {/* Razorpay Gateway Information */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <p className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">Razorpay Gateway References</p>
                <div className="space-y-1.5 pt-1 font-mono text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-sans text-[10px]">Razorpay Order ID:</span>
                    <span className="text-slate-800 font-semibold">{viewPaymentOrderModal.razorpay_order_id || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-sans text-[10px]">Razorpay Payment ID:</span>
                    <span className="text-slate-800 font-semibold">{viewPaymentOrderModal.razorpay_payment_id || '—'}</span>
                  </div>
                  {viewPaymentOrderModal.transactions?.map((t: any) => (
                    <div key={t.id} className="pt-1 border-t border-slate-200/80 flex items-center justify-between">
                      <span className="text-slate-400 font-sans text-[10px]">Tx ID / Status:</span>
                      <span className="text-slate-700">{t.id} ({t.status})</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Timestamps */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <p className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">Timestamps</p>
                <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Created At:</span>
                    <span className="text-slate-700">
                      {new Date(viewPaymentOrderModal.created_at).toLocaleString()}
                    </span>
                  </div>
                  {viewPaymentOrderModal.paid_at && (
                    <div>
                      <span className="text-slate-400 block text-[10px]">Paid At:</span>
                      <span className="text-slate-700">
                        {new Date(viewPaymentOrderModal.paid_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs">
              <button
                onClick={() => {
                  setDeletePaymentModal({ order: viewPaymentOrderModal });
                  setDeletePaymentConfirmText('');
                  setDeletePaymentReason('Testing');
                  setDeletePaymentCustomReason('');
                  setDeletePaymentError(null);
                }}
                className="px-3.5 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete This Order
              </button>

              <button
                onClick={() => setViewPaymentOrderModal(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Permanently Delete Single Evaluation Modal (Super Admin Only) */}
      {deleteEvalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-rose-200 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-800">
            <div className="flex items-center gap-3 pb-4 border-b border-rose-100">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Permanently Delete Evaluation</h3>
                <p className="text-xs text-rose-600 font-medium">Irreversible Super Admin Operation</p>
              </div>
            </div>

            {/* Evaluation Summary */}
            <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Evaluation ID:</span>
                <span className="font-mono font-bold text-slate-800">{deleteEvalModal.evaluation.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Student:</span>
                <span className="font-semibold text-slate-900">
                  {deleteEvalModal.evaluation.student_name} ({deleteEvalModal.evaluation.student_email})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Subject / Paper:</span>
                <span className="text-slate-700">
                  {deleteEvalModal.evaluation.subject_name || deleteEvalModal.evaluation.subject} ({deleteEvalModal.evaluation.level})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Classification:</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    deleteEvalModal.evaluation.account_classification === 'TEST'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {deleteEvalModal.evaluation.account_classification || 'NORMAL'}
                </span>
              </div>
            </div>

            {/* Safety Warning */}
            <div className="mt-3 p-3 bg-rose-50/80 rounded-xl border border-rose-200 text-[11px] text-rose-800 space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-rose-900">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                This will permanently delete:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-[10px] text-rose-700 pl-1">
                <li>The evaluation record and all question scores & step feedbacks</li>
                <li>Associated assignment submission records</li>
                <li>Uploaded student answer sheets and generated evaluated PDFs from disk</li>
                <li>Associated analytics contributions</li>
              </ul>
              <p className="text-[10px] text-slate-500 pt-1 italic">
                * Question papers, global model answers, student accounts, and institute materials remain untouched.
              </p>
            </div>

            {/* Deletion Reason */}
            <div className="mt-4 space-y-2 text-xs">
              <label className="block font-bold text-slate-700">Reason for Deletion:</label>
              <select
                value={deleteEvalReason}
                onChange={(e) => setDeleteEvalReason(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:outline-hidden focus:border-rose-400 cursor-pointer"
              >
                <option value="Testing / Development cleanup">Testing / Development cleanup</option>
                <option value="Malformed / corrupted submission">Malformed / corrupted submission</option>
                <option value="Duplicate evaluation">Duplicate evaluation</option>
                <option value="Student requested deletion">Student requested deletion</option>
                <option value="Administrative cleanup">Administrative cleanup</option>
                <option value="Other">Other (specify below)</option>
              </select>

              {deleteEvalReason === 'Other' && (
                <textarea
                  placeholder="Enter detailed deletion reason..."
                  value={deleteEvalCustomReason}
                  onChange={(e) => setDeleteEvalCustomReason(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:outline-hidden focus:border-rose-400"
                />
              )}
            </div>

            {/* Confirmation Typing */}
            <div className="mt-4 space-y-1.5 text-xs">
              <label className="block font-bold text-slate-700">
                Type <span className="font-mono text-rose-600 bg-rose-50 px-1 py-0.5 rounded border border-rose-200 font-black">DELETE</span> to confirm:
              </label>
              <input
                type="text"
                value={deleteEvalConfirmText}
                onChange={(e) => setDeleteEvalConfirmText(e.target.value)}
                placeholder="Type DELETE"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-xs focus:outline-hidden focus:border-rose-500 bg-white"
              />
            </div>

            {deleteEvalError && (
              <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{deleteEvalError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => setDeleteEvalModal(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold transition cursor-pointer"
                disabled={isDeletingEval}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handlePermanentlyDeleteEvaluation}
                disabled={deleteEvalConfirmText.trim() !== 'DELETE' || isDeletingEval}
                className={`px-4 py-2 rounded-lg font-bold text-white transition flex items-center gap-1.5 cursor-pointer ${
                  deleteEvalConfirmText.trim() === 'DELETE' && !isDeletingEval
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-xs'
                    : 'bg-slate-300 cursor-not-allowed text-slate-500'
                }`}
              >
                {isDeletingEval ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Permanently Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Bulk Permanently Delete Evaluations Modal (Super Admin Only) */}
      {bulkDeleteEvalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-rose-200 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-800">
            <div className="flex items-center gap-3 pb-4 border-b border-rose-100">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Bulk Delete Evaluations</h3>
                <p className="text-xs text-rose-600 font-medium">
                  {selectedEvaluationIds.length} records selected for permanent removal
                </p>
              </div>
            </div>

            <div className="mt-4 p-3 bg-rose-50/80 rounded-xl border border-rose-200 text-[11px] text-rose-800 space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-rose-900">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                High Impact Action:
              </p>
              <p className="text-[11px] text-rose-700 leading-relaxed">
                You are about to permanently delete <strong className="font-bold">{selectedEvaluationIds.length}</strong> evaluation records, including all student answer uploads, step marking records, and generated evaluated PDF artifacts.
              </p>
            </div>

            {/* Deletion Reason */}
            <div className="mt-4 space-y-2 text-xs">
              <label className="block font-bold text-slate-700">Reason for Bulk Deletion:</label>
              <select
                value={bulkDeleteEvalReason}
                onChange={(e) => setBulkDeleteEvalReason(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:outline-hidden focus:border-rose-400 cursor-pointer"
              >
                <option value="Testing / Development cleanup">Testing / Development cleanup</option>
                <option value="Batch cleanup of malformed submissions">Batch cleanup of malformed submissions</option>
                <option value="Administrative bulk purge">Administrative bulk purge</option>
                <option value="Other">Other (specify below)</option>
              </select>

              {bulkDeleteEvalReason === 'Other' && (
                <textarea
                  placeholder="Enter detailed bulk deletion notes..."
                  value={bulkDeleteEvalCustomReason}
                  onChange={(e) => setBulkDeleteEvalCustomReason(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:outline-hidden focus:border-rose-400"
                />
              )}
            </div>

            {/* Confirmation Typing */}
            <div className="mt-4 space-y-1.5 text-xs">
              <label className="block font-bold text-slate-700">
                Type <span className="font-mono text-rose-600 bg-rose-50 px-1 py-0.5 rounded border border-rose-200 font-black">DELETE ALL</span> to confirm:
              </label>
              <input
                type="text"
                value={bulkDeleteEvalConfirmText}
                onChange={(e) => setBulkDeleteEvalConfirmText(e.target.value)}
                placeholder="Type DELETE ALL"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-xs focus:outline-hidden focus:border-rose-500 bg-white"
              />
            </div>

            {bulkDeleteEvalError && (
              <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{bulkDeleteEvalError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => setBulkDeleteEvalModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold transition cursor-pointer"
                disabled={isBulkDeletingEval}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleBulkDeleteEvaluations}
                disabled={bulkDeleteEvalConfirmText.trim() !== 'DELETE ALL' || isBulkDeletingEval}
                className={`px-4 py-2 rounded-lg font-bold text-white transition flex items-center gap-1.5 cursor-pointer ${
                  bulkDeleteEvalConfirmText.trim() === 'DELETE ALL' && !isBulkDeletingEval
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-xs'
                    : 'bg-slate-300 cursor-not-allowed text-slate-500'
                }`}
              >
                {isBulkDeletingEval ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Deleting {selectedEvaluationIds.length}...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Permanently Delete ({selectedEvaluationIds.length})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. View Evaluation Inspection Details Modal */}
      {viewEvaluationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl text-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Evaluation Inspection Details</h3>
                  <p className="text-xs font-mono text-slate-500">{viewEvaluationModal.evaluation?.id}</p>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  viewEvaluationModal.evaluation?.status === 'COMPLETED'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : viewEvaluationModal.evaluation?.status === 'FAILED'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {viewEvaluationModal.evaluation?.status}
              </span>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Classification & Metadata Badges */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-medium">Record Classification:</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      viewEvaluationModal.evaluation?.account_classification === 'TEST'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    {viewEvaluationModal.evaluation?.account_classification || 'NORMAL'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-medium">Source:</span>
                  <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 text-[10px] font-semibold">
                    {viewEvaluationModal.evaluation?.evaluation_source || 'PUBLIC'}
                    {viewEvaluationModal.evaluation?.institute_name && ` (${viewEvaluationModal.evaluation?.institute_name})`}
                  </span>
                </div>
              </div>

              {/* Student Information */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <p className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">Student Information</p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Name:</span>
                    <span className="font-semibold text-slate-900">{viewEvaluationModal.student?.name || viewEvaluationModal.evaluation?.student_name || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Email:</span>
                    <span className="font-semibold text-slate-900">{viewEvaluationModal.student?.email || viewEvaluationModal.evaluation?.student_email || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Student ID:</span>
                    <span className="font-mono text-slate-600">{viewEvaluationModal.student?.id || viewEvaluationModal.evaluation?.student_id || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">ICAI Reg Number:</span>
                    <span className="font-mono text-slate-600">{viewEvaluationModal.student?.icai_registration_number || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Examination & Academic Subject */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <p className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">Examination & Paper</p>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Subject:</span>
                    <span className="font-semibold text-slate-900">{viewEvaluationModal.evaluation?.subject_name || viewEvaluationModal.evaluation?.subject || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">CA Level:</span>
                    <span className="font-semibold text-blue-600">{viewEvaluationModal.evaluation?.level || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Attempt / Paper:</span>
                    <span className="text-slate-700">{viewEvaluationModal.evaluation?.attempt || '—'} / Paper {viewEvaluationModal.evaluation?.paper || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Scores & Grading Summary */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <p className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">Evaluation Scores & Grade</p>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Marks Obtained:</span>
                    <span className="font-mono font-bold text-blue-600 text-sm">
                      {viewEvaluationModal.evaluation?.total_marks !== null ? `${viewEvaluationModal.evaluation?.total_marks} / ${viewEvaluationModal.evaluation?.maximum_marks || 100}` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Percentage:</span>
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      {viewEvaluationModal.evaluation?.percentage !== null ? `${viewEvaluationModal.evaluation?.percentage}%` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Grade:</span>
                    <span className="font-mono font-bold text-slate-700 text-sm">
                      {viewEvaluationModal.evaluation?.grade || '—'}
                    </span>
                  </div>
                </div>
                {viewEvaluationModal.evaluation?.overall_feedback && (
                  <div className="pt-2 border-t border-slate-200/80">
                    <span className="text-slate-400 block text-[10px]">Overall Feedback:</span>
                    <p className="text-slate-700 italic pt-0.5">{viewEvaluationModal.evaluation?.overall_feedback}</p>
                  </div>
                )}
              </div>

              {/* File Artifacts */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <p className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">Storage & File Artifacts</p>
                <div className="space-y-1.5 pt-1 font-mono text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-sans text-[10px]">Answer Sheet Path:</span>
                    <span className="text-slate-700 truncate max-w-[320px]" title={viewEvaluationModal.evaluation?.file_path}>
                      {viewEvaluationModal.evaluation?.file_path || 'None'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-sans text-[10px]">Evaluated PDF:</span>
                    <span className="text-slate-700 truncate max-w-[320px]" title={viewEvaluationModal.evaluation?.evaluated_pdf_path}>
                      {viewEvaluationModal.evaluation?.evaluated_pdf_path || 'None'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-sans text-[10px]">Physical Files Status:</span>
                    <span className="text-slate-700 font-sans">
                      {viewEvaluationModal.files?.length > 0
                        ? `${viewEvaluationModal.files.length} file(s) identified on disk`
                        : 'No direct files pending cleanup'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Step Marks & Questions Breakdown */}
              {viewEvaluationModal.answers && viewEvaluationModal.answers.length > 0 && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <p className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
                    Question Breakdown ({viewEvaluationModal.answers.length} items)
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {viewEvaluationModal.answers.map((ans: any, idx: number) => (
                      <div key={ans.id || idx} className="p-2 bg-white rounded border border-slate-200 text-[11px] space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800">
                            Question {ans.question_number || `#${idx + 1}`}
                          </span>
                          <span className="font-mono font-bold text-blue-600">
                            {ans.marks_obtained !== null ? `${ans.marks_obtained} / ${ans.maximum_marks || 0}` : '—'}
                          </span>
                        </div>
                        {ans.feedback && (
                          <p className="text-slate-600 text-[10px] leading-relaxed line-clamp-2">
                            {ans.feedback}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <p className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">Timestamps</p>
                <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Created At:</span>
                    <span className="text-slate-700">
                      {viewEvaluationModal.evaluation?.created_at ? new Date(viewEvaluationModal.evaluation.created_at).toLocaleString() : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Completed At:</span>
                    <span className="text-slate-700">
                      {viewEvaluationModal.evaluation?.completed_at ? new Date(viewEvaluationModal.evaluation.completed_at).toLocaleString() : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs">
              {user?.role === 'SUPER_ADMIN' ? (
                <button
                  onClick={() => {
                    const ev = viewEvaluationModal.evaluation;
                    setDeleteEvalModal({ evaluation: ev });
                    setDeleteEvalConfirmText('');
                    setDeleteEvalReason(
                      ev?.account_classification === 'TEST'
                        ? 'Testing / Development cleanup'
                        : 'Administrative cleanup'
                    );
                    setDeleteEvalCustomReason('');
                    setDeleteEvalError(null);
                  }}
                  className="px-3.5 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete This Evaluation
                </button>
              ) : (
                <div />
              )}

              <button
                onClick={() => setViewEvaluationModal(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold transition cursor-pointer"
              >
                Close
              </button>
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
                  <select
                    value={newPaperForm.attempt}
                    onChange={(e) => setNewPaperForm({ ...newPaperForm, attempt: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 bg-slate-50 text-slate-800"
                  >
                    {paperModalAttempts.map((att) => (
                      <option key={att.id} value={att.attemptLabel}>
                        {att.attemptLabel}
                      </option>
                    ))}
                  </select>
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
