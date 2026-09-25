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
 * Checks multiple candidate trust tokens (e.g. from request body, X-Device-Trust-Token header, or cookie)
 * for a specific user and device. Returns the valid token and expiry if found.
 */
export function verifyUserDeviceTrust(
  userId: string,
  deviceId?: string,
  candidateTokens?: Array<string | undefined | null>
): { isTrusted: boolean; trustToken?: string; expiresAt?: string } {
  if (!userId || !deviceId || !candidateTokens || candidateTokens.length === 0) {
    return { isTrusted: false };
  }

  const cleanDeviceId = deviceId.trim();
  const validTokens = candidateTokens.filter((t): t is string => Boolean(t && typeof t === 'string' && t.trim().length > 0));

  for (const token of validTokens) {
    if (isDeviceTrusted(userId, cleanDeviceId, token)) {
      const trustInfo = getDeviceTrustInfo(userId, cleanDeviceId, token);
      return {
        isTrusted: true,
        trustToken: token,
        expiresAt: trustInfo.expiresAt || undefined,
      };
    }
  }

  return { isTrusted: false };
}

/**
 * Returns detailed trust info for a user + device + trustToken combination.
 */
export function getDeviceTrustInfo(
  userId: string,
  deviceId?: string,
  trustToken?: string
): {
  isTrusted: boolean;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'UNTRUSTED';
  expiresAt: string | null;
  lastUsedAt: string | null;
  deviceId?: string;
} {
  if (!userId || !deviceId || !trustToken) {
    return {
      isTrusted: false,
      status: 'UNTRUSTED',
      expiresAt: null,
      lastUsedAt: null,
      deviceId,
    };
  }

  ensureTrustedDevicesTable();
  const tokenHash = hashTrustToken(trustToken);
  const cleanDeviceId = deviceId.trim();

  try {
    const record = db.prepare(`
      SELECT id, status, revoked_at, expires_at, last_used_at
      FROM trusted_devices
      WHERE user_id = ?
        AND device_id = ?
        AND trust_token_hash = ?
      LIMIT 1
    `).get(userId, cleanDeviceId, tokenHash) as {
      id: string;
      status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
      revoked_at: string | null;
      expires_at: string | null;
      last_used_at: string | null;
    } | undefined;

    if (!record) {
      return {
        isTrusted: false,
        status: 'UNTRUSTED',
        expiresAt: null,
        lastUsedAt: null,
        deviceId: cleanDeviceId,
      };
    }

    if (record.status !== 'ACTIVE' || record.revoked_at !== null) {
      return {
        isTrusted: false,
        status: 'REVOKED',
        expiresAt: record.expires_at,
        lastUsedAt: record.last_used_at,
        deviceId: cleanDeviceId,
      };
    }

    if (record.expires_at) {
      const expiryTime = new Date(record.expires_at).getTime();
      if (isNaN(expiryTime) || expiryTime <= Date.now()) {
        db.prepare(`UPDATE trusted_devices SET status = 'EXPIRED' WHERE id = ?`).run(record.id);
        return {
          isTrusted: false,
          status: 'EXPIRED',
          expiresAt: record.expires_at,
          lastUsedAt: record.last_used_at,
          deviceId: cleanDeviceId,
        };
      }
    }

    // Refresh last_used_at
    db.prepare(`UPDATE trusted_devices SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?`).run(record.id);

    return {
      isTrusted: true,
      status: 'ACTIVE',
      expiresAt: record.expires_at,
      lastUsedAt: new Date().toISOString(),
      deviceId: cleanDeviceId,
    };
  } catch (err) {
    console.error('[TrustService] Error fetching device trust info:', err);
    return {
      isTrusted: false,
      status: 'UNTRUSTED',
      expiresAt: null,
      lastUsedAt: null,
      deviceId: cleanDeviceId,
    };
  }
}

/**
 * Checks if a trusted device record exists for a deviceId + trustToken without requiring userId.
 * Useful for pre-authenticating an untrusted browser before credentials are submitted.
 */
export function findTrustedDeviceByToken(
  deviceId?: string,
  trustToken?: string
): TrustedDeviceRecord | null {
  if (!deviceId || !trustToken) return null;
  ensureTrustedDevicesTable();
  const tokenHash = hashTrustToken(trustToken);
  try {
    const record = db.prepare(`
      SELECT 
        id,
        user_id as userId,
        device_id as deviceId,
        trust_token_hash as trustTokenHash,
        device_name as deviceName,
        user_agent as userAgent,
        ip_address as ipAddress,
        trusted_at as trustedAt,
        expires_at as expiresAt,
        last_used_at as lastUsedAt,
        revoked_at as revokedAt,
        status
      FROM trusted_devices
      WHERE device_id = ?
        AND trust_token_hash = ?
        AND status = 'ACTIVE'
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      LIMIT 1
    `).get(deviceId.trim(), tokenHash) as unknown as TrustedDeviceRecord | undefined;

    return record || null;
  } catch {
    return null;
  }
}

