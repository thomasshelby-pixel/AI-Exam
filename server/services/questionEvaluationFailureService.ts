import type { QuestionEvaluation } from '../../src/types/index.js';

export type QuestionEvaluationFailureKind = 'REFERENCE_REVIEW' | 'TECHNICAL_FAILURE';

export function classifyQuestionEvaluationFailure(diagnostic: unknown): QuestionEvaluationFailureKind {
  const message = String(diagnostic || '').toUpperCase();
  if (
    /QUESTION_REFERENCE_NOT_LOCKED|QUESTION_REFERENCE_LOCK|QUESTION_REFERENCE_REVIEW_REQUIRED|SUGGESTED ANSWER SECTION|AUTHORITATIVE SUGGESTED ANSWER|REFERENCE.{0,24}(?:NOT LOCKED|NEEDS REVIEW|INCOMPLETE)/.test(message)
  ) {
    return 'REFERENCE_REVIEW';
  }
  return 'TECHNICAL_FAILURE';
}

/**
 * Keeps an attempted answer in the canonical result without turning a technical
 * or source-lock problem into an academic zero. Mapping/reference failures and
 * provider/output failures are deliberately reported as different states.
 */
export function createQuestionEvaluationFailure(options: {
  questionNumber: string;
  subQuestion?: string;
  canonicalId: string;
  maximumMarks: number;
  pages: number[];
  diagnostic: string;
}): QuestionEvaluation {
  const kind = classifyQuestionEvaluationFailure(options.diagnostic);
  const pageList = [...new Set((options.pages || []).filter((page) => Number.isInteger(page) && page > 0))];
  const questionCode = options.canonicalId || `Q${options.questionNumber}`;
  const safeDiagnostic = String(options.diagnostic || 'No additional diagnostic was available.')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 220);

  if (kind === 'REFERENCE_REVIEW') {
    return {
      questionNumber: options.questionNumber,
      subQuestion: options.subQuestion,
      canonicalId: questionCode,
      maximumMarks: options.maximumMarks,
      marksAwarded: 0,
      marksLost: 0,
      status: 'unclear',
      reasonForDeduction: 'The authoritative reference section could not be securely locked. This is not an academic deduction; the answer is preserved for reference verification.',
      detailedFeedback: `Candidate attempted ${questionCode} on page(s) ${pageList.join(', ') || 'not identified'}. The selected Question Paper / Suggested Answer reference could not be verified for this question. No academic marks have been assigned until the reference is checked. Diagnostic: ${safeDiagnostic}`,
      technicalEvaluation: 'Reference verification required; no academic scoring was performed.',
      flags: ['QUESTION_REFERENCE_REVIEW_REQUIRED', 'REVIEW_REQUIRED', 'RECHECK_RECOMMENDED'],
      pageNumber: pageList[0] || 1,
    };
  }

  return {
    questionNumber: options.questionNumber,
    subQuestion: options.subQuestion,
    canonicalId: questionCode,
    maximumMarks: options.maximumMarks,
    marksAwarded: 0,
    marksLost: 0,
    status: 'unclear',
    reasonForDeduction: 'Technical evaluation failure (not an academic deduction). Manual review required.',
    detailedFeedback: `Candidate attempted ${questionCode} on page(s) ${pageList.join(', ') || 'not identified'}. The configured AI fallback chain could not produce a valid question-level evaluation. No academic marks have been assigned to this question. Diagnostic: ${safeDiagnostic}`,
    technicalEvaluation: 'Question-level technical failure; academic scoring was not completed.',
    flags: ['FAILED_TO_EVALUATE', 'RECHECK_RECOMMENDED', 'TECHNICAL_FAILURE'],
    pageNumber: pageList[0] || 1,
  };
}
