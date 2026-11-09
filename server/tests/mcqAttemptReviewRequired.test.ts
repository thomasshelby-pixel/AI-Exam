import assert from 'node:assert/strict';
import {
  applyDeterministicMcqScoring,
  evaluateAllAuthoritativeMcqs,
} from '../services/deterministicMcqScorer.js';
import {
  buildCanonicalEvaluationLedger,
  buildCanonicalQuestionInventory,
  type IndependentAttemptRecord,
} from '../services/canonicalQuestionInventoryService.js';

const mcq = {
  fullQuestionCode: 'MCQ4',
  questionNumber: '4',
  subQuestionNumber: 'MCQ',
  maximumMarks: 2,
  officialKey: 'C',
  section: 'A',
  division: 'A',
  topic: 'Selected source-backed objective question',
};
const paperStructure: any = {
  paperTitle: 'MCQ unreadable-selection regression',
  totalPaperMaxMarks: 2,
  questions: [],
  subQuestions: [],
  mcqs: [mcq],
};
const config = {
  caLevel: 'INTERMEDIATE' as const,
  paper: 'Paper 1',
  subjectKey: 'advanced_accounting',
  mcqPageNumbers: { '4': 2 },
  mcqNeedsReview: ['4'],
};

const inventory = buildCanonicalQuestionInventory({ paperStructure });
const attempted = new Map<string, IndependentAttemptRecord>([
  ['MCQ4', {
    canonicalId: 'MCQ4',
    questionNumber: '4',
    subQuestion: 'MCQ',
    sourcePages: [2],
    isAttempted: true,
    isPartial: true,
    isContinuation: false,
    isCrossedOutWithNoReplacement: false,
    evidence: 'An MCQ response is visibly marked, but the selected option is unreadable.',
    studentSnippet: 'MCQ 4 response mark is faint.',
    isMcq: true,
  }],
]);

const unresolved = evaluateAllAuthoritativeMcqs([mcq], {}, config);
const unresolvedMcq = unresolved.find((question) => question.canonicalId === 'MCQ4');
assert.ok(unresolvedMcq, 'Every authoritative MCQ remains represented in the evaluation.');
assert.equal(unresolvedMcq?.status, 'unclear', 'A visible but unreadable MCQ response is not an incorrect or blank answer.');
assert.equal(unresolvedMcq?.marksAwarded, 0, 'No provisional academic marks are assigned while the selected option is unreadable.');
assert.equal(unresolvedMcq?.marksLost, 0, 'Unreadable option must not be recorded as marks lost.');
assert.ok(unresolvedMcq?.flags?.includes('MCQ_SELECTION_REVIEW_REQUIRED'));
assert.ok(unresolvedMcq?.flags?.includes('REVIEW_REQUIRED'));
assert.equal(unresolvedMcq?.candidateSelectedOption, 'UNREADABLE / AMBIGUOUS');

const reScored = applyDeterministicMcqScoring(unresolved, config);
const stillUnresolved = reScored.find((question) => question.canonicalId === 'MCQ4');
assert.equal(stillUnresolved?.status, 'unclear', 'The later deterministic MCQ pass must preserve the review state.');
assert.equal(stillUnresolved?.marksAwarded, 0);
assert.equal(stillUnresolved?.marksLost, 0, 'The re-score must not turn a review placeholder into a full-mark deduction.');

const ledger = buildCanonicalEvaluationLedger({
  runId: 'mcq-review-run',
  inventory,
  attemptedMap: attempted,
  evaluatedQuestions: reScored,
});
const ledgerRecord = ledger.records.find((record) => record.questionId === 'MCQ4');
assert.ok(ledgerRecord, 'The visible MCQ attempt must remain in the canonical ledger.');
assert.equal(ledgerRecord?.attempted, true);
assert.equal(ledgerRecord?.evaluationStatus, 'NEEDS_REVIEW');
assert.equal(ledgerRecord?.reviewRequired, true);
assert.match(ledgerRecord?.reviewReason || '', /manual option verification/i);
assert.equal(ledgerRecord?.counted, false, 'An unreadable option must not be counted as an academic zero.');
assert.equal(ledgerRecord?.awardedMarks, 0, 'The placeholder is not included in the score total.');
assert.equal(ledgerRecord?.annotationAnchor?.annotationType, 'EVALUATION_NOTE',
  'The report must show a review note rather than a wrong-answer MCQ badge.');
assert.equal(ledger.isReconciled, false, 'The overall result remains uncertified until the visible MCQ is checked.');
assert.ok(ledger.reconciliationErrors.some((error) => error.includes('ATTEMPTED_QUESTION_NEEDS_REVIEW')));

// A genuinely blank MCQ is still a legitimate unattempted zero.
const blank = evaluateAllAuthoritativeMcqs([mcq], {}, {
  caLevel: 'INTERMEDIATE',
  paper: 'Paper 1',
  subjectKey: 'advanced_accounting',
});
assert.equal(blank[0]?.status, 'not_attempted');
assert.equal(blank[0]?.marksAwarded, 0);
assert.equal(blank[0]?.flags?.includes('MCQ_SELECTION_REVIEW_REQUIRED') || false, false);

// A readable but wrong option remains an ordinary incorrect answer.
const wrong = evaluateAllAuthoritativeMcqs([mcq], { '4': 'B' }, {
  caLevel: 'INTERMEDIATE',
  paper: 'Paper 1',
  subjectKey: 'advanced_accounting',
});
assert.equal(wrong[0]?.status, 'incorrect');
assert.equal(wrong[0]?.marksAwarded, 0);
assert.equal(wrong[0]?.flags?.includes('MCQ_SELECTION_REVIEW_REQUIRED') || false, false);

console.log('Unreadable attempted MCQs remain review-required; blank and verified wrong MCQs retain normal scoring.');
