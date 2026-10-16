import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  BookOpen,
  Sparkles,
  ListChecks,
} from 'lucide-react';
import { apiRequest } from '../../api/client.js';

type PlannerCourse = '' | 'CA_FOUNDATION' | 'CA_INTERMEDIATE' | 'CA_FINAL';

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
  metadata?: {
    version: string;
    modelUsed: boolean;
    persistentStorage: boolean;
  };
}

const EXAMPLES: Array<{ course: Exclude<PlannerCourse, '' | 'CA_FINAL'>; label: string; message: string }> = [
  {
    course: 'CA_FOUNDATION',
    label: 'Foundation · Accounting',
    message: 'Give me 60 minutes of Accounting revision tomorrow.',
  },
  {
    course: 'CA_INTERMEDIATE',
    label: 'Intermediate · Taxation',
    message: 'I have 90 minutes for Taxation revision today.',
  },
  {
    course: 'CA_INTERMEDIATE',
    label: 'Two subjects · 2 hours',
    message: 'Make a 2-hour study plan for Taxation and Advanced Accounting tomorrow.',
  },
];

function formatIntent(intent: string): string {
  return intent.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const StudyPlannerPage: React.FC = () => {
  const navigate = useNavigate();
  const [course, setCourse] = useState<PlannerCourse>('');
  const [request, setRequest] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PlannerResponse | null>(null);

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setResult(null);

    if (!course) {
      setError('Select CA Foundation or CA Intermediate first.');
      return;
    }
    if (!request.trim()) {
      setError('Describe your study goal and available time.');
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest<PlannerResponse>('/api/student/study-planner', {
        method: 'POST',
        body: JSON.stringify({ message: request.trim(), course }),
      });
      setResult(response);
    } catch (err: any) {
      setError(err?.message || 'Unable to prepare the study-plan draft. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const applyExample = (example: typeof EXAMPLES[number]) => {
    setCourse(example.course);
    setRequest(example.message);
    setResult(null);
    setError('');
  };

  const isClarification = result?.status === 'needs_clarification' || result?.status === 'unsupported_course';

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={() => navigate('/student/dashboard')}
        className="mb-5 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </button>

      <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-blue-950 px-6 py-7 text-white sm:px-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-indigo-100">
            <Sparkles className="h-3.5 w-3.5" />
            AI Study Planner · Beta
          </div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Plan your next study session</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Describe your CA course, subjects, and available time. The planner creates a structured draft for concept revision, question practice, and active recall.
          </p>
        </div>

        <div className="grid gap-7 p-5 sm:p-8 lg:grid-cols-[1.1fr_0.9fr]">
          <form onSubmit={submitRequest} className="space-y-5">
            <div>
              <label htmlFor="planner-course" className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
                CA level
              </label>
              <select
                id="planner-course"
                value={course}
                onChange={(event) => {
                  setCourse(event.target.value as PlannerCourse);
                  setResult(null);
                  setError('');
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="">Select your course</option>
                <option value="CA_FOUNDATION">CA Foundation</option>
                <option value="CA_INTERMEDIATE">CA Intermediate</option>
                <option value="CA_FINAL" disabled>CA Final · Not supported yet</option>
              </select>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Foundation and Intermediate are supported in this beta.
              </p>
            </div>

            <div>
              <label htmlFor="planner-request" className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
                What would you like to study?
              </label>
              <textarea
                id="planner-request"
                rows={5}
                maxLength={1200}
                value={request}
                onChange={(event) => {
                  setRequest(event.target.value);
                  setResult(null);
                  setError('');
                }}
                placeholder="Example: I have 2 hours for Taxation and Advanced Accounting tomorrow."
                className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Include subject(s), time, and date when known.</span>
                <span>{request.length}/1200</span>
              </div>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Clock3 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? 'Preparing your draft…' : 'Create draft study plan'}
            </button>
          </form>

          <aside className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                <BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                Try an example
              </div>
              <div className="space-y-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example.label}
                    type="button"
                    onClick={() => applyExample(example)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40"
                  >
                    {example.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <div className="mb-1 flex items-center gap-2 font-bold">
                <AlertCircle className="h-4 w-4" />
                Beta limitations
              </div>
              This first version creates draft study sessions only. It does not save plans, update class timetables, log progress, or calculate chapter rankings. CA Final is not supported yet.
            </div>
          </aside>
        </div>
      </section>

      {result && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
          <div className="flex items-start gap-3">
            <div className={'rounded-xl p-2 ' + (isClarification ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300')}>
              {isClarification ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                {result.plan ? result.plan.title : 'Request summary'}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{result.message}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Intent</div>
              <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{formatIntent(result.parsed.intent)}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Course</div>
              <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{result.parsed.course || 'Not identified'}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Subjects</div>
              <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{result.parsed.subjects.join(', ') || 'Not identified'}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Available time</div>
              <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                {result.parsed.duration_minutes ? result.parsed.duration_minutes + ' minutes' : 'Not specified'}
              </div>
            </div>
          </div>

          {result.parsed.missing_info.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-bold">Still needed</p>
              <ul className="mt-1 list-inside list-disc">
                {result.parsed.missing_info.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}

          {result.plan && (
            <div className="mt-6">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                <ListChecks className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                Draft schedule · {result.plan.total_minutes} minutes
              </div>
              <ol className="space-y-3">
                {result.plan.sessions.map((session) => (
                  <li key={session.order} className="flex gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      {session.order}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{session.label}</h3>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{session.minutes} min</span>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{session.subject}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{session.instruction}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
                {result.plan.note}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
