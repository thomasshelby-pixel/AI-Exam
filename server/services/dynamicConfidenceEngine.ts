/**
 * Dynamic AI Confidence Calculation Engine
 *
 * Implements Section 11 of the CA Exam Checker AI Architectural Specification:
 * "Confidence must reflect:
 *  - OCR/handwriting readability
 *  - page coverage
 *  - question mapping
 *  - reference completeness
 *  - reference consistency
 *  - marking certainty
 *  - calculation validation
 *  - unresolved conflicts
 *  - report/check-copy consistency.
 *
 * If meaningful evaluation uncertainty exists, confidence must reflect it."
 *
 * NEVER produces a hardcoded fixed value (like 94.5%).
 */

import { QuestionEvaluation, MarkingComponent } from '../../src/types/index.js';

export interface ConfidenceFactorsInput {
  questions: QuestionEvaluation[];
  totalPages?: number;
  coveredPages?: number[];
  referenceCompletenessRatio?: number;
  hasHandwritingIssues?: boolean;
  hasUnresolvedConflicts?: boolean;
  checkedCopyConsistent?: boolean;
  totalPaperMaxMarks?: number;
}

export interface ConfidenceBreakdown {
  compositeScore: number;
  factors: {
    ocrReadability: number;
    pageCoverage: number;
    questionMapping: number;
    referenceCompleteness: number;
    referenceConsistency: number;
    markingCertainty: number;
    calculationValidation: number;
    conflictResolution: number;
    checkCopyParity: number;
  };
  notes: string[];
}

/**
 * Computes a scientifically derived confidence score based on actual evidence and evaluation metrics.
 */
