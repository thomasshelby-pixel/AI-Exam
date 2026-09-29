import { db } from '../db.js';
import crypto from 'node:crypto';
import assert from 'node:assert';
import { buildStudentOwnershipSql, getStudentOwnershipParams, CURRENT_DISCLAIMER_VERSION } from '../routes/studentRoutes.js';

console.log('--- RUNNING EVALUATION DISCLAIMER & HISTORY INTEGRITY TEST SUITE ---');

// 1. Test Disclaimer Persistence and Gating
console.log('\n--- TEST 1: Disclaimer Acknowledgment & Schema Integrity ---');

const testStudentId = `test_disc_student_${Date.now()}`;
const testStudentEmail = `test_disc_${Date.now()}@example.com`;

// Insert test student
db.prepare(`
  INSERT INTO users (id, email, password_hash, full_name, role, status)
  VALUES (?, ?, 'hash', 'Test Disc Student', 'STUDENT', 'ACTIVE')
`).run(testStudentId, testStudentEmail);

// Verify initially NOT acknowledged
const initialAck = db.prepare(`
  SELECT d.id
  FROM student_disclaimer_acknowledgements d
  LEFT JOIN users u ON u.id = d.student_id
  WHERE ${buildStudentOwnershipSql('d', 'u')}
    AND d.version = ?
  LIMIT 1
`).get(...getStudentOwnershipParams(testStudentId, testStudentEmail), CURRENT_DISCLAIMER_VERSION);

assert.strictEqual(Boolean(initialAck), false, 'Student should not have acknowledged disclaimer initially');
console.log('[PASS] Test 1.1: Unacknowledged disclaimer correctly identified');

// Record acknowledgment
const ackId = `dack_${crypto.randomBytes(8).toString('hex')}`;
const nowIso = new Date().toISOString();
db.prepare(`
  INSERT INTO student_disclaimer_acknowledgements (
    id, student_id, version, acknowledged_at, ip_address, user_agent
  ) VALUES (?, ?, ?, ?, '127.0.0.1', 'Mozilla/5.0 Test')
  ON CONFLICT(student_id, version) DO UPDATE SET
    acknowledged_at = excluded.acknowledged_at
`).run(ackId, testStudentId, CURRENT_DISCLAIMER_VERSION, nowIso);

const recordedAck = db.prepare(`
  SELECT d.id, d.version, d.acknowledged_at
  FROM student_disclaimer_acknowledgements d
  LEFT JOIN users u ON u.id = d.student_id
  WHERE ${buildStudentOwnershipSql('d', 'u')}
    AND d.version = ?
  LIMIT 1
`).get(...getStudentOwnershipParams(testStudentId, testStudentEmail), CURRENT_DISCLAIMER_VERSION) as any;

assert.ok(recordedAck, 'Disclaimer acknowledgement must be found after insertion');
assert.strictEqual(recordedAck.version, CURRENT_DISCLAIMER_VERSION, 'Version must match CURRENT_DISCLAIMER_VERSION');
console.log('[PASS] Test 1.2: Disclaimer acknowledgment recorded and verified');

// 2. Test Student Evaluation History Ownership and Visibility
console.log('\n--- TEST 2: Student Evaluation History Tracking ---');

// Insert a sample evaluation for the test student
const testEvalId = `eval_test_${Date.now()}`;
db.prepare(`
  INSERT INTO evaluations (
    id, student_id, level, material_type, subject_key, subject_name, paper, attempt,
    total_marks, maximum_marks, percentage, grade, status, original_filename, created_at
  ) VALUES (?, ?, 'INTERMEDIATE', 'EXAM', 'inter_taxation', 'Taxation (Income Tax & GST)', 'Paper 3', 'May 2026',
    55, 100, 55, 'PASS', 'COMPLETED', 'test_answer.pdf', CURRENT_TIMESTAMP)
`).run(testEvalId, testStudentId);

// Query using student ownership SQL
const studentHistory = db.prepare(`
  SELECT e.id, e.subject_name, e.status
  FROM evaluations e
  LEFT JOIN users u ON u.id = e.student_id
  WHERE ${buildStudentOwnershipSql('e', 'u')}
`).all(...getStudentOwnershipParams(testStudentId, testStudentEmail)) as any[];

assert.ok(studentHistory.length >= 1, 'Student should see their evaluation in history');
assert.ok(studentHistory.some((e) => e.id === testEvalId), 'Specific evaluation ID must be present in student history');
console.log('[PASS] Test 2.1: Evaluation history retrieved accurately for student');

// 3. Test at9767676@gmail.com and demo student evaluation visibility
console.log('\n--- TEST 3: Core User Evaluation History Tracking ---');

const atParams = getStudentOwnershipParams('usr_user_at9767', 'at9767676@gmail.com');
const atHistory = db.prepare(`
  SELECT e.id, e.subject_name, e.status
  FROM evaluations e
  LEFT JOIN users u ON u.id = e.student_id
  WHERE ${buildStudentOwnershipSql('e', 'u')}
`).all(...atParams) as any[];

assert.ok(atHistory.length > 0, 'at9767676@gmail.com must have evaluation history records');
console.log(`[PASS] Test 3.1: at9767676@gmail.com sees ${atHistory.length} evaluation(s) in history`);

// 4. Test Admin Evaluation Listing
console.log('\n--- TEST 4: Admin Evaluation Portal History Tracking ---');

const adminEvals = db.prepare(`
  SELECT e.id, e.student_id, e.subject_name, e.status,
         COALESCE(u.full_name, 'Student Candidate') as student_name,
         COALESCE(u.email, 'student@caexamchecker.ai') as student_email
  FROM evaluations e
  LEFT JOIN users u ON u.id = e.student_id
  WHERE 1=1
  ORDER BY e.created_at DESC
`).all() as any[];

assert.ok(adminEvals.length >= atHistory.length, 'Admin must see all evaluations');
assert.ok(adminEvals.some((e) => e.id === testEvalId), 'Admin history must include the newly created evaluation');
console.log(`[PASS] Test 4.1: Admin history contains ${adminEvals.length} evaluations without data loss`);

// Clean up test records
db.prepare('DELETE FROM evaluations WHERE id = ?').run(testEvalId);
db.prepare('DELETE FROM student_disclaimer_acknowledgements WHERE student_id = ?').run(testStudentId);
db.prepare('DELETE FROM users WHERE id = ?').run(testStudentId);

console.log('\n================================================================');
console.log('ALL EVALUATION DISCLAIMER & HISTORY INTEGRITY TESTS PASSED!');
console.log('================================================================');

process.exit(0);
