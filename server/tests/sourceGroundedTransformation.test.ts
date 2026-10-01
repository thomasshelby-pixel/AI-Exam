/**
 * Source-Grounded Transformation & Numerical Reasoning Integrity Test Suite
 *
 * Subject-Agnostic, Multi-Course Generic Regression Tests (A - T):
 * A. Raw amount requiring source transformation (evaluator does not assume raw == final)
 * B. Gross/Net conversion (Stage A source interpretation & Stage B student evaluation)
 * C. Tax-inclusive / Tax-exclusive conversion (reverse calculation)
 * D. Percentage reverse calculation (markup vs margin, profit on sales vs cost)
 * E. Accounting adjustment (accrual, deferral, valuation lower of cost or NRV)
 * F. Depreciation adjustment (WDV, SLM, 180-day half rate, addition)
 * G. Provision / exception application (AS 29 / Ind AS 37, legal exceptions, saving clauses)
 * H. Threshold-based adjustment (statutory monetary limits, ceilings, floors)
 * I. Set-off / carry-forward of losses (statutory ordering rules)
 * J. Valid alternative formula (mathematical equivalence: X/70% == X/0.70 == X*100/70)
 * K. Valid alternative working order (independent intermediate steps)
 * L. Arithmetic slip with correct concept / formula
 * M. Consequential error (own-figure rule: no double penalty for downstream steps)
 * N. Rounding difference tolerance (exam rounding != conceptual error)
 * O. Source conflict detection (material conflicts fail closed to REVIEW_REQUIRED)
 * P. Missing transformation in reference (fails closed to REVIEW_REQUIRED)
 * Q. Stale reference detection (versionId/hash mismatch protection)
 * R. Wrong reference source detection (cross-course mismatch protection)
 * S. Source-defined fact vs student assumption (VALID / INVALID / UNSUPPORTED / AMBIGUOUS)
 * T. Exact report vs checked-copy parity
 *
 * Real Course Regressions:
 * 1. Real Taxation regression as generic transformation instance
 * 2. Real CA Foundation numerical paper
 * 3. Real CA Intermediate non-Tax numerical/theory paper
 * 4. Real CA Final numerical paper
 */

import {
  extractSourceGroundedTransformations,
  evaluateTwoStageInterpretation,
  areFormulasAlgebraicallyEquivalent,
  auditNumericalReasoningIntegrity,
  isWithinExamRoundingTolerance,
  evaluateStudentAssumption,
  detectTransformationSourceConflict,
  computeTransformationHash,
} from '../services/sourceGroundedTransformationService.js';
import { processEvaluationIntegrity } from '../services/evaluationIntegrityEngine.js';
import { buildStructuredAnnotations } from '../services/pdfCheckedCopyService.js';
import {
  SourceGroundedTransformation,
  QuestionEvaluation,
  MarkingComponent,
  EvaluationResult,
} from '../../src/types/index.js';

console.log('================================================================');
console.log('--- SOURCE-GROUNDED TRANSFORMATION & NUMERICAL INTEGRITY SUITE ---');
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
// TEST A: Raw Amount Requiring Source Transformation
// Invariant: Evaluator must NOT assume raw figure stated in Question Paper = final figure
// --------------------------------------------------------------------------
console.log('\n--- TEST A: Raw Amount Requiring Source Transformation ---');
{
  const qpText = 'The assessee received a lottery winning of 35,000 net of tax deduction.';
  const saText = 'Gross lottery winnings = 35,000 / 70% = 50,000. Tax @ 30% u/s 115BB = 15,000.';
  
  const transformations = extractSourceGroundedTransformations(qpText, saText, undefined, 'Q_NUM_1');
  assert(transformations.length > 0, 'TEST A.1: Identified source-grounded transformation from authoritative text');
  assert(transformations[0].transformationType === 'GROSS_UP', `TEST A.2: Classified as GROSS_UP (got ${transformations[0].transformationType})`);

  // Student directly writes raw 35,000 as final gross amount without transformation
  const studentEval = evaluateTwoStageInterpretation({
    transformation: transformations[0],
    studentScriptText: 'Winning from lottery = 35,000 is included in total income directly.',
    studentNumbers: [35000],
    rawInputNumber: 35000,
    expectedNumber: 50000,
    allocatedMarks: 2,
  });

  assert(studentEval.isAccepted === false, 'TEST A.3: Raw input fact not accepted blindly as final answer');
  assert(studentEval.errorType === 'OMITTED_TRANSFORMATION', `TEST A.4: Classified as OMITTED_TRANSFORMATION (got ${studentEval.errorType})`);
  assert(studentEval.suggestedMarksAwarded === 0, 'TEST A.5: Unadjusted raw figure penalized under transformation criteria');
}

