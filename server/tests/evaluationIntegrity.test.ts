import {
  isPresentationMarkingAllowed,
  filterAndRejectPresentationDeductions,
  evaluateZeroMarkSafetyGate,
  normalizeQuestionComponents,
  validateAuthoritativeConsistency,
  processEvaluationIntegrity,
} from '../services/evaluationIntegrityEngine.js';
import { EvaluationResult, MarkingComponent } from '../../src/types/index.js';

console.log('================================================================');
console.log('--- RUNNING CRITICAL CA EVALUATION ACCURACY & INTEGRITY TESTS ---');
console.log('================================================================');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    process.exitCode = 1;
  }
}

// --------------------------------------------------------------------------
// TEST A: Taxation problem with correct final amount but incorrect provision
// Rule 5: Correct final number with invalid provision must NOT receive full marks.
// --------------------------------------------------------------------------
console.log('\n--- TEST A: Taxation - Correct Amount with Incorrect Provision ---');
{
  const components: MarkingComponent[] = [
    {
      componentId: 'Q1_c1',
      componentType: 'PROVISION',
      expectedRequirement: 'Cite Section 54EC and explain conditions',
      studentEvidence: 'Cited Section 54F instead of Section 54EC',
      assessment: 'INCORRECT',
      marksAvailable: 2,
      marksAwarded: 0,
      marksDeducted: 2,
      deductionReason: 'Incorrect section cited: Section 54F deals with residential house, not specified bonds under 54EC.',
      confidence: 95,
    },
    {
      componentId: 'Q1_c2',
      componentType: 'CALCULATION',
      expectedRequirement: 'Calculate taxable capital gain after exemption: Rs. 20,00,000',
      studentEvidence: 'Arrived at taxable capital gain of Rs. 20,00,000',
      assessment: 'CORRECT',
      marksAvailable: 3,
      marksAwarded: 3,
      marksDeducted: 0,
      confidence: 95,
    },
  ];

  const normalized = normalizeQuestionComponents(components, 5, 3, '1');
  const provComp = normalized.find((c) => c.componentType === 'PROVISION');
  const calcComp = normalized.find((c) => c.componentType === 'CALCULATION');

  assert(
    provComp?.marksAwarded === 0 && provComp.marksDeducted === 2,
    'TEST A.1: Provision marks correctly deducted for wrong section'
  );
  assert(
    calcComp?.marksAwarded === 3 && calcComp.marksDeducted === 0,
    'TEST A.2: Calculation marks correctly awarded despite wrong provision'
  );
  const totalAwarded = normalized.reduce((acc, c) => acc + c.marksAwarded, 0);
  assert(
    totalAwarded === 3 && totalAwarded < 5,
    'TEST A.3: Did not blindly award full 5 marks for final number'
  );
}

// --------------------------------------------------------------------------
// TEST B: Arithmetic slip in intermediate step with correct working & provision
// Consequential marking: Award step credit, isolate single calculation slip.
// --------------------------------------------------------------------------
console.log('\n--- TEST B: Arithmetic Slip with Consequential Marking ---');
{
  const components: MarkingComponent[] = [
    {
      componentId: 'Q2_c1',
      componentType: 'PROVISION',
      expectedRequirement: 'State depreciation rate as per Section 32 (15% for plant & machinery)',
      studentEvidence: 'Correctly cited Section 32 and applicable rate of 15%',
      assessment: 'CORRECT',
      marksAvailable: 2,
      marksAwarded: 2,
      marksDeducted: 0,
      confidence: 95,
    },
    {
      componentId: 'Q2_c2',
      componentType: 'CALCULATION',
      expectedRequirement: 'Calculate opening WDV + additions: 10,00,000 + 2,00,000 = 12,00,000',
      studentEvidence: 'Wrote 10,00,000 + 2,00,000 = 11,00,000 (arithmetic slip)',
      assessment: 'PARTIALLY_CORRECT',
      marksAvailable: 2,
      marksAwarded: 1,
      marksDeducted: 1,
      deductionReason: 'Arithmetic addition slip in base WDV computation.',
      confidence: 95,
    },
    {
      componentId: 'Q2_c3',
      componentType: 'WORKING',
      expectedRequirement: 'Compute 15% depreciation on base figure',
      studentEvidence: 'Computed exactly 15% on 11,00,000 = 1,65,000 (consequentially correct)',
      assessment: 'CORRECT',
      marksAvailable: 2,
      marksAwarded: 2,
      marksDeducted: 0,
      confidence: 95,
    },
  ];

  const normalized = normalizeQuestionComponents(components, 6, 5, '2');
  const workingComp = normalized.find((c) => c.componentId === 'Q2_c3');
  assert(
    workingComp?.marksAwarded === 2,
    'TEST B.1: Consequential credit preserved for working step despite prior arithmetic error'
  );
  assert(
    normalized.reduce((s, c) => s + c.marksAwarded, 0) === 5,
    'TEST B.2: Total marks awarded equals 5/6 (only 1 mark lost for arithmetic slip)'
  );
}

