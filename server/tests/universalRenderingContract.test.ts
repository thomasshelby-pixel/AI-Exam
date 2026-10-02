/**
 * Universal Checked-Copy Rendering Contract Test Suite
 * Course-Independent / Subject-Independent / Type-Independent
 *
 * Enforces the 22 Universal Contract Test Invariants:
 *  1. Foundation MCQ-only
 *  2. Foundation mixed
 *  3. Intermediate MCQ + descriptive
 *  4. Intermediate multi-page numerical
 *  5. Final theory
 *  6. Final multi-page descriptive
 *  7. 1-mark MCQ
 *  8. 2-mark MCQ
 *  9. Sub-question
 * 10. Selected alternative
 * 11. Zero-mark attempted question
 * 12. Multi-page continuation
 * 13. Evaluation timeout (FAILED_TO_EVALUATE fails closed)
 * 14. Malformed evaluation response (rejected before rendering)
 * 15. Retry idempotency
 * 16. Concurrent evaluation completion safety
 * 17. Missing render anchor (rejected with CHECKED_COPY_RENDER_INTEGRITY_FAILURE)
 * 18. Missing student page (rejected with CHECKED_COPY_RENDER_INTEGRITY_FAILURE)
 * 19. Duplicate annotation (rejected with CHECKED_COPY_RENDER_INTEGRITY_FAILURE)
 * 20. Orphan annotation (rejected with CHECKED_COPY_RENDER_INTEGRITY_FAILURE)
 * 21. Score mismatch detection
 * 22. Question-ID mismatch detection
 */

import assert from 'node:assert';
import { PDFDocument } from 'pdf-lib';
import {
  buildStructuredAnnotations,
  generateCheckedCopyPdf,
  validatePreRenderGate,
  validatePostRenderGate,
  EvaluationData,
} from '../services/pdfCheckedCopyService.js';
import {
  buildCanonicalQuestionInventory,
  buildCanonicalEvaluationLedger,
  buildStudentAttemptManifest,
  buildFourSetReconciliation,
  createEvaluationRunPackage,
  finalizeEvaluationRun,
} from '../services/canonicalQuestionInventoryService.js';
import { getAuthoritativePaperStructure } from '../services/paperStructureService.js';
import { CanonicalEvaluationRecord, EvaluationRunPackage } from '../../src/types/index.js';

console.log('================================================================');
console.log('--- UNIVERSAL CHECKED-COPY RENDERING CONTRACT TEST SUITE ---');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(testName: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const result = fn();
    if (result && typeof (result as any).then === 'function') {
      return (result as Promise<void>).then(() => {
        console.log(`[PASS] ${testName}`);
        passedTests++;
      }).catch((err) => {
        console.error(`[FAIL] ${testName}:`, err.message);
        process.exitCode = 1;
      });
    } else {
      console.log(`[PASS] ${testName}`);
      passedTests++;
    }
  } catch (err: any) {
    console.error(`[FAIL] ${testName}:`, err.message);
    process.exitCode = 1;
  }
}

async function createSamplePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([595.28, 841.89]);
  }
  return Buffer.from(await doc.save());
}

