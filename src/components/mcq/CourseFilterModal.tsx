import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  BookOpen,
  GraduationCap,
  Layers,
  Sparkles,
  AlertCircle,
  Play,
  CheckCircle,
  Clock,
  Filter,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { McqCourse, McqQuestionType, McqDifficulty, McqSessionType } from '../../types/index.js';
import { mcqApi, CurriculumStatRow } from '../../api/mcqClient.js';
import { CA_CURRICULUM } from '../../data/caCurriculum.js';
import { McqArenaLogo } from '../common/McqArenaLogo.js';

interface CourseFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSessionType?: McqSessionType;
}

export const CourseFilterModal: React.FC<CourseFilterModalProps> = ({
  isOpen,
  onClose,
  defaultSessionType = 'practice',
}) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<CurriculumStatRow[]>([]);
  const [loadingStats, setLoadingStats] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [selectedCourse, setSelectedCourse] = useState<McqCourse>('CA_INTERMEDIATE');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<McqQuestionType | 'mixed'>('mixed');
  const [selectedDifficulty, setSelectedDifficulty] = useState<McqDifficulty | 'mixed'>('mixed');
  const [sessionType, setSessionType] = useState<McqSessionType>(defaultSessionType);
  const [questionCount, setQuestionCount] = useState<number>(defaultSessionType === 'quick' ? 5 : 10);
  const [durationMinutes, setDurationMinutes] = useState<number>(defaultSessionType === 'mock' ? 20 : 0);

  useEffect(() => {
    setSessionType(defaultSessionType);
    if (defaultSessionType === 'quick') {
      setQuestionCount(5);
    } else if (defaultSessionType === 'mock') {
      setQuestionCount(15);
      setDurationMinutes(25);
    } else {
      setQuestionCount(10);
    }
  }, [defaultSessionType]);

  useEffect(() => {
    if (!isOpen) return;
    setLoadingStats(true);
    setErrorMsg(null);
    mcqApi
      .getCurriculum()
      .then((res) => {
        setStats(res.stats || []);
      })
      .catch((err) => {
        console.error('Failed to load curriculum stats:', err);
      })
      .finally(() => {
        setLoadingStats(false);
      });
  }, [isOpen]);

  // Available subjects for selected course from CA_CURRICULUM and stats
  const availableSubjects = useMemo(() => {
    const courseLevelMap: Record<McqCourse, 'FOUNDATION' | 'INTERMEDIATE' | 'FINAL'> = {
      CA_FOUNDATION: 'FOUNDATION',
      CA_INTERMEDIATE: 'INTERMEDIATE',
      CA_FINAL: 'FINAL',
    };
    const level = courseLevelMap[selectedCourse];
    const curriculumSubjects = CA_CURRICULUM[level]?.subjects || [];

    // Filter by questions existing in stats for that course
    const subjectsInDb = new Map<string, number>();
    stats
      .filter((s) => s.course === selectedCourse)
      .forEach((s) => {
        const k = s.subject.toLowerCase().trim();
        subjectsInDb.set(k, (subjectsInDb.get(k) || 0) + s.count);
      });

    return curriculumSubjects.map((sub) => {
      const count = subjectsInDb.get(sub.name.toLowerCase().trim()) || 0;
      return {
        ...sub,
        hasQuestions: count > 0,
        questionCount: count,
      };
    });
  }, [selectedCourse, stats]);

  // Set default subject when course changes
  useEffect(() => {
    const firstWithQuestions = availableSubjects.find((s) => s.hasQuestions);
    if (firstWithQuestions) {
      setSelectedSubject(firstWithQuestions.name);
    } else if (availableSubjects.length > 0) {
      setSelectedSubject(availableSubjects[0].name);
    } else {
      setSelectedSubject('');
    }
    setSelectedChapter('ALL');
  }, [selectedCourse, availableSubjects]);

  // Available chapters for selected course & subject
  const availableChapters = useMemo(() => {
    if (!selectedSubject) return [];
    const chapters = new Set(
      stats
        .filter(
          (s) =>
            s.course === selectedCourse &&
            s.subject.toLowerCase().trim() === selectedSubject.toLowerCase().trim()
        )
        .map((s) => s.chapter)
    );
    return Array.from(chapters);
  }, [selectedCourse, selectedSubject, stats]);

  // Calculate live matching questions count based on current filters
  const matchingQuestionsCount = useMemo(() => {
    let count = 0;
    for (const s of stats) {
      if (s.course !== selectedCourse) continue;
      if (selectedSubject && s.subject.toLowerCase().trim() !== selectedSubject.toLowerCase().trim()) continue;
      if (selectedChapter !== 'ALL' && s.chapter !== selectedChapter) continue;
      if (selectedType !== 'mixed' && s.question_type !== selectedType) continue;
      if (selectedDifficulty !== 'mixed' && s.difficulty !== selectedDifficulty) continue;
      count += s.count;
    }
    return count;
  }, [stats, selectedCourse, selectedSubject, selectedChapter, selectedType, selectedDifficulty]);

  const handleStartSession = async () => {
    setErrorMsg(null);
    if (!selectedCourse || !selectedSubject) {
      setErrorMsg('Please select a valid Course and Subject.');
      return;
    }

    if (matchingQuestionsCount === 0) {
      setErrorMsg(
        'Not enough questions available for this selection. Please adjust your filters (e.g. choose "All Chapters" or "Mixed" difficulty).'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await mcqApi.createSession({
        course: selectedCourse,
        subject: selectedSubject,
        chapter: selectedChapter !== 'ALL' ? selectedChapter : undefined,
        questionType: selectedType,
        difficulty: selectedDifficulty,
        sessionType,
        requestedCount: questionCount,
        durationMinutes: sessionType === 'mock' ? durationMinutes : undefined,
      });

      if ('error' in res) {
        setErrorMsg((res as any).error);
        setSubmitting(false);
        return;
      }

      onClose();
      navigate(`/arena/session/${res.session.id}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start practice session.');
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 rounded-2xl shadow-2xl border border-slate-700/80 overflow-hidden my-8">
        {/* Modal Top Bar */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 border-b border-slate-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <McqArenaLogo size="sm" withGlow />
            <div>
              <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                {sessionType === 'mock'
                  ? 'Configure Mock Examination'
                  : sessionType === 'quick'
                  ? 'Configure Quick Burst'
                  : 'Configure Practice Arena'}
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                Authoritative ICAI Syllabus & Strict Course Isolation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-slate-100">
          {errorMsg && (
            <div className="p-3.5 bg-rose-950/50 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. SELECT COURSE */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-amber-400" /> 1. Select Course
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  { id: 'CA_FOUNDATION', label: 'Foundation', desc: 'Entry Level (Paper 3 & 4)' },
                  { id: 'CA_INTERMEDIATE', label: 'Intermediate', desc: 'New Scheme 2024' },
                  { id: 'CA_FINAL', label: 'Final', desc: 'Advanced Level' },
                ] as const
              ).map((c) => {
                const isSelected = selectedCourse === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedCourse(c.id);
                      setErrorMsg(null);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-amber-500 bg-amber-950/20 text-white ring-2 ring-amber-500/30'
                        : 'border-slate-800 hover:border-slate-700 bg-slate-900/60 text-slate-300'
                    }`}
                  >
                    <div
                      className={`text-sm font-bold ${
                        isSelected ? 'text-amber-400' : 'text-slate-200'
                      }`}
                    >
                      {c.label}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{c.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. SELECT SUBJECT */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-blue-400" /> 2. Select Subject
              </label>
              <span className="text-[11px] text-slate-500">
                {availableSubjects.filter((s) => s.hasQuestions).length} available in pool
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {availableSubjects.map((sub) => {
                const isSelected = selectedSubject === sub.name;
                const isAvailable = sub.hasQuestions;

                return (
                  <button
                    key={sub.key}
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => {
                      if (!isAvailable) return;
                      setSelectedSubject(sub.name);
                      setSelectedChapter('ALL');
                      setErrorMsg(null);
                    }}
                    className={`p-3 rounded-xl border text-left flex items-start justify-between gap-2 transition-all ${
                      !isAvailable
                        ? 'opacity-40 cursor-not-allowed bg-slate-950/60 border-slate-850 text-slate-500'
                        : isSelected
                        ? 'border-blue-500 bg-blue-950/40 text-white ring-2 ring-blue-500/40'
                        : 'border-slate-800 bg-slate-850/80 hover:bg-slate-800 hover:border-slate-700 text-slate-200'
                    }`}
                  >
                    <div className="truncate pr-1">
                      <div
                        className={`text-xs font-bold truncate ${
                          isSelected ? 'text-blue-300' : isAvailable ? 'text-white' : 'text-slate-500'
                        }`}
                      >
                        Paper {sub.paperNumber}: {sub.name}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {sub.mcqNegativeMarking
                          ? 'Negative Marking (-0.25)'
                          : 'No Negative Marking (Full Credit)'}
                      </div>
                    </div>
                    {isAvailable ? (
                      <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-600/40">
                        {sub.questionCount} Qs
                      </span>
                    ) : (
                      <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-900 text-slate-500 border border-slate-800">
                        Curating
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. SELECT CHAPTER */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-purple-400" /> 3. Select Chapter / Topic
            </label>
            <select
              value={selectedChapter}
              onChange={(e) => setSelectedChapter(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Chapters & Topics (Comprehensive ICAI Mix)</option>
              {availableChapters.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </div>

          {/* 4. QUESTION TYPE & 5. DIFFICULTY */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Question Type */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                4. Question Type
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'mixed', label: 'Mixed' },
                  { id: 'normal', label: 'Direct' },
                  { id: 'case_based', label: 'Case Study' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedType(t.id as any)}
                    className={`py-2 px-2 text-xs font-bold rounded-lg border text-center transition-all ${
                      selectedType === t.id
                        ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                        : 'border-slate-800 text-slate-400 bg-slate-950 hover:bg-slate-850'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                5. Difficulty
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'mixed', label: 'Mixed' },
                  { id: 'easy', label: 'Easy' },
                  { id: 'moderate', label: 'Mod' },
                  { id: 'hard', label: 'Hard' },
                ].map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedDifficulty(d.id as any)}
                    className={`py-2 px-1 text-xs font-bold rounded-lg border text-center transition-all ${
                      selectedDifficulty === d.id
                        ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                        : 'border-slate-800 text-slate-400 bg-slate-950 hover:bg-slate-850'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 6. NUMBER OF QUESTIONS & 7. EXAM DURATION */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                6. Number of Questions
              </label>
              <div className="flex gap-2">
                {[5, 10, 15, 20].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setQuestionCount(num)}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${
                      questionCount === num
                        ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                        : 'border-slate-800 text-slate-400 bg-slate-950 hover:bg-slate-850'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {sessionType === 'mock' && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-400" /> 7. Exam Duration
                </label>
                <div className="flex gap-2">
                  {[15, 20, 30, 45].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setDurationMinutes(mins)}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${
                        durationMinutes === mins
                          ? 'bg-amber-500 text-slate-950 font-black border-amber-400'
                          : 'border-slate-800 text-slate-400 bg-slate-950 hover:bg-slate-850'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* REAL-TIME MATCHING BADGE */}
          <div className="flex items-center justify-between p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400 font-medium">
              Available in pool matching criteria:
            </span>
            <span
              className={`font-bold px-2.5 py-1 rounded text-xs ${
                matchingQuestionsCount > 0
                  ? 'bg-blue-950/80 text-blue-300 border border-blue-800'
                  : 'bg-rose-950/80 text-rose-300 border border-rose-800'
              }`}
            >
              {matchingQuestionsCount} Questions
            </span>
          </div>
        </div>

        {/* Modal Footer (8. START MOCK EXAMINATION / PRACTICE) */}
        <div className="p-4 px-6 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleStartSession}
            disabled={submitting || matchingQuestionsCount === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-slate-950 text-xs font-black rounded-xl shadow-lg shadow-amber-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? (
              'Preparing Session...'
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                {sessionType === 'mock' ? '8. Start Mock Examination' : 'Start Practice'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
