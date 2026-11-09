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

const standaloneQ4Paper = [
  'MODEL TEST PAPER 1 QUESTION PAPER',
  'Division A (30 Marks)',
  '4. Which standalone objective answer is correct?',
  '(a) First option',
  '(b) Second option',
  'Division B',
  '1. Descriptive question follows.',
].join('\n');
const lockedStandaloneQ4 = extractLockedQuestionSlice(standaloneQ4Paper, '4', undefined, 'QP');
assert.equal(lockedStandaloneQ4.found, true, 'A standalone numeric QP heading like "4. ..." must be extractable.');
assert.match(lockedStandaloneQ4.snippet, /standalone objective answer/i);
assert.doesNotMatch(lockedStandaloneQ4.snippet, /Descriptive question follows/i);

const q5Parent = extractLockedQuestionSlice(suggestedAnswers, '5', undefined, 'SA');
assert.equal(q5Parent.found, true, 'Advanced Accounting Q5 must not be routed to the Taxation Section B matcher.');
assert.match(q5Parent.snippet, /Consolidated Balance Sheet/i);
assert.doesNotMatch(q5Parent.snippet, /^5\.\s*\(b\)/m);

const q6Parent = extractLockedQuestionSlice(suggestedAnswers, '6', undefined, 'SA');
assert.equal(q6Parent.found, true, 'Advanced Accounting Q6 must lock inside Division B.');
assert.match(q6Parent.snippet, /Qualitative characteristics/i);
assert.doesNotMatch(q6Parent.snippet, /^5\.\s*\(b\)/m);

// Taxation still treats Q5-Q8 as Section B (GST); the special source anchors remain active.
const taxationAnswers = [
  'SUGGESTED ANSWERS — CA INTERMEDIATE TAXATION',
  'Division A (MCQ)',
  '1. (a)',
  'Division B — GST',
  '5. (a) Computation of net GST payable in cash for the registered person.',
  '6. (a) Determine output tax liability under GST.',
].join('\n');
const taxationQ5 = extractLockedQuestionSlice(taxationAnswers, '5', 'a', 'SA');
assert.equal(taxationQ5.found, true, 'Taxation Section B Q5 must retain its GST-specific reference anchor.');
assert.match(taxationQ5.snippet, /net GST payable/i);

const falseQ6d = extractLockedQuestionSlice(suggestedAnswers, '6', 'd', 'SA');
assert.equal(falseQ6d.found, false, 'Q6(d) must not borrow the unrelated Q2(d) short-term provision line');
assert.equal(falseQ6d.snippet, '');

const lockedQ1c = lockQuestionReference('Q1(c)', '', suggestedAnswers, '');
assert.equal(lockedQ1c.suggestedAnswerSlice.found, true);
assert.equal(lockedQ1c.needsReview, false, 'A real Q1(c) suggested-answer section can be locked');

const lockedQ6d = lockQuestionReference('Q6(d)', '', suggestedAnswers, '');
assert.equal(lockedQ6d.suggestedAnswerSlice.found, false);
assert.equal(lockedQ6d.needsReview, true, 'A missing Q6(d) reference must be sent for human review, not treated as verified');


// Universal nested numbering must lock each Roman-numbered leaf separately.
const nestedRomanAnswers = [
  'ANSWERS OF FACULTY MOCK',
  'Division B',
  '1. (a) Parent part overview.',
  '(i) First Roman sub-part.',
  'Only-first evidence belongs to sub-part one.',
  '(ii) Second Roman sub-part.',
  'Only-second evidence belongs to sub-part two.',
  '(1) First numeric child under sub-part two.',
  'Only-numeric-one evidence.',
  '(2) Second numeric child under sub-part two.',
  'Only-numeric-two evidence.',
  '(b) Sibling alphabetic part.',
  'Sibling-b evidence must not leak into part a.',
].join('\n');
const nestedOne = extractLockedQuestionSlice(nestedRomanAnswers, '1', 'a(i)', 'SA');
assert.equal(nestedOne.found, true, 'The first Roman sub-part must resolve under its exact parent part.');
assert.match(nestedOne.snippet, /Only-first evidence/);
assert.doesNotMatch(nestedOne.snippet, /Only-second evidence|Sibling-b evidence/);
const nestedTwo = extractLockedQuestionSlice(nestedRomanAnswers, '1', 'a(ii)', 'SA');
assert.equal(nestedTwo.found, true, 'The second Roman sub-part must remain a different reference slice.');
assert.match(nestedTwo.snippet, /Only-second evidence/);
assert.doesNotMatch(nestedTwo.snippet, /Only-first evidence|Sibling-b evidence/);
const nestedNumericOne = extractLockedQuestionSlice(nestedRomanAnswers, '1', 'a(ii)(1)', 'SA');
assert.equal(nestedNumericOne.found, true, 'A numeric child beneath a Roman sub-part must resolve to its complete path.');
assert.match(nestedNumericOne.snippet, /Only-numeric-one evidence/);
assert.doesNotMatch(nestedNumericOne.snippet, /Only-numeric-two evidence/);
const nestedNumericTwo = extractLockedQuestionSlice(nestedRomanAnswers, '1', 'a(ii)(2)', 'SA');
assert.equal(nestedNumericTwo.found, true, 'A second numeric child must not be merged into its sibling.');
assert.match(nestedNumericTwo.snippet, /Only-numeric-two evidence/);
assert.doesNotMatch(nestedNumericTwo.snippet, /Only-numeric-one evidence|Sibling-b evidence/);
// Dotted and named source headings must lock to the same universal canonical paths.
const dottedAnswers = [
  'SUGGESTED ANSWERS',
  'Question 3.1.1 First dotted sub-part answer with its own working and conclusion.',
  'Only dotted one evidence.',
  'Question 3.1.2 Second dotted sub-part answer with separate working and conclusion.',
  'Only dotted two evidence.',
].join('\n');
const dottedOne = extractLockedQuestionSlice(dottedAnswers, '3', '1(1)', 'SA');
assert.equal(dottedOne.found, true, 'Q3.1.1 must be retrievable through canonical Q3(1)(1).');
assert.match(dottedOne.snippet, /Only dotted one evidence/);
assert.doesNotMatch(dottedOne.snippet, /Only dotted two evidence/);
const dottedTwo = extractLockedQuestionSlice(dottedAnswers, '3', '1(2)', 'SA');
assert.equal(dottedTwo.found, true, 'Q3.1.2 must resolve independently from Q3.1.1.');
assert.match(dottedTwo.snippet, /Only dotted two evidence/);
assert.doesNotMatch(dottedTwo.snippet, /Only dotted one evidence/);

