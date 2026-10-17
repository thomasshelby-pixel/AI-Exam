import type { EvaluationResult, QuestionEvaluation } from '../../src/types/index.js';
import type { AnswerCoverageMap, AttemptedQuestionMapping } from './answerSheetCoverageService.js';
import type { IntegrityProcessOptions } from './evaluationIntegrityEngine.js';
import { processEvaluationIntegrity } from './evaluationIntegrityEngine.js';
import { validatePostEvaluationGate } from './evaluationIntegrityHardening.js';
import {
  evaluateQuestionChunk,
  extractRelevantReferenceSnippets,
  type ChunkEvaluationContext,
  type ExtractedReferenceSnippets,
} from './questionChunkEvaluator.js';
import type { AuthoritativePaperStructure, PaperStructureSubQuestion } from './paperStructureService.js';
import { toCanonicalQuestionId } from './canonicalQuestionService.js';

const MAX_CORRECTION_ROUNDS = 2;
const MAX_PARALLEL_CORRECTIONS = 2;
// Hard ceiling on targeted question re-evaluation calls per uploaded answer sheet.
// If the ceiling is reached, remaining repairable items require review rather than more paid calls.
const MAX_REPAIR_CALLS_PER_EVALUATION = 4;

export type SupervisorStatus = 'PASS' | 'HUMAN_REVIEW';

export interface SupervisorAuditSummary {
  version: 'evaluation-supervisor-v1';
  status: SupervisorStatus;
  maxCorrectionRounds: number;
  correctionRoundsUsed: number;
  maxCorrectionCalls: number;
  correctionCallsUsed: number;
  correctionsApplied: number;
  correctedQuestionIds: string[];
  initialIssues: string[];
  unresolvedIssues: string[];
  checkedAt: string;
}

export interface EvaluationSupervisorParams {
  evaluationResult: EvaluationResult;
  pdfBuffer: Buffer;
  paperStructure: AuthoritativePaperStructure;
  questionPaperText: string;
  suggestedAnswersText: string;
  markingSchemeText: string;
  checkingMode: 'standard' | 'strict' | 'lenient';
  level: string;
  subjectName: string;
  officialPaperMaxMarks?: number;
  paper?: string;
  subjectKey?: string;
  materialId?: string;
  coverageMap?: AnswerCoverageMap | null;
}

export interface EvaluationSupervisorDependencies {
  evaluateChunk?: (context: ChunkEvaluationContext) => Promise<QuestionEvaluation>;
  reprocessIntegrity?: (result: EvaluationResult, options: IntegrityProcessOptions) => EvaluationResult;
  extractReferenceSnippets?: (
    fullQuestionCode: string,
    questionPaperText: string,
    suggestedAnswersText: string,
    markingSchemeText: string
  ) => ExtractedReferenceSnippets;
}

interface AuditState {
  issues: string[];
  warnings: string[];
  postEvaluationGate: ReturnType<typeof validatePostEvaluationGate>;
}

interface RepairTarget {
  canonicalId: string;
  mapping: AttemptedQuestionMapping;
  subQuestion: PaperStructureSubQuestion;
  issues: string[];
}

