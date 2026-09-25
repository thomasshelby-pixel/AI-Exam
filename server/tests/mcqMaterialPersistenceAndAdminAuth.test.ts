import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, hashPassword, verifyPassword, initDatabase } from '../db.js';
import {
  saveMcqMaterial,
  getMcqMaterialById,
  listMcqMaterials,
  deleteMcqMaterial,
  initMcqMaterialTables,
} from '../services/mcqMaterialService.js';
import {
  createSession,
  getCurriculumStats,
  getAdminQuestions,
  seedMcqAdminAndQuestions,
} from '../services/mcqService.js';
import { commitBulkQuestions, ValidatedBulkRow } from '../services/mcqBulkImportService.js';
import { generateToken, verifyAuthToken, requireRole } from '../auth.js';
import { hydrateFromFirestore } from '../services/firestoreSyncService.js';

console.log('================================================================');
console.log('--- PRODUCTION BUG FIX VERIFICATION: ADMIN AUTH & MCQ MATERIAL PERSISTENCE ---');
console.log('================================================================');

async function runRegressionTests() {
  initDatabase();
  initMcqMaterialTables();

  const testId = `test_mat_${Date.now()}`;
  const testName = `TEST_Law_MTP_Nov2026_${Date.now()}`;
  const testTxt = `CA INTERMEDIATE CORPORATE AND OTHER LAWS MOCK TEST\nQ1. Under Section 103, what is quorum?\n(A) 5 members (B) 15 members\nAnswer: (B)`;
  const testBuffer = Buffer.from(testTxt, 'utf-8');

  // ================================================================
  // 1. CREATE MATERIAL
  // ================================================================
  console.log('\n[TEST 1] Creating new MCQ material...');
  const createdMat = await saveMcqMaterial({
    materialName: testName,
    course: 'CA_INTERMEDIATE',
    subject: 'Corporate and Other Laws',
    chapter: 'Management & Administration',
    topic: 'Quorum',
    materialType: 'MTP',
    source: 'ICAI',
    attempt: 'Nov 2026',
    status: 'Draft',
    fileBuffer: testBuffer,
    originalFilename: 'test_mtp_nov2026.txt',
    fileType: 'TXT',
    pageCount: 1,
    extractedText: testTxt,
    uploadedBy: 'usr_mcq_admin_priyatca15',
  });

  assert.ok(createdMat, 'Created material must be returned');
  assert.strictEqual(createdMat.material_name, testName);
  console.log('[PASS] Material created with ID:', createdMat.id);

  // ================================================================
  // 2. VERIFY IT EXISTS
  // ================================================================
  console.log('\n[TEST 2] Verifying material exists in database and listing...');
  const fetchedMat = getMcqMaterialById(createdMat.id);
  assert.ok(fetchedMat, 'Material must be retrievable by ID');
  assert.strictEqual(fetchedMat.material_name, testName);

  const listBefore = listMcqMaterials({ search: testName });
  assert.strictEqual(listBefore.total, 1, 'Listing must return exactly 1 record for this search');
  console.log('[PASS] Material verified in database and list.');

  // ================================================================
  // 3. GENERATE/LINK QUESTIONS TO THIS MATERIAL & VERIFY STUDENT ACCESS
  // ================================================================
  console.log('\n[TEST 3] Generating questions linked to this material...');
  const mockRows: ValidatedBulkRow[] = [
    {
      rowNumber: 1,
      isValid: true,
      errors: [],
      data: {
        course: 'CA_INTERMEDIATE',
        subject: 'Corporate and Other Laws',
        chapter: 'Management & Administration',
        topic: 'Quorum',
        questionType: 'normal',
        difficulty: 'moderate',
        source: 'ICAI Module',
        attempt: 'Nov 2026',
        questionText: `Under Section 103, what is quorum for company with 3000 members? [${testName}]`,
        optionA: '5 members',
        optionB: '15 members',
        optionC: '30 members',
        optionD: '10 members',
        correctAnswer: 'B',
        explanation: 'Section 103(1)(a)(ii) requires 15 members personally present.',
        status: 'published',
        source_material_id: createdMat.id,
      },
    },
  ];

  const commitResult = commitBulkQuestions(mockRows, 'usr_mcq_admin_priyatca15');
  assert.strictEqual(commitResult.importedCount, 1);
  const qId = commitResult.importedIds[0];
  console.log('[PASS] Created question linked to material:', qId);

  // Verify student practice session can see it before material is deleted
  const sessionResult = createSession('usr_user_at9767', {
    course: 'CA_INTERMEDIATE',
    subject: 'Corporate and Other Laws',
    chapter: 'Management & Administration',
    topic: 'Quorum',
    sessionType: 'practice',
    requestedCount: 5,
  });
  assert.ok('session' in sessionResult, 'Session must be created');
  console.log('[PASS] Student session created successfully before material deletion.');

  // ================================================================
  // 4. DELETE MATERIAL
  // ================================================================
  console.log('\n[TEST 4] Deleting material as authorized admin...');
  const deleteResult = await deleteMcqMaterial(createdMat.id);
  assert.strictEqual(deleteResult, true, 'deleteMcqMaterial must return true');
  console.log('[PASS] deleteMcqMaterial executed.');

  // ================================================================
  // 5. VERIFY MATERIAL DOES NOT EXIST IN GET OR LIST (REFRESH CHECK)
  // ================================================================
  console.log('\n[TEST 5] Verifying material is removed from reads and queries (refresh simulation)...');
  const fetchedAfterDelete = getMcqMaterialById(createdMat.id);
  assert.strictEqual(fetchedAfterDelete, null, 'getMcqMaterialById must return null for deleted material');

  const listAfterDelete = listMcqMaterials({ search: testName });
  assert.strictEqual(listAfterDelete.total, 0, 'listMcqMaterials must NOT contain deleted material');

  // Verify tombstone was recorded
  const tombstone = db.prepare("SELECT * FROM tombstones WHERE collection_name = 'mcq_materials' AND entity_id = ?").get(createdMat.id) as any;
  assert.ok(tombstone, 'Tombstone must be recorded in database');
  assert.strictEqual(tombstone.reason, 'ADMIN_DELETED');
  console.log('[PASS] Refresh simulation: Material does not return and tombstone is present.');

  // ================================================================
  // 6. VERIFY QUESTIONS FROM DELETED MATERIAL CANNOT RETURN TO STUDENT POOL
  // ================================================================
  console.log('\n[TEST 6] Verifying questions from deleted material cannot return to student pool...');
  const questionInDb = db.prepare('SELECT * FROM mcq_questions WHERE id = ?').get(qId) as any;
  assert.ok(!questionInDb || questionInDb.status === 'DELETED', 'Question must be removed or marked DELETED');

  // In admin question bank, deleted question must not show
  const adminQList = getAdminQuestions({ search: testName });
  assert.strictEqual(adminQList.questions.length, 0, 'Admin question list must exclude deleted questions');
  console.log('[PASS] Questions from deleted material cannot return to student question pool or admin list.');

  // ================================================================
  // 7. APPLICATION RE-INITIALIZATION & RESTORE RECONCILIATION TEST
  // ================================================================
  console.log('\n[TEST 7] Simulating container reboot, application reinitialization & Firestore hydration...');
  // Re-run initDatabase and initMcqMaterialTables (which run on every app startup)
  initDatabase();
  initMcqMaterialTables();
  seedMcqAdminAndQuestions();

  // Try hydration
  try {
    await hydrateFromFirestore();
  } catch (err) {
    console.warn('Hydration note in test:', err);
  }

  // Verify deleted material STILL does NOT return
  const checkAfterRestart = getMcqMaterialById(createdMat.id);
  assert.strictEqual(checkAfterRestart, null, 'Material must remain deleted after application restart/reinitialization');

  const listAfterRestart = listMcqMaterials({ search: testName });
  assert.strictEqual(listAfterRestart.total, 0, 'Material must NOT reappear in material library after restart');
  console.log('[PASS] Application restart test: Material remains permanently deleted.');

  // ================================================================
  // 8. ADMIN AUTHENTICATION REGRESSION TESTS
  // ================================================================
  console.log('\n[TEST 8] Admin Authentication & Access Control Verification...');

  // A. MCQ Admin login token generation
  const mcqAdminToken = generateToken({
    id: 'usr_mcq_admin_priyatca15',
    email: 'priyatca15@gmail.com',
    role: 'MCQ_ADMIN',
    fullName: 'Priya MCQ Administrator',
  });
  const decodedMcqAdmin = verifyAuthToken(mcqAdminToken);
  assert.ok(decodedMcqAdmin, 'MCQ Admin token must verify');
  assert.strictEqual(decodedMcqAdmin.role, 'MCQ_ADMIN');
  assert.strictEqual(decodedMcqAdmin.email, 'priyatca15@gmail.com');
  console.log('[PASS] MCQ Admin token successfully created and verified.');

  // B. Super Admin token generation
  const superAdminToken = generateToken({
    id: 'usr_super_admin_001',
    email: 'caexamchecker.support@gmail.com',
    role: 'SUPER_ADMIN',
    fullName: 'Super Administrator',
  });
  const decodedSuper = verifyAuthToken(superAdminToken);
  assert.ok(decodedSuper, 'Super Admin token must verify');
  assert.strictEqual(decodedSuper.role, 'SUPER_ADMIN');
  console.log('[PASS] Super Admin token successfully created and verified.');

  // C. Institute Admin credential verification
  const instituteAdmin = db.prepare('SELECT id, email, password_hash, role, status FROM users WHERE email = ?').get('institute@apexca.edu') as any;
  assert.ok(instituteAdmin, 'institute@apexca.edu must exist in database');
  assert.strictEqual(instituteAdmin.role, 'INSTITUTE_ADMIN');
  assert.strictEqual(instituteAdmin.status, 'ACTIVE');
  const instPwdOk = verifyPassword('ApexCA@2026', instituteAdmin.password_hash);
  assert.strictEqual(instPwdOk, true, 'institute@apexca.edu password must cryptographically match provisioned hash');
  console.log('[PASS] Institute Admin credentials verified cryptographically.');

  console.log('\n================================================================');
  console.log('✅ ALL REGRESSION TESTS PASSED CLEANLY (100% SUCCESS)');
  console.log('================================================================');
  process.exit(0);
}

runRegressionTests().catch((err) => {
  console.error('❌ Regression tests failed:', err);
  process.exit(1);
});