async function main() {
  const samplePdfBuf = await createSamplePdf(10);

  // --------------------------------------------------------------------------
  // TEST 1: Foundation MCQ-only
  // --------------------------------------------------------------------------
  await runTest('TEST 1: Foundation MCQ-only rendering contract', async () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'MCQ1',
        questionType: 'MCQ',
        attempted: true,
        evaluated: true,
        sourcePages: [1],
        studentPages: [1],
        maxMarks: 2,
        awardedMarks: 2,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 1,
        annotationAnchor: { pageNumber: 1, region: 'RIGHT_MARGIN', annotationType: 'MCQ_BADGE' },
        renderOrder: 1,
        rendered: true,
        counted: true,
        studentSelectedOption: 'B',
        officialAnswer: 'B',
      },
      {
        questionId: 'MCQ2',
        questionType: 'MCQ',
        attempted: true,
        evaluated: true,
        sourcePages: [1],
        studentPages: [1],
        maxMarks: 2,
        awardedMarks: 0,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 1,
        annotationAnchor: { pageNumber: 1, region: 'RIGHT_MARGIN', annotationType: 'MCQ_BADGE' },
        renderOrder: 2,
        rendered: true,
        counted: true,
        studentSelectedOption: 'A',
        officialAnswer: 'C',
      },
    ];

    const meta: EvaluationData = { id: 'eval_fnd_mcq', level: 'FOUNDATION', subjectName: 'Business Economics' };
    const res = buildStructuredAnnotations(meta, { evaluationRunPackage: { evaluationRecords: records } }, 5);
    assert.strictEqual(res.pages[0].annotations.length, 2, 'Both MCQs rendered on page 1');
    assert.strictEqual(res.renderManifest?.isRenderValid, true, 'Render manifest is valid');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Foundation Mixed (MCQ + Descriptive / Practical)
  // --------------------------------------------------------------------------
  await runTest('TEST 2: Foundation mixed (MCQ + Descriptive)', async () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'MCQ1',
        questionType: 'MCQ',
        attempted: true,
        evaluated: true,
        sourcePages: [1],
        studentPages: [1],
        maxMarks: 2,
        awardedMarks: 2,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 1,
        annotationAnchor: { pageNumber: 1, region: 'RIGHT_MARGIN', annotationType: 'MCQ_BADGE' },
        renderOrder: 1,
        rendered: true,
        counted: true,
      },
      {
        questionId: 'Q1(a)',
        questionType: 'DESCRIPTIVE',
        attempted: true,
        evaluated: true,
        sourcePages: [2],
        studentPages: [2],
        maxMarks: 10,
        awardedMarks: 8.5,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 2,
        annotationAnchor: { pageNumber: 2, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
        renderOrder: 2,
        rendered: true,
        counted: true,
      },
    ];

    const meta: EvaluationData = { id: 'eval_fnd_mix', level: 'FOUNDATION', subjectName: 'Accounting' };
    const res = buildStructuredAnnotations(meta, { evaluationRunPackage: { evaluationRecords: records } }, 5);
    assert.strictEqual(res.pages[0].annotations.length, 1, 'MCQ rendered on page 1');
    assert.strictEqual(res.pages[1].annotations.length, 1, 'Descriptive rendered on page 2');
    assert.strictEqual(res.renderManifest?.totalRendered, 2, 'Total 2 rendered');
  });

  // --------------------------------------------------------------------------
  // TEST 3: Intermediate MCQ + Descriptive
  // --------------------------------------------------------------------------
  await runTest('TEST 3: Intermediate MCQ + descriptive full pipeline', async () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'MCQ5',
        questionType: 'MCQ',
        attempted: true,
        evaluated: true,
        sourcePages: [3],
        studentPages: [3],
        maxMarks: 2,
        awardedMarks: 2,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 3,
        annotationAnchor: { pageNumber: 3, region: 'RIGHT_MARGIN', annotationType: 'MCQ_BADGE' },
        renderOrder: 5,
        rendered: true,
        counted: true,
      },
      {
        questionId: 'Q2(a)',
        questionType: 'DESCRIPTIVE',
        attempted: true,
        evaluated: true,
        sourcePages: [1, 2],
        studentPages: [1, 2],
        maxMarks: 8,
        awardedMarks: 6,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 1,
        annotationAnchor: { pageNumber: 1, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
        renderOrder: 6,
        rendered: true,
        counted: true,
      },
    ];

    const meta: EvaluationData = { id: 'eval_inter_mix', level: 'INTERMEDIATE', subjectName: 'Corporate Law' };
    const res = buildStructuredAnnotations(meta, { evaluationRunPackage: { evaluationRecords: records } }, 5);
    assert.strictEqual(res.pages[0].annotations[0].questionNumber, 'Q2(a)');
    assert.strictEqual(res.pages[2].annotations[0].questionNumber, 'MCQ5');
  });

  // --------------------------------------------------------------------------
  // TEST 4: Intermediate Multi-Page Numerical
  // --------------------------------------------------------------------------
  await runTest('TEST 4: Intermediate multi-page numerical answer', async () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'Q4(a)',
        questionType: 'PRACTICAL',
        attempted: true,
        evaluated: true,
        sourcePages: [4, 5, 6],
        studentPages: [4, 5, 6],
        maxMarks: 14,
        awardedMarks: 11.5,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 4,
        annotationAnchor: { pageNumber: 4, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
        renderOrder: 1,
        rendered: true,
        counted: true,
      },
    ];

    const meta: EvaluationData = { id: 'eval_inter_num', level: 'INTERMEDIATE', subjectName: 'Cost & Management Accounting' };
    const res = buildStructuredAnnotations(meta, { evaluationRunPackage: { evaluationRecords: records } }, 10);
    assert.strictEqual(res.pages[3].annotations.length, 1, 'Rendered on target page 4');
    assert.strictEqual(res.renderManifest?.items[0].renderedPages.includes(4), true);
  });

  // --------------------------------------------------------------------------
  // TEST 5: Final Theory
  // --------------------------------------------------------------------------
  await runTest('TEST 5: Final theory evaluation', async () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'Q1(a)',
        questionType: 'DESCRIPTIVE',
        attempted: true,
        evaluated: true,
        sourcePages: [2],
        studentPages: [2],
        maxMarks: 10,
        awardedMarks: 8,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 2,
        annotationAnchor: { pageNumber: 2, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
        renderOrder: 1,
        rendered: true,
        counted: true,
      },
      {
        questionId: 'Q1(b)',
        questionType: 'DESCRIPTIVE',
        attempted: true,
        evaluated: true,
        sourcePages: [3],
        studentPages: [3],
        maxMarks: 5,
        awardedMarks: 4,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 3,
        annotationAnchor: { pageNumber: 3, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
        renderOrder: 2,
        rendered: true,
        counted: true,
      },
    ];

    const meta: EvaluationData = { id: 'eval_fin_th', level: 'FINAL', subjectName: 'Advanced Auditing' };
    const res = buildStructuredAnnotations(meta, { evaluationRunPackage: { evaluationRecords: records } }, 5);
    assert.strictEqual(res.summary.totalAwarded, 12);
  });

  // --------------------------------------------------------------------------
  // TEST 6: Final Multi-Page Descriptive
  // --------------------------------------------------------------------------
  await runTest('TEST 6: Final multi-page descriptive case study', async () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'Q3(a)',
        questionType: 'CASE_SCENARIO',
        attempted: true,
        evaluated: true,
        sourcePages: [1, 2, 3],
        studentPages: [1, 2, 3],
        maxMarks: 15,
        awardedMarks: 12,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 1,
        annotationAnchor: { pageNumber: 1, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
        renderOrder: 1,
        rendered: true,
        counted: true,
      },
    ];

    const meta: EvaluationData = { id: 'eval_fin_case', level: 'FINAL', subjectName: 'Financial Management' };
    const res = buildStructuredAnnotations(meta, { evaluationRunPackage: { evaluationRecords: records } }, 5);
    assert.strictEqual(res.pages[0].annotations.length, 1);
    assert.strictEqual(res.pages[0].annotations[0].marksAwarded, 12);
  });

  // --------------------------------------------------------------------------
  // TEST 7: 1-mark MCQ
  // --------------------------------------------------------------------------
  await runTest('TEST 7: 1-mark MCQ rendering contract', async () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'MCQ16',
        questionType: 'MCQ',
        attempted: true,
        evaluated: true,
        sourcePages: [6],
        studentPages: [6],
        maxMarks: 1,
        awardedMarks: 1,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 6,
        annotationAnchor: { pageNumber: 6, region: 'RIGHT_MARGIN', annotationType: 'MCQ_BADGE' },
        renderOrder: 16,
        rendered: true,
        counted: true,
      },
    ];

    const meta: EvaluationData = { id: 'eval_mcq1', level: 'INTERMEDIATE', subjectName: 'Taxation' };
    const res = buildStructuredAnnotations(meta, { evaluationRunPackage: { evaluationRecords: records } }, 10);
    assert.strictEqual(res.pages[5].annotations[0].maxMarks, 1);
    assert.strictEqual(res.pages[5].annotations[0].marksAwarded, 1);
  });

  // --------------------------------------------------------------------------
  // TEST 8: 2-mark MCQ
  // --------------------------------------------------------------------------
  await runTest('TEST 8: 2-mark MCQ rendering contract', async () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'MCQ7',
        questionType: 'MCQ',
        attempted: true,
        evaluated: true,
        sourcePages: [10],
        studentPages: [10],
        maxMarks: 2,
        awardedMarks: 2,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 10,
        annotationAnchor: { pageNumber: 10, region: 'RIGHT_MARGIN', annotationType: 'MCQ_BADGE' },
        renderOrder: 7,
        rendered: true,
        counted: true,
      },
    ];

    const meta: EvaluationData = { id: 'eval_mcq2', level: 'INTERMEDIATE', subjectName: 'Taxation' };
    const res = buildStructuredAnnotations(meta, { evaluationRunPackage: { evaluationRecords: records } }, 10);
    assert.strictEqual(res.pages[9].annotations[0].maxMarks, 2);
    assert.strictEqual(res.pages[9].annotations[0].marksAwarded, 2);
  });

  // --------------------------------------------------------------------------
  // TEST 9: Sub-Question preservation
  // --------------------------------------------------------------------------
  await runTest('TEST 9: Sub-question identity preservation', async () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'Q4(b)',
        questionType: 'DESCRIPTIVE',
        attempted: true,
        evaluated: true,
        sourcePages: [7, 8],
        studentPages: [7, 8],
        maxMarks: 4,
        awardedMarks: 3.5,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 7,
        annotationAnchor: { pageNumber: 7, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
        renderOrder: 4,
        rendered: true,
        counted: true,
      },
    ];

    const meta: EvaluationData = { id: 'eval_sub_q', level: 'INTERMEDIATE', subjectName: 'Taxation' };
    const res = buildStructuredAnnotations(meta, { evaluationRunPackage: { evaluationRecords: records } }, 10);
    assert.strictEqual(res.pages[6].annotations[0].questionNumber, 'Q4(b)');
  });

  // --------------------------------------------------------------------------
  // TEST 10: Selected Alternative
  // --------------------------------------------------------------------------
  await runTest('TEST 10: Selected alternative rendering (unselected excluded)', async () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'Q6(a)',
        questionType: 'DESCRIPTIVE',
        attempted: true,
        evaluated: true,
        sourcePages: [2],
        studentPages: [2],
        maxMarks: 5,
        awardedMarks: 4.5,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 2,
        annotationAnchor: { pageNumber: 2, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
        renderOrder: 1,
        rendered: true,
        counted: true,
        isAlternative: true,
        alternativeGroupId: 'alt_g6',
      },
      {
        questionId: 'Q6(b)',
        questionType: 'DESCRIPTIVE',
        attempted: false,
        evaluated: false,
        sourcePages: [],
        studentPages: [],
        maxMarks: 5,
        awardedMarks: 0,
        evaluationStatus: 'EXCLUDED_ALTERNATIVE',
        annotationRequired: false,
        renderOrder: 2,
        rendered: false,
        counted: false,
        isAlternative: true,
        alternativeGroupId: 'alt_g6',
      },
    ];

    const meta: EvaluationData = { id: 'eval_alt', level: 'INTERMEDIATE', subjectName: 'Taxation' };
    const res = buildStructuredAnnotations(meta, { evaluationRunPackage: { evaluationRecords: records } }, 5);
    assert.strictEqual(res.pages[1].annotations.length, 1, 'Only Q6(a) rendered');
    assert.strictEqual(res.pages[1].annotations[0].questionNumber, 'Q6(a)');
    assert.strictEqual(res.renderManifest?.items.find((i) => i.questionId === 'Q6(b)')?.rendered, false);
  });

  // --------------------------------------------------------------------------
  // TEST 11: Zero-Mark Attempted Question
  // --------------------------------------------------------------------------
  await runTest('TEST 11: Zero-mark attempted question is preserved and rendered', async () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'Q2(b)',
        questionType: 'DESCRIPTIVE',
        attempted: true,
        evaluated: true,
        sourcePages: [3],
        studentPages: [3],
        maxMarks: 5,
        awardedMarks: 0,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 3,
        annotationAnchor: { pageNumber: 3, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
        renderOrder: 1,
        rendered: true,
        counted: true,
      },
    ];

    const meta: EvaluationData = { id: 'eval_zero', level: 'INTERMEDIATE', subjectName: 'Auditing' };
    const res = buildStructuredAnnotations(meta, { evaluationRunPackage: { evaluationRecords: records } }, 5);
    assert.strictEqual(res.pages[2].annotations.length, 1, 'Zero-mark question MUST be rendered');
    assert.strictEqual(res.pages[2].annotations[0].marksAwarded, 0);
  });

  // --------------------------------------------------------------------------
  // TEST 12: Multi-Page Continuation
  // --------------------------------------------------------------------------
  await runTest('TEST 12: Multi-page continuation answer mapping', async () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'Q3(b)',
        questionType: 'DESCRIPTIVE',
        attempted: true,
        evaluated: true,
        sourcePages: [8, 9],
        studentPages: [8, 9],
        maxMarks: 4,
        awardedMarks: 2.5,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 8,
        annotationAnchor: { pageNumber: 8, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
        renderOrder: 1,
        rendered: true,
        counted: true,
      },
    ];

    const meta: EvaluationData = { id: 'eval_continuation', level: 'INTERMEDIATE', subjectName: 'Taxation' };
    const res = buildStructuredAnnotations(meta, { evaluationRunPackage: { evaluationRecords: records } }, 10);
    assert.strictEqual(res.pages[7].annotations.length, 1, 'Anchored on first page 8');
    assert.strictEqual(res.renderManifest?.isRenderValid, true);
  });

  // --------------------------------------------------------------------------
  // TEST 13: Evaluation Timeout / FAILED_TO_EVALUATE fails closed
  // --------------------------------------------------------------------------
  await runTest('TEST 13: Evaluation failure FAILED_TO_EVALUATE blocks PDF finalization', () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'Q5(a)',
        questionType: 'DESCRIPTIVE',
        attempted: true,
        evaluated: false,
        sourcePages: [5],
        studentPages: [5],
        maxMarks: 10,
        awardedMarks: 0,
        evaluationStatus: 'FAILED_TO_EVALUATE',
        annotationRequired: true,
        annotationPage: 5,
        annotationAnchor: { pageNumber: 5, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
        renderOrder: 1,
        rendered: false,
        counted: false,
      },
    ];

    const gate = validatePreRenderGate({ records, totalPages: 10 });
    assert.strictEqual(gate.isValid, false, 'Pre-render gate must reject FAILED_TO_EVALUATE');
    assert(gate.errors.some((e) => e.includes('Attempted question failed to evaluate')));
  });

  // --------------------------------------------------------------------------
  // TEST 14: Malformed Evaluation Response
  // --------------------------------------------------------------------------
  await runTest('TEST 14: Malformed evaluation response rejection', () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'Q2(a)',
        questionType: 'DESCRIPTIVE',
        attempted: true,
        evaluated: true,
        sourcePages: [2],
        studentPages: [2],
        maxMarks: -5, // Invalid negative mark
        awardedMarks: NaN as any, // Invalid NaN
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 2,
        annotationAnchor: { pageNumber: 2, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
        renderOrder: 1,
        rendered: true,
        counted: true,
      },
    ];

    const gate = validatePreRenderGate({ records, totalPages: 10 });
    assert.strictEqual(gate.isValid, false, 'Pre-render gate must reject negative/NaN marks');
  });

  // --------------------------------------------------------------------------
  // TEST 15: Retry Idempotency
  // --------------------------------------------------------------------------
  await runTest('TEST 15: Retry idempotency yields identical annotations and counts', async () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'Q1(a)',
        questionType: 'DESCRIPTIVE',
        attempted: true,
        evaluated: true,
        sourcePages: [1],
        studentPages: [1],
        maxMarks: 10,
        awardedMarks: 8,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 1,
        annotationAnchor: { pageNumber: 1, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
        renderOrder: 1,
        rendered: true,
        counted: true,
      },
    ];

    const meta: EvaluationData = { id: 'eval_retry', level: 'FINAL', subjectName: 'Financial Reporting' };
    const run1 = buildStructuredAnnotations(meta, { evaluationRunPackage: { evaluationRecords: records } }, 5);
    const run2 = buildStructuredAnnotations(meta, { evaluationRunPackage: { evaluationRecords: records } }, 5);
    assert.deepStrictEqual(run1.pages, run2.pages, 'Retry results must be 100% identical');
  });

  // --------------------------------------------------------------------------
  // TEST 16: Concurrent Evaluation Completion Safety
  // --------------------------------------------------------------------------
  await runTest('TEST 16: Concurrent evaluation completion safety', async () => {
    const makeRec = (id: string, page: number): CanonicalEvaluationRecord => ({
      questionId: id,
      questionType: 'DESCRIPTIVE',
      attempted: true,
      evaluated: true,
      sourcePages: [page],
      studentPages: [page],
      maxMarks: 10,
      awardedMarks: 7,
      evaluationStatus: 'EVALUATED',
      annotationRequired: true,
      annotationPage: page,
      annotationAnchor: { pageNumber: page, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
      renderOrder: 1,
      rendered: true,
      counted: true,
    });

    const [resA, resB] = await Promise.all([
      Promise.resolve(buildStructuredAnnotations({ id: 'eval_A', level: 'INTERMEDIATE', subjectName: 'Law' }, { evaluationRunPackage: { evaluationRecords: [makeRec('QA', 1)] } }, 5)),
      Promise.resolve(buildStructuredAnnotations({ id: 'eval_B', level: 'FINAL', subjectName: 'AFM' }, { evaluationRunPackage: { evaluationRecords: [makeRec('QB', 2)] } }, 5)),
    ]);

    assert.strictEqual(resA.pages[0].annotations[0].questionNumber, 'QA');
    assert.strictEqual(resB.pages[1].annotations[0].questionNumber, 'QB');
  });

  // --------------------------------------------------------------------------
  // TEST 17: Missing Render Anchor
  // --------------------------------------------------------------------------
  await runTest('TEST 17: Missing render anchor rejected by pre-render gate', () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'Q4(a)',
        questionType: 'DESCRIPTIVE',
        attempted: true,
        evaluated: true,
        sourcePages: [4],
        studentPages: [4],
        maxMarks: 6,
        awardedMarks: 5,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 4,
        annotationAnchor: undefined as any, // Missing anchor
        renderOrder: 1,
        rendered: true,
        counted: true,
      },
    ];

    const gate = validatePreRenderGate({ records, totalPages: 10 });
    assert.strictEqual(gate.isValid, false, 'Pre-gate must fail when annotationAnchor is missing');
    assert(gate.errors.some((e) => e.includes('Invalid or missing annotationAnchor')));
  });

  // --------------------------------------------------------------------------
  // TEST 18: Missing Student Page
  // --------------------------------------------------------------------------
  await runTest('TEST 18: Missing student page rejected by pre-render gate', () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'Q5(a)',
        questionType: 'DESCRIPTIVE',
        attempted: true,
        evaluated: true,
        sourcePages: [],
        studentPages: [], // Missing student pages
        maxMarks: 10,
        awardedMarks: 9,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 0,
        annotationAnchor: { pageNumber: 0, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
        renderOrder: 1,
        rendered: true,
        counted: true,
      },
    ];

    const gate = validatePreRenderGate({ records, totalPages: 10 });
    assert.strictEqual(gate.isValid, false, 'Pre-gate must fail when studentPages is empty');
    assert(gate.errors.some((e) => e.includes('studentPages is empty')));
  });

  // --------------------------------------------------------------------------
  // TEST 19: Duplicate Annotation in Post-Render Gate
  // --------------------------------------------------------------------------
  await runTest('TEST 19: Duplicate annotation caught by post-render gate', () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'Q3(a)',
        questionType: 'DESCRIPTIVE',
        attempted: true,
        evaluated: true,
        sourcePages: [3],
        studentPages: [3],
        maxMarks: 6,
        awardedMarks: 4,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 3,
        annotationAnchor: { pageNumber: 3, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
        renderOrder: 1,
        rendered: true,
        counted: true,
      },
    ];

    const duplicateRendered = [
      { pageNumber: 3, questionNumber: 'Q3(a)', marksAwarded: 4, maxMarks: 6 },
      { pageNumber: 3, questionNumber: 'Q3(a)', marksAwarded: 4, maxMarks: 6 }, // Injected duplicate
    ];

    const postGate = validatePostRenderGate({
      evaluationId: 'eval_dup',
      runId: 'run_dup',
      records,
      renderedAnnotations: duplicateRendered,
      totalPages: 5,
    });

    assert.strictEqual(postGate.isValid, false, 'Post-gate must catch duplicate annotation');
    assert(postGate.errors.some((e) => e.includes('Duplicate rendering detected')));
  });

  // --------------------------------------------------------------------------
  // TEST 20: Orphan Annotation in Post-Render Gate
  // --------------------------------------------------------------------------
  await runTest('TEST 20: Orphan annotation caught by post-render gate', () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'Q1(a)',
        questionType: 'DESCRIPTIVE',
        attempted: true,
        evaluated: true,
        sourcePages: [1],
        studentPages: [1],
        maxMarks: 10,
        awardedMarks: 8,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 1,
        annotationAnchor: { pageNumber: 1, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
        renderOrder: 1,
        rendered: true,
        counted: true,
      },
    ];

    const orphanRendered = [
      { pageNumber: 1, questionNumber: 'Q1(a)', marksAwarded: 8, maxMarks: 10 },
      { pageNumber: 2, questionNumber: 'Q99(z)', marksAwarded: 5, maxMarks: 5 }, // Injected orphan
    ];

    const postGate = validatePostRenderGate({
      evaluationId: 'eval_orphan',
      runId: 'run_orphan',
      records,
      renderedAnnotations: orphanRendered,
      totalPages: 5,
    });

    assert.strictEqual(postGate.isValid, false, 'Post-gate must catch orphan annotation');
    assert(postGate.orphanAnnotations.includes('Q99(z)'));
  });

  // --------------------------------------------------------------------------
  // TEST 21: Score Mismatch Detection
  // --------------------------------------------------------------------------
  await runTest('TEST 21: Score reconciliation mismatch detection', () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'Q1(a)',
        questionType: 'DESCRIPTIVE',
        attempted: true,
        evaluated: true,
        sourcePages: [1],
        studentPages: [1],
        maxMarks: 10,
        awardedMarks: 7.5,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 1,
        annotationAnchor: { pageNumber: 1, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
        renderOrder: 1,
        rendered: true,
        counted: true,
      },
    ];

    const ledger = {
      ledgerId: 'leg_1',
      evaluationRunId: 'run_1',
      records,
      totalCanonicalQuestions: 1,
      totalAttempted: 1,
      totalEvaluated: 1,
      totalRendered: 1,
      totalCounted: 1,
      totalMaxMarks: 10,
      totalAwardedMarks: 7.5,
      isReconciled: true,
      reconciliationErrors: [],
    };

    const manifest = {
      manifestId: 'man_1',
      evaluationRunId: 'run_1',
      totalPages: 2,
      attempts: [{ questionId: 'Q1(a)', attempted: true, confidence: 95, sourcePages: [1], evidence: '', isPartial: false, isContinuation: false }],
      pageCoverageAudit: [{ pageNumber: 1, hasStudentContent: true, detectedQuestionIds: ['Q1(a)'], evaluatedQuestionIds: ['Q1(a)'], renderedQuestionIds: ['Q1(a)'] }],
    };

    // Simulate mismatched scorecard total (e.g. 8.0 instead of 7.5)
    const recon = buildFourSetReconciliation({
      ledger,
      manifest,
      scorecardTotal: 8.0,
      evaluationReportTotal: 7.5,
      checkedCopyTotal: 7.5,
      finalDisplayedTotal: 7.5,
    });

    assert.strictEqual(recon.isScoresReconciled, false, 'Score mismatch must be detected');
    assert.strictEqual(recon.isFullyReconciled, false, 'Reconciliation must fail');
  });

  // --------------------------------------------------------------------------
  // TEST 22: Question ID Mismatch Detection
  // --------------------------------------------------------------------------
  await runTest('TEST 22: Question ID identity enforcement (no array index dependence)', () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'MCQ16',
        questionType: 'MCQ',
        attempted: true,
        evaluated: true,
        sourcePages: [6],
        studentPages: [6],
        maxMarks: 1,
        awardedMarks: 1,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 6,
        annotationAnchor: { pageNumber: 6, region: 'RIGHT_MARGIN', annotationType: 'MCQ_BADGE' },
        renderOrder: 16,
        rendered: true,
        counted: true,
      },
    ];

    const meta: EvaluationData = { id: 'eval_id_match', level: 'INTERMEDIATE', subjectName: 'Taxation' };
    const res = buildStructuredAnnotations(meta, { evaluationRunPackage: { evaluationRecords: records } }, 10);
    // Even as single item (index 0), its identity MUST remain 'MCQ16', never 'MCQ1' or 'Q1'
    assert.strictEqual(res.pages[5].annotations[0].questionNumber, 'MCQ16', 'Question ID must remain MCQ16 regardless of array index');
  });

  // --------------------------------------------------------------------------
  // TEST 23: Complete Checked Copy PDF Generation
  // --------------------------------------------------------------------------
  await runTest('TEST 23: Checked Copy PDF generation with strict page count preservation', async () => {
    const records: CanonicalEvaluationRecord[] = [
      {
        questionId: 'Q1(a)',
        questionType: 'DESCRIPTIVE',
        attempted: true,
        evaluated: true,
        sourcePages: [1],
        studentPages: [1],
        maxMarks: 10,
        awardedMarks: 8,
        evaluationStatus: 'EVALUATED',
        annotationRequired: true,
        annotationPage: 1,
        annotationAnchor: { pageNumber: 1, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
        renderOrder: 1,
        rendered: true,
        counted: true,
      },
    ];

    const meta: EvaluationData = { id: 'eval_pdf_test', level: 'INTERMEDIATE', subjectName: 'Accounting' };
    const checkedPdfBuf = await generateCheckedCopyPdf(meta, { evaluationRunPackage: { evaluationRecords: records } }, samplePdfBuf);
    assert(checkedPdfBuf && checkedPdfBuf.length > 500, 'Checked copy PDF buffer generated');

    const generatedDoc = await PDFDocument.load(checkedPdfBuf);
    assert.strictEqual(generatedDoc.getPageCount(), 10, 'Strict invariant: originalPageCount === checkedCopyPageCount');
  });

  await runTest('TEST 24: All MCQ annotations physically render on a page without step-card overflow', async () => {
    const records: CanonicalEvaluationRecord[] = Array.from({ length: 8 }, (_, index) => ({
      questionId: `MCQ${index + 1}`,
      questionType: 'MCQ',
      attempted: true,
      evaluated: true,
      sourcePages: [1],
      studentPages: [1],
      maxMarks: index === 7 ? 1 : 2,
      awardedMarks: index === 7 ? 1 : 2,
      evaluationStatus: 'EVALUATED',
      annotationRequired: true,
      annotationPage: 1,
      annotationAnchor: { pageNumber: 1, region: 'RIGHT_MARGIN', annotationType: 'MCQ_BADGE' },
      renderOrder: index + 1,
      rendered: true,
      counted: true,
      studentSelectedOption: 'B',
      officialAnswer: 'B',
    }));
    const evaluationRunPackage: any = {
      runId: 'mcq_compact_physical_render',
      evaluationRecords: records,
      scoreLedger: { totalAwardedMarks: 15, totalMaxMarks: 15 },
    };
    const meta: EvaluationData = { id: 'eval_mcq_physical_render', level: 'INTERMEDIATE', subjectName: 'Taxation' };
    const checkedPdfBuf = await generateCheckedCopyPdf(meta, { evaluationRunPackage }, samplePdfBuf);
    assert.ok(checkedPdfBuf.length > 500);
    assert.strictEqual(evaluationRunPackage.renderManifest.totalRendered, 8);
    assert.strictEqual(evaluationRunPackage.renderManifest.isRenderValid, true);
    assert.deepStrictEqual(
      evaluationRunPackage.renderManifest.items.filter((item: any) => item.rendered).map((item: any) => item.questionId),
      records.map((record) => record.questionId),
      'The physical-render manifest must preserve every canonical MCQ identity exactly once'
    );
  });

  await runTest('TEST 25: Descriptive overflow fails closed instead of returning a partial checked copy', async () => {
    const records: CanonicalEvaluationRecord[] = Array.from({ length: 12 }, (_, index) => ({
      questionId: `Q${index + 1}(a)`,
      questionType: 'DESCRIPTIVE',
      attempted: true,
      evaluated: true,
      sourcePages: [1],
      studentPages: [1],
      maxMarks: 1,
      awardedMarks: 1,
      evaluationStatus: 'EVALUATED',
      annotationRequired: true,
      annotationPage: 1,
      annotationAnchor: { pageNumber: 1, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
      renderOrder: index + 1,
      rendered: true,
      counted: true,
      markingComponents: [{
        componentId: `Q${index + 1}-working`,
        componentType: 'WORKING',
        expectedRequirement: 'Working verified',
        studentEvidence: 'Relevant calculation is present.',
        confidence: 1,
        marksAvailable: 1,
        marksAwarded: 1,
        marksDeducted: 0,
        assessment: 'CORRECT',
      }],
    }));
    const evaluationRunPackage: any = {
      runId: 'descriptive_overflow_fail_closed',
      evaluationRecords: records,
      scoreLedger: { totalAwardedMarks: 12, totalMaxMarks: 12 },
    };
    const meta: EvaluationData = { id: 'eval_descriptive_overflow', level: 'INTERMEDIATE', subjectName: 'Accounting' };

    await assert.rejects(
      () => generateCheckedCopyPdf(meta, { evaluationRunPackage }, samplePdfBuf),
      (err: any) => err.code === 'CHECKED_COPY_RENDER_INTEGRITY_FAILURE' && /source page 1/.test(err.message),
      'Overflow must expose an integrity error rather than save a partially annotated PDF'
    );
  });

  console.log('\n================================================================');
  console.log(`--- TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED ---`);
  console.log('================================================================');

  if (passedTests === totalTests) {
    console.log('ALL 25 CHECKED-COPY RENDERING CONTRACT TESTS PASSED!');
    process.exit(0);
  } else {
    console.error('SOME CONTRACT TESTS FAILED!');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
