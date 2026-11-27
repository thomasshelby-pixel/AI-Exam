import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, ExternalLink, LoaderCircle, Send, Sparkles, UserRound } from 'lucide-react';
import { apiRequest } from '../../api/client.js';

interface ParakhSource {
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string | null;
}

interface ParakhResponse {
  success: boolean;
  status: string;
  message: string;
  sources?: ParakhSource[];
  metadata?: {
    version?: string;
    modelUsed?: boolean;
    modelName?: string | null;
    webResearchRequested?: boolean;
    webResearchAvailable?: boolean;
    searchProvider?: string | null;
  };
}

interface ChatMessage {
  id: number;
  role: 'assistant' | 'user';
  text: string;
  result?: ParakhResponse;
}

const STARTER_PROMPTS = [
  'Explain marginal costing with a simple CA exam-style example.',
  'How should I structure a 6-mark Company Law answer?',
  'Search the web for the latest ICAI examination announcement.',
];

export const StudyPlannerPage: React.FC = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 1,
    role: 'assistant',
    text: 'Hi! I’m PARAKH, your CA learning assistant. Ask me a CA concept, question, provision, calculation or answer-writing doubt. I can also search the web and share the sources used.',
  }]);
  const [request, setRequest] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [courseLabel, setCourseLabel] = useState('CA learning assistant');
  const nextId = useRef(2);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void apiRequest<{ success: boolean; label?: string }>('/api/student/study-planner/course')
      .then((data) => {
        if (active && data?.label) setCourseLabel(data.label);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  const sendRequest = async (rawText?: string) => {
    const text = (rawText ?? request).trim();
    if (!text || loading) return;

    const conversationHistory = messages
      .slice(-8)
      .map((item) => (item.role === 'user' ? 'Student: ' : 'PARAKH: ') + item.text)
      .slice(-8);

    setError('');
    setRequest('');
    setLoading(true);
    setMessages((current) => [...current, { id: nextId.current++, role: 'user', text }]);

    try {
      const response = await apiRequest<ParakhResponse>('/api/student/study-planner', {
        method: 'POST',
        body: JSON.stringify({
          message: text,
          conversation_history: conversationHistory,
          reply_language: 'hinglish',
        }),
      });

      if (!response?.success || !response.message) {
        throw new Error('PARAKH could not prepare an answer. Please try again.');
      }

      setMessages((current) => [...current, {
        id: nextId.current++,
        role: 'assistant',
        text: response.message,
        result: response,
      }]);
    } catch (sendError: any) {
      setError(sendError?.message || 'Could not connect to PARAKH. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-5xl flex-col px-3 py-4 sm:px-5 sm:py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{courseLabel}</span>
      </div>

      <section className="flex min-h-[70vh] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <header className="flex flex-col gap-3 bg-gradient-to-r from-slate-950 via-blue-950 to-indigo-900 px-4 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
              <Bot className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black tracking-tight">PARAKH</h1>
                <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-100">
                  CA Learning Assistant
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-blue-100/80">
                Understand concepts, solve doubts and improve your CA answer-writing.
              </p>
            </div>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-100">
            <Sparkles className="h-3.5 w-3.5" />
            Study guidance & web sources
          </span>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-3 dark:bg-slate-900/60 sm:p-5" role="log" aria-live="polite" aria-relevant="additions">
          {messages.map((message) => (
            <div key={message.id} className={'flex items-start gap-2.5 sm:gap-3 ' + (message.role === 'user' ? 'justify-end' : 'justify-start')}>
              {message.role === 'assistant' && (
                <span className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
                  <Bot className="h-4 w-4" />
                </span>
              )}
              <div className={'min-w-0 max-w-[92%] sm:max-w-[84%] ' + (message.role === 'user' ? 'text-right' : 'text-left')}>
                <p className={'mb-1 px-1 text-[11px] font-bold ' + (message.role === 'user' ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400')}>
                  {message.role === 'user' ? 'You' : 'PARAKH'}
                </p>
                <div className={'whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-left text-sm leading-6 ' + (message.role === 'user'
                  ? 'rounded-tr-md bg-indigo-600 text-white shadow-sm'
                  : 'rounded-tl-md border border-slate-200 bg-white text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100')}>
                  {message.text}
                </div>
                {message.role === 'assistant' && message.result?.metadata?.modelUsed && (
                  <p className="mt-1 px-1 text-[10px] text-slate-500 dark:text-slate-400">
                    Generated with {message.result.metadata.modelName || 'Gemini'}
                    {message.result.metadata.webResearchAvailable ? ' · Web sources used' : ''}
                  </p>
                )}
                {message.role === 'assistant' && (message.result?.sources?.length || 0) > 0 && (
                  <div className="mt-2 space-y-2 text-left">
                    <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Sources used
                    </p>
                    {message.result?.sources?.map((source, index) => (
                      <a
                        key={source.url + index}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-indigo-950/30"
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">[{index + 1}] {source.title}</span>
                          <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        </span>
                        {source.snippet && <span className="mt-1 block text-[11px] leading-5 text-slate-600 dark:text-slate-400">{source.snippet}</span>}
                        {source.publishedAt && <span className="mt-1 block text-[10px] text-slate-400">{source.publishedAt}</span>}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              {message.role === 'user' && (
                <span className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                  <UserRound className="h-4 w-4" />
                </span>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white">
                <Bot className="h-4 w-4" />
              </span>
              <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                <span className="inline-flex items-center gap-2 font-semibold">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  PARAKH is preparing your answer
                </span>
              </div>
            </div>
          )}

          {messages.length === 1 && (
            <div className="pl-10">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <Sparkles className="h-3.5 w-3.5" />
                Try asking PARAKH
              </p>
              <div className="flex flex-wrap gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={loading}
                    onClick={() => void sendRequest(prompt)}
                    className="rounded-full border border-indigo-200 bg-white px-3 py-2 text-left text-xs font-semibold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-900 dark:bg-slate-950 dark:text-indigo-200 dark:hover:bg-indigo-950"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="ml-10 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
              {error}
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(event) => { event.preventDefault(); void sendRequest(); }}
          className="border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950 sm:p-4"
        >
          <p className="mb-2 px-1 text-[10px] text-slate-500 dark:text-slate-400">
            Current law, notification and explicit web-search queries may include source links.
          </p>
          <div className="flex items-end gap-2">
            <label htmlFor="parakh-message" className="sr-only">Message PARAKH</label>
            <textarea
              id="parakh-message"
              rows={2}
              maxLength={1200}
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendRequest();
                }
              }}
              placeholder="Ask PARAKH a CA concept, calculation, law or exam-writing doubt…"
              className="max-h-36 min-h-[54px] min-w-0 flex-1 resize-y rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm leading-5 text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400 dark:focus:ring-indigo-950"
            />
            <button
              type="submit"
              disabled={loading || !request.trim()}
              className="inline-flex min-h-[54px] shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
          <p className="mt-2 px-1 text-[10px] text-slate-500 dark:text-slate-400">Enter to send · Shift + Enter for a new line</p>
        </form>
      </section>
    </div>
  );
};

export default StudyPlannerPage;
