import assert from 'node:assert/strict';
import { db, initDatabase } from '../db.js';
import { checkPermanentFreeAccess, getStudentEntitlement } from '../auth.js';

initDatabase();

const email = 'adityakumart484@gmail.com';
assert.equal(checkPermanentFreeAccess(email), true, 'The founder account must retain an active case-insensitive permanent-free entitlement.');
assert.equal(checkPermanentFreeAccess('  ADITYAKUMART484@GMAIL.COM  '), true, 'Email normalization must not change permanent-free access.');

const account = db.prepare('SELECT id, email FROM users WHERE lower(email) = ? LIMIT 1').get(email) as
  | { id: string; email: string }
  | undefined;
assert.ok(account, 'The seeded founder account must exist before entitlement can be resolved.');

const entitlement = getStudentEntitlement(account.id, 'PUBLIC');
assert.equal(entitlement.canEvaluate, true, 'Permanent-free account must be able to evaluate.');
assert.equal(entitlement.tier, 'PERMANENT_FREE', 'Permanent access must take priority over monthly, promo, paid-credit and institute quota balances.');
assert.equal(entitlement.hasPermanentFreeAccess, true);
assert.equal(entitlement.freeEvaluationsRemaining, 9999);
assert.equal(entitlement.purchasedCredits, 9999);
assert.equal(entitlement.instituteSponsored, false);

console.log('Permanent-free evaluation access tests passed.');
