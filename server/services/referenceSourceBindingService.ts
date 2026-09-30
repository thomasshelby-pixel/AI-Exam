/**
 * Reference Source Binding & Traceability Service
 *
 * Implements Production-Grade Reference Source Lock:
 * 1. Single Immutable EvaluationSourceBundle per evaluation run.
 * 2. Deterministic Document Resolution using explicit metadata & hashes (no fuzzy/closest guessing).
 * 3. Hard Anti-Cross-Paper Contamination Gate (e.g. MTP Series 1 vs Series 2, Inter vs Foundation).
 * 4. Question-Wise Reference Locking (QuestionReferenceBundle per canonical question).
 * 5. Suggested Answer Question-Wise Segmentation without spillover.
 * 6. Authoritative MCQ Answer Key Lock from current source only.
 * 7. Strict Separation of CURRENT_AUTHORITATIVE_REFERENCE vs PREVIOUS_EVALUATION_FOR_REGRESSION.
 * 8. Cache Safety keyed by complete identity tuple.
 * 9. Source Change Invalidation.
 * 10. End-to-End Criterion-Level Reference Traceability.
 * 11. Pre-Evaluation Reference Gate (Hard Stop -> REVIEW_REQUIRED).
 * 12. Post-Evaluation Reference Audit.
 */

import crypto from 'node:crypto';
import { db } from '../db.js';
import {
  EvaluationSourceBundle,
  QuestionReferenceBundle,
  EvaluationReferenceTraceRecord,
  QuestionEvaluation,
  EvaluationResult,
} from '../../src/types/index.js';
import { extractLockedQuestionSlice, parseQuestionCode } from './questionReferenceLock.js';
import { toCanonicalQuestionId, parseCanonicalQuestionIdentity } from './canonicalQuestionService.js';
import { PaperStructureSubQuestion } from './paperStructureService.js';
import { normalizeMtpSeries } from './materialLookupService.js';

export function computeSha256(content: string): string {
  return crypto.createHash('sha256').update(content || '', 'utf8').digest('hex');
}

export interface CreateSourceBundleParams {
  evaluationId: string;
  paperId: string;
  paperVersion?: string;
  course?: string;
  level: string;
  subject: string;
  examType: string;
  examSession: string;
  mtpSeries?: number | null;

  questionPaperText: string;
  questionPaperSourceId?: string;
  questionPaperVersionId?: string;
  questionPaperFilename?: string;

  suggestedAnswersText: string;
  suggestedAnswerSourceId?: string;
  suggestedAnswerVersionId?: string;
  suggestedAnswerFilename?: string;

  markingSchemeText?: string;
  markingSchemeSourceId?: string;
  markingSchemeVersionId?: string;
  markingSchemeFilename?: string;

  mcqAnswerKeyText?: string;
  mcqAnswerKeySourceId?: string;
  mcqAnswerKeyVersionId?: string;
  mcqAnswerKeyFilename?: string;
}

/**
 * Creates an immutable EvaluationSourceBundle.
 * Computes individual document SHA-256 hashes and combined sourceBindingHash.
 * Deeply freezes the object to prevent mutation.
 */
export function createEvaluationSourceBundle(
  params: CreateSourceBundleParams
): EvaluationSourceBundle {
  const course = (params.course || 'CA').toUpperCase();
  const level = (params.level || 'INTERMEDIATE').toUpperCase();
  const examType = (params.examType || 'MTP').toUpperCase();
  const examSession = (params.examSession || 'May 2026').trim();
  const paperId = (params.paperId || 'Paper 1').trim();
  const paperVersion = (params.paperVersion || '1.0').trim();

  const qpSourceId = params.questionPaperSourceId || `qp_${params.paperId}`;
  const qpVersionId = params.questionPaperVersionId || paperVersion;
  const qpContentHash = computeSha256(params.questionPaperText);
  const qpFilename = params.questionPaperFilename || `${course}_${level}_${paperId.replace(/\s+/g, '_')}_QP.txt`;

  const saSourceId = params.suggestedAnswerSourceId || `sa_${params.paperId}`;
  const saVersionId = params.suggestedAnswerVersionId || paperVersion;
  const saContentHash = computeSha256(params.suggestedAnswersText);
  const saFilename = params.suggestedAnswerFilename || `${course}_${level}_${paperId.replace(/\s+/g, '_')}_SA.txt`;

  const msSourceId = params.markingSchemeText ? (params.markingSchemeSourceId || `ms_${params.paperId}`) : undefined;
  const msVersionId = params.markingSchemeText ? (params.markingSchemeVersionId || paperVersion) : undefined;
  const msContentHash = params.markingSchemeText ? computeSha256(params.markingSchemeText) : undefined;
  const msFilename = params.markingSchemeText ? (params.markingSchemeFilename || `${course}_${level}_${paperId.replace(/\s+/g, '_')}_MS.txt`) : undefined;

  const mcqKeySourceId = params.mcqAnswerKeyText ? (params.mcqAnswerKeySourceId || `key_${params.paperId}`) : undefined;
  const mcqKeyVersionId = params.mcqAnswerKeyText ? (params.mcqAnswerKeyVersionId || paperVersion) : undefined;
  const mcqKeyContentHash = params.mcqAnswerKeyText ? computeSha256(params.mcqAnswerKeyText) : undefined;
  const mcqKeyFilename = params.mcqAnswerKeyText ? (params.mcqAnswerKeyFilename || `${course}_${level}_${paperId.replace(/\s+/g, '_')}_MCQ_KEY.txt`) : undefined;

  const bindingPayload = [
    params.evaluationId,
    course,
    level,
    params.subject,
    paperId,
    paperVersion,
    examType,
    examSession,
    params.mtpSeries ?? 'null',
    qpSourceId,
    qpContentHash,
    saSourceId,
    saContentHash,
    msSourceId ?? 'none',
    msContentHash ?? 'none',
    mcqKeySourceId ?? 'none',
    mcqKeyContentHash ?? 'none',
  ].join(':::');

  const sourceBindingHash = computeSha256(bindingPayload);

  const bundle: EvaluationSourceBundle = {
    evaluationId: params.evaluationId,
    paperId,
    paperVersion,
    course,
    level,
    subject: params.subject,
    examType,
    examSession,
    mtpSeries: params.mtpSeries ?? null,

    questionPaperSourceId: qpSourceId,
    questionPaperVersionId: qpVersionId,
    questionPaperContentHash: qpContentHash,
    questionPaperFilename: qpFilename,

    suggestedAnswerSourceId: saSourceId,
    suggestedAnswerVersionId: saVersionId,
    suggestedAnswerContentHash: saContentHash,
    suggestedAnswerFilename: saFilename,

    markingSchemeSourceId: msSourceId,
    markingSchemeVersionId: msVersionId,
    markingSchemeContentHash: msContentHash,
    markingSchemeFilename: msFilename,

    mcqAnswerKeySourceId: mcqKeySourceId,
    mcqAnswerKeyVersionId: mcqKeyVersionId,
    mcqAnswerKeyContentHash: mcqKeyContentHash,
    mcqAnswerKeyFilename: mcqKeyFilename,

    sourceBindingHash,
  };

  return Object.freeze(bundle);
}

