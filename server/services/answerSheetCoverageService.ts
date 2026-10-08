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
2. For EVERY detected descriptive question, report parentQuestionNumberVisible=true only when that parent number is visibly written on this page. If only a child label such as "(a)" is visible, report false; do not guess a parent number from the question paper or page number.
3. If this page is a continuation of the previous page's answer and does NOT start a new question header, mark isContinuation: true and identify the previous active question.
4. If multiple sub-questions are answered on this page (e.g. Q4(a) followed by Q4(b)), report ALL of them in detectedQuestions.
5. Identify any MCQ answers written on this page with selected options (e.g. { "1": "C", "2": "D" }).
6. Classify page status:
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
    const res = await generateContentWithResilience(ai, {
      contents: [
        { inlineData: { mimeType: 'application/pdf', data: pageBase64 } },
        { text: prompt },
      ],
      config: {
        responseMimeType: 'application/json',
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
    let mappingReviewReason: string | undefined;
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

