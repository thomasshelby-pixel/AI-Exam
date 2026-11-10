import assert from 'node:assert/strict';
import { applyMultiModeMarkingPhilosophy } from '../services/multiModeMarkingEngine.js';

const question: any = {
  questionNumber: 'Q2',
  subQuestion: 'a',
  canonicalId: 'Q2(a)',
  maximumMarks: 2,
  marksAwarded: 0.25,
  marksLost: 1.75,
  status: 'partially_correct',
  markingComponents: [
    {
      componentId: 'Q2(a)_working_1',
      componentType: 'WORKING',
      expectedRequirement: 'Valid intermediate working',
      studentEvidence: 'Candidate used the correct formula and showed a valid intermediate step.',
      assessment: 'PARTIALLY_CORRECT',
      marksAvailable: 2,
      marksAwarded: 0.25,
      marksDeducted: 1.75,
    },
  ],
};

const result = applyMultiModeMarkingPhilosophy([question], 'strict', 100);
const strictQuestion = result.activeQuestions[0];

assert.equal(result.activeMode, 'strict');
assert.equal(strictQuestion.marksAwarded, 0.25,
  'Strict-mode percentage/half-mark rounding must not erase an already earned quarter mark.');
assert.equal(strictQuestion.markingComponents[0].marksAwarded, 0.25,
  'Component-level positive credit must survive strict-mode rounding.');
assert.equal(strictQuestion.status, 'partially_correct',
  'A question with positive source-grounded step credit must not become incorrect/zero.');

console.log('✅ Strict-mode positive partial-credit preservation regression passed.');
