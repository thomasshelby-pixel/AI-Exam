import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  Trash2,
  ExternalLink,
  Filter,
  CheckCircle2,
} from 'lucide-react';
import { McqArenaLogo } from '../../components/common/McqArenaLogo.js';
import { mcqApi } from '../../api/mcqClient.js';
import { McqBookmarkItem } from '../../types/index.js';

export const McqBookmarksPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(true);
  const [bookmarks, setBookmarks] = useState<McqBookmarkItem[]>([]);
  const [filterCourse, setFilterCourse] = useState<string>('ALL');

  useEffect(() => {
    loadBookmarks();
  }, []);

  const loadBookmarks = async () => {
    setLoading(true);
    try {
      const res = await mcqApi.getBookmarks();
      setBookmarks(res.bookmarks || []);
    } catch (err) {
      console.error('Failed to load bookmarks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveBookmark = async (questionId: string) => {
    try {
      await mcqApi.toggleBookmark(questionId);
      setBookmarks((prev) => prev.filter((b) => b.question?.id !== questionId));
    } catch (err) {
      console.error('Failed to remove bookmark:', err);
    }
  };

  const filteredBookmarks = bookmarks.filter((b) => {
    if (filterCourse !== 'ALL' && b.question?.course !== filterCourse) return false;
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
            Saved Bookmarks
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl w-full mx-auto p-4 md:p-6 flex-1 space-y-6">
        {/* Banner */}
        <div className="bg-gradient-to-r from-amber-700 via-amber-800 to-slate-900 text-white p-6 rounded-2xl border border-amber-600/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-black tracking-widest uppercase">
              <Bookmark className="w-4 h-4 fill-current" />
              <span>Revision Archive</span>
            </div>
            <h1 className="text-2xl font-black">Bookmarked High-Yield Questions</h1>
            <p className="text-xs text-amber-100/80 max-w-lg">
              Questions you have marked for quick recall and last-minute exam hall revision.
            </p>
          </div>

          <div className="p-3 bg-white/10 rounded-xl text-center shrink-0">
            <div className="text-2xl font-black text-amber-300">{filteredBookmarks.length}</div>
            <div className="text-[10px] uppercase font-bold text-slate-300">Saved</div>
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

        {/* List */}
        {loading ? (
          <div className="p-12 text-center text-xs font-bold text-slate-500 animate-pulse">
            Loading Bookmarks...
          </div>
        ) : filteredBookmarks.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
              <Bookmark className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              No Bookmarked Questions Yet
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              While practicing, tap the bookmark icon on any question to preserve it for quick revision.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBookmarks.map((item, idx) => {
              const q = item.question;
              if (!q) return null;

              return (
                <div
                  key={item.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-500">#{idx + 1}</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">{q.subject}</span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-500">{q.chapter}</span>
                    </div>

                    <button
                      onClick={() => handleRemoveBookmark(q.id)}
                      title="Remove Bookmark"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {q.questionText}
                  </div>

                  {/* Options */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                      const optText = q[`option${opt}` as keyof typeof q] as string;
                      const isCorrect = q.correctAnswer === opt;

                      return (
                        <div
                          key={opt}
                          className={`p-2.5 rounded-xl border flex items-center gap-2 ${
                            isCorrect
                              ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-200 font-bold'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850'
                          }`}
                        >
                          <span className="w-5 h-5 rounded-md bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-black shrink-0">
                            {opt}
                          </span>
                          <span className="truncate">{optText}</span>
                          {isCorrect && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 ml-auto shrink-0" />
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
