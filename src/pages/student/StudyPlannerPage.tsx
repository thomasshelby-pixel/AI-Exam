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
  const [curriculumSubjects, setCurriculumSubjects] = useState<Array<{ key: string; name: string; paperNumber: number; group: string | null; chapters: string[] }>>([]);
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
    const loadPlannerProfile = async () => {
      try {
        const selected = await apiRequest<{ success: boolean; course: 'CA_FOUNDATION' | 'CA_INTERMEDIATE' | 'CA_FINAL'; label: string }>('/api/student/study-planner/course');
        if (cancelled) return;
        const course = selected.course;
        setStudentCourse(course);
        const profilePromise = apiRequest<{ success: boolean; strengths: Array<{ subject: string; chapter: string; strength: string }>; plans?: Array<any>; progress?: Array<any> }>('/api/student/study-planner/profile?course=' + encodeURIComponent(course));
        if (course === 'CA_FINAL') {
          const profile = await profilePromise;
          if (cancelled) return;
          const restored: Record<string, string> = {};
          for (const item of profile.strengths || []) {
            if (item.chapter !== '__SUBJECT_LEVEL__') restored[item.subject + '::' + item.chapter] = item.strength;
          }
          setCurriculumSubjects([]);
          setStrengths(restored);
          setPriorities([]);
          setSavedPlans(profile.plans || []);
          setProgressLogs(profile.progress || []);
          return;
        }
        const [curriculum, profile, priorityData] = await Promise.all([
          apiRequest<{ success: boolean; subjects: Array<{ key: string; name: string; paperNumber: number; group: string | null; chapters: string[] }> }>('/api/student/study-planner/curriculum?course=' + encodeURIComponent(course)),
          profilePromise,
          apiRequest<{ success: boolean; priorities: Array<{ subject: string; chapter: string; strength: string; mock_percentage: number | null; priority_score: number; priority: string; rationale: string }> }>('/api/student/study-planner/priorities?course=' + encodeURIComponent(course)),
        ]);
        if (cancelled) return;
        const options = curriculum.subjects || [];
        setCurriculumSubjects(options);
        if (options.length) {
          setMockSubject(options[0].name);
          setSelectedStrengthSubject((current) => current || options[0].name);
          setSelectedStrengthChapter((current) => current || options[0].chapters[0] || '');
        }
        const restored: Record<string, string> = {};
        for (const item of profile.strengths || []) {
          if (item.chapter !== '__SUBJECT_LEVEL__') restored[item.subject + '::' + item.chapter] = item.strength;
        }
        setStrengths(restored);
        setPriorities(priorityData.priorities || []);
        setSavedPlans(profile.plans || []);
        setProgressLogs(profile.progress || []);
      } catch {
        // Keep the study chat available even if optional planner data cannot load.
      }
    };
    void loadPlannerProfile();
    return () => { cancelled = true; };
  }, []);


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
      setDailyPlanState('Choose a valid date.');
      setDailyPlan(null);
      return;
    }
    setDailyPlanBusy(true);
    setDailyPlanState('');
    setDailyPlan(null);
    try {
      const response = await apiRequest<{ success: boolean; plan: { start_date: string; end_date: string; attempt: string; exact_exam_date: string | null; daily_study_minutes: number; sessions: any[]; assumptions: string[] }; error?: string }>(
        '/api/student/study-planner/multi-day-schedule',
        {
          method: 'POST',
          body: JSON.stringify({
            course: studentCourse,
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
        title: 'Weekly timetable · ' + schedule.attempt,
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
        ? '7-day draft ready. Review the subject rotation and session times before saving.'
        : 'Rate at least one chapter first. The planner will not guess which chapters are weak.');
      await apiRequest<{ success: boolean; priorities: Array<{ subject: string; chapter: string; strength: string; mock_percentage: number | null; priority_score: number; priority: string; rationale: string }> }>('/api/student/study-planner/priorities?course=' + encodeURIComponent(studentCourse))
        .then((data) => setPriorities(data.priorities || []))
        .catch(() => undefined);
    } catch (err: any) {
      setDailyPlanState(err?.message || 'Could not generate the daily timetable.');
    } finally {
      setDailyPlanBusy(false);
    }
  };
  const saveDailyPlan = async () => { if (!dailyPlan || !dailyPlan.sessions?.length) return; setDailyPlanBusy(true); setDailyPlanState(''); try { const plan = { title: dailyPlan.title + ' · ' + dailyPlan.date, total_minutes: dailyPlan.total_minutes, date: dailyPlan.date, sessions: dailyPlan.sessions, note: 'Generated from saved chapter priorities. Breaks are not included in study minutes.' }; await apiRequest('/api/student/study-planner/plans', { method: 'POST', body: JSON.stringify({ course: studentCourse, plan }) }); setDailyPlanState('Saved to your study planner.'); await refreshSavedPlans(); } catch (err: any) { setDailyPlanState(err?.message || 'Could not save this plan.'); } finally { setDailyPlanBusy(false); } };

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

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-4xl flex-col px-3 py-4 sm:px-6 sm:py-6">
      <button
        type="button"
        onClick={() => navigate('/student/dashboard')}
        className="mb-4 inline-flex w-fit items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </button>


      {studentCourse !== 'CA_FINAL' ? (<>
      <section id="planner-roadmap" className="mb-4 scroll-mt-6 rounded-2xl border border-indigo-200 bg-white p-4 dark:border-indigo-900 dark:bg-slate-950 sm:p-5">
        <div className="mb-3 flex items-center gap-2"><CalendarClock className="h-5 w-5 text-indigo-600" /><h2 className="text-base font-extrabold text-slate-900 dark:text-white">CA attempt roadmap</h2></div>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">Timeline: syllabus completion, first revision, RTP/MTP, mock tests and final revision. Use the weekly timetable for individual study sessions.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Plan start date<input type="date" value={dailyDate} onChange={e=>setDailyDate(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-transparent p-2 text-sm dark:border-slate-700" /></label>
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Exact exam date<input type="date" value={exactExamDate} min={dailyDate} onChange={e=>setExactExamDate(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-transparent p-2 text-sm dark:border-slate-700" /></label>
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Syllabus completed (%)<input type="number" min="0" max="100" value={roadmapCompletion} onChange={e=>setRoadmapCompletion(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-transparent p-2 text-sm dark:border-slate-700" /></label>
        </div>
        <button type="button" disabled={roadmapBusy} onClick={()=>void generateAttemptRoadmap()} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{roadmapBusy ? 'Building roadmap…' : 'Build exam roadmap'}</button>
        {roadmapMessage && <p role="status" className="mt-3 text-sm text-slate-600 dark:text-slate-300">{roadmapMessage}</p>}
        {attemptRoadmap && <div className="mt-4 space-y-3">{attemptRoadmap.map((phase:any)=><div key={phase.key} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-900 dark:text-white">{phase.title}</h3><span className="text-xs font-bold text-indigo-600 dark:text-indigo-300">{phase.percentage}%</span></div><p className="mt-1 text-xs text-slate-500">{phase.start_date} – {phase.end_date}</p><ul className="mt-2 list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">{phase.goals.map((goal:string)=><li key={goal}>{goal}</li>)}</ul></div>)}</div>}{revisionRounds.length > 0 && <div className="mt-4">
        <h3 className="mb-2 text-sm font-extrabold text-slate-900 dark:text-white">Your adaptive revision rounds</h3>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Mark each chapter complete. Progress is saved to your account; unfinished chapters are rescheduled across the remaining days in that round.</p>
        <div className="space-y-2">{revisionRounds.map((round:any)=>{const chapters=getAdjustedRevisionChapters(round,revisionProgress,Number(dailyMinutes)||4);const done=chapters.filter((chapter:any)=>chapter.completed).length;return <div key={round.key} className="overflow-hidden rounded-xl border border-indigo-200 bg-indigo-50/50 dark:border-indigo-900 dark:bg-indigo-950/20">
          <button type="button" aria-expanded={!!expandedRevisionRounds[round.key]} onClick={()=>setExpandedRevisionRounds((current)=>({...current,[round.key]:!current[round.key]}))} className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left">
            <div><h4 className="font-bold text-slate-900 dark:text-white">{round.title}</h4><p className="mt-1 text-xs text-slate-500">{round.start_date} – {round.end_date}</p></div>
            <span className="flex items-center gap-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{done}/{chapters.length} complete · {round.days} days <span aria-hidden="true">{expandedRevisionRounds[round.key] ? '−' : '+'}</span></span>
            <p className="w-full text-sm text-slate-600 dark:text-slate-300">{round.focus}</p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full bg-indigo-600" style={{width:(chapters.length ? done/chapters.length*100 : 0)+'%'}} /></div>
            <p className="w-full text-xs text-slate-500">{chapters.length} chapters planned · Tap to {expandedRevisionRounds[round.key] ? 'hide details' : 'view and track chapters'}</p>
          </button>
          {expandedRevisionRounds[round.key] && <div className="space-y-3 border-t border-indigo-200 p-3 dark:border-indigo-900">
            {chapters.length === 0 ? <p className="text-sm text-slate-600 dark:text-slate-300">No chapter ratings found yet. Rate your chapters first, then rebuild the roadmap to get a personalised subject-wise plan.</p> : chapters.map((chapter:any)=>{const key=revisionProgressKey(round.key,chapter.subject,chapter.chapter);return <article key={key} className={'rounded-lg border p-3 '+(chapter.completed?'border-emerald-300 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20':'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950')}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={!!chapter.completed} disabled={revisionProgressBusy===key} onChange={()=>void toggleRevisionChapter(round,chapter)} aria-label={'Mark '+chapter.chapter+' '+(chapter.completed?'incomplete':'complete')} className="mt-1 h-4 w-4 accent-indigo-600 disabled:opacity-50" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">{chapter.subject}</p><h5 className={'mt-1 text-sm font-extrabold '+(chapter.completed?'text-emerald-800 line-through dark:text-emerald-300':'text-slate-900 dark:text-white')}>{chapter.chapter}</h5></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{chapter.strength}</span></div>
                  <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-2"><p><strong>When:</strong> {chapter.start_date} – {chapter.end_date} {chapter.rescheduled && !chapter.completed ? <span className="font-semibold text-indigo-600 dark:text-indigo-300">(updated)</span> : null}</p><p><strong>Estimated study time:</strong> {chapter.estimated_hours} hours</p></div>
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-200"><strong>How to study:</strong> {chapter.method}</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">{(chapter.steps || []).map((step:string,stepIndex:number)=><li key={stepIndex}>{step}</li>)}</ol>
                </div>
              </div>
            </article>})}
          </div>}
        </div>})}</div>
        {roadmapMessage && <p role="status" className="mt-3 text-sm text-slate-600 dark:text-slate-300">{roadmapMessage}</p>}
      </div>}
      </section>

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 sm:p-5">
        <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Choose your planning workflow</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">No evaluation or mock marks are required. Start with chapter strengths, or optionally add performance data.</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => setPlannerWorkflow('strength')} aria-pressed={plannerWorkflow === 'strength'} className={'rounded-xl border p-3 text-left transition ' + (plannerWorkflow === 'strength' ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:border-indigo-500 dark:bg-indigo-950/50' : 'border-slate-200 dark:border-slate-800')}>
            <span className="block text-sm font-extrabold text-slate-900 dark:text-white">1. Chapter strength only</span>
            <span className="mt-1 block text-xs text-slate-600 dark:text-slate-300">Default · Weak / Moderate / Strong</span>
          </button>
          <button type="button" onClick={() => setPlannerWorkflow('performance')} aria-pressed={plannerWorkflow === 'performance'} className={'rounded-xl border p-3 text-left transition ' + (plannerWorkflow === 'performance' ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500 dark:border-amber-500 dark:bg-amber-950/30' : 'border-slate-200 dark:border-slate-800')}>
            <span className="block text-sm font-extrabold text-slate-900 dark:text-white">2. Add mock performance</span>
            <span className="mt-1 block text-xs text-slate-600 dark:text-slate-300">Optional · Refine priorities with marks</span>
          </button>
        </div>
      </section>
      <section className="mb-4 rounded-2xl border border-indigo-200 bg-white p-4 dark:border-indigo-900 dark:bg-slate-950 sm:p-5">
        <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"><CalendarClock className="h-5 w-5" /></div><div className="min-w-0 flex-1"><h2 className="font-extrabold text-slate-900 dark:text-white">Build My {courseLabel} Exam Roadmap</h2><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Plan from today till your exact exam date. Revision rounds and chapter priorities should guide the weekly timetable; mock marks are optional.</p></div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Daily study hours</span><input type="number" min="1" max="12" step="0.25" value={dailyMinutes} onChange={(e) => setDailyMinutes(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /><span className="mt-1 block text-[11px] text-slate-500">{(Number(dailyMinutes) || 0)} hours/day</span></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Plan starts on</span><input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Study start time</span><input type="time" value={studyStartTime} onChange={(e) => setStudyStartTime(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Preferred end time</span><input type="time" value={preferredEndTime} onChange={(e) => setPreferredEndTime(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">CA exam attempt</span><select value={examAttempt} onChange={(e) => setExamAttempt(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"><option>January 2027</option><option>May 2027</option><option>September 2027</option><option>January 2028</option><option>May 2028</option><option>September 2028</option></select></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Exact exam date (required for adaptive revision rounds)</span><input type="date" value={exactExamDate} min={dailyDate} onChange={(e) => setExactExamDate(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
          <div className="sm:col-span-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <p className="text-sm font-bold text-slate-900 dark:text-white">Coaching / class schedule</p>
            <p className="mt-1 text-xs text-slate-500">Classes nahi hain toh No classes select karo. Fixed weekly timing ya flexible coaching hours bhi choose kar sakte ho.</p>
            <select value={classMode} onChange={(e) => setClassMode(e.target.value as 'none' | 'fixed' | 'flexible')} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
              <option value="none">No classes</option><option value="fixed">Fixed weekly class timings</option><option value="flexible">Flexible coaching hours (not fixed)</option>
            </select>
            {classMode === 'fixed' && <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold">Day<select value={classDay} onChange={(e) => setClassDay(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"><option value="0">Sunday</option><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option></select></label>
                <label className="text-xs font-semibold">Class label<input value="Coaching class" readOnly className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-100 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
                <label className="text-xs font-semibold">Starts<input type="time" value={classStart} onChange={(e) => setClassStart(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                <label className="text-xs font-semibold">Ends<input type="time" value={classEnd} onChange={(e) => setClassEnd(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
              </div>
              <button type="button" onClick={() => { if (classEnd <= classStart) { setDailyPlanState('Class end time must be later than start time.'); return; } setClassBlocks((items) => [...items, { day_of_week: Number(classDay), start_time: classStart, end_time: classEnd, label: 'Coaching class' }]); }} className="rounded-lg border border-indigo-300 px-3 py-2 text-xs font-bold text-indigo-700 dark:border-indigo-700 dark:text-indigo-300">Add weekly class</button>
              {classBlocks.map((block, index) => <div key={index} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800"><span>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][block.day_of_week]} · {block.start_time}–{block.end_time}</span><button type="button" onClick={() => setClassBlocks((items) => items.filter((_, i) => i !== index))} className="font-bold text-rose-600">Remove</button></div>)}
              <p className="text-xs text-slate-500">Add every recurring class block. Those times will be skipped while scheduling study sessions.</p>
            </div>}
            {classMode === 'flexible' && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Flexible timing selected. The planner won't assume a fixed weekly class time; choose a study window that avoids your class hours. Date-specific class overrides will be added in a later iteration.</p>}
          </div>
          <div className="sm:col-span-2"><button type="button" disabled={dailyPlanBusy} onClick={generateDailyPlan} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><Sparkles className="h-4 w-4" />{dailyPlanBusy ? 'Building timetable…' : 'Generate weekly timetable'}</button></div>
        </div>
        {dailyPlanState && <p role="status" className="mt-3 text-xs text-slate-600 dark:text-slate-300">{dailyPlanState}</p>}
        {dailyPlan && <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"><div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-3 dark:bg-slate-900"><div><h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{dailyPlan.title}</h3><p className="text-xs text-slate-500">{dailyPlan.date} to {dailyPlan.end_date} · {dailyPlan.daily_minutes} study minutes/day · {dailyPlan.attempt}</p></div><button type="button" disabled={dailyPlanBusy || !dailyPlan.sessions.length} onClick={() => void saveDailyPlan()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />{dailyPlanBusy ? 'Saving…' : 'Save timetable'}</button></div><ol className="divide-y divide-slate-100 dark:divide-slate-800">{dailyPlan.sessions.map((session: any) => <li key={session.date + '-' + session.order} className="flex gap-3 px-3 py-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-xs font-extrabold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">{session.order}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-slate-900 dark:text-white">{session.label}</p><span className="text-xs font-bold text-slate-500">{session.date} · {session.start_time}–{session.end_time} · {session.minutes} min</span></div><p className="mt-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{session.subject} · {session.chapter}</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{session.instruction}</p></div></li>)}</ol><p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-800">Take a 5–10 minute break between focused blocks. Breaks are not counted as study time.</p></div>}
      </section>

            {plannerWorkflow === 'strength' ? (
              <section id="planner-chapter-strength" className="mb-4 scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"><BookOpen className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-extrabold text-slate-900 dark:text-white">Chapter strength assessment</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Choose a subject and a topic from the curriculum, then rate your confidence. Each rating is saved to your account.</p>
                  </div>
                </div>
                {curriculumSubjects.length === 0 ? (
                  <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Loading curriculum topics… If this continues, refresh the page and try again.</p>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">{courseLabel} subject</span>
                        <select value={selectedStrengthSubject} onChange={(e) => {
                          const subject = curriculumSubjects.find((item) => item.name === e.target.value);
                          setSelectedStrengthSubject(e.target.value);
                          setSelectedStrengthChapter(subject?.chapters[0] || '');
                          setSelectedStrength(subject?.chapters[0] ? (strengths[e.target.value + '::' + subject.chapters[0]] || 'MODERATE') : 'MODERATE');
                        }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                          {curriculumSubjects.map((subject) => <option key={subject.key} value={subject.name}>Paper {subject.paperNumber}: {subject.name}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Chapter / topic</span>
                        <select value={selectedStrengthChapter} onChange={(e) => {
                          setSelectedStrengthChapter(e.target.value);
                          setSelectedStrength(strengths[selectedStrengthSubject + '::' + e.target.value] || 'MODERATE');
                        }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                          {(curriculumSubjects.find((item) => item.name === selectedStrengthSubject)?.chapters || []).map((chapter) => <option key={chapter} value={chapter}>{chapter}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="mt-3">
                      <span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Your confidence</span>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'WEAK', label: 'Weak', description: 'Needs focus' },
                          { value: 'MODERATE', label: 'Moderate', description: 'Needs revision' },
                          { value: 'STRONG', label: 'Strong', description: 'Mostly confident' },
                        ].map((option) => (
                          <button key={option.value} type="button" onClick={() => setSelectedStrength(option.value)} aria-pressed={selectedStrength === option.value} className={'rounded-xl border px-3 py-3 text-left transition ' + (selectedStrength === option.value ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:border-indigo-500 dark:bg-indigo-950/50' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900')}>
                            <span className="block text-sm font-extrabold text-slate-900 dark:text-white">{option.label}</span>
                            <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">{option.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button type="button" disabled={strengthBusy || !selectedStrengthSubject || !selectedStrengthChapter} onClick={async () => {
                        setStrengthBusy(true); setStrengthSaveState('');
                        try {
                          await apiRequest('/api/student/study-planner/strengths', { method: 'PUT', body: JSON.stringify({ course: studentCourse, subject: selectedStrengthSubject, chapter: selectedStrengthChapter, strength: selectedStrength }) });
                          const key = selectedStrengthSubject + '::' + selectedStrengthChapter;
                          setStrengths((current) => ({ ...current, [key]: selectedStrength }));
                          const updatedPriorities = await apiRequest<{ priorities: Array<{ subject: string; chapter: string; strength: string; mock_percentage: number | null; priority_score: number; priority: string; rationale: string }> }>('/api/student/study-planner/priorities?course=' + encodeURIComponent(studentCourse));
                          setPriorities(updatedPriorities.priorities || []);
                          setStrengthSaveState('Saved: ' + selectedStrengthChapter + ' · ' + selectedStrength.toLowerCase() + '. Priorities refreshed.');
                        } catch (err: any) { setStrengthSaveState(err?.message || 'Could not save this chapter rating.'); }
                        finally { setStrengthBusy(false); }
                      }} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />{strengthBusy ? 'Saving…' : 'Save chapter rating'}</button>
                      {strengthSaveState && <p role="status" className="text-xs text-slate-500">{strengthSaveState}</p>}
                    </div>
                  </>
                )}
                <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Saved chapter ratings</h3>
                    <span className="text-xs text-slate-500">{Object.keys(strengths).length} rated</span>
                  </div>
                  {Object.keys(strengths).length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Your saved chapter ratings will appear here.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(strengths).map(([key, value]) => {
                        const [subject, chapter] = key.split('::');
                        return <button key={key} type="button" onClick={() => {
                          setSelectedStrengthSubject(subject);
                          setSelectedStrengthChapter(chapter);
                          setSelectedStrength(value);
                        }} className="rounded-lg border border-slate-200 px-3 py-2 text-left dark:border-slate-800">
                          <span className="block max-w-[240px] truncate text-xs font-bold text-slate-800 dark:text-slate-100">{chapter}</span>
                          <span className="mt-1 block text-[10px] text-slate-500">{subject} · {String(value).toLowerCase()}</span>
                        </button>;
                      })}
                    </div>
                  )}
                </div>
              </section>
        
      ) : (
              <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><CalendarClock className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-extrabold text-slate-900 dark:text-white">Adaptive chapter priorities</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Optional: enter a mock-test result to refine your chapter ranking. You can use the planner without marks; chapter ratings alone are enough.</p>
                  </div>
                </div>
                <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={async (event) => {
                  event.preventDefault(); setMockBusy(true); setMockSaveState('');
                  try {
                    await apiRequest('/api/student/study-planner/mock-results', { method: 'POST', body: JSON.stringify({ course: studentCourse, subject: mockSubject, score: Number(mockScore), max_score: Number(mockMaxScore), source: 'MOCK_TEST' }) });
                    const result = await apiRequest<{ priorities: Array<{ subject: string; chapter: string; strength: string; mock_percentage: number | null; priority_score: number; priority: string; rationale: string }> }>('/api/student/study-planner/priorities?course=' + encodeURIComponent(studentCourse));
                    setPriorities(result.priorities || []);
                    setMockSaveState('Mock result saved. Chapter priorities updated.');
                    setMockScore('');
                  } catch (err: any) { setMockSaveState(err?.message || 'Could not save the mock result.'); }
                  finally { setMockBusy(false); }
                }}>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Subject</span>
                    <select value={mockSubject} onChange={(e) => setMockSubject(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                      {curriculumSubjects.map((subject) => <option key={subject.key} value={subject.name}>{subject.name}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Marks scored</span><input required min="0" step="0.5" type="number" value={mockScore} onChange={(e) => setMockScore(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="35" /></label>
                    <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Out of</span><input required min="1" step="0.5" type="number" value={mockMaxScore} onChange={(e) => setMockMaxScore(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="100" /></label>
                  </div>
                  <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                    <button type="submit" disabled={mockBusy || mockScore === '' || mockMaxScore === ''} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />{mockBusy ? 'Saving…' : 'Save mock result & update priorities'}</button>
                    {mockSaveState && <p role="status" className="text-xs text-slate-500">{mockSaveState}</p>}
                  </div>
                </form>
                <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Your chapter priorities</h3><span className="text-[10px] text-slate-500">60% self-rating · 40% mock score risk</span></div>
                  {priorities.length === 0 ? <p className="text-xs text-slate-500 dark:text-slate-400">Rate chapters in the Chapter Strength workflow to generate priorities. Mock marks only refine that ranking.</p> : (
                    <div className="space-y-2">
                      {priorities.slice(0, 8).map((item, index) => (
                        <div key={item.subject + '::' + item.chapter} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-xs font-extrabold text-amber-800 dark:bg-amber-950 dark:text-amber-200">{index + 1}</div>
                          <div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-900 dark:text-white">{item.chapter}</p><p className="mt-0.5 text-xs text-slate-500">{item.subject} · {item.strength.toLowerCase()}{item.mock_percentage !== null ? ' · latest mock ' + item.mock_percentage + '%' : ' · no mock result yet'}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{item.rationale}</p></div>
                          <span className={'shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold ' + (item.priority === 'HIGH' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-200' : item.priority === 'MEDIUM' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200')}>{item.priority}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
        
      )}
      </>
      ) : (
        <div className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 text-sm leading-6 text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-100">
          <p className="font-extrabold">{courseLabel} study chat is ready.</p>
          <p className="mt-1">Ask study-related questions or request a one-day or next-7-day plan in chat. Chapter-by-chapter adaptive roadmap tools are available for CA Foundation and CA Intermediate.</p>
        </div>
      )}
      <section className="mb-4 rounded-2xl border border-emerald-200 bg-white p-4 dark:border-emerald-900 dark:bg-slate-950 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-slate-900 dark:text-white">My saved plans & study progress</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Saved plans stay linked to your account. Log a session after studying, or mark the whole plan complete.</p>
          </div>
          <button type="button" onClick={() => void refreshSavedPlans().catch((err: any) => setProgressMessage(err?.message || 'Could not refresh progress.'))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">Refresh</button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs text-slate-500">Saved plans</p><p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{savedPlans.length}</p></div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs text-slate-500">Minutes logged</p><p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{progressLogs.reduce((sum, item) => sum + Number(item.duration_minutes || 0), 0)}</p></div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs text-slate-500">Plans completed</p><p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{savedPlans.filter((plan) => String(plan.status).toUpperCase() === 'COMPLETED').length}</p></div>
        </div>
        {progressMessage && <p role="status" className="mt-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300">{progressMessage}</p>}
        {savedPlans.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">No saved plans yet. Generate a daily timetable above and choose Save timetable.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {savedPlans.map((saved) => {
              const planId = String(saved.id);
              const plan = saved.plan && typeof saved.plan === 'object' ? saved.plan : {};
              const sessions = Array.isArray(plan.sessions) ? plan.sessions : [];
              const completed = String(saved.status).toUpperCase() === 'COMPLETED';
              return <div key={planId} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0"><p className="text-sm font-extrabold text-slate-900 dark:text-white">{saved.title || plan.title || 'Study plan'}</p><p className="mt-1 text-xs text-slate-500">{Number(plan.total_minutes || 0)} study minutes · {saved.created_at ? new Date(saved.created_at).toLocaleDateString() : 'Saved plan'}</p></div>
                  <span className={'rounded-full px-2.5 py-1 text-[10px] font-extrabold ' + (completed ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300')}>{completed ? 'COMPLETED' : 'ACTIVE'}</span>
                </div>
                {sessions.length > 0 && <div className="mt-3 space-y-2">{sessions.map((session: any, index: number) => {
                  const sessionKey = planId + ':' + String(session.order ?? session.label ?? index);
                  const logged = progressLogs.some((entry) => String(entry.plan_id) === planId && String(entry.subject) === String(session.subject || '') && String(entry.activity) === String(session.activity || session.label || 'Study session') && Number(entry.duration_minutes) === Number(session.minutes));
                  return <div key={sessionKey} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
                    <div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-800 dark:text-slate-100">{session.label || session.activity || 'Study session'} · {session.minutes} min</p><p className="mt-0.5 text-[11px] text-slate-500">{session.subject}{session.chapter ? ' · ' + session.chapter : ''}</p></div>
                    <button type="button" disabled={completed || logged || Boolean(progressBusyKey)} onClick={() => void logStudySession(planId, session, typeof plan.date === 'string' ? plan.date : undefined)} className="rounded-lg border border-emerald-300 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 disabled:opacity-50 dark:border-emerald-900 dark:text-emerald-300">{logged ? 'Logged' : progressBusyKey === sessionKey ? 'Logging…' : 'Log session'}</button>
                  </div>;
                })}</div>}
                {!completed && <button type="button" disabled={Boolean(progressBusyKey)} onClick={() => void completeSavedPlan(planId)} className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{progressBusyKey === 'complete:' + planId ? 'Updating…' : 'Mark plan complete'}</button>}
              </div>;
            })}
          </div>
        )}
      </section>

      <section className="mb-5 overflow-hidden rounded-3xl border border-indigo-200 bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950 p-5 text-white shadow-lg sm:p-7 lg:p-9">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-300/30 bg-white/10 px-3 py-1.5 text-xs font-bold text-indigo-100"><Sparkles className="h-4 w-4" /> YOUR PERSONAL STUDY SYSTEM</div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl lg:text-4xl">Your exam. Your strategy.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">Build an exam-date roadmap, adapt revision around weak chapters, and turn your available hours into a practical timetable. No generic chat screen.</p>
          </div>
          <div className="w-full rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur sm:p-5 lg:max-w-xs">
            <label className="block text-xs font-bold uppercase tracking-wide text-indigo-100">Your CA course</label>
            <select value={studentCourse} onChange={(e) => setStudentCourse(e.target.value as 'CA_FOUNDATION' | 'CA_INTERMEDIATE')} className="mt-2 w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-3 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-indigo-300">
              <option value="CA_FOUNDATION">CA Foundation</option>
              <option value="CA_INTERMEDIATE">CA Intermediate</option>
            </select>
            <p className="mt-2 text-xs leading-5 text-slate-300">Curriculum and planner actions follow your selected course.</p>
          </div>
        </div>
      </section>

      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <button type="button" onClick={() => { document.getElementById('planner-roadmap')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-800 dark:bg-slate-950 sm:p-5">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"><CalendarClock className="h-5 w-5" /></span>
          <span className="block text-base font-extrabold text-slate-900 dark:text-white">Exam roadmap</span><span className="mt-1 block text-sm leading-5 text-slate-500 dark:text-slate-400">Plan syllabus completion and revision rounds up to your exam.</span>
        </button>
        <button type="button" onClick={() => { document.getElementById('planner-chapter-strength')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-800 dark:bg-slate-950 sm:p-5">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><BookOpen className="h-5 w-5" /></span>
          <span className="block text-base font-extrabold text-slate-900 dark:text-white">Rate your chapters</span><span className="mt-1 block text-sm leading-5 text-slate-500 dark:text-slate-400">Mark topics weak, moderate or strong to personalise revision.</span>
        </button>
        <button type="button" onClick={() => { document.getElementById('planner-daily-timetable')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-800 dark:bg-slate-950 sm:p-5">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Clock3 className="h-5 w-5" /></span>
          <span className="block text-base font-extrabold text-slate-900 dark:text-white">Daily timetable</span><span className="mt-1 block text-sm leading-5 text-slate-500 dark:text-slate-400">Arrange study blocks around available hours and class timings.</span>
        </button>
      </section>

      <section id="planner-daily-timetable" className="mb-5 scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Your planner workspace</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Set your dates and study capacity below, then generate a structured plan.</p></div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> {courseLabel} selected</span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Plan start date<input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
          <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Daily study hours<input type="number" min="1" max="12" step="0.25" value={dailyMinutes} onChange={(e) => setDailyMinutes(e.target.value)} className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
          <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Study starts<input type="time" value={studyStartTime} onChange={(e) => setStudyStartTime(e.target.value)} className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
          <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Preferred finish<input type="time" value={preferredEndTime} onChange={(e) => setPreferredEndTime(e.target.value)} className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button type="button" disabled={dailyPlanBusy} onClick={() => void generateDailyPlan()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"><CalendarClock className="h-4 w-4" />{dailyPlanBusy ? 'Building timetable…' : 'Generate daily timetable'}</button>
          <button type="button" disabled={roadmapBusy} onClick={() => void generateAttemptRoadmap()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-3 text-sm font-extrabold text-indigo-800 transition hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200"><Sparkles className="h-4 w-4" />{roadmapBusy ? 'Building roadmap…' : 'Generate exam roadmap'}</button>
        </div>
        {(dailyPlanState || roadmapMessage) && <p role="status" className="mt-3 text-sm text-slate-600 dark:text-slate-300">{dailyPlanState || roadmapMessage}</p>}
      </section>
    </div>
  );
};
