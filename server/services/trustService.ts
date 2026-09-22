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
  expiresAt: string;
  lastUsedAt: string;
  revokedAt?: string | null;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
}

/**
 * 365 days in milliseconds
 */
export const TRUST_DURATION_DAYS = 365;
export const TRUST_DURATION_MS = TRUST_DURATION_DAYS * 24 * 60 * 60 * 1000;
export const TRUST_DURATION_SECONDS = TRUST_DURATION_DAYS * 24 * 60 * 60;

/**
 * Initializes the trusted_devices table if it does not already exist,
 * and performs non-destructive column migrations (e.g. expires_at).
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
      expires_at TEXT,
      last_used_at TEXT DEFAULT CURRENT_TIMESTAMP,
      revoked_at TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_trusted_devices_user_device ON trusted_devices(user_id, device_id);
    CREATE INDEX IF NOT EXISTS idx_trusted_devices_lookup ON trusted_devices(user_id, device_id, status);
  `);

  // Migrate existing schema if expires_at column is missing
  try {
    const tableInfo = db.prepare('PRAGMA table_info(trusted_devices)').all() as Array<{ name: string }>;
    const hasExpiresAt = tableInfo.some((col) => col.name === 'expires_at');
    if (!hasExpiresAt) {
      db.exec(`
        ALTER TABLE trusted_devices ADD COLUMN expires_at TEXT;
      `);
      db.exec(`
        UPDATE trusted_devices 
        SET expires_at = datetime(trusted_at, '+365 days') 
        WHERE expires_at IS NULL;
      `);
    }
  } catch (err) {
    console.error('[TrustService] Schema check warning:', err);
  }
}

/**
 * Computes a secure SHA-256 hash of a trust token.
 */
export function hashTrustToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Extracts a cookie value from a raw Cookie header string.
 */
export function parseCookieValue(cookieHeader: string | undefined, key: string): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...v] = part.trim().split('=');
    if (k === key) {
      return decodeURIComponent(v.join('='));
    }
  }
  return undefined;
}

/**
 * Determines whether a given user + device + trustToken combination is authoritative and valid.
 * Validates:
 * 1. Matching user_id, device_id, and trust_token_hash
 * 2. status === 'ACTIVE'
 * 3. revoked_at IS NULL
 * 4. expires_at > CURRENT_TIMESTAMP (365 days window)
 *
 * Automatically updates last_used_at when verified.
 * Marks expired records as 'EXPIRED'.
 */
export function isDeviceTrusted(userId: string, deviceId?: string, trustToken?: string): boolean {
  if (!userId || !deviceId || !trustToken) {
    return false;
  }

  ensureTrustedDevicesTable();

  const tokenHash = hashTrustToken(trustToken);
  const cleanDeviceId = deviceId.trim();

  try {
    const record = db.prepare(`
      SELECT id, status, revoked_at, expires_at
      FROM trusted_devices
      WHERE user_id = ?
        AND device_id = ?
        AND trust_token_hash = ?
      LIMIT 1
    `).get(userId, cleanDeviceId, tokenHash) as {
      id: string;
      status: string;
      revoked_at: string | null;
      expires_at: string | null;
    } | undefined;

    if (!record) {
      return false;
    }

    // Check revocation
    if (record.status !== 'ACTIVE' || record.revoked_at !== null) {
      return false;
    }

    // Check expiration (365 days)
    if (record.expires_at) {
      const expiryTime = new Date(record.expires_at).getTime();
      if (isNaN(expiryTime) || expiryTime <= Date.now()) {
        // Mark as EXPIRED so database state is accurate
        db.prepare(`
          UPDATE trusted_devices
          SET status = 'EXPIRED'
          WHERE id = ?
        `).run(record.id);
        return false;
      }
    }

    // Device is active, unrevoked, and within the 365-day validity period
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
 * Marks a device as trusted for a user after successful TOTP MFA verification.
 * Generates and returns an opaque, high-entropy trustToken valid for exactly 365 days.
 */
export function markDeviceAsTrusted(params: {
  userId: string;
  deviceId: string;
  deviceName?: string;
  userAgent?: string;
  ipAddress?: string;
}): { trustToken: string; expiresAt: string; maxAgeSeconds: number } {
  ensureTrustedDevicesTable();

  const { userId, deviceId, deviceName, userAgent, ipAddress } = params;
  const cleanDeviceId = deviceId.trim();

  // Generate cryptographically secure 256-bit trust token
  const rawSecret = crypto.randomBytes(32).toString('hex');
  const trustToken = `trust_${rawSecret}`;
  const trustTokenHash = hashTrustToken(trustToken);
  const recordId = `trd_${crypto.randomBytes(8).toString('hex')}`;

  const expiresAt = new Date(Date.now() + TRUST_DURATION_MS).toISOString();

  db.prepare(`
    INSERT INTO trusted_devices (
      id, user_id, device_id, trust_token_hash, device_name, user_agent, ip_address, status, trusted_at, expires_at, last_used_at, revoked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, NULL)
    ON CONFLICT(user_id, device_id) DO UPDATE SET
      trust_token_hash = excluded.trust_token_hash,
      device_name = COALESCE(excluded.device_name, trusted_devices.device_name),
      user_agent = COALESCE(excluded.user_agent, trusted_devices.user_agent),
      ip_address = COALESCE(excluded.ip_address, trusted_devices.ip_address),
      status = 'ACTIVE',
      expires_at = excluded.expires_at,
      last_used_at = CURRENT_TIMESTAMP,
      revoked_at = NULL
  `).run(
    recordId,
    userId,
    cleanDeviceId,
    trustTokenHash,
    deviceName || null,
    userAgent || null,
    ipAddress || null,
    expiresAt
  );

  return {
    trustToken,
    expiresAt,
    maxAgeSeconds: TRUST_DURATION_SECONDS,
  };
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
 * Revokes all trusted devices for a user.
 * Triggered on security-sensitive events: password change, password reset, account recovery, etc.
 */
export function revokeAllDeviceTrust(userId: string, exceptDeviceId?: string): number {
  ensureTrustedDevicesTable();
  try {
    if (exceptDeviceId) {
      const res = db.prepare(`
        UPDATE trusted_devices
        SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND device_id != ? AND status = 'ACTIVE'
      `).run(userId, exceptDeviceId.trim());
      return Number(res.changes);
    }

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
 * Lists all active, non-expired trusted devices for a user.
 */
export function getTrustedDevicesForUser(userId: string): Array<{
  deviceId: string;
  deviceName: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  trustedAt: string;
  expiresAt: string | null;
  lastUsedAt: string;
  status: string;
}> {
  ensureTrustedDevicesTable();
  try {
    const nowIso = new Date().toISOString();
    const rows = db.prepare(`
      SELECT 
        device_id as deviceId, 
        device_name as deviceName, 
        user_agent as userAgent,
        ip_address as ipAddress,
        trusted_at as trustedAt, 
        expires_at as expiresAt,
        last_used_at as lastUsedAt,
        status
      FROM trusted_devices
      WHERE user_id = ? 
        AND status = 'ACTIVE' 
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY last_used_at DESC
    `).all(userId, nowIso) as Array<{
      deviceId: string;
      deviceName: string | null;
      userAgent: string | null;
      ipAddress: string | null;
      trustedAt: string;
      expiresAt: string | null;
      lastUsedAt: string;
      status: string;
    }>;
    return rows;
  } catch (err) {
    console.error('[TrustService] Error listing trusted devices:', err);
    return [];
  }
}
