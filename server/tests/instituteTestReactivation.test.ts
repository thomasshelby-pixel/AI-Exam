import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, initDatabase } from '../db.js';
import {
  ensureInstituteStarterTrial,
  getActiveInstituteSubscription,
  INSTITUTE_FREE_TRIAL_PLAN_ID,
} from '../services/instituteTrialService.js';
import {
  clearOrphanedTestInstituteTrialClaims,
  prepareOrphanedTestInstituteAdminForRegistration,
  type TestInstituteReactivationAdapter,
} from '../services/instituteTestReactivationService.js';

async function run() {
  initDatabase();
  const suffix = crypto.randomBytes(6).toString('hex');
  const email = `test-institute-${suffix}@example.test`;
  const userId = `usr_test_reactivation_${suffix}`;
  const claimId = `claim_test_reactivation_${suffix}`;
  const otherEmail = `other-institute-${suffix}@example.test`;
  const otherClaimId = `claim_other_reactivation_${suffix}`;
  const instituteId = `inst_test_reactivation_${suffix}`;

  process.env.ENABLE_TEST_ACCOUNT_MFA_BYPASS = 'true';
  process.env.MFA_TEST_BYPASS_EMAIL = email;

  const userRecord = {
    id: userId,
    email,
    password_hash: 'fresh-test-password-hash',
    full_name: 'Test Institute Admin',
    phone: '9999999999',
    role: 'INSTITUTE_ADMIN',
    status: 'ACTIVE',
    account_classification: 'TEST',
    signup_platform: 'WEB',
    mfa_enabled: 0,
    mfa_reset_required: 0,
  };

  const cloudUsers = new Map<string, Record<string, any>>([
    [userId, {
      id: userId,
      email,
      password_hash: 'old-cloud-test-password-hash',
      full_name: 'Old Test Admin',
      role: 'INSTITUTE_ADMIN',
      status: 'ACTIVE',
    }],
  ]);
  const cloudTrialClaims = new Map<string, Record<string, any>>([
    [claimId, { id: claimId, admin_user_id: userId, admin_email: email, institute_id: 'inst_old_test' }],
    [otherClaimId, { id: otherClaimId, admin_user_id: 'usr_other', admin_email: otherEmail, institute_id: 'inst_other' }],
  ]);
  const tombstonedClaims = new Set<string>();

  const adapter: TestInstituteReactivationAdapter = {
    isConfigured: () => true,
    findInstitutesByEmail: async () => [],
    findUsersByEmail: async (lookupEmail) => Array.from(cloudUsers.values())
      .filter((row) => String(row.email || '').toLowerCase() === lookupEmail),
    isUserTombstoned: async () => false,
    setUserDocument: async (id, data) => {
      cloudUsers.set(id, { id, ...data });
      return true;
    },
    getUserDocument: async (id) => cloudUsers.get(id) || null,
    findTrialClaimsByEmail: async (lookupEmail) => Array.from(cloudTrialClaims.values())
      .filter((row) => String(row.admin_email || '').toLowerCase() === lookupEmail),
    tombstoneTrialClaim: async (id) => {
      tombstonedClaims.add(id);
      return true;
    },
    deleteTrialClaim: async (id) => cloudTrialClaims.delete(id),
  };

  try {
    db.prepare('DELETE FROM institute_trial_claims WHERE id IN (?, ?)').run(claimId, otherClaimId);
    db.prepare('DELETE FROM institutes WHERE email = ?').run(email);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, phone, role, status, account_classification)
      VALUES (?, ?, 'old-test-password-hash', 'Old Test Admin', '9999999999', 'INSTITUTE_ADMIN', 'ACTIVE', 'TEST')
    `).run(userId, email);

    // A local orphaned admin may be reused only when the exact configured test
    // email has no local/cloud institute profile and no identity tombstone.
    const prepared = await prepareOrphanedTestInstituteAdminForRegistration({
      email,
      userId,
      userRecord,
    }, adapter);
    assert.equal(prepared, 'prepared');
    assert.equal(cloudUsers.get(userId)?.password_hash, userRecord.password_hash);
    assert.equal(cloudUsers.get(userId)?.email, email);

    // A different email is never eligible, even if all cloud records are absent.
    assert.equal(
      await prepareOrphanedTestInstituteAdminForRegistration({
        email: otherEmail,
        userId,
        userRecord: { ...userRecord, email: otherEmail },
      }, adapter),
      'not-eligible',
    );

    // Only this exact test email's old claim is removed. Other institutes' claims stay.
    db.prepare(`
      INSERT INTO institute_trial_claims (
        id, institute_id, admin_user_id, admin_email, subscription_id, claimed_at, expires_at
      ) VALUES (?, 'inst_old_test', ?, ?, 'sub_old_test', '2026-11-01', '2026-12-01')
    `).run(claimId, userId, email);
    db.prepare(`
      INSERT INTO institute_trial_claims (
        id, institute_id, admin_user_id, admin_email, subscription_id, claimed_at, expires_at
      ) VALUES (?, 'inst_other', 'usr_other', ?, 'sub_other', '2026-11-01', '2026-12-01')
    `).run(otherClaimId, otherEmail);

    const claimsReset = await clearOrphanedTestInstituteTrialClaims(email, userId, adapter);
    assert.equal(claimsReset, 'cleared');
    assert.equal(cloudTrialClaims.has(claimId), false);
    assert.equal(tombstonedClaims.has(claimId), true);
    assert.equal(cloudTrialClaims.has(otherClaimId), true);
    assert.equal(
      Number((db.prepare('SELECT COUNT(*) AS count FROM institute_trial_claims WHERE lower(admin_email) = ?').get(email) as any)?.count || 0),
      0,
    );
    assert.equal(
      Number((db.prepare('SELECT COUNT(*) AS count FROM institute_trial_claims WHERE lower(admin_email) = ?').get(otherEmail) as any)?.count || 0),
      1,
    );

    // After the stale test-email claim is cleared, its newly registered institute
    // can claim exactly one 30-day 50-seat / 50-credit trial.
    db.prepare(`
      INSERT INTO institutes (
        id, name, code, email, phone, address, website, contact_person, status,
        subscription_plan, max_students
      ) VALUES (?, 'Fresh Test Institute', ?, ?, '9999999999', '', '', 'Test Institute Admin',
        'ACTIVE', 'PENDING_SELECTION', 50)
    `).run(instituteId, `TEST-${suffix.toUpperCase()}`, email);
    const trial = ensureInstituteStarterTrial({
      instituteId,
      adminUserId: userId,
      adminEmail: email,
    });
    assert.equal(trial.granted, true);
    const activeTrial = getActiveInstituteSubscription(instituteId);
    assert.equal(activeTrial?.plan_id, INSTITUTE_FREE_TRIAL_PLAN_ID);
    assert.equal(Number(activeTrial?.student_capacity), 50);
    assert.equal(Number(activeTrial?.evaluation_allowance), 50);
    assert.equal(Number(activeTrial?.evaluations_remaining), 50);
    assert.equal(Number(activeTrial?.evaluations_used), 0);
    assert.ok(activeTrial?.expiry_date);

    const conflictAdapter: TestInstituteReactivationAdapter = {
      ...adapter,
      findInstitutesByEmail: async () => [{ id: 'inst_real_conflict', email }],
    };
    assert.equal(
      await prepareOrphanedTestInstituteAdminForRegistration({
        email,
        userId,
        userRecord,
      }, conflictAdapter),
      'conflict',
      'An existing institute profile must never be overwritten by the test reset path.',
    );

    const tombstoneAdapter: TestInstituteReactivationAdapter = {
      ...adapter,
      isUserTombstoned: async () => true,
    };
    assert.equal(
      await prepareOrphanedTestInstituteAdminForRegistration({
        email,
        userId,
        userRecord,
      }, tombstoneAdapter),
      'conflict',
      'Deleted/tombstoned admin identities must never be resurrected.',
    );

    console.log('PASS: exact test-email re-registration is isolated; old test claim reset preserves other institutes.');
  } finally {
    db.prepare('DELETE FROM audit_logs WHERE entity_id = ? AND action = ?').run(instituteId, 'INSTITUTE_FREE_TRIAL_ACTIVATED');
    db.prepare('DELETE FROM institute_trial_claims WHERE institute_id = ? OR id IN (?, ?)').run(instituteId, claimId, otherClaimId);
    db.prepare('DELETE FROM institute_subscriptions WHERE institute_id = ?').run(instituteId);
    db.prepare('DELETE FROM institutes WHERE id = ?').run(instituteId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    delete process.env.ENABLE_TEST_ACCOUNT_MFA_BYPASS;
    delete process.env.MFA_TEST_BYPASS_EMAIL;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
