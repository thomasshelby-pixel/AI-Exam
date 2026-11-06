import assert from 'node:assert/strict';
import express from 'express';
import { db, initDatabase } from '../db.js';
import { generateToken } from '../auth.js';
import { getCurrentServerMonth } from '../services/studentCreditService.js';
import adminRoutes from '../routes/adminRoutes.js';

async function run() {
  initDatabase();

  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const studentId = `usr_admin_reconcile_${suffix}`;
  const legacyStudentId = `usr_admin_reconcile_legacy_${suffix}`;
  const email = `admin_reconcile_${suffix}@example.com`;
  const legacyEmail = email.toUpperCase();
  const reviewEvaluationId = `eval_admin_review_${suffix}`;
  const processingEvaluationId = `eval_admin_processing_${suffix}`;
  const currentMonth = getCurrentServerMonth();

  const token = generateToken({
    id: 'usr_super_admin_001',
    email: 'support@caexamcheckerai.com',
    role: 'SUPER_ADMIN',
    fullName: 'Super Admin Examiner',
  });

  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    db.prepare(`
      INSERT INTO users (
        id, email, password_hash, full_name, role, status, email_verified, account_classification
      ) VALUES (?, ?, 'test-hash', 'Admin Reconcile Student', 'STUDENT', 'ACTIVE', 1, 'NORMAL')
    `).run(studentId, email);

    db.prepare(`
      INSERT INTO student_profiles (
        user_id, icai_registration_number, ca_level,
        free_evaluations_used, monthly_free_evaluations_used, monthly_free_evaluations_limit,
        free_trial_blocked, free_evaluation_reset_month, purchased_credits, paid_credits
      ) VALUES (?, 'WRO9876543', 'INTERMEDIATE', 1, 1, 2, 0, ?, 0, 0)
    `).run(studentId, currentMonth);

    db.prepare(`
      INSERT INTO users (
        id, email, password_hash, full_name, role, status, email_verified, account_classification
      ) VALUES (?, ?, 'test-hash', 'Admin Reconcile Legacy Student', 'STUDENT', 'ACTIVE', 1, 'NORMAL')
    `).run(legacyStudentId, legacyEmail);

    db.prepare(`
      INSERT INTO student_profiles (
        user_id, icai_registration_number, ca_level,
        free_evaluations_used, monthly_free_evaluations_used, monthly_free_evaluations_limit,
        free_trial_blocked, free_evaluation_reset_month, purchased_credits, paid_credits
      ) VALUES (?, 'WRO9876544', 'INTERMEDIATE', 1, 1, 2, 0, ?, 0, 0)
    `).run(legacyStudentId, currentMonth);

    db.prepare(`
      INSERT INTO credit_ledger (id, student_id, amount, source, balance_after, evaluation_id, note, created_at)
      VALUES
        (?, ?, -1, 'FREE_MONTHLY_EVALUATION', 1, ?, 'Consumed monthly free evaluation', CURRENT_TIMESTAMP),
        (?, ?, -1, 'FREE_MONTHLY_EVALUATION', 0, ?, 'Consumed monthly free evaluation', CURRENT_TIMESTAMP)
    `).run(
      `cld_review_${suffix}`, legacyStudentId, reviewEvaluationId,
      `cld_processing_${suffix}`, studentId, processingEvaluationId
    );

    db.prepare(`
      INSERT INTO evaluations (
        id, student_id, level, material_type, subject_key, subject_name, paper, attempt,
        original_filename, checking_mode, status, entitlement_source, consumed_from_personal_credits
      ) VALUES
        (?, ?, 'INTERMEDIATE', 'PYQ', 'inter_advanced_accounting', 'Advanced Accounting', 'Paper 1', 'May 2027',
         'review.pdf', 'standard', 'NEEDS_REVIEW', 'PERSONAL_FREE', 1),
        (?, ?, 'INTERMEDIATE', 'PYQ', 'inter_advanced_accounting', 'Advanced Accounting', 'Paper 1', 'May 2027',
         'processing.pdf', 'standard', 'PROCESSING', 'PERSONAL_FREE', 1)
    `).run(reviewEvaluationId, legacyStudentId, processingEvaluationId, studentId);

    const request = () => fetch(
      `${baseUrl}/api/admin/students?search=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const firstResponse = await request();
    assert.equal(firstResponse.status, 200, 'Admin student list should load');
    const firstBody = await firstResponse.json() as any;
    const student = firstBody.students?.find((item: any) => item.id === studentId);
    assert.ok(student, 'New test student should appear in admin student list');

    assert.equal(student.total_evaluations_count, 2, 'Both evaluation records remain in the total count');
    assert.equal(student.pending_review_count, 1, 'The NEEDS_REVIEW evaluation remains visible for review');
    assert.equal(student.monthly_free_evaluations_used, 1, 'Only the still-processing evaluation remains charged');
    assert.equal(student.monthly_free_evaluations_remaining, 1, 'The NEEDS_REVIEW evaluation restores one free slot');

    const reviewRow = db.prepare(
      'SELECT consumed_from_personal_credits FROM evaluations WHERE id = ?'
    ).get(reviewEvaluationId) as any;
    const processingRow = db.prepare(
      'SELECT consumed_from_personal_credits FROM evaluations WHERE id = ?'
    ).get(processingEvaluationId) as any;
    assert.equal(Number(reviewRow.consumed_from_personal_credits), 0, 'Review-required evaluation has its consumption marker cleared');
    assert.equal(Number(processingRow.consumed_from_personal_credits), 1, 'Processing evaluation is not prematurely refunded');

    const refundCountBeforeRepeat = db.prepare(`
      SELECT COUNT(*) AS count FROM credit_ledger
      WHERE student_id = ? AND evaluation_id = ? AND source = 'REFUND_MONTHLY_FREE'
    `).get(studentId, reviewEvaluationId) as any;
    assert.equal(Number(refundCountBeforeRepeat.count), 1, 'Exactly one refund ledger entry exists for NEEDS_REVIEW');

    const secondResponse = await request();
    assert.equal(secondResponse.status, 200, 'A repeated admin list read should remain successful');
    const secondBody = await secondResponse.json() as any;
    const secondStudent = secondBody.students?.find((item: any) => item.id === studentId);
    assert.equal(secondStudent.monthly_free_evaluations_used, 1, 'Repeated admin reads do not change the remaining usage');
    assert.equal(secondStudent.monthly_free_evaluations_remaining, 1, 'Repeated admin reads do not mint extra allowance');

    const refundCountAfterRepeat = db.prepare(`
      SELECT COUNT(*) AS count FROM credit_ledger
      WHERE student_id = ? AND evaluation_id = ? AND source = 'REFUND_MONTHLY_FREE'
    `).get(studentId, reviewEvaluationId) as any;
    assert.equal(Number(refundCountAfterRepeat.count), 1, 'Repeated reconciliation remains idempotent');

    const detailResponse = await fetch(`${baseUrl}/api/admin/students/${studentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(detailResponse.status, 200, 'Admin student detail should load');
    const detailBody = await detailResponse.json() as any;
    assert.equal(detailBody.recentEvaluations.length, 2, 'Student detail includes current and same-email legacy evaluation records');

    console.log('✅ Admin credit reconciliation passed: NEEDS_REVIEW refunded once; PROCESSING remains charged.');
  } finally {
    db.prepare('DELETE FROM credit_ledger WHERE student_id IN (?, ?)').run(studentId, legacyStudentId);
    db.prepare('DELETE FROM evaluations WHERE student_id IN (?, ?)').run(studentId, legacyStudentId);
    db.prepare('DELETE FROM student_profiles WHERE user_id IN (?, ?)').run(studentId, legacyStudentId);
    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(studentId, legacyStudentId);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

run().catch((error) => {
  console.error('❌ Admin recovery credit reconciliation test failed:', error);
  process.exitCode = 1;
});
