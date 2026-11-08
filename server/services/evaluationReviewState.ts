/**
 * Shared workflow classifier: review state is not an academic grade.
 * A final examiner decision supersedes stale V1 validation flags.
 */
export function isEvaluationPendingReview(evalData: any, resultJson: any): boolean {
  const data = evalData || {};
  const adminDecision = String(data.adminReviewStatus || '').trim().toUpperCase();
  if (['AFFIRMED', 'AMENDED', 'APPROVED', 'CERTIFIED'].includes(adminDecision)) return false;

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
  const reviewStatuses = new Set(['NEEDS_REVIEW', 'REVIEW_REQUIRED', 'VERIFICATION_REQUIRED', 'VALIDATION_FAILED']);

  return statuses.some((status) => reviewStatuses.has(status)) ||
    data.isTechnicalReviewState === true ||
    resultJson?.isTechnicalReviewState === true ||
    resultJson?.integrityAudit?.hardCompletionGatePassed === false ||
    resultJson?.completionGateReport?.isPassed === false;
}
