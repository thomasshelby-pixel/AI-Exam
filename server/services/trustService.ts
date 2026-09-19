import crypto from 'node:crypto';
import { db } from '../db.js';

export interface TrustedDeviceRecord {
  id: string;
  userId: string;
  deviceId: string;
  trustTokenHash: string;
  deviceName?: string;
  userAgent?: string;
  ipAddress?: string;
  trustedAt: string;
  lastUsedAt: string;
  revokedAt?: string | null;
  status: 'ACTIVE' | 'REVOKED';
}

/**
 * Initializes the trusted_devices table if it does not already exist.
 */
export function ensureTrustedDevicesTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trusted_devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      trust_token_hash TEXT NOT NULL,
      device_name TEXT,
      user_agent TEXT,
      ip_address TEXT,
      trusted_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT DEFAULT CURRENT_TIMESTAMP,
      revoked_at TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_trusted_devices_user_device ON trusted_devices(user_id, device_id);
    CREATE INDEX IF NOT EXISTS idx_trusted_devices_lookup ON trusted_devices(user_id, device_id, status);
  `);
}

/**
 * Computes a secure SHA-256 hash of a trust token.
 */
export function hashTrustToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Determines whether a given user + device + trustToken combination is authoritative and trusted.
 * Automatically updates last_used_at when verified.
 */
export function isDeviceTrusted(userId: string, deviceId?: string, trustToken?: string): boolean {
  if (!userId || !deviceId || !trustToken) {
    return false;
  }

  ensureTrustedDevicesTable();

  const tokenHash = hashTrustToken(trustToken);

  try {
    const record = db.prepare(`
      SELECT id, status, revoked_at
      FROM trusted_devices
      WHERE user_id = ?
        AND device_id = ?
        AND trust_token_hash = ?
        AND status = 'ACTIVE'
        AND revoked_at IS NULL
      LIMIT 1
    `).get(userId, deviceId.trim(), tokenHash) as { id: string; status: string; revoked_at: string | null } | undefined;

    if (!record) {
      return false;
    }

    // Refresh last_used_at timestamp
    db.prepare(`
      UPDATE trusted_devices
      SET last_used_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(record.id);

    return true;
  } catch (err) {
    console.error('[TrustService] Error evaluating device trust:', err);
    return false;
  }
}

/**
 * Marks a device as trusted for a user after successful MFA verification.
 * Generates and returns an opaque, high-entropy trustToken.
 */
export function markDeviceAsTrusted(params: {
  userId: string;
  deviceId: string;
  deviceName?: string;
  userAgent?: string;
  ipAddress?: string;
}): { trustToken: string } {
  ensureTrustedDevicesTable();

  const { userId, deviceId, deviceName, userAgent, ipAddress } = params;
  const cleanDeviceId = deviceId.trim();

  // Generate cryptographically secure 256-bit trust token
  const rawSecret = crypto.randomBytes(32).toString('hex');
  const trustToken = `trust_${rawSecret}`;
  const trustTokenHash = hashTrustToken(trustToken);
  const recordId = `trd_${crypto.randomBytes(8).toString('hex')}`;

  db.prepare(`
    INSERT INTO trusted_devices (
      id, user_id, device_id, trust_token_hash, device_name, user_agent, ip_address, status, trusted_at, last_used_at, revoked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
    ON CONFLICT(user_id, device_id) DO UPDATE SET
      trust_token_hash = excluded.trust_token_hash,
      device_name = COALESCE(excluded.device_name, trusted_devices.device_name),
      user_agent = COALESCE(excluded.user_agent, trusted_devices.user_agent),
      ip_address = COALESCE(excluded.ip_address, trusted_devices.ip_address),
      status = 'ACTIVE',
      last_used_at = CURRENT_TIMESTAMP,
      revoked_at = NULL
  `).run(
    recordId,
    userId,
    cleanDeviceId,
    trustTokenHash,
    deviceName || null,
    userAgent || null,
    ipAddress || null
  );

  return { trustToken };
}

/**
 * Revokes trust for a specific device.
 */
export function revokeDeviceTrust(userId: string, deviceId: string): boolean {
  ensureTrustedDevicesTable();
  try {
    const res = db.prepare(`
      UPDATE trusted_devices
      SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND device_id = ?
    `).run(userId, deviceId.trim());
    return res.changes > 0;
  } catch (err) {
    console.error('[TrustService] Error revoking device trust:', err);
    return false;
  }
}

/**
 * Revokes all trusted devices for a user (e.g. security reset, password change).
 */
export function revokeAllDeviceTrust(userId: string): number {
  ensureTrustedDevicesTable();
  try {
    const res = db.prepare(`
      UPDATE trusted_devices
      SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND status = 'ACTIVE'
    `).run(userId);
    return Number(res.changes);
  } catch (err) {
    console.error('[TrustService] Error revoking all device trust for user:', err);
    return 0;
  }
}

/**
 * Lists all active trusted devices for a user.
 */
export function getTrustedDevicesForUser(userId: string): Array<{
  deviceId: string;
  deviceName: string | null;
  trustedAt: string;
  lastUsedAt: string;
}> {
  ensureTrustedDevicesTable();
  try {
    const rows = db.prepare(`
      SELECT device_id as deviceId, device_name as deviceName, trusted_at as trustedAt, last_used_at as lastUsedAt
      FROM trusted_devices
      WHERE user_id = ? AND status = 'ACTIVE' AND revoked_at IS NULL
      ORDER BY last_used_at DESC
    `).all(userId) as Array<{
      deviceId: string;
      deviceName: string | null;
      trustedAt: string;
      lastUsedAt: string;
    }>;
    return rows;
  } catch (err) {
    console.error('[TrustService] Error listing trusted devices:', err);
    return [];
  }
}
