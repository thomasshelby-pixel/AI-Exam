import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  buildAnswerSheetCoverageMap,
  buildPageCoveragePrompt,
  clearCoverageMapCache,
  parseAndValidatePageCoverageOutput,
  type PageCoverageRecord,
} from '../services/answerSheetCoverageService.js';

async function createPdf(pageCount: number): Promise<Buffer> {
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index++) {
    document.addPage([595.28, 841.89]);
  }
  return Buffer.from(await document.save());
}

async function run() {
  clearCoverageMapCache();
  const pdf = await createPdf(4);
  const paperStructure: any = {
    paperTitle: 'Advanced Accounting Model Test 1',
    totalPaperMaxMarks: 100,
    questions: [],
    subQuestions: [
      {
        fullQuestionCode: 'Q1(a)',
        questionNumber: '1',
        subQuestionNumber: 'a',
        maximumMarks: 5,
        isMcq: false,
      },
    ],
    mcqs: [],
  };

  // Universal prompt regression: no subject-specific template; margin/circled labels,
  // faint cursive, continuation pages and candidate-ID validation must be explicit.
  const pagePrompt = buildPageCoveragePrompt({
    pageNumber: 7,
    totalPages: 19,
    paperStructure: {
      ...paperStructure,
      subQuestions: [{
        ...paperStructure.subQuestions[0],
        topic: 'Accounting treatment and journal entries',
      }],
    } as any,
    previousActiveQuestion: 'Q2(a)',
  });
  assert.match(pagePrompt, /Foundation,\s*Intermediate and Final/i);
  assert.match(pagePrompt, /every subject/i);
  assert.match(pagePrompt, /left margin/i);
  assert.match(pagePrompt, /circled\/margin-written numbers/i);
  assert.match(pagePrompt, /faint, cursive/i);
  assert.match(pagePrompt, /PREVIOUS PAGE ACTIVE QUESTION: Q2\(a\)/i);
  assert.match(pagePrompt, /Never infer identity from PDF page index/i);
  assert.match(pagePrompt, /Q1\(a\) — 5 marks — Accounting treatment and journal entries/i);

  const parsedPage = parseAndValidatePageCoverageOutput(JSON.stringify({
    status: 'ATTEMPTED_PARTIALLY_READABLE',
    hasHandwriting: true,
    summary: 'A handwritten answer continues.',
    questionLabelEvidence: 'Circled 6 in the left margin above the journal entry.',
    readingConfidence: 0.82,
    detectedQuestions: [{
      questionNumber: '6',
      subQuestion: null,
      parentQuestionNumberVisible: true,
      isContinuation: false,
      snippet: 'Journal entry with debit and credit columns.',
    }],
    mcqSelections: {},
  }));
  assert.equal(parsedPage.detectedQuestions[0].questionNumber, '6');
  assert.equal(parsedPage.questionLabelEvidence, 'Circled 6 in the left margin above the journal entry.');
  assert.equal(parsedPage.readingConfidence, 0.82);

  let providerCalls = 0;
  const analyzePage = async (_base64: string, pageNumber: number): Promise<PageCoverageRecord> => {
    providerCalls++;
    if (pageNumber === 1) {
      return {
        pageNumber,
        status: 'ATTEMPTED_READABLE',
        detectedQuestions: [{
          fullQuestionCode: 'Q1(a)',
          questionNumber: '1',
          subQuestionNumber: 'a',
          status: 'ATTEMPTED_READABLE',
          isContinuation: false,
          pageNumber,
          isMcq: false,
        }],
        rawSummary: 'Q1(a) identified.',
        hasHandwriting: true,
      };
    }
    return {
      pageNumber,
      status: 'QUESTION_NOT_IDENTIFIED',
      detectedQuestions: [],
      rawSummary: 'AI fallback chain exhausted.',
      hasHandwriting: true,
      analysisFailure: {
        code: 'AI_QUOTA_OR_BILLING',
        message: 'Provider quota exhausted.',
      },
    };
  };

  const coverage = await buildAnswerSheetCoverageMap(pdf, paperStructure, { analyzePage });

  assert.equal(providerCalls, 2, 'Stop invoking AI after the first page-level provider failure.');
  assert.equal(coverage.attemptedQuestions.length, 1, 'Preserve a question mapped before the provider failure.');
  assert.equal(coverage.attemptedQuestions[0].fullQuestionCode, 'Q1(a)');
  assert.deepEqual(coverage.unmappedPages, [2, 3, 4], 'Flag failed and skipped pages for review.');
  assert.equal(coverage.pages[1].analysisFailure?.code, 'AI_QUOTA_OR_BILLING');
  assert.equal(coverage.pages[2].analysisFailure?.code, 'SKIPPED_AFTER_PROVIDER_FAILURE');
  assert.equal(coverage.pages[3].analysisFailure?.failedOnPage, 2);
  assert.match(coverage.pages[2].rawSummary, /not analysed/i);

  clearCoverageMapCache();
  console.log('✅ Page coverage circuit-break and diagnostic regression passed (no external AI calls).');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
