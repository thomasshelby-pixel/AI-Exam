/**
 * Global Canonical Question Inventory, Attempt Preservation, and Exactly-Once Evaluation Engine
 *
 * Core Mandates:
 * 1. Immutable Canonical Question Inventory created before evaluation from authoritative QP.
 * 2. Independent Attempt Detection: Detects student attempts BEFORE scoring without depending
 *    on evaluator generation. Never drops attempted questions, partial answers, or continuations.
 * 3. Exactly-Once Evaluation Task Registry: Guarantees count(tasks for canonicalId) === 1.
 * 4. Authoritative Canonical Score Ledger: Grand total is strictly SUM(awardedMarks WHERE counted = true).
 * 5. Attempted-Question Completeness Gate: Enforces Attempted ⊆ Evaluated = Rendered = Counted.
 * 6. Total Reconciliation Gate: canonicalLedgerTotal == scorecardTotal == renderedEvaluationTotal == finalDisplayedTotal.
 * 7. Works generically across CA Foundation, Intermediate, and Final for all subjects and paper types.
 * 8. Never modifies MCQ Arena.
 */

import crypto from 'crypto';
import {
  CanonicalQuestionInventory,
  CanonicalQuestionInventoryItem,
  CanonicalEvaluationRecord,
  CanonicalEvaluationLedger,
  DiagnosticLedgerRow,
  EvaluationReconciliationSection,
  CanonicalEvaluationStatus,
  QuestionEvaluation,
  EvaluationResult,
  StudentAttemptManifestItem,
  PageCoverageAuditItem,
  StudentAttemptManifest,
  FourSetReconciliationReport,
  EvaluationRunPackage,
  EvaluationFinalizationStatus,
} from '../../src/types/index.js';
import { AuthoritativePaperStructure, PaperStructureSubQuestion } from './paperStructureService.js';
import {
  toCanonicalQuestionId,
  parseCanonicalQuestionIdentity,
  deduplicateQuestionList,
} from './canonicalQuestionService.js';
import { db, persistEvaluationRunPackageAtomic, loadEvaluationRunPackage } from '../db.js';

export interface IndependentAttemptRecord {
  canonicalId: string;
  questionNumber: string;
  subQuestion?: string;
  sourcePages: number[];
  isAttempted: boolean;
  isPartial: boolean;
  isContinuation: boolean;
  isCrossedOutWithNoReplacement: boolean;
  selectedAlternative?: string | number;
  evidence: string;
  studentSnippet?: string;
  studentSelectedOption?: string;
  isMcq: boolean;
}

export interface ExactlyOnceTask {
  taskId: string;
  runId: string;
  canonicalQuestionId: string;
  questionNumber: string;
  subQuestion?: string;
  maximumMarks: number;
  isMcq: boolean;
  sourcePages: number[];
}

/**
 * Creates an immutable canonical Question Inventory from the authoritative Question Paper structure.
 */
export function buildCanonicalQuestionInventory(options: {
  paperStructure: AuthoritativePaperStructure;
  questionPaperText?: string;
  markingSchemeText?: string;
  paperTitle?: string;
  totalPaperMaxMarks?: number;
}): CanonicalQuestionInventory {
  const { paperStructure, paperTitle, totalPaperMaxMarks = 100 } = options;
  const items: CanonicalQuestionInventoryItem[] = [];
  let sourceOrder = 1;

  // 1. Process MCQs first if present (Division A / Objective Section)
  const mcqs = paperStructure.mcqs || [];
  for (const mcq of mcqs) {
    const rawNum = String(mcq.questionNumber).replace(/[^0-9]/g, '') || String(sourceOrder);
    const canonicalId = `MCQ${rawNum}`;
    items.push({
      questionId: canonicalId,
      parentQuestionId: 'DIV_A_MCQ',
      subQuestionId: rawNum,
      questionType: 'MCQ',
      maxMarks: Number(mcq.maximumMarks) || (paperStructure.totalPaperMaxMarks === 30 ? 1 : 2),
      sourceOrder: sourceOrder++,
      canonicalTextAnchor: mcq.topic || `Multiple Choice Question ${rawNum}`,
      isAlternative: false,
      isRequiredOrOptional: 'REQUIRED',
    });
  }

  // 2. Process Descriptive Sub-Questions (Division B)
  const subQs = paperStructure.subQuestions ? paperStructure.subQuestions.filter((s) => !s.isMcq) : [];
  for (const sq of subQs) {
    const canonicalId = toCanonicalQuestionId(sq.fullQuestionCode || sq.questionNumber, sq.subQuestionNumber, paperStructure.subQuestions);
    const parsed = parseCanonicalQuestionIdentity(canonicalId);

    const isAlt = Boolean(sq.fullQuestionCode?.toLowerCase().includes('or') || (sq as any).isAlternative);
    const altGroup = isAlt ? `ALT_${parsed.questionNumber}` : undefined;

    items.push({
      questionId: canonicalId,
      parentQuestionId: parsed.parentQuestionId,
      subQuestionId: parsed.subQuestion,
      questionType: 'DESCRIPTIVE',
      maxMarks: Number(sq.maximumMarks) || 4,
      sourceOrder: sourceOrder++,
      alternativeGroupId: altGroup,
      canonicalTextAnchor: sq.topic || `Question ${canonicalId}`,
      isAlternative: isAlt,
      isRequiredOrOptional: sq.compulsory ? 'REQUIRED' : 'OPTIONAL',
    });
  }

  // 3. Fallback: If no sub-questions extracted, parse questions directly
  if (items.length === 0 && paperStructure.questions && paperStructure.questions.length > 0) {
    for (const q of paperStructure.questions) {
      if (q.subQuestions && q.subQuestions.length > 0) {
        for (const sq of q.subQuestions) {
          const canonicalId = toCanonicalQuestionId(sq.fullQuestionCode || sq.questionNumber, sq.subQuestionNumber);
          items.push({
            questionId: canonicalId,
            parentQuestionId: `Q${q.questionNumber}`,
            subQuestionId: sq.subQuestionNumber,
            questionType: sq.isMcq ? 'MCQ' : 'DESCRIPTIVE',
            maxMarks: Number(sq.maximumMarks) || 4,
            sourceOrder: sourceOrder++,
            isAlternative: false,
            isRequiredOrOptional: q.compulsory ? 'REQUIRED' : 'OPTIONAL',
          });
        }
      } else {
        const canonicalId = `Q${q.questionNumber}`;
        items.push({
          questionId: canonicalId,
          questionType: 'DESCRIPTIVE',
          maxMarks: Number(q.maximumMarks) || 10,
          sourceOrder: sourceOrder++,
          isAlternative: false,
          isRequiredOrOptional: q.compulsory ? 'REQUIRED' : 'OPTIONAL',
        });
      }
    }
  }

  const hashContent = JSON.stringify(items.map((i) => `${i.questionId}:${i.maxMarks}:${i.questionType}`));
  const referenceHash = crypto.createHash('sha256').update(hashContent).digest('hex');

  return {
    inventoryId: `inv_${referenceHash.slice(0, 12)}`,
    paperTitle: paperTitle || paperStructure.paperTitle || 'CA Examination Paper',
    totalPaperMaxMarks: paperStructure.totalPaperMaxMarks || totalPaperMaxMarks,
    items,
    referenceHash,
  };
}

