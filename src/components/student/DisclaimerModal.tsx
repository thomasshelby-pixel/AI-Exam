import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle } from 'lucide-react';

export interface DisclaimerModalProps {
  isOpen: boolean;
  onAcknowledge?: () => void;
  onAcknowledged?: () => void;
  disclaimerVersion?: string;
  version?: string;
}

export const DisclaimerModal: React.FC<DisclaimerModalProps> = ({
  isOpen,
  onAcknowledge,
  onAcknowledged,
  disclaimerVersion,
  version,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveVersion = disclaimerVersion || version || 'v1.0';

  // Prevent closing with Escape key
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
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const token = typeof window !== 'undefined'
        ? (localStorage.getItem('ca_exam_checker_token') || localStorage.getItem('token') || '')
        : '';

      const response = await fetch('/api/student/disclaimer/acknowledge', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ version: effectiveVersion, disclaimerVersion: effectiveVersion }),
      });

      if (!response.ok) {
        // Fallback to alias route
        const fallbackRes = await fetch('/api/student/acknowledge-disclaimer', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ version: effectiveVersion, disclaimerVersion: effectiveVersion }),
        });

        if (!fallbackRes.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to save disclaimer acknowledgment');
        }
      }

      // Record acknowledgement locally for current version
      localStorage.setItem('ca_exam_checker_disclaimer_version', effectiveVersion);
      localStorage.setItem('ca_exam_checker_disclaimer_ack', 'true');
      localStorage.setItem('ca_exam_checker_disclaimer_ack_time', new Date().toISOString());

      if (onAcknowledge) onAcknowledge();
      if (onAcknowledged) onAcknowledged();
    } catch (err: unknown) {
      console.error('Error acknowledging disclaimer:', err);
      const msg = err instanceof Error ? err.message : 'Could not record acknowledgement. Please try again.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div
      id="disclaimer-modal-overlay"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 select-none"
      onClick={(e) => {
        // Prevent outside-click dismissal
        e.preventDefault();
        e.stopPropagation();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-modal-title"
    >
      <div
        id="disclaimer-modal-container"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Strictly No X dismissal button */}
        <div className="flex items-center gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="p-2.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 rounded-xl text-amber-600 dark:text-amber-400 shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h2 id="disclaimer-modal-title" className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Important Disclaimer
            </h2>
          </div>
        </div>

        {/* Disclaimer Text */}
        <div className="space-y-3.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
          <p>
            This evaluation is generated with the assistance of artificial intelligence
            and is intended for educational and diagnostic purposes only.
          </p>

          <p>
            AI-based evaluation may contain occasional errors in interpretation,
            mark allocation, handwriting recognition, or application of the supplied
            marking criteria.
          </p>

          <p>
            This evaluation should not be considered an official ICAI result, official
            examiner assessment, or guarantee of marks.
          </p>

          <p>
            Students are advised to review the checked copy, explanations and references
            carefully and use official ICAI material for authoritative guidance.
          </p>

          <p className="font-medium text-slate-800 dark:text-slate-200 pt-1">
            By clicking &apos;OK, I Understand&apos;, you acknowledge these limitations and choose
            to view the AI-assisted evaluation.
          </p>
        </div>

        {error && (
          <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
            {error}
          </p>
        )}

        {/* Action Button */}
        <div className="flex items-center justify-end pt-2">
          <button
            id="acknowledge-disclaimer-btn"
            type="button"
            disabled={isSubmitting}
            onClick={handleAcknowledge}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-semibold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>OK, I Understand</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};

export {
  DisclaimerModal as EvaluationDisclaimerModal,
  DisclaimerModal as StudentDisclaimerModal,
};