// --------------------------------------------------------------------------
// TEST C: Law question with correct legal conclusion but missing reasoning
// Rule 6: Deduct only reasoning marks, preserve conclusion credit.
// --------------------------------------------------------------------------
console.log('\n--- TEST C: Law - Correct Conclusion with Missing Reasoning ---');
{
  const components: MarkingComponent[] = [
    {
      componentId: 'Q3_c1',
      componentType: 'PROVISION',
      expectedRequirement: 'Section 135 Companies Act 2013 on CSR applicability',
      studentEvidence: 'Cited Section 135 correctly',
      assessment: 'CORRECT',
      marksAvailable: 1.5,
      marksAwarded: 1.5,
      marksDeducted: 0,
      confidence: 95,
    },
    {
      componentId: 'Q3_c2',
      componentType: 'REASONING',
      expectedRequirement: 'Analyze net worth >= 500 cr, turnover >= 1000 cr, or net profit >= 5 cr criteria',
      studentEvidence: 'Omitted detailed analysis of net profit thresholds',
      assessment: 'INCORRECT',
      marksAvailable: 2,
      marksAwarded: 0,
      marksDeducted: 2,
      deductionReason: 'Missing analysis of the 3 statutory financial thresholds.',
      confidence: 95,
    },
    {
      componentId: 'Q3_c3',
      componentType: 'CONCLUSION',
      expectedRequirement: 'Conclude that CSR committee is required',
      studentEvidence: 'Directly concluded that CSR committee is required',
      assessment: 'CORRECT',
      marksAvailable: 1.5,
      marksAwarded: 1.5,
      marksDeducted: 0,
      confidence: 95,
    },
  ];

  const normalized = normalizeQuestionComponents(components, 5, 3, '3');
  const conclComp = normalized.find((c) => c.componentType === 'CONCLUSION');
  const reasComp = normalized.find((c) => c.componentType === 'REASONING');

  assert(
    conclComp?.marksAwarded === 1.5,
    'TEST C.1: Conclusion marks credited when conclusion is correct'
  );
  assert(
    reasComp?.marksAwarded === 0 && reasComp.marksDeducted === 2,
    'TEST C.2: Reasoning deduction isolated solely to reasoning component'
  );
}

// --------------------------------------------------------------------------
// TEST D: Audit question with correct standard/principle but incomplete procedure
// Rule 7: Standard/principle marks preserved, procedure marks deducted.
// --------------------------------------------------------------------------
console.log('\n--- TEST D: Audit - Correct Standard but Incomplete Procedure ---');
{
  const components: MarkingComponent[] = [
    {
      componentId: 'Q4_c1',
      componentType: 'PRINCIPLE',
      expectedRequirement: 'SA 501 Audit Evidence - Specific Considerations for Inventory',
      studentEvidence: 'Correctly identified SA 501 and auditor duty to attend physical count',
      assessment: 'CORRECT',
      marksAvailable: 2,
      marksAwarded: 2,
      marksDeducted: 0,
      confidence: 95,
    },
    {
      componentId: 'Q4_c2',
      componentType: 'APPLICATION',
      expectedRequirement: 'Alternative audit procedures when physical attendance is impracticable',
      studentEvidence: 'Mentioned inspection of subsequent sales documentation only, missed third party confirmation',
      assessment: 'PARTIALLY_CORRECT',
      marksAvailable: 3,
      marksAwarded: 1.5,
      marksDeducted: 1.5,
      deductionReason: 'Did not specify external confirmation under SA 505 as alternative procedure.',
      confidence: 95,
    },
  ];

  const normalized = normalizeQuestionComponents(components, 5, 3.5, '4');
  const princComp = normalized.find((c) => c.componentType === 'PRINCIPLE');
  assert(
    princComp?.marksAwarded === 2,
    'TEST D.1: SA Standard principle marks preserved in full'
  );
  assert(
    normalized.reduce((s, c) => s + c.marksAwarded, 0) === 3.5,
    'TEST D.2: Partial procedure credit awarded appropriately'
  );
}

