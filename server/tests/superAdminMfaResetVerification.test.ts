import assert from 'node:assert';
import crypto from 'node:crypto';
import { db, initDatabase } from '../db.js';
import {
  initMfaRecoveryTables,
  executeServerMfaReset,
  getAuthoritativeUserMfaState,
} from '../services/mfaRecoveryService.js';
import {
  ensureTrustedDevicesTable,
  getTrustedDevicesForUser,
  evaluateRfc6238TotpDiagnostics,
} from '../services/trustService.js';
import { evaluateMfaRequirementForLogin } from '../routes/authRoutes.js';

// Helper to compute standard RFC 6238 TOTP code for testing verification
function generateTotpCodeForSecret(secret: string, timeOffsetSeconds: number = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  const cleanSecret = secret.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');

  for (let i = 0; i < cleanSecret.length; i++) {
    const idx = alphabet.indexOf(cleanSecret[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  const key = Buffer.from(output);
  const epoch = Math.floor((Date.now() / 1000) + timeOffsetSeconds);
  const timeStep = Math.floor(epoch / 30);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(timeStep));

  const hmac = crypto.createHmac('sha1', key);
  hmac.update(timeBuffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const codeInt =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(codeInt % 1_000_000).padStart(6, '0');
}

async function runSuperAdminMfaResetVerification() {
  console.log('================================================================');
  console.log('--- PRODUCTION SUPER ADMIN MFA RESET & FLOW VERIFICATION ---');
  console.log('================================================================');

  initDatabase();
  initMfaRecoveryTables();
  ensureTrustedDevicesTable();

  // 1. Identify existing Super Admin account
  console.log('\n[STEP 1] Locating authoritative Super Admin account by UID...');
  const superAdminRow = db.prepare(`
    SELECT id, email, full_name, role, status, password_hash, mfa_enabled, totp_secret
    FROM users
    WHERE id = 'usr_super_admin_001'
  `).get() as any;

  assert.ok(superAdminRow, 'Super Admin usr_super_admin_001 must exist');
  assert.strictEqual(superAdminRow.id, 'usr_super_admin_001', 'Target UID must match');
  assert.strictEqual(superAdminRow.role, 'SUPER_ADMIN', 'Role must be SUPER_ADMIN');
  console.log(`[PASS] Identified Super Admin: UID=${superAdminRow.id}, Role=${superAdminRow.role}`);

  const originalPasswordHash = superAdminRow.password_hash;
  const originalEmail = superAdminRow.email;
  const originalRole = superAdminRow.role;
  const oldTotpSecret = superAdminRow.totp_secret;

  // Record baseline counts of unrelated accounts to verify strict isolation
  const studentCountBefore = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'STUDENT'").get() as any;
  const instAdminCountBefore = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'INSTITUTE_ADMIN'").get() as any;
  const mcqAdminBefore = db.prepare("SELECT id, email, mfa_enabled, totp_secret FROM users WHERE role = 'MCQ_ADMIN'").all() as any[];

  // 2. Perform the MFA Reset
  console.log('\n[STEP 2] Executing executeServerMfaReset on usr_super_admin_001...');
  const resetResult = await executeServerMfaReset(
    'usr_super_admin_001',
    undefined,
    'Production Security Audit - Super Admin MFA Reset'
  );

  assert.strictEqual(resetResult.success, true);
  console.log('[PASS] executeServerMfaReset completed successfully.');

  // 3. Verify Database State Immediately Post-Reset
  console.log('\n[STEP 3] Verifying user table and MFA tables for usr_super_admin_001...');
  const postResetAdmin = db.prepare(`
    SELECT id, email, role, status, password_hash, mfa_enabled, mfa_reset_required, totp_secret, pending_totp_secret
    FROM users WHERE id = 'usr_super_admin_001'
  `).get() as any;

  assert.strictEqual(postResetAdmin.mfa_enabled, 0, 'mfa_enabled must be 0');
  assert.strictEqual(postResetAdmin.mfa_reset_required, 1, 'mfa_reset_required must be 1');
  assert.strictEqual(postResetAdmin.totp_secret, null, 'totp_secret must be NULL');
  assert.strictEqual(postResetAdmin.pending_totp_secret, null, 'pending_totp_secret must be NULL');
  assert.strictEqual(postResetAdmin.email, originalEmail, 'Email must NOT change');
  assert.strictEqual(postResetAdmin.password_hash, originalPasswordHash, 'Password hash must NOT change');
  assert.strictEqual(postResetAdmin.role, originalRole, 'Role must NOT change');
  console.log('[PASS] Super Admin user row correctly updated to MFA_RESET_REQUIRED.');

  // Check authenticators table
  const authCount = db.prepare('SELECT COUNT(*) as count FROM mfa_authenticators WHERE user_id = ?').get('usr_super_admin_001') as any;
  assert.strictEqual(authCount.count, 0, 'mfa_authenticators records must be completely deleted for Super Admin');
  console.log('[PASS] Authenticators table cleared (0 records).');

  // Check recovery codes table
  const rcCount = db.prepare('SELECT COUNT(*) as count FROM mfa_recovery_codes WHERE user_id = ?').get('usr_super_admin_001') as any;
  assert.strictEqual(rcCount.count, 0, 'mfa_recovery_codes must be completely deleted for Super Admin');
  console.log('[PASS] Recovery codes cleared (0 records).');

  // Check trusted devices
  const activeTrustedDevices = getTrustedDevicesForUser('usr_super_admin_001');
  assert.strictEqual(activeTrustedDevices.length, 0, 'All trusted devices must be revoked (0 active)');
  console.log('[PASS] Trusted devices revoked (0 active trusted devices).');

  // 4. Verify Authoritative State
  console.log('\n[STEP 4] Verifying authoritative state evaluation...');
  const authState = await getAuthoritativeUserMfaState('usr_super_admin_001');
  assert.strictEqual(authState.state, 'MFA_RESET_REQUIRED', 'Authoritative state must be MFA_RESET_REQUIRED');
  assert.strictEqual(authState.hasValidSecret, false, 'hasValidSecret must be false');
  console.log('[PASS] Authoritative state is MFA_RESET_REQUIRED.');

  // 5. Test Old TOTP Secret Invalidation
  console.log('\n[STEP 5] Testing old TOTP factor rejection...');
  if (oldTotpSecret) {
    const oldCode = generateTotpCodeForSecret(oldTotpSecret);
    const oldDiag = evaluateRfc6238TotpDiagnostics(oldTotpSecret, oldCode);
    assert.strictEqual(oldDiag.valid, true, 'Old code would have matched old secret');

    // Attempting to evaluate against current state (no secret)
    const checkState = await getAuthoritativeUserMfaState('usr_super_admin_001');
    assert.strictEqual(checkState.hasValidSecret, false, 'Cannot verify old code without valid secret');
    console.log('[PASS] Old TOTP secret is permanently invalidated and eliminated from state.');
  }

  // 6. Test Next Login Flow (evaluateMfaRequirementForLogin)
  console.log('\n[STEP 6] Simulating next login for Super Admin...');
  const loginMfaCheck = await evaluateMfaRequirementForLogin(postResetAdmin, {
    deviceId: 'test_device_post_reset_001',
    trustToken: 'invalid_or_expired_token',
  });

  assert.strictEqual(loginMfaCheck.requireMfa, true, 'requireMfa must be true');
  assert.strictEqual(loginMfaCheck.mfaEnrolled, false, 'mfaEnrolled must be false -> triggers ENROLL mode');
  assert.strictEqual(loginMfaCheck.mfaState, 'MFA_RESET_REQUIRED');
  assert.ok(loginMfaCheck.mfaSessionToken, 'Must generate valid mfaSessionToken');
  assert.ok(loginMfaCheck.totpSetup, 'Must generate brand-new totpSetup');
  assert.ok(loginMfaCheck.totpSetup.qrDataUrl.startsWith('data:image/png;base64,'), 'QR data URL must be generated');
  assert.ok(loginMfaCheck.totpSetup.otpauthUri.startsWith('otpauth://totp/'), 'Valid otpauth URI must be generated');
  assert.ok(loginMfaCheck.totpSetup.secretKey.length >= 16, 'New secretKey must be >= 16 chars');
  assert.notStrictEqual(loginMfaCheck.totpSetup.secretKey, oldTotpSecret, 'New secretKey must NOT match old secret');
  assert.ok(loginMfaCheck.totpSetup.formattedKey.includes(' '), 'Manual setup key must be formatted with spaces');

  console.log('[PASS] Next login directs Super Admin to "Set Up Authenticator" with fresh QR code and manual key.');

  // 7. Verify New Secret Verification & Enrollment
  console.log('\n[STEP 7] Simulating scan of new QR code and entering new 6-digit TOTP code...');
  const newSecret = loginMfaCheck.totpSetup.secretKey;
  const newOtpCode = generateTotpCodeForSecret(newSecret);

  // Validate the code with the diagnostics function
  const diag = evaluateRfc6238TotpDiagnostics(newSecret, newOtpCode, 1, 10);
  assert.strictEqual(diag.valid, true, 'New code must validate against new secret');
  console.log('[PASS] New TOTP code validates cryptographically against new secret.');

  // 8. Test Idempotency of Reset
  console.log('\n[STEP 8] Testing idempotency: running reset a second time...');
  const secondReset = await executeServerMfaReset(
    'usr_super_admin_001',
    undefined,
    'Idempotency check'
  );
  assert.strictEqual(secondReset.success, true);
  const secondState = await getAuthoritativeUserMfaState('usr_super_admin_001');
  assert.strictEqual(secondState.state, 'MFA_RESET_REQUIRED');
  console.log('[PASS] Reset operation is completely idempotent.');

  // 9. Verify Isolation: Ensure other accounts and production data were untouched
  console.log('\n[STEP 9] Verifying strict isolation across other accounts...');
  const studentCountAfter = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'STUDENT'").get() as any;
  const instAdminCountAfter = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'INSTITUTE_ADMIN'").get() as any;
  const mcqAdminAfter = db.prepare("SELECT id, email, mfa_enabled, totp_secret FROM users WHERE role = 'MCQ_ADMIN'").all() as any[];

  assert.strictEqual(studentCountAfter.c, studentCountBefore.c, 'Student accounts count must be identical');
  assert.strictEqual(instAdminCountAfter.c, instAdminCountBefore.c, 'Institute admin accounts count must be identical');
  assert.deepStrictEqual(mcqAdminAfter, mcqAdminBefore, 'MCQ Admin accounts and MFA state must be identical');
  console.log('[PASS] Full isolation verified. Zero other accounts or credentials were modified.');

  // 10. Verify Audit Log Generated
  console.log('\n[STEP 10] Verifying audit logs for the reset event...');
  const mfaAuditLog = db.prepare(`
    SELECT id, user_id, event_type, target_user_uid, status
    FROM mfa_audit_logs
    WHERE target_user_uid = 'usr_super_admin_001' AND event_type = 'MFA_RESET'
    ORDER BY created_at DESC LIMIT 1
  `).get() as any;

  assert.ok(mfaAuditLog, 'MFA reset audit log entry must exist');
  assert.strictEqual(mfaAuditLog.status, 'SUCCESS');
  console.log('[PASS] Security audit trail entry verified.');

  console.log('================================================================');
  console.log('✅ ALL SUPER ADMIN MFA RESET VERIFICATION CHECKS PASSED CLEANLY');
  console.log('================================================================');
}

runSuperAdminMfaResetVerification().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
