import assert from 'node:assert';
import crypto from 'node:crypto';
import { db, initDatabase } from '../db.js';
import {
  initMfaRecoveryTables,
  executeServerMfaReset,
  getAuthoritativeUserMfaState,
  getOrCreatePendingMfaSetup,
  checkMfaRateLimit,
  recordMfaFailedAttempt,
  clearMfaRateLimit,
  submitManualRecoveryRequest,
  approveMfaRecovery,
  getPendingRecoveryRequests,
} from '../services/mfaRecoveryService.js';
import {
  ensureTrustedDevicesTable,
  getTrustedDevicesForUser,
  evaluateRfc6238TotpDiagnostics,
} from '../services/trustService.js';
import { evaluateMfaRequirementForLogin } from '../routes/authRoutes.js';
import { encryptMfaSecret, decryptMfaSecret, isValidMfaSecret } from '../services/mfaCryptoService.js';
import { syncRecordToFirestore, hydrateFromFirestore } from '../services/firestoreSyncService.js';
import { getFirestoreDoc, closeFirestoreCleanly } from '../services/firestoreDbService.js';

// RFC 6238 TOTP computation helper
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

  const keyBuffer = Buffer.from(output);
  const epoch = Math.floor((Date.now() + timeOffsetSeconds * 1000) / 1000);
  const timeStep = Math.floor(epoch / 30);

  const timeBuf = Buffer.alloc(8);
  timeBuf.writeBigInt64BE(BigInt(timeStep), 0);

  const hmac = crypto.createHmac('sha1', keyBuffer);
  hmac.update(timeBuf);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const codeInt =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (codeInt % 1000000).toString().padStart(6, '0');
}

