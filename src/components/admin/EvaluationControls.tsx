import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client';
import {
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Scale,
  Brain,
  Info,
} from 'lucide-react';

interface EvaluationControlsProps {
  onNotify?: (message: string, type: 'success' | 'error') => void;
}

export const EvaluationControls: React.FC<EvaluationControlsProps> = ({ onNotify }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [settings, setSettings] = useState<Record<string, string>>({
    EVAL_CHECKING_MODE: 'standard',
    EVAL_MODEL_PROVIDER: 'gemini-3.8-flash',
    EVAL_CONFIDENCE_THRESHOLD: '80',
    EVAL_STEP_MARKING_ENABLED: 'true',
    EVAL_CONSEQUENTIAL_ERROR_ENABLED: 'true',
    EVAL_MCQ_NEGATIVE_MARKING: 'ZERO_FOR_ALL',
    EVAL_EQUIVALENT_ANSWER_DETECTION: 'true',
    EVAL_MATERIAL_PRIORITY: 'STRICT_ACTIVE',
  });

  const fetchControls = async () => {
    try {
      setLoading(true);
      const res = await apiRequest<{ settings: Record<string, string> }>('/api/admin/evaluation-controls');
      if (res.settings) {
        setSettings((prev) => ({ ...prev, ...res.settings }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load evaluation rules';
      onNotify?.(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchControls();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await apiRequest('/api/admin/evaluation-controls', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      onNotify?.('Evaluation controls and rules updated successfully', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save rules';
      onNotify?.(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">AI Evaluation Engine Rules & Controls</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Active Server-Side
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Global evaluation parameters, checking strictness, consequential error tolerance, and scoring safety limits.
          </p>
        </div>

        <button
          onClick={fetchControls}
          className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition cursor-pointer self-start sm:self-auto"
          title="Refresh controls"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Card 1: Evaluation Mode */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
              <Scale className="w-4 h-4 text-blue-600" />
              <span>Default Examination Checking Mode</span>
            </div>
            <p className="text-xs text-slate-500">
              Governs evaluator strictness regarding statutory quotes, working notes completeness, and step allocation.
            </p>

            <div className="space-y-2">
              <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input
                  type="radio"
                  name="checking_mode"
                  value="standard"
                  checked={settings.EVAL_CHECKING_MODE === 'standard'}
                  onChange={(e) => setSettings({ ...settings, EVAL_CHECKING_MODE: e.target.value })}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-800">Standard CA Examination Style (Recommended)</div>
                  <div className="text-[11px] text-slate-500">Realistic examiner benchmark based on official guideline answers.</div>
                </div>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input
                  type="radio"
                  name="checking_mode"
                  value="strict"
                  checked={settings.EVAL_CHECKING_MODE === 'strict'}
                  onChange={(e) => setSettings({ ...settings, EVAL_CHECKING_MODE: e.target.value })}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-800">Strict Head Examiner Mode</div>
                  <div className="text-[11px] text-slate-500">Requires exact section numbers, full ledger narratives, and zero calculation tolerance.</div>
                </div>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input
                  type="radio"
                  name="checking_mode"
                  value="lenient"
                  checked={settings.EVAL_CHECKING_MODE === 'lenient'}
                  onChange={(e) => setSettings({ ...settings, EVAL_CHECKING_MODE: e.target.value })}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-800">Moderate Mentorship Guidance Mode</div>
                  <div className="text-[11px] text-slate-500">Generous step marks awarded for conceptual clarity even if minor slips occur.</div>
                </div>
              </label>
            </div>
          </div>

          {/* Card 2: AI Model & Confidence Engine */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
              <Brain className="w-4 h-4 text-purple-600" />
              <span>Vision & LLM Reasoning Model</span>
            </div>
            <p className="text-xs text-slate-500">
              Underlying Google Gemini multimodal architecture employed for handwriting OCR and semantic verification.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Model Engine</label>
                <select
                  value={settings.EVAL_MODEL_PROVIDER}
                  onChange={(e) => setSettings({ ...settings, EVAL_MODEL_PROVIDER: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none"
                >
                  <option value="gemini-3.8-flash">Gemini 3.8 Flash (Primary CA Evaluation — Default)</option>
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview (Secondary Complex & Legal Reasoning)</option>
                  <option value="gemini-3.7-flash">Gemini 3.7 Flash (Fast Review & MCQ Evaluator)</option>
                  <option value="gemini-3.6-flash">Gemini 3.6 Flash (Primary Fallback Model)</option>
                  <option value="gemini-3.5-flash">Gemini 3.5 Flash (Secondary Fallback Model)</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-slate-700">Confidence Threshold Flagging</span>
                  <span className="font-mono text-blue-600 font-bold">{settings.EVAL_CONFIDENCE_THRESHOLD}%</span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="95"
                  step="5"
                  value={settings.EVAL_CONFIDENCE_THRESHOLD}
                  onChange={(e) => setSettings({ ...settings, EVAL_CONFIDENCE_THRESHOLD: e.target.value })}
                  className="w-full cursor-pointer"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Evaluations with confidence scores below this threshold trigger an internal low-confidence audit warning.
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: Step-Marking & Equivalent Detection */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
              <Sliders className="w-4 h-4 text-emerald-600" />
              <span>Scoring Rules & Consequential Errors</span>
            </div>

            <div className="space-y-3 text-xs">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.EVAL_STEP_MARKING_ENABLED === 'true'}
                  onChange={(e) => setSettings({ ...settings, EVAL_STEP_MARKING_ENABLED: String(e.target.checked) })}
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="font-bold text-slate-800">Mandatory Step-Marking Breakdown</span>
                  <p className="text-[11px] text-slate-500">Every question must report discrete step-level marks and rationale.</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.EVAL_CONSEQUENTIAL_ERROR_ENABLED === 'true'}
                  onChange={(e) => setSettings({ ...settings, EVAL_CONSEQUENTIAL_ERROR_ENABLED: String(e.target.checked) })}
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="font-bold text-slate-800">Consequential Error Tolerance</span>
                  <p className="text-[11px] text-slate-500">
                    If an arithmetic error occurs early, do not repeatedly deduct marks for subsequent steps that apply correct logic.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.EVAL_EQUIVALENT_ANSWER_DETECTION === 'true'}
                  onChange={(e) => setSettings({ ...settings, EVAL_EQUIVALENT_ANSWER_DETECTION: String(e.target.checked) })}
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="font-bold text-slate-800">Equivalent Answer Detection</span>
                  <p className="text-[11px] text-slate-500">
                    Award full marks for valid alternative presentations, phrasing, and recognized accounting/legal approaches.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Card 4: MCQ Negative Marking Policy */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Universal Zero MCQ Negative Marking Guard</span>
            </div>

            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-800 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Enforced ICAI Standard — Zero Negative Marking</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Universal Rule Enforced across CA Foundation, Intermediate, and Final: <strong>Zero Negative Marking</strong> for all MCQs. Correct = full marks, Wrong/Incorrect = 0 marks (never deduct marks), Unattempted = 0 marks.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">MCQ Scoring Rule</label>
              <select
                value={settings.EVAL_MCQ_NEGATIVE_MARKING || 'ZERO_FOR_ALL'}
                onChange={(e) => setSettings({ ...settings, EVAL_MCQ_NEGATIVE_MARKING: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none"
              >
                <option value="ZERO_FOR_ALL">Zero Negative Marking for All MCQs (Foundation, Inter & Final)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Material Matching Priority</label>
              <select
                value={settings.EVAL_MATERIAL_PRIORITY}
                onChange={(e) => setSettings({ ...settings, EVAL_MATERIAL_PRIORITY: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none"
              >
                <option value="STRICT_ACTIVE">Strict Active Only (Halt if no active material found)</option>
                <option value="FALLBACK_LATEST">Fallback to Latest Available Version</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex items-center justify-between">
          <p className="text-xs text-slate-500">
            All rule updates are logged to the immutable Super Admin audit ledger with timestamp and administrator ID.
          </p>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>Save Evaluation Controls</span>
          </button>
        </div>
      </form>
    </div>
  );
};
