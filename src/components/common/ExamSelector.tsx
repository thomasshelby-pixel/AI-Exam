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
            className={`p-2.5 rounded-xl border text-left transition relative cursor-pointer ${
              selectedExam === 'CA'
                ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-600 dark:border-blue-500 shadow-xs ring-1 ring-blue-600/30'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">CA</span>
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                <Check className="w-2.5 h-2.5" /> Available
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
              Chartered Accountancy
            </p>
          </button>

          {/* CS Card - Locked Coming Soon */}
          <button
            type="button"
            onClick={() => handleExamClick('CS')}
            className="p-2.5 rounded-xl border text-left transition relative cursor-pointer bg-slate-50/80 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/70 hover:border-slate-300 dark:hover:border-slate-600 group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-black text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                CS
              </span>
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-800 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                <Lock className="w-2.5 h-2.5" /> Coming Soon
              </span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 leading-tight">
              Company Secretary
            </p>
          </button>

          {/* CMA Card - Locked Coming Soon */}
          <button
            type="button"
            onClick={() => handleExamClick('CMA')}
            className="p-2.5 rounded-xl border text-left transition relative cursor-pointer bg-slate-50/80 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/70 hover:border-slate-300 dark:hover:border-slate-600 group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-black text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                CMA
              </span>
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-800 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                <Lock className="w-2.5 h-2.5" /> Coming Soon
              </span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 leading-tight">
              Cost & Management
            </p>
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
