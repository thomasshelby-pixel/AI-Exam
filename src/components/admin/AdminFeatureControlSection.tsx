import React, { useState, useEffect } from 'react';
import {
  Sliders,
  CheckCircle2,
  AlertCircle,
  Clock,
  Wrench,
  Rocket,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  Mail,
  UserCheck,
  ShieldCheck,
  Sparkles,
  Layers,
  X,
  Eye,
  EyeOff,
  Filter,
} from 'lucide-react';
import {
  featureApi,
  FeatureWithTesters,
  FeatureStatus,
  FeatureApplication,
} from '../../api/featureClient.js';
import { formatDateTimeIST } from '../../utils/timezone.js';

export const AdminFeatureControlSection: React.FC = () => {
  const [features, setFeatures] = useState<FeatureWithTesters[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Active application view filter ('ALL' | 'CHECKER' | 'MCQ_ARENA')
  const [selectedApp, setSelectedApp] = useState<'ALL' | 'CHECKER' | 'MCQ_ARENA'>('ALL');

  // Editing state per feature
  const [pendingMessages, setPendingMessages] = useState<Record<string, string>>({});
  const [newTesterEmails, setNewTesterEmails] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Add New Feature Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [addApp, setAddApp] = useState<FeatureApplication>('CHECKER');
  const [addName, setAddName] = useState<string>('');
  const [addKey, setAddKey] = useState<string>('');
  const [addDescription, setAddDescription] = useState<string>('');
  const [addInitialStatus, setAddInitialStatus] = useState<FeatureStatus>('COMING_SOON');
  const [addStudentMessage, setAddStudentMessage] = useState<string>('');
  const [addDisplayDashboard, setAddDisplayDashboard] = useState<boolean>(true);
  const [addDisplayOrder, setAddDisplayOrder] = useState<number>(0);
  const [addLoading, setAddLoading] = useState<boolean>(false);
  const [addError, setAddError] = useState<string>('');

  // In-App Status Confirmation Modal State (replaces blocked window.confirm)
  const [confirmStatusModal, setConfirmStatusModal] = useState<{
    isOpen: boolean;
    feature: FeatureWithTesters | null;
    targetStatus: FeatureStatus | null;
  }>({
    isOpen: false,
    feature: null,
    targetStatus: null,
  });

  // In-App Tester Removal Confirmation Modal State (replaces blocked window.confirm)
  const [confirmRemoveTesterModal, setConfirmRemoveTesterModal] = useState<{
    isOpen: boolean;
    feature: FeatureWithTesters | null;
    testerId: string;
    testerEmail: string;
  }>({
    isOpen: false,
    feature: null,
    testerId: '',
    testerEmail: '',
  });

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

  // Status Change flow with in-app confirmation modal
  const handleStatusClick = (feature: FeatureWithTesters, newStatus: FeatureStatus) => {
    if (feature.status === newStatus) {
      setSuccessMsg(`Feature '${feature.feature_name}' is already in ${newStatus} mode.`);
      setTimeout(() => setSuccessMsg(''), 2500);
      return;
    }

    setConfirmStatusModal({
      isOpen: true,
      feature,
      targetStatus: newStatus,
    });
  };

  const executeStatusChange = async (feature: FeatureWithTesters, newStatus: FeatureStatus) => {
    setActionLoading((prev) => ({ ...prev, [feature.feature_key]: true }));
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const updated = await featureApi.updateFeature(feature.feature_key, {
        status: newStatus,
        application: feature.application,
      });
      setFeatures((prev) =>
        prev.map((f) =>
          f.id === feature.id || (f.feature_key === feature.feature_key && f.application === feature.application)
            ? { ...f, status: updated.status, updated_at: updated.updated_at, updated_by: updated.updated_by }
            : f
        )
      );
      setSuccessMsg(`Status for '${updated.feature_name}' successfully updated to ${newStatus}.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      setConfirmStatusModal({ isOpen: false, feature: null, targetStatus: null });
    } catch (err: any) {
      console.error('Failed to update feature status:', err);
      setErrorMsg(err.message || 'Unable to update feature status. Please try again.');
    } finally {
      setActionLoading((prev) => ({ ...prev, [feature.feature_key]: false }));
    }
  };

  const handleSaveMessage = async (feature: FeatureWithTesters) => {
    setActionLoading((prev) => ({ ...prev, [feature.feature_key]: true }));
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const msg = pendingMessages[feature.feature_key] || '';
      const updated = await featureApi.updateFeature(feature.feature_key, {
        studentMessage: msg,
        application: feature.application,
      });
      setFeatures((prev) =>
        prev.map((f) =>
          f.id === feature.id
            ? { ...f, student_message: updated.student_message, updated_at: updated.updated_at, updated_by: updated.updated_by }
            : f
        )
      );
      setSuccessMsg(`Feature settings updated successfully.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save student message');
    } finally {
      setActionLoading((prev) => ({ ...prev, [feature.feature_key]: false }));
    }
  };

  const handleToggleVisibility = async (feature: FeatureWithTesters) => {
    const nextVal = !(Number(feature.display_in_student_dashboard) === 1);
    setActionLoading((prev) => ({ ...prev, [`${feature.feature_key}_vis`]: true }));
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const updated = await featureApi.updateFeature(feature.feature_key, {
        displayInStudentDashboard: nextVal,
        application: feature.application,
      });
      setFeatures((prev) =>
        prev.map((f) =>
          f.id === feature.id
            ? { ...f, display_in_student_dashboard: updated.display_in_student_dashboard, updated_at: updated.updated_at, updated_by: updated.updated_by }
            : f
        )
      );
      setSuccessMsg(
        `Dashboard visibility for '${feature.feature_name}' set to ${nextVal ? 'Visible' : 'Hidden'}.`
      );
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update visibility');
    } finally {
      setActionLoading((prev) => ({ ...prev, [`${feature.feature_key}_vis`]: false }));
    }
  };

  const handleAddTester = async (feature: FeatureWithTesters) => {
    const email = (newTesterEmails[feature.feature_key] || '').trim();
    if (!email) return;

    setActionLoading((prev) => ({ ...prev, [`${feature.feature_key}_tester`]: true }));
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const newTester = await featureApi.addTester(feature.feature_key, email, feature.application);
      setFeatures((prev) =>
        prev.map((f) => {
          if (f.id === feature.id) {
            return {
              ...f,
              testers: [...f.testers, newTester].sort((a, b) => a.email.localeCompare(b.email)),
            };
          }
          return f;
        })
      );
      setNewTesterEmails((prev) => ({ ...prev, [feature.feature_key]: '' }));
      setSuccessMsg(`Tester account '${newTester.email}' added to ${feature.feature_name}.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add tester');
    } finally {
      setActionLoading((prev) => ({ ...prev, [`${feature.feature_key}_tester`]: false }));
    }
  };

  const handleRemoveTesterClick = (feature: FeatureWithTesters, testerId: string, testerEmail: string) => {
    setConfirmRemoveTesterModal({
      isOpen: true,
      feature,
      testerId,
      testerEmail,
    });
  };

  const executeRemoveTester = async () => {
    const { feature, testerId, testerEmail } = confirmRemoveTesterModal;
    if (!feature || !testerId) return;

    setActionLoading((prev) => ({ ...prev, [`${feature.feature_key}_rm_${testerId}`]: true }));
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await featureApi.removeTester(feature.feature_key, testerId, feature.application);
      setFeatures((prev) =>
        prev.map((f) => {
          if (f.id === feature.id) {
            return {
              ...f,
              testers: f.testers.filter((t) => t.id !== testerId),
            };
          }
          return f;
        })
      );
      setSuccessMsg(`Tester account '${testerEmail}' removed.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      setConfirmRemoveTesterModal({ isOpen: false, feature: null, testerId: '', testerEmail: '' });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to remove tester');
    } finally {
      setActionLoading((prev) => ({ ...prev, [`${feature.feature_key}_rm_${testerId}`]: false }));
    }
  };

  // Submit Add Feature
  const handleCreateFeatureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    if (!addName.trim()) {
      setAddError('Feature Name is required.');
      return;
    }
    if (!addKey.trim()) {
      setAddError('Feature Key is required.');
      return;
    }

    setAddLoading(true);
    try {
      const created = await featureApi.createFeature({
        application: addApp,
        featureKey: addKey.toLowerCase().trim(),
        featureName: addName.trim(),
        description: addDescription.trim(),
        status: addInitialStatus,
        studentMessage: addStudentMessage.trim(),
        displayInStudentDashboard: addDisplayDashboard,
        displayOrder: Number(addDisplayOrder) || 0,
      });

      setFeatures((prev) => [...prev, created]);
      setPendingMessages((prev) => ({
        ...prev,
        [created.feature_key]: created.student_message || '',
      }));
      setSuccessMsg(`Feature '${created.feature_name}' registered successfully.`);
      setIsAddModalOpen(false);

      // Reset form
      setAddName('');
      setAddKey('');
      setAddDescription('');
      setAddInitialStatus('COMING_SOON');
      setAddStudentMessage('');
      setAddDisplayDashboard(true);
      setAddDisplayOrder(0);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setAddError(err.message || 'Failed to register new feature');
    } finally {
      setAddLoading(false);
    }
  };

  const filteredFeatures = features.filter((f) => {
    if (selectedApp === 'ALL') return true;
    return f.application === selectedApp;
  });

  const checkerFeatures = features.filter((f) => f.application === 'CHECKER');
  const mcqFeatures = features.filter((f) => f.application === 'MCQ_ARENA');

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
              <span>Unified Platform Gate</span>
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Centralized Feature Control & Student Access System
            </h2>
            <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
              Control student-facing features across <strong>CA Exam Checker AI</strong> and{' '}
              <strong>MCQ Arena</strong> from one unified dashboard. Dynamically transition between{' '}
              <span className="font-semibold text-emerald-600">Enabled</span>,{' '}
              <span className="font-semibold text-amber-600">Testing</span>,{' '}
              <span className="font-semibold text-rose-600">Maintenance</span>, and{' '}
              <span className="font-semibold text-sky-600">Coming Soon</span> without code changes or redeployments.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Feature</span>
            </button>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Global Notifications */}
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

        {/* Application Filter Tabs */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2">
          <button
            onClick={() => setSelectedApp('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              selectedApp === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All Features ({features.length})
          </button>
          <button
            onClick={() => setSelectedApp('CHECKER')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              selectedApp === 'CHECKER'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
            }`}
          >
            CA Exam Checker AI ({checkerFeatures.length})
          </button>
          <button
            onClick={() => setSelectedApp('MCQ_ARENA')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              selectedApp === 'MCQ_ARENA'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
            }`}
          >
            MCQ Arena ({mcqFeatures.length})
          </button>
        </div>
      </div>

      {/* Feature Cards List */}
      <div className="space-y-5">
        {filteredFeatures.length === 0 ? (
          <div className="p-8 bg-white border border-slate-200 rounded-xl text-center text-slate-500 text-xs">
            No features found for the selected application.
          </div>
        ) : (
          filteredFeatures.map((feature) => {
            const isBusy = !!actionLoading[feature.feature_key];
            const isChecker = feature.application === 'CHECKER';
            const isDashboardVisible = Number(feature.display_in_student_dashboard) === 1;

            return (
              <div
                key={feature.id}
                className={`bg-white border rounded-xl shadow-xs transition overflow-hidden ${
                  feature.status === 'ENABLED'
                    ? 'border-emerald-200/80'
                    : feature.status === 'TESTING'
                    ? 'border-amber-300 ring-2 ring-amber-500/10'
                    : feature.status === 'COMING_SOON'
                    ? 'border-sky-300'
                    : 'border-slate-200'
                }`}
              >
                {/* Feature Header Bar */}
                <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50/60 to-white flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-3.5">
                    {/* Status Icon Indicator */}
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border shadow-xs ${
                        feature.status === 'ENABLED'
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                          : feature.status === 'TESTING'
                          ? 'bg-amber-50 text-amber-600 border-amber-200'
                          : feature.status === 'COMING_SOON'
                          ? 'bg-sky-50 text-sky-600 border-sky-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {feature.status === 'ENABLED' ? (
                        <CheckCircle2 className="w-6 h-6" />
                      ) : feature.status === 'TESTING' ? (
                        <Clock className="w-6 h-6" />
                      ) : feature.status === 'COMING_SOON' ? (
                        <Rocket className="w-6 h-6" />
                      ) : (
                        <Wrench className="w-6 h-6" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            isChecker
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          }`}
                        >
                          {isChecker ? 'CA EXAM CHECKER AI' : 'MCQ ARENA'}
                        </span>
                        <h3 className="text-base font-bold text-slate-900">{feature.feature_name}</h3>
                        <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                          {feature.feature_key}
                        </span>
                      </div>

                      {feature.description && (
                        <p className="text-xs text-slate-500 mt-0.5">{feature.description}</p>
                      )}

                      <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs">
                        <span className="text-slate-500">
                          Current status:{' '}
                          <span
                            className={`font-bold uppercase ${
                              feature.status === 'ENABLED'
                                ? 'text-emerald-700'
                                : feature.status === 'TESTING'
                                ? 'text-amber-700'
                                : feature.status === 'COMING_SOON'
                                ? 'text-sky-700'
                                : 'text-slate-700'
                            }`}
                          >
                            {feature.status === 'ENABLED'
                              ? '🟢 Enabled'
                              : feature.status === 'TESTING'
                              ? '🟡 Limited Testing'
                              : feature.status === 'COMING_SOON'
                              ? '🔵 Coming Soon'
                              : '🔴 Maintenance / Disabled'}
                          </span>
                        </span>

                        <span className="text-slate-300">•</span>

                        <button
                          type="button"
                          onClick={() => handleToggleVisibility(feature)}
                          disabled={actionLoading[`${feature.feature_key}_vis`]}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
                        >
                          {isDashboardVisible ? (
                            <>
                              <Eye className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Visible in Student Dashboard</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-slate-400">Hidden from Dashboard</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 4-State Control Toggle Buttons */}
                  <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl self-start md:self-center">
                    <button
                      type="button"
                      onClick={() => handleStatusClick(feature, 'ENABLED')}
                      disabled={isBusy}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        feature.status === 'ENABLED'
                          ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-400/50'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Enabled</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStatusClick(feature, 'TESTING')}
                      disabled={isBusy}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        feature.status === 'TESTING'
                          ? 'bg-amber-500 text-slate-950 font-black shadow-xs ring-2 ring-amber-300/50'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Testing</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStatusClick(feature, 'DISABLED')}
                      disabled={isBusy}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        feature.status === 'DISABLED'
                          ? 'bg-rose-700 text-white shadow-xs ring-2 ring-rose-400/50'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                      }`}
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      <span>Maintenance</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStatusClick(feature, 'COMING_SOON')}
                      disabled={isBusy}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        feature.status === 'COMING_SOON'
                          ? 'bg-sky-600 text-white shadow-xs ring-2 ring-sky-400/50'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                      }`}
                    >
                      <Rocket className="w-3.5 h-3.5" />
                      <span>Coming Soon</span>
                    </button>
                  </div>
                </div>

                {/* Feature Body */}
                <div className="p-5 space-y-4">
                  {/* 1. TESTING ALLOWLIST SECTION (Active when in TESTING mode) */}
                  {feature.status === 'TESTING' && (
                    <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-amber-700" />
                          <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                            Feature-Specific Allowed Testers ({feature.testers.length})
                          </h4>
                        </div>
                        <span className="text-[11px] text-amber-800">
                          Strictly isolated: tester accounts here only unlock {feature.feature_name}
                        </span>
                      </div>

                      {/* Tester Accounts Chips */}
                      <div className="flex flex-wrap gap-2">
                        {feature.testers.length === 0 ? (
                          <p className="text-xs text-amber-800 italic">
                            No testers currently allowlisted. All normal students see the Limited Testing screen.
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
                                type="button"
                                onClick={() => handleRemoveTesterClick(feature, t.id, t.email)}
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
                          placeholder="tester.account@example.com"
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
                              handleAddTester(feature);
                            }
                          }}
                          className="flex-1 px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                        />
                        <button
                          onClick={() => handleAddTester(feature)}
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
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                        Student-Facing Message
                      </label>
                      <span className="text-[11px] text-slate-400">
                        Shown to students when feature is unavailable or in testing
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
                      placeholder="Enter custom development/maintenance/coming-soon message..."
                      className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                    />

                    <div className="flex items-center justify-between pt-1">
                      <div className="text-[11px] text-slate-400">
                        Last updated by <span className="font-semibold text-slate-600">{feature.updated_by || 'SYSTEM'}</span>{' '}
                        at {formatDateTimeIST(feature.updated_at || feature.created_at)}
                      </div>

                      <button
                        onClick={() => handleSaveMessage(feature)}
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
          })
        )}
      </div>

      {/* 3. ADD NEW FEATURE MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Register New Feature</h3>
                <p className="text-xs text-slate-500">Configure access controls for a platform feature</p>
              </div>
            </div>

            {addError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleCreateFeatureSubmit} className="space-y-4">
              {/* Application Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Application *
                </label>
                <select
                  value={addApp}
                  onChange={(e) => setAddApp(e.target.value as FeatureApplication)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                >
                  <option value="CHECKER">CA Exam Checker AI</option>
                  <option value="MCQ_ARENA">MCQ Arena</option>
                </select>
              </div>

              {/* Feature Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Feature Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Performance Analysis"
                  value={addName}
                  onChange={(e) => {
                    setAddName(e.target.value);
                    if (!addKey) {
                      // Auto-suggest key
                      const suggested = (addApp === 'CHECKER' ? 'checker_' : 'mcq_') +
                        e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
                      setAddKey(suggested);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  required
                />
              </div>

              {/* Feature Key */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Feature Key * (Unique Identifier)
                </label>
                <input
                  type="text"
                  placeholder="e.g. checker_performance_analysis"
                  value={addKey}
                  onChange={(e) => setAddKey(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Lowercase alphanumeric with underscores/hyphens. Must be unique per application.
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="Brief summary of what this feature does"
                  value={addDescription}
                  onChange={(e) => setAddDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              {/* Initial Status */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Initial Status
                </label>
                <select
                  value={addInitialStatus}
                  onChange={(e) => setAddInitialStatus(e.target.value as FeatureStatus)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                >
                  <option value="COMING_SOON">🔵 Coming Soon (Default Recommended)</option>
                  <option value="TESTING">🟡 Testing (Allowlisted Testers Only)</option>
                  <option value="DISABLED">🔴 Maintenance / Disabled</option>
                  <option value="ENABLED">🟢 Enabled (Publicly Available)</option>
                </select>
              </div>

              {/* Student Message */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Student Message
                </label>
                <textarea
                  rows={2}
                  placeholder="Custom message shown to students when feature is unavailable..."
                  value={addStudentMessage}
                  onChange={(e) => setAddStudentMessage(e.target.value)}
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              {/* Display in Student Dashboard */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div>
                  <p className="text-xs font-bold text-slate-800">Display in Student Dashboard</p>
                  <p className="text-[11px] text-slate-500">Show card or navigation entry in student views</p>
                </div>
                <input
                  type="checkbox"
                  checked={addDisplayDashboard}
                  onChange={(e) => setAddDisplayDashboard(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
              </div>

              {/* Modal Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {addLoading ? 'Saving...' : 'Save Feature'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STATUS CHANGE CONFIRMATION MODAL */}
      {confirmStatusModal.isOpen && confirmStatusModal.feature && confirmStatusModal.targetStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-300">
                  {confirmStatusModal.feature.application === 'CHECKER' ? 'CA Exam Checker AI' : 'MCQ Arena'}
                </span>
                <span className="text-xs font-bold text-slate-700 truncate max-w-[200px]">
                  {confirmStatusModal.feature.feature_name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setConfirmStatusModal({ isOpen: false, feature: null, targetStatus: null })}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-bold text-slate-900">
                {confirmStatusModal.targetStatus === 'ENABLED' && 'Enable this feature for eligible students?'}
                {confirmStatusModal.targetStatus === 'TESTING' && (
                  <>
                    Move this feature to Testing?
                    <span className="block text-xs font-normal text-slate-600 mt-1">
                      Only approved testers will be able to access it.
                    </span>
                  </>
                )}
                {confirmStatusModal.targetStatus === 'DISABLED' && 'Disable this feature for students?'}
                {confirmStatusModal.targetStatus === 'COMING_SOON' && 'Mark this feature as Coming Soon?'}
              </h3>

              <p className="text-xs text-slate-500 leading-relaxed">
                {confirmStatusModal.targetStatus === 'ENABLED' &&
                  'All verified students will immediately gain full access to practice and evaluations.'}
                {confirmStatusModal.targetStatus === 'TESTING' &&
                  'Normal students not included in the allowlist will see the Limited Testing screen. All data remains safe.'}
                {confirmStatusModal.targetStatus === 'DISABLED' &&
                  'Students will see the maintenance/temporarily unavailable screen. All question banks, answer sheets, and submissions remain preserved.'}
                {confirmStatusModal.targetStatus === 'COMING_SOON' &&
                  'Students will see the coming soon announcement. Live sessions and heavy operations will be disabled.'}
              </p>
            </div>

            {/* Status Transition Pill */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">Current:</span>
              <span className="font-bold text-slate-700">{confirmStatusModal.feature.status}</span>
              <span className="text-slate-400 font-bold">➔</span>
              <span
                className={`font-black uppercase px-2.5 py-0.5 rounded-full ${
                  confirmStatusModal.targetStatus === 'ENABLED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : confirmStatusModal.targetStatus === 'TESTING'
                    ? 'bg-amber-100 text-amber-800'
                    : confirmStatusModal.targetStatus === 'DISABLED'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-sky-100 text-sky-800'
                }`}
              >
                {confirmStatusModal.targetStatus === 'DISABLED'
                  ? 'Maintenance'
                  : confirmStatusModal.targetStatus}
              </span>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmStatusModal({ isOpen: false, feature: null, targetStatus: null })}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeStatusChange(confirmStatusModal.feature!, confirmStatusModal.targetStatus!)}
                disabled={actionLoading[confirmStatusModal.feature.feature_key]}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5 ${
                  confirmStatusModal.targetStatus === 'ENABLED'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : confirmStatusModal.targetStatus === 'TESTING'
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black'
                    : confirmStatusModal.targetStatus === 'DISABLED'
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-sky-600 hover:bg-sky-500 text-white'
                }`}
              >
                {actionLoading[confirmStatusModal.feature.feature_key] ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <span>Confirm Status Change</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TESTER REMOVAL CONFIRMATION MODAL */}
      {confirmRemoveTesterModal.isOpen && confirmRemoveTesterModal.feature && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Remove Tester Account</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to remove <strong className="text-slate-900 font-mono">{confirmRemoveTesterModal.testerEmail}</strong> from the testing allowlist for <strong className="text-slate-900">{confirmRemoveTesterModal.feature.feature_name}</strong>?
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRemoveTesterModal({ isOpen: false, feature: null, testerId: '', testerEmail: '' })}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeRemoveTester}
                disabled={actionLoading[`${confirmRemoveTesterModal.feature.feature_key}_rm_${confirmRemoveTesterModal.testerId}`]}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {actionLoading[`${confirmRemoveTesterModal.feature.feature_key}_rm_${confirmRemoveTesterModal.testerId}`] ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <span>Remove Tester</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminFeatureControlSection;
