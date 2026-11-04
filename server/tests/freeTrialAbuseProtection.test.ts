import crypto from 'node:crypto';
import { db, initDatabase } from '../db.js';
import { ensureMonthlyFreeEvaluationsReset, getCurrentServerMonth, repairTransientFreeTrialBlockAfterVerifiedSignals } from '../services/studentCreditService.js';
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
const transientSignalBlockedUserId = 'usr_trial_transient_signal_block_' + suffix;
const reusedDeviceBlockedId = 'usr_trial_device_reused_' + suffix;
const reusedIpBlockedId = 'usr_trial_ip_reused_' + suffix;
const unknownLegacyBlockedId = 'usr_trial_unknown_legacy_blocked_' + suffix;
const nowMonth = getCurrentServerMonth();
const repairSrnDigits = String(Date.now()).slice(-7);
const unverifiedSrnDigits = String(Number(repairSrnDigits) + 2).slice(-7).padStart(7, '0');

// Device reuse is a strong duplicate signal. IP reuse is not a hard
// denial because unrelated students often share home/hostel/college networks.
const baseSignals = {
  hasDeviceSignal: true,
  hasIpSignal: true,
  reusedDevice: false,
  reusedIp: false,
};
const normalDecision = decideFreeTrialEligibility(baseSignals);
assert(normalDecision.eligible && normalDecision.reason === 'FIRST_CLAIM', 'A new account with fresh device/IP signals receives the standard free trial');
const reusedDeviceDecision = decideFreeTrialEligibility({ ...baseSignals, reusedDevice: true });
assert(!reusedDeviceDecision.eligible && reusedDeviceDecision.reason === 'REUSED_DEVICE', 'A new account on a previously claimed device is denied only the free trial');
const reusedIpDecision = decideFreeTrialEligibility({ ...baseSignals, reusedIp: true });
assert(reusedIpDecision.eligible && reusedIpDecision.reason === 'FIRST_CLAIM', 'A new account sharing a previously claimed public IP still receives the standard free trial');
const reusedIpOnlyDecision = decideFreeTrialEligibility({
  ...baseSignals,
  hasDeviceSignal: false,
  reusedIp: true,
});
assert(reusedIpOnlyDecision.eligible, 'A shared public IP alone never blocks a student when the app device signal is unavailable');
const ipOnlyDecision = decideFreeTrialEligibility({ ...baseSignals, hasDeviceSignal: false });
assert(ipOnlyDecision.eligible && ipOnlyDecision.reason === 'FIRST_CLAIM', 'A reliable fresh IP is sufficient when a device identifier is unavailable');
const deviceOnlyDecision = decideFreeTrialEligibility({ ...baseSignals, hasIpSignal: false });
assert(deviceOnlyDecision.eligible && deviceOnlyDecision.reason === 'FIRST_CLAIM', 'A reliable fresh device is sufficient when an IP is unavailable');
const noSignalDecision = decideFreeTrialEligibility({ ...baseSignals, hasDeviceSignal: false, hasIpSignal: false });
assert(!noSignalDecision.eligible && noSignalDecision.reason === 'NO_RELIABLE_SIGNALS', 'No reliable device or IP signal fails closed for free-trial eligibility');
assert(!isSignalOwnedByAnotherUser(true, 'usr_same_account', 'usr_same_account'), "A student's own repeated login on the same device/IP is not treated as another account");
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
      free_evaluation_reset_month, purchased_credits, paid_credits,
      free_trial_blocked, free_trial_block_reason
    ) VALUES (?, ?, 'INTERMEDIATE', 0, 0, 0, ?, 3, 3, 1, 'LEGACY_FALSE_BLOCK_REVIEWED')
  `).run(repairableUserId, 'NRO' + repairSrnDigits, nowMonth);

  const restoredQuota = ensureMonthlyFreeEvaluationsReset(repairableUserId);
  const restoredProfile = db.prepare('SELECT free_trial_blocked, monthly_free_evaluations_limit, purchased_credits, paid_credits FROM student_profiles WHERE user_id = ?').get(repairableUserId) as any;
  assert(restoredQuota.monthlyFreeEvaluationsLimit === 2 && restoredQuota.freeEvaluationsRemaining === 2, 'Verified unique-SRN unused student is restored to 2/2 free evaluations');
  assert(restoredProfile.free_trial_blocked === 0 && restoredProfile.monthly_free_evaluations_limit === 2, 'False-block repair is persisted in the student profile');
  assert(restoredProfile.purchased_credits === 3 && restoredProfile.paid_credits === 3, 'Repair leaves paid credits unchanged');

  // Transient no-signal / unavailable-store blocks may be recovered only
  // after a fresh anti-abuse check passes and the account identity is verified.
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status, email_verified)
    VALUES (?, ?, 'test-hash', 'Transiently Blocked Trial Student', 'STUDENT', 'ACTIVE', 1)
  `).run(transientSignalBlockedUserId, 'trial_transient_signal_' + suffix + '@example.test');
  const transientSrn = 'TRN' + String(Number(repairSrnDigits) + 8).slice(-7).padStart(7, '0');
  db.prepare(`
    INSERT INTO student_profiles (
      user_id, icai_registration_number, ca_level, free_evaluations_used,
      monthly_free_evaluations_used, monthly_free_evaluations_limit,
      free_evaluation_reset_month, purchased_credits, paid_credits,
      free_trial_blocked, free_trial_block_reason
    ) VALUES (?, ?, 'INTERMEDIATE', 0, 0, 0, ?, 4, 4, 1, 'PROFILE_COMPLETION_SIGNAL_STORE_UNAVAILABLE')
  `).run(transientSignalBlockedUserId, transientSrn, nowMonth);

  const recoveryWithoutSignalProof = repairTransientFreeTrialBlockAfterVerifiedSignals(transientSignalBlockedUserId, false);
  assert(!recoveryWithoutSignalProof, 'A transient block cannot be restored without a fresh eligible device/IP decision');

  const recoveredTransientBlock = repairTransientFreeTrialBlockAfterVerifiedSignals(transientSignalBlockedUserId, normalDecision.eligible);
  const transientQuota = ensureMonthlyFreeEvaluationsReset(transientSignalBlockedUserId);
  const transientProfile = db.prepare('SELECT free_trial_blocked, free_trial_block_reason, monthly_free_evaluations_limit, purchased_credits, paid_credits FROM student_profiles WHERE user_id = ?').get(transientSignalBlockedUserId) as any;
  assert(recoveredTransientBlock, 'A transient no-signal block is repaired after a fresh unique device/IP check passes');
  assert(transientQuota.monthlyFreeEvaluationsLimit === 2 && transientQuota.freeEvaluationsRemaining === 2, 'Recovered account receives exactly 2 unused free evaluations');
  assert(transientProfile.free_trial_blocked === 0 && transientProfile.monthly_free_evaluations_limit === 2 && transientProfile.free_trial_block_reason === null, 'Transient recovery is persisted and clears the old block reason');
  assert(transientProfile.purchased_credits === 4 && transientProfile.paid_credits === 4, 'Transient recovery never changes paid credits');

  // Unknown legacy blocks must fail closed: without an audited reason they may
  // represent older device/IP abuse decisions from before reason codes existed.
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status, email_verified)
    VALUES (?, ?, 'test-hash', 'Unknown Legacy Block', 'STUDENT', 'ACTIVE', 1)
  `).run(unknownLegacyBlockedId, 'trial_unknown_legacy_' + suffix + '@example.test');
  db.prepare(`
    INSERT INTO student_profiles (
      user_id, icai_registration_number, ca_level, free_evaluations_used,
      monthly_free_evaluations_used, monthly_free_evaluations_limit,
      free_evaluation_reset_month, purchased_credits, paid_credits, free_trial_blocked
    ) VALUES (?, ?, 'INTERMEDIATE', 0, 0, 0, ?, 0, 0, 1)
  `).run(unknownLegacyBlockedId, 'ULO' + String(Number(repairSrnDigits) + 6).slice(-7).padStart(7, '0'), nowMonth);
  const unknownLegacyQuota = ensureMonthlyFreeEvaluationsReset(unknownLegacyBlockedId);
  assert(unknownLegacyQuota.monthlyFreeEvaluationsLimit === 0, 'An unknown legacy free-trial block is not auto-cleared without explicit review');

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

    if (reason === 'REUSED_DEVICE') {
      assert(result.monthlyFreeEvaluationsLimit === 0 && result.freeEvaluationsRemaining === 0,
        'A genuinely reused device remains blocked from duplicate free-trial claims');
      assert(saved.free_trial_blocked === 1 && saved.monthly_free_evaluations_limit === 0,
        'A reused-device block remains persisted after credit refresh');
      const deviceRepair = repairTransientFreeTrialBlockAfterVerifiedSignals(userId, reusedDeviceDecision.eligible);
      assert(!deviceRepair, 'A device-reuse block cannot be cleared by the transient recovery path');
    } else {
      assert(result.monthlyFreeEvaluationsLimit === 2 && result.freeEvaluationsRemaining === 2,
        'A legacy REUSED_IP block is automatically repaired during credit refresh after verified unique ICAI identity checks');
      assert(saved.free_trial_blocked === 0 && saved.monthly_free_evaluations_limit === 2,
        'The legacy shared-IP false block is persisted as recovered without requiring logout/login');
    }
  }

  console.log('\nFree-trial anti-abuse regression tests: ' + passed + '/' + total + ' passed.');
} finally {
  db.prepare('DELETE FROM users WHERE id IN (?, ?, ?, ?, ?, ?, ?, ?)').run(blockedUserId, normalUserId, staleCounterUserId, repairableUserId, transientSignalBlockedUserId, reusedDeviceBlockedId, reusedIpBlockedId, unknownLegacyBlockedId);
}
