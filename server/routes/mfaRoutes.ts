import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import {
  authenticateToken,
  optionalAuthenticateToken,
  generateToken,
  generateMfaSessionToken,
  verifyMfaSessionToken,
  verifyAuthToken,
  AuthRequest,
} from '../auth.js';
import { syncRecordToFirestore } from '../services/firestoreSyncService.js';
import {
  markDeviceAsTrusted,
  isDeviceTrusted,
  getDeviceTrustInfo,
  findTrustedDeviceByToken,
  revokeDeviceTrust,
  revokeAllDeviceTrust,
  getTrustedDevicesForUser,
  verifyRfc6238Totp,
  evaluateRfc6238TotpDiagnostics,
  logSafeTotpDriftDiagnostics,
  type TotpVerificationDiagnostic,
  parseCookieValue,
} from '../services/trustService.js';
import {
  generateRecoveryCodes,
  getRecoveryCodeStatus,
  verifyAndConsumeRecoveryCode,
  listAuthenticators,
  registerBackupAuthenticator,
  removeAuthenticator,
  logMfaAudit,
  getMfaAuditLogs,
  submitManualRecoveryRequest,
  getPendingRecoveryRequests,
  resolveRecoveryRequest,
  approveMfaRecovery,
  rejectMfaRecovery,
  getAuthoritativeUserMfaStatus,
  getAuthoritativeUserMfaState,
  getOrCreatePendingMfaSetup,
  generateNewAuthenticatorDeviceSetup,
  checkMfaRateLimit,
  recordMfaFailedAttempt,
  clearMfaRateLimit,
} from '../services/mfaRecoveryService.js';
import { UserRole } from '../../src/types/index.js';

const router = Router();

router.use(optionalAuthenticateToken);

/**
 * Helper to resolve user from either an active MFA session token OR an authenticated request
 */
function resolveMfaContext(req: Request): {
  user: {
    id: string;
    email: string;
    role: UserRole;
    full_name: string;
    mfa_enabled: number;
  } | null;
  sessionType?: 'MFA_CHALLENGE' | 'MFA_ENROLLMENT_REQUIRED' | 'AUTHENTICATED';
  error?: string;
} {
  const mfaSessionToken =
    req.body?.mfaSessionToken ||
    (req.query?.mfaSessionToken as string) ||
    (req.headers['x-mfa-session-token'] as string);

  if (mfaSessionToken) {
    const verified = verifyMfaSessionToken(mfaSessionToken);
    if (!verified) {
      return { user: null, error: 'MFA session expired or invalid. Please sign in again.' };
    }
    const dbUser = db.prepare(
      'SELECT id, email, role, full_name, mfa_enabled FROM users WHERE id = ?'
    ).get(verified.userId) as any;

    if (!dbUser) {
      return { user: null, error: 'User account not found.' };
    }
    return { user: dbUser, sessionType: verified.type };
  }

  // Fallback to existing authenticated user (e.g. configuring MFA from Profile & Settings)
  const authReq = req as AuthRequest;
  if (authReq.user) {
    const dbUser = db.prepare(
      'SELECT id, email, role, full_name, mfa_enabled FROM users WHERE id = ?'
    ).get(authReq.user.id) as any;
    if (!dbUser) {
      return { user: null, error: 'User account not found.' };
    }
    return { user: dbUser, sessionType: 'AUTHENTICATED' };
  }

  // Also check Authorization: Bearer token header if authReq.user not populated by middleware
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.split(' ')[1];
    const decoded = verifyAuthToken(bearerToken);
    if (decoded && decoded.id) {
      const dbUser = db.prepare(
        'SELECT id, email, role, full_name, mfa_enabled FROM users WHERE id = ?'
      ).get(decoded.id) as any;
      if (dbUser) {
        return { user: dbUser, sessionType: 'AUTHENTICATED' };
      }
    }
  }

  return { user: null, error: 'Authentication or MFA session token required.' };
}

/**
 * Helper to issue an authenticated token & set cookies after successful factor verification
 */
