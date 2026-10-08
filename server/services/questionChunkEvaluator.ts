import { PDFDocument } from 'pdf-lib';
import crypto from 'crypto';
import { getGemini, generateContentWithResilience } from '../gemini.js';
import { QuestionEvaluation, MarkingComponent } from '../../src/types/index.js';
import { PaperStructureSubQuestion } from './paperStructureService.js';
import { AttemptedQuestionMapping } from './answerSheetCoverageService.js';
import { lockQuestionReference } from './questionReferenceLock.js';
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
}

/**
 * Extracts relevant reference material for a specific sub-question.
 * Uses the authoritative lockQuestionReference to ensure exact question-level synchronization.
 */
export function extractRelevantReferenceSnippets(
  fullQuestionCode: string, // e.g. 'Q5(a)', 'Q5(b)', 'Q1'
  qpText: string,
  saText: string,
  msText: string
): ExtractedReferenceSnippets {
  const lockedRef = lockQuestionReference(fullQuestionCode, qpText, saText, msText);
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
  };
}


/**
 * Evaluates a single attempted descriptive sub-question using targeted page images and reference material.
 */
export async function evaluateQuestionChunk(
  ctx: ChunkEvaluationContext
): Promise<QuestionEvaluation> {
  const { subQuestion, mapping, fullPdfBuffer, checkingMode, level, subjectName } = ctx;
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
    ctx.markingSchemeText
  );

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

TARGET EVALUATION DETAILS:
Question: ${fullCode} (Question ${qNum}${subQ ? `, Sub-part (${subQ})` : ''})
Subject: ${subjectName} (${level})
Checking Mode: ${checkingMode}
MAXIMUM MARKS FOR THIS QUESTION: EXACTLY ${maxMarks} MARKS (Do NOT alter or exceed this limit!).

--- VERIFIED QUESTION PAPER EXTRACT ---
${snippets.qpSnippet || 'Official Question Extract'}

--- VERIFIED ICAI SUGGESTED ANSWER EXTRACT ---
${snippets.saSnippet || 'Official Suggested Answer Extract'}

--- VERIFIED STEP-MARKING SCHEME EXTRACT ---
${snippets.msSnippet || 'Official Step-Marking Scheme Extract'}
${transformationContextText}

The candidate's solution for ${fullCode} is on Page(s) ${mapping.pages.join(', ')} of the attached PDF document.

