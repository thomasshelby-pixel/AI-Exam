import assert from 'node:assert/strict';
import { getAuthoritativePaperStructure } from '../services/paperStructureService.js';
import { validatePreEvaluationGate } from '../services/evaluationIntegrityHardening.js';
import { buildCanonicalQuestionInventory } from '../services/canonicalQuestionInventoryService.js';

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
assert.equal(
  mixedNumberingGate.passed,
  true,
  'Three-source-consistent mixed numbering must pass preflight. ' + JSON.stringify({
    questionPaperIds: mixedNumberingObjectiveModelTest.sourceInventoryDiagnostics?.questionPaperQuestionIds,
    suggestedAnswerIds: mixedNumberingObjectiveModelTest.sourceInventoryDiagnostics?.suggestedAnswerQuestionIds,
    markingSchemeIds: mixedNumberingObjectiveModelTest.sourceInventoryDiagnostics?.markingSchemeQuestionIds,
    missingMarks: mixedNumberingObjectiveModelTest.sourceInventoryDiagnostics?.missingMarkQuestionIds,
    missingKeys: mixedNumberingObjectiveModelTest.sourceInventoryDiagnostics?.missingMcqKeyQuestionIds,
    markSchemeOnly: mixedNumberingObjectiveModelTest.sourceInventoryDiagnostics?.markingSchemeOnlyQuestionIds,
    parentMismatches: mixedNumberingObjectiveModelTest.sourceInventoryDiagnostics?.markingSchemeParentTotalMismatchQuestionIds,
    failedInvariants: mixedNumberingGate.failedInvariants,
  }),
);

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


