import crypto from 'node:crypto';
import { db } from '../db.js';
import { syncRecordToFirestore } from './firestoreSyncService.js';

export interface CreditLotRecord {
  id: string;
  user_id: string;
  order_id: string | null;
  payment_id: string | null;
  credits_purchased: number;
  credits_remaining: number;
  valid_from: string;
  expires_at: string;
  purchase_date: string;
  status: 'ACTIVE' | 'CONSUMED' | 'EXPIRED';
  created_at: string;
  updated_at: string;
}

export interface CreditLotSummary {
  id: string;
  orderId: string | null;
  paymentId: string | null;
  creditsPurchased: number;
  creditsRemaining: number;
  validFrom: string;
  expiresAt: string;
  purchaseDate: string;
  status: 'ACTIVE' | 'CONSUMED' | 'EXPIRED';
  isExpired: boolean;
  isExpiringSoon: boolean; // within 30 days
  daysRemaining: number;
}

export interface StudentCreditStatus {
  totalValidCredits: number;
  expiringSoonCredits: number;
  earliestExpiryDate: string | null;
  lots: CreditLotSummary[];
}

export interface MonthlyFreeEvaluationStatus {
  userId: string;
  monthlyFreeEvaluationsUsed: number;
  monthlyFreeEvaluationsLimit: number;
  freeEvaluationResetMonth: string;
  freeEvaluationsRemaining: number;
  paidCredits: number;
}

export interface StudentCreditDetailedSummary {
  monthlyFreeEvaluationsUsed: number;
  monthlyFreeEvaluationsLimit: number;
  freeEvaluationResetMonth: string;
  freeEvaluationsRemaining: number;
  paidCredits: number;
  totalAvailable: number;
  canEvaluate: boolean;
  statusMessage: string;
}

/**
 * Authoritatively syncs a student's full credit state to Cloud Firestore.
 * Pushes:
 * 1. student_profiles (purchased_credits, paid_credits, free_evaluations_used, monthly_free_evaluations_used, updated_at)
 * 2. All student_credit_purchases lots for the student
 * 3. Recent credit_ledger entries
 */
export async function syncStudentCreditsToFirestore(userId: string): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    const profile = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(userId) as any;
    if (profile) {
      profile.updated_at = nowIso;
      profile._updatedAt = nowIso;
      await syncRecordToFirestore('student_profiles', userId, profile);
    }

    const lots = db.prepare('SELECT * FROM student_credit_purchases WHERE user_id = ?').all(userId) as any[];
    for (const lot of lots) {
      lot.updated_at = nowIso;
      lot._updatedAt = nowIso;
      await syncRecordToFirestore('student_credit_purchases', lot.id, lot);
    }

    const ledgers = db.prepare('SELECT * FROM credit_ledger WHERE student_id = ? ORDER BY datetime(created_at) DESC LIMIT 10').all(userId) as any[];
    for (const ledger of ledgers) {
      ledger._updatedAt = nowIso;
      await syncRecordToFirestore('credit_ledger', ledger.id, ledger);
    }
  } catch (err) {
    console.warn(`[StudentCreditService] Firestore credit sync warning for user ${userId}:`, err);
  }
}

/**
 * Returns the current calendar month formatted as 'YYYY-MM'.
 * Calculated strictly from server/database date, not client date.
 */
export function getCurrentServerMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Ensures monthly free evaluations are reset at the beginning of each calendar month.
 * - Sets monthlyFreeEvaluationsUsed = 0
 * - Sets monthlyFreeEvaluationsLimit = 2
 * - Sets freeEvaluationResetMonth to current server calendar month
 * - DO NOT modify paidCredits.
 * - Idempotent and thread-safe: Prevents duplicate resets for the same month.
 */
