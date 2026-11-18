import { db } from '../db.js';
import {
  consumeEvaluationEntitlementAtomic,
  syncStudentCreditsToFirestore,
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
  const userId = String(params.userId || '').trim();
  const evaluationId = String(params.evaluationId || '').trim();
  const requestedSource = String(params.entitlementSource || '').trim().toUpperCase();

  if (!userId || !evaluationId) {
    throw new Error('Cannot settle an evaluation entitlement without a student ID and evaluation ID.');
  }

  if (!['PROMO', 'PERSONAL_FREE', 'PERSONAL_PURCHASED_CREDIT'].includes(requestedSource)) {
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
      source: requestedSource as PersonalEvaluationEntitlementSource,
      reason: 'NON_REFUND_POSITIVE_LEDGER_EVENT',
    };
  }

  // No debit exists on an uncharged job, or the latest event is a real refund.
  // The underlying service is atomic and evaluation-ID idempotent.
  const consumed = consumeEvaluationEntitlementAtomic({ userId, evaluationId });
  // Local ledger mutation is authoritative. A mirror outage must not turn a
  // successful debit into a failed worker run after the charge was committed.
  try {
    await syncStudentCreditsToFirestore(userId);
  } catch (syncError) {
    console.warn('[EvaluationEntitlementSettlement] Credit mirror sync failed after local settlement:', syncError);
  }

  return {
    charged: true,
    source: consumed.source,
    reason: latestLedgerEntry && Number(latestLedgerEntry.amount) > 0
      ? 'DEBIT_RESTORED_AFTER_REFUND'
      : 'DEBIT_CREATED',
  };
}
