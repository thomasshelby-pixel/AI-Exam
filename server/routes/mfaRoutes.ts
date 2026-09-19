import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import {
  authenticateToken,
  optionalAuthenticateToken,
  generateToken,
  generateMfaSessionToken,
  verifyMfaSessionToken,
  AuthRequest,
} from '../auth.js';
import {
  markDeviceAsTrusted,
  isDeviceTrusted,
  revokeDeviceTrust,
  getTrustedDevicesForUser,
} from '../services/trustService.js';
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
  const mfaSessionToken = req.body.mfaSessionToken || (req.query.mfaSessionToken as string);

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

  // Fallback to existing authenticated user (e.g. Student configuring MFA from Profile & Settings)
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

  return { user: null, error: 'Authentication or MFA session token required.' };
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

    // Create authenticated user session
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

    // Create session record in active_sessions
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

    // Set secure cookie
    res.cookie('ca_token', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Mark current device as trusted
    const deviceId =
      (req.body?.deviceId as string)?.trim() ||
      (req.headers['x-device-id'] as string)?.trim() ||
      `dev_${crypto.createHash('md5').update((req.headers['user-agent'] || '') + (req.ip || '')).digest('hex')}`;
    const deviceName = req.body?.deviceName || (req.headers['user-agent'] as string);

    const trust = markDeviceAsTrusted({
      userId: user.id,
      deviceId,
      deviceName,
      userAgent: req.headers['user-agent'] as string,
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
    });

    res.cookie('ca_trust_token', trust.trustToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      token,
      trustToken: trust.trustToken,
      deviceId,
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
 * POST /api/auth/mfa/enroll/verify
 * Finalizes enrollment and activates TOTP MFA for the account.
 */
router.post('/enroll/verify', async (req: Request, res: Response) => {
  try {
    const { user, error } = resolveMfaContext(req);
    if (!user || error) {
      return res.status(401).json({ error: error || 'Unauthorized' });
    }

    // Update user record in SQLite: enable MFA
    db.prepare(`
      UPDATE users
      SET mfa_enabled = 1,
          mfa_enrolled_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(user.id);

    // Generate authenticated token with mfaVerified = true
    const sessionId = `sess_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const token = generateToken(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
      },
      sessionId,
      true
    );

    // Mark current device/session as trusted
    const deviceId =
      (req.body?.deviceId as string)?.trim() ||
      (req.headers['x-device-id'] as string)?.trim() ||
      `dev_${crypto.createHash('md5').update((req.headers['user-agent'] || '') + (req.ip || '')).digest('hex')}`;
    const deviceName = req.body?.deviceName || (req.headers['user-agent'] as string);

    const trust = markDeviceAsTrusted({
      userId: user.id,
      deviceId,
      deviceName,
      userAgent: req.headers['user-agent'] as string,
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
    });

    res.cookie('ca_token', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.cookie('ca_trust_token', trust.trustToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      token,
      trustToken: trust.trustToken,
      deviceId,
      deviceTrusted: true,
      message: 'Two-Factor Authentication enabled successfully.',
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

    const sessionId = `sess_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const token = generateToken(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
      },
      sessionId,
      true
    );

    const deviceId =
      (req.body?.deviceId as string)?.trim() ||
      (req.headers['x-device-id'] as string)?.trim() ||
      `dev_${crypto.createHash('md5').update((req.headers['user-agent'] || '') + (req.ip || '')).digest('hex')}`;
    const deviceName = req.body?.deviceName || (req.headers['user-agent'] as string);

    const trust = markDeviceAsTrusted({
      userId: user.id,
      deviceId,
      deviceName,
      userAgent: req.headers['user-agent'] as string,
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
    });

    res.cookie('ca_token', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.cookie('ca_trust_token', trust.trustToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      token,
      trustToken: trust.trustToken,
      deviceId,
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
 * Returns current user's MFA status
 */
router.get('/status', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const dbUser = db.prepare(
      'SELECT mfa_enabled, role FROM users WHERE id = ?'
    ).get(req.user.id) as { mfa_enabled: number; role: UserRole } | undefined;

    const isMandatoryRole = req.user.role === 'INSTITUTE_ADMIN' || req.user.role === 'SUPER_ADMIN';
    const mfaEnabled = Boolean(dbUser?.mfa_enabled);

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

    return res.json({
      role: req.user.role,
      mfaMandatory: isMandatoryRole,
      mfaEnabled,
      mfaVerified,
      factorType: mfaEnabled ? 'totp' : null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve MFA status.' });
  }
});

export default router;
