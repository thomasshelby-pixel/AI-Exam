import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db, hashPassword, verifyPassword } from '../db.js';
import { generateToken, authenticateToken, authenticateRevocationToken, optionalAuthenticateToken, AuthRequest, checkPermanentFreeAccess } from '../auth.js';
import { isDeviceLimitExceeded, createOrRefreshDeviceSession, revokeDeviceSession, revokeAllSessionsForUser, getSafeDeviceName, getActiveDeviceCount, MAX_STUDENT_DEVICES } from '../services/sessionService.js';
import { UserRole } from '../../src/types/index.js';

const router = Router();

// Helper: Automatically link pending institute invitations when user registers or signs in
function syncPendingInstituteEnrollments(userId: string, email: string) {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const pendingInvites = db.prepare(`
      SELECT id, institute_id, batch_id 
      FROM institute_memberships 
      WHERE lower(invited_email) = ? AND (student_id IS NULL OR status = 'PENDING')
    `).all(normalizedEmail) as Array<{ id: string; institute_id: string; batch_id: string | null }>;

    for (const invite of pendingInvites) {
      db.prepare(`
        UPDATE institute_memberships 
        SET student_id = ?, status = 'ACTIVE' 
        WHERE id = ?
      `).run(userId, invite.id);

      db.prepare(`
        UPDATE student_profiles 
        SET institute_id = ?, batch_id = COALESCE(?, batch_id) 
        WHERE user_id = ?
      `).run(invite.institute_id, invite.batch_id, userId);

      const inst = db.prepare('SELECT name FROM institutes WHERE id = ?').get(invite.institute_id) as { name: string } | undefined;
      const instituteName = inst?.name || 'Your Coaching Institute';

      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type)
        VALUES (?, ?, 'Institute Sponsorship Activated', ?, 'INSTITUTE')
      `).run(
        `notif_${crypto.randomBytes(8).toString('hex')}`,
        userId,
        `You have been enrolled under ${instituteName}. All your exam evaluations are 100% sponsored.`
      );
    }
  } catch (err) {
    console.warn('syncPendingInstituteEnrollments error:', err);
  }
}

// Student Registration
router.post('/register', (req: Request, res: Response) => {
  try {
    const { email, password, fullName, phone, icaiRegistrationNumber, caLevel } = req.body;

    if (!email || !password || !fullName || !icaiRegistrationNumber) {
      return res.status(400).json({ error: 'Please provide all required fields (Name, Email, Password, ICAI Registration Number).' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check existing email
    const existing = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(normalizedEmail);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email address already exists. Please sign in.' });
    }

    // Optional referral / promo code validation
    const rawReferralCode = typeof req.body.referralCode === 'string' ? req.body.referralCode.trim().toUpperCase() : '';
    let promoCampaign: any = null;

    if (rawReferralCode) {
      promoCampaign = db.prepare(`
        SELECT * FROM referral_campaigns WHERE UPPER(code) = UPPER(?)
      `).get(rawReferralCode) as any;

      if (!promoCampaign) {
        return res.status(400).json({
          error: `Invalid promo code "${rawReferralCode}". Please verify your code, or leave the referral code field blank to proceed with standard registration.`,
        });
      }

      if (!promoCampaign.is_active || promoCampaign.status === 'DISABLED' || promoCampaign.status === 'ARCHIVED') {
        return res.status(400).json({
          error: `Promo code "${rawReferralCode}" is currently inactive or disabled.`,
        });
      }

      const now = new Date();
      if (promoCampaign.start_date && new Date(promoCampaign.start_date) > now) {
        return res.status(400).json({
          error: `Promo code "${rawReferralCode}" is not active yet (starts on ${new Date(promoCampaign.start_date).toLocaleDateString('en-IN')}).`,
        });
      }
      if (promoCampaign.end_date && new Date(promoCampaign.end_date) < now) {
        return res.status(400).json({
          error: `Promo code "${rawReferralCode}" has expired (ended on ${new Date(promoCampaign.end_date).toLocaleDateString('en-IN')}).`,
        });
      }

      const countRow = db.prepare(`
        SELECT COUNT(*) as total
        FROM referral_redemptions r
        LEFT JOIN users u ON u.id = r.user_id
        WHERE UPPER(r.referral_code) = UPPER(?)
          AND (u.account_classification IS NULL OR u.account_classification != 'TEST')
      `).get(rawReferralCode) as { total: number };

      const maxRedemptions = promoCampaign.max_redemptions ?? 20;
      if (countRow.total >= maxRedemptions) {
        // Automatically reflect EXHAUSTED status
        db.prepare(`UPDATE referral_campaigns SET status = 'EXHAUSTED' WHERE UPPER(code) = UPPER(?)`).run(rawReferralCode);
        return res.status(400).json({
          error: `This promo offer has ended. The maximum limit of ${maxRedemptions} redemptions has already been claimed.`,
        });
      }
    }

    const userId = `usr_${crypto.randomBytes(8).toString('hex')}`;
    const passwordHash = hashPassword(password);
    const role: UserRole = 'STUDENT';

    // Begin immediate transaction to prevent concurrent race conditions
    db.exec('BEGIN IMMEDIATE');
    let promoRedemptionNumber = 0;
    let promoExpiryDate: string = '';
    let promoMaxEvals = 15;
    let promoMaxRedemptions = 20;

    try {
      if (promoCampaign) {
        // Re-check redemption limit inside transaction write lock (excluding TEST accounts)
        const lockedCount = db.prepare(`
          SELECT COUNT(*) as total
          FROM referral_redemptions r
          LEFT JOIN users u ON u.id = r.user_id
          WHERE UPPER(r.referral_code) = UPPER(?)
            AND (u.account_classification IS NULL OR u.account_classification != 'TEST')
        `).get(rawReferralCode) as { total: number };

        promoMaxRedemptions = promoCampaign.max_redemptions ?? 20;
        if (lockedCount.total >= promoMaxRedemptions) {
          db.exec('ROLLBACK');
          db.prepare(`UPDATE referral_campaigns SET status = 'EXHAUSTED' WHERE UPPER(code) = UPPER(?)`).run(rawReferralCode);
          return res.status(400).json({
            error: `This promo offer has reached its maximum limit of ${promoMaxRedemptions} redemptions.`,
          });
        }

        promoRedemptionNumber = lockedCount.total + 1;
        promoMaxEvals = promoCampaign.max_evaluations ?? 15;
        const durationDays = promoCampaign.benefit_duration_days ?? 30;
        promoExpiryDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
      }

      // Insert user
      db.prepare(`
        INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
        VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
      `).run(userId, normalizedEmail, passwordHash, fullName.trim(), phone?.trim() || null, role);

      // Insert student profile (default 0 used, 0 purchased, First 2 free)
      db.prepare(`
        INSERT INTO student_profiles (user_id, icai_registration_number, ca_level, free_evaluations_used, purchased_credits)
        VALUES (?, ?, ?, 0, 0)
      `).run(userId, icaiRegistrationNumber.trim().toUpperCase(), caLevel || 'INTERMEDIATE');

      // If referral / promo code was applied, insert redemption record transactionally
      if (promoCampaign) {
        const redemptionId = `red_${crypto.randomBytes(8).toString('hex')}`;

        db.prepare(`
          INSERT INTO referral_redemptions (
            id, referral_code, user_id, user_email, benefit_type,
            redemption_number, expiry_date, status,
            max_evaluations, evaluations_used, evaluations_remaining, audit_note
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, 0, ?, ?)
        `).run(
          redemptionId,
          rawReferralCode,
          userId,
          normalizedEmail,
          promoCampaign.benefit_type || '1_MONTH_FREE_ACCESS',
          promoRedemptionNumber,
          promoExpiryDate,
          promoMaxEvals,
          promoMaxEvals,
          `Redemption #${promoRedemptionNumber} of ${promoMaxRedemptions} claimed on registration by ${normalizedEmail}`
        );

        // If this redemption reached max quota, update status to EXHAUSTED
        if (promoRedemptionNumber >= promoMaxRedemptions) {
          db.prepare(`UPDATE referral_campaigns SET status = 'EXHAUSTED' WHERE UPPER(code) = UPPER(?)`).run(rawReferralCode);
        }
      }

      db.exec('COMMIT');
    } catch (txErr: any) {
      db.exec('ROLLBACK');
      console.error('Registration transaction error:', txErr);
      return res.status(500).json({ error: 'Failed to complete student registration. Please try again.' });
    }

    // Post-commit notifications and audit logging
    if (promoCampaign) {
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type)
        VALUES (?, ?, ?, ?, 'SYSTEM')
      `).run(
        `notif_${crypto.randomBytes(8).toString('hex')}`,
        userId,
        `${rawReferralCode} Activated Successfully!`,
        `Congratulations! You have unlocked ${promoCampaign.benefit_duration_days || 30} days of promotional access with ${promoMaxEvals} free evaluations (valid until ${new Date(promoExpiryDate).toLocaleDateString('en-IN')}). You claimed redemption #${promoRedemptionNumber} of ${promoMaxRedemptions}.`
      );

      // Promo redemption audit log
      db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
        VALUES (?, ?, 'PROMO_CODE_REDEMPTION', 'PROMO_CODE', ?, ?)
      `).run(
        `aud_${crypto.randomBytes(8).toString('hex')}`,
        userId,
        rawReferralCode,
        JSON.stringify({
          studentId: userId,
          studentEmail: normalizedEmail,
          redemptionNumber: promoRedemptionNumber,
          maxRedemptions: promoMaxRedemptions,
          evaluationsGranted: promoMaxEvals,
          expiryDate: promoExpiryDate,
          source: 'REGISTRATION',
        })
      );
    }

    // Auto-link any pending coaching institute enrollment for this email
    syncPendingInstituteEnrollments(userId, normalizedEmail);

    // Welcome Notification
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type)
      VALUES (?, ?, 'Welcome to CA Exam Checker AI', 'Your account has been created. You receive 2 free full-paper evaluations!', 'SYSTEM')
    `).run(`notif_${crypto.randomBytes(8).toString('hex')}`, userId);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'STUDENT_SIGNUP', 'USER', ?, ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      userId,
      userId,
      promoCampaign ? `New student account registered with promo code ${rawReferralCode}` : 'New student account registered'
    );

    const token = generateToken({ id: userId, email: normalizedEmail, role, fullName: fullName.trim() });
    const isPermanentFree = checkPermanentFreeAccess(normalizedEmail);

    res.setHeader('Set-Cookie', `ca_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);

    return res.status(201).json({
      token,
      user: {
        id: userId,
        email: normalizedEmail,
        fullName: fullName.trim(),
        role,
        hasPermanentFreeAccess: isPermanentFree,
      },
      promoApplied: !!promoCampaign,
      promoDetails: promoCampaign ? {
        code: rawReferralCode,
        evaluations: promoCampaign.max_evaluations ?? 15,
        redemptionNumber: promoRedemptionNumber,
      } : undefined,
    });
  } catch (error: unknown) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// Normal Professional SaaS Login (Server-Side RBAC)
router.post('/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = db.prepare(`
      SELECT id, email, password_hash, full_name, role, status FROM users WHERE lower(email) = ?
    `).get(normalizedEmail) as {
      id: string;
      email: string;
      password_hash: string;
      full_name: string;
      role: UserRole;
      status: string;
    } | undefined;

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Account Status Enforcement: SUSPENDED, DISABLED, DELETED
    if (user.status === 'SUSPENDED') {
      const suspension = db.prepare(`
        SELECT reason, internal_note, created_at FROM account_suspensions
        WHERE user_id = ? AND status = 'SUSPENDED'
        ORDER BY created_at DESC LIMIT 1
      `).get(user.id) as { reason: string; created_at: string } | undefined;

      const reason = suspension?.reason || 'Account access suspended by the administrator for policy verification.';
      const suspendedAt = suspension?.created_at || new Date().toISOString();

      // Revocation Token allowing the user to submit an appeal
      const revocationToken = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
      });

      return res.status(403).json({
        error: 'Your account has been suspended by the administrator.',
        status: 'SUSPENDED',
        code: 'ACCOUNT_SUSPENDED',
        suspensionReason: reason,
        canRequestRevocation: true,
        user: {
          id: user.id,
          name: user.full_name,
          email: user.email,
        },
        suspension: {
          reason,
          suspendedAt,
          userId: user.id,
          name: user.full_name,
          email: user.email,
          revocationToken,
        },
      });
    }

    if (user.status === 'DISABLED' || user.status === 'DELETED') {
      return res.status(403).json({
        error: 'Your account has been deactivated. Please contact support.',
        status: user.status,
      });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        error: 'Your account is currently inactive. Please contact support.',
        status: user.status,
      });
    }

    if (user.role === 'STUDENT') {
      syncPendingInstituteEnrollments(user.id, user.email);
    }

    // 2-Device Limit Enforcement for Student Accounts (Permanent-free accounts are exempt)
    let sessionId: string | undefined;
    if (user.role === 'STUDENT') {
      const deviceId =
        (req.body?.deviceId as string)?.trim() ||
        (req.headers['x-device-id'] as string)?.trim() ||
        `dev_${crypto.createHash('md5').update((req.headers['user-agent'] || '') + (req.ip || '')).digest('hex')}`;
      const deviceName = req.body?.deviceName || getSafeDeviceName(req.headers['user-agent']);
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || undefined;

      const limitCheck = isDeviceLimitExceeded(user.id, user.email, deviceId);
      if (limitCheck.exceeded) {
        return res.status(403).json({
          error: `Maximum device limit reached (${limitCheck.activeDeviceCount}/${limitCheck.maxDevicesAllowed}). Your student account is already active on 2 devices. Please log out from one of your existing devices before logging in on a new device.`,
          code: 'DEVICE_LIMIT_EXCEEDED',
          activeDeviceCount: limitCheck.activeDeviceCount,
          maxDevicesAllowed: limitCheck.maxDevicesAllowed,
        });
      }

      const session = createOrRefreshDeviceSession({
        userId: user.id,
        deviceId,
        deviceName,
        ipAddress,
      });
      sessionId = session.sessionId;
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
    }, sessionId);

    const isPermanentFree = checkPermanentFreeAccess(user.email);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'USER_LOGIN', 'USER', ?, 'User successfully logged in')
    `).run(`log_${crypto.randomBytes(8).toString('hex')}`, user.id, user.id);

    res.setHeader('Set-Cookie', `ca_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        status: user.status,
        hasPermanentFreeAccess: isPermanentFree,
      },
    });
  } catch (error: unknown) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// GOOGLE SIGN-IN DISABLED: Google authentication flow has been completely discontinued.
// Production authentication enforces standard Email, Password, Forgot Password, and Registration.
router.post('/google', (_req: Request, res: Response) => {
  return res.status(403).json({
    error: 'Google Sign-In is disabled. Please sign in or register with your email and password.',
    code: 'GOOGLE_AUTH_DISABLED',
  });
});

/* DISABLED GOOGLE AUTH IMPLEMENTATION
router.post('/google_disabled', async (req: Request, res: Response) => {
  try {
    const { credential, email: clientEmail, fullName: clientName } = req.body;

    const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;

    // Check if Google OAuth is configured
    if (!googleClientId && !credential) {
      return res.status(400).json({
        error: 'NOT CONFIGURED: Google OAuth Client ID is not configured on the server. Please set GOOGLE_CLIENT_ID in Settings > Secrets.',
        code: 'NOT_CONFIGURED',
      });
    }

    let verifiedEmail = '';
    let verifiedName = 'CA Candidate';

    if (credential) {
      // Decode JWT token from Google
      try {
        const parts = credential.split('.');
        if (parts.length === 3) {
          const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8');
          const payload = JSON.parse(payloadJson);
          if (payload.email) {
            verifiedEmail = payload.email.toLowerCase().trim();
            verifiedName = payload.name || payload.given_name || clientName || 'CA Candidate';
          }
        }
      } catch (err) {
        console.warn('Google credential decode error:', err);
      }
    }

    if (!verifiedEmail && clientEmail) {
      if (!googleClientId) {
        return res.status(400).json({
          error: 'NOT CONFIGURED: Google OAuth Client ID is not configured on the server. Please set GOOGLE_CLIENT_ID in Settings > Secrets.',
          code: 'NOT_CONFIGURED',
        });
      }
      verifiedEmail = clientEmail.toLowerCase().trim();
      verifiedName = clientName || 'CA Candidate';
    }

    if (!verifiedEmail) {
      return res.status(400).json({
        error: 'Invalid Google authentication credential. Could not verify email address.',
      });
    }

    // Check if user already exists in database
    let user = db.prepare(`
      SELECT id, email, full_name, role, status FROM users WHERE lower(email) = ?
    `).get(verifiedEmail) as {
      id: string;
      email: string;
      full_name: string;
      role: UserRole;
      status: string;
    } | undefined;

    if (user) {
      // Enforce account status for existing user
      if (user.status === 'SUSPENDED') {
        const suspension = db.prepare(`
          SELECT reason, internal_note, created_at FROM account_suspensions
          WHERE user_id = ? AND status = 'SUSPENDED'
          ORDER BY created_at DESC LIMIT 1
        `).get(user.id) as { reason: string; created_at: string } | undefined;

        const reason = suspension?.reason || 'Account access suspended by the administrator for policy verification.';
        const suspendedAt = suspension?.created_at || new Date().toISOString();

        const revocationToken = generateToken({
          id: user.id,
          email: user.email,
          role: user.role,
          fullName: user.full_name,
        });

        return res.status(403).json({
          error: 'Your account has been suspended by the administrator.',
          status: 'SUSPENDED',
          code: 'ACCOUNT_SUSPENDED',
          suspensionReason: reason,
          canRequestRevocation: true,
          user: {
            id: user.id,
            name: user.full_name,
            email: user.email,
          },
          suspension: {
            reason,
            suspendedAt,
            userId: user.id,
            name: user.full_name,
            email: user.email,
            revocationToken,
          },
        });
      }

      if (user.status === 'DISABLED' || user.status === 'DELETED') {
        return res.status(403).json({
          error: 'Your account has been deactivated. Please contact support.',
          status: user.status,
        });
      }

      if (user.role === 'STUDENT') {
        syncPendingInstituteEnrollments(user.id, user.email);
      }
    } else {
      // New user via Google Sign-In
      // MANDATORY SECURITY RULE: Google Sign-In must NOT create Admin or Institute Admin accounts automatically.
      // Normal Google registration MUST create a STUDENT.
      const userId = `usr_${crypto.randomBytes(8).toString('hex')}`;
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = hashPassword(randomPassword);
      const role: UserRole = 'STUDENT';

      db.prepare(`
        INSERT INTO users (id, email, password_hash, full_name, role, status)
        VALUES (?, ?, ?, ?, 'STUDENT', 'ACTIVE')
      `).run(userId, verifiedEmail, passwordHash, verifiedName);

      // Create student profile with default free credits
      db.prepare(`
        INSERT INTO student_profiles (user_id, icai_registration_number, ca_level, free_evaluations_used, purchased_credits)
        VALUES (?, 'NEW_STUDENT', 'INTERMEDIATE', 0, 0)
      `).run(userId);

      // Automatically link any pending coaching institute enrollment for this email
      syncPendingInstituteEnrollments(userId, verifiedEmail);

      // Welcome Notification
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type)
        VALUES (?, ?, 'Welcome to CA Exam Checker AI', 'Your Google account has been linked. You receive 2 free full-paper evaluations!', 'SYSTEM')
      `).run(`notif_${crypto.randomBytes(8).toString('hex')}`, userId);

      // Audit log
      db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
        VALUES (?, ?, 'GOOGLE_SIGNUP', 'USER', ?, 'New student account created via Google OAuth')
      `).run(`log_${crypto.randomBytes(8).toString('hex')}`, userId, userId);

      user = {
        id: userId,
        email: verifiedEmail,
        full_name: verifiedName,
        role,
        status: 'ACTIVE',
      };
    }

    // 2-Device Limit Enforcement for Student Accounts (Permanent-free accounts are exempt)
    let sessionId: string | undefined;
    if (user.role === 'STUDENT') {
      const deviceId =
        (req.body?.deviceId as string)?.trim() ||
        (req.headers['x-device-id'] as string)?.trim() ||
        `dev_${crypto.createHash('md5').update((req.headers['user-agent'] || '') + (req.ip || '')).digest('hex')}`;
      const deviceName = req.body?.deviceName || getSafeDeviceName(req.headers['user-agent']);
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || undefined;

      const limitCheck = isDeviceLimitExceeded(user.id, user.email, deviceId);
      if (limitCheck.exceeded) {
        return res.status(403).json({
          error: `Maximum device limit reached (${limitCheck.activeDeviceCount}/${limitCheck.maxDevicesAllowed}). Your student account is already active on 2 devices. Please log out from one of your existing devices before logging in on a new device.`,
          code: 'DEVICE_LIMIT_EXCEEDED',
          activeDeviceCount: limitCheck.activeDeviceCount,
          maxDevicesAllowed: limitCheck.maxDevicesAllowed,
        });
      }

      const session = createOrRefreshDeviceSession({
        userId: user.id,
        deviceId,
        deviceName,
        ipAddress,
      });
      sessionId = session.sessionId;
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
    }, sessionId);

    const isPermanentFree = checkPermanentFreeAccess(user.email);

    res.setHeader('Set-Cookie', `ca_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        status: user.status,
        hasPermanentFreeAccess: isPermanentFree,
      },
    });
  } catch (error: unknown) {
    console.error('Google Auth error:', error);
    return res.status(500).json({ error: 'Google authentication failed. Please try again.' });
  }
});
*/

