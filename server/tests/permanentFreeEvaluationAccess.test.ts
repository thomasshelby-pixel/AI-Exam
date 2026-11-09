import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, initDatabase } from '../db.js';
import { checkPermanentFreeAccess, getStudentEntitlement } from '../auth.js';

initDatabase();

const email = 'adityakumart484@gmail.com';
assert.equal(checkPermanentFreeAccess(email), true, 'The founder account must retain an active case-insensitive permanent-free entitlement.');
assert.equal(checkPermanentFreeAccess('  ADITYAKUMART484@GMAIL.COM  '), true, 'Email normalization must not change permanent-free access.');

const existingAccount = db.prepare('SELECT id, email FROM users WHERE lower(email) = ? LIMIT 1').get(email) as
  | { id: string; email: string }
  | undefined;
const testUserId = existingAccount?.id || `usr_test_permanent_free_${crypto.randomBytes(5).toString('hex')}`;

if (!existingAccount) {
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, ?, 'test_only_hash', 'Permanent Free Regression Student', 'STUDENT', 'ACTIVE')
  `).run(testUserId, email);
}

try {
  const entitlement = getStudentEntitlement(testUserId, 'PUBLIC');
  assert.equal(entitlement.canEvaluate, true, 'Permanent-free account must be able to evaluate.');
  assert.equal(entitlement.tier, 'PERMANENT_FREE', 'Permanent access must take priority over monthly, promo, paid-credit and institute quota balances.');
  assert.equal(entitlement.hasPermanentFreeAccess, true);
  assert.equal(entitlement.freeEvaluationsRemaining, 9999);
  assert.equal(entitlement.purchasedCredits, 9999);
  assert.equal(entitlement.instituteSponsored, false);
} finally {
  if (!existingAccount) {
    db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
  }
}

console.log('Permanent-free evaluation access tests passed.');