function issueAuthenticatedSession(
  req: Request,
  res: Response,
  user: { id: string; email: string; role: UserRole; full_name: string }
) {
  const sessionId = `sess_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const token = generateToken(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
    },
    sessionId,
    true // mfaVerified = true
  );

  try {
    db.prepare(`
      INSERT INTO active_sessions (session_id, user_id, device_fingerprint, user_agent, ip_address, status, expires_at)
      VALUES (?, ?, 'mfa_verified_device', ?, ?, 'ACTIVE', datetime('now', '+7 days'))
    `).run(
      sessionId,
      user.id,
      req.headers['user-agent'] || 'Web Browser',
      req.ip || '127.0.0.1'
    );
  } catch {
    // Non-blocking if table not present
  }

  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie('ca_token', token, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  const deviceId =
    (req.body?.deviceId as string)?.trim() ||
    (req.headers['x-device-id'] as string)?.trim() ||
    (req as any).cookies?.['ca_device_id'] ||
    `dev_${crypto.createHash('md5').update((req.headers['user-agent'] || '') + (req.ip || '')).digest('hex')}`;
  const deviceName = req.body?.deviceName || (req.headers['user-agent'] as string);

  const trust = markDeviceAsTrusted({
    userId: user.id,
    deviceId,
    deviceName,
    userAgent: req.headers['user-agent'] as string,
    ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
  });

  // Secure HttpOnly + SameSite cookie for the 365-day trusted-device token
  res.cookie('ca_trust_token', trust.trustToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 365 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  // Also persist device ID cookie for cross-session continuity
  res.cookie('ca_device_id', deviceId, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 365 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  return { token, trustToken: trust.trustToken, deviceId, expiresAt: trust.expiresAt };
}

/**
 * POST /api/auth/mfa/send-challenge
 * Returns the MFA challenge status for TOTP verification.
 */
router.post('/send-challenge', async (req: Request, res: Response) => {
  try {
    const { user, error } = resolveMfaContext(req);
    if (!user || error) {
      return res.status(401).json({ error: error || 'Unauthorized' });
    }

    if (!user.mfa_enabled) {
      return res.status(400).json({
        error: 'Two-Factor Authentication is not yet enrolled for this account. Please set up your authenticator app first.',
        code: 'ENROLLMENT_REQUIRED',
      });
    }

    return res.json({
      success: true,
      factorType: 'totp',
      message: 'Enter the 6-digit code from your authenticator app.',
    });
  } catch (err: any) {
    console.error('[MFA send-challenge error]:', err);
    return res.status(500).json({ error: 'Failed to process MFA challenge request.' });
  }
});

/**
 * POST /api/auth/mfa/verify-challenge
 * Issues a complete authenticated session after successful TOTP MFA verification.
 */
router.post('/verify-challenge', async (req: Request, res: Response) => {
  try {
    const { user, error } = resolveMfaContext(req);
    if (!user || error) {
      return res.status(401).json({ error: error || 'Unauthorized' });
    }

    const rateLimitKey = `totp_${user.id}_${req.ip || 'unknown'}`;
    const rateCheck = checkMfaRateLimit(rateLimitKey);
    if (!rateCheck.allowed) {
      logMfaAudit({
        userId: user.id,
        eventType: 'RATE_LIMIT_EXCEEDED',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'FAILURE',
        details: `TOTP verification locked until ${rateCheck.lockedUntil}`,
      });
      return res.status(429).json({
        error: 'Too many failed verification attempts. Please wait 15 minutes before trying again.',
        lockedUntil: rateCheck.lockedUntil,
      });
    }

    const otpCode = (req.body?.otpCode as string)?.trim().replace(/\D/g, '');
    if (!otpCode || otpCode.length !== 6) {
      const fail = recordMfaFailedAttempt(rateLimitKey);
      logMfaAudit({
        userId: user.id,
        eventType: 'MFA_FAILED',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'FAILURE',
        details: `Invalid OTP format. Remaining attempts: ${fail.remainingAttempts}`,
      });
      return res.status(400).json({
        error: `Please enter the complete 6-digit code. ${fail.remainingAttempts} attempt(s) remaining.`,
      });
    }

    // Fetch user's registered TOTP secrets and timestamps
    const dbUser = db.prepare('SELECT totp_secret, mfa_enrolled_at, updated_at, email, role FROM users WHERE id = ?').get(user.id) as {
      totp_secret: string | null;
      mfa_enrolled_at: string | null;
      updated_at: string | null;
      email?: string;
      role?: string;
    } | undefined;
    const authenticators = db.prepare('SELECT totp_secret, created_at, last_used_at FROM mfa_authenticators WHERE user_id = ?').all(user.id) as Array<{
      totp_secret: string | null;
      created_at: string;
      last_used_at: string | null;
    }>;

    const candidateSecrets: Array<{ secret: string; createdAt: string | null }> = [];
    if (dbUser?.totp_secret) {
      candidateSecrets.push({
        secret: dbUser.totp_secret,
        createdAt: dbUser.mfa_enrolled_at || dbUser.updated_at || null,
      });
    }
    authenticators.forEach((a) => {
      if (a.totp_secret && !candidateSecrets.some((s) => s.secret === a.totp_secret)) {
        candidateSecrets.push({
          secret: a.totp_secret,
          createdAt: a.created_at || null,
        });
      }
    });

    let isValid = false;
    let selectedDiag: TotpVerificationDiagnostic | null = null;
    let selectedSecretTimestamp: string | null = null;

    if (candidateSecrets.length > 0) {
      for (const item of candidateSecrets) {
        const diag = evaluateRfc6238TotpDiagnostics(item.secret, otpCode, 1, 10);
        if (diag.valid) {
          isValid = true;
          selectedDiag = diag;
          selectedSecretTimestamp = item.createdAt;
          break;
        } else {
          if (!selectedDiag || (diag.detectedOffsetInExpandedWindow !== null && selectedDiag.detectedOffsetInExpandedWindow === null)) {
            selectedDiag = diag;
            selectedSecretTimestamp = item.createdAt;
          }
        }
      }
    } else {
      selectedDiag = evaluateRfc6238TotpDiagnostics('', otpCode, 1, 10);
    }

    if (!isValid) {
      const fail = recordMfaFailedAttempt(rateLimitKey);
      const effectiveDiag = selectedDiag || evaluateRfc6238TotpDiagnostics('', otpCode, 1, 10);

      // Safe, non-sensitive logging to track server time, secret key timestamp, and calculated drift window
      logSafeTotpDriftDiagnostics({
        userId: user.id,
        userEmail: dbUser?.email || user.email,
        userRole: dbUser?.role || user.role,
        endpoint: '/api/auth/mfa/verify-challenge',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        secretEnrolledAt: selectedSecretTimestamp || dbUser?.mfa_enrolled_at || null,
        secretUpdatedAt: dbUser?.updated_at || null,
        diagnostics: effectiveDiag,
        remainingAttempts: fail.remainingAttempts,
      });

      logMfaAudit({
        userId: user.id,
        eventType: 'MFA_FAILED',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'FAILURE',
        details: JSON.stringify({
          reason: 'TOTP_VERIFICATION_FAILED',
          endpoint: '/api/auth/mfa/verify-challenge',
          serverTimeUtc: effectiveDiag.serverTimeUtc,
          serverEpochSeconds: effectiveDiag.serverEpochSeconds,
          currentStep: effectiveDiag.currentStep,
          secretKeyTimestamp: selectedSecretTimestamp || dbUser?.mfa_enrolled_at || null,
          driftWindow: {
            allowedWindowSteps: effectiveDiag.windowSteps,
            driftToleranceSeconds: effectiveDiag.driftToleranceSeconds,
            allowedWindowStartUtc: effectiveDiag.allowedWindowStartUtc,
            allowedWindowEndUtc: effectiveDiag.allowedWindowEndUtc,
          },
          detectedOffsetInExpandedWindow: effectiveDiag.detectedOffsetInExpandedWindow,
          detectedDriftSeconds: effectiveDiag.detectedDriftSeconds,
          driftInterpretation: effectiveDiag.driftInterpretation,
          remainingAttempts: fail.remainingAttempts,
        }),
      });

      return res.status(400).json({
        error: `Invalid verification code. Please ensure your authenticator app is synced with the current time and try again. ${fail.remainingAttempts} attempt(s) remaining.`,
      });
    }

    // Clear rate limit on valid request flow
    clearMfaRateLimit(rateLimitKey);

    // Update last_used_at timestamp on primary authenticator
    try {
      db.prepare(`
        UPDATE mfa_authenticators
        SET last_used_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND factor_type = 'PRIMARY_TOTP'
      `).run(user.id);
    } catch {
      // Non-blocking
    }

    logMfaAudit({
      userId: user.id,
      eventType: 'MFA_VERIFIED',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'SUCCESS',
      details: 'Two-Factor Authentication verified successfully via Authenticator App.',
    });

    const session = issueAuthenticatedSession(req, res, user);

    return res.json({
      success: true,
      token: session.token,
      trustToken: session.trustToken,
      deviceId: session.deviceId,
      deviceTrusted: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
        mfaEnabled: true,
        mfaVerified: true,
      },
    });
  } catch (err: any) {
    console.error('[MFA verify-challenge error]:', err);
    return res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

/**
 * GET /api/auth/mfa/setup
 * Returns the active pending TOTP setup (secret, URI, QR code).
 * Re-uses the existing pending secret. Never regenerates secret on reload!
 */
router.get('/setup', async (req: Request, res: Response) => {
  try {
    const { user, error } = resolveMfaContext(req);
    if (!user || error) {
      return res.status(401).json({ error: error || 'Unauthorized' });
    }
    const authState = await getAuthoritativeUserMfaState(user.id);
    if (authState.state === 'MFA_ENROLLED') {
      return res.status(400).json({ error: 'MFA is already enrolled for this account.' });
    }
    const setup = await getOrCreatePendingMfaSetup(user.id, user.email, user.role);
    return res.json({ success: true, totpSetup: setup });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve MFA setup.' });
  }
});

/**
 * POST /api/auth/mfa/enroll/verify
 * Finalizes enrollment and activates TOTP MFA for the account.
 * Automatically provisions initial one-time recovery codes and returns them!
 */
router.post('/enroll/verify', async (req: Request, res: Response) => {
  try {
    const { user, error } = resolveMfaContext(req);
    if (!user || error) {
      return res.status(401).json({ error: error || 'Unauthorized' });
    }

    const userRow = db.prepare('SELECT pending_totp_secret, totp_secret FROM users WHERE id = ?').get(user.id) as any;
    const candidateSecret = (req.body?.secretKey as string)?.trim() || (req.body?.totpSecret as string)?.trim() || userRow?.pending_totp_secret || userRow?.totp_secret || null;
    const otpCode = (req.body?.otpCode as string || req.body?.code as string || '').trim().replace(/\D/g, '');

    if (!candidateSecret) {
      return res.status(400).json({ error: 'TOTP secret key is required for MFA enrollment.' });
    }
    if (!otpCode || otpCode.length !== 6) {
      return res.status(400).json({ error: 'Please enter the complete 6-digit verification code from your authenticator app.' });
    }

    // Cryptographically verify code against candidate secret with detailed drift diagnostics
    const diag = evaluateRfc6238TotpDiagnostics(candidateSecret, otpCode, 1, 10);
    if (!diag.valid) {
      // Safe, non-sensitive logging to track server time, candidate secret generation timestamp, and drift window
      logSafeTotpDriftDiagnostics({
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        endpoint: '/api/auth/mfa/enroll/verify',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        secretEnrolledAt: 'CANDIDATE_SECRET_IN_ENROLLMENT',
        secretUpdatedAt: null,
        diagnostics: diag,
      });

      logMfaAudit({
        userId: user.id,
        eventType: 'MFA_FAILED',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'FAILURE',
        details: JSON.stringify({
          reason: 'ENROLLMENT_VERIFY_FAILED',
          endpoint: '/api/auth/mfa/enroll/verify',
          serverTimeUtc: diag.serverTimeUtc,
          serverEpochSeconds: diag.serverEpochSeconds,
          currentStep: diag.currentStep,
          secretKeyTimestamp: 'CANDIDATE_SECRET_IN_ENROLLMENT',
          driftWindow: {
            allowedWindowSteps: diag.windowSteps,
            driftToleranceSeconds: diag.driftToleranceSeconds,
            allowedWindowStartUtc: diag.allowedWindowStartUtc,
            allowedWindowEndUtc: diag.allowedWindowEndUtc,
          },
          detectedOffsetInExpandedWindow: diag.detectedOffsetInExpandedWindow,
          detectedDriftSeconds: diag.detectedDriftSeconds,
          driftInterpretation: diag.driftInterpretation,
        }),
      });

      return res.status(400).json({
        error: 'Invalid verification code. Please ensure your authenticator app is synced with the current time and try again.'
      });
    }

    // Update user record in SQLite: enable MFA, store persistent TOTP secret, clear pending_totp_secret, and clear mfa_reset_required
    db.prepare(`
      UPDATE users
      SET mfa_enabled = 1,
          mfa_enrolled_at = CURRENT_TIMESTAMP,
          totp_secret = ?,
          pending_totp_secret = NULL,
          mfa_reset_required = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(candidateSecret, user.id);

    // Ensure primary authenticator record exists with persistent secret
    const primaryId = `auth_prim_${user.id}`;
    db.prepare(`
      INSERT INTO mfa_authenticators (id, user_id, factor_type, label, totp_secret, created_at, last_used_at)
      VALUES (?, ?, 'PRIMARY_TOTP', 'Primary Authenticator App', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        totp_secret = excluded.totp_secret,
        last_used_at = CURRENT_TIMESTAMP
    `).run(primaryId, user.id, candidateSecret);

    // Provisions recovery codes if not already present
    let recoveryCodes: string[] | undefined = undefined;
    let remainingCodes = 0;
    const existingRecovery = db.prepare('SELECT COUNT(*) as count FROM mfa_recovery_codes WHERE user_id = ?').get(user.id) as { count: number } | undefined;
    if (!existingRecovery || existingRecovery.count === 0) {
      const recoveryResult = generateRecoveryCodes(user.id, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      recoveryCodes = recoveryResult.plaintextCodes;
      remainingCodes = recoveryResult.total;
    } else {
      const existingStatus = getRecoveryCodeStatus(user.id);
      remainingCodes = existingStatus.remaining;
    }

    // Mirror to Firestore
    syncRecordToFirestore('users', user.id, {
      id: user.id,
      mfa_enabled: 1,
      mfa_enrolled_at: new Date().toISOString(),
      totp_secret: candidateSecret,
      mfa_reset_required: 0,
      updated_at: new Date().toISOString(),
    }).catch(() => {});

    logMfaAudit({
      userId: user.id,
      eventType: 'MFA_ENROLLED',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'SUCCESS',
      details: 'Two-Factor Authentication successfully enrolled. Initial authenticator active.',
    });

    const session = issueAuthenticatedSession(req, res, user);

    return res.json({
      success: true,
      token: session.token,
      trustToken: session.trustToken,
      deviceId: session.deviceId,
      deviceTrusted: true,
      mfaState: 'MFA_ENROLLED',
      message: 'Two-Factor Authentication enabled successfully.',
      recoveryCodes,
      remainingCodes,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
        mfaEnabled: true,
        mfaVerified: true,
      },
    });
  } catch (err: any) {
    console.error('[MFA enroll/verify error]:', err);
    return res.status(500).json({ error: 'Enrollment verification failed. Please try again.' });
  }
});

