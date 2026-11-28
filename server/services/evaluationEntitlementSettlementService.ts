import { db } from '../db.js';
import {
  consumeEvaluationEntitlementAtomic,
  syncStudentCreditsToFirestore,
  getCurrentServerMonth,
} from './studentCreditService.js';

export type PersonalEvaluationEntitlementSource =
  | 'PROMO'
  | 'PERSONAL_FREE'
  | 'PERSONAL_PURCHASED_CREDIT';

export interface SuccessfulEvaluationSettlementResult {
  charged: boolean;
  source: PersonalEvaluationEntitlementSource;
  reason: 'DEBIT_ALREADY_EXISTS' | 'DEBIT_RESTORED_AFTER_REFUND' | 'DEBIT_CREATED' | 'NON_REFUND_POSITIVE_LEDGER_EVENT';
}

/**
 * Synchronous core of entitlement settlement for successful evaluations.
 * Makes the evaluation-specific credit ledger authoritative at successful completion.
 */
export function settlePersonalEntitlementForSuccessfulEvaluationSync(params: {
  userId: string;
  evaluationId: string;
  entitlementSource?: string;
}): SuccessfulEvaluationSettlementResult | null {
  const userId = String(params.userId || '').trim();
  const evaluationId = String(params.evaluationId || '').trim();
  const requestedSource = String(params.entitlementSource || '').trim().toUpperCase();

  if (!userId || !evaluationId) {
    throw new Error('Cannot settle an evaluation entitlement without a student ID and evaluation ID.');
  }

  // Normalize generic or legacy sources to personal entitlements
  let normalizedRequestedSource = requestedSource;
  if (!normalizedRequestedSource || ['PUBLIC', 'FREE', 'FREE_MONTHLY', 'STANDARD'].includes(normalizedRequestedSource)) {
    normalizedRequestedSource = '';
  } else if (!['PROMO', 'PERSONAL_FREE', 'PERSONAL_PURCHASED_CREDIT'].includes(normalizedRequestedSource)) {
    return null;
  }

  const latestLedgerEntry = db.prepare(`
    SELECT source, amount
    FROM credit_ledger
    WHERE student_id = ? AND evaluation_id = ?
    ORDER BY rowid DESC
    LIMIT 1
  `).get(userId, evaluationId) as { source?: string; amount?: number } | undefined;

  if (latestLedgerEntry && Number(latestLedgerEntry.amount) < 0) {
    const ledgerSource = String(latestLedgerEntry.source || '').toUpperCase();
    const source: PersonalEvaluationEntitlementSource =
      ledgerSource.includes('PROMO')
        ? 'PROMO'
        : ledgerSource === 'FREE_MONTHLY_EVALUATION'
          ? 'PERSONAL_FREE'
          : 'PERSONAL_PURCHASED_CREDIT';

    return {
      charged: false,
      source,
      reason: 'DEBIT_ALREADY_EXISTS',
    };
  }

  const latestSource = String(latestLedgerEntry?.source || '').toUpperCase();
  const latestIsRefund =
    Number(latestLedgerEntry?.amount) > 0 &&
    ['REFUND_PROMO', 'REFUND_MONTHLY_FREE', 'REFUND_PURCHASED_CREDIT'].includes(latestSource);

  // The local database commits balance changes and their evaluation ledger row
  // in the same transaction. If no event exists for this evaluation, there is
  // no local debit to preserve: consume one current entitlement. The evaluation
  // ID idempotency guard in consumeEvaluationEntitlementAtomic prevents repeats.
  if (latestLedgerEntry && Number(latestLedgerEntry.amount) > 0 && !latestIsRefund) {
    return {
      charged: false,
      source: (normalizedRequestedSource || 'PERSONAL_FREE') as PersonalEvaluationEntitlementSource,
      reason: 'NON_REFUND_POSITIVE_LEDGER_EVENT',
    };
  }

  // No debit exists on an uncharged job, or the latest event is a real refund.
  // The underlying service is atomic and evaluation-ID idempotent.
  const consumed = consumeEvaluationEntitlementAtomic({
    userId,
    evaluationId,
    forcedSource: normalizedRequestedSource ? (normalizedRequestedSource as any) : undefined,
    allowCompletedSettlementFallback: true,
  });

  return {
    charged: true,
    source: consumed.source,
    reason: latestLedgerEntry && Number(latestLedgerEntry.amount) > 0
      ? 'DEBIT_RESTORED_AFTER_REFUND'
      : 'DEBIT_CREATED',
  };
}

