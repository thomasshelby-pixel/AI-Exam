import assert from 'node:assert/strict';
import {
  extractSubQuestionsFromText,
  extractOptionalAttemptSelectionRule,
  getAuthoritativePaperStructure,
} from '../services/paperStructureService.js';
import { deduplicateQuestionList, parseCanonicalQuestionIdentity, toCanonicalQuestionId, validateQuestionDeduplication } from '../services/canonicalQuestionService.js';
import { validatePreEvaluationGate } from '../services/evaluationIntegrityHardening.js';
import {
  buildCanonicalQuestionInventory,
  detectIndependentAttempts,
} from '../services/canonicalQuestionInventoryService.js';
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

// Taxation PYQ/MTP/Model Test must use the same universal source parser as
// every other subject. Do not inject the legacy 16-MCQ / Q1-Q8 template.
const taxationSourceBundle = {
  questionPaperText: [
    'CA Intermediate Taxation - Question Paper',
    'SECTION A - MULTIPLE CHOICE QUESTIONS',
    'Each MCQ carries 2 Marks.',
    'MCQ 1 - Income tax objective question.',
    'MCQ 2 - GST objective question.',
    'SECTION B - DESCRIPTIVE QUESTIONS',
    'Question 1(a) - 4 Marks',
    'Question 1(b) - 6 Marks',
    'Question 2(a)(i) - 2 Marks',
    'First Roman clause QP requirement: determine the applicable legal condition.',
    'Question 2(a)(ii) - 3 Marks',
    'Second Roman clause QP requirement: apply the condition to the given facts.',
  ].join('\n'),
  suggestedAnswersText: [
    'Taxation Suggested Answers',
    'SECTION A - MULTIPLE CHOICE QUESTIONS',
    '1. (C) Official source key for the selected PYQ/MTP.',
    '2. (B) Official source key for the selected PYQ/MTP.',
    'SECTION B - DESCRIPTIVE QUESTIONS',
    'Question 1(a) - Official answer for Taxation sub-part 1(a).',
    'Question 1(b) - Official answer for Taxation sub-part 1(b).',
    'Question 2(a)(i) - Official answer for the first nested clause: explain the legal condition.',
    'Question 2(a)(ii) - Official answer for the second nested clause: apply and conclude on the facts.',
  ].join('\n'),
  markingSchemeText: [
    'Taxation Marking Scheme',
    'Question 1(a) - 4 Marks',
    'Question 1(b) - 6 Marks',
    'Question 2(a)(i) - 2 Marks',
    'Question 2(a)(ii) - 3 Marks',
  ].join('\n'),
  officialPaperMaxMarks: 100,
};
const taxationStructures = Object.fromEntries(materialTypes.map((materialType) => [
  materialType,
  getAuthoritativePaperStructure({
    ...taxationSourceBundle,
    level: 'INTERMEDIATE',
    subjectName: 'Taxation',
    paper: 'Paper 3: Taxation',
    materialType,
  }),
])) as Record<(typeof materialTypes)[number], ReturnType<typeof getAuthoritativePaperStructure>>;
assert.deepEqual(taxationStructures.MODEL_TEST_PAPER, taxationStructures.MTP);
assert.deepEqual(taxationStructures.PYQ, taxationStructures.MTP);
assert.deepEqual(
  taxationStructures.MTP.subQuestions.map((question) => [question.fullQuestionCode, question.maximumMarks]),
  [['Q1(a)', 4], ['Q1(b)', 6], ['Q2(a)', 5]],
  'Taxation Roman child allocations must aggregate under the lettered scoreable question using source-backed marks.',
);
const consolidatedTaxationQ2a = taxationStructures.MTP.subQuestions.find(
  (question) => question.fullQuestionCode === 'Q2(a)',
);
assert.equal(consolidatedTaxationQ2a?.maximumMarks, 5,
  'The evaluator must receive the combined authoritative parent maximum, not the first Roman child\'s 2 marks.');