// Source-derived regression using the uploaded Advanced Accounting Model Test 1
// document structure: Part I has three 4-MCQ case groups plus three standalone
// MCQs; Part II has printed subpart maxima and table labels that are not questions.
const uploadedAdvancedAccountingModelTest = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  officialPaperMaxMarks: 100,
  questionPaperText: `MODEL TEST PAPER 1
INTERMEDIATE COURSE: GROUP - I
PAPER – 1 : ADVANCED ACCOUNTING
Time Allowed – 3 Hours Maximum Marks – 100
PART I – Case Scenario based MCQs (30 Marks)
1. SEAS Ltd., the Company, is in the business of tours and travels.
       i. The company introduces a formal gratuity scheme.
       ii. The company considers a new pension scheme.
           i. What would be the basis of revenue recognition for SEAS Ltd.?
(a) Gross basis.
(b) Net basis.
(c) Depends on accounting policy.
(d) Indian GAAP allows a choice.
ii. Please suggest accounting treatment of forward contract.
(a) MTM will be recorded.
(b) Only loss will be recorded.
(c) No accounting will be done.
(d) Premium will be amortized.
iii. Advise the Company in respect of accounting requirements.
(a) Option A.
(b) Option B.
(c) Option C.
(d) Option D.
iv. Please comment regarding consolidation requirements.
(a) Option A.
(b) Option B.
(c) Option C.
(d) Option D.
Multiple Choice Questions [4 MCQs of 2 Marks each: Total 8 Marks]
2. On 1st April, 2022, Shubham Limited purchased some land for construction.
i. Which cost will be capitalized to the factory building?
(a) Legal cost.
(b) Relocation cost.
(c) Inauguration cost.
(d) Allocated overhead.
ii. What amount of employment cost will be capitalized?
(a) 2,90,000.
(b) 3,48,000.
(c) 2,32,000.
(d) 29,000.
iii. What is the net borrowing cost capitalized?
(a) 1,89,000.
(b) 1,68,000.
(c) 1,44,000.
(d) 1,64,000.
iv. What will be the carrying amount of the factory?
(a) 30,00,000.
(b) 57,78,125.
(c) 27,78,125.
(d) 58,00,000.
Multiple Choice Questions [4 MCQs of 2 Marks each: Total 8 Marks]
3. Kesar Ltd. has decided to initiate a share buy-back.
i. By using the Shares Outstanding Test determine the number.
(a) 1,25,000.
(b) 31,250.
(c) 25,000.
(d) 30,000.
ii. By using the Resources Test determine the number.
(a) 25,000.
(b) 31,250.
(c) 28,750.
(d) 39,062.
iii. By using the Debt Equity Ratio Test determine the number.
(a) 25,000.
(b) 31,250.
(c) 28,750.
(d) 39,062.
iv. On the basis of all three tests determine the maximum number.
(a) 25,000.
(b) 31,250.
(c) 28,750.
(d) 39,062.
Multiple Choice Questions [4 MCQs of 2 Marks each: Total 8 Marks]
4. All of the following costs are excluded while computing value of inventories except?
(a) Selling and Distribution costs.
(b) Allocated fixed production overheads.
(c) Abnormal wastage.
(d) Storage costs.
(2 Marks)
5. According to AS-18 Related Party Disclosures, which ONE is not a related party?
(a) A shareholder owning 30%.
(b) An entity providing banking facilities.
(c) An associate.
(d) Key management personnel. (2 Marks)
6. A process of reconstruction without liquidation is called
(a) Internal reconstruction.
(b) External reconstruction.
(c) Merger.
(d) Purchase. (2 Marks)

PART II – Descriptive Questions (70 Marks)
Question No.1 is compulsory. Answer any four questions from the remaining five.
1. (a) Innovative Garments Manufacturing Company Limited invested in shares.
How should the investments be shown under AS 13? (5 Marks)
     (b) Lessee Ltd. took a machine on lease. Calculate the machinery value and finance charges. (5 Marks)
     (c) X Ltd. purchased PPE four years ago. Explain the treatment of impairment loss. (4 Marks)
2. Following is the trial balance of Delta Limited. Prepare its Balance Sheet and Statement of Profit and Loss. (14 Marks)
3. (a) Y Ltd. used resources of X Ltd. State whether and how the revenue can be recognized. (4 Marks)
     (b) Following is the Balance Sheet of ABC Ltd. Pass journal entries and prepare Capital Reduction Account and Balance Sheet extract. (10 Marks)
4. The financial position of Hari Ltd. and Vayu Ltd. is given. Prepare acquisition entries and Balance Sheet after absorption. (14 Marks)
5. From the Balance Sheets and information given below, prepare Consolidated Balance Sheet of Virat Ltd. and Anushka Ltd. (14 Marks)
     Particulars
     I. Equity and Liabilities
     (1) Shareholders' Funds
          (a) Share Capital
          (b) Reserves and Surplus
     (2) Non-current Liabilities
     1. Share Capital
     2. Reserves and Surplus
     3. Non-current investments
     Assets and note rows are not separate question parts.
6. (a) What are the qualitative characteristics of financial statements? (4 Marks)
Or
What are the issues with which Accounting Standards deal? (4 Marks)
     (b) From the following information, calculate cash flow from operating activities. (4 Marks)
     (c) Following is the information of the Jammu branch.
     (i) Calculate the profit earned by the branch.
     (ii) Calculate branch stock reserve in respect of unrealized profit. (6 Marks)`,
  suggestedAnswersText: `ANSWERS OF MODEL TEST PAPER 1
INTERMEDIATE COURSE: GROUP - I
PAPER – 1 : ADVANCED ACCOUNTING
ANSWER
Division A (30 Marks)
1. (i) (a)
     (ii) (d)
     (iii) (c)
     (iv) (c)
2. (i) (a)
     (ii) (c)
     (iii) (d)
     (iv) (b)
3. (i) (b)
     (ii) (d)
     (iii) (c)
     (iv) (c)
4. (b)
5. (b)
6. (a)
Division B
1. (a) As per AS 13, investment shares are accounted for as current or long-term.
     (b) As per AS 19, the lessee recognizes an asset and liability.
     (c) As per AS 28, impairment loss is recognized in profit and loss.
2. Delta Limited
     1. Shareholders' funds
          (a) Share Capital
          (b) Reserves and Surplus
     2. Non-Current Liabilities
3. (a) As per AS 9, interest and royalties are recognized on the stated bases.
     (b) In the Books of ABC Ltd. Journal Entries and Capital Reduction Account.
4. In the Books of Hari Ltd. Journal Entries.
5. Consolidated Balance Sheet of Virat Ltd. and its Subsidiary Anushka Ltd.
6. (a) Qualitative characteristics of financial statements.
Or
What are the issues with which Accounting Standards deal?
     (b) Cash Flow Statement.
     (c) Calculation of profit earned by the branch and stock reserve.`,
  markingSchemeText: `MODEL TEST PAPER 1
CA INTERMEDIATE - GROUP I
SUBJECT: Advanced Accounting
MARKING SCHEME
DOCUMENT STATUS: DERIVED EVALUATION SCHEME

SOURCE BASIS AND LIMITATION
- Descriptive question/sub-question maxima below are taken from the Question Paper text where printed.
- The source bundle does not provide a separate official step-by-step marks breakup for every descriptive answer.

PAPER STRUCTURE
- Part I: compulsory case-scenario MCQs; 30 marks in total.
- MCQs are marked at 2 marks each as stated in the question-paper pattern; use the supplied answer key below.
- Part II: 70 marks in total.
- Question 1 is compulsory. Attempt any four questions from Questions 2 to 6.

PART I - MCQ ANSWER KEY
Transcribed from the corresponding Suggested Answer PDF:
1. (i) (a)
(ii) (d)
2. (i) (a)
(ii) (c)
PART II - DESCRIPTIVE MARK ALLOCATION
QUESTION 1 - MAXIMUM 14 MARKS
Question text opening: 1. (a) Innovative Garments Manufacturing Company Limited invested in the
- Printed allocation: (5 Marks) | Context: investments under AS 13 (5 Marks)
- Printed allocation: (5 Marks) | Context: finance charges in each year (5 Marks)
- Printed allocation: (4 Marks) | Context: impairment loss (4 Marks)
QUESTION 2 - MAXIMUM 14 MARKS
- Printed allocation: (14 Marks) | Context: trial balance and financial statements (14 Marks)
QUESTION 3 - MAXIMUM 14 MARKS
- Printed allocation: (4 Marks) | Context: revenues can be recognized by X Ltd. (4 Marks)
- Printed allocation: (10 Marks) | Context: Capital Reduction Account (10 Marks)
QUESTION 4 - MAXIMUM 14 MARKS
- Printed allocation: (14 Marks) | Context: Balance Sheet after absorption (14 Marks)
QUESTION 5 - MAXIMUM 14 MARKS
- Printed allocation: (14 Marks) | Context: Consolidated Balance Sheet (14 Marks)
QUESTION 6 - MAXIMUM 14 MARKS
- Printed allocation: (4 Marks) | Context: qualitative characteristics (4 Marks)
- Printed allocation: (4 Marks) | Context: issues with Accounting Standards (4 Marks)
- Printed allocation: (4 Marks) | Context: operating activities (4 Marks)
- Printed allocation: (6 Marks) | Context: branch stock reserve (6 Marks)`,
});
const qpIds = uploadedAdvancedAccountingModelTest.sourceInventoryDiagnostics!.questionPaperQuestionIds;
const saIds = uploadedAdvancedAccountingModelTest.sourceInventoryDiagnostics!.suggestedAnswerQuestionIds;
const sort = (a:string[]) => [...a].sort((x,y)=>x.localeCompare(y,undefined,{numeric:true}));
assert.deepEqual(sort(qpIds), sort([
  ...Array.from({length:15},(_,i)=>'MCQ'+(i+1)),
  'Q1(a)','Q1(b)','Q1(c)','Q2','Q3(a)','Q3(b)','Q4','Q5','Q6(a)','Q6(b)','Q6(c)'
]), 'The uploaded QP must map all 15 MCQs and exactly the printed descriptive leaves.');
assert.deepEqual(
  sort(saIds),
  sort(Array.from({length:15},(_,i)=>'MCQ'+(i+1))),
  'The uploaded ICAI-style Suggested Answers expose a verifiable Division A key; bare Division B table numbering is not treated as a complete question-ID inventory.',
);
assert.deepEqual(
  uploadedAdvancedAccountingModelTest.subQuestions.map(q=>[q.fullQuestionCode,q.maximumMarks]),
  [['Q1(a)',5],['Q1(b)',5],['Q1(c)',4],['Q2',14],['Q3(a)',4],['Q3(b)',10],['Q4',14],['Q5',14],['Q6(a)',4],['Q6(b)',4],['Q6(c)',6]],
  'Descriptive leaf maxima must be read from QP printed allocations, not invented from parent totals.',
);
assert.equal(uploadedAdvancedAccountingModelTest.mcqs.length,15);
assert.ok(uploadedAdvancedAccountingModelTest.mcqs.every(q=>q.maximumMarks===2));
assert.deepEqual(
  uploadedAdvancedAccountingModelTest.mcqs.map(q=>q.officialKey),
  ['A','D','C','C','A','C','D','B','B','D','C','C','B','B','A'],
  'MCQ keys must retain the exact supplied Suggested Answer order.',
);
assert.equal(uploadedAdvancedAccountingModelTest.subQuestions.find(q=>q.fullQuestionCode==='Q5')?.maximumMarks,14,
  'Financial-statement table labels (a), (b), (c) inside Q5 must not become false child questions.');
