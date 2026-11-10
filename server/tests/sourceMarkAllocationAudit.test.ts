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

// Faculty Mock reference TXT is independently authored and commonly uses a
// single explicit mark total followed by a short criterion description.
const facultyMockStructure = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'FACULTY_MOCK_TEST',
  officialPaperMaxMarks: 100,
  questionPaperText: [
    'CA Intermediate Advanced Accounting — Faculty Mock Question Paper',
    'Maximum Marks: 100',
    'Question 1. Prepare the relevant journal entries and explain the accounting treatment with supporting working notes.',
    'Question 2. Calculate the required amount and show each step of your calculation.',
  ].join('\n\n'),
  suggestedAnswersText: [
    'Suggested Answer — Faculty Mock',
    'Question 1. The correct accounting treatment is explained below with the relevant standard and journal entries.',
    'Question 2. The calculation and reasoning are set out step by step below.',
  ].join('\n\n'),
  markingSchemeText: [
    'Question 1: 5 marks for correct treatment, supporting standard and journal entries.',
    'Question 2: 5 marks for correct formula, workings, calculation and conclusion.',
  ].join('\n\n'),
});
assert.deepEqual(
  facultyMockStructure.subQuestions.map((question) => [question.fullQuestionCode, question.maximumMarks]),
  [['Q1', 5], ['Q2', 5]],
  'Faculty Mock single-total rubric lines must create independent question nodes and preserve each maximum.',
);
assert.equal(
  validatePreEvaluationGate({
    paperStructure: facultyMockStructure,
    questionPaperText: 'Question 1. Treatment and journal entries. Question 2. Calculation and working.',
    suggestedAnswersText: 'Suggested Answers for Question 1 and Question 2 with detailed solutions.',
    markingSchemeText: 'Question 1: 5 marks for treatment. Question 2: 5 marks for calculation.',
    officialPaperMaxMarks: 100,
  }).passed,
  true,
  'A complete Faculty Mock with unambiguous question-total rubric lines must pass the structural gate.',
);

// A Faculty Mock Suggested Answers TXT may hold the only unambiguous total
// allocation when the marking TXT is a general rubric. It may safely fill
// the missing QP maximum only when a single described total is present.
const facultySuggestedAnswerFallback = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'FACULTY_MOCK_TEST',
  officialPaperMaxMarks: 100,
  questionPaperText: [
    'Faculty Mock Question Paper',
    'Question 4(a). Prepare the required reconciliation.',
  ].join('\n'),
  suggestedAnswersText: [
    'Faculty Mock Suggested Answers',
    'Question 4(a): 5 marks for correct reconciliation and supporting workings.',
  ].join('\n'),
  markingSchemeText: 'Award credit for valid approach, workings and conclusion.',
});
assert.equal(
  facultySuggestedAnswerFallback.subQuestions.find((question) => question.fullQuestionCode === 'Q4(a)')?.maximumMarks,
  5,
  'An unambiguous Faculty Mock total in Suggested Answers can fill a missing QP total.',
);


// Parent-scoped bare sub-parts in a faculty-authored rubric must retain
// independent maxima, just like the canonical PYQ/MTP hierarchical parser.
const facultyNestedMock = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'FACULTY_MOCK_TEST',
  officialPaperMaxMarks: 100,
  questionPaperText: [
    'Faculty Mock Question Paper',
    'Question 1. Prepare the required accounting statement.',
  ].join('\n'),
  suggestedAnswersText: [
    'Suggested Answers',
    'Question 1(a). First part solution and working.',
    'Question 1(b). Second part solution and working.',
  ].join('\n'),
  markingSchemeText: [
    'Question 1',
    '(a) 2 marks for the relevant principle and explanation.',
    '(b) 3 marks for application, working and conclusion.',
  ].join('\n'),
});
assert.deepEqual(
  facultyNestedMock.subQuestions.map((question) => [question.fullQuestionCode, question.maximumMarks]),
  [['Q1(a)', 2], ['Q1(b)', 3]],
  'Faculty-authored parent headings and bare child labels must map to separate canonical scoreable leaves.',
);

// A Faculty Mock QP/MS mismatch using descriptive prose still blocks scoring.
const facultyProseConflict = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'FACULTY_MOCK_TEST',
  officialPaperMaxMarks: 100,
  questionPaperText: [
    'Faculty Mock Question Paper',
    'Question 1: 7 marks for the required accounting treatment and workings.',
  ].join('\n'),
  suggestedAnswersText: [
    'Suggested Answers',
    'Question 1. Full solution and supporting workings.',
  ].join('\n'),
  markingSchemeText: [
    'Question 1: 5 marks for the required accounting treatment and workings.',
  ].join('\n'),
});
assert.equal(
  facultyProseConflict.subQuestions.find((question) => question.fullQuestionCode === 'Q1')?.maximumMarks,
  7,
  'The Faculty Mock QP total remains the primary maximum when the MS disagrees.',
);
assert.ok(
  facultyProseConflict.markAllocationConflicts?.some((message) => message.includes('Q1')),
  'Faculty Mock QP/MS prose totals are cross-checked, not silently ignored.',
);
assert.equal(
  validatePreEvaluationGate({
    paperStructure: facultyProseConflict,
    questionPaperText: 'Question 1: 7 marks for the required accounting treatment and workings.',
    suggestedAnswersText: 'Question 1. Full solution and supporting workings.',
    markingSchemeText: 'Question 1: 5 marks for the required accounting treatment and workings.',
    officialPaperMaxMarks: 100,
  }).passed,
  false,
  'A conflicting Faculty Mock total cannot be certified.',
);

// A line with multiple component allocations is ambiguous as a question
// maximum. Do not promote the first criterion to the full sub-question score.
const ambiguousFacultyRubric = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'FACULTY_MOCK_TEST',
  officialPaperMaxMarks: 100,
  questionPaperText: [
    'Faculty Mock Question Paper',
    'Question 1(a). Explain the treatment and calculate the amount.',
  ].join('\n'),
  suggestedAnswersText: [
    'Suggested Answers',
    'Question 1(a). Full solution and calculation are provided.',
  ].join('\n'),
  markingSchemeText: [
    'Question 1(a): Award 2 marks for the correct principle and 3 marks for application.',
  ].join('\n'),
});
assert.equal(
  ambiguousFacultyRubric.subQuestions.length,
  0,
  'Ambiguous multi-component prose must not be guessed as a 2-mark question maximum.',
);
assert.equal(
  validatePreEvaluationGate({
    paperStructure: ambiguousFacultyRubric,
    questionPaperText: 'Question 1(a). Explain the treatment and calculate the amount.',
    suggestedAnswersText: 'Question 1(a). Full solution and calculation are provided.',
    markingSchemeText: 'Question 1(a): Award 2 marks for the principle and 3 for application.',
    officialPaperMaxMarks: 100,
  }).passed,
  false,
  'An ambiguous Faculty Mock allocation must stop certification and require source correction/review.',
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
