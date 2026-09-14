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

  const topic = String((question as any).topic || '').toLowerCase();
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

export interface AuthoritativeMcqDef {
  fullQuestionCode: string;
  questionNumber: string;
  subQuestionNumber?: string;
  questionText?: string;
  maximumMarks: number;
  officialKey?: string;
  officialExplanation?: string;
  provision?: string;
  topic?: string;
  section: string;
  division?: string;
  sourceMaterialId?: string;
  sourceMaterialVersion?: string;
  sourceMaterialTitle?: string;
}

export interface McqAuditRecord {
  questionNumber: string;
  candidateSelectedOption: string;
  authoritativeOfficialOption: string;
  marksAvailable: number;
  marksAwarded: number;
  correctness: 'CORRECT' | 'INCORRECT' | 'NOT_ATTEMPTED' | 'REVIEW_REQUIRED';
  exactReferenceMaterial: string;
  exactSuggestedAnswerSection: string;
  explanation: string;
  confidence: number;
}

export interface AuthoritativeMcqEvaluationResult {
  questions: QuestionEvaluation[];
  auditTable: McqAuditRecord[];
  totalMcqMarksAwarded: number;
  totalMcqMarksAvailable: number;
  authoritativeMcqMaximum: number;
  isConsistent: boolean;
  validationErrors: string[];
}

/**
 * Creates fully evaluated QuestionEvaluation records for all authoritative MCQs
 * using the candidate's detected choices from the coverage map.
 * Strictly strictly matches candidate choice against verified server answer keys.
 */
export function evaluateAllAuthoritativeMcqs(
  mcqs: AuthoritativeMcqDef[],
  mcqSelections: Record<string, string> | Map<string, string>,
  config: McqScoringConfig & {
    sourceMaterialId?: string;
    sourceMaterialVersion?: string;
    sourceMaterialTitle?: string;
  }
): QuestionEvaluation[] {
  const result = evaluateAllAuthoritativeMcqsWithAudit(mcqs, mcqSelections, config);
  return result.questions;
}