assert.deepEqual(uploadedAdvancedAccountingModelTest.sourceInventoryDiagnostics?.missingMarkQuestionIds,[]);
assert.deepEqual(uploadedAdvancedAccountingModelTest.sourceInventoryDiagnostics?.missingMcqKeyQuestionIds,[]);
assert.deepEqual(uploadedAdvancedAccountingModelTest.sourceInventoryDiagnostics?.markingSchemeOnlyQuestionIds,[]);
assert.deepEqual(uploadedAdvancedAccountingModelTest.sourceInventoryDiagnostics?.markingSchemeParentTotalMismatchQuestionIds,[]);
assert.deepEqual(uploadedAdvancedAccountingModelTest.sourceInventoryDiagnostics?.suggestedAnswerMissingQuestionIds,[]);
assert.deepEqual(uploadedAdvancedAccountingModelTest.sourceInventoryDiagnostics?.suggestedAnswerOnlyQuestionIds,[]);

assert.equal(uploadedAdvancedAccountingModelTest.questions.find(q=>q.questionNumber==='1')?.compulsory,true,
  'Question 1 must remain compulsory as stated in the selected Marking Scheme.');
assert.ok(uploadedAdvancedAccountingModelTest.subQuestions
  .filter(q=>q.questionNumber==='1')
  .every(q=>q.compulsory),
  'Every printed leaf under compulsory Question 1 must be marked required.');
assert.ok(uploadedAdvancedAccountingModelTest.subQuestions
  .filter(q=>['2','3','4','5','6'].includes(q.questionNumber))
  .every(q=>!q.compulsory),
  'Questions 2–6 must remain optional because the source says attempt any four.');
assert.equal(
  uploadedAdvancedAccountingModelTest.questions.find(q=>q.questionNumber==='2')?.choiceRule,
  'Attempt any four of Questions 2 to 6',
  'The source attempt-selection rule must remain attached to the optional question group.',
);
const uploadedInventory = buildCanonicalQuestionInventory({
  paperStructure: uploadedAdvancedAccountingModelTest,
  totalPaperMaxMarks: 100,
});
assert.ok(uploadedInventory.items
  .filter(item=>item.questionId.startsWith('MCQ'))
  .every(item=>item.isRequiredOrOptional==='REQUIRED'));
assert.equal(uploadedInventory.items.find(item=>item.questionId==='Q1(a)')?.isRequiredOrOptional,'REQUIRED');
assert.equal(uploadedInventory.items.find(item=>item.questionId==='Q2')?.isRequiredOrOptional,'OPTIONAL');

