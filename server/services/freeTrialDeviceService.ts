import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirestoreDb } from './firestoreDbService.js';

export const FREE_TRIAL_DEVICE_COOKIE = 'ca_free_trial_device';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;
const RESERVATION_TTL_MS = 15 * 60 * 1000;

export interface FreeTrialDeviceSignals {
  deviceCookieHash: string | null;
  clientDeviceHash: string | null;
}

export interface FreeTrialClaimResult {
  eligible: boolean;
  reservationHeld: boolean;
  reason?: 'DEVICE_ALREADY_USED' | 'DEVICE_SIGNAL_UNAVAILABLE' | 'ABUSE_GUARD_UNAVAILABLE';
}

function getHmacSecret(): string | null {
  const secret = String(process.env.TRIAL_ABUSE_HMAC_SECRET || process.env.JWT_SECRET || process.env.SESSION_SECRET || '').trim();
  return secret.length >= 32 ? secret : null;
}

function hmac(kind: string, value: string): string | null {
  const secret = getHmacSecret();
  if (!secret || !value || value.length > 512) return null;
  return crypto.createHmac('sha256', secret).update('free-trial:' + kind + ':' + value).digest('hex');
}

function signNonce(nonce: string): string | null {
  const secret = getHmacSecret();
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update('trial-device-cookie:' + nonce).digest('hex');
}

function verifyCookie(cookie: string | undefined): string | null {
  if (!cookie || cookie.length > 256) return null;
  const [nonce, signature, extra] = cookie.split('.');
  if (extra !== undefined || !/^[a-f0-9]{64}$/i.test(nonce || '') || !/^[a-f0-9]{64}$/i.test(signature || '')) return null;
  const expectedHex = signNonce(nonce);
  if (!expectedHex) return null;
  const expected = Buffer.from(expectedHex, 'hex');
  const received = Buffer.from(signature, 'hex');
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  return nonce.toLowerCase();
}

function requestCookie(req: Request, name: string): string | undefined {
  const parsed = (req as any).cookies;
  if (parsed && typeof parsed[name] === 'string') return parsed[name];
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      try { return decodeURIComponent(rest.join('=')); } catch { return rest.join('='); }
    }
  }
  return undefined;
}

/**
 * Issue a signed, HttpOnly device marker for the free-trial claim. Only a keyed hash
 * is stored in Firestore; the nonce itself stays inside the client's cookie.
 */
export function getOrIssueFreeTrialDeviceSignals(req: Request, res: Response): FreeTrialDeviceSignals {
  const secret = getHmacSecret();
  if (!secret) return { deviceCookieHash: null, clientDeviceHash: null };

  let nonce = verifyCookie(requestCookie(req, FREE_TRIAL_DEVICE_COOKIE));
  if (!nonce) {
    nonce = crypto.randomBytes(32).toString('hex');
    const signature = signNonce(nonce);
    if (!signature) return { deviceCookieHash: null, clientDeviceHash: null };
    const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE);
    const cookieValue = encodeURIComponent(nonce + '.' + signature);
    res.setHeader('Set-Cookie', [
      `${FREE_TRIAL_DEVICE_COOKIE}=${cookieValue}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`,
    ]);
  }

  const deviceCookieHash = hmac('device-cookie', nonce);
  const clientHeader = req.headers['x-device-id'];
  const clientDeviceId =
    typeof clientHeader === 'string' &&
    !['fallback_device_id', 'server_render_env'].includes(clientHeader.trim())
      ? clientHeader.trim()
      : '';
  const clientDeviceHash = clientDeviceId ? hmac('client-device', clientDeviceId) : null;
  return { deviceCookieHash, clientDeviceHash };
}

function getClaimRefs(store: FirebaseFirestore.Firestore, signals: FreeTrialDeviceSignals) {
  const refs = [];
  if (signals.deviceCookieHash) refs.push(store.collection('free_trial_device_claims').doc(signals.deviceCookieHash));
  if (signals.clientDeviceHash) refs.push(store.collection('free_trial_client_device_claims').doc(signals.clientDeviceHash));
  return refs;
}

