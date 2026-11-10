import assert from 'node:assert/strict';
import {
  extractSubQuestionsFromText,
  getAuthoritativePaperStructure,
} from '../services/paperStructureService.js';

// Ordinary prose immediately after a question number is not a numbering label.
// This exact ambiguity could fabricate Q1(plus) with a 70-mark maximum.
const proseOnly = [
  'Question 1 plus 70 Marks',
  'Question 2 extra 10 Marks',
  'Question 3 total 15 Marks',
  'Question 4 additional 20 Marks',
].join('\n');

const proseParsed = extractSubQuestionsFromText(proseOnly);
assert.deepEqual(
  proseParsed,
  [],
  'Prose words such as plus/extra/total/additional must never become question sub-part IDs or marks allocations.',
);

// Genuine numbering styles remain supported.
const legitimateNumbering = [
  'Question 1(a) - 5 Marks',
  'Question 2 Part IV Clause 2 - 3 Marks',
  'Question 3(a)(i) - 2 Marks',
  'Question 4.1.2 - 4 Marks',
  'Question 5 b) - 5 Marks',
].join('\n');

const legitimate = extractSubQuestionsFromText(legitimateNumbering);
const legitimateMaxima = new Map(legitimate.map((question) => [
  question.fullQuestionCode,
  question.maximumMarks,
]));
for (const [questionId, maxMarks] of [
  ['Q1(a)', 5],
  ['Q2(iv(2))', 3],
  ['Q3(a(i))', 2],
  ['Q4(1)(2)', 4],
  ['Q5(b)', 5],
] as const) {
  assert.equal(
    legitimateMaxima.get(questionId),
    maxMarks,
    questionId + ' must keep its valid source-backed maximum.',
  );
}

// A suspicious line in a Marking Scheme must not bypass the strict parser via
// the standalone-allocation fallback used when the QP omits a question total.
const structure = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'FACULTY_MOCK_TEST',
  officialPaperMaxMarks: 100,
  questionPaperText: [
    'Faculty Mock Question Paper',
    'Question 1(a) - 5 Marks',
    'Question 2(a) - 5 Marks',
  ].join('\n'),
  suggestedAnswersText: [
    'Faculty Mock Suggested Answers',
    'Question 1(a). Official answer and complete working.',
    'Question 2(a). Official answer and complete working.',
  ].join('\n'),
  markingSchemeText: [
    'Faculty Mock Marking Scheme',
    'Question 1 plus 70 Marks',
    'Question 1(a) - 5 Marks',
    'Question 2(a) - 5 Marks',
  ].join('\n'),
});

const structureMaxima = new Map(structure.subQuestions.map((question) => [
  question.fullQuestionCode,
  question.maximumMarks,
]));
assert.equal(structureMaxima.has('Q1(plus)'), false,
  'The standalone Marking Scheme fallback must not create Q1(plus).');
assert.equal(structureMaxima.get('Q1(a)'), 5,
  'The valid Question Paper / Marking Scheme allocation must remain authoritative.');
assert.equal(structureMaxima.get('Q2(a)'), 5,
  'Other valid question allocations must remain unaffected.');
assert.equal(
  Array.from(structureMaxima.values()).includes(70),
  false,
  'A prose phrase ending in 70 Marks must not inject a 70-mark question into the inventory.',
);

console.log('Prose question-label safety and valid nested numbering regressions passed.');
