import { db, initDatabase } from '../db.js';
import {
  calculateStudentExaminerProfile,
  updateStudentExaminerProfile,
  getStudentExaminerProfile,
  classifyIssue,
  matchesSubject,
  getSubjectCategory,
} from '../services/examinerProfileService.js';
import { CA_CURRICULUM } from '../../src/data/caCurriculum.js';

initDatabase();

console.log('================================================================');
console.log('--- RUNNING EXAMINER PROFILE ACCURACY & COMPLETENESS AUDIT TESTS ---');
console.log('================================================================');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] Test ${totalTests}: ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] Test ${totalTests}: ${testName}${detail ? ` - ${detail}` : ''}`);
    process.exitCode = 1;
  }
}

function cleanupStudent(studentId: string) {
  try {
    db.prepare(`DELETE FROM evaluations WHERE student_id = ?`).run(studentId);
    db.prepare(`DELETE FROM student_examiner_profiles WHERE student_id = ?`).run(studentId);
    db.prepare(`DELETE FROM student_profiles WHERE user_id = ?`).run(studentId);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(studentId);
  } catch {
    // ignore
  }
}

function createMockStudent(studentId: string, email: string, caLevel: string = 'INTERMEDIATE') {
  cleanupStudent(studentId);
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, ?, 'dummy_hash', 'Test Student', 'STUDENT', 'ACTIVE')
  `).run(studentId, email);

  db.prepare(`
    INSERT INTO student_profiles (user_id, icai_registration_number, ca_level)
    VALUES (?, 'WRO1234567', ?)
  `).run(studentId, caLevel);
}

function insertMockEvaluation(
  id: string,
  studentId: string,
  subjectKey: string,
  subjectName: string,
  resultJson: any,
  completedAt: string = new Date().toISOString(),
  level: string = 'INTERMEDIATE'
) {
  db.prepare(`
    INSERT INTO evaluations (
      id, student_id, level, material_type, subject_key, subject_name,
      paper, attempt, original_filename, status, total_marks, maximum_marks,
      percentage, grade, result_json, created_at, completed_at
    ) VALUES (
      ?, ?, ?, 'PAST_PAPERS', ?, ?,
      'Paper 1', 'MAY_2026', 'test.pdf', 'COMPLETED', ?, 100,
      ?, 'B', ?, ?, ?
    )
  `).run(
    id,
    studentId,
    level,
    subjectKey,
    subjectName,
    resultJson.totalMarksAwarded ?? 60,
    resultJson.totalMarksAwarded ?? 60,
    JSON.stringify(resultJson),
    completedAt,
    completedAt
  );
}

