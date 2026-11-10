import assert from 'node:assert/strict';
import {
  buildQuestionChunkSubPartCompletenessDirective,
  parseAndValidateQuestionChunkOutput,
  requiresAnswerLevelReadabilityReview,
  assessQuestionReferenceTopicAlignment,
  removeMismatchedDerivedSourceAnchor,
} from '../services/questionChunkEvaluator.js';

function makeResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    status: 'PARTIALLY_CORRECT',
    marksAwarded: 4.5,
    reasonForDeduction: 'Some components were incomplete.',
    detailedFeedback: 'The candidate demonstrated relevant understanding and received partial credit for the supported steps.',
    confidence: 90,
    markingComponents: [
      {
        componentId: 'c1',
        componentType: 'provision',
        expectedRequirement: 'Identify the governing provision.',
        studentEvidence: 'The candidate identified the relevant provision.',
        assessment: 'correct',
        marksAvailable: 2,
        marksAwarded: 2,
        marksDeducted: 99,
      },
      {
        componentId: 'c2',
        componentType: 'working',
        expectedRequirement: 'Show the calculation working.',
        studentEvidence: 'The candidate showed a partial calculation.',
        assessment: 'partially_correct',
        marksAvailable: 3,
        marksAwarded: 0.5,
      },
    ],
    ...overrides,
  });
}