// --------------------------------------------------------------------------
// TEST B: Gross/Net Conversion (Two-Stage Interpretation)
// --------------------------------------------------------------------------
console.log('\n--- TEST B: Gross/Net Conversion (Stage A & Stage B) ---');
{
  const transformation: SourceGroundedTransformation = {
    questionId: 'Q_GENERIC_B',
    inputFact: 'Given receipt net of deduction: 70,000',
    inputFactSource: 'QUESTION_PAPER',
    transformationType: 'GROSS_UP',
    sourceRule: 'Grossing up of net receipts: Net Amount / (1 - Tax Rate)',
    sourceFormula: '70,000 / 0.70 = 100,000',
    sourceLocation: 'Suggested Answer line 12',
    referenceHash: computeTransformationHash('Q_GENERIC_B|GROSS_UP'),
  };

  const evalResult = evaluateTwoStageInterpretation({
    transformation,
    studentScriptText: 'Gross Amount = 70,000 / 0.70 = 100,000.',
    studentNumbers: [70000, 100000],
    rawInputNumber: 70000,
    expectedNumber: 100000,
    allocatedMarks: 3,
  });

  assert(evalResult.stageA_SourceInterpretation.includes('Authoritative Source dictates transformation'), 'TEST B.1: Stage A source interpretation generated');
  assert(evalResult.isAccepted === true, 'TEST B.2: Stage B accepted valid grossing up');
  assert(evalResult.suggestedMarksAwarded === 3, 'TEST B.3: Full marks awarded for correct gross-up');
}

// --------------------------------------------------------------------------
// TEST C: Tax-Inclusive / Tax-Exclusive Conversion (GST / Indirect Tax)
// --------------------------------------------------------------------------
console.log('\n--- TEST C: Tax-Inclusive to Tax-Exclusive Reverse Calculation ---');
{
  const qpText = 'Supply of taxable services for 1,18,000 inclusive of GST @ 18%.';
  const saText = 'Taxable value of supply = 1,18,000 / 1.18 = 1,00,000. GST @ 18% = 18,000.';

  const transformations = extractSourceGroundedTransformations(qpText, saText, undefined, 'Q_GENERIC_C');
  assert(transformations.some(t => t.transformationType === 'GST_ADJUSTMENT'), 'TEST C.1: Detected GST_ADJUSTMENT transformation');

  const gstTrans = transformations.find(t => t.transformationType === 'GST_ADJUSTMENT')!;
  
  // Student writes: 1,18,000 * 18 / 118 = 18,000 GST, Taxable value = 1,00,000
  const evalStudent = evaluateTwoStageInterpretation({
    transformation: gstTrans,
    studentScriptText: 'Taxable value = 1,18,000 * 100 / 118 = 1,00,000. GST = 18,000.',
    studentNumbers: [100000, 18000],
    rawInputNumber: 118000,
    expectedNumber: 100000,
    allocatedMarks: 2.5,
  });

  assert(evalStudent.isAccepted === true, 'TEST C.2: Reverse calculation accepted via algebraic equivalence');
  assert(evalStudent.suggestedMarksAwarded === 2.5, 'TEST C.3: Full credit awarded for reverse tax calculation');
}

