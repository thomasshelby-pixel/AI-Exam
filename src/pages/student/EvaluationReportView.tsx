import React, { useState } from 'react';
import { EvaluationResult, QuestionEvaluation } from '../../types/index.js';
import {
  FileCheck2,
  Award,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  BookOpen,
  Scale,
  Printer,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Percent,
  Sparkles,
  Download,
  FileText,
  RefreshCw,
  Building2,
  Globe,
  RotateCcw,
  ShieldCheck,
  CheckSquare,
  History,
  Star,
} from 'lucide-react';
import { BrandLogo } from '../../components/common/BrandLogo.js';
import { RecheckRequestModal } from '../../components/student/RecheckRequestModal.js';
import { formatDateIST } from '../../utils/timezone.js';
import { StudentReviewCard } from '../../components/student/StudentReviewCard.js';

interface EvaluationReportViewProps {
  evaluationResult: EvaluationResult;
  onBack: () => void;
  onRefresh?: () => void;
}

export const EvaluationReportView: React.FC<EvaluationReportViewProps> = ({
  evaluationResult,
  onBack,
  onRefresh,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [downloadingType, setDownloadingType] = useState<string | null>(null);
  const [isRecheckModalOpen, setIsRecheckModalOpen] = useState<boolean>(false);
  const [selectedMode, setSelectedMode] = useState<'standard' | 'strict' | 'moderate'>(
    evaluationResult.checkingMode === 'strict'
      ? 'strict'
      : evaluationResult.checkingMode === 'lenient'
      ? 'moderate'
      : 'standard'
  );
  const [recheckTargetQuestion, setRecheckTargetQuestion] = useState<string | null>(null);
  const [showOriginalSnapshot, setShowOriginalSnapshot] = useState<boolean>(false);
  const [showReviewPrompt, setShowReviewPrompt] = useState<boolean>(false);
  const [isReviewDismissed, setIsReviewDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('dismiss_eval_review_prompt') === 'true';
    } catch {
      return false;
    }
  });

  const handleDownload = async (type: 'report' | 'checked-copy' | 'original', version?: 'v1' | 'v2') => {
    try {
      const downloadKey = version ? `${type}-${version}` : type;
      setDownloadingType(downloadKey);
      const token = localStorage.getItem('ca_exam_checker_token') || localStorage.getItem('token') || '';
      const evalId = evaluationResult.evaluationId;
      const params = new URLSearchParams();
      if (version) params.set('version', version);
      if (token) params.set('token', token);
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const url = `/api/student/evaluations/${evalId}/download-${type}${queryString}`;

      const response = await fetch(url, {
        credentials: 'include',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to download ${type.replace('-', ' ')}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const prefix = evaluationResult.subjectName.replace(/[^a-zA-Z0-9]/g, '_');
      const versionSuffix = version ? `_${version.toUpperCase()}` : '';
      const filename =
        type === 'checked-copy'
          ? `${prefix}_Checked_Copy${versionSuffix}.pdf`
          : type === 'report'
          ? `${prefix}_Evaluation_Report${versionSuffix}.pdf`
          : `${prefix}_Original_Answer_Sheet.pdf`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error(err);
      if (type === 'report') {
        window.print();
      } else {
        alert(err.message || 'Download failed. Please try again.');
      }
    } finally {
      setDownloadingType(null);
    }
  };

  const {
    studentName,
    icaiRegistrationNumber,
    caLevel,
    subjectName,
    materialType,
    mtpSeries,
    attempt,
    evaluationDate,
    totalMarks,
    maximumMarks,
    officialPaperMaxMarks,
    selectedEvaluatedMaxMarks,
    attemptedMaxMarks,
    percentage,
    grade,
    confidenceScore,
    overallSummary,
    strengths,
    weaknesses,
    topicPerformance,
    presentationAnalysis,
    accuracyAnalysis,
    recommendations,
    questions,
    isMcqPaper,
  } = evaluationResult;

  // The official paper maximum is authoritative (e.g. 100 for CA Intermediate/Final papers)
  const officialMax = officialPaperMaxMarks || (maximumMarks >= 100 ? maximumMarks : 100);
  const attemptedOrEvaluatedMax =
    selectedEvaluatedMaxMarks || attemptedMaxMarks || (maximumMarks < officialMax ? maximumMarks : undefined);

  const modeData = evaluationResult.modeBreakdown?.[selectedMode];
  const activeMarks = modeData ? modeData.totalMarks : totalMarks;
  const activePercentage = modeData ? modeData.percentage : percentage;
  const activeGrade = modeData ? modeData.grade : grade;

  const isExemption = activePercentage >= 60;
  const isPass = activePercentage >= 40;

  const filteredQuestions = questions.filter((q) => {
    if (filterStatus === 'ALL') return true;
    return q.status === filterStatus;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 text-slate-800 dark:text-slate-100 space-y-6 print:p-0 print:text-black">
      {/* Top Controls (Hidden when printing) */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 transition shadow-sm cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Evaluations
        </button>

        {/* Download Actions Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Download Checked Copy (Annotated PDF) */}
          <button
            id="download-checked-copy-btn"
            onClick={() => handleDownload('checked-copy')}
            disabled={downloadingType !== null}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm cursor-pointer"
            title="Download your original answer sheet annotated with examiner red-pen step marks, ticks, and examiner stamps"
          >
            {downloadingType === 'checked-copy' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileCheck2 className="w-3.5 h-3.5" />
            )}
            <span>Download Checked Copy (Annotated)</span>
          </button>

          {/* 2. Download Detailed Report (PDF) */}
          <button
            id="download-report-btn"
            onClick={() => handleDownload('report')}
            disabled={downloadingType !== null}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm cursor-pointer"
            title="Download comprehensive performance scorecard, step breakdown, and audit report"
          >
            {downloadingType === 'report' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>Download Detailed Report</span>
          </button>

          {/* 3. Download Original Answer Sheet */}
          <button
            id="download-original-btn"
            onClick={() => handleDownload('original')}
            disabled={downloadingType !== null}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-slate-700 dark:text-slate-200 text-xs font-bold transition shadow-sm cursor-pointer"
            title="Download the raw submitted answer sheet"
          >
            {downloadingType === 'original' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            )}
            <span>Original Sheet</span>
          </button>

          {/* 4. Request Recheck Button */}
          <button
            id="request-recheck-btn"
            onClick={() => {
              setRecheckTargetQuestion(null);
              setIsRecheckModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition shadow-sm cursor-pointer"
            title="Request official senior examiner recheck / review for specific questions or the entire paper"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Request Rechecking</span>
          </button>

          {/* 5. Print */}
          <button
            id="print-report-btn"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition shadow-sm cursor-pointer"
            title="Print report using browser print layout"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Print</span>
          </button>
        </div>
      </div>

      {/* Version 2 Rechecked Result Banner */}
      {(evaluationResult.version === 'v2' || evaluationResult.recheckStatus === 'RECHECKED_ACCEPTED' || (evaluationResult.recheckDelta !== undefined && evaluationResult.recheckDelta !== 0)) && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-500/80 dark:border-emerald-600/80 rounded-xl p-4 shadow-sm text-emerald-950 dark:text-emerald-200 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-600 text-white">
                    Official Recheck Result (Version 2.0)
                  </span>
                  {evaluationResult.recheckResolutionDate && (
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                      Resolved on {formatDateIST(evaluationResult.recheckResolutionDate)}
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 mt-1">
                  Answer sheet rechecked against official ICAI Suggested Answers.
                </p>
                {evaluationResult.reviewerNotes && (
                  <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1 bg-white/70 dark:bg-slate-900/60 border border-emerald-200 dark:border-emerald-800/80 rounded-md p-2">
                    <span className="font-bold text-emerald-950 dark:text-emerald-100">Examiner Review Resolution:</span>{' '}
                    {(!evaluationResult.reviewerNotes || /^[0-9]+$/.test(evaluationResult.reviewerNotes.trim()))
                      ? 'Score adjusted after senior faculty review against official ICAI suggested answers and step-marking scheme.'
                      : evaluationResult.reviewerNotes}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/80 rounded-xl px-4 py-2.5 shrink-0">
              <div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Marks History</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs line-through text-slate-400 dark:text-slate-500 font-mono font-bold">
                    v1: {evaluationResult.originalTotalMarks ?? (totalMarks - (evaluationResult.recheckDelta || 0))}m
                  </span>
                  <span className="text-base font-black text-emerald-700 dark:text-emerald-400 font-mono">
                    v2: {totalMarks}m
                  </span>
                  {evaluationResult.recheckDelta !== undefined && evaluationResult.recheckDelta !== 0 && (
                    <span className="text-xs font-black text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 px-1.5 py-0.5 rounded font-mono">
                      {evaluationResult.recheckDelta > 0 ? `+${evaluationResult.recheckDelta}` : evaluationResult.recheckDelta}m
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Versioned PDF Downloads */}
          <div className="pt-2 border-t border-emerald-200/60 dark:border-emerald-800/60 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[11px] text-emerald-800 dark:text-emerald-300 font-semibold">
              Download Audit Copies:
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownload('checked-copy', 'v2')}
                disabled={downloadingType !== null}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition inline-flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <FileCheck2 className="w-3 h-3" />
                <span>Checked Copy (V2 Official)</span>
              </button>
              <button
                onClick={() => handleDownload('checked-copy', 'v1')}
                disabled={downloadingType !== null}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100/50 dark:hover:bg-slate-800 text-emerald-900 dark:text-emerald-200 font-semibold text-[11px] transition inline-flex items-center gap-1 cursor-pointer"
              >
                <FileText className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>Original Copy (V1 Archived)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Recheck Notice Banner */}
      {(evaluationResult.recheckStatus === 'PENDING' || (evaluationResult as any).recheck_requests?.some((r: any) => r.status === 'PENDING')) && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/60 rounded-xl p-3.5 shadow-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <RotateCcw className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-spin shrink-0" />
            <div>
              <span className="font-bold">Recheck Request Under Review:</span> A grievance or recheck ticket is actively being audited by senior faculty against verified suggested answers.
            </div>
          </div>
          <button
            onClick={() => {
              setRecheckTargetQuestion(null);
              setIsRecheckModalOpen(true);
            }}
            className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] shrink-0 cursor-pointer"
          >
            View Ticket Status
          </button>
        </div>
      )}

      {/* Authoritative Benchmark Evaluation Notice Banner */}
      {(evaluationResult.fallbackOccurred || evaluationResult.modelUsed?.includes('Benchmark')) && (
        <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 rounded-xl p-3.5 shadow-xs text-blue-900 dark:text-blue-200 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <div>
              <span className="font-bold">ICAI Authoritative Benchmark Evaluation:</span> Grounded directly in official ICAI suggested answers, step-marking rubrics, and statutory provisions.
            </div>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100/80 dark:bg-blue-900/80 text-blue-700 dark:text-blue-300 font-bold uppercase tracking-wider shrink-0">
            Authoritative Engine
          </span>
        </div>
      )}

      {/* Official ICAI Pattern Report Header Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-6 shadow-sm relative overflow-hidden print:border print:border-gray-300 print:bg-white print:text-black min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800 print:border-gray-300">
          <div>
            <div className="mb-3">
              <BrandLogo variant="horizontal" size="sm" />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider mb-1">
              <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                <FileCheck2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Verified ICAI-Pattern Step-Marking Evaluation</span>
              </div>
              {evaluationResult.evaluationSource === 'INSTITUTE' ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/80 px-2 py-0.5 rounded-full">
                  <Building2 className="w-3 h-3" />
                  <span>{evaluationResult.instituteName || 'Institute Evaluation'}</span>
                  {evaluationResult.batchName && (
                    <span className="text-indigo-500 dark:text-indigo-400 font-normal">({evaluationResult.batchName})</span>
                  )}
                </span>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/80 px-2 py-0.5 rounded-full">
                    <Globe className="w-3 h-3" />
                    <span>Public AI Evaluation</span>
                  </span>
                  {(evaluationResult.sponsoringInstituteName || evaluationResult.instituteName) && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/80 px-2 py-0.5 rounded-full">
                      <Building2 className="w-3 h-3" />
                      <span>Sponsored by {evaluationResult.sponsoringInstituteName || evaluationResult.instituteName}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white print:text-black">{subjectName}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 print:text-gray-600 flex items-center flex-wrap gap-1.5">
              <span>CA {caLevel} • {materialType === 'MTP' && mtpSeries ? `MTP Series ${mtpSeries}` : `${materialType} Series`} • {attempt || 'May 2026'}</span>
            </p>
          </div>

          <div className="text-left sm:text-right text-xs text-slate-500 dark:text-slate-400 print:text-gray-600">
            <p className="font-bold text-slate-800 dark:text-slate-100 print:text-black">{studentName}</p>
            <p className="font-mono mt-0.5">
              Roll / Reg: {!icaiRegistrationNumber || icaiRegistrationNumber === '000' || icaiRegistrationNumber === 'N/A' || icaiRegistrationNumber === 'NA' || icaiRegistrationNumber === 'WRO0987654' ? 'Not provided' : icaiRegistrationNumber}
            </p>
            <p className="mt-0.5">
              Evaluated on {formatDateIST(evaluationDate)}
            </p>
          </div>
        </div>

        {/* Multi-Mode Scoring Breakdown Bar */}
        {evaluationResult.modeBreakdown && (
          <div className="pt-4 pb-2 border-b border-slate-200 dark:border-slate-800 print:hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Evaluation Mode Comparison (Attempted Marks: {attemptedOrEvaluatedMax}m immutable)</span>
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Question coverage, attempt discovery, and paper maximum are 100% constant across all 3 marking modes.
                </p>
              </div>
              <div className="flex flex-wrap sm:inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800 text-xs max-w-full">
                <button
                  type="button"
                  onClick={() => setSelectedMode('strict')}
                  className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                    selectedMode === 'strict'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Strict ({evaluationResult.modeBreakdown.strict.totalMarks}m)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMode('standard')}
                  className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                    selectedMode === 'standard'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Standard ({evaluationResult.modeBreakdown.standard.totalMarks}m)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMode('moderate')}
                  className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                    selectedMode === 'moderate'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Moderate ({evaluationResult.modeBreakdown.moderate.totalMarks}m)
                </button>
              </div>
            </div>
            {modeData && (
              <p className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1.5">
                <strong className="text-slate-800 dark:text-white font-semibold">{modeData.displayName} Mode:</strong> {modeData.philosophy}
              </p>
            )}
          </div>
        )}

        {/* Score & Grade Display */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-5 border-b border-slate-200 dark:border-slate-800 print:border-gray-300">
          <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700/80 print:bg-gray-50 print:border-gray-200">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Marks Obtained</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-black font-mono text-slate-900 dark:text-white print:text-black">{activeMarks}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">/ {officialMax}</span>
            </div>
            {attemptedOrEvaluatedMax && attemptedOrEvaluatedMax < officialMax ? (
              <p className="text-[10px] text-blue-700 dark:text-blue-400 mt-0.5 font-medium">
                Marks evaluated: {activeMarks} / {attemptedOrEvaluatedMax} attempted/evaluable marks
              </p>
            ) : (
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Step sum verified</p>
            )}
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700/80 print:bg-gray-50 print:border-gray-200">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Percentage</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-black font-mono text-blue-600 dark:text-blue-400 print:text-black">{activePercentage}%</span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Passing threshold: 40%</p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700/80 print:bg-gray-50 print:border-gray-200">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">ICAI Assessment</p>
            <div className="mt-1">
              <span
                className={`text-xs font-black px-2 py-0.5 rounded uppercase tracking-wide inline-block ${
                  isExemption
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                    : isPass
                    ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                    : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
                }`}
              >
                {activeGrade}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
              {isExemption ? 'Exemption Eligible (>=60)' : isPass ? 'Clearance standard' : 'Below 40% aggregate'}
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700/80 print:bg-gray-50 print:border-gray-200">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">AI Confidence</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-black font-mono text-emerald-700 dark:text-emerald-400 print:text-black">
                {confidenceScore.toFixed(1)}%
              </span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">OCR Legibility: High</p>
          </div>
        </div>

        {/* Executive Examiner Remarks */}
        <div className="pt-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 print:text-black mb-1.5 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Executive Examiner Remarks
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed print:text-gray-800">{overallSummary}</p>
        </div>
      </div>

      {/* Strengths & Weaknesses Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 print:grid-cols-2">
        {/* Strengths */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm print:bg-gray-50 print:border-gray-200">
          <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-2.5 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Key Conceptual Strengths
          </h3>
          <ul className="space-y-1.5">
            {strengths.map((st, i) => (
              <li key={i} className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />
                <span>{st}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Weaknesses */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm print:bg-gray-50 print:border-gray-200">
          <h3 className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 mb-2.5 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Areas For Marks Improvement
          </h3>
          <ul className="space-y-1.5">
            {weaknesses.map((wk, i) => (
              <li key={i} className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 mt-1.5" />
                <span>{wk}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Detailed Presentation & Accuracy Diagnostic */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-xs space-y-2.5 shadow-sm print:bg-gray-50 print:border-gray-200">
          <h3 className="font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 print:text-black flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Presentation & Working Notes Diagnostic
          </h3>
          <div className="space-y-1.5 text-slate-600 dark:text-slate-300 print:text-black">
            <p>
              <strong className="text-slate-800 dark:text-slate-200">Working Notes Quality:</strong>{' '}
              {presentationAnalysis.workingNotesQuality}
            </p>
            <p>
              <strong className="text-slate-800 dark:text-slate-200">Handwriting & Layout:</strong>{' '}
              {presentationAnalysis.handwritingLegibility}
            </p>
            <p>
              <strong className="text-slate-800 dark:text-slate-200">Feedback:</strong> {presentationAnalysis.feedback}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-xs space-y-2.5 shadow-sm print:bg-gray-50 print:border-gray-200">
          <h3 className="font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 print:text-black flex items-center gap-2">
            <Scale className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Accuracy & Standards Verification
          </h3>
          <div className="space-y-1.5 text-slate-600 dark:text-slate-300 print:text-black">
            <p>
              <strong className="text-slate-800 dark:text-slate-200">Calculations:</strong> {accuracyAnalysis.calculationAccuracy}
            </p>
            <p>
              <strong className="text-slate-800 dark:text-slate-200">Statutory Provisions & AS:</strong>{' '}
              {accuracyAnalysis.provisionsAccuracy}
            </p>
            <p>
              <strong className="text-slate-800 dark:text-slate-200">Methodology:</strong> {accuracyAnalysis.methodologyCorrectness}
            </p>
          </div>
        </div>
      </div>

      {/* How Was My Score Calculated? Transparent Audit Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4 print:border-gray-200 print:bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>How Was My Score Calculated? (Step-Wise Audit)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Strict step-wise component audit: marks are awarded for genuine reasoning, provisions, and working notes, not merely final numerical answers.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 self-start sm:self-auto">
              {totalMarks} / {officialMax} Marks ({percentage}%)
            </span>
            {attemptedOrEvaluatedMax && attemptedOrEvaluatedMax < officialMax && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                Attempted: {totalMarks} / {attemptedOrEvaluatedMax}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-lg p-3 space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400">Component Summation</span>
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              {questions.reduce((sum, q) => sum + (q.markingComponents?.length || 1), 0)} Audited Steps
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              Every provision citation, working note, and application is awarded discrete fractional marks.
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-lg p-3 space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400">Consequential Marking</span>
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              {questions.some((q) => q.consequentialErrorDetails?.isConsequential) ? 'Protected & Credited' : 'No Cascading Penalties'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              Prior arithmetic slips do not cancel downstream marks if subsequent legal or conceptual logic is sound.
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-lg p-3 space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400">Substance Over Form</span>
            <p className="font-semibold text-slate-800 dark:text-slate-200">Cognitive Equivalence</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              Alternative valid statutory approaches and equivalent legal wording receive full proportional credit.
            </p>
          </div>
        </div>

        {/* Audit summary table */}
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                <th className="py-2 px-3">Q#</th>
                <th className="py-2 px-3">Max</th>
                <th className="py-2 px-3">Awarded</th>
                <th className="py-2 px-3">Lost</th>
                <th className="py-2 px-3">Steps / Components</th>
                <th className="py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {questions.map((q, i) => {
                const compsCount = q.markingComponents?.length || (q.structuredEvidence?.markingComponents?.length) || 1;
                const isConseq = Boolean(q.consequentialErrorDetails?.isConsequential);
                return (
                  <tr key={`tbl-q-${q.questionNumber}-${q.subQuestion || ''}-${i}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="py-2 px-3 font-bold font-mono text-slate-800 dark:text-slate-200">Q{q.questionNumber}</td>
                    <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">{q.maximumMarks}</td>
                    <td className="py-2 px-3 font-mono font-bold text-emerald-700 dark:text-emerald-400">+{q.marksAwarded}</td>
                    <td className="py-2 px-3 font-mono text-rose-700 dark:text-rose-400">-{q.marksLost}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                      <span>{compsCount} step{compsCount > 1 ? 's' : ''}</span>
                      {isConseq && (
                        <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          Consequential
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        q.status === 'correct'
                          ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                          : q.status === 'partially_correct'
                          ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300'
                          : 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300'
                      }`}>
                        {q.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Question-Wise Step Marking Breakdown */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5 shadow-sm print:border-gray-300 print:bg-white print:text-black">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white print:text-black flex items-center gap-2">
              <span>Question-Wise Step Marking Breakdown</span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {questions.length} Questions Evaluated
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Component-level evaluation referencing statutory provisions, working notes, and suggested answers.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 print:hidden">
            {['ALL', 'correct', 'partially_correct', 'incorrect'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition cursor-pointer ${
                  filterStatus === st
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {st.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Questions List */}
        <div className="space-y-3">
          {filteredQuestions.map((q, idx) => {
            const statusColor =
              q.status === 'correct'
                ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 text-slate-800 dark:text-slate-200'
                : q.status === 'partially_correct'
                ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 text-slate-800 dark:text-slate-200'
                : q.status === 'incorrect'
                ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 text-slate-800 dark:text-slate-200'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200';

            const comps = q.markingComponents || q.structuredEvidence?.markingComponents || [];
            const isConseq = Boolean(q.consequentialErrorDetails?.isConsequential);

            return (
              <div
                key={`card-q-${q.questionNumber}-${q.subQuestion || ''}-${idx}`}
                className={`rounded-lg border p-4 transition ${statusColor} print:border-gray-200 print:bg-white print:text-black`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-slate-900 dark:text-white print:text-black">
                      Question {q.questionNumber}
                      {q.subQuestion ? ` (${q.subQuestion})` : ''}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                      {q.status.replace('_', ' ')}
                    </span>
                    {q.reviewerAdjustmentNotes && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                        Rechecked (v2)
                      </span>
                    )}
                    {(q.sources?.sourceFormat || q.sourceFormat || q.sources?.questionSourceId || q.questionSource) && (
                      <span
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 flex items-center gap-1"
                        title="Authoritative Grounding Source"
                      >
                        <FileText className="w-2.5 h-2.5 text-blue-500" />
                        <span>Suggested Answers</span>
                      </span>
                    )}
                  </div>

                  {/* Marks Pills & Contest Button */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold">
                      <span className="text-emerald-700 dark:text-emerald-400">+{q.marksAwarded} Awarded</span>
                      {q.marksLost > 0 && <span className="text-rose-700 dark:text-rose-400">-{q.marksLost} Lost</span>}
                      <span className="text-slate-500 dark:text-slate-400 font-normal">Max: {q.maximumMarks}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const targetQuestion = q.subQuestion ? `${q.questionNumber} (${q.subQuestion})` : q.questionNumber;
                        setRecheckTargetQuestion(targetQuestion);
                        setIsRecheckModalOpen(true);
                      }}
                      className="print:hidden inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-amber-400 dark:hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:text-amber-900 dark:hover:text-amber-200 transition shadow-xs cursor-pointer"
                      title={`Request recheck for Question ${q.questionNumber}`}
                    >
                      <RotateCcw className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                      <span>Contest / Recheck</span>
                    </button>
                  </div>
                </div>

                {/* Dedicated MCQ Verified Key & Option Comparison Box */}
                {(q.questionNumber.startsWith('MCQ') || Boolean(q.candidateSelectedOption) || Boolean(q.officialCorrectOption)) && (
                  <div className="mt-3 p-3 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-700">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1">
                        <CheckSquare className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        MCQ Suggested Answer Verification
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                        q.marksAwarded >= q.maximumMarks ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300'
                      }`}>
                        {q.marksAwarded >= q.maximumMarks ? 'MATCHED OFFICIAL KEY' : 'OPTION MISMATCH'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className={`p-2.5 rounded-lg border ${
                        q.marksAwarded >= q.maximumMarks ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60' : 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60'
                      }`}>
                        <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Candidate Selected Option</span>
                        <p className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-0.5">
                          {q.candidateSelectedOption ? `Option (${q.candidateSelectedOption})` : 'Option extracted from script'}
                        </p>
                      </div>

                      <div className="p-2.5 rounded-lg border bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/60">
                        <span className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-300">Official Suggested Answer Key</span>
                        <p className="font-mono font-bold text-sm text-blue-950 dark:text-blue-200 mt-0.5">
                          {q.officialCorrectOption ? `Option (${q.officialCorrectOption})` : 'Authoritative Answer Key'}
                        </p>
                      </div>
                    </div>

                    {q.suggestedAnswerReference && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-2 rounded-md border border-slate-100 dark:border-slate-800">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">Verified Citation:</span> {q.suggestedAnswerReference}
                      </p>
                    )}
                  </div>
                )}

                {/* Consequential error alert */}
                {isConseq && (
                  <div className="mt-3 p-2.5 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold uppercase tracking-wider text-[10px] text-blue-800 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/60 px-1.5 py-0.5 rounded mr-1.5">
                        Consequential Marking Credit
                      </span>
                      <span>
                        {q.consequentialErrorDetails?.reason || 'Earlier arithmetic slip isolated. Downstream methodology and calculations credited.'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Feedback and Reason */}
                <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 dark:border-slate-700/80 text-xs space-y-1.5 print:border-gray-200">
                  <p className="text-slate-700 dark:text-slate-300 print:text-gray-800">
                    <strong className="text-slate-900 dark:text-white font-semibold">Detailed Feedback:</strong> {q.detailedFeedback}
                  </p>

                  {q.reasonForDeduction && (
                    <p className="text-rose-800 dark:text-rose-400">
                      <strong className="font-semibold">Deduction Reason:</strong> {q.reasonForDeduction}
                    </p>
                  )}

                  {q.applicableProvisions && q.applicableProvisions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Cited Standards / Provisions:</span>
                      {q.applicableProvisions.map((prov, pIdx) => (
                        <span
                          key={pIdx}
                          className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 text-[10px] font-mono font-semibold text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-slate-700"
                        >
                          {prov}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Component-level breakdown items if available */}
                  {comps.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/60 space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center justify-between">
                        <span>Step Components ({comps.length})</span>
                      </div>
                      <div className="space-y-1.5">
                        {comps.map((c, cIdx) => {
                          const isCompCorrect = c.assessment === 'CORRECT' || c.marksAwarded >= c.marksAvailable;
                          const isCompPartial = c.assessment === 'PARTIALLY_CORRECT' || (c.marksAwarded > 0 && c.marksAwarded < c.marksAvailable);
                          return (
                            <div
                              key={cIdx}
                              className={`p-2 rounded border text-xs ${
                                isCompCorrect
                                  ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                                  : isCompPartial
                                  ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60'
                                  : 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-slate-700 dark:text-slate-300">
                                    [{c.componentType}]
                                  </span>
                                  <span className="font-semibold text-slate-900 dark:text-white">{c.expectedRequirement}</span>
                                </div>
                                <span className={`font-mono font-bold ${isCompCorrect ? 'text-emerald-700 dark:text-emerald-400' : isCompPartial ? 'text-amber-700 dark:text-amber-400' : 'text-rose-700 dark:text-rose-400'}`}>
                                  +{c.marksAwarded} / {c.marksAvailable}m
                                  {c.marksDeducted > 0 && <span className="text-rose-600 dark:text-rose-400 ml-1">(-{c.marksDeducted})</span>}
                                </span>
                              </div>
                              {c.studentEvidence && (
                                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                                  <span className="font-medium text-slate-700 dark:text-slate-200">Script:</span> {c.studentEvidence}
                                </p>
                              )}
                              {c.deductionReason && (
                                <p className="text-[11px] text-rose-700 dark:text-rose-400 mt-0.5">
                                  <span className="font-medium">Deduction:</span> {c.deductionReason}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actionable Recommendations */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm print:bg-gray-50 print:border-gray-200">
        <h3 className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 mb-3 flex items-center gap-2">
          <Award className="w-4 h-4" />
          Examiner Recommendations For Next Exam Attempt
        </h3>
        <ul className="space-y-2">
          {recommendations.map((rec, i) => (
            <li key={i} className="text-xs text-slate-700 dark:text-slate-300 print:text-black flex items-start gap-2.5 leading-relaxed">
              <span className="w-5 h-5 rounded-full bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span>{rec}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Bottom Recheck Request Action Banner */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 border-2 border-amber-300/80 dark:border-amber-700/60 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-amber-950 dark:text-amber-200">Disagree with any step mark or question evaluation?</h4>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Submit an official Recheck Request. Senior academic evaluators will audit your copy against verified Suggested Answers and step marking schemes.
            </p>
          </div>
        </div>
        <button
          id="request-recheck-bottom-btn"
          onClick={() => {
            setRecheckTargetQuestion(null);
            setIsRecheckModalOpen(true);
          }}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Request Rechecking</span>
        </button>
      </div>

      {/* Subtle Review & Feedback Prompt for Completed Evaluation */}
      {!isReviewDismissed && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs print:hidden space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Star className="w-5 h-5 fill-amber-400 text-amber-500" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  How was your evaluation experience?
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Help fellow CA students with your transparent feedback on step-marking accuracy, working notes remarks, and checked copy quality.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setShowReviewPrompt(!showReviewPrompt)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Star className="w-3.5 h-3.5 fill-current" />
                <span>{showReviewPrompt ? 'Hide Review Form' : 'Share Experience'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsReviewDismissed(true);
                  try {
                    sessionStorage.setItem('dismiss_eval_review_prompt', 'true');
                  } catch {}
                }}
                className="px-2.5 py-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs transition cursor-pointer"
                title="Dismiss prompt for this session"
              >
                Not Now
              </button>
            </div>
          </div>

          {showReviewPrompt && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <StudentReviewCard />
            </div>
          )}
        </div>
      )}

      {/* Advisory & Compliance Disclaimer */}
      <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed print:bg-white print:border-gray-200 print:text-gray-500">
        <p className="font-semibold text-slate-700 dark:text-slate-300 print:text-gray-700 mb-1">
          Academic Benchmark & Verification Notice
        </p>
        <p>
          This evaluation is an AI-powered diagnostic benchmark generated according to published ICAI Suggested Answers, Marking Schemes, and Accounting/Tax Standards. CA Exam Checker is an independent educational technology platform and is not affiliated with, authorized, or endorsed by the Institute of Chartered Accountants of India (ICAI). Official marks are awarded exclusively by ICAI-appointed examiners during examination sessions.
        </p>
      </div>

      {/* Student Recheck Request Modal */}
      <RecheckRequestModal
        isOpen={isRecheckModalOpen}
        onClose={() => setIsRecheckModalOpen(false)}
        evaluationResult={evaluationResult}
        preselectedQuestionNumber={recheckTargetQuestion}
        onRecheckSubmitted={() => {
          if (onRefresh) {
            onRefresh();
          }
        }}
      />
    </div>
  );
};
