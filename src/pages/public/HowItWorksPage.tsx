import React from 'react';
import { FileCheck2, Scale, ShieldCheck, Zap, BookOpen, CheckCircle2, ArrowRight } from 'lucide-react';

interface HowItWorksPageProps {
  onNavigateRegister: () => void;
}

export const HowItWorksPage: React.FC<HowItWorksPageProps> = ({ onNavigateRegister }) => {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-slate-800 space-y-12">
      <div className="text-center space-y-2.5 max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          Academic Rigor
        </span>
        <h1 className="text-2xl sm:text-4xl font-black text-slate-900">How AI Step Marking Works</h1>
        <p className="text-xs sm:text-sm text-slate-600">
          Understanding the mathematical precision and ICAI rubric calibration behind every evaluated answer sheet.
        </p>
      </div>

      {/* 4 Steps Section */}
      <div className="space-y-4">
        {[
          {
            step: '01',
            title: 'Answer Sheet Ingestion & Authenticity Check',
            desc: 'When you upload your handwritten PDF or photos, our document safeguard first verifies that the file contains actual handwritten calculations or theoretical answers. Admit cards, hall tickets, and blank pages are intercepted immediately with 0 credit deduction.',
          },
          {
            step: '02',
            title: 'Optical Handwriting & Structure Extraction',
            desc: 'The engine reads handwritten text, ledger accounts, cash flow statements, and balance sheets. It accurately indexes Question 1(a), 1(b), 2, 3, matching your solutions against the specific question paper structure.',
          },
          {
            step: '03',
            title: 'ICAI Step-by-Step Marking & Standard Citations',
            desc: 'Marks are allocated for every valid intermediate step — journal entries, basic definitions, statutory sections (e.g. Companies Act 2013, Income Tax Act 1961), Accounting Standards (AS/Ind AS), and Standards on Auditing (SAs).',
          },
          {
            step: '04',
            title: 'Mathematical Sum Verification & Detailed Scorecard',
            desc: 'The evaluator confirms that the sum of all individual step marks precisely equals the total marks awarded. For CA Intermediate and Final, 30% MCQs receive strictly 0 negative marking in full accordance with ICAI guidelines.',
          },
        ].map((item) => (
          <div key={item.step} className="p-5 sm:p-6 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row gap-5 items-start shadow-sm">
            <div className="text-2xl font-black font-mono text-blue-600 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 shrink-0">
              {item.step}
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ICAI Zero Negative Marking Rule Callout */}
      <div className="p-6 rounded-xl bg-blue-50 border border-blue-200 space-y-2.5 shadow-sm">
        <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
          <Scale className="w-4 h-4 text-blue-600" />
          <span>ICAI Zero Negative Marking Compliance Guarantee</span>
        </h3>
        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
          In generic online grading tools, candidates frequently see negative marks deducted for wrong answers on CA Intermediate or CA Final papers.
          At CA Exam Checker AI, our evaluation prompt and logic strictly enforce ICAI&apos;s statutory exam policy:
          <strong> Zero negative marking on CA Intermediate and CA Final 30-mark case scenarios</strong>. Only CA Foundation Papers 3 and 4 have 0.25 negative marking applied.
        </p>
      </div>

      <div className="text-center pt-2">
        <button
          onClick={onNavigateRegister}
          className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm transition shadow-sm inline-flex items-center gap-2 cursor-pointer"
        >
          <span>Try 2 Free Evaluations Now</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
