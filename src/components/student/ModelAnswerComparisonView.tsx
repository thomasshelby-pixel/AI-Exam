import React, { useState, useMemo } from 'react';
import {
  Columns,
  Layers,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Filter,
  FileText,
  Sparkles,
  BookOpen,
  Award,
  Scale,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  Maximize2,
  Minimize2,
  X,
  HelpCircle,
  Info,
  CheckSquare,
  FileCheck2,
} from 'lucide-react';
import { QuestionEvaluation, MarkingComponent } from '../../types/index.js';

export interface ModelAnswerComparisonProps {
  questions: QuestionEvaluation[];
  subjectName?: string;
  caLevel?: string;
  studentName?: string;
  initialQuestionIndex?: number;
  isModal?: boolean;
  onClose?: () => void;
  className?: string;
}

type ViewLayout = 'SIDE_BY_SIDE' | 'UNIFIED_OVERLAY';
type DivergenceFilter = 'ALL' | 'DIVERGENT_ONLY' | 'MATCHED_ONLY';

interface NormalizedStep {
  id: string;
  stepNumber: number;
  componentType: string;
  expectedRequirement: string;
  studentEvidence: string;
  assessment: 'CORRECT' | 'PARTIALLY_CORRECT' | 'INCORRECT' | 'OMITTED';
  marksAwarded: number;
  marksAvailable: number;
  marksDeducted: number;
  deductionReason?: string;
  supportingProvision?: string;
  isDivergent: boolean;
}

