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

// 15-answer regression based on the handwritten MCQ list in the supplied faulty PDF.
// The checked copy must render one independent card per answer, not one combined
// "MCQ115" review card, and the per-question totals must reconcile.
const page28Selections = ['B', 'A', 'B', 'C', 'D', 'D', 'B', 'A', 'D', 'B', 'C', 'A', 'C', 'C', 'D'];
const page28OfficialKeys = ['B', 'C', 'B', 'C', 'A', 'D', 'A', 'A', 'D', 'B', 'C', 'B', 'C', 'D', 'D'];
const page28AwardedMarks = page28Selections.map((option, index) =>
  option === page28OfficialKeys[index] ? 1 : 0
);
const page28TotalAwarded = page28AwardedMarks.reduce((sum, marks) => sum + marks, 0);
const page28Questions = page28Selections.map((option, index) => ({
  canonicalId: `MCQ${index + 1}`,
  questionNumber: `MCQ ${index + 1}`,
  questionType: 'MCQ',
  maximumMarks: 1,
  marksAwarded: page28AwardedMarks[index],
  status: page28AwardedMarks[index] === 1 ? 'correct' : 'incorrect',
  candidateSelectedOption: option,
  officialCorrectOption: page28OfficialKeys[index],
  pageNumber: 28,
  detailedFeedback: 'The selected option was checked against the source-backed answer key.',
}));
const page28Audit = Array.from({ length: 28 }, (_, index) => ({
  pageNumber: index + 1,
  analysisCompleted: true,
  analysisStatus: index === 27 ? 'ATTEMPTED_READABLE' : 'CLEARLY_UNATTEMPTED',
  answerBlocksObserved: index === 27 ? 15 : 0,
  accountedAnswerBlocks: index === 27 ? 15 : 0,
  hasUnresolvedContent: false,
  unresolvedAnswerBlocks: [],
}));

const fifteenMcqCheckedCopy = buildStructuredAnnotations(
  {
    id: 'checked-copy-fifteen-mcq-render',
    level: 'INTERMEDIATE',
    subjectName: 'Corporate and Other Laws',
    totalMarks: page28TotalAwarded,
    maximumMarks: 15,
  } as any,
  {
    validationStatus: 'NEEDS_REVIEW',
    totalMarksAwarded: page28TotalAwarded,
    maximumMarks: 15,
    evaluationRunPackage: { pageCoverageAudit: page28Audit },
    questions: page28Questions,
  },
  28,
);

const page28McqAnnotations = fifteenMcqCheckedCopy.pages[27].annotations.filter(
  (annotation) => annotation.canonicalId?.startsWith('MCQ'),
);
assert.equal(page28McqAnnotations.length, 15,
  'All 15 attempted MCQs must render as separate checked-copy annotations on page 28.');
assert.equal(new Set(page28McqAnnotations.map((annotation) => annotation.canonicalId)).size, 15,
  'Every MCQ annotation must have a unique canonical ID.');
assert.deepEqual(
  page28McqAnnotations.map((annotation) => annotation.canonicalId),
  Array.from({ length: 15 }, (_, index) => `MCQ${index + 1}`),
  'MCQ1 through MCQ15 must render independently; a combined MCQ115 annotation is forbidden.',
);
assert.ok(page28McqAnnotations.every((annotation) =>
  annotation.maxMarks === 1 && annotation.reviewRequired === false
), 'Each verified MCQ must show its own 1-mark maximum and must not be held for review.');
assert.equal(
  page28McqAnnotations.reduce((sum, annotation) => sum + annotation.marksAwarded, 0),
  page28TotalAwarded,
  'The rendered MCQ marks must equal the deterministic MCQ subtotal.',
);
assert.ok(
  fifteenMcqCheckedCopy.pages.every((page) =>
    page.annotations.every((annotation) => annotation.pageReviewOnly !== true)
  ),
  'Pages with completed and reconciled page audits must not receive false page-only review badges.',
);
assert.equal(fifteenMcqCheckedCopy.summary.totalAwarded, page28TotalAwarded,
  'The checked-copy summary must preserve the same MCQ subtotal.');

console.log('Checked-copy official maximum, MCQ annotation and pending-review result tests passed.');