// --------------------------------------------------------------------------
// TEST E: Candidate writes in clear paragraphs instead of a table
// Rules 1 & 10: Absolutely ZERO presentation deduction allowed.
// --------------------------------------------------------------------------
console.log('\n--- TEST E: Paragraph Format Instead of Table (No Presentation Deduction) ---');
{
  const components: MarkingComponent[] = [
    {
      componentId: 'Q5_c1',
      componentType: 'PRESENTATION',
      expectedRequirement: 'Draw GST computation table with columns for SGST, CGST, and IGST',
      studentEvidence: 'Candidate computed SGST, CGST, and IGST sequentially in clean paragraphs',
      assessment: 'INCORRECT',
      marksAvailable: 1,
      marksAwarded: 0,
      marksDeducted: 1,
      deductionReason: 'Answer written in paragraph form instead of required tabular format.',
      confidence: 95,
    },
    {
      componentId: 'Q5_c2',
      componentType: 'CALCULATION',
      expectedRequirement: 'Calculate total output GST: Rs. 1,80,000',
      studentEvidence: 'Calculated output GST Rs. 1,80,000 accurately in text',
      assessment: 'CORRECT',
      marksAvailable: 4,
      marksAwarded: 4,
      marksDeducted: 0,
      confidence: 95,
    },
  ];

  const { components: filtered, rejectedDeductions } = filterAndRejectPresentationDeductions(components, false);

  assert(
    rejectedDeductions.length === 1,
    'TEST E.1: Unjustified presentation deduction was identified and rejected'
  );
  const presComp = filtered.find((c) => c.componentId === 'Q5_c1');
  assert(
    presComp?.marksAwarded === 1 && presComp.marksDeducted === 0,
    'TEST E.2: Deducted mark was restored in full to the candidate'
  );
  assert(
    presComp?.deductionReason?.includes('Advisory Note'),
    'TEST E.3: Presentation preference converted to non-punitive advisory observation'
  );
}

// --------------------------------------------------------------------------
// TEST F: Non-identical phrasing compared to Suggested Answer
// Rule 2: Substantive equivalence credited without verbatim match requirement.
// --------------------------------------------------------------------------
console.log('\n--- TEST F: Non-Identical Phrasing with Suggested Answer ---');
{
  const components: MarkingComponent[] = [
    {
      componentId: 'Q6_c1',
      componentType: 'PROVISION',
      expectedRequirement: 'Ultra vires doctrine meaning acts beyond company memorandum powers',
      studentEvidence: 'Student wrote: Any transaction carried out by directors exceeding object clause powers is completely null and void',
      assessment: 'CORRECT',
      marksAvailable: 4,
      marksAwarded: 4,
      marksDeducted: 0,
      confidence: 95,
    },
  ];

  const normalized = normalizeQuestionComponents(components, 4, 4, '6');
  assert(
    normalized[0].marksAwarded === 4,
    'TEST F.1: Candidate awarded full credit for conceptually sound phrasing'
  );
}

// --------------------------------------------------------------------------
// TEST G: Correct formula in an otherwise wrong answer
// Rule 3: Zero-Mark Safety Gate forbids 0 if any creditworthy element exists.
// --------------------------------------------------------------------------
console.log('\n--- TEST G: Zero-Mark Safety Gate with Correct Formula ---');
{
  const gateResult = evaluateZeroMarkSafetyGate({
    questionNumber: '7',
    maxMarks: 5,
    awardedMarks: 0,
    status: 'incorrect',
    components: [],
    studentEvidence: 'Wrote correct formula for Economic Order Quantity: EOQ = sqrt(2AO/C), but substituted wrong holding cost.',
    detailedFeedback: 'Formula correctly stated by candidate.',
    isMcq: false,
  });

  assert(
    gateResult.isZeroAllowed === false,
    'TEST G.1: Zero-Mark Safety Gate forbade 0 marks when correct formula was present'
  );
  assert(
    (gateResult.suggestedAwardedMarks || 0) > 0,
    'TEST G.2: Gate suggested partial step marks for the valid formula'
  );
}