// SEPARATE INSTITUTE REGISTRATION FLOW
router.post('/institute/register', (req: Request, res: Response) => {
  try {
    const { instituteName, contactPerson, email, password, phone, address, website } = req.body;

    if (!instituteName || !contactPerson || !email || !password || !phone) {
      return res.status(400).json({
        error: 'Please provide all required fields (Institute Name, Contact Person, Email, Password, Phone).',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user or institute already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(normalizedEmail);
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email address already exists. Please sign in.' });
    }

    const instituteId = `inst_${crypto.randomBytes(8).toString('hex')}`;
    const codePrefix = instituteName.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'INST';
    const instituteCode = `${codePrefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // Create institute record
    db.prepare(`
      INSERT INTO institutes (
        id, name, code, logo_url, email, phone, address, website,
        contact_person, status, subscription_plan, max_students
      ) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, 'ACTIVE', 'PENDING_SELECTION', 50)
    `).run(
      instituteId,
      instituteName.trim(),
      instituteCode,
      normalizedEmail,
      phone.trim(),
      address?.trim() || null,
      website?.trim() || null,
      contactPerson.trim()
    );

    // Create default initial batch for the institute
    const batchId = `batch_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO batches (id, institute_id, name, course_level, description)
      VALUES (?, ?, 'First Batch - Foundation & Inter', 'INTERMEDIATE', 'Primary batch for enrolled CA students')
    `).run(batchId, instituteId);

    // Create INSTITUTE_ADMIN user
    const userId = `usr_${crypto.randomBytes(8).toString('hex')}`;
    const passwordHash = hashPassword(password);
    const role: UserRole = 'INSTITUTE_ADMIN';

    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
    `).run(userId, normalizedEmail, passwordHash, contactPerson.trim(), phone.trim(), role);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'INSTITUTE_SIGNUP', 'INSTITUTE', ?, ?)
    `).run(`log_${crypto.randomBytes(8).toString('hex')}`, userId, instituteId, `Registered institute ${instituteName}`);

    const token = generateToken({
      id: userId,
      email: normalizedEmail,
      role,
      fullName: contactPerson.trim(),
    });

    res.setHeader('Set-Cookie', `ca_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);

    return res.status(201).json({
      token,
      user: {
        id: userId,
        email: normalizedEmail,
        fullName: contactPerson.trim(),
        role,
        status: 'ACTIVE',
      },
      institute: {
        id: instituteId,
        name: instituteName.trim(),
        code: instituteCode,
        status: 'ACTIVE',
      },
    });
  } catch (error: unknown) {
    console.error('Institute Register error:', error);
    return res.status(500).json({ error: 'Institute registration failed. Please try again.' });
  }
});

