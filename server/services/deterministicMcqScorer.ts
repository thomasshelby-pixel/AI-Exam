/**
 * Deterministic MCQ Scorer for CA Examinations
 *
 * Implements strict, unyielding ICAI examination regulations:
 *
 * 1. CA Intermediate and CA Final:
 *    - Strict binary marking:
 *      - Correct option: FULL MARKS (+1.0 or +2.0).
 *      - Incorrect option: 0.0 marks.
 *      - Unattempted: 0.0 marks.
 *    - STRICTLY FORBIDDEN:
 *      - NO negative marking (-1, -2, -0.25, etc.).
 *      - NO partial marks (+0.5 out of 1.0, +1.0 out of 2.0).
 *      - NO subjective deductions or "requirement not fully satisfied" feedback.
 *
 * 2. CA Foundation:
 *    - Paper 1 (Accounting) & Paper 2 (Business Law): Descriptive step-marking.
 *    - Paper 3 (Quantitative Aptitude) & Paper 4 (Business Economics):
 *      - Correct option: +1.0 marks.
 *      - Incorrect option: -0.25 marks (negative marking).
 *      - Unattempted: 0.0 marks.
 */

import { MarkingComponent, QuestionEvaluation } from '../../src/types/index.js';

export interface McqScoringConfig {
  caLevel: 'FOUNDATION' | 'INTERMEDIATE' | 'FINAL';
  paper?: string;
  subjectKey?: string;
}

/**
 * Detects whether a question or marking component represents an objective MCQ.
 */
export function isMcqItem(
  question: Partial<QuestionEvaluation>,
  component?: Partial<MarkingComponent>
): boolean {
  if (component) {
    if (component.componentType === 'MCQ') return true;
    if ((component as any).isMcq === true) return true;
  }

  const qNum = String(question.questionNumber || '').trim().toLowerCase();
  if (qNum.startsWith('mcq') || qNum.includes('mcq') || qNum.includes('objective')) {
    return true;
  }

  const topic = String(question.topic || '').toLowerCase();
  if (topic.includes('multiple choice') || topic.includes('mcq') || topic.includes('case scenario mcq') || topic.includes('division a')) {
    return true;
  }

  const subNum = String(question.subQuestion || '').toLowerCase();
  if (subNum.includes('mcq') || subNum.includes('objective')) {
    return true;
  }

  if (component) {
    const req = String(component.expectedRequirement || '').toLowerCase();
    const evidence = String(component.studentEvidence || '').toLowerCase();
    const reason = String(component.deductionReason || '').toLowerCase();
    const isOptionFormat = (str: string) => /\b(option|choice)\s+[a-d]\b/i.test(str) || /\b(select|choose)\s+[a-d]\b/i.test(str);
    if (isOptionFormat(req) || isOptionFormat(evidence) || isOptionFormat(reason)) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates and scores an MCQ marking component deterministically.
 */
export function scoreMcqComponent(
  component: MarkingComponent,
  config: McqScoringConfig
): MarkingComponent {
  const level = (config.caLevel || 'INTERMEDIATE').toUpperCase();
  const maxAvailable = Number(component.marksAvailable) || 1.0;
  const isCorrect = component.assessment === 'CORRECT';
  const isPartiallyCorrect = component.assessment === 'PARTIALLY_CORRECT';

  // Check if negative marking applies (CA Foundation Paper 3 & 4 only)
  const isFoundationObjective =
    level === 'FOUNDATION' &&
    (
      String(config.paper).includes('Paper 3') ||
      String(config.paper).includes('Paper 4') ||
      String(config.subjectKey).includes('quantitative') ||
      String(config.subjectKey).includes('economics')
    );

  let marksAwarded = 0;
  let marksDeducted = maxAvailable;
  let assessment: 'CORRECT' | 'PARTIALLY_CORRECT' | 'INCORRECT' = 'INCORRECT';
  let deductionReason = component.deductionReason;

  if (isFoundationObjective) {
    // Foundation Paper 3 & 4: +1.0 for correct, -0.25 for incorrect, 0 for unattempted
    const isUnattempted =
      !component.studentEvidence ||
      component.studentEvidence.toLowerCase().includes('not attempted') ||
      component.studentEvidence.toLowerCase().includes('blank');

    if (isCorrect) {
      marksAwarded = maxAvailable;
      marksDeducted = 0;
      assessment = 'CORRECT';
      deductionReason = undefined;
    } else if (isUnattempted) {
      marksAwarded = 0;
      marksDeducted = maxAvailable;
      assessment = 'INCORRECT';
      deductionReason = 'Question not attempted. 0 marks awarded (No negative marking applied for unattempted).';
    } else {
      marksAwarded = -0.25;
      marksDeducted = maxAvailable + 0.25;
      assessment = 'INCORRECT';
      deductionReason = 'Incorrect option selected. -0.25 negative marking applied under ICAI Foundation rules.';
    }
  } else {
    // Intermediate & Final: Strict Binary Scoring (No partial, NO negative marks)
    if (isCorrect) {
      marksAwarded = maxAvailable;
      marksDeducted = 0;
      assessment = 'CORRECT';
      deductionReason = undefined;
    } else {
      // Regardless of whether raw model gave partial credit, force 0
      marksAwarded = 0;
      marksDeducted = maxAvailable;
      assessment = 'INCORRECT';

      if (isPartiallyCorrect) {
        deductionReason = `Objective MCQ: Incorrect option selected. No partial credit is permissible under ICAI ${level} regulations (0/${maxAvailable} marks).`;
      } else if (!deductionReason) {
        deductionReason = `Objective MCQ: Incorrect option selected. 0/${maxAvailable} marks awarded under ICAI regulations.`;
      }
    }
  }

  return {
    ...component,
    componentType: 'MCQ',
    marksAvailable: maxAvailable,
    marksAwarded,
    marksDeducted,
    assessment,
    deductionReason,
    markingCriterion: 'DETERMINISTIC_MCQ',
  };
}

/**
 * Applies deterministic MCQ scoring to all MCQ questions/components in a question set.
 */
export function applyDeterministicMcqScoring(
  questions: QuestionEvaluation[],
  config: McqScoringConfig
): QuestionEvaluation[] {
  return questions.map((q) => {
    const isQuestionMcq = isMcqItem(q);

    const updatedComponents = (q.markingComponents || []).map((c) => {
      if (isQuestionMcq || isMcqItem(q, c)) {
        return scoreMcqComponent(c, config);
      }
      return c;
    });

    if (isQuestionMcq || updatedComponents.some((c) => c.componentType === 'MCQ')) {
      const awardedSum = updatedComponents.reduce((acc, c) => acc + (Number(c.marksAwarded) || 0), 0);
      const maxAvailableSum = updatedComponents.reduce((acc, c) => acc + (Number(c.marksAvailable) || 0), 0);
      const qMax = Math.max(q.maximumMarks || 0, maxAvailableSum);

      return {
        ...q,
        markingComponents: updatedComponents,
        marksAwarded: awardedSum,
        maximumMarks: qMax,
        marksLost: Math.max(0, qMax - awardedSum),
      };
    }

    return q;
  });
}
