import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const firestoreAdapter = readFileSync(new URL('../services/firestoreDbService.ts', import.meta.url), 'utf8');
const authRoutes = readFileSync(new URL('../routes/authRoutes.ts', import.meta.url), 'utf8');
const firestoreSync = readFileSync(new URL('../services/firestoreSyncService.ts', import.meta.url), 'utf8');
const adminRoutes = readFileSync(new URL('../routes/adminRoutes.ts', import.meta.url), 'utf8');

test('Firestore client rules default-deny all direct browser access', () => {
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  assert.doesNotMatch(rules, /allow\s+(?:read|write|read,\s*write):\s*if\s+true/);
});

test('backend Firestore persistence uses the privileged Admin SDK adapter', () => {
  assert.match(firestoreAdapter, /from 'firebase-admin\/app'/);
  assert.match(firestoreAdapter, /from 'firebase-admin\/firestore'/);
  assert.doesNotMatch(firestoreAdapter, /from 'firebase\/firestore'/);
  assert.match(firestoreAdapter, /applicationDefault\(\)/);
  assert.match(firestoreAdapter, /findFirestoreDocsByField/);
  assert.doesNotMatch(authRoutes, /from 'firebase\/firestore'/);
  assert.match(authRoutes, /findFirestoreDocsByField<any>\('users', 'email', normalizedEmail, 1\)/);
});

test('account status decisions are append-only and the latest event is authoritative during hydration', () => {
  assert.match(firestoreAdapter, /transaction\.create\(eventRef, event\)/);
  assert.match(firestoreAdapter, /account_status_sequences/);
  assert.match(adminRoutes, /appendAccountStatusEvent\(/);
  assert.match(firestoreSync, /readDocs<any>\('account_status_events'\)/);
  assert.match(firestoreSync, /Enforce the highest versioned status event/);
  assert.match(firestoreSync, /Backfilled durable suspension event/);
});

test('student registration claims ICAI identity globally before the local account transaction', () => {
  assert.match(firestoreAdapter, /claimStudentRegistrationNumber/);
  assert.match(firestoreAdapter, /createHash\('sha256'\)\.update\(numericSequence\)/);
  assert.match(firestoreAdapter, /collection\('student_registration_claims'\)/);
  assert.match(firestoreAdapter, /transaction\.create\(claimRef/);
  assert.match(firestoreAdapter, /releaseStudentRegistrationNumberClaim/);

  const verificationStart = authRoutes.indexOf("router.post('/verify-otp'");
  const verificationEnd = authRoutes.indexOf('// Normal Professional SaaS Login', verificationStart);
  assert.ok(verificationStart >= 0 && verificationEnd > verificationStart);
  const verificationRoute = authRoutes.slice(verificationStart, verificationEnd);
  const claimIndex = verificationRoute.indexOf('await claimStudentRegistrationNumber(');
  const localTransactionIndex = verificationRoute.indexOf("db.exec('BEGIN IMMEDIATE')");
  assert.ok(claimIndex >= 0 && localTransactionIndex > claimIndex, 'Global SRN claim must happen before local account creation');
  assert.match(verificationRoute, /SRN_CLAIM_UNAVAILABLE/);
  assert.match(verificationRoute, /Could not release SRN claim after failed account creation/);
});
