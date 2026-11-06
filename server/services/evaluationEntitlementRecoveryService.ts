import { db } from '../db.js';
import { refundEvaluationCreditAtomic, syncStudentCreditsToFirestore } from './studentCreditService.js';
import { buildStudentOwnershipSql, getStudentOwnershipParams } from './studentOwnershipService.js';

/**
 * Self-heal consumed entitlements for failed/rejected/review-required evaluations.
 * This covers older submissions whose worker exited after persisting a terminal
 * status but before completing the refund. The credit ledger is authoritative:
 * rejected uploads that never consumed a credit have no debit row and are ignored.
 */
export function restoreFailedEvaluationEntitlementsForStudent(studentId: string, studentEmail: string): void {
  const failedRows = db.prepare(`
    SELECT e.id, e.student_id, e.entitlement_source
    FROM evaluations e
    LEFT JOIN users u ON u.id = e.student_id
    WHERE ${buildStudentOwnershipSql('e', 'u')}
      AND UPPER(COALESCE(e.status, '')) IN ('FAILED', 'REJECTED', 'NEEDS_REVIEW', 'PERSISTENCE_FAILED', 'CANCELLED')
      AND UPPER(COALESCE(e.entitlement_source, '')) IN ('PROMO', 'PERSONAL_FREE', 'PERSONAL_PURCHASED_CREDIT')
      AND EXISTS (
        SELECT 1
        FROM credit_ledger l
        WHERE l.student_id = e.student_id
          AND l.evaluation_id = e.id
          AND l.amount < 0
          AND (
            (UPPER(e.entitlement_source) = 'PROMO' AND l.source = 'CONSUMED_PROMO_AI30')
            OR (UPPER(e.entitlement_source) = 'PERSONAL_FREE' AND l.source = 'FREE_MONTHLY_EVALUATION')
            OR (UPPER(e.entitlement_source) = 'PERSONAL_PURCHASED_CREDIT' AND l.source = 'CONSUMED_EVALUATION')
          )
      )
  `).all(...getStudentOwnershipParams(studentId, studentEmail)) as Array<{
    id: string;
    student_id: string;
    entitlement_source: string;
  }>;

  for (const failed of failedRows) {
    try {
      const restored = refundEvaluationCreditAtomic({
        userId: String(failed.student_id),
        evaluationId: String(failed.id),
        entitlementSource: String(failed.entitlement_source).toUpperCase(),
      });
      if (!restored) continue;

      db.prepare('UPDATE evaluations SET consumed_from_personal_credits = 0 WHERE id = ?').run(String(failed.id));
      syncStudentCreditsToFirestore(String(failed.student_id)).catch((error) =>
        console.warn('[EvaluationEntitlementRecovery] Could not sync repaired evaluation entitlement:', failed.id, error)
      );
    } catch (refundError) {
      console.error('[EvaluationEntitlementRecovery] Could not restore terminal failed evaluation entitlement:', failed.id, refundError);
    }
  }
}
