import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, initDatabase } from '../db.js';

process.env.NODE_ENV = 'test';
const { requireRole } = await import('../auth.js');

initDatabase();

const suffix = crypto.randomBytes(6).toString('hex');
const testUserId = `usr_require_role_test_${suffix}`;
const normalUserId = `usr_require_role_normal_${suffix}`;
const testEmail = 'test@gmail.com';
const normalEmail = `regular.admin.${suffix}@example.test`;

type InvokeResult = {
  statusCode: number;
  body?: any;
  nextCalled: boolean;
};

function invokeInstituteAdminGuard(userId: string, email: string): InvokeResult {
  const result: InvokeResult = { statusCode: 200, nextCalled: false };
  const req = {
    user: {
      id: userId,
      email,
      role: 'INSTITUTE_ADMIN',
      fullName: 'Test Institute Admin',
      mfaVerified: false,
    },
    headers: {},
    query: {},
  } as any;
  const res = {
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
  } as any;

  requireRole('INSTITUTE_ADMIN')(req, res, (() => {
    result.nextCalled = true;
  }) as any);

  return result;
}

try {
  db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(testUserId, normalUserId);
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status, account_classification, mfa_enabled)
    VALUES (?, ?, 'test-hash', 'Designated Test Institute', 'INSTITUTE_ADMIN', 'ACTIVE', 'TEST', 0)
  `).run(testUserId, testEmail);
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status, account_classification, mfa_enabled)
    VALUES (?, ?, 'test-hash', 'Regular Institute', 'INSTITUTE_ADMIN', 'ACTIVE', 'NORMAL', 0)
  `).run(normalUserId, normalEmail);

  const designated = invokeInstituteAdminGuard(testUserId, testEmail);
  assert.equal(
    designated.nextCalled,
    true,
    'The exact active TEST Institute Admin must pass protected API MFA enforcement.',
  );
  assert.equal(designated.statusCode, 200);

  const regular = invokeInstituteAdminGuard(normalUserId, normalEmail);
  assert.equal(
    regular.nextCalled,
    false,
    'A regular Institute Admin without verified MFA must remain blocked.',
  );
  assert.equal(regular.statusCode, 403);
  assert.equal(regular.body?.code, 'MFA_REQUIRED');

  console.log('PASS: requireRole honors the single test Institute Admin exemption while keeping normal admins protected.');
} finally {
  db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(testUserId, normalUserId);
}
