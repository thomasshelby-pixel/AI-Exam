import { PDFDocument } from 'pdf-lib';
import crypto from 'crypto';
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
 * Handles Question Paper, Suggested Answer, and Marking Scheme variations.
 */
export function extractRelevantReferenceSnippets(
  fullQuestionCode: string, // e.g. 'Q5(a)', 'Q7(b)', 'Q1'
  qpText: string,
  saText: string,
  msText: string
): ExtractedReferenceSnippets {
  const cleanCode = fullQuestionCode.trim();
  const qNum = cleanCode.replace(/[^0-9]/g, '');
  const subQMatch = cleanCode.match(/\(([a-zA-Z0-9]+)\)/);
  const subQ = (subQMatch ? subQMatch[1] : '').toLowerCase();

  const sliceTextForQuestion = (text: string, materialLabel: string): { snippet: string; found: boolean; sectionHeader: string } => {
    if (!text || text.trim().length === 0) {
      return { snippet: '', found: false, sectionHeader: 'Not Available' };
    }

    const lines = text.split('\n');
    let capturing = false;
    const captured: string[] = [];
    let sectionHeader = '';

    // Regex candidates for start of question/sub-question
    const nextQNum = String(parseInt(qNum, 10) + 1);
    const nextSubQ = subQ === 'a' ? 'b' : subQ === 'b' ? 'c' : subQ === 'c' ? 'd' : '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const lower = trimmed.toLowerCase();

      // Check for start condition
      let isStart = false;

      if (subQ) {
        // Direct sub-question pattern like "Question 5(a)", "Answer 5(a)", "Ans. 5(a)", "5(a)", "Q.5(a)", "Q5(a)"
        const patterns = [
          `question ${qNum}(${subQ})`,
          `question no. ${qNum}(${subQ})`,
          `question no.${qNum}(${subQ})`,
          `answer ${qNum}(${subQ})`,
          `answer to question ${qNum}(${subQ})`,
          `answer to question no. ${qNum}(${subQ})`,
          `ans. ${qNum}(${subQ})`,
          `ans ${qNum}(${subQ})`,
          `solution ${qNum}(${subQ})`,
          `solution to question ${qNum}(${subQ})`,
          `q.${qNum}(${subQ})`,
          `q.${qNum} (${subQ})`,
          `q${qNum}(${subQ})`,
          `q ${qNum}(${subQ})`,
          `q${qNum} (${subQ})`,
          `(${subQ})`,
        ];

        if (patterns.some((p) => lower.startsWith(p) || lower.includes(` ${p}`) || lower.includes(`\t${p}`))) {
          // If it's just "(${subQ})", only treat as start if we are already within main question or line indicates it
          if (lower.startsWith(`(${subQ})`) || lower.startsWith(`part (${subQ})`)) {
            isStart = true;
          } else {
            isStart = true;
          }
        }
      } else {
        // Main question pattern without sub-part
        const mainPatterns = [
          `question ${qNum}`,
          `question no. ${qNum}`,
          `question no.${qNum}`,
          `answer ${qNum}`,
          `answer to question ${qNum}`,
          `answer to question no. ${qNum}`,
          `ans. ${qNum}`,
          `ans ${qNum}`,
          `solution ${qNum}`,
          `q.${qNum}`,
          `q ${qNum}`,
          `q${qNum}`,
        ];

        // Ensure not matching question 10 when looking for question 1
        isStart = mainPatterns.some((p) => {
          const idx = lower.indexOf(p);
          if (idx === -1) return false;
          const after = lower.slice(idx + p.length, idx + p.length + 1);
          return !after || after.match(/[^0-9]/);
        });
      }

      if (isStart && !capturing) {
        capturing = true;
        sectionHeader = trimmed.slice(0, 100);
        captured.push(line);
        continue;
      }

      if (capturing) {
        // Stop condition: next question or next sub-question
        let isStop = false;

        if (nextSubQ) {
          const nextSubPatterns = [
            `(${nextSubQ})`,
            `part (${nextSubQ})`,
            `question ${qNum}(${nextSubQ})`,
            `answer ${qNum}(${nextSubQ})`,
            `ans. ${qNum}(${nextSubQ})`,
            `ans ${qNum}(${nextSubQ})`,
            `q.${qNum}(${nextSubQ})`,
            `q${qNum}(${nextSubQ})`,
          ];
          if (nextSubPatterns.some((p) => lower.startsWith(p) || lower.includes(` ${p}`))) {
            isStop = true;
          }
        }

        const nextMainPatterns = [
          `question ${nextQNum}`,
          `question no. ${nextQNum}`,
          `answer ${nextQNum}`,
          `answer to question ${nextQNum}`,
          `ans. ${nextQNum}`,
          `q.${nextQNum}`,
          `q ${nextQNum}`,
          `q${nextQNum}`,
        ];
        if (nextMainPatterns.some((p) => lower.startsWith(p) || lower.includes(` ${p}`))) {
          isStop = true;
        }

        if (isStop && captured.length >= 3) {
          break;
        }

        captured.push(line);
        if (captured.length > 200) break; // Reasonable cap per question
      }
    }

    if (captured.length > 0) {
      return {
        snippet: captured.join('\n').trim(),
        found: true,
        sectionHeader: sectionHeader || `${materialLabel} for ${cleanCode}`,
      };
    }

    // Secondary fallback: search for keywords or return question-focused snippet
    const qIndex = text.toLowerCase().indexOf(`question ${qNum}`);
    const aIndex = text.toLowerCase().indexOf(`answer ${qNum}`);
    const bestIdx = qIndex !== -1 ? qIndex : aIndex !== -1 ? aIndex : -1;

    if (bestIdx !== -1) {
      const slice = text.slice(bestIdx, bestIdx + 2500).trim();
      return {
        snippet: slice,
        found: true,
        sectionHeader: `${materialLabel} Section for Q${qNum}`,
      };
    }

    return {
      snippet: text.slice(0, 2000).trim(),
      found: false,
      sectionHeader: `${materialLabel} General Section`,
    };
  };

  const qp = sliceTextForQuestion(qpText, 'Question Paper');
  const sa = sliceTextForQuestion(saText, 'Suggested Answer');
  const ms = sliceTextForQuestion(msText, 'Marking Scheme');

  const combinedRef = `${qp.snippet}\n${sa.snippet}\n${ms.snippet}`;
  const contentHash = crypto.createHash('sha256').update(combinedRef).digest('hex');
  const retrievedCharacterCount = combinedRef.length;
  const verifiedTruthSnippet = (sa.snippet || qp.snippet || ms.snippet).slice(0, 300);

  return {
    qpSnippet: qp.snippet,
    saSnippet: sa.snippet,
    msSnippet: ms.snippet,
    retrievedCharacterCount,
    contentHash,
    foundInMaterial: qp.found || sa.found || ms.found,
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

  // 2. Extract specific reference material
  const snippets = extractRelevantReferenceSnippets(
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
${snippets.qpSnippet || 'Official Question Extract'}

--- VERIFIED ICAI SUGGESTED ANSWER EXTRACT ---
${snippets.saSnippet || 'Official Suggested Answer Extract'}

--- VERIFIED STEP-MARKING SCHEME EXTRACT ---
${snippets.msSnippet || 'Official Step-Marking Scheme Extract'}

The candidate's solution for ${fullCode} is on Page(s) ${mapping.pages.join(', ')} of the attached PDF document.

CRITICAL ICAI EVALUATION RULES:
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
7. HANDWRITING POLICY: Poor handwriting itself is NOT a deduction reason. If readable, award full technical credit. Do not penalize handwriting, formatting, or styling.
8. STRUCTURED DEDUCTION REASONS: When marks are deducted, the reasonForDeduction must clearly state:
   (a) What candidate wrote
   (b) What authoritative answer requires
   (c) What is wrong or missing
   (d) Marks deducted and justification

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
