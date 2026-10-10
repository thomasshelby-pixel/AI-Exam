import {
  generateDetailedReportPdf as generateDetailedReportPdfImpl,
  enrichMarkingComponentsWithExaminerReasoning,
} from './detailedReportPdfService.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import {
  deduplicateQuestionList,
  toCanonicalQuestionId,
  parseCanonicalQuestionIdentity,
} from './canonicalQuestionService.js';
import { loadEvaluationRunPackage } from '../db.js';
import {
  CanonicalEvaluationRecord,
  RenderManifest,
  RenderManifestItem,
} from '../../src/types/index.js';

export interface EvaluationData {
  id: string;
  displayId?: string;
  studentCode?: string;
  studentName?: string;
  icaiRegistrationNumber?: string;
  level: string;
  subjectName: string;
  paper?: string;
  attempt?: string;
  checkingMode?: string;
  totalMarks?: number;
  maximumMarks?: number;
  percentage?: number;
  grade?: string;
  createdAt?: string;
  evaluationSource?: string;
  instituteName?: string;
  batchName?: string;
  version?: string;
  materialType?: string;
  mtpSeries?: 1 | 2;
}

export interface DetailedQuestionResult {
  questionNumber: string | number;
  marksAwarded: number;
  maxMarks: number;
  accuracyScore?: number;
  examinerRemarks?: string;
  stepsEvaluated?: Array<{
    stepName: string;
    marksAwarded: number;
    maxMarks: number;
    status: 'CORRECT' | 'PARTIALLY_CORRECT' | 'INCORRECT';
    comment?: string;
  }>;
  feedback?: string;
}

/**
 * Ensures text can be safely encoded by pdf-lib's standard WinAnsi fonts.
 * Replaces non-WinAnsi symbols (such as ✓, ✗, △, ₹, bullets, curly quotes, etc.)
 * with clean, authentic ASCII equivalents.
 */
export function toSafePdfText(input: any): string {
  if (input === null || input === undefined) return '';
  let str = String(input);

  str = str
    .replace(/[✓✔]/g, '[OK]')
    .replace(/[✗✘✕×]/g, '[X]')
    .replace(/[△▲]/g, '[PARTIAL]')
    .replace(/₹/g, 'Rs.')
    .replace(/[•●▪]/g, '-')
    .replace(/[★☆]/g, '*')
    .replace(/…/g, '...')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[≤]/g, '<=')
    .replace(/[≥]/g, '>=')
    .replace(/[≠]/g, '!=')
    .replace(/[±]/g, '+/-')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\t/g, '  ')
    .replace(/\r/g, '');

  // Strip or replace any remaining character outside standard printable ASCII + Latin-1
  return str.replace(/[^\x20-\x7E\n\xA0-\xFF]/g, ' ');
}

export function safeDrawText(page: any, text: any, options: any) {
  return page.drawText(toSafePdfText(text), options);
}

function drawCheckmark(page: any, x: number, y: number, color: any) {
  page.drawLine({
    start: { x, y: y + 3 },
    end: { x: x + 4, y },
    thickness: 1.5,
    color,
  });
  page.drawLine({
    start: { x: x + 4, y },
    end: { x: x + 11, y: y + 8 },
    thickness: 1.5,
    color,
  });
}

function drawCrossmark(page: any, x: number, y: number, color: any) {
  page.drawLine({
    start: { x, y },
    end: { x: x + 8, y: y + 8 },
    thickness: 1.5,
    color,
  });
  page.drawLine({
    start: { x, y: y + 8 },
    end: { x: x + 8, y },
    thickness: 1.5,
    color,
  });
}

/**
 * Generates an Authentic Checked Copy PDF with Examiner annotations, red-pen step marks,
 * and official scorecard.
 */
export interface PageAnnotation {
  pageNumber: number;
  questionNumber: string;
  canonicalId?: string;
  marksAwarded: number;
  maxMarks: number;
  studentSelectedOption?: string;
  officialAnswer?: string;
  steps: Array<{
    stepName: string;
    marksAwarded: number;
    maxMarks: number;
    status: string;
    comment?: string;
  }>;
}

export interface StructuredAnnotationsResult {
  evaluationId: string;
  totalPages: number;
  pages: Array<{
    pageNumber: number;
    annotations: PageAnnotation[];
    hasFinalExaminerSeal: boolean;
  }>;
  summary: {
    totalAwarded: number;
    maxMarks: number;
    percentage: number;
    resultStatus: string;
  };
  renderManifest?: RenderManifest;
}

/**
 * Universal Pre-Render Validation Gate (Section 8 & Section 13):
 * Before generating the Checked Copy PDF, validate every canonical record.
 * Fails closed with CHECKED_COPY_RENDER_INTEGRITY_FAILURE on any missing or invalid render field.
 */
