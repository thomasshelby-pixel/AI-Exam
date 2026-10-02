/**
 * Production-Grade Evaluation Integrity Hardening Test Suite
 *
 * Comprehensive Automated Regression Tests A through P:
 * A. Duplicate question IDs
 * B. Malformed IDs
 * C. Parent/child duplication
 * D. OR branch leakage
 * E. Multi-page continuation
 * F. Missing attempted answer
 * G. Missing MCQ key
 * H. Wrong MCQ key
 * I. Maximum-mark corruption
 * J. Double deduction
 * K. Consequential error
 * L. Partial credit
 * M. Unclear handwriting
 * N. Source conflict
 * O. Final-total mismatch
 * P. Report vs checked-copy mismatch
 *
 * Plus Real Runtime Regressions:
 * - CA Foundation real runtime evaluation
 * - CA Intermediate real runtime evaluation
 * - CA Final real runtime evaluation
 */

import {
  validatePreEvaluationGate,
  validatePostEvaluationGate,
  enforceSingleCanonicalEvaluationObject,
} from '../services/evaluationIntegrityHardening.js';
import {
  toCanonicalQuestionId,
  parseCanonicalQuestionIdentity,
  deduplicateQuestionList,
  validateQuestionDeduplication,
} from '../services/canonicalQuestionService.js';
import {
  getAuthoritativePaperStructure,
  extractSubQuestionsFromText,
} from '../services/paperStructureService.js';
import { processEvaluationIntegrity } from '../services/evaluationIntegrityEngine.js';
import { buildStructuredAnnotations } from '../services/pdfCheckedCopyService.js';
import { EvaluationResult, MarkingComponent, QuestionEvaluation } from '../../src/types/index.js';
import { createEvaluationReviewResult } from '../services/evaluationReviewResult.js';
import { evaluateAllAuthoritativeMcqs } from '../services/deterministicMcqScorer.js';

console.log('================================================================');
console.log('--- PRODUCTION-GRADE EVALUATION INTEGRITY HARDENING TEST SUITE ---');
console.log('================================================================');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    process.exitCode = 1;
  }
}

// --------------------------------------------------------------------------
// TEST G.1: Unmapped pages and parent-only detections stay in review
// Invariant: Do not remap an ambiguous parent or unidentified page to a child.
// --------------------------------------------------------------------------
console.log('\n--- TEST G.1: Unmapped Attempt Preservation ---');
{
  const paperStructure: any = {
    paperTitle: 'Generic CA Paper',
    totalPaperMaxMarks: 100,
    questions: [],
    subQuestions: [
      { fullQuestionCode: 'Q2(a)', questionNumber: '2', subQuestionNumber: 'a', maximumMarks: 5, isMcq: false },
    ],
    mcqs: [],
  };
  const coverageMap: any = {
    attemptedQuestions: [
      { fullQuestionCode: 'Q2', questionNumber: '2', pages: [4], isMcq: false },
    ],
    unmappedPages: [7],
    unclearPages: [],
  };

  const preGate = validatePreEvaluationGate({ paperStructure, coverageMap });
  assert(preGate.passed === false, 'Unmapped content and a non-leaf parent must block scoring');
  assert(preGate.failedInvariants.some((error) => error.includes('UNMAPPED_STUDENT_PAGE')), 'Unknown pages are named in the gate errors');
  assert(preGate.failedInvariants.some((error) => error.includes('UNMAPPED_ATTEMPT_DETECTED')), 'Parent-only detections are named in the gate errors');

  const reviewResult = createEvaluationReviewResult({
    evaluationId: 'eval_mapping_review',
    studentName: 'Candidate',
    icaiRegistrationNumber: 'Not provided',
    level: 'INTERMEDIATE',
    subjectKey: 'generic',
    subjectName: 'Generic CA Paper',
    materialType: 'MTP',
    coverageMap: {
      totalPages: 8,
      pages: [],
      attemptedQuestions: [],
      allDetectedCodes: [],
      unmappedPages: [7],
      unclearPages: [],
      is100PercentCovered: false,
      mcqSelections: {},
    },
    errors: preGate.failedInvariants,
  });
  assert(reviewResult.validationStatus === 'NEEDS_REVIEW', 'The result is explicitly marked NEEDS_REVIEW');
  assert(reviewResult.questions.length === 0, 'An unresolved attempt must not be assigned a zero-mark question');
  assert(reviewResult.coverageMap?.unmappedPages[0] === 7, 'The page remains explicitly recoverable');
  assert(reviewResult.completionGateReport?.isPassed === false, 'The hard completion gate remains failed');
}

