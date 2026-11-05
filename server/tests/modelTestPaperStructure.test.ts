import assert from 'node:assert/strict';
import { getAuthoritativePaperStructure } from '../services/paperStructureService.js';

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

for (const subjectName of [
  'Advanced Accounting',
  'Costing',
  'Corporate and Other Laws',
  'Taxation',
  'Audit',
  'Financial Management and Strategic Management',
]) {
  const modelTest = getAuthoritativePaperStructure({
    ...shared,
    subjectName,
    paper: subjectName,
    materialType: 'MODEL_TEST_PAPER',
  });
  assert.deepEqual(
    modelTest.subQuestions.map((question) => question.fullQuestionCode),
    ['Q1(a)', 'Q1(b)', 'Q2', 'Q3(a)', 'Q3(b)'],
    `\u0024{subjectName}: Model Test mapping must follow the selected source and remove parent totals when marked child parts exist.`,
  );
  assert.deepEqual(
    modelTest.subQuestions.map((question) => question.maximumMarks),
    [8, 12, 10, 5, 5],
    `\u0024{subjectName}: Model Test maximum marks must come from its own Marking Scheme.`,
  );
  assert.equal(modelTest.totalPaperMaxMarks, 50);
  assert.ok(modelTest.subQuestions.every((question) => question.section === 'GENERAL'));
  assert.equal(modelTest.subQuestions.some((question) => question.compulsory), false,
    `\u0024{subjectName}: Model Test must not assume Q1 or Q5 is compulsory without an explicit source rule.`);
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

const mtp = getAuthoritativePaperStructure({ ...shared, materialType: 'MTP' });
assert.ok(mtp.subQuestions.some((question) => question.fullQuestionCode === 'Q5(a)'),
  'Existing MTP Taxation template must remain unchanged.');
assert.equal(mtp.mcqs.length, 16,
  'Existing MTP Taxation MCQ inventory must remain unchanged.');

const pyq = getAuthoritativePaperStructure({ ...shared, materialType: 'PYQ' });
assert.ok(pyq.subQuestions.some((question) => question.fullQuestionCode === 'Q5(a)'),
  'Existing PYQ Taxation template must remain unchanged.');

console.log('Model Test dynamic paper structure tests passed.');
