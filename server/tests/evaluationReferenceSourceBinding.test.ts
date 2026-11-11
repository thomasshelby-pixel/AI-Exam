import assert from 'node:assert/strict';
import {
  extractRelevantReferenceSnippets,
  buildCheckedCopyScoreIndependenceInstruction,
  assessQuestionReferenceForEvaluation,
  assessQuestionReferenceTopicAlignment,
} from '../services/questionChunkEvaluator.js';

const questionPaper = [
  'QUESTION 1',
  'Question 1(a) Explain the accounting treatment and relevant standard for the transaction. (5 Marks)',
  'Question 1(b) Explain the alternative treatment. (5 Marks)',
].join('\n');

const suggestedAnswers = [
  'ANSWER 1',
  'Question 1(a) As per Accounting Standard 1, the relevant accounting policy must be disclosed consistently. The transaction is recognized using the prescribed accounting treatment and supported by the relevant facts.',
  'Question 1(b) The alternative treatment is not applicable to the stated facts.',
].join('\n');

const markingScheme = [
  'QUESTION 1 MARKING SCHEME',
  'QUESTION 1(a) - 5 MARKS',
  'Correct accounting principle: 2 marks',
  'Application to facts and workings: 2 marks',
  'Conclusion: 1 mark',
  'QUESTION 1(b) - 5 MARKS',
].join('\n');

const facultyReference = extractRelevantReferenceSnippets(
  'Q1(a)',
  questionPaper,
  suggestedAnswers,
  markingScheme,
  {
    qpMaterialId: 'faculty-mock-original-qp-pdf',
    saMaterialId: 'faculty-mock-private-reference-txt',
    msMaterialId: 'faculty-mock-private-reference-txt',
    materialVersions: '1.0',
    sourceType: 'FACULTY_MOCK',
    materialType: 'FACULTY_MOCK_TEST',
    facultyMockTestId: 'fmock_test_abc123',
    materialTitle: 'Faculty Mock 01 - Advanced Accounting',
  },
);

assert.equal(facultyReference.referenceNeedsReview, false);
assert.equal(facultyReference.referenceTrace.sourceType, 'FACULTY_MOCK');
assert.equal(facultyReference.referenceTrace.questionPaperMaterialId, 'faculty-mock-original-qp-pdf');
assert.equal(facultyReference.referenceTrace.suggestedAnswerMaterialId, 'faculty-mock-private-reference-txt');
assert.equal(facultyReference.referenceTrace.markingSchemeMaterialId, 'faculty-mock-private-reference-txt');
assert.equal(facultyReference.referenceTrace.facultyMockTestId, 'fmock_test_abc123');
assert.equal(facultyReference.referenceTrace.materialType, 'FACULTY_MOCK_TEST');
assert.match(facultyReference.saSnippet, /Accounting Standard 1/i);

const facultyCheckedCopyInstruction = buildCheckedCopyScoreIndependenceInstruction('FACULTY_MOCK_TEST');
assert.match(facultyCheckedCopyInstruction, /faculty\/examiner ticks/i);
assert.match(facultyCheckedCopyInstruction, /non-binding evidence/i);
assert.match(facultyCheckedCopyInstruction, /exact selected Faculty Mock/i);
const pyqCheckedCopyInstruction = buildCheckedCopyScoreIndependenceInstruction('PYQ');
assert.match(pyqCheckedCopyInstruction, /ICAI examiner ticks/i);
assert.match(pyqCheckedCopyInstruction, /non-binding evidence/i);
assert.equal(buildCheckedCopyScoreIndependenceInstruction('MTP'), '');

// Exact QP text-slice formatting misses must not create artificial review
// states when the selected material's canonical leaf + maximum marks are
// authoritative and its exact Suggested Answer lock succeeded.
for (const materialType of ['PYQ', 'MTP', 'MODEL_TEST_PAPER', 'FACULTY_MOCK_TEST']) {
  const disposition = assessQuestionReferenceForEvaluation({
    questionPaperFound: false,
    suggestedAnswerFound: true,
    referenceNeedsReview: false,
    materialType,
    authoritativeQuestionStructureVerified: true,
  });
  assert.deepEqual(
    disposition,
    { canScoreProvisionally: true, requiresHumanReview: false },
    materialType + ' must use the verified canonical structure instead of forcing NEEDS_REVIEW for a QP formatting mismatch.',
  );
}
const unresolvedSourceDisposition = assessQuestionReferenceForEvaluation({
  questionPaperFound: false,
  suggestedAnswerFound: true,
  referenceNeedsReview: false,
  materialType: 'FACULTY_MOCK_TEST',
  authoritativeQuestionStructureVerified: false,
});
assert.equal(unresolvedSourceDisposition.requiresHumanReview, true,
  'A Faculty Mock without a verified canonical leaf/maximum must retain human review.');
