import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, initDatabase } from '../db.js';
import {
  ensureInstituteStarterTrial,
  getActiveInstituteSubscription,
  reserveInstituteEvaluationCredit,
  finalizeInstituteEvaluationCredit,
  releaseInstituteEvaluationCredit,
  INSTITUTE_FREE_TRIAL_DAYS,
  INSTITUTE_FREE_TRIAL_STUDENT_CAPACITY,
  INSTITUTE_FREE_TRIAL_EVALUATION_CREDITS,
} from '../services/instituteTrialService.js';

initDatabase();

function createInstituteAdmin() {
  const id = `usr_institute_trial_${crypto.randomBytes(6).toString('hex')}`;
  const email = `${id}@example.com`;
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, ?, 'hash', 'Institute Trial Test Admin', 'INSTITUTE_ADMIN', 'ACTIVE')
  `).run(id, email);
  // Institute signup/login currently does not set the general email_verified flag.
  return { id, email };
}

function createInstitute(adminEmail: string) {
  const id = `inst_trial_${crypto.randomBytes(6).toString('hex')}`;
  db.prepare(`
    INSERT INTO institutes (
      id, name, code, email, phone, contact_person, status, subscription_plan, max_students
    ) VALUES (?, 'Starter Trial Test Institute', ?, ?, '9999999999', 'Trial Admin', 'ACTIVE', 'NONE', 50)
  `).run(id, `TRIAL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`, adminEmail);
  return id;
}

async function run() {
  const admin = createInstituteAdmin();
  const instituteId = createInstitute(admin.email);

  try {
    const granted = ensureInstituteStarterTrial({
      instituteId,
      adminUserId: admin.id,
      adminEmail: admin.email,
    });
    assert.equal(granted.granted, true);
    assert.ok(granted.subscriptionId);
    assert.ok(granted.expiresAt);

    const active = getActiveInstituteSubscription(instituteId);
    assert.ok(active);
    assert.equal(active.plan_id, 'FREE_STARTER_TRIAL_V1');
    assert.equal(active.plan_name, 'Free Starter Trial');
    assert.equal(active.billing_cycle, 'TRIAL');
    assert.equal(Number(active.price_inr), 0);
    assert.equal(Number(active.student_capacity), INSTITUTE_FREE_TRIAL_STUDENT_CAPACITY);
    assert.equal(Number(active.evaluation_allowance), INSTITUTE_FREE_TRIAL_EVALUATION_CREDITS);
    assert.equal(Number(active.evaluations_used), 0);
    assert.equal(Number(active.evaluations_remaining), 50);

    const trialDays = (Date.parse(active.expiry_date) - Date.parse(active.start_date)) / (24 * 60 * 60 * 1000);
    assert.ok(Math.abs(trialDays - INSTITUTE_FREE_TRIAL_DAYS) < 0.01);

    const secondAttempt = ensureInstituteStarterTrial({
      instituteId,
      adminUserId: admin.id,
      adminEmail: admin.email,
    });
    assert.equal(secondAttempt.granted, false);
    assert.equal(getActiveInstituteSubscription(instituteId)?.id, active.id);

    const studentId = admin.id;
    const evaluationIds = Array.from({ length: 50 }, (_, i) => `eval_trial_${i + 1}_${crypto.randomBytes(3).toString('hex')}`);

    for (const evaluationId of evaluationIds) {
      const reservation = reserveInstituteEvaluationCredit({
        instituteId,
        studentId,
        evaluationId,
      });
      assert.equal(reservation.alreadyReserved, false);
      assert.equal(reservation.alreadyConsumed, false);
    }

    const exhausted = getActiveInstituteSubscription(instituteId);
    assert.ok(exhausted);
    assert.equal(Number(exhausted.evaluations_used), 50);
    assert.equal(Number(exhausted.evaluations_remaining), 0);

    assert.throws(
      () => reserveInstituteEvaluationCredit({
        instituteId,
        studentId,
        evaluationId: `eval_trial_over_limit_${crypto.randomBytes(4).toString('hex')}`,
      }),
      /INSTITUTE_EVALUATION_QUOTA_EXHAUSTED/,
    );

    // Duplicate reservation for the same evaluation must not deduct twice.
    const duplicate = reserveInstituteEvaluationCredit({
      instituteId,
      studentId,
      evaluationId: evaluationIds[0],
    });
    assert.equal(duplicate.alreadyReserved, true);
    assert.equal(Number(getActiveInstituteSubscription(instituteId)?.evaluations_remaining), 0);

    // Successful completion finalises the reservation; repeated completion is idempotent.
    finalizeInstituteEvaluationCredit({ instituteId, studentId, evaluationId: evaluationIds[0] });
    finalizeInstituteEvaluationCredit({ instituteId, studentId, evaluationId: evaluationIds[0] });
    const consumedRow = db.prepare(
      'SELECT action_type FROM institute_usage_ledger WHERE idempotency_key = ?'
    ).get(`inst_eval_${evaluationIds[0]}`) as any;
    assert.equal(consumedRow.action_type, 'CONSUMED');
    assert.equal(releaseInstituteEvaluationCredit({
      evaluationId: evaluationIds[0],
      reason: 'Already completed',
    }), false);

    // Needs-review / failed run releases one pending reservation; a real retry can reserve it again.
    assert.equal(releaseInstituteEvaluationCredit({
      evaluationId: evaluationIds[1],
      reason: 'Needs review',
    }), true);
    assert.equal(Number(getActiveInstituteSubscription(instituteId)?.evaluations_remaining), 1);
    assert.equal(Number(getActiveInstituteSubscription(instituteId)?.evaluations_used), 49);

    const retried = reserveInstituteEvaluationCredit({
      instituteId,
      studentId,
      evaluationId: evaluationIds[1],
    });
    assert.equal(retried.alreadyReserved, false);
    assert.equal(Number(getActiveInstituteSubscription(instituteId)?.evaluations_remaining), 0);
    finalizeInstituteEvaluationCredit({ instituteId, studentId, evaluationId: evaluationIds[1] });
    assert.equal(Number(getActiveInstituteSubscription(instituteId)?.evaluations_used), 50);

    console.log('✅ Institute starter trial and shared quota tests passed.');
  } finally {
    db.prepare('DELETE FROM institute_usage_ledger WHERE institute_id = ?').run(instituteId);
    db.prepare('DELETE FROM institute_trial_claims WHERE institute_id = ?').run(instituteId);
    db.prepare('DELETE FROM institute_subscriptions WHERE institute_id = ?').run(instituteId);
    db.prepare('DELETE FROM institute_memberships WHERE institute_id = ?').run(instituteId);
    db.prepare('DELETE FROM institutes WHERE id = ?').run(instituteId);
    db.prepare('DELETE FROM student_profiles WHERE user_id = ?').run(admin.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(admin.id);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
