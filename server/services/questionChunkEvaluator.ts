import { PDFDocument } from 'pdf-lib';
import crypto from 'crypto';
import { executeModelWithFallback } from '../models/modelRegistry.js';
import { QuestionEvaluation, MarkingComponent } from '../../src/types/index.js';
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


export interface QuestionReferenceEvaluationDisposition {
  canScoreProvisionally: boolean;
  requiresHumanReview: boolean;
  reason?: string;
}

/**
 * A parsed authoritative paper structure can anchor a question when the exact
 * QP text-slice matcher misses its formatting. The Suggested Answer must still
 * be locked to that exact canonical question. Such scores remain provisional.
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

  const canUsePyqStructureAnchor =
    String(reference.materialType || '').trim().toUpperCase() === 'PYQ' &&
    reference.authoritativeQuestionStructureVerified === true;

  if (!reference.questionPaperFound && !canUsePyqStructureAnchor) {
    return {
      canScoreProvisionally: true,
      requiresHumanReview: true,
      reason: 'The question is present in the parsed authoritative paper structure and its Suggested Answer is locked, but the exact Question Paper text slice needs manual verification. This score is provisional.',
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

  const allowedStatuses = new Set(['correct', 'partially_correct', 'incorrect', 'unclear']);
  if (typeof raw.status !== 'string' || !allowedStatuses.has(raw.status)) {
    throw new Error('QUESTION_CHUNK_INVALID_STATUS: expected correct, partially_correct, incorrect, or unclear.');
  }
  if (typeof raw.marksAwarded !== 'number' || !Number.isFinite(raw.marksAwarded) ||
      raw.marksAwarded < 0 || raw.marksAwarded > maxMarks + 0.05) {
    throw new Error('QUESTION_CHUNK_INVALID_TOTAL: awarded marks are missing or outside the authoritative range.');
  }

  const components = raw.markingComponents;
  if (!Array.isArray(components) || components.length === 0) {
    throw new Error('QUESTION_CHUNK_COMPONENTS_MISSING: a question-level score without step evidence is not accepted.');
  }

  const allowedTypes = new Set([
    'PROVISION', 'PRINCIPLE', 'CONDITION', 'APPLICATION', 'CALCULATION',
    'WORKING', 'TREATMENT', 'REASONING', 'CONCLUSION', 'PRESENTATION',
  ]);
  const allowedAssessments = new Set(['CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT', 'OMITTED']);
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
    if (typeof component.componentType !== 'string' || !allowedTypes.has(component.componentType)) {
      throw new Error(`QUESTION_CHUNK_INVALID_COMPONENT: ${prefix} has an unsupported componentType.`);
    }
    if (typeof component.assessment !== 'string' || !allowedAssessments.has(component.assessment)) {
      throw new Error(`QUESTION_CHUNK_INVALID_COMPONENT: ${prefix} has an unsupported assessment.`);
    }
    if (typeof component.expectedRequirement !== 'string' || !component.expectedRequirement.trim()) {
      throw new Error(`QUESTION_CHUNK_INVALID_COMPONENT: ${prefix} is missing the authoritative requirement.`);
    }
    if (typeof component.studentEvidence !== 'string' || !component.studentEvidence.trim()) {
      throw new Error(`QUESTION_CHUNK_INVALID_COMPONENT: ${prefix} is missing candidate evidence or an explicit omission statement.`);
    }

    const numbers = [component.marksAvailable, component.marksAwarded, component.marksDeducted];
    if (numbers.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error(`QUESTION_CHUNK_INVALID_COMPONENT: ${prefix} has missing or non-numeric marks.`);
    }
    const available = component.marksAvailable as number;
    const awarded = component.marksAwarded as number;
    const deducted = component.marksDeducted as number;
    if (available < 0 || awarded < 0 || awarded > available + 0.01 || deducted < 0 || deducted > available + 0.01) {
      throw new Error(`QUESTION_CHUNK_INVALID_COMPONENT: ${prefix} has marks outside its component limit.`);
    }
    if (Math.abs((available - awarded) - deducted) > 0.26) {
      throw new Error(`QUESTION_CHUNK_COMPONENT_ARITHMETIC_MISMATCH: ${prefix} awarded and deducted marks do not reconcile.`);
    }
    availableTotal += available;
    awardedTotal += awarded;
  }

  if (Math.abs(availableTotal - maxMarks) > 0.05) {
    throw new Error(`QUESTION_CHUNK_ALLOCATION_MISMATCH: component allocations total ${availableTotal}, but the authoritative maximum is ${maxMarks}.`);
  }
  if (Math.abs(awardedTotal - raw.marksAwarded) > 0.26) {
    throw new Error(`QUESTION_CHUNK_SCORE_MISMATCH: component awards total ${awardedTotal}, but the model reported ${raw.marksAwarded}.`);
  }

  // The validated component marks are authoritative. Reconcile the question
  // score to their quarter-mark sum so displayed totals cannot drift from steps.
  raw.marksAwarded = Math.min(maxMarks, Math.round(awardedTotal * 4) / 4);

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

  const isPyqCheckedCopyFlow = String(ctx.referenceMetadata?.materialType || snippets.referenceTrace.materialType || '').trim().toUpperCase() === 'PYQ';
  const pyqCheckedCopyInstruction = isPyqCheckedCopyFlow ? `

PYQ CHECKED-COPY SCORE INDEPENDENCE (PYQ ONLY):
- The uploaded PYQ answer sheet may contain ICAI examiner ticks, comments, red-ink annotations, per-question marks or a total score.
- Treat every examiner-awarded score, including a written 0, as a non-binding annotation. Never copy it, use it as the AI score, or lock any question/component to zero because of it.
- Independently assess only the student's answer content against the selected Question Paper, Suggested Answer and Marking Scheme.
- Award independently creditworthy steps according to the selected checking mode. Standard, Strict and Moderate modes may legitimately produce different marks from the original examiner.
- A zero may be awarded only under the normal academic zero-mark safety rules (or the applicable objective MCQ rule), never merely because the original examiner wrote zero.
` : '';

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
${pyqCheckedCopyInstruction}
TARGET EVALUATION DETAILS:
Question: ${fullCode} (Question ${qNum}${subQ ? `, Sub-part (${subQ})` : ''})
Subject: ${subjectName} (${level})
Requested Display Mode: ${checkingMode}
Base scoring instruction: Use the same balanced, source-grounded Standard ICAI step-marking for this question regardless of the requested display mode. Do not apply extra Strict deductions or Moderate bonuses here. The deterministic multi-mode marking engine applies Strict/Moderate adjustments exactly once after all base question marks have been reconciled.
MAXIMUM MARKS FOR THIS QUESTION: EXACTLY ${maxMarks} MARKS (Do NOT alter or exceed this limit!).

SOURCE TYPE ISOLATION:
${sourceInstructions.isolationInstruction}

--- ${sourceInstructions.questionPaperHeading} ---
${snippets.qpSnippet || 'Question Extract'}

--- ${sourceInstructions.suggestedAnswersHeading} ---
${snippets.saSnippet || 'Suggested Answer Extract'}

--- ${sourceInstructions.markingSchemeHeading} ---
${snippets.msSnippet || 'Step-Marking Scheme Extract'}
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
- Quote studentEvidence faithfully. Mark partly readable text as "[partially legible]" instead of
  fabricating a transcription. Handwriting neatness/style must never affect academic marks.

STRICT QUESTION-IDENTITY LOCK:
- The supplied question ID and maximum marks are immutable. Do not remap by page number, answer
  order, expected sequence or subject assumptions. If the answer block identity is ambiguous,
  preserve it for review rather than scoring another question.
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
4. ZERO-MARK SAFETY GATE: A student's answer must NOT receive 0 marks merely because wording differs, order differs, presentation differs, or the final total differs while intermediate steps are attempted. If student work contains relevant legal provisions, calculations, or analysis, award appropriate partial credit.
5. TAXABILITY & EXEMPTION CITATION ACCURACY:
   - For classification questions (such as Indian Railways services, cloak room, platform tickets, etc.), determine taxability or exemption STRICTLY according to the verified ICAI Suggested Answer provided above.
   - For example: if the verified suggested solution states that "services provided by Ministry of Railways (Indian Railways) to individuals by way of cloak room services are exempt", and the student concludes that cloak room services are exempt, you MUST evaluate this as CORRECT and award full credit. Do NOT penalize based on general training memory.
6. NO PRESENTATION DEDUCTIONS: Formatting, tabular vs paragraph, handwriting neatness, or presentation style must NOT be penalized unless explicitly mandated in the marking scheme.
7. DETAILED EXAMINER REASONING (NO TRUNCATION):
   - "detailedFeedback" must be thorough, constructive, and detailed (at least 2-3 substantive sentences explaining candidate's performance against the model answer).
   - If marks are deducted, "reasonForDeduction" must clearly state what candidate wrote, what the authoritative solution requires, and the exact step-wise basis for deduction.
8. TWO-STAGE INTERPRETATION & SOURCE-GROUNDED TRANSFORMATION:
   - Raw figure stated in Question Paper != final figure to be evaluated.
   - Stage A: Determine what authoritative source says raw fact represents (net vs gross, tax-inclusive vs exclusive, cost vs NRV, WDV depreciation, margin vs markup, etc.).
   - Stage B: Evaluate student's treatment. Accept mathematically/algebraically equivalent forms (e.g. X / 70% == X / 0.70 == X * 100 / 70).
   - Recognize and credit alternative valid methods and valid working orders.
   - Enforce Own-Figure Rule / Consequential credit: Never double-penalize downstream steps for an earlier arithmetic slip.
9. The sum of all marksAvailable MUST EQUAL EXACTLY ${maxMarks}.
10. The sum of all marksAwarded CANNOT EXCEED ${maxMarks}.

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
      thinkingLevel: checkingMode === 'strict' ? 'HIGH' : 'MEDIUM',
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
    if (mapping.status === 'ATTEMPTED_UNCLEAR') {
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
      technicalEvaluation: raw.technicalEvaluation || `Candidate response for ${fullCode} mapped against ICAI suggested solution.`,
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
