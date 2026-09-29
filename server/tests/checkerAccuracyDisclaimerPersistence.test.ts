import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';
import { savePersistentFile, getPersistentFile, deletePersistentFile } from '../services/persistentStorageService.js';
import { safeSqliteString, hydrateFromFirestore } from '../services/firestoreSyncService.js';

async function runTests() {
  console.log('--- Starting Checker Accuracy, Disclaimer, and History/File Persistence Tests ---');

  // Test 1: Verify Evaluator Command is embedded in questionChunkEvaluator.ts and gemini.ts
  console.log('Test 1: Verifying mandatory Evaluator Command in evaluation services...');
  const chunkEvaluatorContent = fs.readFileSync(path.join(process.cwd(), 'server', 'services', 'questionChunkEvaluator.ts'), 'utf8');
  assert(
    chunkEvaluatorContent.includes('You are an examiner-style evaluator, not a binary answer matcher.'),
    'Test 1 failed: questionChunkEvaluator.ts must contain the mandatory evaluator command'
  );
  assert(
    chunkEvaluatorContent.includes('Before finalizing the score, perform a verification pass:'),
    'Test 1 failed: questionChunkEvaluator.ts must contain the 10-step verification pass'
  );
  assert(
    chunkEvaluatorContent.includes('Never exceed the prescribed maximum marks.'),
    'Test 1 failed: questionChunkEvaluator.ts must contain max marks & negative score mandates'
  );

  const geminiContent = fs.readFileSync(path.join(process.cwd(), 'server', 'gemini.ts'), 'utf8');
  assert(
    geminiContent.includes('You are an examiner-style evaluator, not a binary answer matcher.'),
    'Test 1 failed: gemini.ts must contain the mandatory evaluator command in evaluationPrompt'
  );
  console.log('✓ Test 1 Passed: Evaluator commands verified across evaluation engines.');

  // Test 2: Persistent Storage Backup to SQLite persistent_file_blobs Table
  console.log('Test 2: Verifying binary persistence in SQLite persistent_file_blobs table...');
  const testFileId = `test_file_${Date.now()}`;
  const testFilename = `${testFileId}.pdf`;
  const dummyBuffer = Buffer.from('%PDF-1.4 Dummy CA Answer Sheet Content For Persistence Testing');

  // Save the file
  await savePersistentFile(testFileId, testFilename, 'application/pdf', dummyBuffer, 'EVALUATION_ORIGINAL', {
    ownerUserId: 'usr_student_test',
    evaluationId: 'eval_test_123',
  });

  // Verify blob row exists in SQLite table
  const blobRow = db.prepare('SELECT file_id, filename, length(data) as size FROM persistent_file_blobs WHERE file_id = ?').get(testFileId) as any;
  assert(blobRow, 'Test 2 failed: persistent_file_blobs row must exist in SQLite');
  assert.strictEqual(blobRow.file_id, testFileId, 'Test 2 failed: file_id must match');
  assert.strictEqual(blobRow.size, dummyBuffer.length, 'Test 2 failed: blob size in SQLite must match buffer length');

  // Delete from local disk to simulate disk wipe/server restart
  const uploadsPath = path.join(process.cwd(), 'uploads', testFilename);
  const dataUploadsPath = path.join(process.cwd(), 'data', 'uploads', testFilename);
  try { if (fs.existsSync(uploadsPath)) fs.unlinkSync(uploadsPath); } catch {}
  try { if (fs.existsSync(dataUploadsPath)) fs.unlinkSync(dataUploadsPath); } catch {}

  // Fetch the file using getPersistentFile (must recover from SQLite persistent_file_blobs!)
  const retrieved = await getPersistentFile(testFileId, testFilename);
  assert(retrieved, 'Test 2 failed: getPersistentFile must successfully retrieve file from SQLite backup');
  assert.strictEqual(retrieved.buffer.toString(), dummyBuffer.toString(), 'Test 2 failed: retrieved buffer content must match original');

  // Clean up test file
  await deletePersistentFile(testFileId);
  const deletedBlob = db.prepare('SELECT file_id FROM persistent_file_blobs WHERE file_id = ?').get(testFileId);
  assert(!deletedBlob, 'Test 2 failed: persistent_file_blobs row must be removed upon deletePersistentFile');
  console.log('✓ Test 2 Passed: Binary persistence and offline recovery from SQLite persistent_file_blobs verified.');

  // Test 3: Safe SQLite String Handling for Hydration
  console.log('Test 3: Testing safeSqliteString against JSON objects, undefined, null, and primitives...');
  assert.strictEqual(safeSqliteString(null), null);
  assert.strictEqual(safeSqliteString(undefined), null);
  assert.strictEqual(safeSqliteString('test_string'), 'test_string');
  assert.strictEqual(safeSqliteString({ key: 'val', num: 42 }), '{"key":"val","num":42}');
  assert.strictEqual(safeSqliteString(['a', 'b']), '["a","b"]');
  console.log('✓ Test 3 Passed: safeSqliteString correctly normalizes complex objects and prevents SQLite type errors.');

  // Test 4: Student Disclaimer Database Storage & Retrieval
  console.log('Test 4: Testing student_disclaimers table persistence...');
  const testStudentId = `std_test_${Date.now()}`;
  // Ensure user exists for foreign key constraint
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role)
    VALUES (?, ?, 'hash', 'Test Student', 'STUDENT')
    ON CONFLICT(id) DO NOTHING
  `).run(testStudentId, `${testStudentId}@test.com`);

  // Insert disclaimer acknowledgment
  db.prepare(`
    INSERT INTO student_disclaimers (student_id, disclaimer_version, acknowledged_at, ip_address, user_agent)
    VALUES (?, 'v1.0', CURRENT_TIMESTAMP, '127.0.0.1', 'NodeTestRunner')
    ON CONFLICT(student_id) DO UPDATE SET disclaimer_version = excluded.disclaimer_version, acknowledged_at = CURRENT_TIMESTAMP
  `).run(testStudentId);

  const discRow = db.prepare('SELECT student_id, disclaimer_version, acknowledged_at FROM student_disclaimers WHERE student_id = ?').get(testStudentId) as any;
  assert(discRow, 'Test 4 failed: student_disclaimers record must exist');
  assert.strictEqual(discRow.student_id, testStudentId);
  assert.strictEqual(discRow.disclaimer_version, 'v1.0');
  assert(discRow.acknowledged_at, 'Test 4 failed: acknowledged_at must be populated');

  // Clean up test student
  db.prepare('DELETE FROM student_disclaimers WHERE student_id = ?').run(testStudentId);
  db.prepare('DELETE FROM users WHERE id = ?').run(testStudentId);
  console.log('✓ Test 4 Passed: Student disclaimer storage and lifecycle verified.');

  console.log('--- ALL CHECKER ACCURACY, DISCLAIMER, AND PERSISTENCE TESTS PASSED ---');
}

runTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
