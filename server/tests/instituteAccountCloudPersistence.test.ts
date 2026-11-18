import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, initDatabase } from '../db.js';
import {
  persistInstituteAccountToFirestore,
  recoverInstituteAccountFromFirestoreByEmail,
  type InstituteAccountPersistenceAdapter,
  type InstituteAccountRecoveryAdapter,
} from '../services/instituteAccountPersistenceService.js';

async function run() {
  initDatabase();
  const suffix = crypto.randomBytes(6).toString('hex');
  const instituteId = `inst_cloud_persist_${suffix}`;
  const userId = `usr_inst_cloud_persist_${suffix}`;
  const batchId = `batch_inst_cloud_persist_${suffix}`;
  const auditId = `log_inst_cloud_persist_${suffix}`;
  const email = `institute-cloud-${suffix}@example.test`;

  const institute = {
    id: instituteId,
    name: 'Cloud Persistence Institute',
    code: `CLOUD-${suffix.toUpperCase()}`,
    logo_url: '',
    email,
    phone: '9999999999',
    address: 'Test Address',
    website: '',
    contact_person: 'Institute Admin',
    status: 'ACTIVE',
    subscription_plan: 'PENDING_SELECTION',
    subscription_expires_at: null,
    max_students: 50,
    created_at: new Date().toISOString(),
  };
  const user = {
    id: userId,
    email,
    password_hash: 'existing-password-hash',
    full_name: 'Institute Admin',
    phone: '9999999999',
    role: 'INSTITUTE_ADMIN',
    status: 'ACTIVE',
    account_classification: 'NORMAL',
    signup_platform: 'WEB',
    mfa_enabled: 0,
    mfa_reset_required: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const batch = {
    id: batchId,
    institute_id: instituteId,
    name: 'First Batch',
    course_level: 'INTERMEDIATE',
    description: 'Default institute batch',
    created_at: new Date().toISOString(),
  };
  const auditLog = {
    id: auditId,
    user_id: userId,
    action: 'INSTITUTE_SIGNUP',
    entity_type: 'INSTITUTE',
    entity_id: instituteId,
    details: 'Registered institute',
    created_at: new Date().toISOString(),
  };

  const documents = new Map<string, Record<string, any>>();
  const adapter: InstituteAccountPersistenceAdapter = {
    isConfigured: () => true,
    findInstitutesByEmail: async (lookupEmail) => Array.from(documents.entries())
      .filter(([key, value]) => key.startsWith('institutes/') && String(value.email || '').toLowerCase() === lookupEmail)
      .map(([, value]) => value),
    findUsersByEmail: async (lookupEmail) => Array.from(documents.entries())
      .filter(([key, value]) => key.startsWith('users/') && String(value.email || '').toLowerCase() === lookupEmail)
      .map(([, value]) => value),
    findBatchesByInstituteId: async (lookupId) => Array.from(documents.entries())
      .filter(([key, value]) => key.startsWith('batches/') && String(value.institute_id || '') === lookupId)
      .map(([, value]) => value),
    getDocument: async <T>(collectionName: string, id: string) =>
      (documents.get(`${collectionName}/${id}`) as T | undefined) ?? null,
    isTombstoned: async () => false,
    setDocumentsAtomically: async (writes) => {
      for (const write of writes) {
        documents.set(`${write.collectionName}/${write.docId}`, {
          id: write.docId,
          ...write.data,
          _updatedAt: new Date().toISOString(),
        });
      }
      return true;
    },
  };

  try {
    db.prepare('DELETE FROM institute_memberships WHERE institute_id = ?').run(instituteId);
    db.prepare('DELETE FROM batches WHERE institute_id = ?').run(instituteId);
    db.prepare('DELETE FROM institutes WHERE id = ?').run(instituteId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    const persisted = await persistInstituteAccountToFirestore({
      institute,
      user,
      batches: [batch],
      auditLogs: [auditLog],
    }, adapter);
    assert.equal(persisted, 'persisted',
      'Institute signup must be considered durable only after every cloud record is read back.');
    assert.ok(documents.has(`institutes/${instituteId}`));
    assert.ok(documents.has(`users/${userId}`));
    assert.ok(documents.has(`batches/${batchId}`));
    assert.ok(documents.has(`audit_logs/${auditId}`));

    const failedWriteAdapter: InstituteAccountPersistenceAdapter = {
      ...adapter,
      setDocumentsAtomically: async () => false,
    };
    const failedInstituteId = `inst_failed_${suffix}`;
    const failedUserId = `usr_failed_${suffix}`;
    const failedEmail = `failed-${suffix}@example.test`;
    assert.equal(
      await persistInstituteAccountToFirestore({
        institute: { ...institute, id: failedInstituteId, email: failedEmail },
        user: { ...user, id: failedUserId, email: failedEmail },
        batches: [{ ...batch, id: `batch_failed_${suffix}`, institute_id: failedInstituteId }],
        auditLogs: [],
      }, failedWriteAdapter),
      'failed',
      'An unconfirmed batch write must never be reported as durable.',
    );

    const unconfiguredAdapter: InstituteAccountPersistenceAdapter = {
      ...adapter,
      isConfigured: () => false,
    };
    assert.equal(
      await persistInstituteAccountToFirestore({ institute, user, batches: [batch], auditLogs: [auditLog] }, unconfiguredAdapter),
      'unconfigured',
      'Missing Firestore configuration must be an explicit non-success.',
    );

    const tombstonedAdapter: InstituteAccountPersistenceAdapter = {
      ...adapter,
      isTombstoned: async (collectionName, id) => collectionName === 'institutes' && id === instituteId,
    };
    assert.equal(
      await persistInstituteAccountToFirestore({ institute, user, batches: [batch], auditLogs: [auditLog] }, tombstonedAdapter),
      'conflict',
      'A deleted institute must never be silently recreated by signup.',
    );

    const conflictingCloudAdapter: InstituteAccountPersistenceAdapter = {
      ...adapter,
      findInstitutesByEmail: async () => [{ ...institute, id: `${instituteId}_other` }],
    };
    assert.equal(
      await persistInstituteAccountToFirestore({ institute, user, batches: [batch], auditLogs: [auditLog] }, conflictingCloudAdapter),
      'conflict',
      'A second ID using the same institute email must be blocked.',
    );

    // Simulate a fresh deployment: Firestore still has the original identity,
    // while SQLite no longer contains the institute, user or batch.
    const recovered = await recoverInstituteAccountFromFirestoreByEmail(email, userId, adapter);
    assert.equal(recovered, 'recovered',
      'A fresh runtime must restore the same institute/admin/batch IDs from Firestore.');
    const restoredUser = db.prepare('SELECT id, email, role, password_hash FROM users WHERE id = ?').get(userId) as any;
    const restoredInstitute = db.prepare('SELECT id, email, code, name FROM institutes WHERE id = ?').get(instituteId) as any;
    const restoredBatch = db.prepare('SELECT id, institute_id, name FROM batches WHERE id = ?').get(batchId) as any;
    assert.equal(restoredUser?.id, userId);
    assert.equal(restoredUser?.email, email);
    assert.equal(restoredUser?.role, 'INSTITUTE_ADMIN');
    assert.equal(restoredUser?.password_hash, user.password_hash);
    assert.equal(restoredInstitute?.id, instituteId);
    assert.equal(restoredInstitute?.email, email);
    assert.equal(restoredInstitute?.code, institute.code);
    assert.equal(restoredBatch?.id, batchId);
    assert.equal(restoredBatch?.institute_id, instituteId);

    assert.equal(
      await recoverInstituteAccountFromFirestoreByEmail(email, userId, adapter),
      'already-present',
      'A repeated login/recovery must not create duplicate institutes or batches.',
    );

    // Login-time backfill must not replace newer authoritative cloud fields
    // with an older local SQLite snapshot.
    const cloudAdmin = documents.get(`users/${userId}`)!;
    documents.set(`users/${userId}`, {
      ...cloudAdmin,
      password_hash: 'rotated-cloud-password-hash',
      full_name: 'Updated Cloud Administrator',
    });
    const staleLocalBundleResult = await persistInstituteAccountToFirestore({
      institute: { ...institute, name: 'Stale Local Institute Name' },
      user,
      batches: [batch],
      auditLogs: [auditLog],
    }, adapter);
    assert.equal(staleLocalBundleResult, 'persisted');
    assert.equal(
      documents.get(`users/${userId}`)?.password_hash,
      'rotated-cloud-password-hash',
      'A stale local password hash must never overwrite the newer Firestore credential.',
    );
    assert.equal(
      documents.get(`users/${userId}`)?.full_name,
      'Updated Cloud Administrator',
      'A login-time persistence check must preserve newer cloud profile fields.',
    );

    const missingAdapter: InstituteAccountRecoveryAdapter = {
      ...adapter,
      findInstitutesByEmail: async () => [],
      findUsersByEmail: async () => [],
    };
    assert.equal(
      await recoverInstituteAccountFromFirestoreByEmail(`missing-${suffix}@example.test`, undefined, missingAdapter),
      'not-found',
      'A genuinely absent cloud account must not be fabricated.',
    );

    const incompleteAdapter: InstituteAccountRecoveryAdapter = {
      ...adapter,
      findUsersByEmail: async () => [],
    };
    assert.equal(
      await recoverInstituteAccountFromFirestoreByEmail(email, userId, incompleteAdapter),
      'conflict',
      'An institute without its linked administrator must not be partially restored.',
    );

    const wrongAdminAdapter: InstituteAccountRecoveryAdapter = {
      ...adapter,
      findUsersByEmail: async () => [{ ...user, id: `${userId}_different` }],
    };
    assert.equal(
      await recoverInstituteAccountFromFirestoreByEmail(email, userId, wrongAdminAdapter),
      'conflict',
      'An authenticated admin must never be attached to a different cloud institute identity.',
    );

    const tombstonedRecoveryAdapter: InstituteAccountRecoveryAdapter = {
      ...adapter,
      isTombstoned: async (collectionName) => collectionName === 'institutes',
    };
    assert.equal(
      await recoverInstituteAccountFromFirestoreByEmail(email, userId, tombstonedRecoveryAdapter),
      'conflict',
      'A tombstoned institute must not be resurrected from an old cloud snapshot.',
    );

    console.log('PASS: institute signup is durable and existing institute identities recover without duplication.');
  } finally {
    db.prepare('DELETE FROM institute_memberships WHERE institute_id = ?').run(instituteId);
    db.prepare('DELETE FROM batches WHERE institute_id = ?').run(instituteId);
    db.prepare('DELETE FROM institutes WHERE id = ?').run(instituteId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
