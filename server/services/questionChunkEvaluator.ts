import { PDFDocument } from 'pdf-lib';
import crypto from 'crypto';
import { executeModelWithFallback } from '../models/modelRegistry.js';
import { QuestionEvaluation, MarkingComponent } from '../../src/types/index.js';
import { parseCanonicalQuestionIdentity } from './canonicalQuestionService.js';
import { PaperStructureSubQuestion } from './paperStructureService.js';
import { AttemptedQuestionMapping } from './answerSheetCoverageService.js';
import { lockQuestionReference, QuestionReferenceLockMetadata, LockedQuestionReference } from './questionReferenceLock.js';
import { extractSourceGroundedTransformations } from './sourceGroundedTransformationService.js';

export interface ChunkEvaluationContext {
  subQuestion: PaperStructureSubQuestion;
  mapping: AttemptedQuestionMapping;
  fullPdfBuffer: Buffer;
  questionPaperText: string;
  suggestedAnswersText: string;
  markingSchemeText: string;
  checkingMode: 'standard' | 'strict' | 'lenient';
  level: string;
  subjectName: string;
  subjectKey?: string;
  /** Exact immutable source metadata for question-wise reference locking. */
  referenceMetadata?: QuestionReferenceLockMetadata;
  /** Issues identified by the supervisor; when present, the model must re-check this question. */
  supervisorIssues?: string[];
  supervisorCorrectionAttempt?: number;
}

export interface ExtractedReferenceSnippets {
  qpSnippet: string;
  saSnippet: string;
  msSnippet: string;
  retrievedCharacterCount: number;
  contentHash: string;
  foundInMaterial: boolean;
  markingSchemeSection: string;
  suggestedAnswerSection: string;
  verifiedTruthSnippet: string;
  questionPaperFound: boolean;
  suggestedAnswerFound: boolean;
  markingSchemeFound: boolean;
  referenceNeedsReview: boolean;
  referenceTrace: LockedQuestionReference['referenceTrace'];
}

/**
 * Extracts relevant reference material for a specific sub-question.
 * Uses the authoritative lockQuestionReference to ensure exact question-level synchronization.
 */
export function extractRelevantReferenceSnippets(
  fullQuestionCode: string, // e.g. 'Q5(a)', 'Q5(b)', 'Q1'
  qpText: string,
  saText: string,
  msText: string,
  metadata?: QuestionReferenceLockMetadata
): ExtractedReferenceSnippets {
  const lockedRef = lockQuestionReference(fullQuestionCode, qpText, saText, msText, metadata);
  const qp = lockedRef.questionPaperSlice;
  const sa = lockedRef.suggestedAnswerSlice;
  const ms = lockedRef.markingSchemeSlice;

  const combinedRef = `${qp.snippet}\n${sa.snippet}\n${ms.snippet}`.trim();
  const contentHash = crypto.createHash('sha256').update(combinedRef).digest('hex');
  const retrievedCharacterCount = combinedRef.length;
  const verifiedTruthSnippet = (sa.snippet || qp.snippet || ms.snippet).slice(0, 500);

  return {
    qpSnippet: qp.snippet,
    saSnippet: sa.snippet,
    msSnippet: ms.snippet,
    retrievedCharacterCount,
    contentHash,
    foundInMaterial: lockedRef.isFullyLocked || qp.found || sa.found || ms.found,
    markingSchemeSection: ms.sectionHeader,
    suggestedAnswerSection: sa.sectionHeader,
    verifiedTruthSnippet,
    questionPaperFound: qp.found,
    suggestedAnswerFound: sa.found,
    markingSchemeFound: ms.found,
    referenceNeedsReview: lockedRef.needsReview,
    referenceTrace: lockedRef.referenceTrace,
  };
}


export interface QuestionReferenceTopicAlignment {
  aligned: boolean;
  reason?: string;
  sharedTopicTerms: string[];
  /** A derived Marking Scheme block may be excluded without rejecting a valid QP/SA pair. */
  misalignedSources?: Array<'SUGGESTED_ANSWER' | 'MARKING_SCHEME'>;
}

/**
 * Detects cross-wired question references using each source independently.
 * The Suggested Answer is the substantive authority. A mismatched Suggested
 * Answer blocks scoring; a mismatched supplemental Marking Scheme is excluded
 * and the evaluator proceeds from the verified QP + SA instead of importing
 * unrelated sibling-question law or criteria.
 */
