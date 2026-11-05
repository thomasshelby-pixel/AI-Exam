import { PDFDocument } from 'pdf-lib';
import crypto from 'crypto';
import { executeModelWithFallback, sanitizeSecretStrings } from '../models/modelRegistry.js';
import { AuthoritativePaperStructure, PaperStructureSubQuestion } from './paperStructureService.js';
import {
  toCanonicalQuestionId,
  parseCanonicalQuestionIdentity,
} from './canonicalQuestionService.js';

// In-memory cache: 1 Answer Sheet = 1 Authoritative Coverage Map
const coverageMapCache = new Map<string, AnswerCoverageMap>();

export function clearCoverageMapCache(): void {
  coverageMapCache.clear();
}

export type PageAttemptStatus =
  | 'ATTEMPTED_READABLE'
  | 'ATTEMPTED_PARTIALLY_READABLE'
  | 'ATTEMPTED_UNCLEAR'
  | 'CLEARLY_UNATTEMPTED'
  | 'QUESTION_NOT_IDENTIFIED'
  | 'PAGE_UNREADABLE';

export interface PageCoverageModelOutput {
  status: PageAttemptStatus;
  hasHandwriting?: boolean;
  summary?: string;
  /** Literal visual evidence used to identify the question label (margin/circle/header/etc.). */
  questionLabelEvidence?: string;
  /** Audit signal only; never used to override deterministic identity checks. */
  readingConfidence?: number;
  detectedQuestions: Array<{
    questionNumber?: string;
    subQuestion?: string | null;
    parentQuestionNumberVisible?: boolean;
    isContinuation?: boolean;
    snippet?: string;
  }>;
  mcqSelections: Record<string, string>;
  isContinuation?: boolean;
  /** Non-fatal page-level issues. Valid mapped answers on the same page are retained. */
  mappingWarnings: string[];
}