/**
 * POST /api/auth/mfa/sync-factor
 * Synchronizes authoritative account state when TOTP factor is enrolled in Firebase.
 */
router.post('/sync-factor', async (req: Request, res: Response) => {
  try {
    const { user, error } = resolveMfaContext(req);
    if (!user || error) {
      return res.status(401).json({ error: error || 'Unauthorized' });
    }

    db.prepare(`
      UPDATE users
      SET mfa_enabled = 1,
          mfa_enrolled_at = COALESCE(mfa_enrolled_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(user.id);

    const primaryId = `auth_prim_${user.id}`;
    db.prepare(`
      INSERT OR IGNORE INTO mfa_authenticators (id, user_id, factor_type, label, created_at)
      VALUES (?, ?, 'PRIMARY_TOTP', 'Primary Authenticator App', CURRENT_TIMESTAMP)
    `).run(primaryId, user.id);

    // Durable Firestore synchronization
    syncRecordToFirestore('users', user.id, {
      id: user.id,
      mfa_enabled: 1,
      mfa_enrolled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).catch(() => {});

    syncRecordToFirestore('mfa_authenticators', primaryId, {
      id: primaryId,
      user_id: user.id,
      factor_type: 'PRIMARY_TOTP',
      label: 'Primary Authenticator App',
      created_at: new Date().toISOString(),
    }).catch(() => {});

    const session = issueAuthenticatedSession(req, res, user);

    return res.json({
      success: true,
      token: session.token,
      trustToken: session.trustToken,
      deviceId: session.deviceId,
      deviceTrusted: true,
      message: 'Two-Factor Authentication synchronized successfully.',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
        mfaEnabled: true,
        mfaVerified: true,
      },
    });
  } catch (err: any) {
    console.error('[MFA sync-factor error]:', err);
    return res.status(500).json({ error: 'Failed to synchronize MFA factor.' });
  }
});

// ==========================================================
// RECOVERY CODES MANAGEMENT
// ==========================================================

/**
 * POST /api/auth/mfa/recovery-codes/generate
 * Generates 10 fresh one-time recovery codes and invalidates previous codes.
 * Requires user authentication or active MFA enrollment session.
 */
router.post('/recovery-codes/generate', async (req: Request, res: Response) => {
  try {
    const { user, error } = resolveMfaContext(req);
    if (!user || error) {
      return res.status(401).json({ error: error || 'Unauthorized' });
    }

    const result = generateRecoveryCodes(user.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({
      success: true,
      recoveryCodes: result.plaintextCodes,
      total: result.total,
      remaining: result.total,
      message: 'New recovery codes generated successfully. Store these safely offline.',
    });
  } catch (err: any) {
    console.error('[MFA recovery-codes generate error]:', err);
    return res.status(500).json({ error: 'Failed to generate recovery codes.' });
  }
});

/**
 * POST /api/auth/mfa/recovery-codes/regenerate
 * Alias for /recovery-codes/generate
 */
router.post('/recovery-codes/regenerate', async (req: Request, res: Response) => {
  try {
    const { user, error } = resolveMfaContext(req);
    if (!user || error) {
      return res.status(401).json({ error: error || 'Unauthorized' });
    }

    const result = generateRecoveryCodes(user.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({
      success: true,
      recoveryCodes: result.plaintextCodes,
      total: result.total,
      remaining: result.total,
      message: 'New recovery codes generated successfully. Store these safely offline.',
    });
  } catch (err: any) {
    console.error('[MFA recovery-codes regenerate error]:', err);
    return res.status(500).json({ error: 'Failed to regenerate recovery codes.' });
  }
});

/**
 * GET /api/auth/mfa/recovery-codes/status
 * Returns remaining count and generation timestamp of recovery codes.
 * Never exposes the codes themselves.
 */
router.get('/recovery-codes/status', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const status = getRecoveryCodeStatus(req.user.id);
    return res.json({ success: true, ...status });
  } catch (err: any) {
    console.error('[MFA recovery-codes status error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve recovery code status.' });
  }
});

/**
 * POST /api/auth/mfa/recovery-codes/verify
 * Consumes a one-time recovery code during login challenge.
 * Enforces single-use, rate-limits brute force attempts, and issues authenticated session.
 */
router.post('/recovery-codes/verify', async (req: Request, res: Response) => {
  try {
    const { user, error } = resolveMfaContext(req);
    if (!user || error) {
      return res.status(401).json({ error: error || 'Unauthorized' });
    }

    const recoveryCode = (req.body?.recoveryCode as string)?.trim();
    if (!recoveryCode) {
      return res.status(400).json({ error: 'Please enter a recovery code.' });
    }

    const verification = verifyAndConsumeRecoveryCode(user.id, recoveryCode, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (!verification.success) {
      return res.status(400).json({
        error: verification.error || 'Invalid recovery code.',
        remaining: verification.remaining,
      });
    }

    const session = issueAuthenticatedSession(req, res, user);

    return res.json({
      success: true,
      token: session.token,
      trustToken: session.trustToken,
      deviceId: session.deviceId,
      deviceTrusted: true,
      remainingCodes: verification.remaining,
      warning: verification.warning,
      message: 'Recovery code verified successfully. You have gained access to your account.',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
        mfaEnabled: true,
        mfaVerified: true,
      },
    });
  } catch (err: any) {
    console.error('[MFA recovery-codes verify error]:', err);
    return res.status(500).json({ error: 'Recovery code verification failed.' });
  }
});

// ==========================================================
// BACKUP AUTHENTICATORS MANAGEMENT
// ==========================================================

/**
 * GET /api/auth/mfa/authenticators
 * Lists enrolled authenticators (Primary & Backup) for the authenticated user.
 */
router.get('/authenticators', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const list = listAuthenticators(req.user.id);
    return res.json({ success: true, authenticators: list });
  } catch (err: any) {
    console.error('[MFA list authenticators error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve authenticators.' });
  }
});

/**
 * GET /api/auth/mfa/device/new-setup
 * Generates a brand new TOTP secret & QR code for adding a new authenticator device.
 * Section 6: Security Settings -> MFA -> Authenticator Devices -> Add Authenticator
 */
router.get('/device/new-setup', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const label = (req.query?.label as string) || 'Secondary Authenticator';
    const setup = await generateNewAuthenticatorDeviceSetup(req.user.email, label);
    return res.json({ success: true, setup });
  } catch (err: any) {
    console.error('[MFA new device setup error]:', err);
    return res.status(500).json({ error: 'Failed to generate new authenticator device setup.' });
  }
});

/**
 * POST /api/auth/mfa/backup-authenticator/enroll
 * Registers a newly enrolled backup authenticator factor with custom label.
 * The client generated a BRAND NEW secret for this factor.
 * Validates the 6-digit TOTP code against the new device secret before registering.
 */
router.post('/backup-authenticator/enroll', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const label = (req.body?.label as string)?.trim() || 'Authenticator Device';
    const secretKey = (req.body?.secretKey as string)?.trim();
    const verificationCode = (req.body?.verificationCode as string || req.body?.otpCode as string || '').trim().replace(/\D/g, '');
    const firebaseFactorUid = (req.body?.firebaseFactorUid as string)?.trim();

    // If a secretKey was provided, verify the 6-digit TOTP code against it
    if (secretKey) {
      if (!verificationCode || verificationCode.length !== 6) {
        return res.status(400).json({ error: 'Please enter the 6-digit verification code from your authenticator app.' });
      }

      const diag = evaluateRfc6238TotpDiagnostics(secretKey, verificationCode, 1, 10);
      if (!diag.valid) {
        return res.status(400).json({ error: 'Invalid verification code. Please check your authenticator code and time synchronization.' });
      }
    }

    const record = registerBackupAuthenticator(req.user.id, label, secretKey, firebaseFactorUid, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({
      success: true,
      message: `Authenticator device "${record.label}" has been enrolled.`,
      authenticator: record,
    });
  } catch (err: any) {
    console.error('[MFA enroll backup authenticator error]:', err);
    return res.status(500).json({ error: 'Failed to enroll backup authenticator.' });
  }
});

/**
 * POST /api/auth/mfa/authenticators/remove
 * Removes an authenticator factor.
 * Strictly enforced: Administrative accounts cannot remove their last remaining authenticator!
 */
router.post('/authenticators/remove', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const { authenticatorId } = req.body;
    if (!authenticatorId) {
      return res.status(400).json({ error: 'Authenticator ID is required.' });
    }

    const result = removeAuthenticator(req.user.id, authenticatorId, req.user.role, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (!result.success) {
      return res.status(403).json({ error: result.error });
    }

    return res.json({
      success: true,
      message: 'Authenticator factor removed successfully.',
    });
  } catch (err: any) {
    console.error('[MFA remove authenticator error]:', err);
    return res.status(500).json({ error: 'Failed to remove authenticator.' });
  }
});

// ==========================================================
// MANUAL RECOVERY REQUEST (FINAL FACTOR LOSS)
// ==========================================================

/**
 * POST /api/auth/mfa/recovery-request
 * Submits a manual recovery request for accounts that lost all factors & recovery codes.
 * Strictly NO instant bypass or backdoor.
 */
router.post('/recovery-request', async (req: Request, res: Response) => {
  try {
    const { userId, user_id, email, phone, srnRegNo, reason } = req.body;
    if ((!userId && !user_id && !email) || !reason) {
      return res.status(400).json({
        error: 'Registered email address or user ID and detailed reason for recovery are required.',
      });
    }

    const result = submitManualRecoveryRequest({
      userId: (userId || user_id)?.toString().trim(),
      email,
      phone,
      srnRegNo,
      reason,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.json({
      success: true,
      requestId: result.requestId,
      message: result.message,
    });
  } catch (err: any) {
    console.error('[MFA manual recovery request error]:', err);
    return res.status(500).json({ error: 'Failed to submit recovery request.' });
  }
});

/**
 * GET /api/auth/mfa/recovery-requests
 * Administrative endpoint to list pending account recovery requests.
 */
router.get('/recovery-requests', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Super Admin privileges required.' });
    }
    const requests = getPendingRecoveryRequests();
    return res.json({ success: true, requests });
  } catch (err: any) {
    console.error('[MFA get recovery requests error]:', err);
    return res.status(500).json({ error: 'Failed to fetch recovery requests.' });
  }
});

/**
 * POST /api/auth/mfa/recovery-requests/:id/resolve
 * Super Admin resolves a pending manual recovery request (APPROVED or REJECTED).
 */
router.post('/recovery-requests/:id/resolve', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Super Admin privileges required.' });
    }
    const { id } = req.params;
    const { decision, reviewNotes, notes } = req.body;

    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      return res.status(400).json({ error: 'Decision must be APPROVED or REJECTED.' });
    }

    const result = await resolveRecoveryRequest(
      id,
      req.user.id,
      decision,
      reviewNotes || notes || '',
      { ip: req.ip, userAgent: req.headers['user-agent'] as string }
    );

    if (!result.success) {
      return res.status(result.statusCode || 400).json({
        error: result.error || 'Failed to resolve recovery request.',
        statusCode: result.statusCode || 400,
      });
    }

    return res.json({
      success: true,
      action: result.action,
      requestId: result.requestId,
      targetUser: result.targetUser,
      message: result.message || `Recovery request ${decision.toLowerCase()} successfully.`,
    });
  } catch (err: any) {
    console.error('[MFA resolve recovery request error]:', err);
    return res.status(500).json({ error: 'Internal error resolving recovery request: ' + (err?.message || '') });
  }
});

/**
 * Convenience aliases:
 * POST /api/auth/mfa/recovery-requests/:id/approve
 * POST /api/auth/mfa/recovery-requests/:id/reject
 */
router.post('/recovery-requests/:id/approve', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Super Admin privileges required.' });
    }
    const { id } = req.params;
    const notes = req.body?.reviewNotes || req.body?.notes || req.body?.reason || 'Approved by Super Admin';
    const result = await approveMfaRecovery(id, req.user.id, notes, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string,
    });
    if (!result.success) {
      return res.status(result.statusCode || 400).json({
        error: result.error || 'Failed to approve recovery request.',
        statusCode: result.statusCode || 400,
      });
    }
    return res.json({
      success: true,
      action: 'APPROVED',
      requestId: result.requestId,
      targetUser: result.targetUser,
      message: result.message,
    });
  } catch (err: any) {
    console.error('[MFA approve recovery request error]:', err);
    return res.status(500).json({ error: 'Internal error approving recovery request: ' + (err?.message || '') });
  }
});

router.post('/recovery-requests/:id/reject', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Super Admin privileges required.' });
    }
    const { id } = req.params;
    const notes = req.body?.reviewNotes || req.body?.notes || req.body?.reason || 'Rejected by Super Admin';
    const result = await rejectMfaRecovery(id, req.user.id, notes, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string,
    });
    if (!result.success) {
      return res.status(result.statusCode || 400).json({
        error: result.error || 'Failed to reject recovery request.',
        statusCode: result.statusCode || 400,
      });
    }
    return res.json({
      success: true,
      action: 'REJECTED',
      requestId: result.requestId,
      targetUser: result.targetUser,
      message: result.message,
    });
  } catch (err: any) {
    console.error('[MFA reject recovery request error]:', err);
    return res.status(500).json({ error: 'Internal error rejecting recovery request: ' + (err?.message || '') });
  }
});

// ==========================================================
// AUDIT LOGS
// ==========================================================

/**
 * GET /api/auth/mfa/audit-logs
 * Retrieves security audit events for the authenticated user (or all if Super Admin).
 */
router.get('/audit-logs', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const targetUserId = isSuperAdmin && req.query.all === 'true' ? undefined : req.user.id;

    const logs = getMfaAuditLogs(targetUserId, 50);
    return res.json({ success: true, logs });
  } catch (err: any) {
    console.error('[MFA audit logs error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve audit logs.' });
  }
});

// ==========================================================
// TRUSTED DEVICES & DISABLE MFA
// ==========================================================

/**
 * GET /api/auth/mfa/trusted-devices
 * Lists active trusted devices for the authenticated user.
 */
router.get('/trusted-devices', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const devices = getTrustedDevicesForUser(req.user.id);
    return res.json({ success: true, trustedDevices: devices });
  } catch (err: any) {
    console.error('[MFA trusted-devices error]:', err);
    return res.status(500).json({ error: 'Failed to retrieve trusted devices.' });
  }
});

/**
 * POST /api/auth/mfa/trusted-devices/revoke
 * Explicitly revokes trust for a specific device.
 */
router.post('/trusted-devices/revoke', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const { deviceId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required to revoke trust.' });
    }
    const revoked = revokeDeviceTrust(req.user.id, deviceId);
    return res.json({ success: revoked, message: 'Device trust revoked successfully.' });
  } catch (err: any) {
    console.error('[MFA trusted-devices revoke error]:', err);
    return res.status(500).json({ error: 'Failed to revoke device trust.' });
  }
});

/**
 * POST /api/auth/mfa/trusted-devices/revoke-all
 * Revokes all trusted devices for the user (requiring TOTP on next login across all devices).
 */
router.post('/trusted-devices/revoke-all', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const count = revokeAllDeviceTrust(req.user.id);
    return res.json({
      success: true,
      count,
      message: 'All trusted devices have been revoked. TOTP will be required on next login on all devices.',
    });
  } catch (err: any) {
    console.error('[MFA trusted-devices revoke-all error]:', err);
    return res.status(500).json({ error: 'Failed to revoke trusted devices.' });
  }
});

/**
 * GET & POST /api/auth/mfa/trusted-device/check
 * Authoritatively verifies whether the incoming request possesses a valid, non-expired
 * device-specific credential stored in the secure HttpOnly cookie (ca_trust_token).
 */
const handleCheckDeviceTrust = async (req: Request, res: Response) => {
  try {
    const rawCookies = (req as any).cookies || {};
    const trustToken =
      (req.headers['x-device-trust-token'] as string)?.trim() ||
      (req.body?.trustToken as string)?.trim() ||
      (req.query?.trustToken as string)?.trim() ||
      rawCookies['ca_trust_token'] ||
      parseCookieValue(req.headers.cookie, 'ca_trust_token');

    const deviceId =
      (req.headers['x-device-id'] as string)?.trim() ||
      (req.body?.deviceId as string)?.trim() ||
      (req.query?.deviceId as string)?.trim() ||
      rawCookies['ca_device_id'] ||
      parseCookieValue(req.headers.cookie, 'ca_device_id') ||
      'unknown_device';

    const { user } = resolveMfaContext(req);

    if (user) {
      const trustInfo = getDeviceTrustInfo(user.id, deviceId, trustToken);
      const authMfaStatus = await getAuthoritativeUserMfaStatus(user.id);
      const requiresTotp = Boolean(authMfaStatus.mfaEnabled && !trustInfo.isTrusted);

      return res.json({
        success: true,
        isTrusted: trustInfo.isTrusted,
        deviceId,
        requiresTotp,
        mfaEnabled: authMfaStatus.mfaEnabled,
        expiresAt: trustInfo.expiresAt,
        lastUsedAt: trustInfo.lastUsedAt,
        status: trustInfo.status,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        message: trustInfo.isTrusted
          ? 'Device is recognized as a trusted browser for 365 days.'
          : requiresTotp
            ? 'Untrusted browser detected. TOTP validation is required.'
            : 'Browser is untrusted, but MFA is not active for this account.',
      });
    }

    // Anonymous browser pre-check (e.g. before submitting credentials)
    const activeRecord = findTrustedDeviceByToken(deviceId, trustToken);
    if (activeRecord) {
      return res.json({
        success: true,
        isTrusted: true,
        deviceId,
        requiresTotp: false,
        expiresAt: activeRecord.expiresAt,
        lastUsedAt: activeRecord.lastUsedAt,
        status: 'ACTIVE',
        message: 'Device credential stored in secure HttpOnly cookie is valid and active for 365 days.',
      });
    }

    return res.json({
      success: true,
      isTrusted: false,
      deviceId,
      requiresTotp: true,
      status: 'UNTRUSTED',
      message: 'Untrusted browser. No valid trusted-device credential detected in HttpOnly cookie.',
    });
  } catch (err: any) {
    console.error('[MFA trusted-device/check error]:', err);
    return res.status(500).json({ error: 'Failed to verify device trust status.' });
  }
};

router.get('/trusted-device/check', handleCheckDeviceTrust);
router.post('/trusted-device/check', handleCheckDeviceTrust);

/**
 * POST /api/auth/mfa/validate-totp
 * Implements server-side TOTP validation logic ONLY for untrusted browsers.
 * 
 * - If browser possesses a valid 365-day trusted credential (ca_trust_token HttpOnly cookie),
 *   it skips/bypasses OTP validation entirely and issues the authenticated session.
 * - If browser is untrusted, it strictly verifies the 6-digit TOTP code against
 *   the account's registered authenticator secret, marks the device as trusted for 365 days,
 *   sets the secure HttpOnly cookie, and returns the session.
 */
const handleValidateTotp = async (req: Request, res: Response) => {
  try {
    const { user, error } = resolveMfaContext(req);
    if (!user || error) {
      return res.status(401).json({ error: error || 'Authentication or MFA session required.' });
    }

    const rawCookies = (req as any).cookies || {};
    const trustToken =
      (req.body?.trustToken as string)?.trim() ||
      (req.headers['x-device-trust-token'] as string)?.trim() ||
      rawCookies['ca_trust_token'] ||
      parseCookieValue(req.headers.cookie, 'ca_trust_token');

    const deviceId =
      (req.body?.deviceId as string)?.trim() ||
      (req.headers['x-device-id'] as string)?.trim() ||
      rawCookies['ca_device_id'] ||
      parseCookieValue(req.headers.cookie, 'ca_device_id') ||
      `dev_${crypto.randomBytes(8).toString('hex')}`;

    // 1. EVALUATE BROWSER TRUST STATUS:
    // If device is already trusted, bypass TOTP validation immediately!
    const alreadyTrusted = Boolean(deviceId && trustToken && isDeviceTrusted(user.id, deviceId, trustToken));
    if (alreadyTrusted) {
      const session = issueAuthenticatedSession(req, res, user);

      logMfaAudit({
        userId: user.id,
        eventType: 'MFA_BYPASS_TRUSTED_DEVICE',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'SUCCESS',
        details: 'TOTP challenge bypassed authoritatively because browser is already trusted.',
      });

      // Clear mfa_reset_required if present
      try {
        db.prepare('UPDATE users SET mfa_reset_required = 0 WHERE id = ?').run(user.id);
        syncRecordToFirestore('users', user.id, { mfa_reset_required: 0 }).catch(() => {});
      } catch {
        // non-fatal
      }

      return res.json({
        success: true,
        isTrusted: true,
        deviceTrusted: true,
        bypassed: true,
        message: 'Browser is already trusted for 365 days. TOTP verification bypassed.',
        token: session.token,
        trustToken: session.trustToken,
        trustExpiresAt: session.expiresAt,
        deviceId: session.deviceId,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          fullName: user.full_name,
          mfaEnabled: true,
          mfaVerified: true,
        },
      });
    }

    // 2. UNTRUSTED BROWSER: SERVER-SIDE TOTP VALIDATION LOGIC
    const rateLimitKey = `totp_${user.id}_${req.ip || 'unknown'}`;
    const rateCheck = checkMfaRateLimit(rateLimitKey);
    if (!rateCheck.allowed) {
      logMfaAudit({
        userId: user.id,
        eventType: 'RATE_LIMIT_EXCEEDED',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'FAILURE',
        details: `TOTP verification locked until ${rateCheck.lockedUntil}`,
      });
      return res.status(429).json({
        error: 'Too many failed verification attempts. Please wait 15 minutes before trying again.',
        lockedUntil: rateCheck.lockedUntil,
      });
    }

    const otpCode = (req.body?.otpCode as string)?.trim().replace(/\D/g, '');
    if (!otpCode || otpCode.length !== 6) {
      const fail = recordMfaFailedAttempt(rateLimitKey);
      logMfaAudit({
        userId: user.id,
        eventType: 'MFA_FAILED',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'FAILURE',
        details: `Invalid OTP format on untrusted browser. Remaining attempts: ${fail.remainingAttempts}`,
      });
      return res.status(400).json({
        error: `Please enter the complete 6-digit code. ${fail.remainingAttempts} attempt(s) remaining.`,
      });
    }

    // Fetch user's registered TOTP secret and key timestamps
    const dbUser = db.prepare('SELECT totp_secret, mfa_enrolled_at, updated_at, email, role FROM users WHERE id = ?').get(user.id) as {
      totp_secret: string | null;
      mfa_enrolled_at: string | null;
      updated_at: string | null;
      email?: string;
      role?: string;
    } | undefined;
    const authenticators = db.prepare('SELECT totp_secret, created_at, last_used_at FROM mfa_authenticators WHERE user_id = ?').all(user.id) as Array<{
      totp_secret: string | null;
      created_at: string;
      last_used_at: string | null;
    }>;

    const possibleSecrets: Array<{ secret: string; createdAt: string | null }> = [];
    if (dbUser?.totp_secret) {
      possibleSecrets.push({
        secret: dbUser.totp_secret,
        createdAt: dbUser.mfa_enrolled_at || dbUser.updated_at || null,
      });
    }
    authenticators.forEach((a) => {
      if (a.totp_secret && !possibleSecrets.some((s) => s.secret === a.totp_secret)) {
        possibleSecrets.push({
          secret: a.totp_secret,
          createdAt: a.created_at || null,
        });
      }
    });

    let isValidTotp = false;
    let selectedDiag: TotpVerificationDiagnostic | null = null;
    let selectedSecretTimestamp: string | null = null;

    if (possibleSecrets.length > 0) {
      for (const item of possibleSecrets) {
        const diag = evaluateRfc6238TotpDiagnostics(item.secret, otpCode, 1, 10);
        if (diag.valid) {
          isValidTotp = true;
          selectedDiag = diag;
          selectedSecretTimestamp = item.createdAt;
          break;
        } else {
          if (!selectedDiag || (diag.detectedOffsetInExpandedWindow !== null && selectedDiag.detectedOffsetInExpandedWindow === null)) {
            selectedDiag = diag;
            selectedSecretTimestamp = item.createdAt;
          }
        }
      }
    } else {
      selectedDiag = evaluateRfc6238TotpDiagnostics('', otpCode, 1, 10);
    }

    if (!isValidTotp) {
      const fail = recordMfaFailedAttempt(rateLimitKey);
      const effectiveDiag = selectedDiag || evaluateRfc6238TotpDiagnostics('', otpCode, 1, 10);

      // Safe, non-sensitive logging to track server time, secret key timestamp, and calculated drift window
      logSafeTotpDriftDiagnostics({
        userId: user.id,
        userEmail: dbUser?.email || user.email,
        userRole: dbUser?.role || user.role,
        endpoint: req.originalUrl || req.path,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        secretEnrolledAt: selectedSecretTimestamp || dbUser?.mfa_enrolled_at || null,
        secretUpdatedAt: dbUser?.updated_at || null,
        diagnostics: effectiveDiag,
        remainingAttempts: fail.remainingAttempts,
      });

      logMfaAudit({
        userId: user.id,
        eventType: 'MFA_FAILED',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'FAILURE',
        details: JSON.stringify({
          reason: 'TOTP_CODE_MISMATCH',
          endpoint: req.originalUrl || req.path,
          serverTimeUtc: effectiveDiag.serverTimeUtc,
          serverEpochSeconds: effectiveDiag.serverEpochSeconds,
          currentStep: effectiveDiag.currentStep,
          secretKeyTimestamp: selectedSecretTimestamp || dbUser?.mfa_enrolled_at || null,
          driftWindow: {
            allowedWindowSteps: effectiveDiag.windowSteps,
            driftToleranceSeconds: effectiveDiag.driftToleranceSeconds,
            allowedWindowStartUtc: effectiveDiag.allowedWindowStartUtc,
            allowedWindowEndUtc: effectiveDiag.allowedWindowEndUtc,
          },
          detectedOffsetInExpandedWindow: effectiveDiag.detectedOffsetInExpandedWindow,
          detectedDriftSeconds: effectiveDiag.detectedDriftSeconds,
          driftInterpretation: effectiveDiag.driftInterpretation,
          remainingAttempts: fail.remainingAttempts,
        }),
      });

      return res.status(400).json({
        error: `Invalid authenticator code. Please check your app and try again. ${fail.remainingAttempts} attempt(s) remaining.`,
      });
    }

    // Clear rate limit on success
    clearMfaRateLimit(rateLimitKey);

    // Update last_used_at timestamp on authenticators
    try {
      db.prepare(`
        UPDATE mfa_authenticators
        SET last_used_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND factor_type = 'PRIMARY_TOTP'
      `).run(user.id);
    } catch {
      // Non-blocking
    }

    // Mark device as trusted for 365 days and issue the secure HttpOnly cookie
    const session = issueAuthenticatedSession(req, res, user);

    // Atomically ensure mfa_enabled is 1 and mfa_reset_required is cleared in database
    try {
      db.prepare(`
        UPDATE users
        SET mfa_enabled = 1,
            mfa_reset_required = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(user.id);
      syncRecordToFirestore('users', user.id, {
        mfa_enabled: 1,
        mfa_reset_required: 0,
      }).catch(() => {});
    } catch {
      // Non-fatal
    }

    logMfaAudit({
      userId: user.id,
      eventType: 'MFA_VERIFIED',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'SUCCESS',
      details: 'TOTP verified successfully on untrusted browser. Device is now trusted for 365 days.',
    });

    return res.json({
      success: true,
      isTrusted: true,
      deviceTrusted: true,
      bypassed: false,
      message: 'TOTP validated successfully. This browser is now trusted for 365 days.',
      token: session.token,
      trustToken: session.trustToken,
      trustExpiresAt: session.expiresAt,
      deviceId: session.deviceId,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
        mfaEnabled: true,
        mfaVerified: true,
      },
    });
  } catch (err: any) {
    console.error('[MFA validate-totp error]:', err);
    return res.status(500).json({ error: 'Server error during TOTP validation.' });
  }
};

