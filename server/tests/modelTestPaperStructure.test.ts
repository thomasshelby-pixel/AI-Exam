import assert from 'node:assert/strict';
import { getAuthoritativePaperStructure } from '../services/paperStructureService.js';
import { validatePreEvaluationGate } from '../services/evaluationIntegrityHardening.js';
import { buildCanonicalQuestionInventory } from '../services/canonicalQuestionInventoryService.js';

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

const sourceBundle = {
  questionPaperText: [
    'CA MODEL TEST PAPER 1',
    'QUESTION PAPER',
    'PART I - MULTIPLE CHOICE QUESTIONS',
    '1. Select the correct accounting treatment.',
    '2. Select the correct provision.',
    'PART II - DESCRIPTIVE QUESTIONS',
    'Question 1(a) - 5 Marks',
    'Pass the required journal entry.',
    'Question 1(b) - 5 Marks',
    'Prepare the revised balance sheet.',
    'Question 2 - 14 Marks',
    'Prepare the statement of profit and loss.',
    'Question 3(a) - 4 Marks',
    'Calculate goodwill.',
    'Question 3(b) - 10 Marks',
    'Prepare the capital accounts.',
  ].join('\n'),
  suggestedAnswersText: [
    'MODEL TEST PAPER 1 SUGGESTED ANSWERS',
    'Division A',
    '1. (b)',
    '2. (c)',
    'Division B',
    'Answers to descriptive questions are provided question-wise.',
  ].join('\n'),
  markingSchemeText: [
    'MODEL TEST PAPER 1 MARKING SCHEME',
    'Question 1(a) - 5 Marks',
    'Question 1(b) - 5 Marks',
    'Question 2 - 14 Marks',
    'Question 3(a) - 4 Marks',
    'Question 3(b) - 10 Marks',
  ].join('\n'),
  officialPaperMaxMarks: 40,
};

const materialTypes = ['PYQ', 'MTP', 'MODEL_TEST_PAPER'] as const;
let subjectCases = 0;

for (const [level, subjects] of Object.entries(levelSubjectMatrix)) {
  for (const subjectName of subjects) {
    subjectCases++;
    const structures = Object.fromEntries(materialTypes.map((materialType) => [
      materialType,
      getAuthoritativePaperStructure({
        ...sourceBundle,
        level,
        subjectName,
        paper: subjectName,
        materialType,
      }),
    ])) as Record<(typeof materialTypes)[number], ReturnType<typeof getAuthoritativePaperStructure>>;

    // Model Test must use the exact existing subject-aware PYQ/MTP parser.
    // No Model-Test-only question IDs, marks parser, or paper template is allowed.
    assert.deepEqual(
      structures.MODEL_TEST_PAPER,
      structures.MTP,
      `${level} / ${subjectName}: Model Test must produce the same paper structure as MTP.`,
    );
    assert.deepEqual(
      structures.MODEL_TEST_PAPER,
      structures.PYQ,
      `${level} / ${subjectName}: Model Test must produce the same paper structure as PYQ.`,
    );

    const modelInventory = buildCanonicalQuestionInventory({
      paperStructure: structures.MODEL_TEST_PAPER,
      questionPaperText: sourceBundle.questionPaperText,
      markingSchemeText: sourceBundle.markingSchemeText,
      totalPaperMaxMarks: sourceBundle.officialPaperMaxMarks,
    });
    const mtpInventory = buildCanonicalQuestionInventory({
      paperStructure: structures.MTP,
      questionPaperText: sourceBundle.questionPaperText,
      markingSchemeText: sourceBundle.markingSchemeText,
      totalPaperMaxMarks: sourceBundle.officialPaperMaxMarks,
    });
    assert.deepEqual(
      modelInventory,
      mtpInventory,
      `${level} / ${subjectName}: Model Test must build the same canonical inventory as MTP.`,
    );
  }
}

assert.equal(subjectCases, 18,
  'The shared PYQ/MTP parser contract must be exercised for all Foundation, Intermediate and Final subjects.');

// Preserve the existing Taxation configuration: Model Test must follow the same
// configured Taxation route as PYQ/MTP rather than a new dynamic Model Test parser.
const taxation = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Taxation',
  paper: 'Taxation',
  materialType: 'MODEL_TEST_PAPER',
  ...sourceBundle,
});
const taxationMtp = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Taxation',
  paper: 'Taxation',
  materialType: 'MTP',
  ...sourceBundle,
});
assert.deepEqual(taxation, taxationMtp);
assert.equal(taxation.mcqs.length, 16,
  'Existing configured Taxation MCQ structure must remain unchanged.');

// A Model Test with unparseable source text follows the same parser, but must not
// inherit the generic PYQ/MTP guessed Q1-Q6 fallback with invented maxima.
const unparseableModelTest = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  questionPaperText: 'Question paper text without numbered questions or explicit marks.',
  suggestedAnswersText: 'Suggested answers are present but question-wise identities are unreadable.',
  markingSchemeText: 'Marking scheme is present but allocations are unreadable.',
  officialPaperMaxMarks: 100,
});
assert.equal(unparseableModelTest.subQuestions.length, 0);
assert.equal(unparseableModelTest.mcqs.length, 0);
const unparseableGate = validatePreEvaluationGate({
  paperStructure: unparseableModelTest,
  questionPaperText: 'Question paper text without numbered questions.',
  suggestedAnswersText: 'Suggested answers are present.',
  markingSchemeText: 'Marking scheme is present.',
});
assert.equal(unparseableGate.passed, false);
assert.ok(unparseableGate.failedInvariants.some((message) => message.includes('QUESTION_PAPER_NOT_PARSED')));

console.log('Model Test shared PYQ/MTP parser contract tests passed.');
