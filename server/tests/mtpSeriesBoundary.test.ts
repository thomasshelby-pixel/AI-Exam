import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  computeMaterialUniqueKey,
  isSupportedMtpSeriesNumber,
  normalizeMaterialType,
  normalizeMtpSeriesNumber,
} from '../services/materialDuplicateProtectionService.js';
import { getMaxModelTestNumberForLevel } from '../services/modelTestLimits.js';

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

console.log('MTP two-series / Model Test separation regression tests passed.');
