import assert from 'node:assert';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  parseMaterialTextDeterministic,
  extractTextFromPdfBufferDeterministic,
  getCurriculumChapters,
} from '../services/mcqDeterministicParser.js';
import { extractTextSafely } from '../services/mcqMaterialService.js';

console.log('========================================================================');
console.log('--- TEST SUITE: MCQ ARENA DETERMINISTIC EXTRACTION AUDIT (ZERO AI) ---');
console.log('========================================================================');

async function runExtractionAuditTests() {
  let total = 0;
  let passed = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`[PASS] Test ${total}: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] Test ${total}: ${name}`);
      console.error(err);
      process.exit(1);
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: PDF DIAGNOSIS & LOCAL DETERMINISTIC EXTRACTION
  // --------------------------------------------------------------------------
  console.log('\n>>> SECTION 1: PDF DIAGNOSIS & TEXT EXTRACTION');

  let textPdfBuffer: Buffer;
  let scannedPdfBuffer: Buffer;

  // Build a 2-page text-based PDF using pdf-lib
  const textPdf = await PDFDocument.create();
  const helvetica = await textPdf.embedFont(StandardFonts.Helvetica);

  const p1 = textPdf.addPage([600, 400]);
  p1.drawText(
    'CHAPTER: Theory of Demand and Supply\n\n' +
      'Q1. Other things remaining equal, the law of demand states:\n' +
      '(A) Price and demand are positively related\n' +
      '(B) Price and demand are inversely related\n' +
      '(C) Demand remains constant always\n' +
      '(D) Supply equals demand always\n' +
      'Ans: B\n' +
      'Explanation: Ceteris paribus, price and quantity demanded have an inverse relationship.\n\n' +
      'Q2. Cross elasticity of demand for complementary goods is:\n' +
      '(a) Positive\n' +
      '(b) Negative',
    { x: 40, y: 350, font: helvetica, size: 9 }
  );

  const p2 = textPdf.addPage([600, 400]);
  p2.drawText(
    '(c) Zero\n' +
      '(d) Infinite\n' +
      'Answer: (b)\n' +
      'Explanation: Complements are used together, so price increase of one lowers demand of another.\n\n' +
      'CHAPTER: Theory of Production and Cost\n\n' +
      'Q3. In the short run, all inputs are:\n' +
      'A. Fixed\n' +
      'B. Variable\n' +
      'C. At least one input is fixed\n' +
      'D. None of the above\n' +
      'Correct Answer: C',
    { x: 40, y: 350, font: helvetica, size: 9 }
  );

  textPdfBuffer = Buffer.from(await textPdf.save());

  // Build an empty/image-like PDF with 0 extractable text
  const emptyPdf = await PDFDocument.create();
  emptyPdf.addPage([600, 400]); // Blank page
  scannedPdfBuffer = Buffer.from(await emptyPdf.save());

  await test('PDF extraction calculates complete diagnosis metrics (Chars, Lines, Markers, Status)', async () => {
    const diagResult = await extractTextFromPdfBufferDeterministic(textPdfBuffer, 'sample_economics.pdf');

    assert.strictEqual(diagResult.pageCount, 2, 'Must detect 2 total pages');
    assert.strictEqual(diagResult.diagnosis.pageCount, 2);
    assert.strictEqual(diagResult.diagnosis.pagesWithText, 2, 'Both pages must have text');
    assert.ok(diagResult.diagnosis.totalExtractedChars > 200, 'Must extract substantive character count');
    assert.ok(diagResult.diagnosis.totalExtractedLines >= 10, 'Must count lines accurately');
    assert.strictEqual(diagResult.diagnosis.zeroTextPages.length, 0, 'No zero-text pages');
    assert.strictEqual(diagResult.diagnosis.isImageBasedOrScanned, false, 'Must not be flagged as scanned');
    assert.strictEqual(diagResult.diagnosis.status, 'SUCCESS');
    assert.ok(diagResult.diagnosis.candidateMarkersFound >= 3, 'Must detect question markers');
  });

  await test('Scanned / image-only PDF is identified without AI with exact required advisory message', async () => {
    const scannedResult = await extractTextFromPdfBufferDeterministic(scannedPdfBuffer, 'scanned_paper.pdf');

    assert.strictEqual(scannedResult.pageCount, 1);
    assert.strictEqual(scannedResult.diagnosis.isImageBasedOrScanned, true, 'Must identify image-based PDF');
    assert.strictEqual(scannedResult.diagnosis.status, 'IMAGE_BASED');
    assert.strictEqual(
      scannedResult.diagnosis.diagnosisMessage,
      'This PDF appears to be image-based or contains no extractable text. Automatic rule-based MCQ extraction is not available for this document.'
    );
  });

  // --------------------------------------------------------------------------
  // TEST 2: CROSS-PAGE QUESTION RESOLUTION (PAGE 10 -> PAGE 11)
  // --------------------------------------------------------------------------
  console.log('\n>>> SECTION 2: CROSS-PAGE QUESTIONS & BOUNDARY PRESERVATION');

  await test('Question spanning multiple pages (Q2 across Page 1 & Page 2) becomes ONE unified question', async () => {
    const safeExtract = await extractTextSafely(textPdfBuffer, 'PDF', 'sample_economics.pdf');
    assert.ok(safeExtract.extractedText.includes('--- Page 1 ---'));
    assert.ok(safeExtract.extractedText.includes('--- Page 2 ---'));

    const parsed = parseMaterialTextDeterministic({
      rawText: safeExtract.extractedText,
      course: 'CA_FOUNDATION',
      subject: 'Business Economics',
      sourceCategory: 'MTP',
      materialName: 'Test Cross-Page Economics',
    });

    assert.strictEqual(parsed.totalDetected, 3, 'Must detect 3 complete questions');

    // Inspect Question 2 which was split across Page 1 and Page 2
    const q2 = parsed.questions[1];
    assert.ok(q2.questionText.includes('Cross elasticity of demand for complementary goods is:'));
    assert.strictEqual(q2.optionA, 'Positive');
    assert.strictEqual(q2.optionB, 'Negative');
    assert.strictEqual(q2.optionC, 'Zero');
    assert.strictEqual(q2.optionD, 'Infinite');
    assert.strictEqual(q2.correctAnswer, 'B');
    assert.strictEqual(q2.sourcePage, 1, 'Source page must be page where question originated (Page 1)');
    assert.strictEqual(q2.chapter, 'Theory of Demand and Supply', 'Inherited from Chapter 1');
  });

  // --------------------------------------------------------------------------
  // TEST 3: CHAPTER INHERITANCE & THE 99 vs 93 PROBLEM
  // --------------------------------------------------------------------------
  console.log('\n>>> SECTION 3: CHAPTER INHERITANCE & ZERO QUESTION LOSS');

  await test('Chapter heading inheritance carries through until new valid chapter heading', () => {
    const chapterStreamText = `
CHAPTER: Theory of Demand and Supply

Q1. Law of demand states inverse price-quantity relationship.
(A) True (B) False (C) Partially true (D) None
Ans: A

Q2. What is Giffen good?
(A) Inferior good with strong income effect
(B) Superior luxury good
(C) Veblen status good
(D) Public good
Ans: A

CHAPTER: Theory of Production and Cost

Q3. Isoquants are convex to the origin due to diminishing MRTS.
(A) Agree (B) Disagree (C) Ambiguous (D) None
Ans: A
`;

    const result = parseMaterialTextDeterministic({
      rawText: chapterStreamText,
      course: 'CA_FOUNDATION',
      subject: 'Business Economics',
      sourceCategory: 'MTP',
      materialName: 'Chapter Test',
    });

    assert.strictEqual(result.totalDetected, 3);
    assert.strictEqual(result.questions[0].chapter, 'Theory of Demand and Supply');
    assert.strictEqual(result.questions[1].chapter, 'Theory of Demand and Supply');
    assert.strictEqual(result.questions[2].chapter, 'Theory of Production and Cost');
  });

  await test('No Question Loss: 99 detected, 93 chapter assigned, 6 unmapped -> 6 marked Needs Review', () => {
    // Construct a document with:
    // 6 unmapped questions at start (no chapter heading yet, general text)
    // 8 questions in Theory of Demand and Supply
    // 1 question in Theory of Production and Cost
    // 16 questions in Price Determination in Different Markets
    // 68 questions in Introduction to Business Economics
    // Total = 99 questions!
    const parts: string[] = [];

    // 6 unmapped questions (before any chapter heading)
    for (let i = 1; i <= 6; i++) {
      parts.push(
        `Q${i}. Unmapped General Foundation economics diagnostic check ${i}:\n` +
          `A. Option Alpha ${i}\n` +
          `B. Option Beta ${i}\n` +
          `C. Option Gamma ${i}\n` +
          `D. Option Delta ${i}\n` +
          `Answer: A\n`
      );
    }

    // 8 questions in Demand and Supply
    parts.push('CHAPTER: Theory of Demand and Supply\n');
    for (let i = 7; i <= 14; i++) {
      parts.push(
        `Q${i}. Demand elasticity analysis item ${i}:\n` +
          `A. Highly elastic\n` +
          `B. Inelastic\n` +
          `C. Unitary\n` +
          `D. Perfectly inelastic\n` +
          `Ans: B\n`
      );
    }

    // 1 question in Production and Cost
    parts.push('CHAPTER: Theory of Production and Cost\n');
    parts.push(
      `Q15. Marginal cost curve intersects average cost at minimum point:\n` +
        `A. Yes\n` +
        `B. No\n` +
        `C. Never\n` +
        `D. Only in monopoly\n` +
        `Answer: A\n`
    );

    // 16 questions in Price Determination
    parts.push('CHAPTER: Price Determination in Different Markets\n');
    for (let i = 16; i <= 31; i++) {
      parts.push(
        `Q${i}. Perfect competition firm is a price taker item ${i}:\n` +
          `A. True\n` +
          `B. False\n` +
          `C. Price maker\n` +
          `D. Regulated\n` +
          `Ans: A\n`
      );
    }

    // 68 questions in Introduction to Business Economics
    parts.push('CHAPTER: Introduction to Business Economics\n');
    for (let i = 32; i <= 99; i++) {
      parts.push(
        `Q${i}. Nature and scope of business economics item ${i}:\n` +
          `A. Microeconomic and normative\n` +
          `B. Macroeconomic only\n` +
          `C. Pure science\n` +
          `D. Abstract\n` +
          `Ans: A\n`
      );
    }

    const full99Text = parts.join('\n\n');

    const result = parseMaterialTextDeterministic({
      rawText: full99Text,
      course: 'CA_FOUNDATION',
      subject: 'Business Economics',
      sourceCategory: 'MTP',
      materialName: 'Complete 99 Question MTP',
    });

    // Exact user requirement verification:
    // 99 total detected
    // 93 chapter-mapped
    // 6 questions accounted for under "Needs Review"
    assert.strictEqual(result.totalDetected, 99, 'Total detected must be exactly 99');
    assert.strictEqual(result.chapterAssignedCount, 93, 'Chapter assigned must be exactly 93');
    assert.strictEqual(result.needsChapterReviewCount, 6, 'Needs Chapter Review must be exactly 6');

    // Verify individual chapter distribution
    assert.strictEqual(result.chapterDistribution['Theory of Demand and Supply'], 8);
    assert.strictEqual(result.chapterDistribution['Theory of Production and Cost'], 1);
    assert.strictEqual(result.chapterDistribution['Price Determination in Different Markets'], 16);
    assert.strictEqual(result.chapterDistribution['Introduction to Business Economics'], 68);
    assert.strictEqual(result.chapterDistribution['Needs Review'], 6);

    // Sum of distribution must equal 99 exactly
    const distSum = Object.values(result.chapterDistribution).reduce((a, b) => a + b, 0);
    assert.strictEqual(distSum, 99, 'Sum of all chapter counts must equal 99 (ZERO QUESTION LOSS)');

    // Verify first 6 questions have chapter === 'Needs Review' and needsReview === true
    for (let i = 0; i < 6; i++) {
      assert.strictEqual(result.questions[i].chapter, 'Needs Review');
      assert.strictEqual(result.questions[i].needsReview, true);
      assert.ok(result.questions[i].validationErrors.includes('Chapter requires Admin verification'));
    }
  });

  // --------------------------------------------------------------------------
  // TEST 4: QUESTION NUMBER & OPTION FORMAT VARIATIONS
  // --------------------------------------------------------------------------
  console.log('\n>>> SECTION 4: QUESTION & OPTION FORMAT VARIATIONS');

  await test('Recognizes diverse question number formats and option formats', () => {
    const diverseFormatsText = `
Q1) With Q1) format:
A. Option 1
B. Option 2
C. Option 3
D. Option 4
Ans: A

Q.2 With Q.2 format:
A) Option 1
B) Option 2
C) Option 3
D) Option 4
Ans: B

Question 3. With Question 3. format:
(a) Option 1
(b) Option 2
(c) Option 3
(d) Option 4
Correct Option: (c)

Question No. 4: With Question No. 4: format:
(A). Option 1
(B). Option 2
(C). Option 3
(D). Option 4
Answer: (D)

05. With 05. format:
[a] Option 1
[b] Option 2
[c] Option 3
[d] Option 4
Key: A
`;

    const result = parseMaterialTextDeterministic({
      rawText: diverseFormatsText,
      course: 'CA_FOUNDATION',
      subject: 'Business Economics',
      sourceCategory: 'MTP',
      materialName: 'Format Diversity Test',
    });

    assert.strictEqual(result.totalDetected, 5, 'Must recognize all 5 varied question formats');
    assert.strictEqual(result.questions[0].correctAnswer, 'A');
    assert.strictEqual(result.questions[1].correctAnswer, 'B');
    assert.strictEqual(result.questions[2].correctAnswer, 'C');
    assert.strictEqual(result.questions[3].correctAnswer, 'D');
    assert.strictEqual(result.questions[4].correctAnswer, 'A');
  });

  // --------------------------------------------------------------------------
  // TEST 5: MULTI-LINE QUESTIONS AND OPTIONS
  // --------------------------------------------------------------------------
  console.log('\n>>> SECTION 5: MULTI-LINE QUESTIONS & OPTIONS');

  await test('Multi-line question text and multi-line options are preserved without truncation', () => {
    const multiLineText = `
Q1. Which of the following statements
about consumer equilibrium under indifference
curve analysis is true when income increases
and relative prices remain constant?

A. The budget constraint shifts outward in a parallel manner,
   enabling the consumer to reach a higher indifference curve.

B. The slope of the budget constraint steepens drastically
   towards the horizontal axis.

C. The consumer is forced to consume fewer units of all goods
   due to the substitution effect.

D. None of the above statements accurately describes
   the budget constraint movement.

Answer: A
Explanation: A parallel outward shift represents increased real purchasing power with unchanged relative price ratio.
`;

    const result = parseMaterialTextDeterministic({
      rawText: multiLineText,
      course: 'CA_FOUNDATION',
      subject: 'Business Economics',
      sourceCategory: 'MTP',
      materialName: 'Multi-line Test',
    });

    assert.strictEqual(result.totalDetected, 1);
    const q = result.questions[0];

    // Must not truncate at first newline
    assert.ok(q.questionText.includes('under indifference curve analysis is true'));
    assert.ok(q.questionText.includes('relative prices remain constant?'));

    // Option A must include second line
    assert.ok(q.optionA.includes('shifts outward in a parallel manner'));
    assert.ok(q.optionA.includes('enabling the consumer to reach a higher indifference curve'));

    // Explanation must be preserved
    assert.ok(q.explanation.includes('parallel outward shift represents increased real purchasing power'));
    assert.strictEqual(q.correctAnswer, 'A');
  });

  // --------------------------------------------------------------------------
  // TEST 6: MISSING ANSWER BEHAVIOR (NEEDS REVIEW)
  // --------------------------------------------------------------------------
  console.log('\n>>> SECTION 6: ANSWER AUDIT & ZERO AI GUESSING');

  await test('Missing explicit answer results in correctAnswer = "" and needsReview = true without AI guessing', () => {
    const noAnswerText = `
Q1. Which economist proposed the concept of quasi-rent?
(A) Alfred Marshall
(B) David Ricardo
(C) J.M. Keynes
(D) Adam Smith
`;

    const result = parseMaterialTextDeterministic({
      rawText: noAnswerText,
      course: 'CA_FOUNDATION',
      subject: 'Business Economics',
      sourceCategory: 'MTP',
      materialName: 'No Answer Test',
    });

    assert.strictEqual(result.totalDetected, 1);
    const q = result.questions[0];
    assert.strictEqual(q.correctAnswer, '', 'Must never guess answer using AI');
    assert.strictEqual(q.needsReview, true, 'Must flag needsReview');
    assert.ok(q.validationErrors.includes('Missing correct answer'));
  });

  // --------------------------------------------------------------------------
  // TEST 7: CASE-BASED INTEGRATED SCENARIOS
  // --------------------------------------------------------------------------
  console.log('\n>>> SECTION 7: CASE-BASED EXTRACTION');

  await test('Case Study scenario and child questions are properly structured and linked', () => {
    const caseText = `
Case Scenario 1: Market Demand for Organic Beverages
FreshLife Ltd operates in the health beverage segment. In 2025, when household incomes in metropolitan areas rose by 12%, sales of FreshLife green tea increased by 30%. However, when competitor CoolDrink slashed prices by 15%, FreshLife sales dropped by 10%.

Question 1: What type of good is FreshLife green tea based on income elasticity?
(A) Normal luxury good (YED > 1)
(B) Inferior Giffen good
(C) Zero income elasticity good
(D) Perfectly inelastic necessity
Answer: (A)

Question 2: What is the cross price elasticity between FreshLife and CoolDrink?
(A) Positive (Substitutes)
(B) Negative (Complements)
(C) Zero (Unrelated)
(D) Unitary negative
Answer: (A)
`;

    const result = parseMaterialTextDeterministic({
      rawText: caseText,
      course: 'CA_FOUNDATION',
      subject: 'Business Economics',
      sourceCategory: 'MTP',
      materialName: 'Case Study Test',
    });

    assert.strictEqual(result.totalDetected, 2);
    assert.strictEqual(result.caseBasedCount, 2);
    assert.strictEqual(result.normalCount, 0);
    assert.strictEqual(result.cases.length, 1);

    const c = result.cases[0];
    assert.strictEqual(c.caseId, 'CASE-001');
    assert.ok(c.caseScenario.includes('FreshLife Ltd operates in the health beverage segment'));
    assert.strictEqual(c.questions.length, 2);
    assert.strictEqual(c.questions[0].caseSequence, 1);
    assert.strictEqual(c.questions[1].caseSequence, 2);
    assert.strictEqual(c.questions[0].questionType, 'case_based');
  });

  console.log('\n========================================================================');
  console.log(`EXTRACTION AUDIT TESTS PASSED: ${passed} / ${total}`);
  console.log('========================================================================\n');
  process.exit(0);
}

runExtractionAuditTests().catch((e) => {
  console.error('Fatal test runner failure:', e);
  process.exit(1);
});
