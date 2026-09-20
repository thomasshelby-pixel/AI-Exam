import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  X,
  Send,
  ShieldCheck,
  History,
  Check,
  FileCheck2,
} from 'lucide-react';
import { EvaluationResult } from '../../types/index.js';
import { formatDateIST, formatDateTimeIST } from '../../utils/timezone.js';

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
  request_type?: string;
  reason?: string;
  student_reason?: string;
  student_notes?: string;
  status: 'PENDING' | 'APPROVED' | 'ADJUSTED' | 'REJECTED' | 'UNCHANGED' | 'INCREASED' | 'DECREASED';
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
  // Recheck scope: 'COMPLETE_PAPER' | 'SPECIFIC_QUESTION' | 'MULTIPLE_QUESTIONS'
  const [requestType, setRequestType] = useState<'COMPLETE_PAPER' | 'SPECIFIC_QUESTION' | 'MULTIPLE_QUESTIONS'>('SPECIFIC_QUESTION');
  const [selectedQuestion, setSelectedQuestion] = useState<string>('');
  const [selectedQuestionsList, setSelectedQuestionsList] = useState<string[]>([]);
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState<boolean>(false);
  const [viewHistoryView, setViewHistoryView] = useState<boolean>(false);
  const [existingRequests, setExistingRequests] = useState<ExistingRecheck[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Available questions in the evaluation
  const questionsList = evaluationResult?.questions || [];

  // Helper to format unique key and display label for questions
  const getQuestionItem = (q: (typeof questionsList)[0], idx: number) => {
    const hasDuplicates = questionsList.filter((item) => item.questionNumber === q.questionNumber).length > 1;
    let identifier = q.questionNumber;
    let display = q.questionNumber.startsWith('MCQ') ? q.questionNumber : `Question ${q.questionNumber}`;

    if (q.subQuestion) {
      identifier = `${q.questionNumber} (${q.subQuestion})`;
      display = `${display} (${q.subQuestion})`;
    } else if (hasDuplicates) {
      const sameNumIndex = questionsList.slice(0, idx + 1).filter((item) => item.questionNumber === q.questionNumber).length;
      identifier = `${q.questionNumber} (Part ${sameNumIndex})`;
      display = `${display} (Part ${sameNumIndex})`;
    }

    return {
      key: `q_${q.questionNumber}_${q.subQuestion || ''}_${idx}`,
      value: identifier,
      label: display,
      awarded: q.marksAwarded,
      max: q.maximumMarks,
      rawQuestionNumber: q.questionNumber,
      subQuestion: q.subQuestion,
    };
  };

  useEffect(() => {
    if (!isOpen) {
      setShowConfirmation(false);
      setViewHistoryView(false);
      setErrorMsg(null);
      return;
    }

    if (preselectedQuestionNumber && preselectedQuestionNumber !== 'ALL') {
      setRequestType('SPECIFIC_QUESTION');
      const matched = questionsList.map((q, i) => getQuestionItem(q, i)).find(
        (item) => item.value === preselectedQuestionNumber || item.rawQuestionNumber === preselectedQuestionNumber
      );
      const chosenVal = matched ? matched.value : preselectedQuestionNumber;
      setSelectedQuestion(chosenVal);
      setSelectedQuestionsList([chosenVal]);
    } else if (questionsList.length > 0 && !selectedQuestion) {
      const firstItem = getQuestionItem(questionsList[0], 0);
      setSelectedQuestion(firstItem.value);
      setSelectedQuestionsList([firstItem.value]);
    }
  }, [isOpen, preselectedQuestionNumber, questionsList]);

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

  const handleToggleMultipleQuestion = (qNum: string) => {
    setSelectedQuestionsList((prev) =>
      prev.includes(qNum) ? prev.filter((item) => item !== qNum) : [...prev, qNum]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validation
    if (requestType === 'SPECIFIC_QUESTION' && !selectedQuestion) {
      setErrorMsg('Please select the specific question you wish to have rechecked.');
      return;
    }

    if (requestType === 'MULTIPLE_QUESTIONS' && selectedQuestionsList.length === 0) {
      setErrorMsg('Please select at least one question for rechecking.');
      return;
    }

    try {
      setIsSubmitting(true);
      const token = localStorage.getItem('ca_exam_checker_token') || localStorage.getItem('token') || '';

      const allItems = questionsList.map((q, i) => getQuestionItem(q, i));
      const selectedItem = allItems.find((item) => item.value === selectedQuestion);

      const qNum = requestType === 'COMPLETE_PAPER'
        ? 'ALL'
        : requestType === 'SPECIFIC_QUESTION'
        ? (selectedItem ? selectedItem.rawQuestionNumber : selectedQuestion)
        : selectedQuestionsList.join(', ');

      const subQ = requestType === 'SPECIFIC_QUESTION'
        ? selectedItem?.subQuestion
        : undefined;

      const payload = {
        requestType,
        questionNumber: qNum,
        subQuestion: subQ,
        disputedQuestions: requestType === 'MULTIPLE_QUESTIONS' ? selectedQuestionsList : [selectedQuestion],
        reason: reason.trim() || undefined,
        studentNotes: reason.trim() || undefined,
      };

      const res = await fetch(`/api/student/evaluations/${evaluationResult.evaluationId}/recheck`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit recheck request. Please try again.');
      }

      setShowConfirmation(true);
      await fetchRecheckHistory();
      onRecheckSubmitted();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while submitting your recheck request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalMarks = evaluationResult.totalMarks ?? 0;
  const maxMarks = evaluationResult.officialPaperMaxMarks ?? evaluationResult.maximumMarks ?? 100;
  const evalDate = evaluationResult.createdAt
    ? formatDateIST(evaluationResult.createdAt)
    : 'Recently Evaluated';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Request Evaluation Recheck</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {evaluationResult.subjectName} {evaluationResult.paper ? `• ${evaluationResult.paper}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Confirmation Modal View (Section 9) */}
        {showConfirmation ? (
          <div className="p-6 space-y-6 flex-1 flex flex-col justify-center items-center text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-2 max-w-md">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Recheck Request Submitted Successfully
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Your recheck request has been submitted for review.
                <br />
                Once the review is completed, your rechecked marks and updated checked copy will be sent to your registered email and will also be reflected on your dashboard.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmation(false);
                  setViewHistoryView(true);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm"
              >
                View Request Status
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        ) : viewHistoryView ? (
          /* Request Status / History View */
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Recheck Requests Status ({existingRequests.length})
              </h3>
              <button
                type="button"
                onClick={() => setViewHistoryView(false)}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                &larr; Back to Recheck Form
              </button>
            </div>

            {loadingHistory ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading request status...</div>
            ) : existingRequests.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                No recheck requests found for this evaluation yet.
              </div>
            ) : (
              <div className="space-y-3">
                {existingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        Disputed Scope: {req.question_number}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          req.status === 'ADJUSTED' || req.status === 'APPROVED' || req.status === 'INCREASED'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                            : req.status === 'REJECTED' || req.status === 'DECREASED'
                            ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                            : req.status === 'UNCHANGED'
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        {req.status.replace('_', ' ')}
                      </span>
                    </div>

                    {(req.reason || req.student_notes || req.student_reason) && (
                      <p className="text-slate-600 dark:text-slate-300">
                        <strong className="text-slate-700 dark:text-slate-200">Reason / Notes:</strong>{' '}
                        {req.student_notes || req.student_reason || req.reason}
                      </p>
                    )}

                    {req.reviewer_notes && (
                      <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px]">
                        <span className="font-bold text-slate-800 dark:text-slate-100">Examiner Review Resolution:</span>{' '}
                        {(!req.reviewer_notes || /^[0-9]+$/.test(req.reviewer_notes.trim()))
                          ? (req.status === 'ADJUSTED'
                              ? 'Score adjusted after senior faculty review against official ICAI suggested answers and step-marking scheme.'
                              : req.status === 'APPROVED'
                              ? 'Senior examiner reviewed candidate submission against ICAI solution rubric and affirmed original evaluation.'
                              : 'Recheck evaluation completed in accordance with ICAI standards.')
                          : req.reviewer_notes}
                        {req.adjusted_marks !== undefined && req.adjusted_marks !== null && (
                          <span className="ml-2 font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                            (Marks Adjusted: {req.adjusted_marks}m)
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                      <span>Submitted on {formatDateTimeIST(req.created_at)}</span>
                      {req.resolved_at && (
                        <span>Resolved on {formatDateIST(req.resolved_at)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          /* Main Recheck Form */
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {/* Summary Bar */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Current Score:</span>{' '}
                <span className="font-bold font-mono text-slate-900 dark:text-white">{totalMarks} / {maxMarks}</span>
                <span className="text-slate-400 ml-1">({Math.round((totalMarks / maxMarks) * 1000) / 10}%)</span>
              </div>
              <div className="text-slate-500 dark:text-slate-400">
                <span>Evaluated:</span>{' '}
                <span className="font-medium text-slate-700 dark:text-slate-300">{evalDate}</span>
              </div>
            </div>

            {/* Standard Review Policy */}
            <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 text-xs leading-relaxed flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-950 dark:text-blue-200">
                Recheck requests are reviewed against the original answer sheet, verified Suggested Answers, and applicable marking scheme. Where automated evidence is insufficient, the request may be escalated for further review.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p>{errorMsg}</p>
              </div>
            )}

            <form id="recheck-form" onSubmit={handleSubmit} className="space-y-4">
              {/* WHAT WOULD YOU LIKE US TO RECHECK? */}
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-2">
                  What would you like us to recheck?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label
                    className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer text-xs transition ${
                      requestType === 'COMPLETE_PAPER'
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-900 dark:text-blue-200 font-semibold ring-1 ring-blue-500'
                        : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="radio"
                      name="requestType"
                      value="COMPLETE_PAPER"
                      checked={requestType === 'COMPLETE_PAPER'}
                      onChange={() => setRequestType('COMPLETE_PAPER')}
                      className="text-blue-600"
                    />
                    <span>Complete Answer Sheet</span>
                  </label>

                  <label
                    className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer text-xs transition ${
                      requestType === 'SPECIFIC_QUESTION'
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-900 dark:text-blue-200 font-semibold ring-1 ring-blue-500'
                        : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="radio"
                      name="requestType"
                      value="SPECIFIC_QUESTION"
                      checked={requestType === 'SPECIFIC_QUESTION'}
                      onChange={() => setRequestType('SPECIFIC_QUESTION')}
                      className="text-blue-600"
                    />
                    <span>Specific Question</span>
                  </label>

                  <label
                    className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer text-xs transition ${
                      requestType === 'MULTIPLE_QUESTIONS'
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-900 dark:text-blue-200 font-semibold ring-1 ring-blue-500'
                        : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="radio"
                      name="requestType"
                      value="MULTIPLE_QUESTIONS"
                      checked={requestType === 'MULTIPLE_QUESTIONS'}
                      onChange={() => setRequestType('MULTIPLE_QUESTIONS')}
                      className="text-blue-600"
                    />
                    <span>Multiple Questions</span>
                  </label>
                </div>
              </div>

              {/* If Specific Question chosen */}
              {requestType === 'SPECIFIC_QUESTION' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Select Question:
                  </label>
                  <select
                    value={selectedQuestion}
                    onChange={(e) => setSelectedQuestion(e.target.value)}
                    className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {questionsList.map((q, idx) => {
                      const item = getQuestionItem(q, idx);
                      return (
                        <option key={item.key} value={item.value}>
                          {item.label} &bull; Awarded {item.awarded}/{item.max} Marks
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* If Multiple Questions chosen */}
              {requestType === 'MULTIPLE_QUESTIONS' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Select Questions to Recheck ({selectedQuestionsList.length} selected):
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto p-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/40">
                    {questionsList.map((q, idx) => {
                      const item = getQuestionItem(q, idx);
                      const isChecked = selectedQuestionsList.includes(item.value);
                      return (
                        <button
                          type="button"
                          key={`btn_${item.key}`}
                          onClick={() => handleToggleMultipleQuestion(item.value)}
                          className={`flex items-center justify-between p-2 rounded-lg border text-left text-xs transition ${
                            isChecked
                              ? 'bg-blue-600 border-blue-600 text-white font-bold'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          <span className="truncate">{item.label}</span>
                          <span className={`text-[10px] font-mono ${isChecked ? 'text-blue-100' : 'text-slate-400'}`}>
                            {item.awarded}/{item.max}m
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* OPTIONAL REASON */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Why do you think this marking should be reviewed? (Optional)
                  </label>
                  <span className="text-[10px] text-slate-400">{reason.length}/500 chars</span>
                </div>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value.slice(0, 500))}
                  rows={3}
                  placeholder="Briefly tell us what you think was marked incorrectly. You can leave this blank if you're not sure."
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 leading-relaxed"
                />
              </div>

              {/* Section 6: No Extra Credit Deduction Note */}
              <div className="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Rechecking is included with your evaluation. No credits will be deducted.</span>
              </div>
            </form>

            {/* Previous Requests Link */}
            {existingRequests.length > 0 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setViewHistoryView(true)}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <History className="w-3.5 h-3.5" />
                  View previous recheck requests for this paper ({existingRequests.length})
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer Buttons */}
        {!showConfirmation && !viewHistoryView && (
          <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
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
        )}
      </div>
    </div>
  );
};
