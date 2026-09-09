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
} from 'lucide-react';
import { BrandLogo } from '../../components/common/BrandLogo.js';

interface EvaluationReportViewProps {
  evaluationResult: EvaluationResult;
  onBack: () => void;
}

export const EvaluationReportView: React.FC<EvaluationReportViewProps> = ({
  evaluationResult,
  onBack,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [downloadingType, setDownloadingType] = useState<string | null>(null);

  const handleDownload = async (type: 'report' | 'checked-copy' | 'original') => {
    try {
      setDownloadingType(type);
      const token = localStorage.getItem('ca_exam_checker_token') || localStorage.getItem('token') || '';
      const evalId = evaluationResult.evaluationId;
      const url = `/api/student/evaluations/${evalId}/download-${type}${token ? `?token=${encodeURIComponent(token)}` : ''}`;

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
      const filename =
        type === 'checked-copy'
          ? `${prefix}_Checked_Copy.pdf`
          : type === 'report'
          ? `${prefix}_Evaluation_Report.pdf`
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

  const isExemption = percentage >= 60;
  const isPass = percentage >= 40;

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

          {/* 4. Print */}
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
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                  <Globe className="w-3 h-3" />
                  <span>Public AI Evaluation</span>
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 print:text-black">{subjectName}</h1>
            <p className="text-xs text-slate-500 mt-1 print:text-gray-600">
              CA {caLevel} • {materialType} Series • {attempt || 'May 2026'}
            </p>
          </div>

          <div className="text-left sm:text-right text-xs text-slate-500 print:text-gray-600">
            <p className="font-bold text-slate-800 print:text-black">{studentName}</p>
            <p className="font-mono mt-0.5">ICAI Reg: {icaiRegistrationNumber}</p>
            <p className="mt-0.5">
              Evaluated on {new Date(evaluationDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
            </p>
          </div>
        </div>

        {/* Score & Grade Display */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-5 border-b border-slate-200 print:border-gray-300">
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 print:bg-gray-50 print:border-gray-200">
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Marks Obtained</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-black font-mono text-slate-900 print:text-black">{totalMarks}</span>
              <span className="text-xs text-slate-500">/ {maximumMarks}</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Step sum verified</p>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 print:bg-gray-50 print:border-gray-200">
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Percentage</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-black font-mono text-blue-600 print:text-black">{percentage}%</span>
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
                {grade}
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
              Verified against ICAI guideline answers and official paper-specific MCQ scoring rules.
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

            return (
              <div
                key={idx}
                className={`rounded-lg border p-4 transition ${statusColor} print:border-gray-200 print:bg-white print:text-black`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 print:text-black">
                      Question {q.questionNumber}
                      {q.subQuestion ? ` (${q.subQuestion})` : ''}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                      {q.status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Marks Pills */}
                  <div className="flex items-center gap-3 text-xs font-mono font-bold">
                    <span className="text-emerald-700">+{q.marksAwarded} Awarded</span>
                    {q.marksLost > 0 && <span className="text-rose-700">-{q.marksLost} Lost</span>}
                    <span className="text-slate-500 font-normal">Max: {q.maximumMarks}</span>
                  </div>
                </div>

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

      {/* Advisory & Compliance Disclaimer */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 leading-relaxed print:bg-white print:border-gray-200 print:text-gray-500">
        <p className="font-semibold text-slate-700 print:text-gray-700 mb-1">
          Academic Benchmark & Verification Notice
        </p>
        <p>
          This evaluation is an AI-powered diagnostic benchmark generated according to published ICAI Suggested Answers, Marking Schemes, and Accounting/Tax Standards. CA Exam Checker is an independent educational technology platform and is not affiliated with, authorized, or endorsed by the Institute of Chartered Accountants of India (ICAI). Official marks are awarded exclusively by ICAI-appointed examiners during examination sessions.
        </p>
      </div>
    </div>
  );
};
