import crypto from 'node:crypto';
import { isIP } from 'node:net';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import { loadAndValidateFirebaseConfig } from '../config/firebaseConfigValidator.js';

export const FREE_TRIAL_DEVICE_COOKIE = 'ca_free_trial_device';
export const FREE_TRIAL_DEVICE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;
const IP_TRIAL_LOCK_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;
const RESERVATION_TTL_MS = 15 * 60 * 1000;

export type FreeTrialBlockReason =
  | 'DEVICE_ALREADY_USED'
  | 'IP_ALREADY_USED'
  | 'NETWORK_ID_UNAVAILABLE'
  | 'DEVICE_ID_UNAVAILABLE'
  | 'ABUSE_GUARD_UNAVAILABLE';

export interface FreeTrialClaimResult {
  eligible: boolean;
  reason?: FreeTrialBlockReason;
}

export interface FreeTrialClaimSignals {
  userId: string;
  deviceCookieHash: string | null;
  clientDeviceHash: string | null;
  ipHash: string | null;
}

let claimsFirestore: Firestore | null = null;
let warnedMissingSecret = false;

function getTrialHashSecret(): string | null {
  const secret = process.env.TRIAL_ABUSE_HMAC_SECRET || process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (secret && secret.trim().length >= 32) return secret.trim();

  if (!warnedMissingSecret) {
    warnedMissingSecret = true;
    console.error('[FreeTrialAbuse] Configure TRIAL_ABUSE_HMAC_SECRET (32+ characters) or a strong JWT_SECRET/SESSION_SECRET. Free trials will fail closed until then.');
  }
  return null;
}

export function signTrialDeviceCookie(deviceNonce: string): string | null {
  const secret = getTrialHashSecret();
  if (!secret) return null;
  const signature = crypto.createHmac('sha256', secret).update(`trial-device-cookie:${deviceNonce}`).digest('hex');
  return `${deviceNonce}.${signature}`;
}

export function verifyTrialDeviceCookie(cookieValue: string | undefined): string | null {
  const secret = getTrialHashSecret();
  if (!secret || !cookieValue || cookieValue.length > 256) return null;

  const [nonce, signature, extra] = cookieValue.split('.');
  if (extra !== undefined || !/^[a-f0-9]{64}$/i.test(nonce || '') || !/^[a-f0-9]{64}$/i.test(signature || '')) {
    return null;
  }

  const expected = crypto.createHmac('sha256', secret).update(`trial-device-cookie:${nonce}`).digest();
  const received = Buffer.from(signature, 'hex');
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  return nonce.toLowerCase();
}

export function hashFreeTrialSignal(kind: 'device-cookie' | 'client-device' | 'ip', value: string | null | undefined): string | null {
  const secret = getTrialHashSecret();
  const clean = typeof value === 'string' ? value.trim() : '';
  if (!secret || !clean || clean.length > 512) return null;

  const normalized = kind === 'ip' ? normalizeIpAddress(clean) : clean;
  if (!normalized) return null;

  return crypto.createHmac('sha256', secret).update(`free-trial:${kind}:${normalized}`).digest('hex');
}

export function normalizeIpAddress(input: string): string | null {
  let ip = String(input || '').trim();
  if (!ip) return null;
  if (ip.startsWith('[') && ip.includes(']')) ip = ip.slice(1, ip.indexOf(']'));
  if (ip.startsWith('::ffff:')) ip = ip.slice('::ffff:'.length);
  if (!isIP(ip)) return null;
  return ip.toLowerCase();
}

/**
 * Google external load balancers append the observed client IP and then the
 * load-balancer IP to X-Forwarded-For. User-supplied values appear to their left
 * and must not be trusted. Set FREE_TRIAL_XFF_CLIENT_IP_INDEX_FROM_RIGHT if App
 * Hosting adds a different documented number of proxy hops before the app.
 */
