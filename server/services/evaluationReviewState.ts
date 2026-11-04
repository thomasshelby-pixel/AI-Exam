/**
 * Shared evaluation certification-state classifier.
 * Review state is a workflow decision, not an academic grade.
 */
export function isEvaluationPendingReview(evalData: any, resultJson: any): boolean {
  const data = evalData || {};
  const adminDecision = String(data.adminReviewStatus || '').trim().toUpperCase();
  // A final examiner decision supersedes stale V1 validation flags.
  if (['AFFIRMED', 'AMENDED', 'APPROVED', 'CERTIFIED'].includes(adminDecision)) {
    return false;
  }

  const statuses = [
    data.evaluationStatus,
    data.adminReviewStatus,
    data.validationStatus,
    data.certificationStatus,
    resultJson?.status,
    resultJson?.validationStatus,
    resultJson?.reviewStatus,
    resultJson?.certificationStatus,
    resultJson?.grade,
  ].map((value) => String(value || '').trim().toUpperCase());

  const reviewStatuses = new Set([
    'NEEDS_REVIEW',
    'REVIEW_REQUIRED',
    'VERIFICATION_REQUIRED',
    'VALIDATION_FAILED',
  ]);

  return statuses.some((status) => reviewStatuses.has(status)) ||
    data.isTechnicalReviewState === true ||
    resultJson?.isTechnicalReviewState === true ||
    resultJson?.integrityAudit?.hardCompletionGatePassed === false ||
    resultJson?.completionGateReport?.isPassed === false;
}
