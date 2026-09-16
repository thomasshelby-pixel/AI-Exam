import { normalizeAndSplitCombinedPyq } from '../services/materialHardGateService.js';

console.log('--- RUNNING PYQ COMBINED NORMALIZATION TESTS ---');

let totalTests = 0;
let passedTests = 0;

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

// Test 1: Divider detection (Section divider between Question Paper and Suggested Answers)
{
  const combinedText = `
CA INTERMEDIATE EXAMINATION - MAY 2025
PAPER 1: ADVANCED ACCOUNTING
QUESTION PAPER

Question 1(a) (5 Marks)
A Ltd. acquired 80% equity shares in B Ltd. on 1st April 2024.
Calculate goodwill on consolidation.

Question 1(b) (5 Marks)
Explain the accounting treatment of pre-acquisition profits under AS 21.

============================================================
SUGGESTED ANSWERS AND SOLUTIONS
============================================================

Answer to Question 1(a)
Calculation of Goodwill:
Cost of acquisition: Rs. 10,00,000
Less: Net identifiable assets acquired: Rs. 8,00,000
Goodwill = Rs. 2,00,000.

Answer to Question 1(b)
Pre-acquisition profits are capital in nature and must not be credited to P&L.
`;

  const result = normalizeAndSplitCombinedPyq(combinedText);

  assert(result.questionPaperText.includes('Question 1(a) (5 Marks)'), 'Divider Test: QP text contains Question 1(a)');
  assert(result.questionPaperText.includes('Calculate goodwill on consolidation'), 'Divider Test: QP text contains question prompt');
  assert(!result.questionPaperText.includes('Cost of acquisition: Rs. 10,00,000'), 'Divider Test: QP text does NOT contain answer computation');
  assert(result.suggestedAnswersText.includes('Calculation of Goodwill:'), 'Divider Test: SA text contains solution');
  assert(result.suggestedAnswersText.includes('Goodwill = Rs. 2,00,000'), 'Divider Test: SA text contains answer calculation');
}

// Test 2: Interleaved Questions and Answers
{
  const combinedInterleaved = `
Question 1 (10 Marks)
Explain AS 9 Revenue Recognition principles for service contracts.

Answer to Question 1:
As per AS 9, revenue from service transactions is usually recognized as the service is performed.

Question 2 (10 Marks)
Define impairment loss as per AS 28.

Answer to Question 2:
Impairment loss is the amount by which the carrying amount of an asset exceeds its recoverable amount.
`;

  const result = normalizeAndSplitCombinedPyq(combinedInterleaved);

  assert(result.questionPaperText.includes('Explain AS 9 Revenue Recognition'), 'Interleaved Test: QP has Q1 prompt');
  assert(result.questionPaperText.includes('Define impairment loss as per AS 28'), 'Interleaved Test: QP has Q2 prompt');
  assert(result.suggestedAnswersText.includes('As per AS 9, revenue from service'), 'Interleaved Test: SA has Q1 solution');
  assert(result.suggestedAnswersText.includes('Impairment loss is the amount by which'), 'Interleaved Test: SA has Q2 solution');
}

// Test 3: Fallback safety when no obvious marker exists
{
  const rawText = `Some generic accounting text without clear headers.`;
  const result = normalizeAndSplitCombinedPyq(rawText);

  assert(result.questionPaperText.length > 0, 'Fallback: QP text is non-empty');
  assert(result.suggestedAnswersText.length > 0, 'Fallback: SA text is non-empty');
}

console.log(`\nTests completed: ${passedTests} / ${totalTests} passed.`);