// --------------------------------------------------------------------------
// TEST D: Percentage Reverse Calculation (Markup vs Margin)
// --------------------------------------------------------------------------
console.log('\n--- TEST D: Percentage Reverse Calculation (Markup vs Margin) ---');
{
  const qpText = 'Goods sent on consignment at cost plus 25% = invoice price 2,50,000.';
  const saText = 'Loading on invoice = 2,50,000 * 25 / 125 = 50,000 (i.e. 20% on sales/invoice). Cost = 2,00,000.';

  const transformations = extractSourceGroundedTransformations(qpText, saText, undefined, 'Q_GENERIC_D');
  assert(transformations.some(t => t.transformationType === 'PERCENTAGE_REVERSE_CALCULATION'), 'TEST D.1: Detected PERCENTAGE_REVERSE_CALCULATION');

  const eq = areFormulasAlgebraicallyEquivalent('2,50,000 * 25 / 125', '2,50,000 * 1/5');
  assert(eq === true, 'TEST D.2: Recognizes 25/125 on cost is equivalent to 1/5 on invoice price');
}

// --------------------------------------------------------------------------
// TEST E: Accounting Adjustment (Accrual / Valuation / NRV)
// --------------------------------------------------------------------------
console.log('\n--- TEST E: Accounting Adjustment (Lower of Cost and NRV) ---');
{
  const qpText = 'Inventory cost is 5,00,000 but estimated net realizable value (NRV) is 4,40,000.';
  const saText = 'As per AS 2, inventory valued at lower of cost and NRV = 4,40,000. Write-down = 60,000.';

  const transformations = extractSourceGroundedTransformations(qpText, saText, undefined, 'Q_GENERIC_E');
  assert(transformations.some(t => t.transformationType === 'ACCOUNTING_ADJUSTMENT'), 'TEST E.1: Detected ACCOUNTING_ADJUSTMENT');
}

// --------------------------------------------------------------------------
// TEST F: Depreciation Adjustment (WDV / SLM / Less than 180 Days)
// --------------------------------------------------------------------------
console.log('\n--- TEST F: Depreciation Adjustment ---');
{
  const qpText = 'Machinery purchased on 15th December for 10,00,000 and put to use for less than 180 days.';
  const saText = 'Depreciation @ 15% restricted to 50% since put to use for less than 180 days: 10,00,000 * 7.5% = 75,000.';

  const transformations = extractSourceGroundedTransformations(qpText, saText, undefined, 'Q_GENERIC_F');
  assert(transformations.some(t => t.transformationType === 'DEPRECIATION'), 'TEST F.1: Detected DEPRECIATION transformation');
}

// --------------------------------------------------------------------------
// TEST G: Provision / Exception Application
// --------------------------------------------------------------------------
console.log('\n--- TEST G: Provision & Exception Application ---');
{
  const qpText = 'A lawsuit was filed against the company. Legal counsel estimates 80% probability of 20,00,000 outflow.';
  const saText = 'As per AS 29 / Ind AS 37, present obligation with probable outflow requires provision for 20,00,000.';

  const transformations = extractSourceGroundedTransformations(qpText, saText, undefined, 'Q_GENERIC_G');
  assert(transformations.some(t => t.transformationType === 'PROVISION'), 'TEST G.1: Detected PROVISION requirement');
}

// --------------------------------------------------------------------------
// TEST H: Threshold-Based Adjustment
// --------------------------------------------------------------------------
console.log('\n--- TEST H: Threshold-Based Adjustment ---');
{
  const qpText = 'Employee contributed 2,20,000 to Recognized Provident Fund.';
  const saText = 'Deduction under Section 80C is subject to a maximum of 1,50,000. Eligible deduction = 1,50,000.';

  const transformations = extractSourceGroundedTransformations(qpText, saText, undefined, 'Q_GENERIC_H');
  assert(transformations.some(t => t.transformationType === 'THRESHOLD_APPLICATION' || t.transformationType === 'ALLOWABLE_DEDUCTION'), 'TEST H.1: Detected THRESHOLD_APPLICATION or ALLOWABLE_DEDUCTION');
}