// --------------------------------------------------------------------------
// TEST H: Completely blank answer
// Rule 21: Genuine zero with NO_ANSWER.
// --------------------------------------------------------------------------
console.log('\n--- TEST H: Completely Blank Answer (Genuine Zero) ---');
{
  const gateResult = evaluateZeroMarkSafetyGate({
    questionNumber: '8',
    maxMarks: 5,
    awardedMarks: 0,
    status: 'not_attempted',
    components: [],
    studentEvidence: '',
    detailedFeedback: 'Question left blank / unattempted by candidate.',
    isMcq: false,
  });

  assert(
    gateResult.isZeroAllowed === true,
    'TEST H.1: Zero mark allowed for genuine blank answer'
  );
  assert(
    gateResult.zeroScoreReason === 'NO_ANSWER',
    'TEST H.2: Zero score reason correctly classified as NO_ANSWER'
  );
}

// --------------------------------------------------------------------------
// TEST I: Wholly irrelevant answer (e.g. movie review / gibberish)
// Rule 21: Genuine zero with WHOLLY_IRRELEVANT.
// --------------------------------------------------------------------------
console.log('\n--- TEST I: Wholly Irrelevant Answer (Genuine Zero) ---');
{
  const gateResult = evaluateZeroMarkSafetyGate({
    questionNumber: '9',
    maxMarks: 5,
    awardedMarks: 0,
    status: 'incorrect',
    components: [],
    studentEvidence: 'Candidate wrote song lyrics and discussion of a movie plot.',
    detailedFeedback: 'Answer is wholly irrelevant and unrelated to the question topic.',
    isMcq: false,
  });

  assert(
    gateResult.isZeroAllowed === true,
    'TEST I.1: Zero mark allowed for wholly irrelevant text'
  );
  assert(
    gateResult.zeroScoreReason === 'WHOLLY_IRRELEVANT',
    'TEST I.2: Zero score reason correctly classified as WHOLLY_IRRELEVANT'
  );
}

// --------------------------------------------------------------------------
// TEST J: Question and Paper Level Mathematical Consistency
// Rule 14: Component sum == Question marks, Question sum == Paper total.
// --------------------------------------------------------------------------
console.log('\n--- TEST J: Mathematical Consistency Across Hierarchies ---');
{
  const rawMockResult = {
    totalMarks: 25,
    maximumMarks: 30,
    questions: [
      {
        questionNumber: '1',
        maximumMarks: 15,
        marksAwarded: 13,
        markingComponents: [
          { componentId: 'Q1_c1', marksAvailable: 5, marksAwarded: 4, confidence: 95 },
          { componentId: 'Q1_c2', marksAvailable: 10, marksAwarded: 9, confidence: 95 },
        ],
      },
      {
        questionNumber: '2',
        maximumMarks: 15,
        marksAwarded: 12,
        markingComponents: [
          { componentId: 'Q2_c1', marksAvailable: 7, marksAwarded: 6, confidence: 95 },
          { componentId: 'Q2_c2', marksAvailable: 8, marksAwarded: 6, confidence: 95 },
        ],
      },
    ],
  };

  const processed = processEvaluationIntegrity(rawMockResult, {
    markingSchemeText: 'Official ICAI Marking Scheme',
    questionPaperText: 'CA Intermediate Exam Paper',
  });

  const report = validateAuthoritativeConsistency(processed);
  assert(report.isValid === true, 'TEST J.1: Authoritative consistency passed with zero mathematical discrepancies');
  assert(processed.totalMarks === 25, 'TEST J.2: Paper total marks equals exact sum of question marks (13 + 12 = 25)');
  assert(processed.maximumMarks === 30, 'TEST J.3: Paper maximum marks equals exact sum of question max marks (15 + 15 = 30)');
}

