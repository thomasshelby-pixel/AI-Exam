import assert from 'node:assert';
import { db, initDatabase, isTombstoned, getAllLocalTombstoneSet } from '../db.js';
import { deleteInstituteAccount } from '../services/instituteDeleteService.js';
import { hydrateFromFirestore, permanentlyDeleteFromFirestore } from '../services/firestoreSyncService.js';

console.log('========================================================================');
console.log('--- PRODUCTION INTEGRITY AUDIT: INSTITUTE DELETION FULL LIFECYCLE ---');
console.log('========================================================================\n');

async function runTests() {
  initDatabase();

  const stableTestInstituteId = 'inst_audit_test_e2e_lifecycle';
  const stableTestCode = 'AUDIT-E2E-2026';
  const stableTestEmail = 'e2e_audit_institute@caexamchecker.internal';
  const testAdminId = 'usr_inst_admin_audit_e2e';
  const testBatchId = 'batch_audit_e2e_01';
  const testStudentId = 'usr_student_unrelated_audit_e2e';

  const actor = {
    id: 'usr_super_admin_001',
    email: 'support@caexamcheckerai.com',
    role: 'SUPER_ADMIN',
  };

  // Setup an unrelated institute and student to verify non-interference (Requirement 9)
  const unrelatedInstituteId = 'inst_unrelated_active_001';
  db.prepare(`
    INSERT OR REPLACE INTO institutes (id, name, code, email, phone, contact_person, status, subscription_plan, max_students)
    VALUES (?, 'Unrelated Preserved Institute', 'UNREL-2026', 'unrelated@apexca.edu', '+919811223344', 'Director Unrelated', 'ACTIVE', 'INSTITUTIONAL_PRO', 200)
  `).run(unrelatedInstituteId);

  db.prepare(`
    INSERT OR REPLACE INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, 'unrelated_student@apexca.edu', 'HASH123', 'Preserved Student', 'STUDENT', 'ACTIVE')
  `).run(testStudentId);

  db.prepare(`
    INSERT OR REPLACE INTO student_profiles (user_id, icai_registration_number, ca_level, institute_id)
    VALUES (?, 'CRO111222', 'FINAL', ?)
  `).run(testStudentId, unrelatedInstituteId);

  // ---------------------------------------------------------------------------
  // STEP 1: CREATE THE TARGET INSTITUTE THROUGH ACCOUNT CREATION FLOW
  // ---------------------------------------------------------------------------
  console.log('[STEP 1] Provisioning test institute with admin, batch, and operational records...');

  db.prepare(`
    INSERT OR REPLACE INTO institutes (
      id, name, code, logo_url, email, phone, address, website,
      contact_person, status, subscription_plan, subscription_expires_at, max_students, created_at
    ) VALUES (
      ?, 'Audit E2E Institute of CA', ?, '', ?, '+919988776655',
      'Nariman Point, Mumbai', 'https://audite2e.edu', 'CA Auditor, FCA',
      'ACTIVE', 'INSTITUTIONAL_PRO', '2027-12-31T23:59:59.000Z', 500, CURRENT_TIMESTAMP
    )
  `).run(stableTestInstituteId, stableTestCode, stableTestEmail);

  // Add institute admin user
  db.prepare(`
    INSERT OR REPLACE INTO users (id, email, password_hash, full_name, phone, role, status, created_at, updated_at)
    VALUES (?, ?, 'HASH456', 'Auditor Admin', '+919988776655', 'INSTITUTE_ADMIN', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(testAdminId, stableTestEmail);

  // Add batch
  db.prepare(`
    INSERT OR REPLACE INTO batches (id, institute_id, name, course_level, description)
    VALUES (?, ?, 'E2E Audit Regular Batch', 'FINAL', 'Batch under test')
  `).run(testBatchId, stableTestInstituteId);

  // Add assignment
  const testAssignmentId = 'asgn_audit_e2e_01';
  db.prepare(`
    INSERT OR REPLACE INTO institute_assignments (id, institute_id, batch_id, title, subject_key, subject_name, maximum_marks, deadline)
    VALUES (?, ?, ?, 'FR Mock Test', 'fr', 'Financial Reporting', 100, '2026-12-31T23:59:59.000Z')
  `).run(testAssignmentId, stableTestInstituteId, testBatchId);

  // Add financial payment order to verify audit retention (Requirement: do not delete financial history)
  const testOrderId = 'order_audit_e2e_999';
  db.prepare(`
    INSERT OR REPLACE INTO payment_orders (id, student_id, razorpay_order_id, quantity, amount_paise, currency, status, created_at)
    VALUES (?, ?, 'order_rzp_e2e_999', 1, 499900, 'INR', 'PAID', CURRENT_TIMESTAMP)
  `).run(testOrderId, testAdminId);

  // ---------------------------------------------------------------------------
  // STEP 2: CONFIRM RECORDS EXIST IN PERSISTENCE LAYERS
  // ---------------------------------------------------------------------------
  console.log('[STEP 2] Verifying records exist in database prior to deletion...');

  const preInst = db.prepare('SELECT id, name FROM institutes WHERE id = ?').get(stableTestInstituteId) as any;
  assert.ok(preInst, 'Institute record must exist in SQLite');
  assert.strictEqual(preInst.name, 'Audit E2E Institute of CA');

  const preBatch = db.prepare('SELECT id FROM batches WHERE id = ?').get(testBatchId);
  assert.ok(preBatch, 'Batch record must exist in SQLite');

  const preUser = db.prepare('SELECT id FROM users WHERE id = ?').get(testAdminId);
  assert.ok(preUser, 'Institute admin user must exist in SQLite');

  console.log('  ✅ [PASS] Target institute records verified in SQLite.');

  // ---------------------------------------------------------------------------
  // STEP 3 & 4: AUTHORIZED DELETION EXECUTION & PERSISTENCE GUARANTEES
  // ---------------------------------------------------------------------------
  console.log('[STEP 3 & 4] Executing authorized permanent institute deletion...');

  const delResult = await deleteInstituteAccount(stableTestInstituteId, actor, '127.0.0.1', 'Audit-Suite/2026');
  assert.strictEqual(delResult.success, true, 'deleteInstituteAccount must return success: true');
  assert.strictEqual(delResult.deletedInstitute.id, stableTestInstituteId);

  // Verify immediate SQLite purge
  const postInst = db.prepare('SELECT id FROM institutes WHERE id = ?').get(stableTestInstituteId);
  assert.strictEqual(postInst, undefined, 'Institute must be deleted from institutes table');

  const postBatch = db.prepare('SELECT id FROM batches WHERE institute_id = ?').get(stableTestInstituteId);
  assert.strictEqual(postBatch, undefined, 'Batches must be removed');

  const postAssign = db.prepare('SELECT id FROM institute_assignments WHERE institute_id = ?').get(stableTestInstituteId);
  assert.strictEqual(postAssign, undefined, 'Assignments must be removed');

  // Verify local tombstones are authoritative
  assert.strictEqual(isTombstoned('institutes', stableTestInstituteId), true, 'Tombstone must exist for institute ID');
  assert.strictEqual(isTombstoned('institutes', stableTestCode), true, 'Tombstone must exist for institute code');
  assert.strictEqual(isTombstoned('institutes', stableTestEmail), true, 'Tombstone must exist for institute email');

  // Verify financial retention: payment order preserved and re-linked or kept intact
  const orderCheck = db.prepare('SELECT id, student_id FROM payment_orders WHERE id = ?').get(testOrderId) as any;
  assert.ok(orderCheck, 'Payment order MUST NOT be deleted during institute deletion (financial audit retention guarantee)');

  console.log('  ✅ [PASS] Permanent deletion guarantees verified: records purged, tombstones written, financial history preserved.');

  // ---------------------------------------------------------------------------
  // STEP 5: REFRESH ADMIN INSTITUTE LIST & CONFIRM ABSENT
  // ---------------------------------------------------------------------------
  console.log('[STEP 5] Refreshing admin institute list and verifying absence...');

  const allInstitutes = db.prepare('SELECT id, code FROM institutes').all() as any[];
  const foundInList = allInstitutes.some((i) => i.id === stableTestInstituteId || i.code === stableTestCode);
  assert.strictEqual(foundInList, false, 'Deleted institute must NOT appear in admin institutes list');

  console.log('  ✅ [PASS] Deleted institute absent from admin institute list.');

  // ---------------------------------------------------------------------------
  // STEP 6 & 7: SIMULATE APPLICATION RESTART, BASELINE SEEDING & HYDRATION
  // ---------------------------------------------------------------------------
  console.log('[STEP 6 & 7] Simulating container restart, database re-initialization, and Firestore hydration...');

  initDatabase();
  await hydrateFromFirestore();

  const postRestartInst = db.prepare('SELECT id FROM institutes WHERE id = ?').get(stableTestInstituteId);
  assert.strictEqual(postRestartInst, undefined, 'Deleted institute MUST NOT resurrect after restart or hydration');

  console.log('  ✅ [PASS] Zero resurrection confirmed across restart, baseline seeding, and hydration.');

  // ---------------------------------------------------------------------------
  // STEP 8: REPEATED DELETION REQUESTS & STALE CLOUD DATA RECONCILIATION
  // ---------------------------------------------------------------------------
  console.log('[STEP 8] Testing repeated deletion requests (Idempotency) and stale cloud data reconciliation...');

  // Repeated deletion request on already-deleted institute
  const retryResult = await deleteInstituteAccount(stableTestInstituteId, actor, '127.0.0.1', 'Audit-Suite/2026');
  assert.strictEqual(retryResult.success, true, 'Repeated deletion call must succeed idempotently');
  assert.strictEqual(retryResult.alreadyDeleted, true, 'Repeated deletion must indicate alreadyDeleted: true');

  // Simulate stale cloud document attempting to re-insert the deleted institute directly into SQLite (stale cloud sync simulation)
  db.prepare(`
    INSERT OR REPLACE INTO institutes (id, name, code, email, phone, contact_person, status)
    VALUES (?, 'Resurrected Ghost Institute', ?, ?, '+919988776655', 'Ghost Contact', 'ACTIVE')
  `).run(stableTestInstituteId, stableTestCode, stableTestEmail);

  // Run hydration: hydration must recognize the tombstone and PURGE the resurrecting ghost immediately
  await hydrateFromFirestore();

  const ghostCheck = db.prepare('SELECT id FROM institutes WHERE id = ?').get(stableTestInstituteId);
  assert.strictEqual(ghostCheck, undefined, 'Hydration must purge stale ghost institute matching tombstone');

  console.log('  ✅ [PASS] Idempotent repeat deletion verified and stale cloud resurrection prevented.');

  // ---------------------------------------------------------------------------
  // STEP 9: UNRELATED INSTITUTES AND STUDENTS REMAIN INTACT
  // ---------------------------------------------------------------------------
  console.log('[STEP 9] Confirming unrelated institutes and their students remain completely intact...');

  const unrelatedInstCheck = db.prepare('SELECT id, name, status FROM institutes WHERE id = ?').get(unrelatedInstituteId) as any;
  assert.ok(unrelatedInstCheck, 'Unrelated institute must remain intact');
  assert.strictEqual(unrelatedInstCheck.name, 'Unrelated Preserved Institute');
  assert.strictEqual(unrelatedInstCheck.status, 'ACTIVE');

  const unrelatedStudentCheck = db.prepare('SELECT id, email, status FROM users WHERE id = ?').get(testStudentId) as any;
  assert.ok(unrelatedStudentCheck, 'Student account must remain intact');
  assert.strictEqual(unrelatedStudentCheck.status, 'ACTIVE');

  console.log('  ✅ [PASS] Unrelated institutes and student accounts remain intact and unharmed.');

  console.log('\n========================================================================');
  console.log('🎉 ALL 9 INSTITUTE DELETION LIFECYCLE CHECKS PASSED WITH ZERO RESURRECTION');
  console.log('========================================================================\n');
}

runTests().then(() => {
  console.log('Test completed successfully.');
  process.exit(0);
}).catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