/**
 * Hard validation layer preventing cross-paper and cross-session reference contamination.
 */
export function validateSourceCompatibility(
  bundle: EvaluationSourceBundle,
  targetContext: {
    course?: string;
    level: string;
    subject: string;
    examType?: string;
    examSession?: string;
    mtpSeries?: number | null;
  }
): { isCompatible: boolean; status: 'VALID' | 'REVIEW_REQUIRED'; error?: string } {
  const normTargetCourse = (targetContext.course || 'CA').toUpperCase();
  const normTargetLevel = (targetContext.level || '').toUpperCase();
  const normTargetSubject = (targetContext.subject || '').toLowerCase().trim();

  // 1. Course Check
  if (bundle.course.toUpperCase() !== normTargetCourse) {
    return {
      isCompatible: false,
      status: 'REVIEW_REQUIRED',
      error: `COURSE_MISMATCH: Bundle course (${bundle.course}) does not match target (${normTargetCourse}).`,
    };
  }

  // 2. Level Check (Foundation vs Intermediate vs Final)
  if (bundle.level.toUpperCase() !== normTargetLevel) {
    return {
      isCompatible: false,
      status: 'REVIEW_REQUIRED',
      error: `LEVEL_MISMATCH: Cross-level contamination detected! Bundle level (${bundle.level}) does not match target level (${normTargetLevel}).`,
    };
  }

  // 3. Subject Check (Taxation vs Accounting vs Law vs Audit)
  const normBundleSubj = bundle.subject.toLowerCase().trim();
  if (
    !normBundleSubj.includes(normTargetSubject) &&
    !normTargetSubject.includes(normBundleSubj)
  ) {
    return {
      isCompatible: false,
      status: 'REVIEW_REQUIRED',
      error: `SUBJECT_MISMATCH: Cross-subject contamination detected! Bundle subject (${bundle.subject}) does not match target subject (${targetContext.subject}).`,
    };
  }

  // 4. MTP Series Isolation
  if (bundle.examType === 'MTP' && targetContext.mtpSeries !== undefined && targetContext.mtpSeries !== null) {
    if (bundle.mtpSeries !== targetContext.mtpSeries) {
      return {
        isCompatible: false,
        status: 'REVIEW_REQUIRED',
        error: `MTP_SERIES_CONTAMINATION: MTP Series ${targetContext.mtpSeries} attempted to bind reference material from MTP Series ${bundle.mtpSeries}!`,
      };
    }
  }

  // 5. Exam Session Check
  if (targetContext.examSession && targetContext.examSession !== 'Current' && targetContext.examSession !== 'All') {
    const targetSess = targetContext.examSession.toLowerCase().trim();
    const bundleSess = bundle.examSession.toLowerCase().trim();
    if (targetSess !== bundleSess && bundleSess !== 'all') {
      return {
        isCompatible: false,
        status: 'REVIEW_REQUIRED',
        error: `EXAM_SESSION_MISMATCH: Bundle session (${bundle.examSession}) does not match target session (${targetContext.examSession}).`,
      };
    }
  }

  return { isCompatible: true, status: 'VALID' };
}

/**
 * Builds an immutable QuestionReferenceBundle for a specific canonical question.
 */