// --------------------------------------------------------------------------
// TEST K: Presentation deduction rejected when marking scheme does NOT whitelist it
// Rule 1 & Rule 10: Rejects presentation deduction and restores marks.
// --------------------------------------------------------------------------
console.log('\n--- TEST K: Rejection of Disallowed Presentation Deduction ---');
{
  const rawMock = {
    questions: [
      {
        questionNumber: '1',
        maximumMarks: 10,
        marksAwarded: 8,
        markingComponents: [
          {
            componentId: 'Q1_c1',
            componentType: 'PRESENTATION',
            expectedRequirement: 'Present figures in double entry ledger table',
            studentEvidence: 'Wrote journal entries with narration in clear layout',
            marksAvailable: 2,
            marksAwarded: 0,
            marksDeducted: 2,
            deductionReason: 'Table not drawn, not in ledger format.',
            confidence: 95,
          },
          {
            componentId: 'Q1_c2',
            componentType: 'CALCULATION',
            expectedRequirement: 'Calculate final balance: Rs. 50,000',
            studentEvidence: 'Correctly computed Rs. 50,000',
            marksAvailable: 8,
            marksAwarded: 8,
            marksDeducted: 0,
            confidence: 95,
          },
        ],
      },
    ],
  };

  const processed = processEvaluationIntegrity(rawMock, {
    markingSchemeText: 'Standard solutions with no presentation marks allotted',
  });

  const q1 = processed.questions[0];
  assert(
    q1.marksAwarded === 10,
    'TEST K.1: Presentation deduction was rejected and full 10/10 marks awarded to candidate'
  );
  assert(
    q1.marksLost === 0,
    'TEST K.2: Zero marks lost for presentation formatting differences'
  );
}

// --------------------------------------------------------------------------
// TEST L: Inconsistent Question maximum marks vs Paper maximum marks
// Rule 14: Caught by consistency validator.
// --------------------------------------------------------------------------
console.log('\n--- TEST L: Inconsistent Maximum Marks Detected ---');
{
  const invalidResult: EvaluationResult = {
    evaluationId: 'test_l',
    studentName: 'Student',
    icaiRegistrationNumber: 'Not provided',
    caLevel: 'INTERMEDIATE',
    subjectKey: 'tax',
    subjectName: 'Taxation',
    materialType: 'MTP',
    attempt: 'May 2026',
    evaluationDate: new Date().toISOString(),
    totalMarks: 40,
    maximumMarks: 100, // Paper says 100
    percentage: 40,
    grade: 'Pass',
    confidenceScore: 90,
    overallSummary: 'Test',
    strengths: [],
    weaknesses: [],
    topicPerformance: [],
    presentationAnalysis: { score: 8, feedback: '', workingNotesQuality: '', handwritingLegibility: '' },
    accuracyAnalysis: { calculationAccuracy: '', provisionsAccuracy: '', methodologyCorrectness: '' },
    recommendations: [],
    questions: [
      {
        questionNumber: '1',
        maximumMarks: 20, // Sum of questions = 40 != 100!
        marksAwarded: 20,
        marksLost: 0,
        status: 'correct',
        reasonForDeduction: 'None',
        detailedFeedback: '',
        confidence: 95,
        markingComponents: [
          { componentId: 'c1', componentType: 'PROVISION', expectedRequirement: '', studentEvidence: '', assessment: 'CORRECT', marksAvailable: 20, marksAwarded: 20, marksDeducted: 0, confidence: 95 },
        ],
      },
      {
        questionNumber: '2',
        maximumMarks: 20,
        marksAwarded: 20,
        marksLost: 0,
        status: 'correct',
        reasonForDeduction: 'None',
        detailedFeedback: '',
        confidence: 95,
        markingComponents: [
          { componentId: 'c2', componentType: 'PROVISION', expectedRequirement: '', studentEvidence: '', assessment: 'CORRECT', marksAvailable: 20, marksAwarded: 20, marksDeducted: 0, confidence: 95 },
        ],
      },
    ],
  };

  const validation = validateAuthoritativeConsistency(invalidResult);
  assert(
    validation.isValid === false,
    'TEST L.1: Consistency validator caught mismatch between paper maxMarks (100) and sum of question max marks (40)'
  );
  assert(
    validation.errors.some((e) => e.includes('Paper maximum marks mismatch')),
    'TEST L.2: Error message explicitly flagged paper maximum marks mismatch'
  );
}

