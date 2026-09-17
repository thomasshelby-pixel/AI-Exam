import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client.js';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  FileText,
  Eye,
  Download,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  Layers,
  Clock,
  History,
  Info,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
  FileQuestion,
  User,
  BookOpen,
} from 'lucide-react';

interface QuestionEvaluation {
  questionNumber: string;
  subQuestion?: string;
  maximumMarks: number;
  marksAwarded: number;
  marksLost: number;
  status: 'correct' | 'partially_correct' | 'incorrect';
  reasonForDeduction?: string;
  detailedFeedback?: string;
  stepMarks?: Array<{
    step: string | number;
    description: string;
    marksAwarded: number;
    maximumMarks: number;
  }>;
  reviewerAdjustmentNotes?: string;
}

interface EvaluationResult {
  evaluationId?: string;
  totalMarks: number;
  maximumMarks: number;
  percentage: number;
  grade: string;
  version?: string;
  questions: QuestionEvaluation[];
  adminReview?: {
    reviewedBy: string;
    reviewedAt: string;
    reason: string;
    previousMarks: number;
    newMarks: number;
  };
}

interface EvaluationVersion {
  id: string;
  version_number: number;
  version_tag: string;
  parent_version_id?: string;
  status: string;
  total_marks: number;
  maximum_marks: number;
  percentage: number;
  grade?: string;
  amendment_reason?: string;
  review_resolution?: string;
  admin_email?: string;
  created_at: string;
}

interface EvaluationReviewData {
  evaluation: {
    id: string;
    student_id: string;
    student_name: string;
    student_email: string;
    icai_registration_number?: string;
    level: string;
    subject_name: string;
    subject_key: string;
    paper: string;
    attempt: string;
    material_type: string;
    checking_mode: string;
    status: string;
    total_marks: number;
    maximum_marks: number;
    percentage: number;
    grade: string;
    confidence_score: number;
    rejection_reason?: string;
    current_evaluation_version_id?: string;
    evaluation_version?: string;
    admin_review_status?: string;
    admin_reviewed_at?: string;
    admin_reviewer_email?: string;
    admin_review_notes?: string;
    created_at: string;
  };
  resultJson: EvaluationResult;
  activeVersion: string;
  versions: EvaluationVersion[];
  artifacts: {
    hasOriginal: boolean;
    hasCheckedCopy: boolean;
    hasReport: boolean;
    originalUrl: string;
    checkedCopyUrl: string;
    reportUrl: string;
  };
}

interface AdminEvaluationReviewPageProps {
  evaluationId: string;
  onBack: () => void;
}

