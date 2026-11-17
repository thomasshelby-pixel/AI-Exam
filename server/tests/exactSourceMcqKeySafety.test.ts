import assert from 'node:assert/strict';
import {
  extractOfficialMcqKeysFromSuggestedAnswers,
  getAuthoritativePaperStructure,
} from '../services/paperStructureService.js';
import { validatePreEvaluationGate } from '../services/evaluationIntegrityHardening.js';

console.log('--- Exact-source MCQ answer-key safety tests ---');

// A descriptive answer numbered "1. (a)" is not an MCQ key unless the
// selected Suggested Answer explicitly identifies an objective-question section.
{
  const descriptiveOnly = `
Suggested Answers - CA Intermediate Taxation
Question 1(a): Compute total income.
1. (a) Salary income is taxable under the applicable head.
Question 1(b): Compute tax liability.
`;
  const parsed = extractOfficialMcqKeysFromSuggestedAnswers(descriptiveOnly);
  assert.equal(parsed.size, 0, 'Descriptive Q1(a) must not be interpreted as the key for MCQ 1.');

  const ambiguousCombinedFallback = `
[AUTHORITATIVE COMBINED PYQ DOCUMENT - SUGGESTED ANSWERS]
Division A
1. (B) These are Question Paper options, not a verified answer key.
Division B
`;
  assert.equal(
    extractOfficialMcqKeysFromSuggestedAnswers(ambiguousCombinedFallback).size,
    0,
    'An unsplit combined PYQ fallback must not be trusted as an MCQ answer key.',
  );

  const structure = getAuthoritativePaperStructure({
    level: 'INTERMEDIATE',
    paper: 'Paper 3',
    subjectName: 'Taxation',
    questionPaperText: 'CA Intermediate Taxation examination, total 100 marks.',
    suggestedAnswersText: descriptiveOnly,
    officialPaperMaxMarks: 100,
  });
  assert.equal(structure.mcqs.length, 16, 'Taxation paper structure must retain its authoritative MCQ nodes.');
  assert.equal(structure.mcqs[0].officialKey, '', 'No unrelated historical key may be substituted when the selected source has no parseable key.');

  const preGate = validatePreEvaluationGate({
    paperStructure: structure,
    questionPaperText: 'CA Intermediate Taxation examination, total 100 marks.',
    suggestedAnswersText: descriptiveOnly,
    officialPaperMaxMarks: 100,
    level: 'INTERMEDIATE',
    subjectName: 'Taxation',
  });
  assert.equal(preGate.passed, false, 'Missing selected-source MCQ keys must block scoring before model evaluation.');
  assert.ok(
    preGate.criticalFailures?.some((failure) => failure.includes('MISSING_OFFICIAL_MCQ_KEY')),
    'The pre-evaluation gate must explain that the selected source lacks a verified MCQ key.',
  );
}

// When the source explicitly labels Division A and supplies an MCQ answer,
// the exact uploaded answer must be used.
{
  const suggestedAnswers = `
Suggested Answers - Selected Taxation Paper
Division A - Multiple Choice Questions
1. (C) The answer follows from the relevant provision.
Division B - Descriptive Questions
1. (A) This is a descriptive answer label, not an MCQ key.
Question 1(a): Explain the relevant provision.
`;
  const parsed = extractOfficialMcqKeysFromSuggestedAnswers(suggestedAnswers);
  assert.equal(parsed.size, 1, 'A descriptive 1. (A) after Division B must not be added to the MCQ key map.');
  assert.equal(parsed.get('1')?.officialKey, 'C', 'The exact selected Suggested Answer key must be preserved.');
}

// A different MCQ answer in a different uploaded source must replace nothing
// from the old Taxation MTP Series 1 constants.
{
  const suggestedAnswers = `
Official Suggested Answers - Selected Taxation Paper
Division A - MCQ Answers
1. (D) Selected-source answer is D.
Division B - Descriptive Questions
`;
  const structure = getAuthoritativePaperStructure({
    level: 'INTERMEDIATE',
    paper: 'Paper 3',
    subjectName: 'Taxation',
    questionPaperText: 'CA Intermediate Taxation examination.',
    suggestedAnswersText: suggestedAnswers,
    officialPaperMaxMarks: 100,
  });
  assert.equal(structure.mcqs[0].officialKey, 'D', 'Selected paper answer D must not be overwritten by a hardcoded historical answer.');
}

console.log('Exact-source MCQ answer-key safety tests passed.');

// Flat response grids are common even when the selected paper stores MCQs
// under nested source labels. The flat answer index must crosswalk by source
// order rather than being rejected or accidentally mapped to the parent digit.
{
  const nestedSourceMcqs: any = [
    { questionNumber: '1(i)', sourceQuestionLabel: 'Q1(i)' },
    { questionNumber: '1(ii)', sourceQuestionLabel: 'Q1(ii)' },
    { questionNumber: '1(iii)', sourceQuestionLabel: 'Q1(iii)' },
    { questionNumber: '1(iv)', sourceQuestionLabel: 'Q1(iv)' },
  ];
  const { resolveMcqSelectionNumber } = await import('../services/answerSheetCoverageService.js');
  assert.equal(resolveMcqSelectionNumber('1', nestedSourceMcqs), '1',
    'Flat response 1 maps to the first nested source MCQ.');
  assert.equal(resolveMcqSelectionNumber('2', nestedSourceMcqs), '1',
    'Flat response 2 maps to the second nested source MCQ identity without collapsing it to parent 1.');
  assert.equal(resolveMcqSelectionNumber('4', nestedSourceMcqs), '1',
    'Flat response 4 maps to the fourth nested source MCQ.');
  assert.equal(resolveMcqSelectionNumber('5', nestedSourceMcqs), undefined,
    'Out-of-range flat response labels must remain unmapped for review.');
}
