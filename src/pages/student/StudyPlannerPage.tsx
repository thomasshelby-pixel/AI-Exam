import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, CalendarClock, CheckCircle2, Clock3, Send, Sparkles, UserRound, BookmarkCheck, BookOpen, Save } from 'lucide-react';
import { apiRequest } from '../../api/client.js';

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

export const StudyPlannerPage: React.FC = () => {
  const navigate = useNavigate();
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
  const [dailyMinutes, setDailyMinutes] = useState('240');
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().slice(0, 10));
  const [studyStartTime, setStudyStartTime] = useState('06:00');
  const [preferredEndTime, setPreferredEndTime] = useState('22:00');
  const [examAttempt, setExamAttempt] = useState('May 2027');
  const [exactExamDate, setExactExamDate] = useState('');
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
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 1,
    role: 'assistant',
    text: 'Hi! I’m your CA Intermediate study planner. Tell me what you need to study and how much time you have. I’ll help break it into concept revision, question practice and active recall.',
  }]);
  const nextId = useRef(2);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiRequest<{ success: boolean; subjects: Array<{ key: string; name: string; paperNumber: number; group: string | null; chapters: string[] }> }>('/api/student/study-planner/curriculum?course=CA_INTERMEDIATE'),
      apiRequest<{ success: boolean; strengths: Array<{ subject: string; chapter: string; strength: string }>; plans?: Array<any>; progress?: Array<any> }>('/api/student/study-planner/profile?course=CA_INTERMEDIATE'),
      apiRequest<{ success: boolean; priorities: Array<{ subject: string; chapter: string; strength: string; mock_percentage: number | null; priority_score: number; priority: string; rationale: string }> }>('/api/student/study-planner/priorities?course=CA_INTERMEDIATE'),
    ]).then(([curriculum, profile, priorityData]) => {
      if (cancelled) return;
      const options = curriculum.subjects || [];
      setCurriculumSubjects(options);
      if (options.length) {
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
    }).catch(() => { /* Keep chat usable if profile or curriculum is temporarily unavailable. */ });


  return () => { cancelled = true; };
  }, []);

  const refreshSavedPlans = async () => {
    const profile = await apiRequest<{ plans?: Array<any>; progress?: Array<any> }>('/api/student/study-planner/profile?course=CA_INTERMEDIATE');
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
          course: 'CA_INTERMEDIATE',
          plan_id: planId,
          subject: String(session.subject || 'CA Intermediate'),
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

  const generateDailyPlan = async () => {
    const minutes = Number(dailyMinutes);
    if (!Number.isInteger(minutes) || minutes < 60 || minutes > 720 || minutes % 15 !== 0) {
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
            course: 'CA_INTERMEDIATE',
            start_date: dailyDate,
            daily_study_hours: minutes / 60,
            study_start_time: studyStartTime,
            preferred_end_time: preferredEndTime,
            attempt: examAttempt,
            exact_exam_date: exactExamDate || null,
          }),
        },
      );
      const schedule = response.plan;
      setDailyPlan({
        title: '7-day study timetable · ' + schedule.attempt,
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
      await apiRequest<{ success: boolean; priorities: Array<{ subject: string; chapter: string; strength: string; mock_percentage: number | null; priority_score: number; priority: string; rationale: string }> }>('/api/student/study-planner/priorities?course=CA_INTERMEDIATE')
        .then((data) => setPriorities(data.priorities || []))
        .catch(() => undefined);
    } catch (err: any) {
      setDailyPlanState(err?.message || 'Could not generate the daily timetable.');
    } finally {
      setDailyPlanBusy(false);
    }
  };
  const saveDailyPlan = async () => { if (!dailyPlan || !dailyPlan.sessions?.length) return; setDailyPlanBusy(true); setDailyPlanState(''); try { const plan = { title: dailyPlan.title + ' · ' + dailyPlan.date, total_minutes: dailyPlan.total_minutes, date: dailyPlan.date, sessions: dailyPlan.sessions, note: 'Generated from saved chapter priorities. Breaks are not included in study minutes.' }; await apiRequest('/api/student/study-planner/plans', { method: 'POST', body: JSON.stringify({ course: 'CA_INTERMEDIATE', plan }) }); setDailyPlanState('Saved to your study planner.'); await refreshSavedPlans(); } catch (err: any) { setDailyPlanState(err?.message || 'Could not save this plan.'); } finally { setDailyPlanBusy(false); } };

  const sendRequest = async (rawText?: string) => {
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
        body: JSON.stringify({ message: text, course: 'CA_INTERMEDIATE' }),
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

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-4xl flex-col px-3 py-4 sm:px-6 sm:py-6">
      <button
        type="button"
        onClick={() => navigate('/student/dashboard')}
        className="mb-4 inline-flex w-fit items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </button>


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
        <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"><CalendarClock className="h-5 w-5" /></div><div className="min-w-0 flex-1"><h2 className="font-extrabold text-slate-900 dark:text-white">Build your 7-day timetable</h2><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Distributes rated chapters across the week, with exact session times and your selected CA attempt. Mock marks remain optional.</p></div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Daily study hours (minutes)</span><input type="number" min="60" max="720" step="15" value={dailyMinutes} onChange={(e) => setDailyMinutes(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /><span className="mt-1 block text-[11px] text-slate-500">{(Number(dailyMinutes) / 60 || 0)} hours/day</span></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Plan starts on</span><input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Study start time</span><input type="time" value={studyStartTime} onChange={(e) => setStudyStartTime(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Preferred end time</span><input type="time" value={preferredEndTime} onChange={(e) => setPreferredEndTime(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">CA Inter attempt</span><select value={examAttempt} onChange={(e) => setExamAttempt(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"><option>January 2027</option><option>May 2027</option><option>September 2027</option><option>January 2028</option><option>May 2028</option><option>September 2028</option></select></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Exact exam date (optional)</span><input type="date" value={exactExamDate} min={dailyDate} onChange={(e) => setExactExamDate(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
          <div className="sm:col-span-2"><button type="button" disabled={dailyPlanBusy} onClick={generateDailyPlan} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><Sparkles className="h-4 w-4" />{dailyPlanBusy ? 'Building timetable…' : 'Generate 7-day timetable'}</button></div>
        </div>
        {dailyPlanState && <p role="status" className="mt-3 text-xs text-slate-600 dark:text-slate-300">{dailyPlanState}</p>}
        {dailyPlan && <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"><div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-3 dark:bg-slate-900"><div><h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{dailyPlan.title}</h3><p className="text-xs text-slate-500">{dailyPlan.date} to {dailyPlan.end_date} · {dailyPlan.daily_minutes} study minutes/day · {dailyPlan.attempt}</p></div><button type="button" disabled={dailyPlanBusy || !dailyPlan.sessions.length} onClick={() => void saveDailyPlan()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />{dailyPlanBusy ? 'Saving…' : 'Save timetable'}</button></div><ol className="divide-y divide-slate-100 dark:divide-slate-800">{dailyPlan.sessions.map((session: any) => <li key={session.date + '-' + session.order} className="flex gap-3 px-3 py-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-xs font-extrabold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">{session.order}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-slate-900 dark:text-white">{session.label}</p><span className="text-xs font-bold text-slate-500">{session.date} · {session.start_time}–{session.end_time} · {session.minutes} min</span></div><p className="mt-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{session.subject} · {session.chapter}</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{session.instruction}</p></div></li>)}</ol><p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-800">Take a 5–10 minute break between focused blocks. Breaks are not counted as study time.</p></div>}
      </section>

            {plannerWorkflow === 'strength' ? (
              <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 sm:p-5">
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
                        <span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">CA Intermediate subject</span>
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
                          await apiRequest('/api/student/study-planner/strengths', { method: 'PUT', body: JSON.stringify({ course: 'CA_INTERMEDIATE', subject: selectedStrengthSubject, chapter: selectedStrengthChapter, strength: selectedStrength }) });
                          const key = selectedStrengthSubject + '::' + selectedStrengthChapter;
                          setStrengths((current) => ({ ...current, [key]: selectedStrength }));
                          const updatedPriorities = await apiRequest<{ priorities: Array<{ subject: string; chapter: string; strength: string; mock_percentage: number | null; priority_score: number; priority: string; rationale: string }> }>('/api/student/study-planner/priorities?course=CA_INTERMEDIATE');
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
                    await apiRequest('/api/student/study-planner/mock-results', { method: 'POST', body: JSON.stringify({ course: 'CA_INTERMEDIATE', subject: mockSubject, score: Number(mockScore), max_score: Number(mockMaxScore), source: 'MOCK_TEST' }) });
                    const result = await apiRequest<{ priorities: Array<{ subject: string; chapter: string; strength: string; mock_percentage: number | null; priority_score: number; priority: string; rationale: string }> }>('/api/student/study-planner/priorities?course=CA_INTERMEDIATE');
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

      <section className="flex min-h-[68vh] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-gradient-to-r from-indigo-950 via-slate-900 to-blue-950 px-4 py-4 text-white sm:px-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
            <Sparkles className="h-5 w-5 text-indigo-200" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-extrabold sm:text-lg">AI Study Planner</h1>
            <p className="mt-0.5 text-xs text-slate-300">CA Intermediate · Study planning assistant</p>
          </div>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-200">Beta</span>
        </header>

        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
          <CalendarClock className="h-4 w-4 text-indigo-500" />
          Your plan is drafted from your request; it is not saved to your calendar yet.
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-3 py-5 sm:px-6">
          {messages.map((message) => (
            <div key={message.id} className={'flex items-start gap-2.5 ' + (message.role === 'user' ? 'flex-row-reverse' : '')}>
              <div className={'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ' + (message.role === 'assistant' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200')}>
                {message.role === 'assistant' ? <Bot className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
              </div>
              <div className={'min-w-0 max-w-[92%] sm:max-w-[86%] ' + (message.role === 'user' ? 'text-right' : '')}>
                <div className={'inline-block rounded-2xl px-4 py-3 text-left text-sm leading-6 ' + (message.role === 'assistant' ? 'rounded-tl-md bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-100' : 'rounded-tr-md bg-indigo-600 text-white')}>
                  {message.text}
                </div>
                {message.result?.parsed && (
                  <div className="mt-3 space-y-3 text-left">
                    {message.result.parsed.missing_info.length > 0 && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                        <p className="mb-1 font-bold">Tell me a little more</p>
                        <ul className="list-inside list-disc space-y-0.5">
                          {message.result.parsed.missing_info.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </div>
                    )}
                    {message.result.plan && (
                      <div className="overflow-hidden rounded-2xl border border-indigo-200 bg-white dark:border-indigo-900 dark:bg-slate-950">
                        <div className="flex items-center gap-3 bg-indigo-50 px-4 py-3 dark:bg-indigo-950/50">
                          <CheckCircle2 className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />
                          <div className="min-w-0 flex-1">
                            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">{message.result.plan.title}</h2>
                            <p className="text-xs text-slate-600 dark:text-slate-300">{message.result.plan.subjects.join(' · ')}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-indigo-700 dark:bg-slate-900 dark:text-indigo-200">{message.result.plan.total_minutes} min</span>
                        </div>
                        <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                          {message.result.plan.sessions.map((session) => (
                            <li key={session.order} className="flex gap-3 px-4 py-3">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-xs font-extrabold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">{session.order}</div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-bold text-slate-900 dark:text-white">{session.label}</p>
                                  <span className="text-xs font-bold text-slate-500">{session.minutes} min</span>
                                </div>
                                <p className="mt-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{session.subject}</p>
                                <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">{session.instruction}</p>
                              </div>
                            </li>
                          ))}
                        </ol>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                          <p className="min-w-0 flex-1 text-xs text-slate-500 dark:text-slate-400">{message.result.plan.note}</p>
                          <button type="button" disabled={savingPlanId === message.id || savedPlanIds.includes(message.id)} onClick={async () => {
                            setSavingPlanId(message.id); setError('');
                            try {
                              await apiRequest('/api/student/study-planner/plans', { method: 'POST', body: JSON.stringify({ course: 'CA_INTERMEDIATE', plan: message.result?.plan }) });
                              setSavedPlanIds((ids) => [...ids, message.id]); await refreshSavedPlans();
                            } catch (err: any) { setError(err?.message || 'Could not save this plan.'); }
                            finally { setSavingPlanId(null); }
                          }} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                            <BookmarkCheck className="h-4 w-4" />{savedPlanIds.includes(message.id) ? 'Saved' : savingPlanId === message.id ? 'Saving…' : 'Save plan'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"><Bot className="h-4 w-4" /></div>
              <div className="rounded-2xl rounded-tl-md bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300"><Clock3 className="mr-2 inline h-4 w-4 animate-spin" />Thinking through your study plan…</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {messages.length === 1 && (
          <div className="border-t border-slate-100 px-3 py-3 dark:border-slate-800 sm:px-5">
            <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Try asking</p>
            <div className="flex flex-wrap gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <button key={prompt} type="button" disabled={loading} onClick={() => void sendRequest(prompt)} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/50">{prompt}</button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={(event) => { event.preventDefault(); void sendRequest(); }} className="border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950 sm:p-4">
          {error && <p role="alert" className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
          <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-slate-50 p-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/15 dark:border-slate-700 dark:bg-slate-900">
            <textarea value={request} onChange={(event) => setRequest(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendRequest(); } }} rows={2} maxLength={1200} placeholder="Tell me what you want to study and how much time you have…" className="max-h-36 min-h-[48px] flex-1 resize-y bg-transparent px-2 py-2 text-sm leading-5 text-slate-900 outline-none placeholder:text-slate-400 dark:text-white" />
            <button type="submit" disabled={loading || !request.trim()} aria-label="Send message" className="mb-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" /></button>
          </div>
          <p className="mt-2 px-1 text-[10px] text-slate-500">Enter to send · Shift + Enter for a new line</p>
        </form>
      </section>
    </div>
  );
};
