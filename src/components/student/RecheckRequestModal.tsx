import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Clock,
  HelpCircle,
  X,
  FileCheck,
  Send,
  Scale,
  ShieldCheck,
  History,
} from 'lucide-react';
import { EvaluationResult, QuestionEvaluation } from '../../types/index.js';

interface RecheckRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  evaluationResult: EvaluationResult;
  onRecheckSubmitted: () => void;
  preselectedQuestionNumber?: string | null;
}

interface ExistingRecheck {
  id: string;
  question_number: string;
  sub_question?: string;
  reason: string;
  student_notes?: string;
  status: 'PENDING' | 'APPROVED' | 'ADJUSTED' | 'REJECTED';
  reviewer_notes?: string;
  adjusted_marks?: number;
  created_at: string;
  resolved_at?: string;
}

export const RecheckRequestModal: React.FC<RecheckRequestModalProps> = ({
  isOpen,
  onClose,
  evaluationResult,
  onRecheckSubmitted,
  preselectedQuestionNumber,
}) => {
  const [selectedQuestion, setSelectedQuestion] = useState<string>('ALL');
  const [reason, setReason] = useState<string>('MCQ Option Dispute');
  const [studentNotes, setStudentNotes] = useState<string>('');
  const [requestedMode, setRequestedMode] = useState<string>('standard');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [existingRequests, setExistingRequests] = useState<ExistingRecheck[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  useEffect(() => {
    if (preselectedQuestionNumber) {
      setSelectedQuestion(preselectedQuestionNumber);
    } else {
      setSelectedQuestion('ALL');
    }
  }, [preselectedQuestionNumber, isOpen]);

  useEffect(() => {
    if (isOpen && evaluationResult?.evaluationId) {
      fetchRecheckHistory();
    }
  }, [isOpen, evaluationResult?.evaluationId]);

  const fetchRecheckHistory = async () => {
    try {
      setLoadingHistory(true);
      const token = localStorage.getItem('ca_exam_checker_token') || localStorage.getItem('token') || '';
      const res = await fetch(`/api/student/evaluations/${evaluationResult.evaluationId}/recheck`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setExistingRequests(data.requests || []);
      }
    } catch (err) {
      console.warn('Failed to load recheck history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  if (!isOpen) return null;

  const currentTargetQ = evaluationResult.questions.find(
    (q) =>
      q.questionNumber === selectedQuestion ||
      `Q${q.questionNumber}` === selectedQuestion ||
      `MCQ ${q.questionNumber}` === selectedQuestion
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentNotes.trim() && reason !== 'Total / Mark Summation Discrepancy') {
      setErrorMsg('Please describe your specific grounds or working note evidence in the explanation box.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const token = localStorage.getItem('ca_exam_checker_token') || localStorage.getItem('token') || '';
      const res = await fetch(`/api/student/evaluations/${evaluationResult.evaluationId}/recheck`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          questionNumber: selectedQuestion,
          subQuestion: currentTargetQ?.subQuestion || null,
          reason,
          studentNotes: studentNotes.trim(),
          requestedMode,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to register recheck request.');
      }

      setSuccessMsg(data.message || 'Recheck request logged successfully. Senior examiner review is pending.');
      setStudentNotes('');
      await fetchRecheckHistory();
      onRecheckSubmitted();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error submitting request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Request Evaluation Recheck</h2>
              <p className="text-xs text-slate-500">
                {evaluationResult.subjectName} • {evaluationResult.totalMarks}/{evaluationResult.officialPaperMaxMarks || 100} Marks
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Official Policy Banner */}
          <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80 text-amber-900 text-xs leading-relaxed flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-950">Academic Governance & Versioned Rechecking</p>
              <p className="mt-0.5 text-amber-800/90">
                All recheck requests are evaluated by senior ICAI-pattern faculty against verified Suggested Answers and step-marking schemes.
                If marks are adjusted, an immutable versioned record (v2) is generated with full delta traceability.
              </p>
            </div>
          </div>

          {successMsg && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Request Successfully Submitted</p>
                <p className="mt-0.5">{successMsg}</p>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Cannot Register Request</p>
                <p className="mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form id="recheck-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Scope of Review */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Target Question for Review
              </label>
              <select
                value={selectedQuestion}
                onChange={(e) => setSelectedQuestion(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="ALL">Complete Answer Sheet (Full Paper Recheck)</option>
                <optgroup label="Multiple Choice Questions (Division A)">
                  {evaluationResult.questions
                    .filter((q) => q.questionNumber.startsWith('MCQ') || q.markingComponents?.some(c => c.componentType === 'MCQ'))
                    .map((q, idx) => (
                      <option key={idx} value={q.questionNumber}>
                        {q.questionNumber} — Awarded {q.marksAwarded}/{q.maximumMarks} Marks
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Descriptive Sub-Questions (Division B)">
                  {evaluationResult.questions
                    .filter((q) => !q.questionNumber.startsWith('MCQ') && !q.markingComponents?.some(c => c.componentType === 'MCQ'))
                    .map((q, idx) => (
                      <option key={idx} value={q.questionNumber}>
                        Question {q.questionNumber}{q.subQuestion ? `(${q.subQuestion})` : ''} — Awarded {q.marksAwarded}/{q.maximumMarks} Marks
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>

            {/* Target Question Details Snapshot */}
            {currentTargetQ && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                <div className="flex items-center justify-between font-semibold text-slate-800">
                  <span>Current Mark: {currentTargetQ.marksAwarded} / {currentTargetQ.maximumMarks} Marks</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    currentTargetQ.status === 'correct' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {currentTargetQ.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-slate-600 line-clamp-2">
                  <span className="font-semibold text-slate-700">Examiner Feedback:</span> {currentTargetQ.detailedFeedback}
                </p>
              </div>
            )}

            {/* Dispute Category */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Grounds for Recheck
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full text-xs font-medium px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="MCQ Option Dispute">MCQ Option Dispute (Candidate selected option matching suggested answer)</option>
                <option value="Step-Marking Omission">Step-Marking Omission (Valid intermediate working note or formula ignored)</option>
                <option value="Alternative Permissible Approach">Alternative Permissible Approach (ICAI recognized alternative solution method)</option>
                <option value="Legible Handwriting Misread">Legible Handwriting Misread (Answer was clear and legible)</option>
                <option value="Total / Mark Summation Discrepancy">Total / Mark Summation Discrepancy (Arithmetical slip in totaling)</option>
                <option value="Other Factual Discrepancy">Other Factual Discrepancy</option>
              </select>
            </div>

            {/* Student Explanation / Evidence */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Specific Grounds & Working Note Evidence
                </label>
                <span className="text-[11px] text-slate-400">{studentNotes.length}/600 chars</span>
              </div>
              <textarea
                value={studentNotes}
                onChange={(e) => setStudentNotes(e.target.value.slice(0, 600))}
                rows={3}
                placeholder="Specify page number, step, formula, or statutory provision. (e.g. In page 3 working note 1, TDS under section 194C was computed as ₹2,400 with full reasoning, but 0 marks were awarded.)"
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 leading-relaxed"
              />
            </div>

            {/* Recheck Mode Preference */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Evaluation Rigor Benchmark
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  { id: 'standard', title: 'Standard ICAI', desc: 'Balanced step-marking' },
                  { id: 'strict', title: 'Strict Examiner', desc: 'Zero leniency on working' },
                  { id: 'lenient', title: 'Substance Focus', desc: 'Intent & logic prioritized' },
                ].map((mode) => (
                  <button
                    type="button"
                    key={mode.id}
                    onClick={() => setRequestedMode(mode.id)}
                    className={`p-2.5 rounded-xl border text-left transition ${
                      requestedMode === mode.id
                        ? 'border-blue-500 bg-blue-50/50 text-blue-900 ring-1 ring-blue-500'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <p className="font-bold text-xs">{mode.title}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{mode.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </form>

          {/* Existing Recheck History for this Evaluation */}
          {existingRequests.length > 0 && (
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-500" />
                Previous Recheck Requests ({existingRequests.length})
              </h3>
              <div className="space-y-2">
                {existingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/60 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">
                        Target: {req.question_number}
                        {req.sub_question ? `(${req.sub_question})` : ''}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          req.status === 'ADJUSTED' || req.status === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : req.status === 'REJECTED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>
                    <p className="text-slate-600">
                      <strong className="text-slate-700">Reason:</strong> {req.reason}
                    </p>
                    {req.student_notes && (
                      <p className="text-slate-500 italic">"{req.student_notes}"</p>
                    )}
                    {req.reviewer_notes && (
                      <div className="mt-1 p-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px]">
                        <span className="font-semibold text-slate-800">Examiner Review Resolution:</span>{' '}
                        {req.reviewer_notes}
                        {req.adjusted_marks !== undefined && req.adjusted_marks !== null && (
                          <span className="ml-2 font-bold text-emerald-700 font-mono">
                            (Adjusted to {req.adjusted_marks}m)
                          </span>
                        )}
                      </div>
                    )}
                    <p className="text-[10px] text-slate-400">
                      Requested on {new Date(req.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition"
          >
            Cancel
          </button>
          <button
            form="recheck-form"
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm cursor-pointer"
          >
            {isSubmitting ? (
              <RotateCcw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>Submit Recheck Request</span>
          </button>
        </div>
      </div>
    </div>
  );
};
