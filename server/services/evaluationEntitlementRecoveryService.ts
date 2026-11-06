import crypto from 'node:crypto';
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

  // Also recover legacy deletions whose evaluation row no longer exists.
  restoreDeletedEvaluationEntitlementsForStudent(studentId);
}

/**
 * Reconciles legacy evaluations deleted before credit-ledger links were preserved.
 * Old deletion code nulled evaluation_id for every ledger row. We only restore a
 * deleted entitlement when the remaining orphan ledger rows map exactly to the
 * unmarked deletion audits for that student/source and every non-terminal
 * deletion is already represented by an orphan refund. Ambiguous groups fail closed.
 */
export function restoreDeletedEvaluationEntitlementsForStudent(studentId: string): void {
  const auditRows = db.prepare(`
    SELECT id, entity_id, details, created_at
    FROM audit_logs
    WHERE action = 'EVALUATION_DELETED'
      AND entity_type = 'evaluations'
      AND details LIKE ?
    ORDER BY created_at ASC, rowid ASC
  `).all(`%"studentId":"${studentId}"%`) as Array<{
    id: string;
    entity_id: string;
    details: string;
    created_at: string;
  }>;

  const parsed = auditRows.flatMap((row) => {
    try {
      const details = JSON.parse(String(row.details || '{}'));
      if (String(details.studentId || '') !== studentId) return [];
      const evaluationId = String(details.evaluationId || row.entity_id || '').trim();
      const entitlementSource = String(details.entitlementSource || '').trim().toUpperCase();
      if (!evaluationId || !entitlementSource) return [];
      return [{
        auditId: String(row.id),
        evaluationId,
        entitlementSource,
        status: String(details.status || '').trim().toUpperCase(),
        creditRefundedBeforeDelete: details.creditRefundedBeforeDelete === true,
      }];
    } catch {
      return [];
    }
  });

  const markerRows = db.prepare(`
    SELECT entity_id
    FROM audit_logs
    WHERE action = 'DELETED_EVALUATION_ENTITLEMENT_RESTORED'
      AND entity_type = 'evaluations'
  `).all() as Array<{ entity_id: string }>;
  const restoredIds = new Set(markerRows.map((row) => String(row.entity_id)));

  const sources = [
    {
      entitlement: 'PERSONAL_FREE',
      debit: 'FREE_MONTHLY_EVALUATION',
      refund: 'REFUND_MONTHLY_FREE',
    },
    {
      entitlement: 'PROMO',
      debit: 'CONSUMED_PROMO_AI30',
      refund: 'REFUND_PROMO',
    },
    {
      entitlement: 'PERSONAL_PURCHASED_CREDIT',
      debit: 'CONSUMED_EVALUATION',
      refund: 'REFUND_PURCHASED_CREDIT',
    },
  ] as const;

  const sourceByEntitlement = new Map<string, (typeof sources)[number]>(
    sources.map((source) => [source.entitlement, source] as const)
  );
  const refundableStatuses = new Set([
    'FAILED',
    'REJECTED',
    'NEEDS_REVIEW',
    'PERSISTENCE_FAILED',
    'CANCELLED',
  ]);

  // When the ledger link survived deletion (or was restored from Firestore),
  // refund by the exact evaluation ID before considering legacy NULL-linked rows.
  for (const row of parsed) {
    if (restoredIds.has(row.evaluationId) || row.creditRefundedBeforeDelete || !refundableStatuses.has(row.status)) continue;
    const source = sourceByEntitlement.get(row.entitlementSource);
    if (!source) continue;

    const linkedDebit = db.prepare(`
      SELECT id
      FROM credit_ledger
      WHERE student_id = ? AND evaluation_id = ? AND source = ? AND amount < 0
      LIMIT 1
    `).get(studentId, row.evaluationId, source.debit) as { id: string } | undefined;
    if (!linkedDebit) continue;

    try {
      const restored = refundEvaluationCreditAtomic({
        userId: studentId,
        evaluationId: row.evaluationId,
        entitlementSource: row.entitlementSource,
      });
      if (restored) {
        const markerId = `aud_${crypto.randomBytes(8).toString('hex')}`;
        db.prepare(`
          INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
          VALUES (?, ?, 'DELETED_EVALUATION_ENTITLEMENT_RESTORED', 'evaluations', ?, ?)
        `).run(
          markerId,
          studentId,
          row.evaluationId,
          JSON.stringify({
            evaluationId: row.evaluationId,
            studentId,
            entitlementSource: row.entitlementSource,
            sourceDebitLedgerId: linkedDebit.id,
            restoredAt: new Date().toISOString(),
            reason: 'Recovered a ledger-linked entitlement from an immutable EVALUATION_DELETED audit record.',
          })
        );
        restoredIds.add(row.evaluationId);
      }
    } catch (error) {
      console.error('[EvaluationEntitlementRecovery] Could not restore linked deleted evaluation entitlement:', row.evaluationId, error);
    }
  }

  // Only unlinked legacy rows remain for the strict one-to-one reconciliation below.
  const linkedEvaluationRows = db.prepare(`
    SELECT DISTINCT evaluation_id
    FROM credit_ledger
    WHERE student_id = ? AND evaluation_id IS NOT NULL
  `).all(studentId) as Array<{ evaluation_id: string }>;
  const linkedEvaluationIds = new Set(linkedEvaluationRows.map((row) => String(row.evaluation_id)));
  const outstandingAudits = parsed.filter((row) =>
    !restoredIds.has(row.evaluationId) &&
    !row.creditRefundedBeforeDelete &&
    !linkedEvaluationIds.has(row.evaluationId)
  );

  for (const source of sources) {
    const sourceAudits = outstandingAudits.filter((row) => row.entitlementSource === source.entitlement);
    if (!sourceAudits.length) continue;

    const orphanDebits = db.prepare(`
      SELECT id, note, created_at
      FROM credit_ledger
      WHERE student_id = ?
        AND evaluation_id IS NULL
        AND source = ?
        AND amount < 0
      ORDER BY rowid ASC
    `).all(studentId, source.debit) as Array<{ id: string; note?: string; created_at?: string }>;

    const orphanRefundCount = Number((db.prepare(`
      SELECT COUNT(*) AS count
      FROM credit_ledger
      WHERE student_id = ?
        AND evaluation_id IS NULL
        AND source = ?
        AND amount > 0
    `).get(studentId, source.refund) as { count: number }).count || 0);

    const refundableAudits = sourceAudits.filter((row) => refundableStatuses.has(row.status));
    const nonRefundableAudits = sourceAudits.filter((row) => !refundableStatuses.has(row.status));

    // We need a one-to-one ledger/audit mapping. Existing refunds must account
    // for every non-refundable deletion; otherwise we cannot prove which debit
    // remains outstanding and deliberately do not mint any entitlement.
    if (
      orphanDebits.length !== sourceAudits.length ||
      orphanRefundCount !== nonRefundableAudits.length ||
      !refundableAudits.length
    ) {
      continue;
    }

    for (const failed of refundableAudits) {
      const debit = orphanDebits.shift();
      if (!debit) break;

      const linked = db.prepare(`
        UPDATE credit_ledger
        SET evaluation_id = ?
        WHERE id = ? AND student_id = ? AND evaluation_id IS NULL AND amount < 0
      `).run(failed.evaluationId, debit.id, studentId);
      if (Number(linked.changes || 0) !== 1) continue;

      try {
        const restored = refundEvaluationCreditAtomic({
          userId: studentId,
          evaluationId: failed.evaluationId,
          entitlementSource: source.entitlement,
        });
        if (!restored) {
          db.prepare('UPDATE credit_ledger SET evaluation_id = NULL WHERE id = ? AND evaluation_id = ?')
            .run(debit.id, failed.evaluationId);
          continue;
        }

        const markerId = `aud_${crypto.randomBytes(8).toString('hex')}`;
        db.prepare(`
          INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
          VALUES (?, ?, 'DELETED_EVALUATION_ENTITLEMENT_RESTORED', 'evaluations', ?, ?)
        `).run(
          markerId,
          studentId,
          failed.evaluationId,
          JSON.stringify({
            evaluationId: failed.evaluationId,
            studentId,
            entitlementSource: source.entitlement,
            sourceDebitLedgerId: debit.id,
            restoredAt: new Date().toISOString(),
            reason: 'Recovered an unlinked, ledger-proven entitlement from an immutable EVALUATION_DELETED audit record.',
          })
        );
      } catch (error) {
        const existingRefund = db.prepare(`
          SELECT id FROM credit_ledger
          WHERE student_id = ? AND evaluation_id = ? AND source = ? AND amount > 0
          LIMIT 1
        `).get(studentId, failed.evaluationId, source.refund);
        if (!existingRefund) {
          db.prepare('UPDATE credit_ledger SET evaluation_id = NULL WHERE id = ? AND evaluation_id = ?')
            .run(debit.id, failed.evaluationId);
        }
        console.error('[EvaluationEntitlementRecovery] Could not restore deleted evaluation entitlement:', failed.evaluationId, error);
      }
    }
  }
}
