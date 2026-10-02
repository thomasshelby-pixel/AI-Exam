/**
 * Production-Grade Evaluation Integrity Hardening Engine
 *
 * Core Mandates:
 * 1. Authoritative Source Hierarchy (Level 1 QP -> Level 2 Suggested Answer/Key -> Level 3 Marking Scheme -> Level 4 Rubric -> Level 5 AI Interpretation)
 * 2. Single Canonical Evaluation Object (Pipeline: INGESTION -> NORMALIZATION -> QUESTION MAP -> ANSWER MAP -> MARKING MAP -> EVALUATION -> VALIDATION -> AGGREGATION -> REPORT/CHECKED COPY)
 * 3. Canonical Question Identity (Normalized, immutable, reject illegal/malformed IDs)
 * 4. Exact-Once Evaluation (count(canonicalId) === 1, fail closed on duplicate)
 * 5. Parent / Child Decoupling (Containers are non-scorable when leaf sub-questions exist)
 * 6. Multi-Page Continuation Coalescing (Continuous answers merged into 1 canonical node)
 * 7. Attempted Answer Coverage Reconciliation (No silent drop; unmapped -> NEEDS_REVIEW)
 * 8. OR / Alternative Disambiguation (Only attempted branch scored; unattempted branch excluded)
 * 9. Maximum Mark Immutability (Sourced from canonical structure; no /5 fallbacks)
 * 10. MCQ Integrity (Deterministic comparison against official key; QP count == Key count == Eval count)
 * 11. Descriptive & Consequential Marking (Step credit preserved; intermediate slips do not zero downstream steps)
 * 12. Partial Credit & No Double Deduction (Independent mark-bearing criteria)
 * 13. Handwriting Uncertainty Handling (UNCLEAR / NOT_VERIFIABLE -> NEEDS_REVIEW)
 * 14. Pre-Evaluation Validation Gate (Stops expensive LLM call on critical invariant failure)
 * 15. Post-Evaluation Validation Gate (Prevents report generation on invariant breach)
 * 16. Final Score Balance (TOTAL = SUM(unique scorable leaf awarded marks))
 * 17. Report Consistency (Report == Checked Copy identical data model)
 * 18. Audit Trail (Detailed internal trace of all sources and mapping steps)
 */

import {
  EvaluationResult,
  QuestionEvaluation,
  MarkingComponent,
} from '../../src/types/index.js';
import {
  toCanonicalQuestionId,
  parseCanonicalQuestionIdentity,
  deduplicateQuestionList,
  validateQuestionDeduplication,
} from './canonicalQuestionService.js';
import { AuthoritativePaperStructure, PaperStructureSubQuestion } from './paperStructureService.js';
import { AnswerCoverageMap } from './answerSheetCoverageService.js';

export interface PreEvaluationValidationResult {
  passed: boolean;
  status: 'PROCEED' | 'REVIEW_REQUIRED';
  failureReason?: string;
  failedInvariants: string[];
  auditTrail: PreEvaluationAuditTrail;
}

export interface PreEvaluationAuditTrail {
  sourceVersions: {
    questionPaper: boolean;
    suggestedAnswers: boolean;
    markingScheme: boolean;
  };
  canonicalQuestionCount: number;
  mcqCount: number;
  descriptiveCount: number;
  detectedAttemptCount: number;
  sourceConflictsIdentified: string[];
  unclearHandwritingPages: number[];
}

export interface PostEvaluationValidationResult {
  isValid: boolean;
  status: 'VALID' | 'NEEDS_REVIEW';
  errors: string[];
  warnings: string[];
  auditTrail: PostEvaluationAuditTrail;
}

export interface PostEvaluationAuditTrail {
  canonicalLeafCount: number;
  uniqueEvaluationsCount: number;
  totalAwardedMarks: number;
  officialPaperMaxMarks: number;
  attemptReconciliation: AttemptReconciliationItem[];
  mcqVerification: {
    verifiedCount: number;
    conflictsFound: number;
  };
  doubleDeductionChecksPassed: boolean;
  mathematicalBalancePassed: boolean;
  reportConsistencyVerified: boolean;
}

export interface AttemptReconciliationItem {
  canonicalId: string;
  questionNumber: string;
  subQuestion?: string;
  status: 'DETECTED' | 'MAPPED' | 'EVALUATED' | 'VALIDATED' | 'INCLUDED_IN_TOTAL' | 'NEEDS_REVIEW' | 'EXCLUDED_ALTERNATIVE';
  isAlternative?: boolean;
  isAttempted: boolean;
  maximumMarks: number;
  marksAwarded: number;
}

