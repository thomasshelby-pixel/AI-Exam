import assert from 'assert';
import { applyMultiModeMarkingPhilosophy } from '../services/multiModeMarkingEngine.js';
import { calculateDynamicAiConfidence } from '../services/dynamicConfidenceEngine.js';
import { QuestionEvaluation, MarkingComponent } from '../../src/types/index.js';

console.log('================================================================');
console.log('--- RUNNING MODERATE MODE EVIDENCE & CONFIDENCE AUDIT TESTS ---');
console.log('================================================================');

// TEST 1: Moderate mode strictly rejects credit when student evidence is absent or 'Not calculated'
console.log('\n--- TEST 1: Rejection of Unearned Benefit of Doubt without Evidence ---');
{
  const testComponents: MarkingComponent[] = [
    {
      componentId: 'c1',
      componentType: 'CALCULATION',
      expectedRequirement: 'Basic Salary computation = 0.5',
      studentEvidence: 'Basic Salary = 9,00,000',
      assessment: 'CORRECT',
      marksAvailable: 0.5,
      marksAwarded: 0.5,
      marksDeducted: 0,
      confidence: 95,
    },
    {
      componentId: 'c2',
      componentType: 'CALCULATION',
      expectedRequirement: 'HRA exemption calculation = 1.0',
      studentEvidence: 'HRA = 1,92,000; Exempt = 1,00,800',
      assessment: 'PARTIALLY_CORRECT',
      marksAvailable: 1.0,
      marksAwarded: 0.0, // Standard deducted full
      marksDeducted: 1.0,
      confidence: 90,
    },
    {
      componentId: 'c3',
      componentType: 'CALCULATION',
      expectedRequirement: 'Section 16 deduction and final taxable salary = 0.75',
      studentEvidence: 'Not calculated', // Literally not calculated!
      assessment: 'INCORRECT',
      marksAvailable: 0.75,
      marksAwarded: 0.0,
      marksDeducted: 0.75,
      confidence: 95,
    },
    {
      componentId: 'c4',
      componentType: 'PROVISION',
      expectedRequirement: 'Statutory section citation = 0.5',
      studentEvidence: '', // Blank
      assessment: 'INCORRECT',
      marksAvailable: 0.5,
      marksAwarded: 0.0,
      marksDeducted: 0.5,
      confidence: 95,
    },
  ];

  const standardQ: QuestionEvaluation = {
    questionNumber: '3',
    subQuestion: 'a',
    maximumMarks: 2.75,
    marksAwarded: 0.5,
    marksLost: 2.25,
    status: 'partially_correct',
    reasonForDeduction: 'HRA mathematical error; Section 16 not calculated; section not cited.',
    detailedFeedback: 'Basic salary was correct. Final taxable salary omitted.',
    markingComponents: testComponents,
  };

  const multiModeResult = applyMultiModeMarkingPhilosophy([standardQ], 'lenient', 100);
  const modQ = multiModeResult.modeBreakdown.moderate.checkingMode === 'lenient'
    ? multiModeResult.activeQuestions[0]
    : null;

  assert(modQ, 'Moderate question evaluation must exist');

  // c1: Correct stays 0.5
  const modC1 = modQ.markingComponents?.find((c) => c.componentId === 'c1');
  assert.strictEqual(modC1?.marksAwarded, 0.5, 'Correct component should retain full marks (0.5)');

  // c2: Partially correct with evidence gets legitimate candidate-friendly partial credit
  const modC2 = modQ.markingComponents?.find((c) => c.componentId === 'c2');
  assert(modC2 && modC2.marksAwarded > 0, 'Partially correct component with evidence should receive supported partial credit');
  assert.strictEqual(modC2.modeDifferenceCategory, 'VALID_PARTIAL_CREDIT', 'Category must be VALID_PARTIAL_CREDIT');

  // c3: Evidence is 'Not calculated' -> MUST REMAIN 0 MARKS in Moderate!
  const modC3 = modQ.markingComponents?.find((c) => c.componentId === 'c3');
  assert.strictEqual(modC3?.marksAwarded, 0, 'Component with "Not calculated" evidence MUST NOT receive Moderate credit');
  console.log('[PASS] TEST 1.1: Uncalculated/blank step correctly denied Moderate credit');

  // c4: Evidence is empty -> MUST REMAIN 0 MARKS
  const modC4 = modQ.markingComponents?.find((c) => c.componentId === 'c4');
  assert.strictEqual(modC4?.marksAwarded, 0, 'Component with empty evidence MUST NOT receive Moderate credit');
  console.log('[PASS] TEST 1.2: Empty evidence correctly denied unearned credit');
}