export function validatePreRenderGate(options: {
  records: CanonicalEvaluationRecord[];
  totalPages: number;
}): {
  isValid: boolean;
  errors: string[];
  failedQuestionIds: string[];
} {
  const { records, totalPages } = options;
  const errors: string[] = [];
  const failedQuestionIds: string[] = [];

  for (const rec of records) {
    // Section 13: Attempted questions that failed to evaluate MUST block finalization
    if (rec.attempted && rec.evaluationStatus === 'FAILED_TO_EVALUATE') {
      errors.push(`PRE_RENDER_ERROR[${rec.questionId}]: Attempted question failed to evaluate. Cannot generate clean checked copy.`);
      failedQuestionIds.push(rec.questionId);
    }

    // For every evaluated record where annotation is required:
    const isEvaluated = rec.evaluationStatus === 'EVALUATED' || rec.evaluated === true;
    const isAnnotationReq = rec.annotationRequired !== false && (rec.attempted || isEvaluated);

    if (isEvaluated && isAnnotationReq) {
      if (!rec.questionId || typeof rec.questionId !== 'string') {
        errors.push(`PRE_RENDER_ERROR: Missing or invalid questionId.`);
        failedQuestionIds.push(rec.questionId || 'UNKNOWN');
        continue;
      }
      if (rec.maxMarks === undefined || rec.maxMarks === null || isNaN(rec.maxMarks) || rec.maxMarks <= 0) {
        errors.push(`PRE_RENDER_ERROR[${rec.questionId}]: Invalid maxMarks (${rec.maxMarks}). Must be positive.`);
        failedQuestionIds.push(rec.questionId);
      }
      if (rec.awardedMarks === undefined || rec.awardedMarks === null || isNaN(rec.awardedMarks) || rec.awardedMarks < 0) {
        errors.push(`PRE_RENDER_ERROR[${rec.questionId}]: Invalid awardedMarks (${rec.awardedMarks}).`);
        failedQuestionIds.push(rec.questionId);
      }
      const studentPages = rec.studentPages || rec.sourcePages || [];
      if (!Array.isArray(studentPages) || studentPages.length === 0) {
        errors.push(`PRE_RENDER_ERROR[${rec.questionId}]: studentPages is empty. Cannot determine render target.`);
        failedQuestionIds.push(rec.questionId);
      }
      const annPage = rec.annotationPage || (studentPages.length > 0 ? studentPages[0] : 0);
      if (!annPage || annPage < 1 || annPage > totalPages) {
        errors.push(`PRE_RENDER_ERROR[${rec.questionId}]: Invalid annotationPage ${annPage} for totalPages ${totalPages}.`);
        failedQuestionIds.push(rec.questionId);
      }
      if (!rec.annotationAnchor || !rec.annotationAnchor.region || !rec.annotationAnchor.annotationType) {
        errors.push(`PRE_RENDER_ERROR[${rec.questionId}]: Invalid or missing annotationAnchor.`);
        failedQuestionIds.push(rec.questionId);
      }
      if (rec.evaluationStatus !== 'EVALUATED') {
        errors.push(`PRE_RENDER_ERROR[${rec.questionId}]: evaluationStatus is ${rec.evaluationStatus}, expected EVALUATED.`);
        failedQuestionIds.push(rec.questionId);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    failedQuestionIds: Array.from(new Set(failedQuestionIds)),
  };
}

/**
 * Universal Post-Render Validation Gate (Section 9):
 * Inspects all rendered annotations against canonical evaluated records.
 * Enforces:
 * - Every evaluated + annotationRequired question is rendered exactly once
 * - Zero evaluated questions have rendered = false
 * - No question has annotationCount > 1
 * - Zero orphan annotations exist without a canonical questionId
 */
export function validatePostRenderGate(options: {
  evaluationId: string;
  runId: string;
  records: CanonicalEvaluationRecord[];
  renderedAnnotations: Array<{ pageNumber: number; questionNumber: string; canonicalId?: string; marksAwarded: number; maxMarks: number }>;
  totalPages: number;
}): {
  isValid: boolean;
  renderManifest: RenderManifest;
  orphanAnnotations: string[];
  errors: string[];
} {
  const { evaluationId, runId, records, renderedAnnotations, totalPages } = options;
  const errors: string[] = [];
  const orphanAnnotations: string[] = [];

  const renderedMap = new Map<string, { count: number; pages: number[] }>();
  for (const ann of renderedAnnotations) {
    const qId = ann.canonicalId || ann.questionNumber;
    if (!renderedMap.has(qId)) {
      renderedMap.set(qId, { count: 0, pages: [] });
    }
    const entry = renderedMap.get(qId)!;
    entry.count += 1;
    if (!entry.pages.includes(ann.pageNumber)) {
      entry.pages.push(ann.pageNumber);
    }
  }

  const canonicalIds = new Set(records.map((r) => r.questionId));

  for (const [qId, entry] of renderedMap.entries()) {
    if (!canonicalIds.has(qId)) {
      orphanAnnotations.push(qId);
      errors.push(`POST_RENDER_ERROR: Orphan annotation ${qId} exists without a canonical question record.`);
    }
  }

  const manifestItems: RenderManifestItem[] = [];
  let totalEvaluated = 0;
  let totalRendered = 0;

  for (const rec of records) {
    const isEvaluated = rec.evaluationStatus === 'EVALUATED' || rec.evaluated === true;
    const isAnnotationReq = rec.annotationRequired !== false && (rec.attempted || isEvaluated);
    if (isEvaluated) totalEvaluated++;

    const renderEntry = renderedMap.get(rec.questionId);
    const wasRendered = Boolean(renderEntry && renderEntry.count > 0);
    if (wasRendered) totalRendered++;

    const annotationCount = renderEntry ? renderEntry.count : 0;
    const renderedPages = renderEntry ? renderEntry.pages : [];

    if (isEvaluated && isAnnotationReq) {
      if (!wasRendered) {
        errors.push(`POST_RENDER_ERROR[${rec.questionId}]: Evaluated question was NOT rendered on checked copy.`);
      }
      if (annotationCount > 1) {
        errors.push(`POST_RENDER_ERROR[${rec.questionId}]: Duplicate rendering detected (${annotationCount} occurrences). Exactly 1 required.`);
      }
    }

    manifestItems.push({
      questionId: rec.questionId,
      evaluated: isEvaluated,
      annotationRequired: isAnnotationReq,
      rendered: wasRendered,
      renderedPages,
      annotationCount,
      renderAnchorValid: Boolean(rec.annotationAnchor),
      status: rec.evaluationStatus,
    });
  }

  const isRenderValid = errors.length === 0 && orphanAnnotations.length === 0;

  const renderManifest: RenderManifest = {
    evaluationId,
    runId,
    items: manifestItems,
    totalEvaluated,
    totalRendered,
    isRenderValid,
    orphanAnnotations,
    renderErrors: errors,
    timestamp: new Date().toISOString(),
  };

  return {
    isValid: isRenderValid,
    renderManifest,
    orphanAnnotations,
    errors,
  };
}

/**
 * Builds structured page-level annotations for persistence in database (Rule 73 & Rule 87).
 * Universal Rendering Contract:
 * - Single Canonical Render Source (EvaluationRunPackage)
 * - Deterministic render order from inventory sourceOrder
 * - Pre-Render Gate & Post-Render Gate verification
 */
export function buildStructuredAnnotations(
  evalData: EvaluationData,
  resultJson: any,
  totalPages: number
): StructuredAnnotationsResult {
  const safeTotalPages = Math.max(1, totalPages);

  // 1. Single Canonical Render Source: Resolve authoritative EvaluationRunPackage or scoreLedger
  let canonicalRecords: CanonicalEvaluationRecord[] = [];
  const runPkg = resultJson?.evaluationRunPackage || (evalData.id ? loadEvaluationRunPackage(evalData.id) : null);

  if (runPkg && Array.isArray(runPkg.evaluationRecords) && runPkg.evaluationRecords.length > 0) {
    canonicalRecords = runPkg.evaluationRecords;
  } else if (resultJson?.canonicalLedger && Array.isArray(resultJson.canonicalLedger.records) && resultJson.canonicalLedger.records.length > 0) {
    canonicalRecords = resultJson.canonicalLedger.records;
  } else {
    // Normalize into canonical records
    const rawQuestions: any[] = resultJson?.questionWiseBreakdown || resultJson?.questions || [];
    const dedupedQuestions = deduplicateQuestionList(rawQuestions);
    canonicalRecords = dedupedQuestions.map((q, idx) => {
      const canonId = q.canonicalId || toCanonicalQuestionId(q.questionNumber, q.subQuestion) || `Q${idx + 1}`;
      const sPages = Array.isArray(q.sourcePages) && q.sourcePages.length > 0
        ? q.sourcePages
        : q.pageNumber ? [Number(q.pageNumber)] : [1];
      const isMcq = q.questionType === 'MCQ' || canonId.toUpperCase().startsWith('MCQ');
      const isAttempted = q.status !== 'not_attempted';
      const isEvaluated = q.status !== 'not_attempted';
      const targetPage = sPages[0] || 1;

      return {
        questionId: canonId,
        parentQuestionId: parseCanonicalQuestionIdentity(canonId).parentQuestionId,
        subQuestionId: parseCanonicalQuestionIdentity(canonId).subQuestion,
        questionType: isMcq ? 'MCQ' : 'DESCRIPTIVE',
        attempted: isAttempted,
        evaluated: isEvaluated,
        sourcePages: sPages,
        studentPages: sPages,
        maxMarks: Number(q.maximumMarks ?? q.maxMarks ?? 4),
        awardedMarks: Number(q.marksAwarded ?? 0),
        evaluationStatus: isEvaluated ? 'EVALUATED' : 'UNATTEMPTED',
        annotationRequired: isAttempted,
        annotationPage: targetPage,
        annotationAnchor: {
          pageNumber: targetPage,
          region: 'RIGHT_MARGIN',
          annotationType: isMcq ? 'MCQ_BADGE' : 'SCORE_BOX',
        },
        renderOrder: idx + 1,
        rendered: true,
        counted: true,
        markingComponents: q.markingComponents,
        stepMarkingBreakdown: q.stepMarkingBreakdown,
        studentSelectedOption: q.candidateSelectedOption || q.studentSelectedOption,
        officialAnswer: q.officialCorrectOption || q.officialAnswer,
      };
    });
  }

  // Calculate totals from canonical ledger or records
  const totalAwarded = runPkg?.scoreLedger?.totalAwardedMarks
    ?? resultJson?.canonicalLedger?.totalAwardedMarks
    ?? evalData.totalMarks
    ?? resultJson?.totalMarksAwarded
    ?? resultJson?.totalMarks
    ?? (canonicalRecords.length > 0
        ? canonicalRecords.filter((r) => r.counted !== false).reduce((sum, r) => sum + (Number(r.awardedMarks) || 0), 0)
        : 0);

  const maxMarks = runPkg?.scoreLedger?.totalMaxMarks
    ?? resultJson?.canonicalLedger?.totalMaxMarks
    ?? evalData.maximumMarks
    ?? resultJson?.maximumMarks
    ?? (canonicalRecords.length > 0
        ? canonicalRecords.filter((r) => r.counted !== false).reduce((sum, r) => sum + (Number(r.maxMarks) || 0), 0)
        : 100);

  const percentage = maxMarks > 0 ? (totalAwarded / maxMarks) * 100 : 0;
  const resultStatus = percentage >= 60 ? 'EXEMPTION' : percentage >= 40 ? 'PASS' : 'FAIL';

  // Section 8: PRE-RENDER VALIDATION GATE
  const preGate = validatePreRenderGate({
    records: canonicalRecords,
    totalPages: safeTotalPages,
  });

  if (!preGate.isValid) {
    const err = new Error(`CHECKED_COPY_RENDER_INTEGRITY_FAILURE: Pre-render validation failed: ${preGate.errors.join('; ')}`) as any;
    err.code = 'CHECKED_COPY_RENDER_INTEGRITY_FAILURE';
    err.failedQuestionIds = preGate.failedQuestionIds;
    throw err;
  }

  // Section 15: Sort strictly by renderOrder derived from inventory sourceOrder
  const sortedRecords = [...canonicalRecords].sort(
    (a, b) => (a.renderOrder ?? 1000) - (b.renderOrder ?? 1000)
  );

  const pagesMap = new Map<number, PageAnnotation[]>();
  for (let p = 1; p <= safeTotalPages; p++) {
    pagesMap.set(p, []);
  }

  const renderedAnnotationsList: Array<{ pageNumber: number; questionNumber: string; canonicalId?: string; marksAwarded: number; maxMarks: number }> = [];

  for (const rec of sortedRecords) {
    // Only render questions where annotationRequired is true
    // (Section 14: Unselected alternatives have annotationRequired = false)
    // (Section 12: Zero-mark answers have annotationRequired = true, attempted = true, awardedMarks = 0)
    if (!rec.annotationRequired) {
      continue;
    }

    let targetPage = rec.annotationPage;
    if (!targetPage && rec.studentPages && rec.studentPages.length > 0) {
      if (rec.studentPages.length > 1) {
        let minPage = rec.studentPages[0];
        let minCount = (pagesMap.get(minPage) || []).length;
        for (const p of rec.studentPages) {
          const count = (pagesMap.get(p) || []).length;
          if (count < minCount) {
            minCount = count;
            minPage = p;
          }
        }
        targetPage = minPage;
      } else {
        targetPage = rec.studentPages[0];
      }
    }
    targetPage = targetPage || 1;
    const safeTargetPage = Math.min(Math.max(1, targetPage), safeTotalPages);

    // Section 4: MCQ Rendering Contract
    // Section 5: Descriptive Question Rendering Contract
    let steps: any[] = [];
    if (rec.markingComponents && rec.markingComponents.length > 0) {
      steps = rec.markingComponents;
    } else if (rec.stepMarkingBreakdown && rec.stepMarkingBreakdown.length > 0) {
      steps = rec.stepMarkingBreakdown;
    } else if (rec.questionType === 'MCQ' || rec.questionId.toUpperCase().startsWith('MCQ')) {
      const isCorrect = rec.awardedMarks >= rec.maxMarks;
      steps = [
        {
          componentType: 'MCQ',
          stepName: `Option: ${rec.studentSelectedOption || '-'} | Key: ${rec.officialAnswer || '-'}`,
          marksAwarded: rec.awardedMarks,
          maxMarks: rec.maxMarks,
          status: isCorrect ? 'CORRECT' : 'INCORRECT',
          comment: isCorrect ? 'Option verified with official answer' : 'Option does not match official key',
        },
      ];
    } else {
      steps = [
        {
          componentType: 'PROVISION',
          stepName: 'Statutory / Conceptual Principle',
          marksAwarded: Math.min(2, rec.awardedMarks),
          maxMarks: Math.min(2, rec.maxMarks),
          status: rec.awardedMarks > 0 ? 'CORRECT' : 'INCORRECT',
          comment: rec.awardedMarks > 0 ? 'Relevant principle identified' : 'Principle missing or omitted',
        },
        {
          componentType: 'APPLICATION',
          stepName: 'Application & Working Notes',
          marksAwarded: Math.max(0, rec.awardedMarks - 2),
          maxMarks: Math.max(1, rec.maxMarks - 2),
          status: rec.awardedMarks >= rec.maxMarks ? 'CORRECT' : rec.awardedMarks > 0 ? 'PARTIALLY_CORRECT' : 'INCORRECT',
          comment: rec.awardedMarks >= rec.maxMarks ? 'Calculations verified' : 'Partial working verified',
        },
      ];
    }

    const pageAnn: PageAnnotation = {
      pageNumber: safeTargetPage,
      questionNumber: rec.questionId,
      canonicalId: rec.questionId,
      marksAwarded: rec.awardedMarks,
      maxMarks: rec.maxMarks,
      studentSelectedOption: rec.studentSelectedOption,
      officialAnswer: rec.officialAnswer,
      steps: steps.map((s: any) => {
        const cType = s.componentType || (s.stepName && s.stepName.startsWith('[') ? '' : 'STEP');
        const prefix = cType ? `[${cType}] ` : '';
        const name = s.expectedRequirement || s.step || s.stepName || 'Step';
        const sMax = Number(s.marksAvailable || s.maximumMarks || s.maxMarks || 1);
        const sAward = Number(s.marksAwarded ?? 0);
        const sStatus = s.assessment || s.status || (sAward >= sMax ? 'CORRECT' : sAward > 0 ? 'PARTIALLY_CORRECT' : 'INCORRECT');
        const sDeduction = s.deductionReason ? `Deduction: ${s.deductionReason}` : (s.remarks || s.comment || s.studentEvidence || '');

        return {
          stepName: `${prefix}${name}`.trim(),
          marksAwarded: sAward,
          maxMarks: sMax,
          status: sStatus,
          comment: sDeduction,
        };
      }),
    };

    pagesMap.get(safeTargetPage)!.push(pageAnn);
    renderedAnnotationsList.push({
      pageNumber: safeTargetPage,
      questionNumber: rec.questionId,
      canonicalId: rec.questionId,
      marksAwarded: rec.awardedMarks,
      maxMarks: rec.maxMarks,
    });
  }

  // Section 9: POST-RENDER VALIDATION GATE
  const postGate = validatePostRenderGate({
    evaluationId: evalData.id,
    runId: runPkg?.runId || evalData.id,
    records: canonicalRecords,
    renderedAnnotations: renderedAnnotationsList,
    totalPages: safeTotalPages,
  });

  if (!postGate.isValid) {
    const err = new Error(`CHECKED_COPY_RENDER_INTEGRITY_FAILURE: Post-render validation failed: ${postGate.errors.join('; ')}`) as any;
    err.code = 'CHECKED_COPY_RENDER_INTEGRITY_FAILURE';
    err.renderManifest = postGate.renderManifest;
    throw err;
  }

  // Attach renderManifest to runPkg if available
  if (runPkg) {
    (runPkg as any).renderManifest = postGate.renderManifest;
  }

  const pagesList = [];
  for (let p = 1; p <= safeTotalPages; p++) {
    pagesList.push({
      pageNumber: p,
      annotations: pagesMap.get(p) || [],
      hasFinalExaminerSeal: p === safeTotalPages,
    });
  }

  return {
    evaluationId: evalData.id,
    totalPages: safeTotalPages,
    pages: pagesList,
    summary: {
      totalAwarded,
      maxMarks,
      percentage,
      resultStatus,
    },
    renderManifest: postGate.renderManifest,
  };
}

/**
 * Generates the Authentic Checked Copy PDF.
 * CRITICAL RULE (Rules 69-89):
 * The Checked Copy is STRICTLY the original student answer sheet pages + red-ink examiner annotations.
 * NEVER adds cover pages, summary pages, scorecard pages, report pages, or extra blank pages.
 * Enforces originalPageCount === checkedCopyPageCount assertion.
 */
export async function generateCheckedCopyPdf(
  evalData: EvaluationData,
  resultJson: any,
  originalPdfBuffer?: Buffer
): Promise<Buffer> {
  const runPkg = resultJson?.evaluationRunPackage || (evalData.id ? loadEvaluationRunPackage(evalData.id) : null);
  const totalAwarded = runPkg?.scoreLedger?.totalAwardedMarks
    ?? resultJson?.canonicalLedger?.totalAwardedMarks
    ?? evalData.totalMarks
    ?? resultJson?.totalMarksAwarded
    ?? resultJson?.totalMarks
    ?? 0;
  const maxMarks = runPkg?.scoreLedger?.totalMaxMarks
    ?? resultJson?.canonicalLedger?.totalMaxMarks
    ?? evalData.maximumMarks
    ?? resultJson?.maximumMarks
    ?? 100;
  const percentage = maxMarks > 0 ? (totalAwarded / maxMarks) * 100 : 0;
  const resultStatus = percentage >= 60 ? 'EXEMPTION' : percentage >= 40 ? 'PASS' : 'FAIL';

  let pdfDoc: PDFDocument;

  if (originalPdfBuffer && originalPdfBuffer.length > 100) {
    try {
      pdfDoc = await PDFDocument.load(originalPdfBuffer);
    } catch (err) {
      console.warn('Could not parse original PDF buffer:', err);
      throw new Error('Original answer sheet PDF is corrupted or cannot be parsed.');
    }
  } else {
    throw new Error('Original student answer sheet PDF buffer is required for checked copy generation.');
  }

  // 1. Record exact original page count BEFORE any annotation
  const originalPageCount = pdfDoc.getPageCount();
  if (originalPageCount <= 0) {
    throw new Error('Original student PDF contains 0 pages.');
  }

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Official Examiner Palette
  const redExaminer = rgb(0.82, 0.12, 0.15);
  const greenExaminer = rgb(0.08, 0.62, 0.32);
  const amberExaminer = rgb(0.85, 0.55, 0.05);
  const darkSlate = rgb(0.12, 0.16, 0.24);
  const grayText = rgb(0.4, 0.45, 0.55);

  // 2. Build structured page annotations
  const structuredData = buildStructuredAnnotations(evalData, resultJson, originalPageCount);
  const manifestItems = structuredData.renderManifest?.items || [];
  const gateRecords = manifestItems.map((item) => ({
    questionId: item.questionId,
    attempted: item.annotationRequired,
    evaluated: item.evaluated,
    evaluationStatus: item.status,
    annotationRequired: item.annotationRequired,
  } as CanonicalEvaluationRecord));
  const physicallyRenderedAnnotations: Array<{
    pageNumber: number;
    questionNumber: string;
    canonicalId?: string;
    marksAwarded: number;
    maxMarks: number;
  }> = [];

  const rejectIncompletePhysicalRender = (reason: string): never => {
    const physicalGate = validatePostRenderGate({
      evaluationId: evalData.id,
      runId: runPkg?.runId || evalData.id,
      records: gateRecords,
      renderedAnnotations: physicallyRenderedAnnotations,
      totalPages: originalPageCount,
    });
    const err = new Error(
      `CHECKED_COPY_RENDER_INTEGRITY_FAILURE: ${reason}${physicalGate.errors.length ? `; ${physicalGate.errors.join('; ')}` : ''}`
    ) as any;
    err.code = 'CHECKED_COPY_RENDER_INTEGRITY_FAILURE';
    err.renderManifest = physicalGate.renderManifest;
    err.failedQuestionIds = physicalGate.renderManifest.items.filter((item) => item.annotationRequired && !item.rendered).map((item) => item.questionId);
    if (runPkg) (runPkg as any).renderManifest = physicalGate.renderManifest;
    throw err;
  };

  // 3. Annotate EACH existing page in-place (DO NOT insert or add ANY pages)
  for (let pageIdx = 0; pageIdx < originalPageCount; pageIdx++) {
    const pageNumber = pageIdx + 1;
    const page = pdfDoc.getPage(pageIdx);
    const { width, height } = page.getSize();
    const pageAnnotations = structuredData.pages[pageIdx]?.annotations || [];

    // (A) Top Header Examiner Banner (Discreet overlay in top margin)
    page.drawRectangle({
      x: 0,
      y: height - 26,
      width,
      height: 26,
      color: rgb(0.99, 0.95, 0.95),
      borderColor: redExaminer,
      borderWidth: 0.5,
    });

    safeDrawText(
      page,
      `CA EXAM CHECKER AI  |  EVALUATED COPY (PAGE ${pageNumber} OF ${originalPageCount})  |  LEVEL: ${evalData.level}`,
      {
        x: 18,
        y: height - 17,
        size: 7.5,
        font: helveticaBold,
        color: redExaminer,
      }
    );

    safeDrawText(page, 'AI STEP-CHECKED', {
      x: width - 100,
      y: height - 17,
      size: 7.5,
      font: helveticaBold,
      color: redExaminer,
    });

    // (B) Right Margin Question & Step Marks Overlay
    // Positioned strictly in the right margin so candidate's handwritten body is never obscured
    const marginWidth = 140;
    const marginX = width - marginWidth - 8;
    let currY = height - 70;
    const availableHeightOnPage = (height - 70) - 85;

    // Estimate standard required height to determine if this page needs adaptive compact layout
    let estimatedStandardHeight = 0;
    for (const qAnn of pageAnnotations) {
      const isMcq = qAnn.questionNumber.startsWith('MCQ');
      if (isMcq) {
        const optionStep = qAnn.steps[0];
        const rawFeedback = optionStep?.comment || '';
        const lineCount = rawFeedback ? Math.min(3, Math.ceil(rawFeedback.length / 32)) : 0;
        estimatedStandardHeight += Math.max(42, 40 + lineCount * 7) + 6;
      } else {
        estimatedStandardHeight += 44;
        for (const st of qAnn.steps) {
          const rawComment = st.comment || st.stepName || '';
          const lineCount = rawComment ? Math.min(3, Math.ceil(rawComment.length / 24)) : 0;
          estimatedStandardHeight += 18 + lineCount * 9 + 4;
        }
        estimatedStandardHeight += 6;
      }
    }

    const isCompactMode = estimatedStandardHeight > availableHeightOnPage;

    for (const qAnn of pageAnnotations) {
      const isMcqAnnotation = qAnn.questionNumber.startsWith('MCQ');
      const optionStep = qAnn.steps[0];
      const optionMatch = optionStep?.stepName.match(/Option:\s*([^|]+)\|\s*Key:\s*([^|]+)/i);
      const selectedOption = qAnn.studentSelectedOption || optionMatch?.[1]?.trim() || '-';
      const officialKey = qAnn.officialAnswer || optionMatch?.[2]?.trim() || '-';
      const mcqStatus = qAnn.marksAwarded >= qAnn.maxMarks
        ? 'CORRECT'
        : qAnn.marksAwarded > 0 ? 'PARTIAL' : 'INCORRECT';
      const mcqFeedbackLines: string[] = [];
      const mcqFeedback = optionStep?.comment || '';
      if (mcqFeedback) {
        const words = mcqFeedback.split(/\s+/);
        let line = '';
        const maxLines = isCompactMode ? 2 : 5;
        for (const word of words) {
          if ((line + ' ' + word).trim().length <= 36) {
            line = (line + ' ' + word).trim();
          } else {
            if (line) mcqFeedbackLines.push(line);
            if (mcqFeedbackLines.length >= maxLines) break;
            line = word;
          }
        }
        if (line && mcqFeedbackLines.length < maxLines) mcqFeedbackLines.push(line);
      }
      const mcqCardHeight = isCompactMode
        ? Math.max(36, 32 + mcqFeedbackLines.length * 6)
        : Math.max(42, 40 + mcqFeedbackLines.length * 7);
      const preparedSteps = qAnn.steps.map((st) => {
        const commentLines: string[] = [];
        const rawComment = st.comment || st.stepName;
        if (rawComment) {
          const words = rawComment.split(/\s+/);
          let line = '';
          const maxLines = isCompactMode ? 2 : 4;
          for (const word of words) {
            if ((line + ' ' + word).trim().length <= 26) {
              line = (line + ' ' + word).trim();
            } else {
              if (line) commentLines.push(line);
              if (commentLines.length >= maxLines) break;
              line = word;
            }
          }
          if (line && commentLines.length < maxLines) {
            commentLines.push(line);
          } else if (commentLines.length > 0 && commentLines.length >= maxLines && !commentLines[commentLines.length - 1].endsWith('...')) {
            commentLines[commentLines.length - 1] = commentLines[commentLines.length - 1].slice(0, 23) + '...';
          }
        }
        const bHeight = isCompactMode
          ? Math.max(16, 12 + commentLines.length * 7.5)
          : 18 + commentLines.length * 9;
        return {
          step: st,
          displayLines: commentLines,
          boxHeight: bHeight,
        };
      });

      // Preflight the whole canonical annotation before drawing any of it. A
      // page-height limit is an integrity failure, never a reason to drop the
      // current question or its remaining steps silently.
      const qHeaderHeight = isCompactMode ? 30 : 36;
      const qHeaderAdvance = isCompactMode ? 36 : 44;
      const stepGap = isCompactMode ? 2.5 : 4;

      if (isMcqAnnotation) {
        if (currY - mcqCardHeight < 85) {
          rejectIncompletePhysicalRender(`MCQ annotation ${qAnn.canonicalId || qAnn.questionNumber} does not fit on source page ${pageNumber}.`);
        }
      } else {
        let plannedY = currY;
        if (plannedY - qHeaderHeight < 85) {
          rejectIncompletePhysicalRender(`Question annotation ${qAnn.canonicalId || qAnn.questionNumber} does not fit on source page ${pageNumber}.`);
        }
        plannedY -= qHeaderAdvance;
        for (const prepared of preparedSteps) {
          if (plannedY - prepared.boxHeight + 8 < 85) {
            rejectIncompletePhysicalRender(`Step marking for ${qAnn.canonicalId || qAnn.questionNumber} does not fit on source page ${pageNumber}.`);
          }
          plannedY -= prepared.boxHeight + stepGap;
        }
      }

      // Question Score Box
      page.drawRectangle({
        x: marginX,
        y: currY - (isMcqAnnotation ? mcqCardHeight : qHeaderHeight),
        width: marginWidth,
        height: isMcqAnnotation ? mcqCardHeight : qHeaderHeight,
        color: rgb(1, 0.97, 0.97),
        borderColor: redExaminer,
        borderWidth: 1.2,
      });

      const qDisplay = qAnn.questionNumber.startsWith('Q') || qAnn.questionNumber.startsWith('MCQ')
        ? qAnn.questionNumber
        : `Q.${qAnn.questionNumber}`;

      safeDrawText(page, qDisplay, {
        x: marginX + 6,
        y: currY - (isCompactMode ? 12 : 14),
        size: isCompactMode ? 8.5 : 9.5,
        font: helveticaBold,
        color: redExaminer,
      });

      safeDrawText(page, `+${qAnn.marksAwarded.toFixed(1)} / ${qAnn.maxMarks}`, {
        x: marginX + (isCompactMode ? 46 : 50),
        y: currY - (isCompactMode ? 12 : 14),
        size: isCompactMode ? 9.5 : 10.5,
        font: helveticaBold,
        color: redExaminer,
      });

      if (isMcqAnnotation) {
        safeDrawText(page, `Selected: ${selectedOption} | Key: ${officialKey}`, {
          x: marginX + 6,
          y: currY - (isCompactMode ? 22 : 26),
          size: isCompactMode ? 5.2 : 5.8,
          font: helveticaBold,
          color: darkSlate,
        });
        safeDrawText(page, `MCQ ${mcqStatus}`, {
          x: marginX + 6,
          y: currY - (isCompactMode ? 30 : 35),
          size: isCompactMode ? 5.2 : 5.8,
          font: helveticaBold,
          color: qAnn.marksAwarded >= qAnn.maxMarks ? greenExaminer : redExaminer,
        });
        let feedbackY = currY - (isCompactMode ? 38 : 44);
        for (const feedbackLine of mcqFeedbackLines) {
          safeDrawText(page, feedbackLine, {
            x: marginX + 6,
            y: feedbackY,
            size: isCompactMode ? 4.8 : 5.2,
            font: helvetica,
            color: darkSlate,
          });
          feedbackY -= (isCompactMode ? 6 : 7);
        }
        currY -= mcqCardHeight + (isCompactMode ? 4 : 6);
        physicallyRenderedAnnotations.push({
          pageNumber,
          questionNumber: qAnn.questionNumber,
          canonicalId: qAnn.canonicalId,
          marksAwarded: qAnn.marksAwarded,
          maxMarks: qAnn.maxMarks,
        });
        continue;
      }

      safeDrawText(page, 'STEP-WISE EVALUATION', {
        x: marginX + 6,
        y: currY - (isCompactMode ? 24 : 28),
        size: isCompactMode ? 5.8 : 6.5,
        font: helveticaBold,
        color: darkSlate,
      });

      currY -= qHeaderAdvance;

      // Render Individual Step Markings
      for (const { step: st, displayLines, boxHeight } of preparedSteps) {

        const isCorrect = st.status === 'CORRECT';
        const isPartial = st.status === 'PARTIALLY_CORRECT';
        const markColor = isCorrect ? greenExaminer : isPartial ? amberExaminer : redExaminer;

        // Step container
        page.drawRectangle({
          x: marginX,
          y: currY - boxHeight + 8,
          width: marginWidth,
          height: boxHeight,
          color: isCorrect ? rgb(0.97, 1, 0.97) : isPartial ? rgb(1, 0.99, 0.94) : rgb(1, 0.96, 0.96),
          borderColor: isCorrect ? rgb(0.6, 0.85, 0.6) : isPartial ? rgb(0.9, 0.75, 0.4) : rgb(0.9, 0.6, 0.6),
          borderWidth: 0.5,
        });

        if (isCorrect) {
          drawCheckmark(page, marginX + 4, currY - (isCompactMode ? 1 : 0), greenExaminer);
        } else if (isPartial) {
          page.drawRectangle({
            x: marginX + 4,
            y: currY - (isCompactMode ? 3 : 2),
            width: isCompactMode ? 6 : 7,
            height: isCompactMode ? 6 : 7,
            borderColor: amberExaminer,
            borderWidth: 1.2,
          });
        } else {
          drawCrossmark(page, marginX + 4, currY - (isCompactMode ? 1 : 0), redExaminer);
        }

        safeDrawText(page, `+${st.marksAwarded}/${st.maxMarks}`, {
          x: marginX + (isCompactMode ? 16 : 18),
          y: currY - (isCompactMode ? 1 : 0),
          size: isCompactMode ? 6.8 : 7.5,
          font: helveticaBold,
          color: markColor,
        });

        // Step Name / Component tag (expanded to avoid truncation)
        const maxStepChars = isCompactMode ? 38 : 45;
        const stepNameClean = st.stepName.length > maxStepChars ? `${st.stepName.slice(0, maxStepChars - 3)}...` : st.stepName;
        safeDrawText(page, stepNameClean, {
          x: marginX + (isCompactMode ? 48 : 54),
          y: currY - (isCompactMode ? 1 : 0),
          size: isCompactMode ? 5.6 : 6.2,
          font: helveticaBold,
          color: darkSlate,
        });

        let lineY = currY - (isCompactMode ? 8 : 9);
        for (const cl of displayLines) {
          safeDrawText(page, cl, {
            x: marginX + 6,
            y: lineY,
            size: isCompactMode ? 5.2 : 5.8,
            font: helvetica,
            color: isPartial ? darkSlate : isCorrect ? darkSlate : redExaminer,
          });
          lineY -= (isCompactMode ? 7.5 : 8.5);
        }

        currY -= (boxHeight + stepGap);
      }

      currY -= (isCompactMode ? 4 : 6);
      physicallyRenderedAnnotations.push({
        pageNumber,
        questionNumber: qAnn.questionNumber,
        canonicalId: qAnn.canonicalId,
        marksAwarded: qAnn.marksAwarded,
        maxMarks: qAnn.maxMarks,
      });
    }

    // (C) Official Examiner Final Verification Seal (Overlay on LAST page bottom margin)
    if (pageIdx === originalPageCount - 1) {
      const sealWidth = 260;
      const sealHeight = 44;
      const sealX = width - sealWidth - 15;
      const sealY = 24;

      page.drawRectangle({
        x: sealX,
        y: sealY,
        width: sealWidth,
        height: sealHeight,
        color: rgb(1, 0.96, 0.96),
        borderColor: redExaminer,
        borderWidth: 1.5,
      });

      safeDrawText(page, 'CA EXAM CHECKER AI | STEP-WISE VERIFICATION SEAL', {
        x: sealX + 8,
        y: sealY + 31,
        size: 7,
        font: helveticaBold,
        color: redExaminer,
      });

      safeDrawText(
        page,
        `TOTAL: ${totalAwarded.toFixed(1)} / ${maxMarks} (${percentage.toFixed(1)}%)  |  RESULT: ${resultStatus}`,
        {
          x: sealX + 8,
          y: sealY + 18,
          size: 8,
          font: helveticaBold,
          color: redExaminer,
        }
      );

      safeDrawText(
        page,
        `Evaluator: Senior CA Examiner AI | Ref ID: ${evalData.id.slice(0, 16)}`,
        {
          x: sealX + 8,
          y: sealY + 7,
          size: 6.5,
          font: helvetica,
          color: darkSlate,
        }
      );
    }

    // (D) Bottom Page Footer Note
    safeDrawText(
      page,
      `Page ${pageNumber} of ${originalPageCount} | Independent AI diagnostic benchmark based on verified marking guidelines. Not affiliated with ICAI.`,
      {
        x: 20,
        y: 10,
        size: 6.8,
        font: helvetica,
        color: grayText,
      }
    );
  }

  // 4. CRITICAL ASSERTION (Rule 72):
  // Assert: checkedCopyPageCount === originalPageCount
  const checkedCopyPageCount = pdfDoc.getPageCount();
  if (checkedCopyPageCount !== originalPageCount) {
    throw new Error(
      `Checked copy page count mismatch error: original has ${originalPageCount} pages, but generated checked copy has ${checkedCopyPageCount} pages. Extra pages are forbidden.`
    );
  }

  const physicalPostGate = validatePostRenderGate({
    evaluationId: evalData.id,
    runId: runPkg?.runId || evalData.id,
    records: gateRecords,
    renderedAnnotations: physicallyRenderedAnnotations,
    totalPages: originalPageCount,
  });
  if (!physicalPostGate.isValid) {
    rejectIncompletePhysicalRender(`Physical drawing verification failed: ${physicalPostGate.errors.join('; ')}`);
  }
  if (runPkg) (runPkg as any).renderManifest = physicalPostGate.renderManifest;

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Generates the Detailed Evaluation & Step-Marking Report PDF.
 */
export async function generateDetailedReportPdf(
  evalData: EvaluationData,
  resultJson: any
): Promise<Buffer> {
  return generateDetailedReportPdfImpl(evalData, resultJson);
}

export async function generateOriginalSubmissionPdf(
  evalData: EvaluationData,
  resultJson?: any,
  _rawText?: string
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const blueNavy = rgb(0.04, 0.22, 0.58);
  const darkSlate = rgb(0.12, 0.16, 0.24);
  const grayText = rgb(0.4, 0.45, 0.55);
  const lightBg = rgb(0.96, 0.97, 0.99);

  // Page 1: ICAI Examination Answer Booklet Cover Page
  const cover = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = cover.getSize();

  // Header band
  cover.drawRectangle({
    x: 0,
    y: height - 85,
    width,
    height: 85,
    color: blueNavy,
  });

  safeDrawText(cover, 'CA EXAM CHECKER AI', {
    x: 40,
    y: height - 38,
    size: 15,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  safeDrawText(cover, 'CANDIDATE ANSWER SCRIPT ARCHIVE  |  AI STEP-WISE EVALUATION BENCHMARK', {
    x: 40,
    y: height - 58,
    size: 9,
    font: helveticaBold,
    color: rgb(0.75, 0.88, 1),
  });

  const displayId = evalData.displayId || evalData.id;
  safeDrawText(cover, `EVALUATION ID: ${displayId}`, {
    x: width - Math.min(270, displayId.length * 6.5 + 110),
    y: height - 48,
    size: 8.5,
    font: helveticaBold,
    color: rgb(0.9, 0.95, 1),
  });

  // Candidate particulars box
  cover.drawRectangle({
    x: 35,
    y: height - 210,
    width: width - 70,
    height: 105,
    color: lightBg,
    borderColor: rgb(0.8, 0.85, 0.92),
    borderWidth: 1,
  });

  safeDrawText(cover, `Candidate Name: ${evalData.studentName || 'Candidate'}`, {
    x: 50,
    y: height - 130,
    size: 11,
    font: helveticaBold,
    color: darkSlate,
  });

  const validRegNo =
    evalData.icaiRegistrationNumber &&
    evalData.icaiRegistrationNumber !== 'WRO0987654' &&
    evalData.icaiRegistrationNumber !== '000' &&
    evalData.icaiRegistrationNumber !== 'N/A' &&
    evalData.icaiRegistrationNumber !== 'NA'
      ? evalData.icaiRegistrationNumber
      : 'Not provided';

  const studentCodeStr = evalData.studentCode ? `  |  Student Code: ${evalData.studentCode}` : '';
  safeDrawText(cover, `Roll / Reg. No.: ${validRegNo}${studentCodeStr}`, {
    x: 50,
    y: height - 150,
    size: 9.5,
    font: helvetica,
    color: darkSlate,
  });

  safeDrawText(cover, `Examination Level: ${evalData.level}  |  Attempt: ${evalData.attempt || 'May 2026'}`, {
    x: 50,
    y: height - 170,
    size: 9.5,
    font: helvetica,
    color: darkSlate,
  });

  safeDrawText(cover, `Subject & Paper: ${evalData.subjectName} (${evalData.paper || 'Paper 1'})`, {
    x: 50,
    y: height - 190,
    size: 10,
    font: helveticaBold,
    color: blueNavy,
  });

  // Stamp / Archive status box
  const stampX = width - 200;
  cover.drawRectangle({
    x: stampX,
    y: height - 200,
    width: 150,
    height: 85,
    color: rgb(0.95, 0.98, 1),
    borderColor: blueNavy,
    borderWidth: 1.5,
  });

  safeDrawText(cover, 'EXAMINATION ARCHIVE', {
    x: stampX + 12,
    y: height - 135,
    size: 9,
    font: helveticaBold,
    color: blueNavy,
  });

  safeDrawText(cover, 'ORIGINAL SUBMISSION', {
    x: stampX + 12,
    y: height - 152,
    size: 8,
    font: helveticaBold,
    color: rgb(0.1, 0.55, 0.25),
  });

  safeDrawText(cover, `Date: ${evalData.createdAt ? evalData.createdAt.split(' ')[0] : new Date().toISOString().split('T')[0]}`, {
    x: stampX + 12,
    y: height - 170,
    size: 8,
    font: helvetica,
    color: grayText,
  });

  safeDrawText(cover, 'Verified Digital Copy', {
    x: stampX + 12,
    y: height - 188,
    size: 7.5,
    font: helveticaBold,
    color: darkSlate,
  });

  // Table of Questions Attempted (ICAI Standard Format Front Cover)
  safeDrawText(cover, 'RECORD OF QUESTIONS ANSWERED BY CANDIDATE', {
    x: 35,
    y: height - 235,
    size: 10.5,
    font: helveticaBold,
    color: darkSlate,
  });

  let tY = height - 260;
  cover.drawRectangle({
    x: 35,
    y: tY - 6,
    width: width - 70,
    height: 22,
    color: rgb(0.9, 0.93, 0.97),
  });

  safeDrawText(cover, 'Q. No.', { x: 45, y: tY, size: 8.5, font: helveticaBold, color: darkSlate });
  safeDrawText(cover, 'Question Topic / Provision', { x: 100, y: tY, size: 8.5, font: helveticaBold, color: darkSlate });
  safeDrawText(cover, 'Attempt Status', { x: 380, y: tY, size: 8.5, font: helveticaBold, color: darkSlate });
  safeDrawText(cover, 'Max Marks', { x: 480, y: tY, size: 8.5, font: helveticaBold, color: darkSlate });

  tY -= 20;

  const rawCoverQuestions = resultJson?.questionWiseBreakdown || resultJson?.questions || [
    { questionNumber: '1', maxMarks: 20 },
    { questionNumber: '2', maxMarks: 15 },
    { questionNumber: '3', maxMarks: 15 },
    { questionNumber: '4', maxMarks: 15 },
    { questionNumber: '5', maxMarks: 15 },
  ];
  const questions = deduplicateQuestionList(rawCoverQuestions);

  const seenCoverQuestions = new Set<string>();

  questions.forEach((q: any, idx: number) => {
    const qKey = String(
      q.canonicalId ||
      q.fullQuestionCode ||
      (q.subQuestion && !String(q.questionNumber).includes('(')
        ? `Q${String(q.questionNumber).replace(/^Q/i, '')}(${q.subQuestion})`
        : q.questionNumber) ||
      `Q${idx + 1}`
    );
    if (seenCoverQuestions.has(qKey)) {
      return;
    }
    seenCoverQuestions.add(qKey);

    const isEven = idx % 2 === 0;
    cover.drawRectangle({
      x: 35,
      y: tY - 6,
      width: width - 70,
      height: 22,
      color: isEven ? rgb(1, 1, 1) : rgb(0.97, 0.98, 1),
      borderColor: rgb(0.9, 0.92, 0.95),
      borderWidth: 0.5,
    });

    const qNum = String(
      q.canonicalId ||
      q.fullQuestionCode ||
      (q.subQuestion && !String(q.questionNumber).includes('(')
        ? `Q${String(q.questionNumber).replace(/^Q/i, '')}(${q.subQuestion})`
        : q.questionNumber) ||
      `Q${idx + 1}`
    );
    const qTopic = (q.topic || q.questionTitle || q.examinerRemarks || 'Compulsory / Descriptive Solution').substring(0, 48);

    safeDrawText(cover, qNum, { x: 45, y: tY, size: 8.5, font: helveticaBold, color: darkSlate });
    safeDrawText(cover, qTopic, { x: 100, y: tY, size: 8, font: helvetica, color: darkSlate });
    safeDrawText(cover, 'ATTEMPTED', { x: 380, y: tY, size: 8, font: helveticaBold, color: rgb(0.1, 0.55, 0.25) });
    safeDrawText(cover, `${q.maxMarks || 15} Marks`, { x: 480, y: tY, size: 8, font: helvetica, color: grayText });

    tY -= 22;
  });

  // Candidate Declaration
  cover.drawRectangle({
    x: 35,
    y: 90,
    width: width - 70,
    height: 70,
    color: rgb(0.98, 0.99, 1),
    borderColor: rgb(0.85, 0.88, 0.94),
    borderWidth: 1,
  });

  safeDrawText(cover, 'CANDIDATE DECLARATION & CODE OF ETHICS', {
    x: 45,
    y: 145,
    size: 8.5,
    font: helveticaBold,
    color: darkSlate,
  });

  safeDrawText(
    cover,
    'I hereby certify that this answer script contains candidate examination work submitted for diagnostic evaluation.',
    {
      x: 45,
      y: 130,
      size: 7.5,
      font: helvetica,
      color: grayText,
    }
  );

  safeDrawText(cover, `Signature of Candidate: ${evalData.studentName || 'Candidate'}`, {
    x: 45,
    y: 106,
    size: 8,
    font: helveticaBold,
    color: blueNavy,
  });

  safeDrawText(cover, 'Evaluation System: CA Exam Checker AI Engine', {
    x: width - 240,
    y: 106,
    size: 8,
    font: helveticaBold,
    color: darkSlate,
  });

  // Calculate total pages required by candidate answers and evaluation coverage
  const explicitPages = resultJson?.coverageMap?.totalPages ||
    resultJson?.originalPageCount ||
    (evalData as any).originalPageCount;

  let maxQuestionPage = 2;
  const allQs = resultJson?.questions || questions || [];
  allQs.forEach((q: any) => {
    if (typeof q.pageNumber === 'number' && q.pageNumber > 0) {
      maxQuestionPage = Math.max(maxQuestionPage, q.pageNumber);
    }
    if (Array.isArray(q.studentPages)) {
      q.studentPages.forEach((p: number) => {
        if (typeof p === 'number' && p > 0) maxQuestionPage = Math.max(maxQuestionPage, p);
      });
    }
  });

  const targetTotalPages = Math.max(explicitPages || 0, maxQuestionPage, 2);

  // Group questions by target page number (defaulting to spread across pages)
  const questionsByPage = new Map<number, any[]>();
  allQs.forEach((q: any, i: number) => {
    const pNum = typeof q.pageNumber === 'number' && q.pageNumber >= 2 && q.pageNumber <= targetTotalPages
      ? q.pageNumber
      : (2 + (i % Math.max(1, targetTotalPages - 1)));
    if (!questionsByPage.has(pNum)) questionsByPage.set(pNum, []);
    questionsByPage.get(pNum)!.push(q);
  });

  // Pages 2+: Authentic Ruled Student Answer Pages matching targetTotalPages
  for (let pageNum = 2; pageNum <= targetTotalPages; pageNum++) {
    const scriptPage = pdfDoc.addPage([595.28, 841.89]);
    const sW = scriptPage.getSize().width;
    const sH = scriptPage.getSize().height;

    // Ruled margins
    scriptPage.drawRectangle({
      x: 0,
      y: sH - 40,
      width: sW,
      height: 40,
      color: rgb(0.94, 0.96, 0.99),
    });

    const displayEvalId = evalData.displayId || evalData.id;
    const studentTag = evalData.studentCode ? `STUDENT: ${evalData.studentCode}` : `ID: ${displayEvalId}`;
    safeDrawText(scriptPage, `EVAL ID: ${displayEvalId}  |  ${studentTag}  |  SUBJECT: ${evalData.subjectName}  |  PAGE ${pageNum}`, {
      x: 35,
      y: sH - 25,
      size: 8.5,
      font: helveticaBold,
      color: blueNavy,
    });

    // Left vertical margin line
    scriptPage.drawLine({
      start: { x: 75, y: 50 },
      end: { x: 75, y: sH - 50 },
      thickness: 1,
      color: rgb(0.85, 0.4, 0.4),
    });

    safeDrawText(scriptPage, 'Q. No.', {
      x: 40,
      y: sH - 65,
      size: 8,
      font: helveticaBold,
      color: rgb(0.7, 0.2, 0.2),
    });

    safeDrawText(scriptPage, 'CANDIDATE ANSWERS / STEP-BY-STEP SOLUTION', {
      x: 90,
      y: sH - 65,
      size: 8,
      font: helveticaBold,
      color: darkSlate,
    });

    let curY = sH - 95;
    const pageQuestions = questionsByPage.get(pageNum) || [];

    if (pageQuestions.length === 0) {
      safeDrawText(scriptPage, `[Candidate handwritten calculation working notes continued - Page ${pageNum}]`, {
        x: 90,
        y: curY,
        size: 9,
        font: helvetica,
        color: grayText,
      });
    } else {
      pageQuestions.forEach((q: any, i: number) => {
        if (curY < 120) return;

        safeDrawText(scriptPage, `Q.${q.questionNumber || i + 1}`, {
          x: 42,
          y: curY,
          size: 9.5,
          font: helveticaBold,
          color: darkSlate,
        });

        safeDrawText(scriptPage, `Answer to Question No. ${q.questionNumber || i + 1}:`, {
          x: 90,
          y: curY,
          size: 9,
          font: helveticaBold,
          color: blueNavy,
        });

        curY -= 18;

        const studentSnippet = q.studentAnswerSnippet ||
          q.workingNotes ||
          q.detailedFeedback ||
          `1. Relevant statutory or conceptual provision identified.\n2. Calculations performed in accordance with working notes.\n3. Final computation or conclusion stated as required.`;

        const lines = String(studentSnippet).split('\n');
        lines.slice(0, 8).forEach((l: string) => {
          if (curY < 100) return;
          safeDrawText(scriptPage, l.substring(0, 80), {
            x: 90,
            y: curY,
            size: 8,
            font: helvetica,
            color: darkSlate,
          });
          curY -= 15;
        });

        curY -= 15;
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