// SEPARATE INSTITUTE LOGIN FLOW
router.post('/institute/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = db.prepare(`
      SELECT id, email, password_hash, full_name, role, status FROM users WHERE lower(email) = ?
    `).get(normalizedEmail) as {
      id: string;
      email: string;
      password_hash: string;
      full_name: string;
      role: UserRole;
      status: string;
    } | undefined;

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid institute email or password.' });
    }

    // Role verification: Must be INSTITUTE_ADMIN or SUPER_ADMIN
    if (user.role !== 'INSTITUTE_ADMIN' && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Access denied. This portal is reserved for registered Coaching Institutes. Students should use the Student Login portal.',
      });
    }

    if (user.status === 'SUSPENDED') {
      const suspension = db.prepare(`
        SELECT reason, internal_note, created_at FROM account_suspensions
        WHERE user_id = ? AND status = 'SUSPENDED'
        ORDER BY created_at DESC LIMIT 1
      `).get(user.id) as { reason: string; created_at: string } | undefined;

      return res.status(403).json({
        error: 'Your institute administrator account has been suspended.',
        status: 'SUSPENDED',
        suspension: {
          reason: suspension?.reason || 'Account suspended by administrator.',
          suspendedAt: suspension?.created_at || new Date().toISOString(),
        },
      });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        error: 'Your institute account is inactive. Please contact support.',
        status: user.status,
      });
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
    });

    res.setHeader('Set-Cookie', `ca_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error: unknown) {
    console.error('Institute login error:', error);
    return res.status(500).json({ error: 'Institute login failed. Please try again.' });
  }
});

