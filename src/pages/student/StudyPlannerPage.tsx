import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, CalendarClock, CheckCircle2, Clock3, Send, Sparkles, UserRound, BookmarkCheck, BookOpen, Save } from 'lucide-react';
import { apiRequest } from '../../api/client.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

interface ParsedRequest {
  intent: string;
  course: string | null;
  subjects: string[];
  duration_minutes: number | null;
  focus_text: string;
  date_text: string | null;
  schedule_mode: string;
  class_time_text: string | null;
  performance_data: Array<{ subject: string; score: number; max_score: number }>;
  missing_info: string[];
  should_call_planner: boolean;
}
interface StudyPlanSession {
  order: number;
  subject: string;
  label: string;
  minutes: number;
  instruction: string;
  chapter?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
}
interface StudyPlanDraft {
  title: string;
  total_minutes: number;
  subjects: string[];
  sessions: StudyPlanSession[];
  saved: false;
  note: string;
}
interface PlannerResponse {
  success: boolean;
  status: string;
  message: string;
  parsed: ParsedRequest;
  plan: StudyPlanDraft | null;
  metadata?: { version: string; modelUsed: boolean; persistentStorage: boolean };
  chapter_assessment?: { subject: string; storage_subject?: string; chapters: string[] };
  follow_up_options?: string[];
  reply_language?: 'english' | 'hinglish' | 'hindi';
  plan_scope?: 'one_day' | 'exam_roadmap';
  roadmap?: Array<{ key: string; title: string; start_date: string; end_date: string; percentage: number; goals: string[] }>;
  revision_rounds?: Array<{ key: string; title: string; start_date: string; end_date: string; days: number; focus: string; chapters: Array<{ subject: string; chapter: string; strength: string; priority_score: number }> }>;
}
interface ChatMessage {
  id: number;
  role: 'assistant' | 'user';
  text: string;
  result?: PlannerResponse;
}
const STARTER_PROMPTS = [
  'Taxation 3 hours detailed',
  'I have 2 hours for Costing. Focus on Marginal Costing.',
  'Make a 90-minute revision plan for Law tomorrow.',
];

const revisionProgressKey = (roundKey: string, subject: string, chapter: string) =>
  [roundKey, subject, chapter].join('::');

