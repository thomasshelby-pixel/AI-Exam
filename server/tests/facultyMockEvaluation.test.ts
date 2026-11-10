import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, initDatabase } from '../db.js';
import { enforceMaterialHardGate, resolveOfficialPaperMaximumMarks } from '../services/materialHardGateService.js';
import { resolveFacultyMockComponentSourceIds } from '../services/materialComponentSourceIds.js';
import { buildFacultyMockEvaluationReference, parseFacultyMockEvaluationReference, validateFacultyMockReferenceSections } from '../services/facultyMockReferenceParser.js';
import {
  isEligibleFacultyMockReviewRetry,
  isExactFacultyMockReviewRetryCopy,
} from '../services/facultyMockEntitlementService.js';

initDatabase();

const eligibleRetrySource = {
  id: 'eval_review_original',
  student_id: 'student_review_retry',
  status: 'NEEDS_REVIEW',
  evaluation_source: 'FACULTY_MOCK',
  material_type: 'FACULTY_MOCK_TEST',
  faculty_mock_test_id: 'faculty_mock_retry_test',
  answer_sheet_sha256: 'a'.repeat(64),
  faculty_mock_review_retry_evaluation_id: null,
};
assert.equal(
  isEligibleFacultyMockReviewRetry(eligibleRetrySource, 'student_review_retry', 'faculty_mock_retry_test'),
  true,
  'Only the owner can use the one-time retry for their own Faculty Mock NEEDS_REVIEW record.',
);
assert.equal(
  isEligibleFacultyMockReviewRetry(eligibleRetrySource, 'another_student', 'faculty_mock_retry_test'),
  false,
  'A different student cannot reuse another student\'s review retry.',
);
assert.equal(
  isEligibleFacultyMockReviewRetry(eligibleRetrySource, 'student_review_retry', 'another_mock'),
  false,
  'A review retry cannot be moved to a different Faculty Mock.',
);
assert.equal(
  isEligibleFacultyMockReviewRetry({ ...eligibleRetrySource, status: 'COMPLETED' }, 'student_review_retry', 'faculty_mock_retry_test'),
  false,
  'A completed/certified evaluation is not eligible for a free review retry.',
);
assert.equal(
  isEligibleFacultyMockReviewRetry({ ...eligibleRetrySource, faculty_mock_review_retry_evaluation_id: 'eval_retry_used' }, 'student_review_retry', 'faculty_mock_retry_test'),
  false,
  'The same review result cannot claim a second free retry.',
);
assert.equal(
  isEligibleFacultyMockReviewRetry({ ...eligibleRetrySource, retry_of_evaluation_id: 'eval_review_original' }, 'student_review_retry', 'faculty_mock_retry_test'),
  false,
  'A NEEDS_REVIEW result that is already a retry cannot start another free retry chain.',
);
assert.equal(
  isEligibleFacultyMockReviewRetry({ ...eligibleRetrySource, answer_sheet_sha256: null }, 'student_review_retry', 'faculty_mock_retry_test'),
  false,
  'No free retry is allowed when the original answer-sheet fingerprint is missing.',
);
assert.equal(
  isExactFacultyMockReviewRetryCopy('b'.repeat(64), 'b'.repeat(64)),
  true,
  'Exact same-copy retry requires an identical SHA-256 fingerprint.',
);
assert.equal(
  isExactFacultyMockReviewRetryCopy('b'.repeat(64), 'c'.repeat(64)),
  false,
  'An edited or different PDF cannot use the free review retry.',
);
assert.equal(
  isExactFacultyMockReviewRetryCopy('', 'c'.repeat(64)),
  false,
  'Missing original fingerprint never passes the same-copy check.',
);

// The hard gate may take the official total from the QP header. Worker
// re-validation must apply this same precedence rather than comparing the
// header-derived job total to only the raw Faculty Mock record field.
assert.equal(
  resolveOfficialPaperMaximumMarks(100, 'CA Mock Question Paper\nMaximum Marks: 50'),
  50,
  'An explicit supported QP maximum overrides a stale/default configured maximum consistently.',
);
assert.equal(
  resolveOfficialPaperMaximumMarks(80, 'CA Mock Question Paper with no maximum-marks header.'),
  80,
  'When the QP does not state a maximum, the configured mock maximum remains authoritative.',
);

