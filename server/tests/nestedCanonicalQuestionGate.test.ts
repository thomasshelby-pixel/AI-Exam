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
  'Q2(a(i))',
  'Q2(a(ii))',
  'Q4(a(i))',
  'Q4(a(ii))',
  'Q5(b(i))',
  'Q5(c(i))',
  'Q6(5(i))',
  'Q6(5(ii))',
  'Q3(1(1))',
  'Q4(iv(iv))',
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
assert.equal(toCanonicalQuestionId('Q2(a(i))'), 'Q2(a(i))');

const paperStructure: any = {
  paperTitle: 'Nested numbering regression',
  totalPaperMaxMarks: 8,
  questions: [],
  subQuestions: validNestedIds.slice(0, 8).map((fullQuestionCode) => ({
    fullQuestionCode,
    questionNumber: fullQuestionCode.match(/^Q(\\d+)/)?.[1] || '1',
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
    questionNumber: canonicalId.match(/^Q(\\d+)/)?.[1] || '1',
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
