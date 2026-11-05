import assert from 'node:assert/strict';
import { getAuthoritativePaperStructure } from '../services/paperStructureService.js';
import { validatePreEvaluationGate } from '../services/evaluationIntegrityHardening.js';

const shared = {
  level: 'INTERMEDIATE',
  subjectName: 'Taxation',
  paper: 'Taxation',
  questionPaperText: `MODEL TEST PAPER 1 - QUESTION PAPER
Question 1 - 20 Marks
(a) Compute the taxable income. [8 Marks]
(b) Calculate the tax liability. [12 Marks]
Question 2 - 10 Marks
Question 3(a) - 5 Marks
Question 3(b) - 5 Marks`,
  suggestedAnswersText: `Suggested Answers for Model Test Paper 1
Detailed answers follow question-wise.`,
  markingSchemeText: `MODEL TEST PAPER 1 - MARKING SCHEME
Question 1 - 20 Marks
(a) Computation - 8 Marks
(b) Tax calculation - 12 Marks
Question 2 - 10 Marks
Question 3(a) - 5 Marks
Question 3(b) - 5 Marks`,
  officialPaperMaxMarks: 50,
};

const levelSubjectMatrix: Record<string, string[]> = {
  FOUNDATION: ['Accounting', 'Business Laws', 'Quantitative Aptitude', 'Business Economics'],
  INTERMEDIATE: [
    'Advanced Accounting',
    'Costing',
    'Corporate and Other Laws',
    'Taxation',
    'Audit',
    'Financial Management and Strategic Management',
  ],
  FINAL: [
    'Financial Reporting',
    'Advanced Financial Management',
    'Advanced Auditing, Assurance and Professional Ethics',
    'Direct Tax Laws and International Taxation',
    'Indirect Tax Laws',
    'Corporate and Economic Laws',
    'Strategic Cost and Performance Management',
    'Integrated Business Solutions',
  ],
};

for (const [level, subjects] of Object.entries(levelSubjectMatrix)) {
  for (const subjectName of subjects) {
    const modelTest = getAuthoritativePaperStructure({
      ...shared,
      level,
      subjectName,
      paper: subjectName,
      materialType: 'MODEL_TEST_PAPER',
    });
    assert.deepEqual(
      modelTest.subQuestions.map((question) => question.fullQuestionCode),
      ['Q1(a)', 'Q1(b)', 'Q2', 'Q3(a)', 'Q3(b)'],
      `\u0024{level} / \u0024{subjectName}: Model Test mapping must follow the selected source and remove parent totals when marked child parts exist.`,
    );
    assert.deepEqual(
      modelTest.subQuestions.map((question) => question.maximumMarks),
      [8, 12, 10, 5, 5],
      `\u0024{level} / \u0024{subjectName}: Model Test maximum marks must come from its own Marking Scheme.`,
    );
    assert.equal(modelTest.totalPaperMaxMarks, 50);
    assert.ok(modelTest.subQuestions.every((question) => question.section === 'GENERAL'));
    assert.equal(modelTest.subQuestions.some((question) => question.compulsory), false,
      `\u0024{level} / \u0024{subjectName}: Model Test must not assume Q1 or Q5 is compulsory without an explicit source rule.`);
  }
}

// The old Taxation Q1–Q8 special case must not leak into Model Test routing.
const taxationModelTest = getAuthoritativePaperStructure({ ...shared, materialType: 'MODEL_TEST_PAPER' });
assert.equal(taxationModelTest.subQuestions.some((question) => question.fullQuestionCode === 'Q5(a)'), false,
  'Taxation Model Test must not inherit the fixed ICAI Taxation template.');

const unparseableModelTest = getAuthoritativePaperStructure({
  ...shared,
  materialType: 'MODEL_TEST_PAPER',
  markingSchemeText: 'Marking scheme supplied, but question references and marks are not readable.',
  questionPaperText: 'Question paper text without numbered questions or explicit marks.',
});
assert.equal(unparseableModelTest.subQuestions.length, 0,
  'An unparseable Model Test must not receive invented Q1–Q6 defaults.');
assert.equal(unparseableModelTest.mcqs.length, 0);
const unparseableGate = validatePreEvaluationGate({
  paperStructure: unparseableModelTest,
  questionPaperText: 'Question paper text without numbered questions.',
  suggestedAnswersText: 'Suggested answers are present but cannot identify questions.',
  markingSchemeText: 'Marking scheme is present but does not identify allocations.',
});
assert.equal(unparseableGate.passed, false);
assert.ok(unparseableGate.failedInvariants.some((message) => message.includes('MODEL_TEST_QUESTION_INVENTORY_EMPTY')));

