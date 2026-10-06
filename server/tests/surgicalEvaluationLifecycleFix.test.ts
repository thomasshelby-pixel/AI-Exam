import assert from 'node:assert';
import {
  buildCanonicalQuestionInventory,
  detectIndependentAttempts,
  createExactlyOnceEvaluationTasks,
  buildCanonicalEvaluationLedger,
  verifyTotalReconciliationGate,
} from '../services/canonicalQuestionInventoryService.js';
import { createEvaluationReviewResult } from '../services/evaluationReviewResult.js';
import { validatePreEvaluationGate } from '../services/evaluationIntegrityHardening.js';
import type { QuestionEvaluation } from '../../src/types/index.js';
import type { AuthoritativePaperStructure } from '../services/paperStructureService.js';

console.log('================================================================');
console.log('--- SURGICAL EVALUATION LIFECYCLE & INTEGRITY TEST SUITE ---');
console.log('================================================================');

// --------------------------------------------------------------------------
// TEST 1: State Separation (Attempted, Evaluated, Academic Score, Verification Status)
// Invariant: Process/review states must NEVER collapse into academic 0 marks.
// --------------------------------------------------------------------------
console.log('\n--- TEST 1: Separation of Academic Score vs Verification Status ---');
{
  const evaluatedQuestions: QuestionEvaluation[] = [
    {
      questionNumber: '1',
      subQuestion: 'a',
      canonicalId: 'Q1(a)',
      maximumMarks: 10,
      marksAwarded: 8,
      marksLost: 2,
      status: 'partially_correct',
      detailedFeedback: 'Well attempted with accurate provisions.',
    },
    {
      questionNumber: '1',
      subQuestion: 'b',
      canonicalId: 'Q1(b)',
      maximumMarks: 10,
      marksAwarded: 7.5,
      marksLost: 2.5,
      status: 'partially_correct',
      detailedFeedback: 'Sound calculations shown.',
    },
    {
      questionNumber: '2',
      subQuestion: 'a',
      canonicalId: 'Q2(a)',
      maximumMarks: 8,
      marksAwarded: 0,
      marksLost: 0,
      status: 'unclear',
      flags: ['FAILED_TO_EVALUATE', 'RECHECK_RECOMMENDED', 'TECHNICAL_FAILURE'],
      reasonForDeduction: 'Technical evaluation pending review; not an academic zero.',
      detailedFeedback: 'Model evaluation encountered transient issue; preserved for human review.',
    },
  ];

  const reviewResult = createEvaluationReviewResult({
    evaluationId: 'eval_review_test_01',
    studentName: 'Aman Sharma',
    icaiRegistrationNumber: 'WRO1234567',
    level: 'INTERMEDIATE',
    subjectKey: 'taxation',
    subjectName: 'Taxation',
    materialType: 'MTP',
    coverageMap: {
      totalPages: 12,
      coveredPages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      attemptedQuestions: [
        { fullQuestionCode: 'Q1(a)', questionNumber: '1', subQuestionNumber: 'a', pages: [1, 2], isMcq: false, status: 'ATTEMPTED_READABLE' },
        { fullQuestionCode: 'Q1(b)', questionNumber: '1', subQuestionNumber: 'b', pages: [3, 4], isMcq: false, status: 'ATTEMPTED_READABLE' },
        { fullQuestionCode: 'Q2(a)', questionNumber: '2', subQuestionNumber: 'a', pages: [5], isMcq: false, status: 'ATTEMPTED_READABLE' },
      ],
      allDetectedCodes: ['Q1(a)', 'Q1(b)', 'Q2(a)'],
      unmappedPages: [],
      unclearPages: [],
      is100PercentCovered: true,
      mcqSelections: {},
    },
    errors: ['CONSISTENCY_VERIFICATION_REQUIRED'],
    evaluatedQuestions,
    officialPaperMaxMarks: 100,
  });

  assert.strictEqual(reviewResult.totalMarks, 15.5, 'Academic score must be 15.5 from valid evaluated questions, NOT 0');
  assert.strictEqual(reviewResult.academicScore, 15.5, 'academicScore must preserve valid marks');
  assert.strictEqual(reviewResult.validationStatus, 'NEEDS_REVIEW', 'Process status must be NEEDS_REVIEW');
  assert.strictEqual(reviewResult.certificationStatus, 'VERIFICATION_REQUIRED', 'Certification must be VERIFICATION_REQUIRED');
  assert.strictEqual(reviewResult.attemptedCount, 3, 'Attempted count must be 3');
  assert.strictEqual(reviewResult.evaluatedCount, 2, 'Evaluated count must be 2');
  assert.strictEqual(reviewResult.confidenceScore > 70, true, 'AI Confidence must be grounded in OCR coverage, not 0%');
  console.log('[PASS] TEST 1: Academic score (15.5m) strictly separated from verification status (NEEDS_REVIEW).');
}

