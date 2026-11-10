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
  return question.canonicalId || question.fullQuestionCode || (question.subQuestion
    ? `Q${question.questionNumber}(${question.subQuestion})`
    : `Q${question.questionNumber}`);
}

function normalizeQuestionKey(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/^(?:QUESTION|Q)\\.?\\s*/i, '')
    .replace(/\\s+/g, '')
    .toUpperCase();
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
  const questionMarksUsed = new Map<string, number>();

  const runPackage = result.evaluationRunPackage;
  const ledgerRecords = runPackage?.scoreLedger?.records || runPackage?.evaluationRecords || result.canonicalLedger?.records || [];
  const inventoryItems = runPackage?.questionInventory?.items || [];
  const inventoryById = new Map(inventoryItems.map((item) => [normalizeQuestionKey(item.questionId), item]));
  const ledgerById = new Map(ledgerRecords.map((record) => [normalizeQuestionKey(record.questionId), record]));

  const add = (finding: MarksLeakFinding, budgetKey?: string, questionMaximum?: number) => {
    if (finding.marksAtStake <= 0 && finding.category !== 'TECHNICAL_REVIEW') return;
    if (seen.has(finding.id)) return;
    seen.add(finding.id);

    let marksAtStake = roundMarks(finding.marksAtStake);
    const normalizedBudgetKey = normalizeQuestionKey(budgetKey || '');
    const maximum = safeNumber(questionMaximum);
    if (finding.category !== 'TECHNICAL_REVIEW' && normalizedBudgetKey && maximum > 0) {
      const alreadyUsed = questionMarksUsed.get(normalizedBudgetKey) || 0;
      marksAtStake = roundMarks(Math.min(marksAtStake, Math.max(0, maximum - alreadyUsed)));
      questionMarksUsed.set(normalizedBudgetKey, roundMarks(alreadyUsed + marksAtStake));
    }
    if (marksAtStake <= 0 && finding.category !== 'TECHNICAL_REVIEW') return;
    findings.push({ ...finding, marksAtStake });
  };

  for (const record of ledgerRecords) {
    const questionKey = normalizeQuestionKey(record.questionId);
    const inventoryItem = inventoryById.get(questionKey);
    const isOptionalQuestion = inventoryItem?.isRequiredOrOptional === 'OPTIONAL';
    const isAlternative = Boolean(record.isAlternative || inventoryItem?.isAlternative);

    // An unattempted OPTIONAL question is not automatically lost marks: it may
    // be an intentionally unselected choice. Counting every unused choice is a
    // common source of impossible diagnostics on 100-mark papers.
    if (
      !record.attempted &&
      record.evaluationStatus === 'UNATTEMPTED' &&
      !isAlternative &&
      !isOptionalQuestion
    ) {
      const maximum = safeNumber(inventoryItem?.maxMarks) || safeNumber(record.maxMarks);
      add({
        id: `unattempted:${questionKey}`,
        questionId: record.questionId,
        category: 'UNATTEMPTED',
        title: `${record.questionId} was left unattempted`,
        detail: 'The canonical paper inventory marks this as required and the student attempt manifest marks it as unattempted.',
        marksAtStake: maximum,
        pages: uniquePages(record.studentPages || [], record.sourcePages || []),
        evidence: ['Canonical paper inventory', 'Student attempt manifest'],
        priority: maximum >= 5 ? 'HIGH' : 'MEDIUM',
      }, questionKey, maximum);
    }
  }

  for (const question of result.questions || []) {
    const questionId = getQuestionId(question);
    const questionKey = normalizeQuestionKey(questionId);
    const inventoryItem = inventoryById.get(questionKey);
    const questionMaximum = safeNumber(inventoryItem?.maxMarks) || safeNumber(question.maximumMarks);
    const components = getComponents(question);
    const pages = uniquePages(
      question.sourcePages || [],
      question.pageNumber ? [question.pageNumber] : [],
      components.map((component) => component.pageNumber),
      ledgerById.get(questionKey)?.studentPages || []
    );

    for (const component of components) {
      const available = safeNumber(component.marksAvailable);
      const awarded = safeNumber(component.marksAwarded);
      const recordedDeduction = safeNumber(component.marksDeducted);
      // Stored marksDeducted can be stale in older evaluations. A component can
      // never expose more at-stake marks than its own authoritative allocation.
      const lost = roundMarks(available > 0
        ? Math.min(available, Math.max(recordedDeduction, available - awarded))
        : 0);
      if (lost <= 0) continue;

      const type = String(component.componentType || '').toUpperCase();
      if (type === 'MCQ') continue;
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
        id: `component:${questionKey}:${component.componentId}`,
        questionId,
        category,
        title,
        detail: component.deductionReason || component.whatWasMissing || component.reason ||
          `The component received ${awarded} of ${available} marks.`,
        marksAtStake: lost,
        pages: uniquePages(pages, component.pageNumber ? [component.pageNumber] : []),
        evidence: [
          component.expectedRequirement,
          component.studentEvidence,
          component.deductionReason || component.whatWasMissing || '',
        ].filter(Boolean),
        priority: lost >= 2 ? 'HIGH' : 'MEDIUM',
      }, questionKey, questionMaximum);
    }

    if (question.status === 'not_attempted' && !ledgerById.has(questionKey)) {
      add({
        id: `unattempted:${questionKey}`,
        questionId,
        category: 'UNATTEMPTED',
        title: `${questionId} was marked not attempted`,
        detail: question.reasonForDeduction || question.detailedFeedback || 'The saved question evaluation marks this answer as not attempted.',
        marksAtStake: questionMaximum,
        pages,
        evidence: [question.reasonForDeduction || question.detailedFeedback || 'Evaluation status: not_attempted'].filter(Boolean),
        priority: questionMaximum >= 5 ? 'HIGH' : 'MEDIUM',
      }, questionKey, questionMaximum);
    }

    if (
      components.length === 0 &&
      question.status !== 'not_attempted' &&
      safeNumber(question.marksLost) > 0 &&
      (question.missingRequirements || []).length === 0
    ) {
      add({
        id: `question-loss:${questionKey}`,
        questionId,
        category: 'STEP_MARKS_LOST',
        title: 'Question-level marks were deducted',
        detail: question.reasonForDeduction || question.detailedFeedback || 'The saved question evaluation records marks lost but does not retain a component-level breakdown.',
        marksAtStake: safeNumber(question.marksLost),
        pages,
        evidence: [question.reasonForDeduction || question.detailedFeedback || 'Question-level marksLost field'].filter(Boolean),
        priority: safeNumber(question.marksLost) >= 2 ? 'HIGH' : 'MEDIUM',
      }, questionKey, questionMaximum);
    }

    const explicitlyMissing = (question.missingRequirements || []).filter(Boolean);
    if (explicitlyMissing.length > 0 && components.length === 0) {
      const lost = roundMarks(Math.max(0, questionMaximum - safeNumber(question.marksAwarded)));
      add({
        id: `missing:${questionKey}`,
        questionId,
        category: 'INCOMPLETE_EXPLANATION',
        title: 'Required answer elements were missing',
        detail: explicitlyMissing.join('; '),
        marksAtStake: lost,
        pages,
        evidence: explicitlyMissing,
        priority: lost >= 2 ? 'HIGH' : 'MEDIUM',
      }, questionKey, questionMaximum);
    }

    if (question.status === 'unclear' || question.flags?.some((flag) => /TECHNICAL|MAPPING|OCR|UNREADABLE/i.test(flag))) {
      add({
        id: `review:${questionKey}`,
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

  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const sortedFindings = findings.sort((a, b) =>
    rank[a.priority] - rank[b.priority] || b.marksAtStake - a.marksAtStake
  );
  const paperMaximum = safeNumber(runPackage?.questionInventory?.totalPaperMaxMarks) ||
    safeNumber(result.officialPaperMaxMarks) ||
    safeNumber(result.maximumMarks);
  let remainingPaperMarks = paperMaximum > 0 ? paperMaximum : Number.POSITIVE_INFINITY;
  let paperLimitApplied = false;
  const boundedFindings = sortedFindings
    .map((finding) => {
      if (finding.category === 'TECHNICAL_REVIEW') return finding;
      const boundedMarks = roundMarks(Math.min(finding.marksAtStake, remainingPaperMarks));
      if (boundedMarks + 0.001 < finding.marksAtStake) paperLimitApplied = true;
      remainingPaperMarks = Math.max(0, roundMarks(remainingPaperMarks - boundedMarks));
      return { ...finding, marksAtStake: boundedMarks };
    })
    .filter((finding) => finding.category === 'TECHNICAL_REVIEW' || finding.marksAtStake > 0);

  if (paperLimitApplied) {
    boundedFindings.push({
      id: 'review:paper-maximum',
      questionId: 'PAPER',
      category: 'TECHNICAL_REVIEW',
      title: 'Marks-at-stake total exceeded the paper maximum',
      detail: `The raw findings exceeded the authoritative paper maximum of ${paperMaximum} marks. The displayed total has been conservatively capped; the underlying question allocations need review.`,
      marksAtStake: 0,
      pages: [],
      evidence: ['Authoritative paper maximum', 'Canonical question findings'],
      priority: 'HIGH',
    });
  }

  const unattemptedMarks = roundMarks(boundedFindings.filter((f) => f.category === 'UNATTEMPTED').reduce((sum, f) => sum + f.marksAtStake, 0));
  const incompleteAnswerMarks = roundMarks(boundedFindings.filter((f) => f.category === 'MISSING_WORKING' || f.category === 'INCOMPLETE_EXPLANATION').reduce((sum, f) => sum + f.marksAtStake, 0));
  const stepMarksLost = roundMarks(boundedFindings.filter((f) => f.category === 'STEP_MARKS_LOST').reduce((sum, f) => sum + f.marksAtStake, 0));

  return {
    findings: boundedFindings,
    totalMarksAtStake: roundMarks(unattemptedMarks + incompleteAnswerMarks + stepMarksLost),
    unattemptedMarks,
    stepMarksLost,
    incompleteAnswerMarks,
    technicalReviewCount: boundedFindings.filter((f) => f.category === 'TECHNICAL_REVIEW').length,
    isEvidenceLimited: ledgerRecords.length === 0 && componentsCount(result.questions || []) === 0 && !(result.questions || []).some((question) => (question.missingRequirements || []).length > 0 || safeNumber(question.marksLost) > 0),
  };
}
function componentsCount(questions: QuestionEvaluation[]): number {
  return questions.reduce((sum, question) => sum + getComponents(question).length, 0);
}