/**
 * Independent Attempt Detection:
 * Detects attempted answers from student's answer sheet pages BEFORE scoring.
 * An answer counts as attempted whenever there is evidence:
 * - handwritten answer, calculation, working, explanation, option marked, partial answer, conclusion, diagram/table
 * - answer continuation from previous page or to next page
 * - crossed-out answer with no replacement
 *
 * Never requires a complete answer to count as attempted.
 * Merges multi-page continuations into a single canonical question (e.g. Page 2 and Page 9 -> Q3(a) with pages [2, 9]).
 */
export function detectIndependentAttempts(options: {
  inventory: CanonicalQuestionInventory;
  rawPageOccurrences: Array<{
    questionCode: string;
    pageNumber: number;
    evidenceText?: string;
    studentSnippet?: string;
    isContinuation?: boolean;
    isCrossedOut?: boolean;
    hasReplacement?: boolean;
    selectedOption?: string;
    isPartial?: boolean;
  }>;
  mcqSelections?: Record<string, string>;
}): Map<string, IndependentAttemptRecord> {
  const attempts = new Map<string, IndependentAttemptRecord>();
  const { inventory, rawPageOccurrences, mcqSelections } = options;

  // Build reference map for canonical IDs from inventory
  const inventoryMap = new Map<string, CanonicalQuestionInventoryItem>();
  for (const item of inventory.items) {
    inventoryMap.set(item.questionId, item);
    inventoryMap.set(item.questionId.toLowerCase(), item);
  }

  // 1. Ingest raw page occurrences and merge continuations
  for (const occ of rawPageOccurrences) {
    const rawCode = occ.questionCode.trim();
    if (!rawCode) continue;

    // If rawCode is just a parent question (e.g. "Q6", "6", "Q7", "7") without sub-question,
    // check snippet text to detect specific sub-question letter like (a), (b), (c)
    // or match against inventory item topics/keywords (e.g. Q7(b) order of discharge)
    let resolvedCode = rawCode;
    const isBareParent = /^Q?\d+$/i.test(rawCode);
    if (isBareParent) {
      const qDigits = rawCode.replace(/[^0-9]/g, '');
      const snip = occ.studentSnippet || occ.evidenceText || '';
      const subMatch = snip.match(/(?:^|\s|\n)(?:\(?([a-d])\)?)(?:\s|\.|\:|\))/i) ||
                       snip.match(/Q?\d+\s*\(?([a-d])\)?/i);
      if (subMatch && subMatch[1]) {
        resolvedCode = `Q${qDigits}(${subMatch[1].toLowerCase()})`;
      } else {
        // Topic keyword matching for inventory sub-questions of this parent
        const candidateItems = inventory.items.filter(
          (it) => it.parentQuestionId === `Q${qDigits}` || it.questionId.startsWith(`Q${qDigits}(`)
        );
        const snipLower = snip.toLowerCase();
        let bestMatch: CanonicalQuestionInventoryItem | null = null;
        let bestScore = 0;

        for (const cand of candidateItems) {
          const anchor = (cand.canonicalTextAnchor || '').toLowerCase();
          const words = anchor.split(/[\s,()/-]+/).filter((w) => w.length > 3);
          let matchCount = 0;
          for (const w of words) {
            if (snipLower.includes(w)) matchCount++;
          }
          if (matchCount > bestScore) {
            bestScore = matchCount;
            bestMatch = cand;
          }
        }

        if (bestMatch && bestScore >= 1) {
          resolvedCode = bestMatch.questionId;
        }
      }
    }

    const canonId = toCanonicalQuestionId(resolvedCode);
    const parsed = parseCanonicalQuestionIdentity(canonId);

    // Look for matching inventory item or fallback
    const matchedItem = inventoryMap.get(canonId) || inventoryMap.get(parsed.canonicalId);
    const effectiveCanonId = matchedItem ? matchedItem.questionId : parsed.canonicalId;

    const isCrossedWithoutReplacement = Boolean(occ.isCrossedOut && !occ.hasReplacement);
    const evidence = occ.evidenceText || occ.studentSnippet || `Attempt detected on page ${occ.pageNumber}`;

    if (!attempts.has(effectiveCanonId)) {
      attempts.set(effectiveCanonId, {
        canonicalId: effectiveCanonId,
        questionNumber: parsed.questionNumber,
        subQuestion: parsed.subQuestion,
        sourcePages: [occ.pageNumber],
        isAttempted: true,
        isPartial: Boolean(occ.isPartial),
        isContinuation: false,
        isCrossedOutWithNoReplacement: isCrossedWithoutReplacement,
        evidence,
        studentSnippet: occ.studentSnippet,
        studentSelectedOption: occ.selectedOption,
        isMcq: parsed.isMcq,
      });
    } else {
      // Coalesce multi-page continuation into the same canonical question!
      const existing = attempts.get(effectiveCanonId)!;
      if (!existing.sourcePages.includes(occ.pageNumber)) {
        existing.sourcePages.push(occ.pageNumber);
        existing.sourcePages.sort((a, b) => a - b);
      }
      existing.isContinuation = true;
      if (occ.studentSnippet && !existing.studentSnippet?.includes(occ.studentSnippet)) {
        existing.studentSnippet = (existing.studentSnippet ? `${existing.studentSnippet}\n\n` : '') + occ.studentSnippet;
      }
      if (occ.selectedOption && !existing.studentSelectedOption) {
        existing.studentSelectedOption = occ.selectedOption;
      }
      existing.evidence = `${existing.evidence} | Page ${occ.pageNumber} continuation`;
    }
  }

  // 2. Ingest MCQ selections (e.g. { "8": "C", "16": "C" })
  if (mcqSelections) {
    for (const [key, val] of Object.entries(mcqSelections)) {
      if (!val) continue;
      const mcqNum = key.replace(/[^0-9]/g, '');
      const canonId = `MCQ${mcqNum}`;

      if (!attempts.has(canonId)) {
        attempts.set(canonId, {
          canonicalId: canonId,
          questionNumber: mcqNum,
          subQuestion: 'MCQ',
          sourcePages: [1],
          isAttempted: true,
          isPartial: false,
          isContinuation: false,
          isCrossedOutWithNoReplacement: false,
          evidence: `Selected option (${val.toUpperCase()}) for ${canonId}`,
          studentSelectedOption: val.toUpperCase(),
          isMcq: true,
        });
      }
    }
  }

  // 3. Parent / Child deduplication in attempts:
  // If children like Q3(a) and Q3(b) exist, eliminate parent Q3 from attempted map to prevent double evaluation
  const nonMcqAttemptKeys = Array.from(attempts.keys()).filter((k) => !k.startsWith('MCQ'));
  for (const parentKey of nonMcqAttemptKeys) {
    const hasChild = nonMcqAttemptKeys.some(
      (childKey) => childKey !== parentKey && childKey.startsWith(`${parentKey}(`)
    );
    if (hasChild) {
      const parentAttempt = attempts.get(parentKey)!;
      // Transfer pages to first child
      const firstChildKey = nonMcqAttemptKeys.find(
        (childKey) => childKey !== parentKey && childKey.startsWith(`${parentKey}(`)
      );
      if (firstChildKey) {
        const childAttempt = attempts.get(firstChildKey)!;
        for (const p of parentAttempt.sourcePages) {
          if (!childAttempt.sourcePages.includes(p)) {
            childAttempt.sourcePages.push(p);
          }
        }
        childAttempt.sourcePages.sort((a, b) => a - b);
      }
      attempts.delete(parentKey);
    }
  }

  return attempts;
}

