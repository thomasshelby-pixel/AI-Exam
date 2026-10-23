import assert from 'node:assert/strict';
import { db, initDatabase, hashPassword } from '../db.js';
import {
  getSelfDeleteVerificationOptions,
  initiateSelfDeleteEmailOtp,
} from '../services/studentDeleteService.js';

process.env.NODE_ENV = 'test';

async function runStudentSelfDeleteVerificationTests() {
  initDatabase();

  const suffix = Date.now();
  const accounts = [
    { id: `self_delete_google_${suffix}`, marker: 'GOOGLE_OAUTH', expected: 'EMAIL_OTP' },
    { id: `self_delete_apple_${suffix}`, marker: 'APPLE_OAUTH', expected: 'EMAIL_CONFIRMATION' },
    { id: `self_delete_external_${suffix}`, marker: 'EXTERNAL_OAUTH', expected: 'EMAIL_CONFIRMATION' },
    { id: `self_delete_password_${suffix}`, marker: hashPassword('TestPassword@2026!'), expected: 'PASSWORD' },
    { id: `self_delete_disabled_${suffix}`, marker: 'DISABLED_ACCOUNT_CANNOT_LOGIN', expected: 'EMAIL_CONFIRMATION' },
  ] as const;

  for (const [index, account] of accounts.entries()) {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, status)
      VALUES (?, ?, ?, ?, 'STUDENT', 'ACTIVE')
    `).run(
      account.id,
      `self-delete-${index}-${suffix}@example.com`,
      account.marker,
      'Deletion Test Student',
    );

    const options = getSelfDeleteVerificationOptions(account.id);
    assert.equal(options.verificationMethod, account.expected, `${account.marker} must retain the expected deletion verification flow`);
    assert.equal(options.requiresEmailOtp, account.expected === 'EMAIL_OTP');
    assert.ok(options.maskedEmail.includes('@'), 'Verification options should return a masked email address');
  }

  await assert.rejects(
    () => initiateSelfDeleteEmailOtp(accounts[1].id),
    (error: any) => error?.code === 'EMAIL_OTP_NOT_REQUIRED',
    'Apple accounts must retain the previous registered-email confirmation flow rather than being switched to Google OTP behavior',
  );

  await assert.rejects(
    () => initiateSelfDeleteEmailOtp(accounts[2].id),
    (error: any) => error?.code === 'EMAIL_OTP_NOT_REQUIRED',
    'Legacy external OAuth accounts must retain their previous deletion flow',
  );

  console.log('✅ Student self-delete verification provider regression tests passed.');
  process.exit(0);
}

runStudentSelfDeleteVerificationTests().catch((error) => {
  console.error('❌ Student self-delete verification test failed:', error);
  process.exit(1);
});