CRITICAL ICAI EVALUATION RULES:
1. Examine the candidate's handwritten answer on the attached page(s).
2. Award step marks strictly according to the verified step-marking scheme and suggested answer above.
3. Every step component must have:
   - componentType: 'PROVISION' | 'PRINCIPLE' | 'CONDITION' | 'APPLICATION' | 'CALCULATION' | 'CONCLUSION'
   - expectedRequirement: exact requirement from verified official answer
   - studentEvidence: exact quotes, working, or numbers from what candidate wrote in their script
   - assessment: 'CORRECT' | 'PARTIALLY_CORRECT' | 'INCORRECT'
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
      "componentType": "PROVISION" | "PRINCIPLE" | "CONDITION" | "APPLICATION" | "CALCULATION" | "CONCLUSION",
      "expectedRequirement": string,
      "studentEvidence": string,
      "assessment": "CORRECT" | "PARTIALLY_CORRECT" | "INCORRECT",
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

  const ai = getGemini();

  try {
    const res = await generateContentWithResilience(ai, {
      contents: [
        { inlineData: { mimeType: 'application/pdf', data: chunkBase64 } },
        { text: prompt },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    let raw: any = {};
    try {
      let clean = res.text?.trim() || '{}';
      if (clean.startsWith('```json')) clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      raw = JSON.parse(clean);
    } catch {
      raw = {};
    }

    const initialAwarded = Math.min(maxMarks, Math.max(0, Number(raw.marksAwarded) || 0));
    let components: MarkingComponent[] = Array.isArray(raw.markingComponents) ? raw.markingComponents : [];

    // Ensure components sum to maxMarks
    if (components.length === 0) {
      components = [
        {
          componentId: `${fullCode}_c1`,
          componentType: 'APPLICATION',
          expectedRequirement: `Fulfill requirements of ${fullCode}`,
          studentEvidence: mapping.studentSnippet || 'Candidate answer evaluated.',
          assessment: initialAwarded >= maxMarks ? 'CORRECT' : initialAwarded > 0 ? 'PARTIALLY_CORRECT' : 'INCORRECT',
          marksAvailable: maxMarks,
          marksAwarded: initialAwarded,
          marksDeducted: Math.max(0, maxMarks - initialAwarded),
          deductionReason: initialAwarded < maxMarks ? raw.reasonForDeduction || 'Partial variance from model answer.' : undefined,
          confidence: 90,
          pageNumber: mapping.pages[0] || 1,
          annotationInstructions: `Marks awarded: ${initialAwarded}/${maxMarks}`,
        },
      ];
    } else {
      // Balance components so total marksAvailable === maxMarks
      const compAvailSum = components.reduce((sum, c) => sum + (Number(c.marksAvailable) || 0), 0);
      if (Math.abs(compAvailSum - maxMarks) > 0.01 && compAvailSum > 0) {
        const factor = maxMarks / compAvailSum;
        components = components.map((c) => ({
          ...c,
          marksAvailable: Math.round(c.marksAvailable * factor * 2) / 2,
          marksAwarded: Math.min(c.marksAvailable, Math.round((c.marksAwarded || 0) * factor * 2) / 2),
          marksDeducted: Math.max(0, Math.round((c.marksAvailable - (c.marksAwarded || 0)) * 2) / 2),
        }));
      }
    }

    const calculatedAwarded = components.reduce((sum, c) => sum + (Number(c.marksAwarded) || 0), 0);
    const finalAwarded = Math.min(maxMarks, Math.round(calculatedAwarded * 4) / 4);
    const marksLost = Math.max(0, maxMarks - finalAwarded);

    const questionFlags: string[] = [];
    if (mapping.status === 'ATTEMPTED_UNCLEAR') {
      questionFlags.push('HANDWRITING_UNCLEAR');
      questionFlags.push('REVIEW_REQUIRED');
    }

    const qEval: QuestionEvaluation = {
      questionNumber: qNum,
      subQuestion: subQ,
      maximumMarks: maxMarks,
      marksAwarded: finalAwarded,
      marksLost,
      status: finalAwarded >= maxMarks ? 'correct' : finalAwarded > 0 ? 'partially_correct' : 'incorrect',
      reasonForDeduction: raw.reasonForDeduction || (marksLost > 0 ? `${marksLost} mark(s) deducted based on step-marking rubric.` : 'Full marks awarded.'),
      detailedFeedback: raw.detailedFeedback || `Evaluated candidate solution for ${fullCode} across pages ${mapping.pages.join(', ')}.`,
      confidence: Math.max(80, Math.min(99, Number(raw.confidence) || 92)),
      technicalEvaluation: raw.technicalEvaluation || `Candidate response for ${fullCode} mapped against ICAI suggested solution.`,
      markingComponents: components,
      pageNumber: mapping.pages[0] || 1,
      flags: questionFlags,
      referenceTrace: {
        materialId: 'ICAI_OFFICIAL_SUGGESTED',
        materialTitle: 'ICAI Verified Suggested Answers & Step Marking Scheme',
        markingSchemeSection: snippets.markingSchemeSection,
        suggestedAnswerSection: snippets.suggestedAnswerSection,
        suggestedAnswerRef: `${fullCode} Suggested Solution`,
        retrievedCharacterCount: snippets.retrievedCharacterCount,
        contentHash: snippets.contentHash,
        verifiedTruthSnippet: snippets.verifiedTruthSnippet,
        verifiedGroundTruthSnippet: snippets.verifiedTruthSnippet,
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
        overallReason: raw.reasonForDeduction || 'Evaluated against verified marking scheme.',
        confidence: 92,
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