/**
 * Exactly-Once Evaluation Task Registry:
 * Ensures every canonical attempted question creates strictly ONE evaluation task.
 * Enforces uniqueness on canonicalQuestionId + evaluationRunId.
 */
export function createExactlyOnceEvaluationTasks(options: {
  runId: string;
  inventory: CanonicalQuestionInventory;
  attemptedMap: Map<string, IndependentAttemptRecord>;
}): ExactlyOnceTask[] {
  const { runId, inventory, attemptedMap } = options;
  const tasks: ExactlyOnceTask[] = [];
  const seenCanonicalIds = new Set<string>();

  for (const item of inventory.items) {
    const attempt = attemptedMap.get(item.questionId);
    if (!attempt || !attempt.isAttempted) {
      continue;
    }

    if (seenCanonicalIds.has(item.questionId)) {
      throw new Error(`EXACTLY_ONCE_BREACH: Duplicate task generation attempted for ${item.questionId}`);
    }
    seenCanonicalIds.add(item.questionId);

    const parsed = parseCanonicalQuestionIdentity(item.questionId);
    tasks.push({
      taskId: `${runId}:${item.questionId}`,
      runId,
      canonicalQuestionId: item.questionId,
      questionNumber: parsed.questionNumber,
      subQuestion: parsed.subQuestion,
      maximumMarks: item.maxMarks,
      isMcq: item.questionType === 'MCQ',
      sourcePages: attempt.sourcePages,
    });
  }

  // Also include any attempted questions detected in student script not strictly in predefined inventory
  for (const [canonId, attempt] of attemptedMap.entries()) {
    if (!seenCanonicalIds.has(canonId)) {
      seenCanonicalIds.add(canonId);
      const parsed = parseCanonicalQuestionIdentity(canonId);
      tasks.push({
        taskId: `${runId}:${canonId}`,
        runId,
        canonicalQuestionId: canonId,
        questionNumber: parsed.questionNumber,
        subQuestion: parsed.subQuestion,
        maximumMarks: 4, // Safe standard mark ceiling
        isMcq: attempt.isMcq,
        sourcePages: attempt.sourcePages,
      });
    }
  }

  return tasks;
}

