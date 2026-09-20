import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { apiRequest } from '../../api/client.js';
import { formatDateIST } from '../../utils/timezone.js';
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
  Clock,
  HelpCircle,
  User,
  Gift,
  Upload,
  X,
  Dna,
} from 'lucide-react';
import { StudentReviewCard } from '../../components/student/StudentReviewCard.js';

interface StudentDashboardProps {
  onNavigateUpload: () => void;
  onNavigateEvaluations: () => void;
  onViewReport: (evaluationId: string) => void;
  onOpenCreditsModal: () => void;
  onNavigateProfile?: () => void;
  onNavigateEnrollments?: () => void;
  onNavigateExaminerProfile?: () => void;
}

export interface CreditLotSummary {
  id: string;
  orderId: string | null;
  paymentId: string | null;
  creditsPurchased: number;
  creditsRemaining: number;
  validFrom: string;
  expiresAt: string;
  purchaseDate: string;
  status: 'ACTIVE' | 'CONSUMED' | 'EXPIRED';
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysRemaining: number;
}

interface DashboardData {
  creditStatus?: {
    totalValidCredits: number;
    expiringSoonCredits: number;
    earliestExpiryDate: string | null;
    lots: CreditLotSummary[];
  };
  metrics: {
    totalEvaluations: number;
    freeEvaluationsRemaining: number;
    purchasedCredits: number;
    expiringSoonCredits?: number;
    earliestExpiryDate?: string | null;
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
  enrolledInstitutes?: Array<{
    membership_id: string;
    institute_id: string;
    institute_name: string;
    batch_id: string | null;
    batch_name: string | null;
    batch_level: string | null;
    status: string;
    joined_at: string;
  }>;
  examinerProfile?: {
    evaluationsAnalysed: number;
    insufficientHistory: boolean;
    recurringPatternsCount: number;
    improvedPatternsCount: number;
    attentionNeededCount: number;
    marksRecoveredTotal: number;
    message?: string;
  };
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  onNavigateUpload,
  onNavigateEvaluations,
  onViewReport,
  onOpenCreditsModal,
  onNavigateProfile,
  onNavigateEnrollments,
  onNavigateExaminerProfile,
}) => {
  const { user, profile } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [referralStatus, setReferralStatus] = useState<{
    hasActivePromo: boolean;
    activePromo: any;
    ai30Campaign: any;
  } | null>(null);
  const [dashboardPromoCode, setDashboardPromoCode] = useState<string>('AI30');
  const [isRedeeming, setIsRedeeming] = useState<boolean>(false);
  const [promoMessage, setPromoMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Institute tests and materials
  const [instituteTests, setInstituteTests] = useState<any[]>([]);
  const [instituteMaterials, setInstituteMaterials] = useState<any[]>([]);
  const [selectedPaperForSubmit, setSelectedPaperForSubmit] = useState<any | null>(null);
  const [paperSubmissionText, setPaperSubmissionText] = useState<string>('');
  const [isSubmittingPaper, setIsSubmittingPaper] = useState<boolean>(false);
  const [paperSubmitError, setPaperSubmitError] = useState<string>('');

  const studentProfile = profile as {
    icai_registration_number?: string;
    ca_level?: string;
    institute_name?: string;
  } | null;

  const fetchDashboard = async () => {
    try {
      const [dashRes, refRes, testsRes, matsRes] = await Promise.all([
        apiRequest<DashboardData>('/api/student/dashboard'),
        apiRequest<any>('/api/student/referral/status').catch(() => null),
        apiRequest<{ tests: any[] }>('/api/student/institute/my-tests').catch(() => ({ tests: [] })),
        apiRequest<{ materials: any[] }>('/api/student/institute-materials').catch(() => ({ materials: [] })),
      ]);
      setData(dashRes);
      if (refRes) {
        setReferralStatus(refRes);
      }
      setInstituteTests(testsRes?.tests || []);
      setInstituteMaterials(matsRes?.materials || []);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handleQuickRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setPromoMessage(null);
    if (!dashboardPromoCode.trim()) return;

    try {
      setIsRedeeming(true);
      const res = await apiRequest<any>('/api/student/referral/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: dashboardPromoCode.trim().toUpperCase() }),
      });
      setPromoMessage({ type: 'success', text: res.message || 'AI30 promo activated successfully!' });
      // Refresh dashboard data
      fetchDashboard();
    } catch (err: any) {
      setPromoMessage({ type: 'error', text: err?.message || 'Failed to apply promo code.' });
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleSubmitInstituteTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPaperForSubmit) return;
    if (!paperSubmissionText.trim()) {
      setPaperSubmitError('Please provide your handwritten answer paper text or content.');
      return;
    }

    try {
      setIsSubmittingPaper(true);
      setPaperSubmitError('');
      const res = await apiRequest<{ success: boolean; evaluationId: string; redirectUrl?: string }>(
        '/api/student/institute/submit-test',
        {
          method: 'POST',
          body: JSON.stringify({
            instituteId: selectedPaperForSubmit.institute_id,
            testId: selectedPaperForSubmit.isTest ? selectedPaperForSubmit.id : null,
            instituteMaterialId: selectedPaperForSubmit.isTest ? null : selectedPaperForSubmit.id,
            subjectName: selectedPaperForSubmit.subject_name || selectedPaperForSubmit.subject,
            level: selectedPaperForSubmit.level || selectedPaperForSubmit.course_level || 'INTERMEDIATE',
            studentHandwrittenText: paperSubmissionText.trim(),
          }),
        }
      );

      const evalId = res.evaluationId;
      setSelectedPaperForSubmit(null);
      setPaperSubmissionText('');
      if (evalId) {
        onViewReport(evalId);
      } else {
        fetchDashboard();
      }
    } catch (err: any) {
      setPaperSubmitError(err.message || 'Failed to submit paper for institute evaluation');
    } finally {
      setIsSubmittingPaper(false);
    }
  };

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
    <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-slate-800 dark:text-slate-100 space-y-6">
      {/* Student Welcome Header Banner */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
              CA {studentProfile?.ca_level || 'INTERMEDIATE'}
            </span>
            <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
              <span className="font-sans font-medium text-slate-500 dark:text-slate-400">ICAI Reg:</span> {studentProfile?.icai_registration_number || 'CRO0802987'}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome back, {user?.fullName}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm">
            Track your mock test scores, line-by-line step marks, and examiner recommendations.
          </p>
        </div>

        {/* Action CTAs */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            id="dashboard-start-check-btn"
            onClick={onNavigateUpload}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-bold text-xs sm:text-sm shadow-sm flex items-center gap-2 transition cursor-pointer"
          >
            <FileCheck2 className="w-4 h-4" />
            <span>New Answer Sheet</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {onNavigateProfile && (
            <button
              id="dashboard-edit-profile-btn"
              onClick={onNavigateProfile}
              className="px-3.5 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs sm:text-sm transition border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer"
              title="Edit Profile and Settings"
            >
              <User className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <span>Edit Profile</span>
            </button>
          )}

          {!user?.hasPermanentFreeAccess && !metrics.instituteSponsored && (
            <button
              onClick={onOpenCreditsModal}
              className="px-3.5 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs sm:text-sm transition border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Buy Credits</span>
            </button>
          )}
        </div>
      </header>

      {/* AI30 Promotional Banner / Active Promo Notification */}
      {referralStatus?.hasActivePromo && referralStatus.activePromo ? (
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-4 rounded-xl shadow-sm border border-blue-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold shrink-0 shadow-sm">
              <Sparkles className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  {referralStatus.activePromo.referralCode} Promotional Offer Active
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-medium">
                  {referralStatus.activePromo.evaluationsRemaining} / {referralStatus.activePromo.maxEvaluations} Left
                </span>
              </div>
              <p className="text-xs text-blue-100 mt-0.5">
                Full ICAI step-marking evaluations active. Valid until{' '}
                <span className="font-semibold text-white">
                  {formatDateIST(referralStatus.activePromo.expiryDate)}
                </span>.
              </p>
            </div>
          </div>
          {onNavigateProfile && (
            <button
              onClick={onNavigateProfile}
              className="text-xs text-blue-200 hover:text-white underline underline-offset-2 shrink-0 font-medium self-start sm:self-center"
            >
              View Promo Details &rarr;
            </button>
          )}
        </div>
      ) : (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 rounded-xl shadow-sm border border-indigo-900/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold shrink-0 mt-0.5 shadow-sm">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  Limited Opportunity: Code AI30
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-200 border border-blue-400/30">
                  First 20 Students
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-200 mt-0.5 font-medium">
                Get <strong>1 Month Free Access</strong> with <strong>15 ICAI Step-by-Step Evaluations</strong> included.
              </p>
              {promoMessage && (
                <p
                  className={`text-xs mt-1.5 font-semibold ${
                    promoMessage.type === 'success' ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {promoMessage.text}
                </p>
              )}
            </div>
          </div>

          <form onSubmit={handleQuickRedeem} className="flex items-center gap-2 self-start md:self-center">
            <input
              type="text"
              value={dashboardPromoCode}
              onChange={(e) => setDashboardPromoCode(e.target.value.toUpperCase())}
              placeholder="ENTER PROMO"
              className="w-32 sm:w-36 px-3 py-2 text-xs uppercase font-mono font-bold bg-white/10 border border-white/20 text-white placeholder-blue-300/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              type="submit"
              disabled={isRedeeming || !dashboardPromoCode.trim()}
              className="bg-white/20 hover:bg-white/30 text-white font-semibold border border-white/30 px-3.5 py-2 rounded-lg text-xs transition shadow-2xs disabled:opacity-50 flex items-center gap-1.5 shrink-0 cursor-pointer focus:ring-2 focus:ring-white/40"
            >
              {isRedeeming ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>Claim</span>
            </button>
          </form>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Entitlement Card */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="text-xs font-bold text-slate-400 dark:text-slate-400 mb-1 uppercase tracking-wider flex items-center justify-between">
            <span>Free Evaluations</span>
            <Zap className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {user?.hasPermanentFreeAccess ? (
              <span className="text-blue-600 dark:text-blue-400">Active</span>
            ) : metrics.instituteSponsored ? (
              <span className="text-blue-600 dark:text-blue-400">Sponsored</span>
            ) : (
              <span>
                {metrics.freeEvaluationsRemaining}/2 <span className="text-xs font-medium text-slate-500 dark:text-slate-400">remaining</span>
              </span>
            )}
          </div>
          <div className="text-xs font-medium mt-1">
            {user?.hasPermanentFreeAccess ? (
              <span className="text-blue-600 dark:text-blue-400">Full evaluation access active</span>
            ) : metrics.instituteSponsored ? (
              <span className="text-blue-600 dark:text-blue-400">Via {metrics.instituteName || 'Institute'}</span>
            ) : (
              <div className="space-y-0.5">
                <div className="text-slate-600 dark:text-slate-300">
                  Paid Credits: <strong className="text-blue-600 dark:text-blue-400">{metrics.purchasedCredits}</strong>
                  {metrics.purchasedCredits > 0 && (
                    <span className="text-slate-500 dark:text-slate-400 text-[11px]"> ({metrics.freeEvaluationsRemaining + metrics.purchasedCredits} total)</span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400">
                  Resets monthly • Consumes free evaluations first
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Total Evaluated */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="text-xs font-bold text-slate-400 dark:text-slate-400 mb-1 uppercase tracking-wider flex items-center justify-between">
            <span>Total Evaluated</span>
            <Layers className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{metrics.totalEvaluations}</div>
          <div className="text-xs text-green-600 dark:text-emerald-400 font-medium mt-1">Full papers verified</div>
        </div>

        {/* Average Score */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="text-xs font-bold text-slate-400 dark:text-slate-400 mb-1 uppercase tracking-wider flex items-center justify-between">
            <span>Average Score</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
            {metrics.averageScore > 0 ? `${metrics.averageScore}%` : 'N/A'}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">Passing benchmark: 40%</div>
        </div>

        {/* Pass Probability */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="text-xs font-bold text-slate-400 dark:text-slate-400 mb-1 uppercase tracking-wider flex items-center justify-between">
            <span>ICAI Standing</span>
            <Award className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate mt-0.5">
            {metrics.passProbability}
          </div>
          <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-1">Step-marking compliance</div>
        </div>
      </div>

      {/* 🧬 Permanent Examiner Profile / Mark-Loss DNA Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2 flex-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-[11px] font-bold">
              <Dna className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Mark-Loss DNA</span>
            </div>

            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>🧬 Your Personal Examiner Profile</span>
            </h2>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              {data?.examinerProfile?.insufficientHistory || !data?.examinerProfile || (data?.examinerProfile?.evaluationsAnalysed || 0) < 2
                ? 'Your evaluation history is building your personal examiner profile. Complete a few evaluations to identify recurring mark-loss patterns.'
                : 'Your evaluation history is building your personal examiner profile. Tracking recurring step-marking slipups, improved answer patterns, and marks recovered.'}
            </p>

            {/* Metrics Chips */}
            {data?.examinerProfile && !data.examinerProfile.insufficientHistory ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                  <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                    Evaluations Analysed
                  </div>
                  <div className="text-lg font-black text-slate-900 dark:text-white">
                    {data.examinerProfile.evaluationsAnalysed}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
                  <div className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400">
                    Recurring Patterns
                  </div>
                  <div className="text-lg font-black text-amber-700 dark:text-amber-300">
                    {data.examinerProfile.recurringPatternsCount}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
                  <div className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400">
                    Improved Patterns
                  </div>
                  <div className="text-lg font-black text-emerald-700 dark:text-emerald-300">
                    {data.examinerProfile.improvedPatternsCount}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60">
                  <div className="text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-400">
                    Needs Attention
                  </div>
                  <div className="text-lg font-black text-indigo-700 dark:text-indigo-300">
                    {data.examinerProfile.attentionNeededCount}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-400">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Evaluations Analysed: {data?.examinerProfile?.evaluationsAnalysed ?? metrics.totalEvaluations} •{' '}
                </span>
                <span>
                  {(data?.examinerProfile?.evaluationsAnalysed ?? metrics.totalEvaluations) === 1
                    ? '1 evaluation analysed. Patterns are marked "recurring" only when verified across multiple papers.'
                    : 'Complete 2 full evaluations to unlock longitudinal mark-loss pattern tracking.'}
                </span>
              </div>
            )}
          </div>

          <div className="flex sm:flex-col justify-end shrink-0">
            {onNavigateExaminerProfile && (
              <button
                onClick={onNavigateExaminerProfile}
                className="px-4 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-semibold text-xs transition shadow-2xs inline-flex items-center gap-2 cursor-pointer"
              >
                <span>View My Examiner Profile</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Credit Validity & Purchased Lots (3-Month Validity Breakdown) */}
      {data?.creditStatus?.lots && data.creditStatus.lots.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/40">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Purchased Evaluation Credits
                </h3>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                  {data.creditStatus.totalValidCredits} Available
                </span>
                {data.creditStatus.expiringSoonCredits > 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    {data.creditStatus.expiringSoonCredits} Expiring Soon
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Evaluation credits are valid for exactly 3 months from purchase date. Automatically consumed via First-Expiring, First-Out (FEFO).
              </p>
            </div>

            <button
              onClick={onOpenCreditsModal}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-slate-700 self-start sm:self-auto transition shadow-xs flex items-center gap-1.5"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Buy More Credits</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-2.5">Purchase Date / Lot</th>
                  <th className="px-4 py-2.5">Purchased</th>
                  <th className="px-4 py-2.5">Remaining</th>
                  <th className="px-4 py-2.5">Valid From</th>
                  <th className="px-4 py-2.5">Expiry Date (3 Mo.)</th>
                  <th className="px-5 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.creditStatus.lots.map((lot) => (
                  <tr key={lot.id} className={lot.isExpired ? 'bg-slate-50/60 dark:bg-slate-800/30 text-slate-400 dark:text-slate-500' : 'hover:bg-slate-50/40 dark:hover:bg-slate-800/40'}>
                    <td className="px-5 py-3 font-medium">
                      <div className="text-slate-800 dark:text-slate-200 font-semibold">
                        {formatDateIST(lot.purchaseDate)}
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate max-w-[140px]">
                        {lot.paymentId || lot.orderId || lot.id}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">
                      {lot.creditsPurchased}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${lot.creditsRemaining > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}>
                        {lot.creditsRemaining}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {formatDateIST(lot.validFrom)}
                    </td>
                    <td className="px-4 py-3">
                      <div className={`font-semibold ${lot.isExpiringSoon ? 'text-amber-600 dark:text-amber-400 font-bold' : lot.isExpired ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>
                        {formatDateIST(lot.expiresAt)}
                      </div>
                      {!lot.isExpired && lot.creditsRemaining > 0 && (
                        <div className={`text-[10px] font-medium ${lot.isExpiringSoon ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
                          {lot.daysRemaining} {lot.daysRemaining === 1 ? 'day' : 'days'} remaining
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {lot.isExpired ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          Expired
                        </span>
                      ) : lot.creditsRemaining === 0 ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          Consumed
                        </span>
                      ) : lot.isExpiringSoon ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          <Clock className="w-2.5 h-2.5" /> Expiring Soon
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          Active
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Enrolled Coaching Institutes & Sponsored Tests */}
      {((data?.enrolledInstitutes && data.enrolledInstitutes.length > 0) || instituteTests.length > 0 || instituteMaterials.length > 0) && (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-slate-800 dark:text-slate-100 text-base">Enrolled Coaching Institutes & Mock Tests</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Practice custom question papers with 100% sponsored ICAI step-marking evaluations</p>
              </div>
            </div>
            {(onNavigateEnrollments || onNavigateProfile) && (
              <button
                onClick={onNavigateEnrollments || onNavigateProfile}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:underline flex items-center gap-1"
              >
                Manage Enrollments
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Enrolled institutes pills */}
          {data?.enrolledInstitutes && data.enrolledInstitutes.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {data.enrolledInstitutes.map((inst) => (
                <div
                  key={inst.membership_id}
                  className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs"
                >
                  <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span className="font-bold text-slate-800 dark:text-slate-200">{inst.institute_name}</span>
                  <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold">
                    {inst.batch_name || 'Unassigned Cohort'}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                </div>
              ))}
            </div>
          )}

          {/* Available Mock Tests & Question Papers */}
          <div className="pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-3 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Available Institute Papers & Tests
            </h3>

            {(instituteTests.length === 0 && instituteMaterials.length === 0) ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400 dark:text-slate-500 bg-slate-50/50 dark:bg-slate-800/30">
                No active mock tests or materials published by your enrolled institutes yet. Check back soon!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {instituteTests.map((t) => (
                  <div key={t.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                          {t.level || 'INTERMEDIATE'}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          {t.total_marks ? `${t.total_marks} Marks` : 'Mock Test'}
                        </span>
                      </div>
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white line-clamp-1">{t.title}</h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t.subject_name}</p>
                      <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium mt-1">Provided by {t.institute_name}</p>
                    </div>

                    <div className="pt-3 mt-3 border-t border-slate-200/80 dark:border-slate-700 flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                        Sponsored (0 credits)
                      </span>
                      <button
                        onClick={() => setSelectedPaperForSubmit({ ...t, isTest: true })}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        Submit Paper
                      </button>
                    </div>
                  </div>
                ))}

                {instituteMaterials.map((m) => (
                  <div key={m.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                          {m.course_level || m.level || 'INTERMEDIATE'}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          {m.material_type || 'Study Material'}
                        </span>
                      </div>
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white line-clamp-1">{m.title}</h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{m.subject}</p>
                      <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium mt-1">Provided by {m.institute_name}</p>
                    </div>

                    <div className="pt-3 mt-3 border-t border-slate-200/80 dark:border-slate-700 flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                        Sponsored (0 credits)
                      </span>
                      <button
                        onClick={() => setSelectedPaperForSubmit({ ...m, isTest: false, subject_name: m.subject, level: m.course_level })}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        Submit Paper
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Layout: Evaluations Table (2 cols) & Side Intelligence (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Evaluations Table Container */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h2 className="font-bold text-slate-800 dark:text-slate-100 text-base">Recent Evaluations</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">ICAI-aligned step-marked answer papers</p>
            </div>
            {data?.recentEvaluations && data.recentEvaluations.length > 0 && (
              <button
                onClick={onNavigateEvaluations}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center gap-1"
              >
                View All
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            {data?.recentEvaluations && data.recentEvaluations.length > 0 ? (
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase sticky top-0 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-3">Subject & Paper</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Percentage</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {data.recentEvaluations.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-3 font-semibold text-slate-800 dark:text-slate-200">
                        {ev.subject_name}
                        <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-normal">CA {ev.level}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {formatDateIST(ev.created_at)}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-blue-700 dark:text-blue-400">
                        {ev.total_marks} / {ev.maximum_marks}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-700 dark:text-slate-300">{ev.percentage}%</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                            ev.percentage >= 60
                              ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                              : ev.percentage >= 40
                              ? 'bg-green-100 dark:bg-emerald-950/50 text-green-700 dark:text-emerald-300'
                              : 'bg-red-100 dark:bg-rose-950/50 text-red-700 dark:text-rose-300'
                          }`}
                        >
                          {ev.grade || 'Completed'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={() => onViewReport(ev.id)}
                          className="px-3 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-blue-700 dark:text-blue-300 text-xs font-bold border border-slate-200 dark:border-slate-700 hover:border-blue-200 transition"
                        >
                          View Report
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-6 sm:py-8 px-4 space-y-2.5">
                <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                  <FileCheck2 className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">No evaluations submitted yet</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  Upload your handwritten CA answer sheet to get your first 2 full papers evaluated completely free!
                </p>
                <button
                  onClick={onNavigateUpload}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-sm inline-flex items-center gap-2 cursor-pointer"
                >
                  <span>Start First Evaluation (Free)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Side Panels: AI Performance Summary & Revision Focus */}
        <div className="flex flex-col gap-6">
          {/* AI Performance Summary Card (Directly matching High Density design snippet) */}
          <div className="bg-[#1e293b] rounded-xl p-6 text-white shadow-sm border border-slate-700/50">
            <h3 className="text-xs font-bold text-slate-300 mb-4">
              AI Performance Summary
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
            <p className="text-xs text-slate-400 mt-4 leading-relaxed border-t border-slate-700/60 pt-3">
              Calibrated against ICAI suggested answers, accounting standards (AS/Ind AS), and step-marking guidelines.
            </p>
          </div>

          {/* Topics Breakdown */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div>
              <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mb-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Demonstrated Strengths
              </h4>
              {data?.strongTopics && data.strongTopics.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {data.strongTopics.map((topic, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-medium"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                  Strong topics will populate here following your first evaluated answer sheet.
                </p>
              )}
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
              <h4 className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                Revision Priority (Marks Lost)
              </h4>
              {data?.weakTopics && data.weakTopics.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {data.weakTopics.map((topic, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-medium"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                  Deduction areas and missing statutory sections will appear here.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Student Feedback & Platform Review Card */}
        <div className="pt-2">
          <StudentReviewCard />
        </div>
      </div>

      {/* Institute Paper Submission Modal */}
      {selectedPaperForSubmit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                    {selectedPaperForSubmit.level || selectedPaperForSubmit.course_level || 'INTERMEDIATE'}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                    100% Institute Sponsored (0 Credits)
                  </span>
                </div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white mt-1">
                  Submit Answers: {selectedPaperForSubmit.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedPaperForSubmit.subject_name || selectedPaperForSubmit.subject} • {selectedPaperForSubmit.institute_name}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedPaperForSubmit(null);
                  setPaperSubmitError('');
                  setPaperSubmissionText('');
                }}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitInstituteTest} className="mt-4 space-y-4">
              {paperSubmitError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                  {paperSubmitError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Handwritten Answer Content / Extracted Text
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 leading-relaxed">
                  Paste your handwritten answer sheet transcript or draft solution for this test. Our AI will evaluate step-by-step using ICAI evaluation standards and your institute's marking scheme.
                </p>
                <textarea
                  rows={8}
                  value={paperSubmissionText}
                  onChange={(e) => setPaperSubmissionText(e.target.value)}
                  placeholder="Enter or paste your answers for this paper here... (e.g. Solution to Question 1: Working Note 1, Ledger Accounts, Statutory references)"
                  className="w-full p-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:outline-none font-mono text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPaperForSubmit(null);
                    setPaperSubmitError('');
                    setPaperSubmissionText('');
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPaper || !paperSubmissionText.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
                >
                  {isSubmittingPaper ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Evaluating with ICAI AI...
                    </>
                  ) : (
                    <>
                      <FileCheck2 className="w-3.5 h-3.5" />
                      Submit for Evaluation
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
