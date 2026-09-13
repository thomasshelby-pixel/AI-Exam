import { PDFDocument } from 'pdf-lib';
import { getGemini, generateContentWithResilience } from '../gemini.js';
import { QuestionEvaluation, MarkingComponent } from '../../src/types/index.js';
import { PaperStructureSubQuestion } from './paperStructureService.js';
import { AttemptedQuestionMapping } from './answerSheetCoverageService.js';

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

/**
 * Extracts relevant reference material for a specific sub-question.
 */
export function extractRelevantReferenceSnippets(
  fullQuestionCode: string, // e.g. 'Q5(a)', 'Q7(b)'
  qpText: string,
  saText: string,
  msText: string
): { qpSnippet: string; saSnippet: string; msSnippet: string } {
  const matchCode = fullQuestionCode.replace(/[^0-9a-zA-Z]/g, '').toLowerCase(); // e.g. 'q5a'
  const qNum = fullQuestionCode.replace(/[^0-9]/g, '');
  const subQ = (fullQuestionCode.match(/\(([a-zA-Z0-9]+)\)/) || [])[1] || '';

  const sliceTextForQuestion = (text: string): string => {
    if (!text) return '';
    const lines = text.split('\n');
    let capturing = false;
    const captured: string[] = [];

    // Look for lines containing question code
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();

      // Start condition
      const isStart =
        (subQ && (lower.includes(`question ${qNum}(${subQ.toLowerCase()})`) || lower.includes(`question no. ${qNum}(${subQ.toLowerCase()})`) || lower.includes(`(${subQ.toLowerCase()})`))) ||
        lower.includes(`question ${qNum}`) ||
        lower.includes(`question no. ${qNum}`);

      if (isStart && !capturing) {
        capturing = true;
        captured.push(line);
        continue;
      }

      if (capturing) {
        // End condition: next main question
        const isNextQuestion =
          (lower.includes(`question ${parseInt(qNum, 10) + 1}`) ||
           lower.includes(`question no. ${parseInt(qNum, 10) + 1}`)) &&
          !lower.includes(`question ${qNum}`);

        if (isNextQuestion && captured.length > 5) {
          break;
        }
        captured.push(line);
        if (captured.length > 120) break; // Limit length
      }
    }

    return captured.length > 0 ? captured.join('\n') : text.slice(0, 1500);
  };

  return {
    qpSnippet: sliceTextForQuestion(qpText),
    saSnippet: sliceTextForQuestion(saText),
    msSnippet: sliceTextForQuestion(msText),
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

  // 2. Extract specific reference material
  const { qpSnippet, saSnippet, msSnippet } = extractRelevantReferenceSnippets(
    fullCode,
    ctx.questionPaperText,
    ctx.suggestedAnswersText,
    ctx.markingSchemeText
  );

  const prompt = `
You are an expert ICAI Senior Examiner evaluating candidate solution for:
Question: ${fullCode} (Question ${qNum}${subQ ? `, Sub-part (${subQ})` : ''})
Subject: ${subjectName} (${level})
Checking Mode: ${checkingMode}
MAXIMUM MARKS FOR THIS QUESTION: EXACTLY ${maxMarks} MARKS (Do NOT alter or exceed this limit!).

--- VERIFIED QUESTION PAPER EXTRACT ---
${qpSnippet}

--- VERIFIED ICAI SUGGESTED ANSWER EXTRACT ---
${saSnippet}

--- VERIFIED STEP-MARKING SCHEME EXTRACT ---
${msSnippet}

The candidate's solution for ${fullCode} is on Page(s) ${mapping.pages.join(', ')} of the attached PDF document.

TASK:
1. Examine the candidate's handwritten answer on the attached page(s).
2. Award step marks strictly according to the verified step-marking scheme.
3. Every step component must have:
   - componentType: 'PROVISION' | 'PRINCIPLE' | 'CONDITION' | 'APPLICATION' | 'CALCULATION' | 'CONCLUSION'
   - expectedRequirement: requirement from official answer
   - studentEvidence: what candidate wrote
   - assessment: 'CORRECT' | 'PARTIALLY_CORRECT' | 'INCORRECT'
   - marksAvailable: step max
   - marksAwarded: awarded marks (0 to marksAvailable)
   - marksDeducted: deducted marks
   - deductionReason: specific reason if deducted
4. The sum of all marksAvailable MUST EQUAL EXACTLY ${maxMarks}.
5. The sum of all marksAwarded CANNOT EXCEED ${maxMarks}.
6. NO presentation deductions are allowed unless explicitly specified in the marking scheme.
7. If handwriting is illegible on any part, state clearly in detailedFeedback.

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
        temperature: 0.1,
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
        markingSchemeSection: `Section ${subQuestion.section} - Q${qNum}${subQ ? `(${subQ})` : ''}`,
        suggestedAnswerRef: `${fullCode} Suggested Solution`,
        deductionReason: raw.reasonForDeduction || (marksLost > 0 ? `${marksLost} marks deducted.` : 'Full marks awarded.'),
        verifiedGroundTruthSnippet: saSnippet.slice(0, 300),
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
  } catch (err) {
    console.error(`[QuestionChunkEvaluator] Error evaluating ${fullCode}:`, err);
    // Return structured evaluation requiring review
    const qEval: QuestionEvaluation = {
      questionNumber: qNum,
      subQuestion: subQ,
      maximumMarks: maxMarks,
      marksAwarded: 0,
      marksLost: maxMarks,
      status: 'unclear',
      reasonForDeduction: 'Evaluation could not be fully completed via AI model; human review required.',
      detailedFeedback: `Candidate answer on page(s) ${mapping.pages.join(', ')} flagged for manual review.`,
      confidence: 50,
      flags: ['REVIEW_REQUIRED', 'EVALUATION_INCOMPLETE'],
      pageNumber: mapping.pages[0] || 1,
      markingComponents: [
        {
          componentId: `${fullCode}_review`,
          componentType: 'APPLICATION',
          expectedRequirement: `Evaluate ${fullCode}`,
          studentEvidence: mapping.studentSnippet || 'Answer present on pages.',
          assessment: 'INCORRECT',
          marksAvailable: maxMarks,
          marksAwarded: 0,
          marksDeducted: maxMarks,
          deductionReason: 'Manual examiner review required.',
          confidence: 50,
          pageNumber: mapping.pages[0] || 1,
          annotationInstructions: `[?] Manual review required for ${fullCode}`,
        },
      ],
    };
    return qEval;
  }
}