const uploadedGate = validatePreEvaluationGate({
  paperStructure: uploadedAdvancedAccountingModelTest,
  questionPaperText: 'Question Paper content is present and verified.',
  suggestedAnswersText: 'Suggested Answers content is present and verified.',
  markingSchemeText: 'Derived evaluation scheme is present and verified.',
  officialPaperMaxMarks: 100,
});
assert.equal(uploadedGate.passed,true,'Uploaded Advanced Accounting source inventory must reconcile before evaluation.');

const withinChoiceLimitGate = validatePreEvaluationGate({
  paperStructure: uploadedAdvancedAccountingModelTest,
  questionPaperText: 'Question Paper content is present and verified.',
  suggestedAnswersText: 'Suggested Answers content is present and verified.',
  markingSchemeText: 'Derived evaluation scheme is present and verified.',
  coverageMap: {
    attemptedQuestions: [
      { fullQuestionCode: 'Q2', questionNumber: '2' },
      { fullQuestionCode: 'Q3(a)', questionNumber: '3' },
      { fullQuestionCode: 'Q4', questionNumber: '4' },
      { fullQuestionCode: 'Q5', questionNumber: '5' },
    ],
    unclearPages: [],
    unmappedPages: [],
  } as any,
});
assert.equal(withinChoiceLimitGate.passed,true,
  'Four distinct optional parent questions must satisfy the source attempt limit.');

const overChoiceLimitGate = validatePreEvaluationGate({
  paperStructure: uploadedAdvancedAccountingModelTest,
  questionPaperText: 'Question Paper content is present and verified.',
  suggestedAnswersText: 'Suggested Answers content is present and verified.',
  markingSchemeText: 'Derived evaluation scheme is present and verified.',
  coverageMap: {
    attemptedQuestions: [
      { fullQuestionCode: 'Q2', questionNumber: '2' },
      { fullQuestionCode: 'Q3(a)', questionNumber: '3' },
      { fullQuestionCode: 'Q4', questionNumber: '4' },
      { fullQuestionCode: 'Q5', questionNumber: '5' },
      { fullQuestionCode: 'Q6(a)', questionNumber: '6' },
    ],
    unclearPages: [],
    unmappedPages: [],
  } as any,
});
assert.equal(overChoiceLimitGate.passed,false,
  'Attempting all five optional parent questions must require manual selection rather than silently score all five.');
assert.ok(overChoiceLimitGate.failedInvariants.some(message =>
  message.includes('MODEL_TEST_OPTIONAL_ATTEMPT_LIMIT_EXCEEDED')
));



 // Objective numbering does not always start at 1. Preserve the exact printed
 // identities when a PDF extracts a standalone MCQ sequence beginning at 9.
 const objectiveSequenceStartingAboveOne = getAuthoritativePaperStructure({
   level: 'INTERMEDIATE',
   subjectName: 'Advanced Accounting',
   paper: 'Paper 1',
   materialType: 'MODEL_TEST_PAPER',
   officialPaperMaxMarks: 20,
   questionPaperText: "MODEL TEST PAPER\nPART I - Multiple Choice Questions (4 Marks)\n9\nSelect the correct accounting treatment.\n10\nChoose the correct journal entry.\n11\nIdentify the correct accounting principle.\n12\nSelect the correct valuation method.\nPART II - Descriptive Questions (16 Marks)\nQuestion 1 - Prepare the required financial statement. (16 Marks)",
   suggestedAnswersText: "SUGGESTED ANSWERS\nMULTIPLE CHOICE QUESTIONS\n9. (a)\n10. (b)\n11. (c)\n12. (d)\nDESCRIPTIVE ANSWERS\nQuestion 1 - Full solution.",
   markingSchemeText: "MARKING SCHEME\nMULTIPLE CHOICE QUESTIONS\nMCQs are marked at 1 Mark each.\nQuestion 9 - 1 Mark\nQuestion 10 - 1 Mark\nQuestion 11 - 1 Mark\nQuestion 12 - 1 Mark\nDESCRIPTIVE QUESTIONS\nQuestion 1 - 16 Marks",
 });
 assert.deepEqual(
   objectiveSequenceStartingAboveOne.sourceInventoryDiagnostics?.questionPaperQuestionIds,
   ['Q1', 'MCQ9', 'MCQ10', 'MCQ11', 'MCQ12'],
   'A standalone MCQ sequence beginning at 9 must retain MCQ9–MCQ12 rather than disappear or be renumbered.',
 );
 assert.deepEqual(
   objectiveSequenceStartingAboveOne.mcqs.map(q => [q.fullQuestionCode,q.maximumMarks,q.officialKey]),
   [['MCQ9',1,'A'],['MCQ10',1,'B'],['MCQ11',1,'C'],['MCQ12',1,'D']],
 );
 assert.deepEqual(objectiveSequenceStartingAboveOne.sourceInventoryDiagnostics?.missingMarkQuestionIds,[]);
 assert.deepEqual(objectiveSequenceStartingAboveOne.sourceInventoryDiagnostics?.missingMcqKeyQuestionIds,[]);
 assert.deepEqual(objectiveSequenceStartingAboveOne.sourceInventoryDiagnostics?.markingSchemeOnlyQuestionIds,[]);
 assert.deepEqual(objectiveSequenceStartingAboveOne.sourceInventoryDiagnostics?.markingSchemeParentTotalMismatchQuestionIds,[]);