assert.equal(
  resolveOfficialPaperMaximumMarks(100, 'CA Faculty Mock Question Paper\nMaximum Marks: 80'),
  80,
  'An explicit custom 80-mark Faculty Mock maximum must override a stale configured 100-mark default.',
);
assert.equal(
  resolveOfficialPaperMaximumMarks(100, 'CA Faculty Mock Question Paper\nMaximum Marks: 60'),
  60,
  'An explicit custom 60-mark Faculty Mock maximum must be preserved.',
);

assert.equal(
  resolveOfficialPaperMaximumMarks(100, 'Question 1: Marks: 5\\nQuestion 2: 4 marks'),
  100,
  'A question-level marks entry must not be mistaken for the whole-paper maximum.',
);
assert.equal(
  resolveOfficialPaperMaximumMarks(100, 'CA Faculty Mock Question Paper\\nMarks: 80'),
  80,
  'A legacy generic two- or three-digit paper Marks header remains supported.',
);


const legacyMockSourceIds = resolveFacultyMockComponentSourceIds({
  id: 'legacy-mock-no-component-file-ids',
  marking_scheme_text: 'Marking scheme evidence with sufficient detail.',
});
assert.equal(legacyMockSourceIds.questionMaterialId, 'mat_qp_legacy-mock-no-component-file-ids');
assert.equal(legacyMockSourceIds.suggestedAnswerMaterialId, 'mat_sa_legacy-mock-no-component-file-ids');
assert.equal(legacyMockSourceIds.markingSchemeMaterialId, 'mat_ms_legacy-mock-no-component-file-ids');

const suffix = crypto.randomBytes(6).toString('hex');
const facultyId = `fmock_test_faculty_${suffix}`;
const testId = `fmock_test_paper_${suffix}`;
const now = new Date().toISOString();
const questionPaperText = [
  'CA Intermediate Advanced Accounting — Faculty Mock Question Paper',
  'Maximum Marks: 100',
  'Question 1. Prepare the relevant journal entries and explain the accounting treatment with supporting working notes.',
  'Question 2. Calculate the required amount and show each step of your calculation.',
].join('\n\n');
const suggestedAnswersText = [
  'Suggested Answer — Faculty Mock',
  'Question 1. The correct accounting treatment is explained below with the relevant standard and journal entries.',
  'Working Note 1: Compute the amount using the applicable accounting principle and disclose all assumptions.',
  'Question 2. The calculation and reasoning are set out step by step below.',
].join('\n\n');
const markingSchemeText = [
  'Question 1: 5 marks for correct treatment, supporting standard and journal entries.',
  'Question 2: 5 marks for correct formula, workings, calculation and conclusion.',
].join('\n\n');
const combinedReferenceTxt = buildFacultyMockEvaluationReference({
  questionPaperText,
  suggestedAnswersText,
  markingSchemeText,
});
const parsedReference = parseFacultyMockEvaluationReference(combinedReferenceTxt);
const independentReferences = validateFacultyMockReferenceSections({
  questionPaperText,
  suggestedAnswersText,
  // Repeated heading-like lines are ordinary content inside a separate TXT.
  markingSchemeText: 'Marking Scheme\n' + markingSchemeText + '\nMarking Scheme\nAdditional marking notes and examiner guidance.',
});
assert.equal(independentReferences.questionPaperText, questionPaperText, 'Separate Question Paper TXT is validated as its own section');
assert.equal(independentReferences.suggestedAnswersText, suggestedAnswersText, 'Separate Suggested Answers TXT is validated as its own section');
assert.match(independentReferences.markingSchemeText, /Marking Scheme\nAdditional marking notes/, 'Repeated Marking Scheme phrases inside its own TXT are accepted as content');
assert.equal(parsedReference.questionPaperText, questionPaperText, 'Parser separates the Question Paper section from the single TXT');
assert.equal(parsedReference.suggestedAnswersText, suggestedAnswersText, 'Parser separates Suggested Answers from the single TXT');
assert.equal(parsedReference.markingSchemeText, markingSchemeText, 'Parser separates Marking Scheme from the single TXT');
assert.throws(
  () => parseFacultyMockEvaluationReference('[QUESTION PAPER]\n' + questionPaperText + '\n[SUGGESTED ANSWERS]\n' + suggestedAnswersText),
  /MARKING SCHEME/,
  'Parser rejects evaluation TXT files that omit the required Marking Scheme section',
);

