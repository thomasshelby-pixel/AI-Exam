import React, { useState } from 'react';
import { apiRequest } from '../../api/client.js';
import {
  Calendar,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Building2,
  Users,
  Award,
  Sparkles,
  Zap,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, callback: (response: unknown) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

interface PlanItem {
  id: string;
  name: string;
  price_inr: number;
  billing_period?: string;
  billing_cycle?: string;
  student_quota?: number;
  max_students?: number;
  evaluation_credits?: number;
  max_evaluations_per_month?: number;
  features?: string[];
  features_json?: string;
  support_tier?: string;
  is_active: number;
}

interface SubscriptionData {
  institute?: {
    id: string;
    name: string;
    code: string;
    subscription_plan: string;
    subscription_status: string;
    max_students: number;
    max_evaluations_per_month: number;
    subscription_expires_at: string | null;
  };
  currentPlan?: PlanItem | null;
  usage?: {
    activeStudents: number;
    maxStudents: number;
    remainingSeats: number;
    monthlyEvaluationsUsed: number;
    maxEvaluationsPerMonth: number;
  };
  availablePlans?: PlanItem[];
  activeSubscription?: any;
  plan?: string;
  status?: string;
  activeStudents?: number;
  maxStudents?: number;
  remainingSeats?: number;
  expiresAt?: string | null;
}

interface InstituteSubscriptionManagerProps {
  data: SubscriptionData;
  onRefresh: () => Promise<void>;
  onNotify?: (message: string, type: 'success' | 'error') => void;
}

export const InstituteSubscriptionManager: React.FC<InstituteSubscriptionManagerProps> = ({
  data,
  onRefresh,
  onNotify,
}) => {
  const [subscribingPlanId, setSubscribingPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [cycleFilter, setCycleFilter] = useState<'ALL' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'>('ALL');

  const usage = data.usage || {
    activeStudents: data.activeStudents || 0,
    maxStudents: data.maxStudents || 100,
    remainingSeats: data.remainingSeats || 0,
    monthlyEvaluationsUsed: 0,
    maxEvaluationsPerMonth: 500,
  };

  const studentPercent = Math.min(100, Math.round((usage.activeStudents / Math.max(1, usage.maxStudents)) * 100));
  const evalPercent = Math.min(
    100,
    Math.round((usage.monthlyEvaluationsUsed / Math.max(1, usage.maxEvaluationsPerMonth)) * 100)
  );

  const handleSubscribe = async (plan: PlanItem) => {
    try {
      setSubscribingPlanId(plan.id);
      setLoading(true);

      const res = await apiRequest<{
        success: boolean;
        order?: any;
        isConfigured: boolean;
        directActivated?: boolean;
        message?: string;
      }>('/api/institute/subscription/create-order', {
        method: 'POST',
        body: JSON.stringify({ planId: plan.id }),
      });

      if (res.directActivated) {
        onNotify?.(res.message || `Successfully activated ${plan.name} plan!`, 'success');
        await onRefresh();
        setLoading(false);
        setSubscribingPlanId(null);
        return;
      }

      if (!res.isConfigured || !res.order) {
        // Direct subscription activation fallback if Razorpay credentials are not yet set
        const verifyRes = await apiRequest<{ success: boolean; message: string }>('/api/institute/subscription/verify-payment', {
          method: 'POST',
          body: JSON.stringify({
            planId: plan.id,
            directActivation: true,
          }),
        });

        onNotify?.(verifyRes.message || `Successfully subscribed to ${plan.name} plan!`, 'success');
        await onRefresh();
        setLoading(false);
        setSubscribingPlanId(null);
        return;
      }

      if (!window.Razorpay) {
        onNotify?.('Payment gateway script failed to load. Please reload the page.', 'error');
        setLoading(false);
        setSubscribingPlanId(null);
        return;
      }

      const options = {
        key: res.order.keyId,
        amount: res.order.amountPaise,
        currency: 'INR',
        name: 'CA Exam Checker AI - Institute Portal',
        description: `${plan.name} Plan Annual License`,
        order_id: res.order.razorpayOrderId,
        prefill: {
          name: data.institute?.name || '',
        },
        theme: {
          color: '#2563eb',
        },
        handler: async function (paymentResp: RazorpayResponse) {
          try {
            await apiRequest('/api/institute/subscription/verify-payment', {
              method: 'POST',
              body: JSON.stringify({
                planId: plan.id,
                razorpayOrderId: paymentResp.razorpay_order_id,
                razorpayPaymentId: paymentResp.razorpay_payment_id,
                razorpaySignature: paymentResp.razorpay_signature,
              }),
            });
            onNotify?.(`Payment successful! Your institute is now on the ${plan.name} plan.`, 'success');
            await onRefresh();
          } catch (verErr: any) {
            onNotify?.(verErr?.message || 'Payment verification failed', 'error');
          } finally {
            setLoading(false);
            setSubscribingPlanId(null);
          }
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
            setSubscribingPlanId(null);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function () {
        onNotify?.('Payment was declined or cancelled', 'error');
        setLoading(false);
        setSubscribingPlanId(null);
      });
      rzp.open();
    } catch (err: any) {
      onNotify?.(err?.message || 'Failed to initiate plan subscription', 'error');
      setLoading(false);
      setSubscribingPlanId(null);
    }
  };

  const availablePlans = data.availablePlans || [];

  return (
    <div className="space-y-6">
      {/* Current Quota & License Overview */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">Institutional Plan & Quota</h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                {data.currentPlan?.name || data.plan || 'Standard Partner'}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {data.status || 'ACTIVE'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Active license expires on:{' '}
              <span className="font-semibold text-slate-700">
                {data.expiresAt ? new Date(data.expiresAt).toLocaleDateString() : 'Annual Continuous Partner'}
              </span>
            </p>
          </div>

          <button
            onClick={() => onRefresh()}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition text-xs flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Status</span>
          </button>
        </div>

        {/* Quota Meters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600 font-medium flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-600" /> Student Seat Quota
              </span>
              <span className="font-mono font-bold text-slate-900">
                {usage.activeStudents} / {usage.maxStudents} ({studentPercent}%)
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  studentPercent > 90 ? 'bg-rose-500' : studentPercent > 70 ? 'bg-amber-500' : 'bg-blue-600'
                }`}
                style={{ width: `${studentPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 pt-1">
              <span>Remaining Seats: {usage.remainingSeats}</span>
              {studentPercent > 80 && <span className="text-amber-600 font-semibold">Seat capacity nearing limit</span>}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600 font-medium flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-emerald-600" /> Monthly Evaluation Quota
              </span>
              <span className="font-mono font-bold text-slate-900">
                {usage.monthlyEvaluationsUsed} / {usage.maxEvaluationsPerMonth} ({evalPercent}%)
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  evalPercent > 90 ? 'bg-rose-500' : evalPercent > 70 ? 'bg-amber-500' : 'bg-emerald-600'
                }`}
                style={{ width: `${evalPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 pt-1">
              <span>Auto-renews monthly</span>
              <span>ICAI Exam Pattern Checked Copy</span>
            </div>
          </div>
        </div>
      </div>

      {/* Available Plans & Upgrades */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Institutional Upgrade Plans</h4>
            <p className="text-xs text-slate-500">
              Expand seat capacity, increase monthly evaluations, and unlock priority faculty analytics across 9 tiers.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Billing Cycle:</span>
            <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs">
              {(['ALL', 'MONTHLY', 'QUARTERLY', 'ANNUAL'] as const).map((cycle) => (
                <button
                  key={cycle}
                  type="button"
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {availablePlans
            .filter((plan) => {
              if (cycleFilter === 'ALL') return true;
              const period = (plan.billing_period || plan.billing_cycle || '').toUpperCase();
              return period.includes(cycleFilter);
            })
            .map((plan) => {
              const isCurrent =
                data.currentPlan?.id === plan.id ||
                data.institute?.subscription_plan?.toLowerCase() === plan.name.toLowerCase() ||
                data.institute?.subscription_plan?.toLowerCase() === plan.id.toLowerCase();

              let parsedFeatures: string[] = [];
              if (Array.isArray(plan.features) && plan.features.length > 0) {
                parsedFeatures = plan.features;
              } else {
                try {
                  parsedFeatures = JSON.parse(plan.features_json || '[]');
                } catch {
                  parsedFeatures = ['Student seat allocation', 'Monthly evaluations', 'Batch analytics'];
                }
              }

              const isPopular = plan.id.includes('mid') || plan.id === 'growth';
              const seatCount = plan.student_quota || plan.max_students || 500;
              const evalCount = plan.evaluation_credits || plan.max_evaluations_per_month || 1000;
              const billingCycle = (plan.billing_period || plan.billing_cycle || 'ANNUAL').toLowerCase();

              return (
                <div
                  key={plan.id}
                  className={`bg-white rounded-xl border p-6 flex flex-col justify-between transition shadow-xs relative ${
                    isPopular ? 'border-2 border-indigo-600 shadow-md' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {isPopular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full bg-indigo-600 text-white shadow-sm flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Recommended
                    </span>
                  )}

                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h5 className="text-base font-bold text-slate-900">{plan.name}</h5>
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Current Plan
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-black text-slate-900 font-mono">
                        ₹{Number(plan.price_inr).toLocaleString('en-IN')}
                      </span>
                      <span className="text-xs text-slate-500">/ {billingCycle}</span>
                    </div>

                    <div className="pt-3 border-t border-slate-100 space-y-2.5 text-xs text-slate-600">
                      <div className="flex items-center gap-2 font-medium text-slate-900">
                        <Users className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>{seatCount.toLocaleString()} Enrolled Student Seats</span>
                      </div>
                      <div className="flex items-center gap-2 font-medium text-slate-900">
                        <Zap className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{evalCount.toLocaleString()} Evaluations / {billingCycle === 'annual' ? 'year' : 'month'}</span>
                      </div>

                      {parsedFeatures.slice(0, 4).map((feat, fIdx) => (
                        <div key={fIdx} className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-6">
                    {isCurrent ? (
                      <button
                        disabled
                        className="w-full py-2.5 rounded-lg bg-slate-100 text-slate-500 font-bold text-xs cursor-default text-center"
                      >
                        Active Plan
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSubscribe(plan)}
                        disabled={loading && subscribingPlanId === plan.id}
                        className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {loading && subscribingPlanId === plan.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CreditCard className="w-3.5 h-3.5" />
                        )}
                        <span>Subscribe to {plan.name}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