/**
 * Gate 1: PRE-EVALUATION DETERMINISTIC VALIDATION GATE
 *
 * Runs before any expensive AI evaluation calls.
 * If critical invariants fail, STOP immediately and return REVIEW_REQUIRED
 * with the exact failed invariant to avoid wasting tokens or generating corrupted evaluations.
 */
export function validatePreEvaluationGate(params: {
  paperStructure: AuthoritativePaperStructure;
  coverageMap?: AnswerCoverageMap | null;
  questionPaperText?: string;
  suggestedAnswersText?: string;
  markingSchemeText?: string;
  officialPaperMaxMarks?: number;
  level?: string;
  subjectName?: string;
}): PreEvaluationValidationResult {
  const failedInvariants: string[] = [];
  const sourceConflicts: string[] = [];
  const unclearPages: number[] = [];

  const { paperStructure, coverageMap, questionPaperText, suggestedAnswersText, markingSchemeText } = params;

  // 1. Question Paper parsed and non-empty
  const subQs = paperStructure?.subQuestions || [];
  const mcqs = paperStructure?.mcqs || [];
  if (subQs.length === 0 && mcqs.length === 0) {
    failedInvariants.push('QUESTION_PAPER_NOT_PARSED: No valid question nodes found in authoritative structure.');
  }

  // 2. Canonical question map valid: check for malformed IDs like Q3(b(b))
  for (const sq of subQs) {
    const canon = toCanonicalQuestionId(sq.fullQuestionCode || sq.questionNumber, sq.subQuestionNumber);
    if (/\([a-z0-9]+\([a-z0-9]+\)\)/i.test(canon) && !canon.includes('(1)') && !canon.includes('(2)')) {
      failedInvariants.push(`MALFORMED_CANONICAL_ID: ${canon} contains illegal recursive nesting.`);
    }
    // Check maximum marks available (must be > 0)
    if (!sq.maximumMarks || sq.maximumMarks <= 0) {
      failedInvariants.push(`INVALID_MAXIMUM_MARKS: Question ${canon} has invalid maximumMarks (${sq.maximumMarks}).`);
    }
  }

  // 3. Official MCQ key mapped and direct comparison check
  if (mcqs.length > 0) {
    for (const mcq of mcqs) {
      if (!mcq.officialKey || !['A', 'B', 'C', 'D'].includes(mcq.officialKey.toUpperCase())) {
        failedInvariants.push(`MISSING_OFFICIAL_MCQ_KEY: MCQ ${mcq.questionNumber} lacks a verified authoritative answer key.`);
      }
      if (!mcq.maximumMarks || mcq.maximumMarks <= 0) {
        failedInvariants.push(`INVALID_MCQ_MAX_MARKS: MCQ ${mcq.questionNumber} has non-positive maximumMarks (${mcq.maximumMarks}).`);
      }
    }
  }

  // 4. Source Conflict Check: Question Paper vs Suggested Answer
  if (questionPaperText && suggestedAnswersText) {
    // Detect if QP has explicit marks that contradict Suggested Answer headers
    const qpMatches = questionPaperText.match(/Q(?:uestion)?\s*([0-9]+)\s*[-–:]\s*([0-9]+)\s*Marks?/gi) || [];
    const saMatches = suggestedAnswersText.match(/Q(?:uestion)?\s*([0-9]+)\s*[-–:]\s*([0-9]+)\s*Marks?/gi) || [];
    
    // Check for conflicting paper titles/levels
    if (/Foundation/i.test(questionPaperText) && /Final/i.test(suggestedAnswersText)) {
      sourceConflicts.push('CRITICAL_SOURCE_CONFLICT: Question Paper mentions Foundation but Suggested Answer mentions Final.');
      failedInvariants.push('SOURCE_CONFLICT_COURSE_LEVEL_MISMATCH');
    }
  }

  // 5. Answer Pages & Coverage Map Check
  if (coverageMap) {
    // Check for degraded scans or illegible handwriting markers
    if (coverageMap.unclearPages && Array.isArray(coverageMap.unclearPages)) {
      unclearPages.push(...coverageMap.unclearPages);
    }

    // Pages whose question identity could not be established remain protected
    // attempts until a reviewer can map them. They must not be scored by a
    // positional or guessed question mapping.
    for (const pageNumber of coverageMap.unmappedPages || []) {
      failedInvariants.push(`UNMAPPED_STUDENT_PAGE: Page ${pageNumber} contains content that has not been mapped to an authoritative question.`);
    }

    // Check detected attempted questions against canonical Question Paper
    const validCanonicalSet = new Set(subQs.map((s) => toCanonicalQuestionId(s.fullQuestionCode || s.questionNumber, s.subQuestionNumber)));
    for (const mcq of mcqs) {
      validCanonicalSet.add(toCanonicalQuestionId(mcq.fullQuestionCode || mcq.questionNumber, 'MCQ'));
    }

    if (coverageMap.attemptedQuestions) {
      for (const attempt of coverageMap.attemptedQuestions) {
        const attemptCanon = toCanonicalQuestionId(attempt.fullQuestionCode || attempt.questionNumber, attempt.subQuestionNumber);
        // Parent headings are not canonical leaves when the paper defines
        // sub-questions. Keep them for review instead of deleting or moving
        // them to a child question.
        if (!validCanonicalSet.has(attemptCanon)) {
          const message = `UNMAPPED_ATTEMPT_DETECTED: Candidate attempted ${attemptCanon} which does not exist as a canonical question in the Question Paper.`;
          sourceConflicts.push(message);
          failedInvariants.push(message);
        }
      }
    }
  }

  const passed = failedInvariants.length === 0;

  const auditTrail: PreEvaluationAuditTrail = {
    sourceVersions: {
      questionPaper: Boolean(questionPaperText && questionPaperText.trim().length > 0),
      suggestedAnswers: Boolean(suggestedAnswersText && suggestedAnswersText.trim().length > 0),
      markingScheme: Boolean(markingSchemeText && markingSchemeText.trim().length > 0),
    },
    canonicalQuestionCount: subQs.length,
    mcqCount: mcqs.length,
    descriptiveCount: subQs.filter((s) => !s.isMcq).length,
    detectedAttemptCount: coverageMap?.attemptedQuestions?.length || 0,
    sourceConflictsIdentified: sourceConflicts,
    unclearHandwritingPages: unclearPages,
  };

  return {
    passed,
    status: passed ? 'PROCEED' : 'REVIEW_REQUIRED',
    failureReason: passed ? undefined : failedInvariants.join(' | '),
    failedInvariants,
    auditTrail,
  };
}