export function assessQuestionReferenceTopicAlignment(
  question: Pick<PaperStructureSubQuestion, 'topic' | 'provision' | 'questionText'>,
  suggestedAnswerSnippet: string,
  markingSchemeSnippet = '',
): QuestionReferenceTopicAlignment {
  const questionSource = [
    question.topic || '',
    question.provision || '',
    question.questionText || '',
  ].filter(Boolean).join(' ').slice(0, 6000);
  if (!questionSource.trim()) {
    return { aligned: true, sharedTopicTerms: [] };
  }

  const stopWords = new Set([
    'about', 'above', 'after', 'against', 'also', 'among', 'another', 'answer',
    'apply', 'application', 'appropriate', 'asked', 'based', 'before', 'being',
    'below', 'between', 'both', 'case', 'cases', 'certain', 'company', 'companies',
    'conclusion', 'consider', 'considered', 'correct', 'determine', 'discuss',
    'given', 'here', 'however', 'including', 'india', 'indian', 'whether',
    'explain', 'following', 'from', 'having', 'under', 'using', 'where', 'which',
    'while', 'within', 'would', 'should', 'could', 'shall', 'must', 'may',
    'section', 'sections', 'subsection', 'subsections', 'rule', 'rules', 'act',
    'clause', 'clauses', 'chapter', 'schedule', 'article', 'articles',
    'provision', 'provisions', 'statutory', 'liable', 'liability', 'person',
    'persons', 'part', 'parts', 'question', 'questions', 'marks', 'mark',
    'limited', 'private', 'public', 'reference', 'suggested', 'director',
    'directors', 'thereof', 'therein', 'provide', 'provided', 'required',
    'requirement', 'requirements', 'according', 'accordance', 'candidate',
    'step', 'award', 'awarded', 'deduct', 'deduction', 'marksavailable',
    'marksawarded', 'accurately', 'correctly', 'relevant', 'applicable',
    // Generic company-record context can appear in unrelated Companies Act
    // questions (e.g. turnover is stated in financial statements); it is not
    // sufficient evidence that two legal topics are the same.
    'financial', 'statements', 'audited', 'meeting', 'annual', 'registrar',
    'filing', 'filed', 'adopted', 'adjourned', 'documents',
  ]);
  const terms = (value: string) => new Set(
    String(value || '')
      .toLowerCase()
      .replace(/\b(?:section|sec\.?|rule|schedule|article)\s+[0-9ivx]+[a-z]?(?:\s*\([0-9a-z]+\))*/gi, ' ')
      .replace(/\b\d+(?:[.,]\d+)*(?:%|crore|lakh|rupees?|rs\.?|₹|usd|\$)?\b/gi, ' ')
      .match(/[a-z]{4,}/g)
      ?.filter((word) => !stopWords.has(word)) || [],
  );

  const questionTerms = terms(questionSource);
  if (questionTerms.size < 5) {
    return { aligned: true, sharedTopicTerms: [] };
  }

  const compare = (snippet: string, minimumReferenceTerms = 5) => {
    const referenceTerms = terms(snippet);
    if (referenceTerms.size < minimumReferenceTerms) {
      return { sufficientlySpecific: false, aligned: true, shared: [] as string[] };
    }
    const shared = [...questionTerms].filter((word) => referenceTerms.has(word));
    return {
      sufficientlySpecific: true,
      // With generic legal language excluded above, even one distinctive
      // shared topic term is enough to avoid blocking a valid alternate wording.
      // Treat a source as mismatched only when no meaningful topic overlap exists.
      aligned: shared.length > 0,
      shared,
    };
  };

  const suggested = compare(suggestedAnswerSnippet);
  if (suggested.sufficientlySpecific && !suggested.aligned) {
    return {
      aligned: false,
      sharedTopicTerms: [],
      misalignedSources: ['SUGGESTED_ANSWER'],
      reason: 'The selected Suggested Answer block has too little distinctive topic overlap with this exact Question Paper question. The answer reference may be cross-wired to another question; no academic zero may be assigned.',
    };
  }

  // Derived Marking Scheme anchors are often short excerpts. Three distinctive
  // terms are enough to detect a sibling-question anchor when the QP/SA pair
  // is already verified, while generic two-word boilerplate remains inconclusive.
  const markingScheme = compare(markingSchemeSnippet, 3);
  if (markingScheme.sufficientlySpecific && !markingScheme.aligned) {
    return {
      aligned: true,
      sharedTopicTerms: suggested.shared,
      misalignedSources: ['MARKING_SCHEME'],
      reason: 'The extracted Marking Scheme block has too little distinctive topic overlap with the exact question and Suggested Answer. Exclude this block; score only from the verified Question Paper and Suggested Answer, using the authoritative question maximum.',
    };
  }

  return {
    aligned: true,
    sharedTopicTerms: [...new Set([...suggested.shared, ...markingScheme.shared])],
  };
}

/**
 * When a generated examiner-style scheme has a topic-mismatched source anchor,
 * retain its derived step allocations but remove the unrelated answer text.
 * This preserves the selected sub-question's mark split without importing law
 * or facts from a neighbouring question. Unknown/non-derived formats fail closed.
 */
export function removeMismatchedDerivedSourceAnchor(markingSchemeSnippet: string): string {
  const source = String(markingSchemeSnippet || '');
  const anchorMatch = /^\s*SOURCE-DERIVED CONTENT ANCHOR\s*:/im.exec(source);
  const allocationMatch = /^\s*DERIVED EXAMINER-STYLE ALLOCATION\s*:/im.exec(source);
  if (!anchorMatch || !allocationMatch || allocationMatch.index <= anchorMatch.index) return '';

  const prefix = source.slice(0, anchorMatch.index).trimEnd();
  const allocationSource = source.slice(allocationMatch.index);
  const stepHeaders = [...allocationSource.matchAll(/^\s*STEP\s*(\d+)\s*:/gim)];
  if (!stepHeaders.length) return '';

  // Keep only verified numeric component weights. Requirement/Award/Do Not
  // Award prose may itself have been generated from the wrong sibling anchor,
  // so it must never survive a topic-mismatch exclusion.
  const weights: Array<{ step: number; marks: string }> = [];
  for (let index = 0; index < stepHeaders.length; index += 1) {
    const header = stepHeaders[index];
    const blockStart = header.index ?? 0;
    const blockEnd = stepHeaders[index + 1]?.index ?? allocationSource.length;
    const block = allocationSource.slice(blockStart, blockEnd);
    const marksMatch = block.match(/^\s*Marks\s*:\s*(\d+(?:\.\d+)?)\b/im)
      || block.match(/\bMarks\s*:\s*(\d+(?:\.\d+)?)\b/i);
    if (!marksMatch) return '';
    weights.push({ step: Number(header[1]), marks: marksMatch[1] });
  }

  const declaredMaximum = prefix.match(/^\s*SUBQUESTION MARKS\s*:\s*(\d+(?:\.\d+)?)\s*$/im);
  const allocatedTotal = weights.reduce((sum, item) => sum + Number(item.marks), 0);
  if (declaredMaximum && Math.abs(allocatedTotal - Number(declaredMaximum[1])) > 0.001) {
    // A mismatched or incomplete allocation is not safe to carry forward.
    return [
      prefix,
      'SOURCE-DERIVED CONTENT ANCHOR: [EXCLUDED: topic mismatch with this exact question.]',
      'DERIVED EXAMINER-STYLE ALLOCATION: [EXCLUDED: component weights do not reconcile to the authoritative sub-question maximum.]',
    ].join('\n\n').trim();
  }

  const weightsOnly = [
    'DERIVED EXAMINER-STYLE ALLOCATION (WEIGHTS ONLY; SOURCE-SPECIFIC CRITERIA EXCLUDED):',
    ...weights.map((item) => 'STEP ' + item.step + ': Marks: ' + item.marks),
  ].join('\n');
  return [
    prefix,
    'SOURCE-DERIVED CONTENT ANCHOR: [EXCLUDED: topic mismatch with this exact question.]',
    weightsOnly,
  ].join('\n\n').trim();
}

export interface QuestionReferenceEvaluationDisposition {
  canScoreProvisionally: boolean;
  requiresHumanReview: boolean;
  reason?: string;
}

/**
 * A parsed authoritative paper structure can anchor a question when the exact
 * QP text-slice matcher misses a formatting variant, for PYQ, MTP, Model Test
 * and Faculty Mock alike. The exact Suggested Answer must still be locked and
 * the canonical leaf must carry a verified positive maximum-mark allocation.
 */