// --------------------------------------------------------------------------
// TEST I: Set-Off & Carry Forward of Losses
// --------------------------------------------------------------------------
console.log('\n--- TEST I: Set-Off & Carry Forward of Losses ---');
{
  const qpText = 'Speculative business loss of 80,000 and regular business profit of 1,50,000.';
  const saText = 'Speculative business loss can only be set-off against speculative profit. Cannot be set-off against regular business profit; carried forward for 4 years.';

  const transformations = extractSourceGroundedTransformations(qpText, saText, undefined, 'Q_GENERIC_I');
  assert(transformations.some(t => t.transformationType === 'SET_OFF' || t.transformationType === 'CARRY_FORWARD'), 'TEST I.1: Detected SET_OFF or CARRY_FORWARD transformation');
}

// --------------------------------------------------------------------------
// TEST J: Valid Alternative Formula (Algebraic Equivalence)
// --------------------------------------------------------------------------
console.log('\n--- TEST J: Valid Alternative Formula Equivalence ---');
{
  // 1. Division by percentage vs multiplication by reciprocal
  assert(areFormulasAlgebraicallyEquivalent('X / 70%', 'X / 0.70'), 'TEST J.1: X / 70% == X / 0.70');
  assert(areFormulasAlgebraicallyEquivalent('X / 0.70', 'X * 100 / 70'), 'TEST J.2: X / 0.70 == X * 100 / 70');
  assert(areFormulasAlgebraicallyEquivalent('35000 / 70%', '35000 * 100 / 70'), 'TEST J.3: 35000 / 70% == 35000 * 100 / 70');
  assert(areFormulasAlgebraicallyEquivalent('amount / 1.18', 'amount * 100 / 118'), 'TEST J.4: amount / 1.18 == amount * 100 / 118');
  assert(areFormulasAlgebraicallyEquivalent('(A * 100) / 90', 'A / 0.90'), 'TEST J.5: (A * 100) / 90 == A / 0.90');
}

// --------------------------------------------------------------------------
// TEST K: Valid Alternative Working Order
// --------------------------------------------------------------------------
console.log('\n--- TEST K: Valid Alternative Working Order ---');
{
  const trans: SourceGroundedTransformation = {
    questionId: 'Q_ORDER_K',
    inputFact: 'Income from 2 units',
    inputFactSource: 'QUESTION_PAPER',
    transformationType: 'TAX_ADJUSTMENT',
    sourceRule: 'Standard deduction before threshold',
    sourceLocation: 'SA page 2',
    referenceHash: computeTransformationHash('Q_ORDER_K'),
  };

  // Student computes Unit B first, then Unit A, but both calculations are conceptually valid
  const result = evaluateTwoStageInterpretation({
    transformation: trans,
    studentScriptText: 'Alternative method: Evaluated Unit B first yielding 40,000, then added Unit A yielding 60,000. Total = 1,00,000.',
    studentNumbers: [40000, 60000, 100000],
    allocatedMarks: 4,
  });

  assert(result.isAccepted === true, 'TEST K.1: Alternative calculation order accepted without penalty');
  assert(result.suggestedMarksAwarded >= 2.5, 'TEST K.2: Valid alternative order rewarded credit');
}

