import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client';
import { McqScoringRule, CALevel } from '../../types';
import {
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Scale,
  Brain,
  Layers,
  Plus,
  Edit2,
  Trash2,
  RotateCcw,
  X,
  Check,
  AlertCircle,
} from 'lucide-react';

interface EvaluationControlsProps {
  onNotify?: (message: string, type: 'success' | 'error') => void;
}

interface McqRuleFormData {
  id?: string;
  courseLevel: CALevel;
  paperNumber: string;
  paperName: string;
  attempt: string;
  syllabusVersion: string;
  wrongPenalty: number;
  correctScoreRule: string;
  unattemptedScoreRule: string;
  isActive: boolean;
  description: string;
}

const INITIAL_RULE_FORM: McqRuleFormData = {
  courseLevel: 'FOUNDATION',
  paperNumber: 'Paper 3',
  paperName: 'Quantitative Aptitude',
  attempt: 'ALL',
  syllabusVersion: 'ALL',
  wrongPenalty: -0.25,
  correctScoreRule: 'FULL_MARKS',
  unattemptedScoreRule: 'ZERO',
  isActive: true,
  description: 'CA Foundation Paper 3 Quantitative Aptitude: Correct = full marks, Wrong = -0.25 marks, Unattempted = 0 marks',
};

export const EvaluationControls: React.FC<EvaluationControlsProps> = ({ onNotify }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [settings, setSettings] = useState<Record<string, string>>({
    EVAL_CHECKING_MODE: 'standard',
    EVAL_MODEL_PROVIDER: 'gemini-3.8-flash',
    EVAL_CONFIDENCE_THRESHOLD: '80',
    EVAL_STEP_MARKING_ENABLED: 'true',
    EVAL_CONSEQUENTIAL_ERROR_ENABLED: 'true',
    EVAL_EQUIVALENT_ANSWER_DETECTION: 'true',
    EVAL_MATERIAL_PRIORITY: 'STRICT_ACTIVE',
  });

  // MCQ Scoring Rules State
  const [mcqRules, setMcqRules] = useState<McqScoringRule[]>([]);
  const [loadingRules, setLoadingRules] = useState<boolean>(true);
  const [ruleLevelFilter, setRuleLevelFilter] = useState<'ALL' | CALevel>('ALL');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleFormData, setRuleFormData] = useState<McqRuleFormData>(INITIAL_RULE_FORM);
  const [savingRule, setSavingRule] = useState<boolean>(false);
  const [resettingDefaults, setResettingDefaults] = useState<boolean>(false);

  // Load global evaluation controls
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

  // Load paper-specific MCQ scoring rules
  const fetchMcqRules = async () => {
    try {
      setLoadingRules(true);
      const res = await apiRequest<{ success: boolean; rules: McqScoringRule[] }>('/api/admin/mcq-scoring-rules');
      if (res.rules) {
        setMcqRules(res.rules);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load MCQ scoring rules';
      onNotify?.(msg, 'error');
    } finally {
      setLoadingRules(false);
    }
  };

  useEffect(() => {
    fetchControls();
    fetchMcqRules();
  }, []);

  // Save global settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingSettings(true);
      await apiRequest('/api/admin/evaluation-controls', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      onNotify?.('Global evaluation controls updated successfully', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save rules';
      onNotify?.(msg, 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  // Open modal to create rule
  const handleOpenAddModal = (levelPreset: CALevel = 'FOUNDATION') => {
    setEditingRuleId(null);
    let defaultPaperName = 'Quantitative Aptitude';
    let defaultPaperNum = 'Paper 3';
    let defaultPenalty = -0.25;

    if (levelPreset === 'INTERMEDIATE') {
      defaultPaperName = 'All Intermediate MCQ Papers';
      defaultPaperNum = 'ALL';
      defaultPenalty = 0;
    } else if (levelPreset === 'FINAL') {
      defaultPaperName = 'All Final MCQ Papers';
      defaultPaperNum = 'ALL';
      defaultPenalty = 0;
    }

    setRuleFormData({
      courseLevel: levelPreset,
      paperNumber: defaultPaperNum,
      paperName: defaultPaperName,
      attempt: 'ALL',
      syllabusVersion: 'ALL',
      wrongPenalty: defaultPenalty,
      correctScoreRule: 'FULL_MARKS',
      unattemptedScoreRule: 'ZERO',
      isActive: true,
      description: `CA ${levelPreset} ${defaultPaperName}: Correct = full marks, Wrong = ${defaultPenalty} marks, Unattempted = 0 marks`,
    });
    setIsModalOpen(true);
  };

  // Open modal to edit rule
  const handleOpenEditModal = (rule: McqScoringRule) => {
    setEditingRuleId(rule.id);
    setRuleFormData({
      id: rule.id,
      courseLevel: rule.courseLevel || (rule as any).course_level,
      paperNumber: rule.paperNumber || (rule as any).paper_number || 'ALL',
      paperName: rule.paperName || (rule as any).paper_name,
      attempt: rule.attempt || 'ALL',
      syllabusVersion: rule.syllabusVersion || (rule as any).syllabus_version || 'ALL',
      wrongPenalty: rule.wrongPenalty !== undefined ? rule.wrongPenalty : (rule as any).wrong_penalty,
      correctScoreRule: rule.correctScoreRule || (rule as any).correct_score_rule || 'FULL_MARKS',
      unattemptedScoreRule: rule.unattemptedScoreRule || (rule as any).unattempted_score_rule || 'ZERO',
      isActive: rule.isActive !== undefined ? rule.isActive : Boolean((rule as any).is_active),
      description: rule.description || '',
    });
    setIsModalOpen(true);
  };

  // Save rule (create or update)
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();

    // Strict safety validation before submission:
    // Negative marking (-0.25) permitted ONLY for Foundation Quantitative Aptitude & Business Economics
    if (ruleFormData.wrongPenalty < 0) {
      const isFoundation = ruleFormData.courseLevel === 'FOUNDATION';
      const isAllowedPaper =
        ruleFormData.paperName === 'Quantitative Aptitude' ||
        ruleFormData.paperName === 'Business Economics';

      if (!isFoundation || !isAllowedPaper) {
        onNotify?.(
          'ICAI Safety Rule Violation: -0.25 negative marking is strictly permitted ONLY for CA Foundation Quantitative Aptitude and Business Economics. All other papers and levels must have 0 wrong-answer penalty.',
          'error'
        );
        return;
      }
    }

    try {
      setSavingRule(true);
      if (editingRuleId) {
        await apiRequest(`/api/admin/mcq-scoring-rules/${editingRuleId}`, {
          method: 'PUT',
          body: JSON.stringify(ruleFormData),
        });
        onNotify?.('MCQ scoring rule updated successfully', 'success');
      } else {
        await apiRequest('/api/admin/mcq-scoring-rules', {
          method: 'POST',
          body: JSON.stringify(ruleFormData),
        });
        onNotify?.('MCQ scoring rule created successfully', 'success');
      }
      setIsModalOpen(false);
      fetchMcqRules();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save MCQ scoring rule';
      onNotify?.(msg, 'error');
    } finally {
      setSavingRule(false);
    }
  };

  // Delete rule
  const handleDeleteRule = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete the MCQ scoring rule for "${name}"?`)) {
      return;
    }
    try {
      await apiRequest(`/api/admin/mcq-scoring-rules/${id}`, { method: 'DELETE' });
      onNotify?.('MCQ scoring rule deleted successfully', 'success');
      fetchMcqRules();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete rule';
      onNotify?.(msg, 'error');
    }
  };

  // Toggle active status directly from table
  const handleToggleRuleStatus = async (rule: McqScoringRule) => {
    const currentActive = rule.isActive !== undefined ? rule.isActive : Boolean((rule as any).is_active);
    try {
      await apiRequest(`/api/admin/mcq-scoring-rules/${rule.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !currentActive }),
      });
      fetchMcqRules();
      onNotify?.(`Rule for "${rule.paperName || (rule as any).paper_name}" marked as ${!currentActive ? 'Active' : 'Inactive'}`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update rule status';
      onNotify?.(msg, 'error');
    }
  };

  // Reset to ICAI official defaults
  const handleResetDefaults = async () => {
    if (
      !window.confirm(
        'Reset all MCQ scoring rules to official ICAI defaults?\n\n- CA Foundation QA & Eco: -0.25 wrong penalty\n- CA Foundation Accounting & Laws: 0 wrong penalty\n- CA Intermediate & Final: Strictly 0 wrong penalty'
      )
    ) {
      return;
    }
    try {
      setResettingDefaults(true);
      await apiRequest('/api/admin/mcq-scoring-rules/reset-defaults', { method: 'POST' });
      onNotify?.('MCQ scoring rules reset to official ICAI defaults successfully', 'success');
      fetchMcqRules();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset defaults';
      onNotify?.(msg, 'error');
    } finally {
      setResettingDefaults(false);
    }
  };

  // Filtered rules
  const filteredRules = mcqRules.filter((r) => {
    const rLevel = r.courseLevel || (r as any).course_level;
    if (ruleLevelFilter === 'ALL') return true;
    return rLevel === ruleLevelFilter;
  });

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">AI Evaluation Engine Rules & Controls</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Active Server-Side
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure global evaluation checking modes, AI reasoning models, step-marking rules, and paper-specific MCQ scoring.
          </p>
        </div>

        <button
          onClick={() => {
            fetchControls();
            fetchMcqRules();
          }}
          className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition cursor-pointer self-start sm:self-auto"
          title="Refresh evaluation controls & MCQ rules"
        >
          <RefreshCw className={`w-4 h-4 ${loading || loadingRules ? 'animate-spin text-blue-600' : ''}`} />
        </button>
      </div>

      {/* SECTION 1: GLOBAL EVALUATION ENGINE CONTROLS */}
      <form onSubmit={handleSaveSettings} className="space-y-5">
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
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
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

          {/* Card 4: Material Matching Priority (Fully Independent Card with Zero UI Overlap) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Material Matching Priority</span>
            </div>
            <p className="text-xs text-slate-500">
              Determines how suggested answers and marking schemes are matched against student exam submissions.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Matching Strategy</label>
                <select
                  value={settings.EVAL_MATERIAL_PRIORITY || 'STRICT_ACTIVE'}
                  onChange={(e) => setSettings({ ...settings, EVAL_MATERIAL_PRIORITY: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-xs bg-slate-50 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="STRICT_ACTIVE">Strict Active Only (Halt if no active material found)</option>
                  <option value="FALLBACK_LATEST">Fallback to Latest Available Version</option>
                </select>
              </div>

              <div className="p-3 bg-indigo-50/60 rounded-lg border border-indigo-100 text-[11px] text-indigo-900 space-y-1">
                <span className="font-semibold block">Audit & Consistency Guarantee:</span>
                <p className="text-slate-600 leading-relaxed">
                  When set to <em>Strict Active Only</em>, the system halts answer sheet evaluation if the exact active RTP/MTP/Past Paper material is not uploaded in the repository, safeguarding evaluation precision.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Save Global Settings Toolbar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            All rule updates are logged to the immutable Super Admin audit ledger with timestamp and administrator ID.
          </p>
          <button
            type="submit"
            disabled={savingSettings}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-50 shrink-0"
          >
            {savingSettings ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>Save Global Evaluation Controls</span>
          </button>
        </div>
      </form>

      {/* SECTION 2: PAPER-SPECIFIC CONFIGURABLE MCQ SCORING & NEGATIVE MARKING */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
        {/* Header & ICAI Rules Summary */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <h3 className="text-base font-bold text-slate-900">
                Paper-Specific MCQ Scoring & Negative Marking Rules
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Configurable scoring rules mapped per CA Level, Paper, Attempt, and Syllabus. Evaluator dynamically resolves matching rules at runtime.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleResetDefaults}
              disabled={resettingDefaults}
              className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              title="Reset all rules to official ICAI default guidelines"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${resettingDefaults ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
              <span>Reset to ICAI Defaults</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenAddModal('FOUNDATION')}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add MCQ Scoring Rule</span>
            </button>
          </div>
        </div>

        {/* ICAI Compliance Information Banner */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-blue-600" />
            <span>Official ICAI MCQ Scoring Policy Standards</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-slate-600 pt-1 text-[11px]">
            <div className="p-2.5 rounded-lg bg-white border border-slate-200">
              <span className="font-bold text-blue-700 block mb-1">CA Foundation</span>
              <ul className="space-y-1 list-disc list-inside">
                <li>
                  <strong className="text-slate-800 font-medium">Quantitative Aptitude</strong>: Wrong = <strong>-0.25 marks</strong>
                </li>
                <li>
                  <strong className="text-slate-800 font-medium">Business Economics</strong>: Wrong = <strong>-0.25 marks</strong>
                </li>
                <li>
                  <strong className="text-slate-800 font-medium">Accounting & Laws</strong>: Wrong = <strong>0 marks</strong>
                </li>
                <li>Unattempted = <strong>0 marks</strong> (Never penalized)</li>
              </ul>
            </div>

            <div className="p-2.5 rounded-lg bg-white border border-slate-200">
              <span className="font-bold text-amber-700 block mb-1">CA Intermediate (New Scheme)</span>
              <ul className="space-y-1 list-disc list-inside">
                <li>All 30% Objective MCQs across all 6 papers:</li>
                <li>Correct = <strong>Full Marks</strong></li>
                <li>Wrong / Incorrect = <strong>0 marks (Strictly Zero Negative Marking)</strong></li>
                <li>Unattempted = <strong>0 marks</strong></li>
              </ul>
            </div>

            <div className="p-2.5 rounded-lg bg-white border border-slate-200">
              <span className="font-bold text-purple-700 block mb-1">CA Final (New Scheme)</span>
              <ul className="space-y-1 list-disc list-inside">
                <li>All Case Scenario / Integrated MCQs:</li>
                <li>Correct = <strong>Full Marks</strong></li>
                <li>Wrong / Incorrect = <strong>0 marks (Strictly Zero Negative Marking)</strong></li>
                <li>Unattempted = <strong>0 marks</strong></li>
              </ul>
            </div>
          </div>
          <div className="pt-1 text-[11px] text-amber-800 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>
              <strong>Strict Safety Check Enforced:</strong> The evaluation engine verifies <code>CA Level === 'FOUNDATION'</code> AND (<code>Subject === 'Quantitative Aptitude'</code> OR <code>Subject === 'Business Economics'</code>). Under no circumstances can negative marking be applied outside these two specific Foundation papers.
            </span>
          </div>
        </div>

        {/* Level Filter Tabs */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
            {(['ALL', 'FOUNDATION', 'INTERMEDIATE', 'FINAL'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setRuleLevelFilter(lvl)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                  ruleLevelFilter === lvl
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lvl === 'ALL' ? 'All Rules' : `CA ${lvl}`}
              </button>
            ))}
          </div>

          <span className="text-xs font-mono text-slate-500">
            Showing {filteredRules.length} of {mcqRules.length} active rules
          </span>
        </div>

        {/* Rules Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Paper / Subject Name</th>
                <th className="px-3 py-3">Attempt</th>
                <th className="px-3 py-3">Syllabus</th>
                <th className="px-4 py-3 text-center">Wrong MCQ Penalty</th>
                <th className="px-3 py-3 text-center">Correct Rule</th>
                <th className="px-3 py-3 text-center">Unattempted</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {loadingRules ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-600 mb-2" />
                    Loading paper-specific MCQ scoring rules...
                  </td>
                </tr>
              ) : filteredRules.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    No MCQ scoring rules configured for this filter.
                  </td>
                </tr>
              ) : (
                filteredRules.map((rule) => {
                  const rLevel = rule.courseLevel || (rule as any).course_level;
                  const rPaperName = rule.paperName || (rule as any).paper_name;
                  const rPaperNum = rule.paperNumber || (rule as any).paper_number;
                  const rPenalty = rule.wrongPenalty !== undefined ? rule.wrongPenalty : (rule as any).wrong_penalty;
                  const rActive = rule.isActive !== undefined ? rule.isActive : Boolean((rule as any).is_active);

                  const isNegative = rPenalty < 0;

                  return (
                    <tr key={rule.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-4 py-3 font-semibold">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            rLevel === 'FOUNDATION'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : rLevel === 'INTERMEDIATE'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-purple-50 text-purple-700 border border-purple-200'
                          }`}
                        >
                          CA {rLevel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{rPaperName}</div>
                        {rPaperNum && rPaperNum !== 'ALL' && (
                          <div className="text-[10px] text-slate-500 font-mono">{rPaperNum}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-slate-600">
                        {rule.attempt || 'ALL'}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-slate-600">
                        {rule.syllabusVersion || (rule as any).syllabus_version || 'ALL'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isNegative ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black font-mono bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            {rPenalty} marks
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Check className="w-3 h-3 text-emerald-600" />
                            0 marks
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-[11px] text-slate-600">
                        {rule.correctScoreRule || 'FULL_MARKS'}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-[11px] text-slate-600">
                        {rule.unattemptedScoreRule || 'ZERO'} (0)
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleRuleStatus(rule)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${
                            rActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                          }`}
                          title="Click to toggle rule status"
                        >
                          {rActive ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(rule)}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-blue-600 transition cursor-pointer"
                            title="Edit Rule"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRule(rule.id, rPaperName)}
                            className="p-1.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                            title="Delete Rule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* MODAL: ADD / EDIT MCQ SCORING RULE */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <h4 className="text-base font-bold text-slate-900">
                  {editingRuleId ? 'Edit MCQ Scoring Rule' : 'Add MCQ Scoring Rule'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveRule} className="p-5 space-y-4 overflow-y-auto">
              {/* CA Level */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">CA Level</label>
                <select
                  value={ruleFormData.courseLevel}
                  onChange={(e) => {
                    const newLevel = e.target.value as CALevel;
                    let defName = ruleFormData.paperName;
                    let defPen = ruleFormData.wrongPenalty;

                    if (newLevel === 'FOUNDATION') {
                      defName = 'Quantitative Aptitude';
                      defPen = -0.25;
                    } else if (newLevel === 'INTERMEDIATE') {
                      defName = 'All Intermediate MCQ Papers';
                      defPen = 0;
                    } else if (newLevel === 'FINAL') {
                      defName = 'All Final MCQ Papers';
                      defPen = 0;
                    }

                    setRuleFormData({
                      ...ruleFormData,
                      courseLevel: newLevel,
                      paperName: defName,
                      wrongPenalty: defPen,
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="FOUNDATION">CA Foundation</option>
                  <option value="INTERMEDIATE">CA Intermediate</option>
                  <option value="FINAL">CA Final</option>
                </select>
              </div>

              {/* Paper / Subject Name */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Full Paper / Subject Name (Official ICAI Name)
                  </label>
                  <span className="text-[10px] text-slate-400">Do not use abbreviations</span>
                </div>
                <input
                  type="text"
                  required
                  value={ruleFormData.paperName}
                  onChange={(e) => {
                    const val = e.target.value;
                    let penalty = ruleFormData.wrongPenalty;
                    // Auto enforce 0 if not Foundation QA/Eco
                    const isEligible =
                      ruleFormData.courseLevel === 'FOUNDATION' &&
                      (val === 'Quantitative Aptitude' || val === 'Business Economics');
                    if (!isEligible && penalty < 0) {
                      penalty = 0;
                    }
                    setRuleFormData({ ...ruleFormData, paperName: val, wrongPenalty: penalty });
                  }}
                  placeholder="e.g. Quantitative Aptitude, Business Economics, Accounting"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />

                {/* Quick Selection Pills */}
                {ruleFormData.courseLevel === 'FOUNDATION' && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="text-[10px] text-slate-500 py-0.5">Presets:</span>
                    {[
                      { name: 'Quantitative Aptitude', num: 'Paper 3', pen: -0.25 },
                      { name: 'Business Economics', num: 'Paper 4', pen: -0.25 },
                      { name: 'Accounting', num: 'Paper 1', pen: 0 },
                      { name: 'Business Laws', num: 'Paper 2', pen: 0 },
                    ].map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() =>
                          setRuleFormData({
                            ...ruleFormData,
                            paperName: p.name,
                            paperNumber: p.num,
                            wrongPenalty: p.pen,
                            description: `CA Foundation ${p.num} ${p.name}: Correct = full marks, Wrong = ${p.pen} marks, Unattempted = 0 marks`,
                          })
                        }
                        className={`text-[11px] px-2 py-0.5 rounded border transition cursor-pointer ${
                          ruleFormData.paperName === p.name
                            ? 'bg-blue-50 text-blue-700 border-blue-300 font-bold'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {p.name} ({p.pen})
                      </button>
                    ))}
                  </div>
                )}

                {ruleFormData.courseLevel === 'INTERMEDIATE' && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="text-[10px] text-slate-500 py-0.5">Presets:</span>
                    <button
                      type="button"
                      onClick={() =>
                        setRuleFormData({
                          ...ruleFormData,
                          paperName: 'All Intermediate MCQ Papers',
                          paperNumber: 'ALL',
                          wrongPenalty: 0,
                          description: 'CA Intermediate MCQs: Correct = full marks, Wrong = 0 marks, Unattempted = 0 marks',
                        })
                      }
                      className="text-[11px] px-2 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-200 font-medium cursor-pointer"
                    >
                      All Intermediate MCQ Papers (0 marks)
                    </button>
                  </div>
                )}

                {ruleFormData.courseLevel === 'FINAL' && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="text-[10px] text-slate-500 py-0.5">Presets:</span>
                    <button
                      type="button"
                      onClick={() =>
                        setRuleFormData({
                          ...ruleFormData,
                          paperName: 'All Final MCQ Papers',
                          paperNumber: 'ALL',
                          wrongPenalty: 0,
                          description: 'CA Final MCQs: Correct = full marks, Wrong = 0 marks, Unattempted = 0 marks',
                        })
                      }
                      className="text-[11px] px-2 py-0.5 rounded border bg-purple-50 text-purple-800 border-purple-200 font-medium cursor-pointer"
                    >
                      All Final MCQ Papers (0 marks)
                    </button>
                  </div>
                )}
              </div>

              {/* Paper Number, Attempt & Syllabus Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Paper Number</label>
                  <input
                    type="text"
                    value={ruleFormData.paperNumber}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, paperNumber: e.target.value })}
                    placeholder="e.g. Paper 3 or ALL"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Exam Attempt</label>
                  <input
                    type="text"
                    value={ruleFormData.attempt}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, attempt: e.target.value })}
                    placeholder="e.g. ALL or May 2026"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Syllabus</label>
                  <input
                    type="text"
                    value={ruleFormData.syllabusVersion}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, syllabusVersion: e.target.value })}
                    placeholder="e.g. ALL or New Scheme 2024"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Wrong Answer Negative Penalty */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Wrong Answer Negative Penalty (Marks)
                </label>
                {ruleFormData.courseLevel === 'FOUNDATION' &&
                (ruleFormData.paperName === 'Quantitative Aptitude' ||
                  ruleFormData.paperName === 'Business Economics') ? (
                  <div className="space-y-2">
                    <select
                      value={ruleFormData.wrongPenalty}
                      onChange={(e) =>
                        setRuleFormData({ ...ruleFormData, wrongPenalty: parseFloat(e.target.value) })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="-0.25">-0.25 marks (Official ICAI Standard for QA & Eco)</option>
                      <option value="0">0 marks (Zero Negative Marking)</option>
                    </select>
                    <p className="text-[11px] text-emerald-700 font-medium">
                      ✓ Paper eligible for official -0.25 negative marking under CA Foundation guidelines.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="number"
                      disabled
                      value={0}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-100 text-slate-500 cursor-not-allowed"
                    />
                    <p className="text-[11px] text-slate-500">
                      Locked to <strong>0 marks</strong>. Under ICAI regulations, negative marking is forbidden for this level/paper.
                    </p>
                  </div>
                )}
              </div>

              {/* Correct & Unattempted Scoring Rules */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Correct Answer Rule</label>
                  <select
                    value={ruleFormData.correctScoreRule}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, correctScoreRule: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none"
                  >
                    <option value="FULL_MARKS">Full Marks (+1.0 or assigned)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Unattempted Rule</label>
                  <select
                    value={ruleFormData.unattemptedScoreRule}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, unattemptedScoreRule: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none"
                  >
                    <option value="ZERO">0 Marks (No negative marking)</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rule Description / Notes</label>
                <input
                  type="text"
                  value={ruleFormData.description}
                  onChange={(e) => setRuleFormData({ ...ruleFormData, description: e.target.value })}
                  placeholder="Internal audit description"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Active Toggle */}
              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ruleFormData.isActive}
                  onChange={(e) => setRuleFormData({ ...ruleFormData, isActive: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs font-bold text-slate-800">Rule Active in Evaluation Engine</span>
              </label>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRule}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {savingRule ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>{editingRuleId ? 'Update Rule' : 'Create Rule'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
