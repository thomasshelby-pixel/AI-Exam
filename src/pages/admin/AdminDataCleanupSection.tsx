import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client.js';
import {
  Trash2,
  AlertTriangle,
  AlertOctagon,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Building2,
  GraduationCap,
  CreditCard,
  FileCheck2,
  Sparkles,
  Search,
  Filter,
  ShieldAlert,
  Info,
  X,
} from 'lucide-react';

interface TestPreviewSummary {
  totalTestItems: number;
  studentsCount: number;
  institutesCount: number;
  ordersCount: number;
  transactionsCount: number;
  evaluationsCount: number;
  promoRedemptionsCount: number;
  creditEntriesCount: number;
  filesCount: number;
}

interface TestPreviewDetails {
  students: Array<{ id: string; name: string; email: string; createdAt: string }>;
  institutes: Array<{ id: string; name: string; code: string; email: string; createdAt: string }>;
  orders: Array<{ id: string; studentName: string; studentEmail: string; amountPaise: number; status: string; createdAt: string }>;
  transactions: Array<{ id: string; orderId: string; amountPaise: number; status: string; razorpayPaymentId: string | null; createdAt: string }>;
  evaluations: Array<{ id: string; studentName: string; subject: string; level: string; status: string; createdAt: string }>;
  promoRedemptions: Array<{ id: string; referralCode: string; userEmail: string; redeemedAt: string }>;
}

