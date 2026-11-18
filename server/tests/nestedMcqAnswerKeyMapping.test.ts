import assert from 'node:assert/strict';
import {
  extractOfficialMcqKeysFromSuggestedAnswers,
  getAuthoritativePaperStructure,
} from '../services/paperStructureService.js';
import { evaluateAllAuthoritativeMcqs } from '../services/deterministicMcqScorer.js';

const suggestedAnswers = [
  'ANSWERS OF MODEL TEST PAPER 1',
  'INTERMEDIATE COURSE: GROUP - I',
  'PAPER 1: ADVANCED ACCOUNTING',
  'Division A (30 Marks)',
  '1.   (i)    (a)',
  '     (ii)   (d)',
  '     (iii)  (c)',
  '     (iv)   (c)',
  '2.   (i)    (a)',
  '     (ii)   (c)',
  '     (iii)  (d)',
  '     (iv)   (b)',
  '3.   (i)    (b)',
  '     (ii)   (d)',
  '     (iii)  (c)',
  '     (iv)   (c)',
  '4.   (b)',
  '5    (b)',
  '6    (a)',
  'Division B',
  '1. (a) Descriptive answer content must not be interpreted as an MCQ.',
].join('\n');

const expectedKeys = ['A', 'D', 'C', 'C', 'A', 'C', 'D', 'B', 'B', 'D', 'C', 'C', 'B', 'B', 'A'];
const extracted = extractOfficialMcqKeysFromSuggestedAnswers(suggestedAnswers);

assert.equal(extracted.size, 15, 'All 15 Division A MCQ keys must be extracted');
expectedKeys.forEach((key, index) => {
  assert.equal(
    extracted.get(String(index + 1))?.officialKey,
    key,
    `Sequential MCQ ${index + 1} must map to the matching source option`,
  );
});

// The reported defect: student's fourth response is C; the source's fourth MCQ
// is Q1(iv) = C. The standalone source Question 4 = B is MCQ 13, not MCQ 4.
assert.equal(extracted.get('4')?.officialKey, 'C');
assert.equal(extracted.get('13')?.officialKey, 'B');

const paper = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  questionPaperText: [
    'MODEL TEST PAPER 1 QUESTION PAPER',
    'Division A (30 Marks)',
    'Each MCQ carries 2 Marks.',
    'Division B',
    'Question 1(a) - 10 Marks',
  ].join('\n'),
  suggestedAnswersText: suggestedAnswers,
  officialPaperMaxMarks: 100,
});
assert.equal(paper.mcqs.length, 15, 'Generic Advanced Accounting structure must contain all extracted MCQs');
assert.equal(paper.mcqs.find((mcq) => mcq.fullQuestionCode === 'MCQ4')?.officialKey, 'C');
assert.ok(
  paper.mcqs.every((mcq) => mcq.maximumMarks === 2),
  'Every nested MCQ must receive only the 2-mark allocation explicitly stated by its selected Question Paper.',
);
assert.equal(paper.mcqs.find((mcq) => mcq.fullQuestionCode === 'MCQ4')?.sourceQuestionLabel, 'Question 1(iv)', 'The fourth flat key must retain its original nested Q1(iv) label.');
assert.equal(paper.mcqs.find((mcq) => mcq.fullQuestionCode === 'MCQ13')?.sourceQuestionLabel, 'Question 4', 'Standalone Question 4 must retain its own label rather than collide with Q1(iv).');

const questionPaperText = [
  'MODEL TEST PAPER 1 QUESTION PAPER',
  'Division A (30 Marks)',
  '1. (i) Which accounting treatment is correct for the first case?',
  '   (a) First option',
  '   (b) Second option',
  '   (c) Third option',
  '   (d) Fourth option',
  '   (ii) Which accounting treatment applies to the second case?',
  '   (iii) Which accounting standard governs the third case?',
  '   (iv) Which treatment applies to impairment loss under AS 28?',
  '2. (i) Which statement applies to the second case study?',
  '   (ii) Which option is correct for the next case?',
  '   (iii) Which treatment applies here?',
  '   (iv) Which option applies to the fourth case?',
  '3. (i) Which standard applies to case three?',
  '   (ii) Which treatment is correct?',
  '   (iii) Which item is recognised?',
  '   (iv) Which option is appropriate?',
  '4. Which standalone objective answer is correct?',
  'Division B',
  '1. (a) Descriptive question text must not be included in an MCQ stem.',
].join('\n');
const paperWithQuestionStems = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  questionPaperText,
  suggestedAnswersText: suggestedAnswers,
  officialPaperMaxMarks: 100,
});
assert.match(
  paperWithQuestionStems.mcqs.find((mcq) => mcq.fullQuestionCode === 'MCQ4')?.questionText || '',
  /impairment loss under AS 28/i,
  'MCQ4 must carry the QP text for its original Q1(iv) label.',
);
assert.match(
  paperWithQuestionStems.mcqs.find((mcq) => mcq.fullQuestionCode === 'MCQ13')?.questionText || '',
  /standalone objective answer/i,
  'MCQ13 must use standalone Question 4 text, not the Q1(iv) text.',
);