// A list of merger terms is factual input to a single parent question, not
// four independently scored child questions. The final 14-mark instruction
// must remain attached to Q4 rather than being mistaken for Q4(d).
let modelTestCourseSubjectCases = 0;
for (const [level, courseSubjects] of Object.entries(levelSubjectMatrix)) {
for (const subjectName of courseSubjects) {
modelTestCourseSubjectCases++;
const instructionClauseParentTotalModelTest = getAuthoritativePaperStructure({
  level,
  subjectName,
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  officialPaperMaxMarks: 14,
  questionPaperText: [
    'MODEL TEST PAPER 1',
    'PART II - DESCRIPTIVE QUESTIONS',
    '1. First descriptive question. (14 Marks)',
    '2. Second descriptive question. (14 Marks)',
    '3. Third descriptive question. (14 Marks)',
    '4. The financial position of two companies Hari Ltd. and Vayu Ltd. as at 31st March, 2023 was as under.',
    'Hari Ltd. absorbs Vayu Ltd. on the following terms:',
    '(a) 10% Preference Shareholders are to be paid at 10% premium by issue of 9% Preference Shares of Hari Ltd.',
    '(b) Goodwill of Vayu Ltd. is valued at Rs. 50,000, Buildings are valued at Rs. 1,50,000 and the Machinery at Rs. 1,60,000.',
    '(c) Inventory to be taken over at 10% less value and Provision for Doubtful Debts to be created @ 7.5%.',
    '(d) Equity Shareholders of Vayu Ltd. will be issued necessary Equity Shares @ 5% premium.',
    'Prepare necessary acquisition entries in the books of Hari Ltd. Also draft the Balance Sheet after absorption as at 31st March, 2023. (14 Marks)',
  ].join('\n'),
  suggestedAnswersText: 'ANSWERS OF MODEL TEST PAPER 1\nDivision B\nDetailed narrative answers are provided for the descriptive section.',
  markingSchemeText: 'MODEL TEST PAPER 1 MARKING SCHEME\nPART II - DESCRIPTIVE MARK ALLOCATION\nQUESTION 1 - MAXIMUM 14 MARKS\nQUESTION 2 - MAXIMUM 14 MARKS\nQUESTION 3 - MAXIMUM 14 MARKS\nQUESTION 4 - MAXIMUM 14 MARKS',
});
assert.deepEqual(
  instructionClauseParentTotalModelTest.subQuestions.map((question) => [question.fullQuestionCode, question.maximumMarks]),
  [['Q1', 14], ['Q2', 14], ['Q3', 14], ['Q4', 14]],
  'Unmarked alphabetic terms must not become child questions or steal the parent-level 14-mark allocation.',
);
assert.deepEqual(
  instructionClauseParentTotalModelTest.sourceInventoryDiagnostics?.questionPaperQuestionIds,
  ['Q1', 'Q2', 'Q3', 'Q4'],
);
assert.deepEqual(
  instructionClauseParentTotalModelTest.sourceInventoryDiagnostics?.markingSchemeQuestionIds,
  ['Q1', 'Q2', 'Q3', 'Q4'],
);
assert.deepEqual(instructionClauseParentTotalModelTest.sourceInventoryDiagnostics?.missingMarkQuestionIds, []);
assert.deepEqual(instructionClauseParentTotalModelTest.sourceInventoryDiagnostics?.markingSchemeParentTotalMismatchQuestionIds, []);
const instructionClauseParentTotalGate = validatePreEvaluationGate({
  paperStructure: instructionClauseParentTotalModelTest,
  questionPaperText: 'Question Paper content is present and verified.',
  suggestedAnswersText: 'Suggested Answer content is present and verified.',
  markingSchemeText: 'Marking Scheme content is present and verified.',
  officialPaperMaxMarks: 14,
});
assert.equal(
  instructionClauseParentTotalGate.passed,
  true,
  'A parent-level instruction list with a verified parent maximum must pass the source preflight.',
);

// If the lettered items are themselves tasks, retain them as separate IDs and
// keep the evaluation blocked when the supplied scheme has no child maxima.
const explicitTaskChildrenModelTest = getAuthoritativePaperStructure({
  level,
  subjectName,
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  officialPaperMaxMarks: 14,
  questionPaperText: [
    'MODEL TEST PAPER 1',
    'PART II - DESCRIPTIVE QUESTIONS',
    '1. First descriptive question. (14 Marks)',
    '2. Second descriptive question. (14 Marks)',
    '3. Third descriptive question. (14 Marks)',
    '4. Question 4 concerns the following acquisition.',
    'The company is acquired under the following terms:',
    '(a) Calculate goodwill using the values supplied.',
    '(b) Prepare the acquisition journal entries.',
    'You are required to present both results. (14 Marks)',
  ].join('\n'),
  suggestedAnswersText: 'ANSWERS OF MODEL TEST PAPER 1\nDivision B\nDetailed narrative answers are provided for the descriptive section.',
  markingSchemeText: 'MODEL TEST PAPER 1 MARKING SCHEME\nPART II - DESCRIPTIVE MARK ALLOCATION\nQUESTION 1 - MAXIMUM 14 MARKS\nQUESTION 2 - MAXIMUM 14 MARKS\nQUESTION 3 - MAXIMUM 14 MARKS\nQUESTION 4 - MAXIMUM 14 MARKS',
});
assert.deepEqual(
  explicitTaskChildrenModelTest.sourceInventoryDiagnostics?.questionPaperQuestionIds,
  ['Q1', 'Q2', 'Q3', 'Q4(a)', 'Q4(b)'],
  'Lettered tasks must remain separate question IDs even when they follow a terms lead-in.',
);
assert.ok(explicitTaskChildrenModelTest.sourceInventoryDiagnostics?.missingMarkQuestionIds.includes('Q4(a)'));
assert.ok(explicitTaskChildrenModelTest.sourceInventoryDiagnostics?.markingSchemeParentTotalMismatchQuestionIds.includes('Q4'));
const explicitTaskChildrenGate = validatePreEvaluationGate({
  paperStructure: explicitTaskChildrenModelTest,
  questionPaperText: 'Question Paper content is present and verified.',
  suggestedAnswersText: 'Suggested Answer content is present and verified.',
  markingSchemeText: 'Marking Scheme content is present and verified.',
  officialPaperMaxMarks: 14,
});
assert.equal(
  explicitTaskChildrenGate.passed,
  false,
  'A parent total must not silently cover lettered tasks with no child-specific maximum marks.',
);
}
}
assert.equal(modelTestCourseSubjectCases, 18,
  'The common Model Test parser contract must run for every Foundation, Intermediate and Final subject.');

