import {
  recordCreditPurchase,
  getValidStudentCreditBalance,
  getStudentCreditStatus,
  consumeCreditFEFO,
  consumeEvaluationEntitlementAtomic,
  refundEvaluationCreditAtomic,
  ensureMonthlyFreeEvaluationsReset,
  getStudentCreditDetailedSummary,
  reconcileAllStudentCredits,
  migrateHistoricalCreditPurchases,
} from '../services/studentCreditService.js';
import { hydrateFromFirestore } from '../services/firestoreSyncService.js';
import { db, initDatabase } from '../db.js';
import crypto from 'node:crypto';

// Initialize DB schema
initDatabase();

console.log('======================================================================');
console.log(' MASTER PRODUCTION TEST: CREDIT PERSISTENCE, CONSUMPTION & RESET INTEGRITY');
console.log('======================================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}`);
    process.exitCode = 1;
  }
}

async function runMasterCreditSuite() {
  const testStudentId = `usr_test_credit_${crypto.randomBytes(6).toString('hex')}`;
  const testEmail = `test_credit_${crypto.randomBytes(4).toString('hex')}@example.com`;

  // 1. Setup Student Account
  console.log('--- 1. Setting Up Student Test Account ---');
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, ?, 'hash', 'Credit Test Student', 'STUDENT', 'ACTIVE')
  `).run(testStudentId, testEmail);

  db.prepare(`
    INSERT INTO student_profiles (
      user_id, icai_registration_number, ca_level,
      free_evaluations_used, monthly_free_evaluations_used, monthly_free_evaluations_limit,
      purchased_credits, paid_credits
    ) VALUES (?, 'WRO1234567', 'INTERMEDIATE', 0, 0, 2, 0, 0)
  `).run(testStudentId);

  assert(getValidStudentCreditBalance(testStudentId) === 0, 'Initial paid credit balance is 0');

  // 2. Grant 10 Credits via Purchase / Grant
  console.log('\n--- 2. Purchasing/Granting 10 Paid Credits ---');
  const purchaseLot = recordCreditPurchase({
    userId: testStudentId,
    creditsPurchased: 10,
    orderId: `ord_master_${crypto.randomBytes(4).toString('hex')}`,
    paymentId: `pay_master_${crypto.randomBytes(4).toString('hex')}`,
    purchaseDate: new Date(),
  });

  assert(purchaseLot.creditsPurchased === 10, 'Purchase returns 10 purchased credits');
  assert(purchaseLot.totalValidCredits === 10, 'Purchase returns total 10 valid credits');

  let balance = getValidStudentCreditBalance(testStudentId);
  assert(balance === 10, 'Authoritative balance in student_credit_purchases is 10');

  let profile = db.prepare('SELECT purchased_credits, paid_credits FROM student_profiles WHERE user_id = ?').get(testStudentId) as any;
  assert(profile.purchased_credits === 10 && profile.paid_credits === 10, 'student_profiles reflects 10 credits');

  // 3. Exhaust monthly free evaluations first to test paid credit consumption
  console.log('\n--- 3. Consuming 2 Monthly Free Evaluations ---');
  const free1 = consumeEvaluationEntitlementAtomic({ userId: testStudentId, evaluationId: 'eval_free_1' });
  assert(free1.source === 'PERSONAL_FREE' && free1.freeRemaining === 1, 'First evaluation consumes monthly free quota (1 remaining)');

  const free2 = consumeEvaluationEntitlementAtomic({ userId: testStudentId, evaluationId: 'eval_free_2' });
  assert(free2.source === 'PERSONAL_FREE' && free2.freeRemaining === 0, 'Second evaluation exhausts monthly free quota (0 remaining)');

  balance = getValidStudentCreditBalance(testStudentId);
  assert(balance === 10, 'Paid credits remained untouched at 10 during free quota consumption');

  // 4. Consume 1 Paid Credit: 10 -> 9
  console.log('\n--- 4. Consuming 1 Paid Credit (10 -> 9) ---');
  const evalId1 = `eval_paid_001_${crypto.randomBytes(4).toString('hex')}`;
  const consumePaid1 = consumeEvaluationEntitlementAtomic({ userId: testStudentId, evaluationId: evalId1 });

  assert(consumePaid1.source === 'PERSONAL_PURCHASED_CREDIT', 'Entitlement source is PERSONAL_PURCHASED_CREDIT');
  assert(consumePaid1.paidCredits === 9, 'Returned paidCredits after deduction is 9');

  balance = getValidStudentCreditBalance(testStudentId);
  assert(balance === 9, 'Authoritative balance after deduction is 9');

  profile = db.prepare('SELECT purchased_credits, paid_credits FROM student_profiles WHERE user_id = ?').get(testStudentId) as any;
  assert(profile.purchased_credits === 9 && profile.paid_credits === 9, 'student_profiles reflects 9 credits');

  const lotDb = db.prepare('SELECT credits_remaining, status FROM student_credit_purchases WHERE id = ?').get(purchaseLot.lotId) as any;
  assert(lotDb.credits_remaining === 9 && lotDb.status === 'ACTIVE', 'Lot in student_credit_purchases has 9 remaining and status ACTIVE');

  const ledgerEntries = db.prepare('SELECT * FROM credit_ledger WHERE student_id = ? AND evaluation_id = ?').all(testStudentId, evalId1) as any[];
  assert(ledgerEntries.length === 1 && ledgerEntries[0].amount === -1, 'credit_ledger recorded exactly 1 debit of -1');
  assert(ledgerEntries[0].balance_after === 9, 'credit_ledger records balance_after as 9');

  // 5. Idempotency Check: Retrying the exact same evaluation does NOT deduct again
  console.log('\n--- 5. Idempotency Guard on Network Retry / Remount ---');
  const retryResult = consumeEvaluationEntitlementAtomic({ userId: testStudentId, evaluationId: evalId1 });
  assert(retryResult.paidCredits === 9, 'Retry returns 9 without duplicate deduction');

  balance = getValidStudentCreditBalance(testStudentId);
  assert(balance === 9, 'Balance remains strictly 9 after retry');

  // 6. Simulated Deployment / Container Restart Hydration
  console.log('\n--- 6. Simulating Fresh Deployment / Container Restart Hydration ---');
  // Run hydration from Firestore (which connects to the real Firestore db)
  try {
    await hydrateFromFirestore({ requireComplete: false });
  } catch (hErr) {
    console.log('Hydration note (offline or partial):', hErr);
  }

  // Check balance after hydration
  balance = getValidStudentCreditBalance(testStudentId);
  assert(balance === 9, 'Balance remains strictly 9 after hydrateFromFirestore() (NEVER reverted to 10)');

  // Run reconciliation and historical migration sweeps
  await reconcileAllStudentCredits();
  balance = getValidStudentCreditBalance(testStudentId);
  assert(balance === 9, 'Balance remains strictly 9 after reconcileAllStudentCredits()');

  profile = db.prepare('SELECT purchased_credits, paid_credits FROM student_profiles WHERE user_id = ?').get(testStudentId) as any;
  assert(profile.purchased_credits === 9, 'student_profiles.purchased_credits remains 9 after reconciliation');

  // 7. Consume Remaining Credits Down to 0
  console.log('\n--- 7. Consuming Remaining 9 Credits Down to 0 ---');
  for (let i = 1; i <= 9; i++) {
    const eid = `eval_batch_${i}_${crypto.randomBytes(4).toString('hex')}`;
    const res = consumeEvaluationEntitlementAtomic({ userId: testStudentId, evaluationId: eid });
    assert(res.paidCredits === 9 - i, `Evaluation ${i} deducted correctly: balance is ${9 - i}`);
  }

  balance = getValidStudentCreditBalance(testStudentId);
  assert(balance === 0, 'Balance is exactly 0 after consuming all credits');

  const lotFinished = db.prepare('SELECT credits_remaining, status FROM student_credit_purchases WHERE id = ?').get(purchaseLot.lotId) as any;
  assert(lotFinished.credits_remaining === 0 && lotFinished.status === 'CONSUMED', 'Lot has credits_remaining = 0 and status = CONSUMED');

  // 8. Durability of 0 Balance Across Restarts & Reconciliations
  console.log('\n--- 8. Verifying 0 Balance Durability Across Restarts (Never Resets to 10) ---');
  try {
    await hydrateFromFirestore({ requireComplete: false });
  } catch {}
  await reconcileAllStudentCredits();

  balance = getValidStudentCreditBalance(testStudentId);
  assert(balance === 0, 'Exhausted balance remains strictly 0 after restart & reconciliation (NEVER resurrected to 10)');

  profile = db.prepare('SELECT purchased_credits, paid_credits FROM student_profiles WHERE user_id = ?').get(testStudentId) as any;
  assert(profile.purchased_credits === 0 && profile.paid_credits === 0, 'student_profiles remains 0 after restart');

  // 9. Rejection on Insufficient Credits
  console.log('\n--- 9. Verifying Rejection when Balance is 0 ---');
  let thrown = false;
  try {
    consumeEvaluationEntitlementAtomic({ userId: testStudentId, evaluationId: 'eval_should_fail' });
  } catch (err: any) {
    thrown = true;
    assert(
      err.message.includes('exhausted'),
      'Throws error indicating evaluations are exhausted'
    );
  }
  assert(thrown, 'Attempting evaluation with 0 credits fails as expected');

  // 10. Refund Processing
  console.log('\n--- 10. Verifying Evaluation Processing Failure Refund ---');
  // First grant 1 new credit
  recordCreditPurchase({
    userId: testStudentId,
    creditsPurchased: 1,
    orderId: 'ord_for_refund',
    paymentId: 'pay_for_refund',
  });
  assert(getValidStudentCreditBalance(testStudentId) === 1, 'Balance is 1 after new purchase');

  const refundEvalId = `eval_refund_${crypto.randomBytes(4).toString('hex')}`;
  consumeEvaluationEntitlementAtomic({ userId: testStudentId, evaluationId: refundEvalId });
  assert(getValidStudentCreditBalance(testStudentId) === 0, 'Balance is 0 after consumption');

  // Now trigger atomic refund due to background processing failure
  refundEvaluationCreditAtomic({
    userId: testStudentId,
    evaluationId: refundEvalId,
    entitlementSource: 'PERSONAL_PURCHASED_CREDIT',
  });
  assert(getValidStudentCreditBalance(testStudentId) === 1, 'Balance is restored to 1 after refund');

  // Clean up test data
  console.log('\n--- Cleaning up test records ---');
  db.prepare('DELETE FROM credit_ledger WHERE student_id = ?').run(testStudentId);
  db.prepare('DELETE FROM student_credit_purchases WHERE user_id = ?').run(testStudentId);
  db.prepare('DELETE FROM student_profiles WHERE user_id = ?').run(testStudentId);
  db.prepare('DELETE FROM users WHERE id = ?').run(testStudentId);

  console.log('\n======================================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} tests passed`);
  console.log('======================================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runMasterCreditSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