function getAdjustedRevisionChapters(round: any, progress: Record<string, boolean>, dailyHours: number) {
  const chapters = Array.isArray(round.chapters) ? round.chapters : [];
  const remaining = chapters.filter((chapter: any) => !progress[revisionProgressKey(round.key, chapter.subject, chapter.chapter)]);
  if (!remaining.length) {
    return chapters.map((chapter: any) => ({ ...chapter, completed: true }));
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayText = today.toISOString().slice(0, 10);
  const startText = round.start_date > todayText ? round.start_date : todayText;
  const start = new Date(startText + 'T00:00:00.000Z');
  const roundEnd = new Date(round.end_date + 'T00:00:00.000Z');
  const end = roundEnd >= start ? roundEnd : start;
  const availableDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
  const weightOf = (chapter: any) => chapter.strength === 'WEAK' ? 3 : chapter.strength === 'STRONG' ? 1 : 2;
  const totalWeight = remaining.reduce((sum: number, chapter: any) => sum + weightOf(chapter), 0) || 1;
  let cumulative = 0;
  const adjusted = new Map<string, any>();
  remaining.forEach((chapter: any) => {
    const weight = weightOf(chapter);
    const fromOffset = Math.min(availableDays - 1, Math.floor(cumulative / totalWeight * availableDays));
    cumulative += weight;
    const toOffset = Math.min(availableDays - 1, Math.max(fromOffset, Math.ceil(cumulative / totalWeight * availableDays) - 1));
    const chapterStart = new Date(start);
    chapterStart.setUTCDate(chapterStart.getUTCDate() + fromOffset);
    const chapterEnd = new Date(start);
    chapterEnd.setUTCDate(chapterEnd.getUTCDate() + toOffset);
    adjusted.set(revisionProgressKey(round.key, chapter.subject, chapter.chapter), {
      ...chapter,
      start_date: chapterStart.toISOString().slice(0, 10),
      end_date: chapterEnd.toISOString().slice(0, 10),
      estimated_hours: Math.max(0.5, Math.round((availableDays * dailyHours * weight / totalWeight) * 10) / 10),
      completed: false,
      rescheduled: chapter.start_date !== chapterStart.toISOString().slice(0, 10) || chapter.end_date !== chapterEnd.toISOString().slice(0, 10),
    });
  });
  return chapters.map((chapter: any) => {
    const key = revisionProgressKey(round.key, chapter.subject, chapter.chapter);
    return progress[key]
      ? { ...chapter, completed: true }
      : adjusted.get(key) || { ...chapter, completed: false };
  });
}

export const StudyPlannerPage: React.FC = () => {
  const navigate = useNavigate();
  const [studentCourse, setStudentCourse] = useState<'CA_FOUNDATION' | 'CA_INTERMEDIATE' | 'CA_FINAL'>('CA_INTERMEDIATE');
  const courseLabel = studentCourse === 'CA_FINAL' ? 'CA Final' : studentCourse === 'CA_FOUNDATION' ? 'CA Foundation' : 'CA Intermediate';
  const [request, setRequest] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savingPlanId, setSavingPlanId] = useState<number | null>(null);
  const [savedPlanIds, setSavedPlanIds] = useState<number[]>([]);
  const [strengths, setStrengths] = useState<Record<string, string>>({});
  const [curriculumSubjects, setCurriculumSubjects] = useState<Array<{ key: string; name: string; paperNumber: number; group: string | null; chapters: string[]; units?: Array<{ key: string; name: string; chapters: string[] }> }>>([]);
  const [revisionMode, setRevisionMode] = useState<'bulk_group' | 'single_day'>('bulk_group');
  const [selectedChapters, setSelectedChapters] = useState<Record<string, boolean>>({});
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});
  const [expandedUnits, setExpandedUnits] = useState<Record<string, boolean>>({});
  const [selectedStrengthSubject, setSelectedStrengthSubject] = useState('');
  const [selectedStrengthChapter, setSelectedStrengthChapter] = useState('');
  const [selectedStrength, setSelectedStrength] = useState('MODERATE');
  const [strengthSaveState, setStrengthSaveState] = useState('');
  const [plannerWorkflow, setPlannerWorkflow] = useState<'strength' | 'performance'>('strength');
  const [dailyMinutes, setDailyMinutes] = useState('4');
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().slice(0, 10));
  const [studyStartTime, setStudyStartTime] = useState('06:00');
  const [preferredEndTime, setPreferredEndTime] = useState('22:00');
  const [examAttempt, setExamAttempt] = useState('May 2027');
  const [exactExamDate, setExactExamDate] = useState('');
  const [classMode, setClassMode] = useState<'none' | 'fixed' | 'flexible'>('none');
  const [classDay, setClassDay] = useState('1');
  const [classStart, setClassStart] = useState('09:00');
  const [classEnd, setClassEnd] = useState('13:00');
  const [classBlocks, setClassBlocks] = useState<Array<{day_of_week:number;start_time:string;end_time:string;label:string}>>([]);
  const [attemptRoadmap, setAttemptRoadmap] = useState<any>(null);
  const [revisionRounds, setRevisionRounds] = useState<any[]>([]);
  const [expandedRevisionRounds, setExpandedRevisionRounds] = useState<Record<string, boolean>>({});
  const [revisionProgress, setRevisionProgress] = useState<Record<string, boolean>>({});
  const [revisionProgressBusy, setRevisionProgressBusy] = useState('');
  const [roadmapCompletion, setRoadmapCompletion] = useState('40');
  const [roadmapBusy, setRoadmapBusy] = useState(false);
  const [roadmapMessage, setRoadmapMessage] = useState('');
  const [dailyPlan, setDailyPlan] = useState<any>(null);
  const [dailyPlanState, setDailyPlanState] = useState('');
  const [dailyPlanBusy, setDailyPlanBusy] = useState(false);
  const [savedPlans, setSavedPlans] = useState<Array<any>>([]);
  const [progressLogs, setProgressLogs] = useState<Array<any>>([]);
  const [progressBusyKey, setProgressBusyKey] = useState('');
  const [progressMessage, setProgressMessage] = useState('');
  const [mockSubject, setMockSubject] = useState('Taxation (Income Tax & GST)');
  const [mockScore, setMockScore] = useState('');
  const [mockMaxScore, setMockMaxScore] = useState('100');
  const [mockSaveState, setMockSaveState] = useState('');
  const [mockBusy, setMockBusy] = useState(false);
  const [priorities, setPriorities] = useState<Array<{ subject: string; chapter: string; strength: string; mock_percentage: number | null; priority_score: number; priority: string; rationale: string }>>([]);
  const [strengthBusy, setStrengthBusy] = useState(false);
  const [chatChapterRatings, setChatChapterRatings] = useState<Record<string, string>>({});
  const [chatAssessmentMinutes, setChatAssessmentMinutes] = useState('180');
  const [pdfBusyId, setPdfBusyId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 1,
    role: 'assistant',
    text: 'Hi! I’m your CA study assistant. Ask a study-related question, request an explanation or revision strategy, or ask me to build a study plan.',
  }]);
  const nextId = useRef(2);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ success: boolean; course: 'CA_FOUNDATION' | 'CA_INTERMEDIATE' | 'CA_FINAL' }>('/api/student/study-planner/course')
      .then((selected) => {
        if (!cancelled) setStudentCourse(selected.course);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadCourseData = async () => {
      if (studentCourse === 'CA_FINAL') {
        setCurriculumSubjects([]);
        setSelectedChapters({});
        return;
      }
      try {
        const [curriculum, profile, priorityData] = await Promise.all([
          apiRequest<{ success: boolean; subjects: Array<{ key: string; name: string; paperNumber: number; group: string | null; chapters: string[]; units?: Array<{ key: string; name: string; chapters: string[] }> }> }>('/api/student/study-planner/curriculum?course=' + encodeURIComponent(studentCourse)),
          apiRequest<{ success: boolean; strengths: Array<{ subject: string; chapter: string; strength: string }>; plans?: Array<any>; progress?: Array<any> }>('/api/student/study-planner/profile?course=' + encodeURIComponent(studentCourse)),
          apiRequest<{ success: boolean; priorities: Array<{ subject: string; chapter: string; strength: string; mock_percentage: number | null; priority_score: number; priority: string; rationale: string }> }>('/api/student/study-planner/priorities?course=' + encodeURIComponent(studentCourse)),
        ]);
        if (cancelled) return;
        const options = curriculum.subjects || [];
        const restored: Record<string, string> = {};
        for (const item of profile.strengths || []) {
          if (item.chapter !== '__SUBJECT_LEVEL__') restored[item.subject + '::' + item.chapter] = item.strength;
        }
        setCurriculumSubjects(options);
        setMockSubject(options[0]?.name || '');
        setSelectedStrengthSubject(options[0]?.name || '');
        setSelectedStrengthChapter(options[0]?.chapters[0] || '');
        setSelectedStrength(restored[(options[0]?.name || '') + '::' + (options[0]?.chapters[0] || '')] || 'MODERATE');
        setSelectedChapters({});
        setExpandedSubjects({});
        setExpandedUnits({});
        setStrengths(restored);
        setPriorities(priorityData.priorities || []);
        setSavedPlans(profile.plans || []);
        setProgressLogs(profile.progress || []);
      } catch {
        if (!cancelled) setCurriculumSubjects([]);
      }
    };
    void loadCourseData();
    return () => { cancelled = true; };
  }, [studentCourse]);

  const selectedChapterEntries = curriculumSubjects.flatMap((subject) =>
    subject.chapters.filter((chapter) => selectedChapters[subject.name + '::' + chapter])
      .map((chapter) => ({ subject: subject.name, chapter, key: subject.name + '::' + chapter })),
  );

  const refreshSavedPlans = async () => {
    const profile = await apiRequest<{ plans?: Array<any>; progress?: Array<any> }>('/api/student/study-planner/profile?course=' + encodeURIComponent(studentCourse));
    setSavedPlans(profile.plans || []);
    setProgressLogs(profile.progress || []);
  };

  const logStudySession = async (planId: string, session: any, studiedOn?: string) => {
    const key = planId + ':' + String(session.order ?? session.label);
    setProgressBusyKey(key);
    setProgressMessage('');
    try {
      await apiRequest('/api/student/study-planner/progress', {
        method: 'POST',
        body: JSON.stringify({
          course: studentCourse,
          plan_id: planId,
          subject: String(session.subject || courseLabel),
          chapter: typeof session.chapter === 'string' ? session.chapter : '',
          activity: String(session.activity || session.label || 'Study session'),
          duration_minutes: Number(session.minutes),
          studied_on: studiedOn || new Date().toLocaleDateString('en-CA'),
          notes: 'Logged from saved AI Planner timetable.',
        }),
      });
      await refreshSavedPlans();
      setProgressMessage('Study session logged successfully.');
    } catch (err: any) {
      setProgressMessage(err?.message || 'Could not log this study session.');
    } finally {
      setProgressBusyKey('');
    }
  };

  const completeSavedPlan = async (planId: string) => {
    setProgressBusyKey('complete:' + planId);
    setProgressMessage('');
    try {
      await apiRequest('/api/student/study-planner/plans/' + encodeURIComponent(planId) + '/complete', { method: 'PATCH' });
      await refreshSavedPlans();
      setProgressMessage('Plan marked as completed.');
    } catch (err: any) {
      setProgressMessage(err?.message || 'Could not complete this plan.');
    } finally {
      setProgressBusyKey('');
    }
  };

  const generateAttemptRoadmap = async () => {
    if (!exactExamDate) { setRoadmapMessage('Choose the exact exam date first. The planner will not guess it.'); setAttemptRoadmap(null); setRevisionRounds([]); return; }
    const completion = Number(roadmapCompletion);
    if (!Number.isFinite(completion) || completion < 0 || completion > 100) { setRoadmapMessage('Syllabus completion must be between 0 and 100%.'); setAttemptRoadmap(null); return; }
    setRoadmapBusy(true); setRoadmapMessage('');
    try {
      const response = await apiRequest<{ success: boolean; roadmap: any[]; revision_rounds?: any[]; chapter_ratings_used?: number; error?: string }>('/api/student/study-planner/attempt-roadmap', { method: 'POST', body: JSON.stringify({ course: studentCourse, start_date: dailyDate, exact_exam_date: exactExamDate, syllabus_completion_percent: completion, daily_study_hours: Number(dailyMinutes) || 4 }) });
      setAttemptRoadmap(response.roadmap); setRevisionRounds(response.revision_rounds || []);
      const savedProgress = await apiRequest<{ success: boolean; progress: Array<{ round_key: string; subject: string; chapter: string; completed: number }> }>('/api/student/study-planner/revision-progress?course=' + encodeURIComponent(studentCourse) + '&exam_date=' + encodeURIComponent(exactExamDate));
      const restoredProgress: Record<string, boolean> = {};
      for (const item of savedProgress.progress || []) restoredProgress[revisionProgressKey(item.round_key, item.subject, item.chapter)] = Boolean(item.completed);
      setRevisionProgress(restoredProgress);
      setRoadmapMessage('Exam roadmap generated. ' + (response.chapter_ratings_used ? response.chapter_ratings_used + ' saved chapter ratings used.' : 'Rate chapters to personalise revision priorities.') + ' Chapter completion is saved and unfinished work will be rescheduled automatically.');
    } catch (err: any) { setAttemptRoadmap(null); setRoadmapMessage(err?.message || 'Could not generate attempt roadmap.'); }
    finally { setRoadmapBusy(false); }
  };

  const toggleRevisionChapter = async (round: any, chapter: any) => {
    if (!exactExamDate) { setRoadmapMessage('Set the exact exam date before tracking revision progress.'); return; }
    const key = revisionProgressKey(round.key, chapter.subject, chapter.chapter);
    const completed = !revisionProgress[key];
    setRevisionProgressBusy(key);
    setRoadmapMessage('');
    try {
      await apiRequest('/api/student/study-planner/revision-progress', { method: 'PUT', body: JSON.stringify({ course: studentCourse, exam_date: exactExamDate, round_key: round.key, subject: chapter.subject, chapter: chapter.chapter, completed }) });
      setRevisionProgress((current) => ({ ...current, [key]: completed }));
      setRoadmapMessage(completed ? 'Chapter marked complete. Remaining chapters in this round have been rescheduled.' : 'Chapter marked incomplete. The remaining schedule has been recalculated.');
    } catch (err: any) { setRoadmapMessage(err?.message || 'Could not save chapter progress.'); }
    finally { setRevisionProgressBusy(''); }
  };

  const generateDailyPlan = async () => {
    const hours = Number(dailyMinutes);
    if (!Number.isFinite(hours) || hours < 1 || hours > 12 || Math.round(hours * 4) !== hours * 4) {
      setDailyPlanState('Enter daily study time from 1 to 12 hours in 15-minute increments.');
      setDailyPlan(null);
      return;
    }
    if (!dailyDate || Number.isNaN(new Date(dailyDate + 'T00:00:00').getTime())) {
      setDailyPlanState('Choose a valid plan start date.');
      setDailyPlan(null);
      return;
    }
    if (!selectedChapterEntries.length) {
      setDailyPlanState('Select at least one chapter from a unit before generating the timetable.');
      setDailyPlan(null);
      return;
    }
    setDailyPlanBusy(true);
    setDailyPlanState('');
    setDailyPlan(null);
    try {
      // Persist the visible Weak / Moderate / Strong choice for every selected chapter.
      const ratingsToSave = selectedChapterEntries.map((item) => ({
        ...item,
        strength: strengths[item.key] || 'MODERATE',
      }));
      await Promise.all(ratingsToSave.map((item) => apiRequest('/api/student/study-planner/strengths', {
        method: 'PUT',
        body: JSON.stringify({ course: studentCourse, subject: item.subject, chapter: item.chapter, strength: item.strength }),
      })));
      setStrengths((current) => {
        const next = { ...current };
        ratingsToSave.forEach((item) => { next[item.key] = item.strength; });
        return next;
      });

      const response = await apiRequest<{ success: boolean; plan: { start_date: string; end_date: string; attempt: string; exact_exam_date: string | null; daily_study_minutes: number; sessions: any[]; assumptions: string[] }; error?: string }>(
        '/api/student/study-planner/multi-day-schedule',
        {
          method: 'POST',
          body: JSON.stringify({
            course: studentCourse,
            revision_mode: revisionMode,
            selected_chapters: selectedChapterEntries.map(({ subject, chapter }) => ({ subject, chapter })),
            start_date: dailyDate,
            daily_study_hours: hours,
            study_start_time: studyStartTime,
            preferred_end_time: preferredEndTime,
            attempt: examAttempt,
            exact_exam_date: exactExamDate || null,
            class_mode: classMode,
            class_blocks: classMode === 'fixed' ? classBlocks : [],
          }),
        },
      );
      const schedule = response.plan;
      setDailyPlan({
        title: (revisionMode === 'single_day' ? 'Single-day revision · ' : 'Bulk / group revision · ') + schedule.attempt,
        total_minutes: schedule.sessions.reduce((sum: number, session: any) => sum + Number(session.minutes || 0), 0),
        daily_minutes: schedule.daily_study_minutes,
        available_minutes: schedule.daily_study_minutes,
        unscheduled_minutes: 0,
        date: schedule.start_date,
        end_date: schedule.end_date,
        attempt: schedule.attempt,
        sessions: schedule.sessions,
        assumptions: schedule.assumptions,
      });
      setDailyPlanState(schedule.sessions.length
        ? (revisionMode === 'single_day'
          ? 'Single-day revision plan is ready. Review the chapter sessions below.'
          : 'Your next 7 days are ready using only the chapters you selected. Review the sessions below.')
        : 'No sessions fit the selected time window. Increase daily hours or adjust your study times / class blocks.');
      await apiRequest<{ success: boolean; priorities: Array<{ subject: string; chapter: string; strength: string; mock_percentage: number | null; priority_score: number; priority: string; rationale: string }> }>('/api/student/study-planner/priorities?course=' + encodeURIComponent(studentCourse))
        .then((data) => setPriorities(data.priorities || []))
        .catch(() => undefined);
    } catch (err: any) {
      setDailyPlanState(err?.message || 'Could not generate the timetable.');
    } finally {
      setDailyPlanBusy(false);
    }
  };
  const saveDailyPlan = async () => { if (!dailyPlan || !dailyPlan.sessions?.length) return; setDailyPlanBusy(true); setDailyPlanState(''); try { const plan = { title: dailyPlan.title + ' · ' + dailyPlan.date, total_minutes: dailyPlan.total_minutes, date: dailyPlan.date, sessions: dailyPlan.sessions, note: 'Generated from saved chapter priorities. Breaks are not included in study minutes.' }; await apiRequest('/api/student/study-planner/plans', { method: 'POST', body: JSON.stringify({ course: studentCourse, plan }) }); setDailyPlanState('Saved timetable to your study planner.'); } catch (err: any) { setDailyPlanState(err?.message || 'Could not save this plan.'); } finally { setDailyPlanBusy(false); } };

  const sendRequest = async (rawText?: string, extras?: { chapter_ratings?: Array<{ chapter: string; strength: string }>; available_minutes?: number; chapter_assessment_subject?: string; plan_scope?: 'one_day' | 'exam_roadmap'; reply_language?: 'english' | 'hinglish' | 'hindi' }) => {
    const text = (rawText ?? request).trim();
    if (!text || loading) return;
    setError('');
    setRequest('');
    const userMessage: ChatMessage = { id: nextId.current++, role: 'user', text };
    setMessages((current) => [...current, userMessage]);
    setLoading(true);
    try {
      const response = await apiRequest<PlannerResponse>('/api/student/study-planner', {
        method: 'POST',
        body: JSON.stringify({
          message: text,
          conversation_history: messages.slice(-12).map((item) => (item.role === 'user' ? 'Student: ' : 'Planner: ') + item.text).slice(-6),
          previous_plan: [...messages].reverse().find((item) => item.role === 'assistant' && item.result?.plan)?.result?.plan || null,
          default_duration_minutes: Math.round((Number(dailyMinutes) || 4) * 60),
          planner_settings: { daily_study_hours: Number(dailyMinutes) || 4, start_date: dailyDate, study_start_time: studyStartTime, preferred_end_time: preferredEndTime, attempt: examAttempt, exact_exam_date: exactExamDate || null, syllabus_completion_percent: Number(roadmapCompletion) || 40, class_mode: classMode, class_blocks: classMode === 'fixed' ? classBlocks : [] },
          ...(extras || {}),
        }),
      });
      setMessages((current) => [...current, {
        id: nextId.current++,
        role: 'assistant',
        text: response.message || 'I’ve reviewed your request.',
        result: response,
      }]);
    } catch (err: any) {
      setError(err?.message || 'I couldn’t process that request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const downloadPlanPdf = async (plan: StudyPlanDraft, messageId: number) => {
    setPdfBusyId(messageId);
    try {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const margin = 44;
      let page = pdf.addPage([pageWidth, pageHeight]);
      let y = pageHeight - margin;
      const safe = (value: unknown) => String(value ?? '').replace(/[^\x20-\x7E]/g, '-');
      const drawLine = (value: string, size = 10, isBold = false, indent = 0) => {
        const activeFont = isBold ? bold : font;
        const maxWidth = pageWidth - margin * 2 - indent;
        const words = safe(value).split(/\s+/);
        let line = '';
        const lines: string[] = [];
        for (const word of words) {
          const next = line ? line + ' ' + word : word;
          if (activeFont.widthOfTextAtSize(next, size) > maxWidth && line) {
            lines.push(line);
            line = word;
          } else line = next;
        }
        if (line) lines.push(line);
        for (const text of lines) {
          if (y < margin + 24) { page = pdf.addPage([pageWidth, pageHeight]); y = pageHeight - margin; }
          page.drawText(text, { x: margin + indent, y, size, font: activeFont, color: rgb(0.12, 0.16, 0.28) });
          y -= size + 5;
        }
      };
      drawLine(plan.title || 'CA Study Plan', 18, true);
      y -= 4;
      drawLine('Course: ' + courseLabel, 10);
      drawLine('Focus: ' + (plan.subjects || []).join(', '), 10);
      drawLine('Total study time: ' + plan.total_minutes + ' minutes (' + (Number(plan.total_minutes) / 60).toFixed(2) + ' hours)', 10);
      drawLine('Generated: ' + new Date().toLocaleDateString(), 10);
      y -= 10;
      page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: rgb(0.35, 0.31, 0.85) });
      y -= 18;
      drawLine('Chapter-wise sessions', 13, true);
      for (const session of plan.sessions || []) {
        y -= 4;
        drawLine(session.order + '. ' + ((session as any).date ? (session as any).date + ' ' + ((session as any).start_time || '') + (((session as any).end_time) ? '–' + (session as any).end_time : '') + ' | ' : '') + ((session as any).round_key ? (session as any).round_key + ' | ' : '') + session.label + ' - ' + session.minutes + ' minutes', 11, true);
        drawLine('Subject: ' + session.subject + ((session as any).chapter ? ' | Chapter: ' + (session as any).chapter : ''), 9, false, 10);
        if ((session as any).strength) drawLine('Self-rated strength: ' + (session as any).strength, 9, false, 10);
        drawLine(session.instruction, 9, false, 10);
      }
      y -= 8;
      drawLine('Study approach: complete the session, check mistakes, and mark progress in your planner.', 9);
      const bytes = await pdf.save();
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = (plan.title || 'CA-study-plan').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || 'Could not create the PDF. Please try again.');
    } finally {
      setPdfBusyId(null);
    }
  };

  const saveSelectedRatings = async () => {
    if (!selectedChapterEntries.length) {
      setStrengthSaveState('Select at least one chapter first.');
      return;
    }
    setStrengthBusy(true);
    setStrengthSaveState('');
    try {
      const ratingsToSave = selectedChapterEntries.map((item) => ({
        ...item,
        strength: strengths[item.key] || 'MODERATE',
      }));
      await Promise.all(ratingsToSave.map((item) => apiRequest('/api/student/study-planner/strengths', {
        method: 'PUT',
        body: JSON.stringify({ course: studentCourse, subject: item.subject, chapter: item.chapter, strength: item.strength }),
      })));
      setStrengths((current) => {
        const next = { ...current };
        ratingsToSave.forEach((item) => { next[item.key] = item.strength; });
        return next;
      });
      setStrengthSaveState('Saved ratings for ' + ratingsToSave.length + ' selected chapter(s).');
      const updated = await apiRequest<{ success: boolean; priorities: Array<{ subject: string; chapter: string; strength: string; mock_percentage: number | null; priority_score: number; priority: string; rationale: string }> }>('/api/student/study-planner/priorities?course=' + encodeURIComponent(studentCourse));
      setPriorities(updated.priorities || []);
    } catch (err: any) {
      setStrengthSaveState(err?.message || 'Could not save selected chapter ratings.');
    } finally {
      setStrengthBusy(false);
    }
  };

  return (
    <div className="mx-auto min-h-[calc(100dvh-9rem)] w-full max-w-5xl px-3 py-4 sm:px-6 sm:py-6">
      <button type="button" onClick={() => navigate('/student/dashboard')} className="mb-4 inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </button>

      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm"><Sparkles className="h-6 w-6" /></span>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">AI Planner</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">Choose the chapters you want to revise, rate your confidence, and generate a timetable around your available hours.</p>
          </div>
        </div>
        <label className="block w-full sm:max-w-xs">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">CA course</span>
          <select value={studentCourse} onChange={(event) => {
            setStudentCourse(event.target.value as 'CA_FOUNDATION' | 'CA_INTERMEDIATE' | 'CA_FINAL');
            setSelectedChapters({});
            setExpandedSubjects({});
            setExpandedUnits({});
            setDailyPlan(null);
            setDailyPlanState('');
            setStrengthSaveState('');
          }} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
            <option value="CA_FOUNDATION">CA Foundation</option>
            <option value="CA_INTERMEDIATE">CA Intermediate</option>
            {studentCourse === 'CA_FINAL' && <option value="CA_FINAL">CA Final (not available yet)</option>}
          </select>
        </label>
      </header>

      {studentCourse === 'CA_FINAL' ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
          <h2 className="font-extrabold">CA Final planner is not available yet</h2>
          <p className="mt-1">This planner workflow currently supports CA Foundation and CA Intermediate. Choose one of those courses to continue.</p>
        </section>
      ) : (
        <>
          <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Step 1 of 3</p>
                <h2 className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">Choose revision mode</h2>
              </div>
              <span className="text-xs text-slate-500">{courseLabel}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => { setRevisionMode('bulk_group'); setDailyPlan(null); setDailyPlanState(''); }} aria-pressed={revisionMode === 'bulk_group'} className={'rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ' + (revisionMode === 'bulk_group' ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:border-indigo-500 dark:bg-indigo-950/40' : 'border-slate-200 hover:border-indigo-300 dark:border-slate-800')}>
                <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white"><BookOpen className="h-4 w-4 text-indigo-600" /> Bulk / Group Revision</span>
                <span className="mt-1.5 block text-sm leading-5 text-slate-500 dark:text-slate-400">Select chapters from multiple subjects and units. Spread the revision across the next 7 days.</span>
              </button>
              <button type="button" onClick={() => { setRevisionMode('single_day'); setDailyPlan(null); setDailyPlanState(''); }} aria-pressed={revisionMode === 'single_day'} className={'rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ' + (revisionMode === 'single_day' ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:border-indigo-500 dark:bg-indigo-950/40' : 'border-slate-200 hover:border-indigo-300 dark:border-slate-800')}>
                <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white"><Clock3 className="h-4 w-4 text-indigo-600" /> Single-day Revision</span>
                <span className="mt-1.5 block text-sm leading-5 text-slate-500 dark:text-slate-400">Focus on your selected chapters for one chosen day only.</span>
              </button>
            </div>
          </section>

          <section className="mb-4 rounded-2xl border border-indigo-200 bg-white p-4 dark:border-indigo-900 dark:bg-slate-950 sm:p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Step 2 of 3</p>
                <h2 className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">Select units and chapters</h2>
                <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500 dark:text-slate-400">Open a subject, select a whole unit or tick individual chapters. Rate every selected chapter as Weak, Moderate or Strong.</p>
              </div>
              <span className="w-fit rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200">{selectedChapterEntries.length} selected</span>
            </div>

            {curriculumSubjects.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">Loading curriculum… If it does not appear, refresh and try again.</p>
            ) : (
              <div className="space-y-3">
                {curriculumSubjects.map((subject, subjectIndex) => {
                  const subjectOpen = expandedSubjects[subject.key] ?? subjectIndex === 0;
                  const units = subject.units?.length ? subject.units : [{ key: subject.key + '-unit-1', name: 'Unit 1', chapters: subject.chapters }];
                  const subjectSelectedCount = subject.chapters.filter((chapter) => selectedChapters[subject.name + '::' + chapter]).length;
                  return (
                    <section key={subject.key} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                      <button type="button" aria-expanded={subjectOpen} onClick={() => setExpandedSubjects((current) => ({ ...current, [subject.key]: !subjectOpen }))} className="flex w-full items-center justify-between gap-3 bg-slate-50 px-3 py-3 text-left dark:bg-slate-900 sm:px-4">
                        <span className="min-w-0">
                          <span className="block text-sm font-extrabold text-slate-900 dark:text-white">Paper {subject.paperNumber}: {subject.name}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">{subjectSelectedCount} of {subject.chapters.length} chapters selected</span>
                        </span>
                        <span className="shrink-0 text-xl font-medium text-indigo-600" aria-hidden="true">{subjectOpen ? '−' : '+'}</span>
                      </button>
                      {subjectOpen && (
                        <div className="space-y-3 p-3 sm:p-4">
                          {units.map((unit, unitIndex) => {
                            const unitKey = subject.key + '::' + unit.key;
                            const unitOpen = expandedUnits[unitKey] ?? unitIndex === 0;
                            const chosenCount = unit.chapters.filter((chapter) => selectedChapters[subject.name + '::' + chapter]).length;
                            const isAllChosen = unit.chapters.length > 0 && chosenCount === unit.chapters.length;
                            return (
                              <div key={unit.key} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                                <div className="flex items-center gap-3 bg-white px-3 py-3 dark:bg-slate-950 sm:px-4">
                                  <input type="checkbox" aria-label={'Select all chapters in ' + unit.name} checked={isAllChosen} onChange={(event) => {
                                    const checked = event.target.checked;
                                    setSelectedChapters((current) => {
                                      const next = { ...current };
                                      unit.chapters.forEach((chapter) => { next[subject.name + '::' + chapter] = checked; });
                                      return next;
                                    });
                                  }} className="h-4 w-4 shrink-0 accent-indigo-600" />
                                  <button type="button" aria-expanded={unitOpen} onClick={() => setExpandedUnits((current) => ({ ...current, [unitKey]: !unitOpen }))} className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
                                    <span className="min-w-0">
                                      <span className="block text-sm font-bold text-slate-900 dark:text-white">Unit {unitIndex + 1} · {unit.name}</span>
                                      <span className="mt-0.5 block text-xs text-slate-500">{chosenCount}/{unit.chapters.length} selected · select the checkbox to toggle the whole unit</span>
                                    </span>
                                    <span className="shrink-0 text-lg text-slate-500" aria-hidden="true">{unitOpen ? '−' : '+'}</span>
                                  </button>
                                </div>
                                {unitOpen && (
                                  <div className="space-y-2 border-t border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                                    {unit.chapters.map((chapter) => {
                                      const ratingKey = subject.name + '::' + chapter;
                                      const isSelected = Boolean(selectedChapters[ratingKey]);
                                      const rating = strengths[ratingKey] || 'MODERATE';
                                      return (
                                        <article key={ratingKey} className={'rounded-xl border p-3 ' + (isSelected ? 'border-indigo-300 bg-white dark:border-indigo-800 dark:bg-slate-950' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950')}>
                                          <label className="flex cursor-pointer items-start gap-3">
                                            <input type="checkbox" checked={isSelected} onChange={(event) => setSelectedChapters((current) => ({ ...current, [ratingKey]: event.target.checked }))} className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600" />
                                            <span className="min-w-0 flex-1 text-sm font-semibold leading-5 text-slate-800 dark:text-slate-100">{chapter}</span>
                                          </label>
                                          {isSelected && (
                                            <div className="mt-3 pl-7">
                                              <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">Your confidence</p>
                                              <div className="grid grid-cols-3 gap-2">
                                                {[
                                                  { value: 'WEAK', label: 'Weak', desc: 'Needs focus' },
                                                  { value: 'MODERATE', label: 'Moderate', desc: 'Needs revision' },
                                                  { value: 'STRONG', label: 'Strong', desc: 'Mostly confident' },
                                                ].map((option) => (
                                                  <button key={option.value} type="button" aria-pressed={rating === option.value} onClick={() => setStrengths((current) => ({ ...current, [ratingKey]: option.value }))} className={'min-w-0 rounded-lg border px-2 py-2 text-left transition ' + (rating === option.value ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:border-indigo-500 dark:bg-indigo-950/50' : 'border-slate-200 bg-white hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900')}>
                                                    <span className="block text-xs font-extrabold text-slate-900 dark:text-white sm:text-sm">{option.label}</span>
                                                    <span className="mt-0.5 block text-[10px] leading-4 text-slate-500 dark:text-slate-400">{option.desc}</span>
                                                  </button>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </article>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">Save ratings here, or generate a timetable to save them automatically. Unrated selections start as Moderate unless you change them.</p>
              <button type="button" disabled={strengthBusy || selectedChapterEntries.length === 0} onClick={() => void saveSelectedRatings()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-indigo-300 px-4 py-2.5 text-sm font-bold text-indigo-700 disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-200">
                <Save className="h-4 w-4" /> {strengthBusy ? 'Saving ratings…' : 'Save selected ratings'}
              </button>
            </div>
            {strengthSaveState && <p role="status" className="mt-3 text-sm text-slate-600 dark:text-slate-300">{strengthSaveState}</p>}
          </section>

          <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 sm:p-5">
            <div className="mb-4">
              <p className="text-xs font-extrabold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Step 3 of 3</p>
              <h2 className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">Set your study time</h2>
              <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">{revisionMode === 'single_day' ? 'The selected chapters will be scheduled for this date only.' : 'The selected chapters will be arranged into a 7-day timetable.'}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Plan date<input type="date" value={dailyDate} onChange={(event) => setDailyDate(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Daily study hours<input type="number" min="1" max="12" step="0.25" value={dailyMinutes} onChange={(event) => setDailyMinutes(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /><span className="mt-1 block font-normal text-slate-500">{Number(dailyMinutes) || 0} hours</span></label>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Study starts<input type="time" value={studyStartTime} onChange={(event) => setStudyStartTime(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Preferred finish<input type="time" value={preferredEndTime} onChange={(event) => setPreferredEndTime(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
            </div>

            {revisionMode === 'bulk_group' && <label className="mt-3 block text-xs font-bold text-slate-600 dark:text-slate-300 sm:max-w-xs">CA exam attempt
              <select value={examAttempt} onChange={(event) => setExamAttempt(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                <option>January 2027</option><option>May 2027</option><option>September 2027</option><option>January 2028</option><option>May 2028</option><option>September 2028</option>
              </select>
            </label>}

            <details className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <summary className="cursor-pointer text-sm font-bold text-slate-800 dark:text-slate-100">Coaching / class timings (optional)</summary>
              <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">Add fixed recurring classes to keep those time slots free in your study timetable.</p>
              <select value={classMode} onChange={(event) => setClassMode(event.target.value as 'none' | 'fixed' | 'flexible')} className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                <option value="none">No classes</option><option value="fixed">Fixed weekly class timings</option><option value="flexible">Flexible coaching hours</option>
              </select>
              {classMode === 'fixed' && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Day<select value={classDay} onChange={(event) => setClassDay(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"><option value="0">Sunday</option><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option></select></label>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Starts<input type="time" value={classStart} onChange={(event) => setClassStart(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Ends<input type="time" value={classEnd} onChange={(event) => setClassEnd(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                    <div className="flex items-end"><button type="button" onClick={() => {
                      if (classEnd <= classStart) { setDailyPlanState('Class end time must be later than start time.'); return; }
                      setClassBlocks((items) => [...items, { day_of_week: Number(classDay), start_time: classStart, end_time: classEnd, label: 'Coaching class' }]);
                    }} className="w-full rounded-lg border border-indigo-300 px-3 py-2 text-xs font-bold text-indigo-700 dark:border-indigo-700 dark:text-indigo-300">Add class</button></div>
                  </div>
                  {classBlocks.map((block, index) => <div key={index} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-900"><span>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][block.day_of_week]} · {block.start_time}–{block.end_time}</span><button type="button" onClick={() => setClassBlocks((items) => items.filter((_, blockIndex) => blockIndex !== index))} className="font-bold text-rose-600">Remove</button></div>)}
                  {classBlocks.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Add at least one fixed class, or select No classes.</p>}
                </div>
              )}
              {classMode === 'flexible' && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Choose study hours that avoid your flexible class hours; fixed weekly slots are only skipped when you add them above.</p>}
            </details>

            <button type="button" disabled={dailyPlanBusy || selectedChapterEntries.length === 0} onClick={() => void generateDailyPlan()} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
              <Sparkles className="h-4 w-4" /> {dailyPlanBusy ? 'Generating timetable…' : revisionMode === 'single_day' ? 'Generate single-day timetable' : 'Generate weekly timetable'}
            </button>
            {(dailyPlanState || roadmapMessage) && <p role="status" className="mt-3 text-sm text-slate-600 dark:text-slate-300">{dailyPlanState || roadmapMessage}</p>}
          </section>

          {dailyPlan && (
            <section className="mb-5 overflow-hidden rounded-2xl border border-emerald-200 bg-white dark:border-emerald-900 dark:bg-slate-950">
              <div className="flex flex-col gap-3 bg-emerald-50/70 p-4 dark:bg-emerald-950/20 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white">{dailyPlan.title}</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{dailyPlan.date} to {dailyPlan.end_date} · {dailyPlan.daily_minutes} study minutes per day · {dailyPlan.sessions.length} sessions</p>
                </div>
                <button type="button" disabled={dailyPlanBusy || !dailyPlan.sessions.length} onClick={() => void saveDailyPlan()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" /> Save timetable</button>
              </div>
              {dailyPlan.sessions.length === 0 ? <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No sessions were created. Try adjusting daily hours, start/finish times or class blocks.</p> : (
                <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                  {dailyPlan.sessions.map((session: any) => <li key={session.date + '-' + session.order} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                    <span className="w-fit rounded-lg bg-indigo-100 px-2.5 py-1.5 text-xs font-extrabold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">{session.date} · {session.start_time}–{session.end_time}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-extrabold text-slate-900 dark:text-white">{session.subject}</p>
                      <p className="mt-0.5 text-sm text-indigo-700 dark:text-indigo-300">{session.chapter} · {session.minutes} min · {session.label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{session.instruction}</p>
                    </div>
                  </li>)}
                </ol>
              )}
              {dailyPlan.assumptions?.length > 0 && <div className="space-y-1 border-t border-slate-100 px-4 py-3 dark:border-slate-800">{dailyPlan.assumptions.map((assumption: string, index: number) => <p key={index} className="text-xs leading-5 text-slate-500 dark:text-slate-400">• {assumption}</p>)}</div>}
            </section>
          )}
        </>
      )}
    </div>
  );
};
