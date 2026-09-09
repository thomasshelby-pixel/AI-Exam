import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client.js';
import {
  Sparkles,
  Plus,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Archive,
  Trash2,
  Edit3,
  Eye,
  Calendar,
  Users,
  Award,
  Clock,
  ShieldCheck,
  FileText,
  ChevronRight,
  X,
  Check,
} from 'lucide-react';

interface PromoCampaign {
  code: string;
  campaign_name?: string;
  campaignName?: string;
  description?: string;
  status: 'ACTIVE' | 'DISABLED' | 'EXHAUSTED' | 'ARCHIVED';
  is_active: number;
  isActive?: boolean;
  max_redemptions: number;
  maxRedemptions?: number;
  successfulRedemptions?: number;
  used_redemptions?: number;
  remainingSlots?: number;
  remainingRedemptions?: number;
  max_evaluations?: number;
  maxEvaluations?: number;
  benefit_duration_days?: number;
  benefitDurationDays?: number;
  validity_days?: number;
  discount_type?: string;
  start_date?: string | null;
  startDate?: string | null;
  end_date?: string | null;
  endDate?: string | null;
  user_type?: string;
  userType?: string;
  terms_notes?: string;
  termsNotes?: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
}

interface PromoRedemption {
  id: string;
  referral_code: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  evaluations_used: number;
  evaluations_remaining: number;
  max_evaluations: number;
  redeemed_at: string;
  expiry_date: string;
  status: string;
  audit_note?: string;
}