assert.match(consolidatedTaxationQ2a?.questionText || '', /First Roman clause QP requirement/);
assert.match(consolidatedTaxationQ2a?.questionText || '', /Second Roman clause QP requirement/,
  'The consolidated QP source context must retain both Roman clauses.');
assert.match(consolidatedTaxationQ2a?.suggestedAnswerAnchor || '', /first nested clause/);
assert.match(consolidatedTaxationQ2a?.suggestedAnswerAnchor || '', /second nested clause/,
  'The consolidated SA source context must retain both Roman answer sections.');
assert.equal(
  taxationStructures.MTP.questions.find((question) => question.questionNumber === '2')?.maximumMarks,
  5,
  'The parent question summary must use the same consolidated maximum as the scoreable sub-question.',
);
assert.deepEqual(
  taxationStructures.MTP.mcqs.map((question) => [question.fullQuestionCode, question.maximumMarks]),
  [['MCQ1', 2], ['MCQ2', 2]],
  'Taxation PYQ/MTP MCQ count and marks must come from the selected Suggested Answers and Question Paper, not a fixed 16-MCQ template.',
);
// CA Final Direct/Indirect Tax must never receive the CA Intermediate Paper 3
// Taxation template merely because the subject title contains the word "tax".
const caFinalTaxPaper = getAuthoritativePaperStructure({
  level: 'FINAL',
  subjectName: 'Direct Tax Laws and International Taxation',
  paper: 'Paper 4',
  materialType: 'PYQ',
  questionPaperText: [
    'CA Final Direct Tax Laws - Question Paper',
    'Question 1(a) - 4 Marks',
    'Question 2(a) - 6 Marks',
  ].join('\n'),
  suggestedAnswersText: [
    'Suggested Answers',
    'Question 1(a) - Source-backed answer for CA Final direct tax problem.',
    'Question 2(a) - Source-backed answer for international tax problem.',
  ].join('\n'),
  markingSchemeText: [
    'Marking Scheme',
    'Question 1(a) - 4 Marks',
    'Question 2(a) - 6 Marks',
  ].join('\n'),
  officialPaperMaxMarks: 100,
});
assert.notEqual(caFinalTaxPaper.paperTitle, 'CA Intermediate – Paper 3: Taxation');
assert.deepEqual(
  caFinalTaxPaper.subQuestions.map((question) => [question.fullQuestionCode, question.maximumMarks]),
  [['Q1(a)', 4], ['Q2(a)', 6]],
  'CA Final tax question identity/marks must be extracted from the selected paper, not the Intermediate template.',
);

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


// Roman-numbered children beneath a lettered part are grouped into that
// parent scoreable question. Arabic children and standalone Roman parts remain distinct.
const universalPartSource = [
  'Question 1(a)(i) - 2 Marks',
  'Question 1(a)(ii) - 3 Marks',
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
  ['Q1(a)', 5],
  ['Q1(b)', 5],
  ['Q2(iv)', 3],
  ['Q2(2)', 4],
  ['Q3(1(1))', 1],
  ['Q3(1(2))', 2],
  ['Q4(iv(1))', 2],
  ['Q4(iv(2))', 3],
] as const) {
  assert.equal(universalMaxima.get(code), marks, code + ' must retain its source-backed maximum.');
}
assert.equal(universalMaxima.has('Q1(a)(i)'), false,
  'Roman child labels must not become separate scoreable question IDs.');
assert.equal(universalMaxima.has('Q1(a)(ii)'), false,
  'A second Roman child must be absorbed into the same parent part.');
assert.equal(toCanonicalQuestionId('Q1(1)(i)'), 'Q1(1)',
  'Roman children under a numeric parent must be folded as well.');
assert.equal(toCanonicalQuestionId('Q1(iv)(i)'), 'Q1(iv)',
  'Roman children below a Roman parent are also absorbed.');
const rawNestedIdentity = parseCanonicalQuestionIdentity('Q1(a)(ii)');
assert.equal(rawNestedIdentity.canonicalId, 'Q1(a)');
assert.deepEqual(rawNestedIdentity.subQuestionPath, ['a']);
assert.deepEqual(rawNestedIdentity.sourceSubQuestionPath, ['a', 'ii'],
  'The original Roman path must remain available for source-mark aggregation after scoreable identity is flattened.');

