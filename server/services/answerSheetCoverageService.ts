import { PDFDocument } from 'pdf-lib';
import crypto from 'crypto';
import { executeModelWithFallback, sanitizeSecretStrings } from '../models/modelRegistry.js';
import { AuthoritativePaperStructure, PaperStructureSubQuestion } from './paperStructureService.js';
import {
  toCanonicalQuestionId,
  parseCanonicalQuestionIdentity,
  isCanonicalQuestionDescendant,
} from './canonicalQuestionService.js';

// In-memory cache: 1 Answer Sheet = 1 Authoritative Coverage Map
const coverageMapCache = new Map<string, AnswerCoverageMap>();

export function clearCoverageMapCache(): void {
  coverageMapCache.clear();
}

/**
 * Remove detected parent/container labels only when an actual descendant leaf
 * was also detected. This prevents a visible hierarchy header such as Q1(a)
 * from becoming a phantom attempted question beside Q1(a)(i) / Q1(a)(ii).
 * If no descendant is present, keep the parent so the pre-evaluation gate can
 * request an explicit mapping rather than guessing which leaf was attempted.
 */
export function normalizeDetectedAttemptHierarchy<T extends {
  fullQuestionCode: string;
  pages: number[];
}>(detectedAttempts: T[]): { attemptedQuestions: T[]; removedParentCodes: string[] } {
  const normalized = (Array.isArray(detectedAttempts) ? detectedAttempts : []).map((attempt) => ({
    ...attempt,
    fullQuestionCode: toCanonicalQuestionId(attempt.fullQuestionCode),
    pages: [...new Set((attempt.pages || []).filter((page) => Number.isInteger(page) && page > 0))].sort((a, b) => a - b),
  }));
  const removedParentCodes = new Set<string>();

  for (const parent of normalized) {
    const descendants = normalized.filter((candidate) =>
      candidate.fullQuestionCode !== parent.fullQuestionCode &&
      isCanonicalQuestionDescendant(candidate.fullQuestionCode, parent.fullQuestionCode)
    );
    if (descendants.length === 0) continue;

    removedParentCodes.add(parent.fullQuestionCode);
    for (const child of descendants) {
      child.pages = [...new Set([...child.pages, ...parent.pages])].sort((a, b) => a - b);
    }
  }

  return {
    attemptedQuestions: normalized.filter((attempt) => !removedParentCodes.has(attempt.fullQuestionCode)),
    removedParentCodes: Array.from(removedParentCodes),
  };
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
    authoritativeQuestionCode?: string;
    mappingBasis?: 'VISIBLE_LABEL' | 'MATERIAL_CONTENT' | 'CONTINUATION' | 'UNCERTAIN';
    labelMismatch?: boolean;
    snippet?: string;
  }>;
  mcqSelections: Record<string, string>;
  isContinuation?: boolean;
  /** Non-fatal page-level issues. Valid mapped answers on the same page are retained. */
  mappingWarnings: string[];
}

/** Keep nested source labels distinct: Q1(i), Q1(ii), Q1(iii), and Q1(iv)
 * must not all collapse to the parent number 1. */
function normalizeMcqSelectionLabel(raw: string): string {
  const original = String(raw || '').trim();
  const hasQuestionPrefix = /^Q\.?\s*\d/i.test(original);
  const value = original
    .replace(/^(?:QUESTION|MCQ|OBJECTIVE|Q\.?)\s*/i, '')
    .replace(/\s+/g, '');
  const match = value.match(/^(\d{1,2})(?:\(([a-z0-9]+)\))?$/i);
  if (!match) return '';
  const suffix = match[2] ? '(' + match[2].toLowerCase() + ')' : '';
  return (hasQuestionPrefix ? 'Q' : '') + match[1] + suffix;
}

/** Resolve a source-labeled Model Test response to the flattened MCQ index. */
export function resolveMcqSelectionNumber(
  rawKey: string,
  mcqs: AuthoritativePaperStructure['mcqs']
): string | undefined {
  const raw = String(rawKey || '').trim();
  const flatMatch = raw.match(/^(?:MCQ|OBJECTIVE)\s*(\d{1,2})$/i) || raw.match(/^(\d{1,2})$/);
  if (flatMatch) {
    const flatNumber = flatMatch[1];
    return (mcqs || []).some((mcq) => String(mcq.questionNumber).replace(/[^0-9]/g, '') === flatNumber)
      ? flatNumber
      : undefined;
  }

  const normalized = normalizeMcqSelectionLabel(raw);
  if (!normalized) return undefined;
  const sourceComparable = normalized.replace(/^Q(?=\d)/i, '');
  const matchingSource = (mcqs || []).find((mcq) =>
    Boolean(mcq.sourceQuestionLabel) && normalizeMcqSelectionLabel(mcq.sourceQuestionLabel!) === sourceComparable
  );
  return matchingSource
    ? String(matchingSource.questionNumber).replace(/[^0-9]/g, '') || undefined
    : undefined;
}

