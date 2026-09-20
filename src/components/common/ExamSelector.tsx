import React, { useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { ComingSoonModal, ComingSoonExamType } from './ComingSoonModal.js';

interface ExamSelectorProps {
  selectedExam?: 'CA';
  onSelectCA?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const ExamSelector: React.FC<ExamSelectorProps> = ({
  selectedExam = 'CA',
  onSelectCA,
  className = '',
  size = 'md',
}) => {
  const [modalExam, setModalExam] = useState<ComingSoonExamType | null>(null);

  const handleExamClick = (exam: 'CA' | 'CS' | 'CMA') => {
    if (exam === 'CA') {
      if (onSelectCA) onSelectCA();
    } else {
      setModalExam(exam);
    }
  };

  const isSmall = size === 'sm';

  return (
    <>
      <div className={`space-y-1.5 ${className}`}>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          Examination Type
        </label>
        <div className="grid grid-cols-3 gap-2">
          {/* CA Card - Active */}
          <button
            type="button"
            onClick={() => handleExamClick('CA')}
            className={`p-2.5 rounded-xl border text-left transition relative cursor-pointer flex flex-col justify-between min-w-0 ${
              selectedExam === 'CA'
                ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-600 dark:border-blue-500 shadow-xs ring-1 ring-blue-600/30'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
            }`}
          >
            <div>
              <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white block">CA</span>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-tight truncate">
                Chartered Accountancy
              </p>
            </div>
            <div className="mt-2">
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded inline-flex items-center gap-1 whitespace-nowrap">
                <Check className="w-3 h-3 shrink-0" /> Available
              </span>
            </div>
          </button>

          {/* CS Card - Locked Coming Soon */}
          <button
            type="button"
            onClick={() => handleExamClick('CS')}
            className="p-2.5 rounded-xl border text-left transition relative cursor-pointer bg-slate-50/80 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/70 hover:border-slate-300 dark:hover:border-slate-600 group flex flex-col justify-between min-w-0"
          >
            <div>
              <span className="text-xs sm:text-sm font-black text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition block">
                CS
              </span>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 leading-tight truncate">
                Company Secretary
              </p>
            </div>
            <div className="mt-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 rounded inline-flex items-center gap-1 whitespace-nowrap">
                <Lock className="w-3 h-3 shrink-0" /> Coming Soon
              </span>
            </div>
          </button>

          {/* CMA Card - Locked Coming Soon */}
          <button
            type="button"
            onClick={() => handleExamClick('CMA')}
            className="p-2.5 rounded-xl border text-left transition relative cursor-pointer bg-slate-50/80 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/70 hover:border-slate-300 dark:hover:border-slate-600 group flex flex-col justify-between min-w-0"
          >
            <div>
              <span className="text-xs sm:text-sm font-black text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition block">
                CMA
              </span>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 leading-tight truncate">
                Cost &amp; Management
              </p>
            </div>
            <div className="mt-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 rounded inline-flex items-center gap-1 whitespace-nowrap">
                <Lock className="w-3 h-3 shrink-0" /> Coming Soon
              </span>
            </div>
          </button>
        </div>
      </div>

      {modalExam && (
        <ComingSoonModal
          isOpen={!!modalExam}
          examType={modalExam}
          onClose={() => setModalExam(null)}
        />
      )}
    </>
  );
};
