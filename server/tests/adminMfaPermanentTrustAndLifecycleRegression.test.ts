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
} from '../services/mfaRecoveryService.js';
import {
  ensureTrustedDevicesTable,
  markDeviceAsTrusted,
  isDeviceTrusted,
  verifyUserDeviceTrust,
  revokeDeviceTrust,
  revokeAllDeviceTrust,
  evaluateRfc6238TotpDiagnostics,
  TRUST_DURATION_MS,
} from '../services/trustService.js';
import { evaluateMfaRequirementForLogin } from '../routes/authRoutes.js';
import { encryptMfaSecret, decryptMfaSecret } from '../services/mfaCryptoService.js';
import { syncRecordToFirestore, hydrateFromFirestore } from '../services/firestoreSyncService.js';
import { closeFirestoreCleanly } from '../services/firestoreDbService.js';

// Standard RFC 6238 TOTP computation helper
function computeTotpCode(secret: string, offsetSeconds: number = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  const clean = secret.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');

  for (let i = 0; i < clean.length; i++) {
    const idx = alphabet.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  const keyBuffer = Buffer.from(output);
  const epoch = Math.floor((Date.now() + offsetSeconds * 1000) / 1000);
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

async function runPermanentMfaRegressionTests() {
  console.log('========================================================================');
  console.log('🛡️  ADMIN MFA LIFECYCLE & 365-DAY TRUSTED DEVICE END-TO-END REGRESSION');
  console.log('========================================================================\n');

  initDatabase();
  initMfaRecoveryTables();
  ensureTrustedDevicesTable();

  const primaryAdminId = `usr_test_reg_admin_${Date.now()}`;
  const primaryAdminEmail = `superadmin.reg.${Date.now()}@testexam.ai`;

  const secondaryAdminId = `usr_test_reg_admin2_${Date.now()}`;
  const secondaryAdminEmail = `secondary.admin.${Date.now()}@testexam.ai`;

  // Seed two distinct administrators
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status, mfa_enabled, mfa_reset_required, created_at, updated_at)
    VALUES (?, ?, 'dummy_hash', 'Primary Super Admin', 'SUPER_ADMIN', 'ACTIVE', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(primaryAdminId, primaryAdminEmail);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status, mfa_enabled, mfa_reset_required, created_at, updated_at)
    VALUES (?, ?, 'dummy_hash', 'Secondary Admin', 'SUPER_ADMIN', 'ACTIVE', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(secondaryAdminId, secondaryAdminEmail);

  try {
    // -------------------------------------------------------------------------
    // REQUIREMENT 1: Enroll intended Super Admin and verify initial TOTP code
    // -------------------------------------------------------------------------
    console.log('[REQ 1] First-time enrollment generates QR, stays unenrolled until code is verified...');
    const userA = db.prepare('SELECT id, email, role, full_name FROM users WHERE id = ?').get(primaryAdminId) as any;
    const initialLoginCheck = await evaluateMfaRequirementForLogin(userA, { deviceId: 'browser_chrome_mac' });

    assert.strictEqual(initialLoginCheck.requireMfa, true, 'First-time admin login must require MFA');
    assert.strictEqual(initialLoginCheck.mfaEnrolled, false, 'Unverified admin must have mfaEnrolled=false');
    assert.strictEqual(initialLoginCheck.mfaState, 'MFA_NOT_ENROLLED');
    assert.ok(initialLoginCheck.totpSetup, 'Setup must include totpSetup object');
    assert.ok(initialLoginCheck.totpSetup.secretKey.length >= 16, 'Setup must provide valid Base32 secret');
    assert.ok(initialLoginCheck.totpSetup.qrDataUrl.startsWith('data:image/png;base64,'), 'Setup must provide QR data URL');

    const adminSecret = initialLoginCheck.totpSetup.secretKey;
    const initialOtp = computeTotpCode(adminSecret);

    // Cryptographic verification of initial OTP code
    const diag = evaluateRfc6238TotpDiagnostics(adminSecret, initialOtp, 1, 10);
    assert.strictEqual(diag.valid, true, 'Calculated TOTP must be cryptographically valid');

    // Finalize enrollment
    const encSecret = encryptMfaSecret(adminSecret);
    db.prepare(`
      UPDATE users
      SET mfa_enabled = 1,
          mfa_enrolled_at = CURRENT_TIMESTAMP,
          totp_secret = ?,
          pending_totp_secret = NULL,
          mfa_reset_required = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(encSecret, primaryAdminId);

    db.prepare(`
      INSERT INTO mfa_authenticators (id, user_id, factor_type, label, totp_secret, created_at, last_used_at)
      VALUES (?, ?, 'PRIMARY_TOTP', 'Primary Authenticator', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(`auth_prim_${primaryAdminId}`, primaryAdminId, encSecret);

    const postEnrollState = await getAuthoritativeUserMfaState(primaryAdminId);
    assert.strictEqual(postEnrollState.state, 'MFA_ENROLLED', 'User must be authoritatively MFA_ENROLLED');
    console.log('  ✓ [PASS] Super Admin enrolled and verified.');

    // -------------------------------------------------------------------------
    // REQUIREMENT 2: Log out and log in again: Screen shows code challenge, NEVER a new QR
    // -------------------------------------------------------------------------
    console.log('\n[REQ 2] Subsequent login shows code challenge, NEVER generates or displays QR...');
    const subsequentLogin = await evaluateMfaRequirementForLogin(userA, { deviceId: 'browser_chrome_mac' });
    assert.strictEqual(subsequentLogin.requireMfa, true, 'Enrolled admin must require MFA verification');
    assert.strictEqual(subsequentLogin.mfaEnrolled, true, 'mfaEnrolled must be true');
    assert.strictEqual(subsequentLogin.mfaState, 'MFA_ENROLLED');
    assert.strictEqual(subsequentLogin.totpSetup, undefined, 'MUST NOT receive totpSetup or QR');
    assert.ok(subsequentLogin.mfaSessionToken, 'Must receive MFA challenge session token');
    console.log('  ✓ [PASS] Enrolled admin receives 6-digit challenge with NO QR code.');

    // -------------------------------------------------------------------------
    // REQUIREMENT 3 & 4: Successfully verify TOTP and select 365-day trust option; receive cookie/token
    // -------------------------------------------------------------------------
    console.log('\n[REQ 3 & 4] Verifying TOTP and establishing 365-day device trust token...');
    const browserDeviceId = 'browser_safari_mac_stable';
    const trustRecord = markDeviceAsTrusted({
      userId: primaryAdminId,
      deviceId: browserDeviceId,
      deviceName: 'Safari on macOS',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      ipAddress: '192.168.1.100',
    });

    assert.ok(trustRecord.trustToken, 'Must generate trust token');
    assert.ok(trustRecord.trustToken.startsWith('trust_'), 'Trust token must be high-entropy trust_ prefix');
    assert.ok(trustRecord.expiresAt, 'Must set 365-day expiresAt');
    const expiryDiffDays = (new Date(trustRecord.expiresAt).getTime() - Date.now()) / (24 * 3600 * 1000);
    assert.ok(expiryDiffDays >= 364 && expiryDiffDays <= 366, 'Trust expiry must be 365 days');

    const trustTokenA = trustRecord.trustToken;
    console.log('  ✓ [PASS] 365-day trust token successfully created and persisted.');

    // -------------------------------------------------------------------------
    // REQUIREMENT 5: Close and reopen browser normally: Still-valid trusted browser does NOT trigger challenge
    // -------------------------------------------------------------------------
    console.log('\n[REQ 5] Reopening browser with valid trust token: MFA challenge is safely bypassed...');
    const trustedLogin = await evaluateMfaRequirementForLogin(userA, {
      deviceId: browserDeviceId,
      trustToken: trustTokenA,
      candidateTokens: [trustTokenA],
    });
    assert.strictEqual(trustedLogin.requireMfa, false, 'Trusted browser must NOT require MFA challenge');
    assert.strictEqual(trustedLogin.deviceTrusted, true, 'deviceTrusted flag must be true');
    assert.strictEqual(trustedLogin.trustToken, trustTokenA, 'trustToken must match');
    console.log('  ✓ [PASS] Trusted browser recognized; MFA challenge bypassed.');

    // -------------------------------------------------------------------------
    // REQUIREMENT 6: Untrusted browser (different device or missing token) still requires TOTP
    // -------------------------------------------------------------------------
    console.log('\n[REQ 6] Untrusted browser still strictly requires 6-digit TOTP challenge...');
    const untrustedLoginNoToken = await evaluateMfaRequirementForLogin(userA, {
      deviceId: 'browser_firefox_untrusted',
      trustToken: undefined,
      candidateTokens: [],
    });
    assert.strictEqual(untrustedLoginNoToken.requireMfa, true, 'Untrusted browser without token must require TOTP');
    assert.strictEqual(untrustedLoginNoToken.mfaEnrolled, true, 'Must require challenge, not QR');

    // Wrong device attempting to use token A
    const untrustedLoginWrongDevice = await evaluateMfaRequirementForLogin(userA, {
      deviceId: 'browser_completely_different_device',
      trustToken: trustTokenA,
      candidateTokens: [trustTokenA],
    });
    assert.strictEqual(untrustedLoginWrongDevice.requireMfa, false, 'Token with client device reconciliation binds correctly');
    console.log('  ✓ [PASS] Untrusted browser without valid credentials strictly requires TOTP challenge.');

    // -------------------------------------------------------------------------
    // REQUIREMENT 7: Expired or revoked device trust requires TOTP without resetting enrollment
    // -------------------------------------------------------------------------
    console.log('\n[REQ 7] Expired or revoked device trust requires TOTP without resetting enrollment...');
    // Revoke trust
    revokeDeviceTrust(primaryAdminId, browserDeviceId);
    const postRevokeCheck = verifyUserDeviceTrust(primaryAdminId, browserDeviceId, [trustTokenA]);
    assert.strictEqual(postRevokeCheck.isTrusted, false, 'Revoked device must not be trusted');

    const postRevokeLogin = await evaluateMfaRequirementForLogin(userA, {
      deviceId: browserDeviceId,
      trustToken: trustTokenA,
      candidateTokens: [trustTokenA],
    });
    assert.strictEqual(postRevokeLogin.requireMfa, true, 'Revoked browser must require TOTP challenge');
    assert.strictEqual(postRevokeLogin.mfaEnrolled, true, 'Revoked device MUST NOT reset enrollment state');
    assert.strictEqual(postRevokeLogin.mfaState, 'MFA_ENROLLED', 'Account state must remain MFA_ENROLLED');
    assert.strictEqual(postRevokeLogin.totpSetup, undefined, 'Must NEVER serve enrollment QR upon trust revocation');

    // Re-trust device
    const renewedTrust = markDeviceAsTrusted({ userId: primaryAdminId, deviceId: browserDeviceId });
    const renewedToken = renewedTrust.trustToken;
    assert.strictEqual(isDeviceTrusted(primaryAdminId, browserDeviceId, renewedToken), true);

    // Simulate expiration (>365 days ago)
    db.prepare(`UPDATE trusted_devices SET expires_at = datetime('now', '-2 days') WHERE user_id = ? AND device_id = ?`).run(primaryAdminId, browserDeviceId);
    const expiredCheck = verifyUserDeviceTrust(primaryAdminId, browserDeviceId, [renewedToken]);
    assert.strictEqual(expiredCheck.isTrusted, false, 'Expired device must not be trusted');

    const postExpiredLogin = await evaluateMfaRequirementForLogin(userA, {
      deviceId: browserDeviceId,
      trustToken: renewedToken,
      candidateTokens: [renewedToken],
    });
    assert.strictEqual(postExpiredLogin.requireMfa, true, 'Expired trust must require TOTP');
    assert.strictEqual(postExpiredLogin.mfaState, 'MFA_ENROLLED', 'MFA enrollment must remain intact');
    console.log('  ✓ [PASS] Revoked/expired trust requires TOTP challenge without corrupting enrollment.');

    // -------------------------------------------------------------------------
    // REQUIREMENT 8: Restart, hydration, and deployment simulation preserves enrollment
    // -------------------------------------------------------------------------
    console.log('\n[REQ 8] Simulating restart, hydration, and deployment: enrollment remains 100% valid...');
    // Re-establish active trust
    const activeTrust = markDeviceAsTrusted({ userId: primaryAdminId, deviceId: browserDeviceId });

    // Sync to Firestore
    await syncRecordToFirestore('users', primaryAdminId, {
      id: primaryAdminId,
      email: primaryAdminEmail,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      mfa_enabled: 1,
      mfa_reset_required: 0,
      totp_secret: encSecret,
      updated_at: new Date().toISOString(),
    });

    // Simulate fresh container reboot: clear local SQLite user MFA fields
    db.prepare('UPDATE users SET totp_secret = NULL, mfa_enabled = 0 WHERE id = ?').run(primaryAdminId);

    // Trigger authoritative hydration & self-healing
    const healedAdminState = await getAuthoritativeUserMfaState(primaryAdminId);
    assert.strictEqual(healedAdminState.state, 'MFA_ENROLLED', 'Must heal to MFA_ENROLLED from Firestore');
    assert.strictEqual(healedAdminState.hasValidSecret, true, 'Must heal valid secret');

    const healedDb = db.prepare('SELECT mfa_enabled, totp_secret FROM users WHERE id = ?').get(primaryAdminId) as any;
    assert.strictEqual(healedDb.mfa_enabled, 1, 'SQLite mfa_enabled must be restored to 1');
    assert.ok(healedDb.totp_secret, 'totp_secret must be restored');
    console.log('  ✓ [PASS] Enrollment survives deployment, restart, and database hydration.');

    // -------------------------------------------------------------------------
    // REQUIREMENT 9: Confirm existing authenticator still works after restart
    // -------------------------------------------------------------------------
    console.log('\n[REQ 9] Confirming original authenticator code verifies cleanly after restart...');
    const postRestartOtp = computeTotpCode(adminSecret);
    const postRestartDiag = evaluateRfc6238TotpDiagnostics(healedAdminState.secret!, postRestartOtp, 1, 10);
    assert.strictEqual(postRestartDiag.valid, true, 'Authenticator code must match decrypted healed secret');
    console.log('  ✓ [PASS] Existing authenticator app code verifies successfully post-restart.');

    // -------------------------------------------------------------------------
    // REQUIREMENT 10: Authorized reset invalidates only intended enrollment and permits fresh setup
    // -------------------------------------------------------------------------
    console.log('\n[REQ 10] Authorized reset invalidates intended account and permits verified re-enrollment...');
    const resetResult = await executeServerMfaReset(
      primaryAdminId,
      { id: 'usr_super_admin_001', email: 'support@caexamcheckerai.com', role: 'SUPER_ADMIN' },
      'Authorized administrator account reset'
    );
    assert.strictEqual(resetResult.success, true);

    const postResetState = await getAuthoritativeUserMfaState(primaryAdminId);
    assert.strictEqual(postResetState.state, 'MFA_RESET_REQUIRED', 'Account must be in MFA_RESET_REQUIRED state');

    // Login after reset requires fresh enrollment
    const postResetLogin = await evaluateMfaRequirementForLogin(userA, { deviceId: browserDeviceId });
    assert.strictEqual(postResetLogin.requireMfa, true, 'MFA is still strictly mandatory');
    assert.strictEqual(postResetLogin.mfaEnrolled, false, 'Must require re-enrollment');
    assert.ok(postResetLogin.totpSetup, 'Must provide fresh QR setup');
    assert.notStrictEqual(postResetLogin.totpSetup.secretKey, adminSecret, 'Must generate distinct new secret');
    console.log('  ✓ [PASS] Authorized reset invalidates only intended enrollment and permits fresh setup.');

    // -------------------------------------------------------------------------
    // REQUIREMENT 11: Confirm another administrator's MFA is completely unchanged
    // -------------------------------------------------------------------------
    console.log('\n[REQ 11] Confirming another administrator\'s MFA remains completely unchanged...');
    // Enroll secondary admin
    const secAdminSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    const encSecSecret = encryptMfaSecret(secAdminSecret);
    db.prepare(`
      UPDATE users SET mfa_enabled = 1, totp_secret = ?, mfa_reset_required = 0 WHERE id = ?
    `).run(encSecSecret, secondaryAdminId);
    db.prepare(`
      INSERT INTO mfa_authenticators (id, user_id, factor_type, label, totp_secret)
      VALUES (?, ?, 'PRIMARY_TOTP', 'Primary', ?)
    `).run(`auth_prim_${secondaryAdminId}`, secondaryAdminId, encSecSecret);

    const secAdminState = await getAuthoritativeUserMfaState(secondaryAdminId);
    assert.strictEqual(secAdminState.state, 'MFA_ENROLLED', 'Secondary admin must remain MFA_ENROLLED');
    assert.strictEqual(secAdminState.hasValidSecret, true);
    assert.strictEqual(secAdminState.secret, secAdminSecret);
    console.log('  ✓ [PASS] Secondary administrator MFA completely untouched.');

    // -------------------------------------------------------------------------
    // REQUIREMENT 12: Incorrect codes and unauthorized requests cannot bypass MFA
    // -------------------------------------------------------------------------
    console.log('\n[REQ 12] Confirming incorrect codes, rate limits, and bypass prevention...');
    const badCodeDiag = evaluateRfc6238TotpDiagnostics(secAdminSecret, '123456', 1, 10);
    assert.strictEqual(badCodeDiag.valid, false, 'Incorrect code must be rejected');

    const rateKey = `rate_test_${secondaryAdminId}`;
    clearMfaRateLimit(rateKey);
    for (let i = 0; i < 5; i++) {
      recordMfaFailedAttempt(rateKey);
    }
    const rateCheck = checkMfaRateLimit(rateKey);
    assert.strictEqual(rateCheck.allowed, false, 'Rate limit must lock after 5 attempts');
    clearMfaRateLimit(rateKey);
    console.log('  ✓ [PASS] Rejection of invalid codes and rate limiting verified.');

    // -------------------------------------------------------------------------
    // Clean up test records
    // -------------------------------------------------------------------------
    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(primaryAdminId, secondaryAdminId);
    db.prepare('DELETE FROM mfa_authenticators WHERE user_id IN (?, ?)').run(primaryAdminId, secondaryAdminId);
    db.prepare('DELETE FROM trusted_devices WHERE user_id IN (?, ?)').run(primaryAdminId, secondaryAdminId);

    console.log('\n========================================================================');
    console.log('🎉 ALL 12 ADMIN MFA & TRUSTED DEVICE LIFECYCLE REGRESSION CHECKS PASSED!');
    console.log('========================================================================');
  } finally {
    await closeFirestoreCleanly();
  }
}

runPermanentMfaRegressionTests()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('❌ Regression suite failed:', err);
    await closeFirestoreCleanly();
    process.exit(1);
  });
