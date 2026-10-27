import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { db, initDatabase } from '../db.js';
import {
  persistStudentAccountToFirestore,
  type StudentAccountPersistenceAdapter,
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

    console.log('PASS: student account persistence verifies user + profile durability and fails closed');
  } finally {
    db.prepare('DELETE FROM student_profiles WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
