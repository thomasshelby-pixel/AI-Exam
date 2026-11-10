import assert from 'node:assert/strict';
import { validateAnswerSheetCoverageCompleteness } from '../services/answerSheetCoverageService.js';
import {
  buildCanonicalEvaluationLedger,
  buildCanonicalQuestionInventory,
  buildFourSetReconciliation,
} from '../services/canonicalQuestionInventoryService.js';
import {
  validatePreRenderGate,
  validatePostRenderGate,
} from '../services/pdfCheckedCopyService.js';

const completeCoverage: any = {
  totalPages: 2,
  pages: [
    {
      pageNumber: 1,
      status: 'CLEARLY_UNATTEMPTED',
      hasHandwriting: false,
      detectedQuestions: [],
      unresolvedAnswerBlocks: [],
    },
    {
      pageNumber: 2,
      status: 'ATTEMPTED_READABLE',
      hasHandwriting: true,
      answerBlocksObserved: 1,
      detectedQuestions: [{ fullQuestionCode: 'Q1(a)' }],
      unresolvedAnswerBlocks: [],
    },
  ],
};
assert.equal(validateAnswerSheetCoverageCompleteness(completeCoverage).isComplete, true,
  'Every original page must have exactly one successfully analysed page record, including blank pages.');

const missingAudit = validateAnswerSheetCoverageCompleteness({
  totalPages: 2,
  pages: [completeCoverage.pages[0]],
} as any);
assert.equal(missingAudit.isComplete, false);
assert.deepEqual(missingAudit.missingPages, [2],
  'A source page with no analysis record must be detected.');

const duplicateAudit = validateAnswerSheetCoverageCompleteness({
  totalPages: 2,
  pages: [completeCoverage.pages[0], completeCoverage.pages[1], completeCoverage.pages[1]],
} as any);
assert.equal(duplicateAudit.isComplete, false);
assert.deepEqual(duplicateAudit.duplicatePages, [2],
  'Duplicate analysis of one page cannot hide a missing/duplicated audit record.');

const skippedPageAudit = validateAnswerSheetCoverageCompleteness({
  totalPages: 2,
  pages: [
    completeCoverage.pages[0],
    {
      pageNumber: 2,
      status: 'QUESTION_NOT_IDENTIFIED',
      hasHandwriting: true,
      detectedQuestions: [],
      unresolvedAnswerBlocks: ['Handwritten answer block was not mapped.'],
      analysisFailure: { code: 'SKIPPED_AFTER_PROVIDER_FAILURE' },
    },
  ],
} as any);
assert.equal(skippedPageAudit.isComplete, false,
  'A page skipped after provider failure must remain visible as an analysis failure, never as a blank page.');

const records: any[] = [
  {
    questionId: 'Q1(a)',
    questionType: 'DESCRIPTIVE',
    attempted: true,
    evaluated: true,
    sourcePages: [1],
    studentPages: [1],
    maxMarks: 4,
    awardedMarks: 3,
    evaluationStatus: 'EVALUATED',
    annotationRequired: true,
    annotationPage: 1,
    annotationAnchor: { pageNumber: 1, region: 'RIGHT_MARGIN', annotationType: 'SCORE_BOX' },
    rendered: false,
    counted: true,
  },
  {
    questionId: 'Q2(b)',
    questionType: 'DESCRIPTIVE',
    attempted: true,
    evaluated: false,
    sourcePages: [2],
    studentPages: [2],
    maxMarks: 5,
    awardedMarks: 0,
    evaluationStatus: 'FAILED_TO_EVALUATE',
    annotationRequired: true,
    annotationPage: 2,
    annotationAnchor: { pageNumber: 2, region: 'RIGHT_MARGIN', annotationType: 'EVALUATION_NOTE' },
    rendered: false,
    counted: false,
    technicalFailureReason: 'Model output was unavailable.',
  },
];

const pre = validatePreRenderGate({ records, totalPages: 2 });
assert.equal(pre.isValid, true,
  'A detected question awaiting review still needs and may receive a review annotation; it must not block checked-copy creation merely because it is not scored.');

const questionAnnotations = [
  { pageNumber: 1, questionNumber: 'Q1(a)', canonicalId: 'Q1(a)', marksAwarded: 3, maxMarks: 4 },
  { pageNumber: 2, questionNumber: 'Q2(b)', canonicalId: 'Q2(b)', marksAwarded: 0, maxMarks: 5 },
];
const physicalPages: any[] = [
  { pageNumber: 1, originalPagePresent: true, headerRendered: true, footerRendered: true, examinerSealRendered: false, annotationCount: 1, questionIds: ['Q1(a)'] },
  { pageNumber: 2, originalPagePresent: true, headerRendered: true, footerRendered: true, examinerSealRendered: true, annotationCount: 1, questionIds: ['Q2(b)'] },
];
const validRender = validatePostRenderGate({
  evaluationId: 'complete-render',
  runId: 'complete-render',
  records,
  renderedAnnotations: questionAnnotations,
  totalPages: 2,
  physicalPageRenders: physicalPages,
});
assert.equal(validRender.isValid, true, validRender.errors.join(' | '));
assert.equal(validRender.renderManifest.totalRendered, 2,
  'Attempted review dispositions count as rendered annotations, even when not academically evaluated.');
assert.equal(validRender.renderManifest.isAllPagesRendered, true);
assert.equal(validRender.renderManifest.totalPagesRendered, 2);