// REVOCATION STATUS & APPEAL SUBMISSION
router.get('/revocation-status', authenticateRevocationToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = db.prepare('SELECT id, email, full_name, status FROM users WHERE id = ?').get(userId) as {
      id: string;
      email: string;
      full_name: string;
      status: string;
    } | undefined;

    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }

    const suspension = db.prepare(`
      SELECT id, reason, internal_note, suspended_by, status, created_at
      FROM account_suspensions
      WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(userId);

    const latestRequest = db.prepare(`
      SELECT id, appeal_reason, explanation, supporting_info, status, admin_reply, reviewed_at, created_at
      FROM revocation_requests
      WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(userId);

    return res.json({
      accountStatus: user.status,
      suspension: suspension || null,
      latestRequest: latestRequest || null,
    });
  } catch (error: unknown) {
    console.error('Get revocation status error:', error);
    return res.status(500).json({ error: 'Failed to retrieve revocation status' });
  }
});

router.post('/revocation-request', authenticateRevocationToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { appealReason, explanation, supportingInfo } = req.body;

    if (!appealReason || !explanation) {
      return res.status(400).json({
        error: 'Please provide both an appeal reason and a detailed explanation.',
      });
    }

    const user = db.prepare('SELECT id, email, full_name, status FROM users WHERE id = ?').get(userId) as {
      id: string;
      email: string;
      full_name: string;
      status: string;
    } | undefined;

    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }

    // Check existing pending request
    const existingPending = db.prepare(`
      SELECT id FROM revocation_requests WHERE user_id = ? AND status = 'PENDING'
    `).get(userId);

    if (existingPending) {
      return res.status(400).json({
        error: 'You already have an active revocation appeal under review by the administration. You will be notified once a decision has been rendered.',
      });
    }

    const latestSuspension = db.prepare(`
      SELECT id FROM account_suspensions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(userId) as { id: string } | undefined;

    const requestId = `rev_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO revocation_requests (id, user_id, suspension_id, appeal_reason, explanation, supporting_info, status)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(
      requestId,
      userId,
      latestSuspension?.id || null,
      appealReason.trim(),
      explanation.trim(),
      supportingInfo?.trim() || null
    );

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'REVOCATION_REQUEST_SUBMITTED', 'USER', ?, ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      userId,
      userId,
      `Submitted account revocation appeal: ${appealReason}`
    );

    return res.status(201).json({
      success: true,
      message: 'Your revocation request has been submitted successfully and is now pending administrator review.',
      requestId,
    });
  } catch (error: unknown) {
    console.error('Submit revocation request error:', error);
    return res.status(500).json({ error: 'Failed to submit revocation request. Please try again.' });
  }
});

