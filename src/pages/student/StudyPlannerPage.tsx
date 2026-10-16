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
  const [strengthSaveState, setStrengthSaveState] = useState('');
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
            <h2 className="font-extrabold text-slate-900 dark:text-white">Chapter strength profile</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Mark how confident you feel in each CA Intermediate subject. These ratings are saved to your account for future prioritisation.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {['Advanced Accounting','Corporate and Other Laws','Taxation','Cost and Management Accounting','Auditing and Ethics','Financial Management and Strategic Management'].map((subject) => (
            <label key={subject} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <span className="mb-2 block text-sm font-bold text-slate-800 dark:text-slate-100">{subject}</span>
              <select value={strengths[subject] || 'MODERATE'} onChange={(e) => setStrengths((current) => ({ ...current, [subject]: e.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                <option value="WEAK">Weak — need more practice</option>
                <option value="MODERATE">Moderate — improving</option>
                <option value="STRONG">Strong — confident</option>
              </select>
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" disabled={strengthBusy} onClick={async () => {
            setStrengthBusy(true); setStrengthSaveState('');
            try {
              for (const [subject, strength] of Object.entries(strengths)) {
                await apiRequest('/api/student/study-planner/strengths', { method: 'PUT', body: JSON.stringify({ course: 'CA_INTERMEDIATE', subject, chapter: '__SUBJECT_LEVEL__', strength }) });
              }
              setStrengthSaveState('Your subject strengths are saved.');
            } catch (err: any) { setStrengthSaveState(err?.message || 'Could not save strengths.'); }
            finally { setStrengthBusy(false); }
          }} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />{strengthBusy ? 'Saving…' : 'Save strengths'}</button>
          {strengthSaveState && <p role="status" className="text-xs text-slate-500">{strengthSaveState}</p>}
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
