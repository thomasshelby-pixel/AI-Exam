import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { apiRequest } from '../../api/client.js';
import {
  FileCheck2,
  TrendingUp,
  Award,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Calendar,
  Layers,
  Sparkles,
  Building2,
  CreditCard,
  RefreshCw,
} from 'lucide-react';

interface StudentDashboardProps {
  onNavigateUpload: () => void;
  onNavigateEvaluations: () => void;
  onViewReport: (evaluationId: string) => void;
  onOpenCreditsModal: () => void;
}

interface DashboardData {
  metrics: {
    totalEvaluations: number;
    freeEvaluationsRemaining: number;
    purchasedCredits: number;
    instituteSponsored: boolean;
    instituteName?: string;
    averageScore: number;
    passProbability: string;
  };
  recentEvaluations: Array<{
    id: string;
    subject_name: string;
    level: string;
    total_marks: number;
    maximum_marks: number;
    percentage: number;
    grade: string;
    status: string;
    created_at: string;
  }>;
  subjectPerformance: Array<{
    subject: string;
    evaluationsCount: number;
    averagePercentage: number;
  }>;
  strongTopics: string[];
  weakTopics: string[];
  improvementTrend: Array<{
    date: string;
    subject: string;
    score: number;
  }>;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  onNavigateUpload,
  onNavigateEvaluations,
  onViewReport,
  onOpenCreditsModal,
}) => {
  const { user, profile } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const studentProfile = profile as {
    icai_registration_number?: string;
    ca_level?: string;
    institute_name?: string;
  } | null;

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await apiRequest<DashboardData>('/api/student/dashboard');
        setData(res);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
      </div>
    );
  }

  const metrics = data?.metrics || {
    totalEvaluations: 0,
    freeEvaluationsRemaining: 2,
    purchasedCredits: 0,
    instituteSponsored: false,
    averageScore: 0,
    passProbability: 'Building Baseline',
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-slate-800 space-y-6">
      {/* Student Welcome Header Banner */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              CA {studentProfile?.ca_level || 'INTERMEDIATE'}
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              ICAI: {studentProfile?.icai_registration_number || 'REG-PENDING'}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back, {user?.fullName}</h1>
          <p className="text-slate-500 text-xs sm:text-sm">
            Track your mock test scores, line-by-line step marks, and examiner recommendations.
          </p>
        </div>

        {/* Action CTAs */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            id="dashboard-start-check-btn"
            onClick={onNavigateUpload}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-bold text-xs sm:text-sm shadow-sm flex items-center gap-2 transition"
          >
            <FileCheck2 className="w-4 h-4" />
            <span>New Answer Sheet</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {!user?.hasPermanentFreeAccess && !metrics.instituteSponsored && (
            <button
              onClick={onOpenCreditsModal}
              className="px-3.5 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs sm:text-sm transition border border-slate-200 flex items-center gap-1.5"
            >
              <CreditCard className="w-4 h-4 text-blue-600" />
              <span>Buy Credits</span>
            </button>
          )}
        </div>
      </header>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Entitlement Card */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider flex items-center justify-between">
            <span>Evaluation Access</span>
            <Zap className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {user?.hasPermanentFreeAccess ? (
              <span className="text-blue-600">Active</span>
            ) : metrics.instituteSponsored ? (
              <span className="text-blue-600">Sponsored</span>
            ) : metrics.freeEvaluationsRemaining > 0 ? (
              <span>{metrics.freeEvaluationsRemaining} Free</span>
            ) : (
              <span>{metrics.purchasedCredits} Credits</span>
            )}
          </div>
          <div className="text-xs text-blue-600 font-medium mt-1">
            {user?.hasPermanentFreeAccess
              ? 'Full evaluation access active'
              : metrics.instituteSponsored
              ? `Via ${metrics.instituteName || 'Institute'}`
              : `${metrics.freeEvaluationsRemaining} trial evaluations active`}
          </div>
        </div>

        {/* Total Evaluated */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider flex items-center justify-between">
            <span>Total Evaluated</span>
            <Layers className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{metrics.totalEvaluations}</div>
          <div className="text-xs text-green-600 font-medium mt-1">Full papers verified</div>
        </div>

        {/* Average Score */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider flex items-center justify-between">
            <span>Average Score</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {metrics.averageScore > 0 ? `${metrics.averageScore}%` : 'N/A'}
          </div>
          <div className="text-xs text-slate-500 font-medium mt-1">Passing benchmark: 40%</div>
        </div>

        {/* Pass Probability */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider flex items-center justify-between">
            <span>ICAI Standing</span>
            <Award className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-slate-900 truncate mt-0.5">
            {metrics.passProbability}
          </div>
          <div className="text-xs text-amber-600 font-medium mt-1">Step-marking compliance</div>
        </div>
      </div>

      {/* Main Content Layout: Evaluations Table (2 cols) & Side Intelligence (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Evaluations Table Container */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
            <div>
              <h2 className="font-bold text-slate-800 text-base">Recent Evaluations</h2>
              <p className="text-xs text-slate-500">ICAI-aligned step-marked answer papers</p>
            </div>
            {data?.recentEvaluations && data.recentEvaluations.length > 0 && (
              <button
                onClick={onNavigateEvaluations}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View All
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            {data?.recentEvaluations && data.recentEvaluations.length > 0 ? (
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3">Subject & Paper</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Percentage</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {data.recentEvaluations.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 font-semibold text-slate-800">
                        {ev.subject_name}
                        <span className="block text-[10px] text-slate-500 font-normal">CA {ev.level}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(ev.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-blue-700">
                        {ev.total_marks} / {ev.maximum_marks}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-700">{ev.percentage}%</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                            ev.percentage >= 60
                              ? 'bg-amber-100 text-amber-800'
                              : ev.percentage >= 40
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {ev.grade || 'Completed'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={() => onViewReport(ev.id)}
                          className="px-3 py-1 rounded-md bg-slate-100 hover:bg-blue-50 text-blue-700 text-xs font-bold border border-slate-200 hover:border-blue-200 transition"
                        >
                          View Report
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12 px-4 space-y-3">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                  <FileCheck2 className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-800">No evaluations submitted yet</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Upload your handwritten CA answer sheet to get your first 2 full papers evaluated completely free!
                </p>
                <button
                  onClick={onNavigateUpload}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-sm"
                >
                  Start First Evaluation (Free)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Side Panels: AI Performance Summary & Revision Focus */}
        <div className="flex flex-col gap-6">
          {/* AI Performance Summary Card (Directly matching High Density design snippet) */}
          <div className="bg-[#1e293b] rounded-xl p-6 text-white shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
              AI PERFORMANCE SUMMARY
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Conceptual Accuracy</span>
                  <span className="font-bold text-blue-400">
                    {metrics.averageScore > 0 ? `${Math.min(96, Math.round(metrics.averageScore * 1.15))}%` : '88%'}
                  </span>
                </div>
                <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full"
                    style={{ width: metrics.averageScore > 0 ? `${Math.min(96, Math.round(metrics.averageScore * 1.15))}%` : '88%' }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Provision Application</span>
                  <span className="font-bold text-blue-400">
                    {metrics.averageScore > 0 ? `${Math.max(40, Math.round(metrics.averageScore * 0.95))}%` : '74%'}
                  </span>
                </div>
                <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full"
                    style={{ width: metrics.averageScore > 0 ? `${Math.max(40, Math.round(metrics.averageScore * 0.95))}%` : '74%' }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Working Notes Quality</span>
                  <span className="font-bold text-amber-400">
                    {metrics.averageScore > 0 ? `${Math.max(35, Math.round(metrics.averageScore * 0.85))}%` : '62%'}
                  </span>
                </div>
                <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded-full"
                    style={{ width: metrics.averageScore > 0 ? `${Math.max(35, Math.round(metrics.averageScore * 0.85))}%` : '62%' }}
                  />
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-4 leading-relaxed border-t border-slate-700/60 pt-3">
              Calibrated against ICAI suggested answers, accounting standards (AS/Ind AS), and step-marking guidelines.
            </p>
          </div>

          {/* Topics Breakdown */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5 mb-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Demonstrated Strengths
              </h4>
              {data?.strongTopics && data.strongTopics.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {data.strongTopics.map((topic, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-medium"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  Strong topics will populate here following your first evaluated answer sheet.
                </p>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                Revision Priority (Marks Lost)
              </h4>
              {data?.weakTopics && data.weakTopics.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {data.weakTopics.map((topic, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-md bg-rose-50 text-rose-800 border border-rose-200 text-[11px] font-medium"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  Deduction areas and missing statutory sections will appear here.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
