import crypto from 'node:crypto';
import { db, initDatabase } from '../db.js';
import { ensureMonthlyFreeEvaluationsReset, getCurrentServerMonth } from '../services/studentCreditService.js';

initDatabase();

let passed = 0;
let total = 0;

function assert(condition: boolean, message: string) {
  total++;
  if (condition) {
    passed++;
    console.log('[PASS] ' + message);
  } else {
    console.error('[FAIL] ' + message);
    process.exitCode = 1;
  }
}

const suffix = crypto.randomBytes(6).toString('hex');
const blockedUserId = 'usr_trial_blocked_' + suffix;
const normalUserId = 'usr_trial_normal_' + suffix;
const staleCounterUserId = 'usr_trial_stale_counter_' + suffix;
const nowMonth = getCurrentServerMonth();

try {
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, ?, 'test-hash', 'Blocked Trial Student', 'STUDENT', 'ACTIVE')
  `).run(blockedUserId, 'trial_blocked_' + suffix + '@example.test');

  db.prepare(`
    INSERT INTO student_profiles (
      user_id, icai_registration_number, ca_level,
      free_evaluations_used, monthly_free_evaluations_used,
      monthly_free_evaluations_limit, free_evaluation_reset_month,
      purchased_credits, paid_credits, free_trial_blocked
    ) VALUES (?, ?, 'INTERMEDIATE', 0, 0, 2, ?, 7, 7, 1)
  `).run(blockedUserId, 'WRO' + suffix.slice(0, 7).toUpperCase(), nowMonth);

  const blockedCurrentMonth = ensureMonthlyFreeEvaluationsReset(blockedUserId);
  assert(blockedCurrentMonth.monthlyFreeEvaluationsLimit === 0, 'A device/IP-blocked account receives zero standard free evaluations');
  assert(blockedCurrentMonth.freeEvaluationsRemaining === 0, 'A blocked account cannot regain free evaluations in the current month');

  db.prepare(`
    UPDATE student_profiles
    SET free_evaluation_reset_month = '2000-01',
        monthly_free_evaluations_limit = 2
    WHERE user_id = ?
  `).run(blockedUserId);

  const blockedAfterReset = ensureMonthlyFreeEvaluationsReset(blockedUserId);
  const blockedProfile = db.prepare('SELECT monthly_free_evaluations_limit, purchased_credits, paid_credits FROM student_profiles WHERE user_id = ?').get(blockedUserId) as any;
  assert(blockedAfterReset.monthlyFreeEvaluationsLimit === 0, 'Monthly reset does not restore the free trial for blocked accounts');
  assert(blockedProfile.monthly_free_evaluations_limit === 0, 'Zero quota is persisted in the student profile');
  assert(blockedProfile.purchased_credits === 7 && blockedProfile.paid_credits === 7, 'Blocking free trial leaves purchased/paid credit balances unchanged');

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, ?, 'test-hash', 'Normal Trial Student', 'STUDENT', 'ACTIVE')
  `).run(normalUserId, 'trial_normal_' + suffix + '@example.test');

  db.prepare(`
    INSERT INTO student_profiles (
      user_id, icai_registration_number, ca_level,
      free_evaluations_used, monthly_free_evaluations_used,
      monthly_free_evaluations_limit, free_evaluation_reset_month,
      purchased_credits, paid_credits, free_trial_blocked
    ) VALUES (?, ?, 'INTERMEDIATE', 0, 0, 2, '2000-01', 0, 0, 0)
  `).run(normalUserId, 'DEL' + suffix.slice(0, 7).toUpperCase());

  const normalAfterReset = ensureMonthlyFreeEvaluationsReset(normalUserId);
  assert(normalAfterReset.monthlyFreeEvaluationsLimit === 2, 'Accounts that pass eligibility keep the existing two-evaluations-per-month policy');

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, ?, 'test-hash', 'Stale Counter Student', 'STUDENT', 'ACTIVE')
  `).run(staleCounterUserId, 'trial_stale_counter_' + suffix + '@example.test');

  db.prepare(`
    INSERT INTO student_profiles (
      user_id, icai_registration_number, ca_level,
      free_evaluations_used, monthly_free_evaluations_used,
      monthly_free_evaluations_limit, free_evaluation_reset_month,
      purchased_credits, paid_credits, free_trial_blocked
    ) VALUES (?, ?, 'INTERMEDIATE', 0, 2, 2, ?, 0, 0, 0)
  `).run(staleCounterUserId, 'STC' + suffix.slice(0, 7).toUpperCase(), nowMonth);

  const repairedStatus = ensureMonthlyFreeEvaluationsReset(staleCounterUserId);
  const repairedProfile = db.prepare('SELECT free_evaluations_used, monthly_free_evaluations_used FROM student_profiles WHERE user_id = ?').get(staleCounterUserId) as any;
  assert(repairedStatus.freeEvaluationsRemaining === 2, 'Stale monthly-used counter with no ledger deductions is repaired to preserve unused free evaluations');
  assert(repairedProfile.monthly_free_evaluations_used === 0 && repairedProfile.free_evaluations_used === 0, 'Reconciliation persists both free usage counters consistently');

  console.log('\nFree-trial anti-abuse regression tests: ' + passed + '/' + total + ' passed.');
} finally {
  db.prepare('DELETE FROM users WHERE id IN (?, ?, ?)').run(blockedUserId, normalUserId, staleCounterUserId);
}
