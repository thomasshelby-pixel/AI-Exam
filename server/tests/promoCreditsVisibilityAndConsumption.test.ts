import crypto from 'node:crypto';
import { db, initDatabase } from '../db.js';
import {
  consumeEvaluationEntitlementAtomic,
  refundEvaluationCreditAtomic,
  recordCreditPurchase,
  getValidStudentCreditBalance,
} from '../services/studentCreditService.js';
import { getStudentEntitlement } from '../auth.js';

initDatabase();

console.log('================================================================');
console.log('--- TESTING PROMO EVALUATION CREDITS VISIBILITY & CONSUMPTION ---');
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
  const testStudentId = `usr_promo_${crypto.randomBytes(4).toString('hex')}`;
  const testEmail = `${testStudentId}@example.com`;

  // 1. Create student account
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status, account_classification)
    VALUES (?, ?, 'dummy_hash', 'Promo Test Student', 'STUDENT', 'ACTIVE', 'NORMAL')
  `).run(testStudentId, testEmail);

  const testStudentCode = `ST-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  db.prepare(`
    INSERT INTO student_profiles (
      user_id,
      student_code,
      icai_registration_number,
      free_evaluations_used,
      monthly_free_evaluations_used,
      monthly_free_evaluations_limit,
      free_evaluation_reset_month,
      paid_credits,
      purchased_credits
    ) VALUES (?, ?, 'WRO777888', 0, 0, 2, '2026-10', 0, 0)
  `).run(testStudentId, testStudentCode);

  // Give the student 5 paid credits to test interaction between promo and paid credits
  recordCreditPurchase({
    userId: testStudentId,
    creditsPurchased: 5,
    orderId: 'order_paid_5',
    paymentId: 'pay_paid_5',
  });

  // Ensure AI30 campaign exists
  db.prepare(`
    INSERT OR REPLACE INTO referral_campaigns (
      code, campaign_name, description, benefit_type, benefit_duration_days,
      max_redemptions, max_evaluations, is_active, status, user_type
    ) VALUES (
      'AI30', 'AI30 Special Promo - 1 Month Free Access',
      'Special promotional launch offer with 15 free evaluations for 30 days.',
      '1_MONTH_FREE_ACCESS', 30, 20, 15, 1, 'ACTIVE', 'ALL'
    )
  `).run();

  // -------------------------------------------------------------------------
  // TEST A: Promo Grant (Redeem AI30)
  // -------------------------------------------------------------------------
  console.log('\n--- Test A: Promo grant (Redeem AI30) ---');
  const redemptionId = `red_ai30_${testStudentId}`;
  const expiryDate = new Date(Date.now() + 30 * 86400000).toISOString();

  db.prepare(`
    INSERT INTO referral_redemptions (
      id, referral_code, user_id, user_email, benefit_type,
      redemption_number, expiry_date, status,
      max_evaluations, evaluations_used, evaluations_remaining, audit_note,
      created_at, updated_at
    ) VALUES (?, 'AI30', ?, ?, '1_MONTH_FREE_ACCESS', 1, ?, 'ACTIVE', 15, 0, 15, 'Redemption #1 claimed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(redemptionId, testStudentId, testEmail, expiryDate);

  // Record promo grant in credit_ledger
  db.prepare(`
    INSERT INTO credit_ledger (id, student_id, amount, source, balance_after, note)
    VALUES (?, ?, 15, 'PROMO_GRANT_AI30', 15, 'Granted 15 promotional evaluations via promo code AI30')
  `).run(`cld_${crypto.randomBytes(6).toString('hex')}`, testStudentId);

  // Query student row as Admin Students Management query does
  const adminStudentQuery = `
    SELECT u.id, u.email, u.full_name, p.student_code, p.purchased_credits,
           COALESCE((
             SELECT SUM(r.max_evaluations)
             FROM referral_redemptions r
             WHERE r.user_id = u.id AND r.status = 'ACTIVE' AND datetime(r.expiry_date) > datetime('now')
           ), 0) as promo_evaluations_granted,
           COALESCE((
             SELECT SUM(r.evaluations_used)
             FROM referral_redemptions r
             WHERE r.user_id = u.id AND r.status = 'ACTIVE' AND datetime(r.expiry_date) > datetime('now')
           ), 0) as promo_evaluations_consumed,
           COALESCE((
             SELECT SUM(r.evaluations_remaining)
             FROM referral_redemptions r
             WHERE r.user_id = u.id AND r.status = 'ACTIVE' AND datetime(r.expiry_date) > datetime('now')
           ), 0) as promo_evaluations_remaining,
           (
             SELECT r.referral_code
             FROM referral_redemptions r
             WHERE r.user_id = u.id AND r.status = 'ACTIVE' AND datetime(r.expiry_date) > datetime('now')
             ORDER BY r.expiry_date DESC LIMIT 1
           ) as active_promo_code
    FROM users u
    LEFT JOIN student_profiles p ON p.user_id = u.id
    WHERE u.id = ?
  `;

  let adminStudent = db.prepare(adminStudentQuery).get(testStudentId) as any;
  assert(adminStudent.promo_evaluations_granted === 15, 'Admin sees 15 promo evaluations granted');
  assert(adminStudent.promo_evaluations_consumed === 0, 'Admin sees 0 promo evaluations consumed');
  assert(adminStudent.promo_evaluations_remaining === 15, 'Admin sees 15 promo evaluations remaining');
  assert(adminStudent.purchased_credits === 5, 'Paid credits strictly separated at 5');
  assert(adminStudent.active_promo_code === 'AI30', 'Active promo code identified as AI30');

  // Verify student entitlement identifies PROMOTIONAL_AI30 tier
  const studentEntitlement = getStudentEntitlement(testStudentId, 'PUBLIC');
  assert(studentEntitlement.tier === 'PROMOTIONAL_AI30', 'Student entitlement tier is PROMOTIONAL_AI30');
  assert(studentEntitlement.canEvaluate === true, 'Student can evaluate');
  assert(studentEntitlement.referralEvaluationsRemaining === 15, 'Student has 15 promotional evaluations remaining');

  // -------------------------------------------------------------------------
  // TEST B: First Consumption (15 -> 14)
  // -------------------------------------------------------------------------
  console.log('\n--- Test B: First consumption (15 -> 14) ---');
  const evalId1 = `eval_${crypto.randomBytes(6).toString('hex')}`;
  db.prepare(`
    INSERT INTO evaluations (id, student_id, level, material_type, subject_key, subject_name, original_filename, status, created_at)
    VALUES (?, ?, 'INTERMEDIATE', 'SUGGESTED_ANSWERS', 'ADV_ACC', 'Advanced Accounting', 'test.pdf', 'PROCESSING', CURRENT_TIMESTAMP)
  `).run(evalId1, testStudentId);

  const consumeRes1 = consumeEvaluationEntitlementAtomic({
    userId: testStudentId,
    evaluationId: evalId1,
  });

  assert(consumeRes1.source === 'PROMO', 'Deduction source is PROMO');
  assert(consumeRes1.promoRemaining === 14, 'Promo remaining decremented to 14');
  assert(consumeRes1.paidCredits === 5, 'Paid credits remained untouched at 5');

  adminStudent = db.prepare(adminStudentQuery).get(testStudentId) as any;
  assert(adminStudent.promo_evaluations_consumed === 1, 'Admin sees 1 promo evaluation consumed');
  assert(adminStudent.promo_evaluations_remaining === 14, 'Admin sees 14 promo evaluations remaining');

  // -------------------------------------------------------------------------
  // TEST C: Repeated Consumption (14 -> 13)
  // -------------------------------------------------------------------------
  console.log('\n--- Test C: Repeated consumption (14 -> 13) ---');
  const evalId2 = `eval_${crypto.randomBytes(6).toString('hex')}`;
  db.prepare(`
    INSERT INTO evaluations (id, student_id, level, material_type, subject_key, subject_name, original_filename, status, created_at)
    VALUES (?, ?, 'INTERMEDIATE', 'SUGGESTED_ANSWERS', 'TAX', 'Taxation', 'test2.pdf', 'PROCESSING', CURRENT_TIMESTAMP)
  `).run(evalId2, testStudentId);

  const consumeRes2 = consumeEvaluationEntitlementAtomic({
    userId: testStudentId,
    evaluationId: evalId2,
  });

  assert(consumeRes2.source === 'PROMO', 'Second deduction source is PROMO');
  assert(consumeRes2.promoRemaining === 13, 'Promo remaining decremented to 13');
  assert(consumeRes2.paidCredits === 5, 'Paid credits remained untouched at 5');

  adminStudent = db.prepare(adminStudentQuery).get(testStudentId) as any;
  assert(adminStudent.promo_evaluations_consumed === 2, 'Admin sees 2 promo evaluations consumed');
  assert(adminStudent.promo_evaluations_remaining === 13, 'Admin sees 13 promo evaluations remaining');

  // -------------------------------------------------------------------------
  // TEST D: Duplicate Request (Idempotency Guard)
  // -------------------------------------------------------------------------
  console.log('\n--- Test D: Duplicate request (Retry with evalId2) ---');
  const retryRes = consumeEvaluationEntitlementAtomic({
    userId: testStudentId,
    evaluationId: evalId2, // Same evaluation ID
  });

  assert(retryRes.source === 'PROMO', 'Duplicate call returns PROMO source');
  assert(retryRes.promoRemaining === 13, 'Duplicate call does not deduct again; remaining stays 13');

  adminStudent = db.prepare(adminStudentQuery).get(testStudentId) as any;
  assert(adminStudent.promo_evaluations_consumed === 2, 'Consumed count strictly remains 2');
  assert(adminStudent.promo_evaluations_remaining === 13, 'Remaining balance strictly remains 13');

  // Check ledger count for evalId2
  const ledgerEntries = db.prepare(`
    SELECT COUNT(*) as count FROM credit_ledger WHERE student_id = ? AND evaluation_id = ? AND amount < 0
  `).get(testStudentId, evalId2) as { count: number };
  assert(ledgerEntries.count === 1, 'Only 1 ledger deduction entry exists for evalId2');

  // -------------------------------------------------------------------------
  // TEST E: Refresh & Restart Simulation
  // -------------------------------------------------------------------------
  console.log('\n--- Test E: Persistence after restart simulation ---');
  // Re-read directly from database
  const freshDbStudent = db.prepare(adminStudentQuery).get(testStudentId) as any;
  assert(freshDbStudent.promo_evaluations_remaining === 13, 'Authoritative database persists 13 evaluations remaining');
  assert(freshDbStudent.promo_evaluations_consumed === 2, 'Authoritative database persists 2 evaluations consumed');
  assert(freshDbStudent.promo_evaluations_granted === 15, 'Authoritative database persists 15 evaluations granted');

  // -------------------------------------------------------------------------
  // TEST F: Paid and Promotional Credits Independence
  // -------------------------------------------------------------------------
  console.log('\n--- Test F: Paid and promotional credits independence ---');
  const validPaidBalance = getValidStudentCreditBalance(testStudentId);
  assert(validPaidBalance === 5, 'Valid paid credit lots balance is strictly 5');
  assert(freshDbStudent.purchased_credits === 5, 'Student profile purchased_credits is strictly 5');

  // -------------------------------------------------------------------------
  // TEST G: Permanent Free Access
  // -------------------------------------------------------------------------
  console.log('\n--- Test G: Permanent Free Access handling ---');
  const permFreeStudentId = `usr_perm_${crypto.randomBytes(4).toString('hex')}`;
  const permFreeEmail = `${permFreeStudentId}@example.com`;

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status, account_classification)
    VALUES (?, ?, 'dummy_hash', 'Perm Free Student', 'STUDENT', 'ACTIVE', 'NORMAL')
  `).run(permFreeStudentId, permFreeEmail);

  db.prepare(`
    INSERT INTO permanent_free_entitlements (id, email, reason, is_active, created_at)
    VALUES (?, ?, 'Scholarship Grant', 1, CURRENT_TIMESTAMP)
  `).run(`pfe_${crypto.randomBytes(4).toString('hex')}`, permFreeEmail);

  db.prepare(`
    INSERT INTO student_profiles (user_id, icai_registration_number, free_evaluations_used, monthly_free_evaluations_used, purchased_credits)
    VALUES (?, 'WRO111222', 0, 0, 0)
  `).run(permFreeStudentId);

  const permEntitlement = getStudentEntitlement(permFreeStudentId, 'PUBLIC');
  assert(permEntitlement.hasPermanentFreeAccess === true, 'Permanent Free entitlement active');
  assert(permEntitlement.tier === 'PERMANENT_FREE', 'Tier is PERMANENT_FREE');

  // Verify Admin query recognizes permanent_free_active
  const permAdmin = db.prepare(`
    SELECT u.id, pfe.is_active as permanent_free_active
    FROM users u
    LEFT JOIN permanent_free_entitlements pfe ON lower(pfe.email) = lower(u.email) AND pfe.is_active = 1
    WHERE u.id = ?
  `).get(permFreeStudentId) as any;
  assert(permAdmin.permanent_free_active === 1, 'Admin query detects permanent_free_active = 1');

  // -------------------------------------------------------------------------
  // TEST H: Revoke and Reclaim Lifecycle
  // -------------------------------------------------------------------------
  console.log('\n--- Test H: Revoke and reclaim lifecycle ---');
  // Revoke testStudentId's promo
  const revokedAt = new Date().toISOString();
  db.prepare(`
    UPDATE referral_redemptions
    SET status = 'REVOKED',
        evaluations_remaining = 0,
        revoked_at = ?,
        revoked_by = 'admin@test.com',
        revocation_reason = 'Test revocation',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(revokedAt, redemptionId);

  let revokedAdmin = db.prepare(adminStudentQuery).get(testStudentId) as any;
  assert(revokedAdmin.promo_evaluations_remaining === 0, 'After revoke: remaining is 0');

  // Entitlement after revoke should fall through to monthly free / paid credits (NOT promo)
  const revokedEntitlement = getStudentEntitlement(testStudentId, 'PUBLIC');
  assert(revokedEntitlement.tier !== 'PROMOTIONAL_AI30', 'Tier is no longer PROMOTIONAL_AI30');
  assert(revokedEntitlement.tier === 'FREE_TIER' || revokedEntitlement.tier === 'PURCHASED_CREDITS', 'Tier falls back cleanly');

  // Now Reinstate / Reclaim: Must restore MAX(0, max_evaluations - evaluations_used) = 15 - 2 = 13
  // Must NOT grant fresh 15!
  const redRow = db.prepare('SELECT * FROM referral_redemptions WHERE id = ?').get(redemptionId) as any;
  const legitimateRestored = Math.max(0, redRow.max_evaluations - redRow.evaluations_used);
  assert(legitimateRestored === 13, 'Legitimate restored entitlement is 13 (NOT 15)');

  db.prepare(`
    UPDATE referral_redemptions
    SET status = 'ACTIVE',
        evaluations_remaining = ?,
        revoked_at = NULL,
        revoked_by = NULL,
        revocation_reason = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(legitimateRestored, redemptionId);

  let reinstatedAdmin = db.prepare(adminStudentQuery).get(testStudentId) as any;
  assert(reinstatedAdmin.promo_evaluations_remaining === 13, 'After reinstate: remaining is exactly 13');
  assert(reinstatedAdmin.promo_evaluations_consumed === 2, 'Consumed remains 2');

  // -------------------------------------------------------------------------
  // TEST I: Failure Refund
  // -------------------------------------------------------------------------
  console.log('\n--- Test I: Evaluation failure refund ---');
  // Consume a 3rd evaluation (13 -> 12)
  const evalId3 = `eval_${crypto.randomBytes(6).toString('hex')}`;
  db.prepare(`
    INSERT INTO evaluations (id, student_id, level, material_type, subject_key, subject_name, original_filename, status, created_at)
    VALUES (?, ?, 'INTERMEDIATE', 'SUGGESTED_ANSWERS', 'AUD', 'Auditing', 'test3.pdf', 'PROCESSING', CURRENT_TIMESTAMP)
  `).run(evalId3, testStudentId);

  const consumeRes3 = consumeEvaluationEntitlementAtomic({
    userId: testStudentId,
    evaluationId: evalId3,
  });
  assert(consumeRes3.promoRemaining === 12, 'Promo remaining decremented to 12');

  // Simulate fatal failure during background processing -> refund
  refundEvaluationCreditAtomic({
    userId: testStudentId,
    evaluationId: evalId3,
    entitlementSource: 'PROMO',
  });

  const refundedAdmin = db.prepare(adminStudentQuery).get(testStudentId) as any;
  assert(refundedAdmin.promo_evaluations_remaining === 13, 'After refund: remaining restored back to 13');
  assert(refundedAdmin.promo_evaluations_consumed === 2, 'After refund: consumed restored back to 2');

  // Idempotent retry of refund -> no duplicate refund
  refundEvaluationCreditAtomic({
    userId: testStudentId,
    evaluationId: evalId3,
    entitlementSource: 'PROMO',
  });
  const idempotentRefundAdmin = db.prepare(adminStudentQuery).get(testStudentId) as any;
  assert(idempotentRefundAdmin.promo_evaluations_remaining === 13, 'Idempotent refund does not increment balance again; stays 13');

  // -------------------------------------------------------------------------
  // Cleanup test data
  // -------------------------------------------------------------------------
  db.prepare('DELETE FROM evaluations WHERE student_id = ?').run(testStudentId);
  db.prepare('DELETE FROM credit_ledger WHERE student_id = ?').run(testStudentId);
  db.prepare('DELETE FROM student_credit_purchases WHERE user_id = ?').run(testStudentId);
  db.prepare('DELETE FROM referral_redemptions WHERE user_id = ?').run(testStudentId);
  db.prepare('DELETE FROM student_profiles WHERE user_id = ?').run(testStudentId);
  db.prepare('DELETE FROM users WHERE id = ?').run(testStudentId);

  db.prepare('DELETE FROM permanent_free_entitlements WHERE id = ?').run(permAdmin.id);
  db.prepare('DELETE FROM student_profiles WHERE user_id = ?').run(permFreeStudentId);
  db.prepare('DELETE FROM users WHERE id = ?').run(permFreeStudentId);

  console.log('\n================================================================');
  console.log(`RESULTS: ${passedTests} / ${totalTests} tests passed`);
  console.log('================================================================');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
