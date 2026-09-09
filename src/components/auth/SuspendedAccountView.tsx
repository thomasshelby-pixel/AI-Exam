import React, { useState } from 'react';
import { useAuth, SuspendedAccountInfo } from '../../context/AuthContext.js';
import { AlertOctagon, Send, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

interface SuspendedAccountViewProps {
  suspension: SuspendedAccountInfo;
  onClose?: () => void;
}

export const SuspendedAccountView: React.FC<SuspendedAccountViewProps> = ({ suspension, onClose }) => {
  const { submitRevocationRequest } = useAuth();
  const [appealReason, setAppealReason] = useState('Misunderstanding or dispute regarding policy');
  const [explanation, setExplanation] = useState('');
  const [supportingInfo, setSupportingInfo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!explanation.trim()) {
      setErrorMessage('Please provide a detailed explanation supporting your revocation appeal.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const res = await submitRevocationRequest(appealReason, explanation, supportingInfo);
      setSuccessMessage(res.message || 'Your revocation request has been submitted to the administrator for review.');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to submit revocation request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formattedDate = new Date(suspension.suspendedAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="w-full max-w-lg bg-white border border-rose-200 rounded-xl p-6 sm:p-7 shadow-lg text-slate-800">
      {/* Header */}
      <div className="flex items-start gap-3 pb-4 border-b border-rose-100">
        <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
          <AlertOctagon className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-base sm:text-lg font-bold text-rose-900 leading-tight">
            Account Access Suspended
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Your account has been temporarily suspended by the platform administrator.
          </p>
        </div>
      </div>

      {/* Suspension Details */}
      <div className="mt-4 p-3.5 rounded-lg bg-rose-50/60 border border-rose-200/80 space-y-2 text-xs">
        <div>
          <span className="font-bold text-rose-900 block mb-0.5">Reason for Suspension:</span>
          <p className="text-slate-800 bg-white p-2 rounded border border-rose-100 font-medium">
            {suspension.reason}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-slate-500 text-[11px] pt-1">
          <Clock className="w-3.5 h-3.5" />
          <span>Suspension effective from: <strong className="text-slate-700">{formattedDate}</strong></span>
        </div>
      </div>

      {/* Appeal Form or Success State */}
      {successMessage ? (
        <div className="mt-5 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
          <h3 className="text-sm font-bold text-emerald-900">Revocation Appeal Submitted</h3>
          <p className="text-xs text-emerald-700">{successMessage}</p>
          <p className="text-[11px] text-slate-500 pt-2">
            Administrators review appeals within 24-48 business hours. You will receive an email notification when a decision is rendered.
          </p>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="mt-3 px-4 py-1.5 text-xs font-semibold rounded bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50"
            >
              Back to Login
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
          <div className="border-t border-slate-100 pt-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Apply for Revocation of Suspension
            </h3>
            <p className="text-[11px] text-slate-500">
              Submit your formal statement and clarifications for administrator reinstatement review.
            </p>
          </div>

          {errorMessage && (
            <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Basis of Appeal
            </label>
            <select
              value={appealReason}
              onChange={(e) => setAppealReason(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
            >
              <option value="Misunderstanding or dispute regarding policy">Misunderstanding or dispute regarding policy</option>
              <option value="Compromised credentials recovered">Compromised credentials recovered</option>
              <option value="Identity & ICAI Registration verified">Identity & ICAI Registration verified</option>
              <option value="Institute affiliation corrected">Institute affiliation corrected</option>
              <option value="Other legitimate grievance">Other legitimate grievance</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Detailed Explanation <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="State the circumstances and why your account access should be reinstated..."
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Supporting Information or Contact (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Reference ICAI Roll No, alternate phone number"
              value={supportingInfo}
              onChange={(e) => setSupportingInfo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Back to Sign In
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs hover:shadow transition disabled:opacity-60 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Submitting Appeal...' : 'Submit Revocation Appeal'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
