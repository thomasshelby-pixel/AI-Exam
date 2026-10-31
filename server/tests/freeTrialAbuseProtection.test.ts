import crypto from 'node:crypto';
import { db, initDatabase } from '../db.js';
import { ensureMonthlyFreeEvaluationsReset, getCurrentServerMonth } from '../services/studentCreditService.js';
import { decideFreeTrialEligibility, isSignalOwnedByAnotherUser } from '../services/freeTrialAbuseService.js';

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
const repairableUserId = 'usr_trial_repairable_' + suffix;
const duplicateOwnerId = 'usr_trial_dup_owner_' + suffix;
const duplicateBlockedId = 'usr_trial_dup_blocked_' + suffix;
const durableBlockedId = 'usr_trial_durable_blocked_' + suffix;
const reusedDeviceBlockedId = 'usr_trial_device_reused_' + suffix;
const reusedIpBlockedId = 'usr_trial_ip_reused_' + suffix;
const nowMonth = getCurrentServerMonth();
const repairSrnDigits = String(Date.now()).slice(-7);
const duplicateSrnDigits = String(Number(repairSrnDigits) + 1).slice(-7).padStart(7, '0');
const unverifiedSrnDigits = String(Number(repairSrnDigits) + 2).slice(-7).padStart(7, '0');