export function calculateDynamicAiConfidence(input: ConfidenceFactorsInput): ConfidenceBreakdown {
  const {
    questions = [],
    totalPages = 1,
    coveredPages = [],
    referenceCompletenessRatio = 1.0,
    hasHandwritingIssues = false,
    hasUnresolvedConflicts = false,
    checkedCopyConsistent = true,
    totalPaperMaxMarks = 100,
  } = input;

  const notes: string[] = [];

  // 1. OCR / Handwriting Readability (Base: 98, deductions for unclear handwriting)
  let ocrScore = 98;
  const hasUnclearQuestions = questions.some(
    (q) => q.status === 'unclear' || (q.flags && q.flags.some((f) => f.includes('HANDWRITING_UNCLEAR')))
  );
  if (hasHandwritingIssues || hasUnclearQuestions) {
    ocrScore = 78;
    notes.push('Degraded scan or unclear handwriting flagged in answer sheet.');
  }

  // 2. Page Coverage (Evaluated pages vs total pages)
  let pageCoverageScore = 98;
  const uniqueCovered = new Set(coveredPages.filter((p) => p > 0));
  if (totalPages > 0 && uniqueCovered.size > 0) {
    const coverageRatio = Math.min(1.0, uniqueCovered.size / totalPages);
    if (coverageRatio < 0.5) {
      pageCoverageScore = Math.max(30, Math.round(coverageRatio * 100));
      notes.push(`Severe page coverage gap (${Math.round(coverageRatio * 100)}% of pages mapped).`);
    } else if (coverageRatio < 0.7) {
      pageCoverageScore = 65;
      notes.push(`Partial page coverage (${Math.round(coverageRatio * 100)}% of pages mapped).`);
    } else if (coverageRatio < 0.9) {
      pageCoverageScore = 85;
    }
  }

  // 3. Question Mapping Certainty (Clean question discovery and isolation)
  let questionMappingScore = 98;
  const hasSubquestionBleed = questions.some((q) => q.flags && q.flags.some((f) => f.includes('BLEED_DETECTED')));
  if (hasSubquestionBleed) {
    questionMappingScore = 72;
    notes.push('Potential sub-question bleed detected between adjacent questions.');
  }

  // 4. Reference Completeness (QP + SA + MS triangulation)
  let refCompletenessScore = Math.round(55 + Math.min(1.0, referenceCompletenessRatio) * 43);
  if (referenceCompletenessRatio < 0.8) {
    notes.push('Missing suggested answer or marking scheme slices for some questions.');
  }

  // 5. Reference Consistency (Statutory references grounded in authoritative ground truth)
  let refConsistencyScore = 98;
  const hasStatutoryConflict = questions.some(
    (q) => q.flags && q.flags.some((f) => f.includes('CONFLICT') || f.includes('STATUTORY_MISMATCH'))
  );
  if (hasStatutoryConflict) {
    refConsistencyScore = 80;
    notes.push('Statutory reference conflict flagged in evaluation.');
  }

  // 6. Marking Certainty (Proportion of questions with granular component-level rubrics)
  let markingCertaintyScore = 96;
  const questionsWithComponents = questions.filter((q) => q.markingComponents && q.markingComponents.length > 0);
  const componentRatio = questions.length > 0 ? questionsWithComponents.length / questions.length : 1;
  if (componentRatio < 0.5) {
    markingCertaintyScore = 82;
    notes.push('Evaluation relies on question-level heuristics rather than full component breakdown.');
  } else if (componentRatio < 0.8) {
    markingCertaintyScore = 90;
  }

  // 7. Calculation Validation (Arithmetic consistency verification)
  let calcValidationScore = 99;
  let hasCalcMismatch = false;
  for (const q of questions) {
    if (q.markingComponents && q.markingComponents.length > 0) {
      const compSum = q.markingComponents.reduce((s, c) => s + (c.marksAwarded || 0), 0);
      if (Math.abs(compSum - (q.marksAwarded || 0)) > 0.1) {
        hasCalcMismatch = true;
        break;
      }
    }
  }
  if (hasCalcMismatch) {
    calcValidationScore = 75;
    notes.push('Minor arithmetic discrepancy between component sum and question total.');
  }

  // 8. Unresolved Conflicts
  let conflictScore = 98;
  if (hasUnresolvedConflicts || questions.some((q) => q.modeDifferenceCategory === 'REVIEW_REQUIRED')) {
    conflictScore = 70;
    notes.push('Unresolved evaluation conflicts require human examiner review.');
  }

  // 9. Report / Check-Copy Consistency
  let checkCopyScore = checkedCopyConsistent ? 99 : 75;
  if (!checkedCopyConsistent) {
    notes.push('Discrepancy detected between detailed report and checked copy annotations.');
  }

  // Weighted composite calculation:
  // OCR: 12%, Page Coverage: 12%, Question Mapping: 14%, Reference Completeness: 14%,
  // Reference Consistency: 12%, Marking Certainty: 12%, Calculation Validation: 12%,
  // Conflict Resolution: 7%, Check Copy: 5%
  const composite =
    ocrScore * 0.12 +
    pageCoverageScore * 0.12 +
    questionMappingScore * 0.14 +
    refCompletenessScore * 0.14 +
    refConsistencyScore * 0.12 +
    markingCertaintyScore * 0.12 +
    calcValidationScore * 0.12 +
    conflictScore * 0.07 +
    checkCopyScore * 0.05;

  // Clamp confidence between 65.0% and 98.5%
  const finalConfidence = Math.round(Math.max(65.0, Math.min(98.5, composite)) * 10) / 10;

  return {
    compositeScore: finalConfidence,
    factors: {
      ocrReadability: ocrScore,
      pageCoverage: pageCoverageScore,
      questionMapping: questionMappingScore,
      referenceCompleteness: refCompletenessScore,
      referenceConsistency: refConsistencyScore,
      markingCertainty: markingCertaintyScore,
      calculationValidation: calcValidationScore,
      conflictResolution: conflictScore,
      checkCopyParity: checkCopyScore,
    },
    notes,
  };
}
