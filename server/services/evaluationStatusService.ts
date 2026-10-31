export interface EvaluationStatusLike {
  status?: unknown;
  document_validation_status?: unknown;
  rejection_reason?: unknown;
  error_message?: unknown;
  progress_stage?: unknown;
  progress_percentage?: unknown;
  progress_message?: unknown;
  certification_status?: unknown;
  downloads_unlocked?: unknown;
  completed_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  [key: string]: unknown;
}

const DUPLICATE_UPLOAD_REASON =
  'This exact answer sheet was already submitted from another student account. The duplicate submission was stopped and no credits were deducted. Contact support if this is a legitimate test.';

const INVALID_DOCUMENT_REASON =
  'The submitted file did not pass answer-sheet validation. Please upload the correct handwritten CA answer sheet or contact support for a review.';

export function isFinalizationReviewMarker(evaluation: EvaluationStatusLike): boolean {
  const values = [
    evaluation.error_message,
    evaluation.progress_message,
    evaluation.rejection_reason,
  ];
  return values.some((value) => /(?:^|\b)FINALIZATION_FAILED\s*:/i.test(String(value || '').trim()));
}

/**
 * Only explicit document/abuse validation markers are hard document rejections.
 * Finalization/coverage/integrity failures remain NEEDS_REVIEW and must not be
 * surfaced as a rejected answer sheet.
 */
export function normalizeEvaluationRejectionStatus(evaluation: EvaluationStatusLike): EvaluationStatusLike {
  const documentStatus = String(evaluation.document_validation_status || '').trim().toUpperCase();
  const currentStatus = String(evaluation.status || '').trim().toUpperCase();
  const rejectionReason = String(evaluation.rejection_reason || '').trim();
  const errorMessage = String(evaluation.error_message || '').trim();
  const progressMessage = String(evaluation.progress_message || '').trim();

  const isDuplicateUpload = documentStatus === 'DUPLICATE_ACCOUNT_UPLOAD';
  const isRejectedDocument = documentStatus === 'REJECTED';
  const isExplicitDocumentRejection = isDuplicateUpload || isRejectedDocument;

  // An actual document-validation rejection takes precedence over any unrelated
  // stale diagnostic text that might also be present on the record.
  if (isExplicitDocumentRejection) {
    const reason = rejectionReason ||
      (isDuplicateUpload ? (errorMessage || DUPLICATE_UPLOAD_REASON) : (errorMessage || INVALID_DOCUMENT_REASON));
    return {
      ...evaluation,
      status: 'REJECTED',
      rejection_reason: reason,
      progress_stage: 'REJECTED',
      progress_percentage: 100,
      progress_message: isDuplicateUpload
        ? 'Duplicate answer-sheet upload across accounts'
        : 'Document validation rejected the submitted file',
      completed_at: evaluation.completed_at || evaluation.updated_at || evaluation.created_at || null,
    };
  }

  if (isFinalizationReviewMarker(evaluation)) {
    const reviewReason = errorMessage || rejectionReason || progressMessage ||
      'Automated finalization could not verify every detected answer. The evaluation is preserved for review.';
    return {
      ...evaluation,
      status: 'NEEDS_REVIEW',
      rejection_reason: null,
      error_message: reviewReason,
      certification_status: 'REVIEW_REQUIRED',
      downloads_unlocked: 0,
      progress_stage: 'NEEDS_REVIEW',
      progress_percentage: 100,
      progress_message: 'Evaluation preserved for academic review; this is not a document rejection.',
      completed_at: evaluation.completed_at || evaluation.updated_at || evaluation.created_at || null,
    };
  }

  // Preserve an explicit, already-persisted rejection decision (e.g. a reviewed
  // administrative decision), but never infer one from a generic reason string.
  if (currentStatus === 'REJECTED') {
    const reason = rejectionReason || errorMessage || INVALID_DOCUMENT_REASON;
    return {
      ...evaluation,
      status: 'REJECTED',
      rejection_reason: reason,
      progress_stage: 'REJECTED',
      progress_percentage: 100,
      completed_at: evaluation.completed_at || evaluation.updated_at || evaluation.created_at || null,
    };
  }

  // Legacy integrity errors were sometimes put in rejection_reason. Convert those
  // to a review state rather than turning PROCESSING/COMPLETED into REJECTED.
  if (rejectionReason) {
    return {
      ...evaluation,
      status: 'NEEDS_REVIEW',
      rejection_reason: null,
      error_message: errorMessage || rejectionReason,
      certification_status: 'REVIEW_REQUIRED',
      downloads_unlocked: 0,
      progress_stage: 'NEEDS_REVIEW',
      progress_percentage: 100,
      progress_message: progressMessage || 'Evaluation preserved for academic review.',
      completed_at: evaluation.completed_at || evaluation.updated_at || evaluation.created_at || null,
    };
  }

  return evaluation;
}

export function hasPersistedEvaluationRejection(evaluation: EvaluationStatusLike): boolean {
  if (isFinalizationReviewMarker(evaluation)) return false;
  const documentStatus = String(evaluation.document_validation_status || '').trim().toUpperCase();
  const currentStatus = String(evaluation.status || '').trim().toUpperCase();
  return documentStatus === 'DUPLICATE_ACCOUNT_UPLOAD' ||
    documentStatus === 'REJECTED' ||
    currentStatus === 'REJECTED';
}
