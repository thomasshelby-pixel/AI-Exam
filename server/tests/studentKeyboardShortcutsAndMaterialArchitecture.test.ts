import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  CANONICAL_SOURCE_CATEGORIES,
  isAttemptRequiredSource,
  getAttemptSuggestions,
  CANONICAL_COURSE_OPTIONS,
  getCourseSubjects,
  getSubjectChapters,
  getChapterTopics,
} from '../../src/data/caCurriculum.js';

console.log('========================================================================');
console.log('--- TEST SUITE: STUDENT SHORTCUTS & MATERIAL LIBRARY ARCHITECTURE ---');
console.log('========================================================================');

function test(name: string, fn: () => void | Promise<void>) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (err: any) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// SECTION 1: STUDENT DASHBOARD KEYBOARD SHORTCUTS
console.log('>>> SECTION 1: STUDENT DASHBOARD KEYBOARD SHORTCUTS');

const studentDashboardSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src', 'pages', 'student', 'StudentDashboard.tsx'),
  'utf-8'
);

test('Test 1: Global keydown listener registered in StudentDashboard', () => {
  assert.ok(
    studentDashboardSource.includes("window.addEventListener('keydown', handleKeyDown)"),
    'handleKeyDown listener must be registered'
  );
  assert.ok(
    studentDashboardSource.includes("window.removeEventListener('keydown', handleKeyDown)"),
    'handleKeyDown listener must be cleaned up'
  );
});

test('Test 2: Input / Textarea / Select typing guard prevents accidental shortcut triggers', () => {
  assert.ok(
    studentDashboardSource.includes('HTMLInputElement') &&
    studentDashboardSource.includes('HTMLTextAreaElement') &&
    studentDashboardSource.includes('HTMLSelectElement'),
    'Keyboard shortcut handler must check for active form inputs'
  );
  assert.ok(
    studentDashboardSource.includes('if (isInput) return'),
    'Keyboard shortcut handler must early return when user is typing'
  );
});

test('Test 3: "U" shortcut triggers onNavigateUpload', () => {
  assert.ok(
    studentDashboardSource.includes("key === 'U'") &&
    studentDashboardSource.includes('onNavigateUpload()'),
    '"U" shortcut must call onNavigateUpload()'
  );
});

test('Test 4: "D" shortcut scrolls to top of dashboard', () => {
  assert.ok(
    studentDashboardSource.includes("key === 'D'") &&
    studentDashboardSource.includes("window.scrollTo({ top: 0, behavior: 'smooth' })"),
    '"D" shortcut must scroll to top smoothly'
  );
});

test('Test 5: "E" shortcut triggers onNavigateEvaluations', () => {
  assert.ok(
    studentDashboardSource.includes("key === 'E'") &&
    studentDashboardSource.includes('onNavigateEvaluations()'),
    '"E" shortcut must call onNavigateEvaluations()'
  );
});

test('Test 6: "M" shortcut navigates to /mcq-arena', () => {
  assert.ok(
    studentDashboardSource.includes("key === 'M'") &&
    studentDashboardSource.includes("navigate('/mcq-arena')"),
    '"M" shortcut must navigate to /mcq-arena'
  );
});

test('Test 7: "P" shortcut navigates to profile', () => {
  assert.ok(
    studentDashboardSource.includes("key === 'P'") &&
    studentDashboardSource.includes('onNavigateProfile'),
    '"P" shortcut must trigger profile navigation'
  );
});

test('Test 8: "C" shortcut opens credits modal', () => {
  assert.ok(
    studentDashboardSource.includes("key === 'C'") &&
    studentDashboardSource.includes('onOpenCreditsModal()'),
    '"C" shortcut must call onOpenCreditsModal()'
  );
});

test('Test 9: "R" shortcut refreshes dashboard data', () => {
  assert.ok(
    studentDashboardSource.includes("key === 'R'") &&
    studentDashboardSource.includes('fetchDashboard()'),
    '"R" shortcut must call fetchDashboard()'
  );
});

test('Test 10: "?" shortcut toggles accessible shortcuts help modal', () => {
  assert.ok(
    studentDashboardSource.includes("key === '?'") &&
    studentDashboardSource.includes('setShowShortcutsModal'),
    '"?" shortcut must toggle showShortcutsModal'
  );
  assert.ok(
    studentDashboardSource.includes('Student Keyboard Shortcuts') &&
    studentDashboardSource.includes('role="dialog"'),
    'Accessible shortcuts modal dialog must be rendered'
  );
});