router.post('/validate-totp', handleValidateTotp);
router.post('/trusted-device/validate-totp', handleValidateTotp);

/**
 * POST /api/auth/mfa/trusted-device/revoke
 * Explicitly revokes trust for the current device and clears the HttpOnly cookie.
 */
router.post('/trusted-device/revoke', optionalAuthenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const rawCookies = (req as any).cookies || {};
    const deviceId =
      (req.body?.deviceId as string)?.trim() ||
      (req.headers['x-device-id'] as string)?.trim() ||
      rawCookies['ca_device_id'];

    const userId = req.user?.id;
    if (userId && deviceId) {
      revokeDeviceTrust(userId, deviceId);
    }

    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('ca_trust_token', '', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });

    return res.json({
      success: true,
      message: 'Device trust has been revoked. HttpOnly credential removed.',
    });
  } catch (err: any) {
    console.error('[MFA trusted-device/revoke error]:', err);
    return res.status(500).json({ error: 'Failed to revoke device trust.' });
  }
});

/**
 * POST /api/auth/mfa/disable
 * Disables TOTP MFA.
 * Allowed ONLY for STUDENT accounts.
 * Strictly FORBIDDEN for INSTITUTE_ADMIN and SUPER_ADMIN.
 */
router.post('/disable', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Strict Role-Based Enforcement: Admins CANNOT disable MFA
    if (req.user.role === 'INSTITUTE_ADMIN' || req.user.role === 'SUPER_ADMIN') {
      logMfaAudit({
        userId: req.user.id,
        eventType: 'MFA_DISALLOWED_DISABLE',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'FAILURE',
        details: 'Administrative account attempted to disable mandatory MFA.',
      });
      return res.status(403).json({
        error: 'Two-Factor Authentication is mandatory for administrative accounts and cannot be disabled.',
        code: 'MFA_MANDATORY_ROLE',
      });
    }

    db.prepare(`
      UPDATE users
      SET mfa_enabled = 0,
          mfa_enrolled_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.user.id);

    // Revoke all trusted devices
    revokeAllDeviceTrust(req.user.id);

    // Clean up authenticators and recovery codes locally and in Firestore
    db.prepare('DELETE FROM mfa_authenticators WHERE user_id = ?').run(req.user.id);
    db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(req.user.id);

    syncRecordToFirestore('users', req.user.id, {
      id: req.user.id,
      mfa_enabled: 0,
      mfa_enrolled_at: null,
      updated_at: new Date().toISOString(),
    }).catch(() => {});

    logMfaAudit({
      userId: req.user.id,
      eventType: 'MFA_DISABLED',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'SUCCESS',
      details: 'Two-Factor Authentication disabled by student.',
    });

    return res.json({
      success: true,
      message: 'Two-Factor Authentication has been disabled for your student account.',
      mfaEnabled: false,
    });
  } catch (err: any) {
    console.error('[MFA disable error]:', err);
    return res.status(500).json({ error: 'Failed to disable MFA. Please try again.' });
  }
});

/**
 * GET /api/auth/mfa/status
 * Returns current user's authoritative MFA status, authenticators count, and recovery code status
 */
router.get('/status', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const clientClaimsFirebaseTotp =
      req.headers['x-firebase-totp-enrolled'] === 'true' ||
      (req.query.firebaseTotpEnrolled as string) === 'true';

    const authMfaStatus = await getAuthoritativeUserMfaStatus(req.user.id, {
      clientClaimsFirebaseTotp,
    });

    const isMandatoryRole = req.user.role === 'INSTITUTE_ADMIN' || req.user.role === 'SUPER_ADMIN';
    const mfaEnabled = authMfaStatus.mfaEnabled;

    const deviceId =
      (req.headers['x-device-id'] as string)?.trim() ||
      (req.query.deviceId as string)?.trim();
    const trustToken =
      (req.headers['x-device-trust-token'] as string)?.trim() ||
      (req as any).cookies?.['ca_trust_token'];

    const deviceIsTrusted = !!(deviceId && trustToken && isDeviceTrusted(req.user.id, deviceId, trustToken));

    const mfaVerified = isMandatoryRole
      ? (mfaEnabled && (!!req.user.mfaVerified || deviceIsTrusted))
      : (!mfaEnabled || !!req.user.mfaVerified);

    const recoveryStatus = mfaEnabled ? getRecoveryCodeStatus(req.user.id) : null;
    const authenticators = mfaEnabled ? listAuthenticators(req.user.id) : [];

    return res.json({
      role: req.user.role,
      mfaMandatory: isMandatoryRole,
      mfaEnabled,
      mfaVerified,
      factorType: mfaEnabled ? 'totp' : null,
      authenticatorsCount: Math.max(authenticators.length, authMfaStatus.authenticatorsCount),
      recoveryCodesRemaining: recoveryStatus?.remaining ?? authMfaStatus.recoveryCodesRemaining,
      recoveryCodesTotal: recoveryStatus?.total ?? (authMfaStatus.recoveryCodesRemaining > 0 ? 10 : 0),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve MFA status.' });
  }
});

export default router;
