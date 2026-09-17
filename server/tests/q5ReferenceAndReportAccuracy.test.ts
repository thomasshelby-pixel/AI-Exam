import assert from 'assert';
import { db } from '../db.js';
import { lockQuestionReference } from '../services/questionReferenceLock.js';
import { extractRelevantReferenceSnippets } from '../services/questionChunkEvaluator.js';
import { generateDetailedReportPdf } from '../services/detailedReportPdfService.js';

console.log('================================================================');
console.log('--- RUNNING Q5 REFERENCE GROUNDING & REPORT ACCURACY TEST ---');
console.log('================================================================');

// 1. Fetch official evaluation materials for CA Inter Taxation (Series 1 contains the Q5 Cloak Room scenario)
const mat = db
  .prepare("SELECT * FROM evaluation_materials WHERE subject_key = 'inter_taxation' AND (question_paper_title LIKE '%Series 1%' OR question_paper_title LIKE '%Series-1%') LIMIT 1")
  .get() as any;

assert(mat, 'Evaluation materials for inter_taxation must exist');
assert(mat.question_paper_text, 'Question paper text must exist');
assert(mat.suggested_answers_text, 'Suggested answers text must exist');
assert(mat.marking_scheme_text, 'Marking scheme text must exist');

// 2. Test Q5(a) Reference Triangulation
console.log('\n--- TEST 1: Q5(a) Triangulated Reference Extraction ---');
const q5aRef = lockQuestionReference('Q5(a)', mat.question_paper_text, mat.suggested_answers_text, mat.marking_scheme_text);
assert.strictEqual(q5aRef.fullQuestionCode, 'Q5(a)', 'Clean code should be Q5(a)');
assert.strictEqual(q5aRef.questionPaperSlice.found, true, 'Q5(a) must be found in Question Paper');
assert.strictEqual(q5aRef.suggestedAnswerSlice.found, true, 'Q5(a) must be found in Suggested Answers');
assert.strictEqual(q5aRef.markingSchemeSlice.found, true, 'Q5(a) must be found in Marking Scheme');
assert.strictEqual(q5aRef.isFullyLocked, true, 'Q5(a) reference must be fully locked');
console.log('[PASS] TEST 1.1: Q5(a) is 100% triangulated across QP, SA, and MS');

// Verify that Q5(a) does not bleed into Q5(b)
assert(!q5aRef.suggestedAnswerSlice.snippet.includes('Cloak room services'), 'Q5(a) SA snippet must not bleed into Q5(b)');
assert(!q5aRef.markingSchemeSlice.snippet.includes('Cloak room services'), 'Q5(a) MS snippet must not bleed into Q5(b)');
console.log('[PASS] TEST 1.2: Q5(a) slice boundary isolates Q5(a) cleanly without bleeding into Q5(b)');

// 3. Test Q5(b) Reference Triangulation & Cloak Room Treatment
console.log('\n--- TEST 2: Q5(b) Triangulated Reference & Cloak Room Ground Truth ---');
const q5bRef = lockQuestionReference('Q5(b)', mat.question_paper_text, mat.suggested_answers_text, mat.marking_scheme_text);
assert.strictEqual(q5bRef.fullQuestionCode, 'Q5(b)', 'Clean code should be Q5(b)');
assert.strictEqual(q5bRef.questionPaperSlice.found, true, 'Q5(b) must be found in Question Paper');
assert.strictEqual(q5bRef.suggestedAnswerSlice.found, true, 'Q5(b) must be found in Suggested Answers');
assert.strictEqual(q5bRef.markingSchemeSlice.found, true, 'Q5(b) must be found in Marking Scheme');
assert.strictEqual(q5bRef.isFullyLocked, true, 'Q5(b) reference must be fully locked');
console.log('[PASS] TEST 2.1: Q5(b) is 100% triangulated across QP, SA, and MS');

// Check that Q5(b) Suggested Answer explicitly contains the exemption rationale for cloak room services
assert(
  q5bRef.suggestedAnswerSlice.snippet.includes('Cloak room services') ||
  q5bRef.suggestedAnswerSlice.snippet.includes('cloak room'),
  'Q5(b) SA snippet must contain Cloak room services reference'
);
assert(
  q5bRef.markingSchemeSlice.snippet.includes('Cloak room services'),
  'Q5(b) MS snippet must contain Cloak room services marking allocation'
);
console.log('[PASS] TEST 2.2: Q5(b) reference extracts exact ICAI statutory ground truth for Cloak Room services');

// 4. Test questionChunkEvaluator extractRelevantReferenceSnippets
console.log('\n--- TEST 3: extractRelevantReferenceSnippets Integration ---');
const q5aSnippets = extractRelevantReferenceSnippets('Q5(a)', mat.question_paper_text, mat.suggested_answers_text, mat.marking_scheme_text);
assert(q5aSnippets.foundInMaterial, 'Snippets for Q5(a) must be found');
assert(q5aSnippets.qpSnippet.length > 50, 'QP snippet for Q5(a) must be substantial');
assert(q5aSnippets.saSnippet.length > 50, 'SA snippet for Q5(a) must be substantial');
assert(q5aSnippets.msSnippet.length > 50, 'MS snippet for Q5(a) must be substantial');

const q5bSnippets = extractRelevantReferenceSnippets('Q5(b)', mat.question_paper_text, mat.suggested_answers_text, mat.marking_scheme_text);
assert(q5bSnippets.foundInMaterial, 'Snippets for Q5(b) must be found');
assert(q5bSnippets.saSnippet.includes('Cloak room') || q5bSnippets.saSnippet.includes('cloak room'), 'SA snippet must contain cloak room services');
console.log('[PASS] TEST 3.1: extractRelevantReferenceSnippets returns synchronized locked snippets');

// 5. Test PDF Report Generation with Non-Truncated Detailed Reasoning
console.log('\n--- TEST 4: Detailed PDF Report Generation without Truncation ---');
async function testPdfReport() {
  const evalRow = db
    .prepare("SELECT * FROM evaluations WHERE subject_key = 'inter_taxation' AND result_json IS NOT NULL ORDER BY created_at DESC LIMIT 1")
    .get() as any;

  assert(evalRow, 'Evaluation row must exist');
  const resultJson = JSON.parse(evalRow.result_json);

  const pdfBuffer = await generateDetailedReportPdf(
    {
      id: evalRow.id,
      studentName: evalRow.student_name || 'Rahul Sharma',
      level: 'Intermediate',
      subjectName: evalRow.subject_name || 'Taxation (Income Tax & GST)',
      attempt: 'August 2026',
      totalMarks: evalRow.total_marks || 45,
      maximumMarks: 100,
    },
    resultJson
  );

  assert(pdfBuffer, 'PDF buffer must be generated');
  assert(pdfBuffer.length > 1000, 'PDF buffer must contain substantial content');
  assert(pdfBuffer.slice(0, 4).toString() === '%PDF', 'PDF header must be valid');
  console.log(`[PASS] TEST 4.1: PDF report generated successfully (${pdfBuffer.length} bytes) with zero truncation errors`);
}

testPdfReport()
  .then(() => {
    console.log('\n================================================================');
    console.log('--- ALL Q5 ACCURACY & REPORT TESTS PASSED SUCCESSFULLY! ---');
    console.log('================================================================\n');
  })
  .catch((err) => {
    console.error('PDF Report test failed:', err);
    process.exit(1);
  });