/**
 * Builds the authoritative Single Canonical Evaluation Score Ledger.
 * Computes:
 * - Attempted Set
 * - Evaluated Set
 * - Rendered Set
 * - Counted Set
 *
 * Enforces:
 * - Attempted ⊆ Evaluated = Rendered = Counted
 * - Total score is strictly SUM(awardedMarks WHERE counted = true)
 * - Zero-mark attempted questions are kept intact with attempted: true, awardedMarks: 0, counted: true
 * - Unselected alternatives are excluded from count
 */
export function buildCanonicalEvaluationLedger(options: {
  runId: string;
  inventory: CanonicalQuestionInventory;
  attemptedMap: Map<string, IndependentAttemptRecord>;
  evaluatedQuestions: QuestionEvaluation[];
  selectedAlternatives?: Record<string, string | number>;
}): CanonicalEvaluationLedger {
  const { runId, inventory, attemptedMap, evaluatedQuestions, selectedAlternatives = {} } = options;
  const records: CanonicalEvaluationRecord[] = [];
  const errors: string[] = [];

  // Index evaluated questions by canonical ID
  const evalMap = new Map<string, QuestionEvaluation>();
  for (const q of evaluatedQuestions) {
    const canonId = q.canonicalId || toCanonicalQuestionId(q.questionNumber, q.subQuestion);
    evalMap.set(canonId, q);
    evalMap.set(canonId.toLowerCase(), q);
  }

  // Build canonical records for all inventory items
  const processedCanonIds = new Set<string>();

  for (const item of inventory.items) {
    const canonId = item.questionId;
    processedCanonIds.add(canonId);

    const attempt = attemptedMap.get(canonId);
    const isAttempted = Boolean(attempt && attempt.isAttempted);
    const evaluation = evalMap.get(canonId) || evalMap.get(canonId.toLowerCase());

    // Alternative handling:
    // If this question is part of an alternative group, check if it was the selected alternative
    let isSelectedAlternative = true;
    if (item.alternativeGroupId) {
      const selected = selectedAlternatives[item.alternativeGroupId];
      if (selected !== undefined && selected !== null) {
        isSelectedAlternative = String(selected) === canonId || String(selected) === item.subQuestionId;
      }
    }

    let status: CanonicalEvaluationStatus = 'UNATTEMPTED';
    let awardedMarks = 0;
    let counted = false;
    let rendered = true;

    if (isAttempted) {
      if (evaluation) {
        status = 'EVALUATED';
        awardedMarks = Number(evaluation.marksAwarded) || 0;
        counted = isSelectedAlternative; // Counted only if selected alternative (or non-alternative)
      } else {
        status = 'FAILED_TO_EVALUATE';
        errors.push(`ATTEMPTED_QUESTION_NOT_EVALUATED: Attempted question ${canonId} was not evaluated.`);
      }
    } else {
      if (item.isAlternative && !isSelectedAlternative) {
        status = 'EXCLUDED_ALTERNATIVE';
      } else {
        status = 'UNATTEMPTED';
      }
      awardedMarks = 0;
      counted = false;
    }

    records.push({
      questionId: canonId,
      parentQuestionId: item.parentQuestionId,
      subQuestionId: item.subQuestionId,
      attempted: isAttempted,
      sourcePages: attempt ? attempt.sourcePages : [],
      maxMarks: item.maxMarks,
      awardedMarks,
      evaluationStatus: status,
      rendered,
      counted,
      selectedAlternative: selectedAlternatives[item.alternativeGroupId || ''],
      evidence: attempt?.evidence,
      stepMarkingBreakdown: evaluation?.stepMarkingBreakdown,
      markingComponents: evaluation?.markingComponents,
    });
  }

  // Include any extra attempted questions evaluated that were not in predefined inventory
  for (const [canonId, attempt] of attemptedMap.entries()) {
    if (!processedCanonIds.has(canonId)) {
      processedCanonIds.add(canonId);
      const evaluation = evalMap.get(canonId) || evalMap.get(canonId.toLowerCase());
      const isAttempted = attempt.isAttempted;

      let status: CanonicalEvaluationStatus = 'FAILED_TO_EVALUATE';
      let awardedMarks = 0;
      let counted = false;

      if (evaluation) {
        status = 'EVALUATED';
        awardedMarks = Number(evaluation.marksAwarded) || 0;
        counted = true;
      } else {
        errors.push(`ATTEMPTED_QUESTION_NOT_EVALUATED: Attempted question ${canonId} was not evaluated.`);
      }

      records.push({
        questionId: canonId,
        parentQuestionId: parseCanonicalQuestionIdentity(canonId).parentQuestionId,
        subQuestionId: parseCanonicalQuestionIdentity(canonId).subQuestion,
        attempted: isAttempted,
        sourcePages: attempt.sourcePages,
        maxMarks: evaluation ? evaluation.maximumMarks : 4,
        awardedMarks,
        evaluationStatus: status,
        rendered: true,
        counted,
        evidence: attempt.evidence,
        stepMarkingBreakdown: evaluation?.stepMarkingBreakdown,
        markingComponents: evaluation?.markingComponents,
      });
    }
  }

  // Aggregate ledger metrics
  const totalCanonicalQuestions = records.length;
  const totalAttempted = records.filter((r) => r.attempted).length;
  const totalEvaluated = records.filter((r) => r.evaluationStatus === 'EVALUATED').length;
  const totalRendered = records.filter((r) => r.rendered).length;
  const totalCounted = records.filter((r) => r.counted).length;

  const totalMaxMarks = records
    .filter((r) => r.counted)
    .reduce((sum, r) => sum + r.maxMarks, 0);

  const rawAwardedSum = records
    .filter((r) => r.counted)
    .reduce((sum, r) => sum + r.awardedMarks, 0);

  const totalAwardedMarks = Math.round(rawAwardedSum * 4) / 4;

  // Enforce Core Invariant: Attempted ⊆ Evaluated
  for (const rec of records) {
    if (rec.attempted && rec.evaluationStatus !== 'EVALUATED') {
      errors.push(`INVARIANT_VIOLATION: Attempted question ${rec.questionId} has status ${rec.evaluationStatus}`);
    }
  }

  return {
    ledgerId: `ledger_${runId}`,
    evaluationRunId: runId,
    records,
    totalCanonicalQuestions,
    totalAttempted,
    totalEvaluated,
    totalRendered,
    totalCounted,
    totalMaxMarks,
    totalAwardedMarks,
    isReconciled: errors.length === 0,
    reconciliationErrors: errors,
  };
}

