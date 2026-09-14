import {
  calculateThreeMonthsExpiry,
  recordCreditPurchase,
  getValidStudentCreditBalance,
  getStudentCreditStatus,
  consumeCreditFEFO,
  expireOverdueCreditLots,
} from '../services/studentCreditService.js';
import { db, initDatabase } from '../db.js';
import crypto from 'node:crypto';

// Initialize DB schema & migrations
initDatabase();

console.log('--- Starting Student Purchased Credit Validity Tests ---');

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

// 1. Test calculateThreeMonthsExpiry
console.log('\n--- 1. Testing Exact 3-Month Expiry Calculation ---');
{
  // User Prompt Example: Purchase completed on 8 September 2026 -> credits expire on 8 December 2026
  const sepDate = new Date(Date.UTC(2026, 8, 8, 10, 30, 0)); // Note: Month is 0-indexed, 8 is September
  const expSep = calculateThreeMonthsExpiry(sepDate);
  const expSepDate = new Date(expSep);
  assert(
    expSepDate.getUTCFullYear() === 2026 &&
    expSepDate.getUTCMonth() === 11 && // 11 is December
    expSepDate.getUTCDate() === 8,
    '8 September 2026 expires on exactly 8 December 2026'
  );

  // 31 May -> 31 August
  const mayDate = new Date(Date.UTC(2026, 4, 31, 12, 0, 0)); // Month 4 is May
  const expMay = calculateThreeMonthsExpiry(mayDate);
  const expMayDate = new Date(expMay);
  assert(
    expMayDate.getUTCFullYear() === 2026 &&
    expMayDate.getUTCMonth() === 7 && // 7 is August
    expMayDate.getUTCDate() === 31,
    '31 May 2026 expires on 31 August 2026'
  );

  // Month-end clamping: 30 November 2026 -> 28 February 2027 (non-leap year)
  const novDate = new Date(Date.UTC(2026, 10, 30, 15, 0, 0)); // 10 is November
  const expNov = calculateThreeMonthsExpiry(novDate);
  const expNovDate = new Date(expNov);
  assert(
    expNovDate.getUTCFullYear() === 2027 &&
    expNovDate.getUTCMonth() === 1 && // 1 is February
    expNovDate.getUTCDate() === 28,
    '30 November 2026 clamps to 28 February 2027 (non-leap year)'
  );

  // Leap year month-end clamping: 30 November 2023 -> 29 February 2024
  const leapNovDate = new Date(Date.UTC(2023, 10, 30, 15, 0, 0));
  const expLeapNov = calculateThreeMonthsExpiry(leapNovDate);
  const expLeapNovDate = new Date(expLeapNov);
  assert(
    expLeapNovDate.getUTCFullYear() === 2024 &&
    expLeapNovDate.getUTCMonth() === 1 && // February
    expLeapNovDate.getUTCDate() === 29,
    '30 November 2023 clamps to 29 February 2024 (leap year)'
  );
}

