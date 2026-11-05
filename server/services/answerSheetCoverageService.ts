import { PDFDocument } from 'pdf-lib';
import crypto from 'crypto';
import { executeModelWithFallback } from '../models/modelRegistry.js';
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
  detectedQuestions: Array<{
    questionNumber?: string;
    subQuestion?: string | null;
    parentQuestionNumberVisible?: boolean;
    isContinuation?: boolean;
    snippet?: string;
  }>;
  mcqSelections: Record<string, string>;
  /** True when the page contains handwritten descriptive work, not just MCQ selections. */
  hasDescriptiveWork: boolean;
  /** Recoverable issues are surfaced for review without discarding valid mappings on this page. */
  mappingWarnings: string[];
  isContinuation?: boolean;
}

/**
 * A page containing descriptive handwriting is not considered mapped merely
 * because one or more MCQ selections were found. At least one descriptive
 * identity must be mapped (or the page remains QUESTION_NOT_IDENTIFIED).
 */
export function requiresDescriptiveCoverageReview(
  hasDescriptiveWork: boolean,
  mappedQuestionCodes: string[]
): boolean {
  if (!hasDescriptiveWork) return false;
  return !mappedQuestionCodes.some((code) => {
    const normalizedCode = String(code || '').trim();
    if (!normalizedCode) return false;
    const parsed = parseCanonicalQuestionIdentity(normalizedCode);
    return Boolean(parsed.questionNumber) && !parsed.isMcq;
  });
}

/**
 * Merge MCQ selections without silently letting a later page overwrite an
 * earlier, conflicting answer. A conflict removes the answer from the scoring
 * map and remains conflicted for the rest of this answer-sheet run.
 */
