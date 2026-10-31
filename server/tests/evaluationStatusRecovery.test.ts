import assert from 'node:assert/strict';
import {
  hasPersistedEvaluationRejection,
  normalizeEvaluationRejectionStatus,
} from '../services/evaluationStatusService.js';
import { buildCanonicalQuestionInventory, buildStudentAttemptManifest } from '../services/canonicalQuestionInventoryService.js';

const duplicateUpload = normalizeEvaluationRejectionStatus({
  id: 'eval_duplicate',
  status: 'PROCESSING',
  document_validation_status: 'DUPLICATE_ACCOUNT_UPLOAD',
  error_message: 'This exact answer sheet was already submitted from another account.',
  created_at: '2026-10-27T10:00:00.000Z',
});

assert.equal(duplicateUpload.status, 'REJECTED');
assert.match(String(duplicateUpload.rejection_reason), /already submitted/i);
assert.equal(duplicateUpload.progress_stage, 'REJECTED');
assert.equal(duplicateUpload.progress_percentage, 100);
assert.equal(duplicateUpload.progress_message, 'Duplicate answer-sheet upload across accounts');
assert.equal(hasPersistedEvaluationRejection(duplicateUpload), true);

const staleWorkerStatus = normalizeEvaluationRejectionStatus({
  id: 'eval_integrity_review',
  status: 'PROCESSING',
  document_validation_status: 'VERIFIED',
  rejection_reason: 'Reference material integrity checks failed.',
});
assert.equal(staleWorkerStatus.status, 'NEEDS_REVIEW');
assert.equal(staleWorkerStatus.rejection_reason, null);
assert.match(String(staleWorkerStatus.error_message), /integrity checks failed/i);
assert.equal(hasPersistedEvaluationRejection(staleWorkerStatus), false);

const staleCompletedStatus = normalizeEvaluationRejectionStatus({
  id: 'eval_stale_completed',
  status: 'COMPLETED',
  document_validation_status: 'DUPLICATE_ACCOUNT_UPLOAD',
  error_message: 'Duplicate cross-account upload.',
});
assert.equal(staleCompletedStatus.status, 'REJECTED');

// Regression: an internal finalization/coverage integrity failure is NOT a
// document rejection. Keep it in NEEDS_REVIEW and do not emit a rejection marker.
const staleFinalizationFailure = normalizeEvaluationRejectionStatus({
  id: 'eval_finalization_failed',
  status: 'PROCESSING',
  document_validation_status: 'VERIFIED',
  rejection_reason: '',
  error_message: 'FINALIZATION_FAILED: Page 2 contains student content for Q1, Q1(a) but none are evaluated.',
  created_at: '2026-10-27T10:00:00.000Z',
});
assert.equal(staleFinalizationFailure.status, 'NEEDS_REVIEW');
assert.equal(staleFinalizationFailure.rejection_reason, null);
assert.match(String(staleFinalizationFailure.error_message), /^FINALIZATION_FAILED:/);
assert.equal(staleFinalizationFailure.progress_stage, 'NEEDS_REVIEW');
assert.equal(staleFinalizationFailure.progress_percentage, 100);
assert.equal(hasPersistedEvaluationRejection(staleFinalizationFailure), false);

// A record already marked REJECTED by the old normalizer must also be repaired
// when its only marker is an internal FINALIZATION_FAILED diagnostic.
const legacyFalseRejection = normalizeEvaluationRejectionStatus({
  id: 'eval_legacy_false_rejection',
  status: 'REJECTED',
  document_validation_status: 'VERIFIED',
  rejection_reason: 'FINALIZATION_FAILED: Page 1 contains student content for Q7, Q7(b) but none are evaluated.',
});
assert.equal(legacyFalseRejection.status, 'NEEDS_REVIEW');
assert.equal(legacyFalseRejection.rejection_reason, null);
assert.equal(hasPersistedEvaluationRejection(legacyFalseRejection), false);

const transientErrorRemainsProcessing = normalizeEvaluationRejectionStatus({
  id: 'eval_transient_error',
  status: 'PROCESSING',
  document_validation_status: 'VERIFIED',
  rejection_reason: '',
  error_message: 'Network timeout while waiting for evaluator.',
});
assert.equal(transientErrorRemainsProcessing.status, 'PROCESSING');
assert.equal(hasPersistedEvaluationRejection(transientErrorRemainsProcessing), false);

const validProcessing = normalizeEvaluationRejectionStatus({
  id: 'eval_valid_processing',
  status: 'PROCESSING',
  document_validation_status: 'VERIFIED',
  rejection_reason: '',
  error_message: '',
});
assert.equal(validProcessing.status, 'PROCESSING');
assert.equal(validProcessing.rejection_reason, '');

// Regression: raw page OCR may emit both a parent heading (Q7) and its
// child answer (Q7(b)). Page audit must use the resolved attempt manifest leaf ID,
// otherwise finalization may incorrectly say none of the detected answers were evaluated.
const paperStructure: any = {
  paperTitle: 'CA Intermediate Taxation',
  totalPaperMaxMarks: 100,
  subQuestions: [
    { fullQuestionCode: 'Q7(a)', questionNumber: '7', subQuestionNumber: 'a', maximumMarks: 4, topic: 'Income tax computation' },
    { fullQuestionCode: 'Q7(b)', questionNumber: '7', subQuestionNumber: 'b', maximumMarks: 5, topic: 'GST input tax credit' },
  ],
  mcqs: [],
};
const inventory = buildCanonicalQuestionInventory({ paperStructure });
const manifest = buildStudentAttemptManifest({
  runId: 'run_parent_child_page_audit',
  totalPages: 2,
  inventory,
  rawPageOccurrences: [
    { questionCode: 'Q7', pageNumber: 1, studentSnippet: 'Question 7(b) GST input tax credit working and conclusion.' },
    { questionCode: 'Q7(b)', pageNumber: 1, studentSnippet: 'GST input tax credit working and conclusion.' },
    { questionCode: 'Q7', pageNumber: 2, studentSnippet: 'Question 7(b) continued calculation.' },
  ],
});
const pageOneAudit = manifest.pageCoverageAudit.find((page) => page.pageNumber === 1);
const pageTwoAudit = manifest.pageCoverageAudit.find((page) => page.pageNumber === 2);
assert.deepEqual(pageOneAudit?.detectedQuestionIds, ['Q7(b)']);
assert.deepEqual(pageTwoAudit?.detectedQuestionIds, ['Q7(b)']);
assert.deepEqual(manifest.attempts.map((attempt) => attempt.questionId), ['Q7(b)']);
console.log('✅ Evaluation status recovery tests passed (stale rejection markers remain terminal).');