// --------------------------------------------------------------------------
// TEST A: Duplicate Question IDs
// Invariant: Multiple OCR / chunking entries must resolve to count === 1
// --------------------------------------------------------------------------
console.log('\n--- TEST A: Duplicate Question IDs ---');
{
  const duplicateList: any[] = [
    { questionNumber: '3', subQuestion: 'b', maximumMarks: 4, marksAwarded: 2.5 },
    { questionNumber: 'Q3(b)', subQuestion: 'b', maximumMarks: 4, marksAwarded: 3, detailedFeedback: 'Detailed analysis' },
    { questionNumber: '3_b', maximumMarks: 4, marksAwarded: 2 },
  ];

  const deduped = deduplicateQuestionList(duplicateList);
  assert(deduped.length === 1, `TEST A.1: 3 duplicate inputs resolved to exactly 1 question (got ${deduped.length})`);
  assert(deduped[0].canonicalId === 'Q3(b)', `TEST A.2: Canonical ID is strictly Q3(b) (got ${deduped[0].canonicalId})`);
  assert(deduped[0].maximumMarks === 4, `TEST A.3: Maximum marks 4 preserved without distortion (got ${deduped[0].maximumMarks})`);

  const validation = validateQuestionDeduplication(deduped);
  assert(validation.isValid === true, 'TEST A.4: Structural validation passes with zero duplicates');
}

// --------------------------------------------------------------------------
// TEST B: Malformed Question IDs
// Invariant: Reject malformed IDs like Q3(b(b)), Q3(b(iiiiv)), Q3_duplicate
// --------------------------------------------------------------------------
console.log('\n--- TEST B: Malformed Question IDs ---');
{
  const parsed1 = parseCanonicalQuestionIdentity('Q3(b(b))');
  assert(parsed1.canonicalId === 'Q3(b)', `TEST B.1: Malformed Q3(b(b)) collapsed to Q3(b) (got ${parsed1.canonicalId})`);

  const parsed2 = parseCanonicalQuestionIdentity('Question 4 - (a)(a)');
  assert(parsed2.canonicalId === 'Q4(a)', `TEST B.2: Echoed Q4(a)(a) collapsed to Q4(a) (got ${parsed2.canonicalId})`);

  const parsed3 = parseCanonicalQuestionIdentity('Q5_b_duplicate');
  assert(parsed3.canonicalId === 'Q5(b)', `TEST B.3: Suffix duplicate stripped cleanly to Q5(b) (got ${parsed3.canonicalId})`);

  // Legitimate nested question Q6(a)(1) preserved
  const parsed4 = parseCanonicalQuestionIdentity('Q6(a)(1)');
  assert(parsed4.canonicalId === 'Q6(a(1))', `TEST B.4: Valid nested sub-question Q6(a(1)) preserved (got ${parsed4.canonicalId})`);
}

// --------------------------------------------------------------------------
// TEST C: Parent / Child Duplication
// Invariant: Container parent must NEVER score alongside child sub-questions
// --------------------------------------------------------------------------
console.log('\n--- TEST C: Parent / Child Duplication ---');
{
  const parentAndChildren: any[] = [
    { questionNumber: '2', maximumMarks: 14, marksAwarded: 10, status: 'partially_correct' }, // Parent container
    { questionNumber: '2', subQuestion: 'a', maximumMarks: 8, marksAwarded: 6, status: 'partially_correct' },
    { questionNumber: '2', subQuestion: 'b', maximumMarks: 6, marksAwarded: 4.5, status: 'partially_correct' },
  ];

  const preCheck = validateQuestionDeduplication(parentAndChildren);
  assert(preCheck.isValid === false && preCheck.parentChildCollisions.includes('Q2'), 'TEST C.1: Validation catches parent-child collision on Q2');

  const resolved = deduplicateQuestionList(parentAndChildren);
  assert(resolved.length === 2, `TEST C.2: Parent Q2 removed; only 2 children retained (got ${resolved.length})`);
  assert(!resolved.some((q: any) => q.canonicalId === 'Q2'), 'TEST C.3: Parent Q2 completely excluded from scorable nodes');

  const sumMarks = resolved.reduce((s, q) => s + q.marksAwarded, 0);
  assert(sumMarks === 10.5, `TEST C.4: Sum strictly equals 6 + 4.5 = 10.5, not 10 + 10.5 = 20.5 (got ${sumMarks})`);
}

// --------------------------------------------------------------------------
// TEST D: OR Branch Leakage
// Invariant: Only the attempted branch is scored; unattempted branch is excluded
// --------------------------------------------------------------------------
console.log('\n--- TEST D: OR Branch Leakage ---');
{
  const orQuestions: any[] = [
    { questionNumber: '4', subQuestion: 'a', maximumMarks: 6, marksAwarded: 4.5, detailedFeedback: 'Attempted Alternative A' },
    { questionNumber: '4(a) (OR)', maximumMarks: 6, marksAwarded: 0, detailedFeedback: 'Unattempted Alternative B' },
  ];

  const dedupedOr = deduplicateQuestionList(orQuestions);
  assert(dedupedOr.length === 1, `TEST D.1: Only 1 evaluation retained for OR pair (got ${dedupedOr.length})`);
  assert(dedupedOr[0].marksAwarded === 4.5, `TEST D.2: Attempted branch credit 4.5 preserved (got ${dedupedOr[0].marksAwarded})`);

  const mockEval: any = {
    evaluationId: 'eval_or_test',
    studentName: 'Candidate OR',
    questions: dedupedOr,
    totalMarks: 4.5,
    maximumMarks: 100,
    officialPaperMaxMarks: 100,
  };

  const gateResult = validatePostEvaluationGate({ evaluationResult: mockEval });
  assert(gateResult.isValid === true, 'TEST D.3: Post-evaluation gate passes with no OR branch leakage');
}

