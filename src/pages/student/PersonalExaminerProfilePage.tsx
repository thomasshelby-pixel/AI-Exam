import React, { useState, useEffect } from 'react';
import {
  Dna,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  FileCheck2,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
  Sparkles,
  ShieldAlert,
  ArrowRight,
  Clock,
  HelpCircle,
} from 'lucide-react';
import { apiRequest } from '../../api/client.js';
import { formatDateIST } from '../../utils/timezone.js';

export interface EvidenceItem {
  evaluationId: string;
  evaluationVersionId: string;
  date: string;
  level: string;
  subjectKey: string;
  subjectName: string;
  paper: string;
  attempt: string;
  questionNumber: string;
  subQuestion?: string;
  marksLost: number;
  observedIssue: string;
  evidenceReference: string;
  deductionReason: string;
}

export interface RecurringPattern {
  id: string;
  title: string;
  category: string;
  description: string;
  detectionCount: number;
  evaluationsCount: number;
  typicalLoss: string;
  examples: string[];
  nextTimeRule: string;
  subjectArea: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence: EvidenceItem[];
}

export interface ImprovedPattern {
  id: string;
  title: string;
  previousOccurrenceCount: number;
  previousEvaluationsCount: number;
  recentStatus: string;
  status: 'IMPROVING' | 'RESOLVED';
  improvementSummary: string;
  evidenceComparison: {
    earlierEvaluationId: string;
    earlierQuestion: string;
    earlierLoss: number;
    recentEvaluationId: string;
    recentQuestion: string;
    recentLoss: number;
  };
}

export interface RecoveredMarkItem {
  subjectName: string;
  area: string;
  marksRecovered: number;
  detail: string;
  earlierEvaluationId: string;
  recentEvaluationId: string;
}

export interface SubjectExaminerPatternFlow {
  subjectCategory: 'LAW' | 'TAX' | 'ACCOUNTS' | 'AUDIT' | 'GENERAL';
  title: string;
  stepFlow: string[];
  observedCompliance: string;
  keyObservation: string;
}

export interface StudentExaminerProfile {
  studentId: string;
  evaluationsAnalysed: number;
  insufficientHistory: boolean;
  message?: string;
  recurringPatternsCount: number;
  improvedPatternsCount: number;
  attentionNeededCount: number;
  marksRecoveredTotal: number;
  recurringPatterns: RecurringPattern[];
  improvedPatterns: ImprovedPattern[];
  marksRecovered: RecoveredMarkItem[];
  subjectPatterns: SubjectExaminerPatternFlow[];
  currentFocusAreas: string[];
  lastEvaluationId?: string;
  updatedAt: string;
}

interface PersonalExaminerProfilePageProps {
  onNavigateUpload: () => void;
  onNavigateDashboard: () => void;
  onViewReport: (evaluationId: string) => void;
}

