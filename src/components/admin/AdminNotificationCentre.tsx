import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../api/client.js';
import { formatDateTimeIST, formatDateIST, formatTimeIST } from '../../utils/timezone.js';
import {
  Bell,
  Mail,
  Send,
  Users,
  Building2,
  GraduationCap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Search,
  Filter,
  Eye,
  RefreshCw,
  Sparkles,
  ShieldAlert,
  Info,
  Layers,
  ArrowRight,
  Flame,
  Radio,
  FileText,
  X,
  Smartphone,
  Check,
} from 'lucide-react';

interface CampaignSummary {
  id: string;
  title: string;
  message: string;
  category: string;
  priority: string;
  target_audience: string;
  channels: string;
  action_url?: string;
  action_label?: string;
  status: string;
  total_targeted: number;
  in_app_sent: number;
  email_sent: number;
  email_failed: number;
  created_by: string;
  sent_at: string;
  created_at: string;
}

interface CampaignMetrics {
  totalCampaigns: number;
  totalTargetedAllTime: number;
  totalInAppDelivered: number;
  totalEmailsDelivered: number;
  totalEmailsFailed: number;
  activeAudienceReach: number;
}

interface TargetEstimate {
  total: number;
  studentsCount: number;
  institutesCount: number;
  byLevel: {
    foundation: number;
    intermediate: number;
    final: number;
    unspecified: number;
  };
  sampleRecipients: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    caLevel?: string;
  }>;
}

interface DeliveryLogItem {
  id: string;
  campaign_id: string;
  user_id: string;
  recipient_email: string;
  recipient_role: string;
  channel: string;
  status: string;
  error_message?: string;
  created_at: string;
}