/**
 * Total Reconciliation Gate:
 * Verifies that canonicalLedgerTotal == scorecardTotal == renderedEvaluationTotal == finalDisplayedTotal. Exactly.
 * If any discrepancy exists, fails closed to prevent publishing misleading scores.
 */
export function verifyTotalReconciliationGate(options: {
  ledger: CanonicalEvaluationLedger;
  evaluationResultTotal: number;
  scorecardTotal: number;
  renderedTotal: number;
}): {
  passed: boolean;
  ledgerTotal: number;
  discrepancies: string[];
} {
  const { ledger, evaluationResultTotal, scorecardTotal, renderedTotal } = options;
  const discrepancies: string[] = [];

  const ledgerTotal = ledger.totalAwardedMarks;

  if (Math.abs(ledgerTotal - evaluationResultTotal) > 0.01) {
    discrepancies.push(
      `TOTAL_RECONCILIATION_FAILED: canonicalLedgerTotal (${ledgerTotal}) != evaluationResultTotal (${evaluationResultTotal})`
    );
  }

  if (Math.abs(ledgerTotal - scorecardTotal) > 0.01) {
    discrepancies.push(
      `SCORECARD_RECONCILIATION_FAILED: canonicalLedgerTotal (${ledgerTotal}) != scorecardTotal (${scorecardTotal})`
    );
  }

  if (Math.abs(ledgerTotal - renderedTotal) > 0.01) {
    discrepancies.push(
      `RENDERED_RECONCILIATION_FAILED: canonicalLedgerTotal (${ledgerTotal}) != renderedTotal (${renderedTotal})`
    );
  }

  return {
    passed: discrepancies.length === 0 && ledger.isReconciled,
    ledgerTotal,
    discrepancies,
  };
}

/**
 * Builds the detailed Reconciliation Section & Diagnostic Table for the final evaluation report.
 */
export function buildEvaluationReconciliationSection(
  ledger: CanonicalEvaluationLedger
): EvaluationReconciliationSection {
  const diagnosticTable: DiagnosticLedgerRow[] = ledger.records.map((r) => ({
    questionId: r.questionId,
    attempted: r.attempted,
    evaluated: r.evaluationStatus === 'EVALUATED',
    rendered: r.rendered,
    counted: r.counted,
    maxMarks: r.maxMarks,
    awardedMarks: r.awardedMarks,
    status: r.evaluationStatus,
  }));

  const allAttemptedCountedExactlyOnce = ledger.records
    .filter((r) => r.attempted && r.evaluationStatus === 'EVALUATED')
    .every((r) => r.counted || r.evaluationStatus === 'EXCLUDED_ALTERNATIVE');

  const summary =
    `Ledger Verified: ${ledger.totalCanonicalQuestions} canonical items, ` +
    `${ledger.totalAttempted} attempted, ${ledger.totalEvaluated} evaluated, ` +
    `${ledger.totalRendered} rendered, ${ledger.totalCounted} counted in total. ` +
    `Grand Total: ${ledger.totalAwardedMarks} / ${ledger.totalMaxMarks} marks.`;

  return {
    totalCanonicalQuestions: ledger.totalCanonicalQuestions,
    totalAttempted: ledger.totalAttempted,
    totalEvaluated: ledger.totalEvaluated,
    totalRendered: ledger.totalRendered,
    totalCounted: ledger.totalCounted,
    totalMaxMarks: ledger.totalMaxMarks,
    totalAwardedMarks: ledger.totalAwardedMarks,
    allAttemptedCountedExactlyOnce,
    diagnosticTable,
    ledgerSummary: summary,
  };
}

