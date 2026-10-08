import assert from 'assert';
import { db, recordLocalTombstone, removeLocalTombstone, isTombstoned as isLocalTombstoned, getAllLocalTombstoneSet } from '../db.js';
import { deleteStudentAccount } from '../services/studentDeleteService.js';
import { hydrateFromFirestore, seedBaselineToFirestoreIfEmpty } from '../services/firestoreSyncService.js';

async function runTests() {
  console.log('================================================================');
  console.log('--- DELETED USER PERSISTENCE & RESURRECTION PREVENTION SUITE ---');
  console.log('================================================================');

  const superAdmin = {
    id: 'usr_super_admin_001',
    email: 'caexamchecker.support@gmail.com',
    role: 'SUPER_ADMIN',
  };

  const testStudentId = 'usr_test_del_resurrect_001';
  const testStudentEmail = 'test_del_resurrect_001@example.com';

  // Cleanup any old leftovers
  db.prepare('DELETE FROM users WHERE id = ? OR email = ?').run(testStudentId, testStudentEmail);
  db.prepare('DELETE FROM student_profiles WHERE user_id = ?').run(testStudentId);
  db.prepare('DELETE FROM evaluations WHERE student_id = ?').run(testStudentId);
  removeLocalTombstone('users', testStudentId);

  // 1. Setup active student with evaluation in SQLite
  console.log('\n[TEST 1] Setup test student and verify initial state...');
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
    VALUES (?, ?, 'hash123', 'Test Resurrect Student', '+919999999999', 'STUDENT', 'ACTIVE')
  `).run(testStudentId, testStudentEmail);

  db.prepare(`
    INSERT INTO student_profiles (user_id, icai_registration_number, ca_level, free_evaluations_used, purchased_credits)
    VALUES (?, 'WRO999999', 'INTERMEDIATE', 0, 5)
  `).run(testStudentId);

  const testEvalId = 'eval_test_del_001';
  db.prepare(`
    INSERT INTO evaluations (
      id, student_id, level, material_type, subject_key, subject_name, paper, attempt,
      checking_mode, evaluation_source, material_source, entitlement_source,
      total_marks, maximum_marks, percentage, grade, confidence_score, status, original_filename
    ) VALUES (
      ?, ?, 'INTERMEDIATE', 'MTP', 'acc', 'Accounting', 'Paper 1', 'NOV 2026',
      'EXAM_STRICT', 'DIRECT_OCR', 'STUDENT_UPLOAD', 'PAID_LOT',
      60, 100, 60, 'B', 0.95, 'COMPLETED', 'test_eval.pdf'
    )
  `).run(testEvalId, testStudentId);

  assert.strictEqual(
    db.prepare('SELECT id FROM users WHERE id = ?').get(testStudentId)?.id,
    testStudentId,
    'User must be created in SQLite'
  );
  assert.strictEqual(
    db.prepare('SELECT user_id FROM student_profiles WHERE user_id = ?').get(testStudentId)?.user_id,
    testStudentId,
    'Student profile must be created in SQLite'
  );
  console.log('✓ Initial setup validated');

  // 2. Perform permanent delete via deleteStudentAccount
  console.log('\n[TEST 2] Execute asynchronous deleteStudentAccount()...');
  const deleteResult = await deleteStudentAccount(testStudentId, superAdmin, '127.0.0.1', 'test-agent');
  assert.strictEqual(deleteResult.success, true, 'deleteStudentAccount must report success');
  assert.strictEqual(deleteResult.deletedStudent.id, testStudentId, 'Deleted student ID must match');

  // Verify removed from SQLite
  const userAfterDelete = db.prepare('SELECT id FROM users WHERE id = ?').get(testStudentId);
  assert.strictEqual(userAfterDelete, undefined, 'User must be deleted from SQLite');
  const profileAfterDelete = db.prepare('SELECT user_id FROM student_profiles WHERE user_id = ?').get(testStudentId);
  assert.strictEqual(profileAfterDelete, undefined, 'Student profile must be deleted from SQLite');
  const evalAfterDelete = db.prepare('SELECT id FROM evaluations WHERE student_id = ?').get(testStudentId);
  assert.strictEqual(evalAfterDelete, undefined, 'Evaluations for student must be deleted from SQLite');

  // Verify tombstone is recorded
  assert.strictEqual(isLocalTombstoned('users', testStudentId), true, 'Tombstone must be recorded in SQLite');
  const tombstoneSet = getAllLocalTombstoneSet();
  assert.strictEqual(tombstoneSet.has(`users_${testStudentId}`), true, 'Tombstone set must contain users_<id>');
  console.log('✓ Deletion and tombstoning validated');

  // 3. Test Step 15 Auto-Heal Protection: Dangling evaluation must NOT resurrect deleted student
  console.log('\n[TEST 3] Simulate dangling evaluation referencing deleted/tombstoned student...');
  const danglingEvalId = 'eval_dangling_tombstone_001';
  db.exec('PRAGMA foreign_keys = OFF;');
  db.prepare(`
    INSERT INTO evaluations (
      id, student_id, level, material_type, subject_key, subject_name, paper, attempt,
      checking_mode, evaluation_source, material_source, entitlement_source,
      total_marks, maximum_marks, percentage, grade, confidence_score, status, original_filename
    ) VALUES (
      ?, ?, 'INTERMEDIATE', 'MTP', 'acc', 'Accounting', 'Paper 1', 'NOV 2026',
      'EXAM_STRICT', 'DIRECT_OCR', 'STUDENT_UPLOAD', 'PAID_LOT',
      55, 100, 55, 'C', 0.90, 'COMPLETED', 'dangling.pdf'
    )
  `).run(danglingEvalId, testStudentId);
  db.exec('PRAGMA foreign_keys = ON;');

  // Now trigger hydrateFromFirestore (mock/offline mode without failing)
  await hydrateFromFirestore({ requireComplete: false });

  // Verify the tombstoned student was NOT resurrected by Step 15
  const userAfterHydration = db.prepare('SELECT id FROM users WHERE id = ?').get(testStudentId);
  assert.strictEqual(userAfterHydration, undefined, 'Tombstoned user must NEVER be resurrected by Step 15');
  const profileAfterHydration = db.prepare('SELECT user_id FROM student_profiles WHERE user_id = ?').get(testStudentId);
  assert.strictEqual(profileAfterHydration, undefined, 'Tombstoned student profile must NEVER be resurrected');

  // Verify dangling evaluation was cleaned up
  const danglingEvalAfterHydration = db.prepare('SELECT id FROM evaluations WHERE id = ?').get(danglingEvalId);
  assert.strictEqual(danglingEvalAfterHydration, undefined, 'Dangling evaluation referencing tombstoned student must be resolved/removed');
  console.log('✓ Step 15 auto-heal protection validated: Tombstoned student was NOT resurrected!');

  // 4. Test Step 1 Hydration Purge: If a tombstoned user somehow existed in SQLite, hydration purges it
  console.log('\n[TEST 4] Test hydration purge of tombstoned user from local SQLite...');
  const ghostStudentId = 'usr_ghost_tombstoned_002';
  recordLocalTombstone('users', ghostStudentId, 'TOMBSTONE_TEST');
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
    VALUES (?, 'ghost_tombstone@example.com', 'hash', 'Ghost', '+919999999998', 'STUDENT', 'ACTIVE')
  `).run(ghostStudentId);
  db.prepare(`
    INSERT INTO student_profiles (user_id, icai_registration_number, ca_level, free_evaluations_used, purchased_credits)
    VALUES (?, 'WRO999998', 'INTERMEDIATE', 0, 1)
  `).run(ghostStudentId);

  // Run hydration
  await hydrateFromFirestore({ requireComplete: false });

  const ghostAfterHydration = db.prepare('SELECT id FROM users WHERE id = ?').get(ghostStudentId);
  assert.strictEqual(ghostAfterHydration, undefined, 'Tombstoned ghost user must be purged from SQLite during hydration');
  const ghostProfileAfterHydration = db.prepare('SELECT user_id FROM student_profiles WHERE user_id = ?').get(ghostStudentId);
  assert.strictEqual(ghostProfileAfterHydration, undefined, 'Ghost profile must be purged from SQLite during hydration');
  console.log('✓ Hydration tombstone purge validated');

  // Clean up ghost tombstone
  removeLocalTombstone('users', ghostStudentId);
  removeLocalTombstone('users', testStudentId);

  console.log('\n================================================================');
  console.log('--- ALL DELETED USER RESURRECTION PREVENTION TESTS PASSED ---');
  console.log('================================================================');
}

runTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
