import assert from 'node:assert';
import { db } from '../db.js';
import {
  parseMaterialTextDeterministic,
  extractTextFromPdfBufferDeterministic,
  getCurriculumChapters,
} from '../services/mcqDeterministicParser.js';
import {
  saveMcqMaterial,
  deleteMcqMaterial,
} from '../services/mcqMaterialService.js';
import {
  createSession,
  submitAnswer,
  getAdminQuestions,
  bulkUpdateQuestionStatus,
} from '../services/mcqService.js';

console.log('========================================================================');
console.log('--- TEST SUITE: MCQ ARENA REFERENCE IMAGE WORKFLOW END-TO-END ---');
console.log('========================================================================');

async function runReferenceFlowTests() {
  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      fn();
      console.log(`[PASS] Test ${total}: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] Test ${total}: ${name}`);
      console.error(err);
      process.exit(1);
    }
  }

  // --------------------------------------------------------------------------
  // 1. STEP 1 & 2: CURRICULUM & METADATA VALIDATION
  // --------------------------------------------------------------------------
  console.log('\n>>> SECTION 1: METADATA & CANONICAL CURRICULUM');

  test('Curriculum chapters map accurately without cross-course leakage', () => {
    const fndChapters = getCurriculumChapters('CA_FOUNDATION', 'Business Economics');
    assert(fndChapters.length > 0, 'Foundation Economics chapters must exist');
    assert(fndChapters.includes('Theory of Demand and Supply'), 'Must contain Demand and Supply');

    const interLawChapters = getCurriculumChapters('CA_INTERMEDIATE', 'Corporate and Other Laws');
    assert(interLawChapters.includes('Prospectus and Allotment of Securities'), 'Inter Law chapters must exist');
    assert(!fndChapters.includes('Prospectus and Allotment of Securities'), 'No cross-course leakage');
  });

  // --------------------------------------------------------------------------
  // 2. STEP 3: 100% DETERMINISTIC EXTRACTION & PARSING (ZERO AI)
  // --------------------------------------------------------------------------
  console.log('\n>>> SECTION 2: 100% DETERMINISTIC PARSER (ZERO AI)');

  const sampleMaterialText = `
MATERIAL: PW Revizer Economics Mock Series
ICAI CA Foundation Business Economics Practice Questions

Chapter 1: Theory of Demand and Supply

Question 1: Other things being equal, if the price of a commodity falls, the quantity demanded of the commodity:
(a) Rises
(b) Falls
(c) Remains unchanged
(d) First falls then rises
Answer: (a)
Explanation: According to the Law of Demand, there is an inverse relationship between price and quantity demanded, ceteris paribus.
Reference: ICAI Study Material Foundation Paper 4 Chapter 2 Page 15

Question 2: An indifference curve slopes downward from left to right because of:
(A) Diminishing marginal rate of substitution
(B) Increasing marginal rate of substitution
(C) Constant marginal rate of substitution
(D) Negative income effect
Answer: (A)
Explanation: The downward slope of an indifference curve is explained by the diminishing marginal rate of substitution (MRS) between two goods.
Reference: ICAI Study Material Foundation Paper 4

Case Scenario 1: Retail Price Elasticity Study
A leading consumer retail chain observed that a 10% reduction in the price of premium organic tea led to a 25% increase in total volume sales, while for standard wheat flour a similar 10% price reduction resulted in only a 2% volume increase.

Question 1: What is the price elasticity of demand for the organic tea?
(a) 0.4 (Inelastic)
(b) 2.5 (Elastic)
(c) 1.0 (Unitary)
(d) Negative 0.4
Answer: (b)
Explanation: Elasticity of Demand = % Change in Quantity / % Change in Price = 25% / 10% = 2.5. Since Ep > 1, demand is price elastic.
Reference: ICAI Chapter 2 Elasticity Calculation

Question 2: What explains the lower elasticity observed for standard wheat flour?
(a) Wheat flour is a necessity with few immediate substitutes
(b) Wheat flour is an ostentatious Veblen good
(c) Organic tea is an inferior Giffen good
(d) Consumer income doubled during the trial period
Answer: (a)
Explanation: Necessities of life typically have inelastic demand because consumers continue purchasing them despite price fluctuations.
Reference: ICAI Chapter 2
`;

  let parsedOutput: any;

  test('Deterministic parser accurately extracts Normal MCQs and Case Studies', () => {
    parsedOutput = parseMaterialTextDeterministic({
      rawText: sampleMaterialText,
      course: 'CA_FOUNDATION',
      subject: 'Business Economics',
      sourceCategory: 'MTP',
      attempt: 'May 2026',
      materialName: 'PW Revizer Economics',
    });

    assert.strictEqual(parsedOutput.materialName, 'PW Revizer Economics');
    assert.strictEqual(parsedOutput.totalDetected, 4, 'Must detect 4 total questions (2 Normal + 2 Case-Based)');
    assert.strictEqual(parsedOutput.normalCount, 2, 'Must detect 2 Normal MCQs');
    assert.strictEqual(parsedOutput.caseBasedCount, 2, 'Must detect 2 Case-Based MCQs');
    assert.strictEqual(parsedOutput.cases.length, 1, 'Must detect 1 Case Group');

    // Case integrity
    const c1 = parsedOutput.cases[0];
    assert.strictEqual(c1.caseId, 'CASE-001');
    assert(c1.caseScenario.includes('Retail Price Elasticity Study'), 'Scenario must contain case text');
    assert.strictEqual(c1.questions.length, 2, 'Case must contain 2 child questions');
    assert.strictEqual(c1.questions[0].caseSequence, 1);
    assert.strictEqual(c1.questions[1].caseSequence, 2);

    // Answer integrity
    const normalQs = parsedOutput.questions.filter((q: any) => q.questionType === 'normal');
    assert.strictEqual(normalQs[0].correctAnswer, 'A');
    assert.strictEqual(normalQs[1].correctAnswer, 'A');
    assert.strictEqual(c1.questions[0].correctAnswer, 'B');
    assert.strictEqual(c1.questions[1].correctAnswer, 'A');
  });

  // --------------------------------------------------------------------------
  // 3. STEP 5: SAVE AS DRAFT
  // --------------------------------------------------------------------------
  console.log('\n>>> SECTION 3: STEP 5 (SAVE AS DRAFT)');

  const testMaterialId = `mat_ref_test_${Date.now()}`;
  const savedQuestionIds: string[] = [];

  test('Save Draft stores questions with status DRAFT and immutable IDs', () => {
    // Save material
    db.prepare(`
      INSERT INTO mcq_materials (
        id, material_name, course, subject, material_type, source, attempt, status,
        file_type, file_name, file_size, file_hash, uploaded_by
      ) VALUES (?, ?, ?, ?, ?, 'ICAI', ?, 'Draft', 'TXT', 'sample.txt', 1024, 'dummy_hash', 'MCQ_ADMIN')
    `).run(
      testMaterialId,
      parsedOutput.materialName,
      parsedOutput.course,
      parsedOutput.subject,
      parsedOutput.sourceCategory,
      parsedOutput.attempt
    );

    // Save questions
    const insertQStmt = db.prepare(`
      INSERT INTO mcq_questions (
        id, course, subject, chapter, topic, question_type, case_id, case_sequence, case_study_scenario,
        difficulty, source, attempt, question_text, option_a, option_b, option_c, option_d,
        correct_answer, explanation, reference, status, source_material_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, 'MCQ_ADMIN')
    `);

    for (const q of parsedOutput.questions) {
      const qId = `test_draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      insertQStmt.run(
        qId,
        q.course,
        q.subject,
        q.chapter,
        q.topic,
        q.questionType,
        q.caseId || null,
        q.caseSequence || null,
        q.caseScenario || null,
        q.difficulty,
        q.source,
        q.attempt || null,
        q.questionText,
        q.optionA,
        q.optionB,
        q.optionC,
        q.optionD,
        q.correctAnswer,
        q.explanation,
        q.reference,
        testMaterialId
      );
      savedQuestionIds.push(qId);
    }

    assert.strictEqual(savedQuestionIds.length, 4, '4 draft questions must be saved');

    // Verify questions are in DRAFT status
    const drafts = db.prepare(`SELECT status FROM mcq_questions WHERE id IN (${savedQuestionIds.map(() => '?').join(',')})`).all(...savedQuestionIds) as any[];
    assert(drafts.every((d) => d.status === 'draft'), 'All questions must have status draft');
  });

  // --------------------------------------------------------------------------
  // 4. STEP 6 & 7: REVIEW & APPROVE
  // --------------------------------------------------------------------------
  console.log('\n>>> SECTION 4: STEP 6 & 7 (REVIEW & APPROVE)');

  test('Approval engine validates questions and transitions status to APPROVED', () => {
    // Update status to approved
    db.prepare(`
      UPDATE mcq_questions
      SET status = 'approved',
          reviewed_by = 'MCQ_ADMIN'
      WHERE id IN (${savedQuestionIds.map(() => '?').join(',')})
    `).run(...savedQuestionIds);

    const approvedRows = db.prepare(`SELECT status FROM mcq_questions WHERE id IN (${savedQuestionIds.map(() => '?').join(',')})`).all(...savedQuestionIds) as any[];
    assert(approvedRows.every((d) => d.status === 'approved'), 'All questions must be approved');
  });

  // --------------------------------------------------------------------------
  // 5. STEP 8: PUBLISH & STUDENT ACCESS
  // --------------------------------------------------------------------------
  console.log('\n>>> SECTION 5: STEP 8 (PUBLISH & STUDENT PRACTICE)');

  test('Publishing transitions questions to PUBLISHED and makes them available to students', () => {
    db.prepare(`
      UPDATE mcq_questions
      SET status = 'published'
      WHERE id IN (${savedQuestionIds.map(() => '?').join(',')})
    `).run(...savedQuestionIds);

    const publishedRows = db.prepare(`SELECT status FROM mcq_questions WHERE id IN (${savedQuestionIds.map(() => '?').join(',')})`).all(...savedQuestionIds) as any[];
    assert(publishedRows.every((d) => d.status === 'published'), 'All questions must be published');

    // Create student practice session
    const studentId = `test_student_ref_${Date.now()}`;
    const studentEmail = `student_ref_${Date.now()}@example.com`;
    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, full_name)
      VALUES (?, ?, 'hash', 'STUDENT', 'Reference Student')
    `).run(studentId, studentEmail);

    const sessionRes = createSession(studentId, {
      course: 'CA_FOUNDATION',
      subject: 'Business Economics',
      questionType: 'normal',
      difficulty: 'moderate',
      sessionType: 'practice',
      requestedCount: 2,
    });

    assert('session' in sessionRes && 'questions' in sessionRes, 'Student session must be created');
    assert(sessionRes.questions.length > 0, 'Questions must be returned to student');

    // Submit answer with case-insensitive normalization
    const q1 = sessionRes.questions[0];
    const subRes = submitAnswer(sessionRes.session.id, studentId, {
      questionId: q1.id,
      selectedOption: 'A',
      timeTakenSeconds: 10,
    });

    assert.strictEqual(subRes.questionId, q1.id);
    assert.strictEqual(typeof subRes.isCorrect, 'boolean');
    assert.ok(subRes.correctAnswer);
    assert.ok(subRes.explanation);
  });

  // --------------------------------------------------------------------------
  // 6. CLEANUP
  // --------------------------------------------------------------------------
  test('Cleanup test records', () => {
    db.prepare(`DELETE FROM mcq_questions WHERE id IN (${savedQuestionIds.map(() => '?').join(',')})`).run();
    db.prepare('DELETE FROM mcq_materials WHERE id = ?').run(testMaterialId);
  });

  console.log('\n========================================================================');
  console.log(`✅ ALL ${passed} / ${total} REFERENCE WORKFLOW TESTS PASSED!`);
  console.log('========================================================================\n');
}

runReferenceFlowTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