// An explicit parent total takes precedence over child allocations; never add
// the same marks twice when the source states both a total and its breakdown.
const explicitParentTotal = extractSubQuestionsFromText([
  'Question 5(a) - 10 Marks',
  'Question 5(a)(i) - 2 Marks',
  'Question 5(a)(ii) - 3 Marks',
].join('\n'));
assert.deepEqual(
  explicitParentTotal.map((part) => [part.fullQuestionCode, part.maximumMarks]),
  [['Q5(a)', 10]],
  'An explicit lettered-part maximum must not be inflated by its Roman rubric rows.',
);

const sourceDrivenRomanParts = getAuthoritativePaperStructure({
  level: 'INTERMEDIATE',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  materialType: 'MTP',
  officialPaperMaxMarks: 100,
  questionPaperText: [
    'MODEL TEST PAPER 1 QUESTION PAPER',
    'Question 11(a)(i) - 2 Marks',
    'Question 11(a)(ii) - 3 Marks',
    'Question 11(b) - 4 Marks',
    'Question 12(a) - 10 Marks',
    'Question 12(a)(i) - 2 Marks',
    'Question 12(a)(ii) - 3 Marks',
  ].join('\n'),
});
const sourceDrivenRomanMaxima = new Map(sourceDrivenRomanParts.subQuestions.map((part) => [
  part.fullQuestionCode,
  part.maximumMarks,
]));
assert.deepEqual(
  Array.from(sourceDrivenRomanMaxima.entries()).sort((left, right) => left[0].localeCompare(right[0])),
  [['Q11(a)', 5], ['Q11(b)', 4], ['Q12(a)', 10]],
  'The MTP inventory must expose only lettered scoreable parts, sum Roman-only allocations, and respect explicit parent maxima.',
);
const groupedQuestionText = sourceDrivenRomanParts.subQuestions.find((part) => part.fullQuestionCode === 'Q11(a)')?.questionText || '';
assert.match(groupedQuestionText, /Question 11\(a\)\(i\)/i);
assert.match(groupedQuestionText, /Question 11\(a\)\(ii\)/i,
  'The parent question reference slice must retain all Roman child source content.');
assert.equal(
  toCanonicalQuestionId('Q1(a)(iii)', undefined, universalParts),
  'Q1(a)',
  'Unknown Roman child labels intentionally resolve to their lettered parent.',
);
assert.equal(
  toCanonicalQuestionId('Q1(a)(i)'),
  toCanonicalQuestionId('Q1(a)(ii)'),
  'Roman-numbered siblings below the same lettered part share one canonical identity.',
);
assert.notEqual(
  toCanonicalQuestionId('Q1(a)(1)'),
  toCanonicalQuestionId('Q1(a)(2)'),
  'Arabic-numbered siblings remain independently identifiable.',
);
assert.equal(
  parseCanonicalQuestionIdentity('Question 4 Part IV Clause 2').canonicalId,
  'Q4(iv(2))',
  'Named Part/Clause numbering outside a lettered parent remains hierarchical.',
);

const nestedParentDedup = deduplicateQuestionList([
  { fullQuestionCode: 'Q7(a)', questionNumber: '7', subQuestion: 'a', maximumMarks: 10 },
  { fullQuestionCode: 'Q7(a(i))', questionNumber: '7', subQuestion: 'a(i)', maximumMarks: 4 },
  { fullQuestionCode: 'Q7(a(ii))', questionNumber: '7', subQuestion: 'a(ii)', maximumMarks: 6 },
]);
assert.deepEqual(
  nestedParentDedup.map((item) => item.fullQuestionCode),
  ['Q7(a)'],
  'All Roman children and their lettered parent must collapse into one scoreable part.',
);

