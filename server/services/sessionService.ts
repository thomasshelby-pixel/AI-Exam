import crypto from 'crypto';
import { db } from '../db.js';
import { checkPermanentFreeAccess } from '../auth.js';

export const MAX_STUDENT_DEVICES = 2;

/**
 * Initializes the user_sessions table if it doesn't already exist.
 */
export function ensureSessionsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      device_name TEXT,
      ip_address TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_activity_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_sessions_lookup ON user_sessions(user_id, status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_device ON user_sessions(user_id, device_id);
  `);
}

/**
 * Automatically cleans up expired sessions for a user or globally.
 */
export function cleanupExpiredSessions(userId?: string): void {
  try {
    if (userId) {
      db.prepare(`
        UPDATE user_sessions
        SET status = 'EXPIRED'
        WHERE user_id = ? AND status = 'ACTIVE' AND datetime(expires_at) <= datetime('now')
      `).run(userId);
    } else {
      db.prepare(`
        UPDATE user_sessions
        SET status = 'EXPIRED'
        WHERE status = 'ACTIVE' AND datetime(expires_at) <= datetime('now')
      `).run();
    }
  } catch (err) {
    console.error('Session cleanup error:', err);
  }
}

/**
 * Gets the number of distinct active devices currently logged in for a user.
 */
export function getActiveDeviceCount(userId: string): number {
  cleanupExpiredSessions(userId);
  const result = db.prepare(`
    SELECT COUNT(DISTINCT device_id) as count
    FROM user_sessions
    WHERE user_id = ?
      AND status = 'ACTIVE'
      AND datetime(expires_at) > datetime('now')
  `).get(userId) as { count: number } | undefined;

  return result?.count || 0;
}

/**
 * Checks if the 2-device limit would be exceeded for this student.
 * 
 * Rules:
 * 1. Permanent-free accounts (e.g. adityakumart484@gmail.com, Manug8158@gmail.com) are EXEMPT.
 * 2. If the user already has an active session on this device (same deviceId),
 *    it is considered a session refresh/reuse and is ALLOWED.
 * 3. If the user is logging in on a new device and already has 2 active distinct devices,
 *    it is BLOCKED.
 */
export function isDeviceLimitExceeded(
  userId: string,
  email: string,
  deviceId: string
): { exceeded: boolean; activeDeviceCount: number; maxDevicesAllowed: number } {
  // Check permanent-free exemption
  if (checkPermanentFreeAccess(email)) {
    return {
      exceeded: false,
      activeDeviceCount: 0,
      maxDevicesAllowed: 999,
    };
  }

  cleanupExpiredSessions(userId);

  // Check if this specific device already has an active session (Session Reuse)
  const existingDeviceSession = db.prepare(`
    SELECT id FROM user_sessions
    WHERE user_id = ?
      AND device_id = ?
      AND status = 'ACTIVE'
      AND datetime(expires_at) > datetime('now')
    LIMIT 1
  `).get(userId, deviceId) as { id: string } | undefined;

  if (existingDeviceSession) {
    // Reusing existing device slot - allow
    const count = getActiveDeviceCount(userId);
    return {
      exceeded: false,
      activeDeviceCount: count,
      maxDevicesAllowed: MAX_STUDENT_DEVICES,
    };
  }

  // New device: count distinct active devices
  const activeCount = getActiveDeviceCount(userId);

  if (activeCount >= MAX_STUDENT_DEVICES) {
    return {
      exceeded: true,
      activeDeviceCount: activeCount,
      maxDevicesAllowed: MAX_STUDENT_DEVICES,
    };
  }

  return {
    exceeded: false,
    activeDeviceCount: activeCount,
    maxDevicesAllowed: MAX_STUDENT_DEVICES,
  };
}

/**
 * Creates a new active session or refreshes an existing one on the same device.
 */
export function createOrRefreshDeviceSession(params: {
  userId: string;
  deviceId: string;
  deviceName?: string;
  ipAddress?: string;
}): { sessionId: string } {
  const { userId, deviceId, deviceName, ipAddress } = params;
  cleanupExpiredSessions(userId);

  // Check if active session already exists for this (user_id, device_id)
  const existing = db.prepare(`
    SELECT id FROM user_sessions
    WHERE user_id = ?
      AND device_id = ?
      AND status = 'ACTIVE'
      AND datetime(expires_at) > datetime('now')
    ORDER BY last_activity_at DESC
    LIMIT 1
  `).get(userId, deviceId) as { id: string } | undefined;

  if (existing) {
    // Refresh existing session
    db.prepare(`
      UPDATE user_sessions
      SET last_activity_at = CURRENT_TIMESTAMP,
          expires_at = datetime('now', '+7 days'),
          device_name = COALESCE(?, device_name),
          ip_address = COALESCE(?, ip_address),
          status = 'ACTIVE'
      WHERE id = ?
    `).run(deviceName || null, ipAddress || null, existing.id);

    return { sessionId: existing.id };
  }

  // Create new session
  const sessionId = `sid_${crypto.randomBytes(16).toString('hex')}`;
  db.prepare(`
    INSERT INTO user_sessions (
      id, user_id, device_id, device_name, ip_address, status, expires_at
    )
    VALUES (?, ?, ?, ?, ?, 'ACTIVE', datetime('now', '+7 days'))
  `).run(
    sessionId,
    userId,
    deviceId,
    deviceName || null,
    ipAddress || null
  );

  return { sessionId };
}

/**
 * Revokes a session by session ID or (userId + deviceId).
 */
export function revokeDeviceSession(params: {
  sessionId?: string;
  userId?: string;
  deviceId?: string;
}): void {
  const { sessionId, userId, deviceId } = params;

  if (sessionId) {
    db.prepare(`
      UPDATE user_sessions
      SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'ACTIVE'
    `).run(sessionId);
  } else if (userId && deviceId) {
    db.prepare(`
      UPDATE user_sessions
      SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND device_id = ? AND status = 'ACTIVE'
    `).run(userId, deviceId);
  }
}

/**
 * Revokes all active sessions for a user (e.g. when suspended by Admin).
 */
export function revokeAllSessionsForUser(userId: string): void {
  db.prepare(`
    UPDATE user_sessions
    SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND status = 'ACTIVE'
  `).run(userId);
}

/**
 * Validates if a session is currently active and not expired.
 */
export function isSessionValid(sessionId: string): boolean {
  const session = db.prepare(`
    SELECT id, status, expires_at FROM user_sessions
    WHERE id = ?
  `).get(sessionId) as { id: string; status: string; expires_at: string } | undefined;

  if (!session) return false;
  if (session.status !== 'ACTIVE') return false;

  const isExpired = new Date(session.expires_at).getTime() <= Date.now();
  if (isExpired) {
    db.prepare("UPDATE user_sessions SET status = 'EXPIRED' WHERE id = ?").run(sessionId);
    return false;
  }

  // Update activity timestamp
  db.prepare("UPDATE user_sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);
  return true;
}

/**
 * Helper to safely extract clean device/browser descriptor from user-agent string.
 */
export function getSafeDeviceName(userAgentHeader?: string): string {
  if (!userAgentHeader) return 'Web Browser';

  let browser = 'Browser';
  if (userAgentHeader.includes('Firefox')) browser = 'Firefox';
  else if (userAgentHeader.includes('Edg/')) browser = 'Edge';
  else if (userAgentHeader.includes('Chrome')) browser = 'Chrome';
  else if (userAgentHeader.includes('Safari')) browser = 'Safari';

  let os = 'Device';
  if (userAgentHeader.includes('Windows')) os = 'Windows';
  else if (userAgentHeader.includes('Macintosh') || userAgentHeader.includes('Mac OS')) os = 'macOS';
  else if (userAgentHeader.includes('Android')) os = 'Android';
  else if (userAgentHeader.includes('iPhone') || userAgentHeader.includes('iPad')) os = 'iOS';
  else if (userAgentHeader.includes('Linux')) os = 'Linux';

  return `${browser} on ${os}`;
}
