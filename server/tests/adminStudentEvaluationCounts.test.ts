import assert from 'node:assert/strict';
import express from 'express';
import { db, initDatabase } from '../db.js';
import { generateToken } from '../auth.js';
import adminRoutes from '../routes/adminRoutes.js';

console.log('========================================================================');
console.log('--- ADMIN STUDENT EVALUATION COUNTS & AGGREGATION REGRESSION SUITE ---');
console.log('========================================================================\n');

async function run() {
  initDatabase();

  const adminToken = generateToken({
    id: 'usr_super_admin_001',
    email: 'support@caexamcheckerai.com',
    role: 'SUPER_ADMIN',
    fullName: 'Super Admin Examiner',
  });

  const authHeaders = {
    Authorization: `Bearer ${adminToken}`,
  };

  // Spin up an ephemeral Express test server mounting adminRoutes
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const ts = Date.now();
  const studentA = `usr_test_eval_count_a_${ts}`;
  const studentB = `usr_test_eval_count_b_${ts}`;
  const emailA = `eval_count_a_${ts}@example.com`;
  const emailB = `eval_count_b_${ts}@example.com`;

  try {
    // Clean up test collisions
    db.prepare('DELETE FROM evaluations WHERE student_id IN (?, ?)').run(studentA, studentB);
    db.prepare('DELETE FROM student_profiles WHERE user_id IN (?, ?)').run(studentA, studentB);
    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(studentA, studentB);

    // Seed Student A
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, status, account_classification, created_at, updated_at)
      VALUES (?, ?, 'hash', 'Student Alpha', 'STUDENT', 'ACTIVE', 'NORMAL', datetime('now'), datetime('now'))
    `).run(studentA, emailA);

    db.prepare(`
      INSERT INTO student_profiles (user_id, student_code, icai_registration_number, ca_level, monthly_free_evaluations_used, monthly_free_evaluations_limit, free_evaluation_reset_month, purchased_credits)
      VALUES (?, 'ST-ALPH', 'WRO111111', 'INTERMEDIATE', 0, 2, '2026-10', 0)
    `).run(studentA);

    // Seed Student B (Unrelated student)
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, status, account_classification, created_at, updated_at)
      VALUES (?, ?, 'hash', 'Student Beta', 'STUDENT', 'ACTIVE', 'NORMAL', datetime('now'), datetime('now'))
    `).run(studentB, emailB);

    db.prepare(`
      INSERT INTO student_profiles (user_id, student_code, icai_registration_number, ca_level, monthly_free_evaluations_used, monthly_free_evaluations_limit, free_evaluation_reset_month, purchased_credits)
      VALUES (?, 'ST-BETA', 'WRO222222', 'FINAL', 0, 2, '2026-10', 0)
    `).run(studentB);

    // ------------------------------------------------------------------------------------------------
    // TEST 1: Student with two NEEDS_REVIEW records shows Total = 2, Completed = 0, and Needs Review = 2
    // ------------------------------------------------------------------------------------------------
    {
      db.prepare(`
        INSERT INTO evaluations (id, student_id, level, material_type, subject_key, subject_name, paper, total_marks, maximum_marks, percentage, status, original_filename, checking_mode, created_at)
        VALUES
          (?, ?, 'INTERMEDIATE', 'PYQ', 'tax', 'Taxation', 'Paper 3', 35, 100, 35, 'NEEDS_REVIEW', 'ans1.pdf', 'standard', datetime('now', '-2 hours')),
          (?, ?, 'INTERMEDIATE', 'PYQ', 'cma', 'Cost Management', 'Paper 4', 65, 100, 65, 'NEEDS_REVIEW', 'ans2.pdf', 'standard', datetime('now', '-1 hours'))
      `).run(`eval_${studentA}_1`, studentA, `eval_${studentA}_2`, studentA);

      const resList = await fetch(`${baseUrl}/api/admin/students?search=${encodeURIComponent(emailA)}`, { headers: authHeaders }).then((r) => r.json());
      const studentData = resList.students?.find((s: any) => s.id === studentA);

      assert.ok(studentData, 'Student A should be found in GET /api/admin/students');
      assert.equal(studentData.total_evaluations_count, 2, 'Total evaluations should be 2');
      assert.equal(studentData.evaluations_count, 2, 'evaluations_count alias should be 2');
      assert.equal(studentData.completed_evaluations_count, 0, 'Completed count should be 0');
      assert.equal(studentData.pending_review_count, 2, 'Needs Review count should be 2');
      assert.equal(studentData.average_percentage, null, 'Average percentage should be null when 0 completed');

      console.log('[PASS] TEST 1: Student with two NEEDS_REVIEW evaluations correctly reports Total=2, Completed=0, Needs Review=2, and null average score.');
    }

    // ------------------------------------------------------------------------------------------------
    // TEST 2 & 3: Completed evaluations are counted correctly and average includes ONLY completed evaluations
    // ------------------------------------------------------------------------------------------------
    {
      // Add 2 COMPLETED evaluations for Student A with marks 80% and 60% (avg = 70%)
      db.prepare(`
        INSERT INTO evaluations (id, student_id, level, material_type, subject_key, subject_name, paper, total_marks, maximum_marks, percentage, status, original_filename, checking_mode, created_at)
        VALUES
          (?, ?, 'INTERMEDIATE', 'PYQ', 'acc', 'Accounting', 'Paper 1', 80, 100, 80, 'COMPLETED', 'ans3.pdf', 'standard', datetime('now', '-30 minutes')),
          (?, ?, 'INTERMEDIATE', 'PYQ', 'law', 'Law', 'Paper 2', 60, 100, 60, 'COMPLETED', 'ans4.pdf', 'standard', datetime('now', '-10 minutes'))
      `).run(`eval_${studentA}_3`, studentA, `eval_${studentA}_4`, studentA);

      const resList = await fetch(`${baseUrl}/api/admin/students?search=${encodeURIComponent(emailA)}`, { headers: authHeaders }).then((r) => r.json());
      const studentData = resList.students?.find((s: any) => s.id === studentA);

      assert.ok(studentData, 'Student A should be found');
      // Now Student A has: 2 NEEDS_REVIEW (35%, 65%) + 2 COMPLETED (80%, 60%) = 4 Total
      assert.equal(studentData.total_evaluations_count, 4, 'Total evaluations should now be 4');
      assert.equal(studentData.completed_evaluations_count, 2, 'Completed count should be 2');
      assert.equal(studentData.pending_review_count, 2, 'Needs Review count should remain 2');
      // Average percentage must be (80 + 60) / 2 = 70.0 (NOT (35 + 65 + 80 + 60) / 4 = 60.0)
      assert.equal(Math.round(studentData.average_percentage), 70, 'Average percentage must be based exclusively on completed evaluations (70%)');

      console.log('[PASS] TEST 2 & 3: Completed evaluations are counted accurately and average percentage strictly excludes unreviewed evaluations.');
    }

    // ------------------------------------------------------------------------------------------------
    // TEST 4: Mixed statuses (PROCESSING, FAILED) are included in total but not counted as completed or needs_review
    // ------------------------------------------------------------------------------------------------
    {
      db.prepare(`
        INSERT INTO evaluations (id, student_id, level, material_type, subject_key, subject_name, paper, total_marks, maximum_marks, percentage, status, original_filename, checking_mode, created_at)
        VALUES
          (?, ?, 'INTERMEDIATE', 'PYQ', 'aud', 'Audit', 'Paper 5', 0, 100, 0, 'PROCESSING', 'ans5.pdf', 'standard', datetime('now')),
          (?, ?, 'INTERMEDIATE', 'PYQ', 'fm', 'Financial Management', 'Paper 6', 0, 100, 0, 'FAILED', 'ans6.pdf', 'standard', datetime('now'))
      `).run(`eval_${studentA}_5`, studentA, `eval_${studentA}_6`, studentA);

      const resList = await fetch(`${baseUrl}/api/admin/students?search=${encodeURIComponent(emailA)}`, { headers: authHeaders }).then((r) => r.json());
      const studentData = resList.students?.find((s: any) => s.id === studentA);

      // Total is now 4 + 2 = 6
      assert.equal(studentData.total_evaluations_count, 6, 'Total evaluations count should be 6');
      assert.equal(studentData.completed_evaluations_count, 2, 'Completed evaluations count should remain 2');
      assert.equal(studentData.pending_review_count, 2, 'Pending review count should remain 2');

      console.log('[PASS] TEST 4: Mixed statuses (PROCESSING, FAILED) increment total count without polluting completed or review counters.');
    }

    // ------------------------------------------------------------------------------------------------
    // TEST 5: Duplicate joins do not inflate evaluation counts
    // ------------------------------------------------------------------------------------------------
    {
      // Add referral redemptions or permanent free entitlements which join with users
      db.prepare(`
        INSERT INTO referral_redemptions (id, user_id, user_email, referral_code, benefit_type, redemption_number, status, max_evaluations, evaluations_used, evaluations_remaining, redeemed_at, expiry_date)
        VALUES
          (?, ?, ?, 'AI30', 'EVALUATION_CREDITS', 1, 'ACTIVE', 15, 0, 15, datetime('now'), datetime('now', '+30 days')),
          (?, ?, ?, 'BONUS10', 'EVALUATION_CREDITS', 2, 'ACTIVE', 10, 0, 10, datetime('now'), datetime('now', '+15 days'))
      `).run(`ref_${studentA}_1`, studentA, emailA, `ref_${studentA}_2`, studentA, emailA);

      const resList = await fetch(`${baseUrl}/api/admin/students?search=${encodeURIComponent(emailA)}`, { headers: authHeaders }).then((r) => r.json());
      const studentData = resList.students?.find((s: any) => s.id === studentA);

      assert.equal(studentData.total_evaluations_count, 6, 'Total evaluations must still be exactly 6 despite multiple joined records');
      assert.equal(studentData.completed_evaluations_count, 2, 'Completed count must remain 2');
      assert.equal(studentData.pending_review_count, 2, 'Pending review count must remain 2');

      console.log('[PASS] TEST 5: Multiple joined entitlement rows do not inflate DISTINCT evaluation counts.');
    }

    // ------------------------------------------------------------------------------------------------
    // TEST 6: Individual student details endpoint (GET /api/admin/students/:id) agrees with student list
    // ------------------------------------------------------------------------------------------------
    {
      const resDetail = await fetch(`${baseUrl}/api/admin/students/${studentA}`, { headers: authHeaders }).then((r) => r.json());
      assert.ok(resDetail.student, 'Student details must be returned');

      assert.equal(resDetail.student.total_evaluations_count, 6, 'Detail total count must be 6');
      assert.equal(resDetail.student.evaluations_count, 6, 'Detail evaluations_count alias must be 6');
      assert.equal(resDetail.student.completed_evaluations_count, 2, 'Detail completed count must be 2');
      assert.equal(resDetail.student.pending_review_count, 2, 'Detail pending review count must be 2');
      assert.equal(Math.round(resDetail.student.average_percentage), 70, 'Detail average percentage must match 70%');

      console.log('[PASS] TEST 6: GET /api/admin/students/:id metrics perfectly agree with GET /api/admin/students.');
    }

    // ------------------------------------------------------------------------------------------------
    // TEST 7: Unrelated students records are not included in each others metrics
    // ------------------------------------------------------------------------------------------------
    {
      // Student B has 1 COMPLETED evaluation with 90%
      db.prepare(`
        INSERT INTO evaluations (id, student_id, level, material_type, subject_key, subject_name, paper, total_marks, maximum_marks, percentage, status, original_filename, checking_mode, created_at)
        VALUES (?, ?, 'FINAL', 'PYQ', 'fr', 'Financial Reporting', 'Paper 1', 90, 100, 90, 'COMPLETED', 'ans_b.pdf', 'standard', datetime('now'))
      `).run(`eval_${studentB}_1`, studentB);

      const resListB = await fetch(`${baseUrl}/api/admin/students?search=${encodeURIComponent(emailB)}`, { headers: authHeaders }).then((r) => r.json());
      const studentBData = resListB.students?.find((s: any) => s.id === studentB);

      assert.ok(studentBData, 'Student B should be found');
      assert.equal(studentBData.total_evaluations_count, 1, 'Student B total evaluations should be 1');
      assert.equal(studentBData.completed_evaluations_count, 1, 'Student B completed count should be 1');
      assert.equal(studentBData.pending_review_count, 0, 'Student B pending review count should be 0');
      assert.equal(Math.round(studentBData.average_percentage), 90, 'Student B average percentage should be 90%');

      console.log('[PASS] TEST 7: Unrelated students evaluations are strictly isolated.');
    }

    // ------------------------------------------------------------------------------------------------
    // TEST 8: Acceptance Criterion — Verify Mansi Ganeriwala's actual database records
    // ------------------------------------------------------------------------------------------------
    {
      const mansiUser = db.prepare("SELECT id, email, full_name FROM users WHERE email = 'mansiganeriwala@gmail.com'").get() as any;
      if (mansiUser) {
        const mansiListRes = await fetch(`${baseUrl}/api/admin/students?search=mansiganeriwala`, { headers: authHeaders }).then((r) => r.json());
        const mansiList = mansiListRes.students?.find((s: any) => s.id === mansiUser.id);
        const mansiDetailRes = await fetch(`${baseUrl}/api/admin/students/${mansiUser.id}`, { headers: authHeaders }).then((r) => r.json());
        const mansiDetail = mansiDetailRes.student;

        // Verify Acceptance Criteria:
        // 1. Total evaluations = 2
        // 2. Completed evaluations = 0
        // 3. Needs Review = 2
        // 4. Average percentage = null (or not treating missing completed data as 0%)
        assert.equal(mansiList.total_evaluations_count, 2, 'Mansi total_evaluations_count should be 2');
        assert.equal(mansiList.completed_evaluations_count, 0, 'Mansi completed_evaluations_count should be 0');
        assert.equal(mansiList.pending_review_count, 2, 'Mansi pending_review_count should be 2');
        assert.equal(mansiList.average_percentage, null, 'Mansi average_percentage should be null');

        assert.equal(mansiDetail.total_evaluations_count, 2, 'Mansi detail total_evaluations_count should be 2');
        assert.equal(mansiDetail.completed_evaluations_count, 0, 'Mansi detail completed_evaluations_count should be 0');
        assert.equal(mansiDetail.pending_review_count, 2, 'Mansi detail pending_review_count should be 2');
        assert.equal(mansiDetail.average_percentage, null, 'Mansi detail average_percentage should be null');

        // Verify marks and status were NOT modified
        const mansiEvals = db.prepare('SELECT id, status, total_marks, maximum_marks FROM evaluations WHERE student_id = ? ORDER BY created_at ASC').all(mansiUser.id) as any[];
        assert.equal(mansiEvals.length, 2, 'Mansi should have exactly 2 evaluation records');
        assert.equal(mansiEvals[0].status, 'NEEDS_REVIEW', 'Evaluation 1 must remain NEEDS_REVIEW');
        assert.equal(mansiEvals[0].total_marks, 22.5, 'Evaluation 1 marks must remain intact (22.5)');
        assert.equal(mansiEvals[1].status, 'NEEDS_REVIEW', 'Evaluation 2 must remain NEEDS_REVIEW');
        assert.equal(mansiEvals[1].total_marks, 66.0, 'Evaluation 2 marks must remain intact (66.0)');

        console.log('[PASS] TEST 8 (ACCEPTANCE CRITERION): Mansi Ganeriwala correctly displays Total=2, Completed=0, Needs Review=2 without altering evaluations, marks, or status.');
      } else {
        console.warn('[SKIP] TEST 8: Mansi Ganeriwala user not present in current test environment.');
      }
    }

    console.log('\n========================================================================');
    console.log('--- ALL REGRESSION & ACCEPTANCE TESTS PASSED SUCCESSFULLY! ---');
    console.log('========================================================================');
  } finally {
    // Clean up test data
    server.close();
    db.prepare('DELETE FROM referral_redemptions WHERE user_id IN (?, ?)').run(studentA, studentB);
    db.prepare('DELETE FROM evaluations WHERE student_id IN (?, ?)').run(studentA, studentB);
    db.prepare('DELETE FROM student_profiles WHERE user_id IN (?, ?)').run(studentA, studentB);
    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(studentA, studentB);
  }
}

run().catch((err) => {
  console.error('[FAIL] Admin student evaluation counts test failed:', err);
  process.exitCode = 1;
});
