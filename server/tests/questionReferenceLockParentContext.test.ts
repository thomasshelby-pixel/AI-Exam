import assert from 'node:assert/strict';
import { extractLockedQuestionSlice, lockQuestionReference } from '../services/questionReferenceLock.js';
import { resolveContextualQuestionIdentity } from '../services/answerSheetCoverageService.js';

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

const falseQ6d = extractLockedQuestionSlice(suggestedAnswers, '6', 'd', 'SA');
assert.equal(falseQ6d.found, false, 'Q6(d) must not borrow the unrelated Q2(d) short-term provision line');
assert.equal(falseQ6d.snippet, '');

// Division A MCQ and Division B descriptive questions restart numbering.
const q1Parent = extractLockedQuestionSlice(suggestedAnswers, '1', undefined, 'SA');
assert.equal(q1Parent.found, true, 'Top-level Q1 must lock to Division B, not the MCQ key');
assert.match(q1Parent.snippet, /AS 13/i);
assert.doesNotMatch(q1Parent.snippet, /\\(i\\)\\s*\\(a\\)/i);

const q2Parent = extractLockedQuestionSlice(suggestedAnswers, '2', undefined, 'SA');
assert.equal(q2Parent.found, true, 'Top-level Q2 must lock to Division B');
assert.match(q2Parent.snippet, /Delta Limited/i);
assert.match(q2Parent.snippet, /Balance Sheet/i);
assert.doesNotMatch(q2Parent.snippet, /\\(i\\)\\s*\\(a\\)/i);

const q4Parent = extractLockedQuestionSlice(suggestedAnswers, '4', undefined, 'SA');
assert.equal(q4Parent.found, true, 'Top-level Q4 must lock to the business-purchase answer');
assert.match(q4Parent.snippet, /In the Books of Hari Ltd/i);
assert.doesNotMatch(q4Parent.snippet, /^4\\.\\s*\\(b\\)/m);

const q5Parent = extractLockedQuestionSlice(suggestedAnswers, '5', undefined, 'SA');
assert.equal(q5Parent.found, true, 'Advanced Accounting Q5 must not be treated as Taxation Section B');
assert.match(q5Parent.snippet, /Consolidated Balance Sheet/i);
assert.doesNotMatch(q5Parent.snippet, /^5\\.\\s*\\(b\\)/m);

// Parent-level continuation is retained even when the paper inventory only has child leaves.
// It stays non-scorable until an authoritative child/mark allocation is found.
const q2Continuation = resolveContextualQuestionIdentity({
  isContinuation: true,
  previousActiveQuestion: 'Q2',
  paperSubQuestions: [
    { fullQuestionCode: 'Q2(a)', questionNumber: '2', subQuestionNumber: 'a', maximumMarks: 0, compulsory: false, isMcq: false, section: 'A' },
    { fullQuestionCode: 'Q2(b)', questionNumber: '2', subQuestionNumber: 'b', maximumMarks: 0, compulsory: false, isMcq: false, section: 'A' },
  ],
});
assert.equal(q2Continuation.canonicalId, 'Q2');
assert.equal(q2Continuation.requiresReview, false);

const unanchoredContinuation = resolveContextualQuestionIdentity({
  isContinuation: true,
  paperSubQuestions: [],
});
assert.equal(unanchoredContinuation.canonicalId, undefined);
assert.equal(unanchoredContinuation.requiresReview, true);

const lockedQ1c = lockQuestionReference('Q1(c)', '', suggestedAnswers, '');
assert.equal(lockedQ1c.suggestedAnswerSlice.found, true);
assert.equal(lockedQ1c.needsReview, false, 'A real Q1(c) suggested-answer section can be locked');

const lockedQ6d = lockQuestionReference('Q6(d)', '', suggestedAnswers, '');
assert.equal(lockedQ6d.suggestedAnswerSlice.found, false);
assert.equal(lockedQ6d.needsReview, true, 'A missing Q6(d) reference must be sent for human review, not treated as verified');

console.log('✅ Parent-scoped sub-question reference lock regression passed.');