export function assessQuestionReferenceForEvaluation(
  reference: Pick<ExtractedReferenceSnippets, 'questionPaperFound' | 'suggestedAnswerFound' | 'referenceNeedsReview'> & {
    materialType?: string;
    authoritativeQuestionStructureVerified?: boolean;
  }
): QuestionReferenceEvaluationDisposition {
  if (!reference.suggestedAnswerFound || reference.referenceNeedsReview) {
    return {
      canScoreProvisionally: false,
      requiresHumanReview: true,
      reason: 'The authoritative Suggested Answer section could not be securely locked to this question.',
    };
  }

  const normalizedMaterialType = String(reference.materialType || '').trim().toUpperCase();
  const supportsAuthoritativeStructureAnchor = new Set([
    'PYQ',
    'MTP',
    'MODEL_TEST_PAPER',
    'FACULTY_MOCK_TEST',
  ]).has(normalizedMaterialType);
  const canUseAuthoritativeStructureAnchor =
    supportsAuthoritativeStructureAnchor &&
    reference.authoritativeQuestionStructureVerified === true;

  if (!reference.questionPaperFound && !canUseAuthoritativeStructureAnchor) {
    return {
      canScoreProvisionally: true,
      requiresHumanReview: true,
      reason: 'The exact Question Paper slice could not be matched and no verified canonical leaf identity with official maximum marks is available. This question needs manual mapping review.',
    };
  }

  return {
    canScoreProvisionally: true,
    requiresHumanReview: false,
  };
}


/**
 * Parse and validate a single-question model response before it can be scored.
 * Invalid or internally inconsistent output is rejected so the provider fallback
 * chain can try another model instead of silently converting it into an academic zero.
 */
export function parseAndValidateQuestionChunkOutput(
  rawText: string,
  maxMarks: number,
  _options: { materialType?: string } = {}
): Record<string, any> {
  let clean = String(rawText || '').trim();
  clean = clean.replace(/^`{3}(?:json)?[ \t\r\n]*/i, '').replace(/[ \t\r\n]*`{3}$/, '');

  let raw: any;
  try {
    raw = JSON.parse(clean);
  } catch {
    throw new Error('QUESTION_CHUNK_INVALID_JSON: model response could not be parsed as JSON.');
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('QUESTION_CHUNK_INVALID_SCHEMA: response must be a JSON object.');
  }
  if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
    throw new Error('QUESTION_CHUNK_INVALID_MAX_MARKS: authoritative maximum marks are missing.');
  }

  const normalizedStatus = typeof raw.status === 'string' ? raw.status.trim().toLowerCase() : '';
  const allowedStatuses = new Set(['correct', 'partially_correct', 'incorrect', 'unclear']);
  if (!allowedStatuses.has(normalizedStatus)) {
    throw new Error('QUESTION_CHUNK_INVALID_STATUS: expected correct, partially_correct, incorrect, or unclear.');
  }
  raw.status = normalizedStatus;

  const modelReportedQuestionTotal = raw.marksAwarded;

  const components = raw.markingComponents;
  if (!Array.isArray(components) || components.length === 0) {
    throw new Error('QUESTION_CHUNK_COMPONENTS_MISSING: a question-level score without step evidence is not accepted.');
  }

  const allowedTypes = new Set([
    'PROVISION', 'PRINCIPLE', 'CONDITION', 'APPLICATION', 'CALCULATION',
    'WORKING', 'TREATMENT', 'REASONING', 'CONCLUSION', 'PRESENTATION',
  ]);
  let availableTotal = 0;
  let awardedTotal = 0;

  for (let index = 0; index < components.length; index++) {
    const component = components[index];
    const prefix = `Component ${index + 1}`;
    if (!component || typeof component !== 'object' || Array.isArray(component)) {
      throw new Error(`QUESTION_CHUNK_INVALID_COMPONENT: ${prefix} must be an object.`);
    }
    if (typeof component.componentId !== 'string' || !component.componentId.trim()) {
      throw new Error(`QUESTION_CHUNK_INVALID_COMPONENT: ${prefix} is missing componentId.`);
    }

    const componentType = typeof component.componentType === 'string'
      ? component.componentType.trim().toUpperCase()
      : '';
    if (!allowedTypes.has(componentType)) {
      throw new Error(`QUESTION_CHUNK_INVALID_COMPONENT: ${prefix} has an unsupported componentType.`);
    }
    component.componentType = componentType;

    if (typeof component.expectedRequirement !== 'string' || !component.expectedRequirement.trim()) {
      throw new Error(`QUESTION_CHUNK_INVALID_COMPONENT: ${prefix} is missing the authoritative requirement.`);
    }
    if (typeof component.studentEvidence !== 'string' || !component.studentEvidence.trim()) {
      throw new Error(`QUESTION_CHUNK_INVALID_COMPONENT: ${prefix} is missing candidate evidence or an explicit omission statement.`);
    }

    // marksDeducted and assessment are redundant labels. The allocation and
    // awarded marks remain the scoring source; derive these labels so a casing
    // or stale duplicate field cannot reject an otherwise valid answer.
    const available = component.marksAvailable;
    const awarded = component.marksAwarded;
    if (
      typeof available !== 'number' || !Number.isFinite(available) ||
      typeof awarded !== 'number' || !Number.isFinite(awarded)
    ) {
      throw new Error(`QUESTION_CHUNK_INVALID_COMPONENT: ${prefix} has missing or non-numeric allocation/award marks.`);
    }
    if (available < 0 || awarded < 0 || awarded > available + 0.01) {
      throw new Error(`QUESTION_CHUNK_INVALID_COMPONENT: ${prefix} has marks outside its component limit.`);
    }
    // Clamp only a tiny floating-point overrun (<= 0.01); never repair a
    // substantive over-award beyond the official component maximum.
    component.marksAwarded = Math.min(available, awarded);
    const normalizedAwarded = component.marksAwarded as number;

    const reportedAssessment = typeof component.assessment === 'string'
      ? component.assessment.trim().toUpperCase()
      : '';
    const allowedAssessments = new Set(['CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT', 'OMITTED']);
    if (reportedAssessment && !allowedAssessments.has(reportedAssessment)) {
      throw new Error(`QUESTION_CHUNK_INVALID_COMPONENT: ${prefix} has an unsupported assessment.`);
    }

    // Preserve the evaluator's substantive assessment for the deterministic
    // Strict-mode pass. Previously, a full numeric award overwrote
    // PARTIALLY_CORRECT / INCORRECT with CORRECT, so Strict mode had no defect
    // signal left to scrutinize and could return full marks for every step.
    const normalizedAssessment = reportedAssessment || (
      normalizedAwarded <= 0
        ? 'INCORRECT'
        : normalizedAwarded >= available - 0.01
          ? 'CORRECT'
          : 'PARTIALLY_CORRECT'
    );
    if (
      (normalizedAssessment === 'CORRECT' && normalizedAwarded < available - 0.01) ||
      (normalizedAssessment === 'PARTIALLY_CORRECT' &&
        (normalizedAwarded <= 0.01 || normalizedAwarded >= available - 0.01)) ||
      ((normalizedAssessment === 'INCORRECT' || normalizedAssessment === 'OMITTED') && normalizedAwarded > 0.01)
    ) {
      throw new Error(
        `QUESTION_CHUNK_CONTRADICTORY_ASSESSMENT: ${prefix} reports ${normalizedAssessment} with ${normalizedAwarded}/${available} marks. Assessment and numeric award must agree.`
      );
    }
    component.assessment = normalizedAssessment;

    component.marksDeducted = Math.round(Math.max(0, available - normalizedAwarded) * 100) / 100;
    availableTotal += available;
    awardedTotal += normalizedAwarded;
  }

  if (Math.abs(availableTotal - maxMarks) > 0.05) {
    throw new Error(`QUESTION_CHUNK_ALLOCATION_MISMATCH: component allocations total ${availableTotal}, but the authoritative maximum is ${maxMarks}.`);
  }

  // Component awards are the auditable score source. A separately generated
  // question total is redundant and can drift even when every component is
  // individually valid. Reconcile to the components instead of discarding the
  // entire answer and burning the configured model fallback chain.
  const reconciledAwarded = Math.round(awardedTotal * 4) / 4;
  if (
    typeof modelReportedQuestionTotal !== 'number' ||
    !Number.isFinite(modelReportedQuestionTotal) ||
    modelReportedQuestionTotal < 0 ||
    modelReportedQuestionTotal > maxMarks + 0.05 ||
    Math.abs(awardedTotal - modelReportedQuestionTotal) > 0.26
  ) {
    raw.modelReportedMarksAwarded = modelReportedQuestionTotal ?? null;
    raw.scoreReconciliationNote =
      `Question total reconciled from ${String(modelReportedQuestionTotal ?? 'missing')} to ${reconciledAwarded} using the validated component awards.`;
  }
  raw.marksAwarded = Math.min(maxMarks, reconciledAwarded);
  raw.markingComponents = components;

  // The status label is not an independent scoring signal. Some models label
  // a response "incorrect" while still awarding valid step marks. Keep the
  // validated component marks and normalize the label from the reconciled score;
  // only an explicitly unclear answer remains provisional for human review.
  if (raw.status !== 'unclear') {
    raw.status = raw.marksAwarded >= maxMarks - 0.05
      ? 'correct'
      : raw.marksAwarded > 0.05
        ? 'partially_correct'
        : 'incorrect';
  }

  return raw;
}

