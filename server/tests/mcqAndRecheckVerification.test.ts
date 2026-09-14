import { evaluateAllAuthoritativeMcqs, AuthoritativeMcqDef } from '../services/deterministicMcqScorer.js';
import { getAuthoritativePaperStructure } from '../services/paperStructureService.js';
import { validateAuthoritativeConsistency } from '../services/evaluationIntegrityEngine.js';
import { db } from '../db.js';

console.log('================================================================');
console.log('--- RUNNING CA EXAM CHECKER MCQ & RECHECK ACCURACY TESTS ---');
console.log('================================================================');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}${details ? ` - ${details}` : ''}`);
    process.exitCode = 1;
  }
}

// -------------------------------------------------------------
// TEST 1: Strict MCQ Matching Against Official Verified Key
// -------------------------------------------------------------
console.log('\n--- TEST 1: Strict Authoritative MCQ Key Enforcement ---');
const officialKeys: AuthoritativeMcqDef[] = [
  { fullQuestionCode: 'MCQ1', questionNumber: '1', subQuestionNumber: 'a', officialKey: 'B', maximumMarks: 2, topic: 'Residential Status', section: 'A' },
  { fullQuestionCode: 'MCQ2', questionNumber: '2', subQuestionNumber: 'b', officialKey: 'C', maximumMarks: 2, topic: 'TDS u/s 194C', section: 'A' },
  { fullQuestionCode: 'MCQ3', questionNumber: '3', subQuestionNumber: 'c', officialKey: 'A', maximumMarks: 1, topic: 'Advance Tax', section: 'A' },
  { fullQuestionCode: 'MCQ4', questionNumber: '4', subQuestionNumber: 'a', officialKey: 'D', maximumMarks: 2, topic: 'GST Time of Supply', section: 'B' },
];

const candidateSelections: Record<string, string> = {
  '1': 'B', // CORRECT -> 2/2
  '2': 'A', // WRONG (Selected A, Key is C) -> 0/2
  '3': 'A', // CORRECT -> 1/1
  '4': 'B', // WRONG (Selected B, Key is D) -> 0/2
};

const evals = evaluateAllAuthoritativeMcqs(officialKeys, candidateSelections, {
  caLevel: 'INTERMEDIATE',
});

const totalAwarded = evals.reduce((sum, e) => sum + e.marksAwarded, 0);
const totalMax = evals.reduce((sum, e) => sum + e.maximumMarks, 0);

assert(totalAwarded === 3, 'TEST 1.1: Total MCQ marks awarded strictly equals 3 (2 + 1)');
assert(totalMax === 7, 'TEST 1.2: Total MCQ max marks equals 7');
assert(evals[1].marksAwarded === 0, 'TEST 1.3: Non-matching choice (cand A vs key C) is awarded exactly 0 marks');
assert(evals[1].detailedFeedback.includes('Candidate selected Option (A)'), 'TEST 1.4: Detailed feedback explains discrepancy between selected and official key');
assert(evals[3].marksAwarded === 0, 'TEST 1.5: Non-matching choice (cand B vs key D) is awarded exactly 0 marks');

// -------------------------------------------------------------
// TEST 2: August 2026 Taxation MTP Benchmark (Exact 12/30 Benchmark)
// -------------------------------------------------------------
console.log('\n--- TEST 2: August 2026 Taxation MTP Regression Benchmark ---');
const taxStructure = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Taxation',
  paper: 'Paper 3: Taxation',
});

assert(taxStructure.mcqs.length === 16, 'TEST 2.1: Taxation structure has all 16 MCQs loaded');

// Benchmark candidate selections scoring 8 marks in Section A (Income Tax) and 4 marks in Section B (GST):
// Official keys: 1:C, 2:C, 3:B, 4:A, 5:A, 6:D, 7:C, 8:D | 9:D, 10:A, 11:C, 12:B, 13:C, 14:B, 15:B, 16:D
const benchmarkSelections: Record<string, string> = {
  // Sec A Income Tax (Q1:C=2, Q3:B=2, Q6:D=2, Q7:C=2 => 8 marks correct)
  '1': 'C', // key C -> 2
  '2': 'A', // key C -> 0
  '3': 'B', // key B -> 2
  '4': 'B', // key A -> 0
  '5': 'B', // key A -> 0
  '6': 'D', // key D -> 2
  '7': 'C', // key C -> 2
  '8': 'A', // key D -> 0
  // Sec B GST (Q10:A=2, Q14:B=2 => 4 marks correct)
  '9': 'B',  // key D -> 0
  '10': 'A', // key A -> 2
  '11': 'B', // key C -> 0
  '12': 'A', // key B -> 0
  '13': 'A', // key C -> 0
  '14': 'B', // key B -> 2
  '15': 'A', // key B -> 0
  '16': 'A', // key D -> 0
};

const taxBenchmarkDefs: AuthoritativeMcqDef[] = taxStructure.mcqs.map((m) => ({
  fullQuestionCode: m.fullQuestionCode,
  questionNumber: m.questionNumber,
  subQuestionNumber: m.subQuestionNumber,
  officialKey: m.officialKey!,
  maximumMarks: m.maximumMarks,
  officialExplanation: m.officialExplanation,
  provision: m.provision,
  section: m.section,
}));

const taxScored = evaluateAllAuthoritativeMcqs(taxBenchmarkDefs, benchmarkSelections, {
  caLevel: 'INTERMEDIATE',
  paper: 'Paper 3: Taxation',
});

const taxAwarded = taxScored.reduce((sum, e) => sum + e.marksAwarded, 0);
const secAAwarded = taxScored.filter((_, idx) => taxBenchmarkDefs[idx].section === 'A').reduce((sum, e) => sum + e.marksAwarded, 0);
const secBAwarded = taxScored.filter((_, idx) => taxBenchmarkDefs[idx].section === 'B').reduce((sum, e) => sum + e.marksAwarded, 0);

assert(taxAwarded === 12, 'TEST 2.2: Benchmark total MCQ score equals exact 12 marks');
assert(secAAwarded === 8, 'TEST 2.3: Income Tax Section A equals exact 8 marks');
assert(secBAwarded === 4, 'TEST 2.4: GST Section B equals exact 4 marks');

// Validate consistency gate accepts this valid 12/30 evaluation
const sampleTrace = {
  materialId: 'ICAI_MTP_AUG_2026',
  markingSchemeSection: 'Section Descriptive Solution',
  suggestedAnswerRef: 'ICAI Suggested Answers August 2026',
  deductionReason: 'Step-wise criteria evaluated against official solution benchmark',
  verifiedGroundTruthSnippet: 'Official ICAI Marking Scheme Step Requirement',
};

const descriptiveQuestions = [
  {
    questionNumber: '1',
    marksAwarded: 10,
    maximumMarks: 15,
    status: 'partially_correct',
    markingComponents: [
      { name: 'Income Tax Descriptive', marksAwarded: 10, marksAvailable: 15, isSatisfied: true },
    ],
    referenceTrace: sampleTrace,
  },
  {
    questionNumber: '2',
    subQuestion: 'a',
    marksAwarded: 4,
    maximumMarks: 4,
    status: 'correct',
    markingComponents: [
      { name: 'Capital Gains (a)', marksAwarded: 4, marksAvailable: 4, isSatisfied: true },
    ],
    referenceTrace: sampleTrace,
  },
  {
    questionNumber: '2',
    subQuestion: 'b',
    marksAwarded: 4,
    maximumMarks: 6,
    status: 'partially_correct',
    markingComponents: [
      { name: 'Residential Status (b)', marksAwarded: 4, marksAvailable: 6, isSatisfied: true },
    ],
    referenceTrace: sampleTrace,
  },
  {
    questionNumber: '3',
    subQuestion: 'a',
    marksAwarded: 5,
    maximumMarks: 6,
    status: 'partially_correct',
    markingComponents: [
      { name: 'Taxable Salary (a)', marksAwarded: 5, marksAvailable: 6, isSatisfied: true },
    ],
    referenceTrace: sampleTrace,
  },
  {
    questionNumber: '3',
    subQuestion: 'b',
    marksAwarded: 3,
    maximumMarks: 4,
    status: 'partially_correct',
    markingComponents: [
      { name: 'Return Filing (b)', marksAwarded: 3, marksAvailable: 4, isSatisfied: true },
    ],
    referenceTrace: sampleTrace,
  },
  {
    questionNumber: '5',
    subQuestion: 'a',
    marksAwarded: 6,
    maximumMarks: 10,
    status: 'partially_correct',
    markingComponents: [
      { name: 'GST Output Tax (a)', marksAwarded: 6, marksAvailable: 10, isSatisfied: true },
    ],
    referenceTrace: sampleTrace,
  },
  {
    questionNumber: '5',
    subQuestion: 'b',
    marksAwarded: 4,
    maximumMarks: 5,
    status: 'partially_correct',
    markingComponents: [
      { name: 'Railways Services (b)', marksAwarded: 4, marksAvailable: 5, isSatisfied: true },
    ],
    referenceTrace: sampleTrace,
  },
  {
    questionNumber: '6',
    subQuestion: 'a',
    marksAwarded: 0,
    maximumMarks: 20,
    status: 'incorrect',
    markingComponents: [
      { name: 'Place of Supply', marksAwarded: 0, marksAvailable: 20, isSatisfied: false },
    ],
    referenceTrace: sampleTrace,
  },
];

const consistencyCheck = validateAuthoritativeConsistency({
  level: 'INTERMEDIATE',
  subjectKey: 'TAXATION',
  paper: 'Paper 3: Taxation',
  materialType: 'MTP',
  attempt: 'August 2026',
  totalMarks: 48,
  maximumMarks: 100,
  percentage: 48,
  grade: 'PASS',
  mcqMarksAwarded: 12,
  mcqTotalMaxMarks: 30,
  mcqSectionA: 8,
  mcqSectionB: 4,
  divisionBreakdown: {
    divisionA: { marksAwarded: 12, maximumMarks: 30, percentage: 40 },
    divisionB: { marksAwarded: 36, maximumMarks: 70, percentage: 51.4 },
  },
  questions: [...taxScored, ...descriptiveQuestions],
  structuredMarkingEvidence: [
    { questionId: 'MCQ_ALL', status: 'VALIDATED' },
  ],
} as any);

assert(consistencyCheck.isValid === true, 'TEST 2.5: Consistency engine approves valid 12/30 Taxation evaluation');

// -------------------------------------------------------------
// TEST 3: Database Recheck Request & Resolution Integrity
// -------------------------------------------------------------
console.log('\n--- TEST 3: Database Recheck System & Versioning ---');

// Check that recheck_requests table exists
const tableInfo = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='recheck_requests'`).get();
assert(tableInfo !== undefined, 'TEST 3.1: Table recheck_requests exists in SQLite database');