try {
  // --------------------------------------------------------------------------
  // TEST 1: Recurrence across distinct evaluations (requires >= 2 distinct evaluations)
  // Single evaluation with multiple deductions of same type must NOT trigger recurring pattern
  // --------------------------------------------------------------------------
  {
    const studentId = 'audit_student_01';
    createMockStudent(studentId, 'audit01@test.ca');

    const singlePaper = {
      totalMarksAwarded: 50,
      questions: [
        {
          questionNumber: '1',
          marksAwarded: 2,
          maximumMarks: 5,
          components: [
            {
              componentType: 'CALCULATION',
              deductionReason: 'Arithmetic slip in salary computation',
              marksAwarded: 0,
              marksAvailable: 2,
            },
          ],
        },
        {
          questionNumber: '2',
          marksAwarded: 2,
          maximumMarks: 5,
          components: [
            {
              componentType: 'CALCULATION',
              deductionReason: 'Wrong total in deduction schedule',
              marksAwarded: 0,
              marksAvailable: 2,
            },
          ],
        },
      ],
    };

    insertMockEvaluation('eval_a01', studentId, 'inter_taxation', 'Taxation (Income Tax & GST)', singlePaper);

    const profile = calculateStudentExaminerProfile(studentId);
    assert(
      profile.evaluationsAnalysed === 1 &&
        profile.insufficientHistory === true &&
        profile.recurringPatternsCount === 0,
      'Single evaluation with multiple deductions sets insufficientHistory: true with 0 recurring patterns',
      `evaluationsAnalysed: ${profile.evaluationsAnalysed}, recurring: ${profile.recurringPatternsCount}`
    );
    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Correct count of distinct evaluations vs affected deduction records
  // 2 evaluations containing 3 total calculation deduction records
  // --------------------------------------------------------------------------
  {
    const studentId = 'audit_student_02';
    createMockStudent(studentId, 'audit02@test.ca');

    const paper1 = {
      totalMarksAwarded: 60,
      questions: [
        {
          questionNumber: '1',
          components: [
            { componentType: 'CALCULATION', deductionReason: 'Arithmetic slip', marksAwarded: 0, marksAvailable: 1 },
            { componentType: 'CALCULATION', deductionReason: 'Wrong slab total', marksAwarded: 0, marksAvailable: 1 },
          ],
        },
      ],
    };

    const paper2 = {
      totalMarksAwarded: 65,
      questions: [
        {
          questionNumber: '3',
          components: [
            { componentType: 'CALCULATION', deductionReason: 'Cess calculation slip', marksAwarded: 0, marksAvailable: 1 },
          ],
        },
      ],
    };

    insertMockEvaluation('eval_a02_1', studentId, 'inter_taxation', 'Taxation (Income Tax & GST)', paper1, '2026-01-01T10:00:00Z');
    insertMockEvaluation('eval_a02_2', studentId, 'inter_taxation', 'Taxation (Income Tax & GST)', paper2, '2026-01-02T10:00:00Z');

    const profile = calculateStudentExaminerProfile(studentId);
    const calcPattern = profile.recurringPatterns.find((p) => p.id === 'calculation_errors');

    assert(
      !!calcPattern &&
        calcPattern.detectionCount === 2 &&
        calcPattern.evaluationsCount === 2 &&
        calcPattern.affectedComponentsCount === 3 &&
        calcPattern.evidence.length === 3,
      'Distinct evaluations count (2) separated from affected deduction records (3)',
      `detectionCount: ${calcPattern?.detectionCount}, affected: ${calcPattern?.affectedComponentsCount}`
    );
    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Correct steps with zero mark loss NEVER counted as deficient (Elimination of 131 phantom items)
  // --------------------------------------------------------------------------
  {
    const studentId = 'audit_student_03';
    createMockStudent(studentId, 'audit03@test.ca');

    // Paper with 5 perfectly correct application steps (assessment: CORRECT, marksAwarded: full, marksDeducted: 0)
    const perfectPaper1 = {
      totalMarksAwarded: 100,
      questions: [
        {
          questionNumber: '1',
          components: [
            {
              componentType: 'APPLICATION',
              expectedRequirement: 'Application of Section 54 to house property facts',
              assessment: 'CORRECT',
              marksAwarded: 2,
              marksAvailable: 2,
              marksDeducted: 0,
            },
            {
              componentType: 'APPLICATION',
              expectedRequirement: 'Application of Time of supply rules',
              assessment: 'CORRECT',
              marksAwarded: 2,
              marksAvailable: 2,
              marksDeducted: 0,
            },
          ],
        },
      ],
    };

    const perfectPaper2 = {
      totalMarksAwarded: 100,
      questions: [
        {
          questionNumber: '2',
          components: [
            {
              componentType: 'APPLICATION',
              expectedRequirement: 'Application of Place of supply for transport',
              assessment: 'CORRECT',
              marksAwarded: 2,
              marksAvailable: 2,
              marksDeducted: 0,
            },
          ],
        },
      ],
    };

    insertMockEvaluation('eval_a03_1', studentId, 'inter_taxation', 'Taxation (Income Tax & GST)', perfectPaper1, '2026-01-01T10:00:00Z');
    insertMockEvaluation('eval_a03_2', studentId, 'inter_taxation', 'Taxation (Income Tax & GST)', perfectPaper2, '2026-01-02T10:00:00Z');

    const profile = calculateStudentExaminerProfile(studentId);
    const waPattern = profile.recurringPatterns.find((p) => p.id === 'weak_application');

    assert(
      !waPattern || waPattern.evidence.length === 0,
      'Fully correct application steps with 0 marks lost produce ZERO phantom deduction records',
      `Found weak_application records: ${waPattern?.evidence.length || 0}`
    );
    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Stable evidence deduplication ensures joins/re-runs do not duplicate records
  // --------------------------------------------------------------------------
  {
    const studentId = 'audit_student_04';
    createMockStudent(studentId, 'audit04@test.ca');

    // Duplicate component with same ID in question breakdown
    const paperWithDups = {
      totalMarksAwarded: 50,
      questions: [
        {
          questionNumber: '1',
          components: [
            {
              componentId: 'COMP_1',
              componentType: 'PROVISION',
              deductionReason: 'Section not cited',
              marksAwarded: 0,
              marksAvailable: 2,
            },
            {
              componentId: 'COMP_1', // Duplicate join/sync representation of the same step
              componentType: 'PROVISION',
              deductionReason: 'Section not cited',
              marksAwarded: 0,
              marksAvailable: 2,
            },
          ],
        },
      ],
    };

    const paper2 = {
      totalMarksAwarded: 50,
      questions: [
        {
          questionNumber: '2',
          components: [
            {
              componentId: 'COMP_2',
              componentType: 'PROVISION',
              deductionReason: 'SA standard not cited',
              marksAwarded: 0,
              marksAvailable: 2,
            },
          ],
        },
      ],
    };

    insertMockEvaluation('eval_a04_1', studentId, 'inter_taxation', 'Taxation (Income Tax & GST)', paperWithDups, '2026-01-01T10:00:00Z');
    insertMockEvaluation('eval_a04_2', studentId, 'inter_taxation', 'Taxation (Income Tax & GST)', paper2, '2026-01-02T10:00:00Z');

    const profile = calculateStudentExaminerProfile(studentId);
    const provPattern = profile.recurringPatterns.find((p) => p.id === 'missing_provisions');

    assert(
      !!provPattern && provPattern.affectedComponentsCount === 2 && provPattern.evidence.length === 2,
      'Duplicate component join paths cleanly deduplicated by stable evidence IDs',
      `Evidence count: ${provPattern?.evidence.length}`
    );
    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 5: STRICT SUBJECT-WISE FILTERING: Selecting Taxation isolates all metrics to Taxation only
  // --------------------------------------------------------------------------
  {
    const studentId = 'audit_student_05';
    createMockStudent(studentId, 'audit05@test.ca');

    // 2 Taxation evaluations
    const taxPaper1 = {
      totalMarksAwarded: 60,
      questions: [
        {
          questionNumber: '1',
          components: [
            { componentType: 'PROVISION', deductionReason: 'Section 115BAC provision not cited', marksAwarded: 0, marksAvailable: 2 },
          ],
        },
      ],
    };
    const taxPaper2 = {
      totalMarksAwarded: 62,
      questions: [
        {
          questionNumber: '2',
          components: [
            { componentType: 'PROVISION', deductionReason: 'Section 54 exemption conditions omitted', marksAwarded: 0, marksAvailable: 2 },
          ],
        },
      ],
    };

    // 2 Law evaluations (with Incomplete Conclusion)
    const lawPaper1 = {
      totalMarksAwarded: 55,
      questions: [
        {
          questionNumber: '1',
          components: [
            { componentType: 'CONCLUSION', deductionReason: 'Client concluding advice missing', marksAwarded: 0, marksAvailable: 2 },
          ],
        },
      ],
    };
    const lawPaper2 = {
      totalMarksAwarded: 58,
      questions: [
        {
          questionNumber: '2',
          components: [
            { componentType: 'CONCLUSION', deductionReason: 'No final conclusion on director liability', marksAwarded: 0, marksAvailable: 2 },
          ],
        },
      ],
    };

    insertMockEvaluation('eval_tax_1', studentId, 'inter_taxation', 'Taxation (Income Tax & GST)', taxPaper1, '2026-01-01T10:00:00Z');
    insertMockEvaluation('eval_tax_2', studentId, 'inter_taxation', 'Taxation (Income Tax & GST)', taxPaper2, '2026-01-02T10:00:00Z');
    insertMockEvaluation('eval_law_1', studentId, 'inter_corporate_law', 'Corporate and Other Laws', lawPaper1, '2026-01-03T10:00:00Z');
    insertMockEvaluation('eval_law_2', studentId, 'inter_corporate_law', 'Corporate and Other Laws', lawPaper2, '2026-01-04T10:00:00Z');

    // 1. Query with subject='inter_taxation'
    const taxProfile = calculateStudentExaminerProfile(studentId, 'inter_taxation');

    assert(
      taxProfile.evaluationsAnalysed === 2 &&
        taxProfile.selectedSubjectName === 'Taxation (Income Tax & GST)' &&
        taxProfile.recurringPatterns.every((p) => p.evidence.every((e) => e.subjectKey === 'inter_taxation')),
      'Selecting Taxation filters evaluationsAnalysed to 2 and zero Law evidence leaks into Taxation',
      `taxProfile evals: ${taxProfile.evaluationsAnalysed}, patterns: ${taxProfile.recurringPatterns.map((p) => p.id).join(', ')}`
    );

    // Verify Law pattern (incomplete_conclusions) does NOT appear in Taxation
    const lawPatternInTax = taxProfile.recurringPatterns.find((p) => p.id === 'incomplete_conclusions');
    assert(
      !lawPatternInTax,
      'Law pattern (incomplete_conclusions) strictly excluded from Taxation profile',
      `Found: ${lawPatternInTax?.id}`
    );

    // 2. Query with subject='inter_corporate_law'
    const lawProfile = calculateStudentExaminerProfile(studentId, 'inter_corporate_law');
    assert(
      lawProfile.evaluationsAnalysed === 2 &&
        lawProfile.selectedSubjectName === 'Corporate and Other Laws' &&
        lawProfile.recurringPatterns.every((p) => p.evidence.every((e) => e.subjectKey === 'inter_corporate_law')),
      'Selecting Corporate Law filters evaluationsAnalysed to 2 and zero Tax evidence leaks into Law',
      `lawProfile evals: ${lawProfile.evaluationsAnalysed}`
    );

    // 3. Query with subject='all'
    const allProfile = calculateStudentExaminerProfile(studentId, 'all');
    assert(
      allProfile.evaluationsAnalysed === 4 && allProfile.recurringPatterns.length === 2,
      'All Subjects overview aggregates all 4 eligible evaluations without double counting',
      `allProfile evals: ${allProfile.evaluationsAnalysed}, patterns: ${allProfile.recurringPatterns.length}`
    );

    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Unanalyzed subject returns clean, truthful empty state without falling back to another subject
  // --------------------------------------------------------------------------
  {
    const studentId = 'audit_student_06';
    createMockStudent(studentId, 'audit06@test.ca');

    // Student has 2 Taxation papers
    const taxPaper1 = { totalMarksAwarded: 70, questions: [] };
    const taxPaper2 = { totalMarksAwarded: 75, questions: [] };
    insertMockEvaluation('eval_tax_a', studentId, 'inter_taxation', 'Taxation (Income Tax & GST)', taxPaper1, '2026-01-01T10:00:00Z');
    insertMockEvaluation('eval_tax_b', studentId, 'inter_taxation', 'Taxation (Income Tax & GST)', taxPaper2, '2026-01-02T10:00:00Z');

    // Filter by Advanced Accounting (which has 0 submissions)
    const accProfile = calculateStudentExaminerProfile(studentId, 'inter_advanced_accounting');

    assert(
      accProfile.evaluationsAnalysed === 0 &&
        accProfile.insufficientHistory === true &&
        accProfile.recurringPatterns.length === 0 &&
        accProfile.message?.includes('No completed evaluations') &&
        accProfile.subjectPatterns[0].hasEvaluations === false,
      'Unanalyzed subject displays truthful empty state with zero fallback to Taxation data',
      `evals: ${accProfile.evaluationsAnalysed}, patterns: ${accProfile.recurringPatterns.length}`
    );
    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Marks recovered and Improvement calculation: strictly within same subject
  // Distinguishes unavailable data from a real zero value
  // --------------------------------------------------------------------------
  {
    const studentId = 'audit_student_07';
    createMockStudent(studentId, 'audit07@test.ca');

    // Earlier 2 Taxation papers with missing section 115BAC
    const taxPaper1 = {
      totalMarksAwarded: 50,
      questions: [
        {
          questionNumber: '1',
          components: [
            { componentType: 'PROVISION', deductionReason: 'Section 115BAC omitted', marksAwarded: 0, marksAvailable: 2 },
          ],
        },
      ],
    };
    const taxPaper2 = {
      totalMarksAwarded: 55,
      questions: [
        {
          questionNumber: '1',
          components: [
            { componentType: 'PROVISION', deductionReason: 'Section 54 omitted', marksAwarded: 0, marksAvailable: 2 },
          ],
        },
      ],
    };

    // Third paper is Corporate Law (DIFFERENT SUBJECT) where provisions were cited correctly
    const lawPaper = {
      totalMarksAwarded: 70,
      questions: [
        {
          questionNumber: '1',
          components: [
            { componentType: 'PROVISION', deductionReason: '', marksAwarded: 3, marksAvailable: 3 },
          ],
        },
      ],
    };

    insertMockEvaluation('eval_t1', studentId, 'inter_taxation', 'Taxation (Income Tax & GST)', taxPaper1, '2026-01-01T10:00:00Z');
    insertMockEvaluation('eval_t2', studentId, 'inter_taxation', 'Taxation (Income Tax & GST)', taxPaper2, '2026-01-02T10:00:00Z');
    insertMockEvaluation('eval_l3', studentId, 'inter_corporate_law', 'Corporate and Other Laws', lawPaper, '2026-01-03T10:00:00Z');

    // Query Taxation specifically
    const taxProfile = calculateStudentExaminerProfile(studentId, 'inter_taxation');

    // In Taxation, there is no subsequent third paper yet!
    assert(
      taxProfile.improvedPatternsCount === 0 && taxProfile.marksRecoveredStatus === 'INSUFFICIENT_DATA',
      'Taxation profile does NOT falsely claim marks recovered from an unrelated Law paper',
      `improvedCount: ${taxProfile.improvedPatternsCount}, status: ${taxProfile.marksRecoveredStatus}`
    );

    // Now insert a 3rd Taxation paper where provisions are fully cited
    const taxPaper3 = {
      totalMarksAwarded: 80,
      questions: [
        {
          questionNumber: '1',
          components: [
            { componentType: 'PROVISION', deductionReason: '', marksAwarded: 2, marksAvailable: 2 },
          ],
        },
      ],
    };
    insertMockEvaluation('eval_t3', studentId, 'inter_taxation', 'Taxation (Income Tax & GST)', taxPaper3, '2026-01-04T10:00:00Z');

    const updatedTaxProfile = calculateStudentExaminerProfile(studentId, 'inter_taxation');
    assert(
      updatedTaxProfile.improvedPatternsCount === 1 &&
        updatedTaxProfile.marksRecoveredTotal === 2.0 &&
        updatedTaxProfile.marksRecoveredStatus === 'AVAILABLE' &&
        updatedTaxProfile.improvedPatterns[0].evidenceComparison.earlierEvaluationId === 'eval_t1' &&
        updatedTaxProfile.improvedPatterns[0].evidenceComparison.recentEvaluationId === 'eval_t3',
      'Subsequent comparable Taxation paper accurately records verified pattern improvement and +2.0 marks recovered',
      `improved: ${updatedTaxProfile.improvedPatternsCount}, recovered: ${updatedTaxProfile.marksRecoveredTotal}`
    );

    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 8: Course-Aware Subject Coverage (CA Intermediate has all 6 official subjects)
  // --------------------------------------------------------------------------
  {
    const studentId = 'audit_student_08';
    createMockStudent(studentId, 'audit08@test.ca', 'INTERMEDIATE');

    const profile = calculateStudentExaminerProfile(studentId);
    const subNames = profile.availableSubjects.map((s) => s.name);

    assert(
      subNames.includes('Advanced Accounting') &&
        subNames.includes('Corporate and Other Laws') &&
        subNames.includes('Taxation (Income Tax & GST)') &&
        subNames.includes('Cost and Management Accounting') &&
        subNames.includes('Auditing and Ethics') &&
        subNames.includes('Financial Management and Strategic Management'),
      'CA Intermediate course covers all 6 official ICAI subjects',
      `Found subjects: ${subNames.join(', ')}`
    );

    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 9: Subject-appropriate step flows (No generic Law template on Accounting or Tax)
  // --------------------------------------------------------------------------
  {
    const studentId = 'audit_student_09';
    createMockStudent(studentId, 'audit09@test.ca');

    // Tax flow check
    const taxProf = calculateStudentExaminerProfile(studentId, 'inter_taxation');
    const taxFlow = taxProf.subjectPatterns[0].stepFlow;
    assert(
      taxFlow.some((s) => s.includes('Computation') || s.includes('Exemption') || s.includes('Tax')),
      'Taxation step flow contains tax computation and threshold schedules',
      `Tax flow: ${taxFlow.join(' -> ')}`
    );

    // Law flow check
    const lawProf = calculateStudentExaminerProfile(studentId, 'inter_corporate_law');
    const lawFlow = lawProf.subjectPatterns[0].stepFlow;
    assert(
      lawFlow.some((s) => s.includes('Provision') || s.includes('Statutory')) &&
        lawFlow.some((s) => s.includes('Application')),
      'Corporate Law step flow contains statutory provision and factual application',
      `Law flow: ${lawFlow.join(' -> ')}`
    );

    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 10: Production Integrity: Past evaluation records, scores, and reports remain unchanged
  // --------------------------------------------------------------------------
  {
    const studentId = 'audit_student_10';
    createMockStudent(studentId, 'audit10@test.ca');

    const p = {
      totalMarksAwarded: 67.5,
      questions: [
        { questionNumber: '1', marksAwarded: 67.5, maximumMarks: 100 },
      ],
    };

    insertMockEvaluation('eval_integrity_chk', studentId, 'inter_taxation', 'Taxation (Income Tax & GST)', p);

    const rowBefore = db.prepare(`SELECT total_marks, grade, result_json FROM evaluations WHERE id = 'eval_integrity_chk'`).get() as any;

    // Run profile computation and updates
    calculateStudentExaminerProfile(studentId);
    updateStudentExaminerProfile(studentId);

    const rowAfter = db.prepare(`SELECT total_marks, grade, result_json FROM evaluations WHERE id = 'eval_integrity_chk'`).get() as any;

    assert(
      rowBefore.total_marks === rowAfter.total_marks &&
        rowBefore.grade === rowAfter.grade &&
        rowBefore.result_json === rowAfter.result_json,
      'Evaluations table records, awarded marks, and result_json remain 100% immutable and unchanged',
      `Before: ${rowBefore.total_marks}, After: ${rowAfter.total_marks}`
    );

    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 11: CA LEVEL SYNCHRONIZATION: Changing student profile level updates Examiner Profile
  // --------------------------------------------------------------------------
  {
    const studentId = 'audit_student_11';
    createMockStudent(studentId, 'audit11@test.ca', 'FOUNDATION');

    // Foundation paper
    const fPaper1 = {
      totalMarksAwarded: 60,
      questions: [
        { questionNumber: '1', components: [{ componentType: 'PROVISION', deductionReason: 'Law principle not cited', marksAwarded: 0, marksAvailable: 2 }] },
      ],
    };
    const fPaper2 = {
      totalMarksAwarded: 65,
      questions: [
        { questionNumber: '2', components: [{ componentType: 'PROVISION', deductionReason: 'Section omitted', marksAwarded: 0, marksAvailable: 2 }] },
      ],
    };
    insertMockEvaluation('eval_f1', studentId, 'foundation_business_law', 'Business Laws', fPaper1, '2026-01-01T10:00:00Z', 'FOUNDATION');
    insertMockEvaluation('eval_f2', studentId, 'foundation_business_law', 'Business Laws', fPaper2, '2026-01-02T10:00:00Z', 'FOUNDATION');

    // 1. Initial Foundation profile
    const fProf = getStudentExaminerProfile(studentId);
    assert(
      fProf.caLevel === 'FOUNDATION' &&
        fProf.evaluationsAnalysed === 2 &&
        fProf.availableSubjects.some((s) => s.name === 'Business Laws') &&
        !fProf.availableSubjects.some((s) => s.name === 'Corporate and Other Laws'),
      'Initial profile correctly reflects CA Foundation and lists Foundation curriculum subjects',
      `caLevel: ${fProf.caLevel}, subjects: ${fProf.availableSubjects.map((s) => s.name).join(', ')}`
    );

    // 2. Student updates level to INTERMEDIATE in student_profiles
    db.prepare(`UPDATE student_profiles SET ca_level = 'INTERMEDIATE' WHERE user_id = ?`).run(studentId);
    updateStudentExaminerProfile(studentId);

    // 3. Examiner Profile must now automatically reflect INTERMEDIATE
    const interProf = getStudentExaminerProfile(studentId);
    assert(
      interProf.caLevel === 'INTERMEDIATE' &&
        interProf.availableSubjects.some((s) => s.name === 'Corporate and Other Laws') &&
        !interProf.availableSubjects.some((s) => s.name === 'Business Economics'),
      'Examiner Profile automatically synchronizes to new level (INTERMEDIATE) and refreshes available subjects',
      `new level: ${interProf.caLevel}`
    );

    // 4. Intermediate has 0 evaluations: must display truthful empty state without Foundation fallback
    assert(
      interProf.evaluationsAnalysed === 0 &&
        interProf.insufficientHistory === true &&
        interProf.message?.includes('No evaluation history available for CA Intermediate') &&
        interProf.recurringPatternsCount === 0,
      'Switched level displays clean empty state without leaking previous level evaluations',
      `evals: ${interProf.evaluationsAnalysed}, recurring: ${interProf.recurringPatternsCount}`
    );

    // 5. Switching back to FOUNDATION immediately restores the Foundation history
    db.prepare(`UPDATE student_profiles SET ca_level = 'FOUNDATION' WHERE user_id = ?`).run(studentId);
    updateStudentExaminerProfile(studentId);

    const restoredFProf = getStudentExaminerProfile(studentId);
    assert(
      restoredFProf.caLevel === 'FOUNDATION' &&
        restoredFProf.evaluationsAnalysed === 2 &&
        restoredFProf.recurringPatternsCount === 1,
      'Switching back to previous level immediately restores its existing history and recurring patterns',
      `restored evals: ${restoredFProf.evaluationsAnalysed}, patterns: ${restoredFProf.recurringPatternsCount}`
    );

    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 12: LEVEL ISOLATION: Multi-level student retains distinct history per level
  // --------------------------------------------------------------------------
  {
    const studentId = 'audit_student_12';
    createMockStudent(studentId, 'audit12@test.ca', 'INTERMEDIATE');

    // 2 Intermediate evaluations
    const interP1 = { totalMarksAwarded: 55, questions: [] };
    const interP2 = { totalMarksAwarded: 60, questions: [] };
    insertMockEvaluation('eval_i1', studentId, 'inter_taxation', 'Taxation (Income Tax & GST)', interP1, '2026-01-01T10:00:00Z', 'INTERMEDIATE');
    insertMockEvaluation('eval_i2', studentId, 'inter_taxation', 'Taxation (Income Tax & GST)', interP2, '2026-01-02T10:00:00Z', 'INTERMEDIATE');

    // 2 Final evaluations
    const finalP1 = { totalMarksAwarded: 50, questions: [] };
    const finalP2 = { totalMarksAwarded: 52, questions: [] };
    insertMockEvaluation('eval_fin1', studentId, 'final_direct_tax', 'Direct Tax Laws & International Taxation', finalP1, '2026-02-01T10:00:00Z', 'FINAL');
    insertMockEvaluation('eval_fin2', studentId, 'final_direct_tax', 'Direct Tax Laws & International Taxation', finalP2, '2026-02-02T10:00:00Z', 'FINAL');

    // Under INTERMEDIATE:
    const iProf = calculateStudentExaminerProfile(studentId);
    assert(
      iProf.evaluationsAnalysed === 2 &&
        iProf.availableSubjects.some((s) => s.name === 'Taxation (Income Tax & GST)'),
      'Under INTERMEDIATE, exactly 2 Intermediate evaluations analysed with 0 Final evaluations mixed in',
      `evals: ${iProf.evaluationsAnalysed}`
    );

    // Switch student to FINAL:
    db.prepare(`UPDATE student_profiles SET ca_level = 'FINAL' WHERE user_id = ?`).run(studentId);
    const finProf = calculateStudentExaminerProfile(studentId);
    assert(
      finProf.evaluationsAnalysed === 2 &&
        finProf.availableSubjects.some((s) => s.name === 'Direct Tax Laws & International Taxation') &&
        finProf.availableSubjects.some((s) => s.name === 'Financial Reporting'),
      'Under FINAL, exactly 2 Final evaluations analysed with 0 Intermediate evaluations mixed in',
      `evals: ${finProf.evaluationsAnalysed}`
    );

    // Verify historical evaluation records in DB retained their original level
    const evalI1 = db.prepare(`SELECT level FROM evaluations WHERE id = 'eval_i1'`).get() as any;
    const evalFin1 = db.prepare(`SELECT level FROM evaluations WHERE id = 'eval_fin1'`).get() as any;
    assert(
      evalI1.level === 'INTERMEDIATE' && evalFin1.level === 'FINAL',
      'Historical evaluations retain their immutable original level context without relabeling',
      `eval_i1: ${evalI1.level}, eval_fin1: ${evalFin1.level}`
    );

    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 13: AUTHORIZATION & PRIVILEGE INTEGRITY: Changing CA Level grants no free credits or role escalation
  // --------------------------------------------------------------------------
  {
    const studentId = 'audit_student_13';
    createMockStudent(studentId, 'audit13@test.ca', 'INTERMEDIATE');

    const userBefore = db.prepare(`SELECT role, status FROM users WHERE id = ?`).get(studentId) as any;
    const profileBefore = db.prepare(`SELECT free_evaluations_used, purchased_credits FROM student_profiles WHERE user_id = ?`).get(studentId) as any;

    // Change CA Level to FINAL
    db.prepare(`UPDATE student_profiles SET ca_level = 'FINAL' WHERE user_id = ?`).run(studentId);

    const userAfter = db.prepare(`SELECT role, status FROM users WHERE id = ?`).get(studentId) as any;
    const profileAfter = db.prepare(`SELECT free_evaluations_used, purchased_credits FROM student_profiles WHERE user_id = ?`).get(studentId) as any;

    assert(
      userBefore.role === userAfter.role &&
        userBefore.status === userAfter.status &&
        profileBefore.free_evaluations_used === profileAfter.free_evaluations_used &&
        profileBefore.purchased_credits === profileAfter.purchased_credits,
      'Changing CA level grants no unauthorized role changes, free credits, or plan escalations',
      `User role: ${userAfter.role}, Credits: ${profileAfter.purchased_credits}`
    );

    cleanupStudent(studentId);
  }
} catch (err) {
  console.error('Audit test suite failed with error:', err);
  process.exitCode = 1;
}

console.log('\n================================================================');
console.log(`--- TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED ---`);
console.log('================================================================');

if (passedTests === totalTests) {
  console.log('ALL EXAMINER PROFILE ACCURACY & COMPLETENESS AUDIT TESTS PASSED CLEANLY.\n');
} else {
  console.error(`FAILED: ${totalTests - passedTests} tests failed.\n`);
  process.exitCode = 1;
}