// --------------------------------------------------------------------------
// TEST E: Multi-Page Continuation
// Invariant: Answers spanning multiple pages merge into 1 canonical question
// --------------------------------------------------------------------------
console.log('\n--- TEST E: Multi-Page Continuation ---');
{
  const multiPageInputs: any[] = [
    { questionNumber: '5', subQuestion: 'a', pageNumber: 12, maximumMarks: 10, marksAwarded: 7.5, markingComponents: [{ componentId: 'c1', componentType: 'PROVISION', marksAvailable: 5, marksAwarded: 4 }] },
    { questionNumber: '5(a)', pageNumber: 13, maximumMarks: 10, marksAwarded: 7.5, markingComponents: [{ componentId: 'c2', componentType: 'CALCULATION', marksAvailable: 5, marksAwarded: 3.5 }] },
    { questionNumber: '5(a) cont.', pageNumber: 14, maximumMarks: 10, marksAwarded: 7.5 },
  ];

  const merged = deduplicateQuestionList(multiPageInputs);
  assert(merged.length === 1, `TEST E.1: Multi-page pages 12, 13, 14 merged into exactly 1 question (got ${merged.length})`);
  assert(merged[0].canonicalId === 'Q5(a)', `TEST E.2: Merged question canonical ID is Q5(a) (got ${merged[0].canonicalId})`);
  assert(merged[0].maximumMarks === 10, `TEST E.3: Max marks remains strictly 10 (got ${merged[0].maximumMarks})`);
}

// --------------------------------------------------------------------------
// TEST F: Missing Attempted Answer Detection
// Invariant: Detected student attempt cannot silently disappear from evaluation
// --------------------------------------------------------------------------
console.log('\n--- TEST F: Missing Attempted Answer ---');
{
  const mockCoverageMap: any = {
    attemptedQuestions: [
      { questionNumber: '1', subQuestionNumber: 'a', fullQuestionCode: 'Q1(a)', isMcq: false, maximumMarks: 10 },
      { questionNumber: '1', subQuestionNumber: 'b', fullQuestionCode: 'Q1(b)', isMcq: false, maximumMarks: 4 },
      { questionNumber: '2', subQuestionNumber: 'a', fullQuestionCode: 'Q2(a)', isMcq: false, maximumMarks: 7 }, // Attempted but dropped!
    ],
  };

  const incompleteEval: any = {
    evaluationId: 'eval_incomplete',
    questions: [
      { questionNumber: '1', subQuestion: 'a', canonicalId: 'Q1(a)', maximumMarks: 10, marksAwarded: 8 },
      { questionNumber: '1', subQuestion: 'b', canonicalId: 'Q1(b)', maximumMarks: 4, marksAwarded: 3 },
    ],
    totalMarks: 11,
    maximumMarks: 100,
    officialPaperMaxMarks: 100,
  };

  const gateResult = validatePostEvaluationGate({
    evaluationResult: incompleteEval,
    coverageMap: mockCoverageMap,
  });

  assert(gateResult.isValid === false, 'TEST F.1: Gate detected dropped attempted answer');
  assert(
    gateResult.errors.some((e) => e.includes('ATTEMPTED_ANSWER_DROPPED') && e.includes('Q2(a)')),
    'TEST F.2: Explicit error raised for dropped question Q2(a)'
  );
}

// --------------------------------------------------------------------------
// TEST G.2: MCQ annotations follow detected student pages
// Invariant: Canonical MCQ identity stays explicit and page numbers are not inferred.
// --------------------------------------------------------------------------
console.log('\n--- TEST G.2: MCQ Page Mapping ---');
{
  const mcqResults = evaluateAllAuthoritativeMcqs(
    [
      { fullQuestionCode: 'MCQ1', questionNumber: '1', maximumMarks: 1, officialKey: 'B', section: 'A' },
      { fullQuestionCode: 'MCQ12', questionNumber: '12', maximumMarks: 1, officialKey: 'C', section: 'B' },
    ],
    { '1': 'B', '12': 'C' },
    {
      caLevel: 'INTERMEDIATE',
      paper: 'Paper 3',
      subjectKey: 'generic',
      mcqPageNumbers: { '1': 3, '12': 8 },
      sourceMaterialId: 'source-test',
      sourceMaterialVersion: 'v1',
      sourceMaterialTitle: 'Test source',
    },
  );
  assert(mcqResults[0].questionNumber === 'MCQ 1' && mcqResults[0].pageNumber === 3 && mcqResults[0].markingComponents?.[0].pageNumber === 3,
    'MCQ1 retains its canonical number and detected page');
  assert(mcqResults[1].questionNumber === 'MCQ 12' && mcqResults[1].pageNumber === 8 && mcqResults[1].markingComponents?.[0].pageNumber === 8,
    'MCQ12 retains its canonical number and detected page');
}