// Get Current User Profile & Entitlements (Returns { user: null } gracefully if unauthenticated)
router.get('/me', optionalAuthenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.json({ user: null, profile: null });
    }

    const userId = req.user.id;
    const user = db.prepare(`
      SELECT id, email, full_name, phone, role, status, created_at FROM users WHERE id = ?
    `).get(userId) as {
      id: string;
      email: string;
      full_name: string;
      phone: string | null;
      role: UserRole;
      status: string;
      created_at: string;
    } | undefined;

    if (!user) {
      return res.json({ user: null, profile: null });
    }

    if (user.status === 'SUSPENDED') {
      const suspension = db.prepare(`
        SELECT reason, internal_note, created_at FROM account_suspensions
        WHERE user_id = ? AND status = 'SUSPENDED'
        ORDER BY created_at DESC LIMIT 1
      `).get(user.id) as { reason: string; created_at: string } | undefined;
      const reason = suspension?.reason || 'Account access suspended by the administrator for policy verification.';
      const suspendedAt = suspension?.created_at || new Date().toISOString();
      const revocationToken = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
      });

      return res.json({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          phone: user.phone,
          role: user.role,
          status: 'SUSPENDED',
          createdAt: user.created_at,
          hasPermanentFreeAccess: false,
        },
        profile: null,
        isSuspended: true,
        suspension: {
          reason,
          suspendedAt,
          userId: user.id,
          name: user.full_name,
          email: user.email,
          revocationToken,
        },
      });
    }

    const isPermanentFree = checkPermanentFreeAccess(user.email);

    let profileData: Record<string, unknown> = {};

    if (user.role === 'STUDENT') {
      const studentProfile = db.prepare(`
        SELECT p.*, i.name as institute_name, b.name as batch_name
        FROM student_profiles p
        LEFT JOIN institutes i ON i.id = p.institute_id
        LEFT JOIN batches b ON b.id = p.batch_id
        WHERE p.user_id = ?
      `).get(userId) as Record<string, unknown> | undefined;

      profileData = studentProfile || {};
    } else if (user.role === 'INSTITUTE_ADMIN') {
      const institute = db.prepare(`
        SELECT * FROM institutes WHERE email = ?
      `).get(user.email);

      profileData = { institute };
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        phone: user.phone,
        role: user.role,
        status: user.status,
        createdAt: user.created_at,
        hasPermanentFreeAccess: isPermanentFree,
      },
      profile: profileData,
    });
  } catch (error: unknown) {
    console.error('Auth /me error:', error);
    return res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

// Get Active Sessions for Current User
router.get('/active-sessions', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const isPermanentFree = checkPermanentFreeAccess(req.user!.email);
    const sessions = db.prepare(`
      SELECT id, device_id, device_name, ip_address, status, created_at, last_activity_at, expires_at
      FROM user_sessions
      WHERE user_id = ? AND status = 'ACTIVE' AND datetime(expires_at) > datetime('now')
      ORDER BY last_activity_at DESC
    `).all(userId) as any[];

    return res.json({
      sessions,
      activeCount: sessions.length,
      maxAllowed: isPermanentFree ? 999 : MAX_STUDENT_DEVICES,
      isPermanentFree,
    });
  } catch (error: unknown) {
    console.error('Get active sessions error:', error);
    return res.status(500).json({ error: 'Failed to fetch active sessions' });
  }
});