/** Validate page-auditor output before accepting a provider, enabling model fallback. */
export function parseAndValidatePageCoverageOutput(rawText: string): PageCoverageModelOutput {
  let clean = String(rawText || '').trim();
  clean = clean.replace(/^\x60{3}(?:json)?[ \t\r\n]*/i, '').replace(/[ \t\r\n]*\x60{3}$/, '');

  let raw: any;
  try {
    raw = JSON.parse(clean);
  } catch {
    throw new Error('PAGE_COVERAGE_INVALID_JSON: page-auditor response is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('PAGE_COVERAGE_INVALID_SCHEMA: response must be a JSON object.');
  }

  const warnings: string[] = [];
  const knownStatuses = new Set<PageAttemptStatus>([
    'ATTEMPTED_READABLE',
    'ATTEMPTED_PARTIALLY_READABLE',
    'ATTEMPTED_UNCLEAR',
    'CLEARLY_UNATTEMPTED',
    'QUESTION_NOT_IDENTIFIED',
    'PAGE_UNREADABLE',
  ]);
  const rawStatus = typeof raw.status === 'string' ? raw.status.trim().toUpperCase() : '';
  let status: PageAttemptStatus = knownStatuses.has(rawStatus as PageAttemptStatus)
    ? rawStatus as PageAttemptStatus
    : 'ATTEMPTED_UNCLEAR';
  if (status !== rawStatus) {
    warnings.push('The page auditor returned a missing or unrecognized page status; the page was retained for review.');
  }

  const hasHandwriting = typeof raw.hasHandwriting === 'boolean' ? raw.hasHandwriting : undefined;
  if (raw.hasHandwriting !== undefined && hasHandwriting === undefined) {
    warnings.push('The page auditor returned an invalid handwriting flag.');
  }
  const summary = typeof raw.summary === 'string' ? raw.summary : undefined;
  if (raw.summary !== undefined && summary === undefined) {
    warnings.push('The page auditor returned a non-text page summary.');
  }
  const questionLabelEvidence = typeof raw.questionLabelEvidence === 'string'
    ? raw.questionLabelEvidence.trim().slice(0, 300)
    : undefined;
  if (raw.questionLabelEvidence !== undefined && questionLabelEvidence === undefined) {
    warnings.push('The page auditor returned invalid question-label evidence.');
  }
  const readingConfidence = typeof raw.readingConfidence === 'number' &&
    Number.isFinite(raw.readingConfidence) &&
    raw.readingConfidence >= 0 &&
    raw.readingConfidence <= 1
      ? raw.readingConfidence
      : undefined;
  if (raw.readingConfidence !== undefined && readingConfidence === undefined) {
    warnings.push('The page auditor returned an invalid reading-confidence value.');
  }
  const isContinuation = typeof raw.isContinuation === 'boolean' ? raw.isContinuation : undefined;
  if (raw.isContinuation !== undefined && isContinuation === undefined) {
    warnings.push('The page auditor returned an invalid continuation flag.');
  }

  // A malformed individual detection must not discard other confidently mapped
  // questions from the same page. It is retained as a page-level review warning.
  const detectedQuestions: PageCoverageModelOutput['detectedQuestions'] = [];
  if (!Array.isArray(raw.detectedQuestions)) {
    warnings.push('The page auditor did not return a question-detection list.');
  } else {
    for (let index = 0; index < raw.detectedQuestions.length; index++) {
      const question = raw.detectedQuestions[index];
      if (!question || typeof question !== 'object' || Array.isArray(question)) {
        warnings.push('One detected answer had an invalid structure and was left for manual mapping.');
        continue;
      }

      const rawQuestionNumber =
        typeof question.questionNumber === 'string' || typeof question.questionNumber === 'number'
          ? String(question.questionNumber).trim()
          : '';
      let questionNumber = '';
      let inferredSubQuestion = '';
      const mcqMatch = rawQuestionNumber.match(/^(?:MCQ|OBJECTIVE)\s*(\d+)$/i);
      const questionMatch = rawQuestionNumber.match(/^\s*(?:(?:QUESTION|Q|ANSWER|ANS)\.?\s*)?(\d+)\s*((?:\([a-z0-9]+\))*)\s*$/i);
      if (mcqMatch) {
        questionNumber = mcqMatch[1];
        inferredSubQuestion = 'MCQ';
      } else if (questionMatch) {
        questionNumber = questionMatch[1];
        inferredSubQuestion = (questionMatch[2] || '').replace(/[()]/g, '');
      } else if (rawQuestionNumber) {
        warnings.push('A detected answer contained a question label that could not be safely normalized.');
        continue;
      }
      if (question.questionNumber !== undefined &&
          typeof question.questionNumber !== 'string' &&
          typeof question.questionNumber !== 'number') {
        warnings.push('A detected answer contained a non-text question number and was left for manual mapping.');
        continue;
      }

      let subQuestion = '';
      if (question.subQuestion === null || question.subQuestion === undefined || question.subQuestion === '') {
        subQuestion = inferredSubQuestion;
      } else if (typeof question.subQuestion === 'string' || typeof question.subQuestion === 'number') {
        subQuestion = String(question.subQuestion).trim();
      } else {
        warnings.push('A detected answer contained an invalid sub-question label; that entry was left for manual mapping.');
        continue;
      }

      const parentVisible =
        typeof question.parentQuestionNumberVisible === 'boolean'
          ? question.parentQuestionNumberVisible
          : undefined;
      if (question.parentQuestionNumberVisible !== undefined && parentVisible === undefined) {
        warnings.push('A detected answer contained an invalid parent-number visibility flag.');
      }
      const continuation =
        typeof question.isContinuation === 'boolean' ? question.isContinuation : false;
      if (question.isContinuation !== undefined && typeof question.isContinuation !== 'boolean') {
        warnings.push('A detected answer contained an invalid continuation flag.');
      }
      const snippet = typeof question.snippet === 'string' ? question.snippet : undefined;
      if (question.snippet !== undefined && snippet === undefined) {
        warnings.push('A detected answer contained a non-text evidence snippet.');
      }

      const contextualIdentity = parentVisible === false && Boolean(subQuestion);
      const explicitContinuation = continuation || isContinuation === true;
      if (!questionNumber && !contextualIdentity && !explicitContinuation) {
        warnings.push('One attempted answer had no safely resolvable question identity and was left for manual mapping.');
        continue;
      }

      detectedQuestions.push({
        ...(questionNumber ? { questionNumber } : {}),
        ...(subQuestion ? { subQuestion } : {}),
        ...(parentVisible !== undefined ? { parentQuestionNumberVisible: parentVisible } : {}),
        isContinuation: explicitContinuation,
        ...(snippet !== undefined ? { snippet } : {}),
      });
    }
  }

  const selections: Record<string, string> = {};
  const conflictedSelections = new Set<string>();
  if (raw.mcqSelections !== undefined &&
      (!raw.mcqSelections || typeof raw.mcqSelections !== 'object' || Array.isArray(raw.mcqSelections))) {
    warnings.push('The page auditor returned an invalid MCQ selection list; affected MCQs were left for review.');
  } else {
    for (const [rawQuestionNumber, rawOption] of Object.entries(raw.mcqSelections || {})) {
      const normalizedNumber = String(rawQuestionNumber).replace(/[^0-9]/g, '');
      const option = typeof rawOption === 'string'
        ? rawOption.trim().toUpperCase().replace(/^OPTION\s*/, '').replace(/[()\s]/g, '')
        : '';
      if (!normalizedNumber || !/^[A-D]$/.test(option)) {
        warnings.push('An MCQ selection had an invalid question number or option and was left for review.');
        continue;
      }
      if (conflictedSelections.has(normalizedNumber)) continue;
      if (selections[normalizedNumber] && selections[normalizedNumber] !== option) {
        delete selections[normalizedNumber];
        conflictedSelections.add(normalizedNumber);
        warnings.push('Conflicting options were detected for one MCQ; that MCQ was left for manual review.');
        continue;
      }
      selections[normalizedNumber] = option;
    }
  }

  const hasDetectedAnswers = detectedQuestions.length > 0 || Object.keys(selections).length > 0;
  let normalizedHandwriting = hasHandwriting;
  if (hasDetectedAnswers && hasHandwriting === false) {
    normalizedHandwriting = true;
    warnings.push('The page auditor marked a page with detected answers as having no handwriting; the contradiction was retained for review.');
  }
  if (hasDetectedAnswers && (status === 'CLEARLY_UNATTEMPTED' || status === 'PAGE_UNREADABLE')) {
    status = 'ATTEMPTED_UNCLEAR';
    warnings.push('The page was marked blank or unreadable despite detected answers; the page was retained as an attempted answer requiring review.');
  } else if (status === 'QUESTION_NOT_IDENTIFIED' && hasDetectedAnswers) {
    // Preserve confidently identified questions from a mixed page. The separate
    // warning keeps the page uncertified until its unidentified content is reviewed.
    status = 'ATTEMPTED_READABLE';
    warnings.push('The page contains mapped answers as well as content the auditor could not fully identify.');
  }
  if (status === 'ATTEMPTED_UNCLEAR' && warnings.length === 0) {
    warnings.push('The page handwriting or answer identity requires examiner review.');
  }

  return {
    status,
    hasHandwriting: normalizedHandwriting,
    summary,
    questionLabelEvidence,
    readingConfidence,
    isContinuation,
    detectedQuestions,
    mcqSelections: selections,
    mappingWarnings: Array.from(new Set(warnings)),
  };
}

export interface DetectedQuestionOccurrence {
  fullQuestionCode: string; // e.g. 'Q5(a)', 'Q6(c)', 'MCQ9'
  questionNumber: string;
  subQuestionNumber?: string;
  status: PageAttemptStatus;
  isContinuation: boolean;
  pageNumber: number;
  snippet?: string;
  studentSelectedOption?: string; // For MCQs
  isMcq?: boolean;
}

export interface ContextualQuestionResolution {
  canonicalId?: string;
  requiresReview: boolean;
  reason?: string;
}

/**
 * Resolve a detected sub-question using the last identified answer context when
 * the page does not physically repeat its parent question number. The model's
 * guessed parent is not authoritative in that case.
 */
export function resolveContextualQuestionIdentity(options: {
  questionNumber?: string;
  subQuestion?: string;
  isContinuation?: boolean;
  parentQuestionNumberVisible?: boolean;
  previousActiveQuestion?: string;
  paperSubQuestions: AuthoritativePaperStructure['subQuestions'];
}): ContextualQuestionResolution {
  const {
    questionNumber = '',
    subQuestion = '',
    isContinuation = false,
    parentQuestionNumberVisible,
    previousActiveQuestion,
    paperSubQuestions,
  } = options;
  const detectedId = toCanonicalQuestionId(questionNumber, subQuestion, paperSubQuestions);
  const detected = parseCanonicalQuestionIdentity(detectedId);

  // MCQ numbers are their own canonical identity; parent-question context does
  // not apply to them.
  if (detected.isMcq || subQuestion.toUpperCase() === 'MCQ') {
    return { canonicalId: detected.canonicalId, requiresReview: false };
  }

  const context = previousActiveQuestion
    ? parseCanonicalQuestionIdentity(previousActiveQuestion)
    : undefined;
  const hasExplicitParentNumber = Boolean(
    String(questionNumber || '')
      .replace(/[^0-9]/g, '')
      .trim()
  );
  const isContextAnchored =
    parentQuestionNumberVisible === false ||
    (!hasExplicitParentNumber && parentQuestionNumberVisible === undefined);
  const parentWasUnspecifiedAndConflicts =
    parentQuestionNumberVisible === undefined &&
    hasExplicitParentNumber &&
    Boolean(context && detected.subQuestion && detected.parentQuestionId !== context.parentQuestionId);

  if (parentWasUnspecifiedAndConflicts) {
    return {
      requiresReview: true,
      reason: 'The detected parent conflicts with the active question, but the analysis did not confirm whether that parent number is visibly written.',
    };
  }

  if (!isContextAnchored) {
    return { canonicalId: detected.canonicalId, requiresReview: false };
  }

  if (!context || context.isMcq) {
    return {
      requiresReview: true,
      reason: 'The parent question number is not visible and there is no active descriptive question context.',
    };
  }

  const authoritativeLeaves = paperSubQuestions.filter((question) => !question.isMcq);
  const subPart = subQuestion
    .trim()
    .replace(/^[([{]\s*/, '')
    .replace(/\s*[)\]}]$/, '') || detected.subQuestion;

  if (!subPart) {
    const activeLeaf = authoritativeLeaves.find(
      (question) => question.fullQuestionCode.toLowerCase() === context.canonicalId.toLowerCase()
    );
    if (isContinuation && activeLeaf) {
      return { canonicalId: activeLeaf.fullQuestionCode, requiresReview: false };
    }
    return {
      requiresReview: true,
      reason: 'The parent question number and sub-question label are not visible, so the attempt cannot be mapped safely.',
    };
  }

  // A bare label can mean another leaf under the active parent (Q3(b) then
  // (a) => Q3(a)), or a nested part under the current leaf. Resolve only when
  // the supplied paper structure identifies exactly one of those candidates.
  const siblingCandidate = toCanonicalQuestionId(context.parentQuestionId, subPart, authoritativeLeaves);
  const nestedCandidate = `${context.canonicalId}(${subPart})`.toLowerCase();

  const matches = authoritativeLeaves.filter((question) => {
    const code = question.fullQuestionCode.toLowerCase();
    return code === siblingCandidate.toLowerCase() || code === nestedCandidate;
  });
  const uniqueMatches = Array.from(new Map(matches.map((question) => [question.fullQuestionCode.toLowerCase(), question])).values());

  if (uniqueMatches.length === 1) {
    return { canonicalId: uniqueMatches[0].fullQuestionCode, requiresReview: false };
  }

  return {
    requiresReview: true,
    reason: uniqueMatches.length > 1
      ? `The sub-question label "${subPart}" matches multiple authoritative questions under the active context.`
      : `The sub-question label "${subPart}" does not match an authoritative question under the active context.`,
  };
}

export interface PageAnalysisFailure {
  code: 'AI_PROVIDER_UNAVAILABLE' | 'AI_QUOTA_OR_BILLING' | 'AI_OUTPUT_INVALID' | 'AI_ANALYSIS_FAILED' | 'SKIPPED_AFTER_PROVIDER_FAILURE';
  message: string;
  failedOnPage?: number;
}

export interface PageCoverageRecord {
  pageNumber: number;
  status: PageAttemptStatus;
  detectedQuestions: DetectedQuestionOccurrence[];
  rawSummary: string;
  hasHandwriting: boolean;
  mappingReviewReason?: string;
  questionLabelEvidence?: string;
  readingConfidence?: number;
  /** Technical failure details are kept separate from handwriting/question ambiguity. */
  analysisFailure?: PageAnalysisFailure;
}

export type PageCoverageAnalyzer = (
  pageBase64: string,
  pageNumber: number,
  paperStructure: AuthoritativePaperStructure,
  totalPages: number,
  previousActiveQuestion?: string
) => Promise<PageCoverageRecord>;

export interface AttemptedQuestionMapping {
  fullQuestionCode: string;
  questionNumber: string;
  subQuestionNumber?: string;
  pages: number[];
  status: PageAttemptStatus;
  studentSnippet?: string;
  studentSelectedOption?: string; // For MCQs
  isMcq: boolean;
}

export interface AnswerCoverageMap {
  totalPages: number;
  pages: PageCoverageRecord[];
  attemptedQuestions: AttemptedQuestionMapping[];
  allDetectedCodes: string[];
  unmappedPages: number[];
  unclearPages: number[];
  coveredPages?: number[];
  is100PercentCovered: boolean;
  mcqSelections: Record<string, string>; // e.g. { '1': 'C', '9': 'A' }
}

/**
 * Builds the complete Answer Coverage Map across all pages of the uploaded answer sheet.
 */
export async function buildAnswerSheetCoverageMap(
  pdfBuffer: Buffer,
  paperStructure: AuthoritativePaperStructure,
  options: { analyzePage?: PageCoverageAnalyzer } = {}
): Promise<AnswerCoverageMap> {
  const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const structureSignature = JSON.stringify({
    paperTitle: paperStructure.paperTitle || '',
    totalPaperMaxMarks: paperStructure.totalPaperMaxMarks ?? null,
    descriptiveQuestions: (paperStructure.subQuestions || []).map((question) => ({
      questionId: question.fullQuestionCode || toCanonicalQuestionId(question.questionNumber, question.subQuestionNumber),
      maximumMarks: question.maximumMarks,
      isMcq: question.isMcq,
    })),
    mcqs: (paperStructure.mcqs || []).map((question) => ({
      questionId: question.fullQuestionCode || `MCQ${question.questionNumber}`,
      maximumMarks: question.maximumMarks,
      officialKey: question.officialKey || null,
    })),
  });
  const structureHash = crypto.createHash('sha256').update(structureSignature).digest('hex');
  const cacheKey = `${pdfHash}:${structureHash}`;
  if (coverageMapCache.has(cacheKey)) {
    return coverageMapCache.get(cacheKey)!;
  }

  const origDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const totalPages = origDoc.getPageCount();

  const pageRecords: PageCoverageRecord[] = [];
  const mcqSelections: Record<string, string> = {};
  let activeQuestionContext: string | undefined = undefined;
  let providerFailureCircuit: { failedOnPage: number; failure: PageAnalysisFailure } | undefined;
  const analyzePage = options.analyzePage || analyzeSinglePageCoverage;

  // For each page, analyze with AI to detect question numbers, continuations, and content.
  // Once the full provider fallback chain fails for one page, do not repeat that
  // same expensive chain for every remaining page of this answer sheet.
  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageNum = pageIdx + 1;
    if (providerFailureCircuit) {
      const skippedFailure: PageAnalysisFailure = {
        code: 'SKIPPED_AFTER_PROVIDER_FAILURE',
        failedOnPage: providerFailureCircuit.failedOnPage,
        message: `Analysis was stopped after page ${providerFailureCircuit.failedOnPage} exhausted the configured AI fallback chain: ${providerFailureCircuit.failure.message}`,
      };
      pageRecords.push({
        pageNumber: pageNum,
        status: 'QUESTION_NOT_IDENTIFIED',
        detectedQuestions: [],
        rawSummary: `Page ${pageNum} was not analysed to prevent repeated provider calls after an AI service failure on page ${providerFailureCircuit.failedOnPage}.`,
        hasHandwriting: true,
        analysisFailure: skippedFailure,
      });
      continue;
    }

    const singleDoc = await PDFDocument.create();
    const [copied] = await singleDoc.copyPages(origDoc, [pageIdx]);
    singleDoc.addPage(copied);
    const singleBytes = await singleDoc.save();
    const pageBase64 = Buffer.from(singleBytes).toString('base64');

    const analysis = await analyzePage(
      pageBase64,
      pageNum,
      paperStructure,
      totalPages,
      activeQuestionContext
    );
    pageRecords.push(analysis);
    if (analysis.analysisFailure) {
      providerFailureCircuit = { failedOnPage: pageNum, failure: analysis.analysisFailure };
      activeQuestionContext = undefined;
      continue;
    }

    // Track active question context for next page continuation
    const nonMcqs = analysis.detectedQuestions.filter(
      (q) => !q.fullQuestionCode.startsWith('MCQ') && q.subQuestionNumber !== 'MCQ'
    );
    if (analysis.mappingReviewReason) {
      // An unresolved visible answer invalidates the inherited parent context;
      // later pages must not silently attach to an older question.
      activeQuestionContext = undefined;
    } else if (nonMcqs.length > 0) {
      activeQuestionContext = nonMcqs[nonMcqs.length - 1].fullQuestionCode;
    }

    // Collect any MCQs found on this page
    for (const q of analysis.detectedQuestions) {
      if (q.studentSelectedOption && (q.fullQuestionCode.startsWith('MCQ') || q.subQuestionNumber === 'MCQ')) {
        const mcqNum = q.questionNumber;
        mcqSelections[mcqNum] = q.studentSelectedOption.toUpperCase();
      }
    }
  }

  // Now aggregate page records into continuous AttemptedQuestionMapping entries
  const mappingMap = new Map<string, AttemptedQuestionMapping>();

  for (const pageRec of pageRecords) {
    for (const det of pageRec.detectedQuestions) {
      const code = det.isMcq
        ? `MCQ${String(det.questionNumber).replace(/[^0-9]/g, '') || '1'}`
        : toCanonicalQuestionId(det.fullQuestionCode || det.questionNumber, det.subQuestionNumber, paperStructure.subQuestions);
      const parsed = parseCanonicalQuestionIdentity(code);

      if (!mappingMap.has(parsed.canonicalId)) {
        mappingMap.set(parsed.canonicalId, {
          fullQuestionCode: parsed.canonicalId,
          questionNumber: parsed.questionNumber,
          subQuestionNumber: parsed.subQuestion,
          pages: [pageRec.pageNumber],
          status: det.status,
          studentSnippet: det.snippet,
          studentSelectedOption: det.studentSelectedOption,
          isMcq: parsed.isMcq,
        });
      } else {
        const existing = mappingMap.get(parsed.canonicalId)!;
        if (!existing.pages.includes(pageRec.pageNumber)) {
          existing.pages.push(pageRec.pageNumber);
          existing.pages.sort((a, b) => a - b);
        }
        if (det.snippet && !existing.studentSnippet?.includes(det.snippet)) {
          existing.studentSnippet = (existing.studentSnippet ? `${existing.studentSnippet}\n\n` : '') + det.snippet;
        }
        if (det.studentSelectedOption && !existing.studentSelectedOption) {
          existing.studentSelectedOption = det.studentSelectedOption;
        }
      }
    }
  }

  // Keep ambiguous parent-level detections visible for the pre-evaluation gate.
  // They may be headings or attempts; transferring them to an arbitrary child
  // would silently remap the student's work.
  const attemptedQuestions = Array.from(mappingMap.values());
  const allDetectedCodes = attemptedQuestions.map((a) => a.fullQuestionCode);

  const unmappedPages = pageRecords
    .filter((p) => p.status === 'QUESTION_NOT_IDENTIFIED' || p.status === 'PAGE_UNREADABLE')
    .map((p) => p.pageNumber);

  const unclearPages = pageRecords
    .filter((p) => p.status === 'ATTEMPTED_UNCLEAR' || p.status === 'ATTEMPTED_PARTIALLY_READABLE')
    .map((p) => p.pageNumber);

  const is100PercentCovered = pageRecords.every(
    (p) => p.status !== 'QUESTION_NOT_IDENTIFIED' && p.status !== 'PAGE_UNREADABLE'
  );

  const coveredPages = pageRecords
    .filter((p) => p.status !== 'CLEARLY_UNATTEMPTED')
    .map((p) => p.pageNumber);

  const coverageResult: AnswerCoverageMap = {
    totalPages,
    pages: pageRecords,
    attemptedQuestions,
    allDetectedCodes,
    unmappedPages,
    unclearPages,
    coveredPages,
    is100PercentCovered,
    mcqSelections,
  };

  coverageMapCache.set(cacheKey, coverageResult);
  return coverageResult;
}