const mtp = getAuthoritativePaperStructure({ ...shared, materialType: 'MTP' });
assert.ok(mtp.subQuestions.some((question) => question.fullQuestionCode === 'Q5(a)'),
  'Existing MTP Taxation template must remain unchanged.');
assert.equal(mtp.mcqs.length, 16,
  'Existing MTP Taxation MCQ inventory must remain unchanged.');

const pyq = getAuthoritativePaperStructure({ ...shared, materialType: 'PYQ' });
assert.ok(pyq.subQuestions.some((question) => question.fullQuestionCode === 'Q5(a)'),
  'Existing PYQ Taxation template must remain unchanged.');


// QP and Marking Scheme often use different layouts. The QP labels remain the
// authoritative identity inventory even when marks are only printed beside a
// child in the Marking Scheme.
const splitLayoutModelTest = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  officialPaperMaxMarks: 40,
  questionPaperText: `ADVANCED ACCOUNTING MODEL TEST PAPER 1
Question No. 1
(a) Pass the required journal entries for internal reconstruction.
(b) Prepare the revised balance sheet.
Question No. 2
Prepare the statement of affairs and explain the treatment.
Q.3(a) Calculate the goodwill.
Q.3(b) Prepare the capital accounts.
Question No. 4
Calculate the purchase consideration.`,
  suggestedAnswersText: `MODEL TEST PAPER 1 SUGGESTED ANSWERS
Answer 1(a), 1(b), 2, 3(a), 3(b) and 4 are provided.`,
  markingSchemeText: `ADVANCED ACCOUNTING MODEL TEST PAPER 1 MARKING SCHEME
Question No. 1
(a) 4 Marks
(b) 6 Marks
Question No. 2
10 Marks
Q.3(a) - 5 Marks
Q.3(b) - 5 Marks
Question No. 4 - 10 Marks`,
});
assert.deepEqual(
  splitLayoutModelTest.subQuestions.map((question) => question.fullQuestionCode),
  ['Q1(a)', 'Q1(b)', 'Q2', 'Q3(a)', 'Q3(b)', 'Q4'],
  'The complete QP inventory must survive when QP and Marking Scheme use different heading layouts.',
);
assert.deepEqual(
  splitLayoutModelTest.subQuestions.map((question) => question.maximumMarks),
  [4, 6, 10, 5, 5, 10],
  'Maximum marks must be joined to the exact QP canonical ID, not inferred from another source.',
);
assert.deepEqual(splitLayoutModelTest.sourceInventoryDiagnostics?.missingMarkQuestionIds, []);
assert.deepEqual(splitLayoutModelTest.sourceInventoryDiagnostics?.markingSchemeOnlyQuestionIds, []);
const splitLayoutGate = validatePreEvaluationGate({
  paperStructure: splitLayoutModelTest,
  questionPaperText: 'Question Paper content is present and verified.',
  suggestedAnswersText: 'Suggested Answer content is present and verified.',
  markingSchemeText: 'Marking Scheme content is present and verified.',
  officialPaperMaxMarks: 40,
});
assert.equal(splitLayoutGate.passed, true, 'A fully reconciled QP/MS inventory should pass source preflight.');

// Reproduce the failure shape from the post-merge review: one marked leaf must
// not become the entire authoritative paper when the QP contains other questions.
const partialMarksModelTest = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  questionPaperText: `Question No. 1
(a) Journal entries.
(b) Revised balance sheet.
Question No. 2
Statement of profit and loss.
Question No. 3(a)
Goodwill calculation.
Question No. 3(b)
Capital accounts.
Question No. 4
Purchase consideration.`,
  suggestedAnswersText: 'Suggested answer document contains the answers.',
  markingSchemeText: 'Question 3(b) - 5 Marks',
});
assert.deepEqual(
  partialMarksModelTest.sourceInventoryDiagnostics?.questionPaperQuestionIds,
  ['Q1(a)', 'Q1(b)', 'Q2', 'Q3(a)', 'Q3(b)', 'Q4'],
  'A sparse Marking Scheme must never shrink the QP inventory to the only ID it happened to parse.',
);
assert.deepEqual(
  partialMarksModelTest.sourceInventoryDiagnostics?.missingMarkQuestionIds,
  ['Q1(a)', 'Q1(b)', 'Q2', 'Q3(a)', 'Q4'],
);
const partialMarksGate = validatePreEvaluationGate({
  paperStructure: partialMarksModelTest,
  questionPaperText: 'Question Paper content is present and verified.',
  suggestedAnswersText: 'Suggested Answer content is present and verified.',
  markingSchemeText: 'Marking Scheme content is present and verified.',
});
assert.equal(partialMarksGate.passed, false, 'An incomplete Marking Scheme must fail closed before page-AI analysis.');
assert.ok(partialMarksGate.failedInvariants.some((message) => message.includes('MODEL_TEST_MARKS_NOT_RECONCILED: Q1(a)')));

