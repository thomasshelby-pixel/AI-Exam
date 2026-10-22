import crypto from 'node:crypto';
import { isIP } from 'node:net';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import { loadAndValidateFirebaseConfig } from '../config/firebaseConfigValidator.js';

export const FREE_TRIAL_DEVICE_COOKIE = 'ca_free_trial_device';
export const FREE_TRIAL_DEVICE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;
const IP_TRIAL_LOCK_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;

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

let claimsFirestore: Firestore | null = null;
let warnedMissingSecret = false;

function getTrialHashSecret(): string | null {
  // Prefer a dedicated secret, while reusing the existing server secret to avoid
  // introducing a new production dependency for an already-configured installation.
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
 * Firebase App Hosting fronts the runtime with Google-managed proxies. The external
 * load balancer appends the observed client IP and then its own IP to X-Forwarded-For.
 * Do NOT trust the left-most value: clients can supply their own leading XFF values.
 * Setting FREE_TRIAL_XFF_CLIENT_IP_INDEX_FROM_RIGHT allows adjustment if the hosting
 * topology appends additional documented proxy hops before the app.
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

  // A local development fallback only. In production, the socket is commonly a proxy,
  // not the student; using it could accidentally lock every user to one shared proxy IP.
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

/**
 * Atomic, multi-instance-safe trial claim. A browser/device can receive one claim ever;
 * an IP address can receive one claim within a rolling 180-day window. Only keyed HMACs
 * are persisted; raw IP addresses and cookie tokens are never stored in the claims ledger.
 */
export async function claimFreeTrialForAccount(params: {
  userId: string;
  deviceCookieHash: string | null;
  clientDeviceHash: string | null;
  ipHash: string | null;
}): Promise<FreeTrialClaimResult> {
  const { userId, deviceCookieHash, clientDeviceHash, ipHash } = params;
  if (!deviceCookieHash) return { eligible: false, reason: 'DEVICE_ID_UNAVAILABLE' };
  if (!ipHash) return { eligible: false, reason: 'NETWORK_ID_UNAVAILABLE' };

  try {
    const store = getClaimsStore();
    const cookieDeviceRef = store.collection('free_trial_device_claims').doc(deviceCookieHash);
    const clientDeviceRef = clientDeviceHash
      ? store.collection('free_trial_client_device_claims').doc(clientDeviceHash)
      : null;
    const ipRef = store.collection('free_trial_ip_claims').doc(ipHash);
    const now = Date.now();

    return await store.runTransaction(async (transaction) => {
      // Read every document before issuing transaction writes.
      const cookieDeviceSnap = await transaction.get(cookieDeviceRef);
      const clientDeviceSnap = clientDeviceRef ? await transaction.get(clientDeviceRef) : null;
      const ipSnap = await transaction.get(ipRef);

      const deviceSnaps = [cookieDeviceSnap, ...(clientDeviceSnap ? [clientDeviceSnap] : [])];
      const existingDeviceClaim = deviceSnaps.find((snap) => snap.exists);
      if (existingDeviceClaim) {
        const data = existingDeviceClaim.data() || {};
        if (data.userId === userId && data.status === 'CLAIMED') {
          return { eligible: true };
        }
        return { eligible: false, reason: 'DEVICE_ALREADY_USED' };
      }

      if (ipSnap.exists) {
        const ipData = ipSnap.data() || {};
        if (ipData.userId === userId && ipData.deviceCookieHash === deviceCookieHash && ipData.status === 'CLAIMED') {
          return { eligible: true };
        }
        const expiresAtMs = Number(ipData.expiresAtMs || 0);
        if (!expiresAtMs || expiresAtMs > now) {
          return { eligible: false, reason: 'IP_ALREADY_USED' };
        }
        // The IP cooldown has expired. Device claims remain permanent.
        transaction.delete(ipRef);
      }

      const ipExpiresAtMs = now + IP_TRIAL_LOCK_WINDOW_MS;
      const claim = {
        userId,
        status: 'CLAIMED',
        claimedAt: FieldValue.serverTimestamp(),
      };
      transaction.create(cookieDeviceRef, {
        ...claim,
        ipHash,
        lockType: 'SIGNED_BROWSER_COOKIE',
      });
      if (clientDeviceRef) {
        transaction.create(clientDeviceRef, {
          ...claim,
          ipHash,
          lockType: 'CLIENT_DEVICE_ID',
        });
      }
      transaction.set(ipRef, {
        ...claim,
        deviceCookieHash,
        expiresAtMs: ipExpiresAtMs,
      });

      return { eligible: true };
    });
  } catch (error: unknown) {
    console.error('[FreeTrialAbuse] Atomic claim failed; withholding free trial safely:', error instanceof Error ? error.message : 'unknown error');
    return { eligible: false, reason: 'ABUSE_GUARD_UNAVAILABLE' };
  }
}
