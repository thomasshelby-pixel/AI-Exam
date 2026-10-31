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

function isFinalizationReviewMarker(evaluation: EvaluationStatusLike): boolean {
  const values = [
    evaluation.error_message,
    evaluation.progress_message,
    evaluation.rejection_reason,
  ];
  return values.some((value) => /(?:^|\\b)FINALIZATION_FAILED\\s*:/i.test(String(value || '').trim()));
}

/**
 * Normalize only explicit document/abuse rejections as REJECTED.
 * A finalization/integrity error is an evaluation review state, never a document
 * rejection. A generic rejection_reason by itself is not proof that the uploaded
 * file was invalid; the document-validation marker is the authoritative signal.
 */
export function normalizeEvaluationRejectionStatus(evaluation: EvaluationStatusLike): EvaluationStatusLike {
  const documentStatus = String(evaluation.document_validation_status || '').trim().toUpperCase();
  const currentStatus = String(evaluation.status || '').trim().toUpperCase();
  const rejectionReason = String(evaluation.rejection_reason || '').trim();
  const errorMessage = String(evaluation.error_message || '').trim();
  const progressMessage = String(evaluation.progress_message || '').trim();

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
      progress_message: 'Evaluation preserved for review; this is not a document rejection.',
      completed_at: evaluation.completed_at || evaluation.updated_at || evaluation.created_at || null,
    };
  }

  const isDuplicateUpload = documentStatus === 'DUPLICATE_ACCOUNT_UPLOAD';
  const isRejectedDocument = documentStatus === 'REJECTED';
  const isExplicitDocumentRejection = isDuplicateUpload || isRejectedDocument;

  if (!isExplicitDocumentRejection && currentStatus !== 'REJECTED') {
    // Do not turn an ordinary review/error message into a terminal rejection.
    return evaluation;
  }

  const reason = rejectionReason ||
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
      : 'Document validation rejected the submitted file',
    completed_at: evaluation.completed_at || evaluation.updated_at || evaluation.created_at || null,
  };
}

export function hasPersistedEvaluationRejection(evaluation: EvaluationStatusLike): boolean {
  if (isFinalizationReviewMarker(evaluation)) return false;
  const documentStatus = String(evaluation.document_validation_status || '').trim().toUpperCase();
  const currentStatus = String(evaluation.status || '').trim().toUpperCase();
  return documentStatus === 'DUPLICATE_ACCOUNT_UPLOAD' ||
    documentStatus === 'REJECTED' ||
    currentStatus === 'REJECTED';
}