const missingSecondPhysicalPage = validatePostRenderGate({
  evaluationId: 'missing-page',
  runId: 'missing-page',
  records,
  renderedAnnotations: questionAnnotations,
  totalPages: 2,
  physicalPageRenders: [physicalPages[0]],
});
assert.equal(missingSecondPhysicalPage.isValid, false);
assert.match(missingSecondPhysicalPage.errors.join(' '), /Original page 2 was not rendered/);

const missingReviewQuestion = validatePostRenderGate({
  evaluationId: 'missing-question',
  runId: 'missing-question',
  records,
  renderedAnnotations: [questionAnnotations[0]],
  totalPages: 2,
  physicalPageRenders: physicalPages,
});
assert.equal(missingReviewQuestion.isValid, false);
assert.match(missingReviewQuestion.errors.join(' '), /Q2\(b\).*NOT rendered|Q2\(b\).*found 0/);

const duplicatePhysicalPage = validatePostRenderGate({
  evaluationId: 'duplicate-page',
  runId: 'duplicate-page',
  records,
  renderedAnnotations: questionAnnotations,
  totalPages: 2,
  physicalPageRenders: [...physicalPages, physicalPages[1]],
});
assert.equal(duplicatePhysicalPage.isValid, false);
assert.match(duplicatePhysicalPage.errors.join(' '), /Original page 2 was rendered more than once/);

// An attempted but unselected OR branch must still receive examiner feedback.
// Its marks remain excluded from the canonical grand total.
const alternativeInventory = buildCanonicalQuestionInventory({
  paperStructure: {
    paperTitle: 'Alternative attempt test',
    totalPaperMaxMarks: 10,
    questions: [],
    mcqs: [],
    subQuestions: [
      { fullQuestionCode: 'Q1(a)', questionNumber: '1', subQuestionNumber: 'a', maximumMarks: 5, isMcq: false, isAlternative: true },
      { fullQuestionCode: 'Q1(b)', questionNumber: '1', subQuestionNumber: 'b', maximumMarks: 5, isMcq: false, isAlternative: true },
    ],
  } as any,
});
const alternativeAttempts: any = new Map([
  ['Q1(a)', { canonicalId: 'Q1(a)', questionNumber: '1', subQuestion: 'a', sourcePages: [1], isAttempted: true, isPartial: false, isContinuation: false, isCrossedOutWithNoReplacement: false, evidence: 'Attempted alternative A', isMcq: false }],
  ['Q1(b)', { canonicalId: 'Q1(b)', questionNumber: '1', subQuestion: 'b', sourcePages: [2], isAttempted: true, isPartial: false, isContinuation: false, isCrossedOutWithNoReplacement: false, evidence: 'Attempted alternative B', isMcq: false }],
]);
const alternativeLedger = buildCanonicalEvaluationLedger({
  runId: 'alternative-attempt',
  inventory: alternativeInventory,
  attemptedMap: alternativeAttempts,
  selectedAlternatives: { ALT_1: 'Q1(a)' },
  evaluatedQuestions: [
    { canonicalId: 'Q1(a)', questionNumber: '1', subQuestion: 'a', maximumMarks: 5, marksAwarded: 4, status: 'partially_correct', markingComponents: [{ componentId: 'a1', componentType: 'APPLICATION', marksAvailable: 5, marksAwarded: 4 }] },
    { canonicalId: 'Q1(b)', questionNumber: '1', subQuestion: 'b', maximumMarks: 5, marksAwarded: 3, status: 'partially_correct', markingComponents: [{ componentId: 'b1', componentType: 'APPLICATION', marksAvailable: 5, marksAwarded: 3 }] },
  ] as any,
});
const selectedAlternative = alternativeLedger.records.find((record) => record.questionId === 'Q1(a)')!;
const unselectedAttemptedAlternative = alternativeLedger.records.find((record) => record.questionId === 'Q1(b)')!;
assert.equal(selectedAlternative.counted, true);
assert.equal(unselectedAttemptedAlternative.counted, false,
  'The unselected alternative must not affect the grand total.');
assert.equal(unselectedAttemptedAlternative.annotationRequired, true,
  'The unselected alternative was still attempted and must have an examiner disposition on the checked copy.');
assert.equal(unselectedAttemptedAlternative.awardedMarks, 3,
  'Keep the independently evaluated feedback available while excluded from the final total.');

const physicallyRenderedAlternativeLedger: any = {
  ...alternativeLedger,
  records: alternativeLedger.records.map((record) => ({ ...record, rendered: true })),
};
const alternativeReconciliation = buildFourSetReconciliation({
  ledger: physicallyRenderedAlternativeLedger,
  manifest: { manifestId: 'alternative-manifest', evaluationRunId: 'alternative-attempt', totalPages: 2, attempts: [], pageCoverageAudit: [] },
  scorecardTotal: alternativeLedger.totalAwardedMarks,
  evaluationReportTotal: alternativeLedger.totalAwardedMarks,
  checkedCopyTotal: alternativeLedger.totalAwardedMarks,
  finalDisplayedTotal: alternativeLedger.totalAwardedMarks,
});
assert.equal(alternativeReconciliation.isEvaluatedEqualToRendered, true,
  'Both the selected and unselected attempted alternatives must appear in the checked copy.');
assert.equal(alternativeReconciliation.isRenderedEqualToCounted, true,
  'Only the selected alternative is included when reconciling rendered marks to the grand total.');
assert.equal(alternativeReconciliation.isFullyReconciled, true,
  alternativeReconciliation.mismatches.join(' | '));

console.log('✅ Full page and question disposition completeness gates passed.');