const nestedDirective = buildQuestionChunkSubPartCompletenessDirective('Q2(a(ii))', 5);
assert.match(nestedDirective, /exactly the authoritative scoreable part Q2\(a\) for 5 marks/i);
assert.match(nestedDirective, /Roman-numbered children under this lettered part/i);
assert.match(nestedDirective, /Keep other lettered sibling parts/i);
assert.doesNotMatch(nestedDirective, /Q2\(a\(ii\)\) for 3 marks/i);
assert.match(nestedDirective, /each distinct, independently mark-bearing source criterion exactly once/i);
assert.match(nestedDirective, /source's own component allocations/i);
assert.match(nestedDirective, /visibly not attempted/i);
assert.match(nestedDirective, /unreadable\s+evidence requires UNCLEAR\/review/i);
assert.match(nestedDirective, /no source criterion may be silently skipped or duplicated/i);
assert.match(nestedDirective, /do not fabricate a balancing step/i);

assert.equal(requiresAnswerLevelReadabilityReview({
  status: 'ATTEMPTED_UNCLEAR',
  readabilityStatusExplicit: false,
}), false, 'An aggregate page-level unclear label must not force review before the question evaluator independently reads the answer.');
assert.equal(requiresAnswerLevelReadabilityReview({
  status: 'ATTEMPTED_UNCLEAR',
  readabilityStatusExplicit: true,
}), true, 'An explicit answer-block unreadable decision must remain review-required.');
assert.equal(requiresAnswerLevelReadabilityReview({
  status: 'ATTEMPTED_PARTIALLY_READABLE',
  readabilityStatusExplicit: true,
}), false, 'A partially readable answer proceeds to source-grounded marking; the evaluator can still return UNCLEAR if evidence is insufficient.');

const normalized = parseAndValidateQuestionChunkOutput(makeResponse(), 5);
assert.equal(normalized.status, 'partially_correct',
  'Status labels are normalized case-insensitively.');
assert.equal(normalized.marksAwarded, 2.5,
  'Validated component awards, not the redundant question total, determine the question score.');
assert.equal(normalized.markingComponents[0].marksDeducted, 0,
  'A stale marksDeducted value is deterministically recalculated from allocation and award.');
assert.equal(normalized.markingComponents[1].marksDeducted, 2.5,
  'A missing marksDeducted value is safely derived from allocation and award.');
assert.equal(normalized.markingComponents[0].assessment, 'CORRECT',
  'Component assessment text is normalized from validated marks.');
assert.equal(normalized.markingComponents[1].assessment, 'PARTIALLY_CORRECT',
  'Partial component assessment is derived from the validated score.');
assert.equal(normalized.modelReportedMarksAwarded, 4.5,
  'The inconsistent model-reported total remains available for audit.');
assert.match(normalized.scoreReconciliationNote, /reconciled/i);
assert.equal(normalized.markingComponents[1].assessment, 'PARTIALLY_CORRECT',
  'The model’s substantive PARTIALLY_CORRECT assessment must survive parsing for Strict mode.');

const mismatchedListedCompanyReference = assessQuestionReferenceTopicAlignment({
  topic: 'Listed vs unlisted companies and the exclusions under Rule 2A',
  provision: 'Section 2(52) and Rule 2A',
  questionText: 'Determine whether Arya Limited, Chirag Limited and Prism Limited are listed companies based on listed equity, debt securities and permitted foreign stock exchanges.',
}, 'Section 139(2) concerns rotation of auditors and the appointment of an auditor at an annual general meeting.',
'The auditor is appointed for the prescribed tenure subject to rotation requirements.');
assert.equal(mismatchedListedCompanyReference.aligned, false,
  'A syntactically matched question number must not authorize a Suggested Answer about an unrelated auditor-appointment topic.');

const matchedDepositReference = assessQuestionReferenceTopicAlignment({
  topic: 'Acceptance of deposits and premature repayment',
  provision: 'Section 73 and Companies (Acceptance of Deposits) Rules',
  questionText: 'Compute the deposit limits for public and private companies and determine the permitted amount of deposits. Also calculate interest on premature repayment.',
}, 'Under Section 73 and the Companies (Acceptance of Deposits) Rules, private companies and public companies are subject to deposit limits. Premature repayment after six months attracts a reduction in the interest rate.',
'Calculate the permitted deposit amount and applicable interest reduction.');
assert.equal(matchedDepositReference.aligned, true,
  'A topic-aligned deposits reference must remain scoreable.');

const safeDerivedAllocation = removeMismatchedDerivedSourceAnchor([
  'SUBQUESTION: Q1(c)',
  'SUBQUESTION MARKS: 4',
  'SOURCE-DERIVED CONTENT ANCHOR:',
  'Companies Act section 68 buy-back of equity shares by special resolution.',
  'DERIVED EXAMINER-STYLE ALLOCATION:',
  'STEP 1: Identify the applicable statutory provision. Marks: 0.75',
  'STEP 2: State the governing legal principle. Marks: 1.00',
  'STEP 3: State conditions and exceptions. Marks: 1.50',
  'STEP 4: Apply the rule and conclude. Marks: 0.75',
].join('\n'));
assert.doesNotMatch(safeDerivedAllocation, /Companies Act section 68 buy-back/i,
  'A wrong sibling source anchor must be removed from the scoring prompt.');
assert.match(safeDerivedAllocation, /STEP 1: Identify the applicable statutory provision/);
assert.match(safeDerivedAllocation, /STEP 4: Apply the rule and conclude/,
  'Correct component weights and generic step categories must survive anchor exclusion.');
assert.equal(
  removeMismatchedDerivedSourceAnchor('Ordinary marking scheme without the generated allocation headings.'),
  '',
  'Do not preserve unverified marking-scheme content unless its derived allocation boundary is explicit.',
);

const crossWiredMarkingSchemeCases = [
  {
    id: 'Q1(c)',
    question: {
      topic: 'FEMA current account transactions and consultancy remittance approval for infrastructure projects',
      provision: 'Foreign Exchange Management Act and Current Account Transactions Rules',
      questionText: 'Alpha Infra Ltd. proposes USD 12,000,000 consultancy fees for an infrastructure project and asks whether RBI prior approval is required.',
    },
    suggestedAnswer: 'FEMA requires prior RBI approval for remittances exceeding USD 10,000,000 per infrastructure consultancy project.',
    wrongMarkingScheme: 'Companies Act buy-back of equity shares, special resolution, paid-up capital and free reserves under section 68.',
  },
  {
    id: 'Q4(b)',
    question: {
      topic: 'Appointment of internal auditor by an unlisted public company',
      provision: 'Companies Act section 138 and Companies Accounts Rules Rule 13',
      questionText: 'Downtown Limited is an unlisted public company. Its audited financial statements for FY 2024-25 show turnover of Rs 210 crore and outstanding public deposits of Rs 28 crore; determine whether it must appoint an internal auditor.',
    },
    suggestedAnswer: 'Section 138 and Rule 13 require an internal auditor where an unlisted public company has turnover of at least Rs 200 crore or outstanding deposits of at least Rs 25 crore.',
    wrongMarkingScheme: 'Companies Act filing of financial statements with Registrar within thirty days of an adjourned annual general meeting.',
  },
  {
    id: 'Q6(b)',
    question: {
      topic: 'Demand for a poll at an annual general meeting and voting rights of members present personally or by proxy',
      provision: 'Companies Act section 109 and applicable poll-demand thresholds',
      questionText: 'At Sunrise Limited AGM, 75 members present personally or through proxies and representing more than one-tenth of total voting power demand a poll. The Chairman refuses because some members are represented by proxies. Examine whether the refusal is valid.',
    },
    suggestedAnswer: 'A poll may be demanded by members present in person or by proxy who hold at least the prescribed voting power or paid-up share threshold. The Chairman cannot reject a valid poll demand merely because members are represented by proxies.',
    wrongMarkingScheme: 'Foreign company registration under Chapter XXII, section 393, validity of contracts and restriction on a foreign company filing suits before compliance.',
  },
];
for (const item of crossWiredMarkingSchemeCases) {
  const result = assessQuestionReferenceTopicAlignment(item.question, item.suggestedAnswer, item.wrongMarkingScheme);
  assert.equal(result.aligned, true,
    item.id + ': a valid Suggested Answer must remain scoreable when only the derived Marking Scheme anchor is cross-wired.');
  assert.ok(result.misalignedSources?.includes('MARKING_SCHEME'),
    item.id + ': the mismatched Marking Scheme must be explicitly identified for exclusion.');
}

const insufficientTopicAnchor = assessQuestionReferenceTopicAlignment({
  topic: 'General provisions',
  questionText: 'Explain the applicable provisions.',
}, 'This suggested answer contains several detailed requirements and an application to the facts.');
assert.equal(insufficientTopicAnchor.aligned, true,
  'A short/generic source anchor is not reliable enough to trigger a reference-mismatch review.');

const missingQuestionTotal = parseAndValidateQuestionChunkOutput(
  makeResponse({ marksAwarded: 'not-a-number' }),
  5,
);
assert.equal(missingQuestionTotal.marksAwarded, 2.5,
  'A malformed redundant question total does not invalidate complete, source-bounded component evidence.');

assert.throws(
  () => parseAndValidateQuestionChunkOutput(makeResponse({
    markingComponents: [
      {
        componentId: 'over',
        componentType: 'WORKING',
        expectedRequirement: 'Show the working.',
        studentEvidence: 'The candidate wrote a result.',
        assessment: 'CORRECT',
        marksAvailable: 2,
        marksAwarded: 2.5,
      },
      {
        componentId: 'rest',
        componentType: 'PROVISION',
        expectedRequirement: 'State the provision.',
        studentEvidence: 'The candidate named it.',
        assessment: 'CORRECT',
        marksAvailable: 3,
        marksAwarded: 3,
      },
    ],
  }), 5),
  /outside its component limit/,
  'An award above a component allocation is still rejected.',
);

assert.throws(
  () => parseAndValidateQuestionChunkOutput(makeResponse({
    markingComponents: [
      {
        componentId: 'c1',
        componentType: 'WORKING',
        expectedRequirement: 'Show the working.',
        studentEvidence: 'The working is shown.',
        assessment: 'CORRECT',
        marksAvailable: 2,
        marksAwarded: 2,
      },
      {
        componentId: 'c2',
        componentType: 'PROVISION',
        expectedRequirement: 'State the provision.',
        studentEvidence: 'The candidate named it.',
        assessment: 'CORRECT',
        marksAvailable: 2,
        marksAwarded: 2,
      },
    ],
  }), 5),
  /component allocations total 4, but the authoritative maximum is 5/,
  'Component maximum allocations must still reconcile exactly to the authoritative question maximum.',
);

assert.throws(
  () => parseAndValidateQuestionChunkOutput(makeResponse({
    markingComponents: [{
      componentId: 'c1',
      componentType: 'WORKING',
      expectedRequirement: 'Show the working.',
      studentEvidence: '',
      assessment: 'OMITTED',
      marksAvailable: 5,
      marksAwarded: 0,
    }],
  }), 5),
  /missing candidate evidence/,
  'Missing student evidence is not fabricated or silently accepted.',
);

assert.throws(
  () => parseAndValidateQuestionChunkOutput(makeResponse({
    marksAwarded: 5,
    markingComponents: [
      {
        componentId: 'partial-full-score',
        componentType: 'PROVISION',
        expectedRequirement: 'Identify the correct governing provision.',
        studentEvidence: 'The candidate identifies the relevant provision but misses its statutory conditions.',
        assessment: 'PARTIALLY_CORRECT',
        marksAvailable: 5,
        marksAwarded: 5,
      },
    ],
  }), 5),
  /CONTRADICTORY_ASSESSMENT/,
  'A full numeric award cannot silently overwrite a PARTIALLY_CORRECT assessment and bypass strict scrutiny.',
);

assert.throws(
  () => parseAndValidateQuestionChunkOutput(makeResponse({
    marksAwarded: 5,
    markingComponents: [
      {
        componentId: 'incorrect-full-score',
        componentType: 'APPLICATION',
        expectedRequirement: 'Apply the statutory requirement to the case facts.',
        studentEvidence: 'The candidate applied a different statutory topic.',
        assessment: 'INCORRECT',
        marksAvailable: 5,
        marksAwarded: 5,
      },
    ],
  }), 5),
  /CONTRADICTORY_ASSESSMENT/,
  'An INCORRECT component cannot carry full marks and be normalized into CORRECT.',
);

console.log('Question chunk output validation tests passed.');
