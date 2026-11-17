import assert from 'node:assert/strict';
import { getAuthoritativePaperStructure } from '../services/paperStructureService.js';
import {
  classifyPreEvaluationFailures,
  validatePreEvaluationGate,
} from '../services/evaluationIntegrityHardening.js';

const questionPaperText = [
  'CA Intermediate Auditing and Ethics — Question Paper',
  'Question 5(a) - 14 Marks',
  'Explain the relevant requirements for issue of sweat equity shares.',
].join('\n');

const suggestedAnswersText = [
  'CA Intermediate Auditing and Ethics — Suggested Answers',
  'Question 5(a) - 4 Marks',
  'The answer should explain eligibility and approval requirements.',
].join('\n');

const markingSchemeText = [
  'CA Intermediate Auditing and Ethics — Marking Scheme',
  'Question 5(a) - 14 Marks',
  'Award marks for the relevant provisions, conditions, and application.',
].join('\n');

const paperStructure = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Auditing and Ethics',
  paper: 'Paper 5',
  materialType: 'PYQ',
  officialPaperMaxMarks: 100,
  questionPaperText,
  suggestedAnswersText,
  markingSchemeText,
});

assert.equal(
  paperStructure.subQuestions.find((question) => question.fullQuestionCode === 'Q5(a)')?.maximumMarks,
  14,
  'The selected Question Paper remains the primary source for the question maximum.',
);

const allocationConflict = paperStructure.markAllocationConflicts?.find((message) =>
  message.includes('Q5(a)') && message.includes('Suggested Answers')
);
assert.ok(allocationConflict, 'The QP / Suggested Answers disagreement must remain visible for review.');

const preGate = validatePreEvaluationGate({
  paperStructure,
  questionPaperText,
  suggestedAnswersText,
  markingSchemeText,
  officialPaperMaxMarks: 100,
  level: 'INTERMEDIATE',
  subjectName: 'Auditing and Ethics',
});

assert.equal(preGate.passed, false, 'A source mark conflict must not silently certify the paper.');
assert.ok(
  preGate.failedInvariants.some((message) => message.includes('MARK_ALLOCATION_SOURCE_CONFLICT')),
  'The pre-evaluation gate must preserve the exact source conflict diagnostic.',
);

const disposition = classifyPreEvaluationFailures(preGate.failedInvariants);
assert.ok(
  disposition.reviewOnlyFailures.some((message) => message.includes('MARK_ALLOCATION_SOURCE_CONFLICT')),
  'A mark-allocation conflict must be visible as a review-only hold.',
);
assert.equal(
  disposition.blockingFailures.some((message) => message.includes('MARK_ALLOCATION_SOURCE_CONFLICT')),
  false,
  'A source allocation disagreement must not short-circuit answer-sheet page analysis.',
);

const mixedDisposition = classifyPreEvaluationFailures([
  'MARK_ALLOCATION_SOURCE_CONFLICT: Q5(a) is 14 marks in the QP but 4 in the Suggested Answers.',
  'UNMAPPED_STUDENT_PAGE: Page 8 contains an unresolved answer block.',
  'QUESTION_PAPER_NOT_PARSED: No canonical question nodes were found.',
]);
assert.equal(mixedDisposition.blockingFailures.length, 1);
assert.match(mixedDisposition.blockingFailures[0], /QUESTION_PAPER_NOT_PARSED/);
assert.equal(mixedDisposition.reviewOnlyFailures.length, 2);

console.log('✅ Source allocation conflicts now allow page analysis but continue to block certification.');
