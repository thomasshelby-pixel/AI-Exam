import crypto from 'node:crypto';
import { db } from '../db.js';
import {
  getFirestoreDb,
  getFirestoreDoc,
  getFirestoreDriverMode,
  queryFirestoreDocs,
  setFirestoreDoc,
} from './firestoreDbService.js';

export type DeviceActivityPlatform = 'APP' | 'WEB' | 'UNKNOWN';

export interface RecordUserDeviceActivityInput {
  userId: string;
  email?: string | null;
  fullName?: string | null;
  role?: string | null;
  deviceId: string;
  deviceName?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  platform?: DeviceActivityPlatform;
}

/**
 * Records the latest successful sign-in for a user/device pair.
 *
 * This is intentionally separate from trusted_devices: successful login does not
 * mean a device is MFA-trusted. The collection is server-written and contains
 * personal/security information, so Firestore client rules must deny direct access.
 */
export function getUserDeviceActivityDocumentId(userId: string, deviceId: string): string {
  const digest = crypto.createHash('sha256').update(`${userId.trim()}: ${deviceId.trim()}`).digest('hex').slice(0, 40);
  return `uda_${digest}`;
}

function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return clean ? clean.slice(0, maxLength) : null;
}

export async function recordUserDeviceActivity(input: RecordUserDeviceActivityInput): Promise<boolean> {
  try {
    const userId = safeText(input.userId, 160);
    const deviceId = safeText(input.deviceId, 240);
    if (!userId || !deviceId || !getFirestoreDb()) return false;

    const user = db.prepare(
      'SELECT id, email, full_name, role FROM users WHERE id = ?'
    ).get(userId) as { id: string; email: string; full_name: string; role: string } | undefined;
    if (!user) return false;

    const profile = user.role === 'STUDENT'
      ? db.prepare('SELECT student_code FROM student_profiles WHERE user_id = ?').get(userId) as { student_code?: string | null } | undefined
      : undefined;
    const studentCode = safeText(profile?.student_code, 32)?.toUpperCase() || null;

    const now = new Date().toISOString();
    const documentId = getUserDeviceActivityDocumentId(userId, deviceId);
    const resolvedPlatform: DeviceActivityPlatform =
      input.platform === 'APP' || input.platform === 'WEB' ? input.platform : 'UNKNOWN';
    // All login activity lives in the same authoritative Firestore database as
    // student accounts. Platform is metadata on the record; it does not select a
    // different database, so the website and app can use one shared activity log.
    const previous = await getFirestoreDoc<Record<string, any>>(
      'user_device_activity',
      documentId,
    );
    const firstSeenAt = safeText(previous?.first_seen_at, 64) || now;
    const previousCount = Number(previous?.login_count);
    const loginCount = Number.isFinite(previousCount) && previousCount >= 0
      ? Math.min(Math.floor(previousCount) + 1, 2_147_483_647)
      : 1;

    let isTrusted = false;
    try {
      const trusted = db.prepare(`
        SELECT id FROM trusted_devices
        WHERE user_id = ? AND device_id = ?
          AND status = 'ACTIVE'
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
        LIMIT 1
      `).get(userId, deviceId);
      isTrusted = Boolean(trusted);
    } catch {
      // Trusted-device table may not be initialized in isolated/dev contexts.
    }

    const payload = {
      id: documentId,
      user_id: userId,
      user_name: safeText(input.fullName, 200) || safeText(user.full_name, 200),
      email: safeText(input.email, 254) || safeText(user.email, 254),
      role: safeText(input.role, 40) || safeText(user.role, 40),
      student_code: studentCode,
      display_id: studentCode || userId,
      device_id: deviceId,
      device_name: safeText(input.deviceName, 200) || 'Unknown device',
      user_agent: safeText(input.userAgent, 768),
      ip_address: safeText(input.ipAddress, 64),
      platform: resolvedPlatform,
      is_trusted: isTrusted,
      first_seen_at: firstSeenAt,
      last_seen_at: now,
      last_login_at: now,
      login_count: loginCount,
    };

    // A single shared database avoids duplicated records and cross-database
    // synchronization. APP/WEB separation is retained in payload.platform.
    return await setFirestoreDoc('user_device_activity', documentId, payload);
  } catch (error) {
    console.warn('[DeviceActivity] Failed to record sign-in metadata:', error);
    return false;
  }
}


export interface UserDeviceActivitySummary {
  id: string;
  device_name: string;
  platform: DeviceActivityPlatform;
  first_seen_at: string | null;
  last_seen_at: string | null;
  last_login_at: string | null;
  login_count: number;
}

/**
 * Converts stored sign-in records into a privacy-minimized admin view.
 * Device identifiers, IP addresses and raw user-agent strings are deliberately
 * excluded from the returned shape.
 */
export function normalizeUserDeviceActivityRecords(
  records: Array<Record<string, any>>,
  userId: string,
): UserDeviceActivitySummary[] {
  const normalizedUserId = safeText(userId, 160);
  if (!normalizedUserId) return [];

  const timestamp = (value: unknown): number => {
    const parsed = Date.parse(typeof value === 'string' ? value : '');
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return records
    .filter((record) => String(record.user_id || '') === normalizedUserId)
    .map((record) => {
      const rawPlatform = String(record.platform || '').toUpperCase();
      const platform: DeviceActivityPlatform =
        rawPlatform === 'APP' || rawPlatform === 'WEB' ? rawPlatform : 'UNKNOWN';
      const rawCount = Number(record.login_count);
      return {
        id: safeText(record.id, 160) || 'unknown-activity',
        device_name: safeText(record.device_name, 200) || 'Unknown device',
        platform,
        first_seen_at: safeText(record.first_seen_at, 64),
        last_seen_at: safeText(record.last_seen_at, 64),
        last_login_at: safeText(record.last_login_at, 64),
        login_count: Number.isFinite(rawCount) && rawCount > 0
          ? Math.min(Math.floor(rawCount), 2_147_483_647)
          : 0,
      };
    })
    .sort((left, right) => timestamp(right.last_seen_at || right.last_login_at) -
      timestamp(left.last_seen_at || left.last_login_at))
    .slice(0, 20);
}

/**
 * Reads successful sign-in summaries for one student using the server's
 * authoritative Firestore Admin SDK. This is not a page-view or clickstream.
 */
export async function getUserDeviceActivityForUser(
  userId: string,
): Promise<UserDeviceActivitySummary[]> {
  const normalizedUserId = safeText(userId, 160);
  if (!normalizedUserId) return [];

  if (!getFirestoreDb() || getFirestoreDriverMode() !== 'ADMIN_SDK') {
    throw new Error('Authoritative sign-in activity storage is unavailable.');
  }

  const records = await queryFirestoreDocs<Record<string, any>>(
    'user_device_activity',
    [{ field: 'user_id', op: '==', value: normalizedUserId }],
    { failOnError: true },
  );

  // The query helper can switch drivers after a permission failure. Never expose
  // this restricted collection through a client-SDK fallback.
  if (getFirestoreDriverMode() !== 'ADMIN_SDK') {
    throw new Error('Sign-in activity could not be read through the Firebase Admin SDK.');
  }

  return normalizeUserDeviceActivityRecords(records, normalizedUserId);
}