export const ModelAnswerComparisonView: React.FC<ModelAnswerComparisonProps> = ({
  questions = [],
  subjectName = 'Chartered Accountancy Paper',
  caLevel = 'INTERMEDIATE',
  studentName = 'CA Candidate',
  initialQuestionIndex = 0,
  isModal = false,
  onClose,
  className = '',
}) => {
  const [activeQuestionIdx, setActiveQuestionIdx] = useState<number>(() => {
    if (initialQuestionIndex >= 0 && initialQuestionIndex < questions.length) {
      return initialQuestionIndex;
    }
    return 0;
  });

  const [layoutMode, setLayoutMode] = useState<ViewLayout>('SIDE_BY_SIDE');
  const [divergenceFilter, setDivergenceFilter] = useState<DivergenceFilter>('ALL');
  const [selectedComponentType, setSelectedComponentType] = useState<string>('ALL');

  const currentQuestion = questions[activeQuestionIdx] || questions[0];

  // Helper to extract or synthesize normalized comparison steps for current question
  const steps: NormalizedStep[] = useMemo(() => {
    if (!currentQuestion) return [];

    const rawComponents: MarkingComponent[] =
      currentQuestion.markingComponents ||
      currentQuestion.structuredEvidence?.markingComponents ||
      [];

    if (rawComponents.length > 0) {
      return rawComponents.map((c, i) => {
        const isDivergent = c.assessment !== 'CORRECT' && (c.marksDeducted > 0 || c.marksAwarded < c.marksAvailable);
        return {
          id: c.componentId || `comp-${i}`,
          stepNumber: i + 1,
          componentType: c.componentType || 'APPLICATION',
          expectedRequirement: c.expectedRequirement || 'Official statutory requirement / standard working.',
          studentEvidence: c.studentEvidence || 'No specific text or working recorded in submitted script.',
          assessment: c.assessment || (isDivergent ? 'INCORRECT' : 'CORRECT'),
          marksAwarded: c.marksAwarded ?? 0,
          marksAvailable: c.marksAvailable ?? 1,
          marksDeducted: c.marksDeducted ?? (c.marksAvailable - c.marksAwarded),
          deductionReason: c.deductionReason,
          supportingProvision: c.supportingProvision,
          isDivergent,
        };
      });
    }

    // Fallback: If no components, synthesize from stepMarkingBreakdown or question feedback
    if (currentQuestion.stepMarkingBreakdown && currentQuestion.stepMarkingBreakdown.length > 0) {
      return currentQuestion.stepMarkingBreakdown.map((s, i) => {
        const isDivergent = s.marksAwarded < s.maximumMarks;
        return {
          id: `step-bk-${i}`,
          stepNumber: i + 1,
          componentType: i === 0 ? 'PROVISION' : i === currentQuestion.stepMarkingBreakdown!.length - 1 ? 'CONCLUSION' : 'CALCULATION',
          expectedRequirement: s.step || `Model step ${i + 1} requirement`,
          studentEvidence: s.remarks?.includes('Candidate') || s.remarks?.includes('Student')
            ? s.remarks
            : `Attempted in script. ${s.remarks || ''}`,
          assessment: s.marksAwarded >= s.maximumMarks ? 'CORRECT' : s.marksAwarded > 0 ? 'PARTIALLY_CORRECT' : 'INCORRECT',
          marksAwarded: s.marksAwarded,
          marksAvailable: s.maximumMarks,
          marksDeducted: Math.max(0, s.maximumMarks - s.marksAwarded),
          deductionReason: isDivergent ? s.remarks || currentQuestion.reasonForDeduction : undefined,
          supportingProvision: currentQuestion.applicableProvisions?.[0],
          isDivergent,
        };
      });
    }

    // Default synthesis if single-block evaluation
    const synthesized: NormalizedStep[] = [];
    const max = currentQuestion.maximumMarks || 5;
    const awarded = currentQuestion.marksAwarded || 0;
    const lost = currentQuestion.marksLost || (max - awarded);

    // Step 1: Legal Provision / Framework
    synthesized.push({
      id: 'synth-1',
      stepNumber: 1,
      componentType: 'PROVISION',
      expectedRequirement: currentQuestion.applicableProvisions?.join(', ')
        ? `Citation and applicability of: ${currentQuestion.applicableProvisions.join(', ')}`
        : 'Applicable statutory definitions, accounting standards, or legal principles.',
      studentEvidence: currentQuestion.technicalEvaluation
        ? currentQuestion.technicalEvaluation
        : awarded > 0
        ? 'Statutory provisions and core concepts addressed in submitted answer.'
        : 'Statutory basis omitted or improperly framed in submitted answer.',
      assessment: awarded >= Math.ceil(max * 0.7) ? 'CORRECT' : awarded > 0 ? 'PARTIALLY_CORRECT' : 'INCORRECT',
      marksAwarded: Math.min(2, awarded),
      marksAvailable: Math.min(2, max),
      marksDeducted: Math.max(0, Math.min(2, max) - Math.min(2, awarded)),
      deductionReason: currentQuestion.missingRequirements?.[0] || currentQuestion.reasonForDeduction,
      supportingProvision: currentQuestion.applicableProvisions?.[0],
      isDivergent: Math.min(2, awarded) < Math.min(2, max),
    });

    // Step 2: Application / Numerical Computations
    synthesized.push({
      id: 'synth-2',
      stepNumber: 2,
      componentType: 'CALCULATION',
      expectedRequirement: currentQuestion.suggestedAnswerReference
        ? `Standard solution schedule & computation notes: ${currentQuestion.suggestedAnswerReference}`
        : 'Detailed calculation schedules, working notes, and intermediate figures as per ICAI suggested answer.',
      studentEvidence: currentQuestion.detailedFeedback || 'Numerical and analytical working notes in submitted script.',
      assessment: awarded === max ? 'CORRECT' : awarded > 0 ? 'PARTIALLY_CORRECT' : 'INCORRECT',
      marksAwarded: Math.max(0, awarded - 2),
      marksAvailable: Math.max(1, max - 2),
      marksDeducted: Math.max(0, (max - 2) - (awarded - 2)),
      deductionReason: currentQuestion.reasonForDeduction,
      isDivergent: lost > 0,
    });

    return synthesized;
  }, [currentQuestion]);

  // Distinct component types for filter
  const componentTypes = useMemo(() => {
    const set = new Set<string>();
    steps.forEach((s) => set.add(s.componentType));
    return Array.from(set);
  }, [steps]);

  // Filtered steps
  const filteredSteps = useMemo(() => {
    return steps.filter((step) => {
      if (divergenceFilter === 'DIVERGENT_ONLY' && !step.isDivergent) return false;
      if (divergenceFilter === 'MATCHED_ONLY' && step.isDivergent) return false;
      if (selectedComponentType !== 'ALL' && step.componentType !== selectedComponentType) return false;
      return true;
    });
  }, [steps, divergenceFilter, selectedComponentType]);

  // Overall Divergence Stats across all questions
  const overallDivergenceStats = useMemo(() => {
    let totalQuestions = questions.length;
    let questionsWithDivergence = 0;
    let totalMarksLost = 0;
    let totalStepsEvaluated = 0;
    let totalDivergentSteps = 0;

    questions.forEach((q) => {
      if (q.marksLost > 0 || q.status !== 'correct') {
        questionsWithDivergence += 1;
      }
      totalMarksLost += q.marksLost || 0;

      const rawComps = q.markingComponents || q.structuredEvidence?.markingComponents || [];
      if (rawComps.length > 0) {
        totalStepsEvaluated += rawComps.length;
        totalDivergentSteps += rawComps.filter(
          (c) => c.assessment !== 'CORRECT' || (c.marksDeducted && c.marksDeducted > 0)
        ).length;
      } else {
        totalStepsEvaluated += 2;
        if (q.marksLost > 0) totalDivergentSteps += 1;
      }
    });

    return {
      totalQuestions,
      questionsWithDivergence,
      totalMarksLost,
      totalStepsEvaluated,
      totalDivergentSteps,
    };
  }, [questions]);

  // Current Question Stats
  const currentDivergencesCount = useMemo(() => {
    return steps.filter((s) => s.isDivergent).length;
  }, [steps]);

  const handlePrevQuestion = () => {
    if (activeQuestionIdx > 0) {
      setActiveQuestionIdx(activeQuestionIdx - 1);
    }
  };

  const handleNextQuestion = () => {
    if (activeQuestionIdx < questions.length - 1) {
      setActiveQuestionIdx(activeQuestionIdx + 1);
    }
  };

  return (
    <div
      id="model-answer-comparison-container"
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-hidden ${className}`}
    >
      {/* 1. Header Toolbar */}
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-slate-50 via-white to-blue-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/20">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-blue-600 text-white shadow-2xs">
                <Columns className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Overlay Divergence Engine
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                ICAI Benchmark vs. Student Script
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>Model Answer vs. Submitted Answer Comparison</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Side-by-side comparative overlay displaying exact points of divergence, missing statutory citations, and step marks variance.
            </p>
          </div>

          {/* Action & Layout Switches */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* View Layout Mode (Side-by-Side vs Unified Overlay) */}
            <div
              id="comparison-view-mode-toggle"
              className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
            >
              <button
                type="button"
                id="layout-mode-side-by-side"
                onClick={() => setLayoutMode('SIDE_BY_SIDE')}
                className={`px-3 py-1 font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  layoutMode === 'SIDE_BY_SIDE'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="View side-by-side columns"
              >
                <Columns className="w-3.5 h-3.5" />
                <span>Side-by-Side</span>
              </button>
              <button
                type="button"
                id="layout-mode-unified-overlay"
                onClick={() => setLayoutMode('UNIFIED_OVERLAY')}
                className={`px-3 py-1 font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  layoutMode === 'UNIFIED_OVERLAY'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="View unified overlay cards with highlighted diffs"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Unified Overlay</span>
              </button>
            </div>

            {/* Filter Divergences vs All */}
            <div
              id="divergence-filter-toggle"
              className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
            >
              <button
                type="button"
                id="filter-all-steps"
                onClick={() => setDivergenceFilter('ALL')}
                className={`px-2.5 py-1 font-semibold rounded-lg transition-colors cursor-pointer ${
                  divergenceFilter === 'ALL'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                }`}
              >
                All Steps ({steps.length})
              </button>
              <button
                type="button"
                id="filter-divergent-only"
                onClick={() => setDivergenceFilter('DIVERGENT_ONLY')}
                className={`px-2.5 py-1 font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                  divergenceFilter === 'DIVERGENT_ONLY'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>Divergences Only ({currentDivergencesCount})</span>
              </button>
            </div>

            {/* Close button if in Modal */}
            {isModal && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition cursor-pointer"
                title="Close Comparison View"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* 2. Question Selector Pills Bar */}
        <div className="mt-4 pt-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 overflow-x-auto">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mr-1">
              Select Question:
            </span>
            <div className="flex items-center gap-1.5">
              {questions.map((q, idx) => {
                const isActive = idx === activeQuestionIdx;
                const hasDivergence = q.marksLost > 0 || q.status !== 'correct';
                return (
                  <button
                    key={`q-pill-${idx}`}
                    id={`comparison-select-q-${q.questionNumber}`}
                    type="button"
                    onClick={() => setActiveQuestionIdx(idx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-400/40'
                        : hasDivergence
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-100 dark:hover:bg-rose-900/40'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                    }`}
                  >
                    <span>Q{q.questionNumber}{q.subQuestion ? `(${q.subQuestion})` : ''}</span>
                    <span className="text-[10px] opacity-80">
                      {q.marksAwarded}/{q.maximumMarks}m
                    </span>
                    {hasDivergence && (
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Prev / Next Navigator */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              id="comparison-prev-q-btn"
              onClick={handlePrevQuestion}
              disabled={activeQuestionIdx === 0}
              className="p-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition cursor-pointer"
              title="Previous Question"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300 px-1">
              {activeQuestionIdx + 1} / {questions.length}
            </span>
            <button
              type="button"
              id="comparison-next-q-btn"
              onClick={handleNextQuestion}
              disabled={activeQuestionIdx === questions.length - 1}
              className="p-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition cursor-pointer"
              title="Next Question"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Question Metadata & Divergence Summary Banner */}
      {currentQuestion && (
        <div className="p-4 sm:p-5 bg-slate-50/60 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Question {currentQuestion.questionNumber}
                  {currentQuestion.subQuestion ? ` (Sub-part ${currentQuestion.subQuestion})` : ''}
                </h3>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                    currentQuestion.status === 'correct'
                      ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                      : currentQuestion.status === 'partially_correct'
                      ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                      : 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                  }`}
                >
                  {currentQuestion.status.replace('_', ' ')}
                </span>
                {currentQuestion.consequentialErrorDetected && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    Consequential Marking Protected
                  </span>
                )}
                {currentQuestion.suggestedAnswerReference && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                    Ref: {currentQuestion.suggestedAnswerReference}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                {currentQuestion.detailedFeedback}
              </p>
            </div>

            {/* Score Pill */}
            <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 shrink-0">
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Marks Audit</span>
                <div className="flex items-baseline gap-1.5 font-mono">
                  <span className="text-lg font-black text-emerald-700 dark:text-emerald-400">
                    +{currentQuestion.marksAwarded}
                  </span>
                  <span className="text-xs text-slate-400">/ {currentQuestion.maximumMarks}m</span>
                  {currentQuestion.marksLost > 0 && (
                    <span className="text-xs font-bold text-rose-600 dark:text-rose-400 ml-1">
                      (-{currentQuestion.marksLost}m)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Divergence Point Alert Callout */}
          {currentQuestion.reasonForDeduction && (
            <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-rose-900 dark:text-rose-200 uppercase tracking-wide text-[10px] bg-rose-100 dark:bg-rose-900/60 px-1.5 py-0.2 rounded">
                    Identified Divergence
                  </span>
                  <span className="text-rose-700 dark:text-rose-300 font-semibold">
                    {currentQuestion.reasonForDeduction}
                  </span>
                </div>
                {currentQuestion.missingRequirements && currentQuestion.missingRequirements.length > 0 && (
                  <div className="pt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-rose-800 dark:text-rose-300">
                    <span className="font-semibold">Missing from Submitted Answer:</span>
                    {currentQuestion.missingRequirements.map((req, rIdx) => (
                      <span
                        key={rIdx}
                        className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800/80 font-mono text-[10px]"
                      >
                        • {req}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Valid Alternative Recognition Callout if applicable */}
          {currentQuestion.validAlternativeRecognition && (
            <div className="p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-blue-900 dark:text-blue-200 uppercase tracking-wide text-[10px] bg-blue-100 dark:bg-blue-900/60 px-1.5 py-0.2 rounded mr-1.5">
                  Substance-Over-Form Recognition
                </span>
                <span className="text-blue-800 dark:text-blue-300">
                  {currentQuestion.validAlternativeRecognition}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Column Header Strip for Side-by-Side Mode */}
      {layoutMode === 'SIDE_BY_SIDE' && (
        <div className="grid grid-cols-1 md:grid-cols-2 bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-800 text-xs font-bold divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-700">
          {/* Left Column Header: Submitted Answer */}
          <div className="p-3 sm:px-5 flex items-center justify-between bg-amber-50/30 dark:bg-amber-950/10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span className="text-slate-800 dark:text-slate-100 uppercase tracking-wider font-extrabold text-[11px]">
                Submitted Answer (Candidate Script)
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              Roll / Reg: {studentName}
            </span>
          </div>

          {/* Right Column Header: Model Answer */}
          <div className="p-3 sm:px-5 flex items-center justify-between bg-blue-50/30 dark:bg-blue-950/10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              <span className="text-slate-800 dark:text-slate-100 uppercase tracking-wider font-extrabold text-[11px]">
                Model Answer (ICAI Benchmark & Suggested Key)
              </span>
            </div>
            <span className="text-[10px] text-blue-700 dark:text-blue-400 font-mono font-semibold">
              Official Rubric
            </span>
          </div>
        </div>
      )}

      {/* 5. Main Comparative Step Cards */}
      <div className="p-4 sm:p-6 space-y-4">
        {filteredSteps.length > 0 ? (
          filteredSteps.map((step) => {
            const isFullCredit = step.marksAwarded >= step.marksAvailable;
            const isPartial = step.marksAwarded > 0 && step.marksAwarded < step.marksAvailable;
            const isOmittedOrZero = step.marksAwarded === 0;

            if (layoutMode === 'SIDE_BY_SIDE') {
              return (
                <div
                  key={step.id}
                  id={`comparison-step-${step.stepNumber}`}
                  className={`rounded-xl border transition-all ${
                    step.isDivergent
                      ? 'border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 shadow-2xs'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  }`}
                >
                  {/* Step Header Bar */}
                  <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-mono font-bold text-xs flex items-center justify-center">
                        {step.stepNumber}
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        [{step.componentType}]
                      </span>
                      {step.supportingProvision && (
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          {step.supportingProvision}
                        </span>
                      )}
                    </div>

                    {/* Step Marks & Divergence Pill */}
                    <div className="flex items-center gap-2">
                      {step.isDivergent ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                          <XCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                          <span>Divergence (-{step.marksDeducted}m)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          <span>Aligned (+{step.marksAwarded}m)</span>
                        </span>
                      )}

                      <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                        +{step.marksAwarded} / {step.marksAvailable}m
                      </span>
                    </div>
                  </div>

                  {/* Step Side-by-Side Content Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800 text-xs">
                    {/* Left: Submitted Answer */}
                    <div className="p-4 space-y-2 bg-amber-50/15 dark:bg-amber-950/5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        <span>Extracted Script Content</span>
                        <span className="text-[10px] font-mono text-amber-700 dark:text-amber-400">
                          {isFullCredit ? 'Full Credit' : isPartial ? 'Partial Slip' : 'Omitted / Incorrect'}
                        </span>
                      </div>

                      <div
                        className={`p-3 rounded-lg border font-mono text-xs leading-relaxed ${
                          isFullCredit
                            ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-900/40 text-slate-900 dark:text-slate-100'
                            : isPartial
                            ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-slate-900 dark:text-slate-100'
                            : 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 text-rose-950 dark:text-rose-200'
                        }`}
                      >
                        {step.studentEvidence ? (
                          <span>{step.studentEvidence}</span>
                        ) : (
                          <span className="italic text-slate-400">
                            [Omission: Candidate did not present working notes or provision for this step]
                          </span>
                        )}
                      </div>

                      {/* If candidate lost marks on this step, show divergence explanation */}
                      {step.deductionReason && (
                        <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-[11px] text-rose-800 dark:text-rose-300">
                          <span className="font-bold">Divergence Point:</span> {step.deductionReason}
                        </div>
                      )}
                    </div>

                    {/* Right: Model Answer */}
                    <div className="p-4 space-y-2 bg-blue-50/15 dark:bg-blue-950/5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-blue-700 dark:text-blue-300">
                        <span>ICAI Model Requirement</span>
                        <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400">
                          Max: {step.marksAvailable}m
                        </span>
                      </div>

                      <div className="p-3 rounded-lg border bg-blue-50/40 dark:bg-blue-950/30 border-blue-200/80 dark:border-blue-900/50 text-slate-900 dark:text-slate-100 font-mono text-xs leading-relaxed">
                        {step.expectedRequirement}
                      </div>

                      {step.supportingProvision && (
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5 pt-0.5">
                          <BookOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span>Authoritative Provision: <strong>{step.supportingProvision}</strong></span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            // UNIFIED OVERLAY LAYOUT
            return (
              <div
                key={step.id}
                id={`overlay-step-${step.stepNumber}`}
                className={`p-4 rounded-xl border text-xs space-y-3 ${
                  step.isDivergent
                    ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/10'
                    : 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/20 dark:bg-emerald-950/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-slate-200 dark:bg-slate-700 font-mono font-bold text-xs flex items-center justify-center">
                      {step.stepNumber}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      [{step.componentType}] Step Assessment
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        step.isDivergent
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}
                    >
                      {step.isDivergent ? `DIVERGENCE (-${step.marksDeducted}m)` : `MATCHED (+${step.marksAwarded}m)`}
                    </span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                      +{step.marksAwarded} / {step.marksAvailable}m
                    </span>
                  </div>
                </div>

                {/* Overlay Stack: Model vs Student */}
                <div className="space-y-2">
                  <div className="p-3 rounded-lg bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60">
                    <div className="text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300 tracking-wider mb-1 flex items-center justify-between">
                      <span>1. ICAI Model Answer Target</span>
                      <span>Target: {step.marksAvailable}m</span>
                    </div>
                    <p className="font-mono text-slate-900 dark:text-slate-100">{step.expectedRequirement}</p>
                  </div>

                  <div
                    className={`p-3 rounded-lg border font-mono ${
                      step.isDivergent
                        ? 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-950 dark:text-rose-200'
                        : 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center justify-between text-slate-500 dark:text-slate-400">
                      <span>2. Candidate Script Submission</span>
                      <span>Awarded: +{step.marksAwarded}m</span>
                    </div>
                    <p>{step.studentEvidence || '[Omission in candidate script]'}</p>
                  </div>

                  {step.deductionReason && (
                    <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <span><strong>Divergence Explanation:</strong> {step.deductionReason}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-10 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              No Divergent Steps Detected
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Your submitted answer for this question completely matched the ICAI model answer benchmarks across all evaluated steps.
            </p>
            <button
              type="button"
              onClick={() => setDivergenceFilter('ALL')}
              className="mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              Show All Steps
            </button>
          </div>
        )}
      </div>

      {/* 6. Footer Summary Strip */}
      <div className="p-4 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Aligned Steps: <strong>{steps.filter((s) => !s.isDivergent).length}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span>Divergent Steps: <strong>{currentDivergencesCount}</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>Grounded in ICAI Suggested Answers & Step-Marking Scheme</span>
        </div>
      </div>
    </div>
  );
};
