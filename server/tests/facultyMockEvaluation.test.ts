import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, initDatabase } from '../db.js';
import { enforceMaterialHardGate } from '../services/materialHardGateService.js';

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
      ?, ?, 'Step-wise marking notes: award marks for correct principle, calculation and presentation.',
      'qp-file', 'question-paper.pdf', 1000, 'sa-file', 'suggested-answer.pdf', 1200,
      'PUBLISHED', 'test-admin', ?, ?)
  `).run(testId, facultyId, questionPaperText, suggestedAnswersText, now, now);

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
      official_max_marks: stored.maximum_marks,
      question_paper_text: stored.question_paper_text,
      suggested_answers_text: stored.suggested_answers_text,
      marking_scheme_text: stored.marking_scheme_text,
    },
  });

  assert.equal(verified.id, testId, 'Hard gate uses the exact selected faculty mock record');
  assert.equal(verified.questionPaperText, questionPaperText, 'AI reference package receives the selected Question Paper');
  assert.equal(verified.suggestedAnswersText, suggestedAnswersText, 'AI reference package receives only the selected mock Suggested Answer');
  assert.equal(verified.markingSchemeText, stored.marking_scheme_text, 'Optional marking scheme is included in the reference package');
  assert.equal(verified.officialPaperMaxMarks, 100, 'Mock maximum marks are preserved');
  assert.equal(verified.manifest.materialSource, 'GLOBAL', 'Faculty mock does not masquerade as institute-sourced material');
  assert.equal(verified.manifest.materialType, 'FACULTY_MOCK_TEST', 'Evaluation evidence identifies the faculty mock material type');

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
      question_paper_text: questionPaperText,
      suggested_answers_text: '',
      marking_scheme_text: stored.marking_scheme_text,
    },
  }), /not available|material/i, 'Hard gate rejects a faculty mock with missing Suggested Answer text');

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
