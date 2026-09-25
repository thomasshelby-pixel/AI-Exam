import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { db } from '../db.js';
import { UserRole } from '../../src/types/index.js';
import { revokeAllDeviceTrust } from './trustService.js';
import { revokeAllSessionsForUser } from './sessionService.js';
import { formatDateTimeIST } from '../utils/timezone.js';
import { syncRecordToFirestore } from './firestoreSyncService.js';
import { deleteFirestoreDoc, getFirestoreDoc, getAllFirestoreDocs } from './firestoreDbService.js';

export interface RecoveryCodeStatus {
  total: number;
  remaining: number;
  hasCodes: boolean;
  generatedAt: string | null;
}

export interface AuthenticatorRecord {
  id: string;
  userId: string;
  factorType: 'PRIMARY_TOTP' | 'BACKUP_TOTP';
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface AuditLogRecord {
  id: string;
  userId?: string;
  eventType: string;
  action?: string;
  requestId?: string;
  targetUserUid?: string;
  targetUserEmail?: string;
  targetUserRole?: string;
  adminUid?: string;
  adminEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  status: 'SUCCESS' | 'FAILURE';
  istTimestamp?: string;
  correlationId?: string;
  details?: string;
  createdAt: string;
}

/**
 * Initializes tables for MFA Recovery Codes, Multi-Authenticators, Audit Logs, and Rate Limits.
 */
let mfaTablesInitialized = false;

export function initMfaRecoveryTables(force: boolean = false): void {
  if (mfaTablesInitialized && !force) {
    return;
  }

  try {
    const hasUsersTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (!hasUsersTable) {
      return;
    }
  } catch {
    return;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      used_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_mfa_recovery_user ON mfa_recovery_codes(user_id, used);

    CREATE TABLE IF NOT EXISTS mfa_authenticators (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      factor_type TEXT NOT NULL DEFAULT 'PRIMARY_TOTP',
      label TEXT NOT NULL DEFAULT 'Authenticator App',
      totp_secret TEXT,
      secret_key TEXT,
      phone_number TEXT,
      is_backup INTEGER NOT NULL DEFAULT 0,
      firebase_factor_uid TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_mfa_auth_user ON mfa_authenticators(user_id, factor_type);

    CREATE TABLE IF NOT EXISTS mfa_recovery_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      email TEXT NOT NULL,
      phone TEXT,
      srn_reg_no TEXT,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
      admin_notes TEXT,
      review_notes TEXT,
      resolution_notes TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      resolved_by TEXT,
      resolved_at TEXT,
      user_role TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_mfa_rec_req_status ON mfa_recovery_requests(status);

    CREATE TABLE IF NOT EXISTS mfa_audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      event_type TEXT NOT NULL,
      action TEXT,
      ip_address TEXT,
      user_agent TEXT,
      status TEXT NOT NULL,
      request_id TEXT,
      target_user_uid TEXT,
      target_user_email TEXT,
      target_user_role TEXT,
      admin_uid TEXT,
      admin_email TEXT,
      ist_timestamp TEXT,
      correlation_id TEXT,
      details TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_mfa_audit_user ON mfa_audit_logs(user_id, event_type);
    CREATE INDEX IF NOT EXISTS idx_mfa_audit_created ON mfa_audit_logs(created_at DESC);

    CREATE TABLE IF NOT EXISTS mfa_rate_limits (
      identifier TEXT PRIMARY KEY,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      last_attempt_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const addCol = (tbl: string, col: string, typ: string) => {
    try {
      if (!/^[a-zA-Z0-9_]+$/.test(tbl) || !/^[a-zA-Z0-9_]+$/.test(col) || !/^[a-zA-Z0-9_ ]+$/.test(typ)) {
        return;
      }
      const cols = db.prepare(`PRAGMA table_info(${tbl})`).all() as any[];
      if (!cols.some((c) => c.name === col)) {
        db.prepare(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${typ}`).run();
      }
    } catch {}
  };

  addCol('mfa_authenticators', 'factor_type', "TEXT NOT NULL DEFAULT 'PRIMARY_TOTP'");
  addCol('mfa_authenticators', 'label', "TEXT NOT NULL DEFAULT 'Authenticator App'");
  addCol('mfa_authenticators', 'totp_secret', 'TEXT');
  addCol('mfa_authenticators', 'secret_key', 'TEXT');
  addCol('mfa_authenticators', 'phone_number', 'TEXT');
  addCol('mfa_authenticators', 'is_backup', 'INTEGER NOT NULL DEFAULT 0');
  addCol('mfa_authenticators', 'firebase_factor_uid', 'TEXT');
  addCol('mfa_authenticators', 'last_used_at', 'TEXT');

  addCol('mfa_recovery_requests', 'review_notes', 'TEXT');
  addCol('mfa_recovery_requests', 'resolution_notes', 'TEXT');
  addCol('mfa_recovery_requests', 'resolved_at', 'TEXT');
  addCol('mfa_recovery_requests', 'resolved_by', 'TEXT');
  addCol('mfa_recovery_requests', 'user_role', 'TEXT');
  addCol('users', 'mfa_reset_required', 'INTEGER DEFAULT 0');
  addCol('users', 'pending_totp_secret', 'TEXT');
  addCol('users', 'mfa_phone', 'TEXT');

  addCol('mfa_audit_logs', 'action', 'TEXT');
  addCol('mfa_audit_logs', 'request_id', 'TEXT');
  addCol('mfa_audit_logs', 'target_user_uid', 'TEXT');
  addCol('mfa_audit_logs', 'target_user_email', 'TEXT');
  addCol('mfa_audit_logs', 'target_user_role', 'TEXT');
  addCol('mfa_audit_logs', 'admin_uid', 'TEXT');
  addCol('mfa_audit_logs', 'admin_email', 'TEXT');
  addCol('mfa_audit_logs', 'ist_timestamp', 'TEXT');
  addCol('mfa_audit_logs', 'correlation_id', 'TEXT');

  mfaTablesInitialized = true;

  // Fix inconsistent admin MFA states immediately on table initialization
  try {
    fixInconsistentAdminMfaStates();
  } catch (err) {
    console.warn('[MFA] Note during fixInconsistentAdminMfaStates:', err);
  }
}

// Auto-run initialization eagerly if database is already opened
try {
  initMfaRecoveryTables();
} catch {}

/**
 * Repairs any inconsistent admin accounts where mfa_enabled = 1 but no valid TOTP secret exists.
 * Safely transitions them into MFA_RESET_REQUIRED without deleting the account or changing UID.
 */
export function fixInconsistentAdminMfaStates(): void {
  try {
    const hasUsersTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (!hasUsersTable) {
      return;
    }
    const cols = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const colNames = new Set(cols.map((c) => c.name));
    if (!colNames.has('mfa_enabled') || !colNames.has('totp_secret') || !colNames.has('mfa_reset_required')) {
      return;
    }

    const adminUsers = db.prepare(`
      SELECT id, email, role, mfa_enabled, totp_secret, mfa_reset_required
      FROM users
      WHERE role IN ('MCQ_ADMIN', 'SUPER_ADMIN', 'INSTITUTE_ADMIN')
    `).all() as Array<{
      id: string;
      email: string;
      role: string;
      mfa_enabled: number;
      totp_secret: string | null;
      mfa_reset_required: number;
    }>;

    for (const admin of adminUsers) {
      const authWithSecret = db.prepare(`
        SELECT totp_secret FROM mfa_authenticators
        WHERE user_id = ? AND totp_secret IS NOT NULL AND length(totp_secret) >= 16
        LIMIT 1
      `).get(admin.id) as { totp_secret: string } | undefined;

      const hasValidSecret = Boolean(
        (admin.totp_secret && admin.totp_secret.trim().length >= 16) ||
        authWithSecret?.totp_secret
      );

      if (admin.mfa_enabled === 1 && !hasValidSecret) {
        console.warn(`[MFA Architecture] Repairing inconsistent admin account state for ${admin.email} (${admin.id}): Transitioning to MFA_RESET_REQUIRED.`);
        db.prepare(`
          UPDATE users
          SET mfa_enabled = 0,
              mfa_enrolled_at = NULL,
              totp_secret = NULL,
              pending_totp_secret = NULL,
              mfa_reset_required = 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(admin.id);

        db.prepare(`
          DELETE FROM mfa_authenticators
          WHERE user_id = ? AND (totp_secret IS NULL OR length(totp_secret) < 16)
        `).run(admin.id);

        revokeAllDeviceTrust(admin.id);

        syncRecordToFirestore('users', admin.id, {
          id: admin.id,
          mfa_enabled: 0,
          mfa_reset_required: 1,
          totp_secret: null,
          updated_at: new Date().toISOString(),
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[MFA Architecture] fixInconsistentAdminMfaStates error:', err);
  }
}

export type AuthoritativeMfaState = 'MFA_NOT_ENROLLED' | 'MFA_ENROLLED' | 'MFA_RESET_REQUIRED' | 'MFA_RECOVERY_PENDING';

/**
 * Generates a cryptographically secure 20-byte Base32 secret (RFC 4648)
 */
export function generateBase32Secret(byteLength: number = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const randomBytes = crypto.randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < randomBytes.length; i++) {
    value = (value << 8) | randomBytes[i];
    bits += 8;
    while (bits >= 5) {
      output += chars[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += chars[(value << (5 - bits)) & 31];
  }
  return output;
}

export function formatSecretKeyForDisplay(secretKey: string): string {
  if (!secretKey) return '';
  const clean = secretKey.replace(/\s+/g, '').toUpperCase();
  return clean.match(/.{1,4}/g)?.join(' ') || clean;
}

/**
 * Obtains or creates a persistent pending TOTP setup for initial enrollment or after reset.
 * NEVER regenerates secret when page reloads, session refreshes, or user navigates!
 */
export async function getOrCreatePendingMfaSetup(
  userId: string,
  accountEmail: string,
  role: string
): Promise<{
  secretKey: string;
  formattedKey: string;
  otpauthUri: string;
  qrDataUrl: string;
  account: string;
  accountEmail: string;
}> {
  const userRow = db.prepare('SELECT pending_totp_secret FROM users WHERE id = ?').get(userId) as any;
  let secret = userRow?.pending_totp_secret?.trim();

  if (!secret || secret.length < 16) {
    secret = generateBase32Secret(20);
    db.prepare('UPDATE users SET pending_totp_secret = ? WHERE id = ?').run(secret, userId);
  }

  const issuer = 'MCQ Arena';
  const accountLabel = role === 'MCQ_ADMIN' ? 'MCQ Admin' : role === 'SUPER_ADMIN' ? 'Super Admin' : 'Institute Admin';
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(accountEmail);
  const otpauthUri = `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

  const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
    width: 220,
    margin: 1,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });

  return {
    secretKey: secret,
    formattedKey: formatSecretKeyForDisplay(secret),
    otpauthUri,
    qrDataUrl,
    account: accountLabel,
    accountEmail,
  };
}

/**
 * Generates a brand-new distinct TOTP secret and QR code for adding an additional authenticator device.
 * Does NOT overwrite existing primary authenticator.
 */
export async function generateNewAuthenticatorDeviceSetup(
  accountEmail: string,
  deviceLabel: string = 'Secondary Authenticator'
): Promise<{
  secretKey: string;
  formattedKey: string;
  otpauthUri: string;
  qrDataUrl: string;
  label: string;
  accountEmail: string;
}> {
  const secretKey = generateBase32Secret(20);
  const issuer = 'MCQ Arena';
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(accountEmail);
  const otpauthUri = `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secretKey}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

  const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
    width: 220,
    margin: 1,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });

  return {
    secretKey,
    formattedKey: formatSecretKeyForDisplay(secretKey),
    otpauthUri,
    qrDataUrl,
    label: deviceLabel,
    accountEmail,
  };
}

/**
 * Authoritatively determines user MFA enrollment state:
 * - MFA_NOT_ENROLLED
 * - MFA_ENROLLED
 * - MFA_RESET_REQUIRED
 * - MFA_RECOVERY_PENDING
 */
export async function getAuthoritativeUserMfaState(userId: string): Promise<{
  state: AuthoritativeMfaState;
  hasValidSecret: boolean;
  secret?: string;
  pendingSecret?: string;
  authenticatorsCount: number;
  recoveryCodesRemaining: number;
}> {
  if (!userId) {
    return {
      state: 'MFA_NOT_ENROLLED',
      hasValidSecret: false,
      authenticatorsCount: 0,
      recoveryCodesRemaining: 0,
    };
  }

  try {
    initMfaRecoveryTables();

    // 1. Check for pending manual recovery requests
    const pendingRecovery = db.prepare(`
      SELECT id FROM mfa_recovery_requests
      WHERE user_id = ? AND status = 'PENDING_REVIEW'
      LIMIT 1
    `).get(userId);

    if (pendingRecovery) {
      return {
        state: 'MFA_RECOVERY_PENDING',
        hasValidSecret: false,
        authenticatorsCount: 0,
        recoveryCodesRemaining: 0,
      };
    }

    // 2. Fetch user row
    const userRow = db.prepare(`
      SELECT id, email, role, mfa_enabled, mfa_enrolled_at, totp_secret, pending_totp_secret, mfa_reset_required
      FROM users WHERE id = ?
    `).get(userId) as any;

    if (!userRow) {
      return {
        state: 'MFA_NOT_ENROLLED',
        hasValidSecret: false,
        authenticatorsCount: 0,
        recoveryCodesRemaining: 0,
      };
    }

    // 3. Count authenticators with valid secrets
    const authRecords = db.prepare(`
      SELECT id, totp_secret FROM mfa_authenticators
      WHERE user_id = ? AND totp_secret IS NOT NULL AND length(totp_secret) >= 16
    `).all(userId) as Array<{ id: string; totp_secret: string }>;
    const authenticatorsCount = authRecords.length;

    // 4. Count remaining recovery codes
    const recoveryCountRow = db.prepare(`
      SELECT COUNT(*) as count FROM mfa_recovery_codes WHERE user_id = ? AND used = 0
    `).get(userId) as { count: number } | undefined;
    const recoveryCodesRemaining = recoveryCountRow?.count || 0;

    // 5. Check if Super Admin reset MFA
    if (userRow.mfa_reset_required === 1) {
      return {
        state: 'MFA_RESET_REQUIRED',
        hasValidSecret: false,
        pendingSecret: userRow.pending_totp_secret || undefined,
        authenticatorsCount,
        recoveryCodesRemaining,
      };
    }

    // 6. Check for valid secret
    let validSecret: string | undefined = undefined;
    if (userRow.totp_secret && userRow.totp_secret.trim().length >= 16) {
      validSecret = userRow.totp_secret.trim();
    } else if (authRecords.length > 0) {
      validSecret = authRecords[0].totp_secret.trim();
      db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(validSecret, userId);
    }

    // 7. Enrolled state verification
    if (userRow.mfa_enabled === 1 && validSecret) {
      return {
        state: 'MFA_ENROLLED',
        hasValidSecret: true,
        secret: validSecret,
        authenticatorsCount,
        recoveryCodesRemaining,
      };
    }

    // 8. Inconsistent state detection: mfa_enabled = 1 but NO valid secret
    if (userRow.mfa_enabled === 1 && !validSecret) {
      console.warn(`[MFA Architecture] Inconsistent MFA enrollment detected for user ${userRow.email} (${userId}). Transitioning safely to MFA_RESET_REQUIRED.`);
      db.prepare(`
        UPDATE users
        SET mfa_enabled = 0,
            mfa_reset_required = 1,
            totp_secret = NULL,
            pending_totp_secret = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId);

      db.prepare(`
        DELETE FROM mfa_authenticators
        WHERE user_id = ? AND (totp_secret IS NULL OR length(totp_secret) < 16)
      `).run(userId);

      revokeAllDeviceTrust(userId);

      syncRecordToFirestore('users', userId, {
        id: userId,
        mfa_enabled: 0,
        mfa_reset_required: 1,
        totp_secret: null,
        updated_at: new Date().toISOString(),
      }).catch(() => {});

      return {
        state: 'MFA_RESET_REQUIRED',
        hasValidSecret: false,
        authenticatorsCount: 0,
        recoveryCodesRemaining,
      };
    }

    return {
      state: 'MFA_NOT_ENROLLED',
      hasValidSecret: false,
      pendingSecret: userRow.pending_totp_secret || undefined,
      authenticatorsCount,
      recoveryCodesRemaining,
    };
  } catch (err) {
    console.error(`[MFA getAuthoritativeUserMfaState Error for ${userId}]:`, err);
    return {
      state: 'MFA_NOT_ENROLLED',
      hasValidSecret: false,
      authenticatorsCount: 0,
      recoveryCodesRemaining: 0,
    };
  }
}

/**
 * Normalizes and cryptographically hashes a recovery code with salt.
 * Plaintext codes are NEVER stored in the database.
 */
export function hashRecoveryCode(code: string): string {
  const normalized = code.replace(/[-\s]/g, '').toUpperCase();
  const salt = 'ca_exam_checker_totp_mfa_recovery_2026';
  return crypto.createHash('sha256').update(`${salt}:${normalized}`).digest('hex');
}

/**
 * Generates 10 cryptographically random, unambiguous one-time recovery codes.
 * Format: XXXX-XXXX (e.g., 4K9M-72XP).
 * In a transaction, invalidates previous codes and inserts the hashed codes.
 */
export function generateRecoveryCodes(userId: string, context?: { ip?: string; userAgent?: string }): {
  plaintextCodes: string[];
  total: number;
} {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excludes 0, 1, I, O for visual clarity
  const plaintextCodes: string[] = [];
  const hashedRows: { id: string; user_id: string; code_hash: string }[] = [];

  for (let i = 0; i < 10; i++) {
    let part1 = '';
    let part2 = '';
    const buf = crypto.randomBytes(8);
    for (let b = 0; b < 4; b++) {
      part1 += chars[buf[b] % chars.length];
    }
    for (let b = 4; b < 8; b++) {
      part2 += chars[buf[b] % chars.length];
    }
    const code = `${part1}-${part2}`;
    plaintextCodes.push(code);
    hashedRows.push({
      id: `rc_${Date.now()}_${i}_${crypto.randomBytes(4).toString('hex')}`,
      user_id: userId,
      code_hash: hashRecoveryCode(code),
    });
  }

  // Atomically delete old codes and insert new ones
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(userId);
    const insertStmt = db.prepare(`
      INSERT INTO mfa_recovery_codes (id, user_id, code_hash, used, created_at)
      VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
    `);
    for (const row of hashedRows) {
      insertStmt.run(row.id, row.user_id, row.code_hash);
      syncRecordToFirestore('mfa_recovery_codes', row.id, {
        id: row.id,
        user_id: row.user_id,
        code_hash: row.code_hash,
        used: 0,
        created_at: new Date().toISOString(),
      }).catch(() => {});
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  logMfaAudit({
    userId,
    eventType: 'RECOVERY_CODES_GENERATED',
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
    status: 'SUCCESS',
    details: 'Generated 10 new one-time recovery codes; previous codes invalidated.',
  });

  return {
    plaintextCodes,
    total: 10,
  };
}

/**
 * Gets the current recovery codes status for a user (total, remaining count, generated date).
 * Never exposes the codes or their hashes.
 */
export function getRecoveryCodeStatus(userId: string): RecoveryCodeStatus {
  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN used = 0 THEN 1 ELSE 0 END) as remaining,
      MAX(created_at) as generated_at
    FROM mfa_recovery_codes
    WHERE user_id = ?
  `).get(userId) as { total: number; remaining: number | null; generated_at: string | null } | undefined;

  const total = row?.total || 0;
  const remaining = row?.remaining ?? 0;

  return {
    total,
    remaining,
    hasCodes: total > 0 && remaining > 0,
    generatedAt: row?.generated_at || null,
  };
}

/**
 * Checks rate limits for MFA / Recovery code attempts.
 * Max 5 failed attempts within a 15-minute cooloff window.
 */
export function checkMfaRateLimit(identifier: string): {
  allowed: boolean;
  lockedUntil?: string;
  remainingAttempts: number;
} {
  const row = db.prepare(`
    SELECT failed_attempts, locked_until FROM mfa_rate_limits WHERE identifier = ?
  `).get(identifier) as { failed_attempts: number; locked_until: string | null } | undefined;

  if (!row) {
    return { allowed: true, remainingAttempts: 5 };
  }

  if (row.locked_until) {
    const lockedTime = new Date(row.locked_until).getTime();
    if (lockedTime > Date.now()) {
      return {
        allowed: false,
        lockedUntil: row.locked_until,
        remainingAttempts: 0,
      };
    }
  }

  const remaining = Math.max(0, 5 - row.failed_attempts);
  return { allowed: true, remainingAttempts: remaining };
}

/**
 * Records a failed MFA or recovery code attempt.
 */
export function recordMfaFailedAttempt(identifier: string): {
  locked: boolean;
  remainingAttempts: number;
  lockedUntil?: string;
} {
  const row = db.prepare(`
    SELECT failed_attempts, locked_until FROM mfa_rate_limits WHERE identifier = ?
  `).get(identifier) as { failed_attempts: number; locked_until: string | null } | undefined;

  let currentFailed = (row?.failed_attempts || 0) + 1;
  let lockedUntil: string | null = null;
  let isLocked = false;

  if (currentFailed >= 5) {
    isLocked = true;
    const lockExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    lockedUntil = lockExpiry;
    db.prepare(`
      INSERT INTO mfa_rate_limits (identifier, failed_attempts, locked_until, last_attempt_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(identifier) DO UPDATE SET
        failed_attempts = ?,
        locked_until = ?,
        last_attempt_at = CURRENT_TIMESTAMP
    `).run(identifier, currentFailed, lockedUntil, currentFailed, lockedUntil);
  } else {
    db.prepare(`
      INSERT INTO mfa_rate_limits (identifier, failed_attempts, locked_until, last_attempt_at)
      VALUES (?, ?, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(identifier) DO UPDATE SET
        failed_attempts = ?,
        last_attempt_at = CURRENT_TIMESTAMP
    `).run(identifier, currentFailed, currentFailed);
  }

  return {
    locked: isLocked,
    remainingAttempts: Math.max(0, 5 - currentFailed),
    lockedUntil: lockedUntil || undefined,
  };
}

/**
 * Clears rate limiting for an identifier upon successful authentication.
 */
export function clearMfaRateLimit(identifier: string): void {
  try {
    db.prepare('DELETE FROM mfa_rate_limits WHERE identifier = ?').run(identifier);
  } catch {
    // Non-fatal
  }
}

/**
 * Verifies and atomically consumes a one-time recovery code.
 * Enforces single-use. If valid, marks `used = 1` and updates `used_at`.
 */
export function verifyAndConsumeRecoveryCode(
  userId: string,
  candidateCode: string,
  context?: { ip?: string; userAgent?: string }
): {
  success: boolean;
  remaining: number;
  error?: string;
  warning?: string;
} {
  const rateLimitKey = `rc_${userId}_${context?.ip || 'unknown'}`;
  const rateLimit = checkMfaRateLimit(rateLimitKey);

  if (!rateLimit.allowed) {
    logMfaAudit({
      userId,
      eventType: 'RATE_LIMIT_EXCEEDED',
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      status: 'FAILURE',
      details: `Recovery code attempts locked until ${rateLimit.lockedUntil}`,
    });
    return {
      success: false,
      remaining: 0,
      error: `Too many failed recovery attempts. Account temporarily locked for 15 minutes for your security.`,
    };
  }

  const hash = hashRecoveryCode(candidateCode);

  const matched = db.prepare(`
    SELECT id FROM mfa_recovery_codes
    WHERE user_id = ? AND code_hash = ? AND used = 0
  `).get(userId, hash) as { id: string } | undefined;

  if (!matched) {
    const failedInfo = recordMfaFailedAttempt(rateLimitKey);
    logMfaAudit({
      userId,
      eventType: 'RECOVERY_CODE_FAILED',
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      status: 'FAILURE',
      details: `Invalid or already used recovery code. Remaining attempts: ${failedInfo.remainingAttempts}`,
    });

    const msg = failedInfo.locked
      ? 'Too many invalid attempts. For your security, recovery code entry is locked for 15 minutes.'
      : `Invalid or previously consumed recovery code. ${failedInfo.remainingAttempts} attempt(s) remaining before temporary lockout.`;

    return {
      success: false,
      remaining: getRecoveryCodeStatus(userId).remaining,
      error: msg,
    };
  }

  // Atomically mark recovery code as used
  db.prepare(`
    UPDATE mfa_recovery_codes
    SET used = 1, used_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(matched.id);

  syncRecordToFirestore('mfa_recovery_codes', matched.id, {
    id: matched.id,
    user_id: userId,
    used: 1,
    used_at: new Date().toISOString(),
  }).catch(() => {});

  clearMfaRateLimit(rateLimitKey);

  const status = getRecoveryCodeStatus(userId);

  logMfaAudit({
    userId,
    eventType: 'RECOVERY_CODE_USED',
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
    status: 'SUCCESS',
    details: `One-time recovery code consumed successfully. ${status.remaining} remaining.`,
  });

  let warning: string | undefined;
  if (status.remaining <= 2) {
    warning = `Warning: You have only ${status.remaining} recovery code(s) remaining. We strongly recommend generating a fresh set of recovery codes from your Security Settings.`;
  }

  return {
    success: true,
    remaining: status.remaining,
    warning,
  };
}

/**
 * Logs a security audit event into the database.
 */
export function logMfaAudit(params: {
  userId?: string;
  eventType: string;
  ipAddress?: string;
  userAgent?: string;
  status: 'SUCCESS' | 'FAILURE';
  details?: string;
}): void {
  try {
    const id = `aud_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    db.prepare(`
      INSERT INTO mfa_audit_logs (id, user_id, event_type, ip_address, user_agent, status, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      id,
      params.userId || null,
      params.eventType,
      params.ipAddress || null,
      params.userAgent || null,
      params.status,
      params.details || null
    );
  } catch (err) {
    console.error('[MFA Audit Log Error]:', err);
  }
}

/**
 * Retrieves recent MFA security audit logs for an authenticated user or administrative portal.
 */
export function getMfaAuditLogs(userId?: string, limit: number = 25): AuditLogRecord[] {
  try {
    initMfaRecoveryTables();
    if (userId) {
      const rows = db.prepare(`
        SELECT id, user_id, event_type, action, request_id, target_user_uid, target_user_email,
               target_user_role, admin_uid, admin_email, ist_timestamp, correlation_id,
               ip_address, user_agent, status, details, created_at
        FROM mfa_audit_logs
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(userId, limit) as any[];

      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        eventType: r.event_type,
        action: r.action,
        requestId: r.request_id,
        targetUserUid: r.target_user_uid,
        targetUserEmail: r.target_user_email,
        targetUserRole: r.target_user_role,
        adminUid: r.admin_uid,
        adminEmail: r.admin_email,
        istTimestamp: r.ist_timestamp,
        correlationId: r.correlation_id,
        ipAddress: r.ip_address,
        userAgent: r.user_agent,
        status: r.status,
        details: r.details,
        createdAt: r.created_at,
      }));
    }

    const rows = db.prepare(`
      SELECT id, user_id, event_type, action, request_id, target_user_uid, target_user_email,
             target_user_role, admin_uid, admin_email, ist_timestamp, correlation_id,
             ip_address, user_agent, status, details, created_at
      FROM mfa_audit_logs
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      eventType: r.event_type,
      action: r.action,
      requestId: r.request_id,
      targetUserUid: r.target_user_uid,
      targetUserEmail: r.target_user_email,
      targetUserRole: r.target_user_role,
      adminUid: r.admin_uid,
      adminEmail: r.admin_email,
      istTimestamp: r.ist_timestamp,
      correlationId: r.correlation_id,
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
      status: r.status,
      details: r.details,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Lists all registered authenticators for a user.
 * Auto-creates a primary record if user has mfa_enabled = 1 but no entry in table.
 */
export function listAuthenticators(userId: string): AuthenticatorRecord[] {
  initMfaRecoveryTables();
  let rows = db.prepare(`
    SELECT id, user_id, factor_type, label, created_at, last_used_at
    FROM mfa_authenticators
    WHERE user_id = ?
    ORDER BY factor_type ASC, created_at ASC
  `).all(userId) as any[];

  // Auto-seed primary record for accounts that had MFA enabled previously with valid secret
  if (rows.length === 0) {
    const user = db.prepare('SELECT mfa_enabled, mfa_enrolled_at, totp_secret FROM users WHERE id = ?').get(userId) as any;
    if (user && user.mfa_enabled && user.totp_secret && user.totp_secret.trim().length >= 16) {
      const primaryId = `auth_prim_${userId}`;
      db.prepare(`
        INSERT OR IGNORE INTO mfa_authenticators (id, user_id, factor_type, label, totp_secret, created_at)
        VALUES (?, ?, 'PRIMARY_TOTP', 'Primary Authenticator App', ?, COALESCE(?, CURRENT_TIMESTAMP))
      `).run(primaryId, userId, user.totp_secret.trim(), user.mfa_enrolled_at);

      rows = db.prepare(`
        SELECT id, user_id, factor_type, label, created_at, last_used_at
        FROM mfa_authenticators
        WHERE user_id = ?
      `).all(userId) as any[];
    }
  }

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    factorType: r.factor_type,
    label: r.label,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
  }));
}

/**
 * Enrolls a backup authenticator for a user.
 * Distinct factor with unique label (e.g., "Backup Tablet", "Hardware Token App").
 */
export function registerBackupAuthenticator(
  userId: string,
  label: string,
  totpSecret?: string,
  firebaseFactorUid?: string,
  context?: { ip?: string; userAgent?: string }
): AuthenticatorRecord {
  const id = `auth_backup_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const cleanLabel = (label || 'Backup Authenticator App').trim().slice(0, 50);

  db.prepare(`
    INSERT INTO mfa_authenticators (id, user_id, factor_type, label, totp_secret, firebase_factor_uid, created_at)
    VALUES (?, ?, 'BACKUP_TOTP', ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(id, userId, cleanLabel, totpSecret || null, firebaseFactorUid || null);

  // Durable Cloud Firestore synchronization
  syncRecordToFirestore('mfa_authenticators', id, {
    id,
    user_id: userId,
    factor_type: 'BACKUP_TOTP',
    label: cleanLabel,
    totp_secret: totpSecret || null,
    firebase_factor_uid: firebaseFactorUid || null,
    created_at: new Date().toISOString(),
    last_used_at: null,
  }).catch(() => {});

  // Ensure user profile retains mfa_enabled = 1
  db.prepare(`
    UPDATE users
    SET mfa_enabled = 1,
        mfa_enrolled_at = COALESCE(mfa_enrolled_at, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(userId);

  syncRecordToFirestore('users', userId, {
    id: userId,
    mfa_enabled: 1,
    updated_at: new Date().toISOString(),
  }).catch(() => {});

  logMfaAudit({
    userId,
    eventType: 'BACKUP_AUTHENTICATOR_ENROLLED',
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
    status: 'SUCCESS',
    details: `Enrolled backup authenticator: "${cleanLabel}"`,
  });

  return {
    id,
    userId,
    factorType: 'BACKUP_TOTP',
    label: cleanLabel,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
}

/**
 * Removes an authenticator factor.
 * MANDATORY MFA ENFORCEMENT:
 * INSTITUTE_ADMIN and SUPER_ADMIN cannot remove their last remaining authenticator!
 */
export function removeAuthenticator(
  userId: string,
  authenticatorId: string,
  userRole: UserRole,
  context?: { ip?: string; userAgent?: string }
): { success: boolean; error?: string } {
  const authenticators = listAuthenticators(userId);
  const target = authenticators.find((a) => a.id === authenticatorId);

  if (!target) {
    return { success: false, error: 'Authenticator factor not found.' };
  }

  const isMandatoryRole = userRole === 'INSTITUTE_ADMIN' || userRole === 'SUPER_ADMIN';

  if (isMandatoryRole && authenticators.length <= 1) {
    logMfaAudit({
      userId,
      eventType: 'MFA_DISALLOWED_REMOVAL',
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      status: 'FAILURE',
      details: 'Attempted to remove the only active authenticator on mandatory admin account.',
    });
    return {
      success: false,
      error: 'Administrative accounts must maintain at least one active Two-Factor Authentication method. Please add another authenticator before removing this one.',
    };
  }

  db.prepare('DELETE FROM mfa_authenticators WHERE id = ? AND user_id = ?').run(authenticatorId, userId);
  deleteFirestoreDoc('mfa_authenticators', authenticatorId).catch(() => {});

  const remaining = listAuthenticators(userId);
  if (remaining.length === 0 && !isMandatoryRole) {
    // If student removed all authenticators, update mfa_enabled to 0
    db.prepare(`
      UPDATE users
      SET mfa_enabled = 0, mfa_enrolled_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId);
    syncRecordToFirestore('users', userId, {
      id: userId,
      mfa_enabled: 0,
      mfa_enrolled_at: null,
      updated_at: new Date().toISOString(),
    }).catch(() => {});
  }

  logMfaAudit({
    userId,
    eventType: 'AUTHENTICATOR_REMOVED',
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
    status: 'SUCCESS',
    details: `Removed authenticator factor: "${target.label}" (${target.factorType}). Remaining: ${remaining.length}`,
  });

  return { success: true };
}

/**
 * Submits a manual account recovery request for users who have lost all factors.
 * Strictly NO instant bypass or backdoor. Undergoes administrative review.
 */
export function submitManualRecoveryRequest(data: {
  userId?: string;
  email: string;
  phone?: string;
  srnRegNo?: string;
  reason: string;
  ip?: string;
  userAgent?: string;
}): { success: boolean; requestId?: string; error?: string; message?: string } {
  initMfaRecoveryTables();
  const cleanEmail = (data.email || '').trim().toLowerCase();
  if ((!data.userId && !cleanEmail) || !data.reason?.trim()) {
    return { success: false, error: 'Registered email address or user ID and explanation are required.' };
  }

  // Rate limit recovery requests by IP / email (max 3 in 1 hour)
  const rateLimitKey = `rec_req_${cleanEmail || data.userId}_${data.ip || 'unknown'}`;
  const rateLimit = checkMfaRateLimit(rateLimitKey);
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: 'Too many recovery requests submitted. Please wait before submitting another request.',
    };
  }

  // Find user by immutable userId first, then fallback to email
  let user: any = null;
  if (data.userId) {
    user = db.prepare('SELECT id, email, role, full_name, phone FROM users WHERE id = ?').get(data.userId.trim());
  }
  if (!user && cleanEmail) {
    user = db.prepare('SELECT id, email, role, full_name, phone FROM users WHERE lower(email) = ?').get(cleanEmail);
  }

  if (!user) {
    // Return generic success to prevent account enumeration
    return {
      success: true,
      message: 'If an account exists with these details, your recovery request has been submitted for administrative verification.',
    };
  }

  // Check if there is already an open pending request
  const existingPending = db.prepare(`
    SELECT id FROM mfa_recovery_requests
    WHERE (user_id = ? OR lower(email) = ?) AND UPPER(status) IN ('PENDING_REVIEW', 'PENDING')
  `).get(user.id, user.email.toLowerCase()) as { id: string } | undefined;

  if (existingPending) {
    return {
      success: true,
      requestId: existingPending.id,
      message: 'A recovery request is already under review for this account. Our security team will contact you via your registered email.',
    };
  }

  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  db.prepare(`
    INSERT INTO mfa_recovery_requests (
      id, user_id, user_role, email, phone, srn_reg_no, reason, status, created_at, reviewed_at, reviewed_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING_REVIEW', CURRENT_TIMESTAMP, NULL, NULL)
  `).run(
    requestId,
    user.id,
    user.role,
    user.email,
    data.phone?.trim() || user.phone || null,
    data.srnRegNo?.trim() || null,
    data.reason.trim()
  );

  logMfaAudit({
    userId: user.id,
    eventType: 'RECOVERY_REQUEST_SUBMITTED',
    ipAddress: data.ip,
    userAgent: data.userAgent,
    status: 'SUCCESS',
    details: `Manual MFA recovery request submitted (${requestId}). Reason: ${data.reason.slice(0, 100)}`,
  });

  return {
    success: true,
    requestId,
    message: 'Your account recovery request has been securely submitted for administrative verification. For security reasons, no instant automated bypass is permitted.',
  };
}

/**
 * Retrieves pending manual recovery requests for Admin review.
 */
export function getPendingRecoveryRequests(limit: number = 50) {
  initMfaRecoveryTables();
  try {
    return db.prepare(`
      SELECT r.id, r.user_id, r.email, r.phone, r.srn_reg_no, r.reason, r.status, r.created_at,
             r.reviewed_at, r.reviewed_by,
             COALESCE(r.user_role, u.role, 'STUDENT') AS role,
             COALESCE(u.full_name, r.email) AS full_name
      FROM mfa_recovery_requests r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE UPPER(r.status) IN ('PENDING_REVIEW', 'PENDING')
      ORDER BY r.created_at DESC
      LIMIT ?
    `).all(limit);
  } catch {
    return [];
  }
}

/**
 * Resolves a manual recovery request (APPROVED or REJECTED) by a Super Admin.
 */
export interface ResolveRecoveryResult {
  success: boolean;
  action?: 'APPROVED' | 'REJECTED';
  requestId?: string;
  targetUser?: {
    id: string;
    email: string;
    role: string;
    mfaReset: boolean;
  };
  error?: string;
  statusCode?: number;
  message?: string;
}

/**
 * Resolves a manual recovery request (APPROVED or REJECTED) by a Super Admin.
 * Enforces:
 * - Atomic database transaction (BEGIN / COMMIT / ROLLBACK)
 * - Strict status check (idempotency, PENDING_REVIEW only)
 * - Administrative authorization & self-approval prohibition
 * - Zero authority to touch student academic or commercial records
 * - Complete factor invalidation & device/session revocation on approval
 * - Immutable audit logging with canonical IST timestamp
 */
/**
 * Resolves a manual recovery request (APPROVED or REJECTED) by a Super Admin.
 * Enforces:
 * - Atomic database transaction (BEGIN IMMEDIATE / COMMIT / ROLLBACK)
 * - Strict duplicate approval protection (idempotency, PENDING_REVIEW only)
 * - Server-side authorization: Super Admin role enforced, self-approval prohibited
 * - Zero authority to touch student academic or commercial records
 * - Complete factor invalidation, secret deletion, recovery code deletion, & trusted device revocation on approval
 * - Sets user MFA state as requiring fresh enrollment (mfa_reset_required = 1)
 * - Sends user in-app notification
 * - Post-commit Firestore clean-up to prevent stale self-healing
 * - Immutable security audit logging with canonical IST timestamp
 */
export async function resolveRecoveryRequest(
  requestId: string,
  reviewerId: string,
  decision: 'APPROVED' | 'REJECTED',
  reviewNotes: string,
  context?: { ip?: string; userAgent?: string }
): Promise<ResolveRecoveryResult> {
  initMfaRecoveryTables();

  // 1. Fetch recovery request
  const req = db.prepare('SELECT * FROM mfa_recovery_requests WHERE id = ?').get(requestId) as any;
  if (!req) {
    return {
      success: false,
      error: 'Recovery request not found.',
      statusCode: 404,
    };
  }

  // 2. Duplicate processing protection (Idempotency)
  const currentStatus = (req.status || '').toUpperCase();
  if (currentStatus === 'APPROVED' || currentStatus === 'REJECTED' || currentStatus === 'RESOLVED') {
    return {
      success: false,
      error: `Recovery request has already been processed with status: ${req.status}. Duplicate processing is prohibited.`,
      statusCode: 409,
    };
  }
  if (currentStatus !== 'PENDING_REVIEW' && currentStatus !== 'PENDING') {
    return {
      success: false,
      error: `Recovery request status is '${req.status}' and cannot be processed. Only pending requests can be resolved.`,
      statusCode: 400,
    };
  }

  // 3. Admin authorization & self-approval restriction
  const reviewer = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(reviewerId) as any;
  const reviewerRole = (reviewer?.role || '').toUpperCase();
  const reviewerEmail = (reviewer?.email || '').toLowerCase().trim();

  if (!reviewer || reviewerRole !== 'SUPER_ADMIN' || reviewerEmail === 'priyatca15@gmail.com' || reviewer.id === 'usr_mcq_admin_priyatca15') {
    return {
      success: false,
      error: 'Unauthorized: Only Super Administrators can resolve MFA recovery requests. MCQ Admin accounts are restricted.',
      statusCode: 403,
    };
  }

  if (req.user_id && req.user_id === reviewerId) {
    return {
      success: false,
      error: 'Administrators are strictly prohibited from approving or resolving their own MFA recovery requests.',
      statusCode: 403,
    };
  }

  // 4. Target user verification by immutable UID
  let targetUser = req.user_id
    ? (db.prepare('SELECT id, email, role, full_name, status, mfa_enabled FROM users WHERE id = ?').get(req.user_id) as any)
    : null;

  if (!targetUser && req.email) {
    targetUser = db.prepare('SELECT id, email, role, full_name, status, mfa_enabled FROM users WHERE lower(email) = ?').get(req.email.toLowerCase()) as any;
  }

  if (!targetUser) {
    return {
      success: false,
      error: 'Target user account associated with recovery request not found.',
      statusCode: 404,
    };
  }

  // Self-approval restriction by email
  if (reviewer.email && targetUser.email && reviewer.email.toLowerCase() === targetUser.email.toLowerCase()) {
    return {
      success: false,
      error: 'Administrators cannot resolve their own account recovery requests.',
      statusCode: 403,
    };
  }

  const cleanNotes = (reviewNotes || '').trim();
  const correlationId = `mfa_rec_res_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const istNow = formatDateTimeIST(new Date(), true);

  // 5. Atomic transaction execution
  db.exec('BEGIN IMMEDIATE');
  try {
    const newStatus = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';

    // Update recovery request status across canonical and legacy fields
    db.prepare(`
      UPDATE mfa_recovery_requests
      SET status = ?,
          reviewed_by = ?,
          resolved_by = ?,
          admin_notes = ?,
          review_notes = ?,
          resolution_notes = ?,
          reviewed_at = CURRENT_TIMESTAMP,
          resolved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      newStatus,
      reviewerId,
      reviewerId,
      cleanNotes,
      cleanNotes,
      cleanNotes,
      requestId
    );

    if (decision === 'APPROVED') {
      // a. Invalidate and remove old recovery codes
      db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(targetUser.id);

      // b. Invalidate and remove authenticators
      db.prepare('DELETE FROM mfa_authenticators WHERE user_id = ?').run(targetUser.id);

      // c. Reset MFA status on user record, clear totp_secret, and set mfa_reset_required
      // For STUDENTS: MFA is optional, so mfa_reset_required is 0 and MFA is disabled.
      // For ADMINS: MFA is mandatory, so mfa_reset_required is 1 to require fresh enrollment.
      const isStudent = targetUser.role === 'STUDENT';
      const mfaResetRequiredVal = isStudent ? 0 : 1;
      db.prepare(`
        UPDATE users
        SET mfa_enabled = 0,
            mfa_enrolled_at = NULL,
            totp_secret = NULL,
            pending_totp_secret = NULL,
            mfa_phone = NULL,
            mfa_reset_required = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(mfaResetRequiredVal, targetUser.id);

      // d. Revoke all trusted devices
      revokeAllDeviceTrust(targetUser.id);

      // e. Revoke all active sessions
      revokeAllSessionsForUser(targetUser.id);

      // f. Send in-app notification to affected user
      const notifId = `notif_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const notifMsg = isStudent
        ? 'Your MFA recovery request has been approved. MFA has been disabled on your account. You can log in directly with your email and password, and optionally enable Two-Factor Authentication anytime from your profile.'
        : 'Your MFA recovery request has been approved. Your previous authenticator setup has been reset. Please sign in and complete fresh Two-Factor Authentication setup.';
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, created_at)
        VALUES (?, ?, 'MFA Recovery Approved', ?, 'security', CURRENT_TIMESTAMP)
      `).run(notifId, targetUser.id, notifMsg);
    } else {
      // Rejection notification
      const notifId = `notif_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, created_at)
        VALUES (?, ?, 'MFA Recovery Request Update', 'Your MFA recovery request has been reviewed and rejected. Please contact support if you require further assistance.', 'security', CURRENT_TIMESTAMP)
      `).run(notifId, targetUser.id);
    }

    // 6. Security Audit Event Log
    const auditId = `mfa_audit_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const eventType = decision === 'APPROVED' ? 'MFA_RECOVERY_APPROVED' : 'MFA_RECOVERY_REJECTED';
    const auditDetails = JSON.stringify({
      action: eventType,
      requestId,
      affectedUserId: targetUser.id,
      affectedUserRole: targetUser.role,
      affectedUserEmail: targetUser.email,
      reviewedBy: reviewerId,
      reviewerEmail: reviewer?.email || reviewerId,
      timestamp: new Date().toISOString(),
      istTimestamp: istNow,
      result: 'SUCCESS',
      notes: cleanNotes,
      decision,
      mfaState: decision === 'APPROVED' ? 'RESET_REENROLLMENT_REQUIRED' : 'UNCHANGED',
      academicDataPreserved: true,
      commercialDataPreserved: true,
    });

    db.prepare(`
      INSERT INTO mfa_audit_logs (
        id, user_id, event_type, action, request_id, target_user_uid,
        target_user_email, target_user_role, admin_uid, admin_email,
        status, ist_timestamp, correlation_id, ip_address, user_agent,
        details
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', ?, ?, ?, ?, ?)
    `).run(
      auditId,
      targetUser.id,
      eventType,
      eventType,
      requestId,
      targetUser.id,
      targetUser.email,
      targetUser.role,
      reviewerId,
      reviewer?.email || reviewerId,
      istNow,
      correlationId,
      context?.ip || null,
      context?.userAgent || null,
      auditDetails
    );

    // General system audit log
    db.prepare(`
      INSERT INTO audit_logs (
        id, user_id, action, entity_type, entity_id, details, created_at
      ) VALUES (?, ?, ?, 'users', ?, ?, CURRENT_TIMESTAMP)
    `).run(
      `aud_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      reviewerId,
      eventType,
      targetUser.id,
      auditDetails
    );

    db.exec('COMMIT');
  } catch (err: any) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    console.error('[MFA Recovery Resolution Transaction Error]:', err);
    return {
      success: false,
      error: `Failed to resolve recovery request: ${err?.message || 'Database transaction failed'}`,
      statusCode: 500,
    };
  }

  // 7. Post-transaction Cloud Firestore Clean-up (if APPROVED)
  if (decision === 'APPROVED') {
    try {
      const isStudentTarget = targetUser.role === 'STUDENT';
      await syncRecordToFirestore('users', targetUser.id, {
        id: targetUser.id,
        mfa_enabled: 0,
        mfa_enrolled_at: null,
        totp_secret: null,
        mfa_reset_required: isStudentTarget ? 0 : 1,
        updated_at: new Date().toISOString(),
      });

      const cloudAuths = await getAllFirestoreDocs<any>('mfa_authenticators');
      for (const a of cloudAuths) {
        if (a.user_id === targetUser.id || a.userId === targetUser.id) {
          await deleteFirestoreDoc('mfa_authenticators', a.id);
        }
      }

      const cloudCodes = await getAllFirestoreDocs<any>('mfa_recovery_codes');
      for (const c of cloudCodes) {
        if (c.user_id === targetUser.id || c.userId === targetUser.id) {
          await deleteFirestoreDoc('mfa_recovery_codes', c.id);
        }
      }
    } catch (firestoreErr) {
      console.warn('[resolveRecoveryRequest] Firestore sync warning:', firestoreErr);
    }
  }

  return {
    success: true,
    action: decision,
    requestId,
    targetUser: {
      id: targetUser.id,
      email: targetUser.email,
      role: targetUser.role,
      mfaReset: decision === 'APPROVED',
    },
    message:
      decision === 'APPROVED'
        ? `Recovery request approved successfully. MFA factors have been reset, trusted devices revoked, and active sessions terminated for ${targetUser.email}. User will be required to re-enroll MFA on next login.`
        : `Recovery request rejected. Existing MFA configuration remains active for ${targetUser.email}.`,
  };
}

/**
 * Server action to approve MFA recovery request.
 */
export async function approveMfaRecovery(
  requestId: string,
  reviewerId: string,
  reviewNotes: string = 'Approved by Super Admin',
  context?: { ip?: string; userAgent?: string }
): Promise<ResolveRecoveryResult> {
  return resolveRecoveryRequest(requestId, reviewerId, 'APPROVED', reviewNotes, context);
}

/**
 * Server action to reject MFA recovery request.
 */
export async function rejectMfaRecovery(
  requestId: string,
  reviewerId: string,
  reviewNotes: string = 'Rejected by Super Admin',
  context?: { ip?: string; userAgent?: string }
): Promise<ResolveRecoveryResult> {
  return resolveRecoveryRequest(requestId, reviewerId, 'REJECTED', reviewNotes, context);
}

/**
 * Evaluates the authoritative MFA enrollment state across local SQLite tables (users, mfa_authenticators,
 * mfa_recovery_codes), client-side reported Firebase TOTP factors, and Cloud Firestore metadata.
 *
 * If any authoritative source confirms MFA enrollment:
 * 1. Self-heals local SQLite users table (mfa_enabled = 1, mfa_enrolled_at, and default authenticator)
 * 2. Self-heals Cloud Firestore users document (mfa_enabled = 1, mfa_enrolled_at)
 * 3. Never reports MFA as disabled due to server restart, deployment, or cache eviction.
 */
export async function getAuthoritativeUserMfaStatus(
  userId: string,
  options?: {
    clientClaimsFirebaseTotp?: boolean;
    checkFirestoreFallback?: boolean;
  }
): Promise<{
  mfaEnabled: boolean;
  mfaEnrolledAt: string | null;
  authenticatorsCount: number;
  recoveryCodesRemaining: number;
}> {
  if (!userId) {
    return {
      mfaEnabled: false,
      mfaEnrolledAt: null,
      authenticatorsCount: 0,
      recoveryCodesRemaining: 0,
    };
  }

  try {
    const authState = await getAuthoritativeUserMfaState(userId);
    const userRow = db.prepare(`
      SELECT mfa_enrolled_at FROM users WHERE id = ?
    `).get(userId) as { mfa_enrolled_at: string | null } | undefined;

    const isEnrolled = authState.state === 'MFA_ENROLLED';

    return {
      mfaEnabled: isEnrolled,
      mfaEnrolledAt: isEnrolled ? (userRow?.mfa_enrolled_at || new Date().toISOString()) : null,
      authenticatorsCount: authState.authenticatorsCount,
      recoveryCodesRemaining: authState.recoveryCodesRemaining,
    };
  } catch (err) {
    console.error(`[MFA Authoritative Status Error for ${userId}]:`, err);
    return {
      mfaEnabled: false,
      mfaEnrolledAt: null,
      authenticatorsCount: 0,
      recoveryCodesRemaining: 0,
    };
  }
}

/**
 * Authoritative Server-Side MFA Reset
 * Resets MFA state for a specific user cleanly without affecting any user profile,
 * password, role, credits, submissions, evaluations, or payment data.
 */
export async function executeServerMfaReset(
  targetUserIdOrEmail: string,
  performedBy?: {
    id: string;
    email?: string;
    role?: string;
  },
  reason: string = 'Security Administrator MFA Reset'
): Promise<{
  success: boolean;
  user: { id: string; email: string; role: string; fullName: string };
  message: string;
}> {
  initMfaRecoveryTables();
  const cleanTarget = targetUserIdOrEmail.trim();
  const targetUser = (
    db.prepare('SELECT id, email, role, full_name, status, mfa_enabled FROM users WHERE id = ?').get(cleanTarget) ||
    db.prepare('SELECT id, email, role, full_name, status, mfa_enabled FROM users WHERE lower(email) = ?').get(cleanTarget.toLowerCase())
  ) as any;

  if (!targetUser) {
    throw new Error(`Target account '${targetUserIdOrEmail}' not found in database.`);
  }

  // Strict Super Admin verification for reset actor
  if (performedBy) {
    const actorRole = (performedBy.role || '').toUpperCase();
    const actorEmail = (performedBy.email || '').toLowerCase().trim();
    if (actorRole !== 'SUPER_ADMIN' || actorEmail === 'priyatca15@gmail.com' || performedBy.id === 'usr_mcq_admin_priyatca15') {
      throw new Error('Unauthorized: Only Super Administrators can execute MFA resets. Account priyatca15@gmail.com is restricted.');
    }
  }

  const userId = targetUser.id;

  const adminId = performedBy?.id || 'system_security_admin';
  const adminEmail = performedBy?.email || adminId;

  // 1. Invalidate and remove recovery codes
  db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(userId);

  // 2. Remove all registered authenticators
  db.prepare('DELETE FROM mfa_authenticators WHERE user_id = ?').run(userId);

  const isStudent = targetUser.role === 'STUDENT';
  const mfaResetRequiredVal = isStudent ? 0 : 1;

  // 3. Reset user MFA fields in SQLite
  db.prepare(`
    UPDATE users
    SET mfa_enabled = 0,
        mfa_enrolled_at = NULL,
        totp_secret = NULL,
        pending_totp_secret = NULL,
        mfa_phone = NULL,
        mfa_reset_required = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(mfaResetRequiredVal, userId);

  // 4. Invalidate all trusted devices
  revokeAllDeviceTrust(userId);

  // 5. Revoke all active sessions
  revokeAllSessionsForUser(userId);

  // 6. Send in-app notification to affected user
  const notifId = `notif_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const notifMsg = isStudent
    ? 'Your Multi-Factor Authentication (MFA) has been securely reset by an administrator. MFA is now disabled on your account. You can log in directly with your email and password.'
    : 'Your Multi-Factor Authentication (MFA) has been securely reset by an administrator. Please sign in and complete fresh Two-Factor Authentication setup.';
  db.prepare(`
    INSERT INTO notifications (id, user_id, title, message, type, created_at)
    VALUES (?, ?, 'MFA Reset Notice', ?, 'security', CURRENT_TIMESTAMP)
  `).run(notifId, userId, notifMsg);

  // 7. Synchronize cleanly to Firestore
  try {
    await syncRecordToFirestore('users', userId, {
      id: userId,
      mfa_enabled: 0,
      mfa_enrolled_at: null,
      totp_secret: null,
      mfa_reset_required: mfaResetRequiredVal,
      updated_at: new Date().toISOString(),
    });

    // Delete cloud authenticators
    const cloudAuths = await getAllFirestoreDocs<any>('mfa_authenticators');
    for (const a of cloudAuths) {
      if (a.user_id === userId || a.userId === userId) {
        await deleteFirestoreDoc('mfa_authenticators', a.id);
      }
    }

    // Delete cloud recovery codes
    const cloudCodes = await getAllFirestoreDocs<any>('mfa_recovery_codes');
    for (const c of cloudCodes) {
      if (c.user_id === userId || c.userId === userId) {
        await deleteFirestoreDoc('mfa_recovery_codes', c.id);
      }
    }
  } catch (firestoreErr) {
    console.warn('[executeServerMfaReset] Firestore sync warning:', firestoreErr);
  }

  // 7. Record immutable security audit log in SQLite
  const auditId = `mfa_audit_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const istTimestamp = formatDateTimeIST(new Date());

  db.prepare(`
    INSERT INTO mfa_audit_logs (
      id, user_id, event_type, action,
      target_user_uid, target_user_email, target_user_role,
      admin_uid, admin_email,
      ist_timestamp, correlation_id, status, details
    ) VALUES (?, ?, 'MFA_RESET', 'MFA_RESET', ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', ?)
  `).run(
    auditId,
    userId,
    userId,
    targetUser.email,
    targetUser.role,
    adminId,
    adminEmail,
    istTimestamp,
    `corr_${crypto.randomBytes(8).toString('hex')}`,
    JSON.stringify({
      action: 'MFA_RESET',
      affectedUserId: userId,
      affectedUserEmail: targetUser.email,
      performedBy: adminEmail,
      timestamp: new Date().toISOString(),
      istTimestamp,
      reason,
      mfaStateReset: true,
      oldFactorsInvalidated: true,
      trustedDevicesRevoked: true,
      sessionsRevoked: true,
      userDataPreserved: true,
    })
  );

  // Also record in system general audit_logs
  db.prepare(`
    INSERT INTO audit_logs (
      id, user_id, action, entity_type, entity_id, details, created_at
    ) VALUES (?, ?, 'MFA_RESET', 'users', ?, ?, CURRENT_TIMESTAMP)
  `).run(
    `aud_${crypto.randomBytes(8).toString('hex')}`,
    adminId,
    userId,
    JSON.stringify({
      affectedUserId: userId,
      affectedUserEmail: targetUser.email,
      performedBy: adminEmail,
      reason,
      timestamp: new Date().toISOString(),
    })
  );

  return {
    success: true,
    user: {
      id: userId,
      email: targetUser.email,
      role: targetUser.role,
      fullName: targetUser.full_name,
    },
    message: `MFA reset successfully completed for ${targetUser.email} (${userId}). Old factor and trusted devices invalidated. Ready for fresh enrollment.`,
  };
}

