import assert from 'node:assert/strict';
import { parseModelTestBulkFiles } from '../services/modelTestBulkImportService.js';
import { getMaxModelTestNumberForLevel, isValidModelTestNumber } from '../services/modelTestLimits.js';

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
assert.ok(duplicatedModel.errors.some((error) => error.includes('duplicate questionPaperText file')));

const masterFile = {
  fileName: 'all-models.txt',
  content: files.map((file) => file.content).join('\n\n'),
};
const masterResult = parseModelTestBulkFiles([masterFile]);
assert.deepEqual(masterResult.errors, []);
assert.equal(masterResult.materials.length, 8);


const componentFiles = Array.from({ length: 8 }, (_, index) => {
  const number = index + 1;
  return [
    {
      fileName: `Model ${number} Question Paper.txt`,
      content: `[QUESTION PAPER]\\nQuestion ${number}: Prepare the complete computation and state your conclusion. Maximum marks: 10.`,
    },
    {
      fileName: `Model ${number} Suggested Answers.txt`,
      content: `Suggested answer ${number}: Complete calculation, working notes and final conclusion for this model.`,
    },
    {
      fileName: `Model ${number} Marking Scheme.txt`,
      content: `Question ${number}: computation 5 marks, working notes 3 marks and conclusion 2 marks.`,
    },
  ];
}).flat();

const componentResult = parseModelTestBulkFiles(componentFiles);
assert.deepEqual(componentResult.errors, []);
assert.equal(componentResult.materials.length, 8);
assert.deepEqual(componentResult.materials.map((item) => item.modelTestNumber), [1, 2, 3, 4, 5, 6, 7, 8]);
assert.equal(componentResult.materials[0].sourceFileNames.length, 3);
assert.match(componentResult.materials[7].markingSchemeText, /conclusion 2 marks/);


const sourceLikeComponentFiles = Array.from({ length: 8 }, (_, index) => {
  const number = index + 1;
  const newline = String.fromCharCode(10);
  return [
    {
      fileName: "Model " + number + " Question Paper.txt",
      content: [
        "SOURCE PDF: Model_Test_Paper_" + number + "_Question_Paper.pdf",
        "CONVERSION: Text extracted from source PDF with layout preservation.",
        "",
        "MODEL TEST PAPER " + number,
        "[QUESTION PAPER]",
        "Question " + number + ": Prepare the complete computation and state your conclusion. Maximum marks: 10.",
      ].join(newline),
    },
    {
      fileName: "Model " + number + " Suggested Answers.txt",
      content: [
        "ANSWERS OF MODEL TEST PAPER " + number,
        "Answer " + number + ": Complete calculation, working notes and final conclusion for this model.",
      ].join(newline),
    },
    {
      fileName: "Model " + number + " Marking Scheme.txt",
      content: [
        "MODEL TEST PAPER " + number,
        "MARKING SCHEME",
        "Question " + number + ": computation 5 marks, working notes 3 marks and conclusion 2 marks.",
      ].join(newline),
    },
  ];
}).flat();

const sourceLikeResult = parseModelTestBulkFiles(sourceLikeComponentFiles);
assert.deepEqual(sourceLikeResult.errors, []);
assert.equal(sourceLikeResult.materials.length, 8);
assert.deepEqual(sourceLikeResult.materials.map((item) => item.modelTestNumber), [1, 2, 3, 4, 5, 6, 7, 8]);
assert.match(sourceLikeResult.materials[0].questionPaperText, /Question 1/);
assert.equal(sourceLikeResult.materials[0].sourceFileNames.length, 3);


assert.equal(getMaxModelTestNumberForLevel('FOUNDATION'), 10);
assert.equal(getMaxModelTestNumberForLevel('INTERMEDIATE'), 8);
assert.equal(getMaxModelTestNumberForLevel('FINAL'), 8);
assert.equal(isValidModelTestNumber(10, 'FOUNDATION'), true);
assert.equal(isValidModelTestNumber(10, 'INTERMEDIATE'), false);

const foundationFiles = Array.from({ length: 10 }, (_, index) => ({
  fileName: `Model ${index + 1}.txt`,
  content: index === 9 ? modelText(10).replace('MODEL TEST PAPER 10\\n', '') : modelText(index + 1),
}));
const foundationResult = parseModelTestBulkFiles(foundationFiles, { maxModelNumber: 10 });
assert.deepEqual(foundationResult.errors, []);
assert.equal(foundationResult.materials.length, 10);
assert.deepEqual(foundationResult.materials.map((item) => item.modelTestNumber), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
assert.match(foundationResult.materials[9].questionPaperText, /Question 10/);

const foundationAsIntermediate = parseModelTestBulkFiles(foundationFiles);
assert.ok(foundationAsIntermediate.errors.some((error) => error.includes('Model Number must be clearly identified') && error.includes('1–8')));

console.log('Model Test bulk TXT parser tests passed.');
