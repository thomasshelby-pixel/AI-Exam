import assert from 'node:assert/strict';
import { getAuthoritativePaperStructure } from '../services/paperStructureService.js';
import { validatePreEvaluationGate } from '../services/evaluationIntegrityHardening.js';

const base = {
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  officialPaperMaxMarks: 40,
  suggestedAnswersText: [
    'SUGGESTED ANSWERS',
    'Question 1(a): The answer explains the relevant accounting principle, applies it to the facts and shows the required calculation.',
    'Question 2(a): The answer provides the complete working and conclusion for the second question.',
  ].join('\n'),
};

function structureFor(materialType: 'PYQ' | 'MTP' | 'MODEL_TEST_PAPER', overrides: {
  questionPaperText: string;
  markingSchemeText: string;
}) {
  return getAuthoritativePaperStructure({
    ...base,
    ...overrides,
    materialType,
  });
}

// QP totals must not be silently overwritten by the first step allocation
// encountered in the Marking Scheme. The source disagreement is independently
// retained as a hard-gate issue instead of publishing a misleading score.
const conflictingQuestionPaper = [
  'CA Intermediate Advanced Accounting Question Paper',
  'Question 1(a) - 5 Marks',
  'Prepare the required statement and explain the treatment.',
  'Question 2(a) - 4 Marks',
  'Calculate the amount and show supporting working.',
].join('\n');
const conflictingMarkingScheme = [
  'Marking Scheme',
  'Question 1(a) - 3 Marks',
  'Question 2(a) - 4 Marks',
].join('\n');

for (const materialType of ['PYQ', 'MTP', 'MODEL_TEST_PAPER'] as const) {
  const structure = structureFor(materialType, {
    questionPaperText: conflictingQuestionPaper,
    markingSchemeText: conflictingMarkingScheme,
  });
  assert.equal(
    structure.subQuestions.find((question) => question.fullQuestionCode === 'Q1(a)')?.maximumMarks,
    5,
    materialType + ': the selected Question Paper maximum remains authoritative.',
  );
  assert.ok(
    structure.markAllocationConflicts?.some((message) => message.includes('Q1(a)')),
    materialType + ': an explicit QP / Marking Scheme disagreement is recorded.',
  );
  const gate = validatePreEvaluationGate({
    paperStructure: structure,
    questionPaperText: conflictingQuestionPaper,
    suggestedAnswersText: base.suggestedAnswersText,
    markingSchemeText: conflictingMarkingScheme,
    officialPaperMaxMarks: 40,
  });
  assert.equal(gate.passed, false, materialType + ': source mark disagreement blocks AI scoring.');
  assert.ok(
    gate.failedInvariants.some((message) => message.includes('MARK_ALLOCATION_SOURCE_CONFLICT')),
    materialType + ': the gate exposes the exact allocation-conflict reason.',
  );
}

// A rubric sentence containing step awards is not a standalone question-total
// declaration. It must not override the explicit QP maximum or create a false
// conflict merely because it mentions the question ID and component marks.
const rubricOnlyMarkingScheme = [
  'Marking Scheme',
  'Question 1(a) - Award 2 marks for the correct principle and 3 marks for application.',
  'Question 2(a) - 4 Marks',
].join('\n');
const rubricOnlyStructure = structureFor('MTP', {
  questionPaperText: conflictingQuestionPaper,
  markingSchemeText: rubricOnlyMarkingScheme,
});
assert.equal(
  rubricOnlyStructure.subQuestions.find((question) => question.fullQuestionCode === 'Q1(a)')?.maximumMarks,
  5,
  'Step allocations must not replace the QP question maximum.',
);
assert.equal(
  rubricOnlyStructure.markAllocationConflicts?.some((message) => message.includes('Q1(a)')),
  false,
  'A prose step-marking rubric is not misclassified as a conflicting total.',
);

// Parent totals and child allocations are different granularities, not a
// conflict. When the paper gives a parent total and the marking scheme gives
// leaf totals, keep the independently scoreable child leaves.
const parentPaper = [
  'Question Paper',
  'Question 3 - 10 Marks',
  'Prepare the requested statement.',
].join('\n');
const childMarkingScheme = [
  'Marking Scheme',
  'Question 3(a) - 4 Marks',
  'Question 3(b) - 6 Marks',
].join('\n');
const parentChildStructure = structureFor('PYQ', {
  questionPaperText: parentPaper,
  markingSchemeText: childMarkingScheme,
});
assert.deepEqual(
  parentChildStructure.subQuestions.map((question) => [question.fullQuestionCode, question.maximumMarks]),
  [['Q3(a)', 4], ['Q3(b)', 6]],
  'A parent paper total and source-backed child allocations remain separate granularities.',
);
assert.deepEqual(
  parentChildStructure.markAllocationConflicts,
  [],
  'Parent-vs-child allocations do not produce a false conflict.',
);