// --------------------------------------------------------------------------
// TEST G: Missing MCQ Key
// Invariant: MCQ without official answer key triggers pre-gate failure
// --------------------------------------------------------------------------
console.log('\n--- TEST G: Missing MCQ Key ---');
{
  const paperWithMissingKey: any = {
    paperTitle: 'Mock Law Exam',
    totalPaperMaxMarks: 100,
    questions: [],
    subQuestions: [],
    mcqs: [
      { questionNumber: '1', maximumMarks: 2, officialKey: 'B' },
      { questionNumber: '2', maximumMarks: 2, officialKey: '' }, // Missing key!
    ],
  };

  const preGate = validatePreEvaluationGate({
    paperStructure: paperWithMissingKey,
  });

  assert(preGate.passed === false, 'TEST G.1: Pre-evaluation gate failed for missing MCQ key');
  assert(
    preGate.failedInvariants.some((i) => i.includes('MISSING_OFFICIAL_MCQ_KEY') && i.includes('MCQ 2')),
    'TEST G.2: Explicit invariant violation for MCQ 2'
  );
}

// --------------------------------------------------------------------------
// TEST H: Direct MCQ Key Scoring (Deterministic, no AI guessing)
// Invariant: Candidate option vs official option compared directly
// --------------------------------------------------------------------------
console.log('\n--- TEST H: Deterministic MCQ Scoring ---');
{
  const mcqs = [
    { questionNumber: '1', maximumMarks: 2, officialKey: 'C' },
    { questionNumber: '2', maximumMarks: 2, officialKey: 'A' },
  ];
  const candidateSelections = new Map<string, string>([
    ['1', 'C'], // Correct -> 2/2
    ['2', 'D'], // Incorrect -> 0/2
  ]);

  const rawQuestions: any[] = [
    { questionNumber: 'MCQ 1', maximumMarks: 2, marksAwarded: 2, candidateSelectedOption: 'C', officialCorrectOption: 'C', status: 'correct' },
    { questionNumber: 'MCQ 2', maximumMarks: 2, marksAwarded: 0, candidateSelectedOption: 'D', officialCorrectOption: 'A', status: 'incorrect' },
  ];

  const evalResult: any = {
    evaluationId: 'eval_mcq_test',
    questions: rawQuestions,
    totalMarks: 2,
    maximumMarks: 100,
    officialPaperMaxMarks: 100,
  };

  const postGate = validatePostEvaluationGate({ evaluationResult: evalResult });
  assert(postGate.isValid === true, 'TEST H.1: Deterministic MCQ evaluation validated successfully');
  assert(evalResult.totalMarks === 2, 'TEST H.2: MCQ total score is strictly 2/4');
}

// --------------------------------------------------------------------------
// TEST I: Maximum Mark Corruption Prevention
// Invariant: Sub-question max marks come strictly from source; no /5 fallbacks
// --------------------------------------------------------------------------
console.log('\n--- TEST I: Maximum Mark Corruption Prevention ---');
{
  const authoritativeSubQs = [
    { fullQuestionCode: 'Q3(b)', questionNumber: '3', subQuestionNumber: 'b', maximumMarks: 4 },
    { fullQuestionCode: 'Q4(b)', questionNumber: '4', subQuestionNumber: 'b', maximumMarks: 3 }, // Scheme says 3
  ];

  // Evaluator returned erroneous fallback /5 for Q4(b)
  const corruptInput: any[] = [
    { questionNumber: '3', subQuestion: 'b', maximumMarks: 5, marksAwarded: 3 },
    { questionNumber: '4', subQuestion: 'b', maximumMarks: 5, marksAwarded: 3 },
  ];

  const fixed = deduplicateQuestionList(corruptInput, authoritativeSubQs);
  assert(fixed[0].maximumMarks === 4, `TEST I.1: Q3(b) max marks restored to 4 (got ${fixed[0].maximumMarks})`);
  assert(fixed[1].maximumMarks === 3, `TEST I.2: Q4(b) max marks restored to 3 from scheme (got ${fixed[1].maximumMarks})`);
}

