import assert from 'node:assert/strict';
import {
  hasPersistedEvaluationRejection,
  normalizeEvaluationRejectionStatus,
} from '../services/evaluationStatusService.js';

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
  id: 'eval_integrity_reject',
  status: 'PROCESSING',
  document_validation_status: 'VERIFIED',
  rejection_reason: 'Reference material integrity checks failed.',
});
assert.equal(staleWorkerStatus.status, 'REJECTED');
assert.equal(staleWorkerStatus.rejection_reason, 'Reference material integrity checks failed.');

const staleCompletedStatus = normalizeEvaluationRejectionStatus({
  id: 'eval_stale_completed',
  status: 'COMPLETED',
  document_validation_status: 'DUPLICATE_ACCOUNT_UPLOAD',
  error_message: 'Duplicate cross-account upload.',
});
assert.equal(staleCompletedStatus.status, 'REJECTED');

// Regression: finalization failures were sometimes persisted only in error_message,
// leaving status PROCESSING and rejection_reason empty even though the grader had
// detected answer content that it could not evaluate.
const staleFinalizationFailure = normalizeEvaluationRejectionStatus({
  id: 'eval_finalization_failed',
  status: 'PROCESSING',
  document_validation_status: 'VERIFIED',
  rejection_reason: '',
  error_message: 'FINALIZATION_FAILED: Page 2 contains student content for Q1, Q1(a) but none are evaluated.',
  created_at: '2026-10-27T10:00:00.000Z',
});
assert.equal(staleFinalizationFailure.status, 'REJECTED');
assert.match(String(staleFinalizationFailure.rejection_reason), /^FINALIZATION_FAILED:/);
assert.equal(staleFinalizationFailure.progress_stage, 'REJECTED');
assert.equal(staleFinalizationFailure.progress_percentage, 100);
assert.equal(hasPersistedEvaluationRejection(staleFinalizationFailure), true);

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

console.log('✅ Evaluation status recovery tests passed (stale rejection markers remain terminal).');
