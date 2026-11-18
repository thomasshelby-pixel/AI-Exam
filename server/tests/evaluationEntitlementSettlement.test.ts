import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, initDatabase } from '../db.js';
import {
  consumeEvaluationEntitlementAtomic,
  getValidStudentCreditBalance,
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

    // Regression: successful evaluation/reprocess must create a debit even
    // when the old job flag says it was already consumed but there is no
    // current negative ledger entry for this evaluation.
    const firstSettlement = await settlePersonalEntitlementForSuccessfulEvaluation({
      userId,
      evaluationId: targetEvaluationId,
      entitlementSource: 'PERSONAL_PURCHASED_CREDIT',
      creditAlreadyConsumed: false,
    });
    assert.equal(firstSettlement?.charged, true);
    assert.equal(firstSettlement?.source, 'PERSONAL_PURCHASED_CREDIT');
    assert.equal(getValidStudentCreditBalance(userId), 1);

    const missingReplicaLedger = await settlePersonalEntitlementForSuccessfulEvaluation({
      userId,
      evaluationId: `eval_ledger_not_visible_${crypto.randomBytes(4).toString('hex')}`,
      entitlementSource: 'PERSONAL_PURCHASED_CREDIT',
      creditAlreadyConsumed: true,
    });
    assert.equal(missingReplicaLedger?.charged, false);
    assert.equal(missingReplicaLedger?.reason, 'PRECHARGED_LEDGER_NOT_VISIBLE');
    assert.equal(getValidStudentCreditBalance(userId), 1);

    // A negative ledger entry is authoritative: repeat completion must not
    // consume another credit. Faculty Mock sponsorship is excluded entirely.
    const duplicateSettlement = await settlePersonalEntitlementForSuccessfulEvaluation({
      userId,
      evaluationId: targetEvaluationId,
      entitlementSource: 'PERSONAL_PURCHASED_CREDIT',
      creditAlreadyConsumed: true,
    });
    assert.equal(duplicateSettlement?.charged, false);
    assert.equal(duplicateSettlement?.reason, 'DEBIT_ALREADY_EXISTS');
    assert.equal(getValidStudentCreditBalance(userId), 1);

    const facultyMockSettlement = await settlePersonalEntitlementForSuccessfulEvaluation({
      userId,
      evaluationId: `eval_faculty_mock_${crypto.randomBytes(4).toString('hex')}`,
      entitlementSource: 'FACULTY_MOCK_SPONSORED',
      creditAlreadyConsumed: false,
    });
    assert.equal(facultyMockSettlement, null);
    assert.equal(getValidStudentCreditBalance(userId), 1);

    // Failed first attempt is refunded; a later successful admin reprocess
    // must re-establish exactly one debit for the same evaluation ID.
    assert.equal(
      refundEvaluationCreditAtomic({
        userId,
        evaluationId: targetEvaluationId,
        entitlementSource: 'PERSONAL_PURCHASED_CREDIT',
      }),
      true,
    );
    assert.equal(getValidStudentCreditBalance(userId), 2);

    const reprocessSettlement = await settlePersonalEntitlementForSuccessfulEvaluation({
      userId,
      evaluationId: targetEvaluationId,
      entitlementSource: 'PERSONAL_PURCHASED_CREDIT',
      creditAlreadyConsumed: true,
    });
    assert.equal(reprocessSettlement?.charged, true);
    assert.equal(reprocessSettlement?.reason, 'DEBIT_RESTORED_AFTER_REFUND');
    assert.equal(getValidStudentCreditBalance(userId), 1);

    const reprocessRetry = await settlePersonalEntitlementForSuccessfulEvaluation({
      userId,
      evaluationId: targetEvaluationId,
      entitlementSource: 'PERSONAL_PURCHASED_CREDIT',
      creditAlreadyConsumed: true,
    });
    assert.equal(reprocessRetry?.charged, false);
    assert.equal(getValidStudentCreditBalance(userId), 1);

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
    assert.equal(getValidStudentCreditBalance(userId), 2);
    assert.equal(
      refundEvaluationCreditAtomic({
        userId,
        evaluationId: targetEvaluationId,
        entitlementSource: 'PERSONAL_PURCHASED_CREDIT',
      }),
      true,
    );
    assert.equal(getValidStudentCreditBalance(userId), 2);

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
