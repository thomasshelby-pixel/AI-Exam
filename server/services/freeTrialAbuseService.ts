import crypto from 'node:crypto';
import { isIP } from 'node:net';
import { doc, runTransaction } from 'firebase/firestore';
import { getFirestoreDb } from './firestoreDbService.js';

export type FreeTrialDecisionReason =
  | 'FIRST_CLAIM'
  | 'REUSED_DEVICE'
  | 'REUSED_IP'
  | 'REUSED_SRN'
  | 'DEVICE_CHANGED_DURING_SIGNUP'
  | 'NO_RELIABLE_SIGNALS'
  | 'SIGNAL_STORE_UNAVAILABLE';

export interface FreeTrialEligibilityDecision {
  eligible: boolean;
  reason: FreeTrialDecisionReason;
}

/**
 * Claims hashed browser/device and IP signals in Firestore in one transaction.
 * Raw device identifiers and IP addresses are never persisted.
 *
 * Device and IP reuse are recorded as risk signals, but neither alone blocks a
 * verified student from the standard free-trial quota. Registration already checks
 * email OTP, unique ICAI registration number, and rate limits; blocking by browser
 * alone incorrectly denies legitimate students using a shared or previously used
 * device. A hashed ICAI-registration identity claim prevents re-claiming a trial
 * after an account has been deleted. Raw SRNs, device IDs, and IP addresses are
 * never written to Firestore. Device/IP signals are risk telemetry, not an
 * individual eligibility veto.
 */
export async function claimFreeTrialEligibility(params: {
  userId: string;
  deviceIds: Array<string | undefined | null>;
  ipAddresses: Array<string | undefined | null>;
  studentRegistrationNumber?: string | null;
  forceBlock?: boolean;
}): Promise<FreeTrialEligibilityDecision> {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || process.env.SESSION_SECRET || '';
  if (!secret || !params.userId) {
    return { eligible: false, reason: 'SIGNAL_STORE_UNAVAILABLE' };
  }

  const deviceIds = [...new Set(params.deviceIds
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length >= 12 && value.length <= 200 && value !== 'fallback_device_id' && value !== 'server_render_env'))];

  const ipAddresses = [...new Set(params.ipAddresses
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().replace(/^::ffff:/i, ''))
    .filter((value) => isIP(value) !== 0))];

  const normalizedSrn = String(params.studentRegistrationNumber || '').trim().toUpperCase();
  const validSrn = /^[A-Z]{3}\\d{7}$/.test(normalizedSrn);
  const signals = [
    ...deviceIds.map((value) => ({
      type: 'device' as const,
      id: 'device_' + crypto.createHmac('sha256', secret).update('device:' + value).digest('hex'),
    })),
    ...ipAddresses.map((value) => ({
      type: 'ip' as const,
      id: 'ip_' + crypto.createHmac('sha256', secret).update('ip:' + value).digest('hex'),
    })),
    ...(validSrn ? [{
      type: 'srn' as const,
      id: 'srn_' + crypto.createHmac('sha256', secret).update('srn:' + normalizedSrn).digest('hex'),
    }] : []),
  ];

  if (signals.length === 0) {
    return { eligible: false, reason: 'NO_RELIABLE_SIGNALS' };
  }

  try {
    const firestore = getFirestoreDb();
    if (!firestore) {
      return { eligible: false, reason: 'SIGNAL_STORE_UNAVAILABLE' };
    }

    const now = new Date().toISOString();
    return await runTransaction(firestore, async (transaction) => {
      const refs = signals.map((signal) => ({
        ...signal,
        ref: doc(firestore, 'free_trial_abuse_signals', signal.id),
      }));

      const snapshots = [];
      for (const signal of refs) {
        snapshots.push({
          ...signal,
          snapshot: await transaction.get(signal.ref),
        });
      }

      const reusedDevice = snapshots.some((entry) => entry.type === 'device' && entry.snapshot.exists());
      const reusedIp = snapshots.some((entry) => entry.type === 'ip' && entry.snapshot.exists());
      const srnClaim = snapshots.find((entry) => entry.type === 'srn');
      const reusedSrn = Boolean(
        srnClaim?.snapshot.exists() &&
        String((srnClaim.snapshot.data() as any)?.userId || '') !== params.userId
      );

      // Claim any unseen signals in one transaction. Only the hashed SRN claim
      // records an opaque userId association; raw student identifiers are never stored.
      for (const entry of snapshots) {
        if (!entry.snapshot.exists()) {
          transaction.set(entry.ref, {
            signalType: entry.type,
            firstSeenAt: now,
            trialClaimed: true,
            ...(entry.type === 'srn' ? { userId: params.userId } : {}),
          });
        }
      }

      // A repeat claim for the same ICAI registration identity is the strongest
      // durable duplicate-trial signal, including after a student profile is deleted.
      if (reusedSrn) {
        return { eligible: false, reason: 'REUSED_SRN' as const };
      }
      if (params.forceBlock) {
        console.info('[FreeTrialAbuse] Device changed during signup; SRN claim is unique.', { userId: params.userId });
      }
      // Missing browser/IP signals should not deny an OTP-verified student whose
      // ICAI SRN is valid and durably claimed. These are risk signals, not identity.
      if (!validSrn) {
        return { eligible: false, reason: 'NO_RELIABLE_SIGNALS' as const };
      }
      // Reuse is retained as an abuse signal, not an automatic denial. Shared PCs,
      // coaching-centre labs, family devices, and test accounts can legitimately
      // reuse a browser identifier. Unique ICAI SRN validation, verified email OTP,
      // and rate limits are the primary account-creation controls.
      if (reusedDevice) {
        console.info('[FreeTrialAbuse] Reused device observed; allowing verified signup subject to SRN/OTP/rate limits.', { userId: params.userId });
      }
      if (reusedIp) {
        console.info('[FreeTrialAbuse] Reused IP observed; allowing verified signup.', { userId: params.userId });
      }
      return { eligible: true, reason: 'FIRST_CLAIM' as const };
    });
  } catch (error) {
    console.warn('[FreeTrialAbuse] Could not persist hashed abuse signals / SRN claim:', error);
    return { eligible: false, reason: 'SIGNAL_STORE_UNAVAILABLE' };
  }
}
