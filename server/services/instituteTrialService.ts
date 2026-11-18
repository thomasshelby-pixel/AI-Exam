import crypto from 'node:crypto';
import { db } from '../db.js';
import { syncRecordToFirestore } from './firestoreSyncService.js';

export const INSTITUTE_FREE_TRIAL_PLAN_ID = 'FREE_STARTER_TRIAL_V1';
export const INSTITUTE_FREE_TRIAL_PLAN_NAME = 'Free Starter Trial';
export const INSTITUTE_FREE_TRIAL_DAYS = 30;
export const INSTITUTE_FREE_TRIAL_STUDENT_CAPACITY = 50;
export const INSTITUTE_FREE_TRIAL_EVALUATION_CREDITS = 50;

function mirrorInstituteRecord(collection: string, id: string, row: Record<string, any> | undefined): void {
  if (!row || !id) return;
  const timestamp = new Date().toISOString();
  void syncRecordToFirestore(collection, id, { ...row, updated_at: timestamp, _updatedAt: timestamp });
}

function mirrorInstituteSubscription(subscriptionId: string | null | undefined): void {
  if (!subscriptionId || subscriptionId === 'LEGACY_UNMETERED') return;
  const row = db.prepare('SELECT * FROM institute_subscriptions WHERE id = ?').get(subscriptionId) as Record<string, any> | undefined;
  mirrorInstituteRecord('institute_subscriptions', subscriptionId, row);
}

function mirrorInstituteUsageLedger(idempotencyKey: string): void {
  const row = db.prepare('SELECT * FROM institute_usage_ledger WHERE idempotency_key = ? LIMIT 1').get(idempotencyKey) as any;
  if (row?.id) mirrorInstituteRecord('institute_usage_ledger', String(row.id), row);
}
export interface InstituteSubscriptionEntitlement {
  id: string;
  institute_id: string;
  plan_id: string;
  plan_name?: string | null;
  student_capacity: number;
  evaluation_allowance: number;
  evaluations_used: number;
  evaluations_remaining: number;
  start_date: string;
  expiry_date: string;
  status: string;
  billing_cycle: string;
  price_inr: number;
}

export function getActiveInstituteSubscription(instituteId: string): InstituteSubscriptionEntitlement | null {
  return (db.prepare(`
    SELECT s.*
    FROM institute_subscriptions s
    INNER JOIN institutes i ON i.id = s.institute_id AND i.status = 'ACTIVE'
    WHERE s.institute_id = ?
      AND s.status = 'ACTIVE'
      AND datetime(s.expiry_date) > datetime('now')
    ORDER BY datetime(s.expiry_date) DESC, datetime(s.created_at) DESC
    LIMIT 1
  `).get(instituteId) as unknown as InstituteSubscriptionEntitlement | undefined) || null;
}

/**
 * Backward compatibility for paid institute accounts created before the
 * institute_subscriptions ledger was introduced. Starter trials are never
 * treated as legacy-unmetered: they must always have their 50-credit row.
 */
export function hasActiveLegacyInstitutePlan(instituteId: string): boolean {
  const institute = db.prepare(`
    SELECT status, subscription_plan, subscription_expires_at
    FROM institutes WHERE id = ? LIMIT 1
  `).get(instituteId) as any;
  if (!institute || String(institute.status || '').trim().toUpperCase() !== 'ACTIVE') return false;
  const plan = String(institute.subscription_plan || '').trim().toUpperCase();
  if (
    !plan ||
    plan === INSTITUTE_FREE_TRIAL_PLAN_ID ||
    ['', 'NONE', 'NO_PLAN', 'INACTIVE', 'EXPIRED', 'PENDING_SELECTION', 'UNPAID', 'FREE', 'TRIAL_EXPIRED', 'CANCELLED', 'CANCELED', 'SUSPENDED'].includes(plan)
  ) return false;
  if (institute.subscription_expires_at) {
    const expiry = Date.parse(String(institute.subscription_expires_at));
    if (Number.isFinite(expiry) && expiry <= Date.now()) return false;
  }
  return true;
}

