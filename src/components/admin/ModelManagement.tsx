import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client.js';
import {
  Brain,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
  Activity,
  Sliders,
  Play,
  ShieldCheck,
  Server,
  Layers,
  ArrowRight,
  ArrowDownUp,
  Cpu,
  Sparkles,
  Scale,
  Calculator,
  FileCheck2,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  RotateCcw,
  Check,
} from 'lucide-react';

interface ModelConfig {
  id: string;
  provider: 'gemini' | 'openai' | 'anthropic';
  display_name: string;
  role?: string;
  thinking_level?: 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';
  is_primary: number;
  fallback_order: number;
  temperature: number;
  top_p: number;
  max_tokens: number;
  is_enabled: number;
  status: string;
  health_stage?: string;
  health_details?: string;
  last_latency_ms: number | null;
  last_tested_at: string | null;
}

interface ProviderStatus {
  provider: string;
  name: string;
  configured: boolean;
  status?: string;
  configurationStatus?: string;
  modelsCount?: number;
  lastTestedAt?: string | null;
}

interface FallbackHierarchyItem {
  order: number;
  modelId: string;
  provider: 'gemini' | 'openai' | 'anthropic';
  role: string;
}

interface TelemetryData {
  overallStats?: {
    total_evaluations: number;
    total_fallbacks: number;
    global_avg_latency_ms: number;
    total_tokens_used: number;
  };
  providerStats?: Array<{
    provider: string;
    model: string;
    total_evaluations: number;
    successful_evaluations: number;
    fallback_count: number;
    avg_latency_ms: number;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_tokens: number;
  }>;
}

interface ModelManagementProps {
  onNotify?: (message: string, type: 'success' | 'error') => void;
}