/**
 * Evaluates a single attempted descriptive sub-question using targeted page images and reference material.
 */
export interface ChunkReferenceSourceInstructions {
  questionPaperHeading: string;
  suggestedAnswersHeading: string;
  markingSchemeHeading: string;
  isolationInstruction: string;
}

export type ChunkReferenceSourceIdentity = Pick<
  LockedQuestionReference['referenceTrace'],
  'sourceType' | 'materialType' | 'mtpSeries' | 'modelTestNumber' | 'facultyMockTestId'
>;

/**
 * Per-question grading is a separate AI call from the top-level evaluator.
 * Give it the same explicit MTP-vs-Model-Test source boundary as the main prompt.
 */
export function buildChunkReferenceSourceInstructions(
  source: ChunkReferenceSourceIdentity,
): ChunkReferenceSourceInstructions {
  const materialType = String(source.materialType || '').trim().toUpperCase();
  if (materialType === 'MODEL_TEST_PAPER') {
    const modelNumber = Number.isInteger(Number(source.modelTestNumber))
      && source.modelTestNumber !== undefined
      && source.modelTestNumber !== null
      ? Number(source.modelTestNumber)
      : 'UNSPECIFIED';
    return {
      questionPaperHeading: `VERIFIED MODEL TEST PAPER ${modelNumber} QUESTION PAPER EXTRACT`,
      suggestedAnswersHeading: `VERIFIED MODEL TEST PAPER ${modelNumber} SUGGESTED ANSWER EXTRACT`,
      markingSchemeHeading: `VERIFIED MODEL TEST PAPER ${modelNumber} MARKING SCHEME EXTRACT`,
      isolationInstruction: `This is Model Test Paper ${modelNumber}, not an MTP series. Use only this exact Model Test Paper's question, suggested answer and marking scheme. Never borrow an MTP Series 1/2 reference, a PYQ, or another Model Test Paper.`,
    };
  }

  if (materialType === 'MTP') {
    const series = source.mtpSeries === 1 || source.mtpSeries === 2
      ? source.mtpSeries
      : 'UNSPECIFIED';
    return {
      questionPaperHeading: `VERIFIED ICAI MTP SERIES ${series} QUESTION PAPER EXTRACT`,
      suggestedAnswersHeading: `VERIFIED ICAI MTP SERIES ${series} SUGGESTED ANSWER EXTRACT`,
      markingSchemeHeading: `VERIFIED ICAI MTP SERIES ${series} MARKING SCHEME EXTRACT`,
      isolationInstruction: `This is MTP Series ${series}, not a Model Test Paper number. Use only this exact MTP series' question, suggested answer and marking scheme. Never borrow another MTP series, a Model Test Paper, or a PYQ.`,
    };
  }

  if (source.sourceType === 'FACULTY_MOCK') {
    const facultyMockId = String(source.facultyMockTestId || '').trim() || 'EXACT_SELECTED_MOCK';
    return {
      questionPaperHeading: `VERIFIED FACULTY MOCK ${facultyMockId} QUESTION PAPER EXTRACT`,
      suggestedAnswersHeading: `VERIFIED FACULTY MOCK ${facultyMockId} PRIVATE TXT SUGGESTED ANSWER EXTRACT`,
      markingSchemeHeading: `VERIFIED FACULTY MOCK ${facultyMockId} PRIVATE TXT MARKING SCHEME EXTRACT`,
      isolationInstruction: `Use only the exact selected Faculty Mock with ID ${facultyMockId} and its private TXT reference. The Question Paper, Suggested Answers and Marking Scheme must all belong to this same mock. Never borrow a global ICAI PYQ/MTP answer, another faculty mock, or another mock number.`,
    };
  }

  if (materialType === 'PYQ') {
    return {
      questionPaperHeading: 'VERIFIED ICAI PAST YEAR QUESTION PAPER EXTRACT',
      suggestedAnswersHeading: 'VERIFIED ICAI PAST YEAR SUGGESTED ANSWER EXTRACT',
      markingSchemeHeading: 'VERIFIED ICAI PAST YEAR MARKING SCHEME EXTRACT',
      isolationInstruction: 'Use only the selected official ICAI Past Year Question Paper, Suggested Answers and Marking Scheme. Do not substitute an MTP or Model Test reference.',
    };
  }

  return {
    questionPaperHeading: 'VERIFIED QUESTION PAPER EXTRACT',
    suggestedAnswersHeading: 'VERIFIED SUGGESTED ANSWER EXTRACT',
    markingSchemeHeading: 'VERIFIED STEP-MARKING SCHEME EXTRACT',
    isolationInstruction: 'Use only the exact question, suggested answer and marking scheme extracts supplied below.',
  };
}