export function ensureMonthlyFreeEvaluationsReset(userId: string): MonthlyFreeEvaluationStatus {
  const currentMonth = getCurrentServerMonth();

  const profile = db.prepare(`
    SELECT user_id, monthly_free_evaluations_used, monthly_free_evaluations_limit, free_evaluation_reset_month,
           free_evaluations_used, purchased_credits, paid_credits
    FROM student_profiles
    WHERE user_id = ?
  `).get(userId) as any;

  if (!profile) {
    const paidCredits = getValidStudentCreditBalance(userId);
    return {
      userId,
      monthlyFreeEvaluationsUsed: 0,
      monthlyFreeEvaluationsLimit: 2,
      freeEvaluationResetMonth: currentMonth,
      freeEvaluationsRemaining: 2,
      paidCredits,
    };
  }

  const resetMonth = profile.free_evaluation_reset_month;

  // If new month started or resetMonth not initialized, perform automatic monthly reset
  if (!resetMonth || resetMonth !== currentMonth) {
    db.prepare(`
      UPDATE student_profiles
      SET monthly_free_evaluations_used = 0,
          monthly_free_evaluations_limit = 2,
          free_evaluation_reset_month = ?,
          free_evaluations_used = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND (free_evaluation_reset_month IS NULL OR free_evaluation_reset_month != ?)
    `).run(currentMonth, userId, currentMonth);

    const paidCredits = getValidStudentCreditBalance(userId);
    syncStudentCreditsToFirestore(userId).catch(() => {});
    return {
      userId,
      monthlyFreeEvaluationsUsed: 0,
      monthlyFreeEvaluationsLimit: 2,
      freeEvaluationResetMonth: currentMonth,
      freeEvaluationsRemaining: 2,
      paidCredits,
    };
  }

  const limit = typeof profile.monthly_free_evaluations_limit === 'number' ? profile.monthly_free_evaluations_limit : 2;
  const used = typeof profile.monthly_free_evaluations_used === 'number' ? profile.monthly_free_evaluations_used : 0;
  const freeRemaining = Math.max(0, limit - used);
  const paidCredits = getValidStudentCreditBalance(userId);

  return {
    userId,
    monthlyFreeEvaluationsUsed: used,
    monthlyFreeEvaluationsLimit: limit,
    freeEvaluationResetMonth: resetMonth,
    freeEvaluationsRemaining: freeRemaining,
    paidCredits,
  };
}

/**
 * Returns detailed separate balances for Free Evaluations and Paid Credits.
 * Never combines them into a single indistinguishable balance.
 */
export function getStudentCreditDetailedSummary(userId: string): StudentCreditDetailedSummary {
  const status = ensureMonthlyFreeEvaluationsReset(userId);
  const totalAvailable = status.freeEvaluationsRemaining + status.paidCredits;
  const canEvaluate = totalAvailable > 0;

  let statusMessage = '';
  if (status.freeEvaluationsRemaining > 0) {
    statusMessage = `Free Evaluations: ${status.freeEvaluationsRemaining}/${status.monthlyFreeEvaluationsLimit} remaining this month`;
  } else if (status.paidCredits > 0) {
    statusMessage = `Paid Credits: ${status.paidCredits} available`;
  } else {
    statusMessage = 'Your free evaluations for this month are exhausted. Please purchase credits to continue.';
  }

  return {
    monthlyFreeEvaluationsUsed: status.monthlyFreeEvaluationsUsed,
    monthlyFreeEvaluationsLimit: status.monthlyFreeEvaluationsLimit,
    freeEvaluationResetMonth: status.freeEvaluationResetMonth,
    freeEvaluationsRemaining: status.freeEvaluationsRemaining,
    paidCredits: status.paidCredits,
    totalAvailable,
    canEvaluate,
    statusMessage,
  };
}

/**
 * Calculates an expiry date exactly 3 months from purchaseDate/issuanceDate.
 * Example:
 * 8 September 2026 -> 8 December 2026
 * Handles month-end date clamping (e.g., Nov 30 -> Feb 28).
 */
export function calculateThreeMonthsExpiry(purchaseDate: Date = new Date()): string {
  const expiry = new Date(purchaseDate.getTime());
  const startDay = purchaseDate.getDate();
  const targetMonth = (purchaseDate.getMonth() + 3) % 12;

  expiry.setMonth(purchaseDate.getMonth() + 3);

  // If day overflowed into the following month (e.g. Aug 31 + 3 months -> Nov 31 doesn't exist so becomes Dec 1)
  if (expiry.getMonth() !== targetMonth) {
    expiry.setDate(0); // Clamps to the last day of target month (e.g., Nov 30)
  } else {
    expiry.setDate(startDay);
  }

  return expiry.toISOString();
}

/**
 * Automatically transitions overdue active lots to 'EXPIRED'.
 * Called automatically before credit queries and consumption.
 */
