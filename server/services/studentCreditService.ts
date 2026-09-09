import crypto from 'node:crypto';
import { db } from '../db.js';

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

  const validCredits = row ? Number(row.valid_credits) : 0;

  // Keep student_profiles in sync with the real-time valid credit balance
  try {
    db.prepare(`
      UPDATE student_profiles
      SET purchased_credits = ?
      WHERE user_id = ?
    `).run(validCredits, userId);
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

  const totalRemaining = getValidStudentCreditBalance(userId);

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

  return {
    success: true,
    lotId: earliestLot.id,
    lotRemaining: newLotRemaining,
    lotExpiresAt: earliestLot.expires_at,
    totalRemaining,
  };
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
          valid_from, expires_at, purchase_date, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    }

    // 3. For any student profile with purchased_credits > 0 and 0 active lots in student_credit_purchases:
    const profilesWithCredits = (db.prepare(`
      SELECT p.user_id, p.purchased_credits, p.created_at
      FROM student_profiles p
      LEFT JOIN (
        SELECT user_id, COUNT(*) as lot_count
        FROM student_credit_purchases
        GROUP BY user_id
      ) sc ON sc.user_id = p.user_id
      WHERE p.purchased_credits > 0 AND (sc.lot_count IS NULL OR sc.lot_count = 0)
    `).all() as unknown) as Array<{
      user_id: string;
      purchased_credits: number;
      created_at: string;
    }>;

    for (const prof of profilesWithCredits) {
      const purchaseDate = new Date(prof.created_at || now.toISOString());
      const expiresAt = calculateThreeMonthsExpiry(purchaseDate);
      const isExpired = new Date(expiresAt).getTime() <= now.getTime();
      const lotId = `crd_${crypto.randomBytes(8).toString('hex')}`;

      db.prepare(`
        INSERT INTO student_credit_purchases (
          id, user_id, order_id, payment_id, credits_purchased, credits_remaining,
          valid_from, expires_at, purchase_date, status, created_at
        ) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        lotId,
        prof.user_id,
        prof.purchased_credits,
        isExpired ? 0 : prof.purchased_credits,
        purchaseDate.toISOString(),
        expiresAt,
        purchaseDate.toISOString(),
        isExpired ? 'EXPIRED' : 'ACTIVE',
        purchaseDate.toISOString()
      );
      migratedCount++;
    }

    // Run expiry sweep across all lots
    expireOverdueCreditLots();

    return migratedCount;
  } catch (err) {
    console.error('Migration error in migrateHistoricalCreditPurchases:', err);
    return 0;
  }
}