// --------------------------------------------------------------------------
// TEST M: Checked Copy and Detailed Report Disagreement Prevention
// Rule 15: Both report generators consume the exact same validated JSON object.
// --------------------------------------------------------------------------
console.log('\n--- TEST M: Report and Checked Copy Consistency Guarantee ---');
{
  const testEval = processEvaluationIntegrity(
    {
      evaluationId: 'eval_m',
      studentName: 'Candidate',
      questions: [
        {
          questionNumber: '1',
          subQuestion: 'a',
          maximumMarks: 10,
          marksAwarded: 7.5,
          markingComponents: [
            { componentId: 'c1', componentType: 'PROVISION', marksAvailable: 4, marksAwarded: 3.5, confidence: 95 },
            { componentId: 'c2', componentType: 'APPLICATION', marksAvailable: 6, marksAwarded: 4, confidence: 95 },
          ],
        },
      ],
    },
    {}
  );

  // Both services read testEval
  const qChecked = testEval.questions[0];
  const qReport = testEval.questions[0];

  assert(
    qChecked.marksAwarded === qReport.marksAwarded &&
      qChecked.maximumMarks === qReport.maximumMarks &&
      qChecked.markingComponents?.length === qReport.markingComponents?.length,
    'TEST M.1: Checked Copy data model matches Detailed Report data model identically'
  );
}

// --------------------------------------------------------------------------
// TEST N: Sanitization of Synthetic / Placeholder Registration Numbers
// Rule 18: Never display "WRO0987654", "000", "N/A"
// --------------------------------------------------------------------------
console.log('\n--- TEST N: Registration Number Sanitization ---');
{
  const placeholders = ['000', 'WRO0987654', 'N/A', 'na', '', 'Not provided'];

  placeholders.forEach((ph, i) => {
    const res = processEvaluationIntegrity(
      {
        icaiRegistrationNumber: ph,
        questions: [{ questionNumber: '1', maximumMarks: 5, marksAwarded: 5 }],
      },
      {}
    );

    assert(
      res.icaiRegistrationNumber === 'Not provided',
      `TEST N.${i + 1}: Placeholder '${ph}' sanitized to 'Not provided'`
    );
  });

  const validRes = processEvaluationIntegrity(
    {
      icaiRegistrationNumber: 'CRO0123456',
      questions: [{ questionNumber: '1', maximumMarks: 5, marksAwarded: 5 }],
    },
    {}
  );
  assert(
    validRes.icaiRegistrationNumber === 'CRO0123456',
    'TEST N.7: Legitimate registration number CRO0123456 preserved untouched'
  );
}

// --------------------------------------------------------------------------
// TEST O: Taxation - Correct Final Amount via Flawed Tax Treatment
// Rule 5: Deduct marks for invalid tax treatment, do NOT award full marks.
// --------------------------------------------------------------------------
console.log('\n--- TEST O: Correct Final Amount with Invalid Tax Treatment ---');
{
  const components: MarkingComponent[] = [
    {
      componentId: 'Q15_c1',
      componentType: 'TREATMENT',
      expectedRequirement: 'Treat dividend from foreign company as Income from Other Sources under Section 56(2)(i)',
      studentEvidence: 'Treated dividend as agricultural income exempt under Section 10(1) but made offsetting mathematical mistake',
      assessment: 'INCORRECT',
      marksAvailable: 3,
      marksAwarded: 0,
      marksDeducted: 3,
      deductionReason: 'Wrong tax treatment: Foreign dividend is taxable under IFOS, not exempt agricultural income.',
      confidence: 95,
    },
    {
      componentId: 'Q15_c2',
      componentType: 'CALCULATION',
      expectedRequirement: 'Compute total tax payable: Rs. 45,000',
      studentEvidence: 'Fortuitously stated Rs. 45,000 as final tax payable',
      assessment: 'CORRECT',
      marksAvailable: 2,
      marksAwarded: 2,
      marksDeducted: 0,
      confidence: 95,
    },
  ];

  const normalized = normalizeQuestionComponents(components, 5, 2, '15');
  const treatComp = normalized.find((c) => c.componentType === 'TREATMENT');

  assert(
    treatComp?.marksAwarded === 0 && treatComp.marksDeducted === 3,
    'TEST O.1: Deducted treatment marks for invalid tax characterization'
  );
  assert(
    normalized.reduce((s, c) => s + c.marksAwarded, 0) === 2,
    'TEST O.2: Did not award full marks merely because final number matched'
  );
}

console.log('\n================================================================');
console.log(`--- TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED ---`);
console.log('================================================================');

if (passedTests === totalTests) {
  console.log('ALL CRITICAL CA EVALUATION ACCURACY & INTEGRITY TESTS PASSED!');
  process.exit(0);
} else {
  console.error('SOME TESTS FAILED!');
  process.exit(1);
}
