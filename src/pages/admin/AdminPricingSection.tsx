import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client.js';
import {
  DollarSign,
  Users,
  Building2,
  CheckCircle2,
  XCircle,
  Edit3,
  RefreshCw,
  Sparkles,
  Zap,
  Save,
  X,
  Plus,
  CreditCard,
  ShieldCheck,
  Award,
} from 'lucide-react';

interface PricingSettings {
  PRICE_PER_CREDIT_INR?: string;
  FREE_TIER_EVALUATIONS?: string;
  DEFAULT_INSTITUTE_QUOTA?: string;
  SUPPORT_EMAIL?: string;
  INSTAGRAM_URL?: string;
}

interface StudentPricingPlan {
  id: string;
  name: string;
  billing_period?: string;
  price_inr: number;
  original_price_inr?: number;
  evaluation_allowance: number;
  unlimited_badge?: number;
  badge?: string;
  benefits?: string[];
  is_active: number;
  sort_order?: number;
}

interface InstitutePlan {
  id: string;
  name: string;
  priceInr: number;
  billingPeriod: string;
  studentQuota: number;
  evaluationCredits: number;
  features: string[];
  assignmentsEnabled: boolean;
  testsEnabled: boolean;
  analyticsEnabled: boolean;
  supportTier: string;
  isActive: boolean;
  sortOrder: number;
}

interface AdminPricingSectionProps {
  onNotify?: (message: string, type: 'success' | 'error') => void;
}

