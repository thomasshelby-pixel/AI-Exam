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


const mixedNumberingObjectiveModelTest = getAuthoritativePaperStructure({
  level: 'FOUNDATION',
  subjectName: 'Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  officialPaperMaxMarks: 20,
  // Reproduces the production shape: the first MCQ has an explicit heading,
  // following MCQs use bare sequential numbering, and a descriptive section
  // restarts with an explicit Question heading.
  questionPaperText: `MODEL TEST PAPER 1
MULTIPLE CHOICE QUESTIONS
Question 1 - Which of the following is correct?
2. Select the correct accounting treatment.
3. Identify the correct principle.
4. Select the correct journal entry.
5. Choose the correct amount.
6. Identify the correct statement.
DESCRIPTIVE QUESTIONS
Question 7 - Prepare the required financial statement.`,
  suggestedAnswersText: `MODEL TEST PAPER 1 SUGGESTED ANSWERS
Multiple Choice Questions
1. (b)
2. (c)
3. (a)
4. (d)
5. (b)
6. (a)
Descriptive Questions
Question 7 - Full solution.`,
  // Marking Scheme numbers the MCQ answers generically as Q1..Q6 and omits
  // its own objective-section heading. The QP + official key provide the safe alias.
  markingSchemeText: `MODEL TEST PAPER 1 MARKING SCHEME
Question 1 - 1 Mark
Question 2 - 1 Mark
Question 3 - 1 Mark
Question 4 - 1 Mark
Question 5 - 1 Mark
Question 6 - 1 Mark
DESCRIPTIVE QUESTIONS
Question 7 - 14 Marks`,
});
assert.deepEqual(
  mixedNumberingObjectiveModelTest.sourceInventoryDiagnostics?.questionPaperQuestionIds,
  ['MCQ1', 'MCQ2', 'MCQ3', 'MCQ4', 'MCQ5', 'MCQ6', 'Q7'],
  'Explicit and bare sequential headings must coexist in one QP without dropping later questions.',
);
assert.deepEqual(
  mixedNumberingObjectiveModelTest.sourceInventoryDiagnostics?.markingSchemeQuestionIds,
  ['MCQ1', 'MCQ2', 'MCQ3', 'MCQ4', 'MCQ5', 'MCQ6', 'Q7'],
  'Generic Q1..Q6 Marking Scheme IDs must reconcile to MCQ1..MCQ6 only when the selected QP and official SA key agree.',
);
assert.deepEqual(
  mixedNumberingObjectiveModelTest.mcqs.map((question) => [question.fullQuestionCode, question.maximumMarks, question.officialKey]),
  [
    ['MCQ1', 1, 'B'],
    ['MCQ2', 1, 'C'],
    ['MCQ3', 1, 'A'],
    ['MCQ4', 1, 'D'],
    ['MCQ5', 1, 'B'],
    ['MCQ6', 1, 'A'],
  ],
);
assert.deepEqual(
  mixedNumberingObjectiveModelTest.subQuestions.map((question) => [question.fullQuestionCode, question.maximumMarks]),
  [['Q7', 14]],
);
assert.deepEqual(mixedNumberingObjectiveModelTest.sourceInventoryDiagnostics?.missingMarkQuestionIds, []);
assert.deepEqual(mixedNumberingObjectiveModelTest.sourceInventoryDiagnostics?.missingMcqKeyQuestionIds, []);
assert.deepEqual(mixedNumberingObjectiveModelTest.sourceInventoryDiagnostics?.markingSchemeOnlyQuestionIds, []);
const mixedNumberingGate = validatePreEvaluationGate({
  paperStructure: mixedNumberingObjectiveModelTest,
  questionPaperText: 'Question Paper text present.',
  suggestedAnswersText: 'Official Suggested Answer key present.',
  markingSchemeText: 'Marking Scheme text present.',
  officialPaperMaxMarks: 20,
});
assert.equal(mixedNumberingGate.passed, true, 'Three-source-consistent mixed numbering must pass preflight.');

