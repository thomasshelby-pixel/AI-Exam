import assert from 'node:assert/strict';
import {
  buildStructuredAnnotations,
  calculateCheckedCopyResultSummary,
} from '../services/pdfCheckedCopyService.js';

const provisional = calculateCheckedCopyResultSummary({
  evalData: {
    id: 'checked-copy-provisional',
    level: 'INTERMEDIATE',
    subjectName: 'Advanced Accounting',
    maximumMarks: 30,
    evaluationStatus: 'NEEDS_REVIEW',
  },
  resultJson: {
    maximumMarks: 100,
    officialPaperMaxMarks: 100,
    validationStatus: 'NEEDS_REVIEW',
  },
  runPkg: {
    scoreLedger: { totalMaxMarks: 30 },
    questionInventory: { totalPaperMaxMarks: 100 },
  },
  totalAwarded: 30,
});
assert.equal(provisional.maxMarks, 100, 'Checked-copy denominator must use the full official paper maximum.');
assert.equal(provisional.attemptedMaxMarks, 30, 'Attempted subtotal remains available separately.');
assert.equal(provisional.percentage, 30, 'Percentage must use the official 100-mark paper denominator.');
assert.equal(provisional.isReviewPending, true);
assert.equal(provisional.resultStatus, 'NEEDS REVIEW', 'A review-held result must not receive a final academic grade.');

const finalized = calculateCheckedCopyResultSummary({
  evalData: {
    id: 'checked-copy-finalized',
    level: 'INTERMEDIATE',
    subjectName: 'Advanced Accounting',
    maximumMarks: 30,
    evaluationStatus: 'NEEDS_REVIEW',
    adminReviewStatus: 'AFFIRMED',
  },
  resultJson: {
    maximumMarks: 100,
    officialPaperMaxMarks: 100,
    validationStatus: 'NEEDS_REVIEW',
  },
  runPkg: {
    scoreLedger: { totalMaxMarks: 30 },
    questionInventory: { totalPaperMaxMarks: 100 },
  },
  totalAwarded: 65,
});
assert.equal(finalized.isReviewPending, false, 'A final examiner decision must supersede stale validation flags.');
assert.equal(finalized.resultStatus, 'EXEMPTION');
assert.equal(finalized.percentage, 65);

const legacy = calculateCheckedCopyResultSummary({
  evalData: { id: 'checked-copy-legacy', level: 'FINAL', subjectName: 'Audit', maximumMarks: 100 },
  resultJson: {},
  totalAwarded: 42,
});
assert.equal(legacy.maxMarks, 100);
assert.equal(legacy.resultStatus, 'PASS');

// A source-mapped MCQ with a deterministic score must receive a visible checked
// copy badge, while only the genuinely unresolved physical page gets a review note.
const cleanContinuationAndMcqCopy = buildStructuredAnnotations(
  {
    id: 'checked-copy-mcq-render',
    level: 'INTERMEDIATE',
    subjectName: 'Corporate and Other Laws',
    totalMarks: 2,
    maximumMarks: 6,
  } as any,
  {
    validationStatus: 'NEEDS_REVIEW',
    evaluationRunPackage: {
      pageCoverageAudit: [
        {
          pageNumber: 1,
          analysisCompleted: true,
          analysisStatus: 'ATTEMPTED_READABLE',
          answerBlocksObserved: 1,
          accountedAnswerBlocks: 1,
        },
        {
          pageNumber: 2,
          analysisCompleted: true,
          analysisStatus: 'ATTEMPTED_READABLE',
          answerBlocksObserved: 1,
          accountedAnswerBlocks: 1,
        },
        {
          pageNumber: 3,
          analysisCompleted: true,
          analysisStatus: 'QUESTION_NOT_IDENTIFIED',
          mappingReviewReason: 'One visible answer block remains unmapped.',
          hasUnresolvedContent: true,
          answerBlocksObserved: 1,
          accountedAnswerBlocks: 0,
        },
      ],
    },
    questions: [
      {
        canonicalId: 'MCQ1',
        questionNumber: 'MCQ 1',
        questionType: 'MCQ',
        maximumMarks: 2,
        marksAwarded: 2,
        status: 'correct',
        candidateSelectedOption: 'B',
        officialCorrectOption: 'B',
        pageNumber: 2,
        detailedFeedback: 'The selected option matches the verified answer key.',
      },
    ],
  },
  3,
);

const mcqBadge = cleanContinuationAndMcqCopy.pages[1].annotations.find(
  (annotation) => annotation.canonicalId === 'MCQ1',
);
assert.ok(mcqBadge, 'A scored MCQ must appear in the right-margin checked-copy annotations.');
assert.equal(mcqBadge?.marksAwarded, 2);
assert.equal(mcqBadge?.maxMarks, 2);
assert.equal(mcqBadge?.reviewRequired, false);
assert.match(mcqBadge?.steps[0]?.stepName || '', /Option: B \| Key: B/);

assert.equal(
  cleanContinuationAndMcqCopy.pages[1].annotations.some((annotation) => annotation.pageReviewOnly),
  false,
  'A fully analysed continuation page must not receive a page-level NEEDS REVIEW badge.',
);
assert.equal(
  cleanContinuationAndMcqCopy.pages[0].annotations.some((annotation) => annotation.pageReviewOnly),
  false,
  'A fully analysed first page must remain clean.',
);
assert.equal(
  cleanContinuationAndMcqCopy.pages[2].annotations.some((annotation) => annotation.pageReviewOnly),
  true,
  'A page with a real unresolved answer block must retain its page-level review marker.',
);
assert.equal(
  cleanContinuationAndMcqCopy.summary.totalAwarded,
  2,
  'The MCQ marks must remain included in the checked-copy total.',
);

console.log('Checked-copy official maximum, MCQ annotation and pending-review result tests passed.');
