import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
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

  const { user } = useAuth();

  const handlePurchaseInstitutePlan = (tier: 'individual' | 'mid' | 'enterprise') => {
    const cycleSuffix = instituteCycle.toLowerCase();
    const planId = `inst_${tier}_${cycleSuffix}`;
    const normRole = (user?.role || '').toUpperCase().replace(/\s+/g, '_');
    if (user && (normRole === 'INSTITUTE_ADMIN' || normRole === 'INSTITUTE')) {
      navigate(`/institute/dashboard?tab=subscription&upgradePlan=${planId}`);
    } else {
      navigate(`/institute/register?plan=${planId}&cycle=${instituteCycle}`);
    }
  };

  return (
    <div className="relative isolate mx-auto max-w-7xl overflow-hidden px-4 py-8 text-slate-800 dark:text-slate-100 sm:px-6 lg:px-8 lg:py-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[30rem] bg-[radial-gradient(ellipse_at_top,rgba(37,99,235,0.13),transparent_68%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(79,70,229,0.20),transparent_68%)]" />
      {/* Header */}
      <div className="relative mx-auto mb-10 max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/85 px-5 py-9 text-center shadow-[0_24px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 sm:px-10 sm:py-12">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-3xl space-y-4">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-700 dark:border-blue-900 dark:bg-blue-950/70 dark:text-blue-300">
            <Sparkles className="h-3.5 w-3.5" /> Transparent pricing · No hidden surprises
          </span>
          <h1 className="text-3xl font-black leading-tight tracking-tight text-slate-950 dark:text-white sm:text-5xl">
            {audience === 'student' ? <>Your next attempt deserves <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">better feedback.</span></> : <>Turn every test into <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">measurable progress.</span></>}
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
            {audience === 'student'
              ? 'Understand where you lose marks, improve your answer presentation, and prepare with feedback that helps you move forward.'
              : 'Give your faculty a structured evaluation workflow and give every student clearer visibility into their performance.'}
          </p>

        {/* Audience Toggle */}
        <div className="mx-auto inline-flex w-full max-w-xl rounded-2xl border border-slate-200 bg-slate-100/90 p-1.5 shadow-inner dark:border-slate-700 dark:bg-slate-900/90">
          <button
            onClick={() => setAudience('student')}
            className={`flex-1 rounded-xl px-3 py-3 text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-2 sm:text-sm ${
              audience === 'student'
                ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 shadow-md ring-1 ring-slate-200 dark:ring-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>For CA Students</span>
          </button>
          <button
            onClick={() => setAudience('institute')}
            className={`flex-1 rounded-xl px-3 py-3 text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-2 sm:text-sm ${
              audience === 'institute'
                ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-md ring-1 ring-slate-200 dark:ring-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>For Institutes</span>
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
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Secure checkout</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Clear, upfront pricing</span>
            <span className="inline-flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-blue-600" /> Feedback built around your progress</span>
          </div>
        </div>
      </div>

      {/* STUDENT PRICING VIEW */}
      {audience === 'student' && (
        <div className="mx-auto max-w-6xl space-y-8">
          {/* Top Row: Free Tier & Custom Evaluation Option */}
          <div className="mb-1 max-w-3xl space-y-2">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Start where you are</p>
            <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">One free start. Flexible ways to keep improving.</h2>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">Try the evaluation experience, then choose a pack that fits your practice routine.</p>
          </div>
          <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
            {/* Card 1: Free Registration */}
            <div className="group flex h-full flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_55px_-40px_rgba(15,23,42,0.35)] transition duration-300 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-8 space-y-6">
              <div className="space-y-5">
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
            <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-blue-300 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6 shadow-[0_24px_70px_-35px_rgba(37,99,235,0.45)] ring-1 ring-blue-200 dark:border-blue-900 dark:from-blue-950/50 dark:via-slate-900 dark:to-indigo-950/40 dark:ring-blue-900 sm:p-8 space-y-5">
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
          <div className="rounded-[2rem] border border-slate-200 bg-slate-50/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 sm:p-9 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold mb-1">
                  <Layers className="w-3 h-3" /> Combo Plans
                </div>
                <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                  Choose your practice pack
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
              <div className="flex flex-col justify-between space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-950">
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
              <div className="relative flex flex-col justify-between space-y-5 rounded-2xl border-2 border-indigo-500 bg-gradient-to-br from-white via-indigo-50/50 to-blue-50/70 p-6 shadow-[0_22px_60px_-35px_rgba(79,70,229,0.55)] transition duration-300 hover:-translate-y-1 hover:shadow-xl dark:from-indigo-950/40 dark:via-slate-950 dark:to-blue-950/30">
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
        <div className="mx-auto max-w-6xl space-y-8">
          <div className="max-w-3xl space-y-2">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo-700 dark:text-indigo-300">Built to scale with your academy</p>
            <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">One platform. Your entire evaluation workflow.</h2>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">Choose capacity based on your enrolled students and select a billing cycle that suits your institution.</p>
          </div>
          {/* Cycle Selector Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
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

          <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
            {/* Tier 1: Individual Institute */}
            <div className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_55px_-40px_rgba(15,23,42,0.35)] transition duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-7">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">Individual Institute</h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    0–500 Students
                  </span>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                    {instituteCycle === 'MONTHLY' ? '₹79,999' : instituteCycle === 'QUARTERLY' ? '₹1,29,999' : '₹3,49,999'}
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
                  id="btn-purchase-inst-individual"
                  onClick={() => handlePurchaseInstitutePlan('individual')}
                  className="w-full py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs transition cursor-pointer text-center"
                >
                  Purchase Individual Institute
                </button>
              </div>
            </div>

            {/* Tier 2: Mid Institute */}
            <div className="relative flex flex-col justify-between rounded-3xl border-2 border-indigo-500 bg-gradient-to-b from-indigo-50/80 via-white to-white p-6 shadow-[0_28px_75px_-40px_rgba(79,70,229,0.6)] ring-1 ring-indigo-200 dark:from-indigo-950/60 dark:via-slate-900 dark:to-slate-900 dark:ring-indigo-900 sm:p-7">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full bg-indigo-600 px-4 py-1 text-white shadow-md flex items-center gap-1">
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
                  <span className="text-3xl font-black tracking-tight text-indigo-700 dark:text-indigo-300 sm:text-4xl">
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
                  id="btn-purchase-inst-mid"
                  onClick={() => handlePurchaseInstitutePlan('mid')}
                  className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition shadow-sm cursor-pointer text-center"
                >
                  Purchase Mid Institute
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
                    {instituteCycle === 'MONTHLY' ? '₹2,74,999' : instituteCycle === 'QUARTERLY' ? '₹6,83,999' : '₹14,99,999'}
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
                  id="btn-purchase-inst-enterprise"
                  onClick={() => handlePurchaseInstitutePlan('enterprise')}
                  className="w-full py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs transition cursor-pointer text-center"
                >
                  Purchase Enterprise Institute
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trust & Guarantee Banner */}
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 pt-4 sm:grid-cols-3">
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Secure, encrypted payment</span>
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
      <div className="mx-auto max-w-4xl space-y-5 rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 sm:p-8">
        <div className="text-center"><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Need clarity?</p><h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Frequently asked questions</h3></div>
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div className="p-4 rounded-2xl bg-slate-50/80 p-5 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 shadow-sm">
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
