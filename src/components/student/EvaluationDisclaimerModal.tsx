import React, { useState, useEffect } from 'react';
import { ShieldAlert, AlertTriangle, BookOpen, CheckCircle, RefreshCw } from 'lucide-react';
import { apiRequest } from '../../api/client.js';

export const CURRENT_DISCLAIMER_VERSION = 'v1.0';

interface EvaluationDisclaimerModalProps {
  isOpen: boolean;
  onAcknowledged: () => void;
}

export const EvaluationDisclaimerModal: React.FC<EvaluationDisclaimerModalProps> = ({
  isOpen,
  onAcknowledged,
}) => {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAcknowledge = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      const res = await apiRequest<{ success: boolean; acknowledged: boolean; version: string }>(
        '/api/student/disclaimer/acknowledge',
        {
          method: 'POST',
          body: JSON.stringify({ version: CURRENT_DISCLAIMER_VERSION }),
        }
      );

      if (res.success || res.acknowledged) {
        onAcknowledged();
      } else {
        setError('Could not record your acknowledgement. Please try again.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record acknowledgement.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs select-none"
      onClick={(e) => {
        // Prevent dismissal on background/backdrop click
        e.stopPropagation();
      }}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-7 space-y-5 text-slate-800 dark:text-slate-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Icon */}
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="disclaimer-title" className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Evaluation &amp; Diagnostic Disclaimer
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Mandatory advisory regarding AI-assisted evaluation before checking your answer sheet
            </p>
          </div>
        </div>

        {/* Structured Legal & Diagnostic Terms */}
        <div className="space-y-3.5 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl p-4 sm:p-5 max-h-[50vh] overflow-y-auto leading-relaxed">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-900 dark:text-slate-100">AI-Assisted Educational Tool:</strong>
              <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                This evaluation is generated using advanced AI assistance calibrated against official ICAI materials. It is provided strictly for educational, diagnostic, and self-assessment purposes to help you identify strengths and areas of improvement.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-900 dark:text-slate-100">Occasional Variance &amp; Errors:</strong>
              <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                While the system utilizes step-marking rubrics and deterministic rules, AI models may occasionally make errors, misinterpret handwritten notations, or vary in subjective legal or theoretical evaluations.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <BookOpen className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-900 dark:text-slate-100">Not an Official ICAI Result:</strong>
              <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                This report is neither an official ICAI result nor an assessment by an official ICAI examiner. Scores and step marks are purely diagnostic simulations; marks in actual ICAI exams are neither guaranteed nor represented by this assessment.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-900 dark:text-slate-100">Authoritative ICAI Materials:</strong>
              <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                Always refer to official ICAI Study Material, Suggested Answers, Revision Test Papers (RTP), and Mock Test Papers (MTP) as the sole authoritative source of academic and legal examination guidance.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* Action Button - Explicit Un-dismissible Single CTA */}
        <div className="pt-2">
          <button
            id="acknowledge-disclaimer-btn"
            type="button"
            onClick={handleAcknowledge}
            disabled={isSubmitting}
            className="w-full py-3.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Recording Acknowledgement...</span>
              </>
            ) : (
              <span>OK, I Understand</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