export const AdminEvaluationReviewPage: React.FC<AdminEvaluationReviewPageProps> = ({
  evaluationId,
  onBack,
}) => {
  const [data, setData] = useState<EvaluationReviewData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Amendment Draft State
  const [questionEdits, setQuestionEdits] = useState<{
    [key: string]: {
      marksAwarded: number;
      reasonForDeduction: string;
      detailedFeedback: string;
      amendmentReason: string;
      modified: boolean;
    };
  }>({});
  const [overallReason, setOverallReason] = useState<string>('');
  const [previewArtifactUrl, setPreviewArtifactUrl] = useState<{ title: string; url: string } | null>(null);
  const [selectedVersionForCopy, setSelectedVersionForCopy] = useState<'current' | 'v1' | 'v2'>('current');
  const [showHistory, setShowHistory] = useState<boolean>(false);

  const fetchReviewDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest<EvaluationReviewData>(`/api/admin/evaluations/${evaluationId}/review`);
      setData(res);

      // Initialize question edit states
      if (res.resultJson?.questions) {
        const edits: any = {};
        res.resultJson.questions.forEach((q, idx) => {
          const key = `${q.questionNumber}_${q.subQuestion || idx}`;
          edits[key] = {
            marksAwarded: q.marksAwarded ?? 0,
            reasonForDeduction: q.reasonForDeduction || '',
            detailedFeedback: q.detailedFeedback || '',
            amendmentReason: '',
            modified: false,
          };
        });
        setQuestionEdits(edits);
      }
    } catch (err: any) {
      console.error('Failed to load review details:', err);
      setError(err.message || 'Failed to load evaluation review details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviewDetails();
  }, [evaluationId]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-3 border-blue-600 border-t-transparent mb-3" />
        <p className="text-sm font-semibold text-slate-700">Loading Authoritative Review Workspace...</p>
        <p className="text-xs text-slate-400 mt-1">Retrieving submission artifacts, question evidence, and version history</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-xl border border-rose-200 p-8 shadow-xs space-y-4">
        <div className="flex items-center gap-3 text-rose-600">
          <AlertTriangle className="w-5 h-5" />
          <h3 className="text-base font-bold">Review Workspace Error</h3>
        </div>
        <p className="text-sm text-slate-600">{error || 'Evaluation not found or could not be loaded.'}</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-2 cursor-pointer transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Evaluations
        </button>
      </div>
    );
  }

  const { evaluation, resultJson, activeVersion, versions, artifacts } = data;
  const questions = resultJson?.questions || [];

  // Compute live recalculated marks
  let liveTotalMarks = 0;
  let modifiedCount = 0;

  questions.forEach((q, idx) => {
    const key = `${q.questionNumber}_${q.subQuestion || idx}`;
    const edit = questionEdits[key];
    const currentVal = edit !== undefined ? edit.marksAwarded : q.marksAwarded;
    liveTotalMarks += Number(currentVal) || 0;
    if (edit && edit.modified) {
      modifiedCount++;
    }
  });

  liveTotalMarks = Math.round(liveTotalMarks * 100) / 100;
  const maxPaperMarks = Number(evaluation.maximum_marks) || resultJson?.maximumMarks || 100;
  const livePercentage = Math.round(((liveTotalMarks / maxPaperMarks) * 100) * 100) / 100;

  function calculateIcaIGrade(pct: number): string {
    if (pct >= 75) return 'Distinction (A+)';
    if (pct >= 60) return 'First Class (A)';
    if (pct >= 50) return 'Second Class (B)';
    if (pct >= 40) return 'Pass (C)';
    return 'Needs Improvement (F)';
  }
  const liveGrade = calculateIcaIGrade(livePercentage);
  const scoreDelta = Math.round((liveTotalMarks - (evaluation.total_marks || 0)) * 100) / 100;

  const handleMarkChange = (key: string, originalAwarded: number, maxMarks: number, newVal: string) => {
    const num = parseFloat(newVal);
    const clamped = isNaN(num) ? 0 : Math.max(0, Math.min(maxMarks, num));
    setQuestionEdits((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        marksAwarded: clamped,
        modified: clamped !== originalAwarded,
      },
    }));
  };

  const handleTextChange = (key: string, field: 'reasonForDeduction' | 'detailedFeedback' | 'amendmentReason', val: string) => {
    setQuestionEdits((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: val,
        modified: true,
      },
    }));
  };

  const handleReset = () => {
    if (resultJson?.questions) {
      const edits: any = {};
      resultJson.questions.forEach((q, idx) => {
        const key = `${q.questionNumber}_${q.subQuestion || idx}`;
        edits[key] = {
          marksAwarded: q.marksAwarded ?? 0,
          reasonForDeduction: q.reasonForDeduction || '',
          detailedFeedback: q.detailedFeedback || '',
          amendmentReason: '',
          modified: false,
        };
      });
      setQuestionEdits(edits);
      setOverallReason('');
      setSuccessMessage(null);
    }
  };

  const handleFinalize = async (affirmAsIs: boolean = false) => {
    if (!overallReason.trim()) {
      alert('Please enter a justification or reviewer notes explaining the outcome of this review.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      // Build amendments array
      const amendments: any[] = [];
      if (!affirmAsIs) {
        questions.forEach((q, idx) => {
          const key = `${q.questionNumber}_${q.subQuestion || idx}`;
          const edit = questionEdits[key];
          if (edit && edit.modified) {
            amendments.push({
              questionNumber: q.questionNumber,
              subQuestion: q.subQuestion,
              marksAwarded: edit.marksAwarded,
              reasonForDeduction: edit.reasonForDeduction,
              detailedFeedback: edit.detailedFeedback,
              amendmentReason: edit.amendmentReason || overallReason,
            });
          }
        });
      }

      const res = await apiRequest<any>(`/api/admin/evaluations/${evaluationId}/review/finalize`, {
        method: 'POST',
        body: JSON.stringify({
          amendments,
          overallReason: overallReason.trim(),
          affirmAsIs,
        }),
      });

      setSuccessMessage(res.message || 'Evaluation review finalized successfully!');
      // Refresh details to display updated V2 state
      await fetchReviewDetails();
    } catch (err: any) {
      console.error('Finalize error:', err);
      setError(err.message || 'Failed to finalize review.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 transition cursor-pointer"
            title="Return to Evaluations Table"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Admin Evaluation Review & Amendment</h2>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  evaluation.status === 'NEEDS_REVIEW'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                }`}
              >
                {evaluation.status}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                Active: {activeVersion.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Authoritative examiner inspection, mark calibration, and certified artifact regeneration
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {versions.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-slate-500" />
              Versions ({versions.length})
              {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
          <button
            onClick={onBack}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Success Banner */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Flag Alert Banner for NEEDS_REVIEW */}
      {evaluation.status === 'NEEDS_REVIEW' && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-amber-900 text-xs flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-amber-950">Evaluation Flagged for Administrative Quality Review</p>
            <p className="text-amber-800 leading-relaxed">
              {evaluation.rejection_reason ||
                'This evaluation was marked with status NEEDS_REVIEW. While in this state, student downloads are held in check. As Super Admin, review the questions, adjust scores if needed, and finalize the authoritative V2 copy.'}
            </p>
          </div>
        </div>
      )}

      {/* Version History Drawer */}
      {showHistory && versions.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
              <History className="w-4 h-4 text-blue-600" />
              Immutable Version Audit Trail
            </h4>
            <span className="text-[11px] text-slate-500">V1 is permanently archived; V2 is the active certified evaluation.</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {versions.map((ver) => (
              <div
                key={ver.id}
                className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                  ver.version_tag === activeVersion
                    ? 'bg-blue-50/60 border-blue-200 text-blue-950'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 bg-white rounded border border-slate-200 text-[10px] font-mono">
                      {ver.version_tag.toUpperCase()}
                    </span>
                    {ver.version_tag === activeVersion && (
                      <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.2 rounded font-semibold">Active</span>
                    )}
                  </span>
                  <span className="font-mono text-xs">
                    {ver.total_marks} / {ver.maximum_marks} ({ver.percentage}%)
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Created: {new Date(ver.created_at).toLocaleString()} {ver.admin_email ? `by ${ver.admin_email}` : '(AI System)'}
                </p>
                {ver.amendment_reason && (
                  <p className="text-[11px] text-slate-600 italic bg-white p-2 rounded border border-slate-100">
                    "{ver.amendment_reason}"
                  </p>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <a
                    href={`/api/admin/evaluations/${evaluationId}/artifacts/checked-copy?version=${ver.version_tag}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-600 hover:text-blue-800 underline font-medium flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> Checked Copy ({ver.version_tag})
                  </a>
                  <span className="text-slate-300">•</span>
                  <a
                    href={`/api/admin/evaluations/${evaluationId}/artifacts/report?version=${ver.version_tag}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-600 hover:text-blue-800 underline font-medium flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> Report ({ver.version_tag})
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Student & Paper Metadata Summary Grid */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
        <div className="space-y-1 border-b md:border-b-0 md:border-r border-slate-100 pb-3 md:pb-0 md:pr-4">
          <div className="flex items-center gap-1.5 text-slate-400 font-medium">
            <User className="w-3.5 h-3.5" /> Student Profile
          </div>
          <p className="font-bold text-slate-800 text-sm">{evaluation.student_name || 'CA Student'}</p>
          <p className="text-slate-500 font-mono text-[11px]">{evaluation.student_email}</p>
          {evaluation.icai_registration_number && (
            <p className="text-[11px] text-slate-600 font-medium">
              ICAI Reg: <span className="font-mono text-slate-800">{evaluation.icai_registration_number}</span>
            </p>
          )}
        </div>

        <div className="space-y-1 border-b md:border-b-0 md:border-r border-slate-100 pb-3 md:pb-0 md:pr-4">
          <div className="flex items-center gap-1.5 text-slate-400 font-medium">
            <BookOpen className="w-3.5 h-3.5" /> Exam & Paper
          </div>
          <p className="font-bold text-slate-800 text-sm">{evaluation.subject_name}</p>
          <p className="text-slate-500">
            {evaluation.level} • {evaluation.paper}
          </p>
          <p className="text-[11px] text-slate-600">
            Attempt: <span className="font-semibold text-slate-800">{evaluation.attempt}</span> • Mode:{' '}
            <span className="font-semibold text-slate-800">{evaluation.checking_mode}</span>
          </p>
        </div>

        <div className="space-y-1 border-b md:border-b-0 md:border-r border-slate-100 pb-3 md:pb-0 md:pr-4">
          <div className="flex items-center gap-1.5 text-slate-400 font-medium">
            <Sparkles className="w-3.5 h-3.5" /> Confidence & Baseline
          </div>
          <p className="font-bold text-slate-800 text-sm">
            {evaluation.confidence_score ? `${evaluation.confidence_score}% Confidence` : 'Verified Marking'}
          </p>
          <p className="text-slate-500">
            Original Score: <span className="font-bold text-slate-800">{evaluation.total_marks}</span> / {evaluation.maximum_marks}
          </p>
          <p className="text-[11px] text-slate-600">
            Original Grade: <span className="font-semibold text-slate-800">{evaluation.grade || 'N/A'}</span>
          </p>
        </div>

        <div className="space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 font-medium">
            <span>Recalculated Score:</span>
            {scoreDelta !== 0 && (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  scoreDelta > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}
              >
                {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}
              </span>
            )}
          </div>
          <p className="font-bold text-slate-900 text-lg">
            {liveTotalMarks} <span className="text-xs text-slate-400 font-normal">/ {maxPaperMarks}</span>
          </p>
          <p className="text-[11px] font-medium text-slate-600">
            {livePercentage}% • <span className="font-bold text-blue-700">{liveGrade}</span>
          </p>
        </div>
      </div>

      {/* Authoritative Artifacts Toolbar (3 Authoritative Files) */}
      <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Authoritative Evaluation Artifacts
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Inspect original handwriting, verify annotation alignment, and inspect detailed score reports
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Checked Copy Version:</span>
            <select
              value={selectedVersionForCopy}
              onChange={(e) => setSelectedVersionForCopy(e.target.value as any)}
              className="bg-slate-800 border border-slate-700 text-white text-[11px] rounded px-2 py-1 cursor-pointer focus:outline-hidden"
            >
              <option value="current">Current Active ({activeVersion})</option>
              {versions.some((v) => v.version_tag === 'v1') && <option value="v1">Version 1 (Original AI)</option>}
              {versions.some((v) => v.version_tag === 'v2') && <option value="v2">Version 2 (Amended)</option>}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Artifact 1: Original Answer Sheet */}
          <div className="bg-slate-800/80 rounded-lg p-3 border border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-200 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-400" /> 1. Original Answer Sheet
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Immutable</span>
            </div>
            <p className="text-[11px] text-slate-400">Student's uploaded handwritten submission.</p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() =>
                  setPreviewArtifactUrl({
                    title: 'Original Student Answer Sheet',
                    url: `${artifacts.originalUrl}?inline=true`,
                  })
                }
                className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[11px] font-medium flex items-center gap-1 text-white transition cursor-pointer"
              >
                <Eye className="w-3 h-3" /> View Inline
              </button>
              <a
                href={artifacts.originalUrl}
                download
                className="px-2.5 py-1 bg-slate-700/50 hover:bg-slate-700 rounded text-[11px] font-medium flex items-center gap-1 text-slate-300 transition"
              >
                <Download className="w-3 h-3" /> Download
              </a>
            </div>
          </div>

          {/* Artifact 2: Checked Copy PDF */}
          <div className="bg-slate-800/80 rounded-lg p-3 border border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-200 flex items-center gap-1.5">
                <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" /> 2. Checked Copy PDF
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">
                {selectedVersionForCopy === 'current' ? activeVersion.toUpperCase() : selectedVersionForCopy.toUpperCase()}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Original pages annotated with red-ink marks.</p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() =>
                  setPreviewArtifactUrl({
                    title: `Certified Checked Copy (${selectedVersionForCopy.toUpperCase()})`,
                    url: `${artifacts.checkedCopyUrl}?inline=true${selectedVersionForCopy !== 'current' ? `&version=${selectedVersionForCopy}` : ''}`,
                  })
                }
                className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-[11px] font-medium flex items-center gap-1 text-white transition cursor-pointer"
              >
                <Eye className="w-3 h-3" /> View Inline
              </button>
              <a
                href={`${artifacts.checkedCopyUrl}${selectedVersionForCopy !== 'current' ? `?version=${selectedVersionForCopy}` : ''}`}
                download
                className="px-2.5 py-1 bg-slate-700/50 hover:bg-slate-700 rounded text-[11px] font-medium flex items-center gap-1 text-slate-300 transition"
              >
                <Download className="w-3 h-3" /> Download
              </a>
            </div>
          </div>

          {/* Artifact 3: Detailed Report PDF */}
          <div className="bg-slate-800/80 rounded-lg p-3 border border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" /> 3. Detailed Report PDF
              </span>
              <span className="text-[10px] text-indigo-300 font-mono">Step Breakdown</span>
            </div>
            <p className="text-[11px] text-slate-400">Comprehensive question-wise analysis report.</p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() =>
                  setPreviewArtifactUrl({
                    title: `Evaluation Report (${selectedVersionForCopy.toUpperCase()})`,
                    url: `${artifacts.reportUrl}?inline=true${selectedVersionForCopy !== 'current' ? `&version=${selectedVersionForCopy}` : ''}`,
                  })
                }
                className="px-2.5 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-[11px] font-medium flex items-center gap-1 text-white transition cursor-pointer"
              >
                <Eye className="w-3 h-3" /> View Inline
              </button>
              <a
                href={`${artifacts.reportUrl}${selectedVersionForCopy !== 'current' ? `?version=${selectedVersionForCopy}` : ''}`}
                download
                className="px-2.5 py-1 bg-slate-700/50 hover:bg-slate-700 rounded text-[11px] font-medium flex items-center gap-1 text-slate-300 transition"
              >
                <Download className="w-3 h-3" /> Download
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Artifact Modal */}
      {previewArtifactUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-300 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
              <h4 className="text-xs font-bold flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-400" />
                {previewArtifactUrl.title}
              </h4>
              <div className="flex items-center gap-3">
                <a
                  href={previewArtifactUrl.url.replace('&inline=true', '').replace('?inline=true', '')}
                  download
                  className="text-xs text-slate-300 hover:text-white flex items-center gap-1 underline font-medium"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
                <button
                  onClick={() => setPreviewArtifactUrl(null)}
                  className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100">
              <iframe
                src={previewArtifactUrl.url}
                className="w-full h-full border-none"
                title={previewArtifactUrl.title}
              />
            </div>
          </div>
        </div>
      )}

      {/* Question-Wise Amendment Workspace */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileQuestion className="w-4 h-4 text-blue-600" />
              Question-by-Question Marking & Amendment Review
            </h3>
            <p className="text-xs text-slate-500">
              Inspect step-by-step marking, calibrate marks awarded, and update reason for deductions
            </p>
          </div>
          {modifiedCount > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
              {modifiedCount} Question{modifiedCount > 1 ? 's' : ''} Modified
            </span>
          )}
        </div>

        <div className="space-y-4">
          {questions.map((q, idx) => {
            const key = `${q.questionNumber}_${q.subQuestion || idx}`;
            const edit = questionEdits[key] || {
              marksAwarded: q.marksAwarded,
              reasonForDeduction: q.reasonForDeduction || '',
              detailedFeedback: q.detailedFeedback || '',
              amendmentReason: '',
              modified: false,
            };

            const isModified = edit.modified;
            const diff = Math.round((edit.marksAwarded - q.marksAwarded) * 100) / 100;

            return (
              <div
                key={key}
                className={`bg-white rounded-xl border transition p-4 shadow-xs space-y-3 ${
                  isModified ? 'border-blue-400 ring-1 ring-blue-300' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 font-bold text-xs flex items-center justify-center font-mono">
                      Q{q.questionNumber}
                      {q.subQuestion ? `(${q.subQuestion})` : ''}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">
                        Question {q.questionNumber} {q.subQuestion ? `Part (${q.subQuestion})` : ''}
                      </h4>
                      <span className="text-[11px] text-slate-400">
                        Max Allowed: <strong className="text-slate-700">{q.maximumMarks} Marks</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {isModified && (
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          diff > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {diff > 0 ? `+${diff}` : diff} Marks (From {q.marksAwarded})
                      </span>
                    )}

                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg">
                      <label htmlFor={`marks-${key}`} className="text-[11px] font-semibold text-slate-600">
                        Awarded:
                      </label>
                      <input
                        id={`marks-${key}`}
                        type="number"
                        min={0}
                        max={q.maximumMarks}
                        step={0.25}
                        value={edit.marksAwarded}
                        onChange={(e) => handleMarkChange(key, q.marksAwarded, q.maximumMarks, e.target.value)}
                        className="w-16 px-2 py-0.5 text-center font-bold text-xs bg-white border border-slate-300 rounded text-slate-900 focus:outline-hidden focus:border-blue-500 font-mono"
                      />
                      <span className="text-[11px] text-slate-400">/ {q.maximumMarks}</span>
                    </div>
                  </div>
                </div>

                {/* Step Marking Table if present */}
                {Array.isArray(q.stepMarks) && q.stepMarks.length > 0 && (
                  <div className="bg-slate-50/70 rounded-lg p-3 border border-slate-100 space-y-1.5">
                    <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Step Marking Rubric Evidence</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] text-left">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-400">
                            <th className="py-1 font-semibold">Step</th>
                            <th className="py-1 font-semibold">Criterion / Description</th>
                            <th className="py-1 font-semibold text-right">Awarded / Max</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {q.stepMarks.map((sm, sIdx) => (
                            <tr key={sIdx}>
                              <td className="py-1 font-mono font-medium text-slate-600">{sm.step}</td>
                              <td className="py-1 text-slate-700">{sm.description}</td>
                              <td className="py-1 font-mono text-right font-bold text-slate-800">
                                {sm.marksAwarded} / {sm.maximumMarks}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Editable Fields: Deduction Reason & Detailed Feedback */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700 text-[11px] flex items-center justify-between">
                      <span>Reason for Deduction:</span>
                      {q.reasonForDeduction !== edit.reasonForDeduction && (
                        <span className="text-[10px] text-blue-600 font-normal">Modified</span>
                      )}
                    </label>
                    <textarea
                      rows={2}
                      value={edit.reasonForDeduction}
                      onChange={(e) => handleTextChange(key, 'reasonForDeduction', e.target.value)}
                      placeholder="e.g., Step 2 provision formula omitted or calculation error..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700 text-[11px] flex items-center justify-between">
                      <span>Detailed Examiner Feedback:</span>
                      {q.detailedFeedback !== edit.detailedFeedback && (
                        <span className="text-[10px] text-blue-600 font-normal">Modified</span>
                      )}
                    </label>
                    <textarea
                      rows={2}
                      value={edit.detailedFeedback}
                      onChange={(e) => handleTextChange(key, 'detailedFeedback', e.target.value)}
                      placeholder="Actionable guidance for student..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 bg-white"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Review Finalization Control Card */}
      <div className="bg-white rounded-xl border border-slate-300 p-5 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Finalize Evaluation Review & Publish Version 2
            </h3>
            <p className="text-xs text-slate-500">
              Publishing V2 updates the authoritative record to COMPLETED, regenerates the checked copy and report, and keeps V1 permanently archived.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-semibold text-slate-600">
              New Authoritative Total:{' '}
              <strong className="text-base text-slate-900 font-mono">
                {liveTotalMarks} / {maxPaperMarks}
              </strong>
            </span>
          </div>
        </div>

        {/* Required Justification Notes */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-800">
            Mandatory Examiner Review Justification / Administrative Audit Notes: <span className="text-rose-500">*</span>
          </label>
          <textarea
            rows={3}
            value={overallReason}
            onChange={(e) => setOverallReason(e.target.value)}
            placeholder="Document reasons for mark changes or verification confirmation (e.g., 'Inspected Question 1(a) working notes. Verified calculation of depreciation under Ind AS 16. Awarded 1.5 marks deduction correction. Checked copy regenerated.')"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <button
            onClick={handleReset}
            disabled={saving}
            className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Edits
          </button>

          <div className="flex items-center gap-3">
            {/* Affirm As-Is Option */}
            <button
              onClick={() => handleFinalize(true)}
              disabled={saving}
              className="px-4 py-2 border border-amber-300 hover:bg-amber-50 text-amber-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
              title="Confirm that original AI evaluation was correct and clear NEEDS_REVIEW without mark changes"
            >
              <Check className="w-3.5 h-3.5 text-amber-600" />
              Affirm As-Is (Clear Needs Review)
            </button>

            {/* Primary Save & Finalize V2 */}
            <button
              onClick={() => handleFinalize(false)}
              disabled={saving}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Regenerating V2 Artifacts...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save & Finalize Review (Publish V2)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
