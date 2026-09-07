import React from 'react';
import {
  FileCheck2,
  CheckCircle2,
  Scale,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  BookOpen,
  Award,
  Clock,
  Layers,
  HelpCircle,
} from 'lucide-react';

interface LandingPageProps {
  onNavigateRegister: () => void;
  onNavigateLogin: () => void;
  onNavigatePricing: () => void;
  onNavigateHowItWorks: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigateRegister,
  onNavigateLogin,
  onNavigatePricing,
  onNavigateHowItWorks,
}) => {
  return (
    <div className="text-slate-800 space-y-16 py-8">
      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
          <Sparkles className="w-3.5 h-3.5" />
          <span>India&apos;s Dedicated ICAI Step-Marking AI Engine</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 max-w-4xl mx-auto leading-[1.2]">
          Evaluate Handwritten <span className="text-blue-600">CA Answer Sheets</span> with Real ICAI Step Marking
        </h1>

        <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Stop waiting 2 weeks for test series checking. Upload your handwritten mock answers and get rigorous, line-by-line
          ICAI step marking, working notes evaluation, and examiner deduction remarks in under 60 seconds.
        </p>

        {/* CTA Buttons */}
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
            className="w-full sm:w-auto px-5 py-3 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm transition border border-slate-300 shadow-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-blue-600" />
            <span>How Step Marking Works</span>
          </button>
        </div>

        {/* Value trust bullets */}
        <div className="flex flex-wrap items-center justify-center gap-5 text-xs text-slate-500 pt-2">
          <span className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> 2 Free Evaluations Upon Registration
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Zero MCQ Negative Marking for Inter & Final
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Flat ₹10 / Paper Thereafter
          </span>
        </div>
      </section>

      {/* Interactive Feature Grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center space-y-1.5">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900">Engineered Exclusively for CA Aspirants</h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto">
            Unlike generic AI tools, CA Exam Checker AI is programmed with the exact examination patterns, suggested answers, and marking rubrics of ICAI.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1 */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3 shadow-sm hover:border-slate-300 transition">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
              <Scale className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Genuine Step-Marking Rubric</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              If your final numerical answer is incorrect due to a ledger slip, you still receive marks for correct journal entries,
              formula application, and working note computations.
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3 shadow-sm hover:border-slate-300 transition">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Document Vision Safeguard</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Our vision model verifies that the uploaded file is an actual handwritten CA answer sheet. Non-exam files (admit cards, random photos, certificates) are rejected automatically with zero credit loss.
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3 shadow-sm hover:border-slate-300 transition">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Zero MCQ Negative Marking Rule</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Strict compliance with ICAI exam bylaws: CA Intermediate and CA Final 30-mark case scenarios feature strictly zero negative marking, while Foundation follows the 0.25 rule.
            </p>
          </div>
        </div>
      </section>

      {/* Levels Covered Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="text-center space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900">Complete Curriculum Coverage</h2>
            <p className="text-xs sm:text-sm text-slate-500">Supported across all 3 tiers of the Chartered Accountancy examination</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-[11px] font-bold font-mono text-blue-600 uppercase">Tier 1</span>
              <h4 className="text-base font-bold text-slate-900">CA Foundation</h4>
              <p className="text-xs text-slate-600">
                Accounting, Business Laws, Quantitative Aptitude (Maths, Stats, LR), Business Economics.
              </p>
              <div className="pt-1 text-[11px] text-slate-500">Includes 0.25 negative marking on Paper 3 & 4.</div>
            </div>

            <div className="p-5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-[11px] font-bold font-mono text-blue-600 uppercase">Tier 2</span>
              <h4 className="text-base font-bold text-slate-900">CA Intermediate</h4>
              <p className="text-xs text-slate-600">
                Advanced Accounting, Corporate & Other Laws, Taxation, Cost & Management Accounting, Auditing & Ethics, FM-SM.
              </p>
              <div className="pt-1 text-[11px] text-emerald-700 font-semibold">Strictly 0 negative marking on 30% MCQs.</div>
            </div>

            <div className="p-5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-[11px] font-bold font-mono text-blue-600 uppercase">Tier 3</span>
              <h4 className="text-base font-bold text-slate-900">CA Final</h4>
              <p className="text-xs text-slate-600">
                Financial Reporting (Ind AS), Advanced Financial Management, Advanced Auditing, Direct Tax & International Tax, Indirect Tax Laws.
              </p>
              <div className="pt-1 text-[11px] text-emerald-700 font-semibold">Ind AS & Standards on Auditing benchmarking.</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Box */}
      <section className="max-w-4xl mx-auto px-4 text-center">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-8 space-y-4 shadow-sm">
          <h2 className="text-2xl font-black text-slate-900">Ready to Check Your Next Answer Sheet?</h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto">
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
    </div>
  );
};
