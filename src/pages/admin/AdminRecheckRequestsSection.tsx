import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Mail,
  FileText,
  Send,
  Eye,
  Loader2,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  History,
  BookOpen,
} from 'lucide-react';
import { apiRequest, downloadAuthenticatedFile } from '../../api/client.js';

interface RecheckRequest {
  id: string;
  evaluation_id: string;
  student_id: string;
  student_name?: string;
  student_email?: string;
  subject_name?: string;
  paper?: string;
  level?: string;
  current_total_marks?: number;
  current_percentage?: number;
  request_type?: string;
  question_number?: string;
  sub_question?: string;
  reason?: string;
  student_notes?: string;
  disputed_questions_json?: string;
  original_marks?: number;
  adjusted_marks?: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ADJUSTED';
  reviewer_notes?: string;
  created_at: string;
  resolved_at?: string;
}

export const AdminRecheckRequestsSection: React.FC = () => {
  const [requests, setRequests] = useState<RecheckRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Review Modal State
  const [reviewModal, setReviewModal] = useState<RecheckRequest | null>(null);
  const [resolutionType, setResolutionType] = useState<'ADJUSTED' | 'APPROVED' | 'REJECTED'>('ADJUSTED');
  const [adjustedMarksInput, setAdjustedMarksInput] = useState<string>('');
  const [reviewerNotes, setReviewerNotes] = useState<string>('');
  const [isSubmittingResolution, setIsSubmittingResolution] = useState<boolean>(false);

  // Manual Email Modal State (Section 17 & 18)
  const [emailModal, setEmailModal] = useState<{
    evaluationId: string;
    studentEmail: string;
    studentName: string;
    paper: string;
  } | null>(null);
  const [emailRecipient, setEmailRecipient] = useState<string>('');
  const [emailCopyType, setEmailCopyType] = useState<'CHECKED_COPY' | 'DETAILED_REPORT' | 'BOTH'>('BOTH');
  const [emailVersion, setEmailVersion] = useState<'v2' | 'v1'>('v2');
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);
  const [emailFeedback, setEmailFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Email Audit Logs Drawer State
  const [showAuditLogsModal, setShowAuditLogsModal] = useState<boolean>(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState<boolean>(false);

  // Evidence Modal State (Grounding & Reference Inspection)
  const [evidenceModal, setEvidenceModal] = useState<any | null>(null);
  const [loadingEvidenceId, setLoadingEvidenceId] = useState<string | null>(null);

  const openEvidenceModal = async (reqItem: RecheckRequest) => {
    try {
      setLoadingEvidenceId(reqItem.id);
      setErrorMsg('');
      const res = await apiRequest<any>(`/api/admin/recheck-requests/${reqItem.id}/evidence`);
      setEvidenceModal(res);
    } catch (err: any) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to retrieve recheck evidence');
    } finally {
      setLoadingEvidenceId(null);
    }
  };

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await apiRequest<{ success: boolean; requests: RecheckRequest[] }>(
        `/api/admin/recheck-requests?${params.toString()}`
      );
      setRequests(res.requests || []);
    } catch (err: any) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load recheck requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRequests();
  };

  const openReviewModal = (reqItem: RecheckRequest) => {
    setReviewModal(reqItem);
    setResolutionType(reqItem.status === 'PENDING' ? 'ADJUSTED' : (reqItem.status as any));
    setAdjustedMarksInput(reqItem.adjusted_marks !== null && reqItem.adjusted_marks !== undefined ? String(reqItem.adjusted_marks) : '');
    setReviewerNotes(reqItem.reviewer_notes || '');
  };

  const handleResolveRecheck = async () => {
    if (!reviewModal) return;

    if (resolutionType === 'ADJUSTED' && (!adjustedMarksInput.trim() || isNaN(Number(adjustedMarksInput)))) {
      setErrorMsg('Please enter a valid numeric score for adjusted marks.');
      return;
    }

    setIsSubmittingResolution(true);
    setErrorMsg('');
    try {
      const res = await apiRequest<{
        success: boolean;
        message: string;
        newTotalMarks?: number;
        outcome?: string;
      }>(`/api/admin/recheck-requests/${reviewModal.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          resolution: resolutionType,
          adjustedMarks: resolutionType === 'ADJUSTED' ? Number(adjustedMarksInput) : undefined,
          reviewerNotes: reviewerNotes.trim(),
        }),
      });

      setSuccessMsg(res.message || 'Recheck resolution saved and student notified.');
      setReviewModal(null);
      fetchRequests();
    } catch (err: any) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to resolve recheck request');
    } finally {
      setIsSubmittingResolution(false);
    }
  };

  const openEmailModal = (reqItem: RecheckRequest) => {
    setEmailModal({
      evaluationId: reqItem.evaluation_id,
      studentEmail: reqItem.student_email || '',
      studentName: reqItem.student_name || 'CA Student',
      paper: reqItem.subject_name || reqItem.paper || 'CA Examination',
    });
    setEmailRecipient(reqItem.student_email || '');
    setEmailCopyType('BOTH');
    setEmailVersion('v2');
    setEmailFeedback(null);
  };

  const handleSendManualEmail = async () => {
    if (!emailModal) return;
    if (!emailRecipient || !emailRecipient.includes('@')) {
      setEmailFeedback({ type: 'error', message: 'Please provide a valid recipient email address.' });
      return;
    }

    setIsSendingEmail(true);
    setEmailFeedback(null);

    try {
      const res = await apiRequest<{
        success: boolean;
        message: string;
        status?: string;
      }>(`/api/admin/evaluations/${emailModal.evaluationId}/send-copy-email`, {
        method: 'POST',
        body: JSON.stringify({
          recipient: emailRecipient.trim(),
          copyType: emailCopyType,
          version: emailVersion,
        }),
      });

      if (res.success) {
        setEmailFeedback({
          type: 'success',
          message: res.message || 'Email sent successfully.',
        });
        setTimeout(() => {
          setEmailModal(null);
        }, 1800);
      } else {
        setEmailFeedback({
          type: 'error',
          message: 'Email could not be sent. Please try again.',
        });
      }
    } catch (err: any) {
      setEmailFeedback({
        type: 'error',
        message: 'Email could not be sent. Please try again.',
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const fetchEmailAuditLogs = async () => {
    setLoadingAuditLogs(true);
    try {
      const res = await apiRequest<{ success: boolean; logs: any[] }>('/api/admin/email-audit-logs');
      setAuditLogs(res.logs || []);
      setShowAuditLogsModal(true);
    } catch (err: any) {
      setErrorMsg('Failed to load email audit logs');
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-100">
              <RotateCcw className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900">Student Recheck & Resolution Management</h1>
          </div>
          <p className="text-sm text-slate-500">
            Review student-submitted disputes, amend evaluations with V1/V2 immutable versioning, and send checked copies by email.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchEmailAuditLogs}
            disabled={loadingAuditLogs}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition"
          >
            <History className="w-4 h-4 text-slate-600" />
            {loadingAuditLogs ? 'Loading...' : 'Email Audit Trail'}
          </button>
          <button
            onClick={fetchRequests}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition"
          >
            <RotateCcw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-rose-500 hover:text-rose-700">×</button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-500 hover:text-emerald-700">×</button>
        </div>
      )}

      {/* Filters & Search */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student, email, paper, question..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Status:
          </span>
          {(['ALL', 'PENDING', 'ADJUSTED', 'APPROVED', 'REJECTED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === st
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st === 'ALL' ? 'All Requests' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-sm">Loading recheck requests...</span>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <RotateCcw className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="font-semibold text-slate-700">No Recheck Requests Found</h3>
            <p className="text-xs text-slate-400 mt-1">There are no requests matching your filter criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Date / ID</th>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Paper & Scope</th>
                  <th className="py-3 px-4">Student Reasoning</th>
                  <th className="py-3 px-4 text-center">Score (Old → New)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => {
                  const isPending = r.status === 'PENDING';
                  const isAdjusted = r.status === 'ADJUSTED';
                  const isApproved = r.status === 'APPROVED';

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        <div className="font-medium text-slate-800">
                          {new Date(r.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                        <div className="text-[11px] text-slate-400">{r.id.slice(0, 10)}...</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{r.student_name || 'Student'}</div>
                        <div className="text-xs text-slate-500">{r.student_email || '—'}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{r.subject_name || r.paper || 'Paper'}</div>
                        <div className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                          {r.request_type === 'COMPLETE_PAPER'
                            ? 'Complete Paper'
                            : `Question ${r.question_number || 'All'}${r.sub_question ? ` (${r.sub_question})` : ''}`}
                        </div>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <div className="text-xs text-slate-700 line-clamp-2">
                          {r.student_notes || r.reason || <span className="text-slate-400 italic">No notes provided</span>}
                        </div>
                        {r.reviewer_notes && (
                          <div className="text-[11px] text-blue-700 mt-1 line-clamp-1">
                            <span className="font-semibold">Reviewer:</span> {r.reviewer_notes}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className="font-semibold text-slate-700">{r.original_marks ?? r.current_total_marks ?? '—'}</span>
                        {isAdjusted && r.adjusted_marks !== null && r.adjusted_marks !== undefined && (
                          <>
                            <span className="mx-1 text-slate-400">→</span>
                            <span className="font-bold text-emerald-700">{r.adjusted_marks}</span>
                          </>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3" /> Pending Review
                          </span>
                        )}
                        {isAdjusted && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Score Adjusted (V2)
                          </span>
                        )}
                        {isApproved && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            <CheckCircle2 className="w-3 h-3" /> Affirmed (Original Stands)
                          </span>
                        )}
                        {r.status === 'REJECTED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3 h-3" /> Rejected
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEvidenceModal(r)}
                            disabled={loadingEvidenceId === r.id}
                            title="Inspect Grounding & Evidence"
                            className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 border border-slate-200 transition"
                          >
                            {loadingEvidenceId === r.id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                            ) : (
                              <BookOpen className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => openReviewModal(r)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition"
                          >
                            {isPending ? 'Review & Amend' : 'Re-examine'}
                          </button>
                          <button
                            onClick={() => openEmailModal(r)}
                            title="Send Checked Copy by Email"
                            className="p-1.5 rounded-lg text-slate-600 hover:text-blue-700 hover:bg-slate-100 border border-slate-200 transition"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => downloadAuthenticatedFile(`/api/student/evaluations/${r.evaluation_id}/download-checked-copy`, {
                              filename: `Checked_Copy_${r.evaluation_id}.pdf`,
                              openInNewTab: true,
                            })}
                            title="View / Download Checked Copy (Authenticated)"
                            className="p-1.5 rounded-lg text-slate-600 hover:text-emerald-700 hover:bg-slate-100 border border-slate-200 transition"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review & Amend Modal */}
      {reviewModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-blue-50 text-blue-600">
                  <RotateCcw className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900">Resolve Recheck Request</h3>
                  <p className="text-xs text-slate-500">
                    {reviewModal.student_name} • {reviewModal.subject_name || reviewModal.paper}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReviewModal(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Dispute Summary Box */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Disputed Scope:</span>
                <span className="font-bold text-slate-800">
                  {reviewModal.request_type === 'COMPLETE_PAPER'
                    ? 'Entire Paper'
                    : `Question ${reviewModal.question_number || 'All'}${reviewModal.sub_question ? ` (${reviewModal.sub_question})` : ''}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Current Evaluation Marks:</span>
                <span className="font-bold text-slate-800">
                  {reviewModal.current_total_marks ?? reviewModal.original_marks ?? '—'} / 100
                </span>
              </div>
              {reviewModal.student_notes && (
                <div className="border-t border-slate-200/60 pt-1.5">
                  <span className="text-slate-500 font-medium block mb-0.5">Student's Comment:</span>
                  <p className="text-slate-700 italic">{reviewModal.student_notes}</p>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => openEvidenceModal(reviewModal)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900 transition"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Inspect ICAI Reference & Grounding Evidence</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadAuthenticatedFile(`/api/student/evaluations/${reviewModal.evaluation_id}/download-checked-copy`, {
                    filename: `Checked_Copy_${reviewModal.evaluation_id}.pdf`,
                    openInNewTab: true,
                  })}
                  className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-emerald-700 transition"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>View Copy</span>
                </button>
              </div>
            </div>

            {/* Resolution Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Examiner Resolution Decision
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setResolutionType('ADJUSTED')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border text-center transition ${
                    resolutionType === 'ADJUSTED'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Adjust Marks (V2)
                </button>
                <button
                  type="button"
                  onClick={() => setResolutionType('APPROVED')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border text-center transition ${
                    resolutionType === 'APPROVED'
                      ? 'bg-blue-50 border-blue-500 text-blue-800 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Affirm Original
                </button>
                <button
                  type="button"
                  onClick={() => setResolutionType('REJECTED')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border text-center transition ${
                    resolutionType === 'REJECTED'
                      ? 'bg-rose-50 border-rose-500 text-rose-800 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Reject Request
                </button>
              </div>
            </div>

            {/* If Adjusted: Input New Marks */}
            {resolutionType === 'ADJUSTED' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Revised Score Awarded:</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    Will update report & regenerate V2 checked copy
                  </span>
                </label>
                <input
                  type="number"
                  step="0.25"
                  value={adjustedMarksInput}
                  onChange={(e) => setAdjustedMarksInput(e.target.value)}
                  placeholder="e.g. 6.5 or 62"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-900"
                />
              </div>
            )}

            {/* Reviewer Justification */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Examiner Justification & Notes (Sent in email to student)
              </label>
              <textarea
                rows={3}
                value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                placeholder="Explain the review findings, step-marking verification against ICAI Suggested Answers, or justification for score adjustment/retention..."
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setReviewModal(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResolveRecheck}
                disabled={isSubmittingResolution}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow transition flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmittingResolution ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Resolving...</span>
                  </>
                ) : (
                  <span>Complete Recheck & Notify</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Email Modal (Section 17 & 18) */}
      {emailModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
                  <Mail className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900">Send Checked Copy by Email</h3>
                  <p className="text-xs text-slate-500">{emailModal.paper}</p>
                </div>
              </div>
              <button
                onClick={() => setEmailModal(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Prompt Review (Section 17 requirement) */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
              <p className="font-semibold mb-0.5">Confirmation Prompt:</p>
              <p>Send this evaluation copy to: <span className="font-bold">{emailRecipient || 'student'}</span>?</p>
            </div>

            {/* Recipient Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Recipient Email Address
              </label>
              <input
                type="email"
                value={emailRecipient}
                onChange={(e) => setEmailRecipient(e.target.value)}
                placeholder="student@example.com"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
              />
            </div>

            {/* Copy Type Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Attachments to Include
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setEmailCopyType('CHECKED_COPY')}
                  className={`py-2 px-2 rounded-lg text-xs font-semibold border text-center transition ${
                    emailCopyType === 'CHECKED_COPY'
                      ? 'bg-blue-50 border-blue-500 text-blue-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Checked Copy
                </button>
                <button
                  type="button"
                  onClick={() => setEmailCopyType('DETAILED_REPORT')}
                  className={`py-2 px-2 rounded-lg text-xs font-semibold border text-center transition ${
                    emailCopyType === 'DETAILED_REPORT'
                      ? 'bg-blue-50 border-blue-500 text-blue-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Detailed Report
                </button>
                <button
                  type="button"
                  onClick={() => setEmailCopyType('BOTH')}
                  className={`py-2 px-2 rounded-lg text-xs font-semibold border text-center transition ${
                    emailCopyType === 'BOTH'
                      ? 'bg-blue-50 border-blue-500 text-blue-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Copy + Report
                </button>
              </div>
            </div>

            {/* Version Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Evaluation Version
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEmailVersion('v2')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border text-center transition ${
                    emailVersion === 'v2'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Latest Rechecked (V2)
                </button>
                <button
                  type="button"
                  onClick={() => setEmailVersion('v1')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border text-center transition ${
                    emailVersion === 'v1'
                      ? 'bg-amber-50 border-amber-500 text-amber-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Original Evaluated (V1)
                </button>
              </div>
            </div>

            {/* Feedback Message */}
            {emailFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  emailFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {emailFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                )}
                <span>{emailFeedback.message}</span>
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEmailModal(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendManualEmail}
                disabled={isSendingEmail}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow transition flex items-center gap-2 disabled:opacity-50"
              >
                {isSendingEmail ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Send Email</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Audit Logs Drawer (Section 18) */}
      {showAuditLogsModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-slate-100 text-slate-700">
                  <History className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900">Email Delivery Audit Trail</h3>
                  <p className="text-xs text-slate-500">Immutable audit log of all evaluation and recheck copy deliveries</p>
                </div>
              </div>
              <button
                onClick={() => setShowAuditLogsModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 text-xs">
              {auditLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  No email audit records logged yet.
                </div>
              ) : (
                auditLogs.map((log: any) => (
                  <div key={log.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">{log.recipient_email}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {log.copy_type || log.email_type}
                        </span>
                        {log.version && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-50 text-blue-700">
                            {log.version}
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500">
                        {log.subject_line}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Evaluation ID: {log.evaluation_id} • Status: <span className="font-semibold text-emerald-600">{log.delivery_status}</span>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400 text-right whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowAuditLogsModal(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recheck Evidence & Grounding Modal */}
      {evidenceModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-150 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <BookOpen className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Authoritative Evaluation & Recheck Evidence</h3>
                  <p className="text-xs text-slate-500">
                    {evidenceModal.paper?.subjectName} ({evidenceModal.paper?.level}) • {evidenceModal.candidate?.name || 'Student'} • Dispute: Q{evidenceModal.dispute?.questionNumber || 'All'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEvidenceModal(null)}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none px-2"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
              {/* Top Quick Status Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase block">Current Score</span>
                  <span className="text-lg font-bold text-slate-900">
                    {evidenceModal.currentScore?.totalMarks ?? '—'} / {evidenceModal.currentScore?.maximumMarks ?? 100}
                  </span>
                  <span className="text-xs text-slate-500 ml-1">({evidenceModal.currentScore?.percentage ?? 0}%)</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase block">Evaluation Version</span>
                  <span className="text-lg font-bold text-indigo-700 uppercase">
                    {evidenceModal.currentScore?.version || 'V1'}
                  </span>
                  <span className="text-xs text-slate-500 ml-1">
                    Grade: {evidenceModal.currentScore?.grade || '—'}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase block">Disputed Item</span>
                  <span className="text-lg font-bold text-amber-800">
                    Q{evidenceModal.dispute?.questionNumber || 'All'}{evidenceModal.dispute?.subQuestion ? ` (${evidenceModal.dispute.subQuestion})` : ''}
                  </span>
                  <span className="text-xs text-slate-500 block truncate">
                    {evidenceModal.dispute?.requestType || 'Evaluation Review'}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase block">Reference Hash</span>
                  <span className="text-xs font-mono text-slate-700 block truncate" title={evidenceModal.referenceMaterial?.contentHash}>
                    {evidenceModal.referenceMaterial?.contentHash?.slice(0, 12) || 'Verified'}...
                  </span>
                  <span className="text-[11px] text-emerald-700 font-medium">Authoritative Material</span>
                </div>
              </div>

              {/* Student's Dispute / Reasoning */}
              {evidenceModal.dispute && (
                <div className="p-4 bg-amber-50/80 rounded-xl border border-amber-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wide">
                    <AlertCircle className="w-4 h-4 text-amber-700" />
                    <span>Candidate's Dispute & Supporting Rationale</span>
                  </div>
                  <p className="text-xs text-amber-950 font-medium">
                    {evidenceModal.dispute.studentNotes || evidenceModal.dispute.reason || 'Candidate requested verification of step marking and calculation steps.'}
                  </p>
                  {evidenceModal.dispute.reviewerNotes && (
                    <div className="mt-2 pt-2 border-t border-amber-200/70 text-xs text-emerald-900">
                      <span className="font-bold">Prior Examiner Resolution:</span> {evidenceModal.dispute.reviewerNotes}
                      {evidenceModal.dispute.adjustedMarks !== null && evidenceModal.dispute.adjustedMarks !== undefined && (
                        <span className="ml-1 font-bold font-mono">({evidenceModal.dispute.adjustedMarks}m)</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Two Column Section: Candidate Answer vs Official Reference */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Column 1: Candidate Answer Evidence */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-bold text-slate-800 text-xs uppercase tracking-wide flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-blue-600" />
                      Candidate Handwritten Script
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Pages: {Array.isArray(evidenceModal.candidateAnswer?.pages) ? evidenceModal.candidateAnswer.pages.join(', ') : '1'}
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs font-mono text-slate-700 max-h-48 overflow-y-auto whitespace-pre-wrap">
                    {evidenceModal.candidateAnswer?.studentEvidence || 'Candidate handwritten answer text parsed from script.'}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => downloadAuthenticatedFile(`/api/student/evaluations/${evidenceModal.evaluationId}/download-original`, {
                        filename: `Original_Submission_${evidenceModal.evaluationId}.pdf`,
                        openInNewTab: true,
                      })}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 transition"
                    >
                      Original Script (PDF)
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadAuthenticatedFile(`/api/student/evaluations/${evidenceModal.evaluationId}/download-checked-copy`, {
                        filename: `Checked_Copy_${evidenceModal.evaluationId}.pdf`,
                        openInNewTab: true,
                      })}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-200 transition"
                    >
                      Checked Copy (PDF)
                    </button>
                  </div>
                </div>

                {/* Column 2: Official Reference Material */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-bold text-slate-800 text-xs uppercase tracking-wide flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ICAI Official Suggested Answers & Rubric
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Chars: {evidenceModal.referenceMaterial?.retrievedCharacterCount || 0}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Suggested Solution Excerpt</span>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 max-h-24 overflow-y-auto whitespace-pre-wrap font-sans">
                        {evidenceModal.referenceMaterial?.suggestedAnswerExcerpt || 'Official ICAI suggested solution excerpt.'}
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Marking Scheme / Step Rubric</span>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 max-h-24 overflow-y-auto whitespace-pre-wrap font-sans">
                        {evidenceModal.referenceMaterial?.markingSchemeExcerpt || 'Step-marking breakdown excerpt.'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Original Model Evaluation & Breakdown */}
              {evidenceModal.originalEvaluation && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-bold text-slate-800 text-xs uppercase tracking-wide">
                      AI Model Evaluation Details (Q{evidenceModal.originalEvaluation.questionNumber})
                    </span>
                    <span className="font-bold text-indigo-700 text-sm">
                      Awarded: {evidenceModal.originalEvaluation.marksAwarded} / {evidenceModal.originalEvaluation.maxMarks} marks
                    </span>
                  </div>
                  {evidenceModal.originalEvaluation.generalFeedback && (
                    <p className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-800">Evaluator Rationale:</span> {evidenceModal.originalEvaluation.generalFeedback}
                    </p>
                  )}
                  {Array.isArray(evidenceModal.originalEvaluation.markingComponents) && evidenceModal.originalEvaluation.markingComponents.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-600 uppercase">Step-Marking Breakdown</span>
                      <div className="space-y-1">
                        {evidenceModal.originalEvaluation.markingComponents.map((comp: any, idx: number) => (
                          <div key={idx} className="flex items-start justify-between gap-3 p-2 bg-white rounded-lg border border-slate-200 text-xs">
                            <div>
                              <span className="font-semibold text-slate-800">{comp.stepName || `Step ${idx + 1}`}: </span>
                              <span className="text-slate-600">{comp.feedback || comp.description}</span>
                            </div>
                            <span className="font-bold font-mono text-slate-800 whitespace-nowrap">
                              {comp.awardedMarks} / {comp.maxMarks}m
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setEvidenceModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition"
              >
                Close Evidence
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetReq = requests.find((r) => r.id === evidenceModal.recheckId || r.evaluation_id === evidenceModal.evaluationId);
                  if (targetReq) {
                    setEvidenceModal(null);
                    openReviewModal(targetReq);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow transition flex items-center gap-1.5"
              >
                <span>Proceed to Review & Amend</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
