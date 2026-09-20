import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  User,
  Mail,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Search,
  KeyRound,
  FileText,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import { apiRequest } from '../../api/client.js';
import { formatDateTimeIST } from '../../utils/timezone.js';

interface RecoveryRequest {
  id: string;
  user_id: string;
  email: string;
  phone: string | null;
  srn_reg_no: string | null;
  reason: string;
  status: string;
  created_at: string;
  full_name: string | null;
  role: string | null;
}

export const AdminMfaRecoveryRequestsSection: React.FC = () => {
  const [requests, setRequests] = useState<RecoveryRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string>('');

  // Modal states for resolution
  const [selectedRequest, setSelectedRequest] = useState<RecoveryRequest | null>(null);
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [isSubmittingResolution, setIsSubmittingResolution] = useState<boolean>(false);

  const fetchRequests = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await apiRequest<{ success: boolean; requests: RecoveryRequest[] }>(
        '/api/auth/mfa/recovery-requests'
      );
      setRequests(res.requests || []);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to load recovery requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest || !actionType) return;

    setIsSubmittingResolution(true);
    setErrorMessage('');
    setActionSuccessMessage('');

    try {
      await apiRequest(`/api/auth/mfa/recovery-requests/${selectedRequest.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          decision: actionType === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          reviewNotes: reviewNotes.trim(),
        }),
      });

      setActionSuccessMessage(
        `Recovery request for ${selectedRequest.email} has been ${
          actionType === 'APPROVE' ? 'approved (MFA reset)' : 'rejected'
        }.`
      );
      setSelectedRequest(null);
      setActionType(null);
      setReviewNotes('');
      await fetchRequests();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to resolve recovery request.');
    } finally {
      setIsSubmittingResolution(false);
    }
  };

  const filteredRequests = requests.filter((r) => {
    const query = searchQuery.toLowerCase();
    return (
      r.email.toLowerCase().includes(query) ||
      (r.full_name && r.full_name.toLowerCase().includes(query)) ||
      (r.srn_reg_no && r.srn_reg_no.toLowerCase().includes(query)) ||
      r.reason.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              MFA Account Recovery Review
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Administrative verification for users who have lost all authenticator devices & recovery codes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            type="button"
            onClick={fetchRequests}
            disabled={loading}
            className="py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Action Messages */}
      {actionSuccessMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search requests by name, email, ICAI SRN, or reason keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:border-blue-600"
          />
        </div>
        <span className="text-xs font-bold text-slate-400 whitespace-nowrap">
          {filteredRequests.length} Pending
        </span>
      </div>

      {/* Requests List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
            <span>Loading recovery requests...</span>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/60" />
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              No pending recovery requests
            </span>
            <span className="text-slate-400">All user recovery tickets have been reviewed and resolved.</span>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredRequests.map((req) => (
              <div
                key={req.id}
                className="p-5 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
              >
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {req.full_name || req.email}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {req.role || 'USER'}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                      Pending Review
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>{req.email}</span>
                    </div>
                    {req.phone && (
                      <div className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{req.phone}</span>
                      </div>
                    )}
                    {req.srn_reg_no && (
                      <div className="flex items-center gap-1 font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        <span>ICAI SRN: {req.srn_reg_no}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formatDateTimeIST(req.created_at)}</span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    <p className="font-semibold text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wider mb-1">
                      User Explanation / Circumstances:
                    </p>
                    {req.reason}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRequest(req);
                      setActionType('APPROVE');
                      setReviewNotes('Identity verified via registered contact credentials.');
                    }}
                    className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve & Reset MFA</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRequest(req);
                      setActionType('REJECT');
                      setReviewNotes('Insufficient verification details provided.');
                    }}
                    className="py-2 px-3 border border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolution Confirmation Modal */}
      {selectedRequest && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                {actionType === 'APPROVE' ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-rose-600" />
                )}
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {actionType === 'APPROVE' ? 'Approve Recovery & Reset MFA' : 'Reject Recovery Request'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedRequest(null);
                  setActionType(null);
                }}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResolve} className="space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs space-y-1">
                <p className="font-semibold text-slate-900 dark:text-white">
                  User: {selectedRequest.full_name || selectedRequest.email}
                </p>
                <p className="text-slate-500 dark:text-slate-400">Email: {selectedRequest.email}</p>
                {selectedRequest.srn_reg_no && (
                  <p className="text-slate-500 dark:text-slate-400 font-mono">
                    ICAI SRN: {selectedRequest.srn_reg_no}
                  </p>
                )}
              </div>

              {actionType === 'APPROVE' ? (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    Security Reset Action
                  </p>
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                    Approving will retire all existing TOTP authenticator secrets and recovery codes. The user will be required to configure fresh Two-Factor Authentication upon their next sign-in.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-900 dark:text-rose-200 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    Request Rejection
                  </p>
                  <p className="text-[11px] text-rose-800 dark:text-rose-300 leading-relaxed">
                    The recovery request will be closed. The user will not be granted account access until authentic verification is provided.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Administrative Review Notes *
                </label>
                <textarea
                  required
                  rows={3}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="State the verification checks performed before reaching this decision..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:border-blue-600 resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmittingResolution || !reviewNotes.trim()}
                  className={`flex-1 py-2.5 font-bold text-xs rounded-xl text-white transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer ${
                    actionType === 'APPROVE'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {isSubmittingResolution ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>{actionType === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRequest(null);
                    setActionType(null);
                  }}
                  className="py-2.5 px-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