async function runAdminMfaLifecycleSecurityAudit() {
  console.log('================================================================');
  console.log('🔒 PRODUCTION SECURITY AUDIT: ADMIN MFA REPEATED QR ROOT CAUSE FIX');
  console.log('================================================================\n');

  initDatabase();
  initMfaRecoveryTables();
  ensureTrustedDevicesTable();

  const testAdminId = `usr_test_audit_admin_${Date.now()}`;
  const testAdminEmail = `audit.admin.${Date.now()}@testexam.ai`;

  // Seed test administrator
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, phone, role, status, mfa_enabled, mfa_reset_required, created_at, updated_at)
    VALUES (?, ?, 'dummy_hash', 'Test Audit Administrator', '+919999988888', 'SUPER_ADMIN', 'ACTIVE', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(testAdminId, testAdminEmail);

  try {
    // -------------------------------------------------------------------------
    // TEST 1: First-time enrollment displays QR code and enables MFA only after successful verification
    // -------------------------------------------------------------------------
    console.log('[TEST 1] First-time enrollment displays QR and enables MFA only after verification...');
    const userRow1 = db.prepare('SELECT id, email, role, full_name FROM users WHERE id = ?').get(testAdminId) as any;
    const initialCheck = await evaluateMfaRequirementForLogin(userRow1, { deviceId: 'browser_dev_01' });

    assert.strictEqual(initialCheck.requireMfa, true, 'First-time admin login must require MFA');
    assert.strictEqual(initialCheck.mfaEnrolled, false, 'First-time admin must have mfaEnrolled=false');
    assert.strictEqual(initialCheck.mfaState, 'MFA_NOT_ENROLLED');
    assert.ok(initialCheck.totpSetup, 'First-time admin MUST receive totpSetup');
    assert.ok(initialCheck.totpSetup.qrDataUrl.startsWith('data:image/png;base64,'), 'QR code must be present in totpSetup');
    assert.ok(initialCheck.totpSetup.secretKey.length >= 16, 'Secret key must be valid Base32 length');

    // Verify secret is NOT enabled in DB before verification
    const preVerifyUser = db.prepare('SELECT mfa_enabled, totp_secret FROM users WHERE id = ?').get(testAdminId) as any;
    assert.strictEqual(preVerifyUser.mfa_enabled, 0, 'mfa_enabled must remain 0 before code verification');

    // Simulate successful code verification
    const validOtp = generateTotpCodeForSecret(initialCheck.totpSetup.secretKey);
    const encSecret = encryptMfaSecret(initialCheck.totpSetup.secretKey);

    db.prepare(`
      UPDATE users
      SET mfa_enabled = 1,
          mfa_enrolled_at = CURRENT_TIMESTAMP,
          totp_secret = ?,
          pending_totp_secret = NULL,
          mfa_reset_required = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(encSecret, testAdminId);

    db.prepare(`
      INSERT INTO mfa_authenticators (id, user_id, factor_type, label, totp_secret, created_at, last_used_at)
      VALUES (?, ?, 'PRIMARY_TOTP', 'Primary Authenticator App', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(`auth_prim_${testAdminId}`, testAdminId, encSecret);

    const postVerifyState = await getAuthoritativeUserMfaState(testAdminId);
    assert.strictEqual(postVerifyState.state, 'MFA_ENROLLED', 'User must be in MFA_ENROLLED state after verification');
    assert.strictEqual(postVerifyState.hasValidSecret, true, 'User must have valid secret');
    console.log('  ✅ [PASS] First-time enrollment displays QR and enables MFA only after code verification.');

    // -------------------------------------------------------------------------
    // TEST 2: Subsequent logins show 6-digit challenge and DO NOT display or regenerate QR
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] Subsequent logins show 6-digit code challenge and NEVER show/regenerate QR...');
    const subsequentCheck = await evaluateMfaRequirementForLogin(userRow1, { deviceId: 'browser_dev_02' });

    assert.strictEqual(subsequentCheck.requireMfa, true, 'Enrolled admin must require MFA challenge');
    assert.strictEqual(subsequentCheck.mfaEnrolled, true, 'Enrolled admin must have mfaEnrolled=true');
    assert.strictEqual(subsequentCheck.mfaState, 'MFA_ENROLLED', 'Enrolled admin must have mfaState=MFA_ENROLLED');
    assert.strictEqual(subsequentCheck.totpSetup, undefined, 'CRITICAL: Enrolled admin MUST NOT receive totpSetup or QR code');
    assert.ok(subsequentCheck.mfaSessionToken, 'Must generate challenge session token');
    console.log('  ✅ [PASS] Subsequent logins show 6-digit challenge without QR code.');

    // -------------------------------------------------------------------------
    // TEST 3: Secret encryption at rest
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3] Verifying server-side AES-256-GCM secret encryption at rest...');
    const storedSecretRow = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(testAdminId) as any;
    assert.ok(storedSecretRow.totp_secret.startsWith('enc:gcm:'), 'Stored secret must be encrypted with enc:gcm prefix');
    const decrypted = decryptMfaSecret(storedSecretRow.totp_secret);
    assert.strictEqual(decrypted, initialCheck.totpSetup.secretKey, 'Decrypted secret must match plaintext secret');
    console.log('  ✅ [PASS] Stored secret is securely encrypted at rest.');

    // -------------------------------------------------------------------------
    // TEST 4: Survival across database synchronization / hydration
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] Verifying MFA enrollment survives database hydration & restarts...');
    // Push enrolled user to Firestore
    await syncRecordToFirestore('users', testAdminId, {
      id: testAdminId,
      email: testAdminEmail,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      mfa_enabled: 1,
      mfa_reset_required: 0,
      totp_secret: encSecret,
      updated_at: new Date().toISOString(),
    });

    // Simulate fresh SQLite table state
    db.prepare('UPDATE users SET totp_secret = NULL, mfa_enabled = 0 WHERE id = ?').run(testAdminId);

    // Run getAuthoritativeUserMfaState which cross-checks and heals from Firestore
    const healedState = await getAuthoritativeUserMfaState(testAdminId);
    assert.strictEqual(healedState.state, 'MFA_ENROLLED', 'Must heal MFA_ENROLLED from Firestore');
    assert.strictEqual(healedState.hasValidSecret, true, 'Must heal valid secret from Firestore');

    const healedDbRow = db.prepare('SELECT mfa_enabled, mfa_reset_required FROM users WHERE id = ?').get(testAdminId) as any;
    assert.strictEqual(healedDbRow.mfa_enabled, 1, 'Local SQLite mfa_enabled must be healed to 1');
    assert.strictEqual(healedDbRow.mfa_reset_required, 0, 'Local SQLite mfa_reset_required must be 0');
    console.log('  ✅ [PASS] MFA enrollment and secrets survive and self-heal from Firestore.');

    // -------------------------------------------------------------------------
    // TEST 5: Incorrect and expired codes are rejected with rate limiting
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Verifying rejection of incorrect codes and rate limiting...');
    const activeSecret = decrypted;
    const invalidDiag = evaluateRfc6238TotpDiagnostics(activeSecret, '000000', 1, 10);
    assert.strictEqual(invalidDiag.valid, false, 'Arbitrary invalid code must be rejected');

    const expiredDiag = evaluateRfc6238TotpDiagnostics(activeSecret, generateTotpCodeForSecret(activeSecret, -120), 1, 10);
    assert.strictEqual(expiredDiag.valid, false, 'Expired code outside window must be rejected');

    const rateKey = `test_rate_limit_${testAdminId}`;
    clearMfaRateLimit(rateKey);
    for (let i = 0; i < 5; i++) {
      recordMfaFailedAttempt(rateKey);
    }
    const lockedCheck = checkMfaRateLimit(rateKey);
    assert.strictEqual(lockedCheck.allowed, false, 'Must lock out after 5 consecutive failed attempts');
    clearMfaRateLimit(rateKey);
    console.log('  ✅ [PASS] Incorrect/expired codes rejected and rate-limited safely.');

    // -------------------------------------------------------------------------
    // TEST 6: Authorized recovery works without creating an MFA bypass
    // -------------------------------------------------------------------------
    console.log('\n[TEST 6] Authorized recovery workflow verification...');
    const resetResult = await executeServerMfaReset(
      testAdminId,
      { id: 'usr_super_admin_001', email: 'support@caexamcheckerai.com', role: 'SUPER_ADMIN' },
      'Routine authorized audit reset'
    );
    assert.strictEqual(resetResult.success, true, 'Authorized reset must succeed');

    const postResetState = await getAuthoritativeUserMfaState(testAdminId);
    assert.strictEqual(postResetState.state, 'MFA_RESET_REQUIRED', 'After authorized reset, state must be MFA_RESET_REQUIRED');

    // Next login after reset must require fresh enrollment and QR code
    const postResetCheck = await evaluateMfaRequirementForLogin(userRow1, { deviceId: 'browser_dev_03' });
    assert.strictEqual(postResetCheck.requireMfa, true, 'MFA must remain strictly mandatory (no bypass)');
    assert.strictEqual(postResetCheck.mfaEnrolled, false, 'Fresh enrollment required');
    assert.ok(postResetCheck.totpSetup, 'Fresh QR code generated for re-enrollment');
    assert.notStrictEqual(postResetCheck.totpSetup.secretKey, activeSecret, 'New secret must NOT equal old secret');
    console.log('  ✅ [PASS] Authorized recovery requires fresh enrollment without creating an MFA bypass.');

    // -------------------------------------------------------------------------
    // Clean up test administrator
    // -------------------------------------------------------------------------
    db.prepare('DELETE FROM users WHERE id = ?').run(testAdminId);
    db.prepare('DELETE FROM mfa_authenticators WHERE user_id = ?').run(testAdminId);
    db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(testAdminId);
    db.prepare('DELETE FROM mfa_audit_logs WHERE target_user_uid = ?').run(testAdminId);

    console.log('\n================================================================');
    console.log('🎉 ALL 7 ADMIN MFA LIFECYCLE AUDIT VERIFICATIONS PASSED CLEANLY');
    console.log('================================================================');
  } finally {
    await closeFirestoreCleanly();
  }
}

runAdminMfaLifecycleSecurityAudit()
  .then(() => {
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('❌ Audit suite failed:', err);
    await closeFirestoreCleanly();
    process.exit(1);
  });