// The same alias must NOT be applied if the selected Suggested Answers do not
// provide an official key for that MCQ number.
const unsafeMcqAliasModelTest = getAuthoritativePaperStructure({
  level: 'FOUNDATION',
  subjectName: 'Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  questionPaperText: `MULTIPLE CHOICE QUESTIONS
Question 1 - Select an answer.
2. Select an answer.`,
  suggestedAnswersText: `SUGGESTED ANSWERS
Multiple Choice Questions
1. (b)`,
  markingSchemeText: `Question 1 - 1 Mark
Question 2 - 1 Mark`,
});
assert.deepEqual(unsafeMcqAliasModelTest.sourceInventoryDiagnostics?.markingSchemeOnlyQuestionIds, ['Q2']);
assert.deepEqual(unsafeMcqAliasModelTest.sourceInventoryDiagnostics?.missingMarkQuestionIds, ['MCQ2']);
assert.deepEqual(unsafeMcqAliasModelTest.sourceInventoryDiagnostics?.missingMcqKeyQuestionIds, ['MCQ2']);
const unsafeMcqAliasGate = validatePreEvaluationGate({
  paperStructure: unsafeMcqAliasModelTest,
  questionPaperText: 'Question Paper text present.',
  suggestedAnswersText: 'Official Suggested Answer key incomplete.',
  markingSchemeText: 'Marking Scheme text present.',
});
assert.equal(unsafeMcqAliasGate.passed, false, 'MCQ aliases without an official SA key must remain blocked.');

// Do not alias Q1 marks to MCQ1 where the same QP separately contains
// descriptive Q1(a); that paper uses overlapping section numbering.
const ambiguousMcqAliasModelTest = getAuthoritativePaperStructure({
  level: 'FOUNDATION',
  subjectName: 'Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  questionPaperText: `MULTIPLE CHOICE QUESTIONS
Question 1 - Select one answer.
DESCRIPTIVE QUESTIONS
Question 1(a) - Prepare the required statement.`,
  suggestedAnswersText: `SUGGESTED ANSWERS
Multiple Choice Questions
1. (b)
Descriptive Answers
Question 1(a) - Full solution.`,
  markingSchemeText: `Question 1 - 1 Mark
Question 1(a) - 5 Marks`,
});
assert.deepEqual(ambiguousMcqAliasModelTest.sourceInventoryDiagnostics?.missingMarkQuestionIds, ['MCQ1']);
assert.equal(
  ambiguousMcqAliasModelTest.sourceInventoryDiagnostics?.markingSchemeQuestionIds.includes('MCQ1'),
  false,
  'A generic Q1 allocation must not be aliased to MCQ1 when descriptive Q1(a) also exists.',
);



const descriptiveOnlyModelTest = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  officialPaperMaxMarks: 100,
  // The source says there are no MCQs. A prose mention must not activate the
  // objective-section parser. A descriptive section with trailing marks must
  // be recognized even when question numbering mixes explicit and bare forms.
  questionPaperText: `ADVANCED ACCOUNTING MODEL TEST PAPER 1
INSTRUCTIONS: This paper does not contain multiple choice questions.
SECTION A: DESCRIPTIVE QUESTIONS (100 MARKS)
Question 1 - Prepare journal entries for the reconstruction.
2. Prepare the revised balance sheet.
Question 3(a) - Calculate the purchase consideration.
Question 3(b) - Prepare the realization account.`,
  suggestedAnswersText: `ADVANCED ACCOUNTING MODEL TEST PAPER 1 SUGGESTED ANSWERS
Question 1 - Full journal entry solution.
Question 2 - Full revised balance sheet solution.
Question 3(a) - Purchase consideration.
Question 3(b) - Realization account.`,
  markingSchemeText: `ADVANCED ACCOUNTING MODEL TEST PAPER 1 MARKING SCHEME
Question 1 - 20 Marks
Question 2 - 30 Marks
Question 3(a) - 25 Marks
Question 3(b) - 25 Marks.`,
});
assert.deepEqual(
  descriptiveOnlyModelTest.mcqs,
  [],
  'A descriptive-only Model Test must not create MCQ inventory from explanatory prose mentioning MCQs.',
);
assert.deepEqual(
  descriptiveOnlyModelTest.sourceInventoryDiagnostics?.questionPaperQuestionIds,
  ['Q1', 'Q2', 'Q3(a)', 'Q3(b)'],
);
assert.deepEqual(
  descriptiveOnlyModelTest.subQuestions.map((question) => [question.fullQuestionCode, question.maximumMarks]),
  [['Q1', 20], ['Q2', 30], ['Q3(a)', 25], ['Q3(b)', 25]],
);
assert.deepEqual(descriptiveOnlyModelTest.sourceInventoryDiagnostics?.missingMarkQuestionIds, []);
assert.deepEqual(descriptiveOnlyModelTest.sourceInventoryDiagnostics?.missingMcqKeyQuestionIds, []);
assert.deepEqual(descriptiveOnlyModelTest.sourceInventoryDiagnostics?.markingSchemeOnlyQuestionIds, []);
const descriptiveOnlyGate = validatePreEvaluationGate({
  paperStructure: descriptiveOnlyModelTest,
  questionPaperText: 'Question Paper verified.',
  suggestedAnswersText: 'Suggested Answers verified.',
  markingSchemeText: 'Marking Scheme verified.',
  officialPaperMaxMarks: 100,
});
assert.equal(descriptiveOnlyGate.passed, true, 'Descriptive-only paper with matching sources must pass without any MCQ requirement.');



const stepWiseMarkingSchemeModelTest = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  officialPaperMaxMarks: 20,
  questionPaperText: `ADVANCED ACCOUNTING MODEL TEST PAPER
Question 1
(a) Pass the journal entries.
(b) Prepare the revised balance sheet.
Question 2
(i) Explain the accounting treatment.`,
  suggestedAnswersText: 'Question-wise suggested answers are present for Q1(a), Q1(b) and Q2(i).',
  markingSchemeText: `MARKING SCHEME
Question 1
(a) Journal entries
1 mark for the correct account heads.
1 mark for the debit and credit treatment.
1 mark for the narration.
(b) Revised balance sheet
1 mark for correct classification.
2 marks for correct presentation.
Maximum Marks: 4
Question 2
(i) Accounting treatment
0.5 marks for identifying the standard.
0.5 marks for correct application.
1 mark for the conclusion.`,
});
assert.deepEqual(
  stepWiseMarkingSchemeModelTest.subQuestions.map((question) => [question.fullQuestionCode, question.maximumMarks]),
  [['Q1(a)', 3], ['Q1(b)', 4], ['Q2(i)', 2]],
  'Step-wise mark components must be summed within the exact active sub-question; explicit maximum totals override component sums.',
);
assert.deepEqual(stepWiseMarkingSchemeModelTest.sourceInventoryDiagnostics?.missingMarkQuestionIds, []);
assert.deepEqual(stepWiseMarkingSchemeModelTest.sourceInventoryDiagnostics?.markingSchemeOnlyQuestionIds, []);
const stepWiseMarkingGate = validatePreEvaluationGate({
  paperStructure: stepWiseMarkingSchemeModelTest,
  questionPaperText: 'Question Paper verified.',
  suggestedAnswersText: 'Suggested Answers verified.',
  markingSchemeText: 'Step-wise Marking Scheme verified.',
  officialPaperMaxMarks: 20,
});
assert.equal(stepWiseMarkingGate.passed, true, 'A fully explicit step-wise marking scheme should reconcile before page analysis.');

// More than one explicitly labelled component on a line is additive, but a
// mark range or alternative ("1 or 2 marks") must never be summed as a total.
const multipleComponentsOnLineModelTest = getAuthoritativePaperStructure({
  level: 'FINAL',
  subjectName: 'Financial Reporting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  questionPaperText: 'Question 1(a) Explain the treatment.',
  suggestedAnswersText: 'Suggested answer for Q1(a).',
  markingSchemeText: `Question 1(a)
1 mark for the treatment and 2 marks for the calculation.`,
});
assert.deepEqual(
  multipleComponentsOnLineModelTest.subQuestions.map((question) => [question.fullQuestionCode, question.maximumMarks]),
  [['Q1(a)', 3]],
);

const ambiguousStepMarksModelTest = getAuthoritativePaperStructure({
  level: 'FINAL',
  subjectName: 'Financial Reporting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  questionPaperText: 'Question 1(a) Explain the treatment.',
  suggestedAnswersText: 'Suggested answer for Q1(a).',
  markingSchemeText: 'Question 1(a)\nAward 1 or 2 marks depending on the explanation.',
});
assert.deepEqual(
  ambiguousStepMarksModelTest.sourceInventoryDiagnostics?.missingMarkQuestionIds,
  ['Q1(a)'],
  'Ambiguous ranges/alternatives are not converted into invented maximum marks.',
);


const inlineStepComponentModelTest = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  questionPaperText: 'Question 1(a) Explain the correct journal treatment.',
  suggestedAnswersText: 'Suggested answer for Q1(a).',
  markingSchemeText: `Question 1(a) 1 mark for correct account selection, 1 mark for correct debit/credit treatment, and 1 mark for narration.`,
});
assert.deepEqual(
  inlineStepComponentModelTest.subQuestions.map((question) => [question.fullQuestionCode, question.maximumMarks]),
  [['Q1(a)', 3]],
  'Inline scoring components on the same identity line must be summed, not mistaken for a one-mark total.',
);


const tableMarkingSchemeModelTest = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  officialPaperMaxMarks: 20,
  questionPaperText: `ADVANCED ACCOUNTING MODEL TEST PAPER 1
Question 1
(a) Pass journal entries.
(b) Prepare revised balance sheet.
Question 2
Calculate the required amount.`,
  suggestedAnswersText: `SUGGESTED ANSWERS
Question 1(a) - Journal entries.
Question 1(b) - Revised balance sheet.
Question 2 - Calculation.`,
  markingSchemeText: `MARKING SCHEME
Question No. | Particulars | Maximum Marks
1(a) | Correct account heads and treatment | 4
1(b) | Correct balance sheet presentation | 6
2 | Correct calculation | 10`,
});
assert.deepEqual(
  tableMarkingSchemeModelTest.subQuestions.map((question) => [question.fullQuestionCode, question.maximumMarks]),
  [['Q1(a)', 4], ['Q1(b)', 6], ['Q2', 10]],
  'Question/Maximum Marks tables must be parsed even when numeric cells do not repeat the word Marks.',
);
assert.deepEqual(tableMarkingSchemeModelTest.sourceInventoryDiagnostics?.missingMarkQuestionIds, []);
assert.deepEqual(tableMarkingSchemeModelTest.sourceInventoryDiagnostics?.markingSchemeOnlyQuestionIds, []);
const tableMarkingGate = validatePreEvaluationGate({
  paperStructure: tableMarkingSchemeModelTest,
  questionPaperText: 'Question Paper verified.',
  suggestedAnswersText: 'Suggested Answers verified.',
  markingSchemeText: 'Marking Scheme table verified.',
  officialPaperMaxMarks: 20,
});
assert.equal(tableMarkingGate.passed, true);

// Tab-separated PDF text extraction should preserve the same question-to-mark mapping.
const tabularMarkingSchemeModelTest = getAuthoritativePaperStructure({
  level: 'FINAL',
  subjectName: 'Financial Reporting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  questionPaperText: 'Question 1(a) Explain the treatment.\nQuestion 2 Calculate the amount.',
  suggestedAnswersText: 'Question 1(a) Answer.\nQuestion 2 Answer.',
  markingSchemeText: 'Question No.\tMarks\n1(a)\t3\n2\t7',
});
assert.deepEqual(
  tabularMarkingSchemeModelTest.subQuestions.map((question) => [question.fullQuestionCode, question.maximumMarks]),
  [['Q1(a)', 3], ['Q2', 7]],
);


const threeSourceQuestionInventoryModelTest = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  questionPaperText: `Question 1(a) Prepare journal entries.
Question 1(b) Prepare the revised balance sheet.
Question 2 Calculate the amount.`,
  suggestedAnswersText: `Question 1(a) Journal entries.
Question 1(b) Revised balance sheet.
Question 3 Missing from the selected QP.`,
  markingSchemeText: `Question No. | Marks
1(a) | 4
1(b) | 6
2 | 10`,
});
assert.deepEqual(
  threeSourceQuestionInventoryModelTest.sourceInventoryDiagnostics?.suggestedAnswerQuestionIds,
  ['Q1(a)', 'Q1(b)', 'Q3'],
);
assert.deepEqual(
  threeSourceQuestionInventoryModelTest.sourceInventoryDiagnostics?.suggestedAnswerMissingQuestionIds,
  ['Q2'],
);
assert.deepEqual(
  threeSourceQuestionInventoryModelTest.sourceInventoryDiagnostics?.suggestedAnswerOnlyQuestionIds,
  ['Q3'],
);
const threeSourceGate = validatePreEvaluationGate({
  paperStructure: threeSourceQuestionInventoryModelTest,
  questionPaperText: 'Question Paper verified.',
  suggestedAnswersText: 'Question-wise Suggested Answers are present but mismatched.',
  markingSchemeText: 'Marking Scheme verified.',
});
assert.equal(threeSourceGate.passed, false, 'Question-wise Suggested Answer IDs must reconcile when they are extractable.');
assert.ok(threeSourceGate.failedInvariants.some((message) => message.includes('MODEL_TEST_SUGGESTED_ANSWER_MISSING: Q2')));
assert.ok(threeSourceGate.failedInvariants.some((message) => message.includes('MODEL_TEST_SUGGESTED_ANSWER_SOURCE_CONFLICT: Q3')));


// Real PDF text extraction may place an objective question number on its own
// line and express nested numeric parts as either Q3(c(1)) or Q3(c(1)).
// All three selected sources must normalize those equivalent spellings to one ID.
const nestedAndStandaloneMcqModelTest = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  officialPaperMaxMarks: 14,
  questionPaperText: `MODEL TEST PAPER 1
MULTIPLE CHOICE QUESTIONS
1
Select the correct accounting treatment.
2
Choose the correct journal entry.
DESCRIPTIVE QUESTIONS
Question 3(c)(1) Explain the accounting treatment.
Question 5(a)(1) Prepare the required calculation.
Question 5(b)(2) State the correct treatment.`,
  suggestedAnswersText: `SUGGESTED ANSWERS
MULTIPLE CHOICE QUESTIONS
1. (b)
2. (c)
DESCRIPTIVE ANSWERS
Question 3(c(1)) Explanation of the accounting treatment.
Question 5(a)(1) Required calculation.
Question 5(b(2)) Correct treatment.`,
  markingSchemeText: `MARKING SCHEME
MULTIPLE CHOICE QUESTIONS
Question 1 - 1 Mark
Question 2 - 1 Mark
DESCRIPTIVE QUESTIONS
Question 3(c(1)) - 4 Marks
Question 5(a)(1) - 4 Marks
Question 5(b(2)) - 4 Marks`,
});
assert.deepEqual(
  nestedAndStandaloneMcqModelTest.sourceInventoryDiagnostics?.questionPaperQuestionIds,
  ['MCQ1', 'MCQ2', 'Q3(c(1))', 'Q5(a(1))', 'Q5(b(2))'],
  'Standalone MCQ question numbers and nested QP identities must be preserved.',
);
assert.deepEqual(
  nestedAndStandaloneMcqModelTest.sourceInventoryDiagnostics?.suggestedAnswerQuestionIds,
  ['MCQ1', 'MCQ2', 'Q3(c(1))', 'Q5(a(1))', 'Q5(b(2))'],
  'Equivalent nested spellings in the Suggested Answers must reconcile to the QP IDs.',
);
assert.deepEqual(
  nestedAndStandaloneMcqModelTest.sourceInventoryDiagnostics?.markingSchemeQuestionIds,
  ['MCQ1', 'MCQ2', 'Q3(c(1))', 'Q5(a(1))', 'Q5(b(2))'],
  'Nested Marking Scheme rows must map to the exact QP subparts.',
);
assert.deepEqual(
  nestedAndStandaloneMcqModelTest.subQuestions.map((question) => [question.fullQuestionCode, question.maximumMarks]),
  [['Q3(c(1))', 4], ['Q5(a(1))', 4], ['Q5(b(2))', 4]],
);
assert.deepEqual(nestedAndStandaloneMcqModelTest.sourceInventoryDiagnostics?.missingMarkQuestionIds, []);
assert.deepEqual(nestedAndStandaloneMcqModelTest.sourceInventoryDiagnostics?.missingMcqKeyQuestionIds, []);
assert.deepEqual(nestedAndStandaloneMcqModelTest.sourceInventoryDiagnostics?.markingSchemeOnlyQuestionIds, []);
assert.deepEqual(nestedAndStandaloneMcqModelTest.sourceInventoryDiagnostics?.suggestedAnswerMissingQuestionIds, []);
assert.deepEqual(nestedAndStandaloneMcqModelTest.sourceInventoryDiagnostics?.suggestedAnswerOnlyQuestionIds, []);
assert.deepEqual(
  nestedAndStandaloneMcqModelTest.mcqs.map((question) => [question.fullQuestionCode, question.maximumMarks, question.officialKey]),
  [['MCQ1', 1, 'B'], ['MCQ2', 1, 'C']],
);

console.log('Model Test dynamic paper structure tests passed.');
