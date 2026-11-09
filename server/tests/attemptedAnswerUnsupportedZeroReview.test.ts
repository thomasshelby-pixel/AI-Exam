import assert from 'node:assert/strict';
import { processEvaluationIntegrity } from '../services/evaluationIntegrityEngine.js';

const paperStructure: any = {
  paperTitle: 'Attempted-answer zero-mark regression',
  totalPaperMaxMarks: 4,
  questions: [],
  subQuestions: [{
    fullQuestionCode: 'Q1(a)',
    questionNumber: '1',
    subQuestionNumber: 'a',
    maximumMarks: 4,
    compulsory: true,
    isMcq: false,
    questionText: 'Prepare the journal entries from the supplied facts.',
  }],
  mcqs: [],
};

const coverageMap: any = {
  totalPages: 1,
  pages: [{
    pageNumber: 1,
    status: 'ATTEMPTED_READABLE',
    detectedQuestions: [{
      fullQuestionCode: 'Q1(a)',
      questionNumber: '1',
      subQuestionNumber: 'a',
      status: 'ATTEMPTED_READABLE',
      isContinuation: false,
      pageNumber: 1,
      snippet: 'Candidate has written the journal entries with debit and credit amounts.',
    }],
    rawSummary: 'Journal-entry answer is visibly written.',
    hasHandwriting: true,
  }],
  attemptedQuestions: [{
    fullQuestionCode: 'Q1(a)',
    questionNumber: '1',
    subQuestionNumber: 'a',
    pages: [1],
    status: 'ATTEMPTED_READABLE',
    studentSnippet: 'Candidate has written the journal entries with debit and credit amounts.',
    isMcq: false,
  }],
  allDetectedCodes: ['Q1(a)'],
  unmappedPages: [],
  unclearPages: [],
  is100PercentCovered: true,
  mcqSelections: {},
  mcqNeedsReview: [],
};

const unsupportedZero = processEvaluationIntegrity({
  evaluationId: 'unsupported-zero-attempt',
  subjectName: 'Advanced Accounting',
  caLevel: 'INTERMEDIATE',
  officialPaperMaxMarks: 4,
  maximumMarks: 4,
  totalMarks: 0,
  questions: [{
    canonicalId: 'Q1(a)',
    questionNumber: '1',
    subQuestion: 'a',
    maximumMarks: 4,
    marksAwarded: 0,
    marksLost: 4,
    status: 'incorrect',
    reasonForDeduction: 'Incorrect answer.',
    detailedFeedback: 'The answer does not meet the expected standard.',
    markingComponents: [],
  }],
}, {
  paperStructure,
  coverageMap,
  questionPaperText: 'Question 1(a): Prepare the journal entries from the supplied facts [4 Marks].',
  suggestedAnswersText: 'Suggested Answer Q1(a): Journal entries with correct debit and credit treatment.',
  markingSchemeText: 'Award marks for each correct journal entry and working.',
  officialPaperMaxMarks: 4,
  caLevel: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
});

assert.equal(unsupportedZero.questions[0]?.status, 'unclear',
  'An attempted answer cannot receive a certified zero without a specific no-credit rationale.');
assert.equal(unsupportedZero.questions[0]?.marksAwarded, 0,
  'Do not invent provisional marks; keep the initial score unconfirmed pending review.');
assert.equal(unsupportedZero.questions[0]?.marksLost, 0,
  'A deduction is not confirmed when the attempted answer was not specifically assessed.');
assert.ok(unsupportedZero.questions[0]?.flags?.includes('UNSUPPORTED_ZERO_REQUIRES_REVIEW'));
assert.ok(unsupportedZero.questions[0]?.flags?.includes('REVIEW_REQUIRED'));
assert.match(unsupportedZero.questions[0]?.detailedFeedback || '', /not a confirmed academic zero/i);
assert.equal(unsupportedZero.validationStatus, 'NEEDS_REVIEW');
assert.equal(unsupportedZero.certificationStatus, 'VERIFICATION_REQUIRED');
assert.equal(unsupportedZero.downloadsUnlocked, false);