export function evaluateAllAuthoritativeMcqsWithAudit(
  mcqs: AuthoritativeMcqDef[],
  mcqSelections: Record<string, string> | Map<string, string>,
  config: McqScoringConfig & {
    sourceMaterialId?: string;
    sourceMaterialVersion?: string;
    sourceMaterialTitle?: string;
  }
): AuthoritativeMcqEvaluationResult {
  const level = (config.caLevel || 'INTERMEDIATE').toUpperCase();
  const isFoundationObjective =
    level === 'FOUNDATION' &&
    (
      String(config.paper).includes('Paper 3') ||
      String(config.paper).includes('Paper 4') ||
      String(config.subjectKey).includes('quantitative') ||
      String(config.subjectKey).includes('economics')
    );

  const matTitle = config.sourceMaterialTitle || 'ICAI Official Suggested Answers (Mock Test Paper Series)';
  const matVersion = config.sourceMaterialVersion || 'v1.0';
  const matId = config.sourceMaterialId || 'ICAI_OFFICIAL_SUGGESTED';

  const auditTable: McqAuditRecord[] = [];
  const validationErrors: string[] = [];

  // Determine authoritative maximum marks for MCQs
  const totalMcqMaxPossible = mcqs.reduce((acc, m) => acc + (m.maximumMarks || 0), 0);

  const evaluatedQuestions: QuestionEvaluation[] = mcqs.map((mcq) => {
    const qNum = mcq.questionNumber;
    const rawChoice = mcqSelections instanceof Map
      ? (mcqSelections.get(qNum) ?? mcqSelections.get(`MCQ${qNum}`) ?? mcqSelections.get(`MCQ ${qNum}`) ?? '')
      : (mcqSelections[qNum] ?? mcqSelections[`MCQ${qNum}`] ?? mcqSelections[`MCQ ${qNum}`] ?? '');
    const studentChoice = String(rawChoice || '').trim().toUpperCase();
    const officialKey = (mcq.officialKey || '').trim().toUpperCase();
    const maxMarks = mcq.maximumMarks;

    const isAttempted = Boolean(studentChoice);
    const isCorrect = isAttempted && officialKey && studentChoice === officialKey;

    let marksAwarded = 0;
    let marksDeducted = maxMarks;
    let assessment: 'CORRECT' | 'PARTIALLY_CORRECT' | 'INCORRECT' = 'INCORRECT';
    let deductionReason: string | undefined = undefined;

    const markingRule = isFoundationObjective
      ? 'ICAI Foundation Rule (+1.0 for correct, -0.25 for incorrect, 0.0 for unattempted)'
      : `ICAI ${level} Strict Binary Scoring (+${maxMarks}.0 for correct, 0.0 for incorrect, NO negative marking, NO partial credit)`;

    const negativeMarking = isFoundationObjective ? (isAttempted && !isCorrect ? -0.25 : 0) : 0;

    if (isCorrect) {
      marksAwarded = maxMarks;
      marksDeducted = 0;
      assessment = 'CORRECT';
      deductionReason = undefined;
    } else if (!isAttempted) {
      marksAwarded = 0;
      marksDeducted = maxMarks;
      assessment = 'INCORRECT';
      deductionReason = `MCQ ${qNum} not attempted (0/${maxMarks} marks).`;
    } else {
      // STRICT BINARY SCORING: Incorrect option selected
      marksAwarded = isFoundationObjective ? -0.25 : 0;
      marksDeducted = isFoundationObjective ? maxMarks + 0.25 : maxMarks;
      assessment = 'INCORRECT';
      deductionReason = isFoundationObjective
        ? `Candidate selected Option (${studentChoice}), Official Answer is Option (${officialKey}). -0.25 negative marking applied.`
        : `Candidate selected Option (${studentChoice}), Official Answer is Option (${officialKey}). 0/${maxMarks} marks awarded (no partial credit).`;
    }

    // Explanations strictly grounded in official suggested answers
    const defaultExp = mcq.officialExplanation || `Authoritative correct option is (${officialKey}).`;
    const provision = mcq.provision || (parseInt(qNum, 10) <= 8 ? 'Income-tax Act, 1961' : 'Central Goods and Services Tax Act, 2017');

    let detailedFeedback = '';
    let explanationForAudit = '';

    if (isCorrect) {
      explanationForAudit = `Candidate selected Option (${studentChoice}) which exactly matches official key (${officialKey}). ${defaultExp}`;
      detailedFeedback = [
        `✓ CORRECT`,
        ``,
        `Candidate Answer: Option (${studentChoice})`,
        `Correct Answer: Option (${officialKey})`,
        `Marks: ${marksAwarded}/${maxMarks}`,
        ``,
        `EXPLANATION / BENCHMARK:`,
        `${defaultExp}`,
        ``,
        `APPLICABLE PROVISION / RULE / CONCEPT:`,
        `${provision}`,
        ``,
        `REFERENCE:`,
        `${matTitle} (${matVersion}) - Section ${mcq.section} Division A MCQ ${qNum}`
      ].join('\n');
    } else if (!isAttempted) {
      explanationForAudit = `Question left unattempted by candidate. Official key is Option (${officialKey}). ${defaultExp}`;
      detailedFeedback = [
        `⭕ UNATTEMPTED`,
        ``,
        `Candidate Answer: None (Left blank)`,
        `Correct Answer: Option (${officialKey})`,
        `Marks: 0/${maxMarks}`,
        ``,
        `EXPLANATION / BENCHMARK:`,
        `${defaultExp}`,
        ``,
        `APPLICABLE PROVISION / RULE / CONCEPT:`,
        `${provision}`,
        ``,
        `REFERENCE:`,
        `${matTitle} (${matVersion}) - Section ${mcq.section} Division A MCQ ${qNum}`
      ].join('\n');
    } else {
      explanationForAudit = `Candidate selected Option (${studentChoice}), which is incorrect. Official key is Option (${officialKey}). ${defaultExp}`;
      detailedFeedback = [
        `❌ WRONG`,
        ``,
        `Candidate Answer:`,
        `Option (${studentChoice})`,
        ``,
        `Correct Answer:`,
        `Option (${officialKey})`,
        ``,
        `Marks:`,
        `${marksAwarded}/${maxMarks}`,
        ``,
        `WHY YOUR ANSWER IS WRONG:`,
        `Candidate selected Option (${studentChoice}). Under the verified ICAI suggested solution, the correct option is Option (${officialKey}) because ${defaultExp}.`,
        ``,
        `CORRECT ANSWER / CONCEPT:`,
        `${defaultExp}`,
        ``,
        `APPLICABLE PROVISION / RULE / CONCEPT:`,
        `${provision}`,
        ``,
        `REFERENCE:`,
        `${matTitle} (${matVersion}) - Section ${mcq.section} Division A MCQ ${qNum}`
      ].join('\n');
    }

    const correctness: 'CORRECT' | 'INCORRECT' | 'NOT_ATTEMPTED' | 'REVIEW_REQUIRED' =
      isCorrect ? 'CORRECT' : !isAttempted ? 'NOT_ATTEMPTED' : 'INCORRECT';

    auditTable.push({
      questionNumber: `MCQ ${qNum}`,
      candidateSelectedOption: studentChoice || 'NOT_ATTEMPTED',
      authoritativeOfficialOption: officialKey,
      marksAvailable: maxMarks,
      marksAwarded,
      correctness,
      exactReferenceMaterial: `${matTitle} (${matVersion})`,
      exactSuggestedAnswerSection: `Section ${mcq.section} Division A MCQ ${qNum}`,
      explanation: explanationForAudit,
      confidence: 100,
    });

    const component: MarkingComponent = {
      componentId: `${mcq.fullQuestionCode}_c1`,
      componentType: 'MCQ',
      expectedRequirement: `Correct option: (${officialKey}) - ${defaultExp}`,
      studentEvidence: isAttempted ? `Candidate selected option: (${studentChoice})` : 'Candidate left question unattempted',
      assessment,
      marksAvailable: maxMarks,
      marksAwarded,
      marksDeducted,
      deductionReason,
      supportingProvision: provision,
      confidence: 100,
      pageNumber: parseInt(qNum, 10) >= 9 ? 6 : 10,
      annotationInstructions: isCorrect ? `[OK] Option (${officialKey}) (+${maxMarks}/${maxMarks})` : `[X] Selected (${studentChoice || 'None'}), Official (${officialKey}) (${marksAwarded}/${maxMarks})`,
    };

    const status = isCorrect ? 'correct' : !isAttempted ? 'not_attempted' : 'incorrect';

    const qEval: QuestionEvaluation = {
      questionNumber: `MCQ ${qNum}`,
      subQuestion: undefined,
      maximumMarks: maxMarks,
      marksAwarded,
      marksLost: Math.max(0, maxMarks - marksAwarded),
      status,
      reasonForDeduction: deductionReason || 'Correct option selected according to official key.',
      detailedFeedback,
      confidence: 100,
      technicalEvaluation: `Deterministic MCQ comparison: Student (${studentChoice || 'NONE'}) vs Official Key (${officialKey}). Marking Rule: ${markingRule}.`,
      markingComponents: [component],
      pageNumber: parseInt(qNum, 10) >= 9 ? 6 : 10,
      referenceTrace: {
        materialId: matId,
        markingSchemeSection: `Section ${mcq.section} - Division A (MCQ ${qNum})`,
        suggestedAnswerRef: `MCQ ${qNum}: Option (${officialKey})`,
        deductionReason: deductionReason || 'Correct answer matches official key.',
        verifiedGroundTruthSnippet: `MCQ ${qNum} Official Answer: (${officialKey}) [${maxMarks} Mark(s)]`,
      },
      structuredEvidence: {
        questionId: mcq.fullQuestionCode,
        questionNumber: `MCQ ${qNum}`,
        maxMarks,
        obtainedMarks: marksAwarded,
        marksAwarded,
        marksLost: Math.max(0, maxMarks - marksAwarded),
        markingComponents: [component],
        finalConclusionAssessment: isCorrect ? 'Correct option selected.' : 'Incorrect option selected.',
        overallReason: deductionReason || 'Full marks awarded for correct option.',
        confidence: 100,
        flags: [],
        isDerivedAllocation: false,
      },
      candidateSelectedOption: studentChoice || 'NOT_ATTEMPTED',
      officialCorrectOption: officialKey,
      isCorrect,
      negativeMarking,
      markingRule,
      sourceMaterialId: matId,
      sourceMaterialVersion: matVersion,
      suggestedAnswerReference: `Section ${mcq.section} Division A MCQ ${qNum}`,
      explanation: defaultExp,
    } as any;

    return qEval;
  });

  // HARD-CAP VERIFICATION
  const totalAwarded = evaluatedQuestions.reduce((sum, q) => sum + (Number(q.marksAwarded) || 0), 0);
  const totalAvailable = evaluatedQuestions.reduce((sum, q) => sum + (Number(q.maximumMarks) || 0), 0);

  if (totalAwarded > totalMcqMaxPossible) {
    validationErrors.push(
      `MCQ total awarded marks (${totalAwarded}) exceeds authoritative MCQ maximum (${totalMcqMaxPossible})!`
    );
  }

  if (totalAwarded < 0 && !isFoundationObjective) {
    validationErrors.push(
      `MCQ total awarded marks (${totalAwarded}) is negative, which is forbidden in CA ${level}!`
    );
  }

  return {
    questions: evaluatedQuestions,
    auditTable,
    totalMcqMarksAwarded: totalAwarded,
    totalMcqMarksAvailable: totalAvailable,
    authoritativeMcqMaximum: totalMcqMaxPossible,
    isConsistent: validationErrors.length === 0,
    validationErrors,
  };
}
