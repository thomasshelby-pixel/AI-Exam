import assert from 'node:assert/strict';
import {
  extractOptionalAttemptSelectionRule,
  getAuthoritativePaperStructure,
} from '../services/paperStructureService.js';
import { validatePreEvaluationGate } from '../services/evaluationIntegrityHardening.js';

const remainingFiveSource = [
  'MODEL TEST PAPER 1 - ADVANCED ACCOUNTING',
  'Question No. 1 is compulsory. Answer any four questions from the remaining five.',
  'Question 1 - 20 Marks',
  'Question 2 - 16 Marks',
  'Question 3 - 16 Marks',
  'Question 4 - 16 Marks',
  'Question 5 - 16 Marks',
  'Question 6 - 16 Marks',
].join('\n');

const remainingFive = extractOptionalAttemptSelectionRule(
  remainingFiveSource,
  '',
  ['1', '2', '3', '4', '5', '6'],
);
assert.deepEqual(remainingFive, {
  allowedCount: 4,
  questionNumbers: ['2', '3', '4', '5', '6'],
  choiceRule: 'Attempt any 4 of Q2, Q3, Q4, Q5, Q6',
});

const paperStructure = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  officialPaperMaxMarks: 100,
  questionPaperText: remainingFiveSource,
  markingSchemeText: 'DERIVED MARKING SCHEME\nQuestion 1 - 20 Marks\nQuestion 2 - 16 Marks\nQuestion 3 - 16 Marks\nQuestion 4 - 16 Marks\nQuestion 5 - 16 Marks\nQuestion 6 - 16 Marks',
  suggestedAnswersText: 'Suggested Answers are provided question-wise.',
});
assert.equal(paperStructure.questions.find((question) => question.questionNumber === '1')?.compulsory, true);
for (const number of ['2', '3', '4', '5', '6']) {
  const question = paperStructure.questions.find((entry) => entry.questionNumber === number);
  assert.equal(question?.compulsory, false, `Q${number} must be optional because the source says choose from the remaining five.`);
  assert.equal(question?.choiceRule, remainingFive?.choiceRule);
}

const validateAttempts = (codes: string[]) => validatePreEvaluationGate({
  paperStructure,
  questionPaperText: remainingFiveSource,
  suggestedAnswersText: 'Suggested Answers are provided question-wise.',
  markingSchemeText: 'DERIVED MARKING SCHEME',
  officialPaperMaxMarks: 100,
  coverageMap: {
    attemptedQuestions: codes.map((code) => ({
      fullQuestionCode: code,
      questionNumber: code.match(/^Q(\d+)/)?.[1] || code,
    })),
    unclearPages: [],
    unmappedPages: [],
  } as any,
});

const fourOptionalParents = validateAttempts(['Q2', 'Q3(a)', 'Q3(b)', 'Q4', 'Q5']);
assert.equal(fourOptionalParents.passed, true,
  'Different subparts of one parent question count as one selected optional parent.');

const fiveOptionalParents = validateAttempts(['Q2', 'Q3(a)', 'Q4', 'Q5', 'Q6']);
assert.equal(fiveOptionalParents.passed, false,
  'Attempting all five optional parents must stop before scoring.');
assert.ok(fiveOptionalParents.criticalFailures?.some((message) =>
  message.includes('OPTIONAL_ATTEMPT_LIMIT_EXCEEDED'),
));

const directListRule = extractOptionalAttemptSelectionRule(
  [
    'Attempt any two of Q2, Q3 and Q4.',
    'Question 1 - 20 Marks',
    'Question 2 - 10 Marks',
    'Question 3 - 10 Marks',
    'Question 4 - 10 Marks',
  ].join('\n'),
  '',
  ['1', '2', '3', '4'],
);
assert.deepEqual(directListRule, {
  allowedCount: 2,
  questionNumbers: ['2', '3', '4'],
  choiceRule: 'Attempt any 2 of Q2, Q3, Q4',
});

const incompleteSourceRule = extractOptionalAttemptSelectionRule(
  'Answer any four questions from the remaining five.',
  '',
  ['1', '2', '3', '4'],
);
assert.equal(incompleteSourceRule, null,
  'The system must not infer missing optional question IDs when the source count does not reconcile.');

const noInstructionStructure = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  materialType: 'MODEL_TEST_PAPER',
  questionPaperText: 'Question 1 - 20 Marks\nQuestion 2 - 16 Marks\nQuestion 3 - 16 Marks\nQuestion 4 - 16 Marks\nQuestion 5 - 16 Marks\nQuestion 6 - 16 Marks',
});
assert.ok(noInstructionStructure.questions.every((question) => !question.choiceRule),
  'Without source-backed choice wording, no optional-attempt rule may be invented.');

console.log('Source-based optional-question attempt-limit tests passed.');
