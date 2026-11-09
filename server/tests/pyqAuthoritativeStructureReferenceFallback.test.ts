import assert from 'node:assert/strict';
import { assessQuestionReferenceForEvaluation } from '../services/questionChunkEvaluator.js';
import {
  buildCanonicalEvaluationLedger,
  buildCanonicalQuestionInventory,
  detectIndependentAttempts,
} from '../services/canonicalQuestionInventoryService.js';

const baseReference = {
  questionPaperFound: false,
  suggestedAnswerFound: true,
  referenceNeedsReview: false,
  materialType: 'PYQ',
  authoritativeQuestionStructureVerified: true,
};

const verifiedPyqStructure = assessQuestionReferenceForEvaluation(baseReference);
assert.equal(verifiedPyqStructure.canScoreProvisionally, true);
assert.equal(
  verifiedPyqStructure.requiresHumanReview,
  false,
  'A QP slice formatting miss should not force review when the exact PYQ question is present in the authoritative inventory and its Suggested Answer is locked.',
);

const missingStructureAnchor = assessQuestionReferenceForEvaluation({
  ...baseReference,
  authoritativeQuestionStructureVerified: false,
});
assert.equal(missingStructureAnchor.canScoreProvisionally, true);
assert.equal(missingStructureAnchor.requiresHumanReview, true);

for (const materialType of ['PYQ', 'MTP', 'MODEL_TEST_PAPER', 'FACULTY_MOCK_TEST']) {
  const sourceDisposition = assessQuestionReferenceForEvaluation({
    ...baseReference,
    materialType,
  });
  assert.equal(
    sourceDisposition.requiresHumanReview,
    false,
    materialType + ' must not force review when its exact Suggested Answer is locked and its canonical leaf/maximum are verified.',
  );
}

const missingSuggestedAnswer = assessQuestionReferenceForEvaluation({
  ...baseReference,
  suggestedAnswerFound: false,
  referenceNeedsReview: true,
});
assert.equal(missingSuggestedAnswer.canScoreProvisionally, false);
assert.equal(missingSuggestedAnswer.requiresHumanReview, true);

const exactQuestionPaperSlice = assessQuestionReferenceForEvaluation({
  ...baseReference,
  questionPaperFound: true,
});
assert.equal(exactQuestionPaperSlice.requiresHumanReview, false);

// A separate MCQ booklet may exist in the authoritative paper, but a PYQ
// descriptive answer-sheet upload with no MCQ responses must not be held for
// review merely because those objective questions were not attempted/uploaded.
const descriptiveOnlyPaper: any = {
  paperTitle: 'PYQ descriptive section',
  totalPaperMaxMarks: 100,
  questions: [],
  mcqs: [
    {
      fullQuestionCode: 'MCQ1',
      questionNumber: '1',
      maximumMarks: 2,
      isMcq: true,
      compulsory: true,
      section: 'A',
    },
  ],
  subQuestions: [
    {
      fullQuestionCode: 'Q1(a)',
      questionNumber: '1',
      subQuestionNumber: 'a',
      maximumMarks: 5,
      isMcq: false,
      compulsory: true,
      questionText: 'Explain the required descriptive treatment.',
      section: 'B',
    },
  ],
};
const descriptiveInventory = buildCanonicalQuestionInventory({
  paperStructure: descriptiveOnlyPaper,
});
const descriptiveAttempts = detectIndependentAttempts({
  inventory: descriptiveInventory,
  rawPageOccurrences: [
    {
      questionCode: 'Q1(a)',
      pageNumber: 1,
      evidenceText: 'A relevant descriptive answer with explanation.',
      studentSnippet: 'A relevant descriptive answer with explanation.',
    },
  ],
});
const descriptiveLedger = buildCanonicalEvaluationLedger({
  runId: 'pyq-descriptive-only-no-mcq-attempt',
  inventory: descriptiveInventory,
  attemptedMap: descriptiveAttempts,
  evaluatedQuestions: [
    {
      canonicalId: 'Q1(a)',
      questionNumber: '1',
      subQuestion: 'a',
      maximumMarks: 5,
      marksAwarded: 3,
      status: 'partially_correct',
    } as any,
  ],
});
assert.equal(descriptiveLedger.isReconciled, true);
assert.deepEqual(descriptiveLedger.reconciliationErrors, []);
assert.equal(
  descriptiveLedger.records.find((record) => record.questionId === 'MCQ1')?.evaluationStatus,
  'UNATTEMPTED',
);
assert.equal(
  descriptiveLedger.records.find((record) => record.questionId === 'MCQ1')?.counted,
  false,
);

console.log('✅ PYQ authoritative Question Paper structure fallback regression passed.');