// Arabic nested leaves are still separate, so both root and intermediate
// containers remain detectable by the structural integrity validator.
const nestedParentValidation = validateQuestionDeduplication([
  { fullQuestionCode: 'Q8', questionNumber: '8' },
  { fullQuestionCode: 'Q8(a)', questionNumber: '8', subQuestion: 'a' },
  { fullQuestionCode: 'Q8(a(1))', questionNumber: '8', subQuestion: 'a(1)' },
  { fullQuestionCode: 'Q8(a(2))', questionNumber: '8', subQuestion: 'a(2)' },
]);
assert.equal(nestedParentValidation.isValid, false);
assert.ok(nestedParentValidation.parentChildCollisions.includes('Q8'));
assert.ok(nestedParentValidation.parentChildCollisions.includes('Q8(a)'),
  'An Arabic nested leaf must still flag its immediate parent container.');

// Detected Roman child occurrences are coalesced into one attempt and preserve
// every source page rather than generating separate leaf tasks.
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
  ['Q1(a)', 'Q1(b)', 'Q2(a)'],
  'Roman child detections must be represented by their parent lettered question.',
);
assert.deepEqual(
  normalizedDetectedAttempts.attemptedQuestions.find((attempt) => attempt.fullQuestionCode === 'Q1(a)')?.pages,
  [1, 2, 3],
  'The consolidated part must retain all pages from its parent and Roman child detections.',
);

const nestedAttemptInventory = buildCanonicalQuestionInventory({
  paperStructure: {
    paperTitle: 'Roman Child Aggregation Regression',
    totalPaperMaxMarks: 10,
    questions: [],
    subQuestions: [
      { fullQuestionCode: 'Q1(a(i))', questionNumber: '1', maximumMarks: 2, compulsory: true, isMcq: false, section: 'A' },
      { fullQuestionCode: 'Q1(a(ii))', questionNumber: '1', maximumMarks: 3, compulsory: true, isMcq: false, section: 'A' },
    ],
    mcqs: [],
  } as any,
  totalPaperMaxMarks: 10,
});
assert.deepEqual(
  nestedAttemptInventory.items.map((item) => [item.questionId, item.maxMarks]),
  [['Q1(a)', 5]],
  'Legacy/source structures with Roman child rows must become one parent inventory item with summed child marks.',
);
const nestedAttemptMap = detectIndependentAttempts({
  inventory: nestedAttemptInventory,
  rawPageOccurrences: [
    { questionCode: 'Q1(a)', pageNumber: 1, studentSnippet: '(a) Workings are continued below.' },
    { questionCode: 'Q1(a(i))', pageNumber: 2, studentSnippet: '(i) First calculation step.' },
    { questionCode: 'Q1(a(ii))', pageNumber: 3, studentSnippet: '(ii) Second calculation step.' },
  ],
});
assert.deepEqual(
  Array.from(nestedAttemptMap.keys()),
  ['Q1(a)'],
  'All Roman children must coalesce into one independent attempt.',
);
assert.deepEqual(
  nestedAttemptMap.get('Q1(a)')?.sourcePages,
  [1, 2, 3],
  'The parent attempt must keep every Roman child source page.',
);

const nestedContinuationAttempts = detectIndependentAttempts({
  inventory: nestedAttemptInventory,
  rawPageOccurrences: [
    { questionCode: 'Q1(a)(i)', pageNumber: 1, studentSnippet: '(i) First clause solution.' },
    {
      questionCode: 'Q1(a)',
      pageNumber: 2,
      studentSnippet: '(ii) Second clause solution continues on this page.',
      isContinuation: true,
    },
  ],
});
assert.deepEqual(
  Array.from(nestedContinuationAttempts.keys()),
  ['Q1(a)'],
  'A Roman-labelled continuation must remain part of the same lettered evaluation.',
);
assert.deepEqual(nestedContinuationAttempts.get('Q1(a)')?.sourcePages, [1, 2]);