try {
  db.prepare('DELETE FROM faculty_mock_tests WHERE id = ?').run(testId);
  db.prepare('DELETE FROM faculty_mock_faculties WHERE id = ?').run(facultyId);

  db.prepare(`
    INSERT INTO faculty_mock_faculties
      (id, name, description, status, sort_order, created_by, created_at, updated_at)
    VALUES (?, 'Test Faculty', 'Fixture', 'ACTIVE', 0, 'test-admin', ?, ?)
  `).run(facultyId, now, now);

  db.prepare(`
    INSERT INTO faculty_mock_tests (
      id, faculty_id, course_level, attempt, model_group, subject_key, subject_name, paper,
      mock_number, title, maximum_marks, syllabus_version, question_paper_text, suggested_answers_text,
      marking_scheme_text, question_paper_file_id, question_paper_file_name, question_paper_file_size,
      question_paper_reference_file_id, question_paper_reference_file_name, question_paper_reference_file_size,
      suggested_answer_file_id, suggested_answer_file_name, suggested_answer_file_size,
      marking_scheme_file_id, marking_scheme_file_name, marking_scheme_file_size,
      status, created_by, created_at, updated_at
    ) VALUES (?, ?, 'INTERMEDIATE', 'May 2027', 'GROUP_1', 'inter_advanced_accounting',
      'Advanced Accounting', 'Paper 1', 1, 'Test Faculty Mock 01', 100, 'New Scheme 2024',
      ?, ?, ?,
      'qp-file', 'question-paper.pdf', 1000,
      'qp-text-file', 'question-paper-reference.txt', 1200,
      'suggested-answer-file', 'suggested-answers.txt', 1400,
      'marking-scheme-file', 'marking-scheme.txt', 800,
      'PUBLISHED', 'test-admin', ?, ?)
  `).run(testId, facultyId, questionPaperText, suggestedAnswersText, markingSchemeText, now, now);

  const stored = db.prepare('SELECT * FROM faculty_mock_tests WHERE id = ?').get(testId) as any;
  assert.equal(stored.mock_number, 1, 'Faculty mock stores its sequence number');
  assert.equal(stored.status, 'PUBLISHED', 'Published faculty mock is active for students');
  assert.equal(stored.question_paper_reference_file_id, 'qp-text-file', 'Private evaluation Question Paper TXT metadata is stored independently from the student PDF');
  assert.equal(stored.suggested_answer_file_id, 'suggested-answer-file', 'Suggested Answers TXT metadata has its own file record');
  assert.equal(stored.marking_scheme_file_id, 'marking-scheme-file', 'Marking Scheme TXT metadata has its own file record');
  assert.equal(stored.access_type, 'FREE', 'Existing/default faculty mocks preserve free first-copy access');

  const storedSourceIds = resolveFacultyMockComponentSourceIds(stored);
  assert.equal(storedSourceIds.questionMaterialId, 'qp-text-file');
  assert.equal(storedSourceIds.suggestedAnswerMaterialId, 'suggested-answer-file');
  assert.equal(storedSourceIds.markingSchemeMaterialId, 'marking-scheme-file');

  const paidTestId = `fmock_paid_mode_${suffix}`;
  db.prepare(`
    INSERT INTO faculty_mock_tests (
      id, faculty_id, course_level, attempt, subject_key, subject_name, paper, mock_number,
      title, question_paper_text, suggested_answers_text, question_paper_file_id,
      suggested_answer_file_id, access_type
    ) VALUES (?, ?, 'INTERMEDIATE', 'May 2027', 'inter_advanced_accounting',
      'Advanced Accounting', 'Paper 1', 2, 'Paid Faculty Mock', ?, ?, 'paid-qp-file',
      'paid-answer-file', 'PAID')
  `).run(paidTestId, facultyId, questionPaperText, suggestedAnswersText);
  const paidMock = db.prepare('SELECT access_type FROM faculty_mock_tests WHERE id = ?').get(paidTestId) as any;
  assert.equal(paidMock.access_type, 'PAID', 'Admin-selected paid access mode persists independently for a mock');

  const verified = enforceMaterialHardGate({
    evaluationId: 'eval_' + suffix,
    level: 'INTERMEDIATE',
    subjectKey: 'inter_advanced_accounting',
    subjectName: 'Advanced Accounting',
    paper: 'Paper 1',
    attempt: 'May 2027',
    syllabusVersion: 'New Scheme 2024',
    materialType: 'FACULTY_MOCK_TEST',
    evaluationSource: 'FACULTY_MOCK',
    preloadedMaterial: {
      id: stored.id,
      question_paper_title: stored.title,
      level: stored.course_level,
      subject_key: stored.subject_key,
      subject_name: stored.subject_name,
      paper: stored.paper,
      attempt: stored.attempt,
      syllabus_version: stored.syllabus_version,
      material_type: 'FACULTY_MOCK_TEST',
      source_format: 'SEPARATE',
      version: '1.0',
      status: 'ACTIVE',
      admin_approved: 1,
      file_id: stored.suggested_answer_file_id,
      question_material_id: stored.question_paper_reference_file_id,
      suggested_answer_material_id: stored.suggested_answer_file_id,
      marking_scheme_material_id: stored.marking_scheme_file_id,
      official_max_marks: stored.maximum_marks,
      question_paper_text: stored.question_paper_text,
      suggested_answers_text: stored.suggested_answers_text,
      marking_scheme_text: stored.marking_scheme_text,
    },
  });

  assert.equal(verified.id, testId, 'Hard gate uses the exact selected faculty mock record');
  assert.equal(verified.questionPaperText, questionPaperText, 'AI reference package receives the selected Question Paper');
  assert.equal(verified.suggestedAnswersText, suggestedAnswersText, 'AI reference package receives only the selected mock Suggested Answer');
  assert.equal(verified.markingSchemeText, markingSchemeText, 'AI evaluation receives the Marking Scheme section parsed from the same TXT reference');
  assert.equal(verified.officialPaperMaxMarks, 100, 'Mock maximum marks are preserved');
  assert.equal(verified.manifest.materialSource, 'FACULTY_MOCK', 'Faculty mock remains explicitly distinct from institute and global material');
  assert.equal(verified.manifest.materialType, 'FACULTY_MOCK_TEST', 'Evaluation evidence identifies the faculty mock material type');
  assert.equal(verified.manifest.questionMaterialId, 'qp-text-file', 'Question Paper evidence binds to its own private TXT file');
  assert.equal(verified.manifest.suggestedAnswerMaterialId, 'suggested-answer-file', 'Suggested Answer evidence binds to its own private TXT file');
  assert.equal(verified.manifest.markingSchemeMaterialId, 'marking-scheme-file', 'Marking Scheme evidence binds to its own private TXT file');

  assert.throws(() => enforceMaterialHardGate({
    evaluationId: 'eval_unlocked_' + suffix,
    level: 'INTERMEDIATE',
    subjectKey: 'inter_advanced_accounting',
    subjectName: 'Advanced Accounting',
    paper: 'Paper 1',
    attempt: 'May 2027',
    materialType: 'FACULTY_MOCK_TEST',
    evaluationSource: 'FACULTY_MOCK',
  }), /FACULTY_MOCK_REFERENCE_LOCK_REQUIRED/, 'Faculty Mock evaluation cannot fall back to global reference material when its exact mock record is missing');

  assert.throws(() => enforceMaterialHardGate({
    evaluationId: 'eval_missing_' + suffix,
    level: 'INTERMEDIATE',
    subjectKey: 'inter_advanced_accounting',
    attempt: 'May 2027',
    materialType: 'FACULTY_MOCK_TEST',
    evaluationSource: 'FACULTY_MOCK',
    preloadedMaterial: {
      id: testId,
      level: 'INTERMEDIATE',
      subject_key: 'inter_advanced_accounting',
      paper: 'Paper 1',
      attempt: 'May 2027',
      material_type: 'FACULTY_MOCK_TEST',
      question_paper_text: questionPaperText,
      suggested_answers_text: '',
      marking_scheme_text: stored.marking_scheme_text,
    },
  }), /not available|material|MARKING_SCHEME_MISSING/i, 'Hard gate rejects a faculty mock with missing required TXT reference content');

  assert.throws(() => db.prepare(`
    INSERT INTO faculty_mock_tests (
      id, faculty_id, course_level, attempt, subject_key, subject_name, paper, mock_number,
      title, question_paper_text, suggested_answers_text, question_paper_file_id, suggested_answer_file_id
    ) VALUES (?, ?, 'INTERMEDIATE', 'May 2027', 'inter_advanced_accounting', 'Advanced Accounting',
      'Paper 1', 1, 'Duplicate Mock', ?, ?, 'qp-2', 'sa-2')
  `).run('fmock_duplicate_' + suffix, facultyId, questionPaperText, suggestedAnswersText), /UNIQUE constraint failed/i,
  'Same faculty + attempt + subject + paper cannot publish a duplicate Mock Number');

  // One free accepted copy per student + exact faculty mock; another test or
  // another faculty receives an independent first-copy allowance.
  const studentId = `fmock_test_student_${suffix}`;
  const freeEvaluationId = `eval_fmock_free_${suffix}`;
  const repeatEvaluationId = `eval_fmock_repeat_${suffix}`;
  const firstClaim = db.prepare(`
    INSERT OR IGNORE INTO faculty_mock_free_uses (student_id, faculty_mock_test_id, evaluation_id)
    VALUES (?, ?, ?)
  `).run(studentId, testId, freeEvaluationId);
  const duplicateFreeClaim = db.prepare(`
    INSERT OR IGNORE INTO faculty_mock_free_uses (student_id, faculty_mock_test_id, evaluation_id)
    VALUES (?, ?, ?)
  `).run(studentId, testId, repeatEvaluationId);
  assert.equal(Number(firstClaim.changes), 1, 'First accepted copy claims the free-copy slot');
  assert.equal(Number(duplicateFreeClaim.changes), 0, 'A second copy cannot claim another free slot for the same mock');
  assert.equal(
    (db.prepare('SELECT evaluation_id FROM faculty_mock_free_uses WHERE student_id = ? AND faculty_mock_test_id = ?').get(studentId, testId) as any).evaluation_id,
    freeEvaluationId,
    'The original free-copy claim remains bound to the first evaluation',
  );

  const paidOrderId = `ord_fmock_paid_${suffix}`;
  db.prepare(`
    INSERT INTO faculty_mock_copy_purchases (order_id, student_id, faculty_mock_test_id, status)
    VALUES (?, ?, ?, 'AVAILABLE')
  `).run(paidOrderId, studentId, testId);
  const paidCopyConsume = db.prepare(`
    UPDATE faculty_mock_copy_purchases
    SET status = 'CONSUMED', evaluation_id = ?, consumed_at = CURRENT_TIMESTAMP
    WHERE order_id = ? AND student_id = ? AND faculty_mock_test_id = ? AND status = 'AVAILABLE'
  `).run(repeatEvaluationId, paidOrderId, studentId, testId);
  const reusedPaidCopy = db.prepare(`
    UPDATE faculty_mock_copy_purchases
    SET status = 'CONSUMED', evaluation_id = ?
    WHERE order_id = ? AND student_id = ? AND faculty_mock_test_id = ? AND status = 'AVAILABLE'
  `).run(`eval_fmock_reuse_${suffix}`, paidOrderId, studentId, testId);
  assert.equal(Number(paidCopyConsume.changes), 1, 'A verified paid order grants one repeat evaluation');
  assert.equal(Number(reusedPaidCopy.changes), 0, 'One paid order cannot be consumed twice');

  console.log('PASS: Faculty mock numbering, selected reference binding, AI hard gate and duplicate-number protection verified.');
} finally {
  db.prepare('DELETE FROM faculty_mock_free_uses WHERE faculty_mock_test_id = ?').run(testId);
  db.prepare('DELETE FROM faculty_mock_copy_purchases WHERE faculty_mock_test_id = ?').run(testId);
  db.prepare('DELETE FROM faculty_mock_tests WHERE faculty_id = ?').run(facultyId);
  db.prepare('DELETE FROM faculty_mock_faculties WHERE id = ?').run(facultyId);
}