export const PersonalExaminerProfilePage: React.FC<PersonalExaminerProfilePageProps> = ({
  onNavigateUpload,
  onNavigateDashboard,
  onViewReport,
}) => {
  const [profile, setProfile] = useState<StudentExaminerProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPatternId, setExpandedPatternId] = useState<string | null>(null);
  const [activeSubjectTab, setActiveSubjectTab] = useState<'LAW' | 'TAX' | 'ACCOUNTS' | 'AUDIT'>('LAW');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const res = await apiRequest<{ profile: StudentExaminerProfile }>('/api/student/examiner-profile');
        if (res?.profile) {
          setProfile(res.profile);
        } else {
          setError('Could not retrieve profile data.');
        }
      } catch (err: any) {
        console.error('Failed to load examiner profile:', err);
        setError(err.message || 'Unable to connect to evaluation analytics.');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-1/3"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3"></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center space-y-4">
        <div className="p-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl text-red-700 dark:text-red-300">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-600" />
          <h2 className="text-base font-bold">Failed to load Personal Examiner Profile</h2>
          <p className="text-xs mt-1">{error || 'An unexpected error occurred.'}</p>
          <button
            onClick={onNavigateDashboard}
            className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const {
    evaluationsAnalysed,
    insufficientHistory,
    message,
    recurringPatternsCount,
    improvedPatternsCount,
    attentionNeededCount,
    marksRecoveredTotal,
    recurringPatterns,
    improvedPatterns,
    marksRecovered,
    subjectPatterns,
    currentFocusAreas,
  } = profile;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
      {/* Top Header & Breadcrumb */}
      <div className="space-y-3">
        <button
          onClick={onNavigateDashboard}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Dashboard</span>
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-bold mb-2">
              <Dna className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Mark-Loss DNA & Longitudinal Learning</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Your Personal Examiner Profile
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-2xl mt-1 leading-relaxed">
              Learns from your evaluated answer sheets to uncover recurring step-marking slipups, track verified improvements, and show you exactly where marks were lost and recovered.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onNavigateUpload}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>Evaluate New Paper</span>
            </button>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <FileCheck2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Evaluations Analysed
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
            {evaluationsAnalysed}
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500">
            {insufficientHistory ? 'Building baseline' : 'Authoritative answer history'}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Recurring Patterns
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
            {recurringPatternsCount}
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500">
            Verified across ≥2 evaluations
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Improved Patterns
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
            {improvedPatternsCount}
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500">
            Absent in recent evaluation
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            Marks Recovered
          </div>
          <div className="text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
            +{marksRecoveredTotal}
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500">
            Factual step comparison
          </div>
        </div>
      </div>

      {/* Insufficient History State */}
      {insufficientHistory && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-5 shadow-sm text-left">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400">
              <Dna className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Your Personal Examiner Profile is building
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                {message ||
                  'Complete at least 2 evaluations to identify recurring mark-loss patterns. A pattern is labeled "recurring" only when supported by multiple pieces of evidence across distinct evaluations to prevent false conclusions.'}
              </p>
            </div>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 space-y-2">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Examiner Profile Guarantees
            </div>
            <ul className="list-disc pl-5 space-y-1 text-slate-500 dark:text-slate-400">
              <li>
                <strong>No fake analytics:</strong> We never generate simulated trends or invent weaknesses without evaluated proof.
              </li>
              <li>
                <strong>Single evaluations are isolated:</strong> One low mark in an answer will never be labeled a "habit" or "recurring issue".
              </li>
              <li>
                <strong>Evidence-linked:</strong> Every detected pattern links directly to question numbers, deduction reasons, and step marks.
              </li>
            </ul>
          </div>

          <button
            onClick={onNavigateUpload}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer inline-flex items-center gap-2"
          >
            <span>Upload Your Next Answer Sheet</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Analytics Content (when >= 2 evaluations) */}
      {!insufficientHistory && (
        <>
          {/* Section 1: Recurring Mark-Loss Patterns */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Recurring Mark-Loss Patterns
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Observed across ≥2 distinct evaluations. Verified with step-marking deduction evidence.
                </p>
              </div>
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                {recurringPatterns.length} Identified
              </span>
            </div>

            {recurringPatterns.length === 0 ? (
              <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  No Chronic Mark-Loss Patterns Detected!
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Your answers demonstrate solid step consistency. No repetitive mistakes have spanned across multiple evaluations.
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {recurringPatterns.map((pattern) => {
                  const isExpanded = expandedPatternId === pattern.id;
                  return (
                    <div
                      key={pattern.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs transition hover:border-slate-300 dark:hover:border-slate-700"
                    >
                      <div
                        className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none"
                        onClick={() => setExpandedPatternId(isExpanded ? null : pattern.id)}
                      >
                        <div className="space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                pattern.severity === 'HIGH'
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                              }`}
                            >
                              {pattern.severity} Priority
                            </span>
                            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                              {pattern.category}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              • Typical loss: {pattern.typicalLoss}
                            </span>
                          </div>

                          <h3 className="text-base font-bold text-slate-900 dark:text-white">
                            {pattern.title}
                          </h3>

                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            {pattern.description}
                          </p>

                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                              Detected in {pattern.detectionCount} answer components across{' '}
                              {pattern.evaluationsCount} evaluations:
                            </span>
                            {pattern.examples.map((ex, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-mono font-bold"
                              >
                                {ex}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            type="button"
                            className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline"
                          >
                            <span>{isExpanded ? 'Hide Evidence' : 'Inspect Evidence'}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Next-time Rule Banner */}
                      <div className="px-5 py-3 bg-blue-50/70 dark:bg-blue-950/40 border-t border-blue-100 dark:border-blue-900/60 flex items-start gap-2.5 text-xs text-blue-900 dark:text-blue-200">
                        <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-bold">Next-Time Rule: </strong>
                          <span>{pattern.nextTimeRule}</span>
                        </div>
                      </div>

                      {/* Expanded Evidence Drawer */}
                      {isExpanded && (
                        <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Audited Deduction Evidence ({pattern.evidence.length} Records)
                            </h4>
                            <span className="text-[10px] text-slate-400">
                              Linked directly to original evaluation IDs
                            </span>
                          </div>

                          <div className="space-y-2">
                            {pattern.evidence.map((ev, eIdx) => (
                              <div
                                key={eIdx}
                                className="p-3.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-1.5 shadow-2xs"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-900 dark:text-white font-mono">
                                      {ev.questionNumber}
                                    </span>
                                    {ev.subQuestion && (
                                      <span className="text-slate-500 dark:text-slate-400">
                                        ({ev.subQuestion})
                                      </span>
                                    )}
                                    <span className="text-slate-400">•</span>
                                    <span className="font-medium text-slate-600 dark:text-slate-300">
                                      {ev.subjectName}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-rose-600 dark:text-rose-400 font-mono font-bold">
                                      -{ev.marksLost} marks
                                    </span>
                                    <button
                                      onClick={() => onViewReport(ev.evaluationId)}
                                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                                    >
                                      View Report →
                                    </button>
                                  </div>
                                </div>

                                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                                  <strong className="text-slate-700 dark:text-slate-200">Issue: </strong>
                                  {ev.observedIssue}
                                </p>

                                <div className="text-[11px] text-slate-400 dark:text-slate-500 flex flex-wrap gap-4 pt-1">
                                  <span>Eval ID: <code className="font-mono">{ev.evaluationId}</code> ({ev.evaluationVersionId})</span>
                                  <span>Date: {formatDateIST(ev.date)}</span>
                                  <span>Ref: {ev.evidenceReference}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Improved Patterns & Marks Recovered */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Improved Areas */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Improved Answer Patterns
                </h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  {improvedPatterns.length} Improving
                </span>
              </div>

              {improvedPatterns.length === 0 ? (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs text-slate-500 dark:text-slate-400 text-center">
                  Continue evaluating your papers to record verified pattern resolutions and track improvement.
                </div>
              ) : (
                <div className="space-y-3">
                  {improvedPatterns.map((imp) => (
                    <div
                      key={imp.id}
                      className="p-3.5 bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 rounded-lg space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                        <span>{imp.title}</span>
                        <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded">
                          {imp.status}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                        {imp.improvementSummary}
                      </p>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        Previous penalty: -{imp.evidenceComparison.earlierLoss} marks in{' '}
                        {imp.evidenceComparison.earlierQuestion} → 0 penalty in recent evaluation.
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Marks Recovered */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Marks Recovered Across Previous Evaluations
                </h3>
                <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  +{marksRecoveredTotal} Marks
                </span>
              </div>

              {marksRecovered.length === 0 ? (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs text-slate-500 dark:text-slate-400 text-center">
                  Factual comparisons will appear once step-marking deficiencies are resolved in subsequent evaluated submissions.
                </div>
              ) : (
                <div className="space-y-3">
                  {marksRecovered.map((rec, rIdx) => (
                    <div
                      key={rIdx}
                      className="p-3.5 bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/60 rounded-lg space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                        <span>{rec.area}</span>
                        <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                          +{rec.marksRecovered} marks
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                        {rec.detail}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Strictly factual comparison derived from your earlier and recent answer sheets.
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Subject-Specific Examiner Patterns (CA-Specific Flow) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Subject-Specific Examiner Step Flows
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ICAI examiners look for discipline across specific answer components for each subject archetype.
                </p>
              </div>

              {/* Subject Tabs */}
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                {(['LAW', 'TAX', 'ACCOUNTS', 'AUDIT'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveSubjectTab(cat)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                      activeSubjectTab === cat
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Active Subject Flow Card */}
            {(() => {
              const curPattern = subjectPatterns.find((p) => p.subjectCategory === activeSubjectTab) || {
                subjectCategory: activeSubjectTab,
                title:
                  activeSubjectTab === 'LAW'
                    ? 'Corporate & Economic Laws'
                    : activeSubjectTab === 'TAX'
                    ? 'Direct & Indirect Taxation'
                    : activeSubjectTab === 'ACCOUNTS'
                    ? 'Financial Reporting & Accounting'
                    : 'Auditing & Professional Ethics',
                stepFlow:
                  activeSubjectTab === 'LAW'
                    ? ['Provision', 'Application', 'Conclusion']
                    : activeSubjectTab === 'TAX'
                    ? ['Provision', 'Computation', 'Treatment', 'Conclusion']
                    : activeSubjectTab === 'ACCOUNTS'
                    ? ['Working', 'Adjustment', 'Calculation', 'Final Answer']
                    : ['Standard/Provision', 'Explanation', 'Application', 'Conclusion'],
                observedCompliance: 'No completed evaluations in this category yet',
                keyObservation:
                  'Upload a paper for this subject to audit your step compliance against official ICAI suggested answer patterns.',
              };

              return (
                <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="font-bold text-sm text-slate-900 dark:text-white">
                      {curPattern.title}
                    </div>
                    <div className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100/70 dark:bg-blue-900/40 px-2.5 py-0.5 rounded-full">
                      {curPattern.observedCompliance}
                    </div>
                  </div>

                  {/* Flow Steps Visualizer */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {curPattern.stepFlow.map((step, sIdx) => (
                      <React.Fragment key={step}>
                        <div className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-2xs">
                          <span className="text-slate-400 font-mono text-[10px] mr-1.5">
                            {sIdx + 1}.
                          </span>
                          {step}
                        </div>
                        {sIdx < curPattern.stepFlow.length - 1 && (
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-white dark:bg-slate-900 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    <strong className="text-slate-900 dark:text-white">Examiner Observation: </strong>
                    {curPattern.keyObservation}
                  </p>
                </div>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
};
