/**
 * Convert internal evaluation-integrity diagnostics into safe, actionable
 * student-facing explanations. Raw validator errors remain available to staff.
 */
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
    return 'The selected Question Paper and Suggested Answer could not be securely matched for at least one question. Your evaluated marks have been preserved, but the final certificate is paused until that reference is verified. Check that the selected PYQ attempt and subject match the uploaded paper.';
  }

  if (
    /ATTEMPTED_QUESTION_UNMAPPED|ATTEMPTED_QUESTION_NOT_EVALUATED|ATTEMPTED_ANSWER_DROPPED|NEEDS_MAPPING_REVIEW|UNMAPPED_STUDENT_PAGE|UNMAPPED_ATTEMPT_DETECTED|SOURCE_CONFLICT|CANONICAL ATTEMPT RECORD/.test(diagnostic)
  ) {
    const mcqMentioned = /MCQ|OBJECTIVE/.test(diagnostic);
    return mcqMentioned
      ? 'One or more answer sections could not be matched to the selected PYQ question list; an objective/MCQ section may be the unmatched part. For an ICAI-certified copy, remove the separate MCQ booklet/pages and upload the descriptive answer pages only. Non-certified copies can continue through the normal process.'
      : 'One or more handwritten answer sections could not be matched to the selected PYQ question list. Check that the correct subject and attempt are selected, all descriptive answer pages are included and page order is clear. For an ICAI-certified copy, remove any separate MCQ booklet/pages before uploading.';
  }

  if (
    /HANDWRITING_UNCLEAR|MODEL_UNCERTAIN|ILLEGIBLE|UNREADABLE|BLURRY|POOR SCAN|CANNOT DECIPHER/.test(diagnostic)
  ) {
    return 'At least one answer or page could not be read confidently. Upload a sharper, well-lit scan with the complete answer and question labels visible; the marks already evaluated have been preserved for review.';
  }

  if (
    /FAILED_TO_EVALUATE|TECHNICAL_FAILURE|AI_PROVIDER_UNAVAILABLE|AI_ANALYSIS_FAILED|AI_QUOTA_OR_BILLING/.test(diagnostic)
  ) {
    return 'At least one page or question could not be processed successfully. The evaluation has been preserved and needs a technical check; no uncertain marks have been silently certified.';
  }

  if (
    /FINALIZATION_FAILED|SCORE_RECONCILIATION|RENDERED_SET_MISMATCH|COUNTED_SET_MISMATCH|TOTAL_RECONCILIATION|FINAL_TOTAL_MISMATCH|COMPONENT_SUM_MISMATCH/.test(diagnostic)
  ) {
    return 'The question-wise marks and final score did not reconcile automatically. Your academic marks have been preserved, but the final result is paused until the score records are checked.';
  }

  return 'Your evaluated answer sheet and academic marks have been preserved, but an automatic integrity check could not certify the final result. It has been held for verification rather than issuing an uncertain result.';
}
