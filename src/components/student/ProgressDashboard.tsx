import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Area,
  ComposedChart,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Award,
  Target,
  FileCheck2,
  Calendar,
  ArrowRight,
  Filter,
  CheckCircle2,
  BarChart2,
  Layers,
  Sparkles,
} from 'lucide-react';

export interface EvaluationTrendPoint {
  id: string;
  date: string;
  fullDate?: string;
  subject: string;
  level?: string;
  materialType?: string;
  marks: number;
  maxMarks: number;
  score: number; // percentage
  percentage: number;
  grade?: string;
}

export interface ProgressDashboardProps {
  trendData: EvaluationTrendPoint[];
  averageScore?: number;
  totalEvaluations?: number;
  onViewReport: (evaluationId: string) => void;
  onNavigateUpload?: () => void;
  className?: string;
}

type MetricMode = 'PERCENTAGE' | 'RAW_MARKS';

export const ProgressDashboard: React.FC<ProgressDashboardProps> = ({
  trendData = [],
  averageScore = 0,
  totalEvaluations = 0,
  onViewReport,
  onNavigateUpload,
  className = '',
}) => {
  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');
  const [metricMode, setMetricMode] = useState<MetricMode>('PERCENTAGE');

  // Extract distinct subjects
  const availableSubjects = useMemo(() => {
    const subjectsSet = new Set<string>();
    trendData.forEach((item) => {
      if (item.subject) subjectsSet.add(item.subject);
    });
    return Array.from(subjectsSet).sort();
  }, [trendData]);

  // Filtered dataset
  const filteredData = useMemo(() => {
    if (selectedSubject === 'ALL') {
      return trendData;
    }
    return trendData.filter((item) => item.subject === selectedSubject);
  }, [trendData, selectedSubject]);

  // Chart data enriched with deltas
  const chartPoints = useMemo(() => {
    return filteredData.map((item, index) => {
      const prevItem = index > 0 ? filteredData[index - 1] : null;
      const currentVal = metricMode === 'PERCENTAGE' ? item.percentage : item.marks;
      const prevVal = prevItem
        ? metricMode === 'PERCENTAGE'
          ? prevItem.percentage
          : prevItem.marks
        : null;

      const delta = prevVal !== null ? Math.round((currentVal - prevVal) * 10) / 10 : 0;

      return {
        ...item,
        chartIndex: index + 1,
        displayScore: currentVal,
        delta,
        shortSubject:
          item.subject.length > 18 ? item.subject.substring(0, 16) + '…' : item.subject,
      };
    });
  }, [filteredData, metricMode]);

  // Key KPI stats based on filtered data
  const stats = useMemo(() => {
    if (filteredData.length === 0) {
      return {
        latest: null,
        first: null,
        highest: null,
        overallDelta: 0,
        average: averageScore,
        count: 0,
      };
    }

    const first = filteredData[0];
    const latest = filteredData[filteredData.length - 1];

    let highest = filteredData[0];
    let sumScore = 0;

    filteredData.forEach((p) => {
      const scoreVal = metricMode === 'PERCENTAGE' ? p.percentage : p.marks;
      const highestScoreVal = metricMode === 'PERCENTAGE' ? highest.percentage : highest.marks;
      if (scoreVal > highestScoreVal) {
        highest = p;
      }
      sumScore += p.percentage;
    });

    const calculatedAvg = Math.round((sumScore / filteredData.length) * 10) / 10;
    const firstScore = metricMode === 'PERCENTAGE' ? first.percentage : first.marks;
    const latestScore = metricMode === 'PERCENTAGE' ? latest.percentage : latest.marks;
    const overallDelta = Math.round((latestScore - firstScore) * 10) / 10;

    return {
      latest,
      first,
      highest,
      overallDelta,
      average: calculatedAvg,
      count: filteredData.length,
    };
  }, [filteredData, metricMode, averageScore]);

  // Max value for Y-axis domain
  const yAxisDomain = useMemo(() => {
    if (metricMode === 'PERCENTAGE') {
      return [0, 100];
    }
    const maxMarksArray = filteredData.map((d) => d.maxMarks || 100);
    const highestMax = Math.max(100, ...maxMarksArray);
    return [0, highestMax];
  }, [metricMode, filteredData]);

  return (
    <div
      id="student-progress-dashboard"
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-6 ${className}`}
    >
      {/* Dashboard Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <BarChart2 className="w-4 h-4" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Performance Analytics
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Progress Dashboard
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Track marks obtained and score trajectory across consecutive ICAI step-marked evaluations.
          </p>
        </div>

        {/* Filter & Metric Mode Selectors */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Subject Filter */}
          {availableSubjects.length > 1 && (
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <label htmlFor="subject-filter-select" className="sr-only">
                Filter by Subject
              </label>
              <select
                id="subject-filter-select"
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                  All Subjects ({trendData.length})
                </option>
                {availableSubjects.map((sub) => (
                  <option
                    key={sub}
                    value={sub}
                    className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                  >
                    {sub}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Metric Mode Toggle: Percentage vs Raw Marks */}
          <div
            id="metric-mode-toggle"
            className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            <button
              id="metric-mode-percentage-btn"
              type="button"
              onClick={() => setMetricMode('PERCENTAGE')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                metricMode === 'PERCENTAGE'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Percentage (%)
            </button>
            <button
              id="metric-mode-marks-btn"
              type="button"
              onClick={() => setMetricMode('RAW_MARKS')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                metricMode === 'RAW_MARKS'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Marks Obtained
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Latest Evaluation */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Latest Evaluation</span>
            <FileCheck2 className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white">
              {stats.latest
                ? metricMode === 'PERCENTAGE'
                  ? `${stats.latest.percentage}%`
                  : `${stats.latest.marks}/${stats.latest.maxMarks}`
                : '—'}
            </span>
            {stats.latest && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                  stats.latest.percentage >= 60
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    : stats.latest.percentage >= 40
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                }`}
              >
                {stats.latest.percentage >= 60
                  ? 'Exemption'
                  : stats.latest.percentage >= 40
                  ? 'Pass'
                  : 'Review'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-1">
            {stats.latest ? stats.latest.subject : 'No papers evaluated yet'}
          </p>
        </div>

        {/* Score Trajectory / Net Growth */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Net Score Growth</span>
            {stats.overallDelta >= 0 ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
            )}
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              className={`text-xl sm:text-2xl font-black font-mono ${
                stats.overallDelta > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : stats.overallDelta < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {stats.count > 1
                ? `${stats.overallDelta > 0 ? '+' : ''}${stats.overallDelta}${
                    metricMode === 'PERCENTAGE' ? '%' : ' pts'
                  }`
                : 'Baseline'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {stats.count > 1 ? `Since first evaluation (${stats.first?.date})` : 'Initial benchmark established'}
          </p>
        </div>

        {/* Peak Performance Paper */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Highest Score</span>
            <Award className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white">
              {stats.highest
                ? metricMode === 'PERCENTAGE'
                  ? `${stats.highest.percentage}%`
                  : `${stats.highest.marks}/${stats.highest.maxMarks}`
                : '—'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-1">
            {stats.highest ? `${stats.highest.subject} (${stats.highest.date})` : 'Awaiting data'}
          </p>
        </div>

        {/* Benchmark Reference */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Average Standing</span>
            <Target className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white">
              {stats.count > 0 ? `${stats.average}%` : 'N/A'}
            </span>
            <span className="text-[10px] text-slate-500 font-medium">
              (Pass &ge; 40%)
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {stats.average >= 60
              ? 'Exemption range trajectory'
              : stats.average >= 40
              ? 'Clearance range trajectory'
              : 'Focus on working notes & standards'}
          </p>
        </div>
      </div>

      {/* Chart Section */}
      {chartPoints.length > 0 ? (
        <div className="space-y-4">
          {/* Chart Header Info */}
          <div className="flex flex-wrap items-center justify-between text-xs gap-3">
            <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-blue-600 inline-block" />
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {metricMode === 'PERCENTAGE' ? 'Score Percentage' : 'Marks Obtained'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-emerald-500 border border-dashed border-emerald-500 inline-block" />
                <span>ICAI Pass (40%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-amber-500 border border-dashed border-amber-500 inline-block" />
                <span>Exemption (60%)</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 dark:text-slate-500">
              Showing {chartPoints.length} evaluated paper{chartPoints.length === 1 ? '' : 's'}
            </div>
          </div>

          {/* Recharts Container */}
          <div className="w-full h-72 sm:h-80 bg-slate-50/50 dark:bg-slate-950/40 rounded-xl p-2 sm:p-4 border border-slate-100 dark:border-slate-800/80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartPoints}
                margin={{ top: 15, right: 20, left: -10, bottom: 25 }}
              >
                <defs>
                  <linearGradient id="scoreAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#94a3b8"
                  opacity={0.2}
                />

                <XAxis
                  dataKey="date"
                  tickLine={false}
                  stroke="#94a3b8"
                  fontSize={11}
                  dy={8}
                />

                <YAxis
                  domain={yAxisDomain}
                  tickLine={false}
                  stroke="#94a3b8"
                  fontSize={11}
                  unit={metricMode === 'PERCENTAGE' ? '%' : ''}
                />

                {/* Benchmark Lines */}
                {metricMode === 'PERCENTAGE' && (
                  <>
                    <ReferenceLine
                      y={40}
                      stroke="#10b981"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{
                        value: 'Pass 40%',
                        position: 'insideBottomRight',
                        fill: '#10b981',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    />
                    <ReferenceLine
                      y={60}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{
                        value: 'Exemption 60%',
                        position: 'insideTopRight',
                        fill: '#f59e0b',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    />
                  </>
                )}

                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const dataPoint = payload[0].payload as (typeof chartPoints)[0];
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-800 text-xs space-y-1.5 max-w-xs">
                          <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-1.5">
                            <span className="font-bold text-white truncate">
                              {dataPoint.subject}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono shrink-0">
                              {dataPoint.date}
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-0.5">
                            <span className="text-slate-400">Marks Obtained:</span>
                            <span className="font-mono font-bold text-blue-400">
                              {dataPoint.marks} / {dataPoint.maxMarks}
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Percentage:</span>
                            <span className="font-mono font-bold text-emerald-400">
                              {dataPoint.percentage}%
                            </span>
                          </div>

                          {dataPoint.delta !== 0 && (
                            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/80">
                              <span className="text-slate-400">Compared to prev:</span>
                              <span
                                className={`font-bold ${
                                  dataPoint.delta > 0
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                                }`}
                              >
                                {dataPoint.delta > 0 ? `+${dataPoint.delta}` : dataPoint.delta}
                                {metricMode === 'PERCENTAGE' ? '%' : ' marks'}
                              </span>
                            </div>
                          )}

                          <div className="pt-1.5">
                            <button
                              type="button"
                              onClick={() => onViewReport(dataPoint.id)}
                              className="w-full text-center py-1 px-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition cursor-pointer"
                            >
                              View Step-Marking Report &rarr;
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />

                {/* Shaded Area under Curve */}
                <Area
                  type="monotone"
                  dataKey="displayScore"
                  stroke="none"
                  fill="url(#scoreAreaGradient)"
                />

                {/* Primary Trend Line */}
                <Line
                  type="monotone"
                  dataKey="displayScore"
                  stroke="#2563eb"
                  strokeWidth={3}
                  activeDot={{
                    r: 7,
                    stroke: '#3b82f6',
                    strokeWidth: 3,
                    fill: '#ffffff',
                    cursor: 'pointer',
                    onClick: (_: any, event: any) => {
                      if (event?.payload?.id) {
                        onViewReport(event.payload.id);
                      }
                    },
                  }}
                  dot={{
                    r: 4.5,
                    stroke: '#2563eb',
                    strokeWidth: 2,
                    fill: '#ffffff',
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Chronological Recent Evaluations Progression Strip */}
          <div className="pt-2">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2.5 flex items-center justify-between">
              <span>Evaluations Progression Timeline</span>
              <span className="text-[10px] text-slate-400 font-normal">Click any card to inspect report</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {filteredData
                .slice(-4)
                .reverse()
                .map((ev, idx) => (
                  <div
                    key={ev.id}
                    onClick={() => onViewReport(ev.id)}
                    className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300 dark:hover:border-blue-700/60 hover:shadow-xs transition cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono text-slate-400">
                        {ev.date}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                          ev.percentage >= 60
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : ev.percentage >= 40
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                        }`}
                      >
                        {ev.percentage >= 60 ? 'Exemption' : ev.percentage >= 40 ? 'Pass' : 'Review'}
                      </span>
                    </div>

                    <h5 className="font-bold text-xs text-slate-800 dark:text-slate-200 line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {ev.subject}
                    </h5>

                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                        {ev.marks}/{ev.maxMarks}{' '}
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          ({ev.percentage}%)
                        </span>
                      </span>

                      <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                        <span>Report</span>
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="text-center py-10 px-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-3">
          <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
            <TrendingUp className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            No evaluation trend data available yet
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            Upload and evaluate your handwritten answer sheets to generate your interactive score trajectory,
            measure marks gains, and compare against ICAI 40% clearance and 60% exemption benchmarks.
          </p>
          {onNavigateUpload && (
            <button
              id="empty-trend-upload-btn"
              type="button"
              onClick={onNavigateUpload}
              className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-xs inline-flex items-center gap-2 cursor-pointer"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>Submit Answer Sheet</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
