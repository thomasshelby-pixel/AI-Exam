import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, initDatabase } from '../db.js';
import {
  consumeEvaluationEntitlementAtomic,
  getValidStudentCreditBalance,
  getStudentCreditDetailedSummary,
  recordCreditPurchase,
  refundEvaluationCreditAtomic,
} from '../services/studentCreditService.js';
import { settlePersonalEntitlementForSuccessfulEvaluation } from '../services/evaluationEntitlementSettlementService.js';

initDatabase();

async function run() {
  const userId = `usr_settlement_${crypto.randomBytes(6).toString('hex')}`;
  const email = `${userId}@example.com`;
  const freeEval1 = `eval_free_settlement_1_${crypto.randomBytes(4).toString('hex')}`;
  const freeEval2 = `eval_free_settlement_2_${crypto.randomBytes(4).toString('hex')}`;
  const targetEvaluationId = `eval_reprocessed_${crypto.randomBytes(6).toString('hex')}`;

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, ?, 'hash', 'Entitlement Settlement Test', 'STUDENT', 'ACTIVE')
  `).run(userId, email);
  const registrationNumber = `WRO${String(crypto.randomInt(0, 10_000_000)).padStart(7, '0')}`;
  db.prepare(`
    INSERT INTO student_profiles (
      user_id, icai_registration_number, ca_level,
      free_evaluations_used, monthly_free_evaluations_used, monthly_free_evaluations_limit,
      purchased_credits, paid_credits
    ) VALUES (?, ?, 'INTERMEDIATE', 0, 0, 2, 0, 0)
  `).run(userId, registrationNumber);

  try {
    // Exhaust the two monthly free evaluations first, matching production
    // entitlement priority, then create a purchased-credit lot.
    assert.equal(
      consumeEvaluationEntitlementAtomic({ userId, evaluationId: freeEval1 }).source,
      'PERSONAL_FREE',
    );
    assert.equal(
      consumeEvaluationEntitlementAtomic({ userId, evaluationId: freeEval2 }).source,
      'PERSONAL_FREE',
    );

    recordCreditPurchase({
      userId,
      creditsPurchased: 2,
      orderId: `ord_settlement_${crypto.randomBytes(4).toString('hex')}`,
      paymentId: `pay_settlement_${crypto.randomBytes(4).toString('hex')}`,
      purchaseDate: new Date(),
    });
    assert.equal(getValidStudentCreditBalance(userId), 2);

    // A fresh, uncharged job must settle one purchased credit before
    // COMPLETED is published when the monthly free quota is exhausted.
    const firstSettlement = await settlePersonalEntitlementForSuccessfulEvaluation({
      userId,
      evaluationId: targetEvaluationId,
      entitlementSource: 'PERSONAL_PURCHASED_CREDIT',
    });
    assert.equal(firstSettlement?.charged, true);
    assert.equal(firstSettlement?.source, 'PERSONAL_PURCHASED_CREDIT');
    assert.equal(getValidStudentCreditBalance(userId), 1);

    const missingLedgerEvalId = `eval_ledger_missing_${crypto.randomBytes(4).toString('hex')}`;
    const missingLedgerSettlement = await settlePersonalEntitlementForSuccessfulEvaluation({
      userId,
      evaluationId: missingLedgerEvalId,
      entitlementSource: 'PERSONAL_PURCHASED_CREDIT',
    });
    assert.equal(missingLedgerSettlement?.charged, true);
    assert.equal(missingLedgerSettlement?.reason, 'DEBIT_CREATED');
    assert.equal(getValidStudentCreditBalance(userId), 0);

    const missingLedgerRetry = await settlePersonalEntitlementForSuccessfulEvaluation({
      userId,
      evaluationId: missingLedgerEvalId,
      entitlementSource: 'PERSONAL_PURCHASED_CREDIT',
    });
    assert.equal(missingLedgerRetry?.charged, false);
    assert.equal(missingLedgerRetry?.reason, 'DEBIT_ALREADY_EXISTS');
    assert.equal(getValidStudentCreditBalance(userId), 0);

    // A negative ledger entry is authoritative: repeat completion must not
    // consume another credit. Faculty Mock sponsorship is excluded entirely.
    const duplicateSettlement = await settlePersonalEntitlementForSuccessfulEvaluation({
      userId,
      evaluationId: targetEvaluationId,
      entitlementSource: 'PERSONAL_PURCHASED_CREDIT',
    });
    assert.equal(duplicateSettlement?.charged, false);
    assert.equal(duplicateSettlement?.reason, 'DEBIT_ALREADY_EXISTS');
    assert.equal(getValidStudentCreditBalance(userId), 0);

    const facultyMockSettlement = await settlePersonalEntitlementForSuccessfulEvaluation({
      userId,
      evaluationId: `eval_faculty_mock_${crypto.randomBytes(4).toString('hex')}`,
      entitlementSource: 'FACULTY_MOCK_SPONSORED',
    });
    assert.equal(facultyMockSettlement, null);
    assert.equal(getValidStudentCreditBalance(userId), 0);

    // Failed first attempt is refunded; a later successful admin reprocess
    // keeps creditAlreadyConsumed=true, but the refund event requires one
    // replacement debit for the same evaluation ID.
    assert.equal(
      refundEvaluationCreditAtomic({
        userId,
        evaluationId: targetEvaluationId,
        entitlementSource: 'PERSONAL_PURCHASED_CREDIT',
      }),
      true,
    );
    assert.equal(getValidStudentCreditBalance(userId), 1);

    const reprocessSettlement = await settlePersonalEntitlementForSuccessfulEvaluation({
      userId,
      evaluationId: targetEvaluationId,
      entitlementSource: 'PERSONAL_PURCHASED_CREDIT',
    });
    assert.equal(reprocessSettlement?.charged, true);
    assert.equal(reprocessSettlement?.reason, 'DEBIT_RESTORED_AFTER_REFUND');
    assert.equal(getValidStudentCreditBalance(userId), 0);

    const reprocessRetry = await settlePersonalEntitlementForSuccessfulEvaluation({
      userId,
      evaluationId: targetEvaluationId,
      entitlementSource: 'PERSONAL_PURCHASED_CREDIT',
    });
    assert.equal(reprocessRetry?.charged, false);
    assert.equal(getValidStudentCreditBalance(userId), 0);

    // A second failed reprocess cycle must be refundable too; a historical
    // refund from the first attempt must not block the later refund.
    assert.equal(
      refundEvaluationCreditAtomic({
        userId,
        evaluationId: targetEvaluationId,
        entitlementSource: 'PERSONAL_PURCHASED_CREDIT',
      }),
      true,
    );
    assert.equal(getValidStudentCreditBalance(userId), 1);
    assert.equal(
      refundEvaluationCreditAtomic({
        userId,
        evaluationId: targetEvaluationId,
        entitlementSource: 'PERSONAL_PURCHASED_CREDIT',
      }),
      true,
    );
    assert.equal(getValidStudentCreditBalance(userId), 1);

    // Exact production case: two unused monthly free evaluations, no debit
    // ledger event for a reprocessed historical evaluation, and one successful
    // completion must move the remaining quota from 2 to 1 exactly once.
    const freeUserId = `usr_monthly_free_settlement_${crypto.randomBytes(6).toString('hex')}`;
    const freeEmail = `${freeUserId}@example.com`;
    const freeEvaluationId = `eval_monthly_free_reprocess_${crypto.randomBytes(6).toString('hex')}`;
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, status)
      VALUES (?, ?, 'hash', 'Monthly Free Settlement Test', 'STUDENT', 'ACTIVE')
    `).run(freeUserId, freeEmail);
    const freeRegistration = `WRO${String(crypto.randomInt(0, 10_000_000)).padStart(7, '0')}`;
    db.prepare(`
      INSERT INTO student_profiles (
        user_id, icai_registration_number, ca_level,
        free_evaluations_used, monthly_free_evaluations_used, monthly_free_evaluations_limit,
        purchased_credits, paid_credits
      ) VALUES (?, ?, 'INTERMEDIATE', 0, 0, 2, 0, 0)
    `).run(freeUserId, freeRegistration);

    try {
      assert.equal(getStudentCreditDetailedSummary(freeUserId).freeEvaluationsRemaining, 2);
      const freeSettlement = await settlePersonalEntitlementForSuccessfulEvaluation({
        userId: freeUserId,
        evaluationId: freeEvaluationId,
        entitlementSource: 'PERSONAL_FREE',
      });
      assert.equal(freeSettlement?.charged, true);
      assert.equal(freeSettlement?.source, 'PERSONAL_FREE');
      assert.equal(getStudentCreditDetailedSummary(freeUserId).freeEvaluationsRemaining, 1);

      const freeDuplicate = await settlePersonalEntitlementForSuccessfulEvaluation({
        userId: freeUserId,
        evaluationId: freeEvaluationId,
        entitlementSource: 'PERSONAL_FREE',
      });
      assert.equal(freeDuplicate?.charged, false);
      assert.equal(getStudentCreditDetailedSummary(freeUserId).freeEvaluationsRemaining, 1);

      assert.equal(
        refundEvaluationCreditAtomic({
          userId: freeUserId,
          evaluationId: freeEvaluationId,
          entitlementSource: 'PERSONAL_FREE',
        }),
        true,
      );
      assert.equal(getStudentCreditDetailedSummary(freeUserId).freeEvaluationsRemaining, 2);

      const freeReprocess = await settlePersonalEntitlementForSuccessfulEvaluation({
        userId: freeUserId,
        evaluationId: freeEvaluationId,
        entitlementSource: 'PERSONAL_FREE',
      });
      assert.equal(freeReprocess?.charged, true);
      assert.equal(freeReprocess?.reason, 'DEBIT_RESTORED_AFTER_REFUND');
      assert.equal(getStudentCreditDetailedSummary(freeUserId).freeEvaluationsRemaining, 1);

      // Legacy PUBLIC evaluations may predate entitlement_source persistence.
      // Admin reconciliation must infer the current personal entitlement and
      // still remain idempotent for the same evaluation ID.
      const legacyPublicEvaluationId = `eval_legacy_public_${crypto.randomBytes(6).toString('hex')}`;
      const legacyPublicSettlement = await settlePersonalEntitlementForSuccessfulEvaluation({
        userId: freeUserId,
        evaluationId: legacyPublicEvaluationId,
        entitlementSource: '',
      });
      assert.equal(legacyPublicSettlement?.charged, true);
      assert.equal(legacyPublicSettlement?.source, 'PERSONAL_FREE');
      assert.equal(getStudentCreditDetailedSummary(freeUserId).freeEvaluationsRemaining, 0);

      const legacyPublicRetry = await settlePersonalEntitlementForSuccessfulEvaluation({
        userId: freeUserId,
        evaluationId: legacyPublicEvaluationId,
        entitlementSource: '',
      });
      assert.equal(legacyPublicRetry?.charged, false);
      assert.equal(legacyPublicRetry?.reason, 'DEBIT_ALREADY_EXISTS');
      assert.equal(getStudentCreditDetailedSummary(freeUserId).freeEvaluationsRemaining, 0);
    } finally {
      db.prepare('DELETE FROM credit_ledger WHERE student_id = ?').run(freeUserId);
      db.prepare('DELETE FROM student_credit_purchases WHERE user_id = ?').run(freeUserId);
      db.prepare('DELETE FROM student_profiles WHERE user_id = ?').run(freeUserId);
      db.prepare('DELETE FROM users WHERE id = ?').run(freeUserId);
    }

    console.log('✅ Evaluation entitlement settlement tests passed.');
  } finally {
    db.prepare('DELETE FROM credit_ledger WHERE student_id = ?').run(userId);
    db.prepare('DELETE FROM student_credit_purchases WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM student_profiles WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }
}

run().catch((error) => {
  console.error('❌ Evaluation entitlement settlement tests failed:', error);
  process.exitCode = 1;
});
