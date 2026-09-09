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
  ArrowDownUp,
  Cpu,
} from 'lucide-react';

interface ModelConfig {
  id: string;
  provider: 'gemini' | 'openai' | 'anthropic';
  display_name: string;
  role?: string;
  thinking_level?: 'LOW' | 'MEDIUM' | 'HIGH';
  is_primary: number;
  fallback_order: number;
  temperature: number;
  top_p: number;
  max_tokens: number;
  is_enabled: number;
  status: string;
  last_latency_ms: number | null;
  last_tested_at: string | null;
}

interface ProviderStatus {
  configured: boolean;
  keyMasked: string;
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
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ modelId: string; success: boolean; message: string; latency?: number } | null>(null);

  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [modelsRes, telemetryRes] = await Promise.all([
        apiRequest<{ models: ModelConfig[]; providerStatus: Record<string, ProviderStatus> }>('/api/admin/models'),
        apiRequest<TelemetryData>('/api/admin/models/telemetry'),
      ]);

      setModels(modelsRes.models || []);
      setProviders(modelsRes.providerStatus || {});
      setTelemetry(telemetryRes || null);
    } catch (err: any) {
      const msg = err?.message || 'Failed to load model registry';
      onNotify?.(msg, 'error');
    } finally {
      setLoading(false);
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
      onNotify?.(`Primary model changed to ${modelId}`, 'success');
      await fetchData();
    } catch (err: any) {
      onNotify?.(err?.message || 'Failed to set primary model', 'error');
    }
  };

  const handleToggleEnabled = async (model: ModelConfig) => {
    if (model.is_primary) {
      onNotify?.('Cannot disable the primary model', 'error');
      return;
    }
    try {
      const newEnabled = model.is_enabled ? 0 : 1;
      await apiRequest(`/api/admin/models/${encodeURIComponent(model.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ is_enabled: newEnabled }),
      });
      onNotify?.(`${model.display_name} ${newEnabled ? 'enabled' : 'disabled'}`, 'success');
      await fetchData();
    } catch (err: any) {
      onNotify?.(err?.message || 'Failed to update model status', 'error');
    }
  };

  const handleTestConnection = async (modelId: string) => {
    try {
      setTestingModelId(modelId);
      setTestResult(null);
      const res = await apiRequest<{ success: boolean; message: string; latencyMs?: number }>('/api/admin/models/test-connection', {
        method: 'POST',
        body: JSON.stringify({ modelId }),
      });
      setTestResult({
        modelId,
        success: res.success,
        message: res.message,
        latency: res.latencyMs,
      });
      if (res.success) {
        onNotify?.(`Connection test succeeded in ${res.latencyMs}ms`, 'success');
      } else {
        onNotify?.(`Connection test failed: ${res.message}`, 'error');
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
            <h3 className="text-base font-bold text-slate-900">Multi-Model AI Architecture & Orchestration</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              Pluggable Providers
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manage primary evaluation LLMs, automated fallback cascades across Gemini, OpenAI, and Anthropic, and tune inference parameters.
          </p>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition cursor-pointer self-start sm:self-auto flex items-center gap-1.5 text-xs"
          title="Refresh models"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Provider API Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Gemini */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 font-bold text-xs">
                G
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Google Gemini</h4>
                <p className="text-[10px] text-slate-500">Official Multimodal Vision SDK</p>
              </div>
            </div>
            {providers.gemini?.configured ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Active
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Missing Key
              </span>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Server API Key:</span>
            <span className="font-mono text-slate-700">{providers.gemini?.keyMasked || 'Not set'}</span>
          </div>
        </div>

        {/* OpenAI */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold text-xs">
                OA
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">OpenAI</h4>
                <p className="text-[10px] text-slate-500">GPT-4o & GPT-4o Mini</p>
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
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Server API Key:</span>
            <span className="font-mono text-slate-700">{providers.openai?.keyMasked || 'Not set'}</span>
          </div>
        </div>

        {/* Anthropic */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 font-bold text-xs">
                CL
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Anthropic Claude</h4>
                <p className="text-[10px] text-slate-500">Claude 3.5 Sonnet & Haiku</p>
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
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Server API Key:</span>
            <span className="font-mono text-slate-700">{providers.anthropic?.keyMasked || 'Not set'}</span>
          </div>
        </div>
      </div>

      {/* Model Orchestration Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Configured Models & Fallback Hierarchy</h4>
            <p className="text-xs text-slate-500">
              When an evaluation request runs, the Primary Model executes first. If it encounters a rate limit or 5xx outage, the system automatically cascades through the fallback order.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Status & Rank</th>
                <th className="py-3 px-4">Model & ID</th>
                <th className="py-3 px-4">Role / Purpose</th>
                <th className="py-3 px-4">Thinking & Reasoning</th>
                <th className="py-3 px-4">Health & Latency</th>
                <th className="py-3 px-4">Parameters</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-normal">
              {models.map((m) => {
                const isGemini = m.provider === 'gemini';
                const isOpenAI = m.provider === 'openai';
                const isAnthropic = m.provider === 'anthropic';

                return (
                  <tr key={m.id} className={`hover:bg-slate-50/75 transition ${m.is_primary ? 'bg-amber-50/20' : ''}`}>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {m.is_primary ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          <Zap className="w-3 h-3 text-amber-700 fill-amber-700" /> Primary
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
                          <div className="font-bold text-slate-900">{m.display_name}</div>
                          <div className="font-mono text-[10px] text-slate-400">{m.id}</div>
                        </div>
                        <span
                          className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                            isGemini
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : isOpenAI
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-purple-50 text-purple-700 border border-purple-200'
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
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${
                        m.thinking_level === 'HIGH' || !m.thinking_level
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : m.thinking_level === 'MEDIUM'
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        Thinking: {m.thinking_level || 'HIGH'}
                      </span>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            m.status === 'AVAILABLE'
                              ? 'bg-emerald-50 text-emerald-700'
                              : m.status === 'RATE_LIMITED'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {m.status}
                        </span>
                        {m.last_latency_ms !== null && (
                          <span className="text-[11px] font-mono text-slate-500">{m.last_latency_ms}ms</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap text-[11px] text-slate-500">
                      <span>Tokens: {m.max_tokens}</span>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap text-right space-x-2">
                      {!m.is_primary && (
                        <button
                          onClick={() => handleSetPrimary(m.id)}
                          className="px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 text-[11px] font-semibold hover:bg-amber-100 transition cursor-pointer"
                        >
                          Make Primary
                        </button>
                      )}

                      <button
                        onClick={() => handleTestConnection(m.id)}
                        disabled={testingModelId === m.id}
                        className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 text-[11px] font-semibold hover:bg-slate-50 transition cursor-pointer inline-flex items-center gap-1"
                      >
                        {testingModelId === m.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
                        ) : (
                          <Play className="w-3 h-3 text-slate-500" />
                        )}
                        <span>Ping</span>
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
          {testResult.latency && (
            <span className="font-mono text-[11px] bg-white px-2 py-0.5 rounded border">
              {testResult.latency} ms
            </span>
          )}
        </div>
      )}

      {/* Model Telemetry and Usage Analytics */}
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
                <p className="text-xs text-slate-500">{editingModel.display_name}</p>
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
                  Reasoning & Thinking Budget (Gemini 3.x)
                </label>
                <select
                  value={editingModel.thinking_level || 'HIGH'}
                  onChange={(e) =>
                    setEditingModel({
                      ...editingModel,
                      thinking_level: e.target.value as 'LOW' | 'MEDIUM' | 'HIGH',
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white"
                >
                  <option value="HIGH">HIGH — Deep Statutory Deduction, Complex Step-Marking & Working Notes Analysis</option>
                  <option value="MEDIUM">MEDIUM — Balanced Reasoning for Standard Practical Problems</option>
                  <option value="LOW">LOW — High-Throughput / Fast MCQ Review</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Gemini 3.x models use Thinking Config. Temperature and top_p are legacy parameters superseded by thinking budgets.
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
                <label className="block font-semibold text-slate-700 mb-1">Fallback Cascade Order</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={editingModel.fallback_order}
                  onChange={(e) => setEditingModel({ ...editingModel, fallback_order: parseInt(e.target.value) || 1 })}
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