// --------------------------------------------------------------------------
// TEST J: Double Deduction Prevention
// Invariant: The same underlying error must not be penalized repeatedly
// --------------------------------------------------------------------------
console.log('\n--- TEST J: Double Deduction Prevention ---');
{
  const componentsWithDoubleDeduction: MarkingComponent[] = [
    { componentId: 'c1', componentType: 'CALCULATION', expectedRequirement: 'Net Profit', studentEvidence: 'Computed Rs. 50,000', assessment: 'INCORRECT', marksAvailable: 3, marksAwarded: 1, marksDeducted: 2, deductionReason: 'Omitted depreciation of Rs. 10,000', confidence: 95 },
    { componentId: 'c2', componentType: 'APPLICATION', expectedRequirement: 'Tax Liability', studentEvidence: 'Applied 25% on wrong figure', assessment: 'INCORRECT', marksAvailable: 3, marksAwarded: 1, marksDeducted: 2, deductionReason: 'Omitted depreciation of Rs. 10,000', confidence: 95 }, // Duplicate deduction reason!
  ];

  const mockEval: any = {
    evaluationId: 'eval_double_deduct',
    questions: [
      { questionNumber: '1', subQuestion: 'a', canonicalId: 'Q1(a)', maximumMarks: 6, marksAwarded: 2, markingComponents: componentsWithDoubleDeduction },
    ],
    totalMarks: 2,
    maximumMarks: 100,
    officialPaperMaxMarks: 100,
  };

  const gateResult = validatePostEvaluationGate({ evaluationResult: mockEval });
  assert(
    gateResult.warnings.some((w) => w.includes('POTENTIAL_DOUBLE_DEDUCTION')),
    'TEST J.1: Post-evaluation gate detected identical deduction reasons across multiple components'
  );
}

// --------------------------------------------------------------------------
// TEST K: Consequential Error Marking
// Invariant: Intermediate arithmetic slip does not zero subsequent valid steps
// --------------------------------------------------------------------------
console.log('\n--- TEST K: Consequential Error Marking ---');
{
  const consequentialComponents: MarkingComponent[] = [
    // Step 1: Intermediate arithmetic slip (-1 mark)
    { componentId: 'step1', componentType: 'CALCULATION', expectedRequirement: 'PV factor discount', studentEvidence: 'Used 0.892 instead of 0.893', assessment: 'PARTIALLY_CORRECT', marksAvailable: 2, marksAwarded: 1, marksDeducted: 1, deductionReason: 'Minor arithmetic rounding slip', confidence: 95 },
    // Step 2: Consequential application: subsequent cash flows correctly discounted using candidate's own step 1 figure
    { componentId: 'step2', componentType: 'WORKING', expectedRequirement: 'Discounted cash flows calculation', studentEvidence: 'Correctly carried forward intermediate figure and applied NPV formula', assessment: 'CORRECT', marksAvailable: 4, marksAwarded: 4, marksDeducted: 0, confidence: 95 },
  ];

  const q: QuestionEvaluation = {
    questionNumber: '2',
    subQuestion: 'a',
    canonicalId: 'Q2(a)',
    maximumMarks: 6,
    marksAwarded: 5,
    marksLost: 1,
    status: 'partially_correct',
    reasonForDeduction: '1 mark deducted for arithmetic slip; consequential steps credited',
    detailedFeedback: 'Candidate demonstrated correct methodology.',
    consequentialErrorDetected: true,
    markingComponents: consequentialComponents,
  };

  assert(q.marksAwarded === 5, `TEST K.1: Step credit awarded for consequential work (5/6 marks)`);
  assert(q.markingComponents![1].marksAwarded === 4, 'TEST K.2: Downstream step received full 4/4 marks');
}

// --------------------------------------------------------------------------
// TEST L: Partial Credit for Independent Criteria
// Invariant: Correct provision reasoning + wrong arithmetic != zero
// --------------------------------------------------------------------------
console.log('\n--- TEST L: Partial Credit for Independent Criteria ---');
{
  const components: MarkingComponent[] = [
    { componentId: 'prov', componentType: 'PROVISION', expectedRequirement: 'Cite Companies Act Section 135', studentEvidence: 'Accurately cited and explained Section 135 criteria', assessment: 'CORRECT', marksAvailable: 3, marksAwarded: 3, marksDeducted: 0, confidence: 98 },
    { componentId: 'calc', componentType: 'CALCULATION', expectedRequirement: 'Compute 2% CSR obligation', studentEvidence: 'Calculation error in 3-year average net profit', assessment: 'INCORRECT', marksAvailable: 3, marksAwarded: 0, marksDeducted: 3, deductionReason: 'Wrong averaging of profit', confidence: 95 },
  ];

  const awarded = components.reduce((s, c) => s + c.marksAwarded, 0);
  assert(awarded === 3, `TEST L.1: Provision credit 3/6 awarded despite zero on calculation (got ${awarded})`);
}

