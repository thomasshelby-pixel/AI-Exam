import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { parseAndValidateQuestionChunkOutput } from '../services/questionChunkEvaluator.js';
import { applyMultiModeMarkingPhilosophy } from '../services/multiModeMarkingEngine.js';
import {
  buildAnswerSheetCoverageMap,
  clearCoverageMapCache,
  type PageCoverageRecord,
} from '../services/answerSheetCoverageService.js';

function chunkPayload(overrides: Record<string, unknown> = {}) {
  return {
    marksAwarded: 2,
    status: 'partially_correct',
    reasonForDeduction: 'One working step was incomplete.',
    detailedFeedback: 'The answer contains a partly correct working.',
    confidence: 95,
    technicalEvaluation: 'Checked against the official answer.',
    finalConclusionAssessment: 'The conclusion is incomplete.',
    markingComponents: [
      {
        componentId: 'Q2a_c1',
        componentType: 'WORKING',
        expectedRequirement: 'Show the required working.',
        studentEvidence: 'The candidate showed a relevant working.',
        assessment: 'PARTIALLY_CORRECT',
        marksAvailable: 4,
        marksAwarded: 2,
        marksDeducted: 2,
        deductionReason: 'The working is incomplete.',
        supportingProvision: '',
        confidence: 95,
        pageNumber: 1,
        annotationInstructions: '2/4 for working.',
      },
    ],
    ...overrides,
  };
}

async function createPdf(pageCount: number): Promise<Buffer> {
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index++) {
    document.addPage([595.28, 841.89]);
  }
  return Buffer.from(await document.save());
}

