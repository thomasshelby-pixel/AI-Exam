import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client.js';
import {
  Database,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Award,
  Users,
  AlertCircle,
  FileCheck2,
  Calendar,
  X,
} from 'lucide-react';

interface TestDataPreview {
  success: boolean;
  testStudentsCount: number;
  testEvaluationsCount: number;
  testPromoRedemptionsCount: number;
  testUnusedCreditsCount: number;
  genuineStudentsCount: number;
  testStudents: Array<{
    id: string;
    email: string;
    full_name: string;
    role: string;
    status: string;
    is_test: number;
    test_marker: string;
    created_at: string;
  }>;
}

interface CleanupSummary {
  testAccountsDeleted: number;
  testEvaluationsDeleted: number;
  testPromoRedemptionsRemoved: number;
  promoSlotsRestored: number;
  testCreditsRemoved: number;
}

interface TestDataCleanupSectionProps {
  onDataCleaned?: () => void;
}

export function TestDataCleanupSection({ onDataCleaned }: TestDataCleanupSectionProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [preview, setPreview] = useState<TestDataPreview | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [cleaning, setCleaning] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [confirmInput, setConfirmInput] = useState<string>('');
  const [lastSummary, setLastSummary] = useState<CleanupSummary | null>(null);

  const fetchPreview = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const data = await apiRequest<TestDataPreview>('/api/admin/cleanup/test-data/preview');
      setPreview(data);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to fetch test data preview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreview();
  }, []);

  const handleExecuteCleanup = async () => {
    try {
      setCleaning(true);
      setErrorMsg('');
      const res = await apiRequest<{
        success: boolean;
        message: string;
        summary: CleanupSummary;
      }>('/api/admin/cleanup/test-data', {
        method: 'POST',
        body: JSON.stringify({ confirmation: 'CONFIRM_CLEAN_TEST_DATA' }),
      });

      setSuccessMsg(res.message);
      setLastSummary(res.summary);
      setShowConfirmModal(false);
      setConfirmInput('');
      await fetchPreview();
      if (onDataCleaned) {
        onDataCleaned();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to execute test data cleanup');
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">System Test & Demo Data Cleanup</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  Super Admin Only
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Permanently cleans explicit test accounts, seed runners, and sandbox evaluations while strictly protecting genuine production records.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={fetchPreview}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => {
                setConfirmInput('');
                setShowConfirmModal(true);
              }}
              disabled={loading || cleaning || (preview?.testStudentsCount === 0 && preview?.testEvaluationsCount === 0)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white transition shadow-xs cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clean Test & Demo Data
            </button>
          </div>
        </div>

        {/* Notifications */}
        {errorMsg && (
          <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {/* Production Safeguard Callout */}
      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-900 space-y-1">
          <p className="font-bold">Production Protection Guarantee</p>
          <p className="text-emerald-700 leading-relaxed">
            The cleanup engine scans only records explicitly tagged with <code className="px-1 py-0.5 bg-emerald-100/80 rounded font-mono text-[11px]">is_test = 1</code> and recognized test markers (such as automated runners and demo accounts). Genuine student accounts, payment audit trails, and student submissions are mathematically excluded and cannot be purged.
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold">Test Students</span>
            <Users className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-black text-rose-600 font-mono">
            {loading ? '...' : preview?.testStudentsCount ?? 0}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">Marked test accounts</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold">Test Evaluations</span>
            <FileCheck2 className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-600 font-mono">
            {loading ? '...' : preview?.testEvaluationsCount ?? 0}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">Simulated test reviews</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold">Test Promo Uses</span>
            <Sparkles className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-black text-blue-600 font-mono">
            {loading ? '...' : preview?.testPromoRedemptionsCount ?? 0}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">Slots to restore to promos</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold">Test Credits</span>
            <Award className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-black text-indigo-600 font-mono">
            {loading ? '...' : preview?.testUnusedCreditsCount ?? 0}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">Allocated test balance</p>
        </div>

        <div className="bg-white rounded-xl border border-emerald-200 p-4 shadow-xs bg-emerald-50/20">
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-[11px] font-semibold">Genuine Students</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-700 font-mono">
            {loading ? '...' : preview?.genuineStudentsCount ?? 0}
          </p>
          <p className="text-[10px] text-emerald-600 font-bold mt-1">Protected Production</p>
        </div>
      </div>

      {/* Last Cleanup Summary Banner */}
      {lastSummary && (
        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-xs">
          <h3 className="text-xs font-bold text-blue-900 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
            Last Execution Summary
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div className="bg-slate-50 p-2.5 rounded-lg">
              <span className="text-slate-500 block text-[10px]">Accounts Purged</span>
              <span className="font-bold text-slate-900 text-sm font-mono">{lastSummary.testAccountsDeleted}</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg">
              <span className="text-slate-500 block text-[10px]">Evaluations Deleted</span>
              <span className="font-bold text-slate-900 text-sm font-mono">{lastSummary.testEvaluationsDeleted}</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg">
              <span className="text-slate-500 block text-[10px]">Redemptions Cleared</span>
              <span className="font-bold text-slate-900 text-sm font-mono">{lastSummary.testPromoRedemptionsRemoved}</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg">
              <span className="text-slate-500 block text-[10px]">Promo Slots Restored</span>
              <span className="font-bold text-emerald-600 text-sm font-mono">+{lastSummary.promoSlotsRestored}</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg">
              <span className="text-slate-500 block text-[10px]">Test Credits Cleared</span>
              <span className="font-bold text-slate-900 text-sm font-mono">{lastSummary.testCreditsRemoved}</span>
            </div>
          </div>
        </div>
      )}

      {/* Detected Test Accounts Table */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Detected Test & Sandbox Accounts</h3>
            <p className="text-xs text-slate-500">Explicitly identified accounts eligible for maintenance cleanup</p>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {preview?.testStudents.length || 0} candidate accounts
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-300" />
            Analyzing database test records...
          </div>
        ) : !preview?.testStudents || preview.testStudents.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
            <p className="font-bold text-slate-800">Database is Clean</p>
            <p className="text-slate-400 mt-0.5">No explicit test or demo accounts found. All registered student data is production-genuine.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="py-2.5 px-3 font-bold">User</th>
                  <th className="py-2.5 px-3 font-bold">Marker / Tag</th>
                  <th className="py-2.5 px-3 font-bold">Status</th>
                  <th className="py-2.5 px-3 font-bold">Created On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.testStudents.map((st) => (
                  <tr key={st.id} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-3">
                      <p className="font-bold text-slate-900">{st.full_name}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{st.email}</p>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        {st.test_marker || 'is_test=1'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {st.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      {new Date(st.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 text-slate-800 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-rose-600">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-sm font-bold text-slate-900">Confirm Test Data Cleanup</h3>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p>
                You are about to execute a transactional cleanup of all explicit development, sandbox, and demo test data:
              </p>

              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3.5 space-y-1.5 text-rose-900">
                <p className="font-bold flex items-center gap-1.5 text-xs">
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  Planned Deletions:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-[11px]">
                  <li><strong>{preview?.testStudentsCount || 0}</strong> test student accounts</li>
                  <li><strong>{preview?.testEvaluationsCount || 0}</strong> test evaluations & submissions</li>
                  <li><strong>{preview?.testPromoRedemptionsCount || 0}</strong> test promo redemptions (will restore available slots on campaigns)</li>
                  <li><strong>{preview?.testUnusedCreditsCount || 0}</strong> test credit balances & ledgers</li>
                </ul>
              </div>

              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-emerald-900 text-[11px]">
                <p className="font-bold">Protected Production Data:</p>
                <p>
                  <strong>{preview?.genuineStudentsCount || 0} genuine production students</strong> and all genuine financial/payment records will remain completely untouched.
                </p>
              </div>

              <div className="pt-2">
                <label className="block font-bold text-slate-700 mb-1">
                  Type <span className="font-mono text-rose-600">CLEAN</span> to confirm:
                </label>
                <input
                  type="text"
                  placeholder="CLEAN"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono tracking-wider focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={cleaning}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg border border-slate-200 bg-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteCleanup}
                disabled={confirmInput.trim().toUpperCase() !== 'CLEAN' || cleaning}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                {cleaning && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Execute Test Cleanup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
