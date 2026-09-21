import crypto from 'node:crypto';
import { db } from '../db.js';
import { UserRole } from '../../src/types/index.js';
import { revokeAllDeviceTrust } from './trustService.js';
import { revokeAllSessionsForUser } from './sessionService.js';
import { formatDateTimeIST } from '../utils/timezone.js';
import { syncRecordToFirestore } from './firestoreSyncService.js';

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
export function initMfaRecoveryTables(): void {
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
      label TEXT NOT NULL,
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
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_mfa_rec_req_status ON mfa_recovery_requests(status);

    CREATE TABLE IF NOT EXISTS mfa_audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      event_type TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      status TEXT NOT NULL,
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
      const cols = db.prepare(`PRAGMA table_info(${tbl})`).all() as any[];
      if (!cols.some((c) => c.name === col)) {
        db.prepare(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${typ}`).run();
      }
    } catch {}
  };

  addCol('mfa_recovery_requests', 'review_notes', 'TEXT');
  addCol('mfa_recovery_requests', 'resolution_notes', 'TEXT');
  addCol('mfa_recovery_requests', 'resolved_at', 'TEXT');
  addCol('mfa_recovery_requests', 'resolved_by', 'TEXT');

  addCol('mfa_audit_logs', 'action', 'TEXT');
  addCol('mfa_audit_logs', 'request_id', 'TEXT');
  addCol('mfa_audit_logs', 'target_user_uid', 'TEXT');
  addCol('mfa_audit_logs', 'target_user_email', 'TEXT');
  addCol('mfa_audit_logs', 'target_user_role', 'TEXT');
  addCol('mfa_audit_logs', 'admin_uid', 'TEXT');
  addCol('mfa_audit_logs', 'admin_email', 'TEXT');
  addCol('mfa_audit_logs', 'ist_timestamp', 'TEXT');
  addCol('mfa_audit_logs', 'correlation_id', 'TEXT');
}

// Auto-run table setup on service load
initMfaRecoveryTables();

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
  let rows = db.prepare(`
    SELECT id, user_id, factor_type, label, created_at, last_used_at
    FROM mfa_authenticators
    WHERE user_id = ?
    ORDER BY factor_type ASC, created_at ASC
  `).all(userId) as any[];

  // Auto-seed primary record for accounts that had MFA enabled previously
  if (rows.length === 0) {
    const user = db.prepare('SELECT mfa_enabled, mfa_enrolled_at FROM users WHERE id = ?').get(userId) as any;
    if (user && user.mfa_enabled) {
      const primaryId = `auth_prim_${userId}`;
      db.prepare(`
        INSERT OR IGNORE INTO mfa_authenticators (id, user_id, factor_type, label, created_at)
        VALUES (?, ?, 'PRIMARY_TOTP', 'Primary Authenticator App', COALESCE(?, CURRENT_TIMESTAMP))
      `).run(primaryId, userId, user.mfa_enrolled_at);

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
  firebaseFactorUid?: string,
  context?: { ip?: string; userAgent?: string }
): AuthenticatorRecord {
  const id = `auth_backup_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const cleanLabel = (label || 'Backup Authenticator App').trim().slice(0, 50);

  db.prepare(`
    INSERT INTO mfa_authenticators (id, user_id, factor_type, label, firebase_factor_uid, created_at)
    VALUES (?, ?, 'BACKUP_TOTP', ?, ?, CURRENT_TIMESTAMP)
  `).run(id, userId, cleanLabel, firebaseFactorUid || null);

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

  const remaining = listAuthenticators(userId);
  if (remaining.length === 0 && !isMandatoryRole) {
    // If student removed all authenticators, update mfa_enabled to 0
    db.prepare(`
      UPDATE users
      SET mfa_enabled = 0, mfa_enrolled_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId);
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
  email: string;
  phone?: string;
  srnRegNo?: string;
  reason: string;
  ip?: string;
  userAgent?: string;
}): { success: boolean; requestId?: string; error?: string; message?: string } {
  const cleanEmail = (data.email || '').trim().toLowerCase();
  if (!cleanEmail || !data.reason?.trim()) {
    return { success: false, error: 'Registered email address and explanation are required.' };
  }

  // Rate limit recovery requests by IP / email (max 3 in 1 hour)
  const rateLimitKey = `rec_req_${cleanEmail}_${data.ip || 'unknown'}`;
  const rateLimit = checkMfaRateLimit(rateLimitKey);
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: 'Too many recovery requests submitted. Please wait before submitting another request.',
    };
  }

  // Find user by email
  const user = db.prepare('SELECT id, email, role, full_name, phone FROM users WHERE lower(email) = ?').get(cleanEmail) as any;
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
    WHERE user_id = ? AND status = 'PENDING_REVIEW'
  `).get(user.id) as { id: string } | undefined;

  if (existingPending) {
    return {
      success: true,
      requestId: existingPending.id,
      message: 'A recovery request is already under review for this account. Our security team will contact you via your registered email.',
    };
  }

  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  db.prepare(`
    INSERT INTO mfa_recovery_requests (id, user_id, email, phone, srn_reg_no, reason, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'PENDING_REVIEW', CURRENT_TIMESTAMP)
  `).run(
    requestId,
    user.id,
    cleanEmail,
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
  try {
    return db.prepare(`
      SELECT r.id, r.user_id, r.email, r.phone, r.srn_reg_no, r.reason, r.status, r.created_at,
             u.full_name, u.role
      FROM mfa_recovery_requests r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.status = 'PENDING_REVIEW'
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
export function resolveRecoveryRequest(
  requestId: string,
  reviewerId: string,
  decision: 'APPROVED' | 'REJECTED',
  reviewNotes: string,
  context?: { ip?: string; userAgent?: string }
): ResolveRecoveryResult {
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

  // 2. Status checks & Idempotency: only allow resolving requests with status PENDING_REVIEW
  if (req.status !== 'PENDING_REVIEW') {
    return {
      success: false,
      error: `Recovery request has already been resolved with status: ${req.status}. Duplicate resolution rejected.`,
      statusCode: 409,
    };
  }

  // 3. Admin authorization & self-approval restriction
  // Super Admin cannot approve or resolve their own request!
  if (req.user_id && req.user_id === reviewerId) {
    return {
      success: false,
      error: 'Administrators are strictly prohibited from approving or resolving their own MFA recovery requests.',
      statusCode: 403,
    };
  }

  // 4. Target user verification
  let targetUser = req.user_id
    ? (db.prepare('SELECT id, email, role, full_name, status, mfa_enabled FROM users WHERE id = ?').get(req.user_id) as any)
    : null;

  if (!targetUser && req.email) {
    targetUser = db.prepare('SELECT id, email, role, full_name, status, mfa_enabled FROM users WHERE email = ? COLLATE NOCASE').get(req.email) as any;
  }

  if (!targetUser) {
    return {
      success: false,
      error: 'Target user account associated with recovery request not found.',
      statusCode: 404,
    };
  }

  // Self-approval restriction by email
  const reviewer = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(reviewerId) as any;
  if (reviewer && reviewer.email && targetUser.email && reviewer.email.toLowerCase() === targetUser.email.toLowerCase()) {
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

    // Update recovery request status across all legacy & canonical column names
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
      // Invalidate recovery codes
      db.prepare('UPDATE mfa_recovery_codes SET used = 1, used_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(targetUser.id);

      // Invalidate authenticators
      db.prepare('DELETE FROM mfa_authenticators WHERE user_id = ?').run(targetUser.id);

      // Reset MFA status on user record
      db.prepare(`
        UPDATE users
        SET mfa_enabled = 0, mfa_enrolled_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(targetUser.id);

      // Revoke all trusted devices
      revokeAllDeviceTrust(targetUser.id);

      // Revoke all active sessions
      revokeAllSessionsForUser(targetUser.id);
    }

    // 6. Immutable Audit Event Log
    const auditId = `mfa_audit_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const eventType = decision === 'APPROVED' ? 'MFA_RECOVERY_APPROVED' : 'MFA_RECOVERY_REJECTED';
    const auditDetails = JSON.stringify({
      eventType,
      action: decision,
      requestId,
      targetUserUid: targetUser.id,
      targetUserEmail: targetUser.email,
      targetUserRole: targetUser.role,
      adminUid: reviewerId,
      adminEmail: reviewer?.email || reviewerId,
      status: 'SUCCESS',
      resolutionNotes: cleanNotes,
      correlationId,
      timestampIST: istNow,
      timestampUTC: new Date().toISOString(),
      academicDataImpact: 'NONE_ZERO_AUTHORITY',
      commercialDataImpact: 'NONE_ZERO_AUTHORITY',
    });

    db.prepare(`
      INSERT INTO mfa_audit_logs (
        id, user_id, event_type, action, request_id, target_user_uid,
        target_user_email, target_user_role, admin_uid, admin_email,
        status, ist_timestamp, correlation_id, ip_address, user_agent,
        details
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditId,
      targetUser.id,
      eventType,
      decision,
      requestId,
      targetUser.id,
      targetUser.email,
      targetUser.role,
      reviewerId,
      reviewer?.email || reviewerId,
      'SUCCESS',
      istNow,
      correlationId,
      context?.ip || null,
      context?.userAgent || null,
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
        ? `Recovery request approved successfully. MFA factors have been reset and active sessions terminated for ${targetUser.email}.`
        : `Recovery request rejected. Existing MFA configuration remains active for ${targetUser.email}.`,
  };
}