/**
 * Analyzes a single page of the answer sheet.
 * Uses structured heuristics and Gemini vision model to classify page content accurately.
 */
export function buildPageCoveragePrompt(params: {
  pageNumber: number;
  totalPages: number;
  paperStructure: AuthoritativePaperStructure;
  previousActiveQuestion?: string;
}): string {
  const { pageNumber, totalPages, paperStructure, previousActiveQuestion } = params;
  const validDescriptiveList = paperStructure.subQuestions
    .filter((s) => !s.isMcq)
    .map((s) => `${s.fullQuestionCode} — ${s.maximumMarks} marks${s.topic ? ` — ${s.topic}` : ''}`)
    .join('\\n');
  const validMcqList = (paperStructure.mcqs || [])
    .map((m) => `${m.fullQuestionCode} — ${m.maximumMarks} marks`)
    .join('\\n');

  return `
You are a universal CA examination answer-sheet reader and question-mapping auditor.
This instruction applies equally to Foundation, Intermediate and Final, and to every subject
(accounting, law, tax, costing, audit, finance, quantitative subjects, case studies, theory,
and mixed-format papers). Do not use a subject-specific question-number template.

Analyze the COMPLETE scanned handwritten Page ${pageNumber} of ${totalPages}.
Read the visual page itself; do not rely on embedded PDF text extraction.

AUTHORITATIVE QUESTION CANDIDATES
Subject/paper: ${paperStructure.paperTitle || 'CA examination paper'}
Descriptive question IDs and maximum marks:
${validDescriptiveList || 'None parsed'}
MCQ IDs and maximum marks:
${validMcqList || 'None parsed'}
Active question from the immediately previous page: ${previousActiveQuestion || 'None / first page'}

HANDWRITING AND PAGE-READING METHOD
- Inspect the full page first, then carefully inspect the top, bottom, left margin, right margin,
  question headings, circled annotations, underlined labels, and the beginning of each answer block.
- Handwritten question labels may be faint, cursive, slanted, overwritten, abbreviated, or written
  in a margin or circle. They are not necessarily on a printed heading line.
- Read question labels such as Q2, Q. 2, Question 2, 2(a), (a), and circled/margin-written numbers.
  Distinguish question labels from notebook page numbers, dates, roll numbers, scanner marks and
  ordinary figures. A number is not a question ID merely because it is visible.
- Read mixed handwriting, tables, ledger/journal formats, debit/credit columns, calculations,
  formulas, diagrams, bullet points, paragraphs and case-study responses. Do not mistake amounts,
  dates, section numbers, ledger references or working-note numbers for question labels.
- Use the candidate question inventory to validate the label. Return the question number as digits
  only (for example "2") and subQuestion separately (for example "a" or "a(1)").
- If a label is partly unclear, compare its visible shape, nearby subpart label, answer-block layout,
  prior-page context and the candidate IDs. Do not silently change an uncertain 3 into an 8.
- A student may answer several questions on one page. Return every separately identifiable question
  or sub-question on that page, not just the first one.
- A page may continue the previous answer without repeating its question number. Mark it as a
  continuation only when the handwriting/layout/content clearly continues the previous active
  question. Do not require a repeated heading on every page.
- If a new answer block begins but its identity is not reliably visible, do not attach it to the
  previous question just to avoid a warning. Keep it unresolved for examiner review.
- Never infer a question from the PDF page index, question order, marks, or subject-specific
  assumptions. Never invent a question ID outside the authoritative candidate list.
- Poor handwriting alone is not a reason to discard otherwise identifiable work. Use
  ATTEMPTED_PARTIALLY_READABLE when some content is readable and preserve the question identity
  whenever the label is sufficiently supported. Use ATTEMPTED_UNCLEAR when the answer itself
  cannot be read reliably.
- Do not guess unreadable amounts, dates, account names, statutory sections, formulas or words.
  Preserve uncertainty explicitly instead of manufacturing a transcription.

TASK
1. Identify every attempted question/sub-question. Check margin/circled labels as well as headings.
2. For each detection, provide parentQuestionNumberVisible=true only if the parent question number
   is physically visible on THIS page. If only "(a)" is visible, set false and rely on the previous
   active question only when that context is unambiguous.
3. If the page is a continuation and has no new heading, set isContinuation=true.
4. Include a short literal questionLabelEvidence note describing what you read and where
   (for example "circled 2 in left margin" or "Q3(a) written above the answer").
5. Set readingConfidence from 0 to 1 for reading the question identity on this page. This is an
   audit signal only; do not inflate it. Use a lower value when the label is faint or ambiguous.
6. Identify MCQ selections only when both the question number and selected option are visible.
   Return the student's selected option, not the official answer.
7. Classify the answer page:
   ATTEMPTED_READABLE, ATTEMPTED_PARTIALLY_READABLE, ATTEMPTED_UNCLEAR,
   CLEARLY_UNATTEMPTED, or QUESTION_NOT_IDENTIFIED.

Return strictly valid JSON only:
{
  "status": "ATTEMPTED_READABLE" | "ATTEMPTED_PARTIALLY_READABLE" | "ATTEMPTED_UNCLEAR" | "CLEARLY_UNATTEMPTED" | "QUESTION_NOT_IDENTIFIED",
  "hasHandwriting": true,
  "summary": "brief factual page summary",
  "questionLabelEvidence": "literal label evidence and its location",
  "readingConfidence": 0.0,
  "detectedQuestions": [
    {
      "questionNumber": "2",
      "subQuestion": "a",
      "parentQuestionNumberVisible": true,
      "isContinuation": false,
      "snippet": "short evidence from the answer"
    }
  ],
  "mcqSelections": { "1": "C" }
}
`;
}

