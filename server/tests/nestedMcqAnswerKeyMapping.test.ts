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
  suggestedAnswersText: suggestedAnswers,
  officialPaperMaxMarks: 100,
});
assert.equal(paper.mcqs.length, 15, 'Generic Advanced Accounting structure must contain all extracted MCQs');
assert.equal(paper.mcqs.find((mcq) => mcq.fullQuestionCode === 'MCQ4')?.officialKey, 'C');

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

console.log('✅ Nested Division A MCQ answer-key indexing regression passed.');