/** Grants one verified Institute Admin a single 30-day starter trial. */
export function ensureInstituteStarterTrial(params: {
  instituteId: string;
  adminUserId: string;
  adminEmail: string;
}): { granted: boolean; subscriptionId?: string; expiresAt?: string; reason?: string } {
  const instituteId = String(params.instituteId || '').trim();
  const adminUserId = String(params.adminUserId || '').trim();
  const adminEmail = String(params.adminEmail || '').trim().toLowerCase();
  if (!instituteId || !adminUserId || !adminEmail || !adminEmail.includes('@')) {
    return { granted: false, reason: 'MISSING_ADMIN_IDENTITY' };
  }

  const noPaidPlanValues = ['', 'NONE', 'NO_PLAN', 'PENDING_SELECTION', 'FREE', 'TRIAL_EXPIRED'];
  const admin = db.prepare(`
    SELECT id, email, role, status FROM users WHERE id = ? LIMIT 1
  `).get(adminUserId) as any;
  if (
    !admin ||
    String(admin.email || '').trim().toLowerCase() !== adminEmail ||
    !['INSTITUTE_ADMIN', 'INSTITUTE'].includes(String(admin.role || '').trim().toUpperCase()) ||
    String(admin.status || '').trim().toUpperCase() !== 'ACTIVE'
  ) return { granted: false, reason: 'ACTIVE_INSTITUTE_ADMIN_REQUIRED' };

  const institute = db.prepare('SELECT id, email, status, subscription_plan FROM institutes WHERE id = ?').get(instituteId) as any;
  if (!institute || String(institute.status || '').trim().toUpperCase() !== 'ACTIVE' || String(institute.email || '').trim().toLowerCase() !== adminEmail) {
    return { granted: false, reason: 'ACTIVE_INSTITUTE_REQUIRED' };
  }
  if (!noPaidPlanValues.includes(String(institute.subscription_plan || '').trim().toUpperCase())) {
    return { granted: false, reason: 'INSTITUTE_ALREADY_HAS_OR_HAD_A_PLAN' };
  }
  if (db.prepare('SELECT id FROM institute_subscriptions WHERE institute_id = ? LIMIT 1').get(instituteId)) {
    return { granted: false, reason: 'INSTITUTE_SUBSCRIPTION_HISTORY_EXISTS' };
  }
  if (db.prepare(`
    SELECT id FROM institute_trial_claims
    WHERE admin_user_id = ? OR lower(admin_email) = ? OR institute_id = ?
    LIMIT 1
  `).get(adminUserId, adminEmail, instituteId)) {
    return { granted: false, reason: 'STARTER_TRIAL_ALREADY_CLAIMED' };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + INSTITUTE_FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const subscriptionId = `sub_trial_${crypto.randomBytes(8).toString('hex')}`;
  const claimId = `itr_${crypto.randomBytes(8).toString('hex')}`;
  let transactionStarted = false;
  try {
    db.exec('BEGIN IMMEDIATE;');
    transactionStarted = true;

    const lockedInstitute = db.prepare('SELECT id, email, status, subscription_plan FROM institutes WHERE id = ?').get(instituteId) as any;
    const lockedAdmin = db.prepare('SELECT id, email, role, status FROM users WHERE id = ?').get(adminUserId) as any;
    const claimExists = db.prepare(`
      SELECT id FROM institute_trial_claims
      WHERE admin_user_id = ? OR lower(admin_email) = ? OR institute_id = ? LIMIT 1
    `).get(adminUserId, adminEmail, instituteId);
    const subscriptionExists = db.prepare('SELECT id FROM institute_subscriptions WHERE institute_id = ? LIMIT 1').get(instituteId);

    if (
      !lockedInstitute ||
      String(lockedInstitute.status || '').toUpperCase() !== 'ACTIVE' ||
      !lockedAdmin ||
      String(lockedAdmin.status || '').toUpperCase() !== 'ACTIVE' ||
      String(lockedAdmin.email || '').trim().toLowerCase() !== adminEmail ||
      String(lockedInstitute.email || '').trim().toLowerCase() !== adminEmail ||
      !['INSTITUTE_ADMIN', 'INSTITUTE'].includes(String(lockedAdmin.role || '').trim().toUpperCase()) ||
      claimExists ||
      subscriptionExists ||
      !noPaidPlanValues.includes(String(lockedInstitute.subscription_plan || '').trim().toUpperCase())
    ) {
      db.exec('ROLLBACK;');
      transactionStarted = false;
      return { granted: false, reason: 'TRIAL_CLAIM_NOT_ELIGIBLE' };
    }

    db.prepare(`
      INSERT INTO institute_subscriptions (
        id, institute_id, plan_id, plan_name, billing_cycle, price_inr,
        student_capacity, evaluation_allowance, evaluations_used, evaluations_remaining,
        payment_order_ref, payment_id, start_date, expiry_date, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'TRIAL', 0, ?, ?, 0, ?, NULL, NULL, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      subscriptionId, instituteId, INSTITUTE_FREE_TRIAL_PLAN_ID, INSTITUTE_FREE_TRIAL_PLAN_NAME,
      INSTITUTE_FREE_TRIAL_STUDENT_CAPACITY, INSTITUTE_FREE_TRIAL_EVALUATION_CREDITS,
      INSTITUTE_FREE_TRIAL_EVALUATION_CREDITS, now.toISOString(), expiresAt,
    );

    db.prepare(`
      INSERT INTO institute_trial_claims (
        id, institute_id, admin_user_id, admin_email, subscription_id, claimed_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(claimId, instituteId, adminUserId, adminEmail, subscriptionId, now.toISOString(), expiresAt);

    db.prepare(`
      UPDATE institutes
      SET status = 'ACTIVE', subscription_plan = ?, max_students = ?, subscription_expires_at = ?
      WHERE id = ?
    `).run(INSTITUTE_FREE_TRIAL_PLAN_ID, INSTITUTE_FREE_TRIAL_STUDENT_CAPACITY, expiresAt, instituteId);

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'INSTITUTE_FREE_TRIAL_ACTIVATED', 'INSTITUTE', ?, ?)
    `).run(
      `aud_${crypto.randomBytes(8).toString('hex')}`,
      adminUserId,
      instituteId,
      JSON.stringify({
        planId: INSTITUTE_FREE_TRIAL_PLAN_ID,
        trialDays: INSTITUTE_FREE_TRIAL_DAYS,
        studentCapacity: INSTITUTE_FREE_TRIAL_STUDENT_CAPACITY,
        evaluationCredits: INSTITUTE_FREE_TRIAL_EVALUATION_CREDITS,
        expiresAt,
        oneTime: true,
      }),
    );

    db.exec('COMMIT;');
    transactionStarted = false;
    mirrorInstituteSubscription(subscriptionId);
    const claimRow = db.prepare('SELECT * FROM institute_trial_claims WHERE id = ?').get(claimId) as any;
    mirrorInstituteRecord('institute_trial_claims', claimId, claimRow);
    const instituteRow = db.prepare('SELECT * FROM institutes WHERE id = ?').get(instituteId) as any;
    mirrorInstituteRecord('institutes', instituteId, instituteRow);
    const auditRow = db.prepare(
      "SELECT * FROM audit_logs WHERE entity_id = ? AND action = 'INSTITUTE_FREE_TRIAL_ACTIVATED' ORDER BY created_at DESC LIMIT 1"
    ).get(instituteId) as any;
    if (auditRow?.id) mirrorInstituteRecord('audit_logs', String(auditRow.id), auditRow);
    return { granted: true, subscriptionId, expiresAt };
  } catch (error) {
    if (transactionStarted) {
      try { db.exec('ROLLBACK;'); } catch {}
    }
    if (String((error as any)?.code || '').includes('CONSTRAINT')) {
      return { granted: false, reason: 'STARTER_TRIAL_ALREADY_CLAIMED' };
    }
    throw error;
  }
}

export interface InstituteEvaluationReservationResult {
  instituteId: string;
  subscriptionId: string;
  balanceBefore: number;
  balanceAfter: number;
  alreadyReserved: boolean;
  alreadyConsumed: boolean;
}

/** Reserves one shared institute evaluation credit at acceptance, idempotently. */
export function reserveInstituteEvaluationCredit(params: {
  instituteId: string;
  studentId: string;
  evaluationId: string;
}): InstituteEvaluationReservationResult {
  const instituteId = String(params.instituteId || '').trim();
  const studentId = String(params.studentId || '').trim();
  const evaluationId = String(params.evaluationId || '').trim();
  if (!instituteId || !studentId || !evaluationId) {
    throw new Error('Institute, student, and evaluation IDs are required to reserve an institute credit.');
  }
  const idempotencyKey = `inst_eval_${evaluationId}`;
  let transactionStarted = false;
  try {
    db.exec('BEGIN IMMEDIATE;');
    transactionStarted = true;
    const existing = db.prepare('SELECT * FROM institute_usage_ledger WHERE idempotency_key = ? LIMIT 1').get(idempotencyKey) as any;

    if (existing && String(existing.action_type || '').toUpperCase() === 'CONSUMED') {
      db.exec('COMMIT;');
      transactionStarted = false;
      return {
        instituteId, subscriptionId: String(existing.subscription_id || ''),
        balanceBefore: Number(existing.balance_before || 0), balanceAfter: Number(existing.balance_after || 0),
        alreadyReserved: false, alreadyConsumed: true,
      };
    }
    if (existing && String(existing.action_type || '').toUpperCase() === 'RESERVED') {
      db.exec('COMMIT;');
      transactionStarted = false;
      return {
        instituteId, subscriptionId: String(existing.subscription_id || ''),
        balanceBefore: Number(existing.balance_before || 0), balanceAfter: Number(existing.balance_after || 0),
        alreadyReserved: true, alreadyConsumed: false,
      };
    }

    const subscription = getActiveInstituteSubscription(instituteId);
    if (!subscription && hasActiveLegacyInstitutePlan(instituteId)) {
      // Preserve the pre-ledger paid institute behaviour without weakening the
      // new starter trial: legacy plans have no shared quota record to decrement.
      // A no-op reservation ledger keeps the async worker's lifecycle coherent.
      const notes = JSON.stringify({
        status: 'RESERVED',
        legacyUnmeteredPlan: true,
        studentId,
        evaluationId,
        reservedAt: new Date().toISOString(),
      });
      if (existing) {
        db.prepare(`
          UPDATE institute_usage_ledger
          SET institute_id = ?, student_id = ?, evaluation_id = ?, units_deducted = 1,
              balance_before = 0, balance_after = 0, action_type = 'RESERVED',
              subscription_id = NULL, notes = ?, created_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(instituteId, studentId, evaluationId, notes, existing.id);
      } else {
        const ledgerId = `usg_${crypto.randomBytes(8).toString('hex')}`;
        db.prepare(`
          INSERT INTO institute_usage_ledger (
            id, institute_id, student_id, evaluation_id, units_deducted,
            balance_before, balance_after, action_type, idempotency_key,
            subscription_id, notes, created_at
          ) VALUES (?, ?, ?, ?, 1, 0, 0, 'RESERVED', ?, NULL, ?, CURRENT_TIMESTAMP)
        `).run(ledgerId, instituteId, studentId, evaluationId, idempotencyKey, notes);
      }
      db.prepare(`
        UPDATE evaluations
        SET institute_id = COALESCE(institute_id, ?),
            sponsoring_institute_id = ?,
            entitlement_source = 'INSTITUTE_ALLOCATION',
            consumed_from_institute_allocation = 1,
            consumed_from_personal_credits = 0
        WHERE id = ?
      `).run(instituteId, instituteId, evaluationId);
      db.exec('COMMIT;');
      transactionStarted = false;
      mirrorInstituteUsageLedger(idempotencyKey);
      const legacyEvaluation = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId) as any;
      mirrorInstituteRecord('evaluations', evaluationId, legacyEvaluation);
      return {
        instituteId,
        subscriptionId: 'LEGACY_UNMETERED',
        balanceBefore: 0,
        balanceAfter: 0,
        alreadyReserved: false,
        alreadyConsumed: false,
      };
    }
    if (!subscription || Number(subscription.evaluations_remaining) <= 0) {
      throw new Error('INSTITUTE_EVALUATION_QUOTA_EXHAUSTED');
    }

    const balanceBefore = Number(subscription.evaluations_remaining);
    const balanceAfter = balanceBefore - 1;
    const update = db.prepare(`
      UPDATE institute_subscriptions
      SET evaluations_used = evaluations_used + 1,
          evaluations_remaining = evaluations_remaining - 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'ACTIVE'
        AND datetime(expiry_date) > datetime('now')
        AND evaluations_remaining > 0
    `).run(subscription.id);
    if (Number(update.changes || 0) !== 1) throw new Error('INSTITUTE_EVALUATION_QUOTA_EXHAUSTED');

    const notes = JSON.stringify({ status: 'RESERVED', studentId, evaluationId, subscriptionId: subscription.id, reservedAt: new Date().toISOString() });
    if (existing) {
      db.prepare(`
        UPDATE institute_usage_ledger
        SET institute_id = ?, student_id = ?, evaluation_id = ?, units_deducted = 1,
            balance_before = ?, balance_after = ?, action_type = 'RESERVED',
            subscription_id = ?, notes = ?, created_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(instituteId, studentId, evaluationId, balanceBefore, balanceAfter, subscription.id, notes, existing.id);
    } else {
      db.prepare(`
        INSERT INTO institute_usage_ledger (
          id, institute_id, student_id, evaluation_id, units_deducted,
          balance_before, balance_after, action_type, idempotency_key,
          subscription_id, notes, created_at
        ) VALUES (?, ?, ?, ?, 1, ?, ?, 'RESERVED', ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        `usg_${crypto.randomBytes(8).toString('hex')}`,
        instituteId, studentId, evaluationId, balanceBefore, balanceAfter,
        idempotencyKey, subscription.id, notes,
      );
    }

    db.prepare(`
      UPDATE evaluations
      SET institute_id = COALESCE(institute_id, ?),
          sponsoring_institute_id = ?,
          entitlement_source = 'INSTITUTE_ALLOCATION',
          consumed_from_institute_allocation = 1,
          consumed_from_personal_credits = 0
      WHERE id = ?
    `).run(instituteId, instituteId, evaluationId);

    db.exec('COMMIT;');
    transactionStarted = false;
    mirrorInstituteSubscription(subscription.id);
    mirrorInstituteUsageLedger(idempotencyKey);
    const reservedEvaluation = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId) as any;
    mirrorInstituteRecord('evaluations', evaluationId, reservedEvaluation);
    return { instituteId, subscriptionId: subscription.id, balanceBefore, balanceAfter, alreadyReserved: false, alreadyConsumed: false };
  } catch (error) {
    if (transactionStarted) {
      try { db.exec('ROLLBACK;'); } catch {}
    }
    throw error;
  }
}

