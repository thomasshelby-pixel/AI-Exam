export interface EvaluationStatusLike {
  status?: unknown;
  document_validation_status?: unknown;
  rejection_reason?: unknown;
  error_message?: unknown;
  progress_stage?: unknown;
  progress_percentage?: unknown;
  progress_message?: unknown;
  completed_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  [key: string]: unknown;
}

const DUPLICATE_UPLOAD_REASON =
  'This exact answer sheet was already submitted from another student account. The duplicate submission was stopped and no credits were deducted. Contact support if this is a legitimate test.';

const INVALID_DOCUMENT_REASON =
  'The submitted file did not pass answer-sheet validation. Please upload the correct handwritten CA answer sheet or contact support for a review.';

/**
 * A rejection reason/document-validation rejection is a persisted terminal
 * decision. Background jobs and stale Firestore snapshots must not turn it back
 * into PROCESSING/QUEUED or a completed score.
 */
export function normalizeEvaluationRejectionStatus(evaluation: EvaluationStatusLike): EvaluationStatusLike {
  const documentStatus = String(evaluation.document_validation_status || '').trim().toUpperCase();
  const currentStatus = String(evaluation.status || '').trim().toUpperCase();
  const rejectionReason = String(evaluation.rejection_reason || '').trim();
  const errorMessage = String(evaluation.error_message || '').trim();

  const isDuplicateUpload = documentStatus === 'DUPLICATE_ACCOUNT_UPLOAD';
  const isRejectedDocument = documentStatus === 'REJECTED';
  // Finalization failures with unevaluated detected answer content are terminal
  // integrity failures. Older records sometimes stored this marker only in
  // error_message, leaving status as PROCESSING and rejection_reason empty.
  const isFinalizationFailure = /(?:^|\b)FINALIZATION_FAILED\s*:/i.test(errorMessage) ||
    /(?:^|\b)FINALIZATION_FAILED\s*:/i.test(String(evaluation.progress_message || '').trim());
  const hasPersistedRejection =
    isDuplicateUpload || isRejectedDocument || rejectionReason.length > 0 || isFinalizationFailure;

  if (!hasPersistedRejection) return evaluation;
  if (currentStatus === 'REJECTED' && rejectionReason) return evaluation;

  const reason = rejectionReason ||
    (isFinalizationFailure ? errorMessage || String(evaluation.progress_message || '') : '') ||
    (isDuplicateUpload ? (errorMessage || DUPLICATE_UPLOAD_REASON) : '') ||
    (isRejectedDocument ? (errorMessage || INVALID_DOCUMENT_REASON) : '') ||
    errorMessage ||
    INVALID_DOCUMENT_REASON;

  return {
    ...evaluation,
    status: 'REJECTED',
    rejection_reason: reason,
    progress_stage: 'REJECTED',
    progress_percentage: 100,
    progress_message: isDuplicateUpload
      ? 'Duplicate answer-sheet upload across accounts'
      : isFinalizationFailure
      ? 'Finalization failed: detected answer content was not evaluated'
      : 'Evaluation rejected by validation checks',
    completed_at: evaluation.completed_at || evaluation.updated_at || evaluation.created_at || null,
  };
}

export function hasPersistedEvaluationRejection(evaluation: EvaluationStatusLike): boolean {
  const documentStatus = String(evaluation.document_validation_status || '').trim().toUpperCase();
  const errorMessage = String(evaluation.error_message || '').trim();
  const progressMessage = String(evaluation.progress_message || '').trim();
  return documentStatus === 'DUPLICATE_ACCOUNT_UPLOAD' ||
    documentStatus === 'REJECTED' ||
    String(evaluation.rejection_reason || '').trim().length > 0 ||
    /(?:^|\b)FINALIZATION_FAILED\s*:/i.test(errorMessage) ||
    /(?:^|\b)FINALIZATION_FAILED\s*:/i.test(progressMessage);
}