// 2. Test recordCreditPurchase & Expiry
console.log('\n--- 2. Testing Credit Lot Creation and Balance Calculation ---');
{
  const testUserId = `test_user_${crypto.randomBytes(4).toString('hex')}`;

  // Create mock student in database
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role)
    VALUES (?, ?, 'dummy_hash', 'Test Student Expiry', 'STUDENT')
  `).run(testUserId, `${testUserId}@example.com`);

  db.prepare(`
    INSERT OR IGNORE INTO student_profiles (user_id, icai_registration_number, purchased_credits, free_evaluations_used)
    VALUES (?, 'WRO123456', 0, 0)
  `).run(testUserId);

  // Initial balance should be 0
  const initialBalance = getValidStudentCreditBalance(testUserId);
  assert(initialBalance === 0, 'Initial credit balance is 0');

  // Record 10 credits purchased today
  const today = new Date();
  const lot1 = recordCreditPurchase({
    userId: testUserId,
    creditsPurchased: 10,
    orderId: 'ord_test_001',
    paymentId: 'pay_test_001',
    purchaseDate: today,
  });

  assert(lot1.creditsPurchased === 10, 'Lot 1 created with 10 credits');
  assert(lot1.creditsRemaining === 10, 'Lot 1 initial remaining is 10');
  assert(lot1.totalValidCredits === 10, 'Total valid balance is now 10');

  // Check balance via getValidStudentCreditBalance
  const balAfter1 = getValidStudentCreditBalance(testUserId);
  assert(balAfter1 === 10, 'getValidStudentCreditBalance returns 10 active credits');

  // Check cached student profile value
  const prof = db.prepare('SELECT purchased_credits FROM student_profiles WHERE user_id = ?').get(testUserId) as { purchased_credits: number };
  assert(prof.purchased_credits === 10, 'student_profiles.purchased_credits synchronized to 10');
}

// 3. Test Expiry Exclusion
console.log('\n--- 3. Testing Real-time Expiry Exclusion ---');
{
  const testUserId2 = `test_user_exp_${crypto.randomBytes(4).toString('hex')}`;

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role)
    VALUES (?, ?, 'dummy_hash', 'Test Student Expired Lot', 'STUDENT')
  `).run(testUserId2, `${testUserId2}@example.com`);

  db.prepare(`
    INSERT OR IGNORE INTO student_profiles (user_id, icai_registration_number, purchased_credits, free_evaluations_used)
    VALUES (?, 'WRO123456', 0, 0)
  `).run(testUserId2);

  // Insert an expired lot (e.g. purchased 4 months ago)
  const fourMonthsAgo = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  db.prepare(`
    INSERT INTO student_credit_purchases (
      id, user_id, order_id, payment_id, credits_purchased, credits_remaining,
      valid_from, expires_at, purchase_date, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
  `).run(
    `scp_expired_${crypto.randomBytes(4).toString('hex')}`,
    testUserId2,
    'ord_expired_1',
    'pay_expired_1',
    5,
    5,
    fourMonthsAgo.toISOString(),
    oneMonthAgo.toISOString(), // Expired 1 month ago
    fourMonthsAgo.toISOString()
  );

  // Also insert an active lot (purchased today, 8 credits)
  recordCreditPurchase({
    userId: testUserId2,
    creditsPurchased: 8,
    orderId: 'ord_active_1',
    paymentId: 'pay_active_1',
    purchaseDate: new Date(),
  });

  // Balance should be exactly 8, NOT 13!
  const bal = getValidStudentCreditBalance(testUserId2);
  assert(bal === 8, 'Expired lot of 5 credits is excluded from valid balance (only 8 valid credits counted)');

  // Verify status in DB
  const expiredLot = db.prepare("SELECT status, credits_remaining FROM student_credit_purchases WHERE order_id = 'ord_expired_1'").get() as { status: string; credits_remaining: number };
  assert(expiredLot.status === 'EXPIRED', 'Expired lot status is EXPIRED in database');
  assert(expiredLot.credits_remaining === 5, 'Unused credits remaining retained for historical auditing');
}

