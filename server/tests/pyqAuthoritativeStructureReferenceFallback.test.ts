import assert from 'node:assert/strict';
import { assessQuestionReferenceForEvaluation } from '../services/questionChunkEvaluator.js';

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

const nonPyqMustKeepExistingStrictBehavior = assessQuestionReferenceForEvaluation({
  ...baseReference,
  materialType: 'MTP',
});
assert.equal(nonPyqMustKeepExistingStrictBehavior.requiresHumanReview, true);

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

console.log('✅ PYQ authoritative Question Paper structure fallback regression passed.');