export function getTrustedAppHostingClientIp(headers: Record<string, unknown>, remoteAddress?: string | null): string | null {
  const raw = headers['x-forwarded-for'];
  const entries = (typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join(',') : '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const fromRight = Number.parseInt(process.env.FREE_TRIAL_XFF_CLIENT_IP_INDEX_FROM_RIGHT || '2', 10);
  const indexFromRight = Number.isInteger(fromRight) && fromRight >= 1 && fromRight <= 8 ? fromRight : 2;
  if (entries.length >= indexFromRight) {
    const candidate = normalizeIpAddress(entries[entries.length - indexFromRight]);
    if (candidate) return candidate;
  }

  // A local development fallback only. In production, the socket is commonly a proxy.
  if (process.env.NODE_ENV !== 'production') {
    return normalizeIpAddress(String(remoteAddress || ''));
  }
  return null;
}

function getClaimsStore(): Firestore {
  if (claimsFirestore) return claimsFirestore;
  const { config } = loadAndValidateFirebaseConfig();
  claimsFirestore = new Firestore({
    projectId: config.projectId,
    databaseId: config.firestoreDatabaseId,
    ignoreUndefinedProperties: true,
  });
  return claimsFirestore;
}

function getClaimRefs(store: Firestore, params: FreeTrialClaimSignals) {
  return {
    deviceCookieRef: store.collection('free_trial_device_claims').doc(params.deviceCookieHash!),
    clientDeviceRef: params.clientDeviceHash
      ? store.collection('free_trial_client_device_claims').doc(params.clientDeviceHash)
      : null,
    ipRef: store.collection('free_trial_ip_claims').doc(params.ipHash!),
  };
}

function isActiveReservation(data: Record<string, any>, now: number): boolean {
  return data.status === 'RESERVED' && Number(data.reservationExpiresAtMs || 0) > now;
}

function isPermanentDeviceClaim(data: Record<string, any>): boolean {
  return data.status === 'CLAIMED';
}

/**
 * Reserve a claim in Firestore before signup benefits are granted. The reservation
 * expires after 15 minutes unless finalized after the SQL account transaction commits.
 * Permanent device claims do not expire; one network/IP claim expires after 180 days.
 * Only keyed HMACs are stored (never raw IPs, cookie tokens, or browser IDs).
 */
export async function claimFreeTrialForAccount(params: FreeTrialClaimSignals): Promise<FreeTrialClaimResult> {
  const { userId, deviceCookieHash, clientDeviceHash, ipHash } = params;
  if (!deviceCookieHash) return { eligible: false, reason: 'DEVICE_ID_UNAVAILABLE' };
  if (!ipHash) return { eligible: false, reason: 'NETWORK_ID_UNAVAILABLE' };

  try {
    const store = getClaimsStore();
    const { deviceCookieRef, clientDeviceRef, ipRef } = getClaimRefs(store, params);
    const now = Date.now();

    return await store.runTransaction(async (transaction) => {
      // Complete all reads before any writes.
      const cookieDeviceSnap = await transaction.get(deviceCookieRef);
      const clientDeviceSnap = clientDeviceRef ? await transaction.get(clientDeviceRef) : null;
      const ipSnap = await transaction.get(ipRef);

      const deviceSnaps = [cookieDeviceSnap, ...(clientDeviceSnap ? [clientDeviceSnap] : [])];
      for (const snap of deviceSnaps) {
        if (!snap.exists) continue;
        const data = snap.data() || {};
        if (data.userId === userId && isPermanentDeviceClaim(data)) return { eligible: true };
        if (data.userId === userId && isActiveReservation(data, now)) return { eligible: true };
        if (isPermanentDeviceClaim(data) || isActiveReservation(data, now)) {
          return { eligible: false, reason: 'DEVICE_ALREADY_USED' };
        }
        // An expired reservation can safely be overwritten below.
      }

      if (ipSnap.exists) {
        const ipData = ipSnap.data() || {};
        if (
          ipData.userId === userId &&
          ipData.deviceCookieHash === deviceCookieHash &&
          (isPermanentDeviceClaim(ipData) || isActiveReservation(ipData, now))
        ) {
          return { eligible: true };
        }
        const activeIpClaim = isPermanentDeviceClaim(ipData)
          ? Number(ipData.expiresAtMs || 0) > now
          : isActiveReservation(ipData, now);
        if (activeIpClaim) return { eligible: false, reason: 'IP_ALREADY_USED' };
        // Expired IP claims/reservations are replaced atomically below.
      }

      const reservationExpiresAtMs = now + RESERVATION_TTL_MS;
      const ipExpiresAtMs = now + IP_TRIAL_LOCK_WINDOW_MS;
      const reservation = {
        userId,
        status: 'RESERVED',
        reservedAt: FieldValue.serverTimestamp(),
        reservationExpiresAtMs,
      };

      transaction.set(deviceCookieRef, {
        ...reservation,
        ipHash,
        lockType: 'SIGNED_BROWSER_COOKIE',
      });
      if (clientDeviceRef) {
        transaction.set(clientDeviceRef, {
          ...reservation,
          ipHash,
          lockType: 'CLIENT_DEVICE_ID',
        });
      }
      transaction.set(ipRef, {
        ...reservation,
        deviceCookieHash,
        expiresAtMs: ipExpiresAtMs,
      });

      return { eligible: true };
    });
  } catch (error: unknown) {
    console.error('[FreeTrialAbuse] Atomic claim reservation failed; withholding free trial safely:', error instanceof Error ? error.message : 'unknown error');
    return { eligible: false, reason: 'ABUSE_GUARD_UNAVAILABLE' };
  }
}

/** Finalize a reserved claim after the student account transaction has committed. */
export async function finalizeFreeTrialClaimForAccount(params: FreeTrialClaimSignals): Promise<boolean> {
  const { userId, deviceCookieHash, clientDeviceHash, ipHash } = params;
  if (!deviceCookieHash || !ipHash) return false;

  try {
    const store = getClaimsStore();
    const { deviceCookieRef, clientDeviceRef, ipRef } = getClaimRefs(store, params);
    const now = Date.now();

    return await store.runTransaction(async (transaction) => {
      const cookieSnap = await transaction.get(deviceCookieRef);
      const clientSnap = clientDeviceRef ? await transaction.get(clientDeviceRef) : null;
      const ipSnap = await transaction.get(ipRef);

      const docs = [
        { ref: deviceCookieRef, snap: cookieSnap, kind: 'device' },
        ...(clientDeviceRef && clientSnap ? [{ ref: clientDeviceRef, snap: clientSnap, kind: 'client' }] : []),
        { ref: ipRef, snap: ipSnap, kind: 'ip' },
      ];

      for (const item of docs) {
        if (!item.snap.exists) return false;
        const data = item.snap.data() || {};
        if (data.userId !== userId) return false;
        if (data.status === 'RESERVED' && Number(data.reservationExpiresAtMs || 0) <= now) return false;
        if (item.kind === 'ip' && data.deviceCookieHash !== deviceCookieHash) return false;
        if (data.status !== 'RESERVED' && data.status !== 'CLAIMED') return false;
      }

      for (const item of docs) {
        const finalClaim: Record<string, unknown> = {
          status: 'CLAIMED',
          claimedAt: FieldValue.serverTimestamp(),
          reservationExpiresAtMs: FieldValue.delete(),
        };
        if (item.kind === 'ip') finalClaim.expiresAtMs = now + IP_TRIAL_LOCK_WINDOW_MS;
        transaction.set(item.ref, finalClaim, { merge: true });
      }
      return true;
    });
  } catch (error: unknown) {
    console.error('[FreeTrialAbuse] Could not finalize trial claim; free trial remains disabled.', error instanceof Error ? error.message : 'unknown error');
    return false;
  }
}

/**
 * Releases only this uncommitted user's reservation if account creation fails.
 * It can never release a different account's permanent device/IP claim.
 */
export async function releaseFreeTrialClaimForAccount(params: FreeTrialClaimSignals): Promise<void> {
  const { userId, deviceCookieHash, clientDeviceHash, ipHash } = params;
  if (!deviceCookieHash || !ipHash) return;

  try {
    const store = getClaimsStore();
    const { deviceCookieRef, clientDeviceRef, ipRef } = getClaimRefs(store, params);
    const refs = [deviceCookieRef, ...(clientDeviceRef ? [clientDeviceRef] : []), ipRef];

    await store.runTransaction(async (transaction) => {
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      const releasable: Array<typeof refs[number]> = [];

      snapshots.forEach((snapshot, index) => {
        if (!snapshot.exists) return;
        const data = snapshot.data() || {};
        if (data.userId !== userId || data.status !== 'RESERVED') return;
        // IP is a shared lock: release only if it still belongs to this exact reservation.
        if (index === refs.length - 1 && data.deviceCookieHash !== deviceCookieHash) return;
        releasable.push(refs[index]);
      });

      for (const ref of releasable) transaction.delete(ref);
    });
  } catch (error: unknown) {
    console.error('[FreeTrialAbuse] Could not release an uncommitted signup reservation:', error instanceof Error ? error.message : 'unknown error');
  }
}