// --------------------------------------------------------------------------
// TEST L: Arithmetic Slip with Correct Formula
// --------------------------------------------------------------------------
console.log('\n--- TEST L: Arithmetic Slip Categorization ---');
{
  const trans: SourceGroundedTransformation = {
    questionId: 'Q_SLIP_L',
    inputFact: 'Given 70,000 net receipt',
    inputFactSource: 'QUESTION_PAPER',
    transformationType: 'GROSS_UP',
    sourceRule: 'Grossing up formula net receipt divided by 70%',
    sourceFormula: '70,000 / 0.70 = 100,000',
    sourceLocation: 'SA',
    referenceHash: computeTransformationHash('Q_SLIP_L'),
  };

  // Student wrote the correct grossing up formula, but made an arithmetic slip (e.g. 70,000 / 0.70 = 90,000)
  const result = evaluateTwoStageInterpretation({
    transformation: trans,
    studentScriptText: 'Grossing up formula applied: 70,000 / 0.70 = 90,000.',
    studentNumbers: [70000, 90000],
    rawInputNumber: 70000,
    expectedNumber: 100000,
    allocatedMarks: 2,
  });

  assert(result.errorType === 'ARITHMETIC_SLIP', `TEST L.1: Error classified as ARITHMETIC_SLIP (got ${result.errorType})`);
  assert(result.isConsequentialCreditAwarded === true, 'TEST L.2: Consequential continuation credit flagged as preserved');
  assert(result.suggestedMarksAwarded === 1, `TEST L.3: Partial marks awarded for correct formula / concept (got ${result.suggestedMarksAwarded})`);
}

// --------------------------------------------------------------------------
// TEST M: Consequential Error (Own-Figure Rule & No Double Deduction)
// --------------------------------------------------------------------------
console.log('\n--- TEST M: Consequential Error & Own-Figure Rule ---');
{
  const sampleQuestion: QuestionEvaluation = {
    questionNumber: '4',
    subQuestion: 'a',
    maximumMarks: 6,
    marksAwarded: 2,
    marksLost: 4,
    status: 'partially_correct',
    reasonForDeduction: 'Arithmetic error in intermediate profit calculation',
    detailedFeedback: 'Intermediate error carried forward through downstream calculations',
    markingComponents: [
      {
        componentId: 'Q4a_c1',
        componentType: 'CALCULATION',
        expectedRequirement: 'Calculate intermediate adjusted profit = 50,000',
        studentEvidence: 'Calculated 45,000 due to addition slip',
        assessment: 'INCORRECT',
        marksAvailable: 2,
        marksAwarded: 0,
        marksDeducted: 2,
        deductionReason: 'Arithmetic error in intermediate profit sum',
        confidence: 95,
      },
      {
        componentId: 'Q4a_c2',
        componentType: 'CALCULATION',
        expectedRequirement: 'Tax @ 30% on intermediate profit (50,000 * 30% = 15,000)',
        studentEvidence: 'Tax calculated on 45,000: 45,000 * 30% = 13,500',
        assessment: 'INCORRECT',
        marksAvailable: 2,
        marksAwarded: 0,
        marksDeducted: 2,
        deductionReason: 'Wrong tax due to previous error in intermediate profit',
        confidence: 95,
      },
      {
        componentId: 'Q4a_c3',
        componentType: 'CONCLUSION',
        expectedRequirement: 'Final net payable',
        studentEvidence: 'Derived correctly from 13,500',
        assessment: 'CORRECT',
        marksAvailable: 2,
        marksAwarded: 2,
        marksDeducted: 0,
        confidence: 95,
      },
    ],
  };

  const auditResult = auditNumericalReasoningIntegrity([sampleQuestion]);
  assert(auditResult.doublePenaltiesPrevented === 1, `TEST M.1: Prevented 1 double penalty on downstream calculation (got ${auditResult.doublePenaltiesPrevented})`);
  assert(auditResult.consequentialMarksPreserved === 2, `TEST M.2: Restored 2 marks under own-figure rule (got ${auditResult.consequentialMarksPreserved})`);
  assert(auditResult.auditedQuestions[0].marksAwarded === 4, `TEST M.3: Question total upgraded to 4/6 (got ${auditResult.auditedQuestions[0].marksAwarded})`);
}

