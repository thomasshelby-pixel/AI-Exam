import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Zap, ArrowRight, ShieldCheck, CreditCard, Sparkles, Building2, Users, Award } from 'lucide-react';

interface PricingPageProps {
  onNavigateRegister: () => void;
  onOpenCreditsModal?: () => void;
  isLoggedIn?: boolean;
}

export const PricingPage: React.FC<PricingPageProps> = ({
  onNavigateRegister,
  onOpenCreditsModal,
  isLoggedIn,
}) => {
  const navigate = useNavigate();
  const [audience, setAudience] = useState<'student' | 'institute'>('student');
  const [instituteCycle, setInstituteCycle] = useState<'MONTHLY' | 'QUARTERLY' | 'ANNUAL'>('ANNUAL');
  const [selectedQty, setSelectedQty] = useState<number>(10);
  const [customQty, setCustomQty] = useState<string>('');

  const currentQuantity = customQty ? Math.max(1, parseInt(customQty, 10) || 1) : selectedQty;
  const totalPrice = currentQuantity * 10;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-slate-800 space-y-10">
      {/* Header */}
      <div className="text-center space-y-3 max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          Transparent, Fair Pricing
        </span>
        <h1 className="text-2xl sm:text-4xl font-black text-slate-900">
          {audience === 'student' ? 'Simple, Honest Pricing for CA Aspirants' : 'Institutional Plans for CA Academies'}
        </h1>
        <p className="text-xs sm:text-sm text-slate-600">
          {audience === 'student'
            ? 'No monthly subscriptions or hidden lock-ins. Start with 2 free evaluations, then pay ₹10 flat per answer sheet.'
            : 'Equip your coaching academy with automated ICAI mock evaluations, batch rankings, and faculty analytics.'}
        </p>

        {/* Audience Toggle */}
        <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 mt-2">
          <button
            onClick={() => setAudience('student')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              audience === 'student' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>CA Students (Pay-Per-Paper)</span>
          </button>
          <button
            onClick={() => setAudience('institute')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              audience === 'institute' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Coaching Institutes & Faculties</span>
          </button>
        </div>
      </div>

      {/* STUDENT PRICING VIEW */}
      {audience === 'student' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Card 1: Free Registration */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-7 space-y-6 flex flex-col justify-between shadow-sm hover:border-slate-300 transition">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Free Tier</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Included with Signup
                </span>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-slate-900">₹0</span>
                <span className="text-xs text-slate-500">/ forever</span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Every newly registered CA student receives 2 full 100-mark answer sheet evaluations at zero cost.
              </p>

              <div className="pt-4 border-t border-slate-200 space-y-3 text-xs text-slate-700">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-medium">2 Full Answer Sheet Evaluations (FREE)</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>ICAI-Pattern Step Marking Breakdown</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Working Notes & Presentation Feedback</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Section 39 / MCQ Zero-Penalty Validation</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Instant Downloadable PDF Scorecard</span>
                </div>
              </div>
            </div>

            <button
              onClick={onNavigateRegister}
              className="w-full py-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold text-xs transition cursor-pointer text-center flex items-center justify-center gap-1.5"
            >
              <span>Claim 2 Free Evaluations</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 2: Pay As You Go / Buy Credits (Razorpay Powered) */}
          <div className="bg-white border-2 border-blue-600 rounded-xl p-6 sm:p-7 space-y-6 flex flex-col justify-between relative shadow-md">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full bg-blue-600 text-white shadow-sm flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Most Popular
            </span>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Evaluation Credits</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono">
                  ₹10 / paper
                </span>
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-black text-blue-600 font-mono">₹{totalPrice}</span>
                <span className="text-xs text-slate-500">for {currentQuantity} evaluation{currentQuantity > 1 ? 's' : ''}</span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Purchase evaluation credits instantly via Razorpay (UPI, Google Pay, PhonePe, Cards, Netbanking).
              </p>

              {/* Quick pack selector */}
              <div className="space-y-2 pt-2">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">Choose Credit Pack</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { qty: 5, label: '5 Papers', price: 50 },
                    { qty: 10, label: '10 Papers', price: 100 },
                    { qty: 20, label: '20 Papers', price: 200 },
                  ].map((pack) => {
                    const isSelected = !customQty && selectedQty === pack.qty;
                    return (
                      <button
                        key={pack.qty}
                        type="button"
                        onClick={() => {
                          setSelectedQty(pack.qty);
                          setCustomQty('');
                        }}
                        className={`p-2 rounded-lg border text-center transition cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50 border-blue-600 text-blue-900 font-bold shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="text-xs font-bold">{pack.label}</div>
                        <div className="text-xs font-mono text-blue-600 font-bold">₹{pack.price}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Quantity */}
              <div className="pt-1">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="500"
                    placeholder="Custom quantity (e.g. 15)"
                    value={customQty}
                    onChange={(e) => setCustomQty(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                  <span className="text-xs text-slate-500 shrink-0 font-medium font-mono">@ ₹10/paper</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 space-y-2 text-xs text-slate-700">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>10 Evaluations = ₹100 Flat Rate</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Credits valid for 3 months from purchase</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Each purchase has a separate 3-month validity period.</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Zero credit deduction if upload is not a genuine paper</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                if (isLoggedIn && onOpenCreditsModal) {
                  onOpenCreditsModal();
                } else {
                  onNavigateRegister();
                }
              }}
              className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <CreditCard className="w-4 h-4" />
              <span>{isLoggedIn ? `Buy ${currentQuantity} Credits (₹${totalPrice})` : 'Sign Up & Buy Credits'}</span>
            </button>
          </div>
        </div>
      )}

      {/* INSTITUTE PRICING VIEW */}
      {audience === 'institute' && (
        <div className="space-y-8">
          {/* Cycle Selector Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Choose Institutional Billing Cycle</h3>
              <p className="text-xs text-slate-500">
                All plans include dedicated ICAI step marking, faculty batch management, and performance tracking.
              </p>
            </div>

            <div className="inline-flex p-1 bg-slate-200/80 rounded-lg border border-slate-300 text-xs">
              <button
                type="button"
                onClick={() => setInstituteCycle('MONTHLY')}
                className={`px-3.5 py-1.5 rounded-md font-bold transition cursor-pointer ${
                  instituteCycle === 'MONTHLY' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setInstituteCycle('QUARTERLY')}
                className={`px-3.5 py-1.5 rounded-md font-bold transition cursor-pointer flex items-center gap-1 ${
                  instituteCycle === 'QUARTERLY' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Quarterly</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-semibold">Save 15%</span>
              </button>
              <button
                type="button"
                onClick={() => setInstituteCycle('ANNUAL')}
                className={`px-3.5 py-1.5 rounded-md font-bold transition cursor-pointer flex items-center gap-1 ${
                  instituteCycle === 'ANNUAL' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Annual</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded font-semibold">Save 35%</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Tier 1: Individual Institute */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between shadow-xs hover:border-slate-300 transition">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-base font-bold text-slate-900">Individual Institute</h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    0–500 Students
                  </span>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-slate-900 font-mono">
                    {instituteCycle === 'MONTHLY' ? '₹80,000' : instituteCycle === 'QUARTERLY' ? '₹1,29,999' : '₹3,49,999'}
                  </span>
                  <span className="text-xs text-slate-500">
                    / {instituteCycle.toLowerCase().replace('ly', '')}
                  </span>
                </div>

                <p className="text-xs text-slate-600">
                  Ideal for solo CA faculties, single-subject coaching centres, and boutique batches managing up to 500 enrolled students.
                </p>

                <div className="pt-4 border-t border-slate-100 space-y-2.5 text-xs text-slate-700">
                  <div className="flex items-center gap-2 font-medium text-slate-900">
                    <Users className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>500 Enrolled Student Seats</span>
                  </div>
                  <div className="flex items-center gap-2 font-medium text-slate-900">
                    <Zap className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      {instituteCycle === 'MONTHLY' ? '1,000' : instituteCycle === 'QUARTERLY' ? '2,000' : '10,000'} Evaluations / cycle
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Unique Student Join Code</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Institute Mock Test Scheduler</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Rankings & Batch Leaderboards</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Standard Faculty Support (24h SLA)</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <button
                  onClick={() => navigate('/institute/register')}
                  className="w-full py-2.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold text-xs transition cursor-pointer text-center"
                >
                  Register Individual Institute
                </button>
              </div>
            </div>

            {/* Tier 2: Mid Institute */}
            <div className="bg-white border-2 border-indigo-600 rounded-xl p-6 flex flex-col justify-between relative shadow-md">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full bg-indigo-600 text-white shadow-sm flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Most Popular for Academies
              </span>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-base font-bold text-slate-900">Mid Institute</h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                    501–1,500 Students
                  </span>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-indigo-700 font-mono">
                    {instituteCycle === 'MONTHLY' ? '₹1,09,999' : instituteCycle === 'QUARTERLY' ? '₹3,29,999' : '₹8,99,999'}
                  </span>
                  <span className="text-xs text-slate-500">
                    / {instituteCycle.toLowerCase().replace('ly', '')}
                  </span>
                </div>

                <p className="text-xs text-slate-600">
                  Comprehensive automated evaluation suite for established CA coaching institutions with multiple concurrent batches.
                </p>

                <div className="pt-4 border-t border-slate-100 space-y-2.5 text-xs text-slate-700">
                  <div className="flex items-center gap-2 font-medium text-slate-900">
                    <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>1,500 Enrolled Student Seats</span>
                  </div>
                  <div className="flex items-center gap-2 font-medium text-slate-900">
                    <Zap className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      {instituteCycle === 'MONTHLY' ? '2,000' : instituteCycle === 'QUARTERLY' ? '8,000' : '30,000'} Evaluations / cycle
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>Multi-Batch Subject Tracking</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>Custom Watermarked Checked Copies</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>Direct Scorecard PDF Export</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>Priority Evaluation Queue & Faculty SLA (12h)</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <button
                  onClick={() => navigate('/institute/register')}
                  className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition shadow-sm cursor-pointer text-center"
                >
                  Get Started with Mid Institute
                </button>
              </div>
            </div>

            {/* Tier 3: Enterprise Institute */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between shadow-xs hover:border-slate-300 transition">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-base font-bold text-slate-900">Enterprise Institute</h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    1,501–5,000 Students
                  </span>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-slate-900 font-mono">
                    {instituteCycle === 'MONTHLY' ? '₹2,75,000' : instituteCycle === 'QUARTERLY' ? '₹6,84,000' : '₹15,00,000'}
                  </span>
                  <span className="text-xs text-slate-500">
                    / {instituteCycle.toLowerCase().replace('ly', '')}
                  </span>
                </div>

                <p className="text-xs text-slate-600">
                  Maximum capacity and high-throughput evaluation pipeline for premier pan-India CA coaching institutions.
                </p>

                <div className="pt-4 border-t border-slate-100 space-y-2.5 text-xs text-slate-700">
                  <div className="flex items-center gap-2 font-medium text-slate-900">
                    <Users className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>5,000 Enrolled Student Seats</span>
                  </div>
                  <div className="flex items-center gap-2 font-medium text-slate-900">
                    <Zap className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      {instituteCycle === 'MONTHLY' ? '5,500' : instituteCycle === 'QUARTERLY' ? '18,000' : '60,000'} Evaluations / cycle
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Pan-India Multi-Branch Architecture</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Custom Watermarked Checked Copies</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Dedicated Pan-India Account Manager (4h SLA)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Automated Batch Result Broadcast & White-labeling</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <button
                  onClick={() => navigate('/institute/register')}
                  className="w-full py-2.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold text-xs transition cursor-pointer text-center"
                >
                  Register Enterprise Institute
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trust & Guarantee Banner */}
      <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Razorpay 256-Bit SSL</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Bank-grade encryption supporting all UPI apps, RuPay, Visa, Mastercard, and Netbanking.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
            <Zap className="w-4 h-4 text-blue-600" />
            <span>Instant Credit Activation</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Credits reflect in your account immediately upon payment verification with full ledger audit.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
            <CheckCircle2 className="w-4 h-4 text-indigo-600" />
            <span>Document Safeguards</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Non-CA files or accidental blank uploads are automatically rejected with zero credit loss.
          </p>
        </div>
      </div>

      {/* Pricing FAQs */}
      <div className="max-w-3xl mx-auto space-y-4 pt-6">
        <h3 className="text-lg font-bold text-slate-900 text-center">Frequently Asked Questions</h3>
        <div className="space-y-3 text-xs">
          <div className="p-4 rounded-lg bg-white border border-slate-200 space-y-1 shadow-sm">
            <h4 className="font-bold text-slate-900">How do student evaluation credits work?</h4>
            <p className="text-slate-600 leading-relaxed">
              1 credit allows 1 complete handwritten answer sheet evaluation (up to 100 marks) with full question-wise step marking and examiner feedback.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-white border border-slate-200 space-y-1 shadow-sm">
            <h4 className="font-bold text-slate-900">How does institutional billing operate?</h4>
            <p className="text-slate-600 leading-relaxed">
              Institutes subscribe annually for a fixed seat and monthly evaluation capacity. Student submissions made through scheduled institute mock tests draw from the institute’s quota without charging the students.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-white border border-slate-200 space-y-1 shadow-sm">
            <h4 className="font-bold text-slate-900">What happens if my upload is rejected?</h4>
            <p className="text-slate-600 leading-relaxed">
              If our document safeguard identifies that an uploaded file is not a genuine CA answer sheet (e.g. an admit card or blurry blank photo), the evaluation is terminated and zero credits are deducted.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
