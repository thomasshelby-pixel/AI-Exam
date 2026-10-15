import assert from 'node:assert';
import crypto from 'node:crypto';
import { db, initDatabase, hashPassword, verifyPassword } from '../db.js';
import {
  initRegistrationOtpTable,
  generateCryptographicOtp,
  hashOtp,
  initiateStudentRegistrationOtp,
  verifyAndConsumeRegistrationOtp,
  maskEmail,
} from '../services/studentRegistrationOtpService.js';
import { closeFirestoreCleanly } from '../services/firestoreDbService.js';

async function runStudentRegistrationOtpTestSuite() {
  console.log('========================================================================');
  console.log('--- STUDENT REGISTRATION EMAIL OTP VERIFICATION TEST SUITE ---');
  console.log('========================================================================');

  initDatabase();
  initRegistrationOtpTable();

  // Test 1: Masking helper
  console.log('\n>>> [TEST 1] Testing email masking utility...');
  assert.strictEqual(maskEmail('rahul.sharma@gmail.com'), 'r***a@gmail.com');
  assert.strictEqual(maskEmail('ca.student@yahoo.co.in'), 'c***t@yahoo.co.in');
  console.log('✓ [PASS] Test 1: Email masking correctly preserves privacy without exposing full address.');

  // Test 2: Cryptographic OTP generation properties
  console.log('\n>>> [TEST 2] Testing cryptographic OTP generator...');
  const otps = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const code = generateCryptographicOtp();
    assert.strictEqual(code.length, 6, 'OTP must be exactly 6 digits');
    assert.match(code, /^\d{6}$/, 'OTP must be all numeric digits');
    otps.add(code);
  }
  assert.ok(otps.size >= 45, 'Random OTPs must show strong cryptographic entropy and high uniqueness');
  console.log('✓ [PASS] Test 2: Cryptographic random generator produces well-formed 6-digit codes with high entropy.');

  // Test 3: Password hashing and salted OTP hashing
  console.log('\n>>> [TEST 3] Testing salted OTP hashing...');
  const salt = crypto.randomBytes(16).toString('hex');
  const code = '492815';
  const hashed = hashOtp(code, salt);
  assert.strictEqual(hashed, hashOtp('492815', salt));
  assert.notStrictEqual(hashed, hashOtp('492816', salt));
  console.log('✓ [PASS] Test 3: OTP hashing with salt operates deterministically and safely.');

  // Test 4: Full initiation and successful OTP verification & account creation
  console.log('\n>>> [TEST 4] Testing initiation and verification of new student account...');
  const testEmail1 = `otp_test_${Date.now()}@example.com`;
  const plainPassword = 'StrongPassword123!';
  const passHash = hashPassword(plainPassword);

  const initResult = await initiateStudentRegistrationOtp({
    email: testEmail1,
    fullName: 'Test Student One',
    passwordHash: passHash,
    phone: '+919876543210',
    icaiRegistrationNumber: 'WRO1234567',
    caLevel: 'FINAL',
    referralCode: null,
    clientIp: '127.0.0.1',
  });

  assert.strictEqual(initResult.success, true, 'Initiation must succeed');
  assert.ok(initResult.emailMasked, 'Must provide masked email');
  assert.strictEqual(initResult.cooldownSeconds, 60);

  // Verify challenge was recorded in student_registration_otps with hashed OTP
  const challengeRow = db.prepare('SELECT * FROM student_registration_otps WHERE email = ?').get(testEmail1) as any;
  assert.ok(challengeRow, 'Challenge row must exist in DB');
  assert.ok(challengeRow.otp_hash, 'Must store hash, not raw OTP');
  assert.notStrictEqual(challengeRow.otp_hash.length, 6, 'Stored value must be a secure hash, never raw 6-digit OTP');

  // Verify raw OTP is not in payload JSON
  assert.strictEqual(challengeRow.payload_json.includes('otp_code'), false);

  // Retrieve matching OTP code by testing hash candidate (or generating deterministic test code)
  // Let's verify that incorrect OTP is rejected first
  console.log('\n>>> [TEST 5] Testing incorrect OTP rejection and attempt decrement...');
  const wrongAttempt = verifyAndConsumeRegistrationOtp(testEmail1, '000000');
  assert.strictEqual(wrongAttempt.success, false);
  assert.strictEqual(wrongAttempt.code, 'INVALID_OTP');
  assert.strictEqual(wrongAttempt.attemptsRemaining, 4);

  const rowAfterWrong = db.prepare('SELECT attempts_count FROM student_registration_otps WHERE email = ?').get(testEmail1) as any;
  assert.strictEqual(rowAfterWrong.attempts_count, 1, 'Attempts count incremented');
  console.log('✓ [PASS] Test 5: Incorrect OTP rejected and attempts remaining updated.');

  // Find the valid OTP for this test by computing the matching salt (or generating known code challenge)
  // Let's create a controlled test challenge with known code '654321'
  console.log('\n>>> [TEST 6] Testing single-use atomic consumption of OTP and account creation...');
  const testEmail2 = `otp_verified_${Date.now()}@example.com`;
  const knownOtp = '654321';
  const knownSalt = crypto.randomBytes(16).toString('hex');
  const knownHash = hashOtp(knownOtp, knownSalt);

  db.prepare(`
    INSERT INTO student_registration_otps (
      email, otp_hash, otp_salt, payload_json, attempts_count, max_attempts,
      created_at, expires_at, resend_available_at, last_ip
    ) VALUES (?, ?, ?, ?, 0, 5, datetime('now'), datetime('now', '+10 minutes'), datetime('now', '+60 seconds'), '127.0.0.1')
  `).run(
    testEmail2,
    knownHash,
    knownSalt,
    JSON.stringify({
      email: testEmail2,
      fullName: 'Verified Student',
      passwordHash: hashPassword('VerifiedPass123!'),
      phone: '+919988776655',
      icaiRegistrationNumber: 'CRO0987654',
      caLevel: 'INTERMEDIATE',
      referralCode: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      resendAvailableAt: new Date(Date.now() + 60000).toISOString(),
      attemptsCount: 0,
      maxAttempts: 5,
    })
  );

  const verifySuccess = verifyAndConsumeRegistrationOtp(testEmail2, knownOtp);
  assert.strictEqual(verifySuccess.success, true);
  assert.ok(verifySuccess.registrationData);
  assert.strictEqual(verifySuccess.registrationData.email, testEmail2);

  // Test 7: Verify OTP cannot be reused (row was consumed immediately)
  console.log('\n>>> [TEST 7] Testing OTP cannot be reused...');
  const reuseAttempt = verifyAndConsumeRegistrationOtp(testEmail2, knownOtp);
  assert.strictEqual(reuseAttempt.success, false);
  assert.strictEqual(reuseAttempt.code, 'NOT_FOUND');
  console.log('✓ [PASS] Test 7: Consumed OTP cannot be reused.');

  // Test 8: Expired OTP is rejected
  console.log('\n>>> [TEST 8] Testing expired OTP rejection...');
  const testEmailExpired = `otp_expired_${Date.now()}@example.com`;
  db.prepare(`
    INSERT INTO student_registration_otps (
      email, otp_hash, otp_salt, payload_json, attempts_count, max_attempts,
      created_at, expires_at, resend_available_at, last_ip
    ) VALUES (?, ?, ?, ?, 0, 5, datetime('now', '-15 minutes'), datetime('now', '-5 minutes'), datetime('now', '-14 minutes'), '127.0.0.1')
  `).run(
    testEmailExpired,
    knownHash,
    knownSalt,
    JSON.stringify({
      email: testEmailExpired,
      fullName: 'Expired Student',
      passwordHash: hashPassword('Pass123!'),
      icaiRegistrationNumber: 'NRO1122334',
      caLevel: 'FOUNDATION',
    })
  );

  const expiredAttempt = verifyAndConsumeRegistrationOtp(testEmailExpired, knownOtp);
  assert.strictEqual(expiredAttempt.success, false);
  assert.strictEqual(expiredAttempt.code, 'EXPIRED_OTP');
  console.log('✓ [PASS] Test 8: Expired OTP is rejected securely.');

  // Test 9: Max attempts exceeded
  console.log('\n>>> [TEST 9] Testing max attempts exceeded (limit 5)...');
  const testEmailMax = `otp_max_${Date.now()}@example.com`;
  db.prepare(`
    INSERT INTO student_registration_otps (
      email, otp_hash, otp_salt, payload_json, attempts_count, max_attempts,
      created_at, expires_at, resend_available_at, last_ip
    ) VALUES (?, ?, ?, ?, 4, 5, datetime('now'), datetime('now', '+10 minutes'), datetime('now', '+60 seconds'), '127.0.0.1')
  `).run(
    testEmailMax,
    knownHash,
    knownSalt,
    JSON.stringify({
      email: testEmailMax,
      fullName: 'Max Attempts Student',
      passwordHash: hashPassword('Pass123!'),
      icaiRegistrationNumber: 'SRO5566778',
      caLevel: 'INTERMEDIATE',
    })
  );

  const finalFail = verifyAndConsumeRegistrationOtp(testEmailMax, '111111');
  assert.strictEqual(finalFail.success, false);
  assert.strictEqual(finalFail.code, 'MAX_ATTEMPTS_EXCEEDED');
  assert.strictEqual(finalFail.attemptsRemaining, 0);

  // Row should now be invalidated / removed
  const rowAfterMax = db.prepare('SELECT email FROM student_registration_otps WHERE email = ?').get(testEmailMax);
  assert.strictEqual(rowAfterMax, undefined);
  console.log('✓ [PASS] Test 9: Reaching 5 failed attempts completely invalidates challenge.');

  // Test 10: Resend cooldown enforcement (60 seconds)
  console.log('\n>>> [TEST 10] Testing resend cooldown enforcement (60 seconds)...');
  const cooldownEmail = `otp_cooldown_${Date.now()}@example.com`;
  const firstInit = await initiateStudentRegistrationOtp({
    email: cooldownEmail,
    fullName: 'Cooldown Student',
    passwordHash: passHash,
    icaiRegistrationNumber: 'WRO9988776',
    caLevel: 'FINAL',
    clientIp: '127.0.0.1',
  });
  assert.strictEqual(firstInit.success, true);

  // Immediate retry should be blocked by cooldown
  const secondInit = await initiateStudentRegistrationOtp({
    email: cooldownEmail,
    fullName: 'Cooldown Student',
    passwordHash: passHash,
    icaiRegistrationNumber: 'WRO9988776',
    caLevel: 'FINAL',
    clientIp: '127.0.0.1',
  });
  assert.strictEqual(secondInit.success, false);
  assert.ok(secondInit.cooldownSeconds && secondInit.cooldownSeconds > 0, 'Cooldown must be enforced');
  assert.ok(secondInit.message.includes('Please wait'));
  console.log(`✓ [PASS] Test 10: Resend cooldown enforced (${secondInit.cooldownSeconds}s remaining).`);

  // Test 11: Pre-existing accounts remain verified and do NOT require OTP for login
  console.log('\n>>> [TEST 11] Verifying pre-existing accounts backward compatibility...');
  const preExistingStudent = db.prepare(`
    SELECT id, email, role, status, email_verified
    FROM users
    WHERE role = 'STUDENT' AND email NOT LIKE 'otp_%'
    LIMIT 1
  `).get() as any;

  if (preExistingStudent) {
    assert.strictEqual(preExistingStudent.email_verified, 1, 'Pre-existing student must be marked verified by migration');
    assert.strictEqual(preExistingStudent.status, 'ACTIVE');
    console.log(`✓ [PASS] Pre-existing student account ${preExistingStudent.email} is verified=1 and fully active.`);
  }

  // Pre-existing Super Admin
  const superAdmin = db.prepare(`
    SELECT id, email, role, status, email_verified
    FROM users
    WHERE id = 'usr_super_admin_001' OR email = 'support@caexamcheckerai.com'
  `).get() as any;
  assert.ok(superAdmin, 'Super Admin must exist');
  assert.strictEqual(superAdmin.email_verified, 1, 'Super Admin must be email_verified=1');
  assert.strictEqual(superAdmin.role, 'SUPER_ADMIN');
  console.log('✓ [PASS] Test 11: Pre-existing accounts and admin roles are untouched and automatically verified.');

  // Test 12: Ensure existing accounts cannot be re-registered or challenged
  console.log('\n>>> [TEST 12] Testing registration attempt on existing user email...');
  const duplicateInit = await initiateStudentRegistrationOtp({
    email: superAdmin.email,
    fullName: 'Intruder',
    passwordHash: passHash,
    icaiRegistrationNumber: 'WRO1234567',
    caLevel: 'FINAL',
  });
  assert.strictEqual(duplicateInit.success, false);
  assert.strictEqual(duplicateInit.alreadyRegistered, true);
  console.log('✓ [PASS] Test 12: Existing registered emails cannot be overwritten or challenged.');

  console.log('========================================================================');
  console.log('✅ ALL STUDENT REGISTRATION OTP REGRESSION TESTS PASSED CLEANLY (12/12)');
  console.log('========================================================================');

  await closeFirestoreCleanly();
  process.exit(0);
}

runStudentRegistrationOtpTestSuite().catch(async (err) => {
  console.error('❌ Test suite failed:', err);
  await closeFirestoreCleanly();
  process.exit(1);
});
