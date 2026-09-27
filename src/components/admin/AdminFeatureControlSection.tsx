import React, { useState, useEffect } from 'react';
import {
  Sliders,
  CheckCircle2,
  AlertCircle,
  Clock,
  Wrench,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  Mail,
  UserCheck,
  ShieldCheck,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { featureApi, FeatureWithTesters, FeatureStatus } from '../../api/featureClient.js';
import { formatDateTimeIST } from '../../utils/timezone.js';

export const AdminFeatureControlSection: React.FC = () => {
  const [features, setFeatures] = useState<FeatureWithTesters[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Editing state per feature
  const [pendingMessages, setPendingMessages] = useState<Record<string, string>>({});
  const [newTesterEmails, setNewTesterEmails] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadFeatures();
  }, []);

  const loadFeatures = async () => {
    try {
      setErrorMsg('');
      const list = await featureApi.getAllFeatures();
      setFeatures(list);
      // Initialize pending message state
      const msgMap: Record<string, string> = {};
      list.forEach((f) => {
        msgMap[f.feature_key] = f.student_message || '';
      });
      setPendingMessages(msgMap);
    } catch (err: any) {
      console.error('Failed to load features:', err);
      setErrorMsg(err.message || 'Failed to load feature controls');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadFeatures();
  };

  const handleStatusChange = async (featureKey: string, newStatus: FeatureStatus) => {
    setActionLoading((prev) => ({ ...prev, [featureKey]: true }));
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const updated = await featureApi.updateFeature(featureKey, { status: newStatus });
      setFeatures((prev) =>
        prev.map((f) => (f.feature_key === featureKey ? { ...f, status: updated.status, updated_at: updated.updated_at, updated_by: updated.updated_by } : f))
      );
      setSuccessMsg(`Status for '${updated.feature_name}' updated to ${newStatus}.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update feature status');
    } finally {
      setActionLoading((prev) => ({ ...prev, [featureKey]: false }));
    }
  };

  const handleSaveMessage = async (featureKey: string) => {
    setActionLoading((prev) => ({ ...prev, [featureKey]: true }));
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const msg = pendingMessages[featureKey] || '';
      const updated = await featureApi.updateFeature(featureKey, { studentMessage: msg });
      setFeatures((prev) =>
        prev.map((f) => (f.feature_key === featureKey ? { ...f, student_message: updated.student_message, updated_at: updated.updated_at, updated_by: updated.updated_by } : f))
      );
      setSuccessMsg(`Feature settings updated successfully.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save student message');
    } finally {
      setActionLoading((prev) => ({ ...prev, [featureKey]: false }));
    }
  };

  const handleAddTester = async (featureKey: string) => {
    const email = (newTesterEmails[featureKey] || '').trim();
    if (!email) return;

    setActionLoading((prev) => ({ ...prev, [`${featureKey}_tester`]: true }));
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const newTester = await featureApi.addTester(featureKey, email);
      setFeatures((prev) =>
        prev.map((f) => {
          if (f.feature_key === featureKey) {
            return {
              ...f,
              testers: [...f.testers, newTester].sort((a, b) => a.email.localeCompare(b.email)),
            };
          }
          return f;
        })
      );
      setNewTesterEmails((prev) => ({ ...prev, [featureKey]: '' }));
      setSuccessMsg(`Tester account '${newTester.email}' added successfully.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add tester');
    } finally {
      setActionLoading((prev) => ({ ...prev, [`${featureKey}_tester`]: false }));
    }
  };

  const handleRemoveTester = async (featureKey: string, testerId: string, testerEmail: string) => {
    if (!window.confirm(`Are you sure you want to remove '${testerEmail}' from the testing allowlist?`)) {
      return;
    }

    setActionLoading((prev) => ({ ...prev, [`${featureKey}_rm_${testerId}`]: true }));
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await featureApi.removeTester(featureKey, testerId);
      setFeatures((prev) =>
        prev.map((f) => {
          if (f.feature_key === featureKey) {
            return {
              ...f,
              testers: f.testers.filter((t) => t.id !== testerId),
            };
          }
          return f;
        })
      );
      setSuccessMsg(`Tester account '${testerEmail}' removed successfully.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to remove tester');
    } finally {
      setActionLoading((prev) => ({ ...prev, [`${featureKey}_rm_${testerId}`]: false }));
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-semibold text-slate-500">Loading Centralized Feature Controls...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Central Access Gate</span>
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Feature Control & Student Access System
            </h2>
            <p className="text-xs text-slate-500 max-w-2xl">
              Dynamically enable, disable, or gate student features into limited testing without modifying code or restarting servers. Backend authorization strictly enforces access across all API endpoints.
            </p>
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="self-start sm:self-center inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh State</span>
          </button>
        </div>

        {/* Global Alert Banners */}
        {successMsg && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="font-semibold">{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-semibold">{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Feature Cards Grid */}
      <div className="space-y-5">
        {features.map((feature) => {
          const isArena = feature.feature_key === 'mcq_arena';
          const isBusy = !!actionLoading[feature.feature_key];

          return (
            <div
              key={feature.feature_key}
              className={`bg-white border rounded-xl shadow-xs transition overflow-hidden ${
                isArena ? 'border-blue-300 ring-2 ring-blue-500/10' : 'border-slate-200'
              }`}
            >
              {/* Feature Header Bar */}
              <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50/50 to-white flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border shadow-xs ${
                      feature.status === 'ENABLED'
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        : feature.status === 'TESTING'
                        ? 'bg-amber-50 text-amber-600 border-amber-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {feature.status === 'ENABLED' ? (
                      <CheckCircle2 className="w-6 h-6" />
                    ) : feature.status === 'TESTING' ? (
                      <Clock className="w-6 h-6" />
                    ) : (
                      <Wrench className="w-6 h-6" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-base font-bold text-slate-900">{feature.feature_name}</h3>
                      <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                        {feature.feature_key}
                      </span>
                      {isArena && (
                        <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                          Core Feature
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Current student status:{' '}
                      <span
                        className={`font-bold uppercase ${
                          feature.status === 'ENABLED'
                            ? 'text-emerald-700'
                            : feature.status === 'TESTING'
                            ? 'text-amber-700'
                            : 'text-slate-700'
                        }`}
                      >
                        {feature.status === 'ENABLED'
                          ? 'Publicly Enabled'
                          : feature.status === 'TESTING'
                          ? 'Limited Testing'
                          : 'Maintenance / Disabled'}
                      </span>
                    </p>
                  </div>
                </div>

                {/* 3-State Control Toggle Buttons */}
                <div className="flex items-center gap-1.5 p-1 bg-slate-100 border border-slate-200 rounded-xl self-start md:self-center">
                  <button
                    onClick={() => handleStatusChange(feature.feature_key, 'ENABLED')}
                    disabled={isBusy || feature.status === 'ENABLED'}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed ${
                      feature.status === 'ENABLED'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Enabled</span>
                  </button>

                  <button
                    onClick={() => handleStatusChange(feature.feature_key, 'TESTING')}
                    disabled={isBusy || feature.status === 'TESTING'}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed ${
                      feature.status === 'TESTING'
                        ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Testing</span>
                  </button>

                  <button
                    onClick={() => handleStatusChange(feature.feature_key, 'DISABLED')}
                    disabled={isBusy || feature.status === 'DISABLED'}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed ${
                      feature.status === 'DISABLED'
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Disabled</span>
                  </button>
                </div>
              </div>

              {/* Feature Content Body */}
              <div className="p-5 space-y-5">
                {/* 1. TESTING ALLOWLIST SECTION */}
                {feature.status === 'TESTING' && (
                  <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/70 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-amber-700" />
                        <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                          Allowed Tester Accounts ({feature.testers.length})
                        </h4>
                      </div>
                      <span className="text-[11px] text-amber-800">
                        Only these signed-in student emails can access {feature.feature_name}
                      </span>
                    </div>

                    {/* Tester Email List */}
                    <div className="flex flex-wrap gap-2">
                      {feature.testers.length === 0 ? (
                        <p className="text-xs text-amber-800 italic">
                          No testers currently allowlisted. All normal students will see the testing screen.
                        </p>
                      ) : (
                        feature.testers.map((t) => (
                          <div
                            key={t.id}
                            className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-white border border-amber-300 shadow-2xs text-xs font-medium text-slate-800"
                          >
                            <Mail className="w-3.5 h-3.5 text-amber-600" />
                            <span>{t.email}</span>
                            <button
                              onClick={() => handleRemoveTester(feature.feature_key, t.id, t.email)}
                              disabled={actionLoading[`${feature.feature_key}_rm_${t.id}`]}
                              className="text-slate-400 hover:text-rose-600 transition p-0.5 rounded cursor-pointer"
                              title="Remove tester"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Add Tester Input */}
                    <div className="pt-2 flex flex-col sm:flex-row gap-2 max-w-md">
                      <input
                        type="email"
                        placeholder="student.tester@example.com"
                        value={newTesterEmails[feature.feature_key] || ''}
                        onChange={(e) =>
                          setNewTesterEmails((prev) => ({
                            ...prev,
                            [feature.feature_key]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddTester(feature.feature_key);
                          }
                        }}
                        className="flex-1 px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                      />
                      <button
                        onClick={() => handleAddTester(feature.feature_key)}
                        disabled={
                          actionLoading[`${feature.feature_key}_tester`] ||
                          !(newTesterEmails[feature.feature_key] || '').trim()
                        }
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition cursor-pointer disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Tester</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. STUDENT MESSAGE SECTION */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                      Student-Facing Message
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Displayed on the Feature Unavailable screen
                    </span>
                  </div>

                  <textarea
                    rows={2}
                    value={pendingMessages[feature.feature_key] ?? ''}
                    onChange={(e) =>
                      setPendingMessages((prev) => ({
                        ...prev,
                        [feature.feature_key]: e.target.value,
                      }))
                    }
                    placeholder="Enter custom development/maintenance message shown to unapproved students..."
                    className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                  />

                  <div className="flex items-center justify-between pt-1">
                    <div className="text-[11px] text-slate-400">
                      Last updated by <span className="font-semibold text-slate-600">{feature.updated_by || 'SYSTEM'}</span>{' '}
                      at {formatDateTimeIST(feature.updated_at || feature.created_at)}
                    </div>

                    <button
                      onClick={() => handleSaveMessage(feature.feature_key)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-blue-600 text-white font-bold text-xs transition shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
export default AdminFeatureControlSection;