const PLACEHOLDER_AUTHORITATIVE_QUESTION_CODES = new Set([
  'UNCERTAIN',
  'UNKNOWN',
  'UNSURE',
  'NOTIDENTIFIED',
  'NOTFOUND',
  'UNMAPPED',
  'NONE',
  'NULL',
  'NA',
]);

/**
 * Model output sometimes puts a status word such as "UNCERTAIN" in the
 * authoritativeQuestionCode field. That is not a question ID. Treat these
 * values as absent so they can never be canonicalized into a fabricated Q1.
 */
function normalizeAuthoritativeQuestionCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim().slice(0, 80);
  if (!cleaned) return undefined;
  const normalized = cleaned.toUpperCase().replace(/[\s_/-]+/g, '');
  return PLACEHOLDER_AUTHORITATIVE_QUESTION_CODES.has(normalized) ? undefined : cleaned;
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
      const questionMatch = rawQuestionNumber.match(/^\s*(?:(?:QUESTION|Q|ANSWER|ANS)\.?\s*)?(\d+)(.*)$/i);
      if (mcqMatch) {
        questionNumber = mcqMatch[1];
        inferredSubQuestion = 'MCQ';
      } else if (questionMatch) {
        const parsedLabel = parseCanonicalQuestionIdentity(rawQuestionNumber);
        questionNumber = parsedLabel.questionNumber;
        inferredSubQuestion = parsedLabel.subQuestion || '';
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
        const explicitSubQuestion = String(question.subQuestion).trim();
        if (inferredSubQuestion && inferredSubQuestion !== 'MCQ') {
          const normalizedFullCode = toCanonicalQuestionId(rawQuestionNumber, explicitSubQuestion);
          subQuestion = parseCanonicalQuestionIdentity(normalizedFullCode).subQuestion || explicitSubQuestion;
        } else {
          subQuestion = explicitSubQuestion;
        }
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
      const rawAuthoritativeQuestionCode = question.authoritativeQuestionCode;
      const authoritativeQuestionCode = normalizeAuthoritativeQuestionCode(rawAuthoritativeQuestionCode);
      if (
        rawAuthoritativeQuestionCode !== undefined &&
        rawAuthoritativeQuestionCode !== null &&
        typeof rawAuthoritativeQuestionCode !== 'string'
      ) {
        warnings.push('A detected answer contained an invalid authoritative question code.');
      } else if (
        typeof rawAuthoritativeQuestionCode === 'string' &&
        !rawAuthoritativeQuestionCode.trim()
      ) {
        warnings.push('A detected answer contained an empty authoritative question code.');
      }
      const allowedMappingBases = new Set(['VISIBLE_LABEL', 'MATERIAL_CONTENT', 'CONTINUATION', 'UNCERTAIN']);
      const mappingBasis = typeof question.mappingBasis === 'string' &&
        allowedMappingBases.has(question.mappingBasis.trim().toUpperCase())
          ? question.mappingBasis.trim().toUpperCase() as 'VISIBLE_LABEL' | 'MATERIAL_CONTENT' | 'CONTINUATION' | 'UNCERTAIN'
          : undefined;
      if (question.mappingBasis !== undefined && !mappingBasis) {
        warnings.push('A detected answer contained an invalid mapping basis.');
      }
      const labelMismatch = typeof question.labelMismatch === 'boolean' ? question.labelMismatch : undefined;
      if (question.labelMismatch !== undefined && labelMismatch === undefined) {
        warnings.push('A detected answer contained an invalid label-mismatch flag.');
      }

      const contextualIdentity = parentVisible === false && Boolean(subQuestion);
      const explicitContinuation = continuation || isContinuation === true;
      if (!questionNumber && !contextualIdentity && !explicitContinuation && !authoritativeQuestionCode) {
        warnings.push('One attempted answer had no safely resolvable question identity and was left for manual mapping.');
        continue;
      }

      detectedQuestions.push({
        ...(questionNumber ? { questionNumber } : {}),
        ...(subQuestion ? { subQuestion } : {}),
        ...(parentVisible !== undefined ? { parentQuestionNumberVisible: parentVisible } : {}),
        isContinuation: explicitContinuation,
        ...(authoritativeQuestionCode ? { authoritativeQuestionCode } : {}),
        ...(mappingBasis ? { mappingBasis } : {}),
        ...(labelMismatch !== undefined ? { labelMismatch } : {}),
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
      const normalizedNumber = normalizeMcqSelectionLabel(String(rawQuestionNumber));
      const option = typeof rawOption === 'string'
        ? rawOption.trim().toUpperCase().replace(/^OPTION\s*/, '').replace(/[()\s]/g, '')
        : '';
      if (!normalizedNumber || !/^Q?[0-9]{1,2}(?:\([a-z0-9]+\))?$/i.test(normalizedNumber) || !/^[A-D]$/.test(option)) {
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
  mappingBasis?: 'VISIBLE_LABEL' | 'MATERIAL_CONTENT' | 'CONTINUATION';
  labelMismatch?: boolean;
}

export interface ContextualQuestionResolution {
  canonicalId?: string;
  requiresReview: boolean;
  reason?: string;
  warning?: string;
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
  authoritativeQuestionCode?: string;
  mappingBasis?: 'VISIBLE_LABEL' | 'MATERIAL_CONTENT' | 'CONTINUATION' | 'UNCERTAIN';
  labelMismatch?: boolean;
  paperSubQuestions: AuthoritativePaperStructure['subQuestions'];
}): ContextualQuestionResolution {
  const {
    questionNumber = '',
    subQuestion = '',
    isContinuation = false,
    parentQuestionNumberVisible,
    previousActiveQuestion,
    authoritativeQuestionCode,
    mappingBasis,
    labelMismatch = false,
    paperSubQuestions,
  } = options;
  const detectedId = toCanonicalQuestionId(questionNumber, subQuestion, paperSubQuestions);
  const detected = parseCanonicalQuestionIdentity(detectedId);
  const normalizedAuthoritativeCode = normalizeAuthoritativeQuestionCode(authoritativeQuestionCode);
  const hasVisibleParentLabel = parentQuestionNumberVisible === true && Boolean(String(questionNumber || '').trim());

  // An uncertain source-content match may still be mapped from a clearly
  // visible question label, but only by an exact match in the selected paper.
  // Without that independent label evidence it must remain a manual-review item.
  if (mappingBasis === 'UNCERTAIN' && (!hasVisibleParentLabel || labelMismatch)) {
    return {
      requiresReview: true,
      reason: 'The AI could not establish the question identity and no unambiguous visible question label was available for exact mapping.',
    };
  }

  if (mappingBasis === 'MATERIAL_CONTENT' && !normalizedAuthoritativeCode) {
    return {
      requiresReview: true,
      reason: 'The AI reported a material-content match but did not provide a valid authoritative question ID.',
    };
  }

  // MCQ numbers are their own canonical identity; parent-question context does
  // not apply to them. An explicit UNCERTAIN result is never auto-scored.
  if (detected.isMcq || subQuestion.toUpperCase() === 'MCQ') {
    if (mappingBasis === 'UNCERTAIN') {
      return { requiresReview: true, reason: 'The AI marked the MCQ identity as uncertain.' };
    }
    return { canonicalId: detected.canonicalId, requiresReview: false };
  }

  // Source-grounded identity wins over the last page's answer context.
  // When the model says UNCERTAIN but has a clearly visible label, ignore the
  // unresolved content ID and validate that visible label against the inventory.
  if (normalizedAuthoritativeCode && mappingBasis !== 'UNCERTAIN') {
    const normalized = parseCanonicalQuestionIdentity(
      toCanonicalQuestionId(normalizedAuthoritativeCode, undefined, paperSubQuestions)
    ).canonicalId;
    const authoritativeMatch = paperSubQuestions.find((question) =>
      !question.isMcq && toCanonicalQuestionId(
        question.fullQuestionCode || question.questionNumber,
        question.subQuestionNumber,
        paperSubQuestions
      ).toLowerCase() === normalized.toLowerCase()
    );
    if (!authoritativeMatch) {
      return { requiresReview: true, reason: `The AI-selected question ${authoritativeQuestionCode} is not present in the selected authoritative question inventory.` };
    }
    if (!mappingBasis) {
      return { requiresReview: true, reason: 'The AI supplied a question ID without stating whether it came from the visible label, source content, or a verified continuation.' };
    }
    if (mappingBasis === 'CONTINUATION' && !isContinuation) {
      return { requiresReview: true, reason: 'The answer was mapped as a continuation but the continuation flag was not confirmed.' };
    }
    return {
      canonicalId: authoritativeMatch.fullQuestionCode,
      requiresReview: false,
      ...(labelMismatch ? { warning: `The visible answer label conflicts with the source-content match to ${authoritativeMatch.fullQuestionCode}; examiner review is required.` } : {}),
    };
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
    const exists = paperSubQuestions.some((question) =>
      !question.isMcq && toCanonicalQuestionId(
        question.fullQuestionCode || question.questionNumber,
        question.subQuestionNumber,
        paperSubQuestions
      ).toLowerCase() === detected.canonicalId.toLowerCase()
    );
    return exists
      ? { canonicalId: detected.canonicalId, requiresReview: false }
      : { requiresReview: true, reason: `The detected question ${detected.canonicalId} does not exist in the selected authoritative inventory.` };
  }

  if (!isContinuation) {
    return { requiresReview: true, reason: 'A missing parent label cannot be inferred from the previous page unless this answer is explicitly identified as a continuation.' };
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

export interface PriorQuestionContext {
  fullQuestionCode: string;
  pages: number[];
  snippet?: string;
}

export type PageCoverageAnalyzer = (
  pageBase64: string,
  pageNumber: number,
  paperStructure: AuthoritativePaperStructure,
  totalPages: number,
  previousActiveQuestion?: string,
  priorQuestionContexts?: PriorQuestionContext[],
  recoveryMode?: boolean
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
  options: { analyzePage?: PageCoverageAnalyzer; enableTargetedRecovery?: boolean } = {}
): Promise<AnswerCoverageMap> {
  const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const structureSignature = JSON.stringify({
    paperTitle: paperStructure.paperTitle || '',
    totalPaperMaxMarks: paperStructure.totalPaperMaxMarks ?? null,
    descriptiveQuestions: (paperStructure.subQuestions || []).map((question) => ({
      questionId: question.fullQuestionCode || toCanonicalQuestionId(question.questionNumber, question.subQuestionNumber),
      maximumMarks: question.maximumMarks,
      isMcq: question.isMcq,
      questionText: question.questionText || null,
      suggestedAnswerAnchor: question.suggestedAnswerAnchor || null,
    })),
    mcqs: (paperStructure.mcqs || []).map((question) => ({
      questionId: question.fullQuestionCode || `MCQ${question.questionNumber}`,
      maximumMarks: question.maximumMarks,
      officialKey: question.officialKey || null,
      questionText: question.questionText || null,
      suggestedAnswerAnchor: question.suggestedAnswerAnchor || null,
    })),
  });
  const structureHash = crypto.createHash('sha256').update(structureSignature).digest('hex');
  const enableTargetedRecovery = options.enableTargetedRecovery === true;
  // Keep normal and PYQ-recovery coverage maps isolated for the same PDF/paper.
  const cacheKey = `${pdfHash}:${structureHash}:pyqRecovery=${enableTargetedRecovery ? '1' : '0'}`;
  if (coverageMapCache.has(cacheKey)) {
    return coverageMapCache.get(cacheKey)!;
  }

  const origDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const totalPages = origDoc.getPageCount();

  const pageRecords: PageCoverageRecord[] = [];
  const mcqSelections: Record<string, string> = {};
  let activeQuestionContext: string | undefined = undefined;
  const priorQuestionContextMap = new Map<string, PriorQuestionContext>();
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

    const priorQuestionContexts = Array.from(priorQuestionContextMap.values())
      .slice(-24)
      .map((context) => ({
        fullQuestionCode: context.fullQuestionCode,
        pages: [...context.pages],
        snippet: String(context.snippet || '').slice(0, 140),
      }));
    let analysis = await analyzePage(
      pageBase64,
      pageNum,
      paperStructure,
      totalPages,
      activeQuestionContext,
      priorQuestionContexts,
      false
    );

    // A page can contain a real attempted answer whose label/content match was
    // inconclusive on the first pass. Re-read only those ambiguous handwritten
    // pages once with an explicit recovery instruction; do not retry provider
    // failures (which would multiply cost) and never guess an unresolved identity.
    const needsTargetedRecovery =
      enableTargetedRecovery &&
      !analysis.analysisFailure &&
      analysis.status !== 'CLEARLY_UNATTEMPTED' &&
      (
        analysis.status === 'QUESTION_NOT_IDENTIFIED' ||
        analysis.status === 'PAGE_UNREADABLE' ||
        analysis.status === 'ATTEMPTED_UNCLEAR' ||
        analysis.status === 'ATTEMPTED_PARTIALLY_READABLE' ||
        Boolean(analysis.mappingReviewReason) ||
        analysis.detectedQuestions.length === 0
      );

    if (needsTargetedRecovery) {
      try {
        const recovery = await analyzePage(
          pageBase64,
          pageNum,
          paperStructure,
          totalPages,
          activeQuestionContext,
          priorQuestionContexts,
          true
        );

        if (!recovery.analysisFailure) {
          const recoveredByCode = new Map<string, DetectedQuestionOccurrence>();
          for (const detected of [...analysis.detectedQuestions, ...recovery.detectedQuestions]) {
            const key = detected.fullQuestionCode.toLowerCase();
            const existing = recoveredByCode.get(key);
            if (!existing) {
              recoveredByCode.set(key, { ...detected });
            } else if (detected.snippet && !existing.snippet?.includes(detected.snippet)) {
              existing.snippet = [existing.snippet, detected.snippet].filter(Boolean).join('\n\n').slice(-1200);
            }
          }

          const recoveredQuestions = Array.from(recoveredByCode.values());
          const recoveryResolvedPage =
            recovery.status !== 'QUESTION_NOT_IDENTIFIED' &&
            recovery.status !== 'PAGE_UNREADABLE' &&
            recovery.status !== 'CLEARLY_UNATTEMPTED' &&
            !recovery.mappingReviewReason &&
            recoveredQuestions.length > 0;

          analysis = {
            ...analysis,
            status: recoveryResolvedPage ? recovery.status : 'QUESTION_NOT_IDENTIFIED',
            detectedQuestions: recoveredQuestions,
            rawSummary: [
              `Initial page read: ${analysis.rawSummary}`,
              `Targeted recovery read: ${recovery.rawSummary}`,
            ].join('\n'),
            mappingReviewReason: recoveryResolvedPage
              ? undefined
              : [analysis.mappingReviewReason, recovery.mappingReviewReason || 'Targeted re-read still could not safely identify every handwritten answer block.']
                  .filter(Boolean)
                  .join(' | '),
            questionLabelEvidence: recovery.questionLabelEvidence || analysis.questionLabelEvidence,
            readingConfidence: recovery.readingConfidence ?? analysis.readingConfidence,
          };
        } else {
          analysis = {
            ...analysis,
            rawSummary: `${analysis.rawSummary}\nTargeted recovery read was unavailable: ${recovery.analysisFailure.code}.`,
            mappingReviewReason: [analysis.mappingReviewReason, 'Targeted recovery could not complete; this handwritten page remains in manual mapping review.']
              .filter(Boolean)
              .join(' | '),
            status: 'QUESTION_NOT_IDENTIFIED',
          };
        }
      } catch (recoveryError: any) {
        const recoveryMessage = sanitizeSecretStrings(recoveryError?.message || String(recoveryError)).replace(/[\r\n]+/g, ' ').slice(0, 180);
        analysis = {
          ...analysis,
          rawSummary: `${analysis.rawSummary}\nTargeted recovery failed: ${recoveryMessage}`,
          mappingReviewReason: [analysis.mappingReviewReason, 'Targeted recovery failed; this handwritten page remains in manual mapping review.']
            .filter(Boolean)
            .join(' | '),
          status: 'QUESTION_NOT_IDENTIFIED',
        };
      }
    }

    pageRecords.push(analysis);
    if (analysis.analysisFailure) {
      providerFailureCircuit = { failedOnPage: pageNum, failure: analysis.analysisFailure };
      activeQuestionContext = undefined;
      continue;
    }

    // Retain all earlier question contexts. A candidate may answer Q2, then Q1,
    // then continue Q2 again; the last page alone is not enough context.
    for (const detected of analysis.detectedQuestions) {
      const key = detected.fullQuestionCode.toLowerCase();
      const existing = priorQuestionContextMap.get(key);
      if (existing) {
        if (!existing.pages.includes(pageNum)) existing.pages.push(pageNum);
        if (detected.snippet) {
          existing.snippet = [existing.snippet, detected.snippet].filter(Boolean).join(' ').slice(-640);
        }
      } else {
        priorQuestionContextMap.set(key, {
          fullQuestionCode: detected.fullQuestionCode,
          pages: [pageNum],
          snippet: detected.snippet?.slice(0, 640),
        });
      }
    }

    // The immediately prior question is only a weak clue. The full context list
    // above is supplied so non-adjacent continuations can be recognised safely.
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

  // Canonical parent containers are non-scorable once a detected descendant
  // leaf exists. The helper removes only those proven containers and transfers
  // their source pages to the matching leaf tasks; unresolved parent-only
  // detections remain visible to the pre-evaluation review gate.
  const hierarchyNormalized = normalizeDetectedAttemptHierarchy(Array.from(mappingMap.values()));
  const attemptedQuestions = hierarchyNormalized.attemptedQuestions;
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
  priorQuestionContexts?: PriorQuestionContext[];
  recoveryMode?: boolean;
}): string {
  const { pageNumber, totalPages, paperStructure, previousActiveQuestion, priorQuestionContexts = [], recoveryMode = false } = params;
  const compactSourceText = (value: string | undefined, limit: number): string =>
    String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const validDescriptiveList = paperStructure.subQuestions
    .filter((s) => !s.isMcq)
    .map((s) => {
      const questionText = compactSourceText(s.questionText, 220);
      const answerAnchor = compactSourceText(s.suggestedAnswerAnchor, 140);
      return [
        `${s.fullQuestionCode} — ${s.maximumMarks} marks${s.topic ? ` — ${s.topic}` : ''}`,
        questionText ? `  EXACT QUESTION PAPER TEXT: ${questionText}` : '',
        answerAnchor ? `  SUGGESTED ANSWER REFERENCE: ${answerAnchor}` : '',
      ].filter(Boolean).join('\n');
    })
    .join('\n');
  const validMcqList = (paperStructure.mcqs || [])
    .map((m) => {
      const questionText = compactSourceText(m.questionText, 180);
      const answerAnchor = compactSourceText(m.suggestedAnswerAnchor, 120);
      return [
        `${m.fullQuestionCode}${m.sourceQuestionLabel ? ` — source label: ${m.sourceQuestionLabel}` : ''} — ${m.maximumMarks} marks`,
        questionText ? `  EXACT QUESTION PAPER TEXT: ${questionText}` : '',
        answerAnchor ? `  SUGGESTED ANSWER REFERENCE: ${answerAnchor}` : '',
      ].filter(Boolean).join('\n');
    })
    .join('\n');
  const recoveryModeInstruction = recoveryMode ? `
TARGETED SECOND-PASS RECOVERY:
- The first pass found visible handwriting but could not safely map every answer block on this page.
- Re-read the ENTIRE page, not just the previously noticed heading. Split every distinct answer block and every separately labelled sub-part.
- Recompare each answer's actual subject matter, facts, amounts, journal entries, workings and legal/accounting treatment against ALL authoritative question texts and Suggested Answer anchors listed above.
- A faint or missing question label does not make an answer disappear: use a strong source-content match and set mappingBasis = MATERIAL_CONTENT when the answer content uniquely identifies one listed question.
- If a visible label conflicts with a unique source-content match, retain the source-content match and report labelMismatch = true.
- Do not merge two independent answer blocks. Return every block you can safely map. Keep any genuinely ambiguous block unresolved for review; never guess.
` : '';
  const priorContextList = priorQuestionContexts
    .map((context) => {
      const pages = context.pages.length ? context.pages.join(', ') : 'unknown';
      const snippet = compactSourceText(context.snippet, 140);
      return `- ${context.fullQuestionCode} (earlier page(s): ${pages})${snippet ? ` — earlier answer evidence: ${snippet}` : ''}`;
    })
    .join('\n');

  return `
Universal CA exam answer-sheet page reader and question mapper. Apply equally to Foundation,
Intermediate and Final and every subject; never use a subject-specific question template.

Read the visual scan of Page ${pageNumber}/${totalPages}, not extracted PDF text.

SELECTED PAPER: ${paperStructure.paperTitle || 'CA examination paper'}
AUTHORITATIVE DESCRIPTIVE IDS:
${validDescriptiveList || 'None parsed'}
AUTHORITATIVE MCQ IDS:
${validMcqList || 'None parsed'}
PREVIOUS PAGE ACTIVE QUESTION (weak clue only; not a question-order assumption): ${previousActiveQuestion || 'None / first page'}
PRIOR DETECTED ANSWERS FROM ALL EARLIER PAGES (answer order is arbitrary):
${priorContextList || 'No earlier mapped answers.'}

QUESTION ORDER, MATERIAL MATCHING AND CONTINUATIONS:
- Students may answer questions in ANY order. Page 1 is not Q1; Page 2 is not Q2; do not use page number,
  answer order, inventory order or the previous page's question as an identity shortcut.
- Use the exact Question Paper text and Suggested Answer reference above as the authoritative material.
  Compare the student's actual answer content (facts, figures, journal entries, treatment, case names,
  calculations, headings and working notes) against ALL listed questions before selecting an ID.
- For each answer block, select authoritativeQuestionCode from the supplied IDs. Prefer a clear visible
  question label when it agrees with the material. If the label conflicts with a strong material match,
  report the material match and set labelMismatch=true; do not silently hide the conflict.
- One page may contain multiple independent questions. Split and map each answer block separately.
- A continuation can refer to ANY earlier question, not necessarily the previous page's last question.
  Compare it with PRIOR DETECTED ANSWERS FROM ALL EARLIER PAGES. Set isContinuation=true and use the
  same canonical ID only when the handwriting/content clearly continues that earlier answer.
- A bare '(a)' or '(b)' is not enough to infer a parent from the previous page. If neither source content
  nor a visible parent establishes the identity, mark the answer UNCERTAIN for manual review.
- The previous page active question is only a weak clue and must never override an explicit label or
  a stronger match against the selected Question Paper / Suggested Answer.

${recoveryModeInstruction}
HANDWRITING STYLE FAIRNESS — MANDATORY:
- Students use genuinely different handwriting styles. Read connected cursive / joined-up writing,
  separated print or block letters, mixed cursive and print, upright or slanted writing, right- or
  left-leaning letters, variable letter shapes, loops, size, spacing, baselines, pen pressure and ink.
- NO handwriting style is illegal or invalid. Never reject, downgrade, skip or mark a page unclear
  merely because its writing is cursive, joined, slanted, uneven, non-standard or unlike textbook print.
- Do not assume a student has written incorrectly because a letter looks different from a familiar
  schoolbook form. Interpret characters using the whole word, surrounding sentence, accounting/legal
  context, calculations and the selected question — but do not invent a number, word, section or formula.
- Preserve every readable word, digit, symbol, calculation and working. If only one word, digit or
  line is uncertain, localize the uncertainty to that fragment; do not discard the entire answer or page.
- If useful content is visible but partly difficult to decipher, return ATTEMPTED_PARTIALLY_READABLE
  and retain the evidence. Use ATTEMPTED_UNCLEAR only when the actual answer content cannot be read
  sufficiently to identify or assess it, not as a handwriting-style label.
- A style difference is never evidence of cheating, document fraud or an invalid answer sheet.
- The page reader, not the upload-authenticity check, decides which specific answer fragments are readable.

HANDWRITING AND MAPPING:
- Inspect the whole page, especially top/bottom and left/right margins, answer-block starts,
  circles, underlines and headings. Labels may be faint, cursive, slanted, overwritten or in margins.
- Read labels such as Q2, Q. 2, Question 2, 2(a), (a), and circled/margin-written numbers.
  Distinguish question labels from printed page numbers, dates, roll numbers, scanner marks and amounts.
- Read all answer formats: paragraphs, tables, journal/ledger entries, Dr/Cr columns,
  calculations, formulas, working notes, diagrams, bullet points and case studies.
- Do not classify descriptive question labels (Q1, 1(a), (b), etc.), calculations, or ordinary
  A/B/C/D letters in prose as MCQ attempts. An MCQ selection exists only when this student's page
  visibly shows an objective question identity and a chosen option A, B, C or D for that question.
  If the answer sheet contains no MCQ attempt, return an empty mcqSelections object.
- Model Test MCQs can be flattened from nested source labels. Use the crosswalk shown beside each
  MCQ ID: for example, MCQ4 may be source Question 1(iv), while MCQ13 may be standalone Question 4.
  A student response labelled Q1(iv) or (iv) under Q1 maps to MCQ4, not MCQ1. Return flattened
  MCQ numbers in mcqSelections. Never collapse several Roman-numeral parts under one parent number.
- Return every identifiable answer block on a mixed-question page. Keep visible label fields separate
  from authoritativeQuestionCode, which must be one exact ID from the supplied inventory.
- questionNumber and subQuestion must record only labels visibly written by the student on THIS page.
  Do not fill them with a guessed question ID. For continuation or content-only matches, omit absent labels
  and set authoritativeQuestionCode plus mappingBasis instead.
- Use mappingBasis: VISIBLE_LABEL when the visible label agrees with the question, MATERIAL_CONTENT
  when exact material content establishes identity, CONTINUATION for a verified continuation, or
  UNCERTAIN when the identity cannot be safely established.
- If identity is UNCERTAIN, omit authoritativeQuestionCode entirely. NEVER put words such as
  "UNCERTAIN", "UNKNOWN", "N/A" or "NOT IDENTIFIED" in authoritativeQuestionCode; those are not question IDs.
  A clear visible label may be mapped only by exact validation against the authoritative inventory.
- For a continuation, use a matching item from the full prior-answer list even when another question
  was answered on an intervening page.
- Never infer identity from PDF page index, sequence, marks or subject stereotypes. Never invent IDs.
- If both exact QP wording and Suggested Answer reference are unavailable for a question, do not guess
  its identity from subject stereotypes or a generic topic; require a clear visible label or mark UNCERTAIN.
- Poor or unusual handwriting alone is not a reason to discard identifiable work. Preserve
  partially readable attempts and award the credit supported by readable evidence. Do not guess
  unreadable figures, words, dates, sections or formulas; localize uncertainty to the affected fragment.

TASK:
1. Identify every attempted question/sub-question and any visible MCQ selections.
2. Set parentQuestionNumberVisible=true only when the parent label is visible on THIS page.
3. Set isContinuation=true only for a clear continuation without a new label.
4. Give literal questionLabelEvidence (e.g. "circled 2 in left margin") and readingConfidence 0–1.
   Confidence is diagnostic only and must not override identity validation.
5. Classify: ATTEMPTED_READABLE, ATTEMPTED_PARTIALLY_READABLE, ATTEMPTED_UNCLEAR,
   CLEARLY_UNATTEMPTED or QUESTION_NOT_IDENTIFIED.

Return valid JSON only:
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
      "authoritativeQuestionCode": "Q2(a)",
      "mappingBasis": "VISIBLE_LABEL",
      "labelMismatch": false,
      "snippet": "short answer evidence"
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
  previousActiveQuestion?: string,
  priorQuestionContexts: PriorQuestionContext[] = [],
  recoveryMode: boolean = false
): Promise<PageCoverageRecord> {
  const prompt = buildPageCoveragePrompt({
    pageNumber,
    totalPages,
    paperStructure,
    previousActiveQuestion,
    priorQuestionContexts,
    recoveryMode,
  });

  try {
    const res = await executeModelWithFallback({
      systemPrompt: 'You are an expert CA exam answer-sheet page auditor. Return only valid JSON matching the requested schema.',
      userPrompt: prompt,
      pdfBase64: pageBase64,
      mimeType: 'application/pdf',
      responseMimeType: 'application/json',
      thinkingLevel: recoveryMode ? 'HIGH' : 'MEDIUM',
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
          authoritativeQuestionCode: dq.authoritativeQuestionCode,
          mappingBasis: dq.mappingBasis,
          labelMismatch: dq.labelMismatch,
          paperSubQuestions: paperStructure.subQuestions,
        });
        if (resolution.warning) {
          mappingReviewReason = [mappingReviewReason, resolution.warning].filter(Boolean).join(' | ');
        }
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
          ...(dq.mappingBasis && dq.mappingBasis !== 'UNCERTAIN' ? { mappingBasis: dq.mappingBasis } : {}),
          ...(dq.labelMismatch !== undefined ? { labelMismatch: dq.labelMismatch } : {}),
        });
        pageActiveQuestionContext = parsed.isMcq ? pageActiveQuestionContext : parsed.canonicalId;
      }
    }

    // Map both flattened IDs and original nested Model Test labels to canonical MCQs.
    if (raw.mcqSelections && typeof raw.mcqSelections === 'object') {
      const mappedSelections = new Map<string, string>();
      for (const [mcqKey, opt] of Object.entries(raw.mcqSelections)) {
        const num = resolveMcqSelectionNumber(mcqKey, paperStructure.mcqs || []);
        if (!num) {
          mappingReviewReason = [mappingReviewReason, `MCQ response label \"${mcqKey}\" did not match a source label or flat MCQ ID in the selected paper.`].filter(Boolean).join(' | ');
          continue;
        }
        const choice = String(opt).trim().toUpperCase();
        const existing = mappedSelections.get(num);
        if (existing && existing !== choice) {
          mappedSelections.delete(num);
          mappingReviewReason = [mappingReviewReason, `Conflicting responses were mapped to MCQ${num}; manual review is required.`].filter(Boolean).join(' | ');
          continue;
        }
        mappedSelections.set(num, choice);
      }
      for (const [num, opt] of mappedSelections) {
        detectedQuestions.push({
          fullQuestionCode: `MCQ${num}`,
          questionNumber: num,
          subQuestionNumber: 'MCQ',
          status,
          isContinuation: false,
          pageNumber,
          snippet: `MCQ ${num} selected option: ${opt}`,
          studentSelectedOption: opt,
          isMcq: true,
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

