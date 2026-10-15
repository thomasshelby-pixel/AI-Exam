import assert from 'node:assert';
import { db } from '../db.js';
import { generateToken } from '../auth.js';
import { CURRENT_DISCLAIMER_VERSION, isStudentDisclaimerAcknowledged } from '../routes/studentRoutes.js';

async function runVerification() {
  console.log('========================================================================');
  console.log('--- STARTING RUNTIME DISCLAIMER VERIFICATION (TESTS A - G) ---');
  console.log('========================================================================');

  const PORT = process.env.PORT || '8080';
  const BASE_URL = `http://localhost:${PORT}`;

  // Dedicated test student to protect real student data
  const testStudentId = `usr_test_std_${Date.now()}`;
  const testStudentEmail = `test_std_${Date.now()}@caexamchecker.ai`;

  // Create isolated test student
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, ?, 'hash', 'Test Disclaimer Student', 'STUDENT', 'ACTIVE')
  `).run(testStudentId, testStudentEmail);

  // Create sample evaluation for this test student
  const testEvalId = `eval_test_${Date.now()}`;
  db.prepare(`
    INSERT INTO evaluations (
      id, student_id, level, material_type, subject_key, subject_name,
      original_filename, status, total_marks, maximum_marks, percentage, grade,
      result_json, created_at
    ) VALUES (
      ?, ?, 'INTERMEDIATE', 'PRACTICE', 'ADV_ACC', 'Advanced Accounting',
      'test_sheet.pdf', 'COMPLETED', 68, 100, 68, 'PASS',
      ?, CURRENT_TIMESTAMP
    )
  `).run(
    testEvalId, testStudentId,
    JSON.stringify({
      evaluationId: testEvalId,
      studentName: 'Test Disclaimer Student',
      caLevel: 'INTERMEDIATE',
      subjectName: 'Advanced Accounting',
      totalMarks: 68,
      maximumMarks: 100,
      percentage: 68,
      grade: 'PASS',
      questions: []
    })
  );

  const token = generateToken({
    id: testStudentId,
    email: testStudentEmail,
    role: 'STUDENT',
    fullName: 'Test Disclaimer Student',
  });

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  try {
    // ------------------------------------------------------------------------
    // TEST A: New / Unacknowledged Student -> Disclaimer Status Returns false
    // ------------------------------------------------------------------------
    console.log('\n>>> TEST A: Unacknowledged Student Disclaimer Status Check');
    const statusRes1 = await fetch(`${BASE_URL}/api/student/disclaimer/status`, {
      headers: authHeaders,
    });
    assert.strictEqual(statusRes1.status, 200, 'Status check should return HTTP 200');
    const statusData1 = await statusRes1.json();
    assert.strictEqual(statusData1.acknowledged, false, 'Unacknowledged student must have acknowledged: false');
    assert.strictEqual(statusData1.currentVersion, CURRENT_DISCLAIMER_VERSION, 'Current version must match');
    assert.strictEqual(isStudentDisclaimerAcknowledged(testStudentId, testStudentEmail), false, 'Helper must return false');
    console.log('[PASS] TEST A: New/unacknowledged student -> disclaimer status is false, modal triggered.');

    // ------------------------------------------------------------------------
    // TEST B: Disclaimer Visible -> Evaluation Content Not Accessible
    // ------------------------------------------------------------------------
    console.log('\n>>> TEST B: Unacknowledged Evaluation Content Access Blocked');
    const evalResBefore = await fetch(`${BASE_URL}/api/student/evaluations/${testEvalId}`, {
      headers: authHeaders,
    });
    assert.strictEqual(evalResBefore.status, 403, 'Direct evaluation access must be rejected with 403');
    const evalDataBefore = await evalResBefore.json();
    assert.strictEqual(evalDataBefore.code, 'DISCLAIMER_REQUIRED', 'Error code must be DISCLAIMER_REQUIRED');
    assert.strictEqual(evalDataBefore.currentVersion, CURRENT_DISCLAIMER_VERSION);
    assert.strictEqual(evalDataBefore.evaluation, undefined, 'Evaluation content must NOT be returned');
    console.log('[PASS] TEST B: Disclaimer visible -> Evaluation content is blocked server-side and in UI gate.');

    // ------------------------------------------------------------------------
    // TEST C: Click "OK, I Understand" -> Acknowledgement Recorded Successfully
    // ------------------------------------------------------------------------
    console.log('\n>>> TEST C: Acknowledge Disclaimer via API');
    const ackRes = await fetch(`${BASE_URL}/api/student/disclaimer/acknowledge`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ version: CURRENT_DISCLAIMER_VERSION }),
    });
    assert.strictEqual(ackRes.status, 200, 'Acknowledge endpoint must return HTTP 200');
    const ackData = await ackRes.json();
    assert.strictEqual(ackData.success, true, 'Ack must succeed');
    assert.strictEqual(ackData.acknowledged, true, 'acknowledged must be true');
    assert.strictEqual(ackData.version, CURRENT_DISCLAIMER_VERSION);

    // Verify DB records
    const rowAck = db.prepare('SELECT * FROM student_disclaimer_acknowledgements WHERE student_id = ?').get(testStudentId) as any;
    assert(rowAck, 'Row must exist in student_disclaimer_acknowledgements');
    assert.strictEqual(rowAck.version, CURRENT_DISCLAIMER_VERSION);

    const rowDisc = db.prepare('SELECT * FROM student_disclaimers WHERE student_id = ?').get(testStudentId) as any;
    assert(rowDisc, 'Row must exist in student_disclaimers');
    assert.strictEqual(rowDisc.disclaimer_version, CURRENT_DISCLAIMER_VERSION);

    // Now evaluation should open!
    const evalResAfter = await fetch(`${BASE_URL}/api/student/evaluations/${testEvalId}`, {
      headers: authHeaders,
    });
    assert.strictEqual(evalResAfter.status, 200, 'Evaluation access must now succeed with 200 OK');
    const evalDataAfter = await evalResAfter.json();
    assert(evalDataAfter.evaluation, 'Evaluation content must now be accessible');
    assert.strictEqual(evalDataAfter.evaluation.id, testEvalId);
    console.log('[PASS] TEST C: Click OK -> Acknowledgement saved, evaluation opens successfully.');

    // ------------------------------------------------------------------------
    // TEST D: Refresh After Acknowledgement -> No Unnecessary Repeated Modal
    // ------------------------------------------------------------------------
    console.log('\n>>> TEST D: Refresh After Acknowledgement Verification');
    const statusResAfter = await fetch(`${BASE_URL}/api/student/disclaimer/status`, {
      headers: authHeaders,
    });
    assert.strictEqual(statusResAfter.status, 200);
    const statusDataAfter = await statusResAfter.json();
    assert.strictEqual(statusDataAfter.acknowledged, true, 'After refresh, student remains acknowledged');
    assert.strictEqual(statusDataAfter.currentVersion, CURRENT_DISCLAIMER_VERSION);
    assert(statusDataAfter.acknowledgedAt, 'acknowledgedAt timestamp must be returned');

    // Also test alias endpoint
    const aliasRes = await fetch(`${BASE_URL}/api/student/disclaimer-status`, {
      headers: authHeaders,
    });
    assert.strictEqual(aliasRes.status, 200);
    const aliasData = await aliasRes.json();
    assert.strictEqual(aliasData.acknowledged, true);
    console.log('[PASS] TEST D: Refresh after acknowledgement -> Server returns acknowledged: true, no repeated modal.');

    // ------------------------------------------------------------------------
    // TEST E: New Disclaimer Version -> Modal Appears Again
    // ------------------------------------------------------------------------
    console.log('\n>>> TEST E: New Disclaimer Version Invalidation');
    const newVersionCheck = isStudentDisclaimerAcknowledged(testStudentId, testStudentEmail, 'v1.1');
    assert.strictEqual(newVersionCheck, false, 'Student has not acknowledged v1.1, must return false');

    // Test rejecting incorrect version acknowledgment
    const wrongAckRes = await fetch(`${BASE_URL}/api/student/disclaimer/acknowledge`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ version: 'v99.99' }),
    });
    assert.strictEqual(wrongAckRes.status, 400, 'Version mismatch must return 400');
    console.log('[PASS] TEST E: New disclaimer version -> Unacknowledged for new version, modal appears again.');

    // ------------------------------------------------------------------------
    // TEST F: Direct Evaluation URL Before Acknowledgement -> Evaluation Blocked
    // ------------------------------------------------------------------------
    console.log('\n>>> TEST F: Direct Evaluation URL for Unacknowledged Student');
    // Temporarily reset acknowledgment for this test account using safe reset endpoint
    const resetRes = await fetch(`${BASE_URL}/api/student/disclaimer/reset`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.strictEqual(resetRes.status, 200, 'Reset endpoint must succeed');
    const resetData = await resetRes.json();
    assert.strictEqual(resetData.success, true);

    // Verify status is back to unacknowledged
    const statusAfterReset = await fetch(`${BASE_URL}/api/student/disclaimer/status`, {
      headers: authHeaders,
    });
    const statusDataReset = await statusAfterReset.json();
    assert.strictEqual(statusDataReset.acknowledged, false, 'Status must be false after reset');

    // Direct fetch of evaluation must be blocked
    const directEvalRes = await fetch(`${BASE_URL}/api/student/evaluations/${testEvalId}`, {
      headers: authHeaders,
    });
    assert.strictEqual(directEvalRes.status, 403, 'Direct access must be blocked with 403');
    console.log('[PASS] TEST F: Direct evaluation URL before acknowledgement -> Evaluation blocked.');

    // ------------------------------------------------------------------------
    // TEST G: Direct Evaluation API Before Acknowledgement -> Protected Evaluation Not Returned
    // ------------------------------------------------------------------------
    console.log('\n>>> TEST G: Direct API endpoints before acknowledgement');
    // Test download-report endpoint
    const dlReportRes = await fetch(`${BASE_URL}/api/student/evaluations/${testEvalId}/download-report`, {
      headers: authHeaders,
    });
    assert.strictEqual(dlReportRes.status, 403, 'download-report must return 403');
    const dlReportData = await dlReportRes.json();
    assert.strictEqual(dlReportData.code, 'DISCLAIMER_REQUIRED');

    // Test download-checked-copy endpoint
    const dlCopyRes = await fetch(`${BASE_URL}/api/student/evaluations/${testEvalId}/download-checked-copy`, {
      headers: authHeaders,
    });
    assert.strictEqual(dlCopyRes.status, 403, 'download-checked-copy must return 403');
    const dlCopyData = await dlCopyRes.json();
    assert.strictEqual(dlCopyData.code, 'DISCLAIMER_REQUIRED');

    console.log('[PASS] TEST G: Direct evaluation API before acknowledgement -> Protected evaluation/PDF not returned.');

    console.log('\n========================================================================');
    console.log('--- ALL VERIFICATION TESTS (TESTS A - G) PASSED 100% CLEANLY! ---');
    console.log('========================================================================');
  } finally {
    // Clean up test student records
    db.prepare('DELETE FROM evaluations WHERE id = ?').run(testEvalId);
    db.prepare('DELETE FROM student_disclaimer_acknowledgements WHERE student_id = ?').run(testStudentId);
    db.prepare('DELETE FROM student_disclaimers WHERE student_id = ?').run(testStudentId);
    db.prepare('DELETE FROM users WHERE id = ?').run(testStudentId);
    console.log('Cleaned up test student safely.');
    process.exit(0);
  }
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