const scored = evaluateAllAuthoritativeMcqs(
  paper.mcqs,
  { '4': 'C' },
  { caLevel: 'INTERMEDIATE', subjectKey: 'inter_advanced_accounting', paper: 'Paper 1' },
);
const fourthMcq = scored.find((question) => question.questionNumber === 'MCQ 4');
assert.ok(fourthMcq, 'The fourth MCQ must be present in the deterministic score output');
assert.equal(fourthMcq?.officialCorrectOption, 'C');
assert.equal(fourthMcq?.marksAwarded, 2, 'A C response to Q1(iv) must receive 2/2');

const flatAnswers = extractOfficialMcqKeysFromSuggestedAnswers([
  'Suggested Answers - Flat Key Format Test',
  'Division A',
  '1. (c) Flat-key test',
  '2. (d) Another flat-key test',
  'Division B',
].join('\n'));
assert.equal(flatAnswers.get('1')?.officialKey, 'C', 'Existing flat answer-key format remains supported');
assert.equal(flatAnswers.get('2')?.officialKey, 'D', 'Existing flat answer-key format remains supported');

// Faculty answer-key TXT may contain a compact flat list without repeating
// "Division A". It is safe to use only when the selected Question Paper has an
// objective section and the Suggested Answers explicitly contains an Answer Key.
const compactObjectiveQuestionPaper = [
  'CA INTERMEDIATE - QUESTION PAPER',
  'Division A - Multiple Choice Questions (6 Marks)',
  'Each question carries 2 marks.',
  '1. Which statement is correct?',
  '2. Which treatment is appropriate?',
  '3. Which option is correct?',
  'Division B',
  'Question 1(a) - 10 Marks',
  'Explain the descriptive legal requirement.',
].join('\\n');
const compactOfficialAnswerKey = [
  'SUGGESTED ANSWERS',
  'ANSWER KEY',
  '1. (b)',
  '2. (a)',
  '3. (d)',
].join('\\n');

const compactKeys = extractOfficialMcqKeysFromSuggestedAnswers(
  compactOfficialAnswerKey,
  compactObjectiveQuestionPaper,
);
assert.deepEqual(
  Array.from(compactKeys.entries()).map(([number, value]) => [number, value.officialKey]),
  [['1', 'B'], ['2', 'A'], ['3', 'D']],
  'A compact numbered answer key can be recovered only when the Question Paper confirms Division A MCQs.',
);

const compactPaper = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  materialType: 'FACULTY_MOCK_TEST',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  questionPaperText: compactObjectiveQuestionPaper,
  suggestedAnswersText: compactOfficialAnswerKey,
  markingSchemeText: '',
  officialPaperMaxMarks: 100,
});
assert.equal(compactPaper.mcqs.length, 3,
  'The objective inventory should retain every MCQ from a verified compact Answer Key.');
assert.ok(compactPaper.mcqs.every((mcq) => mcq.maximumMarks === 2),
  'Per-MCQ maximum must come from the explicit rule inside the objective Question Paper section.');

const compactScoring = evaluateAllAuthoritativeMcqs(
  compactPaper.mcqs,
  { '1': 'B', '2': 'A', '3': 'C' },
  { caLevel: 'INTERMEDIATE', subjectKey: 'inter_advanced_accounting', paper: 'Paper 1' },
);
assert.equal(compactScoring.find((question) => question.questionNumber === 'MCQ 1')?.marksAwarded, 2);
assert.equal(compactScoring.find((question) => question.questionNumber === 'MCQ 2')?.marksAwarded, 2);
assert.equal(compactScoring.find((question) => question.questionNumber === 'MCQ 3')?.marksAwarded, 0);
assert.equal(compactScoring.reduce((sum, question) => sum + question.marksAwarded, 0), 4,
  'Verified MCQ selections must contribute their deterministic marks to the evaluation result.');

// No QP objective section or no explicit Answer Key heading means no inferred
// MCQ keys; descriptive "1(a)" answer structure must not be converted to MCQs.
assert.equal(
  extractOfficialMcqKeysFromSuggestedAnswers(
    ['SUGGESTED ANSWERS', '1. (a) Descriptive answer', '2. (b) Another descriptive answer', '3. (c) Conclusion'].join('\\n'),
    'QUESTION PAPER\\nDivision B\\nQuestion 1(a) - 5 Marks',
  ).size,
  0,
  'Descriptive sub-question labels must never be reclassified as MCQ answer keys.',
);

console.log('✅ Nested Division A MCQ answer-key indexing regression passed.');