// --------------------------------------------------------------------------
// TEST N: Rounding Difference Tolerance
// --------------------------------------------------------------------------
console.log('\n--- TEST N: Rounding Difference Tolerance ---');
{
  // Difference <= 1.0 (e.g. ₹50,000.40 vs ₹50,000)
  assert(isWithinExamRoundingTolerance(50000.4, 50000), 'TEST N.1: Decimal paise rounding accepted');
  assert(isWithinExamRoundingTolerance('1,23,456.25', '1,23,456'), 'TEST N.2: String formatted currency rounding accepted');
  assert(isWithinExamRoundingTolerance(0.8929, 0.893), 'TEST N.3: 4-decimal present value factor rounding accepted');
  assert(isWithinExamRoundingTolerance(50000, 48000) === false, 'TEST N.4: Substantive numerical variance rejected');
}

// --------------------------------------------------------------------------
// TEST O: Source Conflict Detection (Fail-Closed)
// --------------------------------------------------------------------------
console.log('\n--- TEST O: Source Conflict Detection ---');
{
  const conflict = detectTransformationSourceConflict(
    'CA Foundation Accounting Examination - May 2026',
    'CA Final Advanced Financial Management - Suggested Answers',
    undefined
  );

  assert(conflict.hasConflict === true, 'TEST O.1: Detected material conflict between QP and SA');
  assert(conflict.status === 'SOURCE_CONFLICT', 'TEST O.2: Status flagged as SOURCE_CONFLICT');
  assert(conflict.reason !== undefined, 'TEST O.3: Conflict explanation provided');
}

// --------------------------------------------------------------------------
// TEST P: Missing Transformation in Reference
// --------------------------------------------------------------------------
console.log('\n--- TEST P: Missing Transformation Detection ---');
{
  const emptyTransformations = extractSourceGroundedTransformations(
    'Simple theoretical question with no figures.',
    'Simple theoretical answer with no calculation or adjustment.'
  );

  assert(emptyTransformations.length === 0, 'TEST P.1: Zero spurious transformations fabricated for pure theory');
}

// --------------------------------------------------------------------------
// TEST Q: Stale Reference & Content Hash Lock
// --------------------------------------------------------------------------
console.log('\n--- TEST Q: Stale Reference & Hash Verification ---');
{
  const hash1 = computeTransformationHash('Q1|GROSS_UP|RuleA|Formula1');
  const hash2 = computeTransformationHash('Q1|GROSS_UP|RuleA|Formula1');
  const hash3 = computeTransformationHash('Q1|GROSS_UP|RuleB|Formula1');

  assert(hash1 === hash2, 'TEST Q.1: Deterministic hash for identical reference bundle');
  assert(hash1 !== hash3, 'TEST Q.2: Altered or stale rule produces distinct hash');
}

// --------------------------------------------------------------------------
// TEST R: Wrong Reference Source Guard
// --------------------------------------------------------------------------
console.log('\n--- TEST R: Wrong Reference Source Guard ---');
{
  const conflict = detectTransformationSourceConflict(
    'Assessment Year 2025-26 computation',
    'Assessment Year 2026-27 computation'
  );

  assert(conflict.hasConflict === true, 'TEST R.1: Assessment Year mismatch flagged as source conflict');
  assert(conflict.status === 'SOURCE_CONFLICT', 'TEST R.2: Fails closed to REVIEW_REQUIRED');
}

// --------------------------------------------------------------------------
// TEST S: Source-Defined Fact vs Student Assumption
// --------------------------------------------------------------------------
console.log('\n--- TEST S: Source-Defined Fact vs Student Assumption ---');
{
  const qp = 'The individual has not opted for Section 115BAC.';
  
  // Student writes: "Assumed 115BAC applies" -> Invalid (contradicts explicit source fact)
  const assump1 = evaluateStudentAssumption('Assumed 115BAC applies to the assessee', { qpText: qp });
  assert(assump1.status === 'INVALID', `TEST S.1: Contradictory assumption marked INVALID (got ${assump1.status})`);

  // Student assumes standard exam practice where facts are silent:
  const assump2 = evaluateStudentAssumption('Assumed FIFO method for stock valuation', { qpText: 'Question is silent on inventory method.' });
  assert(assump2.status === 'VALID', `TEST S.2: Permissible standard assumption marked VALID (got ${assump2.status})`);
}

