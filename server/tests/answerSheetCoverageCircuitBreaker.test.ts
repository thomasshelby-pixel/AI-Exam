import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  buildAnswerSheetCoverageMap,
  clearCoverageMapCache,
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
