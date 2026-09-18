import React, { useEffect } from 'react';
import { X, Lock, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';

export type ComingSoonExamType = 'CS' | 'CMA';

interface ComingSoonModalProps {
  isOpen: boolean;
  onClose: () => void;
  examType: ComingSoonExamType;
}

export const ComingSoonModal: React.FC<ComingSoonModalProps> = ({
  isOpen,
  onClose,
  examType,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isCS = examType === 'CS';
  const examFullName = isCS
    ? 'Company Secretary (ICSI)'
    : 'Cost & Management Accountant (ICMAI)';
  const examShort = isCS ? 'CS' : 'CMA';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Ribbon */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white relative">
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="absolute top-4 right-4 p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-bold tracking-wide">
              <Lock className="w-3 h-3" />
              Coming Soon 🚀
            </span>
            <span className="text-white/80 text-xs font-semibold">{examFullName}</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white">
            {examShort} Evaluation
          </h2>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              "We're working on bringing examiner-style AI evaluation for {examShort} students."
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              CA Exam Checker AI is currently focused exclusively on Chartered Accountancy (Foundation, Intermediate, and Final) to maintain zero-tolerance accuracy against authoritative step-marking guidelines.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Examiner-style AI evaluation tailored for the {isCS ? 'ICSI' : 'ICMAI'} curriculum is actively in development. No preliminary or unsupported evaluation workflows will be launched until strict benchmark standards are satisfied.
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active Focus
            </div>
            <div className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
              <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <span>
                <strong>CA is currently the only active examination option</strong> with verified ICAI step-wise step marking, working notes validation, and rechecks.
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-sm cursor-pointer text-center"
            >
              Got It
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