console.log('Model Test dynamic paper structure tests passed.');


// Integration regression grounded in the uploaded Model_Test_Paper_01
// Question Paper, Suggested Answer and Derived Evaluation Scheme extracts.
// The long accounting tables are shortened here; all question IDs, mark-bearing
// lines, terms/conditions, OR structure and Division A answer-key rows are kept.
const actualAdvancedAccountingModel1SourceFixture = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  officialPaperMaxMarks: 100,
  questionPaperText: [
    'MODEL TEST PAPER 1',
    'INTERMEDIATE COURSE: GROUP - I',
    'PAPER 1: ADVANCED ACCOUNTING',
    'PART I - Case Scenario based MCQs (30 Marks)',
    'Part I is compulsory.',
    '1. SEAS Ltd., the Company, is in the business of tours and travels.',
    'i. What would be the basis of revenue recognition for SEAS Ltd. as per the requirements of Accounting Standards?',
    '(a) Gross basis.',
    '(b) Net basis.',
    '(c) Depends on the accounting policy of the Company.',
    '(d) Indian GAAP allows a choice to the Company to recognize revenue on gross basis or net basis.',
    'ii. Please suggest accounting treatment of forward contract for the year ended 31 March 2024 as per Accounting Standard 11.',
    '(a) MTM of contract will be recorded on 31 March 2024.',
    '(b) MTM will be computed as at 31 March 2024 and only if there is loss, it will be recorded.',
    '(c) No accounting will be done during the year ended 31 March 2024.',
    '(d) Premium on contract will be amortized over the life of the contract.',
    'iii. You are requested to advise the Company in respect of the accounting requirements of above schemes related to employee benefits.',
    '(a) 1 - Change in accounting policy. 2 - Change in accounting policy.',
    '(b) 1 - Not a change in accounting policy. 2 - Change in accounting policy.',
    '(c) 1 - Not a change in accounting policy. 2 - Not a change in accounting policy.',
    '(d) 1 - Change in accounting policy. 2 - Not a change in accounting policy.',
    'iv. Please comment regarding consolidation requirements for SEAS Ltd. and ADI Ltd.',
    '(a) ADI Ltd. would use equity method for 23% in ASOC Ltd.; SEAS Ltd. would separately account for 9% as per AS 13.',
    '(b) ADI Ltd. would account for 23% in ASOC Ltd. as per AS 13.',
    '(c) ADI Ltd. would account for 23% share in ASOC Ltd. using equity method.',
    '(d) SEAS Ltd. would consolidate ADI Ltd. and use equity method for the 23% and separately account for 9%.',
    'Multiple Choice Questions [4 MCQs of 2 Marks each: Total 8 Marks]',
    '2. On 1st April, 2022, Shubham Limited purchased some land for the purpose of constructing a new factory.',
    'i. Which of the following cost incurred directly on construction will be capitalized to the cost of factory building?',
    '(a) Legal cost.',
    '(b) Costs of relocating employees.',
    '(c) Costs of inauguration ceremony.',
    '(d) Allocated general overhead cost.',
    'ii. What amount of employment cost of construction workers will be capitalized to the cost of factory building?',
    '(a) ₹ 2,90,000',
    '(b) ₹ 3,48,000',
    '(c) ₹ 2,32,000',
    '(d) ₹ 29,000',
    'iii. What is the amount of net borrowing cost capitalized to the cost of the factory?',
    '(a) ₹ 1,89,000',
    '(b) ₹ 1,68,000',
    '(c) ₹ 1,44,000',
    '(d) ₹ 1,64,000',
    'iv. What will be the carrying amount of the factory in the Balance Sheet as at 31st March, 2023?',
    '(a) ₹ 30,00,000',
    '(b) ₹ 57,78,125',
    '(c) ₹ 27,78,125',
    '(d) ₹ 58,00,000',
    'Multiple Choice Questions [4 MCQs of 2 Marks each: Total 8 Marks]',
    '3. Kesar Ltd., a company engaged in various business activities, has decided to initiate a share buy-back.',
    'i. By using the Shares Outstanding Test the number of shares that can be bought back.',
    '(a) 1,25,000',
    '(b) 31,250',
    '(c) 25,000',
    '(d) 30,000',
    'ii. By using the Resources Test determine the number of shares that can be bought back.',
    '(a) 25,000',
    '(b) 31,250',
    '(c) 28,750',
    '(d) 39,062',
    'iii. By using the Debt Equity Ratio Test determine the number of shares that can be bought back.',
    '(a) 25,000',
    '(b) 31,250',
    '(c) 28,750',
    '(d) 39,062',
    'iv. On the basis of all three tests determine Maximum number of shares that can be bought back.',
    '(a) 25,000',
    '(b) 31,250',
    '(c) 28,750',
    '(d) 39,062',
    'Multiple Choice Questions [4 MCQs of 2 Marks each: Total 8 Marks]',
    '4. All of the following costs are excluded while computing value of inventories except?',
    '(a) Selling and Distribution costs',
    '(b) Allocated fixed production overheads based on normal capacity.',
    '(c) Abnormal wastage',
    '(d) Storage costs which is necessary part of the production process',
    '(2 Marks)',
    '5. According to AS-18 Related Party Disclosures, which ONE of the following is not a related party of Skyline Limited?',
    '(a) A shareholder of Skyline Limited owning 30% of the ordinary share capital',
    '(b) An entity providing banking facilities in the normal course of business',
    '(c) An associate of Skyline Limited',
    '(d) Key management personnel of Skyline Limited',
    '(2 Marks)',
    '6. A process of reconstruction, which is carried out without liquidating the company and forming a new one is called',
    '(a) Internal reconstruction.',
    '(b) External reconstruction.',
    '(c) Amalgamation in the nature of merger.',
    '(d) Amalgamation in the nature of purchase.',
    '(2 Marks)',
    'PART II - Descriptive Questions (70 Marks)',
    'Question No.1 is compulsory.',
    'Answer any four questions from the remaining five questions.',
    '1. (a) Innovative Garments Manufacturing Company Limited invested in the shares of another company on 1st October, 2022 at a cost of ₹ 2,50,000.',
    'How above investments will be shown in the books of accounts as per Accounting Standard 13? (5 Marks)',
    '(b) Lessee Ltd. took a machine on lease from Lessor Ltd., the fair value being ₹ 7,00,000.',
    'Calculate the value of machinery to be considered by Lessee Ltd. and the finance charges in each year. (5 Marks)',
    '(c) X Ltd. purchased a Property, Plant and Equipment four years ago for ₹ 150 lakhs and depreciates it at 10% p.a. on straight line method.',
    'What will be the treatment in respect of impairment loss? (4 Marks)',
    '2. Following is the trial balance of Delta limited as on 31.3.2023.',
    'You are required to prepare Delta Limited balance sheet and statement of profit and loss as per Schedule III. (14 Marks)',
    '3. (a) Y Ltd., used certain resources of X Ltd. In return X Ltd. received ₹ 10 lakhs and ₹ 15 lakhs as interest and royalties.',
    'You are required to state whether and on what basis these revenues can be recognized by X Ltd. (4 Marks)',
    '(b) Following is the Balance Sheet of ABC Ltd. The following scheme of reconstruction was finalized.',
    'Pass necessary Journal Entries in the books of the company. Prepare Capital Reduction account and Balance Sheet extract after internal reconstruction. (10 Marks)',
    '4. The financial position of two companies Hari Ltd. and Vayu Ltd. as at 31st March, 2023 was as under:',
    'Hari Ltd. absorbs Vayu Ltd. on the following terms:',
    '(a) 10% Preference Shareholders are to be paid at 10% premium by issue of 9% Preference Shares of Hari Ltd.',
    '(b) Goodwill of Vayu Ltd. is valued at ₹ 50,000, Buildings are valued at ₹ 1,50,000 and the Machinery at ₹ 1,60,000.',
    '(c) Inventory to be taken over at 10% less value and Provision for Doubtful Debts to be created @ 7.5%.',
    '(d) Equity Shareholders of Vayu Ltd. will be issued necessary Equity Shares @ 5% premium.',
    'Prepare necessary the acquisition entries in the books of Hari Ltd. Also draft the Balance Sheet after absorption as at 31st March, 2023. (14 Marks)',
    '5. From the Balance Sheets and information given below, prepare Consolidated Balance Sheet of Virat Ltd. and Anushka Ltd.',
    '(14 Marks)',
    '6. (a) What are the qualitative characteristics of the financial statements which improve the usefulness of the information furnished therein? (4 Marks)',
    'Or',
    'What are the issues, with which Accounting Standards deal? (4 Marks)',
    '(b) From the following information, calculate cash flow from operating activities:',
    '(4 Marks)',
    '(c) Following is the information of the Jammu branch of Best New Delhi for the year ending 31st March, 2023.',
    '(1) Goods are invoiced to the branch at cost plus 20%.',
    '(2) The sale price is cost plus 50%.',
    '(3) Other information:',
    'Ascertain',
    '(i) the profit earned by the branch during the year.',
    '(ii) branch stock reserve in respect of unrealized profit.',
    '(6 Marks)',
  ].join('\n'),
  suggestedAnswersText: [
    'ANSWERS OF MODEL TEST PAPER 1',
    'INTERMEDIATE COURSE: GROUP - I',
    'PAPER 1: ADVANCED ACCOUNTING',
    'ANSWER',
    'Division A (30 Marks)',
    '1. (i) (a)',
    '     (ii) (d)',
    '     (iii) (c)',
    '     (iv) (c)',
    '2. (i) (a)',
    '     (ii) (c)',
    '     (iii) (d)',
    '     (iv) (b)',
    '3. (i) (b)',
    '     (ii) (d)',
    '     (iii) (c)',
    '     (iv) (c)',
    '4. (b)',
    '5. (b)',
    '6. (a)',
    'Division B',
    '1. (a) As per AS 13 (Revised), investments in shares acquired for short-term holding are current investments.',
  ].join('\n'),
  markingSchemeText: [
    'MODEL TEST PAPER 1',
    'CA INTERMEDIATE - GROUP I',
    'SUBJECT: Advanced Accounting',
    'MARKING SCHEME',
    'DOCUMENT STATUS: DERIVED EVALUATION SCHEME',
    'SOURCE BASIS AND LIMITATION',
    'Descriptive question/sub-question maxima are taken from the Question Paper text where printed.',
    'PAPER STRUCTURE',
    'Part I: compulsory case-scenario MCQs; 30 marks in total.',
    'MCQs are marked at 2 marks each as stated in the question-paper pattern; use the supplied answer key below.',
    'Part II: 70 marks in total.',
    'Question 1 is compulsory. Attempt any four questions from Questions 2 to 6.',
    'PART II - DESCRIPTIVE MARK ALLOCATION',
    'Question 1 is compulsory; choose any four of Questions 2-6. Maximum 14 marks per attempted question.',
    'QUESTION 1 - MAXIMUM 14 MARKS',
    'QUESTION 2 - MAXIMUM 14 MARKS',
    'QUESTION 3 - MAXIMUM 14 MARKS',
    'QUESTION 4 - MAXIMUM 14 MARKS',
    'QUESTION 5 - MAXIMUM 14 MARKS',
    'QUESTION 6 - MAXIMUM 14 MARKS',
    'DERIVED DESCRIPTIVE RUBRIC - ADVANCED ACCOUNTING',
    'The question-paper sub-part marks are maxima; never exceed the printed marks.',
    'Mark any OR alternatives only once, as attempted by the student.',
    'This is a derived internal evaluation rubric, not a separately issued ICAI marking scheme.',
  ].join('\n'),
});
const actualDescriptiveInventory = actualAdvancedAccountingModel1SourceFixture.subQuestions
  .filter((question) => !question.isMcq)
  .map((question) => [question.fullQuestionCode, question.maximumMarks]);