/**
 * PYQ checked copies and Faculty Mock answer sheets may already contain
 * examiner/faculty marks or annotations. They are evidence notes only, never
 * an input score. Apply the same independent scoring rule to both sources.
 */
export function buildCheckedCopyScoreIndependenceInstruction(materialType: unknown): string {
  const normalized = String(materialType || '').trim().toUpperCase();
  if (normalized !== 'PYQ' && normalized !== 'FACULTY_MOCK_TEST') return '';

  const examinerLabel = normalized === 'PYQ' ? 'ICAI examiner' : 'faculty/examiner';
  const sourceLabel = normalized === 'PYQ' ? 'selected official PYQ' : 'selected Faculty Mock';

  return `
CHECKED-COPY SCORE INDEPENDENCE:
- The uploaded answer sheet may contain ${examinerLabel} ticks, comments, red-ink annotations, per-question marks, a total score, or a previous evaluation.
- Treat every such score and annotation as non-binding evidence only. Never copy it, use it as the AI score, or lock any question/component to zero because of it.
- Independently assess the student's actual answer content against the exact ${sourceLabel} Question Paper, Suggested Answer and Marking Scheme supplied for this evaluation.
- Award independently creditworthy steps according to the selected checking mode. Standard, Strict and Moderate modes may legitimately produce different marks from previous examiner annotations.
- A zero may be awarded only under the normal academic zero-mark safety rules (or the applicable objective MCQ rule), never merely because an earlier examiner wrote zero.
`;
}

export function buildQuestionChunkSubPartCompletenessDirective(
  fullQuestionCode: string,
  maximumMarks: number,
): string {
  const canonicalCode = parseCanonicalQuestionIdentity(String(fullQuestionCode || '').trim()).canonicalId;
  return `SINGLE-SCOREABLE-PART IDENTITY AND MARKING-RUBRIC COMPLETENESS:
- This call evaluates exactly the authoritative scoreable part ${canonicalCode} for ${maximumMarks} marks.
- Roman-numbered children under this lettered part (for example ${canonicalCode}(i), ${canonicalCode}(ii), etc.) are sections of this SAME question. Read and assess every such child together; do not create separate question tasks or separate maximum-mark allocations for them.
- Keep other lettered sibling parts (for example Q2(b) when this is Q2(a)) separate. Do not merge this question with its parent container or a different canonical question.
- Read the complete locked Question Paper / Suggested Answer / Marking Scheme slice for this leaf,
  including continuation lines, tables, working notes and every separately mark-bearing criterion.
- Represent each distinct, independently mark-bearing source criterion exactly once as a
  markingComponents entry. Do not collapse multiple explicit rubric steps into one vague generic
  component such as "application" or "working" when the source marks them separately.
- Preserve the source's own component allocations. The sum of marksAvailable must equal the
  authoritative ${maximumMarks} marks because the source allocates that amount, not because you
  invented, scaled or redistributed component weights to force a total.
- If a source-marked criterion is visibly not attempted, include it as OMITTED with zero awarded
  marks and explicit evidence that no corresponding work appears in the supplied answer pages.
  Do not call a criterion omitted merely because handwriting is difficult to read; unreadable
  evidence requires UNCLEAR/review, not an assumed omission.
- Before returning, compare every independently mark-bearing requirement in the locked marking
  references with the component list: no source criterion may be silently skipped or duplicated.
- If the reference does not provide enough information to reconcile source-grounded component
  allocations to the authoritative maximum, do not fabricate a balancing step; return UNCLEAR
  so the question can be reviewed.`;
}

/**
 * Page-level uncertainty is an aggregate scan signal, not proof that this
 * particular mapped answer is unreadable. The question evaluator gets the
 * original page image and must make its own assessment unless the page reader
 * explicitly classified this answer block as unreadable.
 */
export function requiresAnswerLevelReadabilityReview(
  mapping: Pick<AttemptedQuestionMapping, 'status' | 'readabilityStatusExplicit'>,
): boolean {
  return mapping.status === 'ATTEMPTED_UNCLEAR' && mapping.readabilityStatusExplicit === true;
}

