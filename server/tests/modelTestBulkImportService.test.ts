import assert from 'node:assert/strict';
import { parseModelTestBulkFiles } from '../services/modelTestBulkImportService.js';

function modelText(number: number): string {
  return [
    `MODEL TEST PAPER ${number}`,
    '[QUESTION PAPER]',
    `Question ${number}: Calculate the amount and explain the relevant treatment. Maximum marks: 10.`,
    '[SUGGESTED ANSWERS]',
    `Answer ${number}: The answer contains the core calculation, working note and conclusion for this question.`,
    '[MARKING SCHEME]',
    `Question ${number}: Calculation 5 marks, working note 3 marks, conclusion 2 marks.`,
  ].join('\n');
}

const files = Array.from({ length: 8 }, (_, index) => ({
  fileName: `Model ${index + 1}.txt`,
  content: modelText(index + 1),
}));

const result = parseModelTestBulkFiles(files);
assert.deepEqual(result.errors, []);
assert.equal(result.materials.length, 8);
assert.deepEqual(result.materials.map((item) => item.modelTestNumber), [1, 2, 3, 4, 5, 6, 7, 8]);
assert.match(result.materials[0].questionPaperText, /Question 1/);
assert.match(result.materials[7].suggestedAnswersText, /Answer 8/);
assert.match(result.materials[3].markingSchemeText, /3 marks/);

const missingScheme = parseModelTestBulkFiles(
  files.map((file, index) => index === 0
    ? { ...file, content: file.content.replace('[MARKING SCHEME]\nQuestion 1: Calculation 5 marks, working note 3 marks, conclusion 2 marks.', '') }
    : file)
);
assert.ok(missingScheme.errors.some((error) => error.includes('Missing MARKING SCHEME section')));

const duplicatedModel = parseModelTestBulkFiles([
  ...files,
  { fileName: 'Model 1 duplicate.txt', content: modelText(1) },
]);
assert.ok(duplicatedModel.errors.some((error) => error.includes('more than one TXT block')));

const masterFile = {
  fileName: 'all-models.txt',
  content: files.map((file) => file.content).join('\n\n'),
};
const masterResult = parseModelTestBulkFiles([masterFile]);
assert.deepEqual(masterResult.errors, []);
assert.equal(masterResult.materials.length, 8);

console.log('Model Test bulk TXT parser tests passed.');
