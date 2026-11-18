import crypto from 'node:crypto';
import { db } from '../db.js';

export const INSTITUTE_FREE_TRIAL_PLAN_ID = 'FREE_TRIAL_30_DAY';
export const INSTITUTE_FREE_TRIAL_DAYS = 30;
export const INSTITUTE_FREE_TRIAL_STUDENT_LIMIT = 50;
export const INSTITUTE_FREE_TRIAL_EVALUATION_CREDITS = 50;

export function normalizeInstituteTrialPhone(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

/**
 * A single 30-day starter allowance is attached to the institute account.
 * Unique normalized email and phone claims stop repeated free trials with a
 * second institute account using the same contact details. This is an abuse
 * control, not government/KYC identity verification.
 */
export function createInstituteFreeTrial(params: {
  instituteId: string;
  email: string;
  phone: string;
}): { success: boolean; expiresAt: string; maxStudents: number; evaluationCredits: number } {
  const instituteId = String(params.instituteId || '').trim();
  const email = normalizeEmail(params.email);
  const phone = normalizeInstituteTrialPhone(params.phone);

  if (!instituteId || !email || !email.includes('@') || phone.length < 10) {
    throw new Error('A valid institute ID, email address and phone number are required to activate the free trial.');
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + INSTITUTE_FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const subscriptionId = `sub_trial_${crypto.randomBytes(10).toString('hex')}`;
  const claimId = `itrial_${crypto.randomBytes(10).toString('hex')}`;

  db.exec('BEGIN IMMEDIATE;');
  try {
    const institute = db.prepare('SELECT id FROM institutes WHERE id = ?').get(instituteId);
    if (!institute) throw new Error('Institute not found while activating the free trial.');

    const existingClaim = db.prepare(`
      SELECT id FROM institute_trial_claims
      WHERE normalized_email = ? OR normalized_phone = ?
      LIMIT 1
    `).get(email, phone);
    if (existingClaim) {
      throw new Error('A 30-day institute free trial has already been claimed with this email address or phone number. Please sign in to the existing institute account or choose a paid plan.');
    }

    db.prepare(`
      INSERT INTO institute_trial_claims (
        id, institute_id, normalized_email, normalized_phone, claimed_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(claimId, instituteId, email, phone, now.toISOString(), expiresAt);

    db.prepare(`
      INSERT INTO institute_subscriptions (
        id, institute_id, plan_id, plan_name, billing_cycle, price_inr,
        student_capacity, evaluation_allowance, evaluations_used, evaluations_remaining,
        start_date, expiry_date, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'ONE_TIME', 0, ?, ?, 0, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      subscriptionId,
      instituteId,
      INSTITUTE_FREE_TRIAL_PLAN_ID,
      '30-Day Free Institute Trial',
      INSTITUTE_FREE_TRIAL_STUDENT_LIMIT,
      INSTITUTE_FREE_TRIAL_EVALUATION_CREDITS,
      INSTITUTE_FREE_TRIAL_EVALUATION_CREDITS,
      now.toISOString(),
      expiresAt,
    );

    db.prepare(`
      UPDATE institutes
      SET status = 'ACTIVE',
          subscription_plan = 'FREE_TRIAL',
          max_students = ?,
          subscription_expires_at = ?
      WHERE id = ?
    `).run(INSTITUTE_FREE_TRIAL_STUDENT_LIMIT, expiresAt, instituteId);

    db.exec('COMMIT;');
    return {
      success: true,
      expiresAt,
      maxStudents: INSTITUTE_FREE_TRIAL_STUDENT_LIMIT,
      evaluationCredits: INSTITUTE_FREE_TRIAL_EVALUATION_CREDITS,
    };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch {}
    throw error;
  }
}

export function getCurrentInstituteSubscription(instituteId: string, includeExpired = false): any | null {
  const normalizedId = String(instituteId || '').trim();
  if (!normalizedId) return null;
  const expiryFilter = includeExpired ? '' : "AND status = 'ACTIVE' AND datetime(expiry_date) > datetime('now')";
  return db.prepare(`
    SELECT *
    FROM institute_subscriptions
    WHERE institute_id = ?
      ${expiryFilter}
    ORDER BY datetime(start_date) DESC, datetime(created_at) DESC, rowid DESC
    LIMIT 1
  `).get(normalizedId) as any || null;
}

export interface InstituteTrialReservationResult {
  isTrial: boolean;
  reserved: boolean;
  subscriptionId?: string;
  evaluationsRemaining?: number;
  evaluationsUsed?: number;
}

/**
 * Reserve one trial evaluation at submission acceptance, not after the AI has
 * run. This makes the 50-credit cap safe under concurrent student submissions.
 * Paid plans keep their existing completion-time settlement path.
 */
export function reserveInstituteTrialEvaluationCredit(params: {
  instituteId: string;
  studentId: string;
  evaluationId: string;
}): InstituteTrialReservationResult {
  const instituteId = String(params.instituteId || '').trim();
  const studentId = String(params.studentId || '').trim();
  const evaluationId = String(params.evaluationId || '').trim();
  if (!instituteId || !studentId || !evaluationId) {
    throw new Error('Institute, student and evaluation IDs are required to reserve an institute trial credit.');
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    const subscription = getCurrentInstituteSubscription(instituteId);
    if (!subscription) {
      throw new Error('The institute subscription is inactive or expired. Please upgrade the institute plan to continue.');
    }
    if (String(subscription.plan_id || '').toUpperCase() !== INSTITUTE_FREE_TRIAL_PLAN_ID) {
      db.exec('COMMIT;');
      return { isTrial: false, reserved: false };
    }

    const activeDebit = db.prepare(`
      SELECT * FROM institute_usage_ledger
      WHERE institute_id = ? AND evaluation_id = ?
        AND action_type IN ('TRIAL_CREDIT_RESERVED', 'TRIAL_CREDIT_CONSUMED')
      ORDER BY rowid DESC
      LIMIT 1
    `).get(instituteId, evaluationId) as any;
    if (activeDebit) {
      db.exec('COMMIT;');
      return {
        isTrial: true,
        reserved: true,
        subscriptionId: String(activeDebit.subscription_id || subscription.id),
        evaluationsRemaining: Number(subscription.evaluations_remaining || 0),
        evaluationsUsed: Number(subscription.evaluations_used || 0),
      };
    }

    const refundCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM institute_usage_ledger
      WHERE institute_id = ? AND evaluation_id = ? AND action_type = 'TRIAL_CREDIT_REFUND'
    `).get(instituteId, evaluationId) as { count: number };
    const cycle = Number(refundCount?.count || 0) + 1;
    const idempotencyKey = `inst_trial_${evaluationId}_${cycle}`;

    const balanceBefore = Number(subscription.evaluations_remaining || 0);
    if (balanceBefore <= 0) {
      throw new Error('The institute free trial has used all 50 evaluation credits. Upgrade to a paid institute plan to continue.');
    }

    const update = db.prepare(`
      UPDATE institute_subscriptions
      SET evaluations_used = evaluations_used + 1,
          evaluations_remaining = evaluations_remaining - 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'ACTIVE'
        AND datetime(expiry_date) > datetime('now')
        AND evaluations_remaining > 0
    `).run(subscription.id);
    if (Number(update.changes || 0) !== 1) {
      throw new Error('The institute free trial has no evaluation credits remaining. Upgrade to a paid institute plan to continue.');
    }

    const balanceAfter = balanceBefore - 1;
    db.prepare(`
      INSERT INTO institute_usage_ledger (
        id, institute_id, student_id, evaluation_id, subscription_id,
        units_deducted, balance_before, balance_after, action_type, idempotency_key, notes
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'TRIAL_CREDIT_RESERVED', ?, ?)
    `).run(
      `usg_${crypto.randomBytes(10).toString('hex')}`,
      instituteId,
      studentId,
      evaluationId,
      subscription.id,
      balanceBefore,
      balanceAfter,
      idempotencyKey,
      'One-time 30-day institute trial evaluation credit reserved on submission acceptance.',
    );

    db.prepare(`
      UPDATE evaluations
      SET consumed_from_institute_allocation = 1,
          consumed_from_personal_credits = 0
      WHERE id = ?
    `).run(evaluationId);

    db.exec('COMMIT;');
    return {
      isTrial: true,
      reserved: true,
      subscriptionId: String(subscription.id),
      evaluationsRemaining: balanceAfter,
      evaluationsUsed: Number(subscription.evaluations_used || 0) + 1,
    };
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch {}
    throw error;
  }
}

export function completeInstituteTrialEvaluationCredit(params: {
  instituteId: string;
  evaluationId: string;
}): boolean {
  const instituteId = String(params.instituteId || '').trim();
  const evaluationId = String(params.evaluationId || '').trim();
  if (!instituteId || !evaluationId) return false;
  const result = db.prepare(`
    UPDATE institute_usage_ledger
    SET action_type = 'TRIAL_CREDIT_CONSUMED',
        notes = COALESCE(notes, '') || ' AI evaluation completed successfully.'
    WHERE id = (
      SELECT id FROM institute_usage_ledger
      WHERE institute_id = ? AND evaluation_id = ? AND action_type = 'TRIAL_CREDIT_RESERVED'
      ORDER BY rowid DESC LIMIT 1
    )
  `).run(instituteId, evaluationId);
  return Number(result.changes || 0) > 0;
}

/**
 * Refund only a trial reservation when the accepted job fails before producing
 * a usable evaluation. NEEDS_REVIEW is not refunded because the AI work ran.
 */
export function refundInstituteTrialEvaluationCredit(params: {
  instituteId: string;
  evaluationId: string;
  reason?: string;
}): boolean {
  const instituteId = String(params.instituteId || '').trim();
  const evaluationId = String(params.evaluationId || '').trim();
  if (!instituteId || !evaluationId) return false;

  db.exec('BEGIN IMMEDIATE;');
  try {
    const debit = db.prepare(`
      SELECT * FROM institute_usage_ledger
      WHERE institute_id = ? AND evaluation_id = ?
        AND action_type IN ('TRIAL_CREDIT_RESERVED', 'TRIAL_CREDIT_CONSUMED')
      ORDER BY rowid DESC
      LIMIT 1
    `).get(instituteId, evaluationId) as any;
    if (!debit) {
      db.exec('COMMIT;');
      return false;
    }

    const refundKey = `inst_trial_refund_${debit.id}`;
    const existingRefund = db.prepare('SELECT id FROM institute_usage_ledger WHERE idempotency_key = ?').get(refundKey);
    if (existingRefund) {
      db.exec('COMMIT;');
      return false;
    }

    const subscription = db.prepare('SELECT * FROM institute_subscriptions WHERE id = ?').get(debit.subscription_id) as any;
    if (!subscription) {
      throw new Error('The original institute trial subscription could not be found for credit restoration.');
    }

    const balanceBefore = Number(subscription.evaluations_remaining || 0);
    const balanceAfter = Math.min(
      Number(subscription.evaluation_allowance || INSTITUTE_FREE_TRIAL_EVALUATION_CREDITS),
      balanceBefore + Number(debit.units_deducted || 1),
    );
    db.prepare(`
      UPDATE institute_subscriptions
      SET evaluations_used = MAX(0, evaluations_used - ?),
          evaluations_remaining = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(Number(debit.units_deducted || 1), balanceAfter, subscription.id);

    db.prepare("UPDATE institute_usage_ledger SET action_type = 'TRIAL_CREDIT_REFUNDED' WHERE id = ?").run(debit.id);
    db.prepare(`
      INSERT INTO institute_usage_ledger (
        id, institute_id, student_id, evaluation_id, subscription_id,
        units_deducted, balance_before, balance_after, action_type, idempotency_key, notes
      ) VALUES (?, ?, ?, ?, ?, -1, ?, ?, 'TRIAL_CREDIT_REFUND', ?, ?)
    `).run(
      `usg_${crypto.randomBytes(10).toString('hex')}`,
      instituteId,
      String(debit.student_id),
      evaluationId,
      subscription.id,
      balanceBefore,
      balanceAfter,
      refundKey,
      String(params.reason || 'AI evaluation failed before a usable result was produced.'),
    );

    db.prepare(`
      UPDATE evaluations
      SET consumed_from_institute_allocation = 0
      WHERE id = ?
    `).run(evaluationId);

    db.exec('COMMIT;');
    return true;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch {}
    throw error;
  }
}