export async function evaluateQuestionChunk(
  ctx: ChunkEvaluationContext
): Promise<QuestionEvaluation> {
  const { subQuestion, mapping, fullPdfBuffer, checkingMode, level, subjectName, subjectKey } = ctx;
  const maxMarks = subQuestion.maximumMarks; // IMMUTABLE
  const qNum = subQuestion.questionNumber;
  const subQ = subQuestion.subQuestionNumber;
  const fullCode = subQuestion.fullQuestionCode;

  // 1. Slice specific pages from PDF
  const origDoc = await PDFDocument.load(fullPdfBuffer, { ignoreEncryption: true });
  const chunkDoc = await PDFDocument.create();

  const zeroBasedPages = mapping.pages.map((p) => p - 1).filter((p) => p >= 0 && p < origDoc.getPageCount());
  const pagesToCopy = zeroBasedPages.length > 0 ? zeroBasedPages : [0];

  const copiedPages = await chunkDoc.copyPages(origDoc, pagesToCopy);
  copiedPages.forEach((p) => chunkDoc.addPage(p));
  const chunkBytes = await chunkDoc.save();
  const chunkBase64 = Buffer.from(chunkBytes).toString('base64');

  // 2. Extract specific reference material using verified lock
  const snippets = extractRelevantReferenceSnippets(
    fullCode,
    ctx.questionPaperText,
    ctx.suggestedAnswersText,
    ctx.markingSchemeText,
    ctx.referenceMetadata
  );
  const topicAlignment = assessQuestionReferenceTopicAlignment(
    subQuestion,
    snippets.saSnippet,
    snippets.msSnippet,
  );
  if (!topicAlignment.aligned) {
    throw new Error('QUESTION_REFERENCE_NOT_LOCKED: ' + (topicAlignment.reason || 'Question and Suggested Answer topics do not align.') + ' Question: ' + fullCode + '; human review required.');
  }
  const markingSchemeExcluded = topicAlignment.misalignedSources?.includes('MARKING_SCHEME') === true;
  if (markingSchemeExcluded) {
    console.warn('[REFERENCE_SOURCE_MISMATCH] Excluded cross-wired Marking Scheme answer anchor for ' + fullCode + '; retained exact QP + Suggested Answer. ' + (topicAlignment.reason || ''));
    snippets.msSnippet = removeMismatchedDerivedSourceAnchor(snippets.msSnippet);
    snippets.retrievedCharacterCount = [snippets.qpSnippet, snippets.saSnippet, snippets.msSnippet].join('\n').trim().length;
    snippets.contentHash = crypto.createHash('sha256')
      .update([snippets.qpSnippet, snippets.saSnippet, snippets.msSnippet].join('\n').trim())
      .digest('hex');
  }
  const markingSchemePromptBlock = markingSchemeExcluded
    ? 'SOURCE ANCHOR EXCLUDED: The original answer anchor in this Marking Scheme block failed an independent topic check and belongs to a different question. Do not use that anchor or any sibling-question law/facts. The remaining DERIVED EXAMINER-STYLE ALLOCATION, when present below, may be used only for its component mark weights and generic step categories. Use the exact Question Paper and matched Suggested Answer as the sole substantive authorities.'
      + (snippets.msSnippet ? '\n\n' + snippets.msSnippet : '\nNo safe derived step allocation remained; use the matched Suggested Answer and authoritative maximum only.')
    : (snippets.msSnippet || 'No question-specific Marking Scheme extract was available. Use the matched Suggested Answer as the substantive source and the authoritative maximum only; do not invent section-number or presentation requirements.');
  const sourceInstructions = buildChunkReferenceSourceInstructions(snippets.referenceTrace);
  const referenceDisposition = assessQuestionReferenceForEvaluation({
    ...snippets,
    materialType: ctx.referenceMetadata?.materialType,
    // The evaluator receives this exact leaf from the selected Question Paper's
    // authoritative inventory, including its canonical ID and official maximum.
    // For PYQs only, that locked structure plus the exact Suggested Answer lock
    // is sufficient when the free-text QP slice matcher misses a formatting variant.
    authoritativeQuestionStructureVerified:
      Boolean(ctx.subQuestion.fullQuestionCode?.trim()) &&
      Number(ctx.subQuestion.maximumMarks) > 0,
  });
  if (!referenceDisposition.canScoreProvisionally) {
    throw new Error(`QUESTION_REFERENCE_NOT_LOCKED: ${referenceDisposition.reason || 'authoritative Suggested Answer reference could not be locked'} Question: ${fullCode}; human review required.`);
  }

  const sourceTransformations = extractSourceGroundedTransformations(
    snippets.qpSnippet,
    snippets.saSnippet,
    snippets.msSnippet,
    fullCode
  );

  const transformationContextText = sourceTransformations.length > 0
    ? `\n--- IDENTIFIED SOURCE-GROUNDED TRANSFORMATIONS ---\n` +
      sourceTransformations.map((t, i) =>
        `[Transformation ${i + 1} - ${t.transformationType}]:\n` +
        `- Input Fact: ${t.inputFact}\n` +
        `- Authoritative Rule: ${t.sourceRule}\n` +
        `- Authoritative Formula / Method: ${t.sourceFormula || 'Standard ICAI methodology'}\n` +
        `- Instruction: Execute Two-Stage Interpretation (Stage A: Source meaning -> Stage B: Student treatment).`
      ).join('\n')
    : '';

  const correctionDirective = ctx.supervisorIssues?.length
    ? `\nSUPERVISOR CORRECTION REQUEST (attempt ${ctx.supervisorCorrectionAttempt || 1}):\nThe previous evaluation was flagged for the following specific reason(s):\n${ctx.supervisorIssues.map((issue, index) => `${index + 1}. ${issue}`).join('\n')}\nRe-open and independently reassess the original student answer on the supplied page(s) against the locked Question Paper, Suggested Answer, and Marking Scheme. Correct only issues supported by the actual answer and authoritative references. Do not blindly comply with a flag if the evidence does not support it; explain the conflict and return status \"unclear\" when the evidence or mapping is insufficient. Keep the authoritative question identity and maximum marks unchanged. Re-evaluate component marks and reasons, not merely the total.\n`
    : '';

  const checkedCopyScoreIndependenceInstruction = buildCheckedCopyScoreIndependenceInstruction(
    ctx.referenceMetadata?.materialType || snippets.referenceTrace.materialType,
  );

  const prompt = `
MANDATORY EVALUATOR INSTRUCTION:
"You are an examiner-style evaluator, not a binary answer matcher.

Evaluate the student's answer criterion-by-criterion against the supplied
Question Paper, Suggested Answer and Marking Scheme.

Do not award zero merely because one component of the answer is incorrect.

Evaluate independently scorable components such as principle, provision,
application, calculation, working and conclusion whenever the supplied
marking scheme allocates marks to them.

Where a component is independently correct, award the corresponding credit
permitted by the marking scheme.

Do not invent marks, criteria, provisions, references, calculations, facts or
legal reasoning.

Do not infer a maximum mark from page layout, UI, previous questions or
defaults.

The maximum marks must come from the supplied question/marking structure.

Do not deduct twice for the same underlying mistake.

If reasoning is wrong but the conclusion is independently correct, evaluate
the two aspects separately.

If reasoning is correct but the final conclusion/calculation is wrong,
evaluate the correct work separately from the incorrect result.

Minor wording, spelling or presentation differences must not automatically
destroy substantive credit when the intended meaning is clearly correct.

However, do not infer correctness merely from keyword overlap.

When the evidence is insufficient or genuinely ambiguous, do not guess.

Use the configured conservative/review behaviour.

Before finalizing the score, perform a verification pass:

1. Question identity
2. Maximum marks
3. Criterion allocation
4. Student evidence
5. Awarded marks
6. Deductions
7. Double-deduction check
8. Total score
9. Source consistency
10. Partial-credit consistency

Never exceed the prescribed maximum marks.
Never produce an invalid negative score.
Never silently fabricate certainty."

${correctionDirective}
${checkedCopyScoreIndependenceInstruction}
TARGET EVALUATION DETAILS:
Question: ${fullCode} (Question ${qNum}${subQ ? `, Sub-part (${subQ})` : ''})
Subject: ${subjectName} (${level})
BASE EVALUATION MODE: STANDARD ICAI STEP MARKING ONLY.
Evaluate all components using the same balanced, source-grounded Standard rubric for every run. Do not try to simulate Strict or Moderate mode here. The deterministic multi-mode marking engine applies those adjustments exactly once after base question marks and original CORRECT / PARTIALLY_CORRECT / INCORRECT / OMITTED assessments have been validated.
MAXIMUM MARKS FOR THIS QUESTION: EXACTLY ${maxMarks} MARKS (Do NOT alter or exceed this limit!).

SOURCE TYPE ISOLATION:
${sourceInstructions.isolationInstruction}

--- ${sourceInstructions.questionPaperHeading} ---
${snippets.qpSnippet || 'Question Extract'}

--- ${sourceInstructions.suggestedAnswersHeading} ---
${snippets.saSnippet || 'Suggested Answer Extract'}

--- ${sourceInstructions.markingSchemeHeading} ---
${markingSchemePromptBlock}
${transformationContextText}

The candidate's solution for ${fullCode} is on Page(s) ${mapping.pages.join(', ')} of the attached PDF document.

UNIVERSAL HANDWRITING AND QUESTION-ISOLATION RULES (all CA levels and subjects):
- Read the supplied page images visually. Handle faint/cursive, slanted, small, mixed print/cursive,
  overwritten or rewritten writing, symbols, arrows and abbreviations.
- Interpret visible layouts correctly: tables, ledgers/journals, Dr/Cr columns, statements,
  calculations, formulas, working notes, legal/theory paragraphs, tax workings, audit notes
  and case-study answers.
- Read figures/signs carefully (decimals, negatives, brackets, commas, percentages). Context may
  clarify visible writing but must never be used to invent missing words, figures or provisions.
- Isolate only the answer block belonging to the locked question identity ${fullCode}. A page may
  contain multiple questions; never award neighbouring-question work to this question.
- Hard-to-read writing is not automatically omitted or incorrect. Award partial credit for each
  independently readable relevant step; mark only genuinely unresolved evidence unclear.
- A page-level scan warning is NOT proof that this specific answer block is unreadable. Re-read
  this question's supplied page image independently; return UNCLEAR only if this answer itself
  remains too illegible to assess after that focused visual read.
- Quote studentEvidence faithfully. Mark partly readable text as "[partially legible]" instead of
  fabricating a transcription. Handwriting neatness/style must never affect academic marks.

STRICT QUESTION-IDENTITY LOCK:
- The supplied question ID and maximum marks are immutable. Do not remap by page number, answer
  order, expected sequence or subject assumptions. If the answer block identity is ambiguous,
  preserve it for review rather than scoring another question.
${buildQuestionChunkSubPartCompletenessDirective(fullCode, maxMarks)}

CRITICAL ICAI EVALUATION RULES:
1. Examine the candidate's handwritten answer on the attached page(s).
2. Award step marks strictly according to the verified step-marking scheme and suggested answer above.
3. Every step component must have:
    - componentType: 'PROVISION' | 'PRINCIPLE' | 'CONDITION' | 'APPLICATION' | 'CALCULATION' | 'WORKING' | 'TREATMENT' | 'REASONING' | 'CONCLUSION' | 'PRESENTATION'
   - expectedRequirement: exact requirement from verified official answer
   - studentEvidence: exact quotes, working, or numbers from what candidate wrote in their script
    - assessment: 'CORRECT' | 'PARTIALLY_CORRECT' | 'INCORRECT' | 'OMITTED'
   - marksAvailable: step max
   - marksAwarded: awarded marks (0 to marksAvailable)
   - marksDeducted: deducted marks
   - deductionReason: specific reason if deducted
4. SOURCE AUTHORITY AND CROSS-WIRED MARKING-SCHEME SAFETY:
    - The exact Question Paper defines the task and facts. The exactly matched Suggested Answer is the primary source of substantive legal/accounting/tax treatment.
    - Use a question-specific Marking Scheme block only when it independently matches this question's topic. A mismatched/excluded block is untrusted and MUST NOT influence the answer, statutory provision, required step, allocation, deduction or score.
    - Never borrow a provision, rule, exception, company name, figure, threshold, or criterion from a sibling sub-question merely because its question number is similar.
    - Do not require an exact section/rule number unless the matched source explicitly makes that identification a separately mark-bearing requirement. If the number is omitted or wrong but the substantive rule and application are correct, deduct only the independently allocated citation/provision component; retain principle, condition, application and conclusion marks.
    - A whole-question zero is permissible only when every independently mark-bearing requirement is actually omitted or substantively incorrect against the matched source. One incorrect citation cannot erase correct legal principles, facts, application, calculations or conclusions.
5. ZERO-MARK SAFETY GATE: A student's answer must NOT receive 0 marks merely because wording differs, order differs, presentation differs, a non-mandatory section number is omitted, or the final total differs while intermediate steps are attempted. If student work contains relevant legal provisions, calculations, or analysis, award the independently supported partial credit. Do not convert uncertain reference matching into an academic zero; return an evaluation/reference failure without confirmed marks instead.
6. TAXABILITY & EXEMPTION CITATION ACCURACY:
   - For classification questions (such as Indian Railways services, cloak room, platform tickets, etc.), determine taxability or exemption STRICTLY according to the verified ICAI Suggested Answer provided above.
   - For example: if the verified suggested solution states that "services provided by Ministry of Railways (Indian Railways) to individuals by way of cloak room services are exempt", and the student concludes that cloak room services are exempt, you MUST evaluate this as CORRECT and award full credit. Do NOT penalize based on general training memory.
7. NO PRESENTATION DEDUCTIONS: Formatting, tabular vs paragraph, handwriting neatness, or presentation style must NOT be penalized unless explicitly mandated in the marking scheme.
8. DETAILED EXAMINER REASONING (NO TRUNCATION):
   - "detailedFeedback" must be thorough, constructive, and detailed (at least 2-3 substantive sentences explaining candidate's performance against the model answer).
   - If marks are deducted, "reasonForDeduction" must clearly state what candidate wrote, what the authoritative solution requires, and the exact step-wise basis for deduction.
9. TWO-STAGE INTERPRETATION & SOURCE-GROUNDED TRANSFORMATION:
   - Raw figure stated in Question Paper != final figure to be evaluated.
   - Stage A: Determine what authoritative source says raw fact represents (net vs gross, tax-inclusive vs exclusive, cost vs NRV, WDV depreciation, margin vs markup, etc.).
   - Stage B: Evaluate student's treatment. Accept mathematically/algebraically equivalent forms (e.g. X / 70% == X / 0.70 == X * 100 / 70).
   - Recognize and credit alternative valid methods and valid working orders.
   - Enforce Own-Figure Rule / Consequential credit: Never double-penalize downstream steps for an earlier arithmetic slip.
10. The sum of all marksAvailable MUST EQUAL EXACTLY ${maxMarks}.
11. The sum of all marksAwarded CANNOT EXCEED ${maxMarks}.

Return strictly valid JSON with this schema:
{
  "marksAwarded": number,
  "status": "correct" | "partially_correct" | "incorrect" | "unclear",
  "reasonForDeduction": string,
  "detailedFeedback": string,
  "confidence": number,
  "technicalEvaluation": string,
  "finalConclusionAssessment": string,
  "markingComponents": [
    {
      "componentId": string,
      "componentType": "PROVISION" | "PRINCIPLE" | "CONDITION" | "APPLICATION" | "CALCULATION" | "WORKING" | "TREATMENT" | "REASONING" | "CONCLUSION" | "PRESENTATION",
      "expectedRequirement": string,
      "studentEvidence": string,
      "assessment": "CORRECT" | "PARTIALLY_CORRECT" | "INCORRECT" | "OMITTED",
      "marksAvailable": number,
      "marksAwarded": number,
      "marksDeducted": number,
      "deductionReason": string,
      "supportingProvision": string,
      "pageNumber": number,
      "annotationInstructions": string
    }
  ]
}
`;

  try {
    const res = await executeModelWithFallback({
      systemPrompt: 'You are an examiner-style evaluator. Return only valid JSON matching the requested schema.',
      userPrompt: prompt,
      pdfBase64: chunkBase64,
      mimeType: 'application/pdf',
      responseMimeType: 'application/json',
      // Question-level examiner JSON can be larger than a simple chat answer,
      // especially for nested workings and multiple independently marked steps.
      // Keep a consistent response budget across the configured providers.
      maxTokens: 8192,
      thinkingLevel: 'MEDIUM',
      validateOutput: (rawText) => {
        parseAndValidateQuestionChunkOutput(rawText, maxMarks, { materialType: ctx.referenceMetadata?.materialType });
      },
      context: {
        level,
        subjectName,
        subjectKey,
        checkingMode,
        pageCount: mapping.pages.length,
      },
    });
    console.info(`[QuestionChunkEvaluator] ${fullCode} evaluated with ${res.modelUsed} (${res.provider}); fallback=${res.fallbackOccurred}.`);

    const raw = parseAndValidateQuestionChunkOutput(res.rawText, maxMarks, { materialType: ctx.referenceMetadata?.materialType });
    const components: MarkingComponent[] = raw.markingComponents as MarkingComponent[];

    // Do not invent or proportionally rescale step allocations. The model output has
    // already been validated against the authoritative maximum and component arithmetic.
    const calculatedAwarded = components.reduce((sum, component) => sum + component.marksAwarded, 0);
    const finalAwarded = Math.min(maxMarks, Math.round(calculatedAwarded * 4) / 4);
    const effectiveStatus = referenceDisposition.requiresHumanReview ? 'unclear' : raw.status;
    const marksLost = effectiveStatus === 'unclear' ? 0 : Math.max(0, maxMarks - finalAwarded);
    const modelConfidence = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
      ? Math.max(0, Math.min(100, raw.confidence))
      : 0;

    const questionFlags: string[] = [];
    if (referenceDisposition.requiresHumanReview) {
      questionFlags.push('QUESTION_REFERENCE_REVIEW_REQUIRED');
      questionFlags.push('REVIEW_REQUIRED');
    }
    if (raw.status === 'unclear') {
      questionFlags.push('MODEL_UNCERTAIN');
      questionFlags.push('REVIEW_REQUIRED');
    }
    if (requiresAnswerLevelReadabilityReview(mapping)) {
      questionFlags.push('HANDWRITING_UNCLEAR');
      questionFlags.push('REVIEW_REQUIRED');
    }

    const qEval: QuestionEvaluation = {
      questionNumber: qNum,
      modelUsed: res.modelUsed,
      modelProvider: res.provider,
      fallbackOccurred: res.fallbackOccurred,
      fallbackReason: res.fallbackReason,
      subQuestion: subQ,
      maximumMarks: maxMarks,
      marksAwarded: finalAwarded,
      marksLost,
      status: effectiveStatus,
      reasonForDeduction: raw.reasonForDeduction || (marksLost > 0 ? `${marksLost} mark(s) deducted based on step-marking rubric.` : 'Full marks awarded.'),
      detailedFeedback: [
        raw.detailedFeedback || `Evaluated candidate solution for ${fullCode} across pages ${mapping.pages.join(', ')}.`,
        referenceDisposition.reason,
      ].filter(Boolean).join('\n\n'),
      confidence: modelConfidence,
      technicalEvaluation: [
        raw.technicalEvaluation || `Candidate response for ${fullCode} mapped against ICAI suggested solution.`,
        raw.scoreReconciliationNote,
      ].filter(Boolean).join(' '),
      markingComponents: components,
      pageNumber: mapping.pages[0] || 1,
      flags: questionFlags,
      referenceTrace: {
        materialId: snippets.referenceTrace.suggestedAnswerMaterialId,
        materialTitle: snippets.referenceTrace.materialTitle ||
          (snippets.referenceTrace.sourceType === 'FACULTY_MOCK'
            ? 'Faculty Mock Private TXT Reference'
            : 'Verified Evaluation Reference'),
        materialVersion: snippets.referenceTrace.materialVersions,
        source: snippets.referenceTrace.sourceType,
        paperId: fullCode,
        markingSchemeSection: snippets.markingSchemeSection,
        suggestedAnswerSection: snippets.suggestedAnswerSection,
        suggestedAnswerRef: `${fullCode} Suggested Solution`,
        retrievedCharacterCount: snippets.retrievedCharacterCount,
        contentHash: snippets.contentHash,
        verifiedTruthSnippet: snippets.verifiedTruthSnippet,
        verifiedGroundTruthSnippet: snippets.verifiedTruthSnippet,
        questionPaperMaterialId: snippets.referenceTrace.questionPaperMaterialId,
        suggestedAnswerMaterialId: snippets.referenceTrace.suggestedAnswerMaterialId,
        markingSchemeMaterialId: snippets.referenceTrace.markingSchemeMaterialId,
        materialType: snippets.referenceTrace.materialType,
        modelTestNumber: snippets.referenceTrace.modelTestNumber,
        facultyMockTestId: snippets.referenceTrace.facultyMockTestId,
        deductionReason: raw.reasonForDeduction || (marksLost > 0 ? `${marksLost} marks deducted.` : 'Full marks awarded.'),
      },
      structuredEvidence: {
        questionId: fullCode,
        subQuestionId: subQ,
        questionNumber: qNum,
        subQuestion: subQ,
        maxMarks,
        obtainedMarks: finalAwarded,
        marksAwarded: finalAwarded,
        marksLost,
        markingComponents: components,
        finalConclusionAssessment: raw.finalConclusionAssessment || 'Assessed against official standards.',
        overallReason: [
          raw.reasonForDeduction || 'Evaluated against verified marking scheme.',
          referenceDisposition.reason,
        ].filter(Boolean).join(' '),
        confidence: modelConfidence,
        flags: questionFlags,
        isDerivedAllocation: false,
      },
    };

    return qEval;
  } catch (err: any) {
    const errStr = err?.message || String(err);
    console.error(`[QuestionChunkEvaluator] Chunk evaluation failed for ${fullCode}:`, errStr.slice(0, 160));
    throw err;
  }
}
