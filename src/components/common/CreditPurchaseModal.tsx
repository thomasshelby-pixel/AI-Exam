import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { apiRequest } from '../../api/client.js';
import { X, CheckCircle2, CreditCard, ShieldCheck, Zap, AlertCircle } from 'lucide-react';

interface CreditPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
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

export const CreditPurchaseModal: React.FC<CreditPurchaseModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user, refreshUser } = useAuth();
  const [selectedQuantity, setSelectedQuantity] = useState<number>(10);
  const [customQuantity, setCustomQuantity] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  if (!isOpen) return null;

  const currentQuantity = customQuantity ? Math.max(1, parseInt(customQuantity) || 1) : selectedQuantity;
  const priceInINR = currentQuantity * 10; // ₹10 per credit

  const handleCheckout = async () => {
    if (!user) {
      setErrorMsg('Please sign in or create a student account to purchase evaluation credits.');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg('');
      setSuccessMsg('');

      // 1. Create real order on backend
      const res = await apiRequest<{
        success: boolean;
        isConfigured: boolean;
        order: {
          orderId: string;
          razorpayOrderId: string;
          amountPaise: number;
          currency: string;
          keyId: string;
          quantity: number;
        };
      }>('/api/payments/create-order', {
        method: 'POST',
        body: JSON.stringify({ quantity: currentQuantity }),
      });

      const { order, isConfigured } = res;

      if (!isConfigured) {
        setErrorMsg('Razorpay payment gateway is not yet configured. Please configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Settings > Secrets to process live credit purchases.');
        setIsLoading(false);
        return;
      }

      if (!window.Razorpay) {
        setErrorMsg('Razorpay checkout script failed to load. Please check your internet connection and reload the page.');
        setIsLoading(false);
        return;
      }

      // Open standard Razorpay Checkout
      const options = {
        key: order.keyId,
        amount: order.amountPaise,
        currency: 'INR',
        name: 'CA Exam Checker AI',
        description: `Purchase of ${currentQuantity} Evaluation Credits (₹10/Paper)`,
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
            setSuccessMsg(`Payment successful! ${currentQuantity} credits added to your account.`);
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
      rzp.on('payment.failed', function (response: unknown) {
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-5 sm:p-6 shadow-xl relative text-slate-800 dark:text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-800">
            <CreditCard className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Add Evaluation Credits</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">ICAI-Aligned Step-Marking & Answer Sheet Checks</p>
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

        {/* Credit Options */}
        <div className="space-y-3 mb-5">
          <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Select Credit Pack</label>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { qty: 5, label: '5 Papers', price: 50, tag: '' },
              { qty: 10, label: '10 Papers', price: 100, tag: 'Popular' },
              { qty: 20, label: '20 Papers', price: 200, tag: 'Best Value' },
            ].map((pack) => {
              const isSelected = !customQuantity && selectedQuantity === pack.qty;
              return (
                <button
                  key={pack.qty}
                  type="button"
                  onClick={() => {
                    setSelectedQuantity(pack.qty);
                    setCustomQuantity('');
                  }}
                  className={`p-2.5 rounded-lg border text-left transition relative ${
                    isSelected
                      ? 'bg-blue-50/80 dark:bg-blue-950/60 border-blue-600 dark:border-blue-500 text-blue-950 dark:text-blue-200'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  {pack.tag && (
                    <span className="absolute -top-2 right-1.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-600 text-white">
                      {pack.tag}
                    </span>
                  )}
                  <p className="text-xs font-bold">{pack.label}</p>
                  <p className="text-xs font-mono text-blue-700 dark:text-blue-300 font-bold mt-0.5">₹{pack.price}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">₹10/check</p>
                </button>
              );
            })}
          </div>

          {/* Custom Quantity */}
          <div className="pt-1">
            <label className="text-xs text-slate-600 dark:text-slate-300 block mb-1">Or enter custom quantity:</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="500"
                placeholder="e.g. 15"
                value={customQuantity}
                onChange={(e) => setCustomQuantity(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-800"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 font-medium">Credits</span>
            </div>
          </div>
        </div>

        {/* Pricing Summary */}
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3.5 border border-slate-200 dark:border-slate-700 mb-5 space-y-1.5">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Quantity</span>
            <span className="font-semibold text-slate-800 dark:text-white">{currentQuantity} Full Answer Sheets</span>
          </div>
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Rate</span>
            <span className="font-semibold text-slate-800 dark:text-white">₹10 / Paper</span>
          </div>
          <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 flex justify-between items-baseline">
            <span className="text-xs font-bold text-slate-800 dark:text-white">Total Amount</span>
            <span className="text-lg font-mono font-bold text-slate-900 dark:text-white">₹{priceInINR}</span>
          </div>
          <div className="pt-1 text-[11px] text-blue-700 dark:text-blue-300 bg-blue-50/70 dark:bg-blue-950/50 -mx-3.5 -mb-3.5 p-2 rounded-b-lg border-t border-blue-100 dark:border-blue-900 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>Valid for <strong>exactly 3 months</strong> from purchase date. Consumed via First-Expiring, First-Out (FEFO).</span>
          </div>
        </div>

        {/* Security badges */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-5 px-1">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Razorpay 256-bit Encrypted
          </span>
          <span className="flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Instant Activation
          </span>
        </div>

        {/* Action button */}
        <button
          id="btn-confirm-checkout"
          onClick={handleCheckout}
          disabled={isLoading || currentQuantity < 1}
          className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          {isLoading ? (
            <span>Processing Gateway Order...</span>
          ) : (
            <>
              <CreditCard className="w-4 h-4" />
              Pay ₹{priceInINR} with Razorpay Standard
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
