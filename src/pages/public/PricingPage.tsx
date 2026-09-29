import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Zap, ArrowRight, ShieldCheck, CreditCard, Sparkles, Building2, Users, Award, Lock, Layers } from 'lucide-react';
import { ComingSoonModal, ComingSoonExamType } from '../../components/common/ComingSoonModal.js';

interface PricingPageProps {
  onNavigateRegister: () => void;
  onOpenCreditsModal?: (config?: {
    tab?: 'COMBO' | 'CUSTOM';
    plan?: 'COMBO_1' | 'COMBO_2';
    level?: 'FOUNDATION' | 'INTERMEDIATE';
    quantity?: number;
  }) => void;
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
  const [comboLevel, setComboLevel] = useState<'FOUNDATION' | 'INTERMEDIATE'>('INTERMEDIATE');
  const [customQtyInput, setCustomQtyInput] = useState<string>('5');
  const [modalExam, setModalExam] = useState<ComingSoonExamType | null>(null);

  // Custom evaluation calculations
  const parsedCustomQty = parseInt(customQtyInput.trim(), 10);
  const isCustomValid =
    Number.isInteger(parsedCustomQty) &&
    parsedCustomQty > 0 &&
    parsedCustomQty <= 500 &&
    String(parsedCustomQty) === customQtyInput.trim();
  const validatedCustomQty = isCustomValid ? parsedCustomQty : 1;
  const customTotalPrice = isCustomValid ? validatedCustomQty * 35 : 0;

  // Combo plans configuration
  const comboPlans = {
    COMBO_1: {
      id: 'COMBO_1' as const,
      name: 'Combo 1',
      badge: 'Starter Pack',
      FOUNDATION: { evaluations: 4, price: 119 },
      INTERMEDIATE: { evaluations: 6, price: 175 },
    },
    COMBO_2: {
      id: 'COMBO_2' as const,
      name: 'Combo 2',
      badge: 'Best Value',
      FOUNDATION: { evaluations: 8, price: 219 },
      INTERMEDIATE: { evaluations: 12, price: 329 },
    },
  };

  const handleBuyCustom = () => {
    if (!isCustomValid) return;
    if (isLoggedIn && onOpenCreditsModal) {
      onOpenCreditsModal({ tab: 'CUSTOM', quantity: validatedCustomQty });
    } else {
      onNavigateRegister();
    }
  };