/**
 * Analyzes a single page of the answer sheet using a subject-neutral handwriting
 * and question-identity prompt anchored to the selected authoritative question inventory.
 */
async function analyzeSinglePageCoverage(
  pageBase64: string,
  pageNumber: number,
  paperStructure: AuthoritativePaperStructure,
  totalPages: number = 1,
  previousActiveQuestion?: string
): Promise<PageCoverageRecord> {
  const prompt = buildPageCoveragePrompt({
    pageNumber,
    totalPages,
    paperStructure,
    previousActiveQuestion,
  });

  try {
    const res = await executeModelWithFallback({
      systemPrompt: 'You are an expert CA exam answer-sheet page auditor. Return only valid JSON matching the requested schema.',
      userPrompt: prompt,
      pdfBase64: pageBase64,
      mimeType: 'application/pdf',
      responseMimeType: 'application/json',
      thinkingLevel: 'LOW',
      validateOutput: (rawText) => {
        parseAndValidatePageCoverageOutput(rawText);
      },
      context: {
        checkingMode: 'strict',
        pageCount: 1,
        isRoutineOrHighVolume: totalPages > 25,
      },
    });

    console.info(`[AnswerCoverageService] Page ${pageNumber} analyzed with ${res.modelUsed} (${res.provider}); fallback=${res.fallbackOccurred}.`);
    const raw = parseAndValidatePageCoverageOutput(res.rawText);

    const detectedQuestions: DetectedQuestionOccurrence[] = [];
    let status: PageAttemptStatus = raw.status;
    const hasHandwriting = raw.hasHandwriting !== false;
    const summary = raw.summary || `Page ${pageNumber} analysis`;
    let mappingReviewReason: string | undefined = raw.mappingWarnings.length
      ? raw.mappingWarnings.join(' | ')
      : undefined;
    let pageActiveQuestionContext = previousActiveQuestion;

    if (Array.isArray(raw.detectedQuestions)) {
      for (const dq of raw.detectedQuestions) {
        const rawQStr = String(dq.questionNumber || '').trim();
        const rawSubStr = dq.subQuestion ? String(dq.subQuestion).trim() : '';
        const resolution = resolveContextualQuestionIdentity({
          questionNumber: rawQStr,
          subQuestion: rawSubStr,
          isContinuation: Boolean(dq.isContinuation),
          parentQuestionNumberVisible: typeof dq.parentQuestionNumberVisible === 'boolean'
            ? dq.parentQuestionNumberVisible
            : undefined,
          previousActiveQuestion: pageActiveQuestionContext,
          paperSubQuestions: paperStructure.subQuestions,
        });
        if (resolution.requiresReview || !resolution.canonicalId) {
          const issue = resolution.reason || 'The detected answer requires question-mapping review.';
          mappingReviewReason = [mappingReviewReason, issue].filter(Boolean).join(' | ');
          pageActiveQuestionContext = undefined;
          continue;
        }
        const canonId = resolution.canonicalId;
        const parsed = parseCanonicalQuestionIdentity(canonId);
        if (!parsed.questionNumber) continue;

        detectedQuestions.push({
          fullQuestionCode: parsed.canonicalId,
          questionNumber: parsed.questionNumber,
          subQuestionNumber: parsed.subQuestion,
          status,
          isContinuation: Boolean(dq.isContinuation),
          pageNumber,
          snippet: dq.snippet || summary,
        });
        pageActiveQuestionContext = parsed.isMcq ? pageActiveQuestionContext : parsed.canonicalId;
      }
    }

    // Add MCQ entries
    if (raw.mcqSelections && typeof raw.mcqSelections === 'object') {
      for (const [mcqKey, opt] of Object.entries(raw.mcqSelections)) {
        const num = mcqKey.replace(/[^0-9]/g, '');
        if (!num) continue;
        const code = `MCQ${num}`;
        detectedQuestions.push({
          fullQuestionCode: code,
          questionNumber: num,
          subQuestionNumber: 'MCQ',
          status,
          isContinuation: false,
          pageNumber,
          snippet: `MCQ ${num} selected option: ${opt}`,
          studentSelectedOption: String(opt).trim().toUpperCase(),
        });
      }
    }

    // If no explicit question headings were found on this page, but it has handwriting and indicates continuation of previous active question:
    if (
      detectedQuestions.length === 0 &&
      (raw.isContinuation === true || String(raw.summary || '').toLowerCase().includes('continuation')) &&
      previousActiveQuestion
    ) {
      const parsed = parseCanonicalQuestionIdentity(previousActiveQuestion);
      if (parsed.questionNumber && !parsed.isMcq) {
        detectedQuestions.push({
          fullQuestionCode: parsed.canonicalId,
          questionNumber: parsed.questionNumber,
          subQuestionNumber: parsed.subQuestion,
          status: status === 'QUESTION_NOT_IDENTIFIED' ? 'ATTEMPTED_READABLE' : status,
          isContinuation: true,
          pageNumber,
          snippet: summary,
        });
        status = status === 'QUESTION_NOT_IDENTIFIED' ? 'ATTEMPTED_READABLE' : status;
      }
    }

    // Do not infer a question from page position when the image was readable
    // but the model could not identify a reliable heading.
    if (mappingReviewReason) {
      status = 'QUESTION_NOT_IDENTIFIED';
    } else if (detectedQuestions.length === 0 && status !== 'CLEARLY_UNATTEMPTED') {
      status = 'QUESTION_NOT_IDENTIFIED';
    }

    return {
      pageNumber,
      status,
      detectedQuestions,
      rawSummary: mappingReviewReason ? `${summary} Mapping review required: ${mappingReviewReason}` : summary,
      hasHandwriting,
      mappingReviewReason,
      questionLabelEvidence: raw.questionLabelEvidence,
      readingConfidence: raw.readingConfidence,
    };
  } catch (err: any) {
    const rawError = err?.message || String(err);
    const safeError = sanitizeSecretStrings(rawError).replace(/[\r\n]+/g, ' ').slice(0, 240);
    const lowerError = rawError.toLowerCase();
    const isQuotaOrBilling =
      lowerError.includes('429') ||
      lowerError.includes('quota') ||
      lowerError.includes('resource_exhausted') ||
      lowerError.includes('prepayment') ||
      lowerError.includes('credits are depleted') ||
      lowerError.includes('insufficient_quota') ||
      lowerError.includes('billing');
    const isInvalidOutput =
      lowerError.includes('model_output_validation_failed') ||
      lowerError.includes('invalid json') ||
      lowerError.includes('invalid schema') ||
      lowerError.includes('empty output');

    const failure: PageAnalysisFailure = {
      code: isQuotaOrBilling
        ? 'AI_QUOTA_OR_BILLING'
        : isInvalidOutput
          ? 'AI_OUTPUT_INVALID'
          : lowerError.includes('unavailable') || lowerError.includes('timed out') || lowerError.includes('timeout')
            ? 'AI_PROVIDER_UNAVAILABLE'
            : 'AI_ANALYSIS_FAILED',
      message: safeError,
    };
    console.warn(`[AnswerCoverageService] Page ${pageNumber} analysis failed (${failure.code}): ${safeError}`);

    return {
      pageNumber,
      status: 'QUESTION_NOT_IDENTIFIED',
      detectedQuestions: [],
      rawSummary: `Automated page analysis failed (${failure.code}): ${safeError}`,
      hasHandwriting: true,
      analysisFailure: failure,
    };
  }
}

