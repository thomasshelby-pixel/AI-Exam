import assert from 'node:assert';
import { db } from '../db.js';
import {
  createAdminQuestion,
  deleteAdminQuestion,
  deleteAdminQuestions,
  getMatchingQuestionsSummary,
  deleteAllMatchingQuestions,
  getAdminQuestions,
} from '../services/mcqService.js';

console.log('========================================================================');
console.log('--- TEST SUITE: MCQ QUESTION BANK BULK DELETE & DELETE ALL ---');
console.log('========================================================================');

async function runTests() {
  // Test 1: Single delete works using the unified engine
  console.log('>>> TEST 1: Single delete using unified engine');
  const q1 = createAdminQuestion({
    course: 'CA_INTERMEDIATE',
    subject: 'Auditing and Ethics',
    chapter: 'Audit Documentation',
    questionText: 'Test Single Delete MCQ Question 1',
    optionA: 'Option A',
    optionB: 'Option B',
    optionC: 'Option C',
    optionD: 'Option D',
    correctAnswer: 'A',
    explanation: 'Explanation 1',
    status: 'draft',
    questionType: 'normal',
  }, 'usr_admin_test_1');

  const singleRes = deleteAdminQuestion(String(q1.id), 'usr_admin_test_1');
  assert.strictEqual(singleRes.success, true, 'Single delete must succeed');

  const checkQ1 = db.prepare('SELECT * FROM mcq_questions WHERE id = ?').get(String(q1.id));
  assert.strictEqual(checkQ1, undefined, 'Deleted question must be removed from mcq_questions');
  console.log('[PASS] Test 1: Single delete successfully removed question');

  // Test 2: Bulk delete of multiple selected questions
  console.log('>>> TEST 2: Bulk delete of multiple selected questions');
  const q2a = createAdminQuestion({
    course: 'CA_INTERMEDIATE',
    subject: 'Auditing and Ethics',
    chapter: 'Audit Strategy',
    questionText: 'Bulk Delete Target Question A',
    optionA: 'A',
    optionB: 'B',
    optionC: 'C',
    optionD: 'D',
    correctAnswer: 'B',
    explanation: 'Explanation A',
    status: 'draft',
    questionType: 'normal',
  }, 'usr_admin_test_1');

  const q2b = createAdminQuestion({
    course: 'CA_INTERMEDIATE',
    subject: 'Auditing and Ethics',
    chapter: 'Audit Strategy',
    questionText: 'Bulk Delete Target Question B',
    optionA: 'A',
    optionB: 'B',
    optionC: 'C',
    optionD: 'D',
    correctAnswer: 'C',
    explanation: 'Explanation B',
    status: 'review',
    questionType: 'normal',
  }, 'usr_admin_test_1');

  const q2Keep = createAdminQuestion({
    course: 'CA_INTERMEDIATE',
    subject: 'Auditing and Ethics',
    chapter: 'Audit Strategy',
    questionText: 'Question To Keep Unaffected',
    optionA: 'A',
    optionB: 'B',
    optionC: 'C',
    optionD: 'D',
    correctAnswer: 'D',
    explanation: 'Explanation Keep',
    status: 'published',
    questionType: 'normal',
  }, 'usr_admin_test_1');

  const bulkRes = deleteAdminQuestions([String(q2a.id), String(q2b.id)], 'usr_admin_test_1');
  assert.strictEqual(bulkRes.success, true, 'Bulk delete must succeed');
  assert.strictEqual(bulkRes.deletedCount, 2, 'Deleted count must be 2');
  assert.strictEqual(bulkRes.normalCount, 2, 'Normal count must be 2');

  const checkQ2a = db.prepare('SELECT * FROM mcq_questions WHERE id = ?').get(String(q2a.id));
  const checkQ2b = db.prepare('SELECT * FROM mcq_questions WHERE id = ?').get(String(q2b.id));
  const checkKeep = db.prepare('SELECT * FROM mcq_questions WHERE id = ?').get(String(q2Keep.id));

  assert.strictEqual(checkQ2a, undefined, 'q2a must be deleted');
  assert.strictEqual(checkQ2b, undefined, 'q2b must be deleted');
  assert.notStrictEqual(checkKeep, undefined, 'q2Keep must remain untouched');
  console.log('[PASS] Test 2: Bulk delete deleted only target selected questions');

  // Test 3: Case-based questions deletion & parent case study integrity
  console.log('>>> TEST 3: Case study question deletion and parent case integrity');
  const testCaseId = 'case_test_bulk_delete_' + Date.now();
  db.prepare(`
    INSERT INTO mcq_cases (case_id, case_title, case_scenario, course, subject, chapter, status, created_by)
    VALUES (?, 'Test Case Scenario', 'A large manufacturing firm has discrepancies...', 'CA_FINAL', 'Advanced Auditing', 'Risk Assessment', 'draft', 'admin_1')
  `).run(testCaseId);

  const qCase1 = createAdminQuestion({
    course: 'CA_FINAL',
    subject: 'Advanced Auditing',
    chapter: 'Risk Assessment',
    questionText: 'Case Child Q1',
    optionA: 'A', optionB: 'B', optionC: 'C', optionD: 'D',
    correctAnswer: 'A',
    explanation: 'Exp Case 1',
    status: 'draft',
    questionType: 'case_based',
    caseId: testCaseId,
    caseSequence: 1,
  }, 'usr_admin_test_1');

  const qCase2 = createAdminQuestion({
    course: 'CA_FINAL',
    subject: 'Advanced Auditing',
    chapter: 'Risk Assessment',
    questionText: 'Case Child Q2',
    optionA: 'A', optionB: 'B', optionC: 'C', optionD: 'D',
    correctAnswer: 'B',
    explanation: 'Exp Case 2',
    status: 'draft',
    questionType: 'case_based',
    caseId: testCaseId,
    caseSequence: 2,
  }, 'usr_admin_test_1');

  // Delete only qCase1
  deleteAdminQuestions([String(qCase1.id)], 'usr_admin_test_1');
  const caseAfterOne = db.prepare('SELECT * FROM mcq_cases WHERE case_id = ?').get(testCaseId) as any;
  assert.notStrictEqual(caseAfterOne, undefined, 'Case must NOT be deleted while other child questions remain');

  // Delete remaining qCase2
  deleteAdminQuestions([String(qCase2.id)], 'usr_admin_test_1');
  const caseAfterAll = db.prepare('SELECT * FROM mcq_cases WHERE case_id = ?').get(testCaseId) as any;
  assert.strictEqual(caseAfterAll, undefined, 'Case must be cleaned up when all child questions are deleted');
  console.log('[PASS] Test 3: Parent case preserved when child remains, and cleaned up when all children deleted');

  // Test 4: Delete All Matching Questions with active filters
  console.log('>>> TEST 4: Delete All Matching Questions with active filters');
  const uniqueFilterSubject = 'Specific Filter Subject ' + Date.now();
  for (let i = 1; i <= 3; i++) {
    createAdminQuestion({
      course: 'CA_FOUNDATION',
      subject: uniqueFilterSubject,
      chapter: 'Accounting Concepts',
      questionText: `Filter Match Question ${i}`,
      optionA: 'A', optionB: 'B', optionC: 'C', optionD: 'D',
      correctAnswer: 'A',
      explanation: 'Exp',
      status: 'draft',
      questionType: 'normal',
    }, 'usr_admin_test_1');
  }

  const otherSubjectQ = createAdminQuestion({
    course: 'CA_FOUNDATION',
    subject: 'Completely Different Subject',
    chapter: 'Accounting Concepts',
    questionText: 'Different Subject Question',
    optionA: 'A', optionB: 'B', optionC: 'C', optionD: 'D',
    correctAnswer: 'A',
    explanation: 'Exp',
    status: 'draft',
    questionType: 'normal',
  }, 'usr_admin_test_1');

  // Check summary
  const summary = getMatchingQuestionsSummary({
    course: 'CA_FOUNDATION',
    subject: uniqueFilterSubject,
    status: 'draft',
  });
  assert.strictEqual(summary.totalMatching, 3, 'Summary must reflect exactly 3 matching questions');

  // Delete all matching the specific filter
  const delAllRes = deleteAllMatchingQuestions({
    course: 'CA_FOUNDATION',
    subject: uniqueFilterSubject,
    status: 'draft',
  }, 'usr_admin_test_1');

  assert.strictEqual(delAllRes.deletedCount, 3, 'Must delete exactly 3 questions');

  // Verify other subject question is still safe
  const checkOther = db.prepare('SELECT * FROM mcq_questions WHERE id = ?').get(otherSubjectQ.id);
  assert.notStrictEqual(checkOther, undefined, 'Other questions must remain safe and untouched');
  console.log('[PASS] Test 4: Delete All matching active filters deleted only matching records');

  // Test 5: Safety block against accidental unfiltered Delete All
  console.log('>>> TEST 5: Accidental database wipe safety block');
  assert.throws(() => {
    deleteAllMatchingQuestions({
      course: 'ALL',
      status: 'ALL',
      search: '',
    }, 'usr_admin_test_1');
  }, /Safety Block/i, 'Must throw safety block error when no filters are provided');
  console.log('[PASS] Test 5: Unfiltered Delete All successfully blocked by safety guard');

  // Test 6: Audit log creation
  console.log('>>> TEST 6: Audit log verification');
  const auditEntry = db.prepare(`
    SELECT * FROM audit_logs
    WHERE action = 'MCQ_QUESTIONS_BULK_DELETE'
    ORDER BY created_at DESC
    LIMIT 1
  `).get() as any;
  assert.notStrictEqual(auditEntry, undefined, 'Bulk delete must record an entry in audit_logs');
  console.log('[PASS] Test 6: Audit log entry verified');

  console.log('========================================================================');
  console.log('✅ ALL MCQ QUESTION BANK BULK DELETE TESTS PASSED!');
  console.log('========================================================================');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