assert.deepEqual(
  actualDescriptiveInventory,
  [
    ['Q1(a)', 5],
    ['Q1(b)', 5],
    ['Q1(c)', 4],
    ['Q2', 14],
    ['Q3(a)', 4],
    ['Q3(b)', 10],
    ['Q4', 14],
    ['Q5', 14],
    ['Q6(a)', 4],
    ['Q6(b)', 4],
    ['Q6(c)', 6],
  ],
  'Uploaded Advanced Accounting Model Test 1 must retain its actual descriptive leaves and printed maxima.',
);
assert.equal(actualAdvancedAccountingModel1SourceFixture.mcqs.length, 15,
  'Uploaded Model Test 1 has 15 objective questions, including 12 case-scenario MCQs and 3 standalone MCQs.');
assert.deepEqual(
  actualAdvancedAccountingModel1SourceFixture.mcqs.map((question) => question.officialKey),
  ['A', 'D', 'C', 'C', 'A', 'C', 'D', 'B', 'B', 'D', 'C', 'C', 'B', 'B', 'A'],
  'The 15 MCQ keys must be read sequentially from the selected Suggested Answers source.',
);
assert.ok(actualAdvancedAccountingModel1SourceFixture.mcqs.every((question) => question.maximumMarks === 2));
assert.deepEqual(actualAdvancedAccountingModel1SourceFixture.sourceInventoryDiagnostics?.missingMarkQuestionIds, []);
assert.deepEqual(actualAdvancedAccountingModel1SourceFixture.sourceInventoryDiagnostics?.missingMcqKeyQuestionIds, []);
assert.deepEqual(actualAdvancedAccountingModel1SourceFixture.sourceInventoryDiagnostics?.markingSchemeOnlyQuestionIds, []);
assert.deepEqual(actualAdvancedAccountingModel1SourceFixture.sourceInventoryDiagnostics?.markingSchemeParentTotalMismatchQuestionIds, []);
assert.equal(actualAdvancedAccountingModel1SourceFixture.subQuestions.find((question) => question.fullQuestionCode === 'Q1(a)')?.compulsory, true);
assert.equal(actualAdvancedAccountingModel1SourceFixture.questions.find((question) => question.questionNumber === '2')?.choiceRule,
  'Attempt any four of Questions 2 to 6');
assert.equal(actualAdvancedAccountingModel1SourceFixture.questions.find((question) => question.questionNumber === '6')?.maximumMarks, 14);
const actualAdvancedAccountingPreflight = validatePreEvaluationGate({
  paperStructure: actualAdvancedAccountingModel1SourceFixture,
  questionPaperText: 'Selected Question Paper source is present.',
  suggestedAnswersText: 'Selected Suggested Answers source is present.',
  markingSchemeText: 'Selected Derived Evaluation Scheme source is present.',
  officialPaperMaxMarks: 100,
});
assert.equal(actualAdvancedAccountingPreflight.passed, true,
  'The selected Advanced Accounting Model Test 1 source bundle must pass deterministic pre-evaluation reconciliation.');

