import assert from 'node:assert';
import { db, isTombstoned, recordLocalTombstone, getAllLocalTombstoneSet } from '../db.js';
import { deleteStudentAccount } from '../services/studentDeleteService.js';
import { hydrateFromFirestore } from '../services/firestoreSyncService.js';

async function runTests() {
  console.log('--- STARTING DELETED USER PERSISTENCE & TOMBSTONE TESTS ---');

  const testStudentId = 'usr_test_audit_student_099';
  const testEmail = 'audit_deleted_user@caexamchecker.ai';

  // 1. Setup a test student with profile and evaluation
  db.prepare(`
    INSERT OR REPLACE INTO users (id, email, password_hash, full_name, role, status, account_classification)
    VALUES (?, ?, 'HASH123', 'Audit Student', 'STUDENT', 'ACTIVE', 'TEST')
  `).run(testStudentId, testEmail);

  db.prepare(`
    INSERT OR REPLACE INTO student_profiles (user_id, icai_registration_number, ca_level)
    VALUES (?, 'WRO999999', 'FINAL')
  `).run(testStudentId);

  const testEvalId = 'eval_test_audit_099';
  db.prepare(`
    INSERT OR REPLACE INTO evaluations (id, student_id, level, material_type, subject_key, subject_name, original_filename, status)
    VALUES (?, ?, 'FINAL', 'QUESTION_PAPER', 'FR', 'Financial Reporting', 'test.pdf', 'COMPLETED')
  `).run(testEvalId, testStudentId);

  const actor = {
    id: 'usr_super_admin_001',
    email: 'caexamchecker.support@gmail.com',
    role: 'SUPER_ADMIN',
  };

  // 2. Perform deletion
  console.log('Testing deleteStudentAccount...');
  const delResult = await deleteStudentAccount(testStudentId, actor);
  assert.strictEqual(delResult.success, true, 'deleteStudentAccount must succeed');
  assert.strictEqual(delResult.deletedStudent.id, testStudentId, 'Deleted student ID must match');

  // 3. Verify SQLite deletion
  const checkUser = db.prepare('SELECT id FROM users WHERE id = ?').get(testStudentId);
  assert.strictEqual(checkUser, undefined, 'User must not exist in SQLite users table');

  const checkProfile = db.prepare('SELECT user_id FROM student_profiles WHERE user_id = ?').get(testStudentId);
  assert.strictEqual(checkProfile, undefined, 'Profile must not exist in SQLite student_profiles table');

  // 4. Verify tombstone presence
  const isTomb = isTombstoned('users', testStudentId);
  assert.strictEqual(isTomb, true, 'User must be recorded in tombstones table');

  // 5. Verify Idempotent Delete
  console.log('Testing idempotent delete retry...');
  const retryResult = await deleteStudentAccount(testStudentId, actor);
  assert.strictEqual(retryResult.success, true, 'Retry of deleteStudentAccount must succeed idempotently');
  assert.strictEqual(retryResult.alreadyDeleted, true, 'Retry must indicate alreadyDeleted');

  // 6. Test Step 15 Auto-Heal Resurrection Prevention
  console.log('Testing Step 15 resurrection prevention when evaluation has tombstoned student_id...');
  // Insert an evaluation with the tombstoned student ID directly (simulating stale evaluation loaded during hydration)
  db.exec('PRAGMA foreign_keys = OFF;');
  db.prepare(`
    INSERT OR REPLACE INTO evaluations (id, student_id, level, material_type, subject_key, subject_name, original_filename, status)
    VALUES (?, ?, 'FINAL', 'QUESTION_PAPER', 'FR', 'Financial Reporting', 'test.pdf', 'COMPLETED')
  `).run('eval_stale_orphan_test', testStudentId);

  // Run hydration from Firestore
  await hydrateFromFirestore();

  // Verify the tombstoned user was NOT resurrected
  const recheckUser = db.prepare('SELECT id FROM users WHERE id = ?').get(testStudentId);
  assert.strictEqual(recheckUser, undefined, 'Tombstoned user MUST NOT be resurrected by Step 15 or hydration');

  const recheckProfile = db.prepare('SELECT user_id FROM student_profiles WHERE user_id = ?').get(testStudentId);
  assert.strictEqual(recheckProfile, undefined, 'Tombstoned student profile MUST NOT be created');

  console.log('--- ALL DELETED USER PERSISTENCE & TOMBSTONE TESTS PASSED ---');
}

runTests().then(() => {
  console.log('Test completed successfully.');
  process.exit(0);
}).catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
