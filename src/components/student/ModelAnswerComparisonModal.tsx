import React, { useEffect } from 'react';
import { X, Columns, Maximize2 } from 'lucide-react';
import { ModelAnswerComparisonView } from './ModelAnswerComparisonView.js';
import { QuestionEvaluation } from '../../types/index.js';

interface ModelAnswerComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: QuestionEvaluation[];
  subjectName?: string;
  caLevel?: string;
  studentName?: string;
  initialQuestionIndex?: number;
}

export const ModelAnswerComparisonModal: React.FC<ModelAnswerComparisonModalProps> = ({
  isOpen,
  onClose,
  questions,
  subjectName,
  caLevel,
  studentName,
  initialQuestionIndex = 0,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      id="model-answer-comparison-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        id="model-answer-comparison-modal-card"
        className="w-full max-w-6xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
      >
        <div className="overflow-y-auto flex-1">
          <ModelAnswerComparisonView
            questions={questions}
            subjectName={subjectName}
            caLevel={caLevel}
            studentName={studentName}
            initialQuestionIndex={initialQuestionIndex}
            isModal={true}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
};
