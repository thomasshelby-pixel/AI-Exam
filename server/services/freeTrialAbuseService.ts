import crypto from 'node:crypto';
import { isIP } from 'node:net';
import { runFirestoreTransaction } from './firestoreDbService.js';

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

export interface FreeTrialSignalDecisionInput {
  hasDeviceSignal: boolean;
  hasIpSignal: boolean;
  validSrn: boolean;
  reusedDevice: boolean;
  reusedIp: boolean;
  reusedSrn: boolean;
  forceBlock?: boolean;
}

/**
 * Pure policy decision for a new free-trial claim.
 * A second account on a previously claimed device OR IP is blocked. Repeated
 * ICAI registration identity and device changes during signup are also blocked.
 * This decision only controls the standard free-trial quota, never paid/institute
 * evaluation entitlements or the answer-sheet marking pipeline.
 */
export function decideFreeTrialEligibility(input: FreeTrialSignalDecisionInput): FreeTrialEligibilityDecision {
  if (input.reusedSrn) return { eligible: false, reason: 'REUSED_SRN' };
  if (input.forceBlock) return { eligible: false, reason: 'DEVICE_CHANGED_DURING_SIGNUP' };
  if (!input.validSrn || !input.hasDeviceSignal || !input.hasIpSignal) {
    return { eligible: false, reason: 'NO_RELIABLE_SIGNALS' };
  }
  if (input.reusedDevice) return { eligible: false, reason: 'REUSED_DEVICE' };
  if (input.reusedIp) return { eligible: false, reason: 'REUSED_IP' };
  return { eligible: true, reason: 'FIRST_CLAIM' };
}

/**
 * Claims hashed browser/device and IP signals in Firestore in one transaction.
 * Raw device identifiers and IP addresses are never persisted.
 *
 * A reused device OR IP blocks a second account from claiming the standard
 * free-trial quota. Signal documents store only hashed device/IP keys plus the
 * opaque owning user ID, so the same account's later login does not look like a
 * second account. A hashed ICAI-registration identity claim also prevents a
 * deleted account from claiming the quota again. Raw SRNs, device IDs, and IP
 * addresses are never written to Firestore. This gate only controls free trials;
 * it does not reject paid/institute evaluations or affect answer-sheet checking.
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
  const validSrn = /^[A-Z]{3}[0-9]{7}$/.test(normalizedSrn);
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
    const now = new Date().toISOString();
    return await runFirestoreTransaction(async (transaction) => {
      const snapshots = [];
      for (const signal of signals) {
        snapshots.push({
          ...signal,
          snapshot: await transaction.get('free_trial_abuse_signals', signal.id),
        });
      }

      const ownerFor = (entry: (typeof snapshots)[number]): string => {
        const data = entry.snapshot.data() as any;
        return String(entry.type === 'srn' ? (data?.userId || '') : (data?.claimedByUserId || ''));
      };
      const deviceClaim = snapshots.filter((entry) => entry.type === 'device');
      const ipClaim = snapshots.filter((entry) => entry.type === 'ip');
      const srnClaim = snapshots.find((entry) => entry.type === 'srn');
      const reusedDevice = deviceClaim.some((entry) =>
        entry.snapshot.exists && ownerFor(entry) !== params.userId
      );
      const reusedIp = ipClaim.some((entry) =>
        entry.snapshot.exists && ownerFor(entry) !== params.userId
      );
      const reusedSrn = Boolean(
        srnClaim?.snapshot.exists && ownerFor(srnClaim) !== params.userId
      );

      // Claim any unseen signals in one transaction. The owner is an opaque
      // internal account ID; raw browser identifiers, IPs and SRNs are never saved.
      // Recording the owner prevents the same student's later login/profile update
      // from being misclassified as a second account.
      for (const entry of snapshots) {
        if (!entry.snapshot.exists) {
          transaction.set('free_trial_abuse_signals', entry.id, {
            signalType: entry.type,
            firstSeenAt: now,
            trialClaimed: true,
            ...(entry.type === 'srn'
              ? { userId: params.userId }
              : { claimedByUserId: params.userId }),
          });
        }
      }

      return decideFreeTrialEligibility({
        hasDeviceSignal: deviceIds.length > 0,
        hasIpSignal: ipAddresses.length > 0,
        validSrn,
        reusedDevice,
        reusedIp,
        reusedSrn,
        forceBlock: params.forceBlock,
      });
    });
  } catch (error) {
    console.warn('[FreeTrialAbuse] Could not persist hashed abuse signals / SRN claim:', error);
    return { eligible: false, reason: 'SIGNAL_STORE_UNAVAILABLE' };
  }
}