/** Finalises a reservation only after a certified evaluation completes. */
export function finalizeInstituteEvaluationCredit(params: {
  instituteId: string;
  studentId: string;
  evaluationId: string;
}): void {
  const key = `inst_eval_${String(params.evaluationId || '').trim()}`;
  let current = db.prepare('SELECT * FROM institute_usage_ledger WHERE idempotency_key = ? LIMIT 1').get(key) as any;
  // Compatibility for jobs accepted immediately before this reservation-based
  // deployment. Older workers deducted once at completion, so create the missing
  // idempotent reservation here rather than failing an already-running evaluation.
  if (!current) {
    reserveInstituteEvaluationCredit({ instituteId: params.instituteId, studentId: params.studentId, evaluationId: params.evaluationId });
    current = db.prepare('SELECT * FROM institute_usage_ledger WHERE idempotency_key = ? LIMIT 1').get(key) as any;
  }
  if (!current) throw new Error('INSTITUTE_EVALUATION_RESERVATION_MISSING');
  if (String(current.action_type || '').toUpperCase() === 'CONSUMED') return;
  if (String(current.action_type || '').toUpperCase() !== 'RESERVED') {
    throw new Error('INSTITUTE_EVALUATION_RESERVATION_NOT_ACTIVE');
  }
  db.prepare(`
    UPDATE institute_usage_ledger
    SET action_type = 'CONSUMED', notes = ?, created_at = CURRENT_TIMESTAMP
    WHERE id = ? AND action_type = 'RESERVED'
  `).run(JSON.stringify({
    status: 'CONSUMED', studentId: params.studentId, evaluationId: params.evaluationId,
    subscriptionId: current.subscription_id || null, consumedAt: new Date().toISOString(),
  }), current.id);
  mirrorInstituteUsageLedger(key);
}