// Unmatched Marking Scheme entries are source conflicts, not extra questions to
// silently add to the selected paper.
const orphanMarkModelTest = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  questionPaperText: 'Question 1 - 10 Marks',
  suggestedAnswersText: 'Suggested answer document.',
  markingSchemeText: 'Question 1 - 10 Marks\nQuestion 9 - 5 Marks',
});
assert.deepEqual(orphanMarkModelTest.sourceInventoryDiagnostics?.markingSchemeOnlyQuestionIds, ['Q9']);
const orphanMarkGate = validatePreEvaluationGate({
  paperStructure: orphanMarkModelTest,
  questionPaperText: 'Question Paper content is present and verified.',
  suggestedAnswersText: 'Suggested Answer content is present and verified.',
  markingSchemeText: 'Marking Scheme content is present and verified.',
});
assert.equal(orphanMarkGate.passed, false);
assert.ok(orphanMarkGate.failedInvariants.some((message) => message.includes('MODEL_TEST_MARKING_SCHEME_SOURCE_CONFLICT: Q9')));

// Unprefixed sequential question headings are accepted only when the document
// has no explicit Q/Question markers.
const bareNumberModelTest = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Costing',
  paper: 'Paper 4',
  materialType: 'MODEL_TEST_PAPER',
  questionPaperText: `1. Calculate the contribution and P/V ratio.
(a) Compute the break-even point.
2. Prepare the marginal costing statement.`,
  suggestedAnswersText: 'Suggested answers for questions 1(a) and 2.',
  markingSchemeText: `1. Question total - 10 Marks
(a) 4 Marks
2. Question total - 6 Marks`,
});
assert.deepEqual(
  bareNumberModelTest.subQuestions.map((question) => question.fullQuestionCode),
  ['Q1(a)', 'Q2'],
);
assert.deepEqual(
  bareNumberModelTest.subQuestions.map((question) => question.maximumMarks),
  [4, 6],
);


const mixedObjectiveAndDescriptiveModelTest = getAuthoritativePaperStructure({
  level: 'FOUNDATION',
  subjectName: 'Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  officialPaperMaxMarks: 20,
  questionPaperText: `MODEL TEST PAPER
Multiple Choice Questions
Question 1 - Select the correct option.
Question 2 - Select the correct option.
Descriptive Questions
Question 3 - Prepare the required statement.`,
  suggestedAnswersText: `MODEL TEST PAPER SUGGESTED ANSWERS
Multiple Choice Questions
1. (b)
2. (c)
Descriptive Questions
Question 3 - Full solution.`,
  markingSchemeText: `MODEL TEST PAPER MARKING SCHEME
Multiple Choice Questions
Question 1 - 1 Mark
Question 2 - 1 Mark
Descriptive Questions
Question 3 - 18 Marks`,
});
assert.deepEqual(
  mixedObjectiveAndDescriptiveModelTest.mcqs.map((question) => [question.fullQuestionCode, question.maximumMarks, question.officialKey]),
  [['MCQ1', 1, 'B'], ['MCQ2', 1, 'C']],
  'Model Test MCQs must use the QP objective section, the official key, and exact marks from the Marking Scheme.',
);
assert.deepEqual(
  mixedObjectiveAndDescriptiveModelTest.subQuestions.map((question) => [question.fullQuestionCode, question.maximumMarks]),
  [['Q3', 18]],
);
assert.deepEqual(mixedObjectiveAndDescriptiveModelTest.sourceInventoryDiagnostics?.missingMarkQuestionIds, []);


const bareSubQuestionModelTest = getAuthoritativePaperStructure({
  level: 'FINAL',
  subjectName: 'Financial Reporting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  questionPaperText: 'Q. No. 4(b) Explain the consolidation adjustment.',
  suggestedAnswersText: 'Suggested Answer for Question 4(b).',
  markingSchemeText: '4(b) [4 Marks]',
});
assert.deepEqual(
  bareSubQuestionModelTest.subQuestions.map((question) => [question.fullQuestionCode, question.maximumMarks]),
  [['Q4(b)', 4]],
  'Bare numbered sub-question labels and bracketed mark values must be reconciled safely.',
);
assert.deepEqual(bareSubQuestionModelTest.sourceInventoryDiagnostics?.missingMarkQuestionIds, []);