const missingSuggestedAnswerDisposition = assessQuestionReferenceForEvaluation({
  questionPaperFound: false,
  suggestedAnswerFound: false,
  referenceNeedsReview: true,
  materialType: 'FACULTY_MOCK_TEST',
  authoritativeQuestionStructureVerified: true,
});
assert.equal(missingSuggestedAnswerDisposition.canScoreProvisionally, false,
  'An unlinked Suggested Answer must never be auto-certified from a question identity alone.');

const modelTestReference = extractRelevantReferenceSnippets(
  'Q1(a)',
  questionPaper,
  suggestedAnswers,
  markingScheme,
  {
    qpMaterialId: 'model-3-qp',
    saMaterialId: 'model-3-sa',
    msMaterialId: 'model-3-ms',
    materialVersions: '2.0',
    sourceType: 'MODEL_TEST',
    materialType: 'MODEL_TEST_PAPER',
    modelTestNumber: 3,
    materialTitle: 'CA Intermediate Model Test Paper 3',
  },
);

assert.equal(modelTestReference.referenceNeedsReview, false);
assert.equal(modelTestReference.referenceTrace.sourceType, 'MODEL_TEST');
assert.equal(modelTestReference.referenceTrace.materialType, 'MODEL_TEST_PAPER');
assert.equal(modelTestReference.referenceTrace.modelTestNumber, 3);
assert.equal(modelTestReference.referenceTrace.suggestedAnswerMaterialId, 'model-3-sa');

// PART I MCQs and PART II descriptive questions restart their numbering.
// These same-numbered answers must never cross-wire (for example MCQ1's
// Section 91 answer must not be locked as descriptive Q1(c)'s FEMA answer).
const mixedPartQuestionPaper = [
  'PART – I (Case Scenario based MCQs)',
  '1. Which provision governs closure of the Register of Members?',
  '4. Which provision governs issue of bonus shares?',
  '6. Which rule governs audit-firm rotation?',
  'PART – II (Descriptive Portion)',
  'Answer 1(c): Mr. Harish is asked to accept US$30 cash from Mr. Lucas, a foreign tourist, for an antique. (4 Marks)',
  'Answer 4(b): Explain the designated-partner requirements and the effect of a partner relocating abroad. (5 Marks)',
  'Answer 6(b): Classify Arya Limited, Chirag Limited and Prism Limited as listed or unlisted companies. (5 Marks)',
].join('\n');

const mixedPartSuggestedAnswers = [
  'PART – I (Case Scenario based MCQs)',
  'Q. No. Answer Reason',
  '1. (C) Section 91 of the Companies Act, 2013: closure of the Register of Members.',
  '4. (B) Section 63(2) of the Companies Act, 2013: authority in Articles for bonus shares.',
  '6. (B) Section 139(2): auditor rotation and appointment.',
  'PART – II (Descriptive Portion)',
  'Answer 1 (c) (FEMA) 4 Marks',
  'As per section 3 of FEMA, no person shall receive payment by order or on behalf of a person resident outside India otherwise than through an authorised person.',
  'Where a person receives payment through another person without corresponding inward remittance from outside India, it is deemed to be receipt otherwise than through an authorised person.',
  'Mr. Lucas is a foreign tourist and proposes to pay Mr. Harish US$30 in cash for an antique. Harish cannot accept the cash directly unless the applicable authorised-person / money-changer exception applies.',
  'Answer 4 (b) (LLP) 5 Marks',
  'Designated partners must be individuals; at least two designated partners are required and at least one must satisfy the resident-in-India test.',
  'If the LLP agreement does not specify designated partners, the incorporation document route applies. A designated partner cannot avoid statutory responsibility by claiming ignorance.',
  'Answer 6 (b) (Preliminary) 5 Marks',
  'Section 2(52) defines a listed company. The Companies (Specification of Definitions Details) Rules, 2014 exclude specified public companies whose non-convertible debt securities or non-convertible redeemable preference shares are listed on private placement basis, and public companies with equity listed only in a jurisdiction specified under section 23(3).',
  'Arya Limited, Chirag Limited and Prism Limited are unlisted companies. Rule number not required.',
].join('\n');