function canonicalQuestionId(question: QuestionEvaluation): string {
  return question.canonicalId || toCanonicalQuestionId(question.questionNumber, question.subQuestion);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function findAuthoritativeSubQuestion(
  mapping: AttemptedQuestionMapping,
  paperStructure: AuthoritativePaperStructure
): PaperStructureSubQuestion | undefined {
  const targetId = toCanonicalQuestionId(
    mapping.fullQuestionCode || mapping.questionNumber,
    mapping.subQuestionNumber,
    paperStructure.subQuestions
  );

  return paperStructure.subQuestions.find((question) => {
    const questionId = toCanonicalQuestionId(
      question.fullQuestionCode || question.questionNumber,
      question.subQuestionNumber,
      paperStructure.subQuestions
    );
    return questionId === targetId ||
      String(question.fullQuestionCode || '').toLowerCase() === String(mapping.fullQuestionCode || '').toLowerCase();
  });
}

function auditEvaluation(
  result: EvaluationResult,
  paperStructure: AuthoritativePaperStructure,
  coverageMap: AnswerCoverageMap | null | undefined,
  params: EvaluationSupervisorParams,
  extractReferences: NonNullable<EvaluationSupervisorDependencies['extractReferenceSnippets']>
): AuditState {
  const gate = validatePostEvaluationGate({
    evaluationResult: result,
    paperStructure,
    coverageMap,
  });
  const issues: string[] = [
    ...(result.validationErrors || []),
    ...gate.errors,
    ...gate.warnings,
  ];
  const warnings: string[] = [...gate.warnings];

  for (const question of result.questions || []) {
    const id = canonicalQuestionId(question);
    const maximum = Number(question.maximumMarks);
    const awarded = Number(question.marksAwarded);

    if (!Number.isFinite(maximum) || maximum <= 0) {
      issues.push('SUPERVISOR_INVALID_MAX_MARKS: ' + id);
    }
    if (!Number.isFinite(awarded)) {
      issues.push('SUPERVISOR_MISSING_OR_NON_NUMERIC_MARKS: ' + id);
    } else if (Number.isFinite(maximum) && (awarded < 0 || awarded > maximum)) {
      issues.push('SUPERVISOR_MARKS_OUT_OF_BOUNDS: ' + id);
    }

    if (question.status === 'unclear') {
      issues.push('SUPERVISOR_UNCLEAR_EVALUATION: ' + id);
    }
    if (question.flags?.includes('FAILED_TO_EVALUATE') || question.flags?.includes('TECHNICAL_FAILURE')) {
      issues.push('SUPERVISOR_EVALUATION_FAILURE: ' + id);
    }
    if (question.flags?.includes('NEEDS_MAPPING_REVIEW')) {
      issues.push('SUPERVISOR_MAPPING_REVIEW_REQUIRED: ' + id);
    }

    for (const component of question.markingComponents || []) {
      const available = Number(component.marksAvailable);
      const componentAwarded = Number(component.marksAwarded);
      if (!Number.isFinite(available) || !Number.isFinite(componentAwarded) ||
          available < 0 || componentAwarded < 0 || componentAwarded > available) {
        issues.push('SUPERVISOR_INVALID_MARKING_COMPONENT: ' + id + ' / ' + component.componentId);
      }
    }
  }

  for (const mapping of coverageMap?.attemptedQuestions || []) {
    if (mapping.isMcq) continue;

    const id = toCanonicalQuestionId(
      mapping.fullQuestionCode || mapping.questionNumber,
      mapping.subQuestionNumber,
      paperStructure.subQuestions
    );
    const authoritative = findAuthoritativeSubQuestion(mapping, paperStructure);
    if (!authoritative) {
      issues.push('SUPERVISOR_ATTEMPT_NOT_IN_AUTHORITATIVE_PAPER: ' + id);
      continue;
    }

    const evaluated = (result.questions || []).some((question) => canonicalQuestionId(question) === id);
    if (!evaluated) {
      issues.push('SUPERVISOR_MISSING_ATTEMPTED_QUESTION: ' + id);
    }

    // Never ask an evaluator to guess around a mismatched/missing reference.
    // Both the authoritative question and its suggested-answer section must lock.
    try {
      const reference = extractReferences(
        authoritative.fullQuestionCode,
        params.questionPaperText || '',
        params.suggestedAnswersText || '',
        params.markingSchemeText || ''
      );
      if (!reference.questionPaperFound || !reference.suggestedAnswerFound) {
        issues.push(
          'SUPERVISOR_REFERENCE_LOCK_INCOMPLETE: ' + id +
          ' (questionPaperFound=' + reference.questionPaperFound +
          ', suggestedAnswerFound=' + reference.suggestedAnswerFound + ')'
        );
      }
    } catch (error) {
      issues.push('SUPERVISOR_REFERENCE_LOCK_FAILED: ' + id + ' (' + String(error) + ')');
    }
  }

  if (result.validationStatus === 'NEEDS_REVIEW' && issues.length === 0) {
    issues.push('SUPERVISOR_INTEGRITY_ENGINE_REQUIRES_REVIEW: No structured reason was available; manual review is required.');
  }

  return {
    issues: uniqueStrings(issues),
    warnings: uniqueStrings(warnings),
    postEvaluationGate: gate,
  };
}

function issueMatchesQuestion(issue: string, id: string, fullQuestionCode?: string): boolean {
  const normalizedIssue = issue.toLowerCase();
  return normalizedIssue.includes(id.toLowerCase()) ||
    Boolean(fullQuestionCode && normalizedIssue.includes(fullQuestionCode.toLowerCase()));
}

function isReferenceOrMappingIssue(issue: string): boolean {
  return issue.includes('SUPERVISOR_REFERENCE_LOCK_') ||
    issue.includes('SUPERVISOR_ATTEMPT_NOT_IN_AUTHORITATIVE_PAPER') ||
    issue.includes('SUPERVISOR_MAPPING_REVIEW_REQUIRED') ||
    issue.includes('UNMAPPED_STUDENT_PAGE') ||
    issue.includes('UNMAPPED_ATTEMPT_DETECTED') ||
    issue.includes('SOURCE_CONFLICT');
}

function getRepairTargets(
  result: EvaluationResult,
  paperStructure: AuthoritativePaperStructure,
  coverageMap: AnswerCoverageMap | null | undefined,
  issues: string[]
): RepairTarget[] {
  const targets: RepairTarget[] = [];
  const seen = new Set<string>();

  for (const mapping of coverageMap?.attemptedQuestions || []) {
    if (mapping.isMcq || mapping.status === 'ATTEMPTED_UNCLEAR') continue;

    const canonicalId = toCanonicalQuestionId(
      mapping.fullQuestionCode || mapping.questionNumber,
      mapping.subQuestionNumber,
      paperStructure.subQuestions
    );
    if (seen.has(canonicalId)) continue;

    const subQuestion = findAuthoritativeSubQuestion(mapping, paperStructure);
    if (!subQuestion) continue;

    const question = (result.questions || []).find((item) => canonicalQuestionId(item) === canonicalId);
    if (question?.flags?.includes('HANDWRITING_UNCLEAR') || question?.flags?.includes('NEEDS_MAPPING_REVIEW')) continue;

    const questionIssues = issues.filter((issue) => issueMatchesQuestion(issue, canonicalId, subQuestion.fullQuestionCode));
    if (questionIssues.some(isReferenceOrMappingIssue)) continue;

    const technicalFailure = Boolean(
      question?.flags?.includes('FAILED_TO_EVALUATE') ||
      question?.flags?.includes('TECHNICAL_FAILURE')
    );
    const unclearButReadable = question?.status === 'unclear';
    const invalidMarks = Boolean(
      question &&
      (!Number.isFinite(Number(question.maximumMarks)) ||
       !Number.isFinite(Number(question.marksAwarded)) ||
       Number(question.marksAwarded) < 0 ||
       Number(question.marksAwarded) > Number(subQuestion.maximumMarks))
    );
    const missingEvaluation = !question;
    const hasRepairableQuestionIssue = questionIssues.some((issue) =>
      /SUPERVISOR_INVALID_|SUPERVISOR_MISSING_OR_NON_NUMERIC_MARKS|SUPERVISOR_MARKS_OUT_OF_BOUNDS|SUPERVISOR_INVALID_MARKING_COMPONENT|SUPERVISOR_EVALUATION_FAILURE|SUPERVISOR_UNCLEAR_EVALUATION|ATTEMPTED_ANSWER_DROPPED|COMPONENT_SUM_MISMATCH|SCORE_EXCEEDS_MAX_MARKS|INVALID_QUESTION_MAX_MARKS|NEGATIVE_SCORE_ERROR|POTENTIAL_DOUBLE_DEDUCTION/.test(issue)
    );

    if (missingEvaluation || technicalFailure || unclearButReadable || invalidMarks || hasRepairableQuestionIssue) {
      seen.add(canonicalId);
      targets.push({
        canonicalId,
        mapping,
        subQuestion,
        issues: questionIssues.length > 0 ? questionIssues : ['Re-evaluate this question because the supervisor could not certify the original result.'],
      });
    }
  }

  return targets;
}

function candidateIsSafe(candidate: QuestionEvaluation, target: RepairTarget): boolean {
  const maxMarks = Number(target.subQuestion.maximumMarks);
  const awarded = Number(candidate.marksAwarded);
  const candidateMax = Number(candidate.maximumMarks);

  if (!Number.isFinite(maxMarks) || maxMarks <= 0) return false;
  if (!Number.isFinite(awarded) || awarded < 0 || awarded > maxMarks) return false;
  if (Number.isFinite(candidateMax) && Math.abs(candidateMax - maxMarks) > 0.01) return false;

  for (const component of candidate.markingComponents || []) {
    const available = Number(component.marksAvailable);
    const componentAwarded = Number(component.marksAwarded);
    if (!Number.isFinite(available) || !Number.isFinite(componentAwarded) ||
        available < 0 || componentAwarded < 0 || componentAwarded > available) return false;
  }
  return true;
}

function buildIntegrityOptions(params: EvaluationSupervisorParams): IntegrityProcessOptions {
  return {
    markingSchemeText: params.markingSchemeText,
    questionPaperText: params.questionPaperText,
    suggestedAnswersText: params.suggestedAnswersText,
    officialPaperMaxMarks: params.officialPaperMaxMarks,
    caLevel: params.level as IntegrityProcessOptions['caLevel'],
    paper: params.paper,
    subjectKey: params.subjectKey,
    checkingMode: params.checkingMode,
    materialId: params.materialId,
    coverageMap: params.coverageMap,
    paperStructure: params.paperStructure,
  };
}

function markForReview(result: EvaluationResult, audit: SupervisorAuditSummary): EvaluationResult {
  result.integrityAudit = {
    ...(result.integrityAudit || {}),
    supervisor: audit,
  };

  if (audit.status === 'HUMAN_REVIEW') {
    result.validationStatus = 'NEEDS_REVIEW';
    result.certificationStatus = 'VERIFICATION_REQUIRED';
    result.downloadsUnlocked = false;
    result.validationErrors = uniqueStrings([
      ...(result.validationErrors || []),
      ...audit.unresolvedIssues,
    ]);
    result.integrityAudit = {
      ...(result.integrityAudit || {}),
      mathConsistent: false,
      hardCompletionGatePassed: false,
    };
    if (result.completionGateReport) {
      result.completionGateReport = {
        ...result.completionGateReport,
        failedCount: Math.max(1, result.completionGateReport.failedCount || 0),
        isPassed: false,
        checks: result.completionGateReport.checks || [],
        timestamp: new Date().toISOString(),
      };
    }
  }

  return result;
}

/**
 * Audits a canonical evaluation, asks the existing model-routing layer to re-evaluate
 * only repairable flagged descriptive questions, then re-runs the deterministic gates.
 * Unresolved source, mapping, handwriting, or integrity problems fail closed to review.
 */
export async function runEvaluationSupervisor(
  params: EvaluationSupervisorParams,
  dependencies: EvaluationSupervisorDependencies = {}
): Promise<EvaluationResult> {
  const evaluateChunk = dependencies.evaluateChunk || evaluateQuestionChunk;
  const reprocessIntegrity = dependencies.reprocessIntegrity || processEvaluationIntegrity;
  const extractReferences = dependencies.extractReferenceSnippets || extractRelevantReferenceSnippets;
  let current = params.evaluationResult;
  const correctedQuestionIds: string[] = [];
  const initialIssues: string[] = [];
  let correctionRoundsUsed = 0;
  let correctionCallsUsed = 0;
  const budgetExhaustedQuestionIds: string[] = [];

  for (let round = 1; round <= MAX_CORRECTION_ROUNDS; round++) {
    const audit = auditEvaluation(
      current,
      params.paperStructure,
      params.coverageMap || current.coverageMap || null,
      params,
      extractReferences
    );
    if (round === 1) initialIssues.push(...audit.issues);
    if (audit.issues.length === 0) break;

    const targets = getRepairTargets(
      current,
      params.paperStructure,
      params.coverageMap || current.coverageMap || null,
      audit.issues
    );
    if (targets.length === 0) break;

    let appliedThisRound = 0;
    let index = 0;
    while (index < targets.length && correctionCallsUsed < MAX_REPAIR_CALLS_PER_EVALUATION) {
      const remainingBudget = MAX_REPAIR_CALLS_PER_EVALUATION - correctionCallsUsed;
      const batchSize = Math.min(MAX_PARALLEL_CORRECTIONS, remainingBudget);
      const batch = targets.slice(index, index + batchSize);
      index += batch.length;
      correctionCallsUsed += batch.length;
      const results = await Promise.all(batch.map(async (target) => {
        const supervisorContext: ChunkEvaluationContext = {
          subQuestion: target.subQuestion,
          mapping: target.mapping,
          fullPdfBuffer: params.pdfBuffer,
          questionPaperText: params.questionPaperText,
          suggestedAnswersText: params.suggestedAnswersText,
          markingSchemeText: params.markingSchemeText,
          checkingMode: params.checkingMode,
          level: params.level,
          subjectName: params.subjectName,
          supervisorIssues: target.issues,
          supervisorCorrectionAttempt: round,
        };

        try {
          const candidate = await evaluateChunk(supervisorContext);
          if (!candidateIsSafe(candidate, target)) {
            return {
              canonicalId: target.canonicalId,
              candidate: null as QuestionEvaluation | null,
              error: 'SUPERVISOR_REPAIR_REJECTED_INVALID_SCORE: ' + target.canonicalId,
            };
          }

          const repaired: QuestionEvaluation = {
            ...candidate,
            questionNumber: target.subQuestion.questionNumber,
            subQuestion: target.subQuestion.subQuestionNumber,
            canonicalId: target.canonicalId,
            fullQuestionCode: target.subQuestion.fullQuestionCode,
            maximumMarks: Number(target.subQuestion.maximumMarks),
            marksAwarded: Number(candidate.marksAwarded),
            marksLost: Math.max(0, Number(target.subQuestion.maximumMarks) - Number(candidate.marksAwarded)),
          };
          return { canonicalId: target.canonicalId, candidate: repaired, error: null as string | null };
        } catch (error) {
          return {
            canonicalId: target.canonicalId,
            candidate: null as QuestionEvaluation | null,
            error: 'SUPERVISOR_REPAIR_FAILED: ' + target.canonicalId + ' (' + String(error) + ')',
          };
        }
      }));

      let nextQuestions = [...(current.questions || [])];
      for (const result of results) {
        if (!result.candidate) {
          initialIssues.push(result.error || ('SUPERVISOR_REPAIR_FAILED: ' + result.canonicalId));
          continue;
        }
        const existingIndex = nextQuestions.findIndex((question) => canonicalQuestionId(question) === result.canonicalId);
        if (existingIndex >= 0) nextQuestions[existingIndex] = result.candidate;
        else nextQuestions.push(result.candidate);
        correctedQuestionIds.push(result.canonicalId);
        appliedThisRound++;
      }
      current = { ...current, questions: nextQuestions };
    }

    if (index < targets.length) {
      budgetExhaustedQuestionIds.push(...targets.slice(index).map((target) => target.canonicalId));
    }

    if (appliedThisRound === 0) break;
    correctionRoundsUsed = round;

    try {
      current = reprocessIntegrity(current, buildIntegrityOptions({
        ...params,
        evaluationResult: current,
      }));
    } catch (error) {
      initialIssues.push('SUPERVISOR_INTEGRITY_REPROCESS_FAILED: ' + String(error));
      break;
    }
  }

  const finalAudit = auditEvaluation(
    current,
    params.paperStructure,
    params.coverageMap || current.coverageMap || null,
    params,
    extractReferences
  );
  const budgetIssues = budgetExhaustedQuestionIds.length > 0
    ? ['SUPERVISOR_REPAIR_BUDGET_EXHAUSTED: Human review required for ' + uniqueStrings(budgetExhaustedQuestionIds).join(', ')]
    : [];
  const unresolvedIssues = uniqueStrings([...finalAudit.issues, ...budgetIssues]);
  const summary: SupervisorAuditSummary = {
    version: 'evaluation-supervisor-v1',
    status: unresolvedIssues.length === 0 ? 'PASS' : 'HUMAN_REVIEW',
    maxCorrectionRounds: MAX_CORRECTION_ROUNDS,
    correctionRoundsUsed,
    maxCorrectionCalls: MAX_REPAIR_CALLS_PER_EVALUATION,
    correctionCallsUsed,
    correctionsApplied: correctedQuestionIds.length,
    correctedQuestionIds: uniqueStrings(correctedQuestionIds),
    initialIssues: uniqueStrings(initialIssues).slice(0, 100),
    unresolvedIssues: unresolvedIssues.slice(0, 100),
    checkedAt: new Date().toISOString(),
  };

  return markForReview(current, summary);
}