export const AdminDataCleanupSection: React.FC<{ onDataChanged?: () => void }> = ({ onDataChanged }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [summary, setSummary] = useState<TestPreviewSummary | null>(null);
  const [details, setDetails] = useState<TestPreviewDetails | null>(null);
  const [activeTab, setActiveTab] = useState<'STUDENTS' | 'INSTITUTES' | 'ORDERS' | 'EVALUATIONS' | 'PROMO_REDEMPTIONS'>('STUDENTS');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal State
  const [actionModal, setActionModal] = useState<{
    type: 'DELETE_ALL' | 'PURGE_CATEGORY' | 'DELETE_RECORD';
    category?: 'STUDENTS' | 'INSTITUTES' | 'ORDERS' | 'PAYMENTS' | 'EVALUATIONS' | 'PROMO_REDEMPTIONS';
    recordId?: string;
    recordName?: string;
    recordDetails?: string;
  } | null>(null);

  const [confirmInput, setConfirmInput] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchPreview = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ summary: TestPreviewSummary; details: TestPreviewDetails }>(
        '/api/admin/test-cleanup/preview'
      );
      setSummary(res.summary);
      setDetails(res.details);
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to load test cleanup preview data.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreview();
  }, []);

  const openDeleteAllModal = () => {
    setConfirmInput('');
    setModalError(null);
    setActionModal({ type: 'DELETE_ALL' });
  };

  const openPurgeCategoryModal = (cat: 'STUDENTS' | 'INSTITUTES' | 'ORDERS' | 'EVALUATIONS' | 'PROMO_REDEMPTIONS') => {
    setConfirmInput('');
    setModalError(null);
    setActionModal({ type: 'PURGE_CATEGORY', category: cat });
  };

  const openDeleteRecordModal = (
    cat: 'STUDENTS' | 'INSTITUTES' | 'ORDERS' | 'PAYMENTS' | 'EVALUATIONS' | 'PROMO_REDEMPTIONS',
    id: string,
    name: string,
    detailsStr: string
  ) => {
    setConfirmInput('');
    setModalError(null);
    setActionModal({
      type: 'DELETE_RECORD',
      category: cat,
      recordId: id,
      recordName: name,
      recordDetails: detailsStr,
    });
  };

  const closeModal = () => {
    setActionModal(null);
    setConfirmInput('');
    setModalError(null);
  };

  const handleExecuteModalAction = async () => {
    if (!actionModal) return;

    if (actionModal.type === 'DELETE_ALL') {
      if (confirmInput.trim() !== 'DELETE ALL TEST DATA') {
        setModalError('You must enter exact text "DELETE ALL TEST DATA" to proceed.');
        return;
      }
    } else {
      if (confirmInput.trim() !== 'DELETE') {
        setModalError('You must enter exact text "DELETE" to proceed.');
        return;
      }
    }

    setIsProcessing(true);
    setModalError(null);

    try {
      if (actionModal.type === 'DELETE_ALL') {
        const res = await apiRequest<{ success: boolean; message: string }>('/api/admin/test-cleanup/delete-all', {
          method: 'POST',
          body: JSON.stringify({ confirmation: 'DELETE ALL TEST DATA' }),
        });
        setNotification({ type: 'success', message: res.message });
      } else if (actionModal.type === 'PURGE_CATEGORY' && actionModal.category) {
        const res = await apiRequest<{ success: boolean; message: string }>('/api/admin/test-cleanup/delete-category', {
          method: 'POST',
          body: JSON.stringify({ category: actionModal.category }),
        });
        setNotification({ type: 'success', message: res.message });
      } else if (actionModal.type === 'DELETE_RECORD' && actionModal.category && actionModal.recordId) {
        const res = await apiRequest<{ success: boolean; message: string }>('/api/admin/test-cleanup/delete-record', {
          method: 'POST',
          body: JSON.stringify({ category: actionModal.category, id: actionModal.recordId }),
        });
        setNotification({ type: 'success', message: res.message });
      }

      closeModal();
      await fetchPreview();
      if (onDataChanged) {
        onDataChanged();
      }
    } catch (err: any) {
      setModalError(err.message || 'Cleanup operation failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredStudents = (details?.students || []).filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredInstitutes = (details?.institutes || []).filter(
    (i) =>
      i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredOrders = (details?.orders || []).filter(
    (o) =>
      o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.studentEmail.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredEvaluations = (details?.evaluations || []).filter(
    (e) =>
      e.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.level.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPromoRedemptions = (details?.promoRedemptions || []).filter(
    (r) =>
      r.referralCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Alert Notifications */}
      {notification && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-sm font-medium ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="p-1 hover:bg-black/5 rounded-md text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600">
              <AlertOctagon className="w-5 h-5" />
            </span>
            <h3 className="text-base font-bold text-slate-900">Super Admin Test-Data Cleanup Engine</h3>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            Safely inspect, identify, and permanently purge demo accounts, testing institutes, and mock transaction data.
            All operations are transactional and audited. Real student platform accounts and statutory financial records are strictly protected.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={fetchPreview}
            disabled={loading}
            className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Scan
          </button>

          <button
            onClick={openDeleteAllModal}
            disabled={loading || (summary?.totalTestItems || 0) === 0}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition ${
              (summary?.totalTestItems || 0) > 0
                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs cursor-pointer'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Wipe All Test Data ({summary?.totalTestItems || 0})
          </button>
        </div>
      </div>

      {/* Safety Notice Banner */}
      <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-blue-900 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed">
          <span className="font-bold">Zero-Production Data Loss Guarantee: </span>
          Only records explicitly classified as <span className="font-mono font-bold bg-blue-100 px-1 py-0.5 rounded text-blue-800">TEST</span> (or created in mock domains) are targeted. Live students, normal coaching institutes, and statutory Razorpay orders are never touched. Student personal credits and answer history are preserved when an institute is deleted.
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Test Items</span>
            <AlertOctagon className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-slate-900">{summary?.totalTestItems ?? '—'}</p>
          <span className="text-[10px] text-slate-400">All categories</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Test Students</span>
            <GraduationCap className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-xl font-bold text-slate-900">{summary?.studentsCount ?? '—'}</p>
          <span className="text-[10px] text-slate-400">Mock accounts</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Test Institutes</span>
            <Building2 className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-xl font-bold text-slate-900">{summary?.institutesCount ?? '—'}</p>
          <span className="text-[10px] text-slate-400">Demo academies</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Test Orders</span>
            <CreditCard className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-xl font-bold text-slate-900">{summary?.ordersCount ?? '—'}</p>
          <span className="text-[10px] text-slate-400">{summary?.transactionsCount || 0} transactions</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Test Evaluations</span>
            <FileCheck2 className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-slate-900">{summary?.evaluationsCount ?? '—'}</p>
          <span className="text-[10px] text-slate-400">Mock submissions</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Promo Redemptions</span>
            <Sparkles className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-xl font-bold text-slate-900">{summary?.promoRedemptionsCount ?? '—'}</p>
          <span className="text-[10px] text-slate-400">Test redemptions</span>
        </div>
      </div>

      {/* Category Navigation Tabs & Search */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="border-b border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
          {/* Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => {
                setActiveTab('STUDENTS');
                setSearchQuery('');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'STUDENTS'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              Test Students
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'STUDENTS' ? 'bg-blue-800 text-blue-100' : 'bg-slate-100 text-slate-600'
              }`}>
                {summary?.studentsCount || 0}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab('INSTITUTES');
                setSearchQuery('');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'INSTITUTES'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Test Institutes
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'INSTITUTES' ? 'bg-purple-800 text-purple-100' : 'bg-slate-100 text-slate-600'
              }`}>
                {summary?.institutesCount || 0}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab('ORDERS');
                setSearchQuery('');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'ORDERS'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              Test Orders & Payments
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'ORDERS' ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-100 text-slate-600'
              }`}>
                {summary?.ordersCount || 0}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab('EVALUATIONS');
                setSearchQuery('');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'EVALUATIONS'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              Test Evaluations
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'EVALUATIONS' ? 'bg-amber-800 text-amber-100' : 'bg-slate-100 text-slate-600'
              }`}>
                {summary?.evaluationsCount || 0}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab('PROMO_REDEMPTIONS');
                setSearchQuery('');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'PROMO_REDEMPTIONS'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Test Promo Redemptions
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'PROMO_REDEMPTIONS' ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-100 text-slate-600'
              }`}>
                {summary?.promoRedemptionsCount || 0}
              </span>
            </button>
          </div>

          {/* Search & Bulk Category Action */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search records..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 w-48 sm:w-60"
              />
            </div>

            <button
              onClick={() => openPurgeCategoryModal(activeTab)}
              disabled={
                loading ||
                (activeTab === 'STUDENTS' && (summary?.studentsCount || 0) === 0) ||
                (activeTab === 'INSTITUTES' && (summary?.institutesCount || 0) === 0) ||
                (activeTab === 'ORDERS' && (summary?.ordersCount || 0) === 0) ||
                (activeTab === 'EVALUATIONS' && (summary?.evaluationsCount || 0) === 0) ||
                (activeTab === 'PROMO_REDEMPTIONS' && (summary?.promoRedemptionsCount || 0) === 0)
              }
              className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Purge All {activeTab.replace('_', ' ')}
            </button>
          </div>
        </div>

        {/* Content Table by Tab */}
        <div className="overflow-x-auto">
          {/* TAB: STUDENTS */}
          {activeTab === 'STUDENTS' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="py-2.5 px-4 font-bold">Student Name</th>
                  <th className="py-2.5 px-4 font-bold">Email</th>
                  <th className="py-2.5 px-4 font-bold">User ID</th>
                  <th className="py-2.5 px-4 font-bold">Registered</th>
                  <th className="py-2.5 px-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No test student records found.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        {s.name}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-600">{s.email}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-400 text-[11px]">{s.id}</td>
                      <td className="py-2.5 px-4 text-slate-500">{new Date(s.createdAt).toLocaleDateString()}</td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={() =>
                            openDeleteRecordModal(
                              'STUDENTS',
                              s.id,
                              s.name,
                              `Student Email: ${s.email} • ID: ${s.id}`
                            )
                          }
                          className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* TAB: INSTITUTES */}
          {activeTab === 'INSTITUTES' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="py-2.5 px-4 font-bold">Institute Name</th>
                  <th className="py-2.5 px-4 font-bold">Code</th>
                  <th className="py-2.5 px-4 font-bold">Admin Email</th>
                  <th className="py-2.5 px-4 font-bold">Created</th>
                  <th className="py-2.5 px-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInstitutes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No test institute records found.
                    </td>
                  </tr>
                ) : (
                  filteredInstitutes.map((i) => (
                    <tr key={i.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                        {i.name}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-purple-700">{i.code}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-600">{i.email}</td>
                      <td className="py-2.5 px-4 text-slate-500">{new Date(i.createdAt).toLocaleDateString()}</td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={() =>
                            openDeleteRecordModal(
                              'INSTITUTES',
                              i.id,
                              i.name,
                              `Institute Code: ${i.code} • Contact: ${i.email}`
                            )
                          }
                          className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* TAB: ORDERS */}
          {activeTab === 'ORDERS' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="py-2.5 px-4 font-bold">Order ID</th>
                  <th className="py-2.5 px-4 font-bold">Student</th>
                  <th className="py-2.5 px-4 font-bold">Amount</th>
                  <th className="py-2.5 px-4 font-bold">Status</th>
                  <th className="py-2.5 px-4 font-bold">Date</th>
                  <th className="py-2.5 px-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No test payment orders found.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-4 font-mono text-slate-700">{o.id}</td>
                      <td className="py-2.5 px-4">
                        <p className="font-bold text-slate-900">{o.studentName}</p>
                        <p className="text-[10px] text-slate-400">{o.studentEmail}</p>
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold">₹{o.amountPaise / 100}</td>
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700">
                          {o.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-400">{new Date(o.createdAt).toLocaleDateString()}</td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={() =>
                            openDeleteRecordModal(
                              'ORDERS',
                              o.id,
                              `Order ${o.id}`,
                              `Student: ${o.studentName} (${o.studentEmail}) • Amount: ₹${o.amountPaise / 100}`
                            )
                          }
                          className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* TAB: EVALUATIONS */}
          {activeTab === 'EVALUATIONS' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="py-2.5 px-4 font-bold">Evaluation ID</th>
                  <th className="py-2.5 px-4 font-bold">Student</th>
                  <th className="py-2.5 px-4 font-bold">Subject</th>
                  <th className="py-2.5 px-4 font-bold">Level</th>
                  <th className="py-2.5 px-4 font-bold">Status</th>
                  <th className="py-2.5 px-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEvaluations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No test evaluation records found.
                    </td>
                  </tr>
                ) : (
                  filteredEvaluations.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-4 font-mono text-slate-700">{ev.id}</td>
                      <td className="py-2.5 px-4 font-bold text-slate-900">{ev.studentName}</td>
                      <td className="py-2.5 px-4 text-slate-700">{ev.subject}</td>
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {ev.level}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">
                          {ev.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={() =>
                            openDeleteRecordModal(
                              'EVALUATIONS',
                              ev.id,
                              `Evaluation ${ev.id}`,
                              `Student: ${ev.studentName} • Subject: ${ev.subject} (${ev.level})`
                            )
                          }
                          className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {/* TAB: PROMO REDEMPTIONS */}
          {activeTab === 'PROMO_REDEMPTIONS' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="py-2.5 px-4 font-bold">Referral / Promo Code</th>
                  <th className="py-2.5 px-4 font-bold">User Email</th>
                  <th className="py-2.5 px-4 font-bold">Redemption ID</th>
                  <th className="py-2.5 px-4 font-bold">Redeemed At</th>
                  <th className="py-2.5 px-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPromoRedemptions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No test promo redemptions found.
                    </td>
                  </tr>
                ) : (
                  filteredPromoRedemptions.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-4 font-mono font-bold text-indigo-600">{r.referralCode}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-700">{r.userEmail}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-400 text-[11px]">{r.id}</td>
                      <td className="py-2.5 px-4 text-slate-500">{new Date(r.redeemedAt).toLocaleString()}</td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={() =>
                            openDeleteRecordModal(
                              'PROMO_REDEMPTIONS',
                              r.id,
                              `Promo Redemption ${r.referralCode}`,
                              `Code: ${r.referralCode} • User: ${r.userEmail}`
                            )
                          }
                          className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* CONFIRMATION MODAL */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-rose-600 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-5 h-5" />
                <h3 className="text-sm font-bold tracking-wide">
                  {actionModal.type === 'DELETE_ALL'
                    ? 'Permanently Wipe All Test Data'
                    : actionModal.type === 'PURGE_CATEGORY'
                    ? `Purge All Test ${actionModal.category?.replace('_', ' ')}`
                    : 'Permanently Delete Test Record'}
                </h3>
              </div>
              <button
                onClick={closeModal}
                disabled={isProcessing}
                className="p-1 text-white/80 hover:text-white rounded-md transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {modalError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {actionModal.type === 'DELETE_ALL' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    You are about to permanently purge <span className="font-bold text-rose-600 font-mono">{summary?.totalTestItems || 0}</span> test entities and assets across all categories.
                  </p>
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5 font-medium text-slate-700">
                    <div className="flex justify-between">
                      <span>• Test Students:</span>
                      <span className="font-bold">{summary?.studentsCount || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>• Test Institutes:</span>
                      <span className="font-bold">{summary?.institutesCount || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>• Test Orders & Payments:</span>
                      <span className="font-bold">{(summary?.ordersCount || 0) + (summary?.transactionsCount || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>• Test Evaluations & PDF Uploads:</span>
                      <span className="font-bold">{(summary?.evaluationsCount || 0) + (summary?.filesCount || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>• Test Promo Redemptions:</span>
                      <span className="font-bold">{summary?.promoRedemptionsCount || 0}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 italic">
                    Normal student platform accounts and statutory transactions are strictly preserved.
                  </p>
                </div>
              )}

              {actionModal.type === 'PURGE_CATEGORY' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    You are about to permanently delete all test records in the category <span className="font-bold text-rose-600 font-mono">{actionModal.category}</span>.
                  </p>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                    <span>This action is immediate, irreversible, and logged in the immutable audit trail.</span>
                  </div>
                </div>
              )}

              {actionModal.type === 'DELETE_RECORD' && (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <p className="text-xs font-bold text-slate-900">{actionModal.recordName}</p>
                    <p className="text-[11px] font-mono text-slate-500">{actionModal.recordDetails}</p>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    This test record and its associated testing data will be permanently wiped from the database.
                  </p>
                </div>
              )}

              {/* Confirmation Input Prompt */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  To confirm, type{' '}
                  <span className="font-mono bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200 font-bold select-all">
                    {actionModal.type === 'DELETE_ALL' ? 'DELETE ALL TEST DATA' : 'DELETE'}
                  </span>{' '}
                  below:
                </label>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder={actionModal.type === 'DELETE_ALL' ? 'DELETE ALL TEST DATA' : 'DELETE'}
                  disabled={isProcessing}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-rose-500 bg-slate-50"
                  autoFocus
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                onClick={closeModal}
                disabled={isProcessing}
                className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteModalAction}
                disabled={
                  isProcessing ||
                  (actionModal.type === 'DELETE_ALL'
                    ? confirmInput.trim() !== 'DELETE ALL TEST DATA'
                    : confirmInput.trim() !== 'DELETE')
                }
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer shadow-xs"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Purging...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    {actionModal.type === 'DELETE_ALL'
                      ? 'Confirm Full Test Purge'
                      : actionModal.type === 'PURGE_CATEGORY'
                      ? 'Confirm Category Purge'
                      : 'Delete Record'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
