import crypto from 'node:crypto';
import { db } from '../db.js';
import {
  getFirestoreDb,
  getFirestoreDoc,
  getFirestoreDocInDatabase,
  setFirestoreDoc,
  setFirestoreDocInDatabase,
} from './firestoreDbService.js';

const APP_DEVICE_ACTIVITY_DATABASE_ID = String(
  process.env.APP_DEVICE_ACTIVITY_FIRESTORE_DATABASE_ID ||
  'ai-studio-aiexamapp-84322cc5-3d67-4034-bd47-214b89165488'
).trim();

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
    const previous = resolvedPlatform === 'APP'
      ? await getFirestoreDocInDatabase<Record<string, any>>(
          APP_DEVICE_ACTIVITY_DATABASE_ID,
          'user_device_activity',
          documentId,
        )
      : await getFirestoreDoc<Record<string, any>>('user_device_activity', documentId);
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

    if (payload.platform === 'APP') {
      // The app and website intentionally use separate named Firestore databases.
      // App-originated activity belongs in the app database, not the website database.
      const saved = await setFirestoreDocInDatabase(
        APP_DEVICE_ACTIVITY_DATABASE_ID,
        'user_device_activity',
        documentId,
        payload,
      );
      if (!saved) {
        console.warn('[DeviceActivity] App login telemetry was not saved to the app Firestore database.');
      }
      return saved;
    }

    // Website and unattributed legacy clients remain in the website-configured database.
    return await setFirestoreDoc('user_device_activity', documentId, payload);
  } catch (error) {
    console.warn('[DeviceActivity] Failed to record sign-in metadata:', error);
    return false;
  }
}
