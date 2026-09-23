import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  Flame,
  Award,
  Clock,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
} from 'lucide-react';
import { McqArenaLogo } from '../../components/common/McqArenaLogo.js';
import { mcqApi } from '../../api/mcqClient.js';
import { McqStudentProgress } from '../../types/index.js';

export const McqProgressPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(true);
  const [progress, setProgress] = useState<McqStudentProgress | null>(null);

  useEffect(() => {
    mcqApi
      .getProgress()
      .then((data) => setProgress(data))
      .catch((err) => console.error('Failed to load progress:', err))
      .finally(() => setLoading(false));
  }, []);

  const formatHours = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins} mins`;
    const hrs = (mins / 60).toFixed(1);
    return `${hrs} hrs`;
  };

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
            Performance Analytics
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl w-full mx-auto p-4 md:p-6 flex-1 space-y-6">
        {/* Banner */}
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl border border-indigo-800/40 space-y-2">
          <div className="flex items-center gap-2 text-indigo-300 text-xs font-black tracking-widest uppercase">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            <span>Mastery Report</span>
          </div>
          <h1 className="text-2xl font-black">Student Practice Analytics</h1>
          <p className="text-xs text-indigo-200/80 max-w-lg">
            Track your progress across subjects, review recent session results, and maintain your streak to build examination confidence.
          </p>
        </div>

        {/* 4 Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-2 text-blue-600 text-xs font-bold uppercase mb-1">
              <Award className="w-4 h-4" /> Solved
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {progress?.totalAttempted || 0}
            </div>
            <div className="text-[10px] text-slate-500">Total MCQs answered</div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold uppercase mb-1">
              <CheckCircle2 className="w-4 h-4" /> Accuracy
            </div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {progress?.overallAccuracy || 0}%
            </div>
            <div className="text-[10px] text-slate-500">Overall success rate</div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-2 text-amber-500 text-xs font-bold uppercase mb-1">
              <Flame className="w-4 h-4 fill-current" /> Streak
            </div>
            <div className="text-2xl font-black text-amber-500">
              {progress?.streakDays || 0} Days
            </div>
            <div className="text-[10px] text-slate-500">Consecutive practice</div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-2 text-purple-600 text-xs font-bold uppercase mb-1">
              <Clock className="w-4 h-4" /> Time
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {formatHours(progress?.totalPracticeTimeSeconds || 0)}
            </div>
            <div className="text-[10px] text-slate-500">Practice time logged</div>
          </div>
        </div>

        {/* Subject-Wise Accuracy Breakdown */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Subject Mastery Breakdown
          </h3>

          {progress && progress.subjectBreakdown.length > 0 ? (
            <div className="space-y-4">
              {progress.subjectBreakdown.map((s) => (
                <div key={s.subject} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200">{s.subject}</span>
                    <span className="font-bold text-slate-600 dark:text-slate-400">
                      {s.correct}/{s.total} correct ({s.accuracy}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        s.accuracy >= 75
                          ? 'bg-emerald-500'
                          : s.accuracy >= 50
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${s.accuracy}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-500 py-4 text-center">
              Complete practice sessions to see subject-by-subject accuracy breakdowns.
            </div>
          )}
        </div>

        {/* Recent Sessions */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-indigo-600" />
            Recent Practice Sessions
          </h3>

          {progress && progress.recentSessions.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {progress.recentSessions.map((sess) => (
                <div
                  key={sess.id}
                  onClick={() => navigate(`/arena/session/${sess.id}`)}
                  className="py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-850 px-2 rounded-xl cursor-pointer transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {sess.subject}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {sess.sessionType}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {new Date(sess.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <div className="text-xs font-black text-slate-900 dark:text-white">
                        {sess.correctCount}/{sess.totalQuestions} ({sess.accuracyPercentage}%)
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold">
                        Score: {sess.score}
                      </div>
                    </div>
                    <div className="p-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
                      →
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-500 py-4 text-center">
              No completed sessions found. Start a practice session in the Arena!
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
