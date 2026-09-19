import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import {
  authenticateToken,
  generateToken,
  generateMfaSessionToken,
  verifyMfaSessionToken,
  AuthRequest,
} from '../auth.js';
import {
  normalizePhoneNumber,
  maskPhoneNumber,
  isValidPhoneNumber,
  generateOtpCode,
  hashOtpCode,
  sendSmsOtp,
} from '../services/smsService.js';
import { UserRole } from '../../src/types/index.js';

const router = Router();

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
    mfa_phone: string | null;
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
      'SELECT id, email, role, full_name, mfa_enabled, mfa_phone FROM users WHERE id = ?'
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
      'SELECT id, email, role, full_name, mfa_enabled, mfa_phone FROM users WHERE id = ?'
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
 * Dispatches an SMS verification OTP to the user's enrolled phone number.
 */
router.post('/send-challenge', async (req: Request, res: Response) => {
  try {
    const { user, error } = resolveMfaContext(req);
    if (!user || error) {
      return res.status(401).json({ error: error || 'Unauthorized' });
    }

    if (!user.mfa_enabled || !user.mfa_phone) {
      return res.status(400).json({
        error: 'No verified phone number is enrolled for this account. Please enroll phone first.',
        code: 'ENROLLMENT_REQUIRED',
      });
    }

    const normalizedPhone = normalizePhoneNumber(user.mfa_phone);
    const otp = generateOtpCode();
    const otpHash = hashOtpCode(otp);
    const verifId = `mfa_v_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    // Store in database
    db.prepare(`
      INSERT INTO mfa_verifications (id, user_id, phone_number, otp_code_hash, purpose, expires_at)
      VALUES (?, ?, ?, ?, 'LOGIN_CHALLENGE', ?)
    `).run(verifId, user.id, normalizedPhone, otpHash, expiresAt);

    // Send SMS
    const dispatch = await sendSmsOtp(normalizedPhone, otp, 'LOGIN_CHALLENGE');

    return res.json({
      success: true,
      maskedPhone: dispatch.maskedPhone,
      message: `Verification code sent to ${dispatch.maskedPhone}.`,
      expiresInSeconds: 300,
      devOtp: dispatch.devOtp, // Only in dev for test harness
    });
  } catch (err: any) {
    console.error('[MFA send-challenge error]:', err);
    return res.status(500).json({ error: 'Failed to send SMS verification code. Please try again.' });
  }
});

/**
 * POST /api/auth/mfa/verify-challenge
 * Verifies SMS OTP and issues a complete authenticated session.
 */
router.post('/verify-challenge', async (req: Request, res: Response) => {
  try {
    const { otpCode } = req.body;
    if (!otpCode || typeof otpCode !== 'string') {
      return res.status(400).json({ error: 'Please enter the 6-digit verification code.' });
    }

    const { user, error } = resolveMfaContext(req);
    if (!user || error) {
      return res.status(401).json({ error: error || 'Unauthorized' });
    }

    // Lookup latest pending verification
    const verif = db.prepare(`
      SELECT id, otp_code_hash, expires_at, attempts, max_attempts
      FROM mfa_verifications
      WHERE user_id = ? AND purpose = 'LOGIN_CHALLENGE' AND verified = 0
      ORDER BY created_at DESC
      LIMIT 1
    `).get(user.id) as {
      id: string;
      otp_code_hash: string;
      expires_at: string;
      attempts: number;
      max_attempts: number;
    } | undefined;

    if (!verif) {
      return res.status(400).json({ error: 'No active verification code found. Please request a new code.' });
    }

    if (new Date(verif.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
    }

    if (verif.attempts >= verif.max_attempts) {
      return res.status(400).json({ error: 'Maximum attempts exceeded. Please request a new code.' });
    }

    const cleanInputOtp = otpCode.trim();
    const providedHash = hashOtpCode(cleanInputOtp);

    if (providedHash !== verif.otp_code_hash) {
      db.prepare('UPDATE mfa_verifications SET attempts = attempts + 1 WHERE id = ?').run(verif.id);
      const remaining = verif.max_attempts - (verif.attempts + 1);
      return res.status(400).json({
        error: `Invalid verification code. ${remaining > 0 ? `${remaining} attempts remaining.` : 'Please request a new code.'}`,
      });
    }

    // Mark verified
    db.prepare('UPDATE mfa_verifications SET verified = 1 WHERE id = ?').run(verif.id);

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

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
        mfaEnabled: true,
        mfaVerified: true,
        mfaPhone: maskPhoneNumber(user.mfa_phone || ''),
      },
    });
  } catch (err: any) {
    console.error('[MFA verify-challenge error]:', err);
    return res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

/**
 * POST /api/auth/mfa/enroll/send-code
 * Sends OTP to a new phone number to start MFA enrollment.
 */
router.post('/enroll/send-code', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({ error: 'Please provide a valid mobile phone number.' });
    }

    const normalizedPhone = normalizePhoneNumber(phone);
    if (!isValidPhoneNumber(normalizedPhone)) {
      return res.status(400).json({
        error: 'Please enter a valid mobile number with country code (e.g., +91 9876543210).',
      });
    }

    const { user, error } = resolveMfaContext(req);
    if (!user || error) {
      return res.status(401).json({ error: error || 'Unauthorized' });
    }

    const otp = generateOtpCode();
    const otpHash = hashOtpCode(otp);
    const verifId = `mfa_e_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO mfa_verifications (id, user_id, phone_number, otp_code_hash, purpose, expires_at)
      VALUES (?, ?, ?, ?, 'ENROLLMENT', ?)
    `).run(verifId, user.id, normalizedPhone, otpHash, expiresAt);

    const dispatch = await sendSmsOtp(normalizedPhone, otp, 'ENROLLMENT');

    return res.json({
      success: true,
      maskedPhone: dispatch.maskedPhone,
      message: `Verification code sent to ${dispatch.maskedPhone}.`,
      expiresInSeconds: 300,
      devOtp: dispatch.devOtp,
    });
  } catch (err: any) {
    console.error('[MFA enroll/send-code error]:', err);
    return res.status(500).json({ error: 'Failed to send verification code. Please try again.' });
  }
});

/**
 * POST /api/auth/mfa/enroll/verify
 * Verifies enrollment OTP and activates MFA for the account.
 */
router.post('/enroll/verify', async (req: Request, res: Response) => {
  try {
    const { phone, otpCode } = req.body;
    if (!phone || !otpCode) {
      return res.status(400).json({ error: 'Phone number and verification code are required.' });
    }

    const normalizedPhone = normalizePhoneNumber(phone);
    const { user, error } = resolveMfaContext(req);
    if (!user || error) {
      return res.status(401).json({ error: error || 'Unauthorized' });
    }

    const verif = db.prepare(`
      SELECT id, otp_code_hash, expires_at, attempts, max_attempts
      FROM mfa_verifications
      WHERE user_id = ? AND phone_number = ? AND purpose = 'ENROLLMENT' AND verified = 0
      ORDER BY created_at DESC
      LIMIT 1
    `).get(user.id, normalizedPhone) as {
      id: string;
      otp_code_hash: string;
      expires_at: string;
      attempts: number;
      max_attempts: number;
    } | undefined;

    if (!verif) {
      return res.status(400).json({ error: 'No active enrollment verification found. Please request a new code.' });
    }

    if (new Date(verif.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
    }

    if (verif.attempts >= verif.max_attempts) {
      return res.status(400).json({ error: 'Maximum attempts exceeded. Please request a new code.' });
    }

    const cleanInputOtp = otpCode.trim();
    const providedHash = hashOtpCode(cleanInputOtp);

    if (providedHash !== verif.otp_code_hash) {
      db.prepare('UPDATE mfa_verifications SET attempts = attempts + 1 WHERE id = ?').run(verif.id);
      const remaining = verif.max_attempts - (verif.attempts + 1);
      return res.status(400).json({
        error: `Invalid verification code. ${remaining > 0 ? `${remaining} attempts remaining.` : 'Please request a new code.'}`,
      });
    }

    // Mark verified
    db.prepare('UPDATE mfa_verifications SET verified = 1 WHERE id = ?').run(verif.id);

    // Update user record: enable MFA
    db.prepare(`
      UPDATE users
      SET mfa_enabled = 1,
          mfa_phone = ?,
          mfa_enrolled_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(normalizedPhone, user.id);

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

    res.cookie('ca_token', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      token,
      message: 'Multi-Factor Authentication successfully configured.',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
        mfaEnabled: true,
        mfaVerified: true,
        mfaPhone: maskPhoneNumber(normalizedPhone),
      },
    });
  } catch (err: any) {
    console.error('[MFA enroll/verify error]:', err);
    return res.status(500).json({ error: 'Enrollment verification failed. Please try again.' });
  }
});

/**
 * POST /api/auth/mfa/disable
 * Disables SMS MFA.
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
        error: 'SMS Multi-Factor Authentication is mandatory for administrative accounts and cannot be disabled.',
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
      message: 'Multi-Factor Authentication has been disabled for your student account.',
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
      'SELECT mfa_enabled, mfa_phone, role FROM users WHERE id = ?'
    ).get(req.user.id) as { mfa_enabled: number; mfa_phone: string | null; role: UserRole } | undefined;

    const isMandatoryRole = req.user.role === 'INSTITUTE_ADMIN' || req.user.role === 'SUPER_ADMIN';

    return res.json({
      role: req.user.role,
      mfaMandatory: isMandatoryRole,
      mfaEnabled: Boolean(dbUser?.mfa_enabled),
      mfaVerified: req.user.mfaVerified ?? false,
      maskedPhone: dbUser?.mfa_phone ? maskPhoneNumber(dbUser.mfa_phone) : null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve MFA status.' });
  }
});

export default router;
