import crypto from 'node:crypto';
import { isIP } from 'node:net';
import { doc, runTransaction } from 'firebase/firestore';
import { getFirestoreDb } from './firestoreDbService.js';

export type FreeTrialDecisionReason =
  | 'FIRST_CLAIM'
  | 'REUSED_DEVICE'
  | 'REUSED_IP'
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
 * device. A device change during the same signup flow and unavailable required
 * signals still fail closed. Paid/institute/promo entitlements are unchanged.
 */
export async function claimFreeTrialEligibility(params: {
  userId: string;
  deviceIds: Array<string | undefined | null>;
  ipAddresses: Array<string | undefined | null>;
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

  const signals = [
    ...deviceIds.map((value) => ({
      type: 'device' as const,
      id: 'device_' + crypto.createHmac('sha256', secret).update('device:' + value).digest('hex'),
    })),
    ...ipAddresses.map((value) => ({
      type: 'ip' as const,
      id: 'ip_' + crypto.createHmac('sha256', secret).update('ip:' + value).digest('hex'),
    })),
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

      // Claim any unseen signals even when another signal already disqualifies
      // this account. This prevents switching networks or browsers after signup.
      for (const entry of snapshots) {
        if (!entry.snapshot.exists()) {
          transaction.set(entry.ref, {
            signalType: entry.type,
            firstSeenAt: now,
            trialClaimed: true,
          });
        }
      }

      if (params.forceBlock) {
        return { eligible: false, reason: 'DEVICE_CHANGED_DURING_SIGNUP' as const };
      }
      // For a new free-trial grant, require both a stable browser/device ID and a
      // valid client IP. Still claim whichever signal is available so future
      // signups cannot evade checks simply by omitting one of the headers.
      if (deviceIds.length === 0 || ipAddresses.length === 0) {
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
    console.warn('[FreeTrialAbuse] Signal claim failed; keeping the free trial disabled for this account:', error);
    return { eligible: false, reason: 'SIGNAL_STORE_UNAVAILABLE' };
  }
}
