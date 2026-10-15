import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

async function runTests() {
  console.log('--- Evaluation Progress Messaging & Fixed Time Estimate Removal Tests ---');

  const uploadEvalPath = path.join(process.cwd(), 'src', 'pages', 'student', 'UploadEvaluation.tsx');
  assert(fs.existsSync(uploadEvalPath), 'UploadEvaluation.tsx must exist');
  const uploadEvalContent = fs.readFileSync(uploadEvalPath, 'utf8');

  // Test 1: Verify "Typical evaluation time: 2–5 minutes" is completely removed
  console.log('Test 1: Verifying fixed evaluation time estimate is not rendered...');
  assert(
    !uploadEvalContent.includes('Typical evaluation time: 2–5 minutes'),
    'Test 1 failed: "Typical evaluation time: 2–5 minutes" must NOT be rendered in UploadEvaluation.tsx'
  );
  assert(
    !uploadEvalContent.includes('2–5 minutes'),
    'Test 1 failed: "2–5 minutes" must NOT exist in UploadEvaluation.tsx'
  );
  assert(
    !uploadEvalContent.includes('2-5 minutes'),
    'Test 1 failed: "2-5 minutes" must NOT exist in UploadEvaluation.tsx'
  );
  assert(
    !uploadEvalContent.includes('2–4 minutes'),
    'Test 1 failed: "2–4 minutes" must NOT exist in UploadEvaluation.tsx'
  );
  assert(
    !uploadEvalContent.includes('take 2–4 minutes'),
    'Test 1 failed: "take 2–4 minutes" must NOT exist in UploadEvaluation.tsx'
  );
  console.log('✓ Test 1 Passed: Fixed evaluation time text is not rendered.');

  // Test 2: Verify exact required messaging is rendered
  console.log('Test 2: Verifying exact primary and supporting messaging...');
  const expectedPrimary = 'Evaluation in progress…';
  const expectedSupporting = 'Processing time may vary depending on your answer sheet.';

  assert(
    uploadEvalContent.includes(expectedPrimary),
    `Test 2 failed: Must contain exact primary message "${expectedPrimary}"`
  );
  assert(
    uploadEvalContent.includes(expectedSupporting),
    `Test 2 failed: Must contain exact secondary message "${expectedSupporting}"`
  );
  console.log('✓ Test 2 Passed: Exact evaluation progress messaging verified.');

  // Test 3: Verify no countdown or elapsed progress timer is shown to the student
  console.log('Test 3: Verifying no student-facing countdown or progress timer is displayed...');
  assert(
    !uploadEvalContent.includes('{Math.floor(elapsedSeconds / 60)}m'),
    'Test 3 failed: Progress timer must not be displayed to student in progress overlay'
  );
  console.log('✓ Test 3 Passed: Progress timer removed from student view.');

  // Test 4: Verify extended evaluation state uses neutral messaging without numerical duration
  console.log('Test 4: Verifying neutral messaging for extended evaluation states...');
  const expectedNeutralExtended = 'Evaluation is taking longer than expected. Please wait while we complete it.';
  assert(
    uploadEvalContent.includes(expectedNeutralExtended),
    `Test 4 failed: Must contain neutral message "${expectedNeutralExtended}"`
  );
  console.log('✓ Test 4 Passed: Neutral extended evaluation message verified.');

  // Test 5: Whole-codebase audit for time estimates in src/
  console.log('Test 5: Full src/ audit for forbidden time estimates...');
  const srcDir = path.join(process.cwd(), 'src');
  function scanDir(dir: string) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        const text = fs.readFileSync(fullPath, 'utf8');
        assert(
          !text.includes('Typical evaluation time'),
          `Forbidden string "Typical evaluation time" found in ${fullPath}`
        );
        assert(
          !text.includes('2–5 minutes'),
          `Forbidden string "2–5 minutes" found in ${fullPath}`
        );
        assert(
          !text.includes('2-5 minutes'),
          `Forbidden string "2-5 minutes" found in ${fullPath}`
        );
      }
    }
  }
  scanDir(srcDir);
  console.log('✓ Test 5 Passed: Entire src/ audited with zero forbidden time estimate strings.');

  // Test 6: Verify highlighted status styling, rounded corners, light blue tint, and animated indicator
  console.log('Test 6: Verifying highlighted status container and animated indicator...');
  assert(
    uploadEvalContent.includes('bg-blue-50/80') || uploadEvalContent.includes('bg-blue-50'),
    'Test 6 failed: Must include subtle light blue tint background'
  );
  assert(
    uploadEvalContent.includes('border-blue-200'),
    'Test 6 failed: Must include refined blue border'
  );
  assert(
    uploadEvalContent.includes('animate-ping') || uploadEvalContent.includes('animate-spin') || uploadEvalContent.includes('animate-pulse'),
    'Test 6 failed: Must include small animated processing indicator beside the main heading'
  );
  console.log('✓ Test 6 Passed: Highlighted status container styling and animated indicator verified.');

  console.log('\n--- All Evaluation Progress Messaging Tests Passed Successfully! ---');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
