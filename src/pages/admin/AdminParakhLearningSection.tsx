import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../api/client.js';
import {
  Activity,
  Brain,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Database,
  FlaskConical,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

interface ParakhSubjectMetric {
  level: string;
  subjectKey: string;
  subjectName: string;
  optedIn: number;
  collected: number;
  unreviewed: number;
  selectedForReview: number;
  verified: number;
}

interface ParakhMetrics {
  engineName: string;
  trainingEnabled: boolean;
  supervisorEnabled: boolean;
  productionEvaluationImpact: boolean;
  totalOptIns: number;
  totalCollected: number;
  processing: number;
  unreviewedObservations: number;
  selectedForReview: number;
  verifiedSamples: number;
  failed: number;
  excluded: number;
  benchmarkRuns: number;
  trainingRuns: number;
  latestActivityAt?: string | null;
  dataSource: 'FIRESTORE' | 'SQLITE_CACHE_FALLBACK';
  bySubject: ParakhSubjectMetric[];
}

const numberFormat = new Intl.NumberFormat('en-IN');

function formatDate(value?: string | null): string {
  if (!value) return 'No activity recorded yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'No activity recorded yet'
    : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export const AdminParakhLearningSection: React.FC = () => {
  const [metrics, setMetrics] = useState<ParakhMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const loadMetrics = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const response = await apiRequest<{ success: boolean; metrics: ParakhMetrics }>(
        '/api/admin/parakh-learning/metrics',
      );
      setMetrics(response.metrics);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load PARAKH learning metrics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  const stats = [
    {
      label: 'Collected observations',
      value: metrics?.totalCollected ?? 0,
      helper: 'Policy-covered evaluations completed',
      icon: Database,
      tone: 'text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-950/50',
    },
    {
      label: 'Unreviewed observations',
      value: metrics?.unreviewedObservations ?? 0,
      helper: 'Collected, not yet selected for human QA',
      icon: Activity,
      tone: 'text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40',
    },
    {
      label: 'Selected for quality review',
      value: metrics?.selectedForReview ?? 0,
      helper: 'Targeted or integrity-flagged samples',
      icon: ClipboardCheck,
      tone: 'text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-950/40',
    },
    {
      label: 'Human-verified samples',
      value: metrics?.verifiedSamples ?? 0,
      helper: 'Reviewed and finalized by an admin',
      icon: ShieldCheck,
      tone: 'text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40',
    },
  ];

  const stages = [
    {
      title: 'Policy-disclosed observation collection',
      detail: 'Successfully completed evaluations are recorded as observations unless the student has requested exclusion.',
      status: 'ACTIVE',
      statusLabel: 'Active',
      icon: CheckCircle2,
    },
    {
      title: 'Sample-based quality review',
      detail: 'Integrity-flagged cases are prioritised; routine random QA sampling rules are a later step.',
      status: 'PARTIAL',
      statusLabel: 'Flagged cases only',
      icon: ClipboardCheck,
    },
    {
      title: 'Anonymisation and dataset preparation',
      detail: 'Separate safeguards and a reviewed export process are still required.',
      status: 'PENDING',
      statusLabel: 'Not active',
      icon: LockKeyhole,
    },
    {
      title: 'Human-verified benchmark',
      detail: 'A human-verified held-out benchmark must be created before quality claims.',
      status: 'PENDING',
      statusLabel: 'Not started',
      icon: Activity,
    },
    {
      title: 'Model training',
      detail: 'No fine-tuning or model update runs are enabled in this phase.',
      status: 'OFF',
      statusLabel: 'OFF',
      icon: Brain,
    },
  ];

  return (
    <div className="space-y-6 text-slate-800 dark:text-slate-100">
      <section className="overflow-hidden rounded-2xl border border-indigo-900/60 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-5 text-white shadow-sm sm:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-indigo-400/30 bg-indigo-500/20">
              <Brain className="h-7 w-7 text-indigo-200" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">
                CA Exam Checker AI · Learning programme
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
                PARAKH <span className="text-indigo-300">Learning Engine</span>
              </h1>
              <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-300 sm:text-sm">
                A consent-based learning pipeline that collects every completed opted-in evaluation as an observation and uses selected samples for human quality checks.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-bold text-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" /> Policy collection active
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[10px] font-bold text-amber-200">
              <LockKeyhole className="h-3.5 w-3.5" /> Training OFF
            </span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{stat.label}</p>
                  <p className="mt-2 text-2xl font-black tabular-nums text-slate-900 dark:text-white">
                    {loading ? '—' : numberFormat.format(stat.value)}
                  </p>
                </div>
                <span className={`rounded-lg p-2 ${stat.tone}`}>
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">{stat.helper}</p>
            </div>
          );
        })}
      </section>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <span className="font-bold">Unable to refresh PARAKH:</span>
          <span>{error}</span>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
              <Activity className="h-4 w-4 text-indigo-500" />
              Learning pipeline progress
            </h2>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              This shows implemented stages separately from future work.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadMetrics(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh progress
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-5">
          {stages.map((stage, index) => {
            const Icon = stage.icon;
            const active = stage.status === 'ACTIVE';
            return (
              <div key={stage.title} className="relative rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black text-slate-400">STEP {index + 1}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' : stage.status === 'OFF' ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'}`}>
                    {stage.statusLabel}
                  </span>
                </div>
                <div className="mt-3 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-300">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="mt-3 text-xs font-black text-slate-900 dark:text-white">{stage.title}</h3>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">{stage.detail}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 xl:col-span-2 sm:p-5">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-indigo-500" />
            <h2 className="text-sm font-black text-slate-900 dark:text-white">Course and subject coverage</h2>
          </div>
          {loading ? (
            <p className="py-8 text-center text-xs text-slate-400">Loading subject coverage…</p>
          ) : (metrics?.bySubject || []).length === 0 ? (
            <div className="py-8 text-center">
              <Database className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-300">No observations collected yet</p>
              <p className="mt-1 text-[10px] text-slate-400">Subject-wise counts will appear after students opt in.</p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-2 py-2 font-bold">Course</th>
                    <th className="px-2 py-2 font-bold">Subject</th>
                    <th className="px-2 py-2 text-right font-bold">Collected</th>
                    <th className="px-2 py-2 text-right font-bold">Unreviewed</th>
                    <th className="px-2 py-2 text-right font-bold">Selected QA</th>
                    <th className="px-2 py-2 text-right font-bold">Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics!.bySubject.map((item) => (
                    <tr key={`${item.level}:${item.subjectKey}`} className="border-b border-slate-100 last:border-0 dark:border-slate-800/70">
                      <td className="px-2 py-3 font-semibold text-slate-600 dark:text-slate-300">{item.level}</td>
                      <td className="px-2 py-3 font-semibold text-slate-900 dark:text-white">{item.subjectName}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{numberFormat.format(item.collected)}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{numberFormat.format(item.unreviewed)}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{numberFormat.format(item.selectedForReview)}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{numberFormat.format(item.verified)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <h2 className="text-sm font-black text-slate-900 dark:text-white">Safety and operating status</h2>
          </div>
          <div className="mt-4 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">Model training</span>
              <strong className="text-amber-600 dark:text-amber-300">OFF</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">Evaluation supervisor</span>
              <strong className="text-amber-600 dark:text-amber-300">OFF</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">Production grading impact</span>
              <strong className="text-emerald-600 dark:text-emerald-300">NONE</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">Processing</span>
              <strong className="tabular-nums text-slate-800 dark:text-white">{numberFormat.format(metrics?.processing ?? 0)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">Failed submissions (excluded)</span>
              <strong className="tabular-nums text-slate-800 dark:text-white">{numberFormat.format(metrics?.failed ?? 0)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">Excluded by student</span>
              <strong className="tabular-nums text-slate-800 dark:text-white">{numberFormat.format(metrics?.excluded ?? 0)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">Benchmark runs</span>
              <strong className="tabular-nums text-slate-800 dark:text-white">{numberFormat.format(metrics?.benchmarkRuns ?? 0)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">Training runs</span>
              <strong className="tabular-nums text-slate-800 dark:text-white">{numberFormat.format(metrics?.trainingRuns ?? 0)}</strong>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/70 p-3 text-[10px] leading-relaxed text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-200">
            PARAKH stores only an opt-in evaluation reference and review metadata at this stage. It does not export student files, call another AI model, or update model weights.
          </div>
          <p className="mt-3 text-[10px] text-slate-400">
            Latest activity: {formatDate(metrics?.latestActivityAt)}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">
            Metrics source: {metrics?.dataSource || 'Not available'}
          </p>
        </div>
      </section>

      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <strong>Important:</strong> Policy-covered completed evaluations are collected as observations unless a student has requested exclusion. Only selected samples need human review. An unreviewed AI result is never treated as ground truth; anonymisation, permitted dataset export, and a held-out human-verified benchmark are still required before future training. Counts here measure pipeline progress, not model accuracy.
        </p>
      </div>
    </div>
  );
};