export function AdminPromoCodesSection() {
  const [loading, setLoading] = useState<boolean>(true);
  const [campaigns, setCampaigns] = useState<PromoCampaign[]>([]);
  const [redemptions, setRedemptions] = useState<PromoRedemption[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [redemptionCodeFilter, setRedemptionCodeFilter] = useState<string>('ALL');
  const [redemptionSearch, setRedemptionSearch] = useState<string>('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [editingCampaign, setEditingCampaign] = useState<PromoCampaign | null>(null);
  const [deletingCampaign, setDeletingCampaign] = useState<PromoCampaign | null>(null);
  const [viewingRedemptionsForCode, setViewingRedemptionsForCode] = useState<string | null>(null);

  // Create Form State
  const [createForm, setCreateForm] = useState({
    code: '',
    campaignName: '',
    description: '',
    status: 'ACTIVE',
    maxRedemptions: '20',
    maxEvaluations: '15',
    benefitDurationDays: '30',
    startDate: '',
    endDate: '',
    userType: 'ALL',
    termsNotes: '',
  });

  // Edit Form State
  const [editForm, setEditForm] = useState({
    campaignName: '',
    description: '',
    status: 'ACTIVE',
    maxRedemptions: '20',
    maxEvaluations: '15',
    benefitDurationDays: '30',
    startDate: '',
    endDate: '',
    userType: 'ALL',
    termsNotes: '',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await apiRequest<{ success: boolean; campaigns: PromoCampaign[]; redemptions: PromoRedemption[] }>('/api/admin/promo-codes');
      setCampaigns(res.campaigns || []);
      setRedemptions(res.redemptions || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load promo code records';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreatePromoCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.code.trim()) {
      setErrorMsg('Promo code cannot be empty.');
      return;
    }

    try {
      setErrorMsg('');
      const res = await apiRequest<{ success: boolean; message: string }>('/api/admin/promo-codes', {
        method: 'POST',
        body: JSON.stringify({
          code: createForm.code.trim().toUpperCase(),
          campaignName: createForm.campaignName.trim(),
          description: createForm.description.trim(),
          status: createForm.status,
          maxRedemptions: parseInt(createForm.maxRedemptions, 10) || 20,
          maxEvaluations: parseInt(createForm.maxEvaluations, 10) || 15,
          benefitDurationDays: parseInt(createForm.benefitDurationDays, 10) || 30,
          startDate: createForm.startDate ? new Date(createForm.startDate).toISOString() : null,
          endDate: createForm.endDate ? new Date(createForm.endDate).toISOString() : null,
          userType: createForm.userType,
          termsNotes: createForm.termsNotes.trim(),
        }),
      });

      setSuccessMsg(res.message || `Promo code ${createForm.code.toUpperCase()} created successfully!`);
      setShowCreateModal(false);
      setCreateForm({
        code: '',
        campaignName: '',
        description: '',
        status: 'ACTIVE',
        maxRedemptions: '20',
        maxEvaluations: '15',
        benefitDurationDays: '30',
        startDate: '',
        endDate: '',
        userType: 'ALL',
        termsNotes: '',
      });
      loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create promo code');
    }
  };

  const openEditModal = (camp: PromoCampaign) => {
    setEditingCampaign(camp);
    setEditForm({
      campaignName: camp.campaignName || camp.campaign_name || '',
      description: camp.description || '',
      status: camp.status || (camp.is_active ? 'ACTIVE' : 'DISABLED'),
      maxRedemptions: String(camp.maxRedemptions ?? camp.max_redemptions ?? 20),
      maxEvaluations: String(camp.maxEvaluations ?? camp.max_evaluations ?? 15),
      benefitDurationDays: String(camp.benefitDurationDays ?? camp.benefit_duration_days ?? 30),
      startDate: camp.startDate || camp.start_date ? new Date(camp.startDate || camp.start_date!).toISOString().slice(0, 10) : '',
      endDate: camp.endDate || camp.end_date ? new Date(camp.endDate || camp.end_date!).toISOString().slice(0, 10) : '',
      userType: camp.userType || camp.user_type || 'ALL',
      termsNotes: camp.termsNotes || camp.terms_notes || '',
    });
  };

  const handleUpdatePromoCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCampaign) return;

    try {
      setErrorMsg('');
      const res = await apiRequest<{ success: boolean; message: string }>(`/api/admin/promo-codes/${editingCampaign.code}`, {
        method: 'PUT',
        body: JSON.stringify({
          campaignName: editForm.campaignName.trim(),
          description: editForm.description.trim(),
          status: editForm.status,
          maxRedemptions: parseInt(editForm.maxRedemptions, 10) || 20,
          maxEvaluations: parseInt(editForm.maxEvaluations, 10) || 15,
          benefitDurationDays: parseInt(editForm.benefitDurationDays, 10) || 30,
          startDate: editForm.startDate ? new Date(editForm.startDate).toISOString() : '__CLEAR__',
          endDate: editForm.endDate ? new Date(editForm.endDate).toISOString() : '__CLEAR__',
          userType: editForm.userType,
          termsNotes: editForm.termsNotes.trim(),
        }),
      });

      setSuccessMsg(res.message || `Promo code ${editingCampaign.code} updated successfully.`);
      setEditingCampaign(null);
      loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update promo code');
    }
  };

  const handleToggleStatus = async (camp: PromoCampaign) => {
    const nextStatus = camp.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      setErrorMsg('');
      const res = await apiRequest<{ success: boolean; message: string }>(`/api/admin/promo-codes/${camp.code}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setSuccessMsg(res.message || `Promo code ${camp.code} is now ${nextStatus}.`);
      loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to toggle promo code status');
    }
  };

  const handleDeleteOrArchive = async () => {
    if (!deletingCampaign) return;
    try {
      setErrorMsg('');
      const res = await apiRequest<{ success: boolean; archived?: boolean; deleted?: boolean; message: string }>(
        `/api/admin/promo-codes/${deletingCampaign.code}`,
        { method: 'DELETE' }
      );
      setSuccessMsg(res.message);
      setDeletingCampaign(null);
      loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete/archive promo code');
    }
  };

  // Filtered campaigns
  const filteredCampaigns = campaigns.filter((camp) => {
    const matchesSearch =
      camp.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (camp.campaign_name && camp.campaign_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (camp.description && camp.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      statusFilter === 'ALL' ||
      camp.status === statusFilter ||
      (statusFilter === 'ACTIVE' && camp.is_active === 1) ||
      (statusFilter === 'DISABLED' && camp.is_active === 0);

    return matchesSearch && matchesStatus;
  });

  // Filtered redemptions
  const activeRedemptionFilter = viewingRedemptionsForCode || (redemptionCodeFilter === 'ALL' ? '' : redemptionCodeFilter);
  const filteredRedemptions = redemptions.filter((red) => {
    const matchesCode = !activeRedemptionFilter || red.referral_code.toUpperCase() === activeRedemptionFilter.toUpperCase();
    const matchesSearch =
      !redemptionSearch ||
      (red.user_name && red.user_name.toLowerCase().includes(redemptionSearch.toLowerCase())) ||
      (red.user_email && red.user_email.toLowerCase().includes(redemptionSearch.toLowerCase())) ||
      red.referral_code.toLowerCase().includes(redemptionSearch.toLowerCase());
    return matchesCode && matchesSearch;
  });

  // Summary Metrics
  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE').length;
  const totalRedemptions = redemptions.length;
  const totalEvalsGranted = redemptions.reduce((acc, r) => acc + (r.max_evaluations || 15), 0);

  return (
    <div className="space-y-6">
      {/* Alert Banners */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg('')} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg('')} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4 fill-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Promo Code Management</h2>
              <p className="text-xs text-slate-500">
                Create, configure, monitor, and audit database-driven promo campaigns with transaction-safe redemption quotas.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            id="btn-refresh-promo-codes"
            onClick={loadData}
            disabled={loading}
            className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            title="Refresh promo codes"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            id="btn-add-promo-code"
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Promo Code</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Total Campaigns</span>
            <Sparkles className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-slate-900">{totalCampaigns}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Configured promo offers</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Active Codes</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-emerald-600">{activeCampaigns}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Available for registration</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Total Redemptions</span>
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-xl font-bold text-slate-900">{totalRedemptions}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Eligible student claims</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Evaluations Granted</span>
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">{totalEvalsGranted}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Promotional evaluations unlocked</p>
        </div>
      </div>

      {/* Main Promo Codes List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Configured Promo Codes ({filteredCampaigns.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search promo code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 w-40 sm:w-56"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-600"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="DISABLED">DISABLED</option>
              <option value="EXHAUSTED">EXHAUSTED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </div>
        </div>

        {/* Promo Codes Table */}
        {filteredCampaigns.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No promo codes found</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              No promo codes match your current filter. Click "Add Promo Code" above to configure a new offer.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-bold">Code & Campaign</th>
                  <th className="py-3 px-3 font-bold text-center">Status</th>
                  <th className="py-3 px-3 font-bold">Redemptions</th>
                  <th className="py-3 px-3 font-bold text-center">Evals / Student</th>
                  <th className="py-3 px-3 font-bold">Validity</th>
                  <th className="py-3 px-3 font-bold">Active Dates</th>
                  <th className="py-3 px-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCampaigns.map((camp) => {
                  const used = camp.successfulRedemptions ?? camp.used_redemptions ?? 0;
                  const max = camp.maxRedemptions ?? camp.max_redemptions ?? 20;
                  const remaining = Math.max(0, max - used);
                  const percentUsed = Math.min(100, Math.round((used / max) * 100));

                  let statusBadge = (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      ACTIVE
                    </span>
                  );
                  if (camp.status === 'DISABLED' || !camp.is_active) {
                    statusBadge = (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        DISABLED
                      </span>
                    );
                  } else if (camp.status === 'EXHAUSTED' || remaining === 0) {
                    statusBadge = (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                        EXHAUSTED
                      </span>
                    );
                  } else if (camp.status === 'ARCHIVED') {
                    statusBadge = (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 border border-slate-300">
                        ARCHIVED
                      </span>
                    );
                  }

                  return (
                    <tr key={camp.code} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-black text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md uppercase">
                            {camp.code}
                          </span>
                          <div>
                            <div className="font-bold text-slate-900">{camp.campaignName || camp.campaign_name}</div>
                            <div className="text-[11px] text-slate-500 max-w-xs truncate">
                              {camp.description || 'No description provided'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-center">{statusBadge}</td>

                      <td className="py-3 px-3">
                        <div className="w-36">
                          <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
                            <span className="text-slate-800 font-bold">
                              {used} / {max}
                            </span>
                            <span className={remaining === 0 ? 'text-purple-600 font-bold' : 'text-slate-500'}>
                              {remaining} left
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full ${
                                remaining === 0 ? 'bg-purple-600' : percentUsed > 75 ? 'bg-amber-500' : 'bg-blue-600'
                              }`}
                              style={{ width: `${percentUsed}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          {camp.maxEvaluations ?? camp.max_evaluations ?? 15}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="text-slate-800 font-medium">
                          {camp.benefitDurationDays ?? camp.benefit_duration_days ?? 30} days
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {(camp.benefitDurationDays ?? camp.benefit_duration_days ?? 30) === 30 ? '1 Month' : ''}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        {camp.start_date || camp.startDate || camp.end_date || camp.endDate ? (
                          <div className="text-[10px] text-slate-600 space-y-0.5">
                            <div>
                              From: {camp.startDate || camp.start_date ? new Date(camp.startDate || camp.start_date!).toLocaleDateString('en-IN') : 'Immediate'}
                            </div>
                            <div>
                              To: {camp.endDate || camp.end_date ? new Date(camp.endDate || camp.end_date!).toLocaleDateString('en-IN') : 'No expiry'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">Always Active</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setViewingRedemptionsForCode(camp.code);
                              // Smooth scroll to redemptions table
                              const el = document.getElementById('redemptions-history-section');
                              if (el) el.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                            title="View student redemptions"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditModal(camp)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition"
                            title="Edit configuration"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleStatus(camp)}
                            className={`p-1.5 rounded transition ${
                              camp.status === 'ACTIVE'
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={camp.status === 'ACTIVE' ? 'Disable code' : 'Activate code'}
                          >
                            {camp.status === 'ACTIVE' ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeletingCampaign(camp)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                            title={used > 0 ? 'Archive promo code' : 'Delete promo code'}
                          >
                            {used > 0 ? <Archive className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Redemptions History & Audit Section */}
      <div id="redemptions-history-section" className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span>Redemption History & Audit Log</span>
              {activeRedemptionFilter && (
                <span className="text-xs font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded ml-1">
                  Filtering: {activeRedemptionFilter}
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Live records of every student who claimed a promo offer, quota consumption, and audit timestamps.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {viewingRedemptionsForCode && (
              <button
                type="button"
                onClick={() => setViewingRedemptionsForCode(null)}
                className="px-2.5 py-1.5 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg font-semibold flex items-center gap-1 transition"
              >
                <span>Clear Filter</span>
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <select
              value={viewingRedemptionsForCode || redemptionCodeFilter}
              onChange={(e) => {
                setViewingRedemptionsForCode(null);
                setRedemptionCodeFilter(e.target.value);
              }}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-none"
            >
              <option value="ALL">All Promo Codes</option>
              {campaigns.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.successfulRedemptions ?? c.used_redemptions ?? 0} redeemed)
                </option>
              ))}
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search student or email..."
                value={redemptionSearch}
                onChange={(e) => setRedemptionSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none w-48"
              />
            </div>
          </div>
        </div>

        {filteredRedemptions.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">
            No student redemption records found matching your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 font-bold">Code</th>
                  <th className="py-2.5 px-3 font-bold">Student Name</th>
                  <th className="py-2.5 px-3 font-bold">Student Email</th>
                  <th className="py-2.5 px-3 font-bold text-center">Used</th>
                  <th className="py-2.5 px-3 font-bold text-center">Remaining</th>
                  <th className="py-2.5 px-3 font-bold">Claimed Date</th>
                  <th className="py-2.5 px-3 font-bold">Entitlement Expiry</th>
                  <th className="py-2.5 px-3 font-bold">Audit Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRedemptions.map((red) => (
                  <tr key={red.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                      {red.referral_code}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      {red.user_name || 'Student'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px]">
                      {red.user_email || red.user_id}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-700">
                      {red.evaluations_used ?? 0}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                        {red.evaluations_remaining !== undefined
                          ? red.evaluations_remaining
                          : (red.max_evaluations || 15) - (red.evaluations_used || 0)}{' '}
                        / {red.max_evaluations || 15}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                      {new Date(red.redeemed_at).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                      {red.expiry_date ? new Date(red.expiry_date).toLocaleDateString('en-IN') : 'N/A'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-[11px] max-w-[220px] truncate" title={red.audit_note}>
                      {red.audit_note || 'Redeemed successfully'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE PROMO CODE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-5 text-slate-800 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-600" />
                  <span>Create Promo Code</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure a new promotional code with server-enforced redemption quota.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePromoCode} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Promo Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. WELCOME50"
                    value={createForm.code}
                    onChange={(e) => setCreateForm({ ...createForm, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 uppercase font-mono font-bold focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Uppercase letters, numbers, hyphens</p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status</label>
                  <select
                    value={createForm.status}
                    onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600"
                  >
                    <option value="ACTIVE">ACTIVE (Accepting redemptions)</option>
                    <option value="DISABLED">DISABLED (Temporarily inactive)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Campaign / Display Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Welcome Launch Special Offer"
                  value={createForm.campaignName}
                  onChange={(e) => setCreateForm({ ...createForm, campaignName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Brief description of the promotion and offer context"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Max Redemptions <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={createForm.maxRedemptions}
                    onChange={(e) => setCreateForm({ ...createForm, maxRedemptions: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Quota cap (e.g. 20)</p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Evaluations <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={createForm.maxEvaluations}
                    onChange={(e) => setCreateForm({ ...createForm, maxEvaluations: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Per student (e.g. 15)</p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Validity (Days) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={createForm.benefitDurationDays}
                    onChange={(e) => setCreateForm({ ...createForm, benefitDurationDays: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">30 = 1 month</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Start Date (Optional)</label>
                  <input
                    type="date"
                    value={createForm.startDate}
                    onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">End Date (Optional)</label>
                  <input
                    type="date"
                    value={createForm.endDate}
                    onChange={(e) => setCreateForm({ ...createForm, endDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Applicable User Type</label>
                <select
                  value={createForm.userType}
                  onChange={(e) => setCreateForm({ ...createForm, userType: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                >
                  <option value="ALL">All Student Registrations</option>
                  <option value="STUDENT">Student Only</option>
                  <option value="INSTITUTE_STUDENT">Institute Enrolled</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Terms / Audit Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Valid for first 20 eligible registrations"
                  value={createForm.termsNotes}
                  onChange={(e) => setCreateForm({ ...createForm, termsNotes: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition shadow-xs"
                >
                  Create Promo Code
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PROMO CODE MODAL */}
      {editingCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-5 text-slate-800 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-blue-600" />
                  <span>Edit Promo Code: {editingCampaign.code}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Update campaign parameters. Existing granted student benefits are preserved.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCampaign(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdatePromoCode} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Promo Code</label>
                  <input
                    type="text"
                    disabled
                    value={editingCampaign.code}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-100 uppercase font-mono font-bold text-slate-500 cursor-not-allowed"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Code identifier cannot be renamed</p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="DISABLED">DISABLED</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Campaign / Display Name</label>
                <input
                  type="text"
                  required
                  value={editForm.campaignName}
                  onChange={(e) => setEditForm({ ...editForm, campaignName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Max Redemptions</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editForm.maxRedemptions}
                    onChange={(e) => setEditForm({ ...editForm, maxRedemptions: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Currently: {editingCampaign.successfulRedemptions ?? editingCampaign.used_redemptions ?? 0} used
                  </p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Evaluations Limit</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editForm.maxEvaluations}
                    onChange={(e) => setEditForm({ ...editForm, maxEvaluations: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Applies to new claims</p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Validity (Days)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editForm.benefitDurationDays}
                    onChange={(e) => setEditForm({ ...editForm, benefitDurationDays: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Applies to new claims</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={editForm.startDate}
                    onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={editForm.endDate}
                    onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Terms / Notes</label>
                <input
                  type="text"
                  value={editForm.termsNotes}
                  onChange={(e) => setEditForm({ ...editForm, termsNotes: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-[11px] text-blue-800">
                <strong>Audit Notice:</strong> Updating promotional evaluation limits or validity duration takes effect
                for future student redemptions. Existing student entitlements maintain their originally unlocked benefits.
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingCampaign(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE / ARCHIVE CONFIRMATION MODAL */}
      {deletingCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 text-slate-800 shadow-2xl">
            <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">
                {(deletingCampaign.successfulRedemptions ?? deletingCampaign.used_redemptions ?? 0) > 0
                  ? `Archive Promo Code ${deletingCampaign.code}?`
                  : `Delete Promo Code ${deletingCampaign.code}?`}
              </h3>
              <p className="text-xs text-slate-500">
                {(deletingCampaign.successfulRedemptions ?? deletingCampaign.used_redemptions ?? 0) > 0
                  ? `This code has ${
                      deletingCampaign.successfulRedemptions ?? deletingCampaign.used_redemptions
                    } historical student redemptions. To safeguard student audit logs and access histories, it will be safely archived and disabled rather than permanently deleted.`
                  : `This code has not been redeemed by any students yet. It can be safely removed from the system.`}
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingCampaign(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg border border-slate-200 bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteOrArchive}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition shadow-xs"
              >
                {(deletingCampaign.successfulRedemptions ?? deletingCampaign.used_redemptions ?? 0) > 0
                  ? 'Confirm Archive'
                  : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