// The account-level free-trial policy blocks a second claim from either
// a previously claimed device OR a previously claimed IP. A normal unique
// student with fresh signals remains eligible.
const baseSignals = {
  hasDeviceSignal: true,
  hasIpSignal: true,
  validSrn: true,
  reusedDevice: false,
  reusedIp: false,
  reusedSrn: false,
};
const normalDecision = decideFreeTrialEligibility(baseSignals);
assert(normalDecision.eligible && normalDecision.reason === 'FIRST_CLAIM', 'Fresh device/IP and unique ICAI identity receive the standard free trial');
const reusedDeviceDecision = decideFreeTrialEligibility({ ...baseSignals, reusedDevice: true });
assert(!reusedDeviceDecision.eligible && reusedDeviceDecision.reason === 'REUSED_DEVICE', 'A reused device on a second account blocks only the free trial');
const reusedIpDecision = decideFreeTrialEligibility({ ...baseSignals, reusedIp: true });
assert(!reusedIpDecision.eligible && reusedIpDecision.reason === 'REUSED_IP', 'A reused IP on a second account blocks only the free trial');
const reusedSrnDecision = decideFreeTrialEligibility({ ...baseSignals, reusedSrn: true });
assert(!reusedSrnDecision.eligible && reusedSrnDecision.reason === 'REUSED_SRN', 'A previously claimed ICAI registration identity remains blocked');
const missingSignalDecision = decideFreeTrialEligibility({ ...baseSignals, hasDeviceSignal: false });
assert(!missingSignalDecision.eligible && missingSignalDecision.reason === 'NO_RELIABLE_SIGNALS', 'Missing device identity does not silently grant a new free trial');
const changedDeviceDecision = decideFreeTrialEligibility({ ...baseSignals, forceBlock: true });
assert(!changedDeviceDecision.eligible && changedDeviceDecision.reason === 'DEVICE_CHANGED_DURING_SIGNUP', 'Device changed during signup does not receive a new free trial');
assert(!isSignalOwnedByAnotherUser(true, 'usr_same_account', 'usr_same_account'), 'A student's own repeated login on the same device/IP is not treated as another account');
assert(isSignalOwnedByAnotherUser(true, 'usr_first_account', 'usr_second_account'), 'A device/IP claim owned by a different account is treated as reuse');
assert(isSignalOwnedByAnotherUser(true, null, 'usr_new_account'), 'Legacy ownerless device/IP claims remain protected from duplicate free-trial claims');

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
  `).run(blockedUserId, 'WRO' + unverifiedSrnDigits, nowMonth);

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

  // A previously false-blocked verified student with a unique ICAI SRN and no
  // current-month free deductions should be restored without touching paid credits.
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status, email_verified)
    VALUES (?, ?, 'test-hash', 'Repairable Trial Student', 'STUDENT', 'ACTIVE', 1)
  `).run(repairableUserId, 'trial_repairable_' + suffix + '@example.test');
  db.prepare(`
    INSERT INTO student_profiles (
      user_id, icai_registration_number, ca_level, free_evaluations_used,
      monthly_free_evaluations_used, monthly_free_evaluations_limit,
      free_evaluation_reset_month, purchased_credits, paid_credits, free_trial_blocked
    ) VALUES (?, ?, 'INTERMEDIATE', 0, 0, 0, ?, 3, 3, 1)
  `).run(repairableUserId, 'NRO' + repairSrnDigits, nowMonth);

  const restoredQuota = ensureMonthlyFreeEvaluationsReset(repairableUserId);
  const restoredProfile = db.prepare('SELECT free_trial_blocked, monthly_free_evaluations_limit, purchased_credits, paid_credits FROM student_profiles WHERE user_id = ?').get(repairableUserId) as any;
  assert(restoredQuota.monthlyFreeEvaluationsLimit === 2 && restoredQuota.freeEvaluationsRemaining === 2, 'Verified unique-SRN unused student is restored to 2/2 free evaluations');
  assert(restoredProfile.free_trial_blocked === 0 && restoredProfile.monthly_free_evaluations_limit === 2, 'False-block repair is persisted in the student profile');
  assert(restoredProfile.purchased_credits === 3 && restoredProfile.paid_credits === 3, 'Repair leaves paid credits unchanged');

  // A verified account whose numeric ICAI SRN identity is already present on
  // another account must remain blocked to avoid duplicate free-trial claims.
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status, email_verified)
    VALUES (?, ?, 'test-hash', 'Duplicate SRN Owner', 'STUDENT', 'ACTIVE', 1)
  `).run(duplicateOwnerId, 'trial_dup_owner_' + suffix + '@example.test');
  db.prepare(`
    INSERT INTO student_profiles (
      user_id, icai_registration_number, ca_level, free_evaluations_used,
      monthly_free_evaluations_used, monthly_free_evaluations_limit,
      free_evaluation_reset_month, purchased_credits, paid_credits, free_trial_blocked
    ) VALUES (?, ?, 'INTERMEDIATE', 0, 0, 2, ?, 0, 0, 0)
  `).run(duplicateOwnerId, 'CRO' + duplicateSrnDigits, nowMonth);
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status, email_verified)
    VALUES (?, ?, 'test-hash', 'Duplicate SRN Blocked', 'STUDENT', 'ACTIVE', 1)
  `).run(duplicateBlockedId, 'trial_dup_blocked_' + suffix + '@example.test');
  db.prepare(`
    INSERT INTO student_profiles (
      user_id, icai_registration_number, ca_level, free_evaluations_used,
      monthly_free_evaluations_used, monthly_free_evaluations_limit,
      free_evaluation_reset_month, purchased_credits, paid_credits, free_trial_blocked
    ) VALUES (?, ?, 'INTERMEDIATE', 0, 0, 0, ?, 0, 0, 1)
  `).run(duplicateBlockedId, 'WRO' + duplicateSrnDigits, nowMonth);

  const duplicateQuota = ensureMonthlyFreeEvaluationsReset(duplicateBlockedId);
  assert(duplicateQuota.monthlyFreeEvaluationsLimit === 0 && duplicateQuota.freeEvaluationsRemaining === 0, 'Duplicate ICAI identity is not auto-unblocked');

  // Explicit device/IP blocks must also survive identity-based monthly-reset repair.
  for (const [userId, email, srn, reason] of [
    [reusedDeviceBlockedId, 'trial_device_reused_' + suffix + '@example.test', 'DVO' + String(Number(repairSrnDigits) + 4).slice(-7).padStart(7, '0'), 'REUSED_DEVICE'],
    [reusedIpBlockedId, 'trial_ip_reused_' + suffix + '@example.test', 'IPO' + String(Number(repairSrnDigits) + 5).slice(-7).padStart(7, '0'), 'REUSED_IP'],
  ] as Array<[string, string, string, string]>) {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, status, email_verified)
      VALUES (?, ?, 'test-hash', 'Device/IP Blocked Student', 'STUDENT', 'ACTIVE', 1)
    `).run(userId, email);
    db.prepare(`
      INSERT INTO student_profiles (
        user_id, icai_registration_number, ca_level, free_evaluations_used,
        monthly_free_evaluations_used, monthly_free_evaluations_limit,
        free_evaluation_reset_month, purchased_credits, paid_credits,
        free_trial_blocked, free_trial_block_reason
      ) VALUES (?, ?, 'INTERMEDIATE', 0, 0, 0, ?, 0, 0, 1, ?)
    `).run(userId, srn, nowMonth, reason);
    const result = ensureMonthlyFreeEvaluationsReset(userId);
    const saved = db.prepare('SELECT free_trial_blocked, monthly_free_evaluations_limit FROM student_profiles WHERE user_id = ?').get(userId) as any;
    assert(result.monthlyFreeEvaluationsLimit === 0 && result.freeEvaluationsRemaining === 0, reason + ' account is not auto-unblocked by monthly quota repair');
    assert(saved.free_trial_blocked === 1 && saved.monthly_free_evaluations_limit === 0, reason + ' block remains persisted');
  }

  // Explicit durable identity-claim blocks must not be mistaken for false blocks.
  const durableDigits = String(Number(repairSrnDigits) + 3).slice(-7).padStart(7, '0');
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status, email_verified)
    VALUES (?, ?, 'test-hash', 'Durably Blocked Student', 'STUDENT', 'ACTIVE', 1)
  `).run(durableBlockedId, 'trial_durable_blocked_' + suffix + '@example.test');
  db.prepare(`
    INSERT INTO student_profiles (
      user_id, icai_registration_number, ca_level, free_evaluations_used,
      monthly_free_evaluations_used, monthly_free_evaluations_limit,
      free_evaluation_reset_month, purchased_credits, paid_credits,
      free_trial_blocked, free_trial_block_reason
    ) VALUES (?, ?, 'INTERMEDIATE', 0, 0, 0, ?, 0, 0, 1, 'REUSED_SRN')
  `).run(durableBlockedId, 'SRO' + durableDigits, nowMonth);
  const durableQuota = ensureMonthlyFreeEvaluationsReset(durableBlockedId);
  assert(durableQuota.monthlyFreeEvaluationsLimit === 0 && durableQuota.freeEvaluationsRemaining === 0, 'Explicit durable SRN-claim block is not auto-repaired');

  console.log('\nFree-trial anti-abuse regression tests: ' + passed + '/' + total + ' passed.');
} finally {
  db.prepare('DELETE FROM users WHERE id IN (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(blockedUserId, normalUserId, staleCounterUserId, repairableUserId, duplicateOwnerId, duplicateBlockedId, durableBlockedId, reusedDeviceBlockedId, reusedIpBlockedId);
}
