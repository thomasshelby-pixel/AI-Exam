import assert from 'assert';
import { db } from '../db.js';
import {
  saveMcqMaterial,
  deleteMcqMaterial,
  deleteMcqMaterialsBulk,
  getMcqMaterialById,
  getMaterialLinkedSummary,
  getMaterialsBulkStats,
} from '../services/mcqMaterialService.js';
import {
  createAdminQuestion,
  createSession,
  getCurriculumStats,
} from '../services/mcqService.js';

console.log('========================================================================');
console.log('--- TEST SUITE: MCQ MATERIAL BULK DELETE & PRACTICE FILTERING ---');
console.log('========================================================================');

async function runTests() {
  const timestamp = Date.now();
  const testStudentId = `test_filter_student_${timestamp}`;
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, phone, role, status, account_classification, mfa_enabled)
    VALUES (?, ?, 'hash', 'Filter Student', '+919999999998', 'STUDENT', 'ACTIVE', 'NORMAL', 0)
  `).run(testStudentId, `${testStudentId}@test.com`);

  // ----------------------------------------------------
  // TEST 1: Material Linked Summary & Linked Counts
  // ----------------------------------------------------
  console.log('\n>>> TEST 1: Material Linked Summary calculation');
  const mat1 = await saveMcqMaterial({
    materialName: `Test Audit Paper 1 ${timestamp}`,
    course: 'CA_INTERMEDIATE',
    subject: 'Corporate and Other Laws',
    materialType: 'RTP',
    attempt: 'September 2026',
    fileBuffer: Buffer.from('%PDF-1.4 sample content 1'),
    originalFilename: 'audit_test_1.pdf',
    fileType: 'PDF',
    pageCount: 5,
    extractedText: 'Sample text for audit paper 1 with some questions',
    uploadedBy: 'MCQ_ADMIN',
  });

  assert(mat1 && mat1.id, 'Material 1 created');

  // Create linked questions
  const q1 = createAdminQuestion({
    course: 'CA_INTERMEDIATE',
    subject: 'Corporate and Other Laws',
    chapter: 'Management and Administration',
    questionType: 'normal',
    questionText: `Test Q1 linked to mat1 ${timestamp}`,
    optionA: 'Opt A', optionB: 'Opt B', optionC: 'Opt C', optionD: 'Opt D',
    correctAnswer: 'A', explanation: 'Explanation for Q1',
    sourceMaterialId: mat1.id,
    source: 'RTP',
    attempt: 'September 2026',
    status: 'published',
  }, 'MCQ_ADMIN') as any;

  const q2 = createAdminQuestion({
    course: 'CA_INTERMEDIATE',
    subject: 'Corporate and Other Laws',
    chapter: 'Management and Administration',
    questionType: 'normal',
    questionText: `Test Q2 linked to mat1 ${timestamp}`,
    optionA: 'Opt A', optionB: 'Opt B', optionC: 'Opt C', optionD: 'Opt D',
    correctAnswer: 'B', explanation: 'Explanation for Q2',
    sourceMaterialId: mat1.id,
    source: 'RTP',
    attempt: 'September 2026',
    status: 'published',
  }, 'MCQ_ADMIN') as any;

  const summary1 = getMaterialLinkedSummary(mat1.id);
  assert.strictEqual(summary1.linkedQuestionsCount, 2, 'Summary must report 2 linked questions');
  assert.strictEqual(summary1.linkedCasesCount, 0, 'Summary must report 0 linked cases');
  console.log('[PASS] Test 1: getMaterialLinkedSummary correctly counted linked questions.');

  // ----------------------------------------------------
  // TEST 2: Single Material Delete with 'unlink' Policy
  // (Questions remain intact and published, sourceMaterialId unlinked)
  // ----------------------------------------------------
  console.log('\n>>> TEST 2: Single Material Delete with unlink policy');
  const delSingleRes = await deleteMcqMaterial(mat1.id, { linkedAction: 'unlink' });
  assert.strictEqual(delSingleRes, true, 'deleteMcqMaterial must succeed');

  // Material must be deleted & tombstoned
  const deletedMat = getMcqMaterialById(mat1.id);
  assert.strictEqual(deletedMat, null, 'Deleted material must not be retrieved');

  // Linked questions must remain intact and published!
  const q1After = db.prepare('SELECT id, status, source_material_id FROM mcq_questions WHERE id = ?').get(q1.id) as any;
  assert(q1After, 'Q1 must still exist in Question Bank');
  assert.strictEqual(q1After.status, 'published', 'Q1 must remain published');
  assert.strictEqual(q1After.source_material_id, null, 'Q1 source_material_id must be unlinked');
  console.log('[PASS] Test 2: Material deleted with unlink policy kept questions intact and published.');

  // ----------------------------------------------------
  // TEST 3: Bulk Material Delete with 'keep_intact' Policy
  // ----------------------------------------------------
  console.log('\n>>> TEST 3: Bulk Material Delete with keep_intact policy');
  const mat2 = await saveMcqMaterial({
    materialName: `Test Audit Paper 2 ${timestamp}`,
    course: 'CA_INTERMEDIATE',
    subject: 'Corporate and Other Laws',
    materialType: 'MTP',
    attempt: 'May 2026',
    fileBuffer: Buffer.from('%PDF-1.4 sample content 2'),
    originalFilename: 'audit_test_2.pdf',
    fileType: 'PDF',
    pageCount: 3,
    extractedText: 'Sample text for audit paper 2',
    uploadedBy: 'MCQ_ADMIN',
  });

  const mat3 = await saveMcqMaterial({
    materialName: `Test Audit Paper 3 ${timestamp}`,
    course: 'CA_INTERMEDIATE',
    subject: 'Corporate and Other Laws',
    materialType: 'PYQ',
    attempt: 'Nov 2025',
    fileBuffer: Buffer.from('%PDF-1.4 sample content 3'),
    originalFilename: 'audit_test_3.pdf',
    fileType: 'PDF',
    pageCount: 4,
    extractedText: 'Sample text for audit paper 3',
    uploadedBy: 'MCQ_ADMIN',
  });

  const q3 = createAdminQuestion({
    course: 'CA_INTERMEDIATE',
    subject: 'Corporate and Other Laws',
    chapter: 'Share Capital and Debentures',
    questionType: 'normal',
    questionText: `Test Q3 linked to mat2 ${timestamp}`,
    optionA: 'Opt A', optionB: 'Opt B', optionC: 'Opt C', optionD: 'Opt D',
    correctAnswer: 'C', explanation: 'Explanation for Q3',
    sourceMaterialId: mat2.id,
    source: 'MTP',
    attempt: 'May 2026',
    status: 'published',
  }, 'MCQ_ADMIN') as any;

  const bulkStats = getMaterialsBulkStats([mat2.id, mat3.id]);
  assert.strictEqual(bulkStats.totalMaterials, 2, 'Must report 2 materials');
  assert.strictEqual(bulkStats.linkedQuestionsCount, 1, 'Must report 1 linked question across both');

  const bulkDelRes = await deleteMcqMaterialsBulk([mat2.id, mat3.id], { linkedAction: 'keep_intact' });
  assert.strictEqual(bulkDelRes.success, true, 'Bulk delete must succeed');
  assert.strictEqual(bulkDelRes.deletedCount, 2, 'Must delete both materials');

  // Verify questions kept intact with traceable link
  const q3After = db.prepare('SELECT id, status, source_material_id FROM mcq_questions WHERE id = ?').get(q3.id) as any;
  assert(q3After, 'Q3 must remain intact in Question Bank');
  assert.strictEqual(q3After.status, 'published', 'Q3 must remain published');
  assert.strictEqual(q3After.source_material_id, mat2.id, 'Q3 retains traceable sourceMaterialId');
  console.log('[PASS] Test 3: Bulk delete with keep_intact policy preserved questions and traceable link.');

  // ----------------------------------------------------
  // TEST 4: Bulk Delete Idempotency
  // ----------------------------------------------------
  console.log('\n>>> TEST 4: Bulk Delete Idempotency');
  // Re-deleting the exact same materials or duplicate IDs in input array
  const retryRes = await deleteMcqMaterialsBulk([mat2.id, mat2.id, mat3.id], { linkedAction: 'keep_intact' });
  assert.strictEqual(retryRes.success, true, 'Retry must be idempotent and succeed');
  assert.strictEqual(retryRes.deletedCount, 2, 'Already tombstoned materials must cleanly resolve true');
  console.log('[PASS] Test 4: Bulk delete is strictly idempotent and safe on repeat/duplicated calls.');

  // ----------------------------------------------------
  // TEST 5: Student Practice Multi-Chapter & Source Filtering
  // ----------------------------------------------------
  console.log('\n>>> TEST 5: Student Practice Multi-Chapter & Source Filtering');
  const chapA = `Chapter Alpha ${timestamp}`;
  const chapB = `Chapter Beta ${timestamp}`;
  const chapC = `Chapter Gamma ${timestamp}`;

  const qAlpha = createAdminQuestion({
    course: 'CA_INTERMEDIATE',
    subject: 'Corporate and Other Laws',
    chapter: chapA,
    questionType: 'normal',
    questionText: `Alpha question ${timestamp}`,
    optionA: 'Opt A', optionB: 'Opt B', optionC: 'Opt C', optionD: 'Opt D',
    correctAnswer: 'A', explanation: 'Explanation',
    source: 'RTP',
    attempt: 'September 2026',
    status: 'published',
  }, 'MCQ_ADMIN') as any;

  const qBeta = createAdminQuestion({
    course: 'CA_INTERMEDIATE',
    subject: 'Corporate and Other Laws',
    chapter: chapB,
    questionType: 'normal',
    questionText: `Beta question ${timestamp}`,
    optionA: 'Opt A', optionB: 'Opt B', optionC: 'Opt C', optionD: 'Opt D',
    correctAnswer: 'B', explanation: 'Explanation',
    source: 'ICAI Module',
    status: 'published',
  }, 'MCQ_ADMIN') as any;

  // Session filtering by chapters Alpha + Beta
  const multiChapSession = createSession(testStudentId, {
    course: 'CA_INTERMEDIATE',
    subject: 'Corporate and Other Laws',
    chapters: [chapA, chapB],
    sessionType: 'practice',
    requestedCount: 10,
  }) as any;

  assert(multiChapSession.session, 'Multi-chapter session created');
  assert(multiChapSession.questions.length >= 2, 'Session returned matching questions');
  const returnedChapNames = multiChapSession.questions.map((q: any) => q.chapter);
  assert(returnedChapNames.includes(chapA), 'Includes chapter Alpha');
  assert(returnedChapNames.includes(chapB), 'Includes chapter Beta');
  assert(!returnedChapNames.includes(chapC), 'Does not include unrelated chapter Gamma');

  // Session filtering by Source = RTP
  const rtpSession = createSession(testStudentId, {
    course: 'CA_INTERMEDIATE',
    subject: 'Corporate and Other Laws',
    chapters: [chapA, chapB],
    source: 'RTP',
    sessionType: 'practice',
    requestedCount: 10,
  }) as any;

  assert(rtpSession.session, 'RTP session created');
  assert(rtpSession.questions.every((q: any) => q.source === 'RTP'), 'All questions must have source RTP');

  // Honest availability message when 0 questions match
  const zeroSession = createSession(testStudentId, {
    course: 'CA_INTERMEDIATE',
    subject: 'Corporate and Other Laws',
    chapters: [chapA],
    source: 'Self-Created', // none exist for Alpha
    sessionType: 'practice',
    requestedCount: 10,
  }) as any;

  assert(zeroSession.error, 'Must return honest error message');
  assert.strictEqual(zeroSession.availableCount, 0, 'Available count must be 0 without fallback');
  console.log('[PASS] Test 5: Multi-chapter, source filtering, and honest 0-availability message verified.');

  // ----------------------------------------------------
  // TEST 6: Curriculum Stats includes source and attempt
  // ----------------------------------------------------
  console.log('\n>>> TEST 6: Curriculum stats includes source and attempt');
  const stats = getCurriculumStats();
  assert(Array.isArray(stats), 'getCurriculumStats returns an array');
  assert(stats.length > 0, 'stats has rows');
  const sample = stats[0];
  assert('source' in sample, 'Curriculum row must include source property');
  assert('attempt' in sample, 'Curriculum row must include attempt property');
  console.log('[PASS] Test 6: Curriculum stats exposes source and attempt for accurate client-side counting.');

  console.log('========================================================================');
  console.log('✅ ALL MCQ MATERIAL BULK DELETE & PRACTICE FILTERING TESTS PASSED!');
  console.log('========================================================================');
}

runTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
