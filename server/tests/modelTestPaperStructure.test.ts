import assert from 'node:assert/strict';
import { extractSubQuestionsFromText, getAuthoritativePaperStructure } from '../services/paperStructureService.js';
import { deduplicateQuestionList, parseCanonicalQuestionIdentity, toCanonicalQuestionId, validateQuestionDeduplication } from '../services/canonicalQuestionService.js';
import { validatePreEvaluationGate } from '../services/evaluationIntegrityHardening.js';
import { buildCanonicalQuestionInventory } from '../services/canonicalQuestionInventoryService.js';
import { normalizeDetectedAttemptHierarchy } from '../services/answerSheetCoverageService.js';

const levelSubjectMatrix: Record<string, string[]> = {
  FOUNDATION: ['Accounting', 'Business Laws', 'Quantitative Aptitude', 'Business Economics'],
  INTERMEDIATE: [
    'Advanced Accounting',
    'Costing',
    'Corporate and Other Laws',
    'Taxation',
    'Audit',
    'Financial Management and Strategic Management',
  ],
  FINAL: [
    'Financial Reporting',
    'Advanced Financial Management',
    'Advanced Auditing, Assurance and Professional Ethics',
    'Direct Tax Laws and International Taxation',
    'Indirect Tax Laws',
    'Corporate and Economic Laws',
    'Strategic Cost and Performance Management',
    'Integrated Business Solutions',
  ],
};

const sourceBundle = {
  questionPaperText: [
    'CA MODEL TEST PAPER 1',
    'QUESTION PAPER',
    'PART I - MULTIPLE CHOICE QUESTIONS',
    '1. Select the correct accounting treatment.',
    '2. Select the correct provision.',
    'PART II - DESCRIPTIVE QUESTIONS',
    'Question 1(a) - 5 Marks',
    'Pass the required journal entry.',
    'Question 1(b) - 5 Marks',
    'Prepare the revised balance sheet.',
    'Question 2 - 14 Marks',
    'Prepare the statement of profit and loss.',
    'Question 3(a) - 4 Marks',
    'Calculate goodwill.',
    'Question 3(b) - 10 Marks',
    'Prepare the capital accounts.',
  ].join('\n'),
  suggestedAnswersText: [
    'MODEL TEST PAPER 1 SUGGESTED ANSWERS',
    'Division A',
    '1. (b)',
    '2. (c)',
    'Division B',
    'Answers to descriptive questions are provided question-wise.',
  ].join('\n'),
  markingSchemeText: [
    'MODEL TEST PAPER 1 MARKING SCHEME',
    'Question 1(a) - 5 Marks',
    'Question 1(b) - 5 Marks',
    'Question 2 - 14 Marks',
    'Question 3(a) - 4 Marks',
    'Question 3(b) - 10 Marks',
  ].join('\n'),
  officialPaperMaxMarks: 40,
};

const materialTypes = ['PYQ', 'MTP', 'MODEL_TEST_PAPER'] as const;
let subjectCases = 0;

for (const [level, subjects] of Object.entries(levelSubjectMatrix)) {
  for (const subjectName of subjects) {
    subjectCases++;
    const structures = Object.fromEntries(materialTypes.map((materialType) => [
      materialType,
      getAuthoritativePaperStructure({
        ...sourceBundle,
        level,
        subjectName,
        paper: subjectName,
        materialType,
      }),
    ])) as Record<(typeof materialTypes)[number], ReturnType<typeof getAuthoritativePaperStructure>>;

    // Model Test must use the exact existing subject-aware PYQ/MTP parser.
    // No Model-Test-only question IDs, marks parser, or paper template is allowed.
    assert.deepEqual(
      structures.MODEL_TEST_PAPER,
      structures.MTP,
      `${level} / ${subjectName}: Model Test must produce the same paper structure as MTP.`,
    );
    assert.deepEqual(
      structures.MODEL_TEST_PAPER,
      structures.PYQ,
      `${level} / ${subjectName}: Model Test must produce the same paper structure as PYQ.`,
    );

    const modelInventory = buildCanonicalQuestionInventory({
      paperStructure: structures.MODEL_TEST_PAPER,
      questionPaperText: sourceBundle.questionPaperText,
      markingSchemeText: sourceBundle.markingSchemeText,
      totalPaperMaxMarks: sourceBundle.officialPaperMaxMarks,
    });
    const mtpInventory = buildCanonicalQuestionInventory({
      paperStructure: structures.MTP,
      questionPaperText: sourceBundle.questionPaperText,
      markingSchemeText: sourceBundle.markingSchemeText,
      totalPaperMaxMarks: sourceBundle.officialPaperMaxMarks,
    });
    assert.deepEqual(
      modelInventory,
      mtpInventory,
      `${level} / ${subjectName}: Model Test must build the same canonical inventory as MTP.`,
    );
  }
}

