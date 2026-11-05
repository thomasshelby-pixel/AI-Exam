import assert from 'node:assert/strict';
import { extractLockedQuestionSlice, lockQuestionReference } from '../services/questionReferenceLock.js';

// Minimized structure from the uploaded Model Test Paper 1 Suggested Answers.
// Division A is intentionally separate; descriptive answers sit under Division B.
const suggestedAnswers = [
  'ANSWERS OF MODEL TEST PAPER 1',
  'PAPER 1: ADVANCED ACCOUNTING',
  'Division A (30 Marks)',
  '1. (i) (a)',
  '   (ii) (d)',
  '   (iii) (c)',
  '   (iv) (c)',
  '2. (i) (a)',
  '   (ii) (c)',
  '   (iii) (d)',
  '   (iv) (b)',
  '3. (i) (b)',
  '   (ii) (d)',
  '   (iii) (c)',
  '   (iv) (c)',
  '4. (b)',
  '5. (b)',
  '6. (a)',
  'Division B',
  '1. (a) As per AS 13 (Revised), short-term investments are valued at lower of cost and fair value.',
  '(b) As per AS 19, recognize the finance lease asset and liability at the lower required value.',
  '(c) Treatment of Impairment Loss',
  'As per AS 28, compare carrying amount with recoverable amount.',
  'Carrying amount is 75 lakhs and recoverable amount is 64.5 lakhs.',
  'Impairment loss is 10.5 lakhs and should be recognized in the Statement of Profit and Loss.',
  '2. Delta Limited',
  'Balance Sheet as at 31st March 2023',
  '(a) Share Capital',
  '(b) Reserves and Surplus',
  '(c) Long-term Borrowings',
  '(d) Short-term provision',
  '3. (a) As per AS 9 on Revenue Recognition, interest is recognized on a time proportion basis.',
  '4. In the Books of Hari Ltd. Journal Entries for business purchase.',
  '5. Consolidated Balance Sheet of Virat Ltd. and its Subsidiary Anushka Ltd.',
  '6. (a) Qualitative characteristics of financial statements.',
  '(b) Cash Flow Statement.',
  '(c) Calculation of profit earned by the branch.',
].join('\n');

const q1c = extractLockedQuestionSlice(suggestedAnswers, '1', 'c', 'SA');
assert.equal(q1c.found, true, 'Q1(c) must be found inside Division B, not confused with Division A MCQ numbering');
assert.match(q1c.snippet, /Treatment of Impairment Loss/i);
assert.match(q1c.snippet, /AS 28/i);
assert.doesNotMatch(q1c.snippet, /Delta Limited/i);

const q2d = extractLockedQuestionSlice(suggestedAnswers, '2', 'd', 'SA');
assert.equal(q2d.found, true, 'Q2(d) must resolve under Q2 when its own parent is present.');
assert.match(q2d.snippet, /Short-term provision/i);
assert.doesNotMatch(q2d.snippet, /Qualitative characteristics/i);

const falseQ6d = extractLockedQuestionSlice(suggestedAnswers, '6', 'd', 'SA');
assert.equal(falseQ6d.found, false, 'Q6(d) must not borrow the unrelated Q2(d) short-term provision line');
assert.equal(falseQ6d.snippet, '');

const lockedQ1c = lockQuestionReference('Q1(c)', '', suggestedAnswers, '');
assert.equal(lockedQ1c.suggestedAnswerSlice.found, true);
assert.equal(lockedQ1c.needsReview, false, 'A real Q1(c) suggested-answer section can be locked');

const lockedQ6d = lockQuestionReference('Q6(d)', '', suggestedAnswers, '');
assert.equal(lockedQ6d.suggestedAnswerSlice.found, false);
assert.equal(lockedQ6d.needsReview, true, 'A missing Q6(d) reference must be sent for human review, not treated as verified');

console.log('✅ Parent-scoped sub-question reference lock regression passed.');
