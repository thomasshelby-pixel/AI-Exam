import React, { useState } from 'react';
import { CheckCircle2, Zap, ArrowRight, ShieldCheck, CreditCard, Sparkles } from 'lucide-react';

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
  const [selectedQty, setSelectedQty] = useState<number>(10);
  const [customQty, setCustomQty] = useState<string>('');

  const currentQuantity = customQty ? Math.max(1, parseInt(customQty, 10) || 1) : selectedQty;
  const totalPrice = currentQuantity * 10;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-slate-800 space-y-12">
      {/* Header */}
      <div className="text-center space-y-2.5 max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          Transparent Student Pricing
        </span>
        <h1 className="text-2xl sm:text-4xl font-black text-slate-900">Simple, Honest Pricing for CA Aspirants</h1>
        <p className="text-xs sm:text-sm text-slate-600">
          No subscriptions or hidden fees. Start with 2 free evaluations, then pay ₹10 flat per answer sheet.
        </p>
      </div>

      {/* Pricing Cards (Student Focused: Free Tier & Pay-As-You-Go Credits) */}
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
                <span>ICAI Official Step Marking Breakdown</span>
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
                <span>Credits never expire — valid across all exam attempts</span>
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
            <h4 className="font-bold text-slate-900">How do evaluation credits work?</h4>
            <p className="text-slate-600 leading-relaxed">
              1 credit allows 1 complete handwritten answer sheet evaluation (up to 100 marks) with full question-wise step marking and examiner feedback.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-white border border-slate-200 space-y-1 shadow-sm">
            <h4 className="font-bold text-slate-900">What happens if my upload is rejected?</h4>
            <p className="text-slate-600 leading-relaxed">
              If our document safeguard identifies that an uploaded file is not a genuine CA answer sheet (e.g. an admit card or blurry blank photo), the evaluation is terminated and zero credits are deducted.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-white border border-slate-200 space-y-1 shadow-sm">
            <h4 className="font-bold text-slate-900">Do evaluation credits expire?</h4>
            <p className="text-slate-600 leading-relaxed">
              No. Any credits you purchase remain permanently in your account balance until you choose to use them across any CA exam attempt.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
