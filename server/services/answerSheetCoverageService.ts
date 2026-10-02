import { PDFDocument } from 'pdf-lib';
import crypto from 'crypto';
import { getGemini, generateContentWithResilience } from '../gemini.js';
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

export interface PageCoverageRecord {
  pageNumber: number;
  status: PageAttemptStatus;
  detectedQuestions: DetectedQuestionOccurrence[];
  rawSummary: string;
  hasHandwriting: boolean;
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
    if (nonMcqs.length > 0) {
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

  const coverageResult: AnswerCoverageMap = {
    totalPages,
    pages: pageRecords,
    attemptedQuestions,
    allDetectedCodes,
    unmappedPages,
    unclearPages,
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
  const ai = getGemini();

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
1. Identify all question/sub-question headings attempted on this page (e.g. from valid questions above).
2. If this page is a continuation of the previous page's answer and does NOT start a new question header, mark isContinuation: true and questionNumber matching "${previousActiveQuestion || ''}".
3. If multiple sub-questions are answered on this page (e.g. Q4(a) followed by Q4(b)), report ALL of them in detectedQuestions.
4. Identify any MCQ answers written on this page with selected options (e.g. { "1": "C", "2": "D" }).
5. Classify page status:
   - ATTEMPTED_READABLE: Clear student handwritten solution
   - ATTEMPTED_PARTIALLY_READABLE: Readable with minor handwriting difficulty
   - ATTEMPTED_UNCLEAR: Heavily illegible or blurry
   - CLEARLY_UNATTEMPTED: Blank page or crossed out entirely
   - QUESTION_NOT_IDENTIFIED: Content is present but question number cannot be identified

Return strictly valid JSON with this schema:
{
  "status": "ATTEMPTED_READABLE" | "ATTEMPTED_PARTIALLY_READABLE" | "ATTEMPTED_UNCLEAR" | "CLEARLY_UNATTEMPTED" | "QUESTION_NOT_IDENTIFIED",
  "hasHandwriting": boolean,
  "summary": string,
  "detectedQuestions": [
    {
      "questionNumber": string,
      "subQuestion": string | null,
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
    const res = await generateContentWithResilience(ai, {
      contents: [
        { inlineData: { mimeType: 'application/pdf', data: pageBase64 } },
        { text: prompt },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    let clean = res.text?.trim() || '{}';
    if (clean.startsWith('```json')) clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    const raw: any = JSON.parse(clean);

    const detectedQuestions: DetectedQuestionOccurrence[] = [];
    const knownStatuses: PageAttemptStatus[] = [
      'ATTEMPTED_READABLE',
      'ATTEMPTED_PARTIALLY_READABLE',
      'ATTEMPTED_UNCLEAR',
      'CLEARLY_UNATTEMPTED',
      'QUESTION_NOT_IDENTIFIED',
      'PAGE_UNREADABLE',
    ];
    let status: PageAttemptStatus = knownStatuses.includes(raw.status)
      ? raw.status
      : 'QUESTION_NOT_IDENTIFIED';
    const hasHandwriting = raw.hasHandwriting !== false;
    const summary = raw.summary || `Page ${pageNumber} analysis`;

    if (Array.isArray(raw.detectedQuestions)) {
      for (const dq of raw.detectedQuestions) {
        const rawQStr = String(dq.questionNumber || '').trim();
        const rawSubStr = dq.subQuestion ? String(dq.subQuestion).trim() : '';
        const canonId = toCanonicalQuestionId(rawQStr, rawSubStr, paperStructure.subQuestions);
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

    // Do not infer a question from page position when the image was readable
    // but the model could not identify a reliable heading.
    if (detectedQuestions.length === 0 && status !== 'CLEARLY_UNATTEMPTED') {
      status = 'QUESTION_NOT_IDENTIFIED';
    }

    return {
      pageNumber,
      status,
      detectedQuestions,
      rawSummary: summary,
      hasHandwriting,
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