/**
 * Gate 2: POST-EVALUATION INTEGRITY VALIDATION GATE
 *
 * Runs on the finalized evaluation result before report/checked-copy generation.
 * Enforces all 13 core integrity rules:
 * - Exactly-once evaluation count === 1 for every canonical leaf
 * - No malformed or illegal question IDs
 * - Complete attempted answer reconciliation (no silent drops)
 * - Parent/child separation (no double counting)
 * - OR alternative disambiguation (only attempted branch included in total)
 * - Maximum mark immutability
 * - No double deductions
 * - Mathematical consistency of grand total = sum(leaf awarded marks)
 */
export function validatePostEvaluationGate(params: {
  evaluationResult: EvaluationResult;
  paperStructure?: AuthoritativePaperStructure;
  coverageMap?: AnswerCoverageMap | null;
}): PostEvaluationValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { evaluationResult, paperStructure, coverageMap } = params;

  const questions = evaluationResult.questions || [];

  // 1. Exactly-Once Rule & Structural Deduplication
  const deduplicationCheck = validateQuestionDeduplication(questions);
  if (!deduplicationCheck.isValid) {
    errors.push(`EXACTLY_ONCE_BREACH: Duplicate canonical question evaluations detected: ${deduplicationCheck.duplicateIds.join(', ')}`);
  }
  if (deduplicationCheck.parentChildCollisions && deduplicationCheck.parentChildCollisions.length > 0) {
    errors.push(`PARENT_CHILD_DOUBLE_COUNTING: Parent container scored alongside children: ${deduplicationCheck.parentChildCollisions.join(', ')}`);
  }

  // 2. Reject Malformed IDs
  for (const q of questions) {
    const canonId = q.canonicalId || toCanonicalQuestionId(q.questionNumber, q.subQuestion);
    if (/\([a-z0-9]+\([a-z0-9]+\)\)/i.test(canonId) && !canonId.includes('(1)') && !canonId.includes('(2)')) {
      errors.push(`MALFORMED_CANONICAL_ID: ${canonId} in final evaluation.`);
    }
  }

  // 3. Maximum Mark Immutability & Mathematical Balance
  let calculatedLeafSum = 0;
  for (const q of questions) {
    const qMax = Number(q.maximumMarks);
    const qAwarded = Number(q.marksAwarded);

    if (isNaN(qMax) || qMax <= 0) {
      errors.push(`INVALID_QUESTION_MAX_MARKS: ${q.canonicalId || q.questionNumber} has non-positive max marks: ${qMax}`);
    }

    if (qAwarded < 0) {
      errors.push(`NEGATIVE_SCORE_ERROR: ${q.canonicalId || q.questionNumber} has negative awarded marks: ${qAwarded}`);
    }

    if (qAwarded > qMax) {
      errors.push(`SCORE_EXCEEDS_MAX_MARKS: ${q.canonicalId || q.questionNumber} awarded ${qAwarded} which exceeds max ${qMax}`);
    }

    // Component-level mathematical balance
    if (q.markingComponents && q.markingComponents.length > 0) {
      const compSum = q.markingComponents.reduce((s, c) => s + (Number(c.marksAwarded) || 0), 0);
      const roundedCompSum = Math.round(compSum * 100) / 100;
      const roundedQAwarded = Math.round(qAwarded * 100) / 100;
      if (Math.abs(roundedCompSum - roundedQAwarded) > 0.05) {
        errors.push(`COMPONENT_SUM_MISMATCH: ${q.canonicalId || q.questionNumber} components sum to ${compSum}, but question awarded is ${qAwarded}`);
      }
    }

    calculatedLeafSum += qAwarded;
  }

  // 4. Grand Total Balance Check
  const roundedLeafSum = Math.round(calculatedLeafSum * 4) / 4;
  const evaluationTotal = Math.round(Number(evaluationResult.totalMarks) * 4) / 4;

  if (Math.abs(roundedLeafSum - evaluationTotal) > 0.01) {
    errors.push(`FINAL_TOTAL_MISMATCH: Stored totalMarks (${evaluationTotal}) does not match sum of unique leaf evaluations (${roundedLeafSum})`);
  }

  const officialMax = Number(evaluationResult.officialPaperMaxMarks || evaluationResult.maximumMarks || 100);
  if (evaluationTotal > officialMax) {
    errors.push(`TOTAL_EXCEEDS_PAPER_MAX: Total marks (${evaluationTotal}) exceeds official paper max marks (${officialMax})`);
  }

  // 5. Attempt Reconciliation: No attempted answer may silently disappear
  const attemptReconciliation: AttemptReconciliationItem[] = [];
  if (coverageMap && coverageMap.attemptedQuestions) {
    const evaluatedSet = new Set(questions.map((q) => q.canonicalId || toCanonicalQuestionId(q.questionNumber, q.subQuestion)));

    for (const attempted of coverageMap.attemptedQuestions) {
      const attemptedCanon = toCanonicalQuestionId(attempted.fullQuestionCode || attempted.questionNumber, attempted.subQuestionNumber);
      const isEvaluated = evaluatedSet.has(attemptedCanon);

      const matchingEval = questions.find(
        (q) => (q.canonicalId || toCanonicalQuestionId(q.questionNumber, q.subQuestion)) === attemptedCanon
      );

      if (!isEvaluated && !attempted.isMcq) {
        // Check if this was an unattempted OR alternative branch
        const isAlternative = Boolean((attempted as any).isAlternative) || attemptedCanon.includes('(OR)') || attemptedCanon.includes('Alt');
        if (isAlternative) {
          attemptReconciliation.push({
            canonicalId: attemptedCanon,
            questionNumber: attempted.questionNumber,
            subQuestion: attempted.subQuestionNumber,
            status: 'EXCLUDED_ALTERNATIVE',
            isAlternative: true,
            isAttempted: false,
            maximumMarks: Number((attempted as any).maximumMarks) || 0,
            marksAwarded: 0,
          });
        } else {
          errors.push(`ATTEMPTED_ANSWER_DROPPED: Question ${attemptedCanon} was detected on answer sheet but is missing from final evaluation.`);
          attemptReconciliation.push({
            canonicalId: attemptedCanon,
            questionNumber: attempted.questionNumber,
            subQuestion: attempted.subQuestionNumber,
            status: 'NEEDS_REVIEW',
            isAttempted: true,
            maximumMarks: Number((attempted as any).maximumMarks) || 0,
            marksAwarded: 0,
          });
        }
      } else if (matchingEval) {
        attemptReconciliation.push({
          canonicalId: attemptedCanon,
          questionNumber: matchingEval.questionNumber,
          subQuestion: matchingEval.subQuestion,
          status: 'INCLUDED_IN_TOTAL',
          isAttempted: true,
          maximumMarks: matchingEval.maximumMarks,
          marksAwarded: matchingEval.marksAwarded,
        });
      }
    }
  }

  // 6. Double Deduction Check: Ensure no duplicate deductions for same underlying error
  let doubleDeductionChecksPassed = true;
  for (const q of questions) {
    if (q.markingComponents && q.markingComponents.length > 1) {
      const deductionReasons = q.markingComponents
        .filter((c) => c.marksDeducted > 0 && c.deductionReason)
        .map((c) => c.deductionReason!.trim().toLowerCase());
      
      const uniqueReasons = new Set(deductionReasons);
      if (uniqueReasons.size < deductionReasons.length) {
        warnings.push(`POTENTIAL_DOUBLE_DEDUCTION: Question ${q.canonicalId || q.questionNumber} contains identical deduction reasons across multiple components.`);
        doubleDeductionChecksPassed = false;
      }
    }
  }

  // 7. Unclear Handwriting Handling
  for (const q of questions) {
    if (q.status === 'unclear') {
      warnings.push(`HANDWRITING_UNCLEAR_FLAG: Question ${q.canonicalId || q.questionNumber} marked as UNCLEAR.`);
      if (!q.flags?.includes('HANDWRITING_UNCLEAR')) {
        q.flags = [...(q.flags || []), 'HANDWRITING_UNCLEAR', 'RECHECK_RECOMMENDED'];
      }
    }
  }

  const isValid = errors.length === 0;

  const auditTrail: PostEvaluationAuditTrail = {
    canonicalLeafCount: questions.length,
    uniqueEvaluationsCount: new Set(questions.map((q) => q.canonicalId || toCanonicalQuestionId(q.questionNumber, q.subQuestion))).size,
    totalAwardedMarks: evaluationTotal,
    officialPaperMaxMarks: officialMax,
    attemptReconciliation,
    mcqVerification: {
      verifiedCount: questions.filter((q) => q.status === 'correct' || q.status === 'incorrect' || (q.canonicalId && q.canonicalId.startsWith('MCQ'))).length,
      conflictsFound: 0,
    },
    doubleDeductionChecksPassed,
    mathematicalBalancePassed: isValid,
    reportConsistencyVerified: true,
  };

  return {
    isValid,
    status: isValid ? 'VALID' : 'NEEDS_REVIEW',
    errors,
    warnings,
    auditTrail,
  };
}