assert.equal(subjectCases, 18,
  'The shared PYQ/MTP parser contract must be exercised for all Foundation, Intermediate and Final subjects.');

// Preserve the existing Taxation configuration: Model Test must follow the same
// configured Taxation route as PYQ/MTP rather than a new dynamic Model Test parser.
const taxation = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Taxation',
  paper: 'Taxation',
  materialType: 'MODEL_TEST_PAPER',
  ...sourceBundle,
});
const taxationMtp = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Taxation',
  paper: 'Taxation',
  materialType: 'MTP',
  ...sourceBundle,
});
assert.deepEqual(taxation, taxationMtp);
assert.equal(taxation.mcqs.length, 16,
  'Existing configured Taxation MCQ structure must remain unchanged.');

// A Model Test with unparseable source text follows the same parser, but must not
// inherit the generic PYQ/MTP guessed Q1-Q6 fallback with invented maxima.
const unparseableModelTest = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'MODEL_TEST_PAPER',
  questionPaperText: 'Question paper text without numbered questions or explicit marks.',
  suggestedAnswersText: 'Suggested answers are present but question-wise identities are unreadable.',
  markingSchemeText: 'Marking scheme is present but allocations are unreadable.',
  officialPaperMaxMarks: 100,
});
assert.equal(unparseableModelTest.subQuestions.length, 0);
assert.equal(unparseableModelTest.mcqs.length, 0);
const unparseableGate = validatePreEvaluationGate({
  paperStructure: unparseableModelTest,
  questionPaperText: 'Question paper text without numbered questions.',
  suggestedAnswersText: 'Suggested answers are present.',
  markingSchemeText: 'Marking scheme is present.',
});
assert.equal(unparseableGate.passed, false);
assert.ok(unparseableGate.failedInvariants.some((message) => message.includes('QUESTION_PAPER_NOT_PARSED')));


// Universal hierarchical sub-part recognition. The numbering style is opaque:
// letters, Roman numerals, Arabic numerals, dotted paths and mixed nesting all
// remain separate authoritative identities with their own maximum marks.
const universalPartSource = [
  'Question 1(a) - 10 Marks',
  'Question 1(a)(i) - 2 Marks',
  'Question 1(a)(ii) - 3 Marks',
  'Question 1(a)(1) - 1 Mark',
  'Question 1(a)(2) - 4 Marks',
  'Question 1(b) - 5 Marks',
  'Question 2 Part IV - 3 Marks',
  'Question 2 Clause 2 - 4 Marks',
  'Question 3.1.1 - 1 Mark',
  'Question 3.1.2 - 2 Marks',
  'Question 4.iv.1 - 2 Marks',
  'Question 4.iv.2 - 3 Marks',
].join('\n');
const universalParts = extractSubQuestionsFromText(universalPartSource);
const universalMaxima = new Map(universalParts.map((part) => [part.fullQuestionCode, part.maximumMarks]));
for (const [code, marks] of [
  ['Q1(a(i))', 2],
  ['Q1(a(ii))', 3],
  ['Q1(a(1))', 1],
  ['Q1(a(2))', 4],
  ['Q1(b)', 5],
  ['Q2(iv)', 3],
  ['Q2(2)', 4],
  ['Q3(1(1))', 1],
  ['Q3(1(2))', 2],
  ['Q4(iv(1))', 2],
  ['Q4(iv(2))', 3],
] as const) {
  assert.equal(universalMaxima.get(code), marks, code + ' must retain its own official maximum marks.');
}
assert.equal(universalMaxima.has('Q1(a)'), false, 'A parent with separately-marked children must be removed from scorable leaf IDs.');
assert.equal(
  toCanonicalQuestionId('Q1(a(iii))', undefined, universalParts),
  'Q1(a(iii))',
  'An unknown nested part must not be fuzzy-mapped to another part with the same leading letter.',
);
assert.notEqual(
  toCanonicalQuestionId('Q1(a(i))'),
  toCanonicalQuestionId('Q1(a(ii))'),
  'Roman-numeral siblings must have independent canonical identities.',
);
assert.notEqual(
  toCanonicalQuestionId('Q1(a(1))'),
  toCanonicalQuestionId('Q1(a(2))'),
  'Arabic-numbered siblings must have independent canonical identities.',
);
assert.equal(
  parseCanonicalQuestionIdentity('Question 4 Part IV Clause 2').canonicalId,
  'Q4(iv(2))',
  'Named Part/Clause prefixes must produce a reusable hierarchical identity.',
);
const nestedParentDedup = deduplicateQuestionList([
  { fullQuestionCode: 'Q7(a)', questionNumber: '7', subQuestion: 'a', maximumMarks: 10 },
  { fullQuestionCode: 'Q7(a(i))', questionNumber: '7', subQuestion: 'a(i)', maximumMarks: 4 },
  { fullQuestionCode: 'Q7(a(ii))', questionNumber: '7', subQuestion: 'a(ii)', maximumMarks: 6 },
]);
assert.deepEqual(
  nestedParentDedup.map((item) => item.fullQuestionCode).sort(),
  ['Q7(a(i))', 'Q7(a(ii))'],
  'Deduplication must remove both intermediate and root containers while preserving nested leaf parts.',
);

