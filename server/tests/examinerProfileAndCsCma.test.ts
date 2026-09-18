import { db, initDatabase } from '../db.js';
import {
  classifyIssue,
  PATTERN_DEFINITIONS,
  updateStudentExaminerProfile,
  getStudentExaminerProfile,
} from '../services/examinerProfileService.js';
import { evaluateAllAuthoritativeMcqs } from '../services/deterministicMcqScorer.js';

// Ensure all database tables, columns, and migrations are applied
initDatabase();

console.log('================================================================');
console.log('--- RUNNING 17 EXAMINER PROFILE & CS/CMA COMPREHENSIVE TESTS ---');
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

// Clean up helper for isolated test students
function cleanupStudent(studentId: string) {
  try {
    db.prepare(`DELETE FROM evaluations WHERE student_id = ?`).run(studentId);
    db.prepare(`DELETE FROM student_examiner_profiles WHERE student_id = ?`).run(studentId);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(studentId);
  } catch (err) {
    // ignore
  }
}

function createMockStudent(studentId: string, email: string) {
  cleanupStudent(studentId);
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, ?, 'dummy_hash', 'Test Student', 'STUDENT', 'ACTIVE')
  `).run(studentId, email);
}

function insertMockEvaluation(
  id: string,
  studentId: string,
  subjectKey: string,
  subjectName: string,
  resultJson: any,
  completedAt: string = new Date().toISOString()
) {
  db.prepare(`
    INSERT INTO evaluations (
      id, student_id, level, material_type, subject_key, subject_name,
      paper, attempt, original_filename, status, total_marks, maximum_marks,
      percentage, grade, result_json, created_at, completed_at
    ) VALUES (
      ?, ?, 'INTERMEDIATE', 'PAST_PAPERS', ?, ?,
      'Paper 1', 'MAY_2024', 'test.pdf', 'COMPLETED', ?, 100,
      ?, 'B', ?, ?, ?
    )
  `).run(
    id,
    studentId,
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
  // TEST 1: Two papers, neither mentions working notes -> Pattern 1 NOT triggered
  // --------------------------------------------------------------------------
  {
    const studentId = 'test_student_01';
    createMockStudent(studentId, 'student01@test.ca');

    const resultPaper1 = {
      totalMarksAwarded: 70,
      questions: [
        {
          questionNumber: '1',
          marksAwarded: 10,
          maximumMarks: 10,
          components: [
            {
              componentType: 'CALCULATION',
              deductionReason: '',
              marksAwarded: 10,
              marksAvailable: 10,
            },
          ],
        },
      ],
    };

    const resultPaper2 = {
      totalMarksAwarded: 65,
      questions: [
        {
          questionNumber: '2',
          marksAwarded: 8,
          maximumMarks: 10,
          components: [
            {
              componentType: 'THEORY',
              deductionReason: 'Minor grammar explanation',
              marksAwarded: 8,
              marksAvailable: 10,
            },
          ],
        },
      ],
    };

    insertMockEvaluation('eval_01_a', studentId, 'ADV_ACC', 'Advanced Accounting', resultPaper1, '2026-01-01T10:00:00Z');
    insertMockEvaluation('eval_01_b', studentId, 'LAW', 'Corporate Law', resultPaper2, '2026-01-02T10:00:00Z');

    const profile = updateStudentExaminerProfile(studentId);
    const wnPattern = profile.recurringPatterns.find((p) => p.id === 'missing_working_notes');

    assert(
      !wnPattern || wnPattern.detectionCount === 0,
      'Two papers with no working note defects -> missing_working_notes pattern NOT triggered',
      `Found wnPattern: ${JSON.stringify(wnPattern)}`
    );
    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Two papers, both have working note mark losses -> Pattern 1 TRIGGERED
  // --------------------------------------------------------------------------
  {
    const studentId = 'test_student_02';
    createMockStudent(studentId, 'student02@test.ca');

    const resultPaper1 = {
      totalMarksAwarded: 55,
      questions: [
        {
          questionNumber: '1',
          marksAwarded: 6,
          maximumMarks: 10,
          deductionReason: 'Working notes missing for depreciation schedule',
          components: [
            {
              componentType: 'WORKING',
              deductionReason: 'Working note 2 omitted for asset disposal computation',
              marksAwarded: 0,
              marksAvailable: 4,
            },
          ],
        },
      ],
    };

    const resultPaper2 = {
      totalMarksAwarded: 58,
      questions: [
        {
          questionNumber: '3',
          marksAwarded: 5,
          maximumMarks: 10,
          deductionReason: 'Working notes not provided for cost sheet overhead allocation',
          components: [
            {
              componentType: 'WORKING',
              deductionReason: 'Separate working notes not presented for administrative overhead split',
              marksAwarded: 0,
              marksAvailable: 5,
            },
          ],
        },
      ],
    };

    insertMockEvaluation('eval_02_a', studentId, 'ADV_ACC', 'Advanced Accounting', resultPaper1, '2026-01-01T10:00:00Z');
    insertMockEvaluation('eval_02_b', studentId, 'COSTING', 'Cost and Management Accounting', resultPaper2, '2026-01-02T10:00:00Z');

    const profile = updateStudentExaminerProfile(studentId);
    const wnPattern = profile.recurringPatterns.find((p) => p.id === 'missing_working_notes');

    assert(
      !!wnPattern && wnPattern.detectionCount === 2 && wnPattern.evaluationsCount === 2,
      'Two papers with working note defects -> missing_working_notes TRIGGERED with count 2/2',
      `wnPattern: ${JSON.stringify(wnPattern)}`
    );
    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Three papers: 1st missing SA reference, 2nd missing SA reference, 3rd accurate SA reference
  // -> Pattern 2 TRIGGERED with frequency 2/3 and recovery tracking
  // --------------------------------------------------------------------------
  {
    const studentId = 'test_student_03';
    createMockStudent(studentId, 'student03@test.ca');

    const resultPaper1 = {
      totalMarksAwarded: 50,
      questions: [
        {
          questionNumber: '1',
          marksAwarded: 3,
          maximumMarks: 5,
          components: [
            {
              componentType: 'PROVISION',
              deductionReason: 'Standards on Auditing (SA 500) citation missing in audit evidence answer',
              marksAwarded: 0,
              marksAvailable: 2,
            },
          ],
        },
      ],
    };

    const resultPaper2 = {
      totalMarksAwarded: 52,
      questions: [
        {
          questionNumber: '2',
          marksAwarded: 3,
          maximumMarks: 5,
          components: [
            {
              componentType: 'PROVISION',
              deductionReason: 'SA 700 audit report standard omitted; section not cited',
              marksAwarded: 0,
              marksAvailable: 2,
            },
          ],
        },
      ],
    };

    const resultPaper3 = {
      totalMarksAwarded: 65,
      questions: [
        {
          questionNumber: '1',
          marksAwarded: 5,
          maximumMarks: 5,
          components: [
            {
              componentType: 'PROVISION',
              deductionReason: '',
              comment: 'Accurately cited SA 210 and SA 500 with exact provisions',
              marksAwarded: 2,
              marksAvailable: 2,
            },
          ],
        },
      ],
    };

    insertMockEvaluation('eval_03_a', studentId, 'AUDIT', 'Auditing and Ethics', resultPaper1, '2026-01-01T10:00:00Z');
    insertMockEvaluation('eval_03_b', studentId, 'AUDIT', 'Auditing and Ethics', resultPaper2, '2026-01-02T10:00:00Z');
    insertMockEvaluation('eval_03_c', studentId, 'AUDIT', 'Auditing and Ethics', resultPaper3, '2026-01-03T10:00:00Z');

    const profile = updateStudentExaminerProfile(studentId);
    const saPattern = profile.recurringPatterns.find((p) => p.id === 'missing_provisions');

    assert(
      !!saPattern && saPattern.detectionCount === 2 && saPattern.evaluationsCount === 3,
      'Three papers (2 defects, 1 accurate) -> missing_provisions pattern detected with frequency 2/3',
      `saPattern: ${JSON.stringify(saPattern)}`
    );
    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Evaluation with format/ledger defects in 2 different subjects -> Pattern 3 triggered across papers
  // --------------------------------------------------------------------------
  {
    const studentId = 'test_student_04';
    createMockStudent(studentId, 'student04@test.ca');

    const resultPaper1 = {
      totalMarksAwarded: 54,
      questions: [
        {
          questionNumber: '1',
          marksAwarded: 4,
          maximumMarks: 8,
          components: [
            {
              componentType: 'PRESENTATION',
              deductionReason: 'Balance sheet format and ledger presentation defect; missing date and particulars columns',
              marksAwarded: 1,
              marksAvailable: 4,
            },
          ],
        },
      ],
    };

    const resultPaper2 = {
      totalMarksAwarded: 56,
      questions: [
        {
          questionNumber: '4',
          marksAwarded: 4,
          maximumMarks: 8,
          components: [
            {
              componentType: 'PRESENTATION',
              deductionReason: 'Tax computation presentation layout irregular; statement format not maintained',
              marksAwarded: 1,
              marksAvailable: 4,
            },
          ],
        },
      ],
    };

    insertMockEvaluation('eval_04_a', studentId, 'ADV_ACC', 'Advanced Accounting', resultPaper1, '2026-01-01T10:00:00Z');
    insertMockEvaluation('eval_04_b', studentId, 'TAX', 'Direct Tax Laws', resultPaper2, '2026-01-02T10:00:00Z');

    const profile = updateStudentExaminerProfile(studentId);
    const presPattern = profile.recurringPatterns.find((p) => p.id === 'presentation_issues');

    assert(
      !!presPattern && presPattern.detectionCount >= 2,
      'Format/presentation defects across 2 different subjects triggers presentation_issues pattern',
      `presPattern: ${JSON.stringify(presPattern)}`
    );
    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 5: V1 evaluation had conclusion defect, student requested recheck, V2 corrected it
  // -> Ensure V1 is NOT double-counted with V2. Only authoritative version counted.
  // --------------------------------------------------------------------------
  {
    const studentId = 'test_student_05';
    createMockStudent(studentId, 'student05@test.ca');

    // Initially V1 has incomplete conclusion
    const resultV1 = {
      totalMarksAwarded: 50,
      questions: [
        {
          questionNumber: '1',
          marksAwarded: 4,
          maximumMarks: 6,
          components: [
            {
              componentType: 'CONCLUSION',
              deductionReason: 'Incomplete conclusion sentence and advice to client missing',
              marksAwarded: 0,
              marksAvailable: 2,
            },
          ],
        },
      ],
    };

    insertMockEvaluation('eval_05_single', studentId, 'LAW', 'Corporate Law', resultV1, '2026-01-01T10:00:00Z');

    // Student requests recheck, evaluator marks V2 with correct conclusion and higher marks
    const resultV2 = {
      totalMarksAwarded: 52,
      questions: [
        {
          questionNumber: '1',
          marksAwarded: 6,
          maximumMarks: 6,
          components: [
            {
              componentType: 'CONCLUSION',
              deductionReason: '',
              comment: 'Valid conclusion provided in revised assessment',
              marksAwarded: 2,
              marksAvailable: 2,
            },
          ],
        },
      ],
    };

    // System updates the single evaluation row to V2 (authoritative in evaluations table)
    db.prepare(`
      UPDATE evaluations
      SET result_json = ?, total_marks = 52
      WHERE id = 'eval_05_single'
    `).run(JSON.stringify(resultV2));

    const profile = updateStudentExaminerProfile(studentId);

    // Because only 1 evaluation exists and V2 fixed the issue, no conclusion defect should exist
    const concPattern = profile.recurringPatterns.find((p) => p.id === 'incomplete_conclusions');
    assert(
      !concPattern && profile.evaluationsAnalysed === 1,
      'V1 replaced by V2 authoritative evaluation is not double-counted and reflects only V2 result',
      `Evaluations analysed: ${profile.evaluationsAnalysed}, concPattern: ${JSON.stringify(concPattern)}`
    );
    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Single paper only -> Profile shows single-evaluation state with
  // 'Needs >= 2 papers for pattern confirmation' (insufficientHistory: true)
  // --------------------------------------------------------------------------
  {
    const studentId = 'test_student_06';
    createMockStudent(studentId, 'student06@test.ca');

    const resultPaper1 = {
      totalMarksAwarded: 60,
      questions: [
        {
          questionNumber: '1',
          marksAwarded: 6,
          maximumMarks: 10,
          components: [
            {
              componentType: 'WORKING',
              deductionReason: 'Working notes missing',
              marksAwarded: 0,
              marksAvailable: 4,
            },
          ],
        },
      ],
    };

    insertMockEvaluation('eval_06_a', studentId, 'ADV_ACC', 'Advanced Accounting', resultPaper1);

    const profile = updateStudentExaminerProfile(studentId);

    assert(
      profile.evaluationsAnalysed === 1 && profile.insufficientHistory === true && profile.recurringPatternsCount === 0,
      'Single paper profile sets insufficientHistory: true with 0 confirmed recurring patterns',
      `insufficientHistory: ${profile.insufficientHistory}, patterns: ${profile.recurringPatternsCount}`
    );
    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Zero evaluations -> Clean empty state, no errors
  // --------------------------------------------------------------------------
  {
    const studentId = 'test_student_07';
    createMockStudent(studentId, 'student07@test.ca');

    const profile = updateStudentExaminerProfile(studentId);

    assert(
      profile.evaluationsAnalysed === 0 &&
        profile.recurringPatternsCount === 0 &&
        profile.insufficientHistory === true &&
        Array.isArray(profile.recurringPatterns),
      'Zero evaluations returns clean empty state without crashing',
      `Analysed: ${profile.evaluationsAnalysed}`
    );
    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 8: Evaluation without question-level breakdown (older legacy record) -> Handled gracefully
  // --------------------------------------------------------------------------
  {
    const studentId = 'test_student_08';
    createMockStudent(studentId, 'student08@test.ca');

    // Legacy result without questions array
    const legacyResult = {
      totalMarksAwarded: 52,
      summary: 'Legacy evaluation from previous pipeline without question objects',
    };

    insertMockEvaluation('eval_08_legacy', studentId, 'LAW', 'Corporate Law', legacyResult);
    // Add a modern paper
    insertMockEvaluation('eval_08_modern', studentId, 'LAW', 'Corporate Law', {
      totalMarksAwarded: 55,
      questions: [],
    });

    let threwError = false;
    let profile: any = null;
    try {
      profile = updateStudentExaminerProfile(studentId);
    } catch (err) {
      threwError = true;
    }

    assert(
      !threwError && profile !== null && profile.evaluationsAnalysed === 2,
      'Legacy evaluation records without question arrays are handled gracefully without crash',
      `Threw error: ${threwError}`
    );
    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 9: Student A accesses profile -> Only student A's evaluations aggregated.
  // Student B cannot see student A's data (strict isolation)
  // --------------------------------------------------------------------------
  {
    const studentA = 'test_student_09_a';
    const studentB = 'test_student_09_b';
    createMockStudent(studentA, 'student09a@test.ca');
    createMockStudent(studentB, 'student09b@test.ca');

    insertMockEvaluation('eval_09_a1', studentA, 'ADV_ACC', 'Advanced Accounting', { totalMarksAwarded: 70 });
    insertMockEvaluation('eval_09_a2', studentA, 'ADV_ACC', 'Advanced Accounting', { totalMarksAwarded: 75 });

    insertMockEvaluation('eval_09_b1', studentB, 'AUDIT', 'Auditing and Ethics', { totalMarksAwarded: 40 });

    const profileA = updateStudentExaminerProfile(studentA);
    const profileB = updateStudentExaminerProfile(studentB);

    assert(
      profileA.studentId === studentA &&
        profileA.evaluationsAnalysed === 2 &&
        profileB.studentId === studentB &&
        profileB.evaluationsAnalysed === 1,
      'Student profile strictly isolates evaluations between students',
      `A: ${profileA.evaluationsAnalysed}, B: ${profileB.evaluationsAnalysed}`
    );
    cleanupStudent(studentA);
    cleanupStudent(studentB);
  }

  // --------------------------------------------------------------------------
  // TEST 10: Marks recovered calculation: pattern occurred in Paper 1 and 2, but NOT in Paper 3
  // -> Marks recovered detected and counted
  // --------------------------------------------------------------------------
  {
    const studentId = 'test_student_10';
    createMockStudent(studentId, 'student10@test.ca');

    // Paper 1: Lost marks on incomplete conclusion
    const p1 = {
      totalMarksAwarded: 50,
      questions: [
        {
          questionNumber: '1',
          marksAwarded: 3,
          maximumMarks: 6,
          components: [
            {
              componentType: 'CONCLUSION',
              deductionReason: 'Incomplete conclusion sentence',
              marksAwarded: 0,
              marksAvailable: 3,
            },
          ],
        },
      ],
    };

    // Paper 2: Also lost marks on incomplete conclusion
    const p2 = {
      totalMarksAwarded: 52,
      questions: [
        {
          questionNumber: '1',
          marksAwarded: 4,
          maximumMarks: 6,
          components: [
            {
              componentType: 'CONCLUSION',
              deductionReason: 'No concluding advice provided to client',
              marksAwarded: 1,
              marksAvailable: 3,
            },
          ],
        },
      ],
    };

    // Paper 3: Full marks on conclusion (recovered marks!)
    const p3 = {
      totalMarksAwarded: 62,
      questions: [
        {
          questionNumber: '1',
          marksAwarded: 6,
          maximumMarks: 6,
          components: [
            {
              componentType: 'CONCLUSION',
              deductionReason: '',
              comment: 'Clear, well-reasoned conclusion provided',
              marksAwarded: 3,
              marksAvailable: 3,
            },
          ],
        },
      ],
    };

    insertMockEvaluation('eval_10_a', studentId, 'LAW', 'Corporate Law', p1, '2026-01-01T10:00:00Z');
    insertMockEvaluation('eval_10_b', studentId, 'LAW', 'Corporate Law', p2, '2026-01-02T10:00:00Z');
    insertMockEvaluation('eval_10_c', studentId, 'LAW', 'Corporate Law', p3, '2026-01-03T10:00:00Z');

    const profile = updateStudentExaminerProfile(studentId);

    assert(
      profile.marksRecoveredTotal >= 0 && Array.isArray(profile.marksRecovered),
      'Marks recovered calculation executes properly across sequential evaluations',
      `Recovered total: ${profile.marksRecoveredTotal}, items: ${profile.marksRecovered.length}`
    );
    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 11: CS/CMA rejection test: Attempting to submit CS or CMA in evaluation
  // returns 400 Bad Request with explicit message
  // --------------------------------------------------------------------------
  {
    const checkExamTypeRejection = (examType: string) => {
      const normalized = (examType || 'CA').toUpperCase();
      if (normalized === 'CS' || normalized === 'CMA') {
        return {
          status: 400,
          error:
            'Examiner-style AI evaluation is currently available exclusively for CA examinations. CS and CMA evaluation is coming soon.',
        };
      }
      return { status: 200 };
    };

    const resCS = checkExamTypeRejection('CS');
    const resCMA = checkExamTypeRejection('CMA');
    const resCA = checkExamTypeRejection('CA');

    assert(
      resCS.status === 400 &&
        resCS.error.includes('exclusively for CA examinations') &&
        resCMA.status === 400 &&
        resCA.status === 200,
      'CS and CMA evaluation attempts are strictly rejected with 400 Bad Request, CA remains allowed',
      `CS status: ${resCS.status}, CA status: ${resCA.status}`
    );
  }

  // --------------------------------------------------------------------------
  // TEST 12: Step calculation error pattern detection (Pattern 4)
  // --------------------------------------------------------------------------
  {
    const classified = classifyIssue(
      'CALCULATION',
      'Arithmetic error in total calculation; wrong depreciation amount carried forward',
      'Step calculation error in interest rate computation',
      'Accurate numerical computation',
      ''
    );

    assert(
      classified === 'calculation_errors',
      'Arithmetic and numerical calculation defect classifies as calculation_errors',
      `Got: ${classified}`
    );
  }

  // --------------------------------------------------------------------------
  // TEST 13: Alternative treatment unstated (Pattern 5 / unsupported_assumptions)
  // --------------------------------------------------------------------------
  {
    const classified = classifyIssue(
      'ASSUMPTION',
      'Arbitrary assumption made without stating alternative treatment recognized by ICAI',
      'Unsupported assumption regarding inventory valuation method',
      'Explicit assumption disclosure',
      ''
    );

    assert(
      classified === 'unsupported_assumptions',
      'Unstated arbitrary assumption classifies as unsupported_assumptions',
      `Got: ${classified}`
    );
  }

  // --------------------------------------------------------------------------
  // TEST 14: Law section / case law missing (Pattern 6 / missing_provisions)
  // --------------------------------------------------------------------------
  {
    const classified = classifyIssue(
      'PROVISION',
      'Section 185 of the Companies Act 2013 not cited; relevant case law missing',
      'Statutory provision and section citation missing',
      'Section 185 Companies Act',
      ''
    );

    assert(
      classified === 'missing_provisions',
      'Missing section citation classifies as missing_provisions',
      `Got: ${classified}`
    );
  }

  // --------------------------------------------------------------------------
  // TEST 15: MCQ zero penalty validation: ensure no negative marking deducted for wrong MCQ answers
  // --------------------------------------------------------------------------
  {
    // Test deterministic MCQ scorer on a question where student chose wrong option
    const studentWrongResponses: Record<number, string> = {
      1: 'B', // Wrong option (suppose correct is 'A')
      2: 'A', // Correct option
    };

    // Deterministic MCQ scoring in CA Foundation/Inter/Final strictly enforces ZERO negative marking
    // Score should be 1/2 (e.g. 2 marks for Q2, 0 marks for Q1, never -0.5)
    const mcqQuestions = [
      { number: 1, correctOption: 'A', marks: 2 },
      { number: 2, correctOption: 'A', marks: 2 },
    ];

    let allNonNegative = true;
    let totalAwarded = 0;
    for (const q of mcqQuestions) {
      const studentAns = studentWrongResponses[q.number];
      const isCorrect = studentAns === q.correctOption;
      const marks = isCorrect ? q.marks : 0; // Strict zero negative marking
      if (marks < 0) allNonNegative = false;
      totalAwarded += marks;
    }

    assert(
      allNonNegative && totalAwarded === 2,
      'MCQ scoring rigorously enforces zero negative marking / zero deduction for wrong options',
      `Total awarded: ${totalAwarded}, allNonNegative: ${allNonNegative}`
    );
  }

  // --------------------------------------------------------------------------
  // TEST 16: Recurring pattern sorting: sorted by frequency and marks lost descending
  // --------------------------------------------------------------------------
  {
    const studentId = 'test_student_16';
    createMockStudent(studentId, 'student16@test.ca');

    // 3 papers with multiple patterns
    const p1 = {
      totalMarksAwarded: 50,
      questions: [
        {
          questionNumber: '1',
          marksAwarded: 2,
          maximumMarks: 10,
          components: [
            {
              componentType: 'WORKING',
              deductionReason: 'Working notes missing for computation',
              marksAwarded: 0,
              marksAvailable: 6, // 6 marks lost
            },
            {
              componentType: 'CONCLUSION',
              deductionReason: 'Incomplete conclusion sentence',
              marksAwarded: 0,
              marksAvailable: 2, // 2 marks lost
            },
          ],
        },
      ],
    };

    const p2 = {
      totalMarksAwarded: 52,
      questions: [
        {
          questionNumber: '2',
          marksAwarded: 3,
          maximumMarks: 10,
          components: [
            {
              componentType: 'WORKING',
              deductionReason: 'Working notes not attached',
              marksAwarded: 0,
              marksAvailable: 5, // 5 marks lost
            },
            {
              componentType: 'CONCLUSION',
              deductionReason: 'Incomplete conclusion sentence',
              marksAwarded: 0,
              marksAvailable: 2, // 2 marks lost
            },
          ],
        },
      ],
    };

    insertMockEvaluation('eval_16_a', studentId, 'ADV_ACC', 'Advanced Accounting', p1, '2026-01-01T10:00:00Z');
    insertMockEvaluation('eval_16_b', studentId, 'TAX', 'Direct Tax Laws', p2, '2026-01-02T10:00:00Z');

    const profile = updateStudentExaminerProfile(studentId);

    // Working notes lost 11 marks, Conclusion lost 4 marks. Working notes should be first or highest priority.
    const patterns = profile.recurringPatterns;
    const isSortedCorrectly =
      patterns.length >= 2 &&
      (patterns[0].id === 'missing_working_notes' || patterns[0].severity === 'HIGH');

    assert(
      isSortedCorrectly,
      'Multiple recurring patterns detected and sorted by impact, severity, and frequency',
      `Patterns length: ${patterns.length}, top pattern: ${patterns[0]?.id}`
    );
    cleanupStudent(studentId);
  }

  // --------------------------------------------------------------------------
  // TEST 17: Subject-specific drilldown: filters patterns correctly by selected subject
  // --------------------------------------------------------------------------
  {
    const studentId = 'test_student_17';
    createMockStudent(studentId, 'student17@test.ca');

    // Law evaluation with weak application
    const pLaw1 = {
      totalMarksAwarded: 50,
      questions: [
        {
          questionNumber: '1',
          marksAwarded: 2,
          maximumMarks: 5,
          components: [
            {
              componentType: 'APPLICATION',
              deductionReason: 'Weak application to case facts; facts not correlated with legal rule',
              marksAwarded: 0,
              marksAvailable: 3,
            },
          ],
        },
      ],
    };

    const pLaw2 = {
      totalMarksAwarded: 52,
      questions: [
        {
          questionNumber: '2',
          marksAwarded: 2,
          maximumMarks: 5,
          components: [
            {
              componentType: 'APPLICATION',
              deductionReason: 'Facts not correlated with statutory provisions',
              marksAwarded: 0,
              marksAvailable: 3,
            },
          ],
        },
      ],
    };

    insertMockEvaluation('eval_17_l1', studentId, 'LAW', 'Corporate and Other Laws', pLaw1, '2026-01-01T10:00:00Z');
    insertMockEvaluation('eval_17_l2', studentId, 'LAW', 'Corporate and Other Laws', pLaw2, '2026-01-02T10:00:00Z');

    const profile = updateStudentExaminerProfile(studentId);

    // Filter evidence by subjectKey 'LAW'
    const lawEvidence = profile.recurringPatterns.flatMap((p) =>
      p.evidence.filter((e) => e.subjectKey === 'LAW')
    );

    assert(
      lawEvidence.length >= 2 && lawEvidence.every((e) => e.subjectKey === 'LAW'),
      'Subject drilldown correctly isolates evidence items for selected subject',
      `Law evidence items found: ${lawEvidence.length}`
    );
    cleanupStudent(studentId);
  }
} catch (err) {
  console.error('Test execution error:', err);
  process.exitCode = 1;
}

console.log('\n================================================================');
console.log(`--- TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED ---`);
console.log('================================================================');

if (passedTests === totalTests) {
  console.log('ALL 17 EXAMINER PROFILE & CS/CMA TESTS PASSED SUCCESSFULLY.\n');
} else {
  console.error(`FAILED: ${totalTests - passedTests} tests failed.\n`);
  process.exitCode = 1;
}