  const handleBuyCombo = (plan: 'COMBO_1' | 'COMBO_2') => {
    if (isLoggedIn && onOpenCreditsModal) {
      onOpenCreditsModal({ tab: 'COMBO', plan, level: comboLevel });
    } else {
      onNavigateRegister();
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-slate-800 dark:text-slate-100 space-y-10">
      {/* Header */}
      <div className="text-center space-y-3 max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          Transparent, Fair Pricing
        </span>
        <h1 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white">
          {audience === 'student' ? 'Simple, Honest Pricing for CA Aspirants' : 'Institutional Plans for CA Academies'}
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
          {audience === 'student'
            ? 'Start with 2 free evaluations every month. Choose affordable Combo plans or custom pay-per-paper evaluation.'
            : 'Equip your coaching academy with automated ICAI mock evaluations, batch rankings, and faculty analytics.'}
        </p>

        {/* Audience Toggle */}
        <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl border border-slate-200 dark:border-slate-700 mt-2">
          <button
            onClick={() => setAudience('student')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              audience === 'student'
                ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>CA Students (Combos & Custom)</span>
          </button>
          <button
            onClick={() => setAudience('institute')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              audience === 'institute'
                ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Coaching Institutes & Faculties</span>
          </button>
        </div>

        {/* Examination Type Status */}
        <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Supported Examinations:</span>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
            <CheckCircle2 className="w-3 h-3" /> CA (Active)
          </span>
          <button
            type="button"
            onClick={() => setModalExam('CS')}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-semibold hover:border-slate-300 transition cursor-pointer"
          >
            <Lock className="w-2.5 h-2.5 text-slate-400" /> CS (Coming Soon)
          </button>
          <button
            type="button"
            onClick={() => setModalExam('CMA')}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-semibold hover:border-slate-300 transition cursor-pointer"
          >
            <Lock className="w-2.5 h-2.5 text-slate-400" /> CMA (Coming Soon)
          </button>
        </div>
      </div>

      {/* STUDENT PRICING VIEW */}
      {audience === 'student' && (
        <div className="space-y-10 max-w-4xl mx-auto">
          {/* Top Row: Free Tier & Custom Evaluation Option */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card 1: Free Registration */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-7 space-y-6 flex flex-col justify-between shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Free Tier</span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    Included with Signup
                  </span>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-slate-900 dark:text-white">₹0</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">/ forever</span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Every CA student receives 2 full-100-mark answer sheet evaluations every month at zero cost.
                </p>

                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3 text-xs text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="font-medium text-slate-900 dark:text-white">2 Full Answer Sheet Evaluations / Month</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>ICAI-Pattern Step Marking Breakdown</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Working Notes & Presentation Feedback</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Instant Downloadable PDF Scorecard</span>
                  </div>
                </div>
              </div>

              <button
                onClick={onNavigateRegister}
                className="w-full py-3 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-xs transition cursor-pointer text-center flex items-center justify-center gap-1.5"
              >
                <span>Claim 2 Free Evaluations</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Card 2: Custom Evaluation (Pay As You Need) */}
            <div className="bg-white dark:bg-slate-900 border-2 border-blue-600 dark:border-blue-500 rounded-xl p-6 sm:p-7 space-y-5 flex flex-col justify-between shadow-md">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                    Custom Evaluation
                  </span>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    Flexible / Exact Quantity
                  </span>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-black text-blue-600 dark:text-blue-400 font-mono">
                    ₹{customTotalPrice}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    total for {isCustomValid ? validatedCustomQty : 0} evaluation{validatedCustomQty !== 1 ? 's' : ''}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Choose the exact quantity of evaluations you need. Flat pricing at <strong>₹35 per evaluation</strong>.
                </p>

                {/* Custom Quantity Input */}
                <div className="space-y-2 pt-1">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                    Enter Evaluation Quantity
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="500"
                      step="1"
                      placeholder="Custom quantity (e.g. 5, 10, 15)"
                      value={customQtyInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        // Prevent negative values or invalid characters
                        if (val === '' || /^\d+$/.test(val)) {
                          setCustomQtyInput(val);
                        }
                      }}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-800 font-medium"
                    />
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0 font-mono">
                      @ ₹35/eval
                    </span>
                  </div>
                  {!isCustomValid && customQtyInput.trim() !== '' && (
                    <p className="text-[11px] text-rose-500 font-medium">
                      Please enter a valid whole number between 1 and 500.
                    </p>
                  )}
                </div>

                {/* Quick Examples */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Quick Selection Examples
                  </span>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[1, 5, 10, 15, 20].map((qty) => (
                      <button
                        key={qty}
                        type="button"
                        onClick={() => setCustomQtyInput(String(qty))}
                        className={`py-1.5 px-1 rounded text-center text-xs transition cursor-pointer border ${
                          isCustomValid && validatedCustomQty === qty
                            ? 'bg-blue-600 text-white border-blue-600 font-bold'
                            : 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                        }`}
                      >
                        <div className="font-bold">{qty}</div>
                        <div className="text-[10px] font-mono opacity-90">₹{qty * 35}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dynamic Price Breakdown Box */}
                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3 border border-slate-200 dark:border-slate-700 space-y-1.5 text-xs text-slate-600 dark:text-slate-300 font-mono">
                  <div className="flex justify-between">
                    <span>Evaluations:</span>
                    <span className="font-bold text-slate-900 dark:text-white">{isCustomValid ? validatedCustomQty : 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Price per evaluation:</span>
                    <span className="font-bold text-slate-900 dark:text-white">₹35</span>
                  </div>
                  <div className="pt-1 border-t border-slate-200 dark:border-slate-700 flex justify-between text-sm font-bold text-blue-600 dark:text-blue-400">
                    <span>Total:</span>
                    <span>₹{customTotalPrice}</span>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>Credits valid for 3 months from purchase</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>Zero credit deduction if upload is not a genuine paper</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleBuyCustom}
                disabled={!isCustomValid}
                className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <CreditCard className="w-4 h-4" />
                <span>
                  {isLoggedIn
                    ? `Buy ${validatedCustomQty} Custom Evaluation${validatedCustomQty !== 1 ? 's' : ''} (₹${customTotalPrice})`
                    : 'Sign Up & Purchase Custom Evaluations'}
                </span>
              </button>
            </div>
          </div>

          {/* COMBO PLANS SECTION */}
          <div className="bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold mb-1">
                  <Layers className="w-3 h-3" /> Combo Plans
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                  Course-Specific Combo Offers
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  The number of evaluations and pricing depend on the selected course/level.
                </p>
              </div>

              {/* Course Level Switcher */}
              <div className="inline-flex p-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setComboLevel('FOUNDATION')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    comboLevel === 'FOUNDATION'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  CA Foundation
                </button>
                <button
                  type="button"
                  onClick={() => setComboLevel('INTERMEDIATE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    comboLevel === 'INTERMEDIATE'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  CA Intermediate
                </button>
              </div>
            </div>

            {/* Combo Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* COMBO 1 */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-5 shadow-xs hover:border-blue-400 transition">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">COMBO 1</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      {comboLevel === 'FOUNDATION' ? 'Foundation (4 Evals)' : 'Intermediate (6 Evals)'}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white font-mono">
                      ₹{comboPlans.COMBO_1[comboLevel].price}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      for {comboPlans.COMBO_1[comboLevel].evaluations} full evaluations
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      {comboLevel === 'FOUNDATION' ? 'CA Foundation' : 'CA Intermediate'} Curriculum:
                    </p>
                    <p>
                      {comboLevel === 'FOUNDATION'
                        ? 'Foundation — 4 Evaluations — ₹119'
                        : 'Intermediate — 6 Evaluations — ₹175'}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>{comboPlans.COMBO_1[comboLevel].evaluations} Full 100-Mark ICAI Answer Sheet Checks</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>ICAI Step-by-Step Marking Rubrics</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Working Notes & Statutory Citations Breakdown</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>3 Months Independent Validity Lot</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleBuyCombo('COMBO_1')}
                  className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>
                    Get Combo 1 — ₹{comboPlans.COMBO_1[comboLevel].price} ({comboPlans.COMBO_1[comboLevel].evaluations} Evals)
                  </span>
                </button>
              </div>

              {/* COMBO 2 */}
              <div className="bg-white dark:bg-slate-900 border-2 border-indigo-500/70 dark:border-indigo-500/60 rounded-xl p-6 flex flex-col justify-between space-y-5 shadow-sm relative hover:border-indigo-600 transition">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full bg-indigo-600 text-white shadow-xs flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Most Recommended Combo
                </span>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">COMBO 2</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      {comboLevel === 'FOUNDATION' ? 'Foundation (8 Evals)' : 'Intermediate (12 Evals)'}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
                      ₹{comboPlans.COMBO_2[comboLevel].price}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      for {comboPlans.COMBO_2[comboLevel].evaluations} full evaluations
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      {comboLevel === 'FOUNDATION' ? 'CA Foundation' : 'CA Intermediate'} Curriculum:
                    </p>
                    <p>
                      {comboLevel === 'FOUNDATION'
                        ? 'Foundation — 8 Evaluations — ₹219'
                        : 'Intermediate — 12 Evaluations — ₹329'}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>{comboPlans.COMBO_2[comboLevel].evaluations} Full 100-Mark ICAI Answer Sheet Checks</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Full Multi-Paper & Both Groups Coverage</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Priority AI Processing & Examiner Feedback</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>3 Months Independent Validity Lot</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleBuyCombo('COMBO_2')}
                  className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>
                    Get Combo 2 — ₹{comboPlans.COMBO_2[comboLevel].price} ({comboPlans.COMBO_2[comboLevel].evaluations} Evals)
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INSTITUTE PRICING VIEW */}
      {audience === 'institute' && (
        <div className="space-y-8">
          {/* Cycle Selector Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Choose Institutional Billing Cycle</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                All plans include dedicated ICAI step marking, faculty batch management, and performance tracking.
              </p>
            </div>

            <div className="inline-flex p-1 bg-slate-200/80 dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setInstituteCycle('MONTHLY')}
                className={`px-3.5 py-1.5 rounded-md font-bold transition cursor-pointer ${
                  instituteCycle === 'MONTHLY'
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setInstituteCycle('QUARTERLY')}
                className={`px-3.5 py-1.5 rounded-md font-bold transition cursor-pointer flex items-center gap-1 ${
                  instituteCycle === 'QUARTERLY'
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>Quarterly</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 rounded font-semibold">Save 15%</span>
              </button>
              <button
                type="button"
                onClick={() => setInstituteCycle('ANNUAL')}
                className={`px-3.5 py-1.5 rounded-md font-bold transition cursor-pointer flex items-center gap-1 ${
                  instituteCycle === 'ANNUAL'
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>Annual</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 rounded font-semibold">Save 35%</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Tier 1: Individual Institute */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">Individual Institute</h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    0–500 Students
                  </span>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-slate-900 dark:text-white font-mono">
                    {instituteCycle === 'MONTHLY' ? '₹80,000' : instituteCycle === 'QUARTERLY' ? '₹1,29,999' : '₹3,49,999'}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    / {instituteCycle.toLowerCase().replace('ly', '')}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Ideal for solo CA faculties, single-subject coaching centres, and boutique batches managing up to 500 enrolled students.
                </p>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                    <Users className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>500 Enrolled Student Seats</span>
                  </div>
                  <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                    <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>
                      {instituteCycle === 'MONTHLY' ? '1,000' : instituteCycle === 'QUARTERLY' ? '2,000' : '10,000'} Evaluations / cycle
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Unique Student Join Code</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Institute Mock Test Scheduler</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Rankings & Batch Leaderboards</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Standard Faculty Support (24h SLA)</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <button
                  onClick={() => navigate('/institute/register')}
                  className="w-full py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs transition cursor-pointer text-center"
                >
                  Register Individual Institute
                </button>
              </div>
            </div>

            {/* Tier 2: Mid Institute */}
            <div className="bg-white dark:bg-slate-900 border-2 border-indigo-600 dark:border-indigo-500 rounded-xl p-6 flex flex-col justify-between relative shadow-md">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full bg-indigo-600 text-white shadow-sm flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Most Popular for Academies
              </span>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">Mid Institute</h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                    501–1,500 Students
                  </span>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-indigo-700 dark:text-indigo-400 font-mono">
                    {instituteCycle === 'MONTHLY' ? '₹1,09,999' : instituteCycle === 'QUARTERLY' ? '₹3,29,999' : '₹8,99,999'}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    / {instituteCycle.toLowerCase().replace('ly', '')}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Comprehensive automated evaluation suite for established CA coaching institutions with multiple concurrent batches.
                </p>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                    <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>1,500 Enrolled Student Seats</span>
                  </div>
                  <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                    <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>
                      {instituteCycle === 'MONTHLY' ? '2,000' : instituteCycle === 'QUARTERLY' ? '8,000' : '30,000'} Evaluations / cycle
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>Multi-Batch Subject Tracking</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>Custom Watermarked Checked Copies</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>Direct Scorecard PDF Export</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
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
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">Enterprise Institute</h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    1,501–5,000 Students
                  </span>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-slate-900 dark:text-white font-mono">
                    {instituteCycle === 'MONTHLY' ? '₹2,75,000' : instituteCycle === 'QUARTERLY' ? '₹6,84,000' : '₹15,00,000'}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    / {instituteCycle.toLowerCase().replace('ly', '')}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Maximum capacity and high-throughput evaluation pipeline for premier pan-India CA coaching institutions.
                </p>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                    <Users className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>5,000 Enrolled Student Seats</span>
                  </div>
                  <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                    <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>
                      {instituteCycle === 'MONTHLY' ? '5,500' : instituteCycle === 'QUARTERLY' ? '18,000' : '60,000'} Evaluations / cycle
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Pan-India Multi-Branch Architecture</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Custom Watermarked Checked Copies</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Dedicated Pan-India Account Manager (4h SLA)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Automated Batch Result Broadcast & White-labeling</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <button
                  onClick={() => navigate('/institute/register')}
                  className="w-full py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs transition cursor-pointer text-center"
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
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Razorpay 256-Bit SSL</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Bank-grade encryption supporting all UPI apps, RuPay, Visa, Mastercard, and Netbanking.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs">
            <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Instant Credit Activation</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Credits reflect in your account immediately upon payment verification with full ledger audit.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs">
            <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Document Safeguards</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Non-CA files or accidental blank uploads are automatically rejected with zero credit loss.
          </p>
        </div>
      </div>

      {/* Pricing FAQs */}
      <div className="max-w-3xl mx-auto space-y-4 pt-6">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white text-center">Frequently Asked Questions</h3>
        <div className="space-y-3 text-xs">
          <div className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
            <h4 className="font-bold text-slate-900 dark:text-white">How do student evaluation credits work?</h4>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              1 credit allows 1 complete handwritten answer sheet evaluation (up to 100 marks) with full question-wise step marking and examiner feedback.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
            <h4 className="font-bold text-slate-900 dark:text-white">How does institutional billing operate?</h4>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Institutes subscribe annually for a fixed seat and monthly evaluation capacity. Student submissions made through scheduled institute mock tests draw from the institute’s quota without charging the students.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
            <h4 className="font-bold text-slate-900 dark:text-white">What happens if my upload is rejected?</h4>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              If our document safeguard identifies that an uploaded file is not a genuine CA answer sheet (e.g. an admit card or blurry blank photo), the evaluation is terminated and zero credits are deducted.
            </p>
          </div>
        </div>
      </div>

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