// The integrity validator must catch intermediate nested parents too.
const nestedParentValidation = validateQuestionDeduplication([
  { fullQuestionCode: 'Q8', questionNumber: '8' },
  { fullQuestionCode: 'Q8(a)', questionNumber: '8', subQuestion: 'a' },
  { fullQuestionCode: 'Q8(a(i))', questionNumber: '8', subQuestion: 'a(i)' },
  { fullQuestionCode: 'Q8(a(ii))', questionNumber: '8', subQuestion: 'a(ii)' },
]);
assert.equal(nestedParentValidation.isValid, false);
assert.ok(nestedParentValidation.parentChildCollisions.includes('Q8'));
assert.ok(nestedParentValidation.parentChildCollisions.includes('Q8(a)'),
  'A nested leaf must flag its immediate parent container, not only the root question.');

const normalizedDetectedAttempts = normalizeDetectedAttemptHierarchy([
  { fullQuestionCode: 'Q1', pages: [1] },
  { fullQuestionCode: 'Q1(a)', pages: [1, 2] },
  { fullQuestionCode: 'Q1(a(i))', pages: [2] },
  { fullQuestionCode: 'Q1(a(ii))', pages: [3] },
  { fullQuestionCode: 'Q1(b)', pages: [4] },
  { fullQuestionCode: 'Q2(a)', pages: [5] },
]);
assert.deepEqual(
  normalizedDetectedAttempts.attemptedQuestions.map((attempt) => attempt.fullQuestionCode).sort(),
  ['Q1(a(i))', 'Q1(a(ii))', 'Q1(b)', 'Q2(a)'],
  'Detected root/intermediate containers must be removed only when canonical descendant leaves are present.',
);
assert.deepEqual(
  normalizedDetectedAttempts.attemptedQuestions.find((attempt) => attempt.fullQuestionCode === 'Q1(a(i))')?.pages,
  [1, 2],
  'Parent/container pages must transfer to the nested leaf for complete answer-page context.',
);
assert.ok(
  normalizedDetectedAttempts.attemptedQuestions.some((attempt) => attempt.fullQuestionCode === 'Q2(a)'),
  'A parent-only detection with no detected child must be preserved for review rather than guessed.',
);

