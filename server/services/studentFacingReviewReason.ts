/**
 * Convert internal evaluation-integrity diagnostics into safe, actionable
 * student-facing explanations. Raw validator errors remain available to staff.
 */
const REVIEW_RESULT_SLA =
  'You will receive your reviewed result within 24–48 working hours. We will notify you when the review is complete.';

function withReviewSla(reason: string): string {
  return `${reason} ${REVIEW_RESULT_SLA}`;
}

export function getStudentFacingReviewReason(evidence: unknown): string {
  const collect = (value: unknown): string[] => {
    if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
    if (Array.isArray(value)) return value.flatMap(collect);
    if (value && typeof value === 'object') {
      const row = value as Record<string, unknown>;
      return [
        row.error_message,
        row.errorMessage,
        row.validationErrors,
        row.finalizationErrors,
        row.unresolvedQuestions,
        row.errors,
        row.reason,
      ].flatMap(collect);
    }
    return [];
  };

  const diagnostic = collect(evidence).join(' | ').toUpperCase();

  if (
    /QUESTION_REFERENCE_REVIEW_REQUIRED|QUESTION_REFERENCE_NOT_LOCKED|SUGGESTED ANSWER SECTION|AUTHORITATIVE SUGGESTED ANSWER/.test(diagnostic)
  ) {
    return withReviewSla('The selected Question Paper and Suggested Answer could not be securely matched for at least one question. Your evaluated marks have been preserved, but the final certificate is paused until that reference is verified.');
  }

  if (
    /ATTEMPTED_QUESTION_UNMAPPED|ATTEMPTED_QUESTION_NOT_EVALUATED|ATTEMPTED_ANSWER_DROPPED|NEEDS_MAPPING_REVIEW|UNMAPPED_STUDENT_PAGE|UNMAPPED_ATTEMPT_DETECTED|SOURCE_CONFLICT|CANONICAL ATTEMPT RECORD/.test(diagnostic)
  ) {
    const mcqMentioned = /MCQ|OBJECTIVE/.test(diagnostic);
    return withReviewSla(mcqMentioned
      ? 'One or more answer sections could not be matched to the selected paper; an objective/MCQ section may be unmatched. Your uploaded answer sheet is preserved for review, and no re-upload is required.'
      : 'One or more handwritten answer sections could not be matched to the selected paper. Your uploaded answer sheet is preserved for review, and no re-upload is required.');
  }

  if (
    /HANDWRITING_UNCLEAR|MODEL_UNCERTAIN|ILLEGIBLE|UNREADABLE|BLURRY|POOR SCAN|CANNOT DECIPHER/.test(diagnostic)
  ) {
    return withReviewSla('At least one answer or page could not be read confidently. The marks already evaluated have been preserved; the unclear section will be checked before the final result is issued.');
  }

  if (
    /FAILED_TO_EVALUATE|TECHNICAL_FAILURE|AI_PROVIDER_UNAVAILABLE|AI_ANALYSIS_FAILED|AI_QUOTA_OR_BILLING/.test(diagnostic)
  ) {
    return withReviewSla('At least one page or question could not be processed successfully. The evaluation has been preserved and needs a technical check; no uncertain marks have been silently certified.');
  }

  if (
    /FINALIZATION_FAILED|SCORE_RECONCILIATION|RENDERED_SET_MISMATCH|COUNTED_SET_MISMATCH|TOTAL_RECONCILIATION|FINAL_TOTAL_MISMATCH|COMPONENT_SUM_MISMATCH/.test(diagnostic)
  ) {
    return withReviewSla('The question-wise marks and final score did not reconcile automatically. Your academic marks have been preserved, but the final result is paused until the score records are checked.');
  }

  return withReviewSla('Your evaluated answer sheet and academic marks have been preserved, but an automatic integrity check could not certify the final result. It has been held for verification rather than issuing an uncertain result.');
}
