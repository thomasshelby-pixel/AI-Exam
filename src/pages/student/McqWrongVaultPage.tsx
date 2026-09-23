import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  XCircle,
  CheckCircle2,
  Play,
  RotateCcw,
  BookOpen,
  Info,
  Check,
  Filter,
} from 'lucide-react';
import { McqArenaLogo } from '../../components/common/McqArenaLogo.js';
import { mcqApi } from '../../api/mcqClient.js';
import { McqWrongVaultItem } from '../../types/index.js';

export const McqWrongVaultPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(true);
  const [items, setItems] = useState<McqWrongVaultItem[]>([]);
  const [includeResolved, setIncludeResolved] = useState<boolean>(false);
  const [filterCourse, setFilterCourse] = useState<string>('ALL');

  useEffect(() => {
    loadVault();
  }, [includeResolved]);

  const loadVault = async () => {
    setLoading(true);
    try {
      const res = await mcqApi.getWrongVault(includeResolved);
      setItems(res.wrongVault || []);
    } catch (err) {
      console.error('Failed to load wrong questions vault:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (questionId: string) => {
    try {
      await mcqApi.resolveWrongQuestion(questionId);
      setItems((prev) =>
        prev.map((item) =>
          item.question?.id === questionId ? { ...item, resolved: true } : item
        )
      );
    } catch (err) {
      console.error('Failed to resolve wrong question:', err);
    }
  };

  const filteredItems = items.filter((item) => {
    if (filterCourse !== 'ALL' && item.question?.course !== filterCourse) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 md:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/arena')}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <McqArenaLogo size="sm" />
          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 hidden sm:block">
            Mistake Vault
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIncludeResolved(!includeResolved)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              includeResolved
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-300'
                : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
            }`}
          >
            {includeResolved ? 'Showing Resolved' : 'Hide Resolved'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl w-full mx-auto p-4 md:p-6 flex-1 space-y-6">
        {/* Banner */}
        <div className="bg-gradient-to-r from-rose-900 via-rose-950 to-slate-900 text-white p-6 rounded-2xl border border-rose-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-rose-300 text-xs font-black tracking-widest uppercase">
              <XCircle className="w-4 h-4 text-rose-400" />
              <span>Mistake Vault</span>
            </div>
            <h1 className="text-2xl font-black">Targeted Mistake Mastery</h1>
            <p className="text-xs text-rose-200/80 max-w-lg">
              Questions you have answered incorrectly are automatically isolated here. Review the exact statutory grounds and re-attempt them to cement your understanding.
            </p>
          </div>

          <div className="p-3 bg-white/10 rounded-xl text-center shrink-0">
            <div className="text-2xl font-black text-rose-300">
              {filteredItems.filter((i) => !i.resolved).length}
            </div>
            <div className="text-[10px] uppercase font-bold text-slate-300">Unresolved</div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 font-bold text-slate-500">
            <Filter className="w-4 h-4" /> Filter Course:
          </div>
          <div className="flex gap-1.5">
            {['ALL', 'CA_FOUNDATION', 'CA_INTERMEDIATE', 'CA_FINAL'].map((c) => (
              <button
                key={c}
                onClick={() => setFilterCourse(c)}
                className={`px-3 py-1 rounded-lg font-bold border transition-colors ${
                  filterCourse === c
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-white'
                }`}
              >
                {c === 'ALL' ? 'All Courses' : c.replace('CA_', '')}
              </button>
            ))}
          </div>
        </div>

        {/* Questions list */}
        {loading ? (
          <div className="p-12 text-center text-xs font-bold text-slate-500 animate-pulse">
            Loading Mistake Vault...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              No Pending Mistakes in Vault!
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              You either haven't made any mistakes yet or have successfully resolved all previous errors. Keep up the high accuracy!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item, idx) => {
              const q = item.question;
              if (!q) return null;

              return (
                <div
                  key={item.id}
                  className={`bg-white dark:bg-slate-900 rounded-2xl border p-5 space-y-4 transition-all ${
                    item.resolved
                      ? 'border-emerald-200 dark:border-emerald-900/40 opacity-70'
                      : 'border-slate-200 dark:border-slate-800 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-500">#{idx + 1}</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">
                        {q.subject}
                      </span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-500">{q.chapter}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                        Failed {item.wrongCount}x
                      </span>
                      {item.resolved ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Mastered
                        </span>
                      ) : (
                        <button
                          onClick={() => handleResolve(q.id)}
                          className="px-2.5 py-1 rounded text-[10px] font-bold border border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                        >
                          Mark as Resolved
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Question */}
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {q.questionText}
                  </div>

                  {/* Options */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                      const optText = q[`option${opt}` as keyof typeof q] as string;
                      const isCorrect = q.correctAnswer === opt;
                      const wasWrongChoice = item.lastWrongOption === opt;

                      let style =
                        'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850';
                      if (isCorrect) {
                        style =
                          'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-200 font-bold';
                      } else if (wasWrongChoice) {
                        style =
                          'border-rose-400 bg-rose-50/60 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200';
                      }

                      return (
                        <div
                          key={opt}
                          className={`p-2.5 rounded-xl border flex items-center gap-2 ${style}`}
                        >
                          <span className="w-5 h-5 rounded-md bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-black shrink-0">
                            {opt}
                          </span>
                          <span className="truncate">{optText}</span>
                          {isCorrect && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 ml-auto shrink-0" />
                          )}
                          {wasWrongChoice && (
                            <span className="text-[9px] uppercase font-bold text-rose-600 ml-auto shrink-0">
                              Your Choice
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanation */}
                  <div className="p-3 bg-blue-50/60 dark:bg-slate-800/80 rounded-xl text-xs text-slate-700 dark:text-slate-300 space-y-1">
                    <div className="font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" /> ICAI Verified Solution
                    </div>
                    <div className="leading-relaxed">{q.explanation}</div>
                    {q.reference && (
                      <div className="text-[10px] text-slate-500 pt-1 border-t border-blue-100 dark:border-slate-700">
                        Citation: {q.reference}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
