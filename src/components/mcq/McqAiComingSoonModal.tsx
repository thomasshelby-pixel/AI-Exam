import React from 'react';
import { Sparkles, Bot, BrainCircuit, Zap, Lock, X, CheckCircle2 } from 'lucide-react';
import { McqArenaLogo } from '../common/McqArenaLogo.js';

interface McqAiComingSoonModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const McqAiComingSoonModal: React.FC<McqAiComingSoonModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-blue-100 dark:border-slate-800 overflow-hidden">
        {/* Header background glow */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 opacity-90" />
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 text-white/80 hover:text-white bg-black/20 hover:bg-black/40 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Content */}
        <div className="relative pt-8 px-6 pb-4 text-center">
          <div className="inline-flex p-3 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-white/20 mb-3">
            <Bot className="w-10 h-10 text-blue-600 dark:text-blue-400 animate-pulse" />
          </div>
          
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase bg-amber-400 text-amber-950 shadow-md mb-2">
            <Lock className="w-3.5 h-3.5" /> Coming Soon
          </div>

          <h2 className="text-2xl font-black text-white tracking-tight">
            AI Adaptive Practice
          </h2>
          <p className="text-blue-100 text-sm mt-1 max-w-xs mx-auto">
            Personalized ICAI-standard training powered by next-generation neural evaluation.
          </p>
        </div>

        {/* Modal Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="bg-blue-50/60 dark:bg-slate-800/60 p-4 rounded-xl border border-blue-100 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 space-y-2.5">
            <div className="font-semibold text-slate-800 dark:text-white flex items-center gap-2 text-sm">
              <Sparkles className="w-4 h-4 text-amber-500" />
              What is arriving in Phase 2?
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span><strong>Dynamic Weak-Area Drills:</strong> Automatically generates custom questions targeting the exact sections and accounting standards you struggle with.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span><strong>AI Case Study Generator:</strong> Produces brand new, multi-layered realistic ICAI case scenarios with connected sub-MCQs.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span><strong>Live Interactive Examiner Hints:</strong> Step-by-step guidance when you get stuck, without revealing the final answer.</span>
            </div>
          </div>

          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800/50 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2.5">
            <BrainCircuit className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Currently in engineering research. All core Practice, Mock Tests, Revision, Mistake Vault, and Progress analytics are fully operational today.</span>
          </div>

          <button
            onClick={onClose}
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 transition-all text-sm"
          >
            Got It, Back to Arena
          </button>
        </div>
      </div>
    </div>
  );
};
