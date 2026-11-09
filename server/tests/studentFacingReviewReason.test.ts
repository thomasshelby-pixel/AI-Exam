import assert from 'node:assert/strict';
import { getStudentFacingReviewReason } from '../services/studentFacingReviewReason.js';

const mappingReason = getStudentFacingReviewReason([
  'ATTEMPTED_QUESTION_UNMAPPED: Attempted question MCQ9 is not in the authoritative inventory.',
]);
assert.match(mappingReason, /objective\/MCQ section/i);
assert.match(mappingReason, /Your uploaded answer sheet is preserved for review/i);
assert.doesNotMatch(mappingReason, /remove the separate MCQ booklet/i);
assert.match(mappingReason, /24–48 working hours/i);

const referenceReason = getStudentFacingReviewReason([
  'QUESTION_REFERENCE_REVIEW_REQUIRED: Q2(a) needs exact reference verification.',
]);
assert.match(referenceReason, /Question Paper and Suggested Answer/i);
assert.match(referenceReason, /24–48 working hours/i);

const handwritingReason = getStudentFacingReviewReason([
  'HANDWRITING_UNCLEAR_FLAG: Q3(b) marked as UNCLEAR.',
]);
const modelUncertainReason = getStudentFacingReviewReason([
  'MODEL_UNCERTAIN: Q3(b) was readable but the automated examiner could not settle the assessment.',
]);
assert.match(modelUncertainReason, /uploaded answer is readable/i);
assert.match(modelUncertainReason, /second check/i);
assert.match(modelUncertainReason, /24–48 working hours/i);
assert.doesNotMatch(modelUncertainReason, /blurry|sharper scan/i);
const mixedUnclearReason = getStudentFacingReviewReason([
  'MODEL_UNCERTAIN: Q3(b) needs an additional check.',
  'HANDWRITING_UNCLEAR_FLAG: Q3(b) contains unreadable handwriting.',
]);
assert.match(mixedUnclearReason, /could not be read confidently/i);
assert.doesNotMatch(mixedUnclearReason, /uploaded answer is readable/i);

assert.match(handwritingReason, /marks already evaluated have been preserved/i);
assert.match(handwritingReason, /24–48 working hours/i);

const reconciliationReason = getStudentFacingReviewReason([
  'FINALIZATION_FAILED: Score reconciliation mismatch across ledger and report.',
]);
assert.match(reconciliationReason, /did not reconcile automatically/i);
assert.match(reconciliationReason, /24–48 working hours/i);

const fallbackReason = getStudentFacingReviewReason([]);
assert.match(fallbackReason, /preserved/i);
assert.match(fallbackReason, /24–48 working hours/i);
assert.doesNotMatch(fallbackReason, /FINALIZATION_FAILED|ATTEMPTED_QUESTION_UNMAPPED/i);

console.log('✅ Student-facing review reason sanitization regression passed.');
