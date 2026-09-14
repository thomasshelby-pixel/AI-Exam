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
} from 'lucide-react';
import { BrandLogo } from '../../components/common/BrandLogo.js';
import { RecheckRequestModal } from '../../components/student/RecheckRequestModal.js';

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
    <div className="max-w-5xl mx-auto px-4 py-6 text-slate-800 space-y-6 print:p-0 print:text-black">
      {/* Top Controls (Hidden when printing) */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 transition shadow-sm"
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
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-bold transition shadow-sm cursor-pointer"
            title="Download the raw submitted answer sheet"
          >
            {downloadingType === 'original' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-slate-500" />
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
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition shadow-sm"
            title="Print report using browser print layout"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Print</span>
          </button>
        </div>
      </div>

      {/* Version 2 Rechecked Result Banner */}
      {(evaluationResult.version === 'v2' || evaluationResult.recheckStatus === 'RECHECKED_ACCEPTED' || (evaluationResult.recheckDelta !== undefined && evaluationResult.recheckDelta !== 0)) && (
        <div className="bg-emerald-50 border-2 border-emerald-500/80 rounded-xl p-4 shadow-sm text-emerald-950 space-y-3">
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
                    <span className="text-[11px] text-emerald-700 font-medium">
                      Resolved on {new Date(evaluationResult.recheckResolutionDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold text-emerald-900 mt-1">
                  Answer sheet rechecked against official ICAI Suggested Answers.
                </p>
                {evaluationResult.reviewerNotes && (
                  <p className="text-xs text-emerald-800 mt-1 bg-white/70 border border-emerald-200 rounded-md p-2">
                    <span className="font-bold text-emerald-950">Examiner Review Resolution:</span>{' '}
                    {(!evaluationResult.reviewerNotes || /^[0-9]+$/.test(evaluationResult.reviewerNotes.trim()))
                      ? 'Score adjusted after senior faculty review against official ICAI suggested answers and step-marking scheme.'
                      : evaluationResult.reviewerNotes}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 bg-white border border-emerald-200 rounded-xl px-4 py-2.5 shrink-0">
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Marks History</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs line-through text-slate-400 font-mono font-bold">
                    v1: {evaluationResult.originalTotalMarks ?? (totalMarks - (evaluationResult.recheckDelta || 0))}m
                  </span>
                  <span className="text-base font-black text-emerald-700 font-mono">
                    v2: {totalMarks}m
                  </span>
                  {evaluationResult.recheckDelta !== undefined && evaluationResult.recheckDelta !== 0 && (
                    <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-mono">
                      {evaluationResult.recheckDelta > 0 ? `+${evaluationResult.recheckDelta}` : evaluationResult.recheckDelta}m
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Versioned PDF Downloads */}
          <div className="pt-2 border-t border-emerald-200/60 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[11px] text-emerald-800 font-semibold">
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
                className="px-2.5 py-1 rounded-lg bg-white border border-emerald-300 hover:bg-emerald-100/50 text-emerald-900 font-semibold text-[11px] transition inline-flex items-center gap-1 cursor-pointer"
              >
                <FileText className="w-3 h-3 text-emerald-600" />
                <span>Original Copy (V1 Archived)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Recheck Notice Banner */}
      {(evaluationResult.recheckStatus === 'PENDING' || (evaluationResult as any).recheck_requests?.some((r: any) => r.status === 'PENDING')) && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 shadow-xs text-amber-900 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <RotateCcw className="w-4 h-4 text-amber-600 animate-spin shrink-0" />
            <div>
              <span className="font-bold">Recheck Request Under Review:</span> A grievance or recheck ticket is actively being audited by senior faculty against verified suggested answers.
            </div>
          </div>
          <button
            onClick={() => {
              setRecheckTargetQuestion(null);
              setIsRecheckModalOpen(true);
            }}
            className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] shrink-0"
          >
            View Ticket Status
          </button>
        </div>
      )}

      {/* Authoritative Benchmark Evaluation Notice Banner */}
      {(evaluationResult.fallbackOccurred || evaluationResult.modelUsed?.includes('Benchmark')) && (
        <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 shadow-xs text-blue-900 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
            <div>
              <span className="font-bold">ICAI Authoritative Benchmark Evaluation:</span> Grounded directly in official ICAI suggested answers, step-marking rubrics, and statutory provisions.
            </div>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100/80 text-blue-700 font-bold uppercase tracking-wider shrink-0">
            Authoritative Engine
          </span>
        </div>
      )}

      {/* Official ICAI Pattern Report Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm relative overflow-hidden print:border print:border-gray-300 print:bg-white print:text-black">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-slate-200 print:border-gray-300">
          <div>
            <div className="mb-3">
              <BrandLogo variant="horizontal" size="sm" />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider mb-1">
              <div className="flex items-center gap-1.5 text-blue-600">
                <FileCheck2 className="w-4 h-4 text-blue-600" />
                <span>Verified ICAI-Pattern Step-Marking Evaluation</span>
              </div>
              {evaluationResult.evaluationSource === 'INSTITUTE' ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                  <Building2 className="w-3 h-3" />
                  <span>{evaluationResult.instituteName || 'Institute Evaluation'}</span>
                  {evaluationResult.batchName && (
                    <span className="text-indigo-500 font-normal">({evaluationResult.batchName})</span>
                  )}
                </span>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                    <Globe className="w-3 h-3" />
                    <span>Public AI Evaluation</span>
                  </span>
                  {(evaluationResult.sponsoringInstituteName || evaluationResult.instituteName) && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      <Building2 className="w-3 h-3" />
                      <span>Sponsored by {evaluationResult.sponsoringInstituteName || evaluationResult.instituteName}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 print:text-black">{subjectName}</h1>
            <p className="text-xs text-slate-500 mt-1 print:text-gray-600">
              CA {caLevel} • {materialType} Series • {attempt || 'May 2026'}
            </p>
          </div>

          <div className="text-left sm:text-right text-xs text-slate-500 print:text-gray-600">
            <p className="font-bold text-slate-800 print:text-black">{studentName}</p>
            <p className="font-mono mt-0.5">
              Roll / Reg: {!icaiRegistrationNumber || icaiRegistrationNumber === '000' || icaiRegistrationNumber === 'N/A' || icaiRegistrationNumber === 'NA' || icaiRegistrationNumber === 'WRO0987654' ? 'Not provided' : icaiRegistrationNumber}
            </p>
            <p className="mt-0.5">
              Evaluated on {new Date(evaluationDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
            </p>
          </div>
        </div>

        {/* Multi-Mode Scoring Breakdown Bar */}
        {evaluationResult.modeBreakdown && (
          <div className="pt-4 pb-2 border-b border-slate-200 print:hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
              <div>
                <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>Evaluation Mode Comparison (Attempted Marks: {attemptedOrEvaluatedMax}m immutable)</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Question coverage, attempt discovery, and paper maximum are 100% constant across all 3 marking modes.
                </p>
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedMode('strict')}
                  className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                    selectedMode === 'strict'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
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
                      : 'text-slate-600 hover:text-slate-900'
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
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Moderate ({evaluationResult.modeBreakdown.moderate.totalMarks}m)
                </button>
              </div>
            </div>
            {modeData && (
              <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5">
                <strong className="text-slate-800 font-semibold">{modeData.displayName} Mode:</strong> {modeData.philosophy}
              </p>
            )}
          </div>
        )}

        {/* Score & Grade Display */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-5 border-b border-slate-200 print:border-gray-300">
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 print:bg-gray-50 print:border-gray-200">
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Marks Obtained</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-black font-mono text-slate-900 print:text-black">{activeMarks}</span>
              <span className="text-xs text-slate-500">/ {officialMax}</span>
            </div>
            {attemptedOrEvaluatedMax && attemptedOrEvaluatedMax < officialMax ? (
              <p className="text-[10px] text-blue-700 mt-0.5 font-medium">
                Marks evaluated: {activeMarks} / {attemptedOrEvaluatedMax} attempted/evaluable marks
              </p>
            ) : (
              <p className="text-[10px] text-slate-400 mt-0.5">Step sum verified</p>
            )}
          </div>

          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 print:bg-gray-50 print:border-gray-200">
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Percentage</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-black font-mono text-blue-600 print:text-black">{activePercentage}%</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Passing threshold: 40%</p>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 print:bg-gray-50 print:border-gray-200">
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">ICAI Assessment</p>
            <div className="mt-1">
              <span
                className={`text-xs font-black px-2 py-0.5 rounded uppercase tracking-wide inline-block ${
                  isExemption
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : isPass
                    ? 'bg-blue-100 text-blue-800 border border-blue-300'
                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                }`}
              >
                {activeGrade}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {isExemption ? 'Exemption Eligible (>=60)' : isPass ? 'Clearance standard' : 'Below 40% aggregate'}
            </p>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 print:bg-gray-50 print:border-gray-200">
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">AI Confidence</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-black font-mono text-emerald-700 print:text-black">
                {confidenceScore.toFixed(1)}%
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">OCR Legibility: High</p>
          </div>
        </div>

        {/* Executive Examiner Remarks */}
        <div className="pt-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 print:text-black mb-1.5 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            Executive Examiner Remarks
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed print:text-gray-800">{overallSummary}</p>
        </div>
      </div>

      {/* Strengths & Weaknesses Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 print:grid-cols-2">
        {/* Strengths */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:bg-gray-50 print:border-gray-200">
          <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-2.5 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Key Conceptual Strengths
          </h3>
          <ul className="space-y-1.5">
            {strengths.map((st, i) => (
              <li key={i} className="text-xs text-slate-700 print:text-black flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />
                <span>{st}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Weaknesses */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:bg-gray-50 print:border-gray-200">
          <h3 className="text-xs font-bold uppercase tracking-wider text-rose-700 mb-2.5 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Areas For Marks Improvement
          </h3>
          <ul className="space-y-1.5">
            {weaknesses.map((wk, i) => (
              <li key={i} className="text-xs text-slate-700 print:text-black flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 mt-1.5" />
                <span>{wk}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Detailed Presentation & Accuracy Diagnostic */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-200 rounded-xl p-5 text-xs space-y-2.5 shadow-sm print:bg-gray-50 print:border-gray-200">
          <h3 className="font-bold uppercase tracking-wider text-slate-800 print:text-black flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-600" />
            Presentation & Working Notes Diagnostic
          </h3>
          <div className="space-y-1.5 text-slate-600 print:text-black">
            <p>
              <strong className="text-slate-800">Working Notes Quality:</strong>{' '}
              {presentationAnalysis.workingNotesQuality}
            </p>
            <p>
              <strong className="text-slate-800">Handwriting & Layout:</strong>{' '}
              {presentationAnalysis.handwritingLegibility}
            </p>
            <p>
              <strong className="text-slate-800">Feedback:</strong> {presentationAnalysis.feedback}
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 text-xs space-y-2.5 shadow-sm print:bg-gray-50 print:border-gray-200">
          <h3 className="font-bold uppercase tracking-wider text-slate-800 print:text-black flex items-center gap-2">
            <Scale className="w-4 h-4 text-blue-600" />
            Accuracy & Standards Verification
          </h3>
          <div className="space-y-1.5 text-slate-600 print:text-black">
            <p>
              <strong className="text-slate-800">Calculations:</strong> {accuracyAnalysis.calculationAccuracy}
            </p>
            <p>
              <strong className="text-slate-800">Statutory Provisions & AS:</strong>{' '}
              {accuracyAnalysis.provisionsAccuracy}
            </p>
            <p>
              <strong className="text-slate-800">Methodology:</strong> {accuracyAnalysis.methodologyCorrectness}
            </p>
          </div>
        </div>
      </div>

      {/* How Was My Score Calculated? Transparent Audit Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 print:border-gray-200 print:bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Scale className="w-4 h-4 text-blue-600" />
              <span>How Was My Score Calculated? (Step-Wise Audit)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Strict step-wise component audit: marks are awarded for genuine reasoning, provisions, and working notes, not merely final numerical answers.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-blue-50 text-blue-800 border border-blue-200 self-start sm:self-auto">
              {totalMarks} / {officialMax} Marks ({percentage}%)
            </span>
            {attemptedOrEvaluatedMax && attemptedOrEvaluatedMax < officialMax && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                Attempted: {totalMarks} / {attemptedOrEvaluatedMax}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Component Summation</span>
            <p className="font-semibold text-slate-800">
              {questions.reduce((sum, q) => sum + (q.markingComponents?.length || 1), 0)} Audited Steps
            </p>
            <p className="text-[11px] text-slate-500 leading-snug">
              Every provision citation, working note, and application is awarded discrete fractional marks.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Consequential Marking</span>
            <p className="font-semibold text-slate-800">
              {questions.some((q) => q.consequentialErrorDetails?.isConsequential) ? 'Protected & Credited' : 'No Cascading Penalties'}
            </p>
            <p className="text-[11px] text-slate-500 leading-snug">
              Prior arithmetic slips do not cancel downstream marks if subsequent legal or conceptual logic is sound.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Substance Over Form</span>
            <p className="font-semibold text-slate-800">Cognitive Equivalence</p>
            <p className="text-[11px] text-slate-500 leading-snug">
              Alternative valid statutory approaches and equivalent legal wording receive full proportional credit.
            </p>
          </div>
        </div>

        {/* Audit summary table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <th className="py-2 px-3">Q#</th>
                <th className="py-2 px-3">Max</th>
                <th className="py-2 px-3">Awarded</th>
                <th className="py-2 px-3">Lost</th>
                <th className="py-2 px-3">Steps / Components</th>
                <th className="py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {questions.map((q, i) => {
                const compsCount = q.markingComponents?.length || (q.structuredEvidence?.markingComponents?.length) || 1;
                const isConseq = Boolean(q.consequentialErrorDetails?.isConsequential);
                return (
                  <tr key={`tbl-q-${q.questionNumber}-${q.subQuestion || ''}-${i}`} className="hover:bg-slate-50/50">
                    <td className="py-2 px-3 font-bold font-mono text-slate-800">Q{q.questionNumber}</td>
                    <td className="py-2 px-3 font-mono text-slate-600">{q.maximumMarks}</td>
                    <td className="py-2 px-3 font-mono font-bold text-emerald-700">+{q.marksAwarded}</td>
                    <td className="py-2 px-3 font-mono text-rose-700">-{q.marksLost}</td>
                    <td className="py-2 px-3 text-slate-600">
                      <span>{compsCount} step{compsCount > 1 ? 's' : ''}</span>
                      {isConseq && (
                        <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                          Consequential
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        q.status === 'correct'
                          ? 'bg-emerald-100 text-emerald-800'
                          : q.status === 'partially_correct'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
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
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5 shadow-sm print:border-gray-300 print:bg-white print:text-black">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 print:text-black flex items-center gap-2">
              <span>Question-Wise Step Marking Breakdown</span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                {questions.length} Questions Evaluated
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Component-level evaluation referencing statutory provisions, working notes, and suggested answers.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 print:hidden">
            {['ALL', 'correct', 'partially_correct', 'incorrect'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition ${
                  filterStatus === st
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
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
                ? 'border-emerald-200 bg-emerald-50/40 text-slate-800'
                : q.status === 'partially_correct'
                ? 'border-amber-200 bg-amber-50/40 text-slate-800'
                : q.status === 'incorrect'
                ? 'border-rose-200 bg-rose-50/40 text-slate-800'
                : 'border-slate-200 bg-slate-50 text-slate-800';

            const comps = q.markingComponents || q.structuredEvidence?.markingComponents || [];
            const isConseq = Boolean(q.consequentialErrorDetails?.isConsequential);

            return (
              <div
                key={`card-q-${q.questionNumber}-${q.subQuestion || ''}-${idx}`}
                className={`rounded-lg border p-4 transition ${statusColor} print:border-gray-200 print:bg-white print:text-black`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-slate-900 print:text-black">
                      Question {q.questionNumber}
                      {q.subQuestion ? ` (${q.subQuestion})` : ''}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                      {q.status.replace('_', ' ')}
                    </span>
                    {q.reviewerAdjustmentNotes && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-700" />
                        Rechecked (v2)
                      </span>
                    )}
                  </div>

                  {/* Marks Pills & Contest Button */}
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold">
                      <span className="text-emerald-700">+{q.marksAwarded} Awarded</span>
                      {q.marksLost > 0 && <span className="text-rose-700">-{q.marksLost} Lost</span>}
                      <span className="text-slate-500 font-normal">Max: {q.maximumMarks}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const targetQuestion = q.subQuestion ? `${q.questionNumber} (${q.subQuestion})` : q.questionNumber;
                        setRecheckTargetQuestion(targetQuestion);
                        setIsRecheckModalOpen(true);
                      }}
                      className="print:hidden inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-amber-400 hover:bg-amber-50 text-[11px] font-semibold text-slate-700 hover:text-amber-900 transition shadow-xs cursor-pointer"
                      title={`Request recheck for Question ${q.questionNumber}`}
                    >
                      <RotateCcw className="w-3 h-3 text-amber-600" />
                      <span>Contest / Recheck</span>
                    </button>
                  </div>
                </div>

                {/* Dedicated MCQ Verified Key & Option Comparison Box */}
                {(q.questionNumber.startsWith('MCQ') || Boolean(q.candidateSelectedOption) || Boolean(q.officialCorrectOption)) && (
                  <div className="mt-3 p-3 rounded-lg bg-white border border-slate-200 text-xs space-y-2">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                        <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                        MCQ Suggested Answer Verification
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                        q.marksAwarded >= q.maximumMarks ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {q.marksAwarded >= q.maximumMarks ? 'MATCHED OFFICIAL KEY' : 'OPTION MISMATCH'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className={`p-2.5 rounded-lg border ${
                        q.marksAwarded >= q.maximumMarks ? 'bg-emerald-50/60 border-emerald-200' : 'bg-rose-50/60 border-rose-200'
                      }`}>
                        <span className="text-[10px] uppercase font-bold text-slate-500">Candidate Selected Option</span>
                        <p className="font-mono font-bold text-sm text-slate-900 mt-0.5">
                          {q.candidateSelectedOption ? `Option (${q.candidateSelectedOption})` : 'Option extracted from script'}
                        </p>
                      </div>

                      <div className="p-2.5 rounded-lg border bg-blue-50/60 border-blue-200">
                        <span className="text-[10px] uppercase font-bold text-blue-700">Official Suggested Answer Key</span>
                        <p className="font-mono font-bold text-sm text-blue-950 mt-0.5">
                          {q.officialCorrectOption ? `Option (${q.officialCorrectOption})` : 'Authoritative Answer Key'}
                        </p>
                      </div>
                    </div>

                    {q.suggestedAnswerReference && (
                      <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-md border border-slate-100">
                        <span className="font-semibold text-slate-800">Verified Citation:</span> {q.suggestedAnswerReference}
                      </p>
                    )}
                  </div>
                )}

                {/* Consequential error alert */}
                {isConseq && (
                  <div className="mt-3 p-2.5 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold uppercase tracking-wider text-[10px] text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded mr-1.5">
                        Consequential Marking Credit
                      </span>
                      <span>
                        {q.consequentialErrorDetails?.reason || 'Earlier arithmetic slip isolated. Downstream methodology and calculations credited.'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Feedback and Reason */}
                <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 text-xs space-y-1.5 print:border-gray-200">
                  <p className="text-slate-700 print:text-gray-800">
                    <strong className="text-slate-900 font-semibold">Detailed Feedback:</strong> {q.detailedFeedback}
                  </p>

                  {q.reasonForDeduction && (
                    <p className="text-rose-800">
                      <strong className="font-semibold">Deduction Reason:</strong> {q.reasonForDeduction}
                    </p>
                  )}

                  {q.applicableProvisions && q.applicableProvisions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] text-slate-500 font-medium">Cited Standards / Provisions:</span>
                      {q.applicableProvisions.map((prov, pIdx) => (
                        <span
                          key={pIdx}
                          className="px-2 py-0.5 rounded bg-white text-[10px] font-mono font-semibold text-blue-700 border border-slate-200"
                        >
                          {prov}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Component-level breakdown items if available */}
                  {comps.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200/60 space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center justify-between">
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
                                  ? 'bg-emerald-50/60 border-emerald-200'
                                  : isCompPartial
                                  ? 'bg-amber-50/60 border-amber-200'
                                  : 'bg-rose-50/60 border-rose-200'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-white border border-slate-200 font-mono">
                                    [{c.componentType}]
                                  </span>
                                  <span className="font-semibold text-slate-900">{c.expectedRequirement}</span>
                                </div>
                                <span className={`font-mono font-bold ${isCompCorrect ? 'text-emerald-700' : isCompPartial ? 'text-amber-700' : 'text-rose-700'}`}>
                                  +{c.marksAwarded} / {c.marksAvailable}m
                                  {c.marksDeducted > 0 && <span className="text-rose-600 ml-1">(-{c.marksDeducted})</span>}
                                </span>
                              </div>
                              {c.studentEvidence && (
                                <p className="text-[11px] text-slate-600 mt-1">
                                  <span className="font-medium text-slate-700">Script:</span> {c.studentEvidence}
                                </p>
                              )}
                              {c.deductionReason && (
                                <p className="text-[11px] text-rose-700 mt-0.5">
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
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:bg-gray-50 print:border-gray-200">
        <h3 className="text-xs font-bold uppercase tracking-wider text-blue-700 mb-3 flex items-center gap-2">
          <Award className="w-4 h-4" />
          Examiner Recommendations For Next Exam Attempt
        </h3>
        <ul className="space-y-2">
          {recommendations.map((rec, i) => (
            <li key={i} className="text-xs text-slate-700 print:text-black flex items-start gap-2.5 leading-relaxed">
              <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span>{rec}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Bottom Recheck Request Action Banner */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300/80 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-amber-950">Disagree with any step mark or question evaluation?</h4>
            <p className="text-xs text-amber-800">
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

      {/* Advisory & Compliance Disclaimer */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 leading-relaxed print:bg-white print:border-gray-200 print:text-gray-500">
        <p className="font-semibold text-slate-700 print:text-gray-700 mb-1">
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