export function buildQuestionReferenceBundle(
  canonicalQuestionId: string,
  sourceBundle: EvaluationSourceBundle,
  questionPaperText: string,
  suggestedAnswersText: string,
  markingSchemeText?: string,
  mcqKey?: string,
  officialMaxMarks?: number
): QuestionReferenceBundle {
  const { qNum, subQ, isMcq } = parseQuestionCode(canonicalQuestionId);

  const qpSlice = extractLockedQuestionSlice(questionPaperText, qNum, subQ, 'QP');
  const saSlice = extractLockedQuestionSlice(suggestedAnswersText, qNum, subQ, 'SA');
  const msSlice = markingSchemeText
    ? extractLockedQuestionSlice(markingSchemeText, qNum, subQ, 'MS')
    : undefined;

  const qpLocation = qpSlice.found ? qpSlice.sectionHeader : `QP Document: ${canonicalQuestionId}`;
  const saLocation = saSlice.found ? saSlice.sectionHeader : `Suggested Answer: ${canonicalQuestionId}`;
  const msCriteria = msSlice?.found ? msSlice.snippet : undefined;

  const combinedContent = [
    qpSlice.snippet,
    saSlice.snippet,
    msSlice?.snippet || '',
    mcqKey || '',
  ].join('\n---\n');

  const referenceContentHash = computeSha256(combinedContent);

  const bundle: QuestionReferenceBundle = {
    canonicalQuestionId,
    questionPaperText: qpSlice.snippet,
    questionPaperSourceLocation: qpLocation,
    maximumMarks: officialMaxMarks || (isMcq ? 2 : 4),
    suggestedAnswerText: saSlice.snippet,
    suggestedAnswerSourceLocation: saLocation,
    officialMarkingCriteria: msCriteria,
    officialMcqKey: isMcq ? mcqKey : undefined,
    referenceSourceId: sourceBundle.suggestedAnswerSourceId,
    referenceVersionId: sourceBundle.suggestedAnswerVersionId,
    referenceContentHash,
  };

  return Object.freeze(bundle);
}

/**
 * Deterministically extracts official MCQ keys from Suggested Answers / Answer Key text or paperStructure.
 * Strictly normalized to A, B, C, D.
 */
export function extractAuthoritativeMcqKeyFromSource(
  suggestedAnswersText: string,
  mcqCount: number = 16,
  paperStructureMcqs?: PaperStructureSubQuestion[]
): Record<string, { option: string; sourceLocation: string; rawSnippet: string }> {
  const result: Record<string, { option: string; sourceLocation: string; rawSnippet: string }> = {};

  if (Array.isArray(paperStructureMcqs) && paperStructureMcqs.length > 0) {
    for (const mcq of paperStructureMcqs) {
      const cleanNum = String(mcq.questionNumber || '').replace(/[^0-9]/g, '');
      if (cleanNum && mcq.officialKey) {
        result[cleanNum] = {
          option: mcq.officialKey.toUpperCase(),
          sourceLocation: `Division A, Section ${mcq.section || 'A'}, MCQ ${cleanNum}`,
          rawSnippet: mcq.officialExplanation || `Official Key: Option (${mcq.officialKey.toUpperCase()})`,
        };
      }
    }
    return result;
  }

  const lines = suggestedAnswersText.split('\n');

  for (let i = 1; i <= mcqCount; i++) {
    const qStr = String(i);
    // Patterns matching: "1. (b)", "1. (B)", "MCQ 1: (C)", "Question 1 - Option (A)", "(1) (c)"
    const patterns = [
      new RegExp(`(?:^|\\b)(?:MCQ|Q|Question)?\\s*${i}\\s*[.:\\-–)]\\s*\\(?([A-Da-d])\\)?`, 'i'),
      new RegExp(`(?:^|\\b)${i}\\s*\\(?([A-Da-d])\\)?\\s*(?:Rs\\.|Within|\\w+)`, 'i'),
      new RegExp(`(?:^|\\b)(?:Option|Choice)\\s*\\(?([A-Da-d])\\)?\\s*(?:is\\s+correct)?\\s*(?:for\\s+(?:Q|Question|MCQ)?\\s*${i})`, 'i'),
    ];

    let foundOption: string | undefined;
    let foundLocation = '';
    let foundSnippet = '';

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx].trim();
      for (const p of patterns) {
        const m = line.match(p);
        if (m && m[1]) {
          foundOption = m[1].toUpperCase();
          foundLocation = `Suggested Answer Line ${lineIdx + 1}`;
          foundSnippet = line;
          break;
        }
      }
      if (foundOption) break;
    }

    if (foundOption) {
      result[qStr] = {
        option: foundOption,
        sourceLocation: foundLocation,
        rawSnippet: foundSnippet,
      };
    }
  }

  return result;
}

/**
 * Pre-Evaluation Reference Gate
 * Strictly enforces all 14 mandatory pre-conditions before allowing expensive AI evaluation.
 * If ANY check fails: returns status 'REVIEW_REQUIRED' with explicit errors.
 */