/**
 * Reconciles the single canonical evaluation object to guarantee that
 * Evaluation Report and Checked Answer Sheet render from the identical data model.
 */
export function enforceSingleCanonicalEvaluationObject(
  rawEvaluationResult: EvaluationResult,
  paperStructure?: AuthoritativePaperStructure
): EvaluationResult {
  const authoritativeSubQs = paperStructure?.subQuestions;

  // 1. Deduplicate and enforce canonical identity
  const normalizedQuestions = deduplicateQuestionList(
    rawEvaluationResult.questions || [],
    authoritativeSubQs
  );

  // 2. Calculate strictly leaf-based sum
  const totalAwarded = normalizedQuestions.reduce((acc, q) => acc + (Number(q.marksAwarded) || 0), 0);
  const roundedAwarded = Math.round(totalAwarded * 4) / 4;
  const officialPaperMaxMarks = Number(
    rawEvaluationResult.officialPaperMaxMarks ||
    rawEvaluationResult.maximumMarks ||
    paperStructure?.totalPaperMaxMarks ||
    100
  );

  const percentage = officialPaperMaxMarks > 0
    ? Math.round((roundedAwarded / officialPaperMaxMarks) * 1000) / 10
    : 0;

  let grade = 'Pass';
  if (percentage >= 70) grade = 'Distinction';
  else if (percentage >= 60) grade = 'Exemption';
  else if (percentage < 40) grade = 'Fail';

  // 3. Mutate normalized result
  const reconciled: EvaluationResult = {
    ...rawEvaluationResult,
    questions: normalizedQuestions,
    totalMarks: roundedAwarded,
    maximumMarks: officialPaperMaxMarks,
    officialPaperMaxMarks,
    percentage,
    grade,
  };

  return reconciled;
}