// Contextual Roman headings beneath one question/lettered parent aggregate
// their source marks into one Q9(a) maximum.
const contextualParts = extractSubQuestionsFromText([
  'Question 9',
  '(a) Parent part overview.',
  '(i) First roman clause - 2 Marks',
  '(ii) Second roman clause - 3 Marks',
  '(b) Sibling lettered part - 4 Marks',
].join('\n'));
assert.deepEqual(
  contextualParts.map((part) => [part.fullQuestionCode, part.maximumMarks]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  [['Q9(a)', 5], ['Q9(b)', 4]],
  'Contextual Roman children must aggregate under the active lettered question.',
);
const namedContextualParts = extractSubQuestionsFromText([
  'Question 10 Part IV',
  'Clause 1 - 2 Marks',
  'Clause 2 - 3 Marks',
].join('\n'));
assert.deepEqual(
  namedContextualParts.map((part) => [part.fullQuestionCode, part.maximumMarks]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  [['Q10(iv(1))', 2], ['Q10(iv(2))', 3]],
  'A named Roman parent followed by Arabic clauses must retain distinct numeric children.',
);


// A numeric detail nested inside a Roman clause must remain within the
// lettered parent after the Roman layer is flattened, while direct Arabic
// sub-parts under (a) remain separate scoreable parts.
const romanWithNumericDetails = extractSubQuestionsFromText([
  'Question 13',
  '(a) Main lettered answer.',
  '(i) First Roman clause - 2 Marks',
  '(1) First detail inside Roman clause - 1 Mark',
  '(2) Second detail inside Roman clause - 1 Mark',
  '(ii) Second Roman clause - 2 Marks',
  '(b) Separate lettered sibling - 3 Marks',
].join('\n'));
assert.deepEqual(
  romanWithNumericDetails.map((part) => [part.fullQuestionCode, part.maximumMarks]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  [['Q13(a)', 6], ['Q13(b)', 3]],
  'All detail rows inside Roman children must be included in the lettered part maximum.',
);

const directArabicChildren = extractSubQuestionsFromText([
  'Question 14',
  '(a) Parent heading.',
  '(1) First independently numbered Arabic part - 2 Marks',
  '(2) Second independently numbered Arabic part - 3 Marks',
  '(b) Separate lettered sibling - 1 Mark',
].join('\n'));
assert.deepEqual(
  directArabicChildren.map((part) => [part.fullQuestionCode, part.maximumMarks]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  [['Q14(a(1))', 2], ['Q14(a(2))', 3], ['Q14(b)', 1]],
  'Arabic children directly under the lettered parent must stay independently scoreable.',
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
assert.equal(optionalFacultyMock.questions.find((question) => question.questionNumber === '1')?.compulsory, true);
for (const questionNumber of ['2', '3', '4']) {
  assert.equal(
    optionalFacultyMock.questions.find((question) => question.questionNumber === questionNumber)?.compulsory,
    false,
    'The parent question must be optional when the selected QP allows choosing among it.',
  );
  assert.ok(
    optionalFacultyMock.subQuestions
      .filter((subQuestion) => subQuestion.questionNumber === questionNumber)
      .every((subQuestion) => subQuestion.compulsory === false),
    'Every leaf sub-part under an optional parent must also be marked optional.',
  );
}
const optionalInventory = buildCanonicalQuestionInventory({
  paperStructure: optionalFacultyMock,
  totalPaperMaxMarks: 40,
});
assert.ok(
  optionalInventory.items
    .filter((item) => item.parentQuestionId === 'Q2' || item.parentQuestionId === 'Q3' || item.parentQuestionId === 'Q4')
    .every((item) => item.isRequiredOrOptional === 'OPTIONAL'),
  'Canonical leaf inventory must preserve optional selection metadata from the official source.',
);
for (const verb of ['Choose', 'Select']) {
  const rule = extractOptionalAttemptSelectionRule(
    `Instructions: ${verb} any one question from Q2, Q3 and Q4.`,
    '',
    ['1', '2', '3', '4'],
  );
  assert.deepEqual(
    rule?.questionNumbers,
    ['2', '3', '4'],
    verb + ' any-one instruction must resolve the explicit allowed parent question set.',
  );
}
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