export const AdminNotificationCentre: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'compose' | 'campaigns' | 'feed'>('compose');
  const [previewMode, setPreviewMode] = useState<'in_app' | 'email'>('in_app');

  // Form State
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetAudience, setTargetAudience] = useState<string>('ALL');
  const [channels, setChannels] = useState<string>('IN_APP_AND_EMAIL');
  const [priority, setPriority] = useState<string>('NORMAL');
  const [category, setCategory] = useState<string>('ANNOUNCEMENT');
  const [actionLabel, setActionLabel] = useState('');
  const [actionUrl, setActionUrl] = useState('');

  // Audience Estimation State
  const [estimate, setEstimate] = useState<TargetEstimate | null>(null);
  const [isEstimating, setIsEstimating] = useState<boolean>(false);

  // Campaigns & Metrics State
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);
  const [campaignPage, setCampaignPage] = useState<number>(1);
  const [campaignTotalPages, setCampaignTotalPages] = useState<number>(1);
  const [campaignSearch, setCampaignSearch] = useState<string>('');
  const [campaignCategoryFilter, setCampaignCategoryFilter] = useState<string>('ALL');
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState<boolean>(false);

  // Individual Notifications Feed State
  const [recentNotifications, setRecentNotifications] = useState<any[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(false);

  // Modals & Feedback
  const [isSending, setIsSending] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [showTestModal, setShowTestModal] = useState<boolean>(false);
  const [testEmailInput, setTestEmailInput] = useState<string>('');
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [selectedCampaignDetails, setSelectedCampaignDetails] = useState<{
    campaign: CampaignSummary;
    logs: DeliveryLogItem[];
    statusBreakdown: Array<{ channel: string; status: string; count: number }>;
  } | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, message: msg });
    setTimeout(() => setToast(null), 6000);
  };

  // Fetch Audience Estimate
  const fetchEstimate = useCallback(async (aud: string) => {
    try {
      setIsEstimating(true);
      const res = await apiRequest<{ estimate: TargetEstimate }>('/api/admin/notifications/estimate', {
        method: 'POST',
        body: JSON.stringify({ targetAudience: aud }),
      });
      setEstimate(res.estimate);
    } catch (err: any) {
      console.warn('Failed to estimate audience:', err);
    } finally {
      setIsEstimating(false);
    }
  }, []);

  // Fetch Campaigns List
  const fetchCampaigns = useCallback(async (page: number = 1) => {
    try {
      setIsLoadingCampaigns(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
        search: campaignSearch,
        category: campaignCategoryFilter,
      });
      const res = await apiRequest<{
        campaigns: CampaignSummary[];
        pagination: { page: number; totalPages: number; totalCount: number };
        metrics: CampaignMetrics;
      }>(`/api/admin/notifications/campaigns?${params.toString()}`);
      setCampaigns(res.campaigns || []);
      setMetrics(res.metrics || null);
      setCampaignPage(res.pagination?.page || 1);
      setCampaignTotalPages(res.pagination?.totalPages || 1);
    } catch (err: any) {
      console.error('Failed to load campaigns:', err);
    } finally {
      setIsLoadingCampaigns(false);
    }
  }, [campaignSearch, campaignCategoryFilter]);

  // Fetch Individual Notifications Feed
  const fetchFeed = useCallback(async () => {
    try {
      setIsLoadingFeed(true);
      const res = await apiRequest<{ notifications: any[] }>('/api/admin/notifications');
      setRecentNotifications(res.notifications || []);
    } catch (err: any) {
      console.error('Failed to load feed:', err);
    } finally {
      setIsLoadingFeed(false);
    }
  }, []);

  // Fetch Campaign Details
  const handleViewCampaignDetails = async (campaignId: string) => {
    try {
      setIsLoadingDetails(true);
      const res = await apiRequest<{
        campaign: CampaignSummary;
        logs: DeliveryLogItem[];
        statusBreakdown: Array<{ channel: string; status: string; count: number }>;
      }>(`/api/admin/notifications/campaigns/${campaignId}`);
      setSelectedCampaignDetails(res);
    } catch (err: any) {
      showToast('error', 'Failed to load campaign details');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Initial loads
  useEffect(() => {
    fetchEstimate(targetAudience);
  }, [targetAudience, fetchEstimate]);

  useEffect(() => {
    if (activeTab === 'campaigns') {
      fetchCampaigns(campaignPage);
    } else if (activeTab === 'feed') {
      fetchFeed();
    }
  }, [activeTab, campaignPage, fetchCampaigns, fetchFeed]);

  // Handle Send Test
  const handleSendTest = async () => {
    if (!title.trim() || !message.trim()) {
      showToast('error', 'Please enter a title and message before sending a test preview');
      return;
    }
    try {
      setIsSendingTest(true);
      const res = await apiRequest<any>('/api/admin/notifications/send-test', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          category,
          priority,
          channels,
          actionUrl: actionUrl.trim() || undefined,
          actionLabel: actionLabel.trim() || undefined,
          testEmail: testEmailInput.trim() || undefined,
        }),
      });

      if (res.success) {
        showToast('success', res.message || 'Test notification preview sent successfully!');
        setShowTestModal(false);
      } else {
        showToast('error', res.message || 'Failed to dispatch test notification');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Error dispatching test notification');
    } finally {
      setIsSendingTest(false);
    }
  };

  // Handle Full Production Broadcast
  const handleDispatchBroadcast = async () => {
    if (!title.trim() || title.trim().length < 3) {
      showToast('error', 'Title must be at least 3 characters long');
      return;
    }
    if (!message.trim() || message.trim().length < 5) {
      showToast('error', 'Message content must be at least 5 characters long');
      return;
    }

    try {
      setIsSending(true);
      const res = await apiRequest<any>('/api/admin/notifications/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          targetAudience,
          channels,
          priority,
          category,
          actionUrl: actionUrl.trim() || undefined,
          actionLabel: actionLabel.trim() || undefined,
        }),
      });

      if (res.success) {
        showToast('success', res.message || `Broadcast dispatched to ${res.totalTargeted} recipients!`);
        setShowConfirmModal(false);
        // Reset form
        setTitle('');
        setMessage('');
        setActionLabel('');
        setActionUrl('');
        // Switch to history tab to view progress
        setActiveTab('campaigns');
        fetchCampaigns(1);
      } else {
        showToast('error', res.error || 'Failed to dispatch broadcast');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Error occurred while broadcasting');
    } finally {
      setIsSending(false);
    }
  };

  const getPriorityBadgeClass = (p: string) => {
    switch (p) {
      case 'URGENT':
        return 'bg-red-50 text-red-700 border-red-200 ring-1 ring-red-400/20';
      case 'HIGH':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'LOW':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      case 'NORMAL':
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  const getCategoryBadgeClass = (c: string) => {
    switch (c) {
      case 'EXAM_ALERT':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'FEATURE_UPDATE':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'MAINTENANCE':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'PROMOTIONAL':
        return 'bg-pink-50 text-pink-700 border-pink-200';
      case 'URGENT_ALERT':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'ANNOUNCEMENT':
      default:
        return 'bg-sky-50 text-sky-700 border-sky-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {toast && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between shadow-lg transition-all animate-in fade-in slide-in-from-top-2 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-3">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <p className="text-xs sm:text-sm font-semibold">{toast.message}</p>
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-2xl p-6 text-white border border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30">
              Super Admin Operations
            </span>
            <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Delivery System Active
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Bell className="w-6 h-6 text-blue-400" />
            Admin Notification Centre
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
            Authoritative broadcast communications engine for Chartered Accountancy candidates and affiliated Institute Administrators across In-App Notification feeds and Branded Email channels.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              if (activeTab === 'campaigns') fetchCampaigns(campaignPage);
              else if (activeTab === 'feed') fetchFeed();
              else fetchEstimate(targetAudience);
            }}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-2 border border-slate-700 cursor-pointer"
            title="Refresh Notification Data"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Metric KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Broadcasts</span>
            <Radio className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {metrics?.totalCampaigns !== undefined ? metrics.totalCampaigns : '...'}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Platform-wide campaigns created</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">In-App Delivered</span>
            <Smartphone className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-indigo-700">
            {metrics?.totalInAppDelivered !== undefined ? metrics.totalInAppDelivered.toLocaleString() : '...'}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Direct student & institute bell notifications</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Emails Dispatched</span>
            <Mail className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700">
            {metrics?.totalEmailsDelivered !== undefined ? metrics.totalEmailsDelivered.toLocaleString() : '...'}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Branded emails sent via SMTP/Sandbox</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Active Audience Reach</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {metrics?.activeAudienceReach !== undefined ? metrics.activeAudienceReach.toLocaleString() : (estimate?.total || '...')}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Active candidates & institute partners</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('compose')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'compose'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>Compose & Broadcast</span>
        </button>
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'campaigns'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Broadcast Campaigns & History</span>
        </button>
        <button
          onClick={() => setActiveTab('feed')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'feed'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Individual In-App Feed</span>
        </button>
      </div>

      {/* TAB 1: COMPOSE & BROADCAST */}
      {activeTab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Form: Composition Settings */}
          <div className="lg:col-span-7 space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">Broadcast Composer</h3>
                <p className="text-xs text-slate-500">Configure recipient audience, delivery channels, priority, and rich content</p>
              </div>

              {/* Target Audience */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-blue-600" />
                    Target Audience
                  </span>
                  {estimate && (
                    <span className="text-[11px] font-semibold text-blue-600">
                      🎯 ~{estimate.total} Recipient{estimate.total === 1 ? '' : 's'} Selected
                    </span>
                  )}
                </label>
                <select
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ALL">All Students & Institute Admins (Default Audience)</option>
                  <option value="STUDENT">All Registered Students (All CA Levels)</option>
                  <option value="STUDENTS_INTERMEDIATE">Students — Intermediate Only</option>
                  <option value="STUDENTS_FINAL">Students — Final Only</option>
                  <option value="STUDENTS_FOUNDATION">Students — Foundation Only</option>
                  <option value="INSTITUTE_ADMIN">Institute Administrators Only</option>
                </select>

                {/* Audience breakdown pill badge */}
                {estimate && (
                  <div className="mt-2 p-2.5 rounded-lg bg-blue-50/70 border border-blue-100 text-[11px] text-blue-900 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span><strong>Students:</strong> {estimate.studentsCount}</span>
                    <span><strong>Institutes:</strong> {estimate.institutesCount}</span>
                    <span>(Inter: {estimate.byLevel.intermediate}, Final: {estimate.byLevel.final}, Fdn: {estimate.byLevel.foundation})</span>
                  </div>
                )}
              </div>

              {/* Channels & Priority Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-blue-600" />
                    Delivery Channels
                  </label>
                  <select
                    value={channels}
                    onChange={(e) => setChannels(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="IN_APP_AND_EMAIL">In-App + Email (Default Channels)</option>
                    <option value="IN_APP">In-App Notification Only</option>
                    <option value="EMAIL">Email Dispatch Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-blue-600" />
                    Priority Level
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="NORMAL">Normal Priority (Standard)</option>
                    <option value="HIGH">High Priority</option>
                    <option value="URGENT">Urgent Alert (Emergency / Critical)</option>
                    <option value="LOW">Low Priority (Informational)</option>
                  </select>
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  Notification Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ANNOUNCEMENT">General Announcement</option>
                  <option value="EXAM_ALERT">Exam Alert / ICAI MTP Series / Exam Schedule</option>
                  <option value="FEATURE_UPDATE">New Feature Release</option>
                  <option value="MAINTENANCE">Scheduled System Maintenance</option>
                  <option value="URGENT_ALERT">Urgent Alert / Security Notice</option>
                  <option value="PROMOTIONAL">Promotion / Referral Incentive</option>
                </select>
              </div>

              {/* Title / Subject */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Notification Title / Email Subject <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. ICAI May 2026 MTP Series 1 Evaluator Now Active"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Message Content */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Message Body <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="Enter detailed notification content here. Break into paragraphs for readability..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-normal text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                />
              </div>

              {/* Optional Call to Action */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-800">Optional Action Button (Call-to-Action)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Button Label</label>
                    <input
                      type="text"
                      placeholder="e.g. Check Answer Sheets"
                      value={actionLabel}
                      onChange={(e) => setActionLabel(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Destination URL or Path</label>
                    <input
                      type="text"
                      placeholder="e.g. /evaluation/new or /materials"
                      value={actionUrl}
                      onChange={(e) => setActionUrl(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTestModal(true)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                  <span>Send Test Preview</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={!title.trim() || !message.trim() || isSending}
                  className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer ${
                    !title.trim() || !message.trim() || isSending
                      ? 'bg-slate-300 cursor-not-allowed text-slate-500'
                      : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Dispatch Broadcast ({estimate?.total || 0} Recipients)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Live Responsive Preview Box */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs sticky top-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold text-slate-900">Live Recipient Preview</span>
                </div>

                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setPreviewMode('in_app')}
                    className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                      previewMode === 'in_app' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    In-App Card
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('email')}
                    className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                      previewMode === 'email' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Email View
                  </button>
                </div>
              </div>

              {/* PREVIEW: IN-APP CARD */}
              {previewMode === 'in_app' && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getCategoryBadgeClass(category)}`}>
                        {category}
                      </span>
                      {priority === 'URGENT' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          URGENT
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">Just now</span>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      {title.trim() || 'Notification Title Preview'}
                    </h4>
                    <p className="text-[11px] text-slate-600 mt-1 whitespace-pre-wrap leading-relaxed">
                      {message.trim() || 'This is where your notification message body will appear to candidates.'}
                    </p>
                  </div>

                  {actionLabel && (
                    <div className="pt-2">
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-bold shadow-xs">
                        <span>{actionLabel}</span>
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* PREVIEW: EMAIL VIEW */}
              {previewMode === 'email' && (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs text-slate-800 bg-white">
                  <div className="bg-slate-900 p-4 text-center border-b-2 border-blue-600 text-white">
                    <h5 className="text-xs font-black tracking-tight">CA Exam Checker AI</h5>
                    <p className="text-[9px] text-slate-400">Official Student & Institute Notification</p>
                  </div>
                  <div className="p-5 space-y-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${getCategoryBadgeClass(category)}`}>
                        {category}
                      </span>
                      {priority === 'URGENT' && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 text-rose-800">
                          HIGH PRIORITY
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-bold text-slate-900">
                      {title.trim() || 'Subject Title'}
                    </h4>

                    <p className="text-[11px] text-slate-700 font-medium">Dear CA Candidate / Institute Partner,</p>

                    <p className="text-[11px] text-slate-600 whitespace-pre-wrap leading-relaxed">
                      {message.trim() || 'Email body text will appear styled here with responsive typography and authoritative branding.'}
                    </p>

                    {actionLabel && (
                      <div className="text-center py-2">
                        <span className="inline-block px-4 py-2 bg-blue-600 text-white font-bold rounded-lg text-xs shadow-xs">
                          {actionLabel}
                        </span>
                      </div>
                    )}

                    <div className="pt-3 border-t border-slate-100 text-[10px] text-slate-400 space-y-1">
                      <p>Sent authoritatively by CA Exam Checker AI Operations.</p>
                      <p>Manage notification preferences in your student profile.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Safety Checklist notice */}
              <div className="mt-4 p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-900 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                  <span>Production Change Protection</span>
                </div>
                <p className="text-[10px] text-amber-800 leading-normal">
                  Deleted and tombstoned candidate records are strictly filtered from every broadcast. Unsubscribed candidates have their marketing email preferences automatically respected.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BROADCAST CAMPAIGNS & HISTORY */}
      {activeTab === 'campaigns' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex-1 w-full sm:max-w-md relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search campaigns by title or message..."
                value={campaignSearch}
                onChange={(e) => setCampaignSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchCampaigns(1)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={campaignCategoryFilter}
                onChange={(e) => {
                  setCampaignCategoryFilter(e.target.value);
                  setTimeout(() => fetchCampaigns(1), 50);
                }}
                className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700"
              >
                <option value="ALL">All Categories</option>
                <option value="ANNOUNCEMENT">Announcements</option>
                <option value="EXAM_ALERT">Exam Alerts</option>
                <option value="FEATURE_UPDATE">Feature Updates</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="URGENT_ALERT">Urgent Alerts</option>
                <option value="PROMOTIONAL">Promotional</option>
              </select>

              <button
                type="button"
                onClick={() => fetchCampaigns(1)}
                className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 cursor-pointer"
              >
                Search
              </button>
            </div>
          </div>

          {/* Campaigns Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            {isLoadingCampaigns ? (
              <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Loading broadcast campaigns...</span>
              </div>
            ) : campaigns.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-600">No broadcast campaigns found</p>
                <p className="text-[11px] text-slate-400 mt-1">Use the "Compose & Broadcast" tab to create your first platform announcement.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <th className="py-3 px-4">Title & Details</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Audience</th>
                      <th className="py-3 px-4">Channels</th>
                      <th className="py-3 px-4">Priority</th>
                      <th className="py-3 px-4 text-center">Delivery Stats</th>
                      <th className="py-3 px-4">Dispatched At</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {campaigns.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3.5 px-4 max-w-xs">
                          <p className="font-bold text-slate-900 truncate">{c.title}</p>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">{c.message}</p>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getCategoryBadgeClass(c.category)}`}>
                            {c.category}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="font-semibold text-slate-700 text-[11px]">{c.target_audience}</span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="text-[11px] font-medium text-slate-600">{c.channels}</span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getPriorityBadgeClass(c.priority)}`}>
                            {c.priority}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 text-[11px]">
                            <span className="font-bold text-slate-900" title="Targeted">{c.total_targeted}</span>
                            <span className="text-slate-400">/</span>
                            <span className="text-indigo-600 font-semibold" title="In-App Sent">{c.in_app_sent} In-App</span>
                            <span className="text-slate-400">/</span>
                            <span className="text-emerald-600 font-semibold" title="Emails Sent">{c.email_sent} Email</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-500 text-[11px]">
                          {formatDateTimeIST(c.sent_at || c.created_at)}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleViewCampaignDetails(c.id)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition cursor-pointer"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {campaignTotalPages > 1 && (
              <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Page {campaignPage} of {campaignTotalPages}</span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={campaignPage <= 1}
                    onClick={() => setCampaignPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-xs font-semibold cursor-pointer"
                  >
                    Prev
                  </button>
                  <button
                    disabled={campaignPage >= campaignTotalPages}
                    onClick={() => setCampaignPage((p) => Math.min(campaignTotalPages, p + 1))}
                    className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-xs font-semibold cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: INDIVIDUAL IN-APP NOTIFICATIONS FEED */}
      {activeTab === 'feed' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recent User In-App Notifications Feed</h3>
              <p className="text-xs text-slate-500">Log of individual notifications delivered to student and institute inboxes</p>
            </div>
            <button
              onClick={fetchFeed}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh Feed</span>
            </button>
          </div>

          {isLoadingFeed ? (
            <div className="p-8 text-center text-slate-400 text-xs">Loading feed...</div>
          ) : recentNotifications.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">No notifications recorded in feed.</div>
          ) : (
            <div className="divide-y divide-slate-100 space-y-2">
              {recentNotifications.map((n) => (
                <div key={n.id} className="pt-2 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{n.title}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        n.read || n.is_read ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {n.read || n.is_read ? 'READ' : 'UNREAD'}
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px]">{n.message}</p>
                    <p className="text-[10px] text-slate-400">
                      Recipient: <span className="text-slate-600 font-medium">{n.user_email || n.user_id}</span> ({n.full_name || 'User'})
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-400 whitespace-nowrap">{formatDateTimeIST(n.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CONFIRM BROADCAST MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Confirm Broadcast Dispatch</h3>
                <p className="text-xs text-slate-500">Please review before triggering platform dispatch</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2 text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">Audience:</span>
                <span className="font-bold text-slate-900">{targetAudience}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Estimated Reach:</span>
                <span className="font-bold text-blue-600">{estimate?.total || 0} Recipients</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Channels:</span>
                <span className="font-bold text-slate-900">{channels}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Priority:</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getPriorityBadgeClass(priority)}`}>
                  {priority}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200">
                <span className="text-slate-500 block mb-0.5">Title:</span>
                <span className="font-bold text-slate-900">{title}</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-[11px] text-blue-900">
              Dispatches in asynchronous batches. Real delivery logs and statistics will be recorded authoritatively in the audit database.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSending}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDispatchBroadcast}
                disabled={isSending}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm"
              >
                {isSending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Broadcasting...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Confirm & Send Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TEST NOTIFICATION MODAL */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Send Test Preview Notification</h3>
              </div>
              <button
                onClick={() => setShowTestModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Safely verify notification rendering before broadcasting to live candidate accounts.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Recipient Email for Test Preview
              </label>
              <input
                type="email"
                placeholder="Defaults to your Super Admin email"
                value={testEmailInput}
                onChange={(e) => setTestEmailInput(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Leave empty to send directly to your logged-in administrator email.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                disabled={isSendingTest}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendTest}
                disabled={isSendingTest}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer"
              >
                {isSendingTest ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending Preview...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Test Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CAMPAIGN DETAILS DRAWER / MODAL */}
      {selectedCampaignDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Campaign Delivery Audit</h3>
                <p className="text-[11px] text-slate-400">ID: {selectedCampaignDetails.campaign.id}</p>
              </div>
              <button
                onClick={() => setSelectedCampaignDetails(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 flex-1 pr-1">
              {/* Campaign Summary card */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                <h4 className="font-bold text-slate-900 text-sm">{selectedCampaignDetails.campaign.title}</h4>
                <p className="text-slate-600 whitespace-pre-wrap">{selectedCampaignDetails.campaign.message}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200/80 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">Total Targeted:</span>
                    <span className="font-bold text-slate-900">{selectedCampaignDetails.campaign.total_targeted}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">In-App Sent:</span>
                    <span className="font-bold text-indigo-600">{selectedCampaignDetails.campaign.in_app_sent}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Email Sent:</span>
                    <span className="font-bold text-emerald-600">{selectedCampaignDetails.campaign.email_sent}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Email Failed:</span>
                    <span className="font-bold text-rose-600">{selectedCampaignDetails.campaign.email_failed}</span>
                  </div>
                </div>
              </div>

              {/* Status Breakdown badges */}
              {selectedCampaignDetails.statusBreakdown?.length > 0 && (
                <div>
                  <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Delivery Breakdown</h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedCampaignDetails.statusBreakdown.map((sb, idx) => (
                      <span key={idx} className="px-3 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700">
                        <strong>{sb.channel}:</strong> {sb.status} ({sb.count})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Delivery Logs list */}
              <div>
                <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Recent Delivery Logs ({selectedCampaignDetails.logs.length})</h5>
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead className="bg-slate-50 text-slate-500 font-bold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Recipient</th>
                        <th className="py-2 px-3">Channel</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedCampaignDetails.logs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-mono text-[10px] text-slate-700">{log.recipient_email || log.user_id}</td>
                          <td className="py-2 px-3 text-slate-600">{log.channel}</td>
                          <td className="py-2 px-3">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              log.status === 'DELIVERED' || log.status === 'SENT' || log.status === 'SANDBOX_RECORDED'
                                ? 'bg-emerald-50 text-emerald-700'
                                : log.status === 'SKIPPED'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-400">{formatTimeIST(log.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedCampaignDetails(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
