import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, initDatabase } from '../db.js';
import {
  getActiveInstituteSubscription,
  INSTITUTE_FREE_TRIAL_PLAN_ID,
} from '../services/instituteTrialService.js';
import {
  recoverInstituteAccountFromFirestoreByEmail,
  type InstituteAccountRecoveryAdapter,
} from '../services/instituteAccountPersistenceService.js';

async function run() {
  initDatabase();
  const suffix = crypto.randomBytes(6).toString('hex').toUpperCase();
  const email = `legacy-placeholder-${suffix.toLowerCase()}@example.test`;
  const userId = `usr_legacy_placeholder_${suffix.toLowerCase()}`;
  const canonicalId = `inst_canonical_${suffix.toLowerCase()}`;
  const placeholderId = `inst_placeholder_${suffix.toLowerCase()}`;
  const canonicalBatchId = `batch_canonical_${suffix.toLowerCase()}`;
  const placeholderBatchId = `batch_placeholder_${suffix.toLowerCase()}`;
  const subscriptionId = `sub_legacy_trial_${suffix.toLowerCase()}`;
  const claimId = `claim_legacy_trial_${suffix.toLowerCase()}`;

  const user = {
    id: userId,
    email,
    password_hash: 'verified-password-hash',
    full_name: 'Test Admin',
    phone: '9999999999',
    role: 'INSTITUTE_ADMIN',
    status: 'ACTIVE',
  };
  const canonical = {
    id: canonicalId,
    name: 'Original Coaching Institute',
    code: `ORIG-${suffix.slice(0, 6)}`,
    email,
    phone: '9999999999',
    address: 'Original institute address',
    website: 'https://original.example.test',
    contact_person: 'Test Admin',
    status: 'ACTIVE',
    subscription_plan: 'PENDING_SELECTION',
    max_students: 50,
    created_at: '2026-10-01T00:00:00.000Z',
  };
  const cloudPlaceholder = {
    id: placeholderId,
    name: 'Test Admin Academy',
    code: `INST-${suffix.slice(0, 6)}`,
    email,
    phone: '9999999999',
    address: '',
    website: '',
    contact_person: 'Test Admin',
    status: 'ACTIVE',
    subscription_plan: INSTITUTE_FREE_TRIAL_PLAN_ID,
    max_students: 50,
    created_at: '2026-11-01T00:00:00.000Z',
  };
  const canonicalBatch = {
    id: canonicalBatchId,
    institute_id: canonicalId,
    name: 'Original First Batch',
    course_level: 'INTERMEDIATE',
    description: 'Original institute batch',
  };
  const signupAudit = {
    id: `audit_signup_${suffix.toLowerCase()}`,
    user_id: userId,
    action: 'INSTITUTE_SIGNUP',
    entity_type: 'INSTITUTE',
    entity_id: canonicalId,
  };

  const adapter: InstituteAccountRecoveryAdapter = {
    isConfigured: () => true,
    findInstitutesByEmail: async (lookupEmail) =>
      [canonical, cloudPlaceholder].filter((row) => row.email.toLowerCase() === lookupEmail),
    findUsersByEmail: async (lookupEmail) =>
      user.email.toLowerCase() === lookupEmail ? [user] : [],
    findBatchesByInstituteId: async (lookupId) =>
      lookupId === canonicalId ? [canonicalBatch] : [],
    findInstituteSignupAuditLogs: async (lookupUserId) =>
      lookupUserId === userId ? [signupAudit] : [],
    getDocument: async <T>(_collectionName: string, _id: string) => null as T | null,
    isTombstoned: async () => false,
  };

  try {
    db.prepare('DELETE FROM institute_trial_claims WHERE id = ?').run(claimId);
    db.prepare('DELETE FROM institute_subscriptions WHERE id = ?').run(subscriptionId);
    db.prepare('DELETE FROM batches WHERE institute_id IN (?, ?)').run(canonicalId, placeholderId);
    db.prepare('DELETE FROM institutes WHERE id IN (?, ?)').run(canonicalId, placeholderId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
      VALUES (?, ?, ?, ?, ?, 'INSTITUTE_ADMIN', 'ACTIVE')
    `).run(userId, email, user.password_hash, user.full_name, user.phone);

    // Simulate the old institute route's fabricated "{Admin Name} Academy" row.
    db.prepare(`
      INSERT INTO institutes (
        id, name, code, logo_url, email, phone, address, website,
        contact_person, status, subscription_plan, max_students, created_at
      ) VALUES (?, ?, ?, '', ?, ?, '', '', ?, 'ACTIVE', ?, 50, CURRENT_TIMESTAMP)
    `).run(
      placeholderId, cloudPlaceholder.name, cloudPlaceholder.code, email,
      user.phone, user.full_name, INSTITUTE_FREE_TRIAL_PLAN_ID,
    );
    db.prepare(`
      INSERT INTO batches (id, institute_id, name, course_level, description)
      VALUES (?, ?, 'First Batch - Foundation & Inter', 'INTERMEDIATE', 'Old temporary batch')
    `).run(placeholderBatchId, placeholderId);

    // The legacy path may already have granted the 50/50 trial to the
    // placeholder. Recovery must move, not reset or duplicate, that entitlement.
    db.prepare(`
      INSERT INTO institute_subscriptions (
        id, institute_id, plan_id, billing_cycle, price_inr, student_capacity,
        evaluation_allowance, evaluations_used, evaluations_remaining,
        start_date, expiry_date, status
      ) VALUES (?, ?, ?, 'TRIAL', 0, 50, 50, 0, 50, ?, ?, 'ACTIVE')
    `).run(
      subscriptionId, placeholderId, INSTITUTE_FREE_TRIAL_PLAN_ID,
      '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z',
    );
    db.prepare(`
      INSERT INTO institute_trial_claims (
        id, institute_id, admin_user_id, admin_email, subscription_id, claimed_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      claimId, placeholderId, userId, email, subscriptionId,
      '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z',
    );

    const recovered = await recoverInstituteAccountFromFirestoreByEmail(email, userId, adapter);
    assert.equal(recovered, 'recovered',
      'The original audited Firestore institute must replace an empty legacy placeholder.');

    const restored = db.prepare('SELECT id, name, email, status FROM institutes WHERE id = ?').get(canonicalId) as any;
    assert.equal(restored?.id, canonicalId);
    assert.equal(restored?.name, canonical.name);
    assert.equal(restored?.email, email);
    assert.equal(restored?.status, 'ACTIVE');

    const archived = db.prepare('SELECT email, status FROM institutes WHERE id = ?').get(placeholderId) as any;
    assert.equal(archived?.status, 'RECOVERED_DUPLICATE');
    assert.notEqual(archived?.email, email);

    const migratedBatch = db.prepare('SELECT institute_id, name FROM batches WHERE id = ?').get(canonicalBatchId) as any;
    assert.equal(migratedBatch?.institute_id, canonicalId);
    const migratedTrial = getActiveInstituteSubscription(canonicalId);
    assert.equal(migratedTrial?.plan_id, INSTITUTE_FREE_TRIAL_PLAN_ID);
    assert.equal(Number(migratedTrial?.student_capacity), 50);
    assert.equal(Number(migratedTrial?.evaluation_allowance), 50);
    assert.equal(Number(migratedTrial?.evaluations_remaining), 50);

    const migratedClaim = db.prepare('SELECT institute_id, admin_user_id, admin_email FROM institute_trial_claims WHERE id = ?').get(claimId) as any;
    assert.equal(migratedClaim?.institute_id, canonicalId);
    assert.equal(migratedClaim?.admin_user_id, userId);
    assert.equal(migratedClaim?.admin_email, email);

    const repeated = await recoverInstituteAccountFromFirestoreByEmail(email, userId, adapter);
    assert.equal(repeated, 'already-present',
      'Repeated login must resolve to the same canonical institute without granting a second trial.');

    // Never auto-replace a real institute placeholder if it already holds operational data.
    const unsafeEmail = `unsafe-placeholder-${suffix.toLowerCase()}@example.test`;
    const unsafeUserId = `usr_unsafe_placeholder_${suffix.toLowerCase()}`;
    const unsafeCanonicalId = `inst_unsafe_canonical_${suffix.toLowerCase()}`;
    const unsafePlaceholderId = `inst_unsafe_placeholder_${suffix.toLowerCase()}`;
    const unsafeCanonical = {
      ...canonical,
      id: unsafeCanonicalId,
      email: unsafeEmail,
      code: `UNSAFE-${suffix.slice(0, 6)}`,
    };
    const unsafeCloudPlaceholder = {
      ...cloudPlaceholder,
      id: unsafePlaceholderId,
      email: unsafeEmail,
    };
    const unsafeUser = { ...user, id: unsafeUserId, email: unsafeEmail };
    const unsafeAdapter: InstituteAccountRecoveryAdapter = {
      ...adapter,
      findInstitutesByEmail: async (lookupEmail) =>
        lookupEmail === unsafeEmail ? [unsafeCanonical, unsafeCloudPlaceholder] : [],
      findUsersByEmail: async (lookupEmail) =>
        lookupEmail === unsafeEmail ? [unsafeUser] : [],
      findInstituteSignupAuditLogs: async (lookupUserId) =>
        lookupUserId === unsafeUserId ? [{
          ...signupAudit,
          user_id: unsafeUserId,
          entity_id: unsafeCanonicalId,
        }] : [],
      findBatchesByInstituteId: async (lookupId) =>
        lookupId === unsafeCanonicalId ? [{ ...canonicalBatch, id: `batch_${unsafeUserId}`, institute_id: unsafeCanonicalId }] : [],
    };
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
      VALUES (?, ?, ?, ?, ?, 'INSTITUTE_ADMIN', 'ACTIVE')
    `).run(unsafeUserId, unsafeEmail, unsafeUser.password_hash, unsafeUser.full_name, unsafeUser.phone);
    db.prepare(`
      INSERT INTO institutes (
        id, name, code, logo_url, email, phone, address, website,
        contact_person, status, subscription_plan, max_students
      ) VALUES (?, 'Test Admin Academy', ?, '', ?, '9999999999', '', '', 'Test Admin', 'ACTIVE', 'NONE', 50)
    `).run(unsafePlaceholderId, `INST-${suffix.slice(0, 6)}`, unsafeEmail);
    db.prepare(`
      INSERT INTO institute_assignments (
        id, institute_id, title, subject_key, subject_name, maximum_marks, deadline
      ) VALUES (?, ?, 'Existing Assignment', 'law', 'Corporate Law', 100, '2026-12-01T00:00:00.000Z')
    `).run(`asgn_${unsafeUserId}`, unsafePlaceholderId);
    assert.equal(
      await recoverInstituteAccountFromFirestoreByEmail(unsafeEmail, unsafeUserId, unsafeAdapter),
      'conflict',
      'A temporary-looking row with real institute activity must never be overwritten.',
    );
    db.prepare('DELETE FROM institute_assignments WHERE institute_id = ?').run(unsafePlaceholderId);
    db.prepare('DELETE FROM institutes WHERE id IN (?, ?)').run(unsafeCanonicalId, unsafePlaceholderId);
    db.prepare('DELETE FROM users WHERE id = ?').run(unsafeUserId);

    console.log('PASS: audited original institute is restored over empty legacy placeholder; trial and safety checks preserved.');
  } finally {
    db.prepare('DELETE FROM institute_trial_claims WHERE institute_id IN (?, ?) OR id = ?').run(canonicalId, placeholderId, claimId);
    db.prepare('DELETE FROM institute_subscriptions WHERE institute_id IN (?, ?) OR id = ?').run(canonicalId, placeholderId, subscriptionId);
    db.prepare('DELETE FROM batches WHERE institute_id IN (?, ?)').run(canonicalId, placeholderId);
    db.prepare('DELETE FROM institutes WHERE id IN (?, ?)').run(canonicalId, placeholderId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
