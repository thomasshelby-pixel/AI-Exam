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
      apiRequest<{ success: boolean; strengths: Array<{ subject: string; chapter: string; strength: string }> }>('/api/student/study-planner/profile?course=CA_INTERMEDIATE'),
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
    }).catch(() => { /* Keep chat usable if profile or curriculum is temporarily unavailable. */ });
    return () => { cancelled = true; };
  }, []);

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
                  setStrengthSaveState('Saved: ' + selectedStrengthChapter + ' · ' + selectedStrength.toLowerCase() + '.');
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
      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><CalendarClock className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="font-extrabold text-slate-900 dark:text-white">Adaptive chapter priorities</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Save a mock-test result to combine it with your chapter confidence ratings. Higher scores below mean a higher revision priority.</p>
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
          {priorities.length === 0 ? <p className="text-xs text-slate-500 dark:text-slate-400">Rate some chapters above to start your priority list. Add a mock score to improve the ranking.</p> : (
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
                              setSavedPlanIds((ids) => [...ids, message.id]);
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