// A detected answer that the evaluator calls "not attempted" is a contradiction,
// not permission to award an unattempted zero.
const detectedButBlank = processEvaluationIntegrity({
  evaluationId: 'detected-but-blank',
  officialPaperMaxMarks: 4,
  maximumMarks: 4,
  totalMarks: 0,
  questions: [{
    canonicalId: 'Q1(a)',
    questionNumber: '1',
    subQuestion: 'a',
    maximumMarks: 4,
    marksAwarded: 0,
    marksLost: 4,
    status: 'not_attempted',
    reasonForDeduction: 'Candidate did not attempt this answer.',
    detailedFeedback: 'No answer provided.',
    markingComponents: [],
  }],
}, {
  paperStructure,
  coverageMap,
  questionPaperText: 'Question 1(a) carries 4 marks.',
  suggestedAnswersText: 'Suggested Answer Q1(a): Journal entries.',
  markingSchemeText: 'Award marks for correct entries.',
  officialPaperMaxMarks: 4,
});
assert.equal(detectedButBlank.questions[0]?.status, 'unclear');
assert.ok(detectedButBlank.questions[0]?.flags?.includes('ATTEMPTED_ANSWER_CLASSIFIED_UNATTEMPTED'));
assert.ok(detectedButBlank.questions[0]?.flags?.includes('REVIEW_REQUIRED'));
assert.equal(detectedButBlank.questions[0]?.marksLost, 0);

// A truly blank, undetected descriptive question remains a valid unattempted zero.
const genuinelyBlank = processEvaluationIntegrity({
  evaluationId: 'genuinely-blank',
  officialPaperMaxMarks: 4,
  maximumMarks: 4,
  totalMarks: 0,
  questions: [{
    canonicalId: 'Q1(a)',
    questionNumber: '1',
    subQuestion: 'a',
    maximumMarks: 4,
    marksAwarded: 0,
    marksLost: 4,
    status: 'not_attempted',
    reasonForDeduction: 'Candidate left this answer blank.',
    detailedFeedback: 'No answer was written.',
    markingComponents: [],
  }],
}, {
  paperStructure,
  officialPaperMaxMarks: 4,
});
assert.equal(genuinelyBlank.questions[0]?.status, 'not_attempted');
assert.equal(genuinelyBlank.questions[0]?.marksAwarded, 0);
assert.equal(genuinelyBlank.questions[0]?.flags?.includes('UNSUPPORTED_ZERO_REQUIRES_REVIEW') || false, false);

// A step-by-step, explicitly documented fully incorrect answer can still earn zero.
const evidenceBackedZero = processEvaluationIntegrity({
  evaluationId: 'evidence-backed-zero',
  officialPaperMaxMarks: 4,
  maximumMarks: 4,
  totalMarks: 0,
  questions: [{
    canonicalId: 'Q1(a)',
    questionNumber: '1',
    subQuestion: 'a',
    maximumMarks: 4,
    marksAwarded: 0,
    marksLost: 4,
    status: 'incorrect',
    reasonForDeduction: 'All journal entries reverse the debit and credit sides; no correct entry or working is present.',
    detailedFeedback: 'Every required journal entry is materially incorrect.',
    markingComponents: [{
      componentId: 'entry-1',
      componentType: 'APPLICATION',
      expectedRequirement: 'Correct debit and credit journal entry',
      studentEvidence: 'Debit and credit sides are fully reversed.',
      assessment: 'INCORRECT',
      marksAvailable: 4,
      marksAwarded: 0,
      marksDeducted: 4,
      deductionReason: 'The journal entry reverses the debit and credit sides.',
      confidence: 95,
    }],
  }],
}, {
  paperStructure,
  officialPaperMaxMarks: 4,
});
assert.equal(evidenceBackedZero.questions[0]?.status, 'incorrect');
assert.equal(evidenceBackedZero.questions[0]?.marksAwarded, 0);
assert.equal(evidenceBackedZero.questions[0]?.flags?.includes('UNSUPPORTED_ZERO_REQUIRES_REVIEW') || false, false);

console.log('Detected attempts require evidence-backed zero marking; genuine blanks and explicitly unsupported answers retain normal scoring.');
