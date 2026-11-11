export interface FacultyMockEvaluationEditLockSource {
  status?: unknown;
  retry_of_evaluation_id?: unknown;
  retryOfEvaluationId?: unknown;
  faculty_mock_review_retry_evaluation_id?: unknown;
  facultyMockReviewRetryEvaluationId?: unknown;
}

export interface FacultyMockEvaluationEditLocks {
  evaluationInProgress: boolean;
  reviewRetryCandidate: boolean;
}

/**
 * Historical completed/failed evaluations do not permanently lock editing:
 * each accepted evaluation carries its own immutable source snapshot. Keep
 * the mock locked only while an evaluation is running or an unused
 * NEEDS_REVIEW retry is still available for the original copy.
 */
export function getFacultyMockEvaluationEditLocks(
  evaluation: FacultyMockEvaluationEditLockSource,
): FacultyMockEvaluationEditLocks {
  const status = String(evaluation.status || '').trim().toUpperCase();
  const retryOfId = String(
    evaluation.retry_of_evaluation_id ?? evaluation.retryOfEvaluationId ?? '',
  ).trim();
  const reviewRetryId = String(
    evaluation.faculty_mock_review_retry_evaluation_id ??
      evaluation.facultyMockReviewRetryEvaluationId ??
      '',
  ).trim();

  return {
    evaluationInProgress: ['PROCESSING', 'QUEUED', 'PENDING'].includes(status),
    reviewRetryCandidate: status === 'NEEDS_REVIEW' && !retryOfId && !reviewRetryId,
  };
}

export interface FacultyMockEditabilityInput {
  verified?: boolean;
  evaluationInProgress?: boolean;
  hasPendingReviewRetry?: boolean;
  hasUnconsumedPaidCopy?: boolean;
  hasActivePaymentOrder?: boolean;
}

export interface FacultyMockEditabilityState {
  verified: boolean;
  hasEvaluation: boolean;
  hasIssuedStudentEntitlement: boolean;
  hasPendingReviewRetry: boolean;
  hasUnconsumedPaidCopy: boolean;
  scoringInputsLocked: boolean;
  accessTypeLocked: boolean;
  evaluationInProgress: boolean;
}

/**
 * Keep the UI editability preview and the server-side update guard on the same
 * rule. Any uncertainty is fail-closed. An unused paid copy protects the
 * student's already-purchased paper; a pending payment protects access type.
 * Completed/failed evaluations alone do not block future source corrections.
 */
export function deriveFacultyMockEditability(
  input: FacultyMockEditabilityInput,
): FacultyMockEditabilityState {
  const verified = input.verified !== false;
  const evaluationInProgress = Boolean(input.evaluationInProgress);
  const hasPendingReviewRetry = Boolean(input.hasPendingReviewRetry);
  const hasUnconsumedPaidCopy = Boolean(input.hasUnconsumedPaidCopy);
  const hasActivePaymentOrder = Boolean(input.hasActivePaymentOrder);

  const scoringInputsLocked = !verified ||
    evaluationInProgress ||
    hasPendingReviewRetry ||
    hasUnconsumedPaidCopy;
  const accessTypeLocked = scoringInputsLocked || hasActivePaymentOrder;

  return {
    verified,
    hasEvaluation: evaluationInProgress || hasPendingReviewRetry,
    hasIssuedStudentEntitlement: hasUnconsumedPaidCopy || hasActivePaymentOrder,
    hasPendingReviewRetry,
    hasUnconsumedPaidCopy,
    scoringInputsLocked,
    accessTypeLocked,
    evaluationInProgress,
  };
}
