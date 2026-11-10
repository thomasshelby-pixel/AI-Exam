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

// A mixed, partially correct answer must not become full marks in Strict mode.
// The base evaluator's original assessment labels are retained as scoring evidence.
const mixedQuestion: any = {
  questionNumber: 'Q6',
  subQuestion: 'b',
  canonicalId: 'Q6(b)',
  maximumMarks: 4,
  marksAwarded: 2.5,
  marksLost: 1.5,
  status: 'partially_correct',
  markingComponents: [
    {
      componentId: 'Q6b_c1',
      componentType: 'PROVISION',
      expectedRequirement: 'Define listed company under the applicable statutory definition.',
      studentEvidence: 'Candidate stated the listed company definition accurately.',
      assessment: 'CORRECT',
      marksAvailable: 1,
      marksAwarded: 1,
      marksDeducted: 0,
    },
    {
      componentId: 'Q6b_c2',
      componentType: 'PROVISION',
      expectedRequirement: 'State the Rule 2A exclusions.',
      studentEvidence: 'Candidate identified some but not all Rule 2A exclusions.',
      assessment: 'PARTIALLY_CORRECT',
      marksAvailable: 1,
      marksAwarded: 0.75,
      marksDeducted: 0.25,
      deductionReason: 'One exclusion was omitted.',
    },
    {
      componentId: 'Q6b_c3',
      componentType: 'APPLICATION',
      expectedRequirement: 'Apply each exclusion to the companies in the case.',
      studentEvidence: 'Candidate classified two entities but misclassified one.',
      assessment: 'PARTIALLY_CORRECT',
      marksAvailable: 1,
      marksAwarded: 0.75,
      marksDeducted: 0.25,
      deductionReason: 'One company was incorrectly classified.',
    },
    {
      componentId: 'Q6b_c4',
      componentType: 'CONCLUSION',
      expectedRequirement: 'Conclude which entities are listed companies.',
      studentEvidence: 'Conclusion follows only the two correctly classified entities.',
      assessment: 'INCORRECT',
      marksAvailable: 1,
      marksAwarded: 0,
      marksDeducted: 1,
      deductionReason: 'Final conclusion is incomplete.',
    },
  ],
};

const mixedStandard = applyMultiModeMarkingPhilosophy([mixedQuestion], 'standard', 100);
const mixedStrict = applyMultiModeMarkingPhilosophy([mixedQuestion], 'strict', 100);
assert.equal(mixedStandard.activeQuestions[0].marksAwarded, 2.5);
assert.equal(mixedStrict.activeQuestions[0].marksAwarded, 2,
  'Strict mode must apply deductions to the preserved PARTIALLY_CORRECT / INCORRECT assessments instead of returning full marks.');
assert.ok(
  mixedStrict.activeQuestions[0].marksAwarded < mixedStandard.activeQuestions[0].marksAwarded,
  'Strict mode must be lower than Standard when the answer contains supported partial and incorrect steps.',
);
assert.equal(mixedStrict.modeQuestions.standard[0].marksAwarded, 2.5);
assert.equal(mixedStrict.modeQuestions.strict[0].marksAwarded, 2,
  'All mode-specific question detail arrays must correspond to their displayed mode totals.');

console.log('✅ Strict-mode positive partial-credit preservation regression passed.');
