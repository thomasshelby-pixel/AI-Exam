import assert from 'node:assert/strict';
import {
  buildQuestionChunkSubPartCompletenessDirective,
  parseAndValidateQuestionChunkOutput,
  requiresAnswerLevelReadabilityReview,
} from '../services/questionChunkEvaluator.js';

function makeResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    status: 'PARTIALLY_CORRECT',
    marksAwarded: 4.5,
    reasonForDeduction: 'Some components were incomplete.',
    detailedFeedback: 'The candidate demonstrated relevant understanding and received partial credit for the supported steps.',
    confidence: 90,
    markingComponents: [
      {
        componentId: 'c1',
        componentType: 'provision',
        expectedRequirement: 'Identify the governing provision.',
        studentEvidence: 'The candidate identified the relevant provision.',
        assessment: 'correct',
        marksAvailable: 2,
        marksAwarded: 2,
        marksDeducted: 99,
      },
      {
        componentId: 'c2',
        componentType: 'working',
        expectedRequirement: 'Show the calculation working.',
        studentEvidence: 'The candidate showed a partial calculation.',
        assessment: 'partially_correct',
        marksAvailable: 3,
        marksAwarded: 0.5,
      },
    ],
    ...overrides,
  });
}

const nestedDirective = buildQuestionChunkSubPartCompletenessDirective('Q2(a(ii))', 3);
assert.match(nestedDirective, /exactly the authoritative leaf Q2\(a\(ii\)\)/i);
assert.match(nestedDirective, /Do not merge this leaf with its parent/i);
assert.match(nestedDirective, /each distinct, independently mark-bearing source criterion exactly once/i);
assert.match(nestedDirective, /source's own component allocations/i);
assert.match(nestedDirective, /visibly not attempted/i);
assert.match(nestedDirective, /unreadable\s+evidence requires UNCLEAR\/review/i);
assert.match(nestedDirective, /no source criterion may be silently skipped or duplicated/i);
assert.match(nestedDirective, /do not fabricate a balancing step/i);

assert.equal(requiresAnswerLevelReadabilityReview({
  status: 'ATTEMPTED_UNCLEAR',
  readabilityStatusExplicit: false,
}), false, 'An aggregate page-level unclear label must not force review before the question evaluator independently reads the answer.');
assert.equal(requiresAnswerLevelReadabilityReview({
  status: 'ATTEMPTED_UNCLEAR',
  readabilityStatusExplicit: true,
}), true, 'An explicit answer-block unreadable decision must remain review-required.');
assert.equal(requiresAnswerLevelReadabilityReview({
  status: 'ATTEMPTED_PARTIALLY_READABLE',
  readabilityStatusExplicit: true,
}), false, 'A partially readable answer proceeds to source-grounded marking; the evaluator can still return UNCLEAR if evidence is insufficient.');

const normalized = parseAndValidateQuestionChunkOutput(makeResponse(), 5);
assert.equal(normalized.status, 'partially_correct',
  'Status labels are normalized case-insensitively.');
assert.equal(normalized.marksAwarded, 2.5,
  'Validated component awards, not the redundant question total, determine the question score.');
assert.equal(normalized.markingComponents[0].marksDeducted, 0,
  'A stale marksDeducted value is deterministically recalculated from allocation and award.');
assert.equal(normalized.markingComponents[1].marksDeducted, 2.5,
  'A missing marksDeducted value is safely derived from allocation and award.');
assert.equal(normalized.markingComponents[0].assessment, 'CORRECT',
  'Component assessment text is normalized from validated marks.');
assert.equal(normalized.markingComponents[1].assessment, 'PARTIALLY_CORRECT',
  'Partial component assessment is derived from the validated score.');
assert.equal(normalized.modelReportedMarksAwarded, 4.5,
  'The inconsistent model-reported total remains available for audit.');
assert.match(normalized.scoreReconciliationNote, /reconciled/i);

const missingQuestionTotal = parseAndValidateQuestionChunkOutput(
  makeResponse({ marksAwarded: 'not-a-number' }),
  5,
);
assert.equal(missingQuestionTotal.marksAwarded, 2.5,
  'A malformed redundant question total does not invalidate complete, source-bounded component evidence.');

assert.throws(
  () => parseAndValidateQuestionChunkOutput(makeResponse({
    markingComponents: [
      {
        componentId: 'over',
        componentType: 'WORKING',
        expectedRequirement: 'Show the working.',
        studentEvidence: 'The candidate wrote a result.',
        assessment: 'CORRECT',
        marksAvailable: 2,
        marksAwarded: 2.5,
      },
      {
        componentId: 'rest',
        componentType: 'PROVISION',
        expectedRequirement: 'State the provision.',
        studentEvidence: 'The candidate named it.',
        assessment: 'CORRECT',
        marksAvailable: 3,
        marksAwarded: 3,
      },
    ],
  }), 5),
  /outside its component limit/,
  'An award above a component allocation is still rejected.',
);

assert.throws(
  () => parseAndValidateQuestionChunkOutput(makeResponse({
    markingComponents: [
      {
        componentId: 'c1',
        componentType: 'WORKING',
        expectedRequirement: 'Show the working.',
        studentEvidence: 'The working is shown.',
        assessment: 'CORRECT',
        marksAvailable: 2,
        marksAwarded: 2,
      },
      {
        componentId: 'c2',
        componentType: 'PROVISION',
        expectedRequirement: 'State the provision.',
        studentEvidence: 'The candidate named it.',
        assessment: 'CORRECT',
        marksAvailable: 2,
        marksAwarded: 2,
      },
    ],
  }), 5),
  /component allocations total 4, but the authoritative maximum is 5/,
  'Component maximum allocations must still reconcile exactly to the authoritative question maximum.',
);

assert.throws(
  () => parseAndValidateQuestionChunkOutput(makeResponse({
    markingComponents: [{
      componentId: 'c1',
      componentType: 'WORKING',
      expectedRequirement: 'Show the working.',
      studentEvidence: '',
      assessment: 'OMITTED',
      marksAvailable: 5,
      marksAwarded: 0,
    }],
  }), 5),
  /missing candidate evidence/,
  'Missing student evidence is not fabricated or silently accepted.',
);

console.log('Question chunk output validation tests passed.');
