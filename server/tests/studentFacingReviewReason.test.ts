import assert from 'node:assert/strict';
import { getStudentFacingReviewReason } from '../services/studentFacingReviewReason.js';

const mappingReason = getStudentFacingReviewReason([
  'ATTEMPTED_QUESTION_UNMAPPED: Attempted question MCQ9 is not in the authoritative inventory.',
]);
assert.match(mappingReason, /objective\/MCQ section/i);
assert.match(mappingReason, /ICAI-certified copy/i);
assert.match(mappingReason, /Non-certified copies/i);

const referenceReason = getStudentFacingReviewReason([
  'QUESTION_REFERENCE_REVIEW_REQUIRED: Q2(a) needs exact reference verification.',
]);
assert.match(referenceReason, /Question Paper and Suggested Answer/i);

const handwritingReason = getStudentFacingReviewReason([
  'HANDWRITING_UNCLEAR_FLAG: Q3(b) marked as UNCLEAR.',
]);
assert.match(handwritingReason, /sharper, well-lit scan/i);

const reconciliationReason = getStudentFacingReviewReason([
  'FINALIZATION_FAILED: Score reconciliation mismatch across ledger and report.',
]);
assert.match(reconciliationReason, /did not reconcile automatically/i);

const fallbackReason = getStudentFacingReviewReason([]);
assert.match(fallbackReason, /preserved/i);
assert.doesNotMatch(fallbackReason, /FINALIZATION_FAILED|ATTEMPTED_QUESTION_UNMAPPED/i);

console.log('✅ Student-facing review reason sanitization regression passed.');