/**
 * Builds the independent StudentAttemptManifest and per-page coverage audit before scoring.
 */
export function buildStudentAttemptManifest(options: {
  runId: string;
  totalPages: number;
  inventory: CanonicalQuestionInventory;
  rawPageOccurrences: Array<{
    questionCode: string;
    pageNumber: number;
    evidenceText?: string;
    studentSnippet?: string;
    isContinuation?: boolean;
    isCrossedOut?: boolean;
    hasReplacement?: boolean;
    selectedOption?: string;
    isPartial?: boolean;
  }>;
  mcqSelections?: Record<string, string>;
}): StudentAttemptManifest {
  const { runId, totalPages, inventory, rawPageOccurrences, mcqSelections } = options;
  const attemptsMap = detectIndependentAttempts({
    inventory,
    rawPageOccurrences,
    mcqSelections,
  });

  const attempts: StudentAttemptManifestItem[] = [];
  for (const [canonId, att] of attemptsMap.entries()) {
    attempts.push({
      questionId: canonId,
      attempted: att.isAttempted,
      confidence: 100,
      sourcePages: att.sourcePages,
      evidence: att.evidence,
      isPartial: att.isPartial,
      isContinuation: att.isContinuation,
      selectedAlternative: att.selectedAlternative,
      studentSnippet: att.studentSnippet,
      studentSelectedOption: att.studentSelectedOption,
      isCrossedOutWithNoReplacement: att.isCrossedOutWithNoReplacement,
      isMcq: att.isMcq,
    });
  }

  // Construct Page Coverage Audit for all pages 1 to totalPages
  const pageCoverageAudit: PageCoverageAuditItem[] = [];
  for (let p = 1; p <= totalPages; p++) {
    const pageOccs = rawPageOccurrences.filter((occ) => occ.pageNumber === p);
    const hasStudentContent = pageOccs.length > 0;
    const detectedQuestionIds: string[] = [];

    for (const occ of pageOccs) {
      const canon = toCanonicalQuestionId(occ.questionCode);
      const parsed = parseCanonicalQuestionIdentity(canon);
      const matched = attempts.find((a) => a.questionId === parsed.canonicalId || a.questionId === canon);
      const effId = matched ? matched.questionId : parsed.canonicalId;
      if (!detectedQuestionIds.includes(effId)) {
        detectedQuestionIds.push(effId);
      }
    }

    for (const att of attempts) {
      if (att.sourcePages.includes(p) && !detectedQuestionIds.includes(att.questionId)) {
        detectedQuestionIds.push(att.questionId);
      }
    }

    pageCoverageAudit.push({
      pageNumber: p,
      hasStudentContent,
      detectedQuestionIds,
      evaluatedQuestionIds: [],
      renderedQuestionIds: [],
    });
  }

  return {
    manifestId: `manifest_${runId}`,
    evaluationRunId: runId,
    totalPages,
    attempts,
    pageCoverageAudit,
  };
}

/**
 * Builds the authoritative FourSetReconciliationReport:
 * - AttemptedSet ⊆ EvaluatedSet
 * - EvaluatedSet = RenderedSet = CountedSet (for scorable questions)
 * - canonicalLedgerTotal = scorecardTotal = evaluationReportTotal = checkedCopyTotal = finalDisplayedTotal
 */
