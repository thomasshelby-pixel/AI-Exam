import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { apiRequest } from '../../api/client.js';
import { X, CheckCircle2, CreditCard, ShieldCheck, Zap, AlertCircle, Layers, Sparkles } from 'lucide-react';
import { loadRazorpayScript } from '../../utils/loadRazorpay.js';

export interface CreditPurchaseModalInitialConfig {
  tab?: 'COMBO' | 'CUSTOM';
  plan?: 'COMBO_1' | 'COMBO_2';
  level?: 'FOUNDATION' | 'INTERMEDIATE';
  quantity?: number;
}

interface CreditPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialConfig?: CreditPurchaseModalInitialConfig;
}

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
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

// Approved pricing constants
export const COMBO_PLANS = {
  COMBO_1: {
    id: 'COMBO_1' as const,
    name: 'Combo 1',
    FOUNDATION: { evaluations: 4, price: 119 },
    INTERMEDIATE: { evaluations: 6, price: 175 },
  },
  COMBO_2: {
    id: 'COMBO_2' as const,
    name: 'Combo 2',
    FOUNDATION: { evaluations: 8, price: 219 },
    INTERMEDIATE: { evaluations: 12, price: 329 },
  },
} as const;

export const CUSTOM_RATE_PER_EVALUATION = 35; // ₹35 per evaluation

