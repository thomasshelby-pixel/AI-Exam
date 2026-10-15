import assert from 'node:assert';
import { PDFDocument } from 'pdf-lib';
import { generateCheckedCopyPdf, EvaluationData } from '../services/pdfCheckedCopyService.js';
import { resolveContextualQuestionIdentity } from '../services/answerSheetCoverageService.js';
import { evaluateHardCompletionGate } from '../services/evaluationIntegrityEngine.js';
import { buildCanonicalEvaluationLedger } from '../services/canonicalQuestionInventoryService.js';
import { CanonicalEvaluationRecord, EvaluationResult } from '../../src/types/index.js';

async function createSamplePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([595.28, 841.89]);
  }
  return Buffer.from(await doc.save());
}

async function run() {
  console.log('================================================================');
  console.log('--- CHECKED COPY OVERFLOW & COVERAGE INTEGRITY REGRESSION TESTS ---');
  console.log('================================================================\n');

  const samplePdf = await createSamplePdf(10);

  // TEST 1: Multiple detailed descriptive questions on page 7 must render cleanly without overflow
  console.log('--- TEST 1: Multi-Question Page 7 Margin Adaptive Fit ---');
  const page7Records: CanonicalEvaluationRecord[] = [
    {
      questionId: 'Q4(a)',
      questionType: 'DESCRIPTIVE',
      attempted: true,
      evaluated: true,
      sourcePages: [7],
      studentPages: [7],
      maxMarks: 6,
      awardedMarks: 5.5,
      evaluationStatus: 'EVALUATED',
      annotationRequired: true,
      annotationPage: 7,
      annotationAnchor: { pageNumber: 7, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
      renderOrder: 1,
      rendered: true,
      counted: true,
      markingComponents: [
        {
          componentId: 'Q4a_1',
          componentType: 'CALCULATION',
          expectedRequirement: 'Basic salary calculation verified according to pay slips',
          studentEvidence: 'Accurate computation: 9,40,000 + 4,70,000',
          marksAvailable: 2,
          marksAwarded: 2,
          marksDeducted: 0,
          assessment: 'CORRECT',
          comment: 'Correct basic salary and dearness allowance calculation',
        } as any,
        {
          componentId: 'Q4a_2',
          componentType: 'PROVISION',
          expectedRequirement: 'Deduction under Section 16(ii) limited to government employees',
          studentEvidence: 'Correctly identified non-government status',
          marksAvailable: 2,
          marksAwarded: 2,
          marksDeducted: 0,
          assessment: 'CORRECT',
          comment: 'Statutory provision properly referenced and applied',
        } as any,
        {
          componentId: 'Q4a_3',
          componentType: 'APPLICATION',
          expectedRequirement: 'Calculation of excess employer contribution',
          studentEvidence: 'Slight rounding discrepancy in excess interest component',
          marksAvailable: 2,
          marksAwarded: 1.5,
          marksDeducted: 0.5,
          assessment: 'PARTIALLY_CORRECT',
          comment: 'Deduction of 0.5 marks: Minor rounding error in excess contribution computation',
        } as any,
      ],
    },
    {
      questionId: 'Q4(b)',
      questionType: 'DESCRIPTIVE',
      attempted: true,
      evaluated: true,
      sourcePages: [7],
      studentPages: [7],
      maxMarks: 4,
      awardedMarks: 3.5,
      evaluationStatus: 'EVALUATED',
      annotationRequired: true,
      annotationPage: 7,
      annotationAnchor: { pageNumber: 7, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
      renderOrder: 2,
      rendered: true,
      counted: true,
      markingComponents: [
        {
          componentId: 'Q4b_1',
          componentType: 'PROVISION',
          expectedRequirement: 'Within 24 months from the end of relevant assessment year',
          studentEvidence: 'Mentioned 36 months instead of 24 months limit',
          marksAvailable: 2,
          marksAwarded: 1.5,
          marksDeducted: 0.5,
          assessment: 'PARTIALLY_CORRECT',
          comment: 'Deduction of 0.5 marks: Time limit under section 139(8A) partially stated',
        } as any,
        {
          componentId: 'Q4b_2',
          componentType: 'APPLICATION',
          expectedRequirement: 'Additional tax calculated on aggregate tax and interest',
          studentEvidence: 'Computed tax payable with updated return correctly',
          marksAvailable: 2,
          marksAwarded: 2,
          marksDeducted: 0,
          assessment: 'CORRECT',
          comment: 'Additional income tax computation verified accurately',
        } as any,
      ],
    },
  ];

  const evalRunPackage: any = {
    runId: 'test_multi_q_page7',
    evaluationRecords: page7Records,
    scoreLedger: { totalAwardedMarks: 9, totalMaxMarks: 10 },
  };
  const meta: EvaluationData = {
    id: 'eval_page7_multi',
    level: 'INTERMEDIATE',
    subjectName: 'Taxation (Income Tax & GST)',
  };

  const pdfBuf = await generateCheckedCopyPdf(meta, { evaluationRunPackage: evalRunPackage }, samplePdf);
  assert.ok(pdfBuf.length > 1000, 'Checked Copy PDF was generated successfully');
  assert.strictEqual(evalRunPackage.renderManifest.isRenderValid, true, 'Render manifest is valid with zero errors');
  assert.strictEqual(evalRunPackage.renderManifest.totalRendered, 2, 'Both Q4(a) and Q4(b) were physically rendered');
  console.log('[PASS] Multi-question page 7 renders without CHECKED_COPY_RENDER_INTEGRITY_FAILURE\n');

  // TEST 2: Multi-page student attempt balancing across studentPages
  console.log('--- TEST 2: Multi-Page Student Attempt Balancing ---');
  const mockInventory: any = {
    inventoryId: 'inv_tax',
    referenceHash: 'ref_tax_hash',
    totalMaxMarks: 10,
    totalPaperMaxMarks: 10,
    items: [
      { questionId: 'Q4(a)', maxMarks: 6, isAlternative: false },
      { questionId: 'Q4(b)', maxMarks: 4, isAlternative: false },
    ],
  };
  const mockAttemptedMap = new Map<string, any>([
    ['Q4(a)', { isAttempted: true, sourcePages: [7] }],
    ['Q4(b)', { isAttempted: true, sourcePages: [7, 8] }],
  ]);
  const mockEvaluatedQuestions = [
    { canonicalId: 'Q4(a)', questionNumber: '4', subQuestion: 'a', marksAwarded: 5.5, maximumMarks: 6 },
    { canonicalId: 'Q4(b)', questionNumber: '4', subQuestion: 'b', marksAwarded: 3.5, maximumMarks: 4 },
  ] as any[];

  const ledger = buildCanonicalEvaluationLedger({
    runId: 'ledger_balance_test',
    inventory: mockInventory,
    attemptedMap: mockAttemptedMap,
    evaluatedQuestions: mockEvaluatedQuestions,
  });

  const q4aRecord = ledger.records.find((r) => r.questionId === 'Q4(a)')!;
  const q4bRecord = ledger.records.find((r) => r.questionId === 'Q4(b)')!;
  assert.strictEqual(q4aRecord.annotationPage, 7, 'Q4(a) is anchored on page 7');
  assert.strictEqual(q4bRecord.annotationPage, 8, 'Q4(b) is balanced to page 8 because page 7 already holds Q4(a)');
  console.log('[PASS] Multi-page student answer Q4(b) correctly balanced to page 8\n');

  // TEST 3: Context-anchored sub-question without visible parent
  console.log('--- TEST 3: Context-Anchored Sub-Question Mapping ---');
  const mockPaperSubs = [
    { fullQuestionCode: 'Q6(a)', questionNumber: '6', subQuestionNumber: 'a', isMcq: false },
    { fullQuestionCode: 'Q6(b)', questionNumber: '6', subQuestionNumber: 'b', isMcq: false },
    { fullQuestionCode: 'Q6(c)', questionNumber: '6', subQuestionNumber: 'c', isMcq: false },
  ] as any[];

  const mappedContextChild = resolveContextualQuestionIdentity({
    questionNumber: '', // Candidate only wrote (c)
    subQuestion: 'c',
    previousActiveQuestion: 'Q6(b)',
    paperSubQuestions: mockPaperSubs,
  });
  assert.strictEqual(mappedContextChild.requiresReview, false, 'Candidate writing bare (c) after Q6(b) must not trigger review');
  assert.strictEqual(mappedContextChild.canonicalId, 'Q6(c)', 'Resolves cleanly to Q6(c)');
  console.log('[PASS] Context-anchored bare sub-question resolves to Q6(c) without false unmapped error\n');

  // TEST 4: Hard completion gate RULE_1_PAGE_COVERAGE recognizes evaluated question pages
  console.log('--- TEST 4: RULE_1_PAGE_COVERAGE Evaluated Page Accounting ---');
  const mockEvaluation: any = {
    evaluationId: 'eval_cov_test',
    studentName: 'Student',
    icaiRegistrationNumber: 'CRO1234567',
    caLevel: 'INTERMEDIATE',
    subjectKey: 'tax',
    subjectName: 'Taxation',
    materialType: 'MTP',
    attempt: 'May 2026',
    evaluationDate: new Date().toISOString(),
    totalMarks: 50,
    maximumMarks: 100,
    officialPaperMaxMarks: 100,
    percentage: 50,
    grade: 'Pass',
    confidenceScore: 95,
    overallSummary: 'Test summary',
    strengths: ['Strength 1'],
    weaknesses: ['Weakness 1'],
    topicPerformance: [],
    questions: [
      {
        questionNumber: '6',
        subQuestion: 'c',
        canonicalId: 'Q6(c)',
        marksAwarded: 5,
        maximumMarks: 5,
        marksLost: 0,
        status: 'correct',
        sourcePages: [3], // Page 3 was evaluated here
      },
    ],
  };

  const gateResult = evaluateHardCompletionGate(mockEvaluation, {
    coverageMap: {
      totalPages: 10,
      unmappedPages: [3], // Stale detector unmapped entry for page 3
      is100PercentCovered: false,
    },
  });

  const rule1Check = gateResult.checks.find((c: any) => c.ruleId === 'RULE_1_PAGE_COVERAGE');
  assert.strictEqual(rule1Check.passed, true, 'RULE_1_PAGE_COVERAGE passes because page 3 is accounted for in Q6(c)');
  console.log('[PASS] RULE_1_PAGE_COVERAGE passes when evaluated question covers the page\n');

  console.log('================================================================');
  console.log('--- ALL CHECKED COPY & COVERAGE REGRESSION TESTS PASSED! ---');
  console.log('================================================================');
}

run().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