// Contextual numbering under a single parent header must also retain each level.
const contextualParts = extractSubQuestionsFromText([
  'Question 9',
  '(a) Parent part - 5 Marks',
  '(i) First roman clause - 2 Marks',
  '(ii) Second roman clause - 3 Marks',
].join('\n'));
assert.deepEqual(
  contextualParts.map((part) => [part.fullQuestionCode, part.maximumMarks]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  [['Q9(a(i))', 2], ['Q9(a(ii))', 3]],
  'Bare contextual sub-part labels must be attached to the active parent and retained as separate leaves.',
);
const namedContextualParts = extractSubQuestionsFromText([
  'Question 10 Part IV',
  'Clause 1 - 2 Marks',
  'Clause 2 - 3 Marks',
].join('\n'));
assert.deepEqual(
  namedContextualParts.map((part) => [part.fullQuestionCode, part.maximumMarks]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  [['Q10(iv(1))', 2], ['Q10(iv(2))', 3]],
  'A named parent heading and its named child clauses must create separately marked nested leaves.',
);


 // PYQ and MTP must not inherit the old hardcoded Q1-Q6 marks when their
 // independently supplied source text cannot be parsed.
for (const materialType of ['PYQ', 'MTP'] as const) {
  const unparseable = getAuthoritativePaperStructure({
    level: 'INTERMEDIATE',
    subjectName: 'Advanced Accounting',
    paper: 'Paper 1',
    materialType,
    questionPaperText: 'Question paper text without numbered questions or explicit marks.',
    suggestedAnswersText: 'Suggested answers are present but question-wise identities are unreadable.',
    markingSchemeText: 'Marking scheme is present but allocations are unreadable.',
    officialPaperMaxMarks: 100,
  });
  assert.equal(unparseable.subQuestions.length, 0, materialType + ' must not fabricate Q1-Q6 identities.');
  assert.equal(unparseable.mcqs.length, 0);
  const gate = validatePreEvaluationGate({
    paperStructure: unparseable,
    questionPaperText: 'Question paper text without numbered questions.',
    suggestedAnswersText: 'Suggested answers are present.',
    markingSchemeText: 'Marking scheme is present.',
  });
  assert.ok(gate.failedInvariants.some((message) => message.includes('QUESTION_PAPER_NOT_PARSED')));
}

// MCQ maxima must be read from the exact source bundle for PYQ, MTP and
// Faculty Mock. The same answer key must never silently imply 1 or 2 marks.
const sourceBackedMcqBundle = {
  questionPaperText: [
    'CA Examination Question Paper',
    'Division A - Multiple Choice Questions',
    'MCQ 1 - 1 Mark',
    'MCQ 2 - 2 Marks',
    'Division B - Descriptive Questions',
    'Question 1(a) - 5 Marks',
    'Question 2(a) - 5 Marks',
  ].join('\n'),
  suggestedAnswersText: [
    'Suggested Answers',
    'Division A',
    '1. (B)',
    '2. (C)',
    'Division B',
    'Question 1(a) - Official explanatory answer and full technical reasoning.',
    'Question 2(a) - Official explanatory answer and full technical reasoning.',
  ].join('\n'),
  markingSchemeText: [
    'Marking Scheme',
    'MCQ 1 - 1 Mark',
    'MCQ 2 - 2 Marks',
    'Question 1(a) - 5 Marks',
    'Question 2(a) - 5 Marks',
  ].join('\n'),
  officialPaperMaxMarks: 40,
};
for (const materialType of ['PYQ', 'MTP', 'FACULTY_MOCK_TEST'] as const) {
  const structure = getAuthoritativePaperStructure({
    ...sourceBackedMcqBundle,
    level: 'INTERMEDIATE',
    subjectName: 'Advanced Accounting',
    paper: 'Paper 1',
    materialType,
  });
  assert.deepEqual(
    structure.mcqs.map((mcq) => [mcq.questionNumber, mcq.maximumMarks]),
    [['1', 1], ['2', 2]],
    materialType + ' MCQ maximum marks must come from that selected QP/marking scheme.',
  );
  const inventory = buildCanonicalQuestionInventory({
    paperStructure: structure,
    questionPaperText: sourceBackedMcqBundle.questionPaperText,
    markingSchemeText: sourceBackedMcqBundle.markingSchemeText,
    totalPaperMaxMarks: 40,
  });
  assert.deepEqual(
    inventory.items.filter((item) => item.questionType === 'MCQ').map((item) => [item.questionId, item.maxMarks]),
    [['MCQ1', 1], ['MCQ2', 2]],
    materialType + ' canonical inventory must preserve source-backed MCQ allocations.',
  );
}

// A recognized MCQ key is not enough to invent its maximum marks. Missing
// allocation stays at zero and the pre-evaluation gate blocks scoring.
const mcqWithoutMarks = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'PYQ',
  questionPaperText: [
    'Question Paper',
    'Division A - Multiple Choice Questions',
    'MCQ 1 - Select the correct option.',
    'Division B - Descriptive Questions',
    'Question 1(a) - 5 Marks',
  ].join('\n'),
  suggestedAnswersText: 'Suggested Answers\nDivision A\n1. (B)\nDivision B',
  markingSchemeText: 'Marking Scheme\nQuestion 1(a) - 5 Marks',
  officialPaperMaxMarks: 40,
});
assert.equal(mcqWithoutMarks.mcqs[0]?.maximumMarks, 0);
const mcqWithoutMarksInventory = buildCanonicalQuestionInventory({
  paperStructure: mcqWithoutMarks,
  questionPaperText: '',
  markingSchemeText: '',
  totalPaperMaxMarks: 40,
});
assert.equal(
  mcqWithoutMarksInventory.items.find((item) => item.questionId === 'MCQ1')?.maxMarks,
  0,
  'Canonical inventory must not replace a missing MCQ maximum with a guessed default.',
);
const mcqWithoutMarksGate = validatePreEvaluationGate({
  paperStructure: mcqWithoutMarks,
  questionPaperText: 'Question Paper',
  suggestedAnswersText: 'Suggested Answers',
  markingSchemeText: 'Marking Scheme',
});
assert.ok(mcqWithoutMarksGate.failedInvariants.some((message) => message.includes('INVALID_MCQ_MAX_MARKS')));

