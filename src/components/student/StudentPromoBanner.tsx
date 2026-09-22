import React, { useState } from 'react';
import { Gift, CheckCircle2, Clock, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDateIST } from '../../utils/timezone.js';

export interface ActivePromoData {
  referralCode: string;
  evaluationsRemaining: number;
  maxEvaluations: number;
  expiryDate: string;
  status: string;
}

export interface LatestRedemptionData {
  referralCode: string;
  expiryDate: string;
  status: string;
}

export interface ReferralStatusData {
  hasActivePromo?: boolean;
  hasRedeemed?: boolean;
  activePromo?: ActivePromoData | null;
  latestRedemption?: LatestRedemptionData | null;
  ai30Campaign?: {
    isFullyClaimed?: boolean;
    remainingRedemptions?: number;
  } | null;
}

interface StudentPromoBannerProps {
  referralStatus: ReferralStatusData | null;
  onRedeem: (code: string) => Promise<boolean>;
  isRedeeming?: boolean;
  onNavigateProfile?: () => void;
  onOpenCreditsModal?: () => void;
  className?: string;
}

export const StudentPromoBanner: React.FC<StudentPromoBannerProps> = ({
  referralStatus,
  onRedeem,
  isRedeeming = false,
  onNavigateProfile,
  onOpenCreditsModal,
  className = '',
}) => {
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [localFeedback, setLocalFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = promoCodeInput.trim().toUpperCase();
    if (!cleanCode || isRedeeming) return;

    setLocalFeedback(null);
    try {
      const success = await onRedeem(cleanCode);
      if (success) {
        setPromoCodeInput('');
        setLocalFeedback({
          text: 'Promo code successfully claimed! Your benefits are now active.',
          type: 'success',
        });
      }
    } catch (err: any) {
      setLocalFeedback({
        text: err?.message || 'Failed to claim promo code. Please check and try again.',
        type: 'error',
      });
    }
  };

  const hasActive = Boolean(referralStatus?.hasActivePromo && referralStatus.activePromo);
  const isExpired = Boolean(
    !hasActive &&
      referralStatus?.hasRedeemed &&
      (referralStatus.latestRedemption?.status === 'EXPIRED' ||
        (referralStatus.latestRedemption?.expiryDate &&
          new Date(referralStatus.latestRedemption.expiryDate).getTime() <= Date.now()))
  );

  return (
    <div id="student-promo-banner-container" className={`w-full ${className}`}>
      <AnimatePresence mode="wait">
        {hasActive && referralStatus?.activePromo ? (
          /* ======================================================== */
          /* VIEW 2: ACTIVE PROMO BENEFIT (Redeemed State)             */
          /* Shows ONLY code, usage stats, and expiry. No input/claim! */
          /* ======================================================== */
          <motion.div
            key="view-active-benefit"
            id="student-promo-active-card"
            initial={{ opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.99 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Active Promo Benefit
                  </span>
                  <span
                    id="active-promo-code-pill"
                    className="text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700"
                  >
                    {referralStatus.activePromo.referralCode}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Valid until{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {formatDateIST(referralStatus.activePromo.expiryDate)}
                  </strong>
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-5 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100 dark:border-slate-800">
              <div className="text-left sm:text-right">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Evaluations Remaining</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  <span
                    id="active-promo-remaining-count"
                    className="text-emerald-600 dark:text-emerald-400 font-mono text-base"
                  >
                    {referralStatus.activePromo.evaluationsRemaining}
                  </span>{' '}
                  <span className="text-slate-400 text-xs">/ {referralStatus.activePromo.maxEvaluations}</span>
                </div>
              </div>
              {onNavigateProfile && (
                <button
                  type="button"
                  id="active-promo-manage-btn"
                  onClick={onNavigateProfile}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold shrink-0 cursor-pointer flex items-center gap-1"
                >
                  <span>Manage</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </motion.div>
        ) : isExpired && referralStatus?.latestRedemption ? (
          /* ======================================================== */
          /* EXPIRED BENEFIT NOTICE                                  */
          /* ======================================================== */
          <motion.div
            key="view-expired-notice"
            id="student-promo-expired-card"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.25 }}
            className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 px-4 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                Promotional offer (
                <strong className="text-slate-700 dark:text-slate-300">
                  {referralStatus.latestRedemption.referralCode}
                </strong>
                ) expired on {formatDateIST(referralStatus.latestRedemption.expiryDate)}.
              </span>
            </div>
            {onOpenCreditsModal && (
              <button
                type="button"
                id="expired-promo-buy-credits-btn"
                onClick={onOpenCreditsModal}
                className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer shrink-0"
              >
                Get Credits &rarr;
              </button>
            )}
          </motion.div>
        ) : (
          /* ======================================================== */
          /* VIEW 1: UNREDEEMED STATE (Promo Input & Claim Button)     */
          /* ======================================================== */
          <motion.div
            key="view-unredeemed-input"
            id="student-promo-claim-card"
            initial={{ opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.99 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-xs"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shrink-0 shadow-2xs">
                  <Gift className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Special Promotion
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 font-medium mt-0.5">
                    Have a promo code? Enter it below to unlock{' '}
                    <strong className="font-bold text-slate-900 dark:text-white">Free Mock Evaluations</strong> and
                    official ICAI step-mark audit benefits.
                  </p>
                  {localFeedback && (
                    <p
                      id="promo-feedback-msg"
                      className={`text-xs mt-1.5 font-semibold ${
                        localFeedback.type === 'success'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {localFeedback.text}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-start lg:items-end gap-1.5 shrink-0">
                <form
                  onSubmit={handleSubmit}
                  className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto"
                >
                  <input
                    type="text"
                    id="student-promo-code-input"
                    value={promoCodeInput}
                    onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                    disabled={isRedeeming || (referralStatus?.ai30Campaign?.isFullyClaimed ?? false)}
                    placeholder="Enter Promo Code"
                    className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-mono font-bold uppercase text-slate-900 dark:text-slate-100 placeholder:text-slate-400 placeholder:normal-case placeholder:font-sans focus:outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 w-full sm:w-44 disabled:opacity-60 transition"
                  />
                  <button
                    type="submit"
                    id="student-promo-claim-btn"
                    disabled={
                      isRedeeming ||
                      !promoCodeInput.trim() ||
                      (referralStatus?.ai30Campaign?.isFullyClaimed ?? false)
                    }
                    className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold px-4 py-2 rounded-lg text-xs sm:text-sm shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {isRedeeming ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Claiming...</span>
                      </>
                    ) : (
                      <span>Claim</span>
                    )}
                  </button>
                </form>

                {referralStatus?.ai30Campaign && !referralStatus.ai30Campaign.isFullyClaimed && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Use code <strong className="font-mono font-bold text-slate-700 dark:text-slate-300">AI30</strong>{' '}
                    for instant 1-month access
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
