import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adminRoutes = readFileSync(new URL('../routes/adminRoutes.ts', import.meta.url), 'utf8');
const firestoreSync = readFileSync(new URL('../services/firestoreSyncService.ts', import.meta.url), 'utf8');

test('admin status changes persist both the user document and suspension ledger', () => {
  assert.match(adminRoutes, /async function persistUserStatusAndSuspensions\(userId: string\)/);
  assert.match(adminRoutes, /setFirestoreDoc\('account_suspensions', String\(suspension\.id\), suspension\)/);
  assert.match(adminRoutes, /setFirestoreDoc\('users', userId, user\)/);

  const start = adminRoutes.indexOf("router.put('/users/:id/status'");
  const end = adminRoutes.indexOf('// Revocation Requests Listing (Admin Portal)', start);
  assert.ok(start >= 0 && end > start, 'Admin status route must exist');
  const statusRoute = adminRoutes.slice(start, end);
  assert.match(statusRoute, /await persistUserStatusAndSuspensions\(userId\)/);
  assert.match(statusRoute, /STATUS_PERSISTENCE_FAILED/);
});

test('Firestore hydration restores suspension records and prevents stale ACTIVE user documents from reactivating users', () => {
  assert.match(firestoreSync, /readDocs<any>\('account_suspensions'\)/);
  assert.match(firestoreSync, /WHERE s\.status = 'SUSPENDED' AND u\.status = 'ACTIVE'/);
  assert.match(firestoreSync, /SET status = 'SUSPENDED', updated_at = CURRENT_TIMESTAMP/);
  assert.match(firestoreSync, /Enforced active suspension for user/);
  assert.match(firestoreSync, /Repair any legacy suspension that was previously written only to SQLite/);
  assert.match(firestoreSync, /setFirestoreDoc\('users', suspended\.user_id, enforcedUser\)/);
  assert.match(firestoreSync, /setFirestoreDoc\('account_suspensions', String\(suspension\.id\), suspension\)/);
});

test('appeal decisions also persist the resulting account and suspension states', () => {
  const start = adminRoutes.indexOf("router.post('/revocation-requests/:id/review'");
  const end = adminRoutes.indexOf('// Adjust student credits manually', start);
  assert.ok(start >= 0 && end > start, 'Revocation review route must exist');
  const reviewRoute = adminRoutes.slice(start, end);
  assert.match(reviewRoute, /await persistUserStatusAndSuspensions\(request\.user_id\)/);
  assert.match(reviewRoute, /STATUS_PERSISTENCE_FAILED/);
});
