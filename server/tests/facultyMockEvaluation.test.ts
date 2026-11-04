import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, initDatabase } from '../db.js';
import { enforceMaterialHardGate } from '../services/materialHardGateService.js';
import { parseFacultyMockEvaluationReference } from '../services/facultyMockReferenceParser.js';
import { extractRelevantReferenceSnippets } from '../services/questionChunkEvaluator.js';

initDatabase();

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
const combinedReferenceTxt = [
  '[QUESTION PAPER]',
  questionPaperText,
  '[SUGGESTED ANSWERS]',
  suggestedAnswersText,
  '[MARKING SCHEME]',
  markingSchemeText,
].join('\n\n');
const parsedReference = parseFacultyMockEvaluationReference(combinedReferenceTxt);
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
      suggested_answer_file_id, suggested_answer_file_name, suggested_answer_file_size,
      status, created_by, created_at, updated_at
    ) VALUES (?, ?, 'INTERMEDIATE', 'May 2027', 'GROUP_1', 'inter_advanced_accounting',
      'Advanced Accounting', 'Paper 1', 1, 'Test Faculty Mock 01', 100, 'New Scheme 2024',
      ?, ?, ?,
      'qp-file', 'question-paper.pdf', 1000, 'reference-file', 'faculty-mock-reference.txt', 1600,
      'PUBLISHED', 'test-admin', ?, ?)
  `).run(testId, facultyId, questionPaperText, suggestedAnswersText, markingSchemeText, now, now);

  const stored = db.prepare('SELECT * FROM faculty_mock_tests WHERE id = ?').get(testId) as any;
  assert.equal(stored.mock_number, 1, 'Faculty mock stores its sequence number');
  assert.equal(stored.status, 'PUBLISHED', 'Published faculty mock is active for students');

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
      question_material_id: stored.suggested_answer_file_id,
      suggested_answer_material_id: stored.suggested_answer_file_id,
      marking_scheme_material_id: stored.suggested_answer_file_id,
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
  assert.equal(verified.questionMaterialId, 'reference-file', 'AI question text is sourced from the private TXT, not the download-only QP PDF');
  assert.equal(verified.suggestedAnswerMaterialId, 'reference-file', 'The private TXT file ID is retained as the suggested-answer source');
  assert.equal(verified.markingSchemeMaterialId, 'reference-file', 'The same private TXT file ID anchors the marking-scheme source');
  assert.equal(verified.manifest.materialSource, 'FACULTY_MOCK', 'Faculty mock remains identifiable as its own source type');

  const lockedFacultyReference = extractRelevantReferenceSnippets(
    'Q1',
    questionPaperText,
    suggestedAnswersText,
    markingSchemeText,
    {
      qpMaterialId: 'reference-file',
      saMaterialId: 'reference-file',
      msMaterialId: 'reference-file',
      materialVersions: '1.0',
      sourceType: 'FACULTY_MOCK',
      materialType: 'FACULTY_MOCK_TEST',
      facultyMockTestId: testId,
      materialTitle: 'Test Faculty Mock 01',
    },
  );
  assert.equal(lockedFacultyReference.referenceTrace.sourceType, 'FACULTY_MOCK', 'Question-level audit trace identifies the exact Faculty Mock source');
  assert.equal(lockedFacultyReference.referenceTrace.questionPaperMaterialId, 'reference-file', 'Question-level trace points at the TXT that supplied the question text');
  assert.equal(lockedFacultyReference.referenceTrace.suggestedAnswerMaterialId, 'reference-file', 'Question-level trace points at the private TXT');
  assert.equal(lockedFacultyReference.referenceTrace.markingSchemeMaterialId, 'reference-file', 'Question-level trace points at the same private TXT for marking');
  assert.equal(lockedFacultyReference.referenceTrace.facultyMockTestId, testId, 'Question-level trace retains the exact selected mock ID');
  assert.equal(verified.manifest.materialType, 'FACULTY_MOCK_TEST', 'Evaluation evidence identifies the faculty mock material type');

  // Model Test Paper uses this same question-level reference lock while
  // preserving the selected test number and the exact uploaded official files.
  const modelQuestionPaperText = [
    'CA Intermediate Advanced Accounting — Model Test Paper 2',
    'Maximum Marks: 100',
    'Question 1. Prepare journal entries and supporting working notes.',
  ].join('\n');
  const modelSuggestedAnswersText = [
    'Suggested Answers — Model Test Paper 2',
    'Question 1. Correct treatment, journal entries and calculations are given below.',
  ].join('\n');
  const modelMarkingSchemeText = [
    'Question 1: 5 marks for treatment, 3 marks for workings and 2 marks for conclusion.',
  ].join('\n');
  const selectedModelTest = {
    id: `model_test_2_${suffix}`,
    question_paper_title: 'CA Intermediate Advanced Accounting MTP 2',
    level: 'INTERMEDIATE',
    subject_key: 'inter_advanced_accounting',
    subject_name: 'Advanced Accounting',
    paper: 'Paper 1',
    attempt: 'All',
    syllabus_version: 'New Scheme 2024',
    material_type: 'MODEL_TEST_PAPER',
    model_test_number: 2,
    source_format: 'SEPARATE',
    version: '1.0',
    status: 'ACTIVE',
    admin_approved: 1,
    file_id: 'model-test-2-question-paper',
    question_material_id: 'model-test-2-question-paper',
    suggested_answer_material_id: 'model-test-2-suggested-answers',
    marking_scheme_material_id: 'model-test-2-marking-scheme',
    official_max_marks: 100,
    question_paper_text: modelQuestionPaperText,
    suggested_answers_text: modelSuggestedAnswersText,
    marking_scheme_text: modelMarkingSchemeText,
  };
  const verifiedModelTest = enforceMaterialHardGate({
    evaluationId: `eval_model_test_${suffix}`,
    level: 'INTERMEDIATE',
    subjectKey: 'inter_advanced_accounting',
    subjectName: 'Advanced Accounting',
    paper: 'Paper 1',
    attempt: 'All',
    materialType: 'MODEL_TEST_PAPER',
    modelTestNumber: 2,
    preloadedMaterial: selectedModelTest,
  });
  assert.equal(verifiedModelTest.id, selectedModelTest.id, 'Selected Model Test 2 material is retained');
  assert.equal(verifiedModelTest.modelTestNumber, 2, 'Model Test number is retained by the verified reference package');
  assert.equal(verifiedModelTest.questionMaterialId, 'model-test-2-question-paper', 'Model Test QP file ID is retained');
  assert.equal(verifiedModelTest.suggestedAnswerMaterialId, 'model-test-2-suggested-answers', 'Model Test suggested-answer source ID is retained');
  assert.throws(
    () => enforceMaterialHardGate({
      evaluationId: `eval_wrong_model_test_${suffix}`,
      level: 'INTERMEDIATE',
      subjectKey: 'inter_advanced_accounting',
      subjectName: 'Advanced Accounting',
      paper: 'Paper 1',
      attempt: 'All',
      materialType: 'MODEL_TEST_PAPER',
      modelTestNumber: 1,
      preloadedMaterial: selectedModelTest,
    }),
    /MODEL_TEST_NUMBER_MISMATCH/,
    'A Model Test 2 reference can never be reused for a Model Test 1 selection',
  );

  const lockedModelTestReference = extractRelevantReferenceSnippets(
    'Q1',
    modelQuestionPaperText,
    modelSuggestedAnswersText,
    modelMarkingSchemeText,
    {
      qpMaterialId: verifiedModelTest.questionMaterialId,
      saMaterialId: verifiedModelTest.suggestedAnswerMaterialId,
      msMaterialId: verifiedModelTest.markingSchemeMaterialId,
      materialVersions: verifiedModelTest.version,
      sourceType: 'GLOBAL',
      materialType: 'MODEL_TEST_PAPER',
      modelTestNumber: 2,
      materialTitle: verifiedModelTest.questionPaperTitle,
    },
  );
  assert.equal(lockedModelTestReference.referenceTrace.modelTestNumber, 2, 'Question-level Model Test trace preserves the chosen test number');
  assert.equal(lockedModelTestReference.referenceTrace.suggestedAnswerMaterialId, 'model-test-2-suggested-answers', 'Question-level Model Test trace preserves its exact answer material ID');

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