// Check columns of recheck_requests
const columns = db.prepare(`PRAGMA table_info(recheck_requests)`).all() as any[];
const colNames = columns.map((c) => c.name);
assert(colNames.includes('evaluation_id'), 'TEST 3.2: recheck_requests has evaluation_id column');
assert(colNames.includes('student_id'), 'TEST 3.3: recheck_requests has student_id column');
assert(colNames.includes('question_number'), 'TEST 3.4: recheck_requests has question_number column');
assert(colNames.includes('reason'), 'TEST 3.5: recheck_requests has reason column');
assert(colNames.includes('status'), 'TEST 3.6: recheck_requests has status column');
assert(colNames.includes('reviewer_notes'), 'TEST 3.7: recheck_requests has reviewer_notes column');
assert(colNames.includes('adjusted_marks'), 'TEST 3.8: recheck_requests has adjusted_marks column');

// Test recheck lifecycle in a transaction with rollback to keep database pristine
try {
  db.exec('BEGIN TRANSACTION;');

  // Create a mock student and mock evaluation
  const mockUserId = 'test_user_recheck_' + Date.now();
  const mockEvalId = 'eval_recheck_test_' + Date.now();
  const mockRecheckId = 'RECHECK-TEST-' + Date.now();

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role)
    VALUES (?, ?, 'hash', 'Test Student', 'STUDENT')
  `).run(mockUserId, `student_${Date.now()}@example.com`);

  const originalResultJson = JSON.stringify({
    id: mockEvalId,
    totalMarks: 40,
    maximumMarks: 100,
    percentage: 40,
    grade: 'PASS',
    version: 'v1',
    divisionBreakdown: { divisionA: { marksAwarded: 10, maximumMarks: 30 } },
    questionEvaluations: [{ questionNumber: 'Q1(a)', marksAwarded: 2, maximumMarks: 6 }],
  });

  db.prepare(`
    INSERT INTO evaluations (
      id, student_id, level, material_type, subject_key, subject_name, paper,
      attempt, total_marks, maximum_marks, percentage, grade, status, original_filename, result_json
    ) VALUES (
      ?, ?, 'INTERMEDIATE', 'MTP', 'TAXATION', 'Taxation', 'Paper 3',
      'August 2026', 40, 100, 40, 'PASS', 'COMPLETED', 'test_paper.pdf', ?
    )
  `).run(mockEvalId, mockUserId, originalResultJson);

  // 1. Submit recheck request
  db.prepare(`
    INSERT INTO recheck_requests (
      id, evaluation_id, student_id, question_number, reason, student_notes, status
    ) VALUES (
      ?, ?, ?, 'Q1(a)', 'Step marks omitted for statutory indexing calculation', 'I included the CII working on page 2', 'PENDING'
    )
  `).run(mockRecheckId, mockEvalId, mockUserId);

  const submitted = db.prepare('SELECT * FROM recheck_requests WHERE id = ?').get(mockRecheckId) as any;
  assert(submitted.status === 'PENDING', 'TEST 3.9: Recheck request status is initially PENDING');

  // 2. Simulate Senior Examiner resolution: Awarding +2 marks (total adjusted from 40 to 42)
  const newMarks = 42;
  const newPercentage = 42;
  const originalSnapshot = {
    totalMarks: 40,
    maximumMarks: 100,
    percentage: 40,
    grade: 'PASS',
    version: 'v1',
  };

  const updatedAuditMeta = {
    originalEvaluationSnapshot: originalSnapshot,
    currentVersion: 'v2',
    recheckHistory: [
      {
        recheckId: mockRecheckId,
        questionNumber: 'Q1(a)',
        previousTotal: 40,
        newTotal: 42,
        reviewerNotes: 'Verified: Cost of Acquisition Indexation working was present on page 2. Marks revised.',
        resolvedAt: new Date().toISOString(),
      },
    ],
  };

  db.prepare(`
    UPDATE recheck_requests
    SET status = 'ADJUSTED',
        adjusted_marks = ?,
        reviewer_notes = ?,
        resolved_at = datetime('now')
    WHERE id = ?
  `).run(newMarks, 'Verified: Cost of Acquisition Indexation working was present on page 2. Marks revised.', mockRecheckId);

  db.prepare(`
    UPDATE evaluations
    SET total_marks = ?,
        percentage = ?,
        audit_metadata_json = ?
    WHERE id = ?
  `).run(newMarks, newPercentage, JSON.stringify(updatedAuditMeta), mockEvalId);

  // 3. Verify resolution and immutability
  const resolvedReq = db.prepare('SELECT * FROM recheck_requests WHERE id = ?').get(mockRecheckId) as any;
  assert(resolvedReq.status === 'ADJUSTED', 'TEST 3.10: Recheck status is updated to ADJUSTED');
  assert(resolvedReq.adjusted_marks === 42, 'TEST 3.11: Adjusted marks stored as 42');

  const updatedEval = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(mockEvalId) as any;
  assert(updatedEval.total_marks === 42, 'TEST 3.12: Evaluation updated with new total marks (42)');

  const meta = JSON.parse(updatedEval.audit_metadata_json);
  assert(meta.originalEvaluationSnapshot.totalMarks === 40, 'TEST 3.13: Immutable snapshot of original 40 marks is preserved');
  assert(meta.currentVersion === 'v2', 'TEST 3.14: Version upgraded to v2');
  assert(meta.recheckHistory.length === 1, 'TEST 3.15: Recheck history recorded in audit trail');
} finally {
  db.exec('ROLLBACK;');
}

console.log('\n================================================================');
console.log(`--- TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED ---`);
console.log('================================================================');
if (passedTests === totalTests) {
  console.log('ALL MCQ & RECHECK ACCURACY CHECKS PASSED PERFECTLY!\n');
} else {
  console.error(`SOME TESTS FAILED (${totalTests - passedTests} failed)\n`);
  process.exit(1);
}
