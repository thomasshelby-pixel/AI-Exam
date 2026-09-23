import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Flag,
  Bookmark,
  CheckCircle2,
  XCircle,
  HelpCircle,
  EyeOff,
  Eye,
  Award,
  BookOpen,
  RotateCcw,
  Sparkles,
  Info,
  Check,
  AlertTriangle,
  Send,
} from 'lucide-react';
import { McqArenaLogo } from '../../components/common/McqArenaLogo.js';
import { mcqApi } from '../../api/mcqClient.js';
import { McqSession, McqSessionQuestion } from '../../types/index.js';

// ==========================================
// 1. ISOLATED TIMER COMPONENT (ZERO ROOT RERENDERS)
// ==========================================
interface SessionTimerProps {
  sessionType: 'practice' | 'mock' | 'quick' | 'exam';
  initialDurationSeconds?: number;
  initialTimeSpentSeconds?: number;
  isCompleted: boolean;
  onTimeSpentTick?: (seconds: number) => void;
  onTimeExpire?: () => void;
}

const SessionTimer: React.FC<SessionTimerProps> = memo(({
  sessionType,
  initialDurationSeconds,
  initialTimeSpentSeconds = 0,
  isCompleted,
  onTimeSpentTick,
  onTimeExpire,
}) => {
  const [secondsElapsed, setSecondsElapsed] = useState<number>(initialTimeSpentSeconds);
  const [countdownLeft, setCountdownLeft] = useState<number | null>(() => {
    if (sessionType === 'mock' && initialDurationSeconds && !isCompleted) {
      return Math.max(0, initialDurationSeconds - initialTimeSpentSeconds);
    }
    return null;
  });

  const onTimeExpireRef = useRef(onTimeExpire);
  onTimeExpireRef.current = onTimeExpire;
  const onTimeSpentTickRef = useRef(onTimeSpentTick);
  onTimeSpentTickRef.current = onTimeSpentTick;

  useEffect(() => {
    if (isCompleted) return;

    const interval = setInterval(() => {
      setSecondsElapsed((prev) => {
        const next = prev + 1;
        onTimeSpentTickRef.current?.(next);
        return next;
      });

      if (countdownLeft !== null) {
        setCountdownLeft((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            clearInterval(interval);
            onTimeExpireRef.current?.();
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isCompleted, countdownLeft !== null]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (isCompleted) return null;

  if (countdownLeft !== null) {
    const isUrgent = countdownLeft < 120;
    return (
      <div
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold transition-colors ${
          isUrgent
            ? 'bg-rose-600 text-white animate-pulse shadow-md shadow-rose-900/30'
            : 'bg-slate-800 text-amber-300 dark:bg-slate-800 border border-slate-700'
        }`}
      >
        <Clock className="w-3.5 h-3.5" />
        <span>{formatTime(countdownLeft)}</span>
      </div>
    );
  }

  return (
    <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
      <Clock className="w-3.5 h-3.5 text-blue-400" />
      <span>{formatTime(secondsElapsed)}</span>
    </div>
  );
});

// ==========================================
// 2. ISOLATED OPTION ROW COMPONENT
// ==========================================
interface OptionRowProps {
  optionLetter: 'A' | 'B' | 'C' | 'D';
  optionText: string;
  isSelected: boolean;
  isCorrect?: boolean;
  isEliminated: boolean;
  showResult: boolean;
  disabled: boolean;
  onSelect: (opt: 'A' | 'B' | 'C' | 'D') => void;
  onToggleEliminate: (opt: 'A' | 'B' | 'C' | 'D', e: React.MouseEvent) => void;
}

const OptionRow: React.FC<OptionRowProps> = memo(({
  optionLetter,
  optionText,
  isSelected,
  isCorrect,
  isEliminated,
  showResult,
  disabled,
  onSelect,
  onToggleEliminate,
}) => {
  let cardClass = 'border-slate-700/80 bg-slate-900/60 hover:bg-slate-850 hover:border-slate-600 text-slate-200';
  let badgeClass = 'bg-slate-800 text-slate-300 border border-slate-700';

  if (showResult) {
    if (isCorrect) {
      cardClass = 'border-emerald-500 bg-emerald-950/40 text-emerald-100 ring-1 ring-emerald-500/50';
      badgeClass = 'bg-emerald-600 text-white border-emerald-400';
    } else if (isSelected) {
      cardClass = 'border-rose-500 bg-rose-950/40 text-rose-100 ring-1 ring-rose-500/50';
      badgeClass = 'bg-rose-600 text-white border-rose-400';
    }
  } else if (isSelected) {
    cardClass = 'border-blue-500 bg-blue-950/40 text-white ring-2 ring-blue-500/30';
    badgeClass = 'bg-blue-600 text-white border-blue-400';
  }

  if (isEliminated) {
    cardClass += ' opacity-40 line-through';
  }

  return (
    <div
      onClick={() => !disabled && onSelect(optionLetter)}
      className={`group relative p-3.5 sm:p-4 rounded-xl border flex items-start justify-between gap-3.5 cursor-pointer transition-colors duration-150 ${cardClass}`}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black select-none ${badgeClass}`}>
          {optionLetter}
        </span>
        <span className="text-xs sm:text-sm font-medium leading-relaxed pt-0.5 break-words">
          {optionText}
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0 pt-0.5">
        {showResult && isCorrect && (
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
        )}
        {showResult && isSelected && !isCorrect && (
          <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
        )}

        {!disabled && !showResult && (
          <button
            type="button"
            onClick={(e) => onToggleEliminate(optionLetter, e)}
            title={isEliminated ? 'Restore Option' : 'Eliminate Option (Process of Elimination)'}
            className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
          >
            {isEliminated ? <Eye className="w-4 h-4 text-amber-400" /> : <EyeOff className="w-4 h-4 opacity-40 group-hover:opacity-100" />}
          </button>
        )}
      </div>
    </div>
  );
});

// ==========================================
// 3. MAIN PRACTICE SESSION PAGE COMPONENT
// ==========================================
export const McqPracticeSessionPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState<boolean>(true);
  const [session, setSession] = useState<McqSession | null>(null);
  const [questions, setQuestions] = useState<McqSessionQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [showPalette, setShowPalette] = useState<boolean>(false);
  const [showFinishModal, setShowFinishModal] = useState<boolean>(false);
  const [solutionFilter, setSolutionFilter] = useState<'ALL' | 'CORRECT' | 'INCORRECT' | 'SKIPPED'>('ALL');

  // Time tracking ref to prevent state-driven parent rerenders
  const timeSpentRef = useRef<number>(0);

  // Load session data once
  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    mcqApi
      .getSession(sessionId)
      .then((res) => {
        setSession(res.session);
        setQuestions(res.questions);
        timeSpentRef.current = res.session.timeSpentSeconds || 0;
      })
      .catch((err) => {
        console.error('Failed to load session:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [sessionId]);

  const handleTimeSpentTick = useCallback((seconds: number) => {
    timeSpentRef.current = seconds;
  }, []);

  const isCompleted = session?.status === 'completed';
  const currentQuestion = questions[currentIndex];

  // 1. SELECT OPTION
  const handleSelectOption = useCallback(async (option: 'A' | 'B' | 'C' | 'D') => {
    if (!session || !currentQuestion || session.status === 'completed') return;

    const isPractice = session.sessionType === 'practice' || session.sessionType === 'quick';
    const alreadySelected = currentQuestion.userResponse?.selectedOption === option;
    const targetOption = alreadySelected && !isPractice ? null : option;

    // Optimistic UI update on current question without whole-page blink
    setQuestions((prev) => {
      const copy = [...prev];
      if (!copy[currentIndex]) return prev;
      copy[currentIndex] = {
        ...copy[currentIndex],
        userResponse: {
          ...copy[currentIndex].userResponse,
          selectedOption: targetOption,
        },
      };
      return copy;
    });

    try {
      const res = await mcqApi.submitAnswer(session.id, {
        questionId: currentQuestion.id,
        selectedOption: targetOption,
        isMarkedForReview: currentQuestion.userResponse?.isMarkedForReview,
        eliminatedOptions: currentQuestion.userResponse?.eliminatedOptions,
        timeTakenSeconds: (currentQuestion.userResponse?.timeTakenSeconds || 0) + 5,
      });

      // Update feedback if practice mode
      setQuestions((prev) => {
        const copy = [...prev];
        if (!copy[currentIndex]) return prev;
        copy[currentIndex] = {
          ...copy[currentIndex],
          correctAnswer: isPractice ? res.correctAnswer : copy[currentIndex].correctAnswer,
          explanation: isPractice ? res.explanation : copy[currentIndex].explanation,
          reference: isPractice ? res.reference : copy[currentIndex].reference,
          userResponse: {
            ...copy[currentIndex].userResponse,
            selectedOption: targetOption,
            isCorrect: res.isCorrect,
          },
        };
        return copy;
      });
    } catch (err) {
      console.error('Failed to record answer:', err);
    }
  }, [session, currentQuestion, currentIndex]);

  // 2. TOGGLE ELIMINATE
  const handleToggleEliminate = useCallback(async (option: 'A' | 'B' | 'C' | 'D', e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session || !currentQuestion || session.status === 'completed') return;

    const currentEliminated = currentQuestion.userResponse?.eliminatedOptions || [];
    const updated = currentEliminated.includes(option)
      ? currentEliminated.filter((o) => o !== option)
      : [...currentEliminated, option];

    setQuestions((prev) => {
      const copy = [...prev];
      if (!copy[currentIndex]) return prev;
      copy[currentIndex] = {
        ...copy[currentIndex],
        userResponse: {
          ...copy[currentIndex].userResponse,
          selectedOption: copy[currentIndex].userResponse?.selectedOption || null,
          eliminatedOptions: updated,
        },
      };
      return copy;
    });

    try {
      await mcqApi.submitAnswer(session.id, {
        questionId: currentQuestion.id,
        selectedOption: currentQuestion.userResponse?.selectedOption || null,
        isMarkedForReview: currentQuestion.userResponse?.isMarkedForReview,
        eliminatedOptions: updated,
      });
    } catch (err) {
      console.error('Failed to update eliminated options:', err);
    }
  }, [session, currentQuestion, currentIndex]);

  // 3. TOGGLE REVIEW FLAG
  const handleToggleMarkReview = useCallback(async () => {
    if (!session || !currentQuestion || session.status === 'completed') return;

    const currentStatus = !!currentQuestion.userResponse?.isMarkedForReview;
    const newStatus = !currentStatus;

    setQuestions((prev) => {
      const copy = [...prev];
      if (!copy[currentIndex]) return prev;
      copy[currentIndex] = {
        ...copy[currentIndex],
        userResponse: {
          ...copy[currentIndex].userResponse,
          selectedOption: copy[currentIndex].userResponse?.selectedOption || null,
          isMarkedForReview: newStatus,
        },
      };
      return copy;
    });

    try {
      await mcqApi.submitAnswer(session.id, {
        questionId: currentQuestion.id,
        selectedOption: currentQuestion.userResponse?.selectedOption || null,
        isMarkedForReview: newStatus,
        eliminatedOptions: currentQuestion.userResponse?.eliminatedOptions,
      });
    } catch (err) {
      console.error('Failed to toggle review flag:', err);
    }
  }, [session, currentQuestion, currentIndex]);

  // 4. TOGGLE BOOKMARK
  const handleToggleBookmark = useCallback(async () => {
    if (!currentQuestion) return;
    const currentBm = !!currentQuestion.isBookmarked;

    setQuestions((prev) => {
      const copy = [...prev];
      if (!copy[currentIndex]) return prev;
      copy[currentIndex] = {
        ...copy[currentIndex],
        isBookmarked: !currentBm,
      };
      return copy;
    });

    try {
      await mcqApi.toggleBookmark(currentQuestion.id);
    } catch (err) {
      console.error('Failed to toggle bookmark:', err);
    }
  }, [currentQuestion, currentIndex]);

  // 5. FINISH SESSION
  const handleFinishSession = useCallback(async () => {
    if (!session) return;
    setShowFinishModal(false);
    setLoading(true);
    try {
      const res = await mcqApi.finishSession(session.id, timeSpentRef.current);
      setSession(res.session);
      setQuestions(res.questions);
      setCurrentIndex(0);
    } catch (err) {
      console.error('Failed to finish session:', err);
    } finally {
      setLoading(false);
    }
  }, [session]);

  if (loading || !session) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <McqArenaLogo size="md" withGlow />
        <div className="mt-4 text-xs font-semibold text-slate-400 animate-pulse">
          Loading Arena Session...
        </div>
      </div>
    );
  }

  // Answered stats for palette
  const answeredCount = questions.filter((q) => q.userResponse?.selectedOption).length;
  const markedCount = questions.filter((q) => q.userResponse?.isMarkedForReview).length;
  const skippedCount = questions.length - answeredCount;

  // Filter for completed solution review
  const filteredQuestions = isCompleted
    ? questions.filter((q) => {
        if (solutionFilter === 'CORRECT') return q.userResponse?.isCorrect;
        if (solutionFilter === 'INCORRECT') return q.userResponse?.selectedOption && !q.userResponse?.isCorrect;
        if (solutionFilter === 'SKIPPED') return !q.userResponse?.selectedOption;
        return true;
      })
    : questions;

  const showResult = isCompleted || (session.sessionType === 'practice' && !!currentQuestion?.userResponse?.selectedOption);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      {/* 1. TOP HEADER SHELL */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/arena')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <McqArenaLogo size="sm" />
          <div className="hidden md:block h-5 w-px bg-slate-800" />
          <div className="hidden md:flex flex-col">
            <span className="text-xs font-bold text-slate-200 truncate max-w-xs">
              {session.subject}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              {session.chapter || 'All Chapters'}
            </span>
          </div>
        </div>

        {/* Center / Timer / Badge */}
        <div className="flex items-center gap-2.5">
          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
              session.sessionType === 'mock'
                ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                : 'bg-blue-950/80 text-blue-300 border border-blue-500/40'
            }`}
          >
            {session.sessionType}
          </span>

          <SessionTimer
            sessionType={session.sessionType}
            initialDurationSeconds={session.durationSeconds || undefined}
            initialTimeSpentSeconds={session.timeSpentSeconds || 0}
            isCompleted={isCompleted}
            onTimeSpentTick={handleTimeSpentTick}
            onTimeExpire={handleFinishSession}
          />
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          {!isCompleted && (
            <button
              onClick={() => setShowPalette(!showPalette)}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-bold hover:bg-slate-800 transition-colors text-slate-300"
            >
              Palette ({answeredCount}/{questions.length})
            </button>
          )}

          {!isCompleted && (
            <button
              onClick={() => setShowFinishModal(true)}
              className="px-4 py-1.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
            >
              Finish
            </button>
          )}

          {isCompleted && (
            <button
              onClick={() => navigate('/arena')}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
            >
              Exit to Arena
            </button>
          )}
        </div>
      </header>

      {/* 2. COMPLETED SUMMARY BANNER (IF SESSION COMPLETED) */}
      {isCompleted && (
        <div className="bg-slate-900 border-b border-slate-800 p-6 shadow-sm">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <McqArenaLogo size="md" withGlow />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-white">Examination Completed</h2>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-900/60 text-blue-300 border border-blue-700/50">
                    {session.course.replace('CA_', 'CA ')}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Official ICAI step marking scheme evaluated. Review detailed solutions below.
                </p>
              </div>
            </div>

            {/* Score Pill Card */}
            <div className="flex items-center gap-3">
              <div className="bg-slate-800 p-2.5 px-4 rounded-xl border border-slate-700 text-center">
                <div className="text-lg font-black text-emerald-400">{session.correctCount}</div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Correct</div>
              </div>
              <div className="bg-slate-800 p-2.5 px-4 rounded-xl border border-slate-700 text-center">
                <div className="text-lg font-black text-rose-400">{session.incorrectCount}</div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Wrong</div>
              </div>
              <div className="bg-slate-800 p-2.5 px-4 rounded-xl border border-slate-700 text-center">
                <div className="text-lg font-black text-amber-400">{session.accuracyPercentage || 0}%</div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Accuracy</div>
              </div>
            </div>
          </div>

          {/* Solution Filters */}
          <div className="max-w-4xl mx-auto mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs font-bold">
            <span className="text-slate-400">Filter Solutions:</span>
            <div className="flex gap-2">
              {[
                { id: 'ALL', label: `All (${questions.length})` },
                { id: 'CORRECT', label: `Correct (${session.correctCount})` },
                { id: 'INCORRECT', label: `Wrong (${session.incorrectCount})` },
                { id: 'SKIPPED', label: `Skipped (${session.skippedCount})` },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSolutionFilter(f.id as any)}
                  className={`px-3 py-1 rounded-lg border transition-all ${
                    solutionFilter === f.id
                      ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                      : 'border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. MAIN WORKSPACE / QUESTION CARD */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-6 flex flex-col min-h-0">
        {currentQuestion ? (
          <div className="flex-1 flex flex-col bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden transition-all duration-150">
            {/* Question Top Info Bar */}
            <div className="px-6 py-3.5 bg-slate-850 border-b border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-black text-white">
                  Question {currentIndex + 1} of {questions.length}
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400 capitalize">{currentQuestion.questionType.replace('_', ' ')}</span>
                <span className="text-slate-600">•</span>
                <span
                  className={`capitalize font-bold ${
                    currentQuestion.difficulty === 'easy'
                      ? 'text-emerald-400'
                      : currentQuestion.difficulty === 'hard'
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}
                >
                  {currentQuestion.difficulty}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {currentQuestion.source && (
                  <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                    {currentQuestion.source} {currentQuestion.attempt || ''}
                  </span>
                )}
                <button
                  onClick={handleToggleBookmark}
                  title="Bookmark for Revision"
                  className={`p-1.5 rounded-lg border transition-colors ${
                    currentQuestion.isBookmarked
                      ? 'bg-amber-950/60 border-amber-600 text-amber-400'
                      : 'border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Bookmark className="w-4 h-4" fill={currentQuestion.isBookmarked ? 'currentColor' : 'none'} />
                </button>
                {!isCompleted && (
                  <button
                    onClick={handleToggleMarkReview}
                    title="Mark for Review"
                    className={`p-1.5 rounded-lg border transition-colors ${
                      currentQuestion.userResponse?.isMarkedForReview
                        ? 'bg-purple-950/60 border-purple-600 text-purple-300'
                        : 'border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Flag className="w-4 h-4" fill={currentQuestion.userResponse?.isMarkedForReview ? 'currentColor' : 'none'} />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Question Content */}
            <div className="p-6 md:p-8 flex-1 overflow-y-auto space-y-6">
              {/* CASE STUDY SCENARIO (IF PRESENT) */}
              {currentQuestion.caseStudyScenario && (
                <div className="p-4 bg-indigo-950/40 border border-indigo-800/60 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-300">
                    <BookOpen className="w-4 h-4 text-indigo-400" /> ICAI Case Scenario
                  </div>
                  <div className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">
                    {currentQuestion.caseStudyScenario}
                  </div>
                </div>
              )}

              {/* QUESTION TEXT */}
              <div className="text-base md:text-lg font-bold text-white leading-relaxed">
                {currentQuestion.questionText}
              </div>

              {/* OPTIONS (A, B, C, D) - Isolated Row components prevent layout flickering */}
              <div className="space-y-3">
                {(['A', 'B', 'C', 'D'] as const).map((opt) => (
                  <OptionRow
                    key={`${currentQuestion.id}_${opt}`}
                    optionLetter={opt}
                    optionText={currentQuestion[`option${opt}` as keyof McqSessionQuestion] as string}
                    isSelected={currentQuestion.userResponse?.selectedOption === opt}
                    isCorrect={currentQuestion.correctAnswer === opt}
                    isEliminated={!!currentQuestion.userResponse?.eliminatedOptions?.includes(opt)}
                    showResult={showResult}
                    disabled={isCompleted}
                    onSelect={handleSelectOption}
                    onToggleEliminate={handleToggleEliminate}
                  />
                ))}
              </div>

              {/* EXPLANATION & STATUTORY REFERENCE (PRACTICE OR COMPLETED) */}
              {showResult && (currentQuestion.explanation || currentQuestion.reference) && (
                <div className="p-5 bg-blue-950/30 border border-blue-800/60 rounded-xl space-y-2.5 animate-fadeIn">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-blue-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-400" /> Authoritative ICAI Solution
                    </span>
                    <span className="px-2 py-0.5 rounded font-black bg-blue-900/60 text-blue-200 text-[10px]">
                      Correct Answer: Option {currentQuestion.correctAnswer}
                    </span>
                  </div>

                  {currentQuestion.explanation && (
                    <div className="text-xs text-slate-300 leading-relaxed">
                      {currentQuestion.explanation}
                    </div>
                  )}

                  {currentQuestion.reference && (
                    <div className="text-[11px] text-slate-400 pt-2 border-t border-blue-900/40 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span>{currentQuestion.reference}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Question Controls */}
            <div className="px-6 py-4 bg-slate-850 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-700 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <ArrowLeft className="w-4 h-4" /> Previous
              </button>

              <div className="text-xs font-bold text-slate-400">
                {currentIndex + 1} / {questions.length}
              </div>

              {currentIndex < questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-md shadow-blue-900/40 transition-colors"
                >
                  Next <ArrowRight className="w-4 h-4" />
                </button>
              ) : !isCompleted ? (
                <button
                  type="button"
                  onClick={() => setShowFinishModal(true)}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-xs font-bold text-white shadow-md shadow-red-900/40 transition-all"
                >
                  Submit Examination <Check className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/arena')}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition-colors"
                >
                  Return to Arena
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
            No questions available for this filter.
          </div>
        )}
      </main>

      {/* QUESTION PALETTE MODAL */}
      {showPalette && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">Question Palette</span>
                <span className="text-xs text-slate-400">({questions.length} Total)</span>
              </div>
              <button onClick={() => setShowPalette(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-[11px] text-slate-400 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-blue-600" /> Answered ({answeredCount})
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-purple-600" /> Marked for Review ({markedCount})
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-slate-800 border border-slate-700" /> Skipped ({skippedCount})
              </div>
            </div>

            {/* Grid of question buttons */}
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 max-h-60 overflow-y-auto p-1">
              {questions.map((q, idx) => {
                const isAns = !!q.userResponse?.selectedOption;
                const isRev = !!q.userResponse?.isMarkedForReview;
                const isCur = idx === currentIndex;

                let btnStyle = 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750';
                if (isRev) {
                  btnStyle = 'bg-purple-900/80 text-purple-200 border-purple-500 font-bold';
                } else if (isAns) {
                  btnStyle = 'bg-blue-600 text-white border-blue-400 font-bold';
                }

                if (isCur) {
                  btnStyle += ' ring-2 ring-amber-400';
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setCurrentIndex(idx);
                      setShowPalette(false);
                    }}
                    className={`h-10 rounded-xl border text-xs flex items-center justify-center transition-all ${btnStyle}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowPalette(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-colors"
              >
                Close Palette
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FINISH CONFIRMATION MODAL */}
      {showFinishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-950/60 rounded-xl border border-red-800 text-red-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Complete Examination?</h3>
                <p className="text-xs text-slate-400">
                  Ready to calculate your official score and update your Mistake Vault?
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-850 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Total Questions:</span>
                <span className="font-bold text-white">{questions.length}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Answered:</span>
                <span className="font-bold text-blue-400">{answeredCount}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Marked for Review:</span>
                <span className="font-bold text-purple-400">{markedCount}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Unattempted:</span>
                <span className="font-bold text-amber-400">{skippedCount}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowFinishModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white"
              >
                Continue Exam
              </button>
              <button
                type="button"
                onClick={handleFinishSession}
                className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-900/40 transition-all"
              >
                Yes, Finalize & Score
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default McqPracticeSessionPage;
