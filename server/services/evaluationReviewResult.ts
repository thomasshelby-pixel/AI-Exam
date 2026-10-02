import type { CALevel, CheckingMode, EvaluationResult, MaterialType } from '../../src/types/index.js';
import type { AnswerCoverageMap } from './answerSheetCoverageService.js';

/**
 * Builds an explicit, non-scored result when attempt mapping or a hard
 * pre-evaluation invariant needs human review.
 */
export function createEvaluationReviewResult(options: {
  evaluationId: string;
  studentName: string;
  icaiRegistrationNumber: string;
  level: CALevel;
  subjectKey: string;
  subjectName: string;
  materialType: MaterialType;
  attempt?: string;
  paper?: string;
  checkingMode?: CheckingMode;
  officialPaperMaxMarks?: number;
  sourceFormat?: EvaluationResult['sourceFormat'];
  sourceMaterialIds?: EvaluationResult['sourceMaterialIds'];
  coverageMap: AnswerCoverageMap;
  errors: string[];
}): EvaluationResult {
  const maximumMarks = Number.isFinite(options.officialPaperMaxMarks)
    ? Number(options.officialPaperMaxMarks)
    : 0;
  const errors = Array.from(new Set(options.errors.filter(Boolean)));

  return {
    evaluationId: options.evaluationId,
    studentName: options.studentName || 'Student Candidate',
    icaiRegistrationNumber: options.icaiRegistrationNumber || 'Not provided',
    caLevel: options.level,
    subjectKey: options.subjectKey,
    subjectName: options.subjectName,
    materialType: options.materialType,
    attempt: options.attempt,
    paper: options.paper,
    sourceFormat: options.sourceFormat,
    sourceMaterialIds: options.sourceMaterialIds,
    evaluationDate: new Date().toISOString(),
    totalMarks: 0,
    maximumMarks,
    officialPaperMaxMarks: maximumMarks || undefined,
    percentage: 0,
    grade: 'NEEDS_REVIEW',
    confidenceScore: 0,
    checkingMode: options.checkingMode,
    overallSummary: 'No score was finalized. The uploaded answer pages are preserved and require question-mapping or integrity review.',
    strengths: [],
    weaknesses: [],
    topicPerformance: [],
    presentationAnalysis: {
      score: 0,
      feedback: 'Not scored; the evaluation is awaiting review.',
      workingNotesQuality: 'Not scored.',
      handwritingLegibility: 'Question mapping requires review.',
    },
    accuracyAnalysis: {
      calculationAccuracy: 'Not scored.',
      provisionsAccuracy: 'Not scored.',
      methodologyCorrectness: 'Not scored.',
    },
    recommendations: ['Review the preserved pages and resolve the listed integrity checks before scoring.'],
    questions: [],
    coverageMap: options.coverageMap,
    validationStatus: 'NEEDS_REVIEW',
    validationErrors: errors,
    completionGateReport: {
      isPassed: false,
      passedCount: 0,
      failedCount: Math.max(1, errors.length),
      checks: [],
      timestamp: new Date().toISOString(),
    },
    integrityAudit: {
      mathConsistent: false,
      checkedCopyConsistent: false,
      hardCompletionGatePassed: false,
      errors,
    },
  };
}
