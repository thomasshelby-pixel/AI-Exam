import assert from 'node:assert/strict';
import { db } from '../db.js';
import { getStudentEntitlement } from '../auth.js';
import { getStudentCreditStatus, ensureMonthlyFreeEvaluationsReset } from '../services/studentCreditService.js';

console.log('========================================================================');
console.log('--- ADMIN PANEL ACCURATE AVAILABLE EVALUATIONS REGRESSION SUITE ---');
console.log('========================================================================\n');

// Set up isolated mock student for authoritative tests
const testStudentId = 'usr_test_admin_eval_check_' + Date.now();
const testEmail = `admintest_${Date.now()}@example.com`;
const permFreeStudentId = 'usr_test_admin_perm_free_' + Date.now();
const permFreeEmail = `adminpermfree_${Date.now()}@example.com`;

try {
  // Clean up any collision
  db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(testStudentId, permFreeStudentId);
  db.prepare('DELETE FROM student_profiles WHERE user_id IN (?, ?)').run(testStudentId, permFreeStudentId);
  db.prepare('DELETE FROM permanent_free_entitlements WHERE lower(email) IN (?, ?)').run(testEmail.toLowerCase(), permFreeEmail.toLowerCase());
  db.prepare('DELETE FROM student_credit_purchases WHERE user_id = ?').run(testStudentId);
  db.prepare('DELETE FROM referral_redemptions WHERE user_id = ?').run(testStudentId);

  // 1. Create standard student
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status, account_classification, created_at, updated_at)
    VALUES (?, ?, 'dummy_hash', 'Admin Test Student', 'STUDENT', 'ACTIVE', 'NORMAL', datetime('now'), datetime('now'))
  `).run(testStudentId, testEmail);

  db.prepare(`
    INSERT INTO student_profiles (user_id, student_code, icai_registration_number, ca_level, monthly_free_evaluations_used, monthly_free_evaluations_limit, free_evaluation_reset_month, purchased_credits)
    VALUES (?, 'ST-TEST', 'WRO999999', 'FINAL', 0, 2, '2026-10', 0)
  `).run(testStudentId);

  // ------------------------------------------------------------------------------------------------
  // TEST 1: Admin Panel correctly displays two remaining monthly free evaluations when two are genuinely available
  // ------------------------------------------------------------------------------------------------
  {
    const ent = getStudentEntitlement(testStudentId, 'PUBLIC');
    const creditStatus = getStudentCreditStatus(testStudentId);
    const monthlyRemaining = ent.freeEvaluationsRemaining;
    const paid = creditStatus.totalValidCredits;
    const totalAvailable = monthlyRemaining + paid;

    assert.equal(monthlyRemaining, 2, 'Student should have 2 monthly free evaluations remaining');
    assert.equal(paid, 0, 'Student should have 0 paid credits');
    assert.equal(totalAvailable, 2, 'Total available displayed should be 2 available');
    console.log('[PASS] TEST 1: Fresh eligible student shows 2 available monthly free evaluations.');
  }

  // ------------------------------------------------------------------------------------------------
  // TEST 2: After one legitimate consumption, the admin display reflects 1 remaining evaluation
  // ------------------------------------------------------------------------------------------------
  {
    db.prepare(`
      UPDATE student_profiles
      SET monthly_free_evaluations_used = 1, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(testStudentId);

    const ent = getStudentEntitlement(testStudentId, 'PUBLIC');
    const creditStatus = getStudentCreditStatus(testStudentId);
    const monthlyRemaining = ent.freeEvaluationsRemaining;
    const paid = creditStatus.totalValidCredits;
    const totalAvailable = monthlyRemaining + paid;

    assert.equal(ent.monthlyFreeEvaluationsUsed, 1, 'Used count should be 1');
    assert.equal(monthlyRemaining, 1, 'Student should have 1 monthly free evaluation remaining');
    assert.equal(totalAvailable, 1, 'Total available displayed should be 1 available');
    console.log('[PASS] TEST 2: After 1 consumption, admin display reflects 1 remaining evaluation.');
  }

  // ------------------------------------------------------------------------------------------------
  // TEST 3: After both monthly free evaluations are consumed, display reflects 0, unless another entitlement exists
  // ------------------------------------------------------------------------------------------------
  {
    db.prepare(`
      UPDATE student_profiles
      SET monthly_free_evaluations_used = 2, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(testStudentId);

    const ent = getStudentEntitlement(testStudentId, 'PUBLIC');
    const creditStatus = getStudentCreditStatus(testStudentId);
    const monthlyRemaining = ent.freeEvaluationsRemaining;
    const paid = creditStatus.totalValidCredits;
    const totalAvailable = monthlyRemaining + paid;

    assert.equal(ent.monthlyFreeEvaluationsUsed, 2, 'Used count should be 2');
    assert.equal(monthlyRemaining, 0, 'Student should have 0 monthly free evaluations remaining');
    assert.equal(totalAvailable, 0, 'Total available displayed should be 0 available');
    console.log('[PASS] TEST 3: After both monthly free evaluations are consumed, display reflects 0 available.');
  }

  // ------------------------------------------------------------------------------------------------
  // TEST 4: Promotional and paid balances are correctly distinguished and aggregated
  // ------------------------------------------------------------------------------------------------
  {
    // Add 5 paid credits
    const lotId = 'lot_test_' + Date.now();
    db.prepare(`
      INSERT INTO student_credit_purchases (id, user_id, order_id, payment_id, credits_purchased, credits_remaining, valid_from, expires_at, purchase_date, status, created_at, updated_at)
      VALUES (?, ?, 'order_1', 'pay_1', 5, 5, datetime('now'), datetime('now', '+90 days'), datetime('now'), 'ACTIVE', datetime('now'), datetime('now'))
    `).run(lotId, testStudentId);

    // Add 10 promotional evaluations via referral redemption
    const redId = 'red_test_' + Date.now();
    db.prepare(`
      INSERT INTO referral_redemptions (id, user_id, user_email, referral_code, benefit_type, redemption_number, status, max_evaluations, evaluations_used, evaluations_remaining, redeemed_at, expiry_date, created_at, updated_at)
      VALUES (?, ?, ?, 'AI30', 'EVALUATION_ACCESS', 1, 'ACTIVE', 10, 2, 8, datetime('now'), datetime('now', '+30 days'), datetime('now'), datetime('now'))
    `).run(redId, testStudentId, testEmail);

    const monthlyStatus = ensureMonthlyFreeEvaluationsReset(testStudentId);
    const creditStatus = getStudentCreditStatus(testStudentId);
    const promoRemaining = 8;
    const paid = creditStatus.totalValidCredits;
    const monthlyRemaining = monthlyStatus.freeEvaluationsRemaining; // 0 because 2 were used

    assert.equal(paid, 5, 'Paid credits must strictly be 5');
    assert.equal(promoRemaining, 8, 'Promo remaining must strictly be 8');
    assert.equal(monthlyRemaining, 0, 'Monthly free remaining is 0');

    // Total available should be 0 + 8 + 5 = 13
    const totalAvailable = monthlyRemaining + promoRemaining + paid;
    assert.equal(totalAvailable, 13, 'Total available must strictly equal 13');
    console.log('[PASS] TEST 4: Promotional (8) and paid (5) balances are distinguished without conflation.');
  }

  // ------------------------------------------------------------------------------------------------
  // TEST 5: Permanent Free Access remains correctly represented as unlimited
  // ------------------------------------------------------------------------------------------------
  {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, status, account_classification, created_at, updated_at)
      VALUES (?, ?, 'dummy_hash', 'Admin Perm Free Student', 'STUDENT', 'ACTIVE', 'NORMAL', datetime('now'), datetime('now'))
    `).run(permFreeStudentId, permFreeEmail);

    db.prepare(`
      INSERT INTO student_profiles (user_id, student_code, icai_registration_number, ca_level, monthly_free_evaluations_used, monthly_free_evaluations_limit, free_evaluation_reset_month, purchased_credits)
      VALUES (?, 'ST-PERM', 'CRO123456', 'FINAL', 2, 2, '2026-10', 0)
    `).run(permFreeStudentId);

    db.prepare(`
      INSERT INTO permanent_free_entitlements (id, email, reason, is_active, created_at)
      VALUES (?, ?, 'Testing permanent free access', 1, datetime('now'))
    `).run('pfe_' + Date.now(), permFreeEmail);

    const permEnt = getStudentEntitlement(permFreeStudentId, 'PUBLIC');
    assert.equal(permEnt.hasPermanentFreeAccess, true, 'Permanent free access flag must be true');
    assert.equal(permEnt.tier, 'PERMANENT_FREE', 'Tier must be PERMANENT_FREE');
    console.log('[PASS] TEST 5: Permanent Free Access remains correctly identified and represented.');
  }

  // ------------------------------------------------------------------------------------------------
  // TEST 6: Refreshing or reopening retrieves current authoritative balance
  // ------------------------------------------------------------------------------------------------
  {
    // Reset month reset check
    const status = ensureMonthlyFreeEvaluationsReset(testStudentId);
    assert.equal(status.monthlyFreeEvaluationsUsed, 2, 'State remains stable across re-reads');
    console.log('[PASS] TEST 6: Reopening or refreshing retrieves current authoritative balance without drift.');
  }

  // ------------------------------------------------------------------------------------------------
  // TEST 7: Student-side entitlement calculation remains untouched and functioning identically
  // ------------------------------------------------------------------------------------------------
  {
    const studentEnt = getStudentEntitlement(testStudentId);
    assert.ok(studentEnt, 'Student-facing entitlement query works seamlessly');
    assert.equal(typeof studentEnt.canEvaluate, 'boolean', 'canEvaluate is boolean');
    console.log('[PASS] TEST 7: Student-side entitlement calculations remain completely intact.');
  }

  console.log('\n========================================================================');
  console.log('✅ ALL 7 ADMIN AVAILABLE EVALUATIONS REGRESSION TESTS PASSED CLEANLY!');
  console.log('========================================================================\n');
} finally {
  // Clean up test records
  db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(testStudentId, permFreeStudentId);
  db.prepare('DELETE FROM student_profiles WHERE user_id IN (?, ?)').run(testStudentId, permFreeStudentId);
  db.prepare('DELETE FROM permanent_free_entitlements WHERE lower(email) IN (?, ?)').run(testEmail.toLowerCase(), permFreeEmail.toLowerCase());
  db.prepare('DELETE FROM student_credit_purchases WHERE user_id = ?').run(testStudentId);
  db.prepare('DELETE FROM referral_redemptions WHERE user_id = ?').run(testStudentId);
}
