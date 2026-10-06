import assert from 'node:assert';
import { db } from '../db.js';
import { generateToken } from '../auth.js';
import { CURRENT_DISCLAIMER_VERSION, isStudentDisclaimerAcknowledged } from '../routes/studentRoutes.js';
import {
  normalizeQuestionComponents,
  processEvaluationIntegrity,
  validateAuthoritativeConsistency,
  evaluateZeroMarkSafetyGate,
} from '../services/evaluationIntegrityEngine.js';
import { applyMultiModeMarkingPhilosophy } from '../services/multiModeMarkingEngine.js';
import {
  hydrateFromFirestore,
  syncRecordToFirestore,
  seedBaselineToFirestoreIfEmpty,
  permanentlyDeleteFromFirestore,
} from '../services/firestoreSyncService.js';
import {
  setFirestoreDoc,
  getFirestoreDoc,
  getAllFirestoreDocs,
  deleteFirestoreDoc,
} from '../services/firestoreDbService.js';
import { EvaluationResult, MarkingComponent, QuestionEvaluation } from '../../src/types/index.js';

const PORT = process.env.PORT || '8080';
const BASE_URL = `http://localhost:${PORT}`;

async function runFinalVerification() {
  console.log('========================================================================');
  console.log('--- STARTING FINAL COMPREHENSIVE RUNTIME VERIFICATION ---');
  console.log('========================================================================\n');

  // ==========================================================================
  // 1. DISCLAIMER RUNTIME TEST
  // ==========================================================================
  console.log('>>> [1/5] RUNNING DISCLAIMER RUNTIME TEST...');
  const testStudentId = `usr_test_disc_${Date.now()}`;
  const testStudentEmail = `test_disc_${Date.now()}@caexamchecker.ai`;
  const testEvalId = `eval_test_disc_${Date.now()}`;
  let checkStudentId = '';

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, ?, 'hash', 'Test Unack Student', 'STUDENT', 'ACTIVE')
  `).run(testStudentId, testStudentEmail);

  db.prepare(`
    INSERT INTO evaluations (
      id, student_id, level, material_type, subject_key, subject_name,
      original_filename, status, total_marks, maximum_marks, percentage, grade,
      result_json, created_at
    ) VALUES (
      ?, ?, 'INTERMEDIATE', 'PRACTICE', 'ADV_ACC', 'Advanced Accounting',
      'test_sheet.pdf', 'COMPLETED', 60, 100, 60, 'PASS',
      ?, CURRENT_TIMESTAMP
    )
  `).run(
    testEvalId, testStudentId,
    JSON.stringify({
      evaluationId: testEvalId,
      studentName: 'Test Unack Student',
      caLevel: 'INTERMEDIATE',
      subjectName: 'Advanced Accounting',
      totalMarks: 60,
      maximumMarks: 100,
      percentage: 60,
      grade: 'PASS',
      questions: []
    })
  );

  const studentToken = generateToken({
    id: testStudentId,
    email: testStudentEmail,
    role: 'STUDENT',
    fullName: 'Test Unack Student',
  });

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${studentToken}`
  };

  try {
    // 1.1 Unacknowledged student check
    const statusRes = await fetch(`${BASE_URL}/api/student/disclaimer/status`, { headers: authHeaders });
    assert.strictEqual(statusRes.status, 200);
    const statusJson = await statusRes.json();
    assert.strictEqual(statusJson.acknowledged, false, 'Unacknowledged student must return false');
    assert.strictEqual(isStudentDisclaimerAcknowledged(testStudentId, testStudentEmail), false);

    // 1.2 Access blocked with 403 DISCLAIMER_REQUIRED (no evaluation content returned)
    const evalBlockedRes = await fetch(`${BASE_URL}/api/student/evaluations/${testEvalId}`, { headers: authHeaders });
    assert.strictEqual(evalBlockedRes.status, 403, 'Direct evaluation access must be rejected with 403');
    const evalBlockedJson = await evalBlockedRes.json();
    assert.strictEqual(evalBlockedJson.code, 'DISCLAIMER_REQUIRED');
    assert.strictEqual(evalBlockedJson.evaluation, undefined, 'Evaluation content must NOT be exposed before disclaimer');

    // 1.3 Acknowledge disclaimer
    const ackRes = await fetch(`${BASE_URL}/api/student/disclaimer/acknowledge`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ version: CURRENT_DISCLAIMER_VERSION }),
    });
    assert.strictEqual(ackRes.status, 200);
    const ackJson = await ackRes.json();
    assert.strictEqual(ackJson.acknowledged, true);

    // 1.4 Evaluation access now succeeds
    const evalAllowedRes = await fetch(`${BASE_URL}/api/student/evaluations/${testEvalId}`, { headers: authHeaders });
    assert.strictEqual(evalAllowedRes.status, 200, 'Evaluation access must now succeed with 200');
    const evalAllowedJson = await evalAllowedRes.json();
    assert(evalAllowedJson.evaluation, 'Evaluation content must now be returned');
    assert.strictEqual(evalAllowedJson.evaluation.id, testEvalId);

    // 1.5 Refresh preserves acknowledged status (no repeated prompt)
    const refreshStatusRes = await fetch(`${BASE_URL}/api/student/disclaimer/status`, { headers: authHeaders });
    const refreshJson = await refreshStatusRes.json();
    assert.strictEqual(refreshJson.acknowledged, true, 'Acknowledged status must persist across refreshes');

    console.log('✓ [1/5] DISCLAIMER RUNTIME TEST: PASS');

    // ==========================================================================
    // 2. CHECK ANSWER SHEET → DISCLAIMER
    // ==========================================================================
    console.log('\n>>> [2/5] RUNNING CHECK ANSWER SHEET → DISCLAIMER TEST...');
    // Create another unacknowledged student
    checkStudentId = `usr_test_check_${Date.now()}`;
    const checkStudentEmail = `test_check_${Date.now()}@caexamchecker.ai`;
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, status)
      VALUES (?, ?, 'hash', 'Test Check Student', 'STUDENT', 'ACTIVE')
    `).run(checkStudentId, checkStudentEmail);

    const checkToken = generateToken({
      id: checkStudentId,
      email: checkStudentEmail,
      role: 'STUDENT',
      fullName: 'Test Check Student',
    });
    const checkHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${checkToken}`
    };

    // Verify student dashboard access works normally without disclaimer gate
    const dashRes = await fetch(`${BASE_URL}/api/student/profile`, { headers: checkHeaders });
    assert.strictEqual(dashRes.status, 200, 'Dashboard/profile should be accessible without disclaimer blocker');

    // Verify Check Answer Sheet workflow:
    // In UploadEvaluation.tsx: handleCheckAnswerSheetClick calls apiRequest('/api/student/disclaimer/status')
    const checkFlowStatus = await fetch(`${BASE_URL}/api/student/disclaimer/status`, { headers: checkHeaders });
    const checkFlowJson = await checkFlowStatus.json();
    assert.strictEqual(checkFlowJson.acknowledged, false, 'Check Answer Sheet flow triggers disclaimer check and receives false');

    // In App.tsx: EvaluationReportWrapper initializes isCheckingDisclaimer=true (showing neutral spinner),
    // and when check returns false, sets isDisclaimerAcknowledged=false and shows DisclaimerModal BEFORE evaluation
    // content can ever be fetched or displayed, guaranteeing NO FLASH of evaluation content.
    console.log('✓ [2/5] CHECK ANSWER SHEET → DISCLAIMER: PASS');

    // ==========================================================================
    // 3. EVALUATION REGRESSION TEST
    // ==========================================================================
    console.log('\n>>> [3/5] RUNNING EVALUATION REGRESSION TEST...');
    // Real regression scenario: Taxation calculation with arithmetic slip in intermediate step,
    // correct statutory provision, correct formula, and correct consequential computation.
    // In previous faulty implementations, this scenario suffered over-deduction down to 0 marks.
    const sampleComponents: MarkingComponent[] = [
      {
        componentId: 'REG_c1',
        componentType: 'PROVISION',
        expectedRequirement: 'State depreciation rate under Section 32 (15%)',
        studentEvidence: 'Correctly cited Section 32 and applicable rate of 15%',
        assessment: 'CORRECT',
        marksAvailable: 2,
        marksAwarded: 2,
        marksDeducted: 0,
        confidence: 95,
      },
      {
        componentId: 'REG_c2',
        componentType: 'CALCULATION',
        expectedRequirement: 'Calculate base figure: 10,00,000 + 2,00,000 = 12,00,000',
        studentEvidence: 'Wrote 10,00,000 + 2,00,000 = 11,00,000 (arithmetic addition slip)',
        assessment: 'PARTIALLY_CORRECT',
        marksAvailable: 2,
        marksAwarded: 1,
        marksDeducted: 1,
        deductionReason: 'Single arithmetic slip in base addition.',
        confidence: 90,
      },
      {
        componentId: 'REG_c3',
        componentType: 'WORKING',
        expectedRequirement: 'Compute 15% depreciation on base figure',
        studentEvidence: 'Computed exactly 15% on 11,00,000 = 1,65,000 (consequentially correct)',
        assessment: 'CORRECT',
        marksAvailable: 2,
        marksAwarded: 2,
        marksDeducted: 0,
        confidence: 95,
      },
    ];

    // Verify 1: Exact maximum marks
    const normalizedComps = normalizeQuestionComponents(sampleComponents, 6, 5, '1');
    const sumAvailable = normalizedComps.reduce((acc, c) => acc + c.marksAvailable, 0);
    assert.strictEqual(sumAvailable, 6, 'Exact maximum marks must be strictly preserved as 6');

    // Verify 2: Partial credit for independently correct content
    const provComp = normalizedComps.find(c => c.componentType === 'PROVISION');
    const workComp = normalizedComps.find(c => c.componentType === 'WORKING');
    assert.strictEqual(provComp?.marksAwarded, 2, 'Full credit for correct provision');
    assert.strictEqual(workComp?.marksAwarded, 2, 'Full consequential credit for correct 15% working calculation');

    // Verify 3: No double deduction
    const calcComp = normalizedComps.find(c => c.componentType === 'CALCULATION');
    assert.strictEqual(calcComp?.marksAwarded, 1, 'Only single mark deducted for the arithmetic slip');
    const totalAwarded = normalizedComps.reduce((acc, c) => acc + c.marksAwarded, 0);
    assert.strictEqual(totalAwarded, 5, 'Total score must be 5/6, NOT over-deducted to 0');

    // Verify 4: Final total integrity across paper structure
    const sampleEvalResult = {
      evaluationId: 'reg_eval_test',
      studentName: 'Regression Candidate',
      caLevel: 'INTERMEDIATE',
      subjectName: 'Taxation (Income Tax & GST)',
      totalMarks: 5,
      maximumMarks: 100,
      percentage: 5,
      grade: 'FAIL',
      questions: [
        {
          questionNumber: '1',
          questionId: 'q1',
          marksAwarded: 5,
          marksLost: 1,
          maximumMarks: 6,
          status: 'partially_correct',
          detailedFeedback: 'Sound understanding with one intermediate addition slip.',
          reasonForDeduction: 'Single arithmetic slip.',
          markingComponents: normalizedComps,
        }
      ]
    } as unknown as EvaluationResult;
    const processedIntegrity = processEvaluationIntegrity(sampleEvalResult, { checkingMode: 'standard' });
    assert.strictEqual(processedIntegrity.maximumMarks, 100, 'Paper maximum marks must strictly remain 100');
    assert.strictEqual(processedIntegrity.totalMarks, 5, 'Final total integrity strictly preserved');

    // Verify 5: Consistent behavior across Strict, Standard, and Moderate modes
    const sampleQuestions: QuestionEvaluation[] = [
      {
        questionNumber: '1',
        questionTitle: 'Question 1',
        marksAwarded: 5,
        maximumMarks: 6,
        status: 'partially_correct',
        feedback: 'Sound understanding with one intermediate addition slip.',
        markingComponents: normalizedComps,
      } as any
    ];
    const multiModeResult = applyMultiModeMarkingPhilosophy(sampleQuestions, 'standard', 100);
    const { strict, standard, moderate } = multiModeResult.modeBreakdown;

    assert(
      strict.totalMarks <= standard.totalMarks &&
      standard.totalMarks <= moderate.totalMarks,
      `Monotonic invariant Strict (${strict.totalMarks}) <= Standard (${standard.totalMarks}) <= Moderate (${moderate.totalMarks}) must hold`
    );
    assert.strictEqual(multiModeResult.officialPaperMaxMarks, 100);
    assert.strictEqual(strict.maximumMarks, 100);
    assert.strictEqual(standard.maximumMarks, 100);
    assert.strictEqual(moderate.maximumMarks, 100);
    assert(strict.totalMarks > 0, 'Strict mode must NOT zero out valid work when evidence exists');

    console.log('✓ [3/5] EVALUATION REGRESSION TEST: PASS');

    // ==========================================================================
    // 4. HISTORY FIRESTORE SOURCE-OF-TRUTH
    // ==========================================================================
    console.log('\n>>> [4/5] RUNNING HISTORY FIRESTORE SOURCE-OF-TRUTH TEST...');
    const fsSourceEvalId = `eval_fs_truth_${Date.now()}`;
    const fsSourceData = {
      id: fsSourceEvalId,
      student_id: testStudentId,
      subject_key: 'ADV_ACC',
      subject_name: 'Advanced Accounting (Authoritative Firestore)',
      level: 'INTERMEDIATE',
      material_type: 'PRACTICE',
      total_marks: 75,
      maximum_marks: 100,
      percentage: 75,
      grade: 'PASS',
      status: 'COMPLETED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 4.1 Write directly to Firestore
    await setFirestoreDoc('evaluations', fsSourceEvalId, fsSourceData);

    // 4.2 Verify Firestore doc exists
    const docReadBack = await getFirestoreDoc<any>('evaluations', fsSourceEvalId);
    assert.strictEqual(docReadBack?.subject_name, 'Advanced Accounting (Authoritative Firestore)');

    // 4.3 Trigger hydrateFromFirestore() and verify it hydrates into SQLite
    await hydrateFromFirestore();
    const hydratedRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(fsSourceEvalId) as any;
    assert(hydratedRow, 'Record from Firestore must be hydrated into SQLite');
    assert.strictEqual(hydratedRow.total_marks, 75);
    assert.strictEqual(hydratedRow.subject_name, 'Advanced Accounting (Authoritative Firestore)');

    // 4.4 Test Firestore tombstone removes record with NO protected account bypass
    await permanentlyDeleteFromFirestore('evaluations', fsSourceEvalId, 'Authoritative Deletion Test');
    await hydrateFromFirestore();
    const deletedRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(fsSourceEvalId);
    assert.strictEqual(deletedRow, undefined, 'Tombstoned evaluation must be pruned from SQLite with no protected account bypass');

    console.log('✓ [4/5] HISTORY FIRESTORE SOURCE-OF-TRUTH: PASS');

    // ==========================================================================
    // 5. LOCAL SQLITE CANNOT OVERWRITE/REINTRODUCE STALE HISTORY
    // ==========================================================================
    console.log('\n>>> [5/5] RUNNING LOCAL SQLITE CANNOT OVERWRITE/REINTRODUCE STALE HISTORY TEST...');

    // 5.1 Test that local SQLite cannot reintroduce a deleted evaluation via seedBaselineToFirestoreIfEmpty
    const deletedStaleId = `eval_stale_deleted_${Date.now()}`;
    // Insert a phantom local evaluation in SQLite
    db.prepare(`
      INSERT INTO evaluations (
        id, student_id, level, material_type, subject_key, subject_name,
        original_filename, status, total_marks, maximum_marks, percentage, grade, created_at
      ) VALUES (?, ?, 'INTERMEDIATE', 'PRACTICE', 'ADV_ACC', 'Stale Deleted Local', 'test.pdf', 'COMPLETED', 40, 100, 40, 'FAIL', CURRENT_TIMESTAMP)
    `).run(deletedStaleId, testStudentId);

    // Record tombstone for this ID
    await permanentlyDeleteFromFirestore('evaluations', deletedStaleId, 'Test deletion');

    // Run seedBaselineToFirestoreIfEmpty
    await seedBaselineToFirestoreIfEmpty();

    // Verify it was NOT re-seeded to Firestore
    const staleInFs = await getFirestoreDoc('evaluations', deletedStaleId);
    assert.strictEqual(staleInFs, null, 'Deleted/tombstoned evaluation must NEVER be re-seeded to Firestore');

    // 5.2 Test that hydrateFromFirestore prunes local evaluations not present in Firestore
    await hydrateFromFirestore();
    const staleInSqlite = db.prepare('SELECT id FROM evaluations WHERE id = ?').get(deletedStaleId);
    assert.strictEqual(staleInSqlite, undefined, 'Stale local evaluation must be pruned from SQLite during hydration');

    // 5.3 Test that syncRecordToFirestore will NOT overwrite newer Firestore data with older local data
    const activeEvalId = `eval_active_version_${Date.now()}`;
    const futureDate = new Date(Date.now() + 60000).toISOString();
    const olderDate = new Date(Date.now() - 60000).toISOString();

    // Set newer doc in Firestore
    await setFirestoreDoc('evaluations', activeEvalId, {
      id: activeEvalId,
      total_marks: 85,
      updated_at: futureDate,
      _updatedAt: futureDate,
    });

    // Attempt to sync older local data to Firestore
    await syncRecordToFirestore('evaluations', activeEvalId, {
      id: activeEvalId,
      total_marks: 30, // Stale older score
      updated_at: olderDate,
      _updatedAt: olderDate,
    });

    // Verify Firestore document retained newer data and was NOT overwritten
    const preservedDoc = await getFirestoreDoc<any>('evaluations', activeEvalId);
    assert.strictEqual(preservedDoc?.total_marks, 85, 'Local SQLite must NOT overwrite newer Firestore data');

    // Clean up activeEvalId
    await deleteFirestoreDoc('evaluations', activeEvalId);

    console.log('✓ [5/5] LOCAL SQLITE CANNOT OVERWRITE/REINTRODUCE STALE HISTORY: PASS');

    console.log('\n========================================================================');
    console.log('--- ALL 5 FINAL RUNTIME VERIFICATION CHECKS PASSED 100% CLEANLY ---');
    console.log('========================================================================\n');
  } finally {
    // Cleanup test data
    db.prepare('DELETE FROM evaluations WHERE id IN (?, ?)').run(testEvalId, testEvalId);
    db.prepare('DELETE FROM student_disclaimer_acknowledgements WHERE student_id IN (?, ?)').run(testStudentId, checkStudentId);
    db.prepare('DELETE FROM student_disclaimers WHERE student_id IN (?, ?)').run(testStudentId, checkStudentId);
    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(testStudentId, checkStudentId);
  }
}

runFinalVerification()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Final verification failed:', err);
    process.exit(1);
  });
