import assert from 'node:assert/strict';
import {
  hasInvalidRecursiveQuestionNesting,
  parseCanonicalQuestionIdentity,
  toCanonicalQuestionId,
} from '../services/canonicalQuestionService.js';
import {
  validatePreEvaluationGate,
  validatePostEvaluationGate,
} from '../services/evaluationIntegrityHardening.js';

const validNestedIds = [
  'Q2(a(1))',
  'Q2(b(2))',
  'Q6(5)',
  'Q6(6)',
  'Q3(1(1))',
  'Q3(1(2))',
  'Q4(iv)',
  'Q5(2)',
];

for (const id of validNestedIds) {
  assert.equal(
    hasInvalidRecursiveQuestionNesting(id),
    false,
    `${id} is a valid nested CA question identity and must not be blocked.`,
  );
  assert.equal(parseCanonicalQuestionIdentity(id).canonicalId, id);
}

assert.equal(
  hasInvalidRecursiveQuestionNesting('Q3(b(b))'),
  true,
  'Repeated alphabetic OCR echo Q3(b(b)) remains invalid.',
);
assert.equal(
  hasInvalidRecursiveQuestionNesting('Q4(a(a))'),
  true,
  'Repeated alphabetic OCR echo Q4(a(a)) remains invalid.',
);
assert.equal(
  hasInvalidRecursiveQuestionNesting('Q2', 'a(a)'),
  true,
  'Malformed nesting must also be detected when the child path is stored separately.',
);
assert.equal(
  hasInvalidRecursiveQuestionNesting('Q2(a)', 'i'),
  false,
  'A separate Roman child below an alphabetic parent is valid.',
);
assert.equal(toCanonicalQuestionId('Q2(a(i))'), 'Q2(a)');
assert.equal(toCanonicalQuestionId('Q2(a(ii))'), 'Q2(a)');
assert.equal(toCanonicalQuestionId('Q2(a)', 'i'), 'Q2(a)',
  'A separately supplied Roman child label must normalize to its parent scoreable ID.');
assert.equal(toCanonicalQuestionId('Q2(a)', 'ii'), 'Q2(a)',
  'A separately supplied sibling Roman label must normalize to the same parent scoreable ID.');
assert.equal(toCanonicalQuestionId('Q2', 'iv'), 'Q2(iv)',
  'A standalone Roman question part must remain independently scoreable.');
assert.equal(toCanonicalQuestionId('Q2(a(i)(1))'), 'Q2(a)');
assert.equal(toCanonicalQuestionId('Q2(a(1)(i))'), 'Q2(a(1))');
assert.equal(toCanonicalQuestionId('Q2(i)'), 'Q2(i)', 'A standalone Roman-numbered part remains distinct.');
assert.equal(toCanonicalQuestionId('Q2(iv(1))'), 'Q2(iv(1))', 'A Roman parent with an Arabic child remains distinct.');
assert.equal(toCanonicalQuestionId('Q2(1)(i)'), 'Q2(1)', 'Roman children below a numeric parent are folded into that parent.');
assert.equal(toCanonicalQuestionId('Q2(iv)(i)'), 'Q2(iv)', 'Roman child clauses are folded even when the parent label is Roman.');

const paperStructure: any = {
  paperTitle: 'Nested numbering regression',
  totalPaperMaxMarks: 8,
  questions: [],
  subQuestions: validNestedIds.slice(0, 8).map((fullQuestionCode) => ({
    fullQuestionCode,
    questionNumber: fullQuestionCode.match(/^Q(\d+)/)?.[1] || '1',
    subQuestionNumber: undefined,
    maximumMarks: 1,
    isMcq: false,
  })),
  mcqs: [],
};

const preGate = validatePreEvaluationGate({
  paperStructure,
  questionPaperText: validNestedIds.join(' — '),
  suggestedAnswersText: validNestedIds.join(' — '),
  markingSchemeText: 'Every listed nested leaf carries 1 mark.',
  officialPaperMaxMarks: 8,
});
assert.equal(
  preGate.failedInvariants.some((item) => item.includes('MALFORMED_CANONICAL_ID')),
  false,
  'Pre-evaluation integrity gate must accept all valid nested numbering paths.',
);

const validEvaluation: any = {
  questions: validNestedIds.slice(0, 8).map((canonicalId) => ({
    canonicalId,
    questionNumber: canonicalId.match(/^Q(\d+)/)?.[1] || '1',
    maximumMarks: 1,
    marksAwarded: 0,
    status: 'not_attempted',
    markingComponents: [],
  })),
  totalMarks: 0,
  maximumMarks: 8,
  officialPaperMaxMarks: 8,
};

const postGate = validatePostEvaluationGate({ evaluationResult: validEvaluation });
assert.equal(
  postGate.errors.some((item) => item.includes('MALFORMED_CANONICAL_ID')),
  false,
  'Post-evaluation integrity gate must accept all valid nested numbering paths.',
);

const malformedPreGate = validatePreEvaluationGate({
  paperStructure: {
    ...paperStructure,
    subQuestions: [{
      fullQuestionCode: 'Q3(b(b))',
      questionNumber: '3',
      subQuestionNumber: 'b(b)',
      maximumMarks: 1,
      isMcq: false,
    }],
  } as any,
  officialPaperMaxMarks: 1,
});
assert.ok(
  malformedPreGate.failedInvariants.some((item) => item.includes('MALFORMED_CANONICAL_ID')),
  'Pre-evaluation gate must still reject repeated alphabetic sub-part echoes.',
);

const malformedPostGate = validatePostEvaluationGate({
  evaluationResult: {
    ...validEvaluation,
    questions: [{
      canonicalId: 'Q3(b(b))',
      questionNumber: '3',
      subQuestion: 'b(b)',
      maximumMarks: 1,
      marksAwarded: 0,
      status: 'not_attempted',
      markingComponents: [],
    }],
    maximumMarks: 1,
    officialPaperMaxMarks: 1,
  } as any,
});
assert.ok(
  malformedPostGate.errors.some((item) => item.includes('MALFORMED_CANONICAL_ID')),
  'Post-evaluation gate must still reject repeated alphabetic sub-part echoes.',
);

console.log('Valid nested canonical question IDs pass pre/post gates; repeated alphabetic echoes remain blocked.');
