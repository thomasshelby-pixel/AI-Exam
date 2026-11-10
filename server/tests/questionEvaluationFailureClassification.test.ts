import assert from 'node:assert/strict';
import {
  classifyQuestionEvaluationFailure,
  createQuestionEvaluationFailure,
} from '../services/questionEvaluationFailureService.js';
import {
  isProviderOutputIncompleteFailure,
  isTaskSpecificOutputValidationFailure,
} from '../services/modelFailurePolicy.js';

const referenceFailure = createQuestionEvaluationFailure({
  questionNumber: '2',
  subQuestion: 'b',
  canonicalId: 'Q2(b)',
  maximumMarks: 5,
  pages: [3, 4, 3, 0],
  diagnostic: 'QUESTION_REFERENCE_NOT_LOCKED: authoritative Suggested Answer section could not be locked.',
});
assert.equal(classifyQuestionEvaluationFailure('QUESTION_REFERENCE_NOT_LOCKED'), 'REFERENCE_REVIEW');
assert.equal(referenceFailure.status, 'unclear');
assert.equal(referenceFailure.maximumMarks, 5);
assert.equal(referenceFailure.marksAwarded, 0);
assert.equal(referenceFailure.marksLost, 0);
assert.equal(referenceFailure.pageNumber, 3);
assert.ok(referenceFailure.flags?.includes('QUESTION_REFERENCE_REVIEW_REQUIRED'));
assert.ok(!referenceFailure.flags?.includes('FAILED_TO_EVALUATE'),
  'A missing/locked reference is not mislabeled as an AI evaluation failure.');

const technicalFailure = createQuestionEvaluationFailure({
  questionNumber: '1',
  subQuestion: 'a',
  canonicalId: 'Q1(a)',
  maximumMarks: 4,
  pages: [2],
  diagnostic: 'AI Evaluation service is currently unavailable across all configured models.',
});
assert.equal(classifyQuestionEvaluationFailure('QUESTION_CHUNK_COMPONENTS_MISSING'), 'TECHNICAL_FAILURE');
assert.equal(technicalFailure.status, 'unclear');
assert.equal(technicalFailure.maximumMarks, 4);
assert.equal(technicalFailure.marksAwarded, 0);
assert.equal(technicalFailure.marksLost, 0);
assert.ok(technicalFailure.flags?.includes('FAILED_TO_EVALUATE'));
assert.ok(technicalFailure.flags?.includes('TECHNICAL_FAILURE'));
assert.match(technicalFailure.detailedFeedback, /No academic marks have been assigned/);

assert.equal(
  isTaskSpecificOutputValidationFailure('MODEL_OUTPUT_VALIDATION_FAILED: QUESTION_CHUNK_SCORE_MISMATCH'),
  true,
  'A question-specific schema/rubric rejection is scoped to that request, not model health.'
);
assert.equal(
  isProviderOutputIncompleteFailure('MODEL_OUTPUT_VALIDATION_FAILED: QUESTION_CHUNK_SCORE_MISMATCH'),
  false,
  'A score reconciliation rejection must not trigger a provider cooldown.'
);
assert.equal(
  isTaskSpecificOutputValidationFailure('OPENAI_OUTPUT_TRUNCATED: response ended before JSON completed'),
  false,
  'A genuinely truncated provider response is not classified as a task-only validation failure.'
);
assert.equal(
  isProviderOutputIncompleteFailure('OPENAI_OUTPUT_TRUNCATED: response ended before JSON completed'),
  true,
  'A genuinely truncated provider response may still trigger a short model cooldown.'
);
assert.equal(
  isTaskSpecificOutputValidationFailure('HTTP 429 quota exceeded'),
  false,
  'Provider rate limits remain provider-health failures rather than question-schema failures.'
);

console.log('Question evaluation failure classification tests passed.');