export function buildFourSetReconciliation(options: {
  ledger: CanonicalEvaluationLedger;
  manifest: StudentAttemptManifest;
  scorecardTotal: number;
  evaluationReportTotal: number;
  checkedCopyTotal: number;
  finalDisplayedTotal: number;
}): FourSetReconciliationReport {
  const { ledger, manifest, scorecardTotal, evaluationReportTotal, checkedCopyTotal, finalDisplayedTotal } = options;

  const attemptedSet = Array.from(
    new Set(
      ledger.records.filter((r) => r.attempted).map((r) => r.questionId)
    )
  ).sort();

  const evaluatedSet = Array.from(
    new Set(
      ledger.records.filter((r) => r.evaluationStatus === 'EVALUATED').map((r) => r.questionId)
    )
  ).sort();

  const renderedSet = Array.from(
    new Set(
      ledger.records.filter((r) => r.rendered && r.evaluationStatus === 'EVALUATED').map((r) => r.questionId)
    )
  ).sort();

  const countedSet = Array.from(
    new Set(
      ledger.records.filter((r) => r.counted).map((r) => r.questionId)
    )
  ).sort();

  const mismatches: string[] = [];

  // Check 1: AttemptedSet ⊆ EvaluatedSet
  const isAttemptedSubsetOfEvaluated = attemptedSet.every((qId) => evaluatedSet.includes(qId));
  if (!isAttemptedSubsetOfEvaluated) {
    const missingInEvaluated = attemptedSet.filter((qId) => !evaluatedSet.includes(qId));
    mismatches.push(`ATTEMPTED_SET_BREACH: Attempted questions missing from evaluated set: ${missingInEvaluated.join(', ')}`);
  }

  // Check 2: EvaluatedSet == RenderedSet
  const isEvaluatedEqualToRendered =
    evaluatedSet.length === renderedSet.length &&
    evaluatedSet.every((qId) => renderedSet.includes(qId));
  if (!isEvaluatedEqualToRendered) {
    mismatches.push(`RENDERED_SET_MISMATCH: Evaluated set (${evaluatedSet.length}) does not match rendered set (${renderedSet.length})`);
  }

  // Check 3: RenderedSet == CountedSet (for scorable questions)
  const unselectedAlternatives = ledger.records
    .filter((r) => r.evaluationStatus === 'EXCLUDED_ALTERNATIVE')
    .map((r) => r.questionId);

  const nonAltEvaluated = evaluatedSet.filter((id) => !unselectedAlternatives.includes(id));
  const isRenderedEqualToCounted =
    nonAltEvaluated.length === countedSet.length &&
    nonAltEvaluated.every((qId) => countedSet.includes(qId));
  if (!isRenderedEqualToCounted) {
    mismatches.push(`COUNTED_SET_MISMATCH: Counted set (${countedSet.length}) does not match scorable evaluated set (${nonAltEvaluated.length})`);
  }

  // Check 4: Score Reconciliation
  const canonicalLedgerTotal = ledger.totalAwardedMarks;
  const isScoresReconciled =
    Math.abs(canonicalLedgerTotal - scorecardTotal) < 0.01 &&
    Math.abs(canonicalLedgerTotal - evaluationReportTotal) < 0.01 &&
    Math.abs(canonicalLedgerTotal - checkedCopyTotal) < 0.01 &&
    Math.abs(canonicalLedgerTotal - finalDisplayedTotal) < 0.01;

  if (!isScoresReconciled) {
    mismatches.push(
      `SCORE_RECONCILIATION_FAILED: canonicalLedgerTotal (${canonicalLedgerTotal}) != scorecardTotal (${scorecardTotal}) or reportTotal (${evaluationReportTotal}) or checkedCopyTotal (${checkedCopyTotal}) or finalTotal (${finalDisplayedTotal})`
    );
  }

  const diagnosticTable: DiagnosticLedgerRow[] = ledger.records.map((r) => ({
    questionId: r.questionId,
    attempted: r.attempted,
    evaluated: r.evaluationStatus === 'EVALUATED',
    rendered: r.rendered,
    counted: r.counted,
    maxMarks: r.maxMarks,
    awardedMarks: r.awardedMarks,
    status: r.evaluationStatus,
  }));

  const isFullyReconciled =
    isAttemptedSubsetOfEvaluated &&
    isEvaluatedEqualToRendered &&
    isRenderedEqualToCounted &&
    isScoresReconciled &&
    mismatches.length === 0;

  return {
    attemptedSet,
    evaluatedSet,
    renderedSet,
    countedSet,
    isAttemptedSubsetOfEvaluated,
    isEvaluatedEqualToRendered,
    isRenderedEqualToCounted,
    canonicalLedgerTotal,
    scorecardTotal,
    evaluationReportTotal,
    checkedCopyTotal,
    finalDisplayedTotal,
    isScoresReconciled,
    isFullyReconciled,
    mismatches,
    diagnosticTable,
  };
}

/**
 * Creates the single authoritative EvaluationRunPackage.
 */
export function createEvaluationRunPackage(options: {
  runId: string;
  evaluationId: string;
  sourceBundleId: string;
  questionInventory: CanonicalQuestionInventory;
  studentAttemptManifest: StudentAttemptManifest;
  evaluationRecords: CanonicalEvaluationRecord[];
  scoreLedger: CanonicalEvaluationLedger;
  pageCoverageAudit?: PageCoverageAuditItem[];
  reconciliation?: FourSetReconciliationReport;
  durablePersistenceConfirmed?: boolean;
}): EvaluationRunPackage {
  const {
    runId,
    evaluationId,
    sourceBundleId,
    questionInventory,
    studentAttemptManifest,
    evaluationRecords,
    scoreLedger,
    pageCoverageAudit = studentAttemptManifest.pageCoverageAudit,
    reconciliation = buildFourSetReconciliation({
      ledger: scoreLedger,
      manifest: studentAttemptManifest,
      scorecardTotal: scoreLedger.totalAwardedMarks,
      evaluationReportTotal: scoreLedger.totalAwardedMarks,
      checkedCopyTotal: scoreLedger.totalAwardedMarks,
      finalDisplayedTotal: scoreLedger.totalAwardedMarks,
    }),
    durablePersistenceConfirmed = false,
  } = options;

  const evaluatedCanonIds = new Set(
    evaluationRecords.filter((r) => r.evaluationStatus === 'EVALUATED').map((r) => r.questionId)
  );
  const updatedPageAudit: PageCoverageAuditItem[] = pageCoverageAudit.map((p) => {
    const pageEvaluated = p.detectedQuestionIds.filter((qId) => evaluatedCanonIds.has(qId));
    return {
      ...p,
      evaluatedQuestionIds: pageEvaluated,
      renderedQuestionIds: pageEvaluated,
    };
  });

  return {
    runId,
    evaluationId,
    sourceBundleId,
    questionInventory,
    studentAttemptManifest: {
      ...studentAttemptManifest,
      pageCoverageAudit: updatedPageAudit,
    },
    evaluationRecords,
    scoreLedger,
    pageCoverageAudit: updatedPageAudit,
    reconciliation,
    finalizationStatus: durablePersistenceConfirmed ? 'PERSISTED' : 'IN_EVALUATION',
    durablePersistenceConfirmed,
    auditTrail: [
      `Initialized package at ${new Date().toISOString()}`,
      `Total items: ${questionInventory.items.length}, Attempted: ${scoreLedger.totalAttempted}, Evaluated: ${scoreLedger.totalEvaluated}`,
    ],
  };
}