export const AdminPricingSection: React.FC<AdminPricingSectionProps> = ({ onNotify }) => {
  const [activeTab, setActiveTab] = useState<'student' | 'institute'>('student');
  const [loading, setLoading] = useState<boolean>(true);
  const [savingGlobal, setSavingGlobal] = useState<boolean>(false);

  // Global settings
  const [globalSettings, setGlobalSettings] = useState<PricingSettings>({});
  const [pricePerCredit, setPricePerCredit] = useState<string>('10');
  const [freeTierEvaluations, setFreeTierEvaluations] = useState<string>('2');
  const [defaultInstituteQuota, setDefaultInstituteQuota] = useState<string>('500');
  const [supportEmail, setSupportEmail] = useState<string>('caexamchecker.support@gmail.com');
  const [instagramUrl, setInstagramUrl] = useState<string>('https://insta.openinapp.co/utw2r');

  // Student Credit Packs
  const [studentPlans, setStudentPlans] = useState<StudentPricingPlan[]>([]);
  const [editingStudentPlan, setEditingStudentPlan] = useState<StudentPricingPlan | null>(null);
  const [savingStudentPlan, setSavingStudentPlan] = useState<boolean>(false);

  // Institute Plans (9 Tiers)
  const [institutePlans, setInstitutePlans] = useState<InstitutePlan[]>([]);
  const [cycleFilter, setCycleFilter] = useState<'ALL' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'>('ALL');
  const [editingInstitutePlan, setEditingInstitutePlan] = useState<InstitutePlan | null>(null);
  const [savingInstitutePlan, setSavingInstitutePlan] = useState<boolean>(false);

  const fetchAllPricingData = async () => {
    setLoading(true);
    try {
      // 1. Global pricing settings
      const globalRes = await apiRequest<{ settings: PricingSettings }>('/api/admin/pricing');
      if (globalRes.settings) {
        setGlobalSettings(globalRes.settings);
        setPricePerCredit(globalRes.settings.PRICE_PER_CREDIT_INR || '10');
        setFreeTierEvaluations(globalRes.settings.FREE_TIER_EVALUATIONS || '2');
        setDefaultInstituteQuota(globalRes.settings.DEFAULT_INSTITUTE_QUOTA || '500');
        setSupportEmail(globalRes.settings.SUPPORT_EMAIL || 'caexamchecker.support@gmail.com');
        setInstagramUrl(globalRes.settings.INSTAGRAM_URL || 'https://insta.openinapp.co/utw2r');
      }

      // 2. Student plans from /api/admin/pricing-plans
      const plansRes = await apiRequest<{ plans: StudentPricingPlan[] }>('/api/admin/pricing-plans');
      if (plansRes.plans) {
        // Filter student specific packs
        const studentOnly = plansRes.plans.filter((p) => p.id.startsWith('student-'));
        setStudentPlans(studentOnly);
      }

      // 3. Institute plans (9 Tiers) from /api/admin/institute-plans
      const instRes = await apiRequest<{ plans: InstitutePlan[] }>('/api/admin/institute-plans');
      if (instRes.plans) {
        setInstitutePlans(instRes.plans);
      }
    } catch (err: any) {
      onNotify?.(err?.message || 'Failed to load pricing configurations', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllPricingData();
  }, []);

  const handleSaveGlobal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGlobal(true);
    try {
      await apiRequest('/api/admin/pricing', {
        method: 'PUT',
        body: JSON.stringify({
          pricePerCredit,
          freeTierEvaluations,
          defaultInstituteQuota,
          supportEmail,
          instagramUrl,
        }),
      });
      onNotify?.('Global student and platform pricing settings saved successfully!', 'success');
      await fetchAllPricingData();
    } catch (err: any) {
      onNotify?.(err?.message || 'Failed to update global pricing', 'error');
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleSaveStudentPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudentPlan) return;
    setSavingStudentPlan(true);
    try {
      await apiRequest(`/api/admin/pricing-plans/${editingStudentPlan.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editingStudentPlan.name,
          price_inr: Number(editingStudentPlan.price_inr),
          evaluation_allowance: Number(editingStudentPlan.evaluation_allowance),
          badge: editingStudentPlan.badge || null,
          is_active: editingStudentPlan.is_active ? 1 : 0,
        }),
      });
      onNotify?.(`Updated student pack: ${editingStudentPlan.name}`, 'success');
      setEditingStudentPlan(null);
      await fetchAllPricingData();
    } catch (err: any) {
      onNotify?.(err?.message || 'Failed to update student pack', 'error');
    } finally {
      setSavingStudentPlan(false);
    }
  };

  const handleSaveInstitutePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInstitutePlan) return;
    setSavingInstitutePlan(true);
    try {
      await apiRequest(`/api/admin/institute-plans/${editingInstitutePlan.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editingInstitutePlan.name,
          priceInr: Number(editingInstitutePlan.priceInr),
          studentQuota: Number(editingInstitutePlan.studentQuota),
          evaluationCredits: Number(editingInstitutePlan.evaluationCredits),
          supportTier: editingInstitutePlan.supportTier,
          isActive: editingInstitutePlan.isActive,
        }),
      });
      onNotify?.(`Updated institute subscription tier: ${editingInstitutePlan.name}`, 'success');
      setEditingInstitutePlan(null);
      await fetchAllPricingData();
    } catch (err: any) {
      onNotify?.(err?.message || 'Failed to update institute tier', 'error');
    } finally {
      setSavingInstitutePlan(false);
    }
  };

  const filteredInstitutePlans = institutePlans.filter((p) => {
    if (cycleFilter === 'ALL') return true;
    return p.billingPeriod.toUpperCase() === cycleFilter;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Sub-Navigation */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-blue-600" />
            <span>Pricing & Subscription Management</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Distinct management workflows for Individual Student Credits and Institutional Multi-Tier Subscriptions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Main Sub-tabs */}
          <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              onClick={() => setActiveTab('student')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'student' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Student Credit Pricing</span>
            </button>
            <button
              onClick={() => setActiveTab('institute')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'institute' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Institute Subscriptions (9 Tiers)</span>
            </button>
          </div>

          <button
            onClick={fetchAllPricingData}
            disabled={loading}
            className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition cursor-pointer"
            title="Refresh All Pricing"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* SUB-TAB 1: STUDENT CREDIT PRICING */}
      {/* ========================================================= */}
      {activeTab === 'student' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Global Student Rules Form */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs lg:col-span-1">
              <div className="mb-4 pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">Student Baseline Rules</h3>
                <p className="text-[11px] text-slate-500">Governs flat credit rate and new account grant</p>
              </div>

              <form onSubmit={handleSaveGlobal} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Price Per Credit (INR)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 font-mono font-bold">₹</span>
                    <input
                      type="number"
                      min="1"
                      value={pricePerCredit}
                      onChange={(e) => setPricePerCredit(e.target.value)}
                      className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600 font-mono font-bold"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400">Flat rate for single paper evaluations (Default: ₹10)</span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Free Tier Evaluations (Signup Grant)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={freeTierEvaluations}
                    onChange={(e) => setFreeTierEvaluations(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600 font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-400">Credits credited automatically upon registration (Default: 2)</span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Default Institute Capacity
                  </label>
                  <input
                    type="number"
                    min="10"
                    value={defaultInstituteQuota}
                    onChange={(e) => setDefaultInstituteQuota(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600 font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Baseline student seats if unspecified (Default: 500)</span>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <label className="block font-bold text-slate-700 mb-1">
                    Official Support Email
                  </label>
                  <input
                    type="email"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Instagram Channel Link
                  </label>
                  <input
                    type="text"
                    value={instagramUrl}
                    onChange={(e) => setInstagramUrl(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600 font-mono text-[11px]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingGlobal}
                  className="w-full mt-2 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {savingGlobal ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save Baseline Settings</span>
                </button>
              </form>
            </div>

            {/* Student Credit Packages Table */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Pre-Packaged Student Credit Bundles</h3>
                  <p className="text-[11px] text-slate-500">
                    Individual pay-per-paper packs presented to students on the pricing & recharge dialogs.
                  </p>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                  {studentPlans.length} Packages
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="py-2.5 px-3 font-bold">Package Name</th>
                      <th className="py-2.5 px-3 font-bold">Credits</th>
                      <th className="py-2.5 px-3 font-bold">Price</th>
                      <th className="py-2.5 px-3 font-bold">Badge / Tag</th>
                      <th className="py-2.5 px-3 font-bold">Status</th>
                      <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {studentPlans.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                          No student packages found.
                        </td>
                      </tr>
                    ) : (
                      studentPlans.map((plan) => (
                        <tr key={plan.id} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            <div>{plan.name}</div>
                            <div className="text-[10px] font-mono text-slate-400">{plan.id}</div>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                            {plan.evaluation_allowance} Papers
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                            ₹{plan.price_inr}
                          </td>
                          <td className="py-2.5 px-3">
                            {plan.badge ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                {plan.badge}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">Standard</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                plan.is_active
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {plan.is_active ? 'ACTIVE' : 'DISABLED'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={() => setEditingStudentPlan(plan)}
                              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold text-[11px] transition inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUB-TAB 2: INSTITUTE SUBSCRIPTIONS (9 TIERS) */}
      {/* ========================================================= */}
      {activeTab === 'institute' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Institutional Subscriptions Engine (9 Tiers)</h3>
              <p className="text-xs text-slate-500">
                Official institutional pricing tiers covering Individual, Mid, and Enterprise institutes across 3 billing cycles.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Cycle:</span>
              <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs">
                {(['ALL', 'MONTHLY', 'QUARTERLY', 'ANNUAL'] as const).map((cycle) => (
                  <button
                    key={cycle}
                    onClick={() => setCycleFilter(cycle)}
                    className={`px-3 py-1 rounded-md font-bold transition cursor-pointer ${
                      cycleFilter === cycle ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {cycle}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tiers Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {filteredInstitutePlans.map((plan) => {
              const isAnnual = plan.billingPeriod === 'ANNUAL';
              const isQuarterly = plan.billingPeriod === 'QUARTERLY';
              const isMonthly = plan.billingPeriod === 'MONTHLY';

              return (
                <div
                  key={plan.id}
                  className={`bg-white rounded-xl border p-5 flex flex-col justify-between shadow-xs transition ${
                    !plan.isActive
                      ? 'border-slate-200 opacity-60'
                      : plan.studentQuota > 1500
                      ? 'border-indigo-300 ring-1 ring-indigo-200/50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          isAnnual
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : isQuarterly
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {plan.billingPeriod}
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          plan.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {plan.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{plan.name}</h4>
                      <p className="text-[10px] font-mono text-slate-400">{plan.id}</p>
                    </div>

                    <div className="flex items-baseline gap-1 pt-1">
                      <span className="text-2xl font-black text-slate-900 font-mono">
                        ₹{plan.priceInr.toLocaleString('en-IN')}
                      </span>
                      <span className="text-[11px] text-slate-500">/ {plan.billingPeriod.toLowerCase()}</span>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Student Capacity:</span>
                        <span className="font-bold text-slate-900 font-mono">
                          {plan.studentQuota.toLocaleString()} seats
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Evaluation Allowance:</span>
                        <span className="font-bold text-blue-700 font-mono">
                          {plan.evaluationCredits.toLocaleString()} checks
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Support Level:</span>
                        <span className="font-medium text-slate-700">{plan.supportTier}</span>
                      </div>
                    </div>

                    {plan.features && plan.features.length > 0 && (
                      <div className="space-y-1.5 text-[11px] text-slate-600 pt-1">
                        {plan.features.slice(0, 3).map((feat, idx) => (
                          <div key={idx} className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="truncate">{feat}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-400">Tier #{plan.sortOrder}</span>
                    <button
                      onClick={() => setEditingInstitutePlan(plan)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 font-bold text-xs transition inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit Tier</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: EDIT STUDENT PACK */}
      {/* ========================================================= */}
      {editingStudentPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Edit Student Credit Pack</h3>
              <button
                onClick={() => setEditingStudentPlan(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStudentPlan} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Package Display Name</label>
                <input
                  type="text"
                  required
                  value={editingStudentPlan.name}
                  onChange={(e) => setEditingStudentPlan({ ...editingStudentPlan, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Price (INR)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editingStudentPlan.price_inr}
                    onChange={(e) =>
                      setEditingStudentPlan({ ...editingStudentPlan, price_inr: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Credits Included</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editingStudentPlan.evaluation_allowance}
                    onChange={(e) =>
                      setEditingStudentPlan({
                        ...editingStudentPlan,
                        evaluation_allowance: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Promotional Badge (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Most Popular, 10% Extra"
                  value={editingStudentPlan.badge || ''}
                  onChange={(e) => setEditingStudentPlan({ ...editingStudentPlan, badge: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingStudentPlan.is_active)}
                    onChange={(e) =>
                      setEditingStudentPlan({ ...editingStudentPlan, is_active: e.target.checked ? 1 : 0 })
                    }
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-bold text-slate-800">Active (Visible to Students)</span>
                </label>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStudentPlan(null)}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingStudentPlan}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {savingStudentPlan && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: EDIT INSTITUTE TIER */}
      {/* ========================================================= */}
      {editingInstitutePlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-lg w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Edit Institute Subscription Tier</h3>
                <p className="text-[11px] font-mono text-slate-400">{editingInstitutePlan.id}</p>
              </div>
              <button
                onClick={() => setEditingInstitutePlan(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveInstitutePlan} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tier Display Name</label>
                <input
                  type="text"
                  required
                  value={editingInstitutePlan.name}
                  onChange={(e) => setEditingInstitutePlan({ ...editingInstitutePlan, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Price (INR)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editingInstitutePlan.priceInr}
                    onChange={(e) =>
                      setEditingInstitutePlan({ ...editingInstitutePlan, priceInr: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-600 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Billing Cycle</label>
                  <input
                    type="text"
                    disabled
                    value={editingInstitutePlan.billingPeriod}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-100 text-slate-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Student Capacity (Seats)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editingInstitutePlan.studentQuota}
                    onChange={(e) =>
                      setEditingInstitutePlan({ ...editingInstitutePlan, studentQuota: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-600 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Evaluation Allowance</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editingInstitutePlan.evaluationCredits}
                    onChange={(e) =>
                      setEditingInstitutePlan({
                        ...editingInstitutePlan,
                        evaluationCredits: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-600 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Support Tier</label>
                <select
                  value={editingInstitutePlan.supportTier}
                  onChange={(e) => setEditingInstitutePlan({ ...editingInstitutePlan, supportTier: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-600"
                >
                  <option value="Standard">Standard Support (24h SLA)</option>
                  <option value="Priority">Priority Faculty Support (12h SLA)</option>
                  <option value="Dedicated Account Manager">Dedicated Pan-India Account Manager (4h SLA)</option>
                </select>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingInstitutePlan.isActive}
                    onChange={(e) =>
                      setEditingInstitutePlan({ ...editingInstitutePlan, isActive: e.target.checked })
                    }
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-bold text-slate-800">Active (Visible in Institute Portal & Pricing)</span>
                </label>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingInstitutePlan(null)}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingInstitutePlan}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {savingInstitutePlan && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Tier</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
