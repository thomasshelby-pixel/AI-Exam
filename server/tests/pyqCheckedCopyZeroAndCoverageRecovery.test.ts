import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { parseAndValidateQuestionChunkOutput } from '../services/questionChunkEvaluator.js';
import { applyMultiModeMarkingPhilosophy } from '../services/multiModeMarkingEngine.js';
import { evaluateZeroMarkSafetyGate, filterAndRejectPresentationDeductions } from '../services/evaluationIntegrityEngine.js';
import { auditNumericalReasoningIntegrity } from '../services/sourceGroundedTransformationService.js';
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
  // Existing ICAI examiner scores (including a written zero) are annotations, not the AI score.
  // The PYQ evaluator must independently grade the same candidate evidence.
  const checkedCopyWithZero = parseAndValidateQuestionChunkOutput(
    JSON.stringify(chunkPayload({
      icaiExaminerZeroVisible: true,
      icaiExaminerZeroEvidence: 'Red 0/4 written in the right margin beside Q2(a).',
    })),
    4,
    { materialType: 'PYQ' },
  );
  assert.equal(checkedCopyWithZero.marksAwarded, 2);
  assert.equal(checkedCopyWithZero.status, 'partially_correct');
  assert.equal(checkedCopyWithZero.markingComponents[0].marksAwarded, 2);

  // New PYQ model output no longer has to inspect or echo examiner-zero metadata.
  const checkedCopyWithoutExaminerMetadata = parseAndValidateQuestionChunkOutput(
    JSON.stringify(chunkPayload()),
    4,
    { materialType: 'PYQ' },
  );
  assert.equal(checkedCopyWithoutExaminerMetadata.marksAwarded, 2);

  // A genuine AI zero is still checked by the normal academic partial-credit safety gate.
  const creditworthyZeroGate = evaluateZeroMarkSafetyGate({
    questionNumber: '2',
    subQuestion: 'a',
    maxMarks: 4,
    awardedMarks: 0,
    status: 'incorrect',
    components: [{
      ...checkedCopyWithZero.markingComponents[0],
      marksAwarded: 0,
      marksDeducted: 4,
      assessment: 'PARTIALLY_CORRECT',
    }],
    studentEvidence: 'The candidate showed a relevant working.',
    detailedFeedback: 'A partly correct step is visible in the answer.',
    technicalEvaluation: 'The candidate demonstrated a partially correct calculation method.',
    reasonForDeduction: 'The first score was zero.',
    isMcq: false,
  });
  assert.equal(creditworthyZeroGate.isZeroAllowed, false);
  assert.equal(creditworthyZeroGate.suggestedAwardedMarks, 2);

  // Presentation deductions remain governed by the marking rules, not a stale zero lock.
  const presentationComponent = {
    ...checkedCopyWithZero.markingComponents[0],
    componentType: 'PRESENTATION',
    marksAwarded: 0,
    marksDeducted: 4,
    deductionReason: 'Presentation differs from the required table format.',
  } as any;
  const filteredPresentation = filterAndRejectPresentationDeductions([presentationComponent], false);
  assert.equal(filteredPresentation.components[0].marksAwarded, 4);
  assert.equal(filteredPresentation.rejectedDeductions.length, 1);

  // Selected marking mode independently controls the final PYQ score.
  const modeIndependentQuestion: any = {
    questionNumber: '2',
    subQuestion: 'a',
    canonicalId: 'Q2(a)',
    maximumMarks: 4,
    marksAwarded: 2,
    marksLost: 2,
    status: 'partially_correct',
    detailedFeedback: checkedCopyWithZero.detailedFeedback,
    reasonForDeduction: 'One working step was incomplete.',
    consequentialErrorDetected: false,
    markingComponents: checkedCopyWithZero.markingComponents,
  };
  const standardResult = applyMultiModeMarkingPhilosophy([modeIndependentQuestion], 'standard', 100);
  const strictResult = applyMultiModeMarkingPhilosophy([modeIndependentQuestion], 'strict', 100);
  const moderateResult = applyMultiModeMarkingPhilosophy([modeIndependentQuestion], 'lenient', 100);
  assert.equal(standardResult.activeQuestions[0].marksAwarded, 2);
  assert.equal(strictResult.activeQuestions[0].marksAwarded, 1);
  assert.equal(moderateResult.activeQuestions[0].marksAwarded, 3);
  assert.equal(standardResult.activeTotalMarks, 2);
  assert.equal(strictResult.activeTotalMarks, 1);
  assert.equal(moderateResult.activeTotalMarks, 3);

  // Consequential-marking audit must not convert a PYQ score to ICAI's annotated zero.
  const numericalAudit = auditNumericalReasoningIntegrity([modeIndependentQuestion]);
  assert.equal(numericalAudit.auditedQuestions[0].marksAwarded, 2);

  // MTP continues to use the same source-independent component score.
  const unchangedMtp = parseAndValidateQuestionChunkOutput(
    JSON.stringify(chunkPayload()),
    4,
    { materialType: 'MTP' },
  );
  assert.equal(unchangedMtp.marksAwarded, 2);
  assert.equal(unchangedMtp.markingComponents[0].marksAwarded, 2);

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