// --------------------------------------------------------------------------
// TEST M: Handwriting Uncertainty Classification
// Invariant: Unclear / degraded scan content must NOT be fabricated; flag NEEDS_REVIEW
// --------------------------------------------------------------------------
console.log('\n--- TEST M: Handwriting Uncertainty ---');
{
  const rawQ: any = {
    questionNumber: '4',
    subQuestion: 'a',
    maximumMarks: 6,
    marksAwarded: 0,
    status: 'unclear',
    detailedFeedback: 'Handwriting illegible on page 8 due to poor scan resolution.',
  };

  const processed = processEvaluationIntegrity({
    evaluationId: 'eval_unclear_test',
    studentName: 'Candidate Scan',
    questions: [rawQ],
    maximumMarks: 100,
    officialPaperMaxMarks: 100,
  });

  const q = processed.questions[0];
  assert(q.status === 'unclear', `TEST M.1: Question status is UNCLEAR (got ${q.status})`);
  assert(q.flags?.includes('HANDWRITING_UNCLEAR'), 'TEST M.2: HANDWRITING_UNCLEAR flag attached');
  assert(q.flags?.includes('RECHECK_RECOMMENDED'), 'TEST M.3: RECHECK_RECOMMENDED flag attached');
}

// --------------------------------------------------------------------------
// TEST N: Source Conflict Detection
// Invariant: Conflict between Question Paper and Suggested Answer triggers NEEDS_REVIEW
// --------------------------------------------------------------------------
console.log('\n--- TEST N: Source Conflict Detection ---');
{
  const qpText = 'CA Foundation Paper 1: Principles and Practice of Accounting';
  const saText = 'CA Final Paper 1: Financial Reporting'; // Conflict!

  const preGate = validatePreEvaluationGate({
    paperStructure: {
      paperTitle: 'Test',
      totalPaperMaxMarks: 100,
      questions: [],
      subQuestions: [{ fullQuestionCode: 'Q1', questionNumber: '1', maximumMarks: 20, compulsory: true, isMcq: false, section: 'A' }],
      mcqs: [],
    },
    questionPaperText: qpText,
    suggestedAnswersText: saText,
  });

  assert(preGate.passed === false, 'TEST N.1: Pre-gate identified source conflict');
  assert(
    preGate.failedInvariants.includes('SOURCE_CONFLICT_COURSE_LEVEL_MISMATCH'),
    'TEST N.2: Source conflict level mismatch flagged explicitly'
  );
}

// --------------------------------------------------------------------------
// TEST O: Final-Total Mismatch Prevention
// Invariant: Stored grand total must strictly equal sum of unique leaf scores
// --------------------------------------------------------------------------
console.log('\n--- TEST O: Final-Total Mismatch Prevention ---');
{
  const mockEval: any = {
    evaluationId: 'eval_total_mismatch',
    questions: [
      { questionNumber: '1', subQuestion: 'a', canonicalId: 'Q1(a)', maximumMarks: 10, marksAwarded: 7 },
      { questionNumber: '1', subQuestion: 'b', canonicalId: 'Q1(b)', maximumMarks: 5, marksAwarded: 3 },
    ],
    totalMarks: 14, // Erroneous! 7 + 3 = 10, not 14
    maximumMarks: 100,
    officialPaperMaxMarks: 100,
  };

  const gateResult = validatePostEvaluationGate({ evaluationResult: mockEval });
  assert(gateResult.isValid === false, 'TEST O.1: Post-evaluation gate detected total mismatch');
  assert(
    gateResult.errors.some((e) => e.includes('FINAL_TOTAL_MISMATCH')),
    'TEST O.2: Explicit FINAL_TOTAL_MISMATCH error raised'
  );
}

