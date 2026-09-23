import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Zap,
  Clock,
  RotateCcw,
  XCircle,
  Target,
  Bookmark,
  BarChart3,
  Bot,
  Flame,
  ArrowRight,
  Sparkles,
  ChevronRight,
  TrendingUp,
  Award,
  Layers,
} from 'lucide-react';
import { McqArenaLogo } from '../../components/common/McqArenaLogo.js';
import { CourseFilterModal } from '../../components/mcq/CourseFilterModal.js';
import { McqAiComingSoonModal } from '../../components/mcq/McqAiComingSoonModal.js';
import { mcqApi } from '../../api/mcqClient.js';
import { McqStudentProgress, McqSessionType } from '../../types/index.js';
import { useAuth } from '../../context/AuthContext.js';

export const McqArenaDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [progress, setProgress] = useState<McqStudentProgress | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterModalOpen, setFilterModalOpen] = useState<boolean>(false);
  const [filterSessionType, setFilterSessionType] = useState<McqSessionType>('practice');
  const [aiModalOpen, setAiModalOpen] = useState<boolean>(false);

  useEffect(() => {
    loadProgress();
  }, []);

  const loadProgress = async () => {
    setLoading(true);
    try {
      const data = await mcqApi.getProgress();
      setProgress(data);
    } catch (err) {
      console.error('Failed to load MCQ progress:', err);
    } finally {
      setLoading(false);
    }
  };

  const openFilterForType = (type: McqSessionType) => {
    setFilterSessionType(type);
    setFilterModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* 1. ARENA TOP BAR */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 md:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <McqArenaLogo size="md" withGlow showSubtitle subtitle="Practice smarter. Improve every day." />
        </div>

        <div className="flex items-center gap-3">
          {/* Practice Streak Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-full text-xs font-bold text-amber-700 dark:text-amber-300">
            <Flame className="w-4 h-4 fill-amber-500 text-amber-500" />
            <span>{progress?.streakDays || 0} Day Streak</span>
          </div>

          <button
            onClick={() => navigate('/dashboard')}
            className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            ← Back to Exam Checker
          </button>
        </div>
      </header>

      {/* 2. HERO / PHILOSOPHY STRIP */}
      <section className="bg-gradient-to-b from-blue-900 via-indigo-950 to-slate-950 text-white pt-10 pb-16 px-4 md:px-8 relative overflow-hidden">
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]" />

        <div className="max-w-6xl mx-auto relative z-10 space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase bg-blue-500/20 text-blue-300 border border-blue-400/30 mb-3">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" /> CA MCQ PRACTICE ARENA
              </div>
              <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white">
                Practice smarter. <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-300">Improve every day.</span>
              </h1>
              <p className="text-sm md:text-base text-slate-300 max-w-xl mt-2 font-medium">
                Authoritative, syllabus-aligned ICAI examination practice. Complete step-by-step statutory references, time-tested elimination tools, and structured mistake mastery.
              </p>
            </div>

            {/* Philosophy pill progression */}
            <div className="flex items-center gap-2 text-xs font-black tracking-wider bg-white/10 backdrop-blur-md p-2 px-4 rounded-2xl border border-white/10 shrink-0">
              <span className="text-blue-300">LEARN</span>
              <span className="text-slate-400">→</span>
              <span className="text-indigo-300">PRACTICE</span>
              <span className="text-slate-400">→</span>
              <span className="text-purple-300">REVISE</span>
              <span className="text-slate-400">→</span>
              <span className="text-emerald-300">IMPROVE</span>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4">
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
              <div className="text-2xl md:text-3xl font-black text-white">
                {progress?.totalAttempted || 0}
              </div>
              <div className="text-xs text-blue-200 font-semibold uppercase tracking-wider mt-0.5">
                Questions Solved
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
              <div className="text-2xl md:text-3xl font-black text-emerald-400">
                {progress?.overallAccuracy || 0}%
              </div>
              <div className="text-xs text-emerald-200 font-semibold uppercase tracking-wider mt-0.5">
                Overall Accuracy
              </div>
            </div>

            <div
              onClick={() => navigate('/arena/wrong-vault')}
              className="bg-white/10 hover:bg-white/15 backdrop-blur-md p-4 rounded-2xl border border-white/10 cursor-pointer transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="text-2xl md:text-3xl font-black text-rose-400">
                  {progress?.wrongVaultCount || 0}
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
              </div>
              <div className="text-xs text-rose-200 font-semibold uppercase tracking-wider mt-0.5">
                Mistake Vault
              </div>
            </div>

            <div
              onClick={() => navigate('/arena/bookmarks')}
              className="bg-white/10 hover:bg-white/15 backdrop-blur-md p-4 rounded-2xl border border-white/10 cursor-pointer transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="text-2xl md:text-3xl font-black text-amber-400">
                  {progress?.bookmarkCount || 0}
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
              </div>
              <div className="text-xs text-amber-200 font-semibold uppercase tracking-wider mt-0.5">
                Saved Bookmarks
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. MAIN ARENA HUBS (NINE TILES) */}
      <main className="max-w-6xl w-full mx-auto px-4 md:px-8 py-8 flex-1 space-y-8 -mt-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* 1. PRACTICE */}
          <div
            onClick={() => openFilterForType('practice')}
            className="group relative bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-blue-500/50 transition-all cursor-pointer flex flex-col justify-between overflow-hidden"
          >
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black group-hover:scale-110 transition-transform">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                📚 Chapter Practice
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Structured topic-wise practice with immediate step-by-step explanations, case scenario integration, and elimination tools.
              </p>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-blue-600 dark:text-blue-400">
              <span>Start Session</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 2. QUICK PRACTICE */}
          <div
            onClick={() => openFilterForType('quick')}
            className="group relative bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-amber-500/50 transition-all cursor-pointer flex flex-col justify-between overflow-hidden"
          >
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                ⚡ Quick Practice
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Rapid 5-question speed burst. Perfect for short study breaks or testing recall on high-frequency questions.
              </p>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-amber-600 dark:text-amber-400">
              <span>Quick 5 MCQs</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 3. MOCK TEST */}
          <div
            onClick={() => openFilterForType('mock')}
            className="group relative bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-purple-500/50 transition-all cursor-pointer flex flex-col justify-between overflow-hidden"
          >
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black group-hover:scale-110 transition-transform">
                <Clock className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                📝 Mock Test
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Full exam simulation with real countdown clock, official ICAI negative marking rules, and end-of-test evaluation.
              </p>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-purple-600 dark:text-purple-400">
              <span>Simulate Exam</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 4. REVISION */}
          <div
            onClick={() => openFilterForType('revision')}
            className="group relative bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-emerald-500/50 transition-all cursor-pointer flex flex-col justify-between overflow-hidden"
          >
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black group-hover:scale-110 transition-transform">
                <RotateCcw className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                🔄 Smart Revision
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Review past sessions, revisit questions marked for review, and reinforce retention with spaced repetition.
              </p>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <span>Start Revision</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 5. WRONG QUESTIONS (MISTAKE VAULT) */}
          <div
            onClick={() => navigate('/arena/wrong-vault')}
            className="group relative bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-rose-500/50 transition-all cursor-pointer flex flex-col justify-between overflow-hidden"
          >
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center font-black group-hover:scale-110 transition-transform">
                <XCircle className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-900 dark:text-white group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                  ❌ Wrong Questions
                </h3>
                {progress && progress.wrongVaultCount > 0 && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                    {progress.wrongVaultCount} Pending
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Dedicated vault tracking every mistake you have made. Drill down on failed questions until they are fully mastered.
              </p>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-rose-600 dark:text-rose-400">
              <span>Open Mistake Vault</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 6. WEAK AREAS */}
          <div
            onClick={() => openFilterForType('weak_area')}
            className="group relative bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-sky-500/50 transition-all cursor-pointer flex flex-col justify-between overflow-hidden"
          >
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center font-black group-hover:scale-110 transition-transform">
                <Target className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                🎯 Weak Areas
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Filter by hardest difficulties or low-accuracy topics to turn vulnerabilities into guaranteed scoring opportunities.
              </p>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-sky-600 dark:text-sky-400">
              <span>Target Weak Spots</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 7. BOOKMARKS */}
          <div
            onClick={() => navigate('/arena/bookmarks')}
            className="group relative bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-amber-500/50 transition-all cursor-pointer flex flex-col justify-between overflow-hidden"
          >
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black group-hover:scale-110 transition-transform">
                <Bookmark className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                  🔖 Bookmarks
                </h3>
                {progress && progress.bookmarkCount > 0 && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {progress.bookmarkCount} Saved
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Quick access to important or high-yield MCQs you have saved for final day revision before exam hall entry.
              </p>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-amber-600 dark:text-amber-400">
              <span>View Bookmarks</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 8. PROGRESS & MASTERY */}
          <div
            onClick={() => navigate('/arena/progress')}
            className="group relative bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-indigo-500/50 transition-all cursor-pointer flex flex-col justify-between overflow-hidden"
          >
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black group-hover:scale-110 transition-transform">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                📊 Detailed Progress
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                In-depth analytics, subject-wise accuracy metrics, recent test histories, and time efficiency insights.
              </p>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-indigo-600 dark:text-indigo-400">
              <span>Analyze Performance</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 9. AI PRACTICE — COMING SOON */}
          <div
            onClick={() => setAiModalOpen(true)}
            className="group relative bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 text-white rounded-2xl p-6 border border-purple-500/40 shadow-sm hover:shadow-2xl hover:border-purple-400 transition-all cursor-pointer flex flex-col justify-between overflow-hidden"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-400/30 text-purple-300 flex items-center justify-center font-black group-hover:scale-110 transition-transform">
                  <Bot className="w-6 h-6 animate-pulse" />
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase bg-amber-400 text-amber-950 shadow-md">
                  COMING SOON
                </span>
              </div>
              <h3 className="text-lg font-black text-white group-hover:text-purple-300 transition-colors flex items-center gap-1.5">
                🤖 AI Practice
              </h3>
              <p className="text-xs text-purple-200/80 leading-relaxed">
                Next-gen adaptive training engine generating dynamic multi-scenario questions and instant step-by-step examiner reasoning.
              </p>
            </div>
            <div className="pt-4 mt-4 border-t border-purple-500/20 flex items-center justify-between text-xs font-bold text-purple-300">
              <span>Explore Preview</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </main>

      {/* MODALS */}
      <CourseFilterModal
        isOpen={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        defaultSessionType={filterSessionType}
      />

      <McqAiComingSoonModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
      />
    </div>
  );
};