/** Releases an unconsumed reservation after a failed or review-required run. */
export function releaseInstituteEvaluationCredit(params: { evaluationId: string; reason: string }): boolean {
  const evaluationId = String(params.evaluationId || '').trim();
  if (!evaluationId) return false;
  const key = `inst_eval_${evaluationId}`;
  let transactionStarted = false;
  try {
    db.exec('BEGIN IMMEDIATE;');
    transactionStarted = true;
    const reservation = db.prepare('SELECT * FROM institute_usage_ledger WHERE idempotency_key = ? LIMIT 1').get(key) as any;
    if (!reservation || String(reservation.action_type || '').toUpperCase() !== 'RESERVED') {
      db.exec('COMMIT;');
      transactionStarted = false;
      return false;
    }
    if (reservation.subscription_id) {
      db.prepare(`
        UPDATE institute_subscriptions
        SET evaluations_used = MAX(0, evaluations_used - 1),
            evaluations_remaining = MIN(evaluation_allowance, evaluations_remaining + 1),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(reservation.subscription_id);
    }
    db.prepare(`
      UPDATE institute_usage_ledger
      SET action_type = 'RELEASED', notes = ?, created_at = CURRENT_TIMESTAMP
      WHERE id = ? AND action_type = 'RESERVED'
    `).run(JSON.stringify({
      status: 'RELEASED', evaluationId, reason: String(params.reason || 'Unsuccessful evaluation'),
      releasedAt: new Date().toISOString(), subscriptionId: reservation.subscription_id || null,
    }), reservation.id);
    db.prepare('UPDATE evaluations SET consumed_from_institute_allocation = 0 WHERE id = ?').run(evaluationId);
    db.exec('COMMIT;');
    transactionStarted = false;
    mirrorInstituteSubscription(reservation.subscription_id || null);
    mirrorInstituteUsageLedger(key);
    const releasedEvaluation = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId) as any;
    mirrorInstituteRecord('evaluations', evaluationId, releasedEvaluation);
    return true;
  } catch (error) {
    if (transactionStarted) {
      try { db.exec('ROLLBACK;'); } catch {}
    }
    console.error('[InstituteEntitlement] Failed to release evaluation reservation:', evaluationId, error);
    return false;
  }
}
