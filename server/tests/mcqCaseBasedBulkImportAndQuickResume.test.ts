import assert from 'node:assert';
import crypto from 'node:crypto';
import * as XLSX from 'xlsx';
import db from '../db.js';
import {
  parseCsvText,
  parseXlsxBuffer,
  validateBulkQuestions,
  commitBulkQuestions,
  normalizeHeader,
} from '../services/mcqBulkImportService.js';
import {
  CANONICAL_CURRICULUM_HIERARCHY,
  getCourseSubjects,
  getSubjectChapters,
  getChapterTopics,
  normalizeCourseKey,
} from '../../src/data/caCurriculum.js';

console.log('========================================================================');
console.log('--- TEST SUITE: MCQ CASE-BASED BULK IMPORT & QUICK RESUME MODAL ---');
console.log('========================================================================');

async function runTests() {
  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void) {
    total++;
    try {
      fn();
      passed++;
      console.log(`[PASS] Test ${total}: ${name}`);
    } catch (err: any) {
      console.error(`[FAIL] Test ${total}: ${name}`);
      console.error(err);
      process.exit(1);
    }
  }

  // ========================================================================
  // 1. CANONICAL CURRICULUM & CASCADING METADATA TESTS
  // ========================================================================
  console.log('\n>>> SECTION 1: CANONICAL CURRICULUM & CASCADING METADATA TESTS');

  test('Course normalization handles variants accurately', () => {
    assert.strictEqual(normalizeCourseKey('CA Intermediate'), 'CA_INTERMEDIATE');
    assert.strictEqual(normalizeCourseKey('CA Final'), 'CA_FINAL');
    assert.strictEqual(normalizeCourseKey('CA Foundation'), 'CA_FOUNDATION');
    assert.strictEqual(normalizeCourseKey('CA_INTERMEDIATE'), 'CA_INTERMEDIATE');
  });

  test('Course Subjects depend strictly on selected Course', () => {
    const interSubjects = getCourseSubjects('CA_INTERMEDIATE');
    assert(interSubjects.includes('Corporate and Other Laws'));
    assert(interSubjects.includes('Advanced Accounting'));
    assert(interSubjects.includes('Taxation'));
    // Should NOT include Foundation or Final exclusive subjects
    assert(!interSubjects.includes('Quantitative Aptitude'));
    assert(!interSubjects.includes('Financial Reporting'));

    const foundationSubjects = getCourseSubjects('CA_FOUNDATION');
    assert(foundationSubjects.includes('Quantitative Aptitude'));
    assert(foundationSubjects.includes('Business Economics'));
    assert(!foundationSubjects.includes('Corporate and Other Laws'));
  });

  test('Chapters depend strictly on Course + Subject', () => {
    const lawChapters = getSubjectChapters('CA_INTERMEDIATE', 'Corporate and Other Laws');
    assert(lawChapters.length > 5);
    assert(lawChapters.some((c) => c.includes('Preliminary')));
    assert(lawChapters.some((c) => c.includes('Management and Administration')));
    assert(lawChapters.some((c) => c.includes('Audit and Auditors')));

    // Irrelevant subject returns empty
    const dummy = getSubjectChapters('CA_INTERMEDIATE', 'NonExistentSubject');
    assert.strictEqual(dummy.length, 0);
  });

  test('Topics depend strictly on Course + Subject + Chapter, with "Not Applicable" fallback', () => {
    const topics = getChapterTopics(
      'CA_INTERMEDIATE',
      'Corporate and Other Laws',
      'Management and Administration - Sec 88 to 122'
    );
    assert(topics.includes('Not Applicable'));
    assert(topics.some((t) => t.includes('Annual General Meeting')));

    // Unknown chapter defaults gracefully to ['Not Applicable']
    const unknownTopics = getChapterTopics('CA_INTERMEDIATE', 'Corporate and Other Laws', 'Unknown Chapter');
    assert.deepStrictEqual(unknownTopics, ['Not Applicable']);
  });

  // ========================================================================
  // 2. WORKFLOW SEPARATION & FILE FORMAT TESTS
  // ========================================================================
  console.log('\n>>> SECTION 2: WORKFLOW SEPARATION & FILE PARSING TESTS');

  test('Header normalizer correctly maps standard and messy column names', () => {
    assert.strictEqual(normalizeHeader('Question ID'), 'question_id');
    assert.strictEqual(normalizeHeader('Case ID'), 'case_id');
    assert.strictEqual(normalizeHeader('Case Title'), 'case_title');
    assert.strictEqual(normalizeHeader('Case Scenario'), 'case_scenario');
    assert.strictEqual(normalizeHeader('Case Sequence'), 'case_sequence');
    assert.strictEqual(normalizeHeader('Question Text'), 'question_text');
    assert.strictEqual(normalizeHeader('Option A'), 'option_a');
    assert.strictEqual(normalizeHeader('Correct Answer'), 'correct_answer');
    assert.strictEqual(normalizeHeader('Question Type'), 'question_type');
    assert.strictEqual(normalizeHeader('Source Material ID'), 'source_material_id');
  });

  test('parseCsvText accurately handles quoted text with commas and linebreaks', () => {
    const csv = `Question ID,Case ID,Case Scenario,Question Text,Option A,Option B,Option C,Option D,Correct Answer,Question Type\n` +
      `Q1,CASE1,"Scenario with, comma\nand newline","What is law?","A","B","C","D",A,CASE_BASED`;
    const parsed = parseCsvText(csv);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[1][0], 'Q1');
    assert.strictEqual(parsed[1][1], 'CASE1');
    assert(parsed[1][2].includes('comma\nand newline'));
  });

  test('parseXlsxBuffer correctly extracts rows from Excel sheet', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Question ID', 'Question Type', 'Question Text', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Course', 'Subject', 'Chapter'],
      ['Q-X-1', 'NORMAL', 'Sample XLSX question?', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'C', 'CA Intermediate', 'Taxation', 'Basic Concepts & Tax Rates']
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Questions');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const rows = parseXlsxBuffer(buf);
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[1][0], 'Q-X-1');
    assert.strictEqual(rows[1][1], 'NORMAL');
  });

  // ========================================================================
  // 3. METADATA PRIORITY & QUESTION TYPE RULES
  // ========================================================================
  console.log('\n>>> SECTION 3: METADATA PRIORITY & QUESTION TYPE RULES');

  test('Row explicit metadata takes strict priority over Import Defaults', () => {
    const rows = [
      ['Question ID', 'Question Type', 'Question Text', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Course', 'Subject', 'Chapter'],
      ['Q1', 'NORMAL', 'Sample question?', 'A', 'B', 'C', 'D', 'B', 'CA Final', 'Financial Reporting', 'Ind AS Asset Standards']
    ];
    const preview = validateBulkQuestions(rows, {
      course: 'CA Intermediate',
      subject: 'Corporate and Other Laws',
      chapter: 'Preliminary - Sec 1 to 2'
    });

    assert.strictEqual(preview.totalRows, 1);
    assert.strictEqual(preview.validCount, 1);
    // Explicit row was CA Final, so it MUST NOT be overridden by default CA Intermediate
    assert.strictEqual(preview.rows[0].data.course, 'CA_FINAL');
    assert.strictEqual(preview.rows[0].data.subject, 'Financial Reporting');
  });

  test('Missing row metadata uses Import Defaults if provided', () => {
    const rows = [
      ['Question ID', 'Question Type', 'Question Text', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer'],
      ['Q2', 'NORMAL', 'What is auditing?', 'OptA', 'OptB', 'OptC', 'OptD', 'A']
    ];
    const preview = validateBulkQuestions(rows, {
      course: 'CA Intermediate',
      subject: 'Auditing and Ethics',
      chapter: 'Nature, Objective and Scope of Audit - SA 200'
    });

    assert.strictEqual(preview.validCount, 1);
    assert.strictEqual(preview.rows[0].data.course, 'CA_INTERMEDIATE');
    assert.strictEqual(preview.rows[0].data.subject, 'Auditing and Ethics');
    assert.strictEqual(preview.rows[0].data.chapter, 'Nature, Objective and Scope of Audit - SA 200');
  });

  test('Validation error occurs if metadata is missing from both row and defaults', () => {
    const rows = [
      ['Question ID', 'Question Type', 'Question Text', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer'],
      ['Q3', 'NORMAL', 'What is audit?', 'A', 'B', 'C', 'D', 'A']
    ];
    const preview = validateBulkQuestions(rows, {}); // No defaults provided
    assert.strictEqual(preview.validCount, 0);
    assert.strictEqual(preview.invalidCount, 1);
    assert(preview.rows[0].errors.some((e) => e.includes('Course is missing')));
  });

  test('Question Type must be explicitly NORMAL or CASE_BASED (no heuristics)', () => {
    const rows = [
      ['Question ID', 'Question Type', 'Question Text', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Course', 'Subject', 'Chapter'],
      ['Q4', 'UNKNOWN_TYPE', 'Text?', 'A', 'B', 'C', 'D', 'A', 'CA Intermediate', 'Taxation', 'Basic Concepts & Tax Rates'],
      ['Q5', '', 'Text?', 'A', 'B', 'C', 'D', 'A', 'CA Intermediate', 'Taxation', 'Basic Concepts & Tax Rates']
    ];
    const preview = validateBulkQuestions(rows);
    assert.strictEqual(preview.validCount, 0);
    assert(preview.rows[0].errors.some((e) => e.includes('Allowed values are strictly NORMAL or CASE_BASED')));
    assert(preview.rows[1].errors.some((e) => e.includes('Question Type is required')));
  });

  // ========================================================================
  // 4. NORMAL VS CASE-BASED ARCHITECTURAL CONSTRAINTS
  // ========================================================================
  console.log('\n>>> SECTION 4: NORMAL VS CASE-BASED ARCHITECTURAL CONSTRAINTS');

  test('NORMAL questions must NOT contain Case ID, Title, Scenario, or Sequence', () => {
    const rows = [
      ['Question ID', 'Question Type', 'Case ID', 'Case Title', 'Case Scenario', 'Case Sequence', 'Question Text', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Course', 'Subject', 'Chapter'],
      ['Q-N-1', 'NORMAL', 'CASE-999', 'Forbidden Title', 'Forbidden Scenario', '1', 'Question?', 'A', 'B', 'C', 'D', 'A', 'CA Intermediate', 'Taxation', 'Basic Concepts & Tax Rates']
    ];
    const preview = validateBulkQuestions(rows);
    assert.strictEqual(preview.validCount, 0);
    const errs = preview.rows[0].errors;
    assert(errs.some((e) => e.includes('NORMAL question must not have a Case ID')));
    assert(errs.some((e) => e.includes('NORMAL question must not have a Case Title')));
    assert(errs.some((e) => e.includes('NORMAL question must not have a Case Scenario')));
    assert(errs.some((e) => e.includes('NORMAL question must not have a Case Sequence')));
  });

  test('CASE_BASED questions require Case ID, Title, Scenario, and valid Sequence', () => {
    const rows = [
      ['Question ID', 'Question Type', 'Case ID', 'Case Title', 'Case Scenario', 'Case Sequence', 'Question Text', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Course', 'Subject', 'Chapter'],
      ['Q-C-1', 'CASE_BASED', '', '', '', '', 'Question?', 'A', 'B', 'C', 'D', 'A', 'CA Intermediate', 'Taxation', 'Basic Concepts & Tax Rates']
    ];
    const preview = validateBulkQuestions(rows);
    assert.strictEqual(preview.validCount, 0);
    const errs = preview.rows[0].errors;
    assert(errs.some((e) => e.includes('Case ID is mandatory for CASE_BASED')));
    assert(errs.some((e) => e.includes('Case Title is mandatory for CASE_BASED')));
    assert(errs.some((e) => e.includes('Case Scenario is mandatory for CASE_BASED')));
    assert(errs.some((e) => e.includes('Case Sequence is mandatory for CASE_BASED')));
  });

  // ========================================================================
  // 5. CASE ID CONSISTENCY & BUNDLE INTEGRITY
  // ========================================================================
  console.log('\n>>> SECTION 5: CASE ID CONSISTENCY & BUNDLE INTEGRITY');

  test('Valid case bundle with 2 questions sharing the same Case ID and Scenario passes validation', () => {
    const rows = [
      ['Question ID', 'Question Type', 'Case ID', 'Case Title', 'Case Scenario', 'Case Sequence', 'Question Text', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Course', 'Subject', 'Chapter', 'Difficulty'],
      ['Q-C-101', 'CASE_BASED', 'CASE-BUNDLE-1', 'XYZ Ltd Audit Case', 'XYZ Ltd is a listed entity with turnover Rs 500 Cr...', '1', 'First question on facts?', 'Opt1', 'Opt2', 'Opt3', 'Opt4', 'A', 'CA Intermediate', 'Auditing and Ethics', 'Audit and Auditors - Sec 138 to 148', 'Moderate'],
      ['Q-C-102', 'CASE_BASED', 'CASE-BUNDLE-1', 'XYZ Ltd Audit Case', 'XYZ Ltd is a listed entity with turnover Rs 500 Cr...', '2', 'Second question on facts?', 'Opt1', 'Opt2', 'Opt3', 'Opt4', 'B', 'CA Intermediate', 'Auditing and Ethics', 'Audit and Auditors - Sec 138 to 148', 'Hard']
    ];
    const preview = validateBulkQuestions(rows);
    assert.strictEqual(preview.validCount, 2);
    assert.strictEqual(preview.invalidCount, 0);
    assert.strictEqual(preview.caseCount, 1);
    assert.strictEqual(preview.casesSummary?.[0].caseId, 'CASE-BUNDLE-1');
    assert.strictEqual(preview.casesSummary?.[0].questionCount, 2);
    assert.deepStrictEqual(preview.casesSummary?.[0].sequences, [1, 2]);
  });

  test('Case consistency check flags conflicting Subjects across same Case ID', () => {
    const rows = [
      ['Question ID', 'Question Type', 'Case ID', 'Case Title', 'Case Scenario', 'Case Sequence', 'Question Text', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Course', 'Subject', 'Chapter'],
      ['Q1', 'CASE_BASED', 'CASE-ERR-1', 'Title One', 'Scenario text...', '1', 'Q text 1', 'A', 'B', 'C', 'D', 'A', 'CA Intermediate', 'Auditing and Ethics', 'Audit and Auditors - Sec 138 to 148'],
      ['Q2', 'CASE_BASED', 'CASE-ERR-1', 'Title One', 'Scenario text...', '2', 'Q text 2', 'A', 'B', 'C', 'D', 'B', 'CA Intermediate', 'Taxation', 'Basic Concepts & Tax Rates'] // Inconsistent Subject!
    ];
    const preview = validateBulkQuestions(rows);
    assert.strictEqual(preview.validCount, 0);
    assert(preview.rows[1].errors.some((e) => e.includes('has inconsistent Subject')));
  });

  test('Case consistency check flags conflicting Case Titles across same Case ID', () => {
    const rows = [
      ['Question ID', 'Question Type', 'Case ID', 'Case Title', 'Case Scenario', 'Case Sequence', 'Question Text', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Course', 'Subject', 'Chapter'],
      ['Q1', 'CASE_BASED', 'CASE-ERR-2', 'Alpha Case', 'Scenario text...', '1', 'Q text 1', 'A', 'B', 'C', 'D', 'A', 'CA Intermediate', 'Auditing and Ethics', 'Audit and Auditors - Sec 138 to 148'],
      ['Q2', 'CASE_BASED', 'CASE-ERR-2', 'Beta Case Conflict', 'Scenario text...', '2', 'Q text 2', 'A', 'B', 'C', 'D', 'B', 'CA Intermediate', 'Auditing and Ethics', 'Audit and Auditors - Sec 138 to 148'] // Inconsistent Title!
    ];
    const preview = validateBulkQuestions(rows);
    assert.strictEqual(preview.validCount, 0);
    assert(preview.rows[1].errors.some((e) => e.includes('has conflicting Case Titles')));
  });

  test('Case sequence duplicate within same Case ID is flagged and rejected', () => {
    const rows = [
      ['Question ID', 'Question Type', 'Case ID', 'Case Title', 'Case Scenario', 'Case Sequence', 'Question Text', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Course', 'Subject', 'Chapter'],
      ['Q1', 'CASE_BASED', 'CASE-SEQ-DUP', 'Duplicate Sequence Case', 'Scenario...', '1', 'Q text 1', 'A', 'B', 'C', 'D', 'A', 'CA Intermediate', 'Corporate and Other Laws', 'Preliminary - Sec 1 to 2'],
      ['Q2', 'CASE_BASED', 'CASE-SEQ-DUP', 'Duplicate Sequence Case', 'Scenario...', '1', 'Q text 2', 'A', 'B', 'C', 'D', 'B', 'CA Intermediate', 'Corporate and Other Laws', 'Preliminary - Sec 1 to 2'] // Duplicate sequence 1!
    ];
    const preview = validateBulkQuestions(rows);
    assert.strictEqual(preview.validCount, 0);
    assert(preview.rows[1].errors.some((e) => e.includes('Duplicate Case Sequence 1')));
  });

  // ========================================================================
  // 6. COMMIT BULK QUESTIONS & AUDIT LOG LIFECYCLE (STEP 5 & 7)
  // ========================================================================
  console.log('\n>>> SECTION 6: COMMIT AS DRAFT & APPROVE / PUBLISH (STEP 5 & 7)');

  test('commitBulkQuestions saves valid cases and questions as draft and links sourceMaterialId', () => {
    const testCaseId = `CASE_TEST_${crypto.randomBytes(4).toString('hex')}`;
    const testMatId = `mat_source_${crypto.randomBytes(4).toString('hex')}`;

    const rows = [
      ['Question ID', 'Question Type', 'Case ID', 'Case Title', 'Case Scenario', 'Case Sequence', 'Question Text', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Course', 'Subject', 'Chapter', 'Difficulty', 'Source Material ID'],
      [`Q_NORM_${crypto.randomBytes(4).toString('hex')}`, 'NORMAL', '', '', '', '', 'Normal standalone question?', 'A', 'B', 'C', 'D', 'C', 'CA Intermediate', 'Cost and Management Accounting', 'Material Cost', 'Easy', testMatId],
      [`Q_CASE_1_${crypto.randomBytes(4).toString('hex')}`, 'CASE_BASED', testCaseId, 'Costing Case Study', 'Factory scenario details...', '1', 'Case child 1 question?', 'A', 'B', 'C', 'D', 'A', 'CA Intermediate', 'Cost and Management Accounting', 'Material Cost', 'Moderate', testMatId],
      [`Q_CASE_2_${crypto.randomBytes(4).toString('hex')}`, 'CASE_BASED', testCaseId, 'Costing Case Study', 'Factory scenario details...', '2', 'Case child 2 question?', 'A', 'B', 'C', 'D', 'D', 'CA Intermediate', 'Cost and Management Accounting', 'Material Cost', 'Hard', testMatId]
    ];

    const preview = validateBulkQuestions(rows);
    assert.strictEqual(preview.validCount, 3);

    // Commit as draft (Step 5)
    const commitResult = commitBulkQuestions(preview.rows, 'MCQ_ADMIN', 'draft');
    assert.strictEqual(commitResult.importedCount, 3);
    assert.strictEqual(commitResult.casesCount, 1);

    // Verify DB case entry
    const savedCase = db.prepare('SELECT * FROM mcq_cases WHERE case_id = ?').get(testCaseId) as any;
    assert(savedCase, 'Parent case bundle should be present in mcq_cases table');
    assert.strictEqual(savedCase.case_title, 'Costing Case Study');
    assert.strictEqual(savedCase.status, 'draft');

    // Verify DB questions entries
    const savedQuestions = db.prepare('SELECT * FROM mcq_questions WHERE case_id = ? ORDER BY case_sequence ASC').all(testCaseId) as any[];
    assert.strictEqual(savedQuestions.length, 2);
    assert.strictEqual(savedQuestions[0].case_sequence, 1);
    assert.strictEqual(savedQuestions[1].case_sequence, 2);
    assert.strictEqual(savedQuestions[0].source_material_id, testMatId);
    assert.strictEqual(savedQuestions[0].status, 'draft');

    // Clean up
    db.prepare('DELETE FROM mcq_questions WHERE case_id = ?').run(testCaseId);
    db.prepare('DELETE FROM mcq_cases WHERE case_id = ?').run(testCaseId);
  });

  console.log('========================================================================');
  console.log(`✅ ALL ${passed} / ${total} MCQ ARCHITECTURE & BULK IMPORT TESTS PASSED!`);
  console.log('========================================================================\n');
}

runTests().catch((e) => {
  console.error('Test run failed:', e);
  process.exit(1);
});
