import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  computeMaterialUniqueKey,
  isSupportedMtpSeriesNumber,
  normalizeMaterialType,
  normalizeMtpSeriesNumber,
} from '../services/materialDuplicateProtectionService.js';
import { getMaxModelTestNumberForLevel } from '../services/modelTestLimits.js';
import {
  buildEvaluationReferenceSourceInstructions,
  buildReferenceSourceAntiInjectionInstruction,
} from '../gemini.js';
import { buildChunkReferenceSourceInstructions } from '../services/questionChunkEvaluator.js';

// MTP retains the official two-series identity. The permissive normalizer is
// intentionally kept for reading old records; write boundaries use the validator.
assert.equal(normalizeMtpSeriesNumber('Series 1'), 1);
assert.equal(normalizeMtpSeriesNumber('Series 2'), 2);
assert.equal(normalizeMtpSeriesNumber('Series 3'), 3, 'Legacy series metadata remains readable');
assert.equal(isSupportedMtpSeriesNumber(1), true);
assert.equal(isSupportedMtpSeriesNumber('Series 2'), true);
assert.equal(isSupportedMtpSeriesNumber(3), false);
assert.equal(isSupportedMtpSeriesNumber(4), false);
assert.equal(isSupportedMtpSeriesNumber(0), false);
assert.equal(isSupportedMtpSeriesNumber(undefined), false);

// Material-type normalization and duplicate identities must not collapse MTP
// series into independently numbered Model Test Papers.
assert.equal(normalizeMaterialType('MTP (Mock Test Paper)'), 'MTP');
assert.equal(normalizeMaterialType('Model Test Paper'), 'MODEL_TEST_PAPER');

const sharedIdentity = {
  level: 'INTERMEDIATE',
  subjectKey: 'inter_advanced_accounting',
  subjectName: 'Advanced Accounting',
  attempt: 'May 2026',
  paper: 'Paper 1',
};
const mtpSeriesOne = computeMaterialUniqueKey({
  ...sharedIdentity,
  materialType: 'MTP',
  mtpSeries: 1,
});
const mtpSeriesTwo = computeMaterialUniqueKey({
  ...sharedIdentity,
  materialType: 'MTP',
  mtpSeries: 2,
});
const modelTestFour = computeMaterialUniqueKey({
  ...sharedIdentity,
  materialType: 'MODEL_TEST_PAPER',
  modelTestNumber: 4,
});
assert.notEqual(mtpSeriesOne.uniqueKey, mtpSeriesTwo.uniqueKey);
assert.notEqual(mtpSeriesOne.uniqueKey, modelTestFour.uniqueKey);
assert.match(modelTestFour.uniqueKey, /MODEL_TEST_PAPER.*model-4/);

// The ICAI MTP selector must expose exactly two options, with no Model Test labels.
const materialManagementSource = readFileSync(
  new URL('../../src/components/admin/MaterialManagement.tsx', import.meta.url),
  'utf8',
);
const selectorStart = materialManagementSource.indexOf('id="admin-form-mtp-series-select"');
assert.notEqual(selectorStart, -1, 'Admin MTP series selector must exist');
const selectorEnd = materialManagementSource.indexOf('</select>', selectorStart);
assert.notEqual(selectorEnd, -1, 'Admin MTP series selector must be closed');
const selectorMarkup = materialManagementSource.slice(selectorStart, selectorEnd);
const optionValues = Array.from(selectorMarkup.matchAll(/<option value=\{(\d+)\}>/g), (match) => Number(match[1]));
assert.deepEqual(optionValues, [1, 2]);
assert.doesNotMatch(selectorMarkup, /Model Test/i);
assert.ok(
  materialManagementSource.includes('<option key={number} value={number}>Model Test {number}</option>'),
  'The separate Model Test selector must identify its own numbering explicitly',
);

// Model Test numbering is still configured independently by CA level.
assert.equal(getMaxModelTestNumberForLevel('FOUNDATION'), 10);
assert.equal(getMaxModelTestNumberForLevel('INTERMEDIATE'), 8);
assert.equal(getMaxModelTestNumberForLevel('FINAL'), 8);

// Prompt-level source isolation: the exact same generic evaluator rubric receives
// different authoritative source instructions for MTP and Model Test.
const mtpPromptSource = buildEvaluationReferenceSourceInstructions({
  materialType: 'MTP',
  mtpSeries: 2,
});
assert.match(mtpPromptSource.referenceBasisLabel, /MTP Series 2/i);
assert.match(mtpPromptSource.referenceBasisInstruction, /not a Model Test Paper number/i);
assert.doesNotMatch(mtpPromptSource.referenceBasisInstruction, /Model Test Paper 2 Question Paper/i);

const modelPromptSource = buildEvaluationReferenceSourceInstructions({
  materialType: 'MODEL_TEST_PAPER',
  mtpSeries: 1, // Deliberately pass a stale field to prove material type wins.
  modelTestNumber: 4,
});
assert.match(modelPromptSource.referenceBasisLabel, /Model Test Paper 4/i);
assert.match(modelPromptSource.referenceBasisInstruction, /NOT an MTP series/i);
assert.match(modelPromptSource.referenceBasisInstruction, /Never substitute or borrow an MTP Series 1\/2 paper/i);
assert.doesNotMatch(modelPromptSource.referenceBasisLabel, /MTP Series/i);