export function mergeMcqSelectionsSafely(
  currentSelections: Record<string, string>,
  incomingSelections: Record<string, string>,
  conflictedQuestionNumbers: Set<string>
): string[] {
  const newConflicts: string[] = [];
  for (const [rawNumber, rawOption] of Object.entries(incomingSelections || {})) {
    const questionNumber = String(rawNumber || '').replace(/[^0-9]/g, '');
    const option = String(rawOption || '').trim().toUpperCase();
    if (!questionNumber || !/^[A-D]$/.test(option) || conflictedQuestionNumbers.has(questionNumber)) {
      continue;
    }
    const existingOption = currentSelections[questionNumber];
    if (existingOption && existingOption !== option) {
      delete currentSelections[questionNumber];
      conflictedQuestionNumbers.add(questionNumber);
      newConflicts.push(questionNumber);
      continue;
    }
    currentSelections[questionNumber] = option;
  }
  return newConflicts;
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
  const hasMappedDescriptiveIdentity = detectedQuestions.some((question) =>
    String(question.subQuestion || '').trim().toUpperCase() !== 'MCQ'
  );
  const summarySuggestsDescriptiveWork =
    /\b(?:descriptive|written answer|written work|calculation|working|journal|ledger|balance sheet|paragraph|explanation|provision|entry|solution|theory|handwritten text|computation)\b/i.test(summary || '');
  const explicitlyDeclaredDescriptiveWork =
    typeof raw.hasDescriptiveWork === 'boolean' ? raw.hasDescriptiveWork : undefined;

  // Keep accepting older page-auditor responses that pre-date this field. Prefer
  // actual mapped descriptive identities, then visual summary evidence. An
  // MCQ-only response remains MCQ-only unless the summary signals written work.
  let hasDescriptiveWork = hasMappedDescriptiveIdentity ||
    explicitlyDeclaredDescriptiveWork === true ||
    (explicitlyDeclaredDescriptiveWork === undefined &&
      status !== 'CLEARLY_UNATTEMPTED' &&
      (summarySuggestsDescriptiveWork || (Object.keys(selections).length === 0 && hasHandwriting !== false)));

  if (explicitlyDeclaredDescriptiveWork === false && hasMappedDescriptiveIdentity) {
    warnings.push('The page auditor marked the page as having no descriptive work despite returning a descriptive question identity; descriptive work was retained.');
  }
  if (explicitlyDeclaredDescriptiveWork === undefined &&
      status !== 'CLEARLY_UNATTEMPTED' &&
      !hasMappedDescriptiveIdentity &&
      Object.keys(selections).length === 0 &&
      hasHandwriting !== false) {
    warnings.push('Legacy page-auditor output omitted the descriptive-work flag and did not provide a question identity; manual mapping is required.');
  }
  if (hasDescriptiveWork && !hasMappedDescriptiveIdentity) {
    warnings.push('Descriptive handwriting was detected, but no descriptive question identity was safely mapped.');
  }

  let normalizedHandwriting = hasHandwriting;
  if ((hasDetectedAnswers || hasDescriptiveWork) && hasHandwriting === false) {
    normalizedHandwriting = true;
    warnings.push('The page auditor marked a page with detected work as having no handwriting; the contradiction was retained for review.');
  }
  if ((hasDetectedAnswers || hasDescriptiveWork) && (status === 'CLEARLY_UNATTEMPTED' || status === 'PAGE_UNREADABLE')) {
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
    hasDescriptiveWork,
    summary,
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

export interface PageCoverageRecord {
  pageNumber: number;
  status: PageAttemptStatus;
  detectedQuestions: DetectedQuestionOccurrence[];
  rawSummary: string;
  hasHandwriting: boolean;
  mappingReviewReason?: string;
}

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
  paperStructure: AuthoritativePaperStructure
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
  const conflictedMcqSelections = new Set<string>();
  const mcqSelectionSourcePages = new Map<string, number>();
  let activeQuestionContext: string | undefined = undefined;

  // For each page, analyze with AI to detect question numbers, continuations, and content
  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageNum = pageIdx + 1;
    const singleDoc = await PDFDocument.create();
    const [copied] = await singleDoc.copyPages(origDoc, [pageIdx]);
    singleDoc.addPage(copied);
    const singleBytes = await singleDoc.save();
    const pageBase64 = Buffer.from(singleBytes).toString('base64');

    const analysis = await analyzeSinglePageCoverage(
      pageBase64,
      pageNum,
      paperStructure,
      totalPages,
      activeQuestionContext
    );
    pageRecords.push(analysis);

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

    // Collect MCQs without silently overwriting a different option found on
    // another page. A duplicate with the same option is harmless; a conflict
    // invalidates both pages for certification and removes that MCQ from scoring.
    const pageMcqSelections = Object.fromEntries(
      analysis.detectedQuestions
        .filter((q) => q.studentSelectedOption && (q.fullQuestionCode.startsWith('MCQ') || q.subQuestionNumber === 'MCQ'))
        .map((q) => [q.questionNumber, q.studentSelectedOption!.toUpperCase()])
    );
    const mcqConflicts = mergeMcqSelectionsSafely(mcqSelections, pageMcqSelections, conflictedMcqSelections);
    for (const [questionNumber, option] of Object.entries(pageMcqSelections)) {
      if (!mcqConflicts.includes(questionNumber) && mcqSelections[questionNumber] === option && !mcqSelectionSourcePages.has(questionNumber)) {
        mcqSelectionSourcePages.set(questionNumber, pageNum);
      }
    }
    for (const questionNumber of mcqConflicts) {
      const previousPageNumber = mcqSelectionSourcePages.get(questionNumber);
      const reason = `CONFLICTING_MCQ_SELECTION_ACROSS_PAGES: MCQ ${questionNumber} has different selected options on pages ${previousPageNumber ?? 'unknown'} and ${pageNum}; the selected option was not guessed.`;
      analysis.status = 'QUESTION_NOT_IDENTIFIED';
      analysis.mappingReviewReason = reason;
      analysis.rawSummary = `${analysis.rawSummary} ${reason}`;
      if (previousPageNumber) {
        const previousPage = pageRecords.find((record) => record.pageNumber === previousPageNumber);
        if (previousPage) {
          previousPage.status = 'QUESTION_NOT_IDENTIFIED';
          previousPage.mappingReviewReason = reason;
          previousPage.rawSummary = `${previousPage.rawSummary} ${reason}`;
        }
      }
      activeQuestionContext = undefined;
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
async function analyzeSinglePageCoverage(
  pageBase64: string,
  pageNumber: number,
  paperStructure: AuthoritativePaperStructure,
  totalPages: number = 1,
  previousActiveQuestion?: string
): Promise<PageCoverageRecord> {
  const validDescriptiveList = paperStructure.subQuestions
    .filter((s) => !s.isMcq)
    .map((s) => s.fullQuestionCode)
    .join(', ');
  const validMcqList = (paperStructure.mcqs || []).map((m) => m.fullQuestionCode).join(', ');

  const prompt = `
You are an expert CA Exam Answer Sheet Page Auditor.
Analyze Page ${pageNumber} of ${totalPages} of this CA student answer sheet.

Context:
- Subject: ${paperStructure.paperTitle || 'CA Examination Paper'}
- Valid Descriptive Questions on this paper: ${validDescriptiveList || 'Standard CA questions'}
- Valid MCQs on this paper: ${validMcqList || 'None'}
- Active question from previous page: ${previousActiveQuestion || 'None (First page)'}

Task:
1. Decide whether this page contains handwritten DESCRIPTIVE work (explanations, calculations, journal entries, workings, legal/theory answers), separately from MCQ ticks/circles/options. Return this as the required boolean hasDescriptiveWork. An MCQ-only response page must set it to false.
2. If hasDescriptiveWork=true, identify EVERY descriptive question/sub-question attempted on this page in detectedQuestions. Do not omit descriptive work just because MCQ selections are also present.
3. For EVERY detected descriptive question, report parentQuestionNumberVisible=true only when that parent number is visibly written on this page. If only a child label such as "(a)" is visible, report false; do not guess a parent number from the question paper or page number.
4. If this page continues the previous page's descriptive answer and does NOT start a new question header, mark isContinuation: true and identify the previous active question. This applies even when MCQ selections are also present on the page.
5. If multiple descriptive sub-questions are answered on this page (e.g. Q4(a) followed by Q4(b)), report ALL of them in detectedQuestions.
6. Put MCQ answers ONLY in mcqSelections, using a selected option only when the actual student mark is clearly visible. Do not put an MCQ in detectedQuestions. Never infer an option from the official key or question sequence. If a mark is unclear or multiple options are marked, do not guess the answer.
7. If hasDescriptiveWork=true but the descriptive question identity cannot be safely resolved, set status="QUESTION_NOT_IDENTIFIED". Preserve any separately identifiable MCQ selections; do not label the page fully readable based only on MCQs.
8. Classify page status:
   - ATTEMPTED_READABLE: All visible handwritten answer work is readable and safely identified
   - ATTEMPTED_PARTIALLY_READABLE: Answer work is present and mostly readable, with minor handwriting difficulty
   - ATTEMPTED_UNCLEAR: Handwriting is heavily illegible or blurry
   - CLEARLY_UNATTEMPTED: Blank page or crossed out entirely, with no MCQ selection
   - QUESTION_NOT_IDENTIFIED: Descriptive answer content is present but its question identity cannot be safely resolved

Return strictly valid JSON with this schema:
{
  "status": "ATTEMPTED_READABLE" | "ATTEMPTED_PARTIALLY_READABLE" | "ATTEMPTED_UNCLEAR" | "CLEARLY_UNATTEMPTED" | "QUESTION_NOT_IDENTIFIED",
  "hasHandwriting": boolean,
  "hasDescriptiveWork": boolean,
  "summary": string,
  "detectedQuestions": [
    {
      "questionNumber": string,
      "subQuestion": string | null,
      "parentQuestionNumberVisible": boolean,
      "isContinuation": boolean,
      "snippet": string
    }
  ],
  "mcqSelections": {
    [key: string]: string
  }
}
`;

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
    let mappingReviewReason: string | undefined = raw.mappingWarnings?.length
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
          mappingReviewReason = resolution.reason || 'The detected answer requires question-mapping review.';
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

    // MCQ selections are independent of descriptive continuity. A page may contain
    // MCQs and still continue a descriptive answer from the previous page.
    const hasMappedDescriptiveQuestion = detectedQuestions.some((question) =>
      !parseCanonicalQuestionIdentity(question.fullQuestionCode).isMcq
    );
    if (
      !hasMappedDescriptiveQuestion &&
      raw.hasDescriptiveWork &&
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

    // A detected MCQ is not proof that descriptive handwriting on the same page
    // was mapped. Fail closed rather than publishing an MCQ-only result as a
    // complete paper evaluation.
    const missingDescriptiveIdentity = requiresDescriptiveCoverageReview(
      raw.hasDescriptiveWork,
      detectedQuestions.map((question) => question.fullQuestionCode)
    );
    if (missingDescriptiveIdentity && !mappingReviewReason) {
      mappingReviewReason = 'HANDWRITTEN_DESCRIPTIVE_WORK_NOT_MAPPED: descriptive answer content was detected but no descriptive question identity was safely mapped.';
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
    };
  } catch (err: any) {
    const errStr = err?.message || String(err);
    const isCreditOrQuota =
      errStr.includes('429') ||
      errStr.includes('prepayment') ||
      errStr.includes('credits are depleted') ||
      errStr.includes('exceeded your current quota') ||
      errStr.includes('plan and billing details') ||
      errStr.includes('RESOURCE_EXHAUSTED');

    if (isCreditOrQuota) {
      console.info(`[AnswerCoverageService] Page ${pageNumber}: AI quota/credits exhausted; preserving the page for question-mapping review.`);
    } else {
      console.warn(`[AnswerCoverageService] Notice on page ${pageNumber}: ${errStr.slice(0, 160)}`);
    }

    return {
      pageNumber,
      status: 'QUESTION_NOT_IDENTIFIED',
      detectedQuestions: [],
      rawSummary: `Page ${pageNumber} requires question-mapping review because automated page analysis failed: ${errStr.slice(0, 240)}`,
      hasHandwriting: true,
    };
  }
}