/**
 * Diagnostic results for RFC 6238 TOTP verification with time drift telemetry.
 * Safe and non-sensitive: Contains ONLY timing, step indices, and drift calculations.
 * Never stores or returns secret keys or raw OTP tokens.
 */
export interface TotpVerificationDiagnostic {
  valid: boolean;
  serverTimeUtc: string;
  serverEpochSeconds: number;
  currentStep: number;
  windowSteps: number;
  driftToleranceSeconds: number;
  allowedWindowStartUtc: string;
  allowedWindowEndUtc: string;
  matchedStepOffset: number | null;
  detectedOffsetInExpandedWindow: number | null;
  detectedDriftSeconds: number | null;
  driftInterpretation: string;
}

/**
 * Detailed diagnostic evaluation of RFC 6238 TOTP with safe drift window calculation.
 * Computes exact time boundaries and tests expanded windows to determine clock drift vs mismatch.
 * NEVER returns, logs, or leaks the secret key, seed, or plain OTP code.
 */
export function evaluateRfc6238TotpDiagnostics(
  secret: string,
  token: string,
  windowSteps: number = 1,
  expandedWindowSteps: number = 10
): TotpVerificationDiagnostic {
  const now = new Date();
  const serverTimeUtc = now.toISOString();
  const serverEpochSeconds = Math.floor(now.getTime() / 1000);
  const currentStep = Math.floor(serverEpochSeconds / 30);
  const driftToleranceSeconds = windowSteps * 30;

  const allowedWindowStartUtc = new Date((currentStep - windowSteps) * 30 * 1000).toISOString();
  const allowedWindowEndUtc = new Date(((currentStep + windowSteps + 1) * 30 * 1000) - 1).toISOString();

  if (!secret || !token) {
    return {
      valid: false,
      serverTimeUtc,
      serverEpochSeconds,
      currentStep,
      windowSteps,
      driftToleranceSeconds,
      allowedWindowStartUtc,
      allowedWindowEndUtc,
      matchedStepOffset: null,
      detectedOffsetInExpandedWindow: null,
      detectedDriftSeconds: null,
      driftInterpretation: 'MISSING_SECRET_OR_TOKEN',
    };
  }

  const cleanToken = token.trim().replace(/\D/g, '');
  if (cleanToken.length !== 6) {
    return {
      valid: false,
      serverTimeUtc,
      serverEpochSeconds,
      currentStep,
      windowSteps,
      driftToleranceSeconds,
      allowedWindowStartUtc,
      allowedWindowEndUtc,
      matchedStepOffset: null,
      detectedOffsetInExpandedWindow: null,
      detectedDriftSeconds: null,
      driftInterpretation: 'INVALID_TOKEN_FORMAT_NOT_6_DIGITS',
    };
  }

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  const cleanSecret = secret.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');

  for (let i = 0; i < cleanSecret.length; i++) {
    const idx = alphabet.indexOf(cleanSecret[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  const key = Buffer.from(output);
  if (key.length === 0) {
    return {
      valid: false,
      serverTimeUtc,
      serverEpochSeconds,
      currentStep,
      windowSteps,
      driftToleranceSeconds,
      allowedWindowStartUtc,
      allowedWindowEndUtc,
      matchedStepOffset: null,
      detectedOffsetInExpandedWindow: null,
      detectedDriftSeconds: null,
      driftInterpretation: 'INVALID_BASE32_SECRET',
    };
  }

  // 1. Evaluate within standard allowed window (+/- windowSteps)
  let matchedOffset: number | null = null;
  for (let stepOffset = -windowSteps; stepOffset <= windowSteps; stepOffset++) {
    const step = currentStep + stepOffset;
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigInt64BE(BigInt(step));

    const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = (binary % 1000000).toString().padStart(6, '0');
    if (otp === cleanToken) {
      matchedOffset = stepOffset;
      break;
    }
  }

  if (matchedOffset !== null) {
    return {
      valid: true,
      serverTimeUtc,
      serverEpochSeconds,
      currentStep,
      windowSteps,
      driftToleranceSeconds,
      allowedWindowStartUtc,
      allowedWindowEndUtc,
      matchedStepOffset: matchedOffset,
      detectedOffsetInExpandedWindow: matchedOffset,
      detectedDriftSeconds: matchedOffset * 30,
      driftInterpretation: matchedOffset === 0 ? 'SYNCHRONIZED' : `SLIGHT_DRIFT_${matchedOffset * 30}S`,
    };
  }

  // 2. Out of allowed window: scan expanded window (e.g. +/- 10 steps = +/- 300s) to diagnose clock drift vs secret mismatch
  let expandedOffset: number | null = null;
  for (let stepOffset = -expandedWindowSteps; stepOffset <= expandedWindowSteps; stepOffset++) {
    if (Math.abs(stepOffset) <= windowSteps) continue; // Already checked

    const step = currentStep + stepOffset;
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigInt64BE(BigInt(step));

    const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = (binary % 1000000).toString().padStart(6, '0');
    if (otp === cleanToken) {
      expandedOffset = stepOffset;
      break;
    }
  }

  const detectedDriftSeconds = expandedOffset !== null ? expandedOffset * 30 : null;
  const driftInterpretation = expandedOffset !== null
    ? `CLIENT_CLOCK_DRIFT_OUT_OF_WINDOW_${detectedDriftSeconds! > 0 ? '+' : ''}${detectedDriftSeconds}S`
    : `NO_MATCH_IN_EXPANDED_WINDOW_${expandedWindowSteps * 30}S (SECRET_MISMATCH_OR_INCORRECT_CODE)`;

  return {
    valid: false,
    serverTimeUtc,
    serverEpochSeconds,
    currentStep,
    windowSteps,
    driftToleranceSeconds,
    allowedWindowStartUtc,
    allowedWindowEndUtc,
    matchedStepOffset: null,
    detectedOffsetInExpandedWindow: expandedOffset,
    detectedDriftSeconds,
    driftInterpretation,
  };
}

/**
 * Safe, non-sensitive logging for TOTP verification attempts (especially failures).
 * Logs server time, user's secret key timestamp, and the drift window calculated.
 * NEVER logs the secret key, seed, password, or entered TOTP code.
 */
export function logSafeTotpDriftDiagnostics(params: {
  userId: string;
  userEmail?: string;
  userRole?: string;
  endpoint: string;
  ipAddress?: string;
  userAgent?: string;
  secretEnrolledAt: string | null;
  secretUpdatedAt?: string | null;
  diagnostics: TotpVerificationDiagnostic;
  remainingAttempts?: number;
}): void {
  const isSpecialStudent = params.userId === 'usr_bf97ebeeae7273b7' || params.userEmail === 'adityakumart484@gmail.com';
  const prefix = isSpecialStudent
    ? '[MFA TOTP DIAGNOSTIC - TARGET STUDENT usr_bf97ebeeae7273b7]'
    : '[MFA TOTP Verification Failure - Safe Drift Diagnostics]';

  const logPayload = {
    userId: params.userId,
    userEmail: params.userEmail || 'unknown',
    userRole: params.userRole || 'STUDENT',
    endpoint: params.endpoint,
    serverTimeUtc: params.diagnostics.serverTimeUtc,
    serverEpochSeconds: params.diagnostics.serverEpochSeconds,
    currentStep: params.diagnostics.currentStep,
    secretKeyTimestamp: params.secretEnrolledAt || 'UNSET_OR_NOT_ENROLLED',
    secretKeyUpdatedAt: params.secretUpdatedAt || null,
    calculatedDriftWindow: {
      allowedWindowSteps: params.diagnostics.windowSteps,
      driftToleranceSeconds: params.diagnostics.driftToleranceSeconds,
      windowStartUtc: params.diagnostics.allowedWindowStartUtc,
      windowEndUtc: params.diagnostics.allowedWindowEndUtc,
    },
    detectedOffsetInExpandedWindow: params.diagnostics.detectedOffsetInExpandedWindow,
    detectedDriftSeconds: params.diagnostics.detectedDriftSeconds,
    driftInterpretation: params.diagnostics.driftInterpretation,
    remainingAttempts: params.remainingAttempts ?? null,
  };

  console.warn(prefix, JSON.stringify(logPayload, null, 2));
}

/**
 * RFC 6238 standard TOTP verification helper.
 * Validates a 6-digit TOTP token against a Base32 encoded secret key with time drift tolerance (+/- windowSteps).
 */
export function verifyRfc6238Totp(secret: string, token: string, windowSteps: number = 1): boolean {
  return evaluateRfc6238TotpDiagnostics(secret, token, windowSteps).valid;
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