export const CreditPurchaseModal: React.FC<CreditPurchaseModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialConfig,
}) => {
  const { user, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'COMBO' | 'CUSTOM'>('COMBO');
  const [comboPlan, setComboPlan] = useState<'COMBO_1' | 'COMBO_2'>('COMBO_1');
  const [comboLevel, setComboLevel] = useState<'FOUNDATION' | 'INTERMEDIATE'>('INTERMEDIATE');
  const [customQtyInput, setCustomQtyInput] = useState<string>('5');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  useEffect(() => {
    if (initialConfig) {
      if (initialConfig.tab) setActiveTab(initialConfig.tab);
      if (initialConfig.plan) setComboPlan(initialConfig.plan);
      if (initialConfig.level) setComboLevel(initialConfig.level);
      if (initialConfig.quantity && initialConfig.quantity > 0) {
        setCustomQtyInput(String(initialConfig.quantity));
      }
    }
  }, [initialConfig, isOpen]);

  if (!isOpen) return null;

  // Custom validation
  const parsedCustomQty = parseInt(customQtyInput.trim(), 10);
  const isCustomValid =
    Number.isInteger(parsedCustomQty) &&
    parsedCustomQty > 0 &&
    parsedCustomQty <= 500 &&
    String(parsedCustomQty) === customQtyInput.trim();
  const validatedCustomQty = isCustomValid ? parsedCustomQty : 1;
  const customTotalPrice = isCustomValid ? validatedCustomQty * CUSTOM_RATE_PER_EVALUATION : 0;

  // Combo calculation
  const currentCombo = COMBO_PLANS[comboPlan][comboLevel];

  // Active summary
  const currentTotalAmount = activeTab === 'COMBO' ? currentCombo.price : customTotalPrice;
  const currentEvaluationsCount = activeTab === 'COMBO' ? currentCombo.evaluations : (isCustomValid ? validatedCustomQty : 0);

  const handleCheckout = async () => {
    if (!user) {
      setErrorMsg('Please sign in or create a student account to purchase evaluation credits.');
      return;
    }

    if (activeTab === 'CUSTOM' && !isCustomValid) {
      setErrorMsg('Please enter a valid whole number of evaluations (minimum 1, maximum 500).');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg('');
      setSuccessMsg('');

      // 1. Create real order on backend (amount strictly computed server-side)
      const requestPayload =
        activeTab === 'COMBO'
          ? { purchaseType: comboPlan, courseLevel: comboLevel }
          : { purchaseType: 'CUSTOM', quantity: validatedCustomQty };

      const res = await apiRequest<{
        success: boolean;
        isConfigured: boolean;
        order: {
          orderId: string;
          razorpayOrderId: string;
          amountPaise: number;
          amountINR: number;
          currency: string;
          keyId: string;
          quantity: number;
          description?: string;
        };
      }>('/api/payments/create-order', {
        method: 'POST',
        body: JSON.stringify(requestPayload),
      });

      const { order, isConfigured } = res;

      if (!isConfigured) {
        setErrorMsg('Razorpay payment gateway is not yet configured. Please configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Settings > Secrets to process live credit purchases.');
        setIsLoading(false);
        return;
      }

      if (!window.Razorpay) {
        const loaded = await loadRazorpayScript();
        if (!loaded || !window.Razorpay) {
          setErrorMsg('Razorpay checkout script failed to load. Please check your internet connection and reload the page.');
          setIsLoading(false);
          return;
        }
      }

      // Open standard Razorpay Checkout
      const checkoutDescription =
        activeTab === 'COMBO'
          ? `${comboPlan === 'COMBO_1' ? 'Combo 1' : 'Combo 2'} (${comboLevel === 'FOUNDATION' ? 'Foundation' : 'Intermediate'} - ${order.quantity} Evaluations)`
          : `Custom Purchase (${order.quantity} Evaluations @ ₹${CUSTOM_RATE_PER_EVALUATION}/Paper)`;

      const options = {
        key: order.keyId,
        amount: order.amountPaise,
        currency: 'INR',
        name: 'CA Exam Checker AI',
        description: checkoutDescription,
        order_id: order.razorpayOrderId,
        prefill: {
          name: user?.fullName || '',
          email: user?.email || '',
          contact: user?.phone || '',
        },
        theme: {
          color: '#2563eb',
        },
        modal: {
          ondismiss: function () {
            setIsLoading(false);
          },
        },
        handler: async function (response: RazorpayResponse) {
          try {
            // Verify cryptographic signature server-side
            await apiRequest('/api/payments/verify', {
              method: 'POST',
              body: JSON.stringify({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });

            await refreshUser();
            setSuccessMsg(`Payment successful! ${order.quantity} evaluation credits added to your account.`);
            setTimeout(() => {
              onSuccess?.();
              onClose();
            }, 1500);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Verification failed';
            setErrorMsg(msg);
          } finally {
            setIsLoading(false);
          }
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function () {
        setErrorMsg('Payment was declined or cancelled.');
        setIsLoading(false);
      });
      rzp.open();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Checkout failed';
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-5 sm:p-6 shadow-xl relative text-slate-800 dark:text-slate-100 max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-800 shrink-0">
            <CreditCard className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Purchase Evaluation Credits</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Choose a structured Combo Plan or buy exact Custom Evaluations</p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Pricing Category Tabs */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-4 border border-slate-200 dark:border-slate-700 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('COMBO')}
            className={`py-2 px-3 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'COMBO'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Combo Plans</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('CUSTOM')}
            className={`py-2 px-3 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'CUSTOM'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Custom Quantity (₹35/ea)</span>
          </button>
        </div>

        {/* TAB 1: COMBO PLANS */}
        {activeTab === 'COMBO' && (
          <div className="space-y-4 mb-5">
            {/* Course Level Switcher */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Select Course Level
                </label>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  Evaluations & pricing match syllabus depth
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setComboLevel('FOUNDATION')}
                  className={`py-1.5 px-2 rounded-md text-xs font-bold transition cursor-pointer text-center ${
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
                  className={`py-1.5 px-2 rounded-md text-xs font-bold transition cursor-pointer text-center ${
                    comboLevel === 'INTERMEDIATE'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  CA Intermediate
                </button>
              </div>
            </div>

            {/* Combo Plan Cards */}
            <div className="grid grid-cols-2 gap-3">
              {/* COMBO 1 */}
              <button
                type="button"
                onClick={() => setComboPlan('COMBO_1')}
                className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between relative ${
                  comboPlan === 'COMBO_1'
                    ? 'bg-blue-50/70 dark:bg-blue-950/60 border-blue-600 dark:border-blue-500 shadow-xs'
                    : 'bg-slate-50/70 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">COMBO 1</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                      {COMBO_PLANS.COMBO_1[comboLevel].evaluations} Evals
                    </span>
                  </div>
                  <p className="text-lg font-black font-mono text-blue-600 dark:text-blue-400 mt-1">
                    ₹{COMBO_PLANS.COMBO_1[comboLevel].price}
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                    {comboLevel === 'FOUNDATION' ? 'Foundation — 4 Evals' : 'Intermediate — 6 Evals'}
                  </p>
                </div>
                <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  {comboLevel === 'FOUNDATION' ? '₹119 Combo Price' : '₹175 Combo Price'}
                </div>
              </button>

              {/* COMBO 2 */}
              <button
                type="button"
                onClick={() => setComboPlan('COMBO_2')}
                className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between relative ${
                  comboPlan === 'COMBO_2'
                    ? 'bg-indigo-50/70 dark:bg-indigo-950/60 border-indigo-600 dark:border-indigo-500 shadow-xs'
                    : 'bg-slate-50/70 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">COMBO 2</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                      {COMBO_PLANS.COMBO_2[comboLevel].evaluations} Evals
                    </span>
                  </div>
                  <p className="text-lg font-black font-mono text-indigo-600 dark:text-indigo-400 mt-1">
                    ₹{COMBO_PLANS.COMBO_2[comboLevel].price}
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                    {comboLevel === 'FOUNDATION' ? 'Foundation — 8 Evals' : 'Intermediate — 12 Evals'}
                  </p>
                </div>
                <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  {comboLevel === 'FOUNDATION' ? '₹219 Combo Price' : '₹329 Combo Price'}
                </div>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: CUSTOM EVALUATION */}
        {activeTab === 'CUSTOM' && (
          <div className="space-y-4 mb-5">
            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">
                Enter Exact Quantity of Evaluations
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
                <p className="text-[11px] text-rose-500 font-medium mt-1">
                  Please enter a positive whole integer between 1 and 500.
                </p>
              )}
            </div>

            {/* Quick Chips */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1.5">
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
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                    }`}
                  >
                    <div className="font-bold">{qty}</div>
                    <div className="text-[10px] font-mono opacity-90">₹{qty * 35}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Pricing Summary Card */}
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3.5 border border-slate-200 dark:border-slate-700 mb-5 space-y-2 text-xs font-mono">
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Purchase Type:</span>
            <span className="font-bold text-slate-900 dark:text-white">
              {activeTab === 'COMBO' ? `${comboPlan === 'COMBO_1' ? 'Combo 1' : 'Combo 2'} (${comboLevel === 'FOUNDATION' ? 'Foundation' : 'Intermediate'})` : 'Custom Evaluation'}
            </span>
          </div>
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Evaluations:</span>
            <span className="font-bold text-slate-900 dark:text-white">{currentEvaluationsCount} Full 100-Mark Papers</span>
          </div>
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Rate:</span>
            <span className="font-bold text-slate-900 dark:text-white">
              {activeTab === 'COMBO'
                ? `Combo Package (₹${currentTotalAmount})`
                : `₹${CUSTOM_RATE_PER_EVALUATION} / Paper`}
            </span>
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-baseline text-sm font-bold text-slate-900 dark:text-white">
            <span>Total Payable:</span>
            <span className="text-lg font-black text-blue-600 dark:text-blue-400 font-mono">
              ₹{currentTotalAmount}
            </span>
          </div>
          <div className="pt-1 text-[11px] text-blue-700 dark:text-blue-300 bg-blue-50/70 dark:bg-blue-950/50 -mx-3.5 -mb-3.5 p-2 rounded-b-xl border-t border-blue-100 dark:border-blue-900 flex items-center gap-1.5 font-sans">
            <Zap className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>Valid for <strong>3 months</strong> from purchase. Consumed via First-Expiring, First-Out (FEFO).</span>
          </div>
        </div>

        {/* Security badges */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-4 px-1">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Secure, encrypted payment
          </span>
          <span className="flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Instant Credit Activation
          </span>
        </div>

        {/* Action button */}
        <button
          id="btn-confirm-checkout"
          onClick={handleCheckout}
          disabled={isLoading || (activeTab === 'CUSTOM' && !isCustomValid)}
          className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {isLoading ? (
            <span>Processing Gateway Order...</span>
          ) : (
            <>
              <CreditCard className="w-4 h-4" />
              Pay ₹{currentTotalAmount}
            </>
          )}
        </button>

        {/* Legal Consent & Disclosures */}
        <p className="mt-3 text-[11px] text-center text-slate-500 dark:text-slate-400 leading-normal">
          By proceeding, you agree to our{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/refund-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
            Refund & Cancellation Policy
          </a>
          . Credits are valid for 3 months from issuance and are non-refundable after delivery.
        </p>
      </div>
    </div>
  );
};