/**
 * Atomically reserve a free trial against this signed browser cookie and, when available,
 * the app's persistent client device ID. Network/IP is deliberately NOT a hard lock:
 * students sharing a hostel, coaching centre, library or household internet must not block
 * one another. Turnstile, ICAI-SRN claims and duplicate-PDF checks remain complementary gates.
 */
export async function reserveFreeTrialForAccount(
  userId: string,
  signals: FreeTrialDeviceSignals,
): Promise<FreeTrialClaimResult> {
  if (!signals.deviceCookieHash) {
    return { eligible: false, reservationHeld: false, reason: 'DEVICE_SIGNAL_UNAVAILABLE' };
  }

  try {
    const store = getFirestoreDb();
    if (!store) return { eligible: false, reservationHeld: false, reason: 'ABUSE_GUARD_UNAVAILABLE' };
    const refs = getClaimRefs(store, signals);
    if (!refs.length) return { eligible: false, reservationHeld: false, reason: 'DEVICE_SIGNAL_UNAVAILABLE' };
    const now = Date.now();

    return await store.runTransaction(async (transaction) => {
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      for (const snap of snapshots) {
        if (!snap.exists) continue;
        const data = snap.data() || {};
        if (data.userId === userId && data.status === 'CLAIMED') {
          return { eligible: true, reservationHeld: false };
        }
        if (data.userId === userId && data.status === 'RESERVED' && Number(data.reservationExpiresAtMs || 0) > now) {
          return { eligible: true, reservationHeld: true };
        }
        if (data.status === 'CLAIMED' ||
            (data.status === 'RESERVED' && Number(data.reservationExpiresAtMs || 0) > now)) {
          return { eligible: false, reservationHeld: false, reason: 'DEVICE_ALREADY_USED' };
        }
      }

      const reservationExpiresAtMs = now + RESERVATION_TTL_MS;
      for (const ref of refs) {
        transaction.set(ref, {
          userId,
          status: 'RESERVED',
          reservationExpiresAtMs,
          reservedAt: FieldValue.serverTimestamp(),
        });
      }
      return { eligible: true, reservationHeld: true };
    });
  } catch (error: unknown) {
    console.error('[FreeTrialAbuse] Could not reserve a global device trial claim; trial withheld.', error instanceof Error ? error.message : 'unknown error');
    return { eligible: false, reservationHeld: false, reason: 'ABUSE_GUARD_UNAVAILABLE' };
  }
}

export async function finalizeFreeTrialForAccount(
  userId: string,
  signals: FreeTrialDeviceSignals,
): Promise<boolean> {
  if (!signals.deviceCookieHash) return false;
  try {
    const store = getFirestoreDb();
    if (!store) return false;
    const refs = getClaimRefs(store, signals);
    if (!refs.length) return false;
    const now = Date.now();

    return await store.runTransaction(async (transaction) => {
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      for (const snap of snapshots) {
        if (!snap.exists) return false;
        const data = snap.data() || {};
        if (data.userId !== userId) return false;
        if (data.status === 'RESERVED' && Number(data.reservationExpiresAtMs || 0) <= now) return false;
        if (data.status !== 'RESERVED' && data.status !== 'CLAIMED') return false;
      }
      for (const ref of refs) {
        transaction.set(ref, {
          status: 'CLAIMED',
          claimedAt: FieldValue.serverTimestamp(),
          reservationExpiresAtMs: FieldValue.delete(),
        }, { merge: true });
      }
      return true;
    });
  } catch (error: unknown) {
    console.error('[FreeTrialAbuse] Could not finalize the device trial claim; trial withheld.', error instanceof Error ? error.message : 'unknown error');
    return false;
  }
}

export async function releaseFreeTrialReservation(
  userId: string,
  signals: FreeTrialDeviceSignals,
): Promise<void> {
  try {
    const store = getFirestoreDb();
    if (!store) return;
    const refs = getClaimRefs(store, signals);
    if (!refs.length) return;
    await store.runTransaction(async (transaction) => {
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      snapshots.forEach((snap, index) => {
        const data = snap.data() || {};
        if (snap.exists && data.userId === userId && data.status === 'RESERVED') {
          transaction.delete(refs[index]);
        }
      });
    });
  } catch (error: unknown) {
    console.error('[FreeTrialAbuse] Failed to release an unfinished device trial reservation.', error instanceof Error ? error.message : 'unknown error');
  }
}