// PYQ gets its own authoritative source labels and may not borrow MTP or Model Test references.
const pyqPromptSource = buildEvaluationReferenceSourceInstructions({
  materialType: 'PYQ',
});
assert.match(pyqPromptSource.referenceBasisLabel, /Past Year Question Paper/i);
assert.match(pyqPromptSource.referenceBasisInstruction, /Do not substitute MTP or Model Test references/i);
assert.match(pyqPromptSource.questionPaperHeading, /PAST YEAR QUESTION PAPER/i);

// Faculty Mock is identified by the exact published mock ID and its private TXT.
const facultyPromptSource = buildEvaluationReferenceSourceInstructions({
  materialType: 'FACULTY_MOCK_TEST',
  facultyMockTestId: 'faculty-mock-07',
});
assert.match(facultyPromptSource.referenceBasisLabel, /Faculty Mock faculty-mock-07/i);
assert.match(facultyPromptSource.referenceBasisInstruction, /exact published Faculty Mock with ID faculty-mock-07/i);
assert.match(facultyPromptSource.referenceBasisInstruction, /private TXT evaluation reference stored against that mock/i);
assert.match(facultyPromptSource.referenceBasisInstruction, /Do not substitute or supplement it with global ICAI PYQ\/MTP keys/i);

const pyqAntiInjection = buildReferenceSourceAntiInjectionInstruction(
  pyqPromptSource.referenceBasisInstruction,
);
assert.match(pyqAntiInjection, /strictly using this authoritative source-isolation rule: Use only/i);
assert.doesNotMatch(pyqAntiInjection, /strictly against Use only/i);

const facultyAntiInjection = buildReferenceSourceAntiInjectionInstruction(
  facultyPromptSource.referenceBasisInstruction,
);
assert.match(facultyAntiInjection, /Faculty Mock with ID faculty-mock-07/i);

const mtpChunkPrompt = buildChunkReferenceSourceInstructions({
  sourceType: 'GLOBAL',
  materialType: 'MTP',
  mtpSeries: 2,
});
assert.match(mtpChunkPrompt.questionPaperHeading, /MTP SERIES 2/i);
assert.match(mtpChunkPrompt.isolationInstruction, /not a Model Test Paper number/i);

const modelChunkPrompt = buildChunkReferenceSourceInstructions({
  sourceType: 'MODEL_TEST',
  materialType: 'MODEL_TEST_PAPER',
  mtpSeries: 1, // Deliberately pass a stale field to prove Model Test wins.
  modelTestNumber: 4,
});
assert.match(modelChunkPrompt.questionPaperHeading, /MODEL TEST PAPER 4/i);
assert.match(modelChunkPrompt.isolationInstruction, /not an MTP series/i);
assert.doesNotMatch(modelChunkPrompt.isolationInstruction, /MTP Series 1\/2 question/i);

const pyqChunkPrompt = buildChunkReferenceSourceInstructions({
  sourceType: 'GLOBAL',
  materialType: 'PYQ',
});
assert.match(pyqChunkPrompt.questionPaperHeading, /PAST YEAR QUESTION PAPER/i);
assert.match(pyqChunkPrompt.isolationInstruction, /Do not substitute an MTP or Model Test reference/i);

const facultyChunkPrompt = buildChunkReferenceSourceInstructions({
  sourceType: 'FACULTY_MOCK',
  materialType: 'FACULTY_MOCK_TEST',
  facultyMockTestId: 'faculty-mock-07',
});
assert.match(facultyChunkPrompt.questionPaperHeading, /FACULTY MOCK faculty-mock-07/i);
assert.match(facultyChunkPrompt.isolationInstruction, /exact selected Faculty Mock with ID faculty-mock-07/i);
assert.match(facultyChunkPrompt.isolationInstruction, /private TXT reference/i);
assert.match(facultyChunkPrompt.isolationInstruction, /Never borrow a global ICAI PYQ\/MTP answer/i);

// Runtime guards must not parse/pass an MTP series for a Model Test request,
// and the final evaluator call must discard stale queued cross-type identifiers.
const studentRouteSource = readFileSync(
  new URL('../routes/studentRoutes.ts', import.meta.url),
  'utf8',
);
assert.match(studentRouteSource, /const parsedMtpSeries = materialType === 'MTP'/);

const asyncEvaluationSource = readFileSync(
  new URL('../services/asyncEvaluationService.ts', import.meta.url),
  'utf8',
);
assert.match(asyncEvaluationSource, /mtpSeries: job\.materialType === 'MTP' \? job\.mtpSeries : undefined/);
assert.match(asyncEvaluationSource, /modelTestNumber: job\.materialType === 'MODEL_TEST_PAPER' \? job\.modelTestNumber : undefined/);

const geminiSource = readFileSync(
  new URL('../gemini.ts', import.meta.url),
  'utf8',
);
assert.match(geminiSource, /if \(params\.materialType === 'MTP'\) \{/);
assert.doesNotMatch(geminiSource, /params\.materialType === 'MTP' \|\| \(params\.mtpSeries/);
assert.match(geminiSource, /buildReferenceSourceAntiInjectionInstruction\(referenceBasisInstruction\)/);

const chunkEvaluatorSource = readFileSync(
  new URL('../services/questionChunkEvaluator.ts', import.meta.url),
  'utf8',
);
assert.match(chunkEvaluatorSource, /\$\{sourceInstructions\.isolationInstruction\}/);
assert.match(chunkEvaluatorSource, /\$\{sourceInstructions\.questionPaperHeading\}/);

console.log('MTP, Model Test, PYQ and Faculty Mock prompt/source-isolation regression tests passed.');