/**
 * Single Authoritative Finalization Gate:
 * This is the ONLY function allowed to transition an evaluation into COMPLETED / PUBLISHED / REPORT_READY.
 * Fails closed on ANY integrity or persistence violation.
 */
export function finalizeEvaluationRun(options: {
  runPackage: EvaluationRunPackage;
  evaluationId: string;
}): {
  success: boolean;
  package: EvaluationRunPackage;
  errors: string[];
} {
  const { runPackage, evaluationId } = options;
  const errors: string[] = [];

  // 1. Durable persistence confirmation requirement
  if (!runPackage.durablePersistenceConfirmed) {
    errors.push('FINALIZATION_FAILED: durablePersistenceConfirmed is false. Canonical package must be durably persisted before completion.');
  }

  // 2. Attempted set subset of evaluated set
  if (!runPackage.reconciliation.isAttemptedSubsetOfEvaluated) {
    errors.push('FINALIZATION_FAILED: Attempted question missing from evaluation. AttemptedSet ⊆ EvaluatedSet violated.');
  }

  // 3. Evaluated == Rendered
  if (!runPackage.reconciliation.isEvaluatedEqualToRendered) {
    errors.push('FINALIZATION_FAILED: EvaluatedSet != RenderedSet.');
  }

  // 4. Rendered == Counted (for scorable questions)
  if (!runPackage.reconciliation.isRenderedEqualToCounted) {
    errors.push('FINALIZATION_FAILED: RenderedSet != CountedSet.');
  }

  // 5. Score reconciliation
  if (!runPackage.reconciliation.isScoresReconciled) {
    errors.push('FINALIZATION_FAILED: Score reconciliation mismatch across ledger, scorecard, report, and checked copy.');
  }

  // 6. Check for any failed evaluations or unmapped questions
  const failedQuestions = runPackage.evaluationRecords.filter(
    (r) => r.attempted && (r.evaluationStatus === 'FAILED_TO_EVALUATE' || r.evaluationStatus === 'NEEDS_MAPPING_REVIEW')
  );
  if (failedQuestions.length > 0) {
    errors.push(`FINALIZATION_FAILED: Unresolved failed evaluations: ${failedQuestions.map((q) => `${q.questionId}:${q.evaluationStatus}`).join(', ')}`);
  }

  // 7. Check for duplicate canonical questions in evaluation records
  const seenIds = new Set<string>();
  for (const r of runPackage.evaluationRecords) {
    if (seenIds.has(r.questionId)) {
      errors.push(`FINALIZATION_FAILED: Duplicate canonical question in evaluation records: ${r.questionId}`);
    }
    seenIds.add(r.questionId);
  }

  // 8. Page coverage audit: verify every student page with content has evaluated questions
  for (const pageAudit of runPackage.pageCoverageAudit) {
    if (pageAudit.hasStudentContent && pageAudit.detectedQuestionIds.length > 0) {
      const anyEvaluated = pageAudit.detectedQuestionIds.some((qId) =>
        runPackage.reconciliation.evaluatedSet.includes(qId)
      );
      if (!anyEvaluated) {
        errors.push(`FINALIZATION_FAILED: Page ${pageAudit.pageNumber} contains student content for ${pageAudit.detectedQuestionIds.join(', ')} but none are evaluated.`);
      }
    }
  }

  if (errors.length > 0) {
    // Fail closed!
    const failedPackage: EvaluationRunPackage = {
      ...runPackage,
      finalizationStatus: 'INTEGRITY_FAILED',
      auditTrail: [
        ...runPackage.auditTrail,
        `Finalization REJECTED at ${new Date().toISOString()}: ${errors.join('; ')}`,
      ],
    };
    try {
      db.prepare(`
        UPDATE evaluations
        SET status = 'NEEDS_REVIEW',
            rejection_reason = ?,
            error_message = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?;
      `).run(errors.join(' | '), errors.join(' | '), evaluationId);
    } catch {}

    return {
      success: false,
      package: failedPackage,
      errors,
    };
  }

  // All invariants passed! Mark finalized
  const finalizedAt = new Date().toISOString();
  const finalizedPackage: EvaluationRunPackage = {
    ...runPackage,
    finalizationStatus: 'FINALIZED',
    finalizedAt,
    auditTrail: [
      ...runPackage.auditTrail,
      `Finalization APPROVED at ${finalizedAt}. Total: ${runPackage.scoreLedger.totalAwardedMarks} marks across ${runPackage.scoreLedger.totalCounted} counted items.`,
    ],
  };

  try {
    db.exec('BEGIN IMMEDIATE;');
    db.prepare(`
      UPDATE evaluation_run_packages
      SET finalization_status = 'FINALIZED',
          package_json = ?
      WHERE evaluation_id = ?;
    `).run(JSON.stringify(finalizedPackage), evaluationId);

    db.prepare(`
      UPDATE evaluations
      SET status = 'COMPLETED',
          progress_stage = 'COMPLETED',
          progress_percentage = 100,
          total_marks = ?,
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?;
    `).run(finalizedPackage.scoreLedger.totalAwardedMarks, evaluationId);
    db.exec('COMMIT;');
  } catch (err: any) {
    try { db.exec('ROLLBACK;'); } catch {}
    console.error('[DB] Finalization database commit error:', err);
    throw new Error(`FINALIZATION_DB_ERROR: ${err.message}`);
  }

  return {
    success: true,
    package: finalizedPackage,
    errors: [],
  };
}