export const ModelManagement: React.FC<ModelManagementProps> = ({ onNotify }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [providers, setProviders] = useState<Record<string, ProviderStatus>>({});
  const [fallbackHierarchy, setFallbackHierarchy] = useState<FallbackHierarchyItem[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ modelId: string; success: boolean; message: string; latency?: number; details?: any } | null>(null);

  const [runningBenchmarkId, setRunningBenchmarkId] = useState<string | null>(null);
  const [benchmarkData, setBenchmarkData] = useState<any | null>(null);
  const [runningConsistencyId, setRunningConsistencyId] = useState<string | null>(null);
  const [consistencyData, setConsistencyData] = useState<any | null>(null);

  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  const [fallbackChain, setFallbackChain] = useState<string[]>([]);
  const [savingFallback, setSavingFallback] = useState<boolean>(false);
  const [fallbackDirty, setFallbackDirty] = useState<boolean>(false);
  const [selectedNewFallback, setSelectedNewFallback] = useState<string>('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [modelsRes, telemetryRes, fallbackRes] = await Promise.all([
        apiRequest<{ models: ModelConfig[]; providerStatus: Record<string, ProviderStatus>; fallbackHierarchy?: FallbackHierarchyItem[] }>('/api/admin/models'),
        apiRequest<TelemetryData>('/api/admin/models/telemetry'),
        apiRequest<{ primaryModel: string; fallbackChain: string[] }>('/api/admin/models/fallback-order').catch(() => null),
      ]);

      setModels(modelsRes.models || []);
      setProviders(modelsRes.providerStatus || {});
      if (modelsRes.fallbackHierarchy) {
        setFallbackHierarchy(modelsRes.fallbackHierarchy);
      }
      if (fallbackRes?.fallbackChain && !fallbackDirty) {
        setFallbackChain(fallbackRes.fallbackChain);
      } else if (modelsRes.fallbackHierarchy && !fallbackDirty) {
        const chain = modelsRes.fallbackHierarchy.filter((h) => h.order > 0).map((h) => h.modelId);
        setFallbackChain(chain);
      }
      setTelemetry(telemetryRes || null);
    } catch (err: any) {
      const msg = err?.message || 'Failed to load model registry';
      onNotify?.(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const moveFallbackUp = (index: number) => {
    if (index <= 0) return;
    const newChain = [...fallbackChain];
    const temp = newChain[index];
    newChain[index] = newChain[index - 1];
    newChain[index - 1] = temp;
    setFallbackChain(newChain);
    setFallbackDirty(true);
  };

  const moveFallbackDown = (index: number) => {
    if (index >= fallbackChain.length - 1) return;
    const newChain = [...fallbackChain];
    const temp = newChain[index];
    newChain[index] = newChain[index + 1];
    newChain[index + 1] = temp;
    setFallbackChain(newChain);
    setFallbackDirty(true);
  };

  const removeFallback = (modelId: string) => {
    const newChain = fallbackChain.filter((id) => id !== modelId);
    setFallbackChain(newChain);
    setFallbackDirty(true);
  };

  const addFallback = () => {
    if (!selectedNewFallback || fallbackChain.includes(selectedNewFallback)) return;
    const primaryId = models.find((m) => m.is_primary === 1)?.id;
    if (selectedNewFallback === primaryId) {
      onNotify?.('Primary model cannot be added as a fallback', 'error');
      return;
    }
    const newChain = [...fallbackChain, selectedNewFallback];
    setFallbackChain(newChain);
    setSelectedNewFallback('');
    setFallbackDirty(true);
  };

  const handleSaveFallbackOrder = async () => {
    try {
      setSavingFallback(true);
      const res = await apiRequest<{ success: boolean; message: string; primaryModel: string; fallbackChain: string[] }>('/api/admin/models/fallback-order', {
        method: 'PUT',
        body: JSON.stringify({ fallbackChain }),
      });
      onNotify?.(res.message || 'Fallback order saved successfully', 'success');
      setFallbackDirty(false);
      await fetchData();
    } catch (err: any) {
      onNotify?.(err?.message || 'Failed to save fallback order', 'error');
    } finally {
      setSavingFallback(false);
    }
  };

  const handleResetDefaultFallbackOrder = async () => {
    try {
      setSavingFallback(true);
      const res = await apiRequest<{ success: boolean; message: string; primaryModel: string; fallbackChain: string[] }>('/api/admin/models/fallback-order/reset-default', {
        method: 'POST',
      });
      setFallbackChain(res.fallbackChain || []);
      setFallbackDirty(false);
      onNotify?.(res.message || 'Default fallback order restored successfully', 'success');
      await fetchData();
    } catch (err: any) {
      onNotify?.(err?.message || 'Failed to reset default fallback order', 'error');
    } finally {
      setSavingFallback(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSetPrimary = async (modelId: string) => {
    try {
      await apiRequest(`/api/admin/models/${encodeURIComponent(modelId)}`, {
        method: 'PUT',
        body: JSON.stringify({ is_primary: 1 }),
      });
      onNotify?.(`Primary evaluation model changed to ${modelId}`, 'success');
      await fetchData();
    } catch (err: any) {
      onNotify?.(err?.message || 'Failed to set primary model', 'error');
    }
  };

  const handleToggleEnabled = async (model: ModelConfig) => {
    if (model.is_primary) {
      onNotify?.('Cannot disable the active primary model', 'error');
      return;
    }
    try {
      const newEnabled = model.is_enabled ? 0 : 1;
      await apiRequest(`/api/admin/models/${encodeURIComponent(model.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ is_enabled: newEnabled }),
      });
      onNotify?.(`${model.display_name} ${newEnabled ? 'enabled' : 'disabled'} in fallback cascade`, 'success');
      await fetchData();
    } catch (err: any) {
      onNotify?.(err?.message || 'Failed to update model status', 'error');
    }
  };

  const handleTestConnection = async (modelId: string, stage: 'CONNECTIVITY' | 'INFERENCE' | 'EVALUATION_READINESS' = 'EVALUATION_READINESS') => {
    try {
      setTestingModelId(modelId);
      setTestResult(null);
      const res = await apiRequest<{ success: boolean; message: string; latencyMs?: number; details?: any; status?: string }>('/api/admin/models/test-connection', {
        method: 'POST',
        body: JSON.stringify({ modelId, stage }),
      });
      setTestResult({
        modelId,
        success: res.success,
        message: res.message,
        latency: res.latencyMs,
        details: res.details,
      });
      if (res.success) {
        onNotify?.(`${modelId} passed ${stage.replace(/_/g, ' ')} check (${res.latencyMs}ms)`, 'success');
      } else {
        onNotify?.(`Health check failed for ${modelId}: ${res.message}`, 'error');
      }
      await fetchData();
    } catch (err: any) {
      const msg = err?.message || 'Connection test failed';
      setTestResult({
        modelId,
        success: false,
        message: msg,
      });
      onNotify?.(msg, 'error');
    } finally {
      setTestingModelId(null);
    }
  };

  const handleRunBenchmark = async (modelId: string) => {
    try {
      setRunningBenchmarkId(modelId);
      setBenchmarkData(null);
      const res = await apiRequest<{ success: boolean; benchmark: any }>('/api/admin/models/benchmark-test', {
        method: 'POST',
        body: JSON.stringify({ modelId }),
      });
      if (res.success && res.benchmark) {
        setBenchmarkData(res.benchmark);
        onNotify?.(`Benchmark finished for ${modelId}: Grade ${res.benchmark.grade} (${res.benchmark.adherenceScore}% adherence)`, 'success');
      }
    } catch (err: any) {
      onNotify?.(err?.message || 'Benchmark test failed', 'error');
    } finally {
      setRunningBenchmarkId(null);
    }
  };

  const handleRunConsistency = async (modelId: string) => {
    try {
      setRunningConsistencyId(modelId);
      setConsistencyData(null);
      const res = await apiRequest<{ success: boolean; consistency: any }>('/api/admin/models/consistency-test', {
        method: 'POST',
        body: JSON.stringify({ modelId, runs: 5 }),
      });
      if (res.success && res.consistency) {
        setConsistencyData(res.consistency);
        onNotify?.(`5-Run Consistency for ${modelId}: ${res.consistency.consistencyRating} (Std Dev: ${res.consistency.standardDeviation})`, 'success');
      }
    } catch (err: any) {
      onNotify?.(err?.message || 'Consistency test failed', 'error');
    } finally {
      setRunningConsistencyId(null);
    }
  };

  const handleTestProvider = async (provider: string) => {
    try {
      setTestingProvider(provider);
      const res = await apiRequest<{ provider: string; results: any[]; allPassed: boolean }>('/api/admin/models/test-provider', {
        method: 'POST',
        body: JSON.stringify({ provider }),
      });

      if (res.allPassed) {
        onNotify?.(`All ${provider.toUpperCase()} models passed live health check!`, 'success');
      } else {
        const failedCount = res.results.filter((r) => !r.success).length;
        onNotify?.(`${failedCount} of ${res.results.length} ${provider.toUpperCase()} models failed check.`, 'error');
      }
      await fetchData();
    } catch (err: any) {
      onNotify?.(err?.message || `Failed to test ${provider} provider`, 'error');
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSaveParams = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModel) return;
    try {
      setSavingEdit(true);
      await apiRequest(`/api/admin/models/${encodeURIComponent(editingModel.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          role: editingModel.role,
          thinking_level: editingModel.thinking_level,
          temperature: editingModel.temperature,
          top_p: editingModel.top_p,
          max_tokens: editingModel.max_tokens,
          fallback_order: editingModel.fallback_order,
        }),
      });
      onNotify?.(`Updated parameters for ${editingModel.display_name}`, 'success');
      setEditingModel(null);
      await fetchData();
    } catch (err: any) {
      onNotify?.(err?.message || 'Failed to update parameters', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">CA Exam Checker Multi-Provider AI Architecture</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              Gemini + OpenAI + Anthropic
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Enterprise multi-provider evaluation orchestration for ICAI examination grading. Integrates Google Gemini 3.8 Flash, Anthropic Claude Opus/Sonnet 5, and OpenAI GPT-5.6 Sol/Terra with resilient 8-level automated fallback hierarchy and cross-check verification.
          </p>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition cursor-pointer self-start sm:self-auto flex items-center gap-1.5 text-xs font-semibold"
          title="Refresh models"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          <span>Refresh All</span>
        </button>
      </div>

      {/* Provider API Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Google Gemini Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 font-black text-sm">
                  G
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Google Gemini</h4>
                  <p className="text-[10px] text-slate-500">Primary CA Evaluation (Gemini 3.8 Flash)</p>
                </div>
              </div>
              {providers.gemini?.configured ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Active
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Inactive
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-600 mt-2.5 line-clamp-2">
              Primary production backbone powering handwritten OCR, step-marking, question-wise score calculation, and ICAI report generation.
            </p>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-600">
              <span className="text-slate-500">API Configuration:</span>
              <span className={`font-semibold ${providers.gemini?.configured ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}>
                {providers.gemini?.configured ? 'Configured' : 'Not configured'}
              </span>
            </div>
            <button
              onClick={() => handleTestProvider('gemini')}
              disabled={testingProvider === 'gemini' || !providers.gemini?.configured}
              className="px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold hover:bg-blue-100 disabled:opacity-50 text-[10px] cursor-pointer inline-flex items-center gap-1"
            >
              {testingProvider === 'gemini' ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Play className="w-2.5 h-2.5" />}
              Test All ({providers.gemini?.modelsCount || 5})
            </button>
          </div>
        </div>

        {/* Anthropic Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-800 font-black text-sm">
                  CL
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Anthropic Claude</h4>
                  <p className="text-[10px] text-slate-500">Claude Opus 5 & Claude Sonnet 5</p>
                </div>
              </div>
              {providers.anthropic?.configured ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Active
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                  Optional
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-600 mt-2.5 line-clamp-2">
              Specialized in deep legal statutory interpretation, Corporate & Economic Laws, Ind AS / AS accounting standards, and Advanced Auditing (SA).
            </p>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-600">
              <span className="text-slate-500">API Configuration:</span>
              <span className={`font-semibold ${providers.anthropic?.configured ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}>
                {providers.anthropic?.configured ? 'Configured' : 'Not configured'}
              </span>
            </div>
            <button
              onClick={() => handleTestProvider('anthropic')}
              disabled={testingProvider === 'anthropic' || !providers.anthropic?.configured}
              className="px-2 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold hover:bg-amber-100 disabled:opacity-50 text-[10px] cursor-pointer inline-flex items-center gap-1"
            >
              {testingProvider === 'anthropic' ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Play className="w-2.5 h-2.5" />}
              Test All ({providers.anthropic?.modelsCount || 2})
            </button>
          </div>
        </div>

        {/* OpenAI Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-black text-sm">
                  OA
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">OpenAI</h4>
                  <p className="text-[10px] text-slate-500">GPT-5.6 Sol & GPT-5.6 Terra</p>
                </div>
              </div>
              {providers.openai?.configured ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Active
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                  Optional
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-600 mt-2.5 line-clamp-2">
              State-of-the-art mathematical reasoning, numerical cross-checks in Direct/Indirect Tax, Costing, Capital Budgeting, and high-speed multimodal scanning.
            </p>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-600">
              <span className="text-slate-500">API Configuration:</span>
              <span className={`font-semibold ${providers.openai?.configured ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}>
                {providers.openai?.configured ? 'Configured' : 'Not configured'}
              </span>
            </div>
            <button
              onClick={() => handleTestProvider('openai')}
              disabled={testingProvider === 'openai' || !providers.openai?.configured}
              className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold hover:bg-emerald-100 disabled:opacity-50 text-[10px] cursor-pointer inline-flex items-center gap-1"
            >
              {testingProvider === 'openai' ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Play className="w-2.5 h-2.5" />}
              Test All ({providers.openai?.modelsCount || 2})
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Fallback Hierarchy Configuration */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              <h4 className="text-sm font-bold text-slate-900">
                Administrator-Controlled Fallback Hierarchy & Orchestration
              </h4>
              {fallbackDirty && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  Unsaved Changes
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Configure the exact sequential fallback order used by the examination evaluation engine. If a provider encounters rate limits or temporary downtime, execution automatically advances down this chain.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDefaultFallbackOrder}
              disabled={savingFallback}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              title="Restore documented default order"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Restore Default</span>
            </button>

            <button
              onClick={handleSaveFallbackOrder}
              disabled={savingFallback || !fallbackDirty}
              className="px-4 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingFallback ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>Save Fallback Order</span>
            </button>
          </div>
        </div>

        {/* Primary Model Showcase (Separated) */}
        {(() => {
          const primaryModel = models.find((m) => m.is_primary === 1);
          return (
            <div className="p-4 rounded-xl border-2 border-blue-500 bg-blue-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
                  <Zap className="w-5 h-5 fill-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-600 text-white">
                      Authoritative Primary Model
                    </span>
                    <span className="text-[11px] font-bold text-blue-900 uppercase">
                      {primaryModel?.provider}
                    </span>
                  </div>
                  <h5 className="text-sm font-bold text-slate-900 mt-0.5">
                    {primaryModel?.display_name || 'No Primary Selected'}
                  </h5>
                  <p className="text-xs text-slate-600">
                    {primaryModel?.role || 'Primary CA Answer Sheet Evaluation'} • Thinking Level: {primaryModel?.thinking_level || 'HIGH'}
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> First Responder
                </span>
              </div>
            </div>
          );
        })()}

        {/* Resulting Execution Flow Visual Breadcrumb */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
            Resulting Runtime Execution Flow:
          </span>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white flex items-center gap-1 shadow-2xs">
              <Zap className="w-3 h-3 fill-white" />
              Primary: {models.find((m) => m.is_primary === 1)?.display_name.split(' (')[0] || 'Primary'}
            </span>
            {fallbackChain.map((mId, idx) => {
              const mDesc = models.find((m) => m.id === mId);
              return (
                <React.Fragment key={mId}>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-800 flex items-center gap-1 shadow-2xs">
                    <span className="text-[10px] text-slate-400 font-mono">#{idx + 1}</span>
                    {mDesc?.display_name.split(' (')[0] || mId}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Reorderable Fallback Chain List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span>Ordered Fallback Hierarchy ({fallbackChain.length} Levels)</span>
            <span className="text-slate-400 text-[11px]">Use arrows to adjust priority</span>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
            {fallbackChain.map((mId, index) => {
              const model = models.find((m) => m.id === mId);
              const provider = model?.provider || 'gemini';
              return (
                <div
                  key={mId}
                  className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-600 shrink-0">
                      #{index + 1}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">
                          {model?.display_name || mId}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                            provider === 'gemini'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : provider === 'openai'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {provider}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {model?.role || `Fallback Tier ${index + 1}`} • Thinking: {model?.thinking_level || 'HIGH'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <button
                      onClick={() => moveFallbackUp(index)}
                      disabled={index === 0}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-700"
                      title="Move up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => moveFallbackDown(index)}
                      disabled={index === fallbackChain.length - 1}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer text-slate-700"
                      title="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => removeFallback(mId)}
                      className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition cursor-pointer ml-1"
                      title="Remove from fallback chain"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {fallbackChain.length === 0 && (
              <div className="p-6 text-center text-xs text-slate-500">
                No fallback models configured. Add eligible models below to ensure zero-downtime evaluation resilience.
              </div>
            )}
          </div>
        </div>

        {/* Add Eligible Model to Fallback Chain */}
        {(() => {
          const primaryId = models.find((m) => m.is_primary === 1)?.id;
          const availableToAdd = models.filter(
            (m) => m.id !== primaryId && !fallbackChain.includes(m.id)
          );

          if (availableToAdd.length === 0) return null;

          return (
            <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-semibold text-slate-700">Add Model to Fallback Hierarchy:</span>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedNewFallback}
                  onChange={(e) => setSelectedNewFallback(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select an approved model...</option>
                  {availableToAdd.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name} ({m.provider.toUpperCase()})
                    </option>
                  ))}
                </select>

                <button
                  onClick={addFallback}
                  disabled={!selectedNewFallback}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  Add to Chain
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Model Orchestration Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Configured Multi-Provider AI Model Registry</h4>
            <p className="text-xs text-slate-500">
              Only approved models for ICAI examination grading are accepted. Obsolete models (GPT-4o, Claude 3.5, Gemini 1.5/2.5) are permanently excluded.
            </p>
          </div>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 self-start sm:self-auto">
            {models.length} Models Registered
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Priority & Rank</th>
                <th className="py-3 px-4">Model & Provider</th>
                <th className="py-3 px-4">Role & Specialization</th>
                <th className="py-3 px-4">Reasoning Budget</th>
                <th className="py-3 px-4">Status & Latency</th>
                <th className="py-3 px-4 text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-normal">
              {models.map((m) => {
                const isGemini = m.provider === 'gemini';
                const isOpenAI = m.provider === 'openai';
                const isAnthropic = m.provider === 'anthropic';

                return (
                  <tr key={m.id} className={`hover:bg-slate-50/75 transition ${m.is_primary ? 'bg-blue-50/20' : ''}`}>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {m.is_primary ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-300">
                          <Zap className="w-3 h-3 text-blue-700 fill-blue-700" /> Primary
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                          Fallback #{m.fallback_order}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            m.is_enabled ? (m.status === 'AVAILABLE' ? 'bg-emerald-500' : 'bg-amber-500') : 'bg-slate-300'
                          }`}
                        />
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            {m.display_name}
                            {m.id.includes('preview') && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                                Preview
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400">{m.id}</div>
                        </div>
                        <span
                          className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                            isGemini
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : isOpenAI
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {m.provider}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 max-w-xs">
                      <div className="text-[11px] font-medium text-slate-800 leading-tight">
                        {m.role || (m.is_primary ? 'Primary CA Answer Sheet Evaluation' : `Fallback Level ${m.fallback_order}`)}
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${
                          m.thinking_level === 'XHIGH'
                            ? 'bg-purple-100 text-purple-900 border border-purple-300'
                            : m.thinking_level === 'HIGH' || !m.thinking_level
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : m.thinking_level === 'MEDIUM'
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        Thinking: {m.thinking_level || 'HIGH'}
                      </span>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              m.status === 'EVALUATION_READY'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold'
                                : m.status === 'INFERENCE_READY' || m.status === 'AVAILABLE'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : m.status === 'CONNECTED'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : m.status === 'RATE_LIMITED'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : m.status === 'INSUFFICIENT_CREDITS'
                                ? 'bg-orange-50 text-orange-700 border border-orange-200'
                                : m.status === 'TEMPORARILY_UNAVAILABLE'
                                ? 'bg-amber-50 text-amber-800 border border-amber-300'
                                : m.status === 'NOT_CONFIGURED'
                                ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {m.status.replace(/_/g, ' ')}
                          </span>
                          {m.last_latency_ms !== null && (
                            <span className="text-[11px] font-mono text-slate-500">{m.last_latency_ms}ms</span>
                          )}
                        </div>
                        {m.health_stage && m.health_stage !== 'UNKNOWN' && (
                          <div className="text-[10px] text-slate-500 flex items-center gap-1">
                            <span className="font-semibold text-slate-700">Stage:</span> {m.health_stage}
                            {m.health_details && (
                              <span className="truncate max-w-[180px] text-slate-400" title={m.health_details}>
                                • {m.health_details}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap text-right space-x-1.5">
                      {!m.is_primary && (
                        <button
                          onClick={() => handleSetPrimary(m.id)}
                          className="px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-800 text-[11px] font-semibold hover:bg-blue-100 transition cursor-pointer"
                        >
                          Make Primary
                        </button>
                      )}

                      <button
                        onClick={() => handleTestConnection(m.id, 'EVALUATION_READINESS')}
                        disabled={testingModelId === m.id}
                        title="Run 3-Stage Health Check (Connectivity -> Inference -> Schema)"
                        className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 text-[11px] font-semibold hover:bg-slate-50 transition cursor-pointer inline-flex items-center gap-1"
                      >
                        {testingModelId === m.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
                        ) : (
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        )}
                        <span>Health Check</span>
                      </button>

                      <button
                        onClick={() => handleRunBenchmark(m.id)}
                        disabled={runningBenchmarkId === m.id}
                        title="Run ICAI Examination Benchmark (Calculation + Statutory Law)"
                        className="px-2 py-1 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 text-[11px] font-semibold hover:bg-indigo-100 transition cursor-pointer inline-flex items-center gap-1"
                      >
                        {runningBenchmarkId === m.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin text-indigo-600" />
                        ) : (
                          <Cpu className="w-3 h-3 text-indigo-600" />
                        )}
                        <span>Benchmark</span>
                      </button>

                      <button
                        onClick={() => handleRunConsistency(m.id)}
                        disabled={runningConsistencyId === m.id}
                        title="Run 5x Deterministic Scoring Consistency Check"
                        className="px-2 py-1 rounded border border-purple-200 bg-purple-50 text-purple-700 text-[11px] font-semibold hover:bg-purple-100 transition cursor-pointer inline-flex items-center gap-1"
                      >
                        {runningConsistencyId === m.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin text-purple-600" />
                        ) : (
                          <Scale className="w-3 h-3 text-purple-600" />
                        )}
                        <span>5x Consist</span>
                      </button>

                      <button
                        onClick={() => setEditingModel({ ...m })}
                        className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 text-[11px] font-semibold hover:bg-slate-50 transition cursor-pointer"
                      >
                        <Sliders className="w-3 h-3 inline mr-1 text-slate-500" />
                        Tune
                      </button>

                      {!m.is_primary && (
                        <button
                          onClick={() => handleToggleEnabled(m)}
                          className={`px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                            m.is_enabled
                              ? 'border border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-700'
                              : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          {m.is_enabled ? 'Disable' : 'Enable'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Test Result Banner */}
      {testResult && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            testResult.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <div>
              <span className="font-bold">{testResult.modelId}:</span> {testResult.message}
            </div>
          </div>
          {testResult.latency !== undefined && (
            <span className="font-mono text-[11px] bg-white px-2 py-0.5 rounded border">
              {testResult.latency} ms
            </span>
          )}
        </div>
      )}

      {/* Benchmark Results Modal */}
      {benchmarkData && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">ICAI Model Benchmark Results</h3>
                  <p className="text-xs text-slate-500 font-mono">{benchmarkData.modelId} ({benchmarkData.provider?.toUpperCase()})</p>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                benchmarkData.grade === 'EXCELLENT' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                Grade: {benchmarkData.grade} ({benchmarkData.adherenceScore}%)
              </span>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Total Benchmark Latency</span>
                  <span className="text-base font-bold font-mono text-slate-800">{benchmarkData.totalLatencyMs} ms</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Schema Adherence</span>
                  <span className="text-base font-bold font-mono text-indigo-700">{benchmarkData.adherenceScore}% Passed</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700">Test Cases Evaluated:</h4>
                {benchmarkData.testCases?.map((tc: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-slate-900">{tc.name}</div>
                      <div className="text-[11px] text-slate-500">{tc.type} • {tc.remarks}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-slate-800">{tc.marksAwarded} / {tc.maximumMarks} Marks</div>
                      <div className="text-[10px] text-slate-400 font-mono">{tc.latencyMs} ms</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setBenchmarkData(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5-Run Consistency Results Modal */}
      {consistencyData && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-purple-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">5-Run Deterministic Consistency</h3>
                  <p className="text-xs text-slate-500 font-mono">{consistencyData.modelId}</p>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                consistencyData.variance === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
              }`}>
                {consistencyData.consistencyRating}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs text-center">
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Mean Score</span>
                <span className="text-base font-bold text-slate-900">{consistencyData.meanScore} / 2</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Std Deviation</span>
                <span className="text-base font-bold text-purple-700">{consistencyData.standardDeviation}</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Avg Latency</span>
                <span className="text-base font-bold text-slate-800">{consistencyData.averageLatencyMs}ms</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-700 mb-1.5">Per-Run Scores (5 Identical Runs):</h4>
              <div className="flex gap-2">
                {consistencyData.scores?.map((score: number, sIdx: number) => (
                  <div key={sIdx} className="flex-1 p-2 bg-slate-100 rounded text-center">
                    <div className="text-[10px] text-slate-500 font-bold">Run {sIdx + 1}</div>
                    <div className="text-sm font-mono font-black text-slate-800">{score >= 0 ? `${score}M` : 'ERR'}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setConsistencyData(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Intelligent Routing & Cross-Check Rules Preview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-amber-600" />
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Legal, Statutory & Audit Routing Rules
            </h4>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            For subjective papers including <strong>Corporate & Economic Laws</strong>, <strong>Direct Tax International Taxation</strong>, and <strong>Advanced Auditing & Professional Ethics</strong>:
          </p>
          <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
            <li>Primary evaluator invokes <strong>Claude Opus 5</strong> or <strong>Gemini 3.8 Flash</strong> with <span className="font-bold text-blue-700">HIGH thinking</span>.</li>
            <li>Enforces structured citing of statutory provisions before case conclusions.</li>
            <li>Evaluates auditing assertions (Completeness, Valuation, Existence) per ICAI Guidance Notes.</li>
          </ul>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-emerald-600" />
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Calculation-Heavy & Tax Cross-Check Mode
            </h4>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            For numerical papers including <strong>Direct Tax Computations</strong>, <strong>GST Valuations</strong>, <strong>Costing & SFM/AFM</strong>:
          </p>
          <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
            <li>Employs <strong>OpenAI GPT-5.6 Sol</strong> or <strong>Gemini 3.8 Flash</strong> with <span className="font-bold text-purple-700">HIGH/XHIGH reasoning</span>.</li>
            <li>Performs sub-step arithmetic verification to guarantee sum integrity.</li>
            <li>Secondary cross-checker automatically validates that working note step-marks equal the question total.</li>
          </ul>
        </div>
      </div>

      {/* Model Telemetry and Token Accounting */}
      {telemetry && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              <h4 className="text-sm font-bold text-slate-900">Execution Telemetry & Token Accounting</h4>
            </div>
            <span className="text-[11px] text-slate-400">Audited via server SQLite engine</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Total Evaluations</span>
              <p className="text-lg font-bold text-slate-900 mt-0.5">
                {telemetry.overallStats?.total_evaluations || 0}
              </p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Fallbacks Triggered</span>
              <p className="text-lg font-bold text-amber-600 mt-0.5">
                {telemetry.overallStats?.total_fallbacks || 0}
              </p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Avg Response Latency</span>
              <p className="text-lg font-bold text-slate-900 mt-0.5">
                {telemetry.overallStats?.global_avg_latency_ms || 0} ms
              </p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Total Tokens Tracked</span>
              <p className="text-lg font-bold text-blue-600 mt-0.5">
                {Number(telemetry.overallStats?.total_tokens_used || 0).toLocaleString()}
              </p>
            </div>
          </div>

          {telemetry.providerStats && telemetry.providerStats.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="py-2 px-3">Provider & Model</th>
                    <th className="py-2 px-3">Evaluations</th>
                    <th className="py-2 px-3">Success Rate</th>
                    <th className="py-2 px-3">Fallbacks</th>
                    <th className="py-2 px-3">Avg Latency</th>
                    <th className="py-2 px-3">Tokens Consumed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {telemetry.providerStats.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 font-semibold text-slate-900">
                        {row.model} ({row.provider})
                      </td>
                      <td className="py-2 px-3">{row.total_evaluations}</td>
                      <td className="py-2 px-3 text-emerald-600 font-semibold">
                        {row.total_evaluations > 0
                          ? Math.round((row.successful_evaluations / row.total_evaluations) * 100)
                          : 100}
                        %
                      </td>
                      <td className="py-2 px-3 text-amber-600">{row.fallback_count}</td>
                      <td className="py-2 px-3 font-mono">{row.avg_latency_ms || 0}ms</td>
                      <td className="py-2 px-3 font-mono">{Number(row.total_tokens || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Model Parameter Modal */}
      {editingModel && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Tune Model Parameters</h4>
                <p className="text-xs text-slate-500">{editingModel.display_name} ({editingModel.provider.toUpperCase()})</p>
              </div>
              <button
                onClick={() => setEditingModel(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveParams} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Assigned Role & Responsibilities</label>
                <input
                  type="text"
                  value={editingModel.role || ''}
                  onChange={(e) => setEditingModel({ ...editingModel, role: e.target.value })}
                  placeholder="e.g. Primary CA Evaluation / Step Marking"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Reasoning & Thinking Budget
                </label>
                <select
                  value={editingModel.thinking_level || 'HIGH'}
                  onChange={(e) =>
                    setEditingModel({
                      ...editingModel,
                      thinking_level: e.target.value as 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH',
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white"
                >
                  <option value="XHIGH">XHIGH — Maximum reasoning effort for complex computations & tax</option>
                  <option value="HIGH">HIGH — Deep Statutory Deduction, Complex Step-Marking & Working Notes</option>
                  <option value="MEDIUM">MEDIUM — Balanced Reasoning for Standard Practical & Theory Questions</option>
                  <option value="LOW">LOW — High-Throughput / Fast Multimodal & OCR Review</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Controls reasoning token budget across Gemini 3.x thinkingConfig, OpenAI reasoning_effort, and Anthropic extended thinking.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Max Output Tokens</label>
                <input
                  type="number"
                  min="1000"
                  max="32768"
                  step="512"
                  value={editingModel.max_tokens}
                  onChange={(e) => setEditingModel({ ...editingModel, max_tokens: parseInt(e.target.value) || 8192 })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Fallback Cascade Order (0 for Primary, 1-8 for Fallbacks)</label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={editingModel.fallback_order}
                  onChange={(e) => setEditingModel({ ...editingModel, fallback_order: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingModel(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition cursor-pointer"
                >
                  {savingEdit ? 'Saving...' : 'Save Parameters'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
