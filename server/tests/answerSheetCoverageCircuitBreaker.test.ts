import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  buildAnswerSheetCoverageMap,
  buildPageCoveragePrompt,
  clearCoverageMapCache,
  parseAndValidatePageCoverageOutput,
  resolveContextualQuestionIdentity,
  resolveMcqSelectionNumber,
  type PageCoverageRecord,
} from '../services/answerSheetCoverageService.js';
import { buildCanonicalQuestionInventory, detectIndependentAttempts } from '../services/canonicalQuestionInventoryService.js';
import { getAuthoritativePaperStructure } from '../services/paperStructureService.js';

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
        questionText: 'Explain the accounting treatment of an impairment loss under AS 28.',
        suggestedAnswerAnchor: 'Recoverable amount is compared with carrying amount; recognize the impairment loss in profit and loss.',
      }],
    } as any,
    previousActiveQuestion: 'Q2(a)',
  });
  assert.match(pagePrompt, /Foundation,\s*Intermediate and Final/i);
  assert.match(pagePrompt, /every subject/i);
  assert.match(pagePrompt, /left margin/i);
  assert.match(pagePrompt, /circled\/margin-written numbers/i);
  assert.match(pagePrompt, /faint, cursive/i);
  assert.match(pagePrompt, /PREVIOUS PAGE ACTIVE QUESTION \(weak clue only; not a question-order assumption\): Q2\(a\)/i);
  assert.match(pagePrompt, /Never infer identity from PDF page index/i);
  assert.match(pagePrompt, /Do not classify descriptive question labels/i);
  assert.match(pagePrompt, /return an empty mcqSelections object/i);
  assert.match(pagePrompt, /Q1\(a\) — 5 marks — Accounting treatment and journal entries/i);
  assert.match(pagePrompt, /EXACT QUESTION PAPER TEXT: Explain the accounting treatment of an impairment loss under AS 28/i);
  assert.match(pagePrompt, /SUGGESTED ANSWER REFERENCE: Recoverable amount is compared/i);
  assert.match(pagePrompt, /Students may answer questions in ANY order/i);
  assert.match(pagePrompt, /Page 1 is not Q1; Page 2 is not Q2/i);
  assert.match(pagePrompt, /A continuation can refer to ANY earlier question/i);

  const sourceStructure = getAuthoritativePaperStructure({
    subjectName: 'Advanced Accounting',
    paper: 'Paper 1',
    materialType: 'MODEL_TEST_PAPER',
    questionPaperText: [
      'ADVANCED ACCOUNTING - QUESTION PAPER',
      'QUESTION 1(a) - 5 Marks',
      'Explain the accounting treatment of impairment loss under AS 28.',
      'QUESTION 2(a) - 5 Marks',
      'Prepare a Balance Sheet after considering the given adjustments.',
    ].join('\n'),
    suggestedAnswersText: [
      'SUGGESTED ANSWERS',
      'QUESTION 1(a)',
      'Compare carrying amount with recoverable amount and recognise impairment loss.',
      'QUESTION 2(a)',
      'Prepare the Balance Sheet with correct classification of assets and liabilities.',
    ].join('\n'),
    markingSchemeText: 'QUESTION 1(a) - 5 Marks\nQUESTION 2(a) - 5 Marks',
  });
  const sourcedQ1 = sourceStructure.subQuestions.find((question) => question.fullQuestionCode === 'Q1(a)');
  assert.ok(sourcedQ1?.questionText?.includes('impairment loss'), 'The exact QP question wording must be attached to the authoritative ID.');
  assert.ok(sourcedQ1?.suggestedAnswerAnchor?.includes('recoverable amount'), 'The selected Suggested Answer must be attached as a reference anchor.');

  const nestedMcqStructure: any = [
    { fullQuestionCode: 'MCQ1', questionNumber: '1', subQuestionNumber: 'MCQ', isMcq: true, sourceQuestionLabel: 'Question 1(i)' },
    { fullQuestionCode: 'MCQ4', questionNumber: '4', subQuestionNumber: 'MCQ', isMcq: true, sourceQuestionLabel: 'Question 1(iv)' },
    { fullQuestionCode: 'MCQ13', questionNumber: '13', subQuestionNumber: 'MCQ', isMcq: true, sourceQuestionLabel: 'Question 4' },
  ];
  assert.equal(resolveMcqSelectionNumber('Q1(iv)', nestedMcqStructure), '4');
  assert.equal(resolveMcqSelectionNumber('Question 4', nestedMcqStructure), '13');
  assert.equal(resolveMcqSelectionNumber('MCQ4', nestedMcqStructure), '4');
  assert.equal(resolveMcqSelectionNumber('Q1', nestedMcqStructure), undefined, 'A parent MCQ group must not be mistaken for its first nested MCQ.');
  assert.equal(resolveMcqSelectionNumber('1(iv)', nestedMcqStructure), '4');
  assert.equal(resolveMcqSelectionNumber('1', nestedMcqStructure), '1', 'A truly flat MCQ1 response remains supported.');

  const nestedMcqPrompt = buildPageCoveragePrompt({
    pageNumber: 3,
    totalPages: 12,
    paperStructure: {
      ...paperStructure,
      subQuestions: [],
      mcqs: nestedMcqStructure.map((question: any) => ({
        ...question,
        maximumMarks: 2,
        officialKey: question.questionNumber === '4' ? 'C' : 'A',
        suggestedAnswerAnchor: question.sourceQuestionLabel + ': official key verified.',
      })),
    } as any,
  });
  assert.match(nestedMcqPrompt, /MCQ4 — source label: Question 1\(iv\)/);
  assert.match(nestedMcqPrompt, /MCQ13 — source label: Question 4/);
  assert.match(nestedMcqPrompt, /Question 1\(iv\).*MCQ4/s);
  assert.match(nestedMcqPrompt, /Question 4.*MCQ13/s);

  const nestedSelections = parseAndValidatePageCoverageOutput(JSON.stringify({
    status: 'ATTEMPTED_READABLE',
    hasHandwriting: true,
    detectedQuestions: [],
    mcqSelections: { 'Question 1(iv)': 'C', 'Question 4': 'B' },
  }));
  assert.equal(nestedSelections.mcqSelections['1(iv)'], 'C');
  assert.equal(nestedSelections.mcqSelections['4'], 'B');

  const ambiguousParentSelection = parseAndValidatePageCoverageOutput(JSON.stringify({
    status: 'ATTEMPTED_READABLE',
    hasHandwriting: true,
    detectedQuestions: [],
    mcqSelections: { 'Q1': 'C' },
  }));
  assert.equal(ambiguousParentSelection.mcqSelections['Q1'], 'C', 'A parent-labelled Q1 must not be flattened into MCQ1.');
  assert.equal(resolveMcqSelectionNumber('Q1', nestedMcqStructure), undefined);

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
      authoritativeQuestionCode: 'Q1(a)',
      mappingBasis: 'MATERIAL_CONTENT',
      labelMismatch: true,
      snippet: 'Journal entry with debit and credit columns.',
    }],
    mcqSelections: {},
  }));
  assert.equal(parsedPage.detectedQuestions[0].questionNumber, '6');
  assert.equal(parsedPage.detectedQuestions[0].authoritativeQuestionCode, 'Q1(a)');
  assert.equal(parsedPage.detectedQuestions[0].mappingBasis, 'MATERIAL_CONTENT');
  assert.equal(parsedPage.detectedQuestions[0].labelMismatch, true);
  assert.equal(parsedPage.questionLabelEvidence, 'Circled 6 in the left margin above the journal entry.');
  assert.equal(parsedPage.readingConfidence, 0.82);
  assert.deepEqual(parsedPage.mcqSelections, {}, 'A descriptive answer with no visible MCQ choice must not create MCQ attempts.');
  assert.equal(parsedPage.detectedQuestions.some((question) => String(question.questionNumber).startsWith('MCQ')), false);

  const arbitraryOrderStructure: any = {
    paperTitle: 'Advanced Accounting Model Test',
    totalPaperMaxMarks: 100,
    questions: [],
    subQuestions: [
      { fullQuestionCode: 'Q1(a)', questionNumber: '1', subQuestionNumber: 'a', maximumMarks: 5, isMcq: false, topic: 'Impairment loss' },
      { fullQuestionCode: 'Q2(a)', questionNumber: '2', subQuestionNumber: 'a', maximumMarks: 5, isMcq: false, topic: 'Balance sheet' },
      { fullQuestionCode: 'Q2(b)', questionNumber: '2', subQuestionNumber: 'b', maximumMarks: 5, isMcq: false, topic: 'Journal entries' },
      { fullQuestionCode: 'Q2(d)', questionNumber: '2', subQuestionNumber: 'd', maximumMarks: 2, isMcq: false, topic: 'Short-term provision' },
      { fullQuestionCode: 'Q3(a)', questionNumber: '3', subQuestionNumber: 'a', maximumMarks: 5, isMcq: false, topic: 'Revenue recognition' },
    ],
    mcqs: [],
  };

  // Regression: "UNCERTAIN" is a status, never a canonical question ID.
  const uncertainVisibleLabelPage = parseAndValidatePageCoverageOutput(JSON.stringify({
    status: 'ATTEMPTED_READABLE',
    hasHandwriting: true,
    detectedQuestions: [{
      questionNumber: '2',
      subQuestion: null,
      parentQuestionNumberVisible: true,
      isContinuation: false,
      authoritativeQuestionCode: 'UNCERTAIN',
      mappingBasis: 'UNCERTAIN',
      snippet: 'Balance Sheet with equity and liabilities.',
    }],
    mcqSelections: {},
  }));
  assert.equal(
    uncertainVisibleLabelPage.detectedQuestions[0].authoritativeQuestionCode,
    undefined,
    'A placeholder status word must not survive as an authoritative question ID.',
  );
  const visibleLabelOnlyStructure: any = {
    ...arbitraryOrderStructure,
    subQuestions: [
      { fullQuestionCode: 'Q2', questionNumber: '2', maximumMarks: 10, isMcq: false, topic: 'Balance sheet' },
    ],
  };
  const uncertainButVisibleLabelResolved = resolveContextualQuestionIdentity({
    ...uncertainVisibleLabelPage.detectedQuestions[0],
    paperSubQuestions: visibleLabelOnlyStructure.subQuestions,
  });
  assert.equal(uncertainButVisibleLabelResolved.canonicalId, 'Q2',
    'An uncertain content match may use a clearly visible label only when it exactly exists in the selected inventory.');
  assert.equal(uncertainButVisibleLabelResolved.requiresReview, false);

  const uncertainWithoutVisibleLabel = resolveContextualQuestionIdentity({
    subQuestion: 'a',
    parentQuestionNumberVisible: false,
    isContinuation: false,
    mappingBasis: 'UNCERTAIN',
    paperSubQuestions: arbitraryOrderStructure.subQuestions,
  });
  assert.equal(uncertainWithoutVisibleLabel.requiresReview, true,
    'An uncertain identity without a visible parent label must remain in manual review.');

  const contentMatchWithoutQuestionId = resolveContextualQuestionIdentity({
    questionNumber: '2',
    subQuestion: 'a',
    parentQuestionNumberVisible: true,
    mappingBasis: 'MATERIAL_CONTENT',
    paperSubQuestions: arbitraryOrderStructure.subQuestions,
  });
  assert.equal(contentMatchWithoutQuestionId.requiresReview, true,
    'A material-content mapping without a canonical source question ID must not fall back to an unrelated visible label.');

  const contentMatchBeatsPreviousPage = resolveContextualQuestionIdentity({
    questionNumber: '2',
    subQuestion: 'a',
    parentQuestionNumberVisible: false,
    previousActiveQuestion: 'Q2(a)',
    authoritativeQuestionCode: 'Q3(a)',
    mappingBasis: 'MATERIAL_CONTENT',
    paperSubQuestions: arbitraryOrderStructure.subQuestions,
  });
  assert.equal(contentMatchBeatsPreviousPage.canonicalId, 'Q3(a)', 'A source-content match must not inherit the preceding page parent.');
  assert.equal(contentMatchBeatsPreviousPage.requiresReview, false);

  const visibleQ6dMappedToQ2dBySourceContent = resolveContextualQuestionIdentity({
    questionNumber: '6',
    subQuestion: 'd',
    parentQuestionNumberVisible: true,
    authoritativeQuestionCode: 'Q2(d)',
    mappingBasis: 'MATERIAL_CONTENT',
    labelMismatch: true,
    paperSubQuestions: arbitraryOrderStructure.subQuestions,
  });
  assert.equal(visibleQ6dMappedToQ2dBySourceContent.canonicalId, 'Q2(d)');
  assert.equal(visibleQ6dMappedToQ2dBySourceContent.requiresReview, false);
  assert.match(visibleQ6dMappedToQ2dBySourceContent.warning || '', /visible answer label conflicts/i);

  const identityWithoutProvenance = resolveContextualQuestionIdentity({
    questionNumber: '3',
    subQuestion: 'a',
    authoritativeQuestionCode: 'Q3(a)',
    paperSubQuestions: arbitraryOrderStructure.subQuestions,
  });
  assert.equal(identityWithoutProvenance.requiresReview, true, 'An AI-selected ID without a mapping basis must not be silently trusted.');

  const bareSubpartIsNotOrderEvidence = resolveContextualQuestionIdentity({
    subQuestion: 'a',
    parentQuestionNumberVisible: false,
    previousActiveQuestion: 'Q2(a)',
    isContinuation: false,
    paperSubQuestions: arbitraryOrderStructure.subQuestions,
  });
  assert.equal(bareSubpartIsNotOrderEvidence.requiresReview, true, 'A bare subpart cannot be attached to the previous page without continuation evidence.');

  const explicitContinuation = resolveContextualQuestionIdentity({
    previousActiveQuestion: 'Q2(a)',
    isContinuation: true,
    paperSubQuestions: arbitraryOrderStructure.subQuestions,
  });
  assert.equal(explicitContinuation.canonicalId, 'Q2(a)', 'A clearly identified continuation can reuse the active answer identity.');

  const inventory = buildCanonicalQuestionInventory({ paperStructure: arbitraryOrderStructure });
  const independentAttempts = detectIndependentAttempts({
    inventory,
    rawPageOccurrences: [
      { questionCode: 'Q2(b)', pageNumber: 1, studentSnippet: '(b) journal entries and ledger adjustment' },
      { questionCode: 'Q3(a)', pageNumber: 2, studentSnippet: '(a) revenue recognition under AS 9' },
    ],
  });
  assert.ok(independentAttempts.has('Q2(b)'));
  assert.ok(independentAttempts.has('Q3(a)'), 'An explicit Q3(a) must not be remapped to Q2(a) merely because Q2 was detected first.');
  assert.equal(independentAttempts.has('Q2(a)'), false, 'Page-order context must not fabricate Q2(a).');

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
  const interleavedPdf = await createPdf(3);
  const observedPriorContexts: any[] = [];
  const interleavedCoverage = await buildAnswerSheetCoverageMap(interleavedPdf, arbitraryOrderStructure, {
    analyzePage: async (_base64, pageNumber, _structure, _totalPages, _previous, priorContexts) => {
      observedPriorContexts.push(priorContexts || []);
      const code = pageNumber === 1 || pageNumber === 3 ? 'Q2(a)' : 'Q1(a)';
      const qNum = code.slice(1, code.indexOf('(')) || '1';
      return {
        pageNumber,
        status: 'ATTEMPTED_READABLE',
        detectedQuestions: [{
          fullQuestionCode: code,
          questionNumber: qNum,
          subQuestionNumber: 'a',
          status: 'ATTEMPTED_READABLE',
          isContinuation: pageNumber === 3,
          pageNumber,
          snippet: pageNumber === 3 ? 'Continuation of the Q2 balance sheet working.' : `Answer content for ${code}.`,
        }],
        rawSummary: pageNumber === 3 ? 'Q2(a) continuation.' : `${code} identified.`,
        hasHandwriting: true,
      };
    },
  });
  const q2Attempt = interleavedCoverage.attemptedQuestions.find((attempt) => attempt.fullQuestionCode === 'Q2(a)');
  assert.deepEqual(q2Attempt?.pages, [1, 3], 'A Q2 answer continued after an intervening Q1 page must stay merged to Q2.');
  assert.deepEqual(interleavedCoverage.attemptedQuestions.find((attempt) => attempt.fullQuestionCode === 'Q1(a)')?.pages, [2]);
  assert.ok(observedPriorContexts[2].some((context: any) => context.fullQuestionCode === 'Q2(a)' && context.pages.includes(1)));
  assert.ok(observedPriorContexts[2].some((context: any) => context.fullQuestionCode === 'Q1(a)' && context.pages.includes(2)));

  clearCoverageMapCache();
  console.log('✅ Page coverage, source-grounded mapping, arbitrary order and non-adjacent continuation regressions passed (no external AI calls).');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