// Optional-question instructions must be parsed into an exact allowed set.
// If the source language cannot be resolved, do not silently count all options.
const optionalFacultyMock = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Faculty Mock',
  materialType: 'FACULTY_MOCK_TEST',
  officialPaperMaxMarks: 40,
  questionPaperText: [
    'Faculty Mock Question Paper',
    'Instructions: Attempt any one question from Q2, Q3 and Q4.',
    'Question 1(a) - 10 Marks',
    'Question 2(a) - 10 Marks',
    'Question 3(a) - 10 Marks',
    'Question 4(a) - 10 Marks',
  ].join('\n'),
  suggestedAnswersText: 'Faculty Mock Suggested Answers\nComplete question-wise answers are included.',
  markingSchemeText: [
    'Faculty Mock Marking Scheme',
    'Question 1(a) - 10 Marks',
    'Question 2(a) - 10 Marks',
    'Question 3(a) - 10 Marks',
    'Question 4(a) - 10 Marks',
  ].join('\n'),
});
assert.equal(optionalFacultyMock.optionalSelectionRuleError, undefined);
assert.match(
  optionalFacultyMock.questions.find((question) => question.questionNumber === '2')?.choiceRule || '',
  /Attempt any 1 of Q2, Q3, Q4/,
);
const optionalOverAttemptGate = validatePreEvaluationGate({
  paperStructure: optionalFacultyMock,
  questionPaperText: 'Question Paper',
  suggestedAnswersText: 'Suggested Answers',
  markingSchemeText: 'Marking Scheme',
  officialPaperMaxMarks: 40,
  coverageMap: {
    unmappedPages: [],
    attemptedQuestions: [
      { questionNumber: '2', subQuestionNumber: 'a', fullQuestionCode: 'Q2(a)', pages: [1] },
      { questionNumber: '3', subQuestionNumber: 'a', fullQuestionCode: 'Q3(a)', pages: [2] },
    ],
  } as any,
});
assert.ok(optionalOverAttemptGate.failedInvariants.some((message) => message.includes('OPTIONAL_ATTEMPT_LIMIT_EXCEEDED')));
const oneAllowedOptionalAttemptGate = validatePreEvaluationGate({
  paperStructure: optionalFacultyMock,
  questionPaperText: 'Question Paper',
  suggestedAnswersText: 'Suggested Answers',
  markingSchemeText: 'Marking Scheme',
  officialPaperMaxMarks: 40,
  coverageMap: {
    unmappedPages: [],
    attemptedQuestions: [
      { questionNumber: '3', subQuestionNumber: 'a', fullQuestionCode: 'Q3(a)', pages: [1] },
    ],
  } as any,
});
assert.equal(
  oneAllowedOptionalAttemptGate.passed,
  true,
  'A cleanly mapped attempt within the source-backed optional limit must proceed without NEEDS_REVIEW.',
);

const unresolvedOptionalFacultyMock = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Faculty Mock',
  materialType: 'FACULTY_MOCK_TEST',
  officialPaperMaxMarks: 40,
  questionPaperText: [
    'Faculty Mock Question Paper',
    'Candidates should attempt any two of the following questions.',
    'Question 1(a) - 10 Marks',
    'Question 2(a) - 10 Marks',
    'Question 3(a) - 10 Marks',
    'Question 4(a) - 10 Marks',
  ].join('\n'),
  suggestedAnswersText: 'Faculty Mock Suggested Answers\nComplete question-wise answers are included.',
  markingSchemeText: 'Faculty Mock Marking Scheme',
});
assert.ok(unresolvedOptionalFacultyMock.optionalSelectionRuleError);
const unresolvedOptionalGate = validatePreEvaluationGate({
  paperStructure: unresolvedOptionalFacultyMock,
  questionPaperText: 'Question Paper',
  suggestedAnswersText: 'Suggested Answers',
  markingSchemeText: 'Marking Scheme',
});
assert.ok(unresolvedOptionalGate.failedInvariants.some((message) => message.includes('OPTIONAL_SELECTION_RULE_UNRESOLVED')));

console.log('Model Test shared PYQ/MTP parser and universal sub-part contract tests passed.');