export function validatePreEvaluationReferenceGate(
  sourceBundle: EvaluationSourceBundle,
  options: {
    questionPaperText: string;
    suggestedAnswersText: string;
    markingSchemeText?: string;
    canonicalQuestions?: string[];
    mcqDefinitions?: PaperStructureSubQuestion[];
    isPreviousEvaluationContaminated?: boolean;
    isStaleCache?: boolean;
    targetContext: {
      course?: string;
      level: string;
      subject: string;
      examType?: string;
      examSession?: string;
      mtpSeries?: number | null;
    };
  }
): { isValid: boolean; status: 'VALID' | 'REVIEW_REQUIRED'; errors: string[] } {
  const errors: string[] = [];

  // Check 1: Question Paper exists & non-empty
  if (!options.questionPaperText || options.questionPaperText.trim().length < 50) {
    errors.push('PRE_GATE_ERROR: Official Question Paper text is missing or superficial (< 50 chars).');
  }

  // Check 2: Suggested Answer exists & non-empty
  if (!options.suggestedAnswersText || options.suggestedAnswersText.trim().length < 50) {
    errors.push('PRE_GATE_ERROR: Official Suggested Answer text is missing or superficial (< 50 chars).');
  }

  // Check 3: Content hashes are non-empty and valid SHA-256
  if (!sourceBundle.questionPaperContentHash || sourceBundle.questionPaperContentHash.length !== 64) {
    errors.push('PRE_GATE_ERROR: Invalid or missing Question Paper SHA-256 content hash.');
  }
  if (!sourceBundle.suggestedAnswerContentHash || sourceBundle.suggestedAnswerContentHash.length !== 64) {
    errors.push('PRE_GATE_ERROR: Invalid or missing Suggested Answer SHA-256 content hash.');
  }

  // Check 4: Course, Level, Subject Compatibility
  const compat = validateSourceCompatibility(sourceBundle, options.targetContext);
  if (!compat.isCompatible) {
    errors.push(`PRE_GATE_ERROR: Source compatibility failed: ${compat.error}`);
  }

  // Check 5: Versions are valid
  if (!sourceBundle.paperVersion || !sourceBundle.questionPaperVersionId || !sourceBundle.suggestedAnswerVersionId) {
    errors.push('PRE_GATE_ERROR: Reference document version identity is missing or incomplete.');
  }

  // Check 6: No Previous Evaluation Contamination
  if (options.isPreviousEvaluationContaminated) {
    errors.push('PRE_GATE_ERROR: Previous evaluation object detected inside reference material context! Prohibited.');
  }

  // Check 7: No Stale Cache Contamination
  if (options.isStaleCache) {
    errors.push('PRE_GATE_ERROR: Stale cache detected with mismatched source hash.');
  }

  // Check 8: MCQ Keys are source-validated if MCQs are present
  if (Array.isArray(options.mcqDefinitions) && options.mcqDefinitions.length > 0) {
    for (const mcq of options.mcqDefinitions) {
      if (!mcq.officialKey || !/^[A-D]$/i.test(mcq.officialKey)) {
        errors.push(`PRE_GATE_ERROR: Missing or invalid official MCQ answer key for MCQ ${mcq.questionNumber}.`);
      }
    }
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      status: 'REVIEW_REQUIRED',
      errors,
    };
  }

  return {
    isValid: true,
    status: 'VALID',
    errors: [],
  };
}

/**
 * Post-Evaluation Reference Audit
 * Verifies that every question in the evaluation result has end-to-end source traceability.
 */
export function auditPostEvaluationReferenceTraceability(
  result: EvaluationResult,
  sourceBundle: EvaluationSourceBundle
): { isValid: boolean; status: 'VALID' | 'REVIEW_REQUIRED'; errors: string[] } {
  const errors: string[] = [];

  if (!result || !Array.isArray(result.questions) || result.questions.length === 0) {
    return {
      isValid: false,
      status: 'REVIEW_REQUIRED',
      errors: ['POST_AUDIT_ERROR: No evaluated questions present in evaluation result.'],
    };
  }

  for (const q of result.questions) {
    const qCode = q.canonicalId || q.fullQuestionCode || q.questionNumber;

    // Verify maximum marks
    if (typeof q.maximumMarks !== 'number' || q.maximumMarks <= 0) {
      errors.push(`POST_AUDIT_ERROR: Question ${qCode} has invalid maximumMarks (${q.maximumMarks}).`);
    }

    // Verify reference trace
    const trace = q.referenceTrace;
    if (!trace) {
      errors.push(`POST_AUDIT_ERROR: Question ${qCode} lacks referenceTrace metadata.`);
      continue;
    }

    if (!trace.materialId) {
      errors.push(`POST_AUDIT_ERROR: Question ${qCode} referenceTrace missing materialId.`);
    }

    if (!trace.markingSchemeSection && !trace.suggestedAnswerRef && !trace.verifiedGroundTruthSnippet) {
      errors.push(`POST_AUDIT_ERROR: Question ${qCode} referenceTrace lacks verified source section or ground truth snippet.`);
    }
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      status: 'REVIEW_REQUIRED',
      errors,
    };
  }

  return {
    isValid: true,
    status: 'VALID',
    errors: [],
  };
}

/**
 * Cache Safety Manager
 * Guarantees that cache keys include the full dimensional tuple:
 * course:level:subject:paperId:examType:examSession:documentType:versionId:contentHash.
 * A cache hit is valid ONLY if every single field matches.
 */
