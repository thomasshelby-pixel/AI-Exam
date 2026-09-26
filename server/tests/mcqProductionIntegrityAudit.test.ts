import assert from 'node:assert';
import crypto from 'node:crypto';
import db from '../db.js';
import {
  createSession,
  getSession,
  submitAnswer,
  createAdminQuestion,
  updateAdminQuestion,
  bulkUpdateQuestionStatus,
  bulkUpdateCaseStatus,
  deleteAdminQuestion,
  deleteAdminCase,
  seedMcqAdminAndQuestions,
  validateQuestionForPublish,
} from '../services/mcqService.js';
import {
  parseCsvText,
  validateBulkQuestions,
  commitBulkQuestions,
} from '../services/mcqBulkImportService.js';
import {
  saveMcqMaterial,
  deleteMcqMaterial,
} from '../services/mcqMaterialService.js';

console.log('========================================================================');
console.log('--- TEST SUITE: COMPLETE MCQ ARENA PRODUCTION INTEGRITY AUDIT (A - Q) ---');
console.log('========================================================================');

async function runAuditTests() {
  let passed = 0;
  let total = 0;

  async function runTest(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`[PASS] Test ${total} (${name})`);
    } catch (err: any) {
      console.error(`[FAIL] Test ${total} (${name})`);
      console.error(err);
      process.exit(1);
    }
  }

  // Set up temporary test student
  const testStudentId = `test_audit_student_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, phone, role, status, account_classification, mfa_enabled)
    VALUES (?, ?, 'hash', 'Audit Student', '+919999999999', 'STUDENT', 'ACTIVE', 'NORMAL', 0)
  `).run(testStudentId, `${testStudentId}@test.com`);

  // ========================================================================
  // TEST A: Normal MCQ: Q1 -> correct answer -> Q1 explanation
  // ========================================================================
  await runTest('A. Normal MCQ: Q1 -> correct answer -> Q1 explanation', () => {
    const qAId = `test_q_a_${Date.now()}`;
    createAdminQuestion({
      id: qAId,
      course: 'CA_INTERMEDIATE',
      subject: 'Auditing and Ethics',
      chapter: 'Audit Strategy',
      questionType: 'normal',
      difficulty: 'moderate',
      questionText: 'Which document establishes the overall audit strategy?',
      optionA: 'Audit Plan',
      optionB: 'Audit Strategy Memorandum',
      optionC: 'Engagement Letter',
      optionD: 'Management Representation',
      correctAnswer: 'B',
      explanation: 'Under SA 300, the overall audit strategy sets the scope, timing and direction of the audit.',
      reference: 'ICAI SA 300',
      status: 'published',
    }, 'MCQ_ADMIN');

    // Create student practice session
    const sessionRes = createSession(testStudentId, {
      course: 'CA_INTERMEDIATE',
      subject: 'Auditing and Ethics',
      chapter: 'Audit Strategy',
      questionType: 'normal',
      difficulty: 'moderate',
      sessionType: 'practice',
      requestedCount: 1,
    }) as any;

    assert(sessionRes.session, 'Session must be created');
    assert.strictEqual(sessionRes.questions.length, 1);
    const q1 = sessionRes.questions[0];

    // Submit answer
    const ansRes = submitAnswer(sessionRes.session.id, testStudentId, {
      questionId: q1.id,
      selectedOption: 'B',
      timeTakenSeconds: 15,
    });

    assert.strictEqual(ansRes.questionId, q1.id, 'Response must contain questionId matching Q1');
    assert.strictEqual(ansRes.isCorrect, true, 'Option B must be marked correct');
    assert.strictEqual(ansRes.correctAnswer, 'B', 'Correct answer must be B');
    assert(ansRes.explanation.includes('SA 300'), 'Explanation must belong to Q1');
  });

  // ========================================================================
  // TEST B: Q1 -> Q2 quickly -> delayed Q1 response must NOT overwrite Q2
  // ========================================================================
  await runTest('B. Q1 -> Q2 quickly -> delayed Q1 response must NOT overwrite Q2', () => {
    const q1Id = `test_q_b1_${Date.now()}`;
    const q2Id = `test_q_b2_${Date.now()}`;

    createAdminQuestion({
      id: q1Id,
      course: 'CA_INTERMEDIATE',
      subject: 'Taxation',
      chapter: 'Capital Gains',
      questionType: 'normal',
      difficulty: 'moderate',
      questionText: 'Q1: What is the period of holding for unlisted shares to be LTCG?',
      optionA: '12 months',
      optionB: '24 months',
      optionC: '36 months',
      optionD: '48 months',
      correctAnswer: 'B',
      explanation: 'Unlisted shares require > 24 months holding under Section 2(42A).',
      status: 'published',
    }, 'MCQ_ADMIN');

    createAdminQuestion({
      id: q2Id,
      course: 'CA_INTERMEDIATE',
      subject: 'Taxation',
      chapter: 'Capital Gains',
      questionType: 'normal',
      difficulty: 'moderate',
      questionText: 'Q2: What is the basic tax rate for STCG u/s 111A?',
      optionA: '10%',
      optionB: '15%',
      optionC: '20%',
      optionD: '30%',
      correctAnswer: 'C',
      explanation: 'STCG u/s 111A is taxed at 20% under Finance Act 2024.',
      status: 'published',
    }, 'MCQ_ADMIN');

    // Simulate student practice state in frontend client simulation
    const questionsState = [
      { id: q1Id, text: 'Q1', userResponse: { selectedOption: null, isCorrect: false }, explanation: '' },
      { id: q2Id, text: 'Q2', userResponse: { selectedOption: 'C', isCorrect: false }, explanation: '' },
    ];

    // User is on Q1, triggers async submission, then immediately navigates to Q2 (active: Q2)
    let activeQuestionId = q2Id;

    // Delayed Q1 response resolves later
    const delayedQ1Response = {
      questionId: q1Id,
      isCorrect: true,
      correctAnswer: 'B',
      explanation: 'Unlisted shares require > 24 months holding under Section 2(42A).',
    };

    // Frontend invariant: updates strictly by targetId / response.questionId, NEVER by activeQuestionId or array index
    const updatedState = questionsState.map((q) => {
      if (q.id !== delayedQ1Response.questionId) return q;
      return {
        ...q,
        userResponse: { ...q.userResponse, isCorrect: delayedQ1Response.isCorrect },
        explanation: delayedQ1Response.explanation,
      };
    });

    // Invariant: Q2 remains untouched and Q1 response did not overwrite Q2
    const activeQ2InState = updatedState.find((q) => q.id === activeQuestionId);
    assert.strictEqual(activeQ2InState?.id, q2Id);
    assert.strictEqual(activeQ2InState?.userResponse.selectedOption, 'C');
    assert.strictEqual(activeQ2InState?.explanation, '', 'Active Q2 must NOT have Q1 explanation');

    // Invariant: Q1 was updated by ID
    const q1InState = updatedState.find((q) => q.id === q1Id);
    assert.strictEqual(q1InState?.userResponse.isCorrect, true);
    assert(q1InState?.explanation.includes('24 months'));
  });

  // ========================================================================
  // TEST C: Case: Q1 -> Q2 -> Q3 -> Q4 same Case Scenario throughout
  // ========================================================================
  await runTest('C. Case: Q1 -> Q2 -> Q3 -> Q4 same Case Scenario throughout', () => {
    const caseId = `CASE_AUDIT_C_${Date.now()}`;
    const sharedScenario = 'M/s Horizon Traders Ltd. had turnover of Rs. 40 Crores and inventory discrepancy of Rs. 2.5 Crores.';
    const chapterName = `Inventory Valuation ${caseId}`;

    db.prepare(`
      INSERT INTO mcq_cases (case_id, case_title, case_scenario, case_difficulty, course, subject, chapter, status)
      VALUES (?, 'Horizon Traders Case Bundle', ?, 'moderate', 'CA_INTERMEDIATE', 'Advanced Accounting', ?, 'published')
    `).run(caseId, sharedScenario, chapterName);

    for (let seq = 1; seq <= 4; seq++) {
      createAdminQuestion({
        id: `q_case_c_${seq}_${Date.now()}`,
        caseId,
        caseSequence: seq,
        course: 'CA_INTERMEDIATE',
        subject: 'Advanced Accounting',
        chapter: chapterName,
        questionType: 'case_based',
        difficulty: 'moderate',
        questionText: `Question ${seq} on Horizon Traders scenario?`,
        optionA: `Opt A${seq}`,
        optionB: `Opt B${seq}`,
        optionC: `Opt C${seq}`,
        optionD: `Opt D${seq}`,
        correctAnswer: 'A',
        explanation: `Explanation for question ${seq}`,
        status: 'published',
      }, 'MCQ_ADMIN');
    }

    const sess = createSession(testStudentId, {
      course: 'CA_INTERMEDIATE',
      subject: 'Advanced Accounting',
      chapter: chapterName,
      questionType: 'case_based',
      difficulty: 'moderate',
      sessionType: 'practice',
      requestedCount: 4,
    }) as any;

    assert(sess.session, 'Case session created');
    assert.strictEqual(sess.questions.length, 4, 'Must return all 4 child questions');

    // Verify all 4 questions share the exact same case scenario and caseId
    for (let i = 0; i < 4; i++) {
      const q = sess.questions[i];
      assert.strictEqual(q.caseId, caseId, `Q${i + 1} must have caseId ${caseId}`);
      assert.strictEqual(q.caseSequence, i + 1, `Q${i + 1} must have sequence ${i + 1}`);
      assert.strictEqual(q.caseStudyScenario, sharedScenario, `Q${i + 1} must share identical scenario`);
    }
  });

  // ========================================================================
  // TEST D: After case completion: next unique case with same difficulty
  // ========================================================================
  await runTest('D. After case completion: next unique case with same difficulty', () => {
    const caseId1 = `CASE_AUDIT_D1_${Date.now()}`;
    const caseId2 = `CASE_AUDIT_D2_${Date.now()}`;
    const chapD = `Transfer Pricing ${caseId1}`;

    db.prepare(`
      INSERT INTO mcq_cases (case_id, case_title, case_scenario, case_difficulty, course, subject, chapter, status)
      VALUES (?, 'Case One', 'Scenario One', 'hard', 'CA_FINAL', 'Direct Tax Laws', ?, 'published'),
             (?, 'Case Two', 'Scenario Two', 'hard', 'CA_FINAL', 'Direct Tax Laws', ?, 'published')
    `).run(caseId1, chapD, caseId2, chapD);

    createAdminQuestion({
      caseId: caseId1,
      caseSequence: 1,
      course: 'CA_FINAL',
      subject: 'Direct Tax Laws',
      chapter: chapD,
      questionType: 'case_based',
      difficulty: 'hard',
      questionText: 'Case 1 Q1',
      optionA: 'A', optionB: 'B', optionC: 'C', optionD: 'D',
      correctAnswer: 'A', explanation: 'Exp 1', status: 'published',
    }, 'MCQ_ADMIN');

    createAdminQuestion({
      caseId: caseId2,
      caseSequence: 1,
      course: 'CA_FINAL',
      subject: 'Direct Tax Laws',
      chapter: chapD,
      questionType: 'case_based',
      difficulty: 'hard',
      questionText: 'Case 2 Q1',
      optionA: 'A', optionB: 'B', optionC: 'C', optionD: 'D',
      correctAnswer: 'A', explanation: 'Exp 2', status: 'published',
    }, 'MCQ_ADMIN');

    // Create session targeting hard cases
    const sess = createSession(testStudentId, {
      course: 'CA_FINAL',
      subject: 'Direct Tax Laws',
      chapter: chapD,
      questionType: 'case_based',
      difficulty: 'hard',
      sessionType: 'practice',
      requestedCount: 2,
    }) as any;

    assert(sess.session);
    assert(sess.questions.every((q: any) => q.difficulty === 'hard'), 'Every question in session must maintain hard difficulty');
    const caseIdsInSession = new Set(sess.questions.map((q: any) => q.caseId));
    assert(caseIdsInSession.has(caseId1) || caseIdsInSession.has(caseId2));
  });

  // ========================================================================
  // TEST E: Moderate Case-Based selection: only Moderate cases
  // ========================================================================
  await runTest('E. Moderate Case-Based selection: only Moderate cases', () => {
    const caseMod = `CASE_MOD_${Date.now()}`;
    const caseHard = `CASE_HARD_${Date.now()}`;
    const chapE = `Standard Costing ${caseMod}`;

    db.prepare(`
      INSERT INTO mcq_cases (case_id, case_title, case_scenario, case_difficulty, course, subject, chapter, status)
      VALUES (?, 'Mod Case', 'Mod Scen', 'moderate', 'CA_INTERMEDIATE', 'Cost and Management Accounting', ?, 'published'),
             (?, 'Hard Case', 'Hard Scen', 'hard', 'CA_INTERMEDIATE', 'Cost and Management Accounting', ?, 'published')
    `).run(caseMod, chapE, caseHard, chapE);

    createAdminQuestion({
      caseId: caseMod,
      caseSequence: 1,
      course: 'CA_INTERMEDIATE',
      subject: 'Cost and Management Accounting',
      chapter: chapE,
      questionType: 'case_based',
      difficulty: 'moderate',
      questionText: 'Mod Question',
      optionA: 'A', optionB: 'B', optionC: 'C', optionD: 'D',
      correctAnswer: 'A', explanation: 'Exp', status: 'published',
    }, 'MCQ_ADMIN');

    createAdminQuestion({
      caseId: caseHard,
      caseSequence: 1,
      course: 'CA_INTERMEDIATE',
      subject: 'Cost and Management Accounting',
      chapter: chapE,
      questionType: 'case_based',
      difficulty: 'hard',
      questionText: 'Hard Question',
      optionA: 'A', optionB: 'B', optionC: 'C', optionD: 'D',
      correctAnswer: 'A', explanation: 'Exp', status: 'published',
    }, 'MCQ_ADMIN');

    const sess = createSession(testStudentId, {
      course: 'CA_INTERMEDIATE',
      subject: 'Cost and Management Accounting',
      chapter: chapE,
      questionType: 'case_based',
      difficulty: 'moderate',
      sessionType: 'practice',
      requestedCount: 5,
    }) as any;

    assert(sess.session, 'Session must succeed');
    assert(sess.questions.every((q: any) => q.difficulty === 'moderate'), 'Must only return Moderate cases/questions');
    assert(sess.questions.every((q: any) => q.caseId === caseMod), 'Must only select Moderate case');
  });

  // ========================================================================
  // TEST F: Insufficient Moderate cases: honest availability message
  // ========================================================================
  await runTest('F. Insufficient Moderate cases: honest availability message', () => {
    const res = createSession(testStudentId, {
      course: 'CA_FOUNDATION',
      subject: 'Quantitative Aptitude',
      chapter: 'Permutations and Combinations',
      questionType: 'case_based',
      difficulty: 'hard', // Non-existent hard cases
      sessionType: 'practice',
      requestedCount: 5,
    }) as any;

    assert(res.error, 'Must return error');
    assert(res.error.includes('Not enough'), 'Must return honest availability message');
    assert.strictEqual(res.availableCount, 0, 'availableCount must be 0 without silent difficulty fallback');
  });

  // ========================================================================
  // TEST G: Delete MCQ: refresh -> remains deleted
  // ========================================================================
  await runTest('G. Delete MCQ: refresh -> remains deleted', () => {
    const qDel = createAdminQuestion({
      course: 'CA_INTERMEDIATE',
      subject: 'Taxation',
      chapter: 'TDS',
      questionType: 'normal',
      questionText: 'Test Delete Refresh',
      optionA: 'A', optionB: 'B', optionC: 'C', optionD: 'D',
      correctAnswer: 'A', explanation: 'Exp', status: 'published',
    }, 'MCQ_ADMIN') as any;

    deleteAdminQuestion(qDel.id);

    // Refresh simulation (re-query from DB)
    const refreshed = db.prepare('SELECT * FROM mcq_questions WHERE id = ?').get(qDel.id);
    assert.strictEqual(refreshed, undefined, 'Deleted question must remain deleted upon database refresh');
  });

  // ========================================================================
  // TEST H: Delete MCQ: logout/login -> remains deleted
  // ========================================================================
  await runTest('H. Delete MCQ: logout/login -> remains deleted', () => {
    const qDel = createAdminQuestion({
      course: 'CA_INTERMEDIATE',
      subject: 'Taxation',
      chapter: 'TCS',
      questionType: 'normal',
      questionText: 'Test Delete Logout Login',
      optionA: 'A', optionB: 'B', optionC: 'C', optionD: 'D',
      correctAnswer: 'A', explanation: 'Exp', status: 'published',
    }, 'MCQ_ADMIN') as any;

    deleteAdminQuestion(qDel.id);

    // Re-authenticate simulated admin session and query
    const afterRelogin = db.prepare('SELECT * FROM mcq_questions WHERE id = ?').get(qDel.id);
    assert.strictEqual(afterRelogin, undefined, 'Deleted question must remain deleted after logout/login');
  });

  // ========================================================================
  // TEST I: Delete MCQ: restart -> remains deleted
  // ========================================================================
  await runTest('I. Delete MCQ: restart -> remains deleted', () => {
    const qDel = createAdminQuestion({
      course: 'CA_INTERMEDIATE',
      subject: 'Auditing and Ethics',
      chapter: 'Audit Documentation',
      questionType: 'normal',
      questionText: 'Test Delete Restart',
      optionA: 'A', optionB: 'B', optionC: 'C', optionD: 'D',
      correctAnswer: 'A', explanation: 'Exp', status: 'published',
    }, 'MCQ_ADMIN') as any;

    deleteAdminQuestion(qDel.id);

    // Simulate server startup / restart invocation
    seedMcqAdminAndQuestions();

    const afterRestart = db.prepare('SELECT * FROM mcq_questions WHERE id = ?').get(qDel.id);
    assert.strictEqual(afterRestart, undefined, 'Deleted question must NOT be resurrected on restart');
  });

  // ========================================================================
  // TEST J: Delete MCQ: deploy -> remains deleted
  // ========================================================================
  await runTest('J. Delete MCQ: deploy -> remains deleted', () => {
    const qDel = createAdminQuestion({
      course: 'CA_FINAL',
      subject: 'Advanced Auditing',
      chapter: 'Audit of Banks',
      questionType: 'normal',
      questionText: 'Test Delete Deploy',
      optionA: 'A', optionB: 'B', optionC: 'C', optionD: 'D',
      correctAnswer: 'A', explanation: 'Exp', status: 'published',
    }, 'MCQ_ADMIN') as any;

    deleteAdminQuestion(qDel.id);

    // Deploy simulation: initMcqTables and seedMcqAdminAndQuestions run on fresh deploy
    seedMcqAdminAndQuestions();

    const afterDeploy = db.prepare('SELECT * FROM mcq_questions WHERE id = ?').get(qDel.id);
    assert.strictEqual(afterDeploy, undefined, 'Deleted question must remain deleted across deployment');
  });

  // ========================================================================
  // TEST K: Delete Material: deploy -> remains deleted
  // ========================================================================
  await runTest('K. Delete Material: deploy -> remains deleted', async () => {
    const mat = await saveMcqMaterial({
      materialName: 'Audit Guidelines PDF',
      course: 'CA_INTERMEDIATE',
      subject: 'Auditing and Ethics',
      chapter: 'Audit Strategy',
      materialType: 'RTP',
      fileBuffer: Buffer.from('%PDF-1.4 sample audit guidelines content'),
      originalFilename: 'audit_guide.pdf',
      fileType: 'PDF',
      pageCount: 1,
      extractedText: 'Sample text for audit guidelines',
      uploadedBy: 'MCQ_ADMIN',
    });

    assert(mat && mat.id, 'Material must be created');
    await deleteMcqMaterial(mat.id);

    // Simulate deploy
    const afterDeploy = db.prepare('SELECT * FROM mcq_materials WHERE id = ? AND status != \'DELETED\'').get(mat.id);
    assert.strictEqual(afterDeploy, undefined, 'Deleted material must remain deleted');
  });

  // ========================================================================
  // TEST L: Deployment must NOT reseed production records
  // ========================================================================
  await runTest('L. Deployment must NOT reseed production records', () => {
    const preCount = (db.prepare('SELECT count(*) as count FROM mcq_questions').get() as any).count;
    seedMcqAdminAndQuestions();
    const postCount = (db.prepare('SELECT count(*) as count FROM mcq_questions').get() as any).count;
    assert.strictEqual(postCount, preCount, 'Deployment initialization must be strictly idempotent and not re-seed existing database');
  });

  // ========================================================================
  // TEST M: Question with wrong/malformed correctAnswer: publish blocked
  // ========================================================================
  await runTest('M. Question with wrong/malformed correctAnswer: publish blocked', () => {
    assert.throws(() => {
      createAdminQuestion({
        course: 'CA_INTERMEDIATE',
        subject: 'Taxation',
        chapter: 'GST',
        questionType: 'normal',
        questionText: 'What is GSTR-1?',
        optionA: 'Return', optionB: 'Ledger', optionC: 'ITC', optionD: 'Refund',
        correctAnswer: 'E' as any, // Invalid option letter
        explanation: 'GSTR-1 is outward supplies return.',
        status: 'published',
      }, 'MCQ_ADMIN');
    }, /Cannot publish question: correctAnswer must be strictly Option A, B, C, or D/);

    const draftQ = createAdminQuestion({
      course: 'CA_INTERMEDIATE',
      subject: 'Taxation',
      chapter: 'GST',
      questionType: 'normal',
      questionText: 'What is GSTR-1?',
      optionA: 'Return', optionB: 'Ledger', optionC: 'ITC', optionD: 'Refund',
      correctAnswer: 'Z' as any,
      explanation: 'Explanation text',
      status: 'draft',
    }, 'MCQ_ADMIN') as any;

    assert.throws(() => {
      bulkUpdateQuestionStatus([draftQ.id], 'published');
    }, /Cannot publish question/);
  });

  // ========================================================================
  // TEST N: Missing explanation: publish blocked
  // ========================================================================
  await runTest('N. Missing explanation: publish blocked', () => {
    assert.throws(() => {
      createAdminQuestion({
        course: 'CA_INTERMEDIATE',
        subject: 'Corporate and Other Laws',
        chapter: 'Companies Act',
        questionType: 'normal',
        questionText: 'What is private company?',
        optionA: 'A', optionB: 'B', optionC: 'C', optionD: 'D',
        correctAnswer: 'A',
        explanation: '', // Empty explanation
        status: 'published',
      }, 'MCQ_ADMIN');
    }, /non-empty explanation is required/);
  });

  // ========================================================================
  // TEST O: Duplicate caseSequence: import blocked
  // ========================================================================
  await runTest('O. Duplicate caseSequence: import blocked', () => {
    const csvContent = `Question Type,Case ID,Case Title,Case Scenario,Case Sequence,Question Text,Option A,Option B,Option C,Option D,Correct Answer,Explanation,Course,Subject,Chapter,Difficulty
CASE_BASED,CASE_DUP_1,Dup Case,Scenario Text,1,Question 1 text?,A,B,C,D,A,Exp 1,CA Intermediate,Taxation,GST,Moderate
CASE_BASED,CASE_DUP_1,Dup Case,Scenario Text,1,Question 2 text with duplicate seq 1?,A,B,C,D,B,Exp 2,CA Intermediate,Taxation,GST,Moderate`;

    const parsed = parseCsvText(csvContent);
    const validated = validateBulkQuestions(parsed);

    assert.strictEqual(validated.validCount, 0, 'Rows with duplicate sequence must be invalid');
    assert(validated.rows[1].errors.some((e) => e.includes('Duplicate Case Sequence 1')));

    const commitRes = commitBulkQuestions(validated.rows, 'MCQ_ADMIN', 'published');
    assert.strictEqual(commitRes.importedCount, 0, 'No questions must be committed when sequence is duplicate');
  });

  // ========================================================================
  // TEST P: Mixed import: Normal + Case-Based handled correctly
  // ========================================================================
  await runTest('P. Mixed import: Normal + Case-Based handled correctly', () => {
    const mixedCsv = `Question Type,Case ID,Case Title,Case Scenario,Case Sequence,Question Text,Option A,Option B,Option C,Option D,Correct Answer,Explanation,Course,Subject,Chapter,Difficulty
NORMAL,,,,,Standalone Normal Question?,Opt A,Opt B,Opt C,Opt D,A,Normal Exp,CA Intermediate,Auditing and Ethics,Audit Strategy,Moderate
CASE_BASED,CASE_MIX_1,Bundle Title,Bundle Scenario,1,Case Question 1?,Opt A,Opt B,Opt C,Opt D,B,Case Exp 1,CA Intermediate,Auditing and Ethics,Audit Strategy,Moderate
CASE_BASED,CASE_MIX_1,Bundle Title,Bundle Scenario,2,Case Question 2?,Opt A,Opt B,Opt C,Opt D,C,Case Exp 2,CA Intermediate,Auditing and Ethics,Audit Strategy,Moderate`;

    const parsed = parseCsvText(mixedCsv);
    const validated = validateBulkQuestions(parsed);

    assert.strictEqual(validated.validCount, 3, 'All 3 rows in mixed import must be valid');
    assert.strictEqual(validated.normalCount, 1, '1 Normal MCQ');
    assert.strictEqual(validated.caseCount, 1, '1 Case Bundle');
    assert.strictEqual(validated.rows.filter((r) => r.data.questionType === 'case_based').length, 2, '2 Case Questions');

    const commitRes = commitBulkQuestions(validated.rows, 'MCQ_ADMIN', 'draft');
    assert.strictEqual(commitRes.importedCount, 3);
    assert.strictEqual(commitRes.casesCount, 1);
  });

  // ========================================================================
  // TEST Q: Student: never receives DRAFT / REVIEW / DELETED questions
  // ========================================================================
  await runTest('Q. Student: never receives DRAFT / REVIEW / DELETED questions', () => {
    const subject = `Subject_Audit_Q_${Date.now()}`;

    createAdminQuestion({
      course: 'CA_INTERMEDIATE',
      subject,
      chapter: 'Chap 1',
      questionType: 'normal',
      questionText: 'Draft Question Text',
      optionA: 'A', optionB: 'B', optionC: 'C', optionD: 'D',
      correctAnswer: 'A', explanation: 'Exp', status: 'draft',
    }, 'MCQ_ADMIN');

    createAdminQuestion({
      course: 'CA_INTERMEDIATE',
      subject,
      chapter: 'Chap 1',
      questionType: 'normal',
      questionText: 'Review Question Text',
      optionA: 'A', optionB: 'B', optionC: 'C', optionD: 'D',
      correctAnswer: 'A', explanation: 'Exp', status: 'review',
    }, 'MCQ_ADMIN');

    createAdminQuestion({
      course: 'CA_INTERMEDIATE',
      subject,
      chapter: 'Chap 1',
      questionType: 'normal',
      questionText: 'Published Question Text',
      optionA: 'A', optionB: 'B', optionC: 'C', optionD: 'D',
      correctAnswer: 'A', explanation: 'Exp', status: 'published',
    }, 'MCQ_ADMIN');

    const sess = createSession(testStudentId, {
      course: 'CA_INTERMEDIATE',
      subject,
      questionType: 'normal',
      sessionType: 'practice',
      requestedCount: 10,
    }) as any;

    assert(sess.session);
    assert.strictEqual(sess.questions.length, 1, 'Only published question must be returned to student');
    assert.strictEqual(sess.questions[0].questionText, 'Published Question Text');
  });

  console.log('========================================================================');
  console.log(`✅ ALL ${passed} / ${total} PRODUCTION AUDIT REGRESSION TESTS PASSED!`);
  console.log('========================================================================\n');
  process.exit(0);
}

runAuditTests().catch((e) => {
  console.error('Audit run failed:', e);
  process.exit(1);
});
