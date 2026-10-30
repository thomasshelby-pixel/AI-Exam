import type { EvaluationResult, MarkingComponent, QuestionEvaluation } from '../types/index.js';

export type MarksLeakCategory =
  | 'UNATTEMPTED'
  | 'MISSING_WORKING'
  | 'INCOMPLETE_EXPLANATION'
  | 'STEP_MARKS_LOST'
  | 'TECHNICAL_REVIEW';

export interface MarksLeakFinding {
  id: string;
  questionId: string;
  category: MarksLeakCategory;
  title: string;
  detail: string;
  marksAtStake: number;
  pages: number[];
  evidence: string[];
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface MarksLeakReport {
  findings: MarksLeakFinding[];
  totalMarksAtStake: number;
  unattemptedMarks: number;
  stepMarksLost: number;
  incompleteAnswerMarks: number;
  technicalReviewCount: number;
  isEvidenceLimited: boolean;
}

const roundMarks = (value: number): number => Math.round(Math.max(0, value) * 100) / 100;
const safeNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const uniquePages = (...groups: unknown[][]): number[] =>
  Array.from(new Set(groups.flat().map(Number).filter((page) => Number.isInteger(page) && page > 0))).sort((a, b) => a - b);

function getQuestionId(question: QuestionEvaluation): string {
  return question.fullQuestionCode || (question.subQuestion
    ? `Q${question.questionNumber}(${question.subQuestion})`
    : `Q${question.questionNumber}`);
}

function getComponents(question: QuestionEvaluation): MarkingComponent[] {
  return Array.isArray(question.markingComponents) ? question.markingComponents : [];
}

/**
 * Produces an evidence-led study diagnostic from the persisted evaluation.
 * It never guesses the paper inventory or invents marks: findings require
 * explicit canonical records, component allocations, or examiner remarks.
 */
export function buildMarksLeakReport(result: EvaluationResult): MarksLeakReport {
  const findings: MarksLeakFinding[] = [];
  const seen = new Set<string>();
  const add = (finding: MarksLeakFinding) => {
    if (finding.marksAtStake <= 0 && finding.category !== 'TECHNICAL_REVIEW') return;
    if (seen.has(finding.id)) return;
    seen.add(finding.id);
    findings.push({ ...finding, marksAtStake: roundMarks(finding.marksAtStake) });
  };

  const runPackage = result.evaluationRunPackage;
  const ledgerRecords = runPackage?.scoreLedger?.records || result.canonicalLedger?.records || [];
  const inventoryItems = runPackage?.questionInventory?.items || [];
  const inventoryById = new Map(inventoryItems.map((item) => [item.questionId, item]));
  const ledgerById = new Map(ledgerRecords.map((record) => [record.questionId, record]));

  for (const record of ledgerRecords) {
    if (!record.attempted && record.evaluationStatus === 'UNATTEMPTED' && !record.isAlternative) {
      const item = inventoryById.get(record.questionId);
      add({
        id: `unattempted:${record.questionId}`,
        questionId: record.questionId,
        category: 'UNATTEMPTED',
        title: `${record.questionId} was left unattempted`,
        detail: 'The answer-sheet attempt manifest and canonical paper inventory both mark this question as unattempted.',
        marksAtStake: record.maxMarks,
        pages: uniquePages(record.studentPages || [], record.sourcePages || []),
        evidence: ['Canonical paper inventory', 'Student attempt manifest'],
        priority: record.maxMarks >= 5 ? 'HIGH' : 'MEDIUM',
      });
    }
  }

  for (const question of result.questions || []) {
    const questionId = getQuestionId(question);
    const components = getComponents(question);
    const pages = uniquePages(
      question.sourcePages || [],
      question.pageNumber ? [question.pageNumber] : [],
      components.map((component) => component.pageNumber),
      ledgerById.get(question.canonicalId || questionId)?.studentPages || []
    );

    for (const component of components) {
      const lost = roundMarks(Math.max(
        safeNumber(component.marksDeducted),
        safeNumber(component.marksAvailable) - safeNumber(component.marksAwarded)
      ));
      if (lost <= 0) continue;

      const type = String(component.componentType || '').toUpperCase();
      const text = [
        component.expectedRequirement,
        component.whatWasMissing,
        component.deductionReason,
        component.reason,
      ].filter(Boolean).join(' ');
      const isWorking = /WORKING|CALCULATION|FORMULA|JOURNAL|LEDGER|RECONCILIATION/i.test(type);
      const isExplanation = /REASONING|PROVISION|CONCLUSION|APPLICATION|ANALYSIS/i.test(type);
      const category: MarksLeakCategory = isWorking
        ? 'MISSING_WORKING'
        : isExplanation
        ? 'INCOMPLETE_EXPLANATION'
        : 'STEP_MARKS_LOST';
      const title = isWorking
        ? 'Marks lost in working / calculation steps'
        : isExplanation
        ? 'Marks lost in explanation / provision'
        : 'Marks lost in a marking component';

      add({
        id: `component:${questionId}:${component.componentId}`,
        questionId,
        category,
        title,
        detail: component.deductionReason || component.whatWasMissing || component.reason ||
          `The component received ${safeNumber(component.marksAwarded)} of ${safeNumber(component.marksAvailable)} marks.`,
        marksAtStake: lost,
        pages: uniquePages(pages, component.pageNumber ? [component.pageNumber] : []),
        evidence: [
          component.expectedRequirement,
          component.studentEvidence,
          component.deductionReason || component.whatWasMissing || '',
        ].filter(Boolean),
        priority: lost >= 2 ? 'HIGH' : 'MEDIUM',
      });
    }

    const explicitlyMissing = (question.missingRequirements || []).filter(Boolean);
    if (explicitlyMissing.length > 0 && components.length === 0) {
      const lost = roundMarks(Math.max(0, safeNumber(question.maximumMarks) - safeNumber(question.marksAwarded)));
      add({
        id: `missing:${questionId}`,
        questionId,
        category: 'INCOMPLETE_EXPLANATION',
        title: 'Required answer elements were missing',
        detail: explicitlyMissing.join('; '),
        marksAtStake: lost,
        pages,
        evidence: explicitlyMissing,
        priority: lost >= 2 ? 'HIGH' : 'MEDIUM',
      });
    }

    if (question.status === 'unclear' || question.flags?.some((flag) => /TECHNICAL|MAPPING|OCR|UNREADABLE/i.test(flag))) {
      add({
        id: `review:${questionId}`,
        questionId,
        category: 'TECHNICAL_REVIEW',
        title: 'Answer needs a manual mapping / readability review',
        detail: question.reasonForDeduction || question.detailedFeedback || 'The stored evaluation flags this answer for review; marks should not be assumed lost until it is checked.',
        marksAtStake: 0,
        pages,
        evidence: question.flags || [],
        priority: 'HIGH',
      });
    }
  }

  const unattemptedMarks = roundMarks(findings.filter((f) => f.category === 'UNATTEMPTED').reduce((sum, f) => sum + f.marksAtStake, 0));
  const incompleteAnswerMarks = roundMarks(findings.filter((f) => f.category === 'MISSING_WORKING' || f.category === 'INCOMPLETE_EXPLANATION').reduce((sum, f) => sum + f.marksAtStake, 0));
  const stepMarksLost = roundMarks(findings.filter((f) => f.category === 'STEP_MARKS_LOST').reduce((sum, f) => sum + f.marksAtStake, 0));

  return {
    findings: findings.sort((a, b) => {
      const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return rank[a.priority] - rank[b.priority] || b.marksAtStake - a.marksAtStake;
    }),
    totalMarksAtStake: roundMarks(unattemptedMarks + incompleteAnswerMarks + stepMarksLost),
    unattemptedMarks,
    stepMarksLost,
    incompleteAnswerMarks,
    technicalReviewCount: findings.filter((f) => f.category === 'TECHNICAL_REVIEW').length,
    isEvidenceLimited: ledgerRecords.length === 0 && componentsCount(result.questions || []) === 0,
  };
}

function componentsCount(questions: QuestionEvaluation[]): number {
  return questions.reduce((sum, question) => sum + getComponents(question).length, 0);
}
