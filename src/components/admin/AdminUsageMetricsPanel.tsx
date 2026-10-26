import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Download, Eye, Globe, RefreshCw, AlertCircle } from 'lucide-react';
import { apiRequest } from '../../api/client.js';

interface UsageMetrics {
  apkDownloads: number | null;
  apkDownloadUrl: string;
  apkCountRefreshedAt: string | null;
  apkDownloadsTrackingStartedAt: string | null;
  activeUsersLast30Minutes: number;
  uniqueVisitorsLast30Days: number;
  uniqueVisitorsAllTime: number;
  visitorDaysLast30Days: number;
  trackingStartedAt: string | null;
  refreshedAt: string;
}

const numberFormat = new Intl.NumberFormat('en-IN');

function metricValue(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? numberFormat.format(value) : '—';
}

export const AdminUsageMetricsPanel: React.FC = () => {
  const [metrics, setMetrics] = useState<UsageMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<UsageMetrics>('/api/admin/usage-metrics');
      setMetrics(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load usage metrics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = [
    {
      title: 'Android APK downloads',
      value: metricValue(metrics?.apkDownloads),
      detail: metrics?.apkDownloadsTrackingStartedAt
        ? `Website-served downloads since ${metrics.apkDownloadsTrackingStartedAt}${metrics.apkCountRefreshedAt ? ` · refreshed ${new Date(metrics.apkCountRefreshedAt).toLocaleTimeString()}` : ''}`
        : 'Counting starts after the new download tracker is deployed; installs are not counted',
      icon: Download,
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    },
    {
      title: 'Active users',
      value: metricValue(metrics?.activeUsersLast30Minutes),
      detail: 'Authenticated sessions active in the last 30 minutes',
      icon: Activity,
      color: 'text-blue-700 bg-blue-50 border-blue-200',
    },
    {
      title: 'Website visitors · 30 days',
      value: metricValue(metrics?.uniqueVisitorsLast30Days),
      detail: 'Unique anonymous browser IDs seen in the last 30 days',
      icon: Eye,
      color: 'text-violet-700 bg-violet-50 border-violet-200',
    },
    {
      title: 'Tracked visitors · all time',
      value: metricValue(metrics?.uniqueVisitorsAllTime),
      detail: metrics?.trackingStartedAt
        ? `Tracking started ${metrics.trackingStartedAt}`
        : 'Counting starts after the analytics feature is deployed',
      icon: Globe,
      color: 'text-amber-700 bg-amber-50 border-amber-200',
    },
  ];

  return (
    <section className="space-y-3" aria-label="Website and Android app usage metrics">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-black text-slate-900">Website & Android App Usage</h2>
          <p className="text-xs text-slate-500 mt-1">
            Website-served APK downloads, authenticated activity and anonymous public-site visitors.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh usage
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-500">{card.title}</p>
                  <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">
                    {loading && !metrics ? '…' : card.value}
                  </p>
                </div>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${card.color}`}>
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{card.detail}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
};