// If the QP has no explicit leaf total, a verified Marking Scheme allocation
// may fill that missing maximum rather than forcing a fabricated default.
const missingQpLeafMaximum = structureFor('MTP', {
  questionPaperText: [
    'Question Paper',
    'Question 4(a)',
    'Prepare the required reconciliation.',
  ].join('\n'),
  markingSchemeText: [
    'Marking Scheme',
    'Question 4(a) - 5 Marks',
  ].join('\n'),
});
assert.equal(
  missingQpLeafMaximum.subQuestions.find((question) => question.fullQuestionCode === 'Q4(a)')?.maximumMarks,
  5,
  'A Marking Scheme leaf allocation can fill a maximum omitted by the QP.',
);

// Standalone totals in Suggested Answers are cross-checked too; a matching
// QP/MS pair must not hide a conflicting SA allocation.
const suggestedAnswerTotalConflict = getAuthoritativePaperStructure({
  ...base,
  materialType: 'PYQ',
  questionPaperText: [
    'Question Paper',
    'Question 5(a) - 5 Marks',
    'Prepare the required statement.',
  ].join('\n'),
  markingSchemeText: [
    'Marking Scheme',
    'Question 5(a) - 5 Marks',
  ].join('\n'),
  suggestedAnswersText: [
    'Suggested Answers',
    'Question 5(a) - 3 Marks',
  ].join('\n'),
});
assert.ok(
  suggestedAnswerTotalConflict.markAllocationConflicts?.some((message) =>
    message.includes('Suggested Answers') && message.includes('Q5(a)')
  ),
  'A conflicting standalone Suggested Answer total cannot be ignored.',
);
assert.equal(
  validatePreEvaluationGate({
    paperStructure: suggestedAnswerTotalConflict,
    questionPaperText: 'Question Paper Question 5(a) - 5 Marks',
    suggestedAnswersText: 'Suggested Answers Question 5(a) - 3 Marks',
    markingSchemeText: 'Marking Scheme Question 5(a) - 5 Marks',
    officialPaperMaxMarks: 40,
  }).passed,
  false,
  'A QP/MS pair cannot certify a result when the selected Suggested Answer total conflicts.',
);

// Standalone totals written in parentheses without a dash are also explicit.
const parenthesizedTotalConflict = structureFor('MTP', {
  questionPaperText: [
    'Question Paper',
    'Question 5(a) - 5 Marks',
    'Prepare the statement.',
  ].join('\n'),
  markingSchemeText: [
    'Marking Scheme',
    'Question 5(a) (3 Marks)',
  ].join('\n'),
});
assert.ok(
  parenthesizedTotalConflict.markAllocationConflicts?.some((message) => message.includes('Q5(a)')),
  'A parenthesized standalone total is compared with the QP allocation.',
);

// A QP sub-part with no total allocation must not be assigned the first
// component award found in an explanatory Marking Scheme paragraph.
const explanationOnlyMarkingScheme = [
  'Marking Scheme',
  'Question 1(a) - Award 2 marks for the correct principle and 3 marks for application.',
  'Question 2(a) - 4 Marks',
].join('\n');
const explanationOnlyStructure = structureFor('PYQ', {
  questionPaperText: [
    'Question Paper',
    'Question 1(a)',
    'Prepare the required treatment.',
    'Question 2(a) - 4 Marks',
  ].join('\n'),
  markingSchemeText: explanationOnlyMarkingScheme,
});
assert.equal(
  explanationOnlyStructure.subQuestions.some((question) => question.fullQuestionCode === 'Q1(a)'),
  false,
  'Component-level 2/3-mark wording must not be mistaken for a 2-mark question maximum.',
);
assert.equal(
  explanationOnlyStructure.subQuestions.find((question) => question.fullQuestionCode === 'Q2(a)')?.maximumMarks,
  4,
  'A genuine standalone total remains available as a fallback allocation.',
);

console.log('Source-backed PYQ/MTP question maxima and source-conflict regressions passed.');