// TEST 2: Difference Categorization across all component types
console.log('\n--- TEST 2: Difference Categorization & Justification ---');
{
  const components: MarkingComponent[] = [
    {
      componentId: 'c_prov',
      componentType: 'PROVISION',
      expectedRequirement: 'Sec 139(8A) time limit within 24 months = 2.5',
      studentEvidence: 'Updated return can be furnished within 24 months from end of AY',
      assessment: 'PARTIALLY_CORRECT',
      marksAvailable: 2.5,
      marksAwarded: 1.0,
      marksDeducted: 1.5,
      confidence: 90,
    },
    {
      componentId: 'c_app',
      componentType: 'APPLICATION',
      expectedRequirement: 'Application of GST exemption to cloak room = 1.0',
      studentEvidence: 'Cloak room services provided to passengers is exempt under GST',
      assessment: 'PARTIALLY_CORRECT',
      marksAvailable: 1.0,
      marksAwarded: 0.5,
      marksDeducted: 0.5,
      confidence: 90,
    },
  ];

  const stdQ: QuestionEvaluation = {
    questionNumber: '1',
    subQuestion: 'b',
    maximumMarks: 3.5,
    marksAwarded: 1.5,
    marksLost: 2.0,
    status: 'partially_correct',
    reasonForDeduction: 'Minor wording omissions',
    detailedFeedback: 'Candidate captured time limit',
    markingComponents: components,
  };

  const result = applyMultiModeMarkingPhilosophy([stdQ], 'lenient', 100);
  const modQ = result.activeQuestions[0];

  const modProv = modQ.markingComponents?.find((c) => c.componentId === 'c_prov');
  assert.strictEqual(modProv?.modeDifferenceCategory, 'VALID_CONCEPTUAL_CREDIT', 'Provision difference must be VALID_CONCEPTUAL_CREDIT');
  console.log('[PASS] TEST 2.1: Provision difference categorized as VALID_CONCEPTUAL_CREDIT');

  const modApp = modQ.markingComponents?.find((c) => c.componentId === 'c_app');
  assert.strictEqual(modApp?.modeDifferenceCategory, 'REFERENCE_SUPPORTED_APPLICATION', 'Application difference must be REFERENCE_SUPPORTED_APPLICATION');
  console.log('[PASS] TEST 2.2: Application difference categorized as REFERENCE_SUPPORTED_APPLICATION');
}

// TEST 3: Dynamic AI Confidence calculation
console.log('\n--- TEST 3: Dynamic AI Confidence (Non-Hardcoded) ---');
{
  const q1: QuestionEvaluation = {
    questionNumber: '1',
    maximumMarks: 10,
    marksAwarded: 8,
    marksLost: 2,
    status: 'correct',
    reasonForDeduction: '',
    detailedFeedback: 'Well answered',
    markingComponents: [
      {
        componentId: 'c1',
        componentType: 'CALCULATION',
        expectedRequirement: 'Step 1',
        studentEvidence: 'Valid evidence',
        assessment: 'CORRECT',
        marksAvailable: 8,
        marksAwarded: 8,
        marksDeducted: 0,
        confidence: 95,
      },
    ],
  };

  // High quality input
  const highConf = calculateDynamicAiConfidence({
    questions: [q1],
    totalPages: 5,
    coveredPages: [1, 2, 3, 4, 5],
    referenceCompletenessRatio: 1.0,
    hasHandwritingIssues: false,
    hasUnresolvedConflicts: false,
    checkedCopyConsistent: true,
  });

  assert(highConf.compositeScore >= 95.0, 'High quality input should achieve > 95% confidence');
  assert.notStrictEqual(highConf.compositeScore, 94.5, 'Must not be a hardcoded 94.5%');
  console.log(`[PASS] TEST 3.1: Clean submission dynamic confidence: ${highConf.compositeScore}%`);

  // Degraded input with handwriting issues and partial page coverage
  const lowConf = calculateDynamicAiConfidence({
    questions: [
      {
        ...q1,
        status: 'unclear',
        flags: ['HANDWRITING_UNCLEAR'],
      },
    ],
    totalPages: 10,
    coveredPages: [1, 2], // only 20% coverage
    referenceCompletenessRatio: 0.6,
    hasHandwritingIssues: true,
    hasUnresolvedConflicts: true,
    checkedCopyConsistent: false,
  });

  assert(lowConf.compositeScore < 85.0, 'Degraded input should have significantly lower confidence');
  assert(lowConf.notes.length >= 3, 'Notes must explain the confidence deductions');
  console.log(`[PASS] TEST 3.2: Degraded submission dynamic confidence: ${lowConf.compositeScore}% (Notes: ${lowConf.notes.length})`);
}

console.log('================================================================');
console.log('--- ALL MODERATE MODE & CONFIDENCE AUDIT CHECKS PASSED! ---');
console.log('================================================================');