const namedClauseAnswers = [
  'SUGGESTED ANSWERS',
  'Question 4 Part IV Clause 1 First named clause answer with separate analysis and conclusion.',
  'Only named clause one evidence.',
  'Question 4 Part IV Clause 2 Second named clause answer with separate analysis and conclusion.',
  'Only named clause two evidence.',
].join('\n');
const namedClauseOne = extractLockedQuestionSlice(namedClauseAnswers, '4', 'iv(1)', 'SA');
assert.equal(namedClauseOne.found, true, 'Part IV Clause 1 must lock using its named source labels.');
assert.match(namedClauseOne.snippet, /Only named clause one evidence/);
assert.doesNotMatch(namedClauseOne.snippet, /Only named clause two evidence/);
const namedClauseTwo = extractLockedQuestionSlice(namedClauseAnswers, '4', 'iv(2)', 'SA');
assert.equal(namedClauseTwo.found, true, 'Part IV Clause 2 must be a separate source slice.');
assert.match(namedClauseTwo.snippet, /Only named clause two evidence/);
assert.doesNotMatch(namedClauseTwo.snippet, /Only named clause one evidence/);

const mixedLabelAnswers = [
  'SUGGESTED ANSWERS',
  'Question 5 Part IV(1) First mixed-format sub-part answer with separate working and conclusion.',
  'Only mixed one evidence.',
  'Question 5 Part IV(2) Second mixed-format sub-part answer with separate working and conclusion.',
  'Only mixed two evidence.',
].join('\n');
const mixedLabelOne = extractLockedQuestionSlice(mixedLabelAnswers, '5', 'iv(1)', 'SA');
assert.equal(mixedLabelOne.found, true, 'A named parent followed by a bracketed numeric child must resolve.');
assert.match(mixedLabelOne.snippet, /Only mixed one evidence/);
assert.doesNotMatch(mixedLabelOne.snippet, /Only mixed two evidence/);
const mixedLabelTwo = extractLockedQuestionSlice(mixedLabelAnswers, '5', 'iv(2)', 'SA');
assert.equal(mixedLabelTwo.found, true, 'The sibling mixed-format numeric child must resolve independently.');
assert.match(mixedLabelTwo.snippet, /Only mixed two evidence/);
assert.doesNotMatch(mixedLabelTwo.snippet, /Only mixed one evidence/);

const nestedBracketAnswers = [
  'SUGGESTED ANSWERS',
  'Question 6(a(i)) First nested-parenthesis answer with its own working and conclusion.',
  'Only nested-bracket evidence.',
  'Question 6(a(ii)) Second nested-parenthesis answer with separate working and conclusion.',
  'Only nested-bracket sibling evidence.',
].join('\n');
const nestedBracketOne = extractLockedQuestionSlice(nestedBracketAnswers, '6', 'a(i)', 'SA');
assert.equal(nestedBracketOne.found, true, 'The compact nested-bracket heading (a(i)) must resolve to Q6(a)(i).');
assert.match(nestedBracketOne.snippet, /Only nested-bracket evidence/);
assert.doesNotMatch(nestedBracketOne.snippet, /Only nested-bracket sibling evidence/);
const nestedBracketTwo = extractLockedQuestionSlice(nestedBracketAnswers, '6', 'a(ii)', 'SA');
assert.equal(nestedBracketTwo.found, true, 'Sibling nested-bracket headings must remain independently retrievable.');
assert.match(nestedBracketTwo.snippet, /Only nested-bracket sibling evidence/);
assert.doesNotMatch(nestedBracketTwo.snippet, /Only nested-bracket evidence/);
console.log('✅ Parent-scoped sub-question reference lock regression passed.');