export function expireOverdueCreditLots(userId?: string): number {
  try {
    let query = `
      UPDATE student_credit_purchases
      SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'ACTIVE'
        AND datetime(expires_at) <= datetime('now')
    `;
    const params: unknown[] = [];
    if (userId) {
      query += ` AND user_id = ?`;
      params.push(userId);
    }
    const result = db.prepare(query).run(...params as any);
    return Number(result.changes || 0);
  } catch (err) {
    console.warn('Error expiring credit lots:', err);
    return 0;
  }
}

/**
 * Returns the exact current active, unexpired usable credit balance for a student.
 * Rule 4 & 10: Expired credits are strictly excluded.
 */
export function getValidStudentCreditBalance(userId: string): number {
  // First run cleanup for this user
  expireOverdueCreditLots(userId);

  const row = db.prepare(`
    SELECT COALESCE(SUM(credits_remaining), 0) AS valid_credits
    FROM student_credit_purchases
    WHERE user_id = ?
      AND status = 'ACTIVE'
      AND credits_remaining > 0
      AND datetime(expires_at) > datetime('now')
  `).get(userId) as { valid_credits: number } | undefined;

  let validCredits = row ? Number(row.valid_credits) : 0;

  // SAFETY NET & SELF-HEALING:
  // ONLY backfill if this student has ZERO lots ever recorded in student_credit_purchases
  // AND has ZERO historical deductions in credit_ledger.
  // If a student already has lots or deductions, validCredits is authoritative (even if 0)!
  if (validCredits === 0) {
    try {
      const lotCount = db.prepare('SELECT COUNT(*) as count FROM student_credit_purchases WHERE user_id = ?').get(userId) as { count: number };
      const deductionCount = db.prepare('SELECT COUNT(*) as count FROM credit_ledger WHERE student_id = ? AND amount < 0').get(userId) as { count: number };
      
      if ((!lotCount || lotCount.count === 0) && (!deductionCount || deductionCount.count === 0)) {
        const profile = db.prepare('SELECT purchased_credits, paid_credits FROM student_profiles WHERE user_id = ?').get(userId) as any;
        const profileCreds = Math.max(Number(profile?.purchased_credits || 0), Number(profile?.paid_credits || 0));
        if (profileCreds > 0) {
          const now = new Date();
          const expiresAt = calculateThreeMonthsExpiry(now);
          const lotId = `crd_backfill_${crypto.randomBytes(6).toString('hex')}`;
          db.prepare(`
            INSERT INTO student_credit_purchases (
              id, user_id, order_id, payment_id, credits_purchased, credits_remaining,
              valid_from, expires_at, purchase_date, status, created_at, updated_at
            ) VALUES (?, ?, 'ord_granted', 'pay_granted', ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(lotId, userId, profileCreds, profileCreds, now.toISOString(), expiresAt, now.toISOString());
          validCredits = profileCreds;
          syncStudentCreditsToFirestore(userId).catch(() => {});
        }
      }
    } catch (backfillErr) {
      console.warn('[studentCreditService] Credit safety-net backfill warning:', backfillErr);
    }
  }

  // Keep student_profiles in sync with the real-time valid credit balance
  try {
    db.prepare(`
      UPDATE student_profiles
      SET purchased_credits = ?,
          paid_credits = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(validCredits, validCredits, userId);
  } catch (err) {
    console.warn('Sync student profile credits warning:', err);
  }

  return validCredits;
}

/**
 * Returns detailed breakdown of credit lots, expiry dates, and expiring-soon indicators.
 * Rule 9: Student dashboard display.
 */
export function getStudentCreditStatus(userId: string): StudentCreditStatus {
  expireOverdueCreditLots(userId);

  const rawLots = (db.prepare(`
    SELECT id, order_id, payment_id, credits_purchased, credits_remaining,
           valid_from, expires_at, purchase_date, status, created_at, updated_at
    FROM student_credit_purchases
    WHERE user_id = ?
    ORDER BY datetime(purchase_date) DESC
  `).all(userId) as unknown) as CreditLotRecord[];

  const nowMs = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  let totalValidCredits = 0;
  let expiringSoonCredits = 0;
  let earliestExpiryDate: string | null = null;
  let earliestExpiryMs = Infinity;

  const lots: CreditLotSummary[] = rawLots.map((lot) => {
    const expiryMs = new Date(lot.expires_at).getTime();
    const isPast = expiryMs <= nowMs;
    const isExpired = lot.status === 'EXPIRED' || isPast;
    const daysRemaining = Math.max(0, Math.ceil((expiryMs - nowMs) / (24 * 60 * 60 * 1000)));
    const isExpiringSoon = !isExpired && lot.credits_remaining > 0 && (expiryMs - nowMs <= thirtyDaysMs);

    if (!isExpired && lot.credits_remaining > 0) {
      totalValidCredits += lot.credits_remaining;
      if (isExpiringSoon) {
        expiringSoonCredits += lot.credits_remaining;
      }
      if (expiryMs < earliestExpiryMs) {
        earliestExpiryMs = expiryMs;
        earliestExpiryDate = lot.expires_at;
      }
    }

    return {
      id: lot.id,
      orderId: lot.order_id,
      paymentId: lot.payment_id,
      creditsPurchased: lot.credits_purchased,
      creditsRemaining: isExpired ? 0 : lot.credits_remaining,
      validFrom: lot.valid_from,
      expiresAt: lot.expires_at,
      purchaseDate: lot.purchase_date,
      status: isExpired ? 'EXPIRED' : lot.status,
      isExpired,
      isExpiringSoon,
      daysRemaining,
    };
  });

  return {
    totalValidCredits,
    expiringSoonCredits,
    earliestExpiryDate,
    lots,
  };
}

/**
 * Creates a new credit purchase lot with exactly 3 months validity.
 * Rule 1, 2, 3, 5: Every separate credit purchase retains its own 3-month expiry date.
 */
export function recordCreditPurchase(params: {
  userId: string;
  creditsPurchased: number;
  orderId?: string;
  paymentId?: string;
  purchaseDate?: Date;
}): {
  lotId: string;
  expiresAt: string;
  validFrom: string;
  creditsPurchased: number;
  creditsRemaining: number;
  totalValidCredits: number;
} {
  const { userId, creditsPurchased, orderId, paymentId } = params;

  if (!creditsPurchased || creditsPurchased <= 0) {
    throw new Error('Credits purchased must be greater than zero.');
  }

  const purchaseDate = params.purchaseDate || new Date();
  const validFrom = purchaseDate.toISOString();
  const expiresAt = calculateThreeMonthsExpiry(purchaseDate);
  const lotId = `crd_${crypto.randomBytes(8).toString('hex')}`;

  db.prepare(`
    INSERT INTO student_credit_purchases (
      id, user_id, order_id, payment_id, credits_purchased, credits_remaining,
      valid_from, expires_at, purchase_date, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
  `).run(
    lotId,
    userId,
    orderId || null,
    paymentId || null,
    creditsPurchased,
    creditsPurchased,
    validFrom,
    expiresAt,
    validFrom
  );

  const totalValidCredits = getValidStudentCreditBalance(userId);

  try {
    db.prepare(`
      UPDATE student_profiles
      SET purchased_credits = ?,
          paid_credits = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(totalValidCredits, totalValidCredits, userId);
  } catch (profErr) {
    console.warn('[studentCreditService] Profile sync error on purchase:', profErr);
  }

  // Record into Credit Ledger
  try {
    const ledgerId = `cld_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO credit_ledger (id, student_id, amount, source, balance_after, order_id, payment_id, note)
      VALUES (?, ?, ?, 'PURCHASED', ?, ?, ?, ?)
    `).run(
      ledgerId,
      userId,
      creditsPurchased,
      totalValidCredits,
      orderId || null,
      paymentId || null,
      `Purchased ${creditsPurchased} evaluation credits (Lot ${lotId})`
    );
  } catch (ledErr) {
    console.warn('[studentCreditService] Credit ledger write warning on purchase:', ledErr);
  }

  syncStudentCreditsToFirestore(userId).catch(() => {});

  return {
    lotId,
    expiresAt,
    validFrom,
    creditsPurchased,
    creditsRemaining: creditsPurchased,
    totalValidCredits,
  };
}

/**
 * Consumes 1 credit from the valid credit lot with the earliest expiry date (FEFO).
 * Rule 6: First Expiring, First Out.
 * Rule 8: Failed evaluations must NOT consume credits.
 */
export function consumeCreditFEFO(
  userId: string,
  evaluationId: string
): {
  success: boolean;
  lotId: string;
  lotRemaining: number;
  lotExpiresAt: string;
  totalRemaining: number;
} {
  expireOverdueCreditLots(userId);

  let transactionActive = false;
  try {
    db.exec('BEGIN IMMEDIATE;');
    transactionActive = true;

    // Select the earliest-expiring ACTIVE lot with credits remaining that has not expired
    const earliestLot = db.prepare(`
      SELECT id, credits_remaining, expires_at
      FROM student_credit_purchases
      WHERE user_id = ?
        AND status = 'ACTIVE'
        AND credits_remaining > 0
        AND datetime(expires_at) > datetime('now')
      ORDER BY datetime(expires_at) ASC, datetime(created_at) ASC
      LIMIT 1
    `).get(userId) as { id: string; credits_remaining: number; expires_at: string } | undefined;

    if (!earliestLot) {
      throw new Error('No valid, unexpired evaluation credits available. Purchased credits expire after 3 months.');
    }

    const newLotRemaining = earliestLot.credits_remaining - 1;
    const newStatus = newLotRemaining === 0 ? 'CONSUMED' : 'ACTIVE';

    db.prepare(`
      UPDATE student_credit_purchases
      SET credits_remaining = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newLotRemaining, newStatus, earliestLot.id);

    const validRow = db.prepare(`
      SELECT COALESCE(SUM(credits_remaining), 0) AS valid_credits
      FROM student_credit_purchases
      WHERE user_id = ?
        AND status = 'ACTIVE'
        AND credits_remaining > 0
        AND datetime(expires_at) > datetime('now')
    `).get(userId) as { valid_credits: number } | undefined;
    const totalRemaining = validRow ? Number(validRow.valid_credits) : 0;

    db.prepare(`
      UPDATE student_profiles
      SET purchased_credits = ?,
          paid_credits = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(totalRemaining, totalRemaining, userId);

    // Credit Ledger record
    const ledgerId = `cld_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO credit_ledger (id, student_id, amount, source, balance_after, evaluation_id, note)
      VALUES (?, ?, -1, 'CONSUMED_EVALUATION', ?, ?, ?)
    `).run(
      ledgerId,
      userId,
      totalRemaining,
      evaluationId,
      `Consumed 1 purchased credit (Lot ${earliestLot.id}, Expires: ${earliestLot.expires_at})`
    );

    db.exec('COMMIT;');
    transactionActive = false;

    syncStudentCreditsToFirestore(userId).catch(() => {});

    return {
      success: true,
      lotId: earliestLot.id,
      lotRemaining: newLotRemaining,
      lotExpiresAt: earliestLot.expires_at,
      totalRemaining,
    };
  } catch (err) {
    if (transactionActive) {
      try { db.exec('ROLLBACK;'); } catch {}
    }
    throw err;
  }
}

/**
 * Atomic evaluation credit deduction on evaluation start/acceptance.
 * 
 * EVALUATION CONSUMPTION PRIORITY:
 * FIRST  -> Consume 1 monthly FREE evaluation if any free evaluation remains.
 * SECOND -> Only after all monthly free evaluations are exhausted, consume 1 PAID CREDIT.
 * 
 * If free = 0 AND paid = 0, throws:
 * "Your free evaluations for this month are exhausted. Please purchase credits to continue."
 */
export function consumeEvaluationEntitlementAtomic(params: {
  userId: string;
  evaluationId?: string;
}): {
  source: 'PERSONAL_FREE' | 'PERSONAL_PURCHASED_CREDIT';
  freeRemaining: number;
  paidCredits: number;
  consumedLotId?: string;
} {
  const { userId, evaluationId } = params;
  const evalRefId = evaluationId || `eval_${crypto.randomBytes(6).toString('hex')}`;

  // IDEMPOTENCY GUARD:
  // If evaluationId is provided, verify whether deduction was already recorded for this exact evaluation.
  // Prevents duplicate credit consumption on network retries, browser refresh, or remount.
  if (evaluationId) {
    const existingDeduction = db.prepare(`
      SELECT source FROM credit_ledger
      WHERE student_id = ? AND evaluation_id = ? AND amount < 0
      ORDER BY datetime(created_at) DESC LIMIT 1
    `).get(userId, evaluationId) as { source: string } | undefined;

    if (existingDeduction) {
      const status = ensureMonthlyFreeEvaluationsReset(userId);
      const isFree = existingDeduction.source === 'FREE_MONTHLY_EVALUATION';
      return {
        source: isFree ? 'PERSONAL_FREE' : 'PERSONAL_PURCHASED_CREDIT',
        freeRemaining: status.freeEvaluationsRemaining,
        paidCredits: status.paidCredits,
      };
    }
  }

  // 1. Ensure monthly reset is current before consuming
  const status = ensureMonthlyFreeEvaluationsReset(userId);

  // 2. PRIORITY 1: Consume 1 monthly FREE evaluation if any free evaluation remains
  if (status.freeEvaluationsRemaining > 0) {
    let freeTxActive = false;
    try {
      db.exec('BEGIN IMMEDIATE;');
      freeTxActive = true;

      const updateRes = db.prepare(`
        UPDATE student_profiles
        SET monthly_free_evaluations_used = monthly_free_evaluations_used + 1,
            free_evaluations_used = free_evaluations_used + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
          AND monthly_free_evaluations_used < monthly_free_evaluations_limit
      `).run(userId);

      if (updateRes.changes > 0) {
        const newFreeRemaining = Math.max(0, status.freeEvaluationsRemaining - 1);
        const ledgerId = `cld_${crypto.randomBytes(8).toString('hex')}`;
        db.prepare(`
          INSERT INTO credit_ledger (id, student_id, amount, source, balance_after, evaluation_id, note)
          VALUES (?, ?, -1, 'FREE_MONTHLY_EVALUATION', ?, ?, ?)
        `).run(
          ledgerId,
          userId,
          newFreeRemaining,
          evalRefId,
          `Consumed 1 monthly free evaluation (${status.freeEvaluationResetMonth})`
        );

        if (evaluationId) {
          db.prepare(`
            UPDATE evaluations
            SET entitlement_source = 'PERSONAL_FREE',
                consumed_from_personal_credits = 0,
                consumed_from_institute_allocation = 0
            WHERE id = ?
          `).run(evaluationId);
        }

        db.exec('COMMIT;');
        freeTxActive = false;

        syncStudentCreditsToFirestore(userId).catch(() => {});

        return {
          source: 'PERSONAL_FREE',
          freeRemaining: newFreeRemaining,
          paidCredits: status.paidCredits,
        };
      } else {
        db.exec('COMMIT;');
        freeTxActive = false;
      }
    } catch (freeErr) {
      if (freeTxActive) {
        try { db.exec('ROLLBACK;'); } catch {}
      }
      throw freeErr;
    }
  }

  // 3. PRIORITY 2: Only after all monthly free evaluations are exhausted, consume 1 PAID CREDIT
  const validPaid = getValidStudentCreditBalance(userId);
  if (validPaid > 0) {
    const fefoResult = consumeCreditFEFO(userId, evalRefId);

    if (evaluationId) {
      db.prepare(`
        UPDATE evaluations
        SET entitlement_source = 'PERSONAL_PURCHASED_CREDIT',
            consumed_from_personal_credits = 1,
            consumed_from_institute_allocation = 0
        WHERE id = ?
      `).run(evaluationId);
    }

    return {
      source: 'PERSONAL_PURCHASED_CREDIT',
      freeRemaining: 0,
      paidCredits: fefoResult.totalRemaining,
      consumedLotId: fefoResult.lotId,
    };
  }

  // 4. INSUFFICIENT CREDITS (free = 0 AND paid = 0)
  throw new Error('Your free evaluations for this month are exhausted. Please purchase credits to continue.');
}

/**
 * Restores/refunds consumed credit if evaluation encounters a fatal failure during background processing.
 */
export function refundEvaluationCreditAtomic(params: {
  userId: string;
  evaluationId?: string;
  entitlementSource: string;
}): void {
  const { userId, evaluationId, entitlementSource } = params;
  const evalRefId = evaluationId || 'unknown_eval';
  const refundSource = entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'FREE_MONTHLY'
    ? 'REFUND_MONTHLY_FREE'
    : 'REFUND_PURCHASED_CREDIT';
  let transactionStarted = false;

  try {
    db.exec('BEGIN IMMEDIATE;');
    transactionStarted = true;

    // A background job can be replayed after a crash. With an evaluation ID,
    // the refund ledger is the idempotency record for that one consumed item.
    if (evaluationId) {
      const existingRefund = db.prepare(`
        SELECT id FROM credit_ledger
        WHERE student_id = ? AND evaluation_id = ? AND source = ?
        LIMIT 1
      `).get(userId, evalRefId, refundSource);
      if (existingRefund) {
        db.exec('COMMIT;');
        transactionStarted = false;
        return;
      }
    }

    if (entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'FREE_MONTHLY') {
      db.prepare(`
        UPDATE student_profiles
        SET monthly_free_evaluations_used = CASE WHEN monthly_free_evaluations_used > 0 THEN monthly_free_evaluations_used - 1 ELSE 0 END,
            free_evaluations_used = CASE WHEN free_evaluations_used > 0 THEN free_evaluations_used - 1 ELSE 0 END,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(userId);

      const status = ensureMonthlyFreeEvaluationsReset(userId);
      const ledgerId = `cld_${crypto.randomBytes(8).toString('hex')}`;
      db.prepare(`
        INSERT INTO credit_ledger (id, student_id, amount, source, balance_after, evaluation_id, note)
        VALUES (?, ?, 1, 'REFUND_MONTHLY_FREE', ?, ?, 'Restored 1 monthly free evaluation due to evaluation processing failure')
      `).run(ledgerId, userId, status.freeEvaluationsRemaining, evalRefId);
    } else if (entitlementSource === 'PERSONAL_PURCHASED_CREDIT' || entitlementSource === 'PAID_CREDIT') {
      const ledgerEntry = db.prepare(`
        SELECT note FROM credit_ledger
        WHERE student_id = ? AND evaluation_id = ? AND source = 'CONSUMED_EVALUATION'
        ORDER BY created_at DESC LIMIT 1
      `).get(userId, evalRefId) as { note: string } | undefined;

      let lotIdToRefund: string | null = null;
      if (ledgerEntry && ledgerEntry.note) {
        const match = ledgerEntry.note.match(/Lot (crd_[a-zA-Z0-9]+)/);
        if (match) lotIdToRefund = match[1];
      }

      if (lotIdToRefund) {
        db.prepare(`
          UPDATE student_credit_purchases
          SET credits_remaining = credits_remaining + 1,
              status = 'ACTIVE',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ?
        `).run(lotIdToRefund, userId);
      } else {
        db.prepare(`
          UPDATE student_credit_purchases
          SET credits_remaining = credits_remaining + 1,
              status = 'ACTIVE',
              updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND id = (
            SELECT id FROM student_credit_purchases WHERE user_id = ? ORDER BY datetime(updated_at) DESC LIMIT 1
          )
        `).run(userId, userId);
      }

      const totalRemaining = getValidStudentCreditBalance(userId);
      db.prepare(`
        UPDATE student_profiles
        SET purchased_credits = ?,
            paid_credits = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(totalRemaining, totalRemaining, userId);

      const ledgerId = `cld_${crypto.randomBytes(8).toString('hex')}`;
      db.prepare(`
        INSERT INTO credit_ledger (id, student_id, amount, source, balance_after, evaluation_id, note)
        VALUES (?, ?, 1, 'REFUND_PURCHASED_CREDIT', ?, ?, 'Refunded 1 purchased credit due to evaluation processing failure')
      `).run(ledgerId, userId, totalRemaining, evalRefId);
    }

    db.exec('COMMIT;');
    transactionStarted = false;
    syncStudentCreditsToFirestore(userId).catch(() => {});
  } catch (err) {
    if (transactionStarted) {
      try { db.exec('ROLLBACK;'); } catch (rollbackErr) {
        console.warn(`[StudentCreditService] Rollback error refunding credit for user ${userId}:`, rollbackErr);
      }
    }
    console.warn(`[StudentCreditService] Error refunding credit for user ${userId}:`, err);
  }
}

/**
 * Rule 12: Historical credit migration and backfill strategy.
 * If historical successful orders/payments or legacy purchased_credits exist without
 * corresponding student_credit_purchases lots, safely backfill them using their
 * original creation/transaction timestamps.
 */
export function migrateHistoricalCreditPurchases(): number {
  try {
    // 1. Ensure table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS student_credit_purchases (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        order_id TEXT,
        payment_id TEXT,
        credits_purchased INTEGER NOT NULL,
        credits_remaining INTEGER NOT NULL,
        valid_from TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        purchase_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_credit_purchases_user_status_expiry
      ON student_credit_purchases (user_id, status, expires_at);
    `);

    // 2. Backfill from successful payment_orders that are not yet in student_credit_purchases
    const unrecordedOrders = (db.prepare(`
      SELECT o.id, o.student_id, o.quantity, o.created_at, t.razorpay_payment_id
      FROM payment_orders o
      LEFT JOIN payment_transactions t ON t.order_id = o.id
      LEFT JOIN student_credit_purchases p ON p.order_id = o.id
      WHERE o.status = 'SUCCESS' AND p.id IS NULL
    `).all() as unknown) as Array<{
      id: string;
      student_id: string;
      quantity: number;
      created_at: string;
      razorpay_payment_id: string | null;
    }>;

    let migratedCount = 0;
    const now = new Date();

    for (const ord of unrecordedOrders) {
      const purchaseDate = new Date(ord.created_at || now.toISOString());
      const expiresAt = calculateThreeMonthsExpiry(purchaseDate);
      const isExpired = new Date(expiresAt).getTime() <= now.getTime();
      const lotId = `crd_${crypto.randomBytes(8).toString('hex')}`;

      db.prepare(`
        INSERT INTO student_credit_purchases (
          id, user_id, order_id, payment_id, credits_purchased, credits_remaining,
          valid_from, expires_at, purchase_date, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        lotId,
        ord.student_id,
        ord.id,
        ord.razorpay_payment_id || null,
        ord.quantity,
        isExpired ? 0 : ord.quantity,
        purchaseDate.toISOString(),
        expiresAt,
        purchaseDate.toISOString(),
        isExpired ? 'EXPIRED' : 'ACTIVE',
        purchaseDate.toISOString()
      );
      migratedCount++;
      syncStudentCreditsToFirestore(ord.student_id).catch(() => {});
    }

    // 3. For any student profile where NO lots exist in student_credit_purchases AND NO credit deductions were ever recorded:
    const profilesWithCredits = (db.prepare(`
      SELECT p.user_id, p.purchased_credits, p.paid_credits, p.created_at
      FROM student_profiles p
      LEFT JOIN (
        SELECT user_id, COUNT(*) as lot_count
        FROM student_credit_purchases
        GROUP BY user_id
      ) sc ON sc.user_id = p.user_id
      LEFT JOIN (
        SELECT student_id, COUNT(*) as deduction_count
        FROM credit_ledger
        WHERE amount < 0
        GROUP BY student_id
      ) cl ON cl.student_id = p.user_id
      WHERE (p.purchased_credits > 0 OR p.paid_credits > 0)
        AND (sc.lot_count IS NULL OR sc.lot_count = 0)
        AND (cl.deduction_count IS NULL OR cl.deduction_count = 0)
    `).all() as unknown) as Array<{
      user_id: string;
      purchased_credits: number;
      paid_credits: number;
      created_at: string;
    }>;

    for (const prof of profilesWithCredits) {
      const creds = Math.max(Number(prof.purchased_credits || 0), Number(prof.paid_credits || 0));
      const expiresAt = calculateThreeMonthsExpiry(now);
      const lotId = `crd_${crypto.randomBytes(8).toString('hex')}`;

      db.prepare(`
        INSERT INTO student_credit_purchases (
          id, user_id, order_id, payment_id, credits_purchased, credits_remaining,
          valid_from, expires_at, purchase_date, status, created_at, updated_at
        ) VALUES (?, ?, 'ord_granted', 'pay_granted', ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        lotId,
        prof.user_id,
        creds,
        creds,
        now.toISOString(),
        expiresAt,
        now.toISOString()
      );
      migratedCount++;
      syncStudentCreditsToFirestore(prof.user_id).catch(() => {});
    }

    // Run expiry sweep across all lots
    expireOverdueCreditLots();

    return migratedCount;
  } catch (err) {
    console.error('Migration error in migrateHistoricalCreditPurchases:', err);
    return 0;
  }
}

/**
 * Comprehensive reconciliation of all student credits across SQLite and Cloud Firestore.
 * - Migrates historical orders and unlinked profile credits to active lots.
 * - Expires any overdue lots.
 * - Recalculates exact valid balances and syncs them to student_profiles and Firestore.
 */
export async function reconcileAllStudentCredits(): Promise<{ reconciledStudents: number; totalActiveCredits: number }> {
  try {
    migrateHistoricalCreditPurchases();
    expireOverdueCreditLots();

    const students = db.prepare('SELECT user_id, purchased_credits, paid_credits FROM student_profiles').all() as Array<{
      user_id: string;
      purchased_credits: number;
      paid_credits: number;
    }>;

    let totalActiveCredits = 0;
    for (const student of students) {
      const validCredits = getValidStudentCreditBalance(student.user_id);
      totalActiveCredits += validCredits;
      await syncStudentCreditsToFirestore(student.user_id);
    }

    return {
      reconciledStudents: students.length,
      totalActiveCredits,
    };
  } catch (err) {
    console.warn('[StudentCreditService] Reconcile student credits warning:', err);
    return { reconciledStudents: 0, totalActiveCredits: 0 };
  }
}