// --------------------------------------------------------------------------
// TEST T: Exact Report vs Checked-Copy Parity
// --------------------------------------------------------------------------
console.log('\n--- TEST T: Exact Report vs Checked-Copy Parity ---');
{
  const sampleEvaluation: EvaluationResult = {
    evaluationId: 'eval_transform_test',
    studentName: 'Candidate X',
    icaiRegistrationNumber: 'NRO1234567',
    caLevel: 'INTERMEDIATE',
    subjectKey: 'TAXATION',
    subjectName: 'Taxation',
    materialType: 'MTP',
    evaluationDate: new Date().toISOString(),
    totalMarks: 7,
    maximumMarks: 10,
    officialPaperMaxMarks: 10,
    percentage: 70,
    grade: 'Distinction',
    confidenceScore: 95,
    overallSummary: 'Evaluation summary',
    strengths: ['Accurate gross-up calculation'],
    weaknesses: ['None'],
    topicPerformance: [],
    presentationAnalysis: {
      score: 8,
      feedback: 'Professional exam presentation',
      workingNotesQuality: 'Clear calculation steps',
      handwritingLegibility: 'Legible scanned manuscript',
    },
    accuracyAnalysis: {
      calculationAccuracy: 'High accuracy',
      provisionsAccuracy: 'Provisions verified',
      methodologyCorrectness: 'ICAI compliant methodology',
    },
    recommendations: ['Maintain structured working notes'],
    questions: [
      {
        questionNumber: '1',
        subQuestion: 'a',
        maximumMarks: 5,
        marksAwarded: 5,
        marksLost: 0,
        status: 'correct',
        reasonForDeduction: 'None',
        detailedFeedback: 'Correct grossing up calculation',
        markingComponents: [
          {
            componentId: 'Q1a_c1',
            componentType: 'CALCULATION',
            expectedRequirement: 'Grossing up 35,000 / 0.70 = 50,000',
            studentEvidence: '35,000 / 70% = 50,000',
            assessment: 'CORRECT',
            marksAvailable: 5,
            marksAwarded: 5,
            marksDeducted: 0,
            confidence: 95,
          },
        ],
      },
      {
        questionNumber: '1',
        subQuestion: 'b',
        maximumMarks: 5,
        marksAwarded: 2,
        marksLost: 3,
        status: 'partially_correct',
        reasonForDeduction: 'Reverse GST calculation omitted',
        detailedFeedback: 'Failed to transform tax-inclusive value',
        markingComponents: [
          {
            componentId: 'Q1b_c1',
            componentType: 'CALCULATION',
            expectedRequirement: 'Taxable value 1,18,000 / 1.18 = 1,00,000',
            studentEvidence: 'Used 1,18,000 directly',
            assessment: 'INCORRECT',
            marksAvailable: 3,
            marksAwarded: 0,
            marksDeducted: 3,
            deductionReason: 'Omitted reverse GST calculation',
            confidence: 95,
          },
          {
            componentId: 'Q1b_c2',
            componentType: 'PROVISION',
            expectedRequirement: 'State GST section',
            studentEvidence: 'Stated applicable section correctly',
            assessment: 'CORRECT',
            marksAvailable: 2,
            marksAwarded: 2,
            marksDeducted: 0,
            confidence: 95,
          },
        ],
      },
    ],
  };

  const processed = processEvaluationIntegrity(sampleEvaluation, {
    officialPaperMaxMarks: 10,
    caLevel: 'INTERMEDIATE',
  });

  const evalData = { id: processed.evaluationId, level: 'INTERMEDIATE', subjectName: 'Taxation' };
  const structuredData = buildStructuredAnnotations(evalData as any, processed, 5);
  const annotations = structuredData.pages.flatMap((p) => p.annotations);

  assert(processed.totalMarks === 7, `TEST T.1: Report total marks is strictly 7 (got ${processed.totalMarks})`);
  assert(annotations.length === 2, `TEST T.2: Checked copy generated annotations for both questions (got ${annotations.length})`);
  assert(annotations[0].marksAwarded === 5, `TEST T.3: Checked copy Q1(a) awarded marks strictly equals 5`);
  assert(annotations[1].marksAwarded === 2, `TEST T.4: Checked copy Q1(b) awarded marks strictly equals 2`);
}