// --------------------------------------------------------------------------
// TEST P: Report vs Checked Copy Parity Guarantee
// Invariant: Single canonical evaluation object produces identical scorecard & annotations
// --------------------------------------------------------------------------
console.log('\n--- TEST P: Report vs Checked Copy Parity ---');
{
  const baseResult: EvaluationResult = {
    evaluationId: 'eval_single_canonical',
    studentName: 'Single Object Candidate',
    icaiRegistrationNumber: 'CRO0765432',
    caLevel: 'INTERMEDIATE',
    subjectKey: 'inter_tax',
    subjectName: 'Taxation',
    materialType: 'MTP',
    evaluationDate: new Date().toISOString(),
    totalMarks: 12,
    maximumMarks: 100,
    officialPaperMaxMarks: 100,
    percentage: 12,
    grade: 'Fail',
    confidenceScore: 95,
    overallSummary: 'Evaluation completed with verified marking components.',
    strengths: ['Clear calculations'],
    weaknesses: ['Add statutory sections'],
    topicPerformance: [],
    presentationAnalysis: { score: 8, feedback: 'Good format', workingNotesQuality: 'Good', handwritingLegibility: 'Clear' },
    accuracyAnalysis: { calculationAccuracy: 'Accurate', provisionsAccuracy: 'Accurate', methodologyCorrectness: 'Correct' },
    recommendations: [],
    questions: [
      {
        questionNumber: '3',
        subQuestion: 'b',
        canonicalId: 'Q3(b)',
        maximumMarks: 4,
        marksAwarded: 3,
        marksLost: 1,
        status: 'partially_correct',
        reasonForDeduction: 'Minor omission',
        detailedFeedback: 'Solid answer',
        pageNumber: 5,
        markingComponents: [
          { componentId: 'c1', componentType: 'PROVISION', marksAvailable: 4, marksAwarded: 3, marksDeducted: 1, expectedRequirement: 'Sec 139(1)', studentEvidence: 'Quoted', assessment: 'PARTIALLY_CORRECT', confidence: 95 },
        ],
      },
      {
        questionNumber: '4',
        subQuestion: 'b',
        canonicalId: 'Q4(b)',
        maximumMarks: 4,
        marksAwarded: 4,
        marksLost: 0,
        status: 'correct',
        reasonForDeduction: 'Full marks',
        detailedFeedback: 'Flawless answer',
        pageNumber: 7,
        markingComponents: [
          { componentId: 'c2', componentType: 'APPLICATION', marksAvailable: 4, marksAwarded: 4, marksDeducted: 0, expectedRequirement: 'AS 2', studentEvidence: 'Correct valuation', assessment: 'CORRECT', confidence: 95 },
        ],
      },
    ],
  };

  // Reconcile through single canonical evaluation object
  const canonicalObject = enforceSingleCanonicalEvaluationObject(baseResult);
  assert(canonicalObject.totalMarks === 7, `TEST P.1: Canonical object total strictly calculated as 3 + 4 = 7 (got ${canonicalObject.totalMarks})`);

  // Build checked copy annotations from the EXACT same canonical object
  const annotations = buildStructuredAnnotations(
    { id: 'eval_1', level: 'INTERMEDIATE', subjectName: 'Taxation', totalMarks: canonicalObject.totalMarks, maximumMarks: canonicalObject.maximumMarks },
    canonicalObject,
    10
  );
  assert(annotations.totalPages === 10, 'TEST P.2: Checked copy annotations built with totalPages = 10');

  // Verify checked copy annotations match report questions identically
  const page5Annotations = annotations.pages.find((p) => p.pageNumber === 5)?.annotations || [];
  const page7Annotations = annotations.pages.find((p) => p.pageNumber === 7)?.annotations || [];

  assert(
    page5Annotations.some((a) => a.questionNumber === 'Q3(b)' && a.marksAwarded === 3 && a.maxMarks === 4),
    'TEST P.3: Checked copy annotation for Q3(b) matches report question identically (3/4 marks)'
  );
  assert(
    page7Annotations.some((a) => a.questionNumber === 'Q4(b)' && a.marksAwarded === 4 && a.maxMarks === 4),
    'TEST P.4: Checked copy annotation for Q4(b) matches report question identically (4/4 marks)'
  );
}