/**
 * Makes the evaluation-specific credit ledger authoritative at successful
 * completion. This matters for admin reprocessing: a prior NEEDS_REVIEW result
 * may have refunded the original debit, so a successful reprocess must settle
 * that refunded entitlement again. A still-active negative ledger entry makes
 * this idempotent and prevents a second charge.
 *
 * Faculty Mock, institute-sponsored and permanent-free entitlements are
 * intentionally excluded by the caller and are not accepted here.
 */
export async function settlePersonalEntitlementForSuccessfulEvaluation(params: {
  userId: string;
  evaluationId: string;
  entitlementSource: string;
}): Promise<SuccessfulEvaluationSettlementResult | null> {
  const result = settlePersonalEntitlementForSuccessfulEvaluationSync(params);
  if (result) {
    try {
      await syncStudentCreditsToFirestore(params.userId);
    } catch (syncError) {
      console.warn('[EvaluationEntitlementSettlement] Credit mirror sync failed after local settlement:', syncError);
    }
  }
  return result;
}

/**
 * Automatically reconciles and debits any completed personal evaluations
 * that do not have an active negative debit in credit_ledger.
 * Prevents completed evaluations from leaving credits uncharged.
 */
export function reconcileStudentCompletedEvaluationCredits(userId: string): number {
  if (!userId) return 0;
  try {
    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
    if (user?.email) {
      const isPermanentFree = db.prepare(
        'SELECT 1 FROM permanent_free_entitlements WHERE LOWER(email) = LOWER(?) AND is_active = 1 LIMIT 1'
      ).get(user.email);
      if (isPermanentFree) return 0;
    }

    const currentMonth = getCurrentServerMonth();
    const monthStart = `${currentMonth}-01 00:00:00`;

    const completedPersonalEvals = db.prepare(`
      SELECT e.id, e.student_id, e.entitlement_source, e.consumed_from_personal_credits
      FROM evaluations e
      WHERE e.student_id = ?
        AND UPPER(TRIM(COALESCE(e.status, ''))) = 'COMPLETED'
        AND UPPER(TRIM(COALESCE(e.evaluation_source, 'PUBLIC'))) = 'PUBLIC'
        AND UPPER(TRIM(COALESCE(e.material_type, ''))) <> 'FACULTY_MOCK_TEST'
        AND COALESCE(e.faculty_mock_test_id, '') = ''
        AND COALESCE(e.institute_id, '') = ''
        AND COALESCE(e.sponsoring_institute_id, '') = ''
        AND UPPER(TRIM(COALESCE(e.material_source, ''))) <> 'INSTITUTE'
        AND COALESCE(e.consumed_from_institute_allocation, 0) = 0
        AND datetime(COALESCE(e.completed_at, e.created_at)) >= datetime(?)
      ORDER BY datetime(COALESCE(e.completed_at, e.created_at)) ASC
    `).all(userId, monthStart) as Array<{
      id: string;
      student_id: string;
      entitlement_source?: string;
      consumed_from_personal_credits?: number;
    }>;

    let settledCount = 0;
    for (const ev of completedPersonalEvals) {
      const latestEntry = db.prepare(`
        SELECT id, source, amount
        FROM credit_ledger
        WHERE student_id = ? AND evaluation_id = ?
        ORDER BY rowid DESC LIMIT 1
      `).get(userId, ev.id) as { id: string; source?: string; amount?: number } | undefined;

      // If active negative debit exists, it is already settled
      if (latestEntry && Number(latestEntry.amount) < 0) {
        continue;
      }

      // Needs settlement!
      const settlement = settlePersonalEntitlementForSuccessfulEvaluationSync({
        userId,
        evaluationId: ev.id,
        entitlementSource: ev.entitlement_source || 'PERSONAL_FREE',
      });

      if (settlement?.charged) {
        settledCount += 1;
      }
    }

    if (settledCount > 0) {
      syncStudentCreditsToFirestore(userId).catch(() => {});
    }

    return settledCount;
  } catch (reconcileErr) {
    console.warn(`[EvaluationEntitlementSettlement] Error reconciling completed evaluation credits for student ${userId}:`, reconcileErr);
    return 0;
  }
}