// --------------------------------------------------------------------------
// SECTION 21: REAL REGRESSION TESTS ACROSS FOUNDATION, INTER & FINAL
// --------------------------------------------------------------------------
console.log('\n--- SECTION 21: REAL MULTI-COURSE REGRESSION TESTS ---');
{
  // Real Regression 1: Taxation instance of generic transformation problem
  const taxQp = 'Received lottery winning of 35,000 net of TDS.';
  const taxSa = 'Lottery winning gross = 35,000 / 70% = 50,000. TDS = 15,000.';
  const taxTrans = extractSourceGroundedTransformations(taxQp, taxSa);
  assert(taxTrans.length > 0 && taxTrans[0].transformationType === 'GROSS_UP', 'TEST REAL.1: Generic engine detected transformation on real Taxation pattern');

  // Real Regression 2: Foundation Numerical Paper (Accounting / Quant)
  const fndQp = 'Goods costing 80,000 were sold at a profit of 25% on cost. Mark-up applied.';
  const fndSa = 'Profit = 80,000 * 25% = 20,000. Sale value = 1,00,000 (Margin = 20% on sales).';
  const fndTrans = extractSourceGroundedTransformations(fndQp, fndSa);
  assert(fndTrans.some(t => t.transformationType === 'PERCENTAGE_REVERSE_CALCULATION'), 'TEST REAL.2: Generic engine detected transformation on Foundation Accounting/Quant');

  // Real Regression 3: Intermediate Non-Tax Paper (Costing / FM)
  const interQp = 'Working capital requirement calculation. Debtors holding period 2 months. Annual sales 24,00,000.';
  const interSa = 'Debtors in working capital = 24,00,000 * 2 / 12 = 4,00,000.';
  const interTrans = extractSourceGroundedTransformations(interQp, interSa);
  assert(interTrans.some(t => t.transformationType === 'WORKING_CAPITAL_ADJUSTMENT' || t.transformationType === 'OTHER_SOURCE_DEFINED_TRANSFORMATION'), 'TEST REAL.3: Generic engine detected transformation on Intermediate Costing/FM');

  // Real Regression 4: Final Numerical Paper (AFM / FR)
  const finalQp = 'Present value discounting of cash inflows. Cash flow 5,00,000 at end of year 3. Discounting rate 10%.';
  const finalSa = 'Present value = 5,00,000 / (1 + 0.10)^3 = 5,00,000 * 0.7513 = 3,75,650.';
  const finalTrans = extractSourceGroundedTransformations(finalQp, finalSa);
  assert(finalTrans.some(t => t.transformationType === 'DISCOUNTING'), 'TEST REAL.4: Generic engine detected transformation on Final AFM/FR');
}

console.log('================================================================');
console.log(`--- TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED ---`);
console.log('================================================================');

if (passedTests === totalTests) {
  console.log('ALL SOURCE-GROUNDED TRANSFORMATION & NUMERICAL INTEGRITY TESTS PASSED!');
} else {
  console.error('SOME TESTS FAILED!');
  process.exitCode = 1;
}
