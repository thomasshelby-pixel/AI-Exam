import assert from 'node:assert/strict';
import { extractRelevantReferenceSnippets } from '../services/questionChunkEvaluator.js';

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
    sourceType: 'GLOBAL',
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

console.log('✅ Faculty Mock and Model Test reference source-binding regression passed.');