// SECTION 2: MATERIAL LIBRARY & CANONICAL CURRICULUM
console.log('>>> SECTION 2: MATERIAL LIBRARY & CANONICAL CURRICULUM ARCHITECTURE');

const materialLibSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src', 'components', 'admin', 'McqMaterialLibrary.tsx'),
  'utf-8'
);

test('Test 11: Material Library accepts PDF and TXT only (no CSV/XLSX)', () => {
  assert.ok(
    materialLibSource.includes("accept=\".pdf,.txt,application/pdf,text/plain\""),
    'File input must accept only .pdf and .txt'
  );
  assert.ok(
    materialLibSource.includes("!lowerName.endsWith('.pdf') && !lowerName.endsWith('.txt')"),
    'Validation must reject non-PDF/TXT files'
  );
});

test('Test 12: Source Category options match exact canonical list with Self-Created', () => {
  const expectedList = [
    'RTP',
    'MTP',
    'PYQ',
    'ICAI Module',
    'Self-Created',
    'Conceptual Practice',
    'Practical',
    'Other',
  ];
  assert.deepStrictEqual(Array.from(CANONICAL_SOURCE_CATEGORIES), expectedList);
  assert.ok(
    materialLibSource.includes('CANONICAL_SOURCE_CATEGORIES'),
    'McqMaterialLibrary must use CANONICAL_SOURCE_CATEGORIES'
  );
});

test('Test 13: Attempt / Year field is conditionally shown ONLY for RTP, MTP, PYQ', () => {
  assert.strictEqual(isAttemptRequiredSource('RTP'), true);
  assert.strictEqual(isAttemptRequiredSource('MTP'), true);
  assert.strictEqual(isAttemptRequiredSource('PYQ'), true);
  assert.strictEqual(isAttemptRequiredSource('ICAI Module'), false);
  assert.strictEqual(isAttemptRequiredSource('Self-Created'), false);
  assert.strictEqual(isAttemptRequiredSource('Conceptual Practice'), false);
  assert.strictEqual(isAttemptRequiredSource('Practical'), false);
  assert.strictEqual(isAttemptRequiredSource('Other'), false);

  assert.ok(
    materialLibSource.includes('isAttemptRequiredSource(formData.materialType)'),
    'Material Library upload form must conditionally render Attempt / Year'
  );
});

test('Test 14: Clean UI wording without "Cascading from" technical labels', () => {
  assert.strictEqual(
    materialLibSource.includes('Cascading from Course'),
    false,
    'Must not contain "Cascading from Course"'
  );
  assert.strictEqual(
    materialLibSource.includes('Cascading from Subject'),
    false,
    'Must not contain "Cascading from Subject"'
  );
  assert.strictEqual(
    materialLibSource.includes('Cascading from Chapter'),
    false,
    'Must not contain "Cascading from Chapter"'
  );
});

test('Test 15: Material Library does not contaminate document metadata with question properties', () => {
  // formData in McqMaterialLibrary must NOT have questionType or difficulty
  assert.strictEqual(
    materialLibSource.includes('formData.questionType'),
    false,
    'Material Library source document must not have questionType'
  );
  assert.strictEqual(
    materialLibSource.includes('formData.difficulty'),
    false,
    'Material Library source document must not have difficulty'
  );
});

test('Test 16: Canonical courses CA Foundation, CA Intermediate, CA Final configured', () => {
  const courseVals = CANONICAL_COURSE_OPTIONS.map((c) => c.value);
  assert.ok(courseVals.includes('CA_FOUNDATION'));
  assert.ok(courseVals.includes('CA_INTERMEDIATE'));
  assert.ok(courseVals.includes('CA_FINAL'));

  // Foundation subjects are distinct from Inter/Final
  const foundationSubs = getCourseSubjects('CA_FOUNDATION');
  const interSubs = getCourseSubjects('CA_INTERMEDIATE');
  const finalSubs = getCourseSubjects('CA_FINAL');

  assert.ok(foundationSubs.includes('Accounting'));
  assert.ok(foundationSubs.includes('Business Laws'));
  assert.ok(interSubs.includes('Corporate and Other Laws'));
  assert.ok(finalSubs.includes('Advanced Auditing, Assurance and Professional Ethics'));

  // Ensure no cross-contamination
  assert.strictEqual(foundationSubs.includes('Corporate and Other Laws'), false);
  assert.strictEqual(interSubs.includes('Advanced Auditing, Assurance and Professional Ethics'), false);
});

console.log('========================================================================');
console.log('✅ ALL 16 / 16 SHORTCUTS & MATERIAL ARCHITECTURE TESTS PASSED!');
console.log('========================================================================');
