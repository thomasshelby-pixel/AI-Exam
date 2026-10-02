import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Scale,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  BookOpen,
  Lock,
  Star,
  MessageSquare,
  ThumbsUp,
  FileCheck2,
  Award,
  Target,
} from 'lucide-react';
import { BrandLogo } from '../../components/common/BrandLogo';
import { ComingSoonModal, ComingSoonExamType } from '../../components/common/ComingSoonModal.js';
import { VerifiedStudentBadge } from '../../components/common/VerifiedBadges.js';
import { apiRequest } from '../../api/client.js';
import { StudentReview } from '../../types/index.js';

interface LandingPageProps {
  onNavigateRegister: () => void;
  onNavigateLogin?: () => void;
  onNavigatePricing: () => void;
  onNavigateHowItWorks: () => void;
  onNavigateReviews?: () => void;
  initialSection?: string;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigateRegister,
  onNavigatePricing,
  onNavigateHowItWorks,
  onNavigateReviews,
  initialSection,
}) => {
  const [modalExam, setModalExam] = useState<ComingSoonExamType | null>(null);
  const [sampleReviews, setSampleReviews] = useState<StudentReview[]>([]);
  const [reviewStats, setReviewStats] = useState<{
    totalReviews: number;
    averageRating: number;
  }>({ totalReviews: 0, averageRating: 0 });

  useEffect(() => {
    if (initialSection === 'features' || window.location.hash === '#features') {
      setTimeout(() => {
        const el = document.getElementById('features');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  }, [initialSection]);

  useEffect(() => {
    const fetchLandingReviews = async () => {
      try {
        const res = await apiRequest<{
          reviews: StudentReview[];
          stats: { totalReviews: number; averageRating: number };
        }>('/api/reviews?limit=3&sort=most_liked');
        if (res.reviews) {
          setSampleReviews(res.reviews.slice(0, 3));
        }
        if (res.stats) {
          setReviewStats(res.stats);
        }
      } catch {
        // Fallback silently if unauthenticated or error
      }
    };
    fetchLandingReviews();
  }, []);

  return (
    <div className="text-slate-800 dark:text-slate-100 space-y-12 py-6">
      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-5">
        {/* Examination Choice Bar with Distinct Coming-Soon Affordance */}
        <div className="inline-flex items-center gap-2 p-1.5 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 shadow-2xs">
          <span className="px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center gap-1 shadow-2xs">
            <CheckCircle2 className="w-3 h-3" /> CA (Active)
          </span>
          <button
            type="button"
            onClick={() => setModalExam('CS')}
            aria-label="CS examination checking coming soon"
            className="px-2.5 py-1 rounded-full bg-transparent hover:bg-slate-200/60 dark:hover:bg-slate-700/60 text-slate-500 dark:text-slate-400 text-xs font-medium border border-dashed border-slate-300 dark:border-slate-600 flex items-center gap-1.5 transition cursor-pointer"
          >
            <Lock className="w-3 h-3 text-slate-400" />
            <span>CS</span>
            <span className="text-[10px] text-slate-400 font-normal">(Coming Soon)</span>
          </button>
          <button
            type="button"
            onClick={() => setModalExam('CMA')}
            aria-label="CMA examination checking coming soon"
            className="px-2.5 py-1 rounded-full bg-transparent hover:bg-slate-200/60 dark:hover:bg-slate-700/60 text-slate-500 dark:text-slate-400 text-xs font-medium border border-dashed border-slate-300 dark:border-slate-600 flex items-center gap-1.5 transition cursor-pointer"
          >
            <Lock className="w-3 h-3 text-slate-400" />
            <span>CMA</span>
            <span className="text-[10px] text-slate-400 font-normal">(Coming Soon)</span>
          </button>
        </div>

        <div>
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-bold shadow-2xs">
            <Sparkles className="w-3.5 h-3.5" />
            <span>India&apos;s Dedicated CA Examination-Style AI Evaluation Platform</span>
          </div>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-white max-w-4xl mx-auto leading-[1.2]">
          Evaluate Handwritten <span className="text-blue-600 dark:text-blue-400">CA Answer Sheets</span> with Examination-Style AI Step Marking
        </h1>

        {/* Readability Optimized Hero Subtext */}
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-xl mx-auto leading-relaxed">
          Stop waiting 2 weeks for test series checking. Upload your handwritten mock answers and get rigorous, line-by-line
          examination-style step marking, working notes evaluation, and examiner deduction remarks in under 60 seconds.
        </p>

        {/* Standardized Primary & Secondary CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
          <button
            onClick={onNavigateRegister}
            className="w-full sm:w-auto px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Claim 2 Free Evaluations</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={onNavigateHowItWorks}
            className="w-full sm:w-auto px-5 py-3 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm transition border border-slate-300 dark:border-slate-700 shadow-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>How Step Marking Works</span>
          </button>
        </div>

        {/* Value trust bullets */}
        <div className="flex flex-wrap items-center justify-center gap-5 text-xs text-slate-500 dark:text-slate-400 pt-1">
          <span className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> 2 Free Evaluations Upon Registration
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Paper-Specific ICAI MCQ Scoring Rules
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Transparent Combos & Custom Pricing Thereafter
          </span>
        </div>
      </section>

      {/* Comprehensive Platform Features Section & Capabilities List */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 scroll-mt-20">
        <div className="text-center space-y-2.5 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-bold border border-blue-200 dark:border-blue-800 shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Platform Features</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Engineered Exclusively for CA Aspirants
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Unlike generic AI tools, CA Exam Checker AI is calibrated to ICAI examination standards, suggested answers, statutory provisions, and structured step-marking rubrics.
          </p>
        </div>

        {/* 6 Core Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Feature 1 */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Scale className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Genuine Step-Marking Rubric</h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              If your final numerical answer is incorrect due to a ledger slip, you still receive full step marks for correct journal entries, formula application, and working note computations.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Document Vision Safeguard</h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Our vision model verifies that the uploaded file is an authentic handwritten CA answer copy. Non-exam files (admit cards, random photos, certificates) are intercepted automatically with 0 credit deduction guarantee.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Paper-Specific MCQ Scoring Rules</h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Full compliance with ICAI examination guidelines: 0 negative marking for Intermediate and Final MCQs, with precise -0.25 negative marking applied specifically for Foundation Quantitative Aptitude and Business Economics.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Annotated Checked Copy PDF</h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Download your checked answer copy annotated with red examiner markings, question-wise score badges, margin remarks, and step mark tally on each attempted answer page.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition">
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Statutory & Standards Benchmarking</h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Rigorous verification against Companies Act 2013, Income Tax Act 1961, GST provisions, Ind AS, Accounting Standards (AS), and Standards on Auditing (SAs) with official citations.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition">
            <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Target className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Personal Examiner Profile & Analytics</h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Track recurring deduction patterns across test papers, identify high-yield working note improvements, and monitor marks recovered as your exam date approaches.
            </p>
          </div>
        </div>

        {/* Feature Capabilities Highlight Checklist */}
        <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-7">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4 text-center sm:text-left">
            Platform Capabilities Included With Every Evaluation
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs text-slate-700 dark:text-slate-300">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span><strong>Under 60s Turnaround:</strong> No 2-week delays; immediate step feedback.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span><strong>2 Free Checks / Mo:</strong> Full 100-mark mock evaluations at zero cost on registration.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span><strong>Zero Score Drift:</strong> Single authoritative ledger ensures 100% score parity.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span><strong>All 3 CA Tiers:</strong> Calibrated for CA Foundation, Intermediate, and Final.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Transparent Student Feedback & Reviews Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Transparent &amp; Verified Feedback</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                What CA Students Are Saying
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-xl">
                Only students with verified real evaluations can post reviews. Unfiltered feedback from Foundation, Intermediate, and Final aspirants.
              </p>
            </div>

            {onNavigateReviews && (
              <button
                type="button"
                onClick={onNavigateReviews}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 font-bold text-xs transition self-start sm:self-auto cursor-pointer"
              >
                <span>Read All Reviews</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {sampleReviews.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {sampleReviews.map((rev) => (
                <div
                  key={rev.id}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center text-amber-400">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-3.5 h-3.5 ${
                              s <= rev.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                        CA {rev.caLevel}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 dark:text-slate-200 italic line-clamp-4 leading-relaxed">
                      "{rev.reviewText}"
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {rev.displayName}
                      </span>
                      <VerifiedStudentBadge showText={false} />
                    </div>

                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <ThumbsUp className="w-3 h-3 text-slate-400" />
                      {rev.likesCount || 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center space-y-2">
              <MessageSquare className="w-8 h-8 text-blue-500 mx-auto opacity-70" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Join our community of Chartered Accountancy aspirants.
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Complete your first evaluation and share your authentic feedback with fellow CA students.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Levels Covered Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="text-center space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">Complete Curriculum Coverage</h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Supported across all 3 tiers of the Chartered Accountancy examination</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between h-full">
              <div className="space-y-2">
                <span className="text-[11px] font-bold font-mono text-blue-600 dark:text-blue-400 uppercase">Tier 1</span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">CA Foundation</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Accounting, Business Laws, Quantitative Aptitude, Business Economics.
                </p>
              </div>
              <div className="pt-3 mt-4 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px] text-blue-700 dark:text-blue-400 font-semibold">
                ICAI paper-specific rules (-0.25 on QA &amp; Eco).
              </div>
            </div>

            <div className="p-5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between h-full">
              <div className="space-y-2">
                <span className="text-[11px] font-bold font-mono text-blue-600 dark:text-blue-400 uppercase">Tier 2</span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">CA Intermediate</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Advanced Accounting, Corporate & Other Laws, Taxation, Cost & Management Accounting, Auditing & Ethics, FM-SM.
                </p>
              </div>
              <div className="pt-3 mt-4 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                Strictly 0 negative marking on 30% MCQs.
              </div>
            </div>

            <div className="p-5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between h-full">
              <div className="space-y-2">
                <span className="text-[11px] font-bold font-mono text-blue-600 dark:text-blue-400 uppercase">Tier 3</span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">CA Final</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Financial Reporting (Ind AS), Advanced Financial Management, Advanced Auditing, Direct Tax & International Tax, Indirect Tax Laws.
                </p>
              </div>
              <div className="pt-3 mt-4 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                Ind AS & Standards on Auditing benchmarking.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Box */}
      <section className="max-w-4xl mx-auto px-4 text-center">
        <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl p-8 space-y-4 shadow-sm">
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">Ready to Check Your Next Answer Sheet?</h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-xl mx-auto">
            Sign up with your ICAI registration number and get your first 2 complete answer sheets evaluated with full step marks today.
          </p>
          <button
            onClick={onNavigateRegister}
            className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition shadow-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <span>Get Started Free</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {modalExam && (
        <ComingSoonModal
          isOpen={!!modalExam}
          examType={modalExam}
          onClose={() => setModalExam(null)}
        />
      )}
    </div>
  );
};