// 4. Test FEFO (First-Expiring, First-Out) Consumption
console.log('\n--- 4. Testing First-Expiring, First-Out (FEFO) Consumption ---');
{
  const testUserId3 = `test_user_fefo_${crypto.randomBytes(4).toString('hex')}`;

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role)
    VALUES (?, ?, 'dummy_hash', 'Test Student FEFO', 'STUDENT')
  `).run(testUserId3, `${testUserId3}@example.com`);

  db.prepare(`
    INSERT OR IGNORE INTO student_profiles (user_id, icai_registration_number, purchased_credits, free_evaluations_used)
    VALUES (?, 'WRO123456', 0, 0)
  `).run(testUserId3);

  // Lot A: expires in 10 days, 2 credits
  const lotAId = `scp_A_${crypto.randomBytes(4).toString('hex')}`;
  const expiryA = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO student_credit_purchases (
      id, user_id, order_id, payment_id, credits_purchased, credits_remaining,
      valid_from, expires_at, purchase_date, status
    ) VALUES (?, ?, 'ord_A', 'pay_A', 2, 2, ?, ?, ?, 'ACTIVE')
  `).run(lotAId, testUserId3, new Date().toISOString(), expiryA, new Date().toISOString());

  // Lot B: expires in 80 days, 5 credits
  const lotBId = `scp_B_${crypto.randomBytes(4).toString('hex')}`;
  const expiryB = new Date(Date.now() + 80 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO student_credit_purchases (
      id, user_id, order_id, payment_id, credits_purchased, credits_remaining,
      valid_from, expires_at, purchase_date, status
    ) VALUES (?, ?, 'ord_B', 'pay_B', 5, 5, ?, ?, ?, 'ACTIVE')
  `).run(lotBId, testUserId3, new Date().toISOString(), expiryB, new Date().toISOString());

  // Total balance = 2 + 5 = 7
  const initialFefoBal = getValidStudentCreditBalance(testUserId3);
  assert(initialFefoBal === 7, 'Initial balance for FEFO test is 7 credits');

  // First consumption: should consume from Lot A (earlier expiry)
  const eval1 = `eval_1_${crypto.randomBytes(4).toString('hex')}`;
  const res1 = consumeCreditFEFO(testUserId3, eval1);
  assert(res1.lotId === lotAId, 'Evaluation 1 consumed credit from Lot A (FEFO)');
  assert(res1.lotRemaining === 1, 'Lot A remaining is now 1');
  assert(res1.totalRemaining === 6, 'Total valid balance after 1st evaluation is 6');

  // Second consumption: should consume remaining credit from Lot A
  const eval2 = `eval_2_${crypto.randomBytes(4).toString('hex')}`;
  const res2 = consumeCreditFEFO(testUserId3, eval2);
  assert(res2.lotId === lotAId, 'Evaluation 2 consumed second credit from Lot A');
  assert(res2.lotRemaining === 0, 'Lot A remaining is now 0');
  assert(res2.totalRemaining === 5, 'Total valid balance after 2nd evaluation is 5');

  // Check Lot A status in DB: should be CONSUMED
  const lotARow = db.prepare('SELECT status, credits_remaining FROM student_credit_purchases WHERE id = ?').get(lotAId) as { status: string; credits_remaining: number };
  assert(lotARow.status === 'CONSUMED', 'Lot A marked as CONSUMED when remaining reaches 0');

  // Third consumption: Lot A is depleted, should now consume from Lot B
  const eval3 = `eval_3_${crypto.randomBytes(4).toString('hex')}`;
  const res3 = consumeCreditFEFO(testUserId3, eval3);
  assert(res3.lotId === lotBId, 'Evaluation 3 consumed from Lot B (next earliest expiry)');
  assert(res3.lotRemaining === 4, 'Lot B remaining is now 4');
  assert(res3.totalRemaining === 4, 'Total valid balance after 3rd evaluation is 4');
}

// 5. Test Status Reporting (expiring soon within 14 days)
console.log('\n--- 5. Testing Expiring Soon Breakdown ---');
{
  const testUserId4 = `test_user_stat_${crypto.randomBytes(4).toString('hex')}`;

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role)
    VALUES (?, ?, 'dummy_hash', 'Test Student Status', 'STUDENT')
  `).run(testUserId4, `${testUserId4}@example.com`);

  db.prepare(`
    INSERT OR IGNORE INTO student_profiles (user_id, icai_registration_number, purchased_credits, free_evaluations_used)
    VALUES (?, 'WRO123456', 0, 0)
  `).run(testUserId4);

  // Lot expiring in 5 days (expiring soon)
  const expirySoon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO student_credit_purchases (
      id, user_id, order_id, payment_id, credits_purchased, credits_remaining,
      valid_from, expires_at, purchase_date, status
    ) VALUES (?, ?, 'ord_soon', 'pay_soon', 3, 3, ?, ?, ?, 'ACTIVE')
  `).run(`scp_soon_${crypto.randomBytes(4).toString('hex')}`, testUserId4, new Date().toISOString(), expirySoon, new Date().toISOString());

  // Lot expiring in 60 days (not expiring soon)
  const expiryLater = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO student_credit_purchases (
      id, user_id, order_id, payment_id, credits_purchased, credits_remaining,
      valid_from, expires_at, purchase_date, status
    ) VALUES (?, ?, 'ord_later', 'pay_later', 10, 10, ?, ?, ?, 'ACTIVE')
  `).run(`scp_later_${crypto.randomBytes(4).toString('hex')}`, testUserId4, new Date().toISOString(), expiryLater, new Date().toISOString());

  const status = getStudentCreditStatus(testUserId4);
  assert(status.totalValidCredits === 13, 'Total valid credits is 13');
  assert(status.expiringSoonCredits === 3, 'Expiring soon credits detected as 3');
  assert(status.earliestExpiryDate === expirySoon, 'Earliest expiry date matches earliest active lot');
  assert(status.lots.length === 2, 'Two lots returned in status report');
}

console.log(`\n========================================`);
console.log(`Results: ${passedTests}/${totalTests} tests PASSED`);
console.log(`========================================`);

if (passedTests === totalTests) {
  console.log('ALL TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
} else {
  console.error('SOME TESTS FAILED.');
  process.exit(1);
}
