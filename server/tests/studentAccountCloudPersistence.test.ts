import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { db, initDatabase } from '../db.js';
import {
  persistStudentAccountToFirestore,
  recoverStudentAccountFromFirestoreByEmail,
  type StudentAccountPersistenceAdapter,
  type StudentAccountRecoveryAdapter,
} from '../services/firestoreSyncService.js';

async function run() {
  initDatabase();
  const suffix = randomBytes(6).toString('hex');
  const userId = `usr_cloud_persistence_test_${suffix}`;
  const email = `cloud-persistence-${suffix}@example.test`;
  const srn = `TESTSRN${suffix.toUpperCase()}`;
  const studentCode = `TESTCODE${suffix.toUpperCase()}`;

  const documents = new Map<string, Record<string, any>>();
  const adapter: StudentAccountPersistenceAdapter = {
    isConfigured: () => true,
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
    getDocument: async <T>(collectionName: string, id: string) => {
      return (documents.get(`${collectionName}/${id}`) as T | undefined) ?? null;
    },
  };

  try {
    db.prepare('DELETE FROM student_profiles WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, status)
      VALUES (?, ?, 'test-hash', 'Cloud Persistence Test', 'STUDENT', 'ACTIVE')
    `).run(userId, email);
    db.prepare(`
      INSERT INTO student_profiles (user_id, student_code, icai_registration_number, ca_level)
      VALUES (?, ?, ?, 'INTERMEDIATE')
    `).run(userId, studentCode, srn);

    assert.equal(
      await persistStudentAccountToFirestore(userId, adapter),
      'persisted',
      'Account persistence succeeds only when both user and profile can be read back'
    );
    assert.ok(documents.has(`users/${userId}`), 'User document should be written');
    assert.ok(documents.has(`student_profiles/${userId}`), 'Student profile should be written');

    const failedWriteAdapter: StudentAccountPersistenceAdapter = {
      ...adapter,
      setDocumentsAtomically: async () => false,
    };
    assert.equal(
      await persistStudentAccountToFirestore(userId, failedWriteAdapter),
      'failed',
      'A failed cloud write must never be reported as durable'
    );

    documents.delete(`student_profiles/${userId}`);
    const missingProfileReadBackAdapter: StudentAccountPersistenceAdapter = {
      ...adapter,
      setDocumentsAtomically: async (writes) => {
        const userWrite = writes.find((write) => write.collectionName === 'users');
        if (userWrite) {
          documents.set(`users/${userId}`, { id: userId, ...userWrite.data });
        }
        return true;
      },
    };
    assert.equal(
      await persistStudentAccountToFirestore(userId, missingProfileReadBackAdapter),
      'failed',
      'A partial/missing read-back must not be reported as durable'
    );

    const unconfiguredAdapter: StudentAccountPersistenceAdapter = {
      ...adapter,
      isConfigured: () => false,
    };
    assert.equal(
      await persistStudentAccountToFirestore(userId, unconfiguredAdapter),
      'unconfigured',
      'Missing cloud configuration must be explicit'
    );

    const tombstonedAdapter: StudentAccountPersistenceAdapter = {
      ...adapter,
      isTombstoned: async () => true,
    };
    assert.equal(
      await persistStudentAccountToFirestore(userId, tombstonedAdapter),
      'failed',
      'A tombstoned identity must not be recreated'
    );

    // Recovery test: a cloud-backed student missing from runtime SQLite is restored
    // with the original user ID, credentials, and student profile—not cloned.
    const recoveredUserId = `${userId}_recovered`;
    const recoveredEmail = `recovered-${suffix}@example.test`;
    const recoveredSrn = `RECSRN${suffix.toUpperCase()}`;
    const recoveredStudentCode = `RECCODE${suffix.toUpperCase()}`;
    const cloudUser = {
      id: recoveredUserId,
      email: recoveredEmail,
      password_hash: 'existing-password-hash',
      full_name: 'Recovered Cloud Student',
      phone: null,
      role: 'STUDENT',
      status: 'ACTIVE',
      account_classification: 'NORMAL',
      email_verified: 1,
    };
    const cloudProfile = {
      user_id: recoveredUserId,
      student_code: recoveredStudentCode,
      icai_registration_number: recoveredSrn,
      ca_level: 'INTERMEDIATE',
      free_evaluations_used: 1,
      purchased_credits: 0,
      paid_credits: 0,
      monthly_free_evaluations_limit: 2,
    };
    const recoveryAdapter: StudentAccountRecoveryAdapter = {
      isConfigured: () => true,
      findUsersByEmail: async (lookupEmail) => lookupEmail === recoveredEmail ? [cloudUser] : [],
      getDocument: async <T>(collectionName: string, id: string) => {
        if (collectionName === 'student_profiles' && id === recoveredUserId) return cloudProfile as T;
        return null;
      },
      isTombstoned: async () => false,
    };

    assert.equal(
      await recoverStudentAccountFromFirestoreByEmail(recoveredEmail, recoveryAdapter),
      'recovered',
      'Existing cloud account should be restored to SQLite rather than duplicated'
    );
    const restoredUser = db.prepare('SELECT id, email, password_hash, role FROM users WHERE id = ?').get(recoveredUserId) as any;
    const restoredProfile = db.prepare('SELECT user_id, icai_registration_number, ca_level FROM student_profiles WHERE user_id = ?').get(recoveredUserId) as any;
    assert.equal(restoredUser?.id, recoveredUserId);
    assert.equal(restoredUser?.email, recoveredEmail);
    assert.equal(restoredUser?.password_hash, cloudUser.password_hash);
    assert.equal(restoredUser?.role, 'STUDENT');
    assert.equal(restoredProfile?.user_id, recoveredUserId);
    assert.equal(restoredProfile?.icai_registration_number, recoveredSrn);
    assert.equal(restoredProfile?.ca_level, 'INTERMEDIATE');

    const noCloudAccountAdapter: StudentAccountRecoveryAdapter = {
      ...recoveryAdapter,
      findUsersByEmail: async () => [],
    };
    assert.equal(
      await recoverStudentAccountFromFirestoreByEmail(`missing-${suffix}@example.test`, noCloudAccountAdapter),
      'not-found',
      'A genuinely absent cloud account must not be fabricated'
    );

    const incompleteAdapter: StudentAccountRecoveryAdapter = {
      ...recoveryAdapter,
      getDocument: async () => null,
    };
    assert.equal(
      await recoverStudentAccountFromFirestoreByEmail(recoveredEmail, incompleteAdapter),
      'incomplete',
      'A cloud user without its required profile must not be partially restored'
    );

    const tombstonedRecoveryAdapter: StudentAccountRecoveryAdapter = {
      ...recoveryAdapter,
      isTombstoned: async () => true,
    };
    assert.equal(
      await recoverStudentAccountFromFirestoreByEmail(recoveredEmail, tombstonedRecoveryAdapter),
      'conflict',
      'Deleted/tombstoned accounts must never be resurrected'
    );

    db.prepare('DELETE FROM student_profiles WHERE user_id = ?').run(recoveredUserId);
    db.prepare('DELETE FROM users WHERE id = ?').run(recoveredUserId);

    console.log('PASS: registration persistence is verified and existing cloud accounts recover without duplication');
  } finally {
    db.prepare('DELETE FROM student_profiles WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