const mixedPartMarkingScheme = [
  'PART I - MCQs',
  'MCQ1: Section 91 - 2 marks.',
  'MCQ4: Section 63 - 2 marks.',
  'MCQ6: Section 139 - 2 marks.',
  'PART II - DESCRIPTIVE',
  'Q1(c) - FEMA: RECEIPT OF FOREIGN CURRENCY - 4 MARKS',
  'Award for the authorised-person rule, deemed receipt, application to Lucas/Harish, and conclusion.',
  'Q4(b) - DESIGNATED PARTNERS IN LLP - 5 MARKS',
  'Award for individual eligibility, minimum designated partners/resident partner, incorporation-document route, 120-day test, and statutory duties.',
  'SOURCE BASIS: Suggested Answer 4(b), Question Paper 4(b). Section/rule numbers are not required.',
  'Q6(b) - LISTED VS UNLISTED COMPANIES - 5 MARKS',
  'Award definition, the two specified exclusions, and classification of Arya Limited, Chirag Limited and Prism Limited.',
  'SOURCE BASIS: Suggested Answer 6(b), Question Paper 6(b). Section and Rule numbers are not required.',
].join('\n');

const mixedPartMetadata = {
  qpMaterialId: 'semester-test-original-question-paper',
  saMaterialId: 'semester-test-suggested-answers',
  msMaterialId: 'semester-test-marking-scheme',
  materialVersions: '1.0',
  sourceType: 'GLOBAL' as const,
  materialType: 'PYQ',
  materialTitle: 'YCB Semester Test - Corporate and Other Laws',
};

const q1cReference = extractRelevantReferenceSnippets(
  'Q1(c)', mixedPartQuestionPaper, mixedPartSuggestedAnswers, mixedPartMarkingScheme, mixedPartMetadata,
);
assert.match(q1cReference.saSnippet, /Answer 1 \(c\) \(FEMA\)/i);
assert.match(q1cReference.saSnippet, /section 3 of FEMA/i);
assert.doesNotMatch(q1cReference.saSnippet, /Section 91|Register of Members/i,
  'Descriptive Q1(c) must not lock to the earlier Part I MCQ1 option.');
assert.match(q1cReference.qpSnippet, /foreign tourist|Lucas|Harish/i);
assert.equal(q1cReference.referenceNeedsReview, false);
assert.equal(assessQuestionReferenceTopicAlignment({
  topic: 'FEMA receipt of foreign currency from a person resident outside India',
  provision: 'Section 3 of FEMA and authorised-person requirement',
  questionText: 'May Harish receive US$30 cash from Lucas, a foreign tourist, for an antique?',
}, q1cReference.saSnippet, q1cReference.msSnippet).aligned, true);

const q4bReference = extractRelevantReferenceSnippets(
  'Q4(b)', mixedPartQuestionPaper, mixedPartSuggestedAnswers, mixedPartMarkingScheme, mixedPartMetadata,
);
assert.match(q4bReference.saSnippet, /Answer 4 \(b\) \(LLP\)/i);
assert.match(q4bReference.saSnippet, /designated partners must be individuals/i);
assert.doesNotMatch(q4bReference.saSnippet, /Section 63|bonus shares|auditor rotation/i,
  'Descriptive Q4(b) must not lock to a Part I MCQ row.');
assert.match(q4bReference.msSnippet, /Section\/rule numbers are not required/i);
assert.equal(q4bReference.referenceNeedsReview, false);
assert.equal(assessQuestionReferenceTopicAlignment({
  topic: 'Designated partners in a limited liability partnership',
  provision: 'LLP designated partner eligibility and resident partner duties',
  questionText: 'Explain the four designated-partner matters stated in the question.',
}, q4bReference.saSnippet, q4bReference.msSnippet).aligned, true);

const q6bReference = extractRelevantReferenceSnippets(
  'Q6(b)', mixedPartQuestionPaper, mixedPartSuggestedAnswers, mixedPartMarkingScheme, mixedPartMetadata,
);
assert.match(q6bReference.saSnippet, /Answer 6 \(b\) \(Preliminary\)/i);
assert.match(q6bReference.saSnippet, /Arya Limited, Chirag Limited and Prism Limited/i);
assert.doesNotMatch(q6bReference.saSnippet, /Section 139|auditor rotation/i,
  'Descriptive Q6(b) must not lock to the Part I MCQ6 audit-firm answer.');
assert.match(q6bReference.msSnippet, /Section and Rule numbers are not required/i);
assert.equal(q6bReference.referenceNeedsReview, false);
assert.equal(assessQuestionReferenceTopicAlignment({
  topic: 'Listed and unlisted companies and the specified exclusions',
  provision: 'Section 2(52) and Companies (Specification of Definitions Details) Rules, 2014',
  questionText: 'Classify Arya Limited, Chirag Limited and Prism Limited using the listed-company exclusions.',
}, q6bReference.saSnippet, q6bReference.msSnippet).aligned, true);

console.log('✅ Faculty Mock and Model Test reference source-binding regression passed.');
