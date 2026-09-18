import { db, initDatabase } from '../db.js';
import {
  ensureMonthlyFreeEvaluationsReset,
  getStudentCreditDetailedSummary,
  consumeEvaluationEntitlementAtomic,
  refundEvaluationCreditAtomic,
  recordCreditPurchase,
} from '../services/studentCreditService.js';
import crypto from 'node:crypto';

initDatabase();

console.log('================================================================');
console.log('--- TESTING MONTHLY FREE EVALUATIONS & PAID CREDIT SYSTEM ---');
console.log('================================================================');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    process.exitCode = 1;
  }
}

async function runTests() {
  const testUserId = `user_credits_${crypto.randomBytes(4).toString('hex')}`;

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role)
    VALUES (?, ?, 'dummy_hash', 'CA Credit Test Student', 'STUDENT')
  `).run(testUserId, `${testUserId}@example.com`);

  db.prepare(`
    INSERT INTO student_profiles (
      user_id,
      icai_registration_number,
      free_evaluations_used,
      monthly_free_evaluations_used,
      monthly_free_evaluations_limit,
      free_evaluation_reset_month,
      paid_credits,
      purchased_credits
    )
    VALUES (?, 'WRO999888', 0, 0, 2, '2026-08', 0, 0)
  `).run(testUserId);

  // Record 10 purchased credits via official service
  recordCreditPurchase({
    userId: testUserId,
    creditsPurchased: 10,
    orderId: 'order_test_10',
    paymentId: 'pay_test_10',
  });

  console.log('\n--- 1. Testing Monthly Free Evaluations Automatic Reset ---');
  // Initial state has reset_month = '2026-08', current month is later
  const profileAfterReset = ensureMonthlyFreeEvaluationsReset(testUserId);
  const currentMonthKey = new Date().toISOString().slice(0, 7);

  assert(
    profileAfterReset.freeEvaluationResetMonth === currentMonthKey,
    'Reset month is updated to current calendar month',
    `Expected ${currentMonthKey}, got ${profileAfterReset.freeEvaluationResetMonth}`
  );
  assert(
    profileAfterReset.monthlyFreeEvaluationsUsed === 0,
    'Monthly free evaluations used is reset to 0 in new calendar month',
    `Got ${profileAfterReset.monthlyFreeEvaluationsUsed}`
  );
  assert(
    profileAfterReset.paidCredits === 10,
    'Paid credits are preserved across monthly reset (10 paid credits remain)',
    `Got ${profileAfterReset.paidCredits}`
  );

  console.log('\n--- 2. Testing Summary and Clear Entitlement Balance ---');
  const summary = getStudentCreditDetailedSummary(testUserId);
  assert(
    summary.freeEvaluationsRemaining === 2 && summary.monthlyFreeEvaluationsLimit === 2,
    'User clearly sees 2/2 free evaluations remaining this month',
    `freeRemaining=${summary.freeEvaluationsRemaining}, limit=${summary.monthlyFreeEvaluationsLimit}`
  );
  assert(
    summary.paidCredits === 10,
    'User clearly sees 10 paid credits stored',
    `paidCredits=${summary.paidCredits}`
  );
  assert(
    summary.totalAvailable === 12,
    'Total accessible evaluations = 2 free + 10 paid = 12 evaluations',
    `totalAvailable=${summary.totalAvailable}`
  );
  assert(
    summary.statusMessage.includes('Free Evaluations: 2/2 remaining this month'),
    'Status message displays: "Free Evaluations: 2/2 remaining this month"',
    `statusMessage=${summary.statusMessage}`
  );

  console.log('\n--- 3. Testing Consumption Priority (Rule: Free First, Paid Second) ---');
  // First evaluation -> must consume monthly free evaluation #1
  const consume1 = consumeEvaluationEntitlementAtomic({ userId: testUserId });
  assert(
    consume1.source === 'PERSONAL_FREE',
    'Evaluation #1 consumes 1 monthly FREE evaluation',
    `consumedSource=${consume1.source}`
  );
  assert(
    consume1.freeRemaining === 1 && consume1.paidCredits === 10,
    'Balance after Eval #1: 1 free remaining, 10 paid credits unchanged',
    `free=${consume1.freeRemaining}, paid=${consume1.paidCredits}`
  );

  // Second evaluation -> must consume monthly free evaluation #2
  const consume2 = consumeEvaluationEntitlementAtomic({ userId: testUserId });
  assert(
    consume2.source === 'PERSONAL_FREE',
    'Evaluation #2 consumes second monthly FREE evaluation',
    `consumedSource=${consume2.source}`
  );
  assert(
    consume2.freeRemaining === 0 && consume2.paidCredits === 10,
    'Balance after Eval #2: 0 free remaining, 10 paid credits unchanged',
    `free=${consume2.freeRemaining}, paid=${consume2.paidCredits}`
  );

  // Third evaluation -> monthly free exhausted, must consume PAID CREDIT
  const consume3 = consumeEvaluationEntitlementAtomic({ userId: testUserId });
  assert(
    consume3.source === 'PERSONAL_PURCHASED_CREDIT',
    'Evaluation #3 consumes 1 PAID CREDIT after monthly free is exhausted',
    `consumedSource=${consume3.source}`
  );
  assert(
    consume3.freeRemaining === 0 && consume3.paidCredits === 9,
    'Balance after Eval #3: 0 free remaining, 9 paid credits remaining',
    `free=${consume3.freeRemaining}, paid=${consume3.paidCredits}`
  );

  console.log('\n--- 4. Testing Next Month Rollover: Free Do NOT Carry Forward, Paid NEVER Expire ---');
  // Simulate next month starting by manually setting free_evaluation_reset_month back
  db.prepare(`
    UPDATE student_profiles
    SET free_evaluation_reset_month = '2026-08', monthly_free_evaluations_used = 1
    WHERE user_id = ?
  `).run(testUserId);

  const newMonthProfile = ensureMonthlyFreeEvaluationsReset(testUserId);
  assert(
    newMonthProfile.monthlyFreeEvaluationsUsed === 0,
    'New month starts fresh with exactly 2 free evaluations (unused do not carry forward)',
    `used=${newMonthProfile.monthlyFreeEvaluationsUsed}`
  );
  assert(
    newMonthProfile.paidCredits === 9,
    'Paid credits (9) did NOT expire or reset in new month',
    `paidCredits=${newMonthProfile.paidCredits}`
  );

  console.log('\n--- 5. Testing Refund on Evaluation Failure ---');
  // Consume 1 free evaluation, then simulate refund
  const consumeForRefundFree = consumeEvaluationEntitlementAtomic({ userId: testUserId });
  assert(consumeForRefundFree.source === 'PERSONAL_FREE', 'Consumed 1 free for refund test');
  refundEvaluationCreditAtomic({ userId: testUserId, entitlementSource: 'PERSONAL_FREE' });
  const afterRefundFree = getStudentCreditDetailedSummary(testUserId);
  assert(
    afterRefundFree.freeEvaluationsRemaining === 2,
    'Free evaluation refunded back to 2/2 remaining upon evaluation failure',
    `freeRemaining=${afterRefundFree.freeEvaluationsRemaining}`
  );

  // Consume 1 paid credit (by exhausting free first)
  consumeEvaluationEntitlementAtomic({ userId: testUserId }); // free 1
  consumeEvaluationEntitlementAtomic({ userId: testUserId }); // free 2
  const consumePaidForRefund = consumeEvaluationEntitlementAtomic({ userId: testUserId }); // paid 1
  assert(consumePaidForRefund.source === 'PERSONAL_PURCHASED_CREDIT', 'Consumed 1 paid credit for refund test');
  assert(consumePaidForRefund.paidCredits === 8, 'Paid credits down to 8');
  refundEvaluationCreditAtomic({ userId: testUserId, entitlementSource: 'PERSONAL_PURCHASED_CREDIT' });
  const afterRefundPaid = getStudentCreditDetailedSummary(testUserId);
  assert(
    afterRefundPaid.paidCredits === 9,
    'Paid credit refunded back to 9 upon evaluation failure',
    `paidCredits=${afterRefundPaid.paidCredits}`
  );

  console.log('\n================================================================');
  console.log(`RESULTS: ${passedTests} OF ${totalTests} TESTS PASSED`);
  console.log('================================================================');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
