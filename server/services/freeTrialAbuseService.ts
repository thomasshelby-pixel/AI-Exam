import crypto from 'node:crypto';
import { isIP } from 'node:net';
import { runFirestoreTransaction } from './firestoreDbService.js';

export type FreeTrialDecisionReason =
  | 'FIRST_CLAIM'
  | 'REUSED_DEVICE'
  | 'REUSED_IP'
  | 'NO_RELIABLE_SIGNALS'
  | 'SIGNAL_STORE_UNAVAILABLE';

export interface FreeTrialEligibilityDecision {
  eligible: boolean;
  reason: FreeTrialDecisionReason;
}

export interface FreeTrialSignalDecisionInput {
  hasDeviceSignal: boolean;
  hasIpSignal: boolean;
  reusedDevice: boolean;
  reusedIp: boolean;
}

/**
 * Device reuse is a strong duplicate-account signal. IP reuse is deliberately
 * treated as a soft risk signal only because homes, hostels, colleges, offices,
 * and carrier-grade mobile networks commonly share public IP addresses.
 *
 * At least one reliable device/IP signal is required. A reused IP alone must
 * never deny a genuine student the standard free-trial allowance. A reused
 * device can withhold only the free-trial quota; it never rejects the account
 * or removes paid/institute entitlements.
 */
export function decideFreeTrialEligibility(input: FreeTrialSignalDecisionInput): FreeTrialEligibilityDecision {
  if (!input.hasDeviceSignal && !input.hasIpSignal) {
    return { eligible: false, reason: 'NO_RELIABLE_SIGNALS' };
  }
  if (input.reusedDevice) return { eligible: false, reason: 'REUSED_DEVICE' };

  // IP reuse is not a denial condition: the same public IP can legitimately
  // belong to many unrelated students. Existing IP claims are left untouched,
  // while any new device signal can still be safely claimed for this account.
  return { eligible: true, reason: 'FIRST_CLAIM' };
}

export function isSignalOwnedByAnotherUser(
  snapshotExists: boolean,
  signalOwnerId: string | null | undefined,
  requestingUserId: string
): boolean {
  // Legacy ownerless claims remain treated as already claimed.
  return snapshotExists && String(signalOwnerId || '') !== requestingUserId;
}

/**
 * Atomically checks and, only for eligible new accounts, claims hashed browser/
 * device and IP signals. A blocked account must not reserve its other unseen
 * signal (e.g. a new device paired with a reused IP), otherwise it could
 * accidentally block a later legitimate student.
 *
 * Raw device identifiers and IP addresses are never persisted.
 */
export async function claimFreeTrialEligibility(params: {
  userId: string;
  deviceIds: Array<string | undefined | null>;
  ipAddresses: Array<string | undefined | null>;
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
    const now = new Date().toISOString();
    return await runFirestoreTransaction(async (transaction) => {
      const snapshots = [];
      // Firestore transactions require every read to complete before any write.
      for (const signal of signals) {
        snapshots.push({
          ...signal,
          snapshot: await transaction.get('free_trial_abuse_signals', signal.id),
        });
      }

      const ownerFor = (entry: (typeof snapshots)[number]): string => {
        const data = entry.snapshot.data() as any;
        return String(data?.claimedByUserId || '');
      };
      const reusedDevice = snapshots
        .filter((entry) => entry.type === 'device')
        .some((entry) => isSignalOwnedByAnotherUser(entry.snapshot.exists, ownerFor(entry), params.userId));
      const reusedIp = snapshots
        .filter((entry) => entry.type === 'ip')
        .some((entry) => isSignalOwnedByAnotherUser(entry.snapshot.exists, ownerFor(entry), params.userId));

      const decision = decideFreeTrialEligibility({
        hasDeviceSignal: deviceIds.length > 0,
        hasIpSignal: ipAddresses.length > 0,
        reusedDevice,
        reusedIp,
      });

      // A blocked attempt must not claim any new identifiers. This prevents a
      // reused IP from poisoning the new device that belongs to that account.
      if (decision.eligible) {
        for (const entry of snapshots) {
          if (!entry.snapshot.exists) {
            transaction.set('free_trial_abuse_signals', entry.id, {
              signalType: entry.type,
              firstSeenAt: now,
              trialClaimed: true,
              claimedByUserId: params.userId,
            });
          }
        }
      }

      return decision;
    });
  } catch (error) {
    console.warn('[FreeTrialAbuse] Could not persist hashed device/IP abuse signals:', error);
    return { eligible: false, reason: 'SIGNAL_STORE_UNAVAILABLE' };
  }
}