// Revoke other device sessions
router.post('/sessions/revoke-others', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const currentSessionId = req.user!.sessionId;

    if (currentSessionId) {
      db.prepare(`
        UPDATE user_sessions
        SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND id != ? AND status = 'ACTIVE'
      `).run(userId, currentSessionId);
    } else {
      const mostRecent = db.prepare(`
        SELECT id FROM user_sessions WHERE user_id = ? AND status = 'ACTIVE' ORDER BY last_activity_at DESC LIMIT 1
      `).get(userId) as { id: string } | undefined;

      if (mostRecent) {
        db.prepare(`
          UPDATE user_sessions
          SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND id != ? AND status = 'ACTIVE'
        `).run(userId, mostRecent.id);
      }
    }

    return res.json({ success: true, message: 'Other active sessions have been revoked successfully.' });
  } catch (error: unknown) {
    console.error('Revoke other sessions error:', error);
    return res.status(500).json({ error: 'Failed to revoke other sessions' });
  }
});

// Forgot Password
router.post('/forgot-password', (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const user = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email.trim().toLowerCase());
  // Always return a positive message to prevent user enumeration attacks
  return res.json({
    message: 'If an account with this email exists, a password reset instruction has been sent to your email.',
  });
});

// Logout (Clear Server Session Cookie and revoke current device session)
router.post('/logout', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null) || (req as any).cookies?.ca_token;
    if (token) {
      try {
        const decoded = jwt.decode(token) as any;
        if (decoded?.sessionId) {
          revokeDeviceSession({ sessionId: decoded.sessionId });
        }
      } catch {
        // ignore decode failure
      }
    }
  } catch (err) {
    console.error('Logout session cleanup error:', err);
  }
  res.setHeader('Set-Cookie', 'ca_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return res.json({ success: true, message: 'Logged out successfully' });
});

export default router;
