import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  computeMaterialUniqueKey,
  isSupportedMtpSeriesNumber,
  normalizeMaterialType,
  normalizeMtpSeriesNumber,
} from '../services/materialDuplicateProtectionService.js';
import { getMaxModelTestNumberForLevel } from '../services/modelTestLimits.js';
import { buildEvaluationReferenceSourceInstructions } from '../gemini.js';

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

console.log('MTP two-series / Model Test separation and AI prompt isolation tests passed.');