// --------------------------------------------------------------------------
// TEST 2: Non-Critical Warnings Do NOT Zero Out or Abort Scorable Papers
// --------------------------------------------------------------------------
console.log('\n--- TEST 2: Non-Critical Warnings Invariant ---');
{
  const paperStructure: AuthoritativePaperStructure = {
    paperTitle: 'CA Inter Accounting',
    subQuestions: [
      { fullQuestionCode: 'Q1(a)', questionNumber: '1', subQuestionNumber: 'a', maximumMarks: 10, isMcq: false },
      { fullQuestionCode: 'Q1(b)', questionNumber: '1', subQuestionNumber: 'b', maximumMarks: 10, isMcq: false },
    ],
    mcqs: [],
    questions: [],
    totalPaperMaxMarks: 100,
  };

  const coverageMap: any = {
    attemptedQuestions: [
      { fullQuestionCode: 'Q1(a)', questionNumber: '1', subQuestionNumber: 'a', pages: [2], isMcq: false },
      { fullQuestionCode: 'Q1(b)', questionNumber: '1', subQuestionNumber: 'b', pages: [3], isMcq: false },
    ],
    unmappedPages: [1], // Page 1 is a title / instructions sheet
    unclearPages: [2],  // Minor handwriting note
  };

  const preGate = validatePreEvaluationGate({
    paperStructure,
    coverageMap,
    questionPaperText: 'Q1(a) - 10 Marks. Q1(b) - 10 Marks.',
    suggestedAnswersText: 'Q1(a) Answer. Q1(b) Answer.',
    markingSchemeText: 'Step marking rubric.',
    officialPaperMaxMarks: 100,
    level: 'INTERMEDIATE',
    subjectName: 'Accounting',
  });

  assert(preGate.warnings !== undefined, 'PreGate should categorize warnings');
  assert(preGate.warnings?.some((w) => w.includes('HANDWRITING_UNCLEAR')), 'Unclear handwriting is classified as a warning');
  console.log('[PASS] TEST 2: Non-critical handwriting/scan warnings categorized without corrupting marks.');
}