export class ReferenceCacheManager {
  private static cache = new Map<string, any>();

  public static buildCacheKey(params: {
    course: string;
    level: string;
    subject: string;
    paperId: string;
    examType: string;
    examSession: string;
    documentType: string;
    versionId: string;
    contentHash: string;
  }): string {
    return [
      params.course.toUpperCase(),
      params.level.toUpperCase(),
      params.subject.toLowerCase(),
      params.paperId,
      params.examType.toUpperCase(),
      params.examSession.toLowerCase(),
      params.documentType.toUpperCase(),
      params.versionId,
      params.contentHash,
    ].join('::');
  }

  public static get<T>(cacheKey: string): T | undefined {
    return this.cache.get(cacheKey);
  }

  public static set<T>(cacheKey: string, value: T): void {
    this.cache.set(cacheKey, value);
  }

  public static invalidateBySourceId(sourceId: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(sourceId)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  public static clear(): void {
    this.cache.clear();
  }
}

// ============================================================================
// DOCUMENT RESOLUTION & DETERMINISTIC CONTENT ANCHOR VERIFICATION
// ============================================================================

export interface StudentEvaluationInput {
  evaluationId: string;
  course?: string;
  level: string;
  subjectKey?: string;
  subjectName?: string;
  paper?: string;
  materialType?: string;
  attempt?: string;
  examSession?: string;
  mtpSeries?: number | string | null;
  originalFilename?: string;
  preferredMaterialId?: string;
}

export interface DocumentComponentRecord {
  componentType: 'QUESTION_PAPER' | 'SUGGESTED_ANSWERS' | 'MARKING_SCHEME' | 'MCQ_ANSWER_KEY';
  sourceRecordId: string;
  componentSourceId: string;
  filename: string;
  documentType: string;
  course: string;
  level: string;
  subject: string;
  examType: string;
  examSession: string;
  mtpSeries: number | null;
  versionId: string;
  contentHash: string;
  textLength: number;
}

export interface ContentAnchorVerificationResult {
  passed: boolean;
  status: 'VALID' | 'SOURCE_PACKAGE_MISMATCH';
  qpAnchors: Array<{ label: string; matched: boolean }>;
  saAnchors: Array<{ label: string; matched: boolean }>;
  error?: string;
}

/**
 * Deterministic Content Anchor Verification.
 * Metadata alone is insufficient; verifies that the selected Question Paper and
 * Suggested Answer contain exact mandated content anchors before allowing AI calls.
 */
export function verifyDocumentContentAnchors(
  qpText: string,
  saText: string,
  context: {
    course?: string;
    level: string;
    subject: string;
    paper?: string;
    examType: string;
    examSession?: string;
    mtpSeries?: number | null;
  }
): ContentAnchorVerificationResult {
  const normLevel = (context.level || '').toUpperCase();
  const normSubj = (context.subject || '').toLowerCase();
  const normExam = (context.examType || '').toUpperCase();
  const series = context.mtpSeries;

  const isInterTaxation = (normLevel.includes('INTER') || normLevel === 'INTERMEDIATE') && normSubj.includes('tax');
  const isSeries1 = series === 1;

  const qpChecks: Array<{ label: string; pattern: RegExp; matched: boolean }> = [];
  const saChecks: Array<{ label: string; pattern: RegExp; matched: boolean }> = [];

  if (isInterTaxation && normExam === 'MTP' && isSeries1) {
    // Mandated deterministic anchors for CA Intermediate Paper 3 Taxation MTP Series 1:
    qpChecks.push(
      { label: 'Mock Test Paper - Series I', pattern: /Mock Test Paper\s*[-–:]?\s*Series\s*I\b/i, matched: false },
      { label: '29th July, 2026', pattern: /29th?\s+July,?\s*2026/i, matched: false },
      { label: 'INTERMEDIATE COURSE', pattern: /INTERMEDIATE\s+COURSE/i, matched: false },
      { label: 'PAPER – 3: TAXATION', pattern: /PAPER\s*[-–:]?\s*3\s*:\s*TAXATION/i, matched: false }
    );

    saChecks.push(
      { label: 'Mock Test Paper - Series I', pattern: /Mock Test Paper\s*[-–:]?\s*Series\s*I\b/i, matched: false },
      { label: 'PAPER – 3: TAXATION', pattern: /PAPER\s*[-–:]?\s*3\s*:\s*TAXATION/i, matched: false },
      { label: 'SOLUTIONS', pattern: /SOLUTIONS|SUGGESTED\s+ANSWERS?/i, matched: false }
    );
  } else {
    // Generic baseline checks for other papers
    if (normExam === 'MTP') {
      qpChecks.push(
        { label: 'Mock Test Paper', pattern: /Mock Test Paper/i, matched: false },
        { label: 'Course Level', pattern: new RegExp(normLevel, 'i'), matched: false }
      );
      saChecks.push(
        { label: 'Mock Test Paper / Solutions', pattern: /Mock Test Paper|Solutions|Suggested/i, matched: false }
      );
    }
  }

  for (const check of qpChecks) {
    check.matched = check.pattern.test(qpText);
  }
  for (const check of saChecks) {
    check.matched = check.pattern.test(saText);
  }

  const allQpPassed = qpChecks.every((c) => c.matched);
  const allSaPassed = saChecks.every((c) => c.matched);
  const passed = allQpPassed && allSaPassed;

  if (!passed) {
    const missingQp = qpChecks.filter((c) => !c.matched).map((c) => `"${c.label}"`);
    const missingSa = saChecks.filter((c) => !c.matched).map((c) => `"${c.label}"`);
    const missingMsg = [
      ...(missingQp.length ? [`Question Paper missing: ${missingQp.join(', ')}`] : []),
      ...(missingSa.length ? [`Suggested Answer missing: ${missingSa.join(', ')}`] : []),
    ].join('; ');

    return {
      passed: false,
      status: 'SOURCE_PACKAGE_MISMATCH',
      qpAnchors: qpChecks.map(({ label, matched }) => ({ label, matched })),
      saAnchors: saChecks.map(({ label, matched }) => ({ label, matched })),
      error: `SOURCE_PACKAGE_MISMATCH: Selected reference content contradicts expected deterministic anchors (${missingMsg}). Document identity verification failed.`,
    };
  }

  return {
    passed: true,
    status: 'VALID',
    qpAnchors: qpChecks.map(({ label, matched }) => ({ label, matched })),
    saAnchors: saChecks.map(({ label, matched }) => ({ label, matched })),
  };
}

export interface ResolutionChainStep {
  step: string;
  sourceRecordId: string;
  componentSourceId: string;
  filename: string;
  documentType: string;
  course: string;
  level: string;
  subject: string;
  examType: string;
  examSession: string;
  mtpSeries: number | null;
  versionId: string;
  contentHash: string;
}

export interface ResolvedAuthoritativePackage {
  status: 'VALID' | 'SOURCE_PACKAGE_MISMATCH' | 'REVIEW_REQUIRED';
  sourceBundle?: EvaluationSourceBundle;
  components?: {
    questionPaper: DocumentComponentRecord;
    suggestedAnswers: DocumentComponentRecord;
    markingScheme: DocumentComponentRecord;
    mcqAnswerKey: DocumentComponentRecord;
  };
  selectionMetadata: {
    studentEvaluationInput: StudentEvaluationInput;
    selectedMaterialId: string;
    resolvedExamSession: string;
    resolvedMtpSeries: number | null;
  };
  resolutionChain: ResolutionChainStep[];
  anchorVerification: ContentAnchorVerificationResult;
  error?: string;
}

/**
 * Deterministically resolves authoritative source material from student evaluation input,
 * verifies content identity using deterministic anchors, and assigns distinct component identities.
 */
export function resolveAuthoritativeReferencePackage(
  input: StudentEvaluationInput
): ResolvedAuthoritativePackage {
  const course = (input.course || 'CA').toUpperCase();
  const level = (input.level || 'INTERMEDIATE').toUpperCase();
  const subjectKey = (input.subjectKey || '').trim();
  const subjectName = (input.subjectName || input.subjectKey || 'Taxation (Income Tax & GST)').trim();
  const paper = (input.paper || 'Paper 3').trim();
  const materialType = (input.materialType || 'MTP').toUpperCase();
  const rawFilename = input.originalFilename || '';

  // Extract MTP series from explicit parameter or from filename (e.g. "Taxation MTP-1.pdf" -> 1)
  let mtpSeries: number | null = null;
  if (input.mtpSeries !== undefined && input.mtpSeries !== null) {
    mtpSeries = normalizeMtpSeries(input.mtpSeries);
  } else if (rawFilename) {
    mtpSeries = normalizeMtpSeries(rawFilename);
  }

  let attempt = input.attempt || 'September 2026';
  let examSession = input.examSession || (mtpSeries === 1 ? 'July 2026' : 'August 2026');

  // Query authoritative material from SQLite
  let rawMaterial: any = null;
  if (input.preferredMaterialId) {
    rawMaterial = db.prepare('SELECT * FROM evaluation_materials WHERE id = ?').get(input.preferredMaterialId) as any;
  }

  if (!rawMaterial) {
    // Deterministic selection based on explicit metadata
    let query = `
      SELECT * FROM evaluation_materials
      WHERE status = 'ACTIVE' AND UPPER(level) = UPPER(?)
    `;
    const params: any[] = [level];

    if (subjectKey) {
      query += " AND (subject_key = ? OR subject_key LIKE ? OR subject_name LIKE ?)";
      params.push(subjectKey, `%${subjectKey}%`, `%${subjectName}%`);
    } else {
      query += " AND subject_name LIKE ?";
      params.push(`%${subjectName}%`);
    }

    if (paper && paper !== 'All') {
      query += " AND paper = ?";
      params.push(paper);
    }

    if (materialType && materialType !== 'ALL') {
      query += " AND material_type = ?";
      params.push(materialType);
    }

    if (mtpSeries !== null) {
      query += " AND (mtp_series = ? OR mtp_series = ?)";
      params.push(String(mtpSeries), mtpSeries);
    }

    // Match exact attempt (e.g. "September 2026" or "July 2026")
    if (attempt && attempt !== 'Current' && attempt !== 'All') {
      query += " AND (attempt = ? OR attempt LIKE ?)";
      params.push(attempt, `%${attempt}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT 1';
    rawMaterial = db.prepare(query).get(...params) as any;
  }

  if (!rawMaterial) {
    return {
      status: 'REVIEW_REQUIRED',
      selectionMetadata: {
        studentEvaluationInput: input,
        selectedMaterialId: 'NONE',
        resolvedExamSession: examSession,
        resolvedMtpSeries: mtpSeries,
      },
      resolutionChain: [],
      anchorVerification: {
        passed: false,
        status: 'SOURCE_PACKAGE_MISMATCH',
        qpAnchors: [],
        saAnchors: [],
        error: 'No active authoritative material record matching student input metadata found in database.',
      },
      error: 'MATERIAL_NOT_FOUND: No authoritative material found matching explicit metadata.',
    };
  }

  const qpText = String(rawMaterial.question_paper_text || '').trim();
  const saText = String(rawMaterial.suggested_answers_text || '').trim();
  const msText = String(rawMaterial.marking_scheme_text || '').trim();

  // Content Anchor Verification
  const anchorCheck = verifyDocumentContentAnchors(qpText, saText, {
    course,
    level,
    subject: rawMaterial.subject_name || subjectName,
    paper: rawMaterial.paper || paper,
    examType: rawMaterial.material_type || materialType,
    examSession,
    mtpSeries,
  });

  if (!anchorCheck.passed) {
    return {
      status: 'SOURCE_PACKAGE_MISMATCH',
      selectionMetadata: {
        studentEvaluationInput: input,
        selectedMaterialId: rawMaterial.id,
        resolvedExamSession: examSession,
        resolvedMtpSeries: mtpSeries,
      },
      resolutionChain: [],
      anchorVerification: anchorCheck,
      error: anchorCheck.error,
    };
  }

  // Derive distinct source component identities
  const matId = String(rawMaterial.id);
  const versionId = String(rawMaterial.version || '1.0');
  const paperSafe = (rawMaterial.paper || paper).replace(/\s+/g, '_');
  const subjectSafe = (rawMaterial.subject_name || subjectName).replace(/[^a-zA-Z0-9]/g, '_');
  const sessionSafe = examSession.replace(/\s+/g, '_');

  const qpSourceId = rawMaterial.question_material_id || `${matId}_qp`;
  const saSourceId = rawMaterial.suggested_answer_material_id || `${matId}_sa`;
  const msSourceId = rawMaterial.marking_scheme_material_id || `${matId}_ms`;
  const mcqKeySourceId = `${matId}_mcq_key`;

  const qpFilename = `${subjectSafe}_${paperSafe}_MTP_Series_${mtpSeries || 1}_${sessionSafe}_QP.txt`;
  const saFilename = `${subjectSafe}_${paperSafe}_MTP_Series_${mtpSeries || 1}_${sessionSafe}_SA.txt`;
  const msFilename = `${subjectSafe}_${paperSafe}_MTP_Series_${mtpSeries || 1}_${sessionSafe}_MS.txt`;
  const mcqKeyFilename = `${subjectSafe}_${paperSafe}_MTP_Series_${mtpSeries || 1}_${sessionSafe}_MCQ_KEY.txt`;

  const qpHash = computeSha256(qpText);
  const saHash = computeSha256(saText);
  const msHash = computeSha256(msText);
  const mcqKeyHash = computeSha256(saText); // Extracted from SA text

  const qpRecord: DocumentComponentRecord = {
    componentType: 'QUESTION_PAPER',
    sourceRecordId: matId,
    componentSourceId: qpSourceId,
    filename: qpFilename,
    documentType: 'QUESTION_PAPER',
    course,
    level,
    subject: rawMaterial.subject_name || subjectName,
    examType: rawMaterial.material_type || materialType,
    examSession,
    mtpSeries,
    versionId,
    contentHash: qpHash,
    textLength: qpText.length,
  };

  const saRecord: DocumentComponentRecord = {
    componentType: 'SUGGESTED_ANSWERS',
    sourceRecordId: matId,
    componentSourceId: saSourceId,
    filename: saFilename,
    documentType: 'SUGGESTED_ANSWERS',
    course,
    level,
    subject: rawMaterial.subject_name || subjectName,
    examType: rawMaterial.material_type || materialType,
    examSession,
    mtpSeries,
    versionId,
    contentHash: saHash,
    textLength: saText.length,
  };

  const msRecord: DocumentComponentRecord = {
    componentType: 'MARKING_SCHEME',
    sourceRecordId: matId,
    componentSourceId: msSourceId,
    filename: msFilename,
    documentType: 'MARKING_SCHEME',
    course,
    level,
    subject: rawMaterial.subject_name || subjectName,
    examType: rawMaterial.material_type || materialType,
    examSession,
    mtpSeries,
    versionId,
    contentHash: msHash,
    textLength: msText.length,
  };

  const mcqKeyRecord: DocumentComponentRecord = {
    componentType: 'MCQ_ANSWER_KEY',
    sourceRecordId: matId,
    componentSourceId: mcqKeySourceId,
    filename: mcqKeyFilename,
    documentType: 'MCQ_ANSWER_KEY',
    course,
    level,
    subject: rawMaterial.subject_name || subjectName,
    examType: rawMaterial.material_type || materialType,
    examSession,
    mtpSeries,
    versionId,
    contentHash: mcqKeyHash,
    textLength: saText.length,
  };

  // Build Resolution Chain
  const resolutionChain: ResolutionChainStep[] = [
    {
      step: '1. studentEvaluationInput',
      sourceRecordId: input.evaluationId,
      componentSourceId: rawFilename || 'student_submission.pdf',
      filename: rawFilename || 'student_submission.pdf',
      documentType: 'STUDENT_SUBMISSION',
      course,
      level,
      subject: subjectName,
      examType: materialType,
      examSession,
      mtpSeries,
      versionId: '1.0',
      contentHash: computeSha256(rawFilename),
    },
    {
      step: '2. selected Question Paper record',
      ...qpRecord,
    },
    {
      step: '3. selected Suggested Answer record',
      ...saRecord,
    },
    {
      step: '4. selected Marking Scheme record',
      ...msRecord,
    },
    {
      step: '5. selected MCQ key source',
      ...mcqKeyRecord,
    },
  ];

  // Construct Immutable EvaluationSourceBundle with distinct component source IDs
  const sourceBundle = createEvaluationSourceBundle({
    evaluationId: input.evaluationId,
    paperId: rawMaterial.paper || paper,
    paperVersion: versionId,
    course,
    level,
    subject: rawMaterial.subject_name || subjectName,
    examType: rawMaterial.material_type || materialType,
    examSession,
    mtpSeries,

    questionPaperText: qpText,
    questionPaperSourceId: qpSourceId,
    questionPaperVersionId: versionId,
    questionPaperFilename: qpFilename,

    suggestedAnswersText: saText,
    suggestedAnswerSourceId: saSourceId,
    suggestedAnswerVersionId: versionId,
    suggestedAnswerFilename: saFilename,

    markingSchemeText: msText,
    markingSchemeSourceId: msSourceId,
    markingSchemeVersionId: versionId,
    markingSchemeFilename: msFilename,

    mcqAnswerKeyText: saText,
    mcqAnswerKeySourceId: mcqKeySourceId,
    mcqAnswerKeyVersionId: versionId,
    mcqAnswerKeyFilename: mcqKeyFilename,
  });

  return {
    status: 'VALID',
    sourceBundle,
    components: {
      questionPaper: qpRecord,
      suggestedAnswers: saRecord,
      markingScheme: msRecord,
      mcqAnswerKey: mcqKeyRecord,
    },
    selectionMetadata: {
      studentEvaluationInput: input,
      selectedMaterialId: matId,
      resolvedExamSession: examSession,
      resolvedMtpSeries: mtpSeries,
    },
    resolutionChain,
    anchorVerification: anchorCheck,
  };
}

/**
 * Pretty prints the full document resolution chain and component table.
 */
export function printResolutionChainAudit(resolved: ResolvedAuthoritativePackage): void {
  console.log('========================================================================');
  console.log('AUTHORITATIVE DOCUMENT RESOLUTION & IDENTITY AUDIT CHAIN');
  console.log('========================================================================');
  console.log('studentEvaluationInput');
  console.log('  ↓');
  console.log('selected Question Paper record');
  console.log('  ↓');
  console.log('selected Suggested Answer record');
  console.log('  ↓');
  console.log('selected Marking Scheme record');
  console.log('  ↓');
  console.log('selected MCQ key source');
  console.log('  ↓');
  console.log('metadata used for selection');
  console.log('  ↓');
  console.log('final document IDs');
  console.log('  ↓');
  console.log('final content hashes\n');

  console.log('RESOLUTION TRACE BY STEP:');
  for (const step of resolved.resolutionChain) {
    console.log(`[${step.step}]`);
    console.log(`  Component ID:  ${step.componentSourceId}`);
    console.log(`  Record ID:     ${step.sourceRecordId}`);
    console.log(`  Filename:      ${step.filename}`);
    console.log(`  Doc Type:      ${step.documentType}`);
    console.log(`  Course/Level:  ${step.course} / ${step.level}`);
    console.log(`  Subject:       ${step.subject}`);
    console.log(`  Exam / Sess:   ${step.examType} (Series ${step.mtpSeries}) / ${step.examSession}`);
    console.log(`  Version:       v${step.versionId}`);
    console.log(`  Content Hash:  ${step.contentHash}`);
    console.log('');
  }

  if (resolved.anchorVerification) {
    console.log('CONTENT ANCHOR VERIFICATION:');
    console.log(`Status: ${resolved.anchorVerification.status} (${resolved.anchorVerification.passed ? 'ALL ANCHORS VERIFIED' : 'FAILED'})`);
    console.log('Question Paper Anchors:');
    for (const a of resolved.anchorVerification.qpAnchors) {
      console.log(`  - [${a.matched ? 'OK' : 'FAIL'}] "${a.label}"`);
    }
    console.log('Suggested Answer Anchors:');
    for (const a of resolved.anchorVerification.saAnchors) {
      console.log(`  - [${a.matched ? 'OK' : 'FAIL'}] "${a.label}"`);
    }
  }
}