const parentTotalOnlyModelTest = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  questionPaperText: `Question 1
(a) Journal entries.
(b) Revised balance sheet.`,
  suggestedAnswersText: 'Suggested answers for Q1(a) and Q1(b).',
  markingSchemeText: 'Question 1 - 20 Marks',
});
assert.deepEqual(
  parentTotalOnlyModelTest.sourceInventoryDiagnostics?.questionPaperQuestionIds,
  ['Q1(a)', 'Q1(b)'],
);
assert.deepEqual(parentTotalOnlyModelTest.sourceInventoryDiagnostics?.missingMarkQuestionIds, ['Q1(a)', 'Q1(b)']);
assert.deepEqual(
  parentTotalOnlyModelTest.sourceInventoryDiagnostics?.markingSchemeOnlyQuestionIds,
  [],
  'A QP-confirmed parent total is not an orphan Marking Scheme question when its children exist.',
);
const parentTotalGate = validatePreEvaluationGate({
  paperStructure: parentTotalOnlyModelTest,
  questionPaperText: 'Question Paper verified.',
  suggestedAnswersText: 'Suggested Answers verified.',
  markingSchemeText: 'Marking Scheme verified.',
});
assert.equal(parentTotalGate.passed, false);
assert.ok(parentTotalGate.failedInvariants.some((message) => message.includes('MODEL_TEST_MARKS_NOT_RECONCILED: Q1(a)')));

// A section-labelled objective paper remains split into MCQ identities and
// descriptive question identities, with source-defined MCQ marks.
const sectionLabelledObjectiveModelTest = getAuthoritativePaperStructure({
  level: 'FOUNDATION',
  subjectName: 'Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  officialPaperMaxMarks: 20,
  questionPaperText: `MODEL TEST PAPER 1
Section A (MCQs)
Question No. 1 - Select one option.
Question No. 2 - Select one option.
Section B (Descriptive)
Question No. 3 - Prepare the statement.`,
  suggestedAnswersText: `MODEL TEST PAPER 1 SUGGESTED ANSWERS
Multiple Choice Questions
1. (b)
2. (c)
Descriptive Questions
Question 3 - Full solution.`,
  markingSchemeText: `MODEL TEST PAPER 1 MARKING SCHEME
Section A (MCQs)
Question No. 1 - 1 Mark
Question No. 2 - 1 Mark
Section B (Descriptive)
Question No. 3 - 18 Marks.`,
});
assert.deepEqual(
  sectionLabelledObjectiveModelTest.mcqs.map((question) => [question.fullQuestionCode, question.maximumMarks, question.officialKey]),
  [['MCQ1', 1, 'B'], ['MCQ2', 1, 'C']],
);
assert.deepEqual(
  sectionLabelledObjectiveModelTest.subQuestions.map((question) => [question.fullQuestionCode, question.maximumMarks]),
  [['Q3', 18]],
);
assert.deepEqual(sectionLabelledObjectiveModelTest.sourceInventoryDiagnostics?.missingMcqKeyQuestionIds, []);

// Never silently omit an MCQ whose official key is missing from the selected SA.
const missingMcqKeyModelTest = getAuthoritativePaperStructure({
  level: 'FOUNDATION',
  subjectName: 'Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  questionPaperText: `Multiple Choice Questions
Question 1 - Select one answer.
Question 2 - Select one answer.`,
  suggestedAnswersText: `Suggested Answers
Multiple Choice Questions
1. (b)`,
  markingSchemeText: `Multiple Choice Questions
Question 1 - 1 Mark
Question 2 - 1 Mark`,
});
assert.deepEqual(missingMcqKeyModelTest.sourceInventoryDiagnostics?.missingMcqKeyQuestionIds, ['MCQ2']);
const missingMcqKeyGate = validatePreEvaluationGate({
  paperStructure: missingMcqKeyModelTest,
  questionPaperText: 'Question Paper verified.',
  suggestedAnswersText: 'Suggested Answers verified.',
  markingSchemeText: 'Marking Scheme verified.',
});
assert.equal(missingMcqKeyGate.passed, false);
assert.ok(missingMcqKeyGate.failedInvariants.some((message) => message.includes('MISSING_OFFICIAL_MCQ_KEY: MCQ 2')));

console.log('Model Test dynamic paper structure tests passed.');