async function run() {
  // A clearly attributable ICAI examiner zero must override generic partial-credit rules.
  const checkedZero = parseAndValidateQuestionChunkOutput(
    JSON.stringify(chunkPayload({
      icaiExaminerZeroVisible: true,
      icaiExaminerZeroEvidence: 'Red 0/4 written in the right margin beside Q2(a).',
    })),
    4,
    { materialType: 'PYQ' },
  );
  assert.equal(checkedZero.marksAwarded, 0);
  assert.equal(checkedZero.status, 'incorrect');
  assert.equal(checkedZero.markingComponents[0].marksAwarded, 0);
  assert.equal(checkedZero.markingComponents[0].marksDeducted, 4);
  assert.match(checkedZero.reasonForDeduction, /explicitly awarded 0/i);
  assert.match(checkedZero.markingComponents[0].deductionReason, /right margin beside Q2\\(a\\)/i);

  // Moderate/lenient mode must not restore marks through consequential-credit logic.
  const modeLockedQuestion: any = {
    questionNumber: '2',
    subQuestion: 'a',
    canonicalId: 'Q2(a)',
    maximumMarks: 4,
    marksAwarded: 0,
    marksLost: 4,
    status: 'incorrect',
    detailedFeedback: checkedZero.detailedFeedback,
    reasonForDeduction: checkedZero.reasonForDeduction,
    icaiExaminerZeroVisible: true,
    flags: ['ICAI_EXAMINER_ZERO_CONFIRMED'],
    consequentialErrorDetected: true,
    markingComponents: checkedZero.markingComponents,
  };
  for (const mode of ['standard', 'strict', 'lenient'] as const) {
    const modeResult = applyMultiModeMarkingPhilosophy([modeLockedQuestion], mode, 100);
    assert.equal(modeResult.activeQuestions[0].marksAwarded, 0, `ICAI zero must remain zero in ${mode} mode`);
    assert.equal(modeResult.activeTotalMarks, 0, `ICAI zero total must remain zero in ${mode} mode`);
  }

  // A non-zero examiner score remains eligible for normal question-wise evaluation;
  // the override runs only for explicit, attributable zero marks.
  const normalPyq = parseAndValidateQuestionChunkOutput(
    JSON.stringify(chunkPayload({
      icaiExaminerZeroVisible: false,
      icaiExaminerZeroEvidence: 'No examiner-awarded numeric zero was visible beside Q2(a).',
    })),
    4,
    { materialType: 'PYQ' },
  );
  assert.equal(normalPyq.marksAwarded, 2);
  assert.equal(normalPyq.markingComponents[0].marksAwarded, 2);

  // MTP must retain its existing response contract and normal step marks.
  const unchangedMtp = parseAndValidateQuestionChunkOutput(
    JSON.stringify(chunkPayload()),
    4,
    { materialType: 'MTP' },
  );
  assert.equal(unchangedMtp.marksAwarded, 2);
  assert.equal(unchangedMtp.markingComponents[0].marksAwarded, 2);

  assert.throws(
    () => parseAndValidateQuestionChunkOutput(
      JSON.stringify(chunkPayload({
        icaiExaminerZeroVisible: true,
        icaiExaminerZeroEvidence: '0',
      })),
      4,
      { materialType: 'PYQ' },
    ),
    /ICAI_ZERO_EVIDENCE_INVALID/,
  );

  // A page with visible handwriting but no safe first-pass identity gets one
  // targeted re-read. The recovered answer is included instead of being dropped.
  clearCoverageMapCache();
  const pdf = await createPdf(2);
  const paperStructure: any = {
    paperTitle: 'Advanced Accounting PYQ',
    totalPaperMaxMarks: 100,
    questions: [],
    subQuestions: [
      {
        fullQuestionCode: 'Q1(a)',
        questionNumber: '1',
        subQuestionNumber: 'a',
        maximumMarks: 4,
        isMcq: false,
        questionText: 'Explain the accounting treatment under the given standard.',
        suggestedAnswerAnchor: 'The correct accounting treatment is required.',
      },
      {
        fullQuestionCode: 'Q2(a)',
        questionNumber: '2',
        subQuestionNumber: 'a',
        maximumMarks: 4,
        isMcq: false,
        questionText: 'Prepare the required statement and working notes.',
        suggestedAnswerAnchor: 'The statement and supporting working notes are required.',
      },
    ],
    mcqs: [],
  };

  const recoveryCalls: string[] = [];
  const coverage = await buildAnswerSheetCoverageMap(pdf, paperStructure, {
    enableTargetedRecovery: true,
    analyzePage: async (
      _pageBase64,
      pageNumber,
      _paper,
      _totalPages,
      _previous,
      _prior,
      recoveryMode = false,
    ): Promise<PageCoverageRecord> => {
      recoveryCalls.push(`page-${pageNumber}-${recoveryMode ? 'recovery' : 'first'}`);

      if (pageNumber === 1 && !recoveryMode) {
        return {
          pageNumber,
          status: 'QUESTION_NOT_IDENTIFIED',
          detectedQuestions: [],
          rawSummary: 'Handwriting is present, but the first pass could not map the answer block.',
          hasHandwriting: true,
        };
      }

      const code = pageNumber === 1 ? 'Q2(a)' : 'Q1(a)';
      const questionNumber = pageNumber === 1 ? '2' : '1';
      return {
        pageNumber,
        status: 'ATTEMPTED_READABLE',
        detectedQuestions: [{
          fullQuestionCode: code,
          questionNumber,
          subQuestionNumber: 'a',
          status: 'ATTEMPTED_READABLE',
          isContinuation: false,
          pageNumber,
          snippet: pageNumber === 1
            ? 'A statement with supporting accounting working notes.'
            : 'The required accounting treatment and journal entry.',
          isMcq: false,
        } as any],
        rawSummary: `${code} identified on recovery/read.`,
        hasHandwriting: true,
      };
    },
  });

  assert.deepEqual(recoveryCalls, ['page-1-first', 'page-1-recovery', 'page-2-first']);
  assert.deepEqual(
    coverage.attemptedQuestions.map((question) => question.fullQuestionCode).sort(),
    ['Q1(a)', 'Q2(a)'],
  );
  assert.deepEqual(coverage.unmappedPages, []);
  assert.equal(coverage.is100PercentCovered, true);

  console.log('✅ PYQ checked-copy zero override and targeted answer-page recovery tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