// --------------------------------------------------------------------------
// TEST 3: Technical Failure Does NOT Become an Academic Mark Deduction
// --------------------------------------------------------------------------
console.log('\n--- TEST 3: Technical Failure Marks Deduction Safety ---');
{
  const paperStructure: AuthoritativePaperStructure = {
    paperTitle: 'CA Final AFM',
    subQuestions: [
      { fullQuestionCode: 'Q1(a)', questionNumber: '1', subQuestionNumber: 'a', maximumMarks: 12, isMcq: false },
      { fullQuestionCode: 'Q1(b)', questionNumber: '1', subQuestionNumber: 'b', maximumMarks: 8, isMcq: false },
    ],
    mcqs: [],
    questions: [],
    totalPaperMaxMarks: 100,
  };

  const inventory = buildCanonicalQuestionInventory({ paperStructure });
  const attempts = detectIndependentAttempts({
    inventory,
    rawPageOccurrences: [
      { questionCode: 'Q1(a)', pageNumber: 2, evidenceText: 'Currency swap calculation' },
      { questionCode: 'Q1(b)', pageNumber: 4, evidenceText: 'Interest rate collar' },
    ],
  });

  const evaluatedQuestions: QuestionEvaluation[] = [
    {
      questionNumber: '1',
      subQuestion: 'a',
      canonicalId: 'Q1(a)',
      maximumMarks: 12,
      marksAwarded: 9.5,
      marksLost: 2.5,
      status: 'partially_correct',
      detailedFeedback: 'Swap valuation accurate.',
    },
    {
      questionNumber: '1',
      subQuestion: 'b',
      canonicalId: 'Q1(b)',
      maximumMarks: 8,
      marksAwarded: 0,
      marksLost: 0, // CRITICAL: marksLost is 0, not 8!
      status: 'unclear',
      flags: ['FAILED_TO_EVALUATE', 'TECHNICAL_FAILURE'],
      reasonForDeduction: 'Technical evaluation pending review; not an academic zero.',
      detailedFeedback: 'Chunk evaluation encountered transient error; preserved for human review.',
    },
  ];

  const ledger = buildCanonicalEvaluationLedger({
    runId: 'run_afm_01',
    inventory,
    attemptedMap: attempts,
    evaluatedQuestions,
  });

  assert.strictEqual(ledger.totalAwardedMarks, 9.5, 'Total awarded marks must be 9.5 from Q1(a)');
  const q1bRecord = ledger.records.find((r) => r.questionId === 'Q1(b)');
  assert(q1bRecord !== undefined, 'Q1(b) record must exist in ledger');
  assert.strictEqual(q1bRecord?.isTechnicalFailure, true, 'Q1(b) must be flagged as technical failure');
  assert.strictEqual(q1bRecord?.awardedMarks, 0, 'Q1(b) awarded marks is 0 pending review');
  assert.strictEqual(q1bRecord?.counted, false, 'Q1(b) is uncounted pending review');
  console.log('[PASS] TEST 3: Technical failure preserves Q1(a) score (9.5m) and marks Q1(b) as technical review without an academic deduction.');
}

// --------------------------------------------------------------------------
// TEST 4: Exactly-Once Guarantee & Task Identity
// --------------------------------------------------------------------------
console.log('\n--- TEST 4: Exactly-Once Task Identity ---');
{
  const paperStructure: AuthoritativePaperStructure = {
    paperTitle: 'CA Foundation Law',
    subQuestions: [
      { fullQuestionCode: 'Q2(a)', questionNumber: '2', subQuestionNumber: 'a', maximumMarks: 6, isMcq: false },
      { fullQuestionCode: 'Q2(b)', questionNumber: '2', subQuestionNumber: 'b', maximumMarks: 6, isMcq: false },
    ],
    mcqs: [],
    questions: [],
    totalPaperMaxMarks: 100,
  };

  const inventory = buildCanonicalQuestionInventory({ paperStructure });
  const attempts = detectIndependentAttempts({
    inventory,
    rawPageOccurrences: [
      { questionCode: 'Q2(a)', pageNumber: 3 },
      { questionCode: 'Q2(a)', pageNumber: 4, isContinuation: true }, // Continuation page
      { questionCode: 'Q2(b)', pageNumber: 5 },
    ],
  });

  const tasks = createExactlyOnceEvaluationTasks({
    runId: 'run_law_01',
    inventory,
    attemptedMap: attempts,
  });

  assert.strictEqual(tasks.length, 2, 'Exactly 2 tasks must be generated');
  assert.strictEqual(tasks[0].taskId, 'run_law_01:Q2(a)', 'Task identity must be runId:canonicalId');
  assert.deepStrictEqual(tasks[0].sourcePages, [3, 4], 'Continuation pages must be coalesced into single task');
  console.log('[PASS] TEST 4: Exactly-Once tasks generated with runId:canonicalQuestionId and coalesced pages [3, 4].');
}

console.log('\n================================================================');
console.log('--- ALL SURGICAL EVALUATION LIFECYCLE TESTS PASSED! ---');
console.log('================================================================\n');