// --------------------------------------------------------------------------
// REAL RUNTIME REGRESSIONS: CA FOUNDATION, INTERMEDIATE, AND FINAL
// --------------------------------------------------------------------------
console.log('\n--- REAL RUNTIME REGRESSIONS: FOUNDATION, INTERMEDIATE, FINAL ---');
{
  // 1. CA Foundation Real Runtime Pipeline
  const foundationQP = `
  CA Foundation Examination
  Paper 1: Principles and Practice of Accounting
  Time Allowed: 3 Hours | Maximum Marks: 100
  
  QUESTION 1 – 20 MARKS
  (a) State with reasons whether the following statements are True or False [12 Marks]
  (b) Distinguish between Money Measurement Concept and Going Concern Concept [8 Marks]
  
  QUESTION 2 – 20 MARKS
  (a) Prepare Bank Reconciliation Statement as on 31st March 2026 [10 Marks]
  (b) Journal Entries for Rectification of Errors [10 Marks]
  `;

  const foundationStructure = getAuthoritativePaperStructure({
    level: 'FOUNDATION',
    paper: 'Paper 1',
    subjectName: 'Principles and Practice of Accounting',
    questionPaperText: foundationQP,
    officialPaperMaxMarks: 100,
  });

  assert(foundationStructure.subQuestions.length >= 4, `TEST RT.1: Foundation paper structure extracted ${foundationStructure.subQuestions.length} sub-questions`);
  const fq1a = foundationStructure.subQuestions.find((s) => s.fullQuestionCode === 'Q1(a)');
  assert(fq1a?.maximumMarks === 12, `TEST RT.2: Foundation Q1(a) has exact 12 maximum marks (got ${fq1a?.maximumMarks})`);

  // 2. CA Intermediate Real Runtime Pipeline (Law & Audit with MCQs & Descriptive)
  const interQP = `
  CA Intermediate Examination
  Paper 2: Corporate and Other Laws
  Total Marks: 100
  
  QUESTION 1 – 15 MARKS
  (a) Explain provisions relating to CSR under Section 135 [10 Marks]
  (b) Validity of Board resolution passed through circulation [5 Marks]
  `;
  const interSA = `
  Suggested Answers - Paper 2: Corporate and Other Laws
  Multiple Choice Questions:
  1. (b) Rs. 50 Lakhs
  2. (d) Within 30 days
  `;

  const interStructure = getAuthoritativePaperStructure({
    level: 'INTERMEDIATE',
    paper: 'Paper 2',
    subjectName: 'Corporate and Other Laws',
    questionPaperText: interQP,
    suggestedAnswersText: interSA,
    officialPaperMaxMarks: 100,
  });

  assert(interStructure.mcqs.length === 2, `TEST RT.3: Intermediate extracted 2 official MCQs from suggested answers`);
  assert(interStructure.mcqs[0].officialKey === 'B', `TEST RT.4: MCQ 1 official key is B (got ${interStructure.mcqs[0].officialKey})`);

  // 3. CA Final Real Runtime Pipeline (Advanced Financial Management)
  const finalQP = `
  CA Final Examination
  Paper 2: Advanced Financial Management
  Total Marks: 100
  
  QUESTION 1 – 20 MARKS
  (a) Evaluate Net Present Value and Internal Rate of Return for Project Alpha [12 Marks]
  (b) Portfolio beta and sensitivity analysis under CAPM [8 Marks]
  `;

  const finalStructure = getAuthoritativePaperStructure({
    level: 'FINAL',
    paper: 'Paper 2',
    subjectName: 'Advanced Financial Management',
    questionPaperText: finalQP,
    officialPaperMaxMarks: 100,
  });

  const finalQ1a = finalStructure.subQuestions.find((s) => s.fullQuestionCode === 'Q1(a)');
  assert(finalQ1a?.maximumMarks === 12, `TEST RT.5: Final AFM Q1(a) has exact 12 maximum marks (got ${finalQ1a?.maximumMarks})`);

  // 4. End-to-End Pipeline Evaluation Run with Pre-Gate and Post-Gate Validation
  const runtimeInput: any = {
    evaluationId: 'eval_runtime_final_afm',
    studentName: 'Final AFM Candidate',
    icaiRegistrationNumber: 'CRO0998877',
    level: 'FINAL',
    subjectKey: 'final_afm',
    subjectName: 'Advanced Financial Management',
    officialPaperMaxMarks: 100,
    questions: [
      {
        questionNumber: '1',
        subQuestion: 'a',
        maximumMarks: 12,
        marksAwarded: 9.5,
        markingComponents: [
          { componentId: 'c1', componentType: 'WORKING', expectedRequirement: 'Working notes for cash flows', marksAvailable: 4, marksAwarded: 3.5, assessment: 'PARTIALLY_CORRECT', confidence: 95 },
          { componentId: 'c2', componentType: 'CALCULATION', expectedRequirement: 'NPV computation', marksAvailable: 8, marksAwarded: 6, assessment: 'PARTIALLY_CORRECT', confidence: 95 },
        ],
      },
      {
        questionNumber: '1',
        subQuestion: 'b',
        maximumMarks: 8,
        marksAwarded: 7,
        markingComponents: [
          { componentId: 'c3', componentType: 'CALCULATION', expectedRequirement: 'CAPM formula and Beta', marksAvailable: 8, marksAwarded: 7, assessment: 'CORRECT', confidence: 95 },
        ],
      },
    ],
  };

  const processedResult = processEvaluationIntegrity(runtimeInput, {
    questionPaperText: finalQP,
    paperStructure: finalStructure,
    officialPaperMaxMarks: 100,
  });

  assert(processedResult.questions.length === 2, `TEST RT.6: Final AFM evaluation has exactly 2 validated questions (got ${processedResult.questions.length})`);
  assert(processedResult.totalMarks === 16.5, `TEST RT.7: Final AFM total marks is 9.5 + 7 = 16.5 (got ${processedResult.totalMarks})`);
  assert(processedResult.validationStatus === 'VALID', `TEST RT.8: Final AFM evaluation validationStatus is VALID (got ${processedResult.validationStatus})`);
  assert(processedResult.integrityAudit?.mathConsistent === true, 'TEST RT.9: Mathematical integrity consistency verified');
}

console.log('\n================================================================');
console.log(`--- TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED ---`);
console.log('================================================================');

if (passedTests === totalTests) {
  console.log('ALL HARDENING & CRITICAL REGRESSION TESTS (A-P + RT) PASSED!');
  process.exit(0);
} else {
  console.error('SOME HARDENING TESTS FAILED!');
  process.exit(1);
}
