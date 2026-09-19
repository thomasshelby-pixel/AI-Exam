import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db, hashPassword, verifyPassword } from '../db.js';
import { generateToken, generateMfaSessionToken, authenticateToken, authenticateRevocationToken, optionalAuthenticateToken, AuthRequest, checkPermanentFreeAccess, JWT_SECRET } from '../auth.js';
import { isDeviceLimitExceeded, createOrRefreshDeviceSession, revokeDeviceSession, revokeAllSessionsForUser, getSafeDeviceName, getActiveDeviceCount, MAX_STUDENT_DEVICES } from '../services/sessionService.js';
import { UserRole } from '../../src/types/index.js';
import { sendPasswordResetEmail, sendPasswordChangedConfirmation } from '../services/emailService.js';
import { syncRecordToFirestore } from '../services/firestoreSyncService.js';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getFirestoreDb, getFirestoreDoc, getAllFirestoreDocs } from '../services/firestoreDbService.js';
import { validateSrn } from '../utils/srnValidator.js';
import { normalizePhoneNumber, maskPhoneNumber, generateOtpCode, hashOtpCode, sendSmsOtp } from '../services/smsService.js';
import mfaRoutes from './mfaRoutes.js';

const router = Router();

// Mount dedicated MFA sub-router
router.use('/mfa', mfaRoutes);

/**
 * Server-Side Role-Based MFA Evaluation Helper
 * Evaluates whether MFA is mandatory or voluntarily enabled for the given user.
 * Role-Based Policy:
 *  - STUDENT: SMS MFA is OPTIONAL. Only required if student voluntarily enabled MFA.
 *  - INSTITUTE_ADMIN & SUPER_ADMIN: SMS MFA is strictly MANDATORY. If not enrolled, force enrollment.
 */
async function evaluateMfaRequirementForLogin(user: {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
}) {
  const mfaRecord = db.prepare(`
    SELECT mfa_enabled, mfa_phone FROM users WHERE id = ?
  `).get(user.id) as { mfa_enabled: number; mfa_phone: string | null } | undefined;

  const mfaEnabled = Boolean(mfaRecord?.mfa_enabled);
  const mfaPhone = mfaRecord?.mfa_phone || null;
  const isMandatoryRole = user.role === 'INSTITUTE_ADMIN' || user.role === 'SUPER_ADMIN';

  // Role: STUDENT -> MFA is strictly OPTIONAL
  if (user.role === 'STUDENT') {
    if (!mfaEnabled || !mfaPhone) {
      return { requireMfa: false };
    }
  }

  // Role: INSTITUTE_ADMIN / SUPER_ADMIN -> MFA is strictly MANDATORY
  if (isMandatoryRole) {
    if (!mfaEnabled || !mfaPhone) {
      const sessionToken = generateMfaSessionToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
        type: 'MFA_ENROLLMENT_REQUIRED',
      });
      return {
        requireMfa: true,
        mfaEnrolled: false,
        mfaSessionToken: sessionToken,
        role: user.role,
        message: 'SMS Multi-Factor Authentication is required for this administrative account.',
      };
    }
  }

  // Active enrolled MFA verification challenge
  const sessionToken = generateMfaSessionToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    fullName: user.full_name,
    type: 'MFA_CHALLENGE',
  });

  const normalizedPhone = normalizePhoneNumber(mfaPhone!);
  const otp = generateOtpCode();
  const otpHash = hashOtpCode(otp);
  const verifId = `mfa_v_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO mfa_verifications (id, user_id, phone_number, otp_code_hash, purpose, expires_at)
    VALUES (?, ?, ?, ?, 'LOGIN_CHALLENGE', ?)
  `).run(verifId, user.id, normalizedPhone, otpHash, expiresAt);

  const dispatch = await sendSmsOtp(normalizedPhone, otp, 'LOGIN_CHALLENGE');

  return {
    requireMfa: true,
    mfaEnrolled: true,
    mfaSessionToken: sessionToken,
    maskedPhone: dispatch.maskedPhone,
    role: user.role,
    devOtp: dispatch.devOtp,
    message: `SMS verification code sent to ${dispatch.maskedPhone}.`,
  };
}

/**
 * Authoritative Firestore verification and automatic self-healing for distributed production environments.
 * If a valid user is missing from local SQLite cache or has a stale hash, this queries Cloud Firestore directly,
 * validates the cryptographic password hash, and heals the local SQLite records in real time.
 */
async function authenticateWithFirestoreFallback(
  normalizedEmail: string,
  rawPassword: string,
  expectedRole?: UserRole
): Promise<{
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  status: string;
} | null> {
  const fdb = getFirestoreDb();
  if (!fdb) return null;

  try {
    const usersRef = collection(fdb, 'users');
    let snap = await getDocs(query(usersRef, where('email', '==', normalizedEmail)));
    let fUserDoc: any = null;
    if (!snap.empty) {
      fUserDoc = snap.docs[0].data();
    } else {
      const allUsers = await getAllFirestoreDocs<any>('users');
      fUserDoc = allUsers.find((u: any) => String(u.email || '').trim().toLowerCase() === normalizedEmail);
    }

    if (!fUserDoc) return null;

    const fHash = fUserDoc.password_hash || fUserDoc.passwordHash || fUserDoc.password;
    if (!fHash || typeof fHash !== 'string') return null;

    if (!verifyPassword(rawPassword, fHash)) {
      return null;
    }

    const uRole = (fUserDoc.role || 'STUDENT') as UserRole;
    if (expectedRole && uRole !== expectedRole && uRole !== 'SUPER_ADMIN') {
      return null;
    }

    const uId = fUserDoc.id || `usr_${crypto.randomBytes(8).toString('hex')}`;
    const uFullName = fUserDoc.full_name || fUserDoc.name || 'CA Student';
    const uPhone = fUserDoc.phone || null;
    const uStatus = fUserDoc.status || 'ACTIVE';
    const uClassification = fUserDoc.account_classification || 'NORMAL';

    try {
      const colliding = db.prepare('SELECT id FROM users WHERE lower(email) = ? AND id != ?').get(normalizedEmail, uId) as { id: string } | undefined;
      if (colliding) {
        db.prepare('DELETE FROM users WHERE id = ?').run(colliding.id);
      }

      db.prepare(`
        INSERT INTO users (id, email, password_hash, full_name, phone, role, status, account_classification, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          email = excluded.email,
          password_hash = excluded.password_hash,
          full_name = excluded.full_name,
          phone = excluded.phone,
          role = excluded.role,
          status = excluded.status,
          account_classification = excluded.account_classification,
          updated_at = CURRENT_TIMESTAMP
      `).run(uId, normalizedEmail, fHash, uFullName, uPhone, uRole, uStatus, uClassification, fUserDoc.created_at || null);

      if (uRole === 'STUDENT') {
        const spDoc = await getFirestoreDoc<any>('student_profiles', uId);
        if (spDoc) {
          db.prepare(`
            INSERT INTO student_profiles (user_id, icai_registration_number, ca_level, free_evaluations_used, purchased_credits, institute_id, batch_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              icai_registration_number = excluded.icai_registration_number,
              ca_level = excluded.ca_level,
              free_evaluations_used = excluded.free_evaluations_used,
              purchased_credits = excluded.purchased_credits,
              institute_id = excluded.institute_id,
              batch_id = excluded.batch_id
          `).run(
            uId,
            spDoc.icai_registration_number || '',
            spDoc.ca_level || 'INTERMEDIATE',
            spDoc.free_evaluations_used || 0,
            spDoc.purchased_credits || 0,
            spDoc.institute_id || null,
            spDoc.batch_id || null
          );
        }
      }
    } catch (healErr) {
      console.warn('[Auth] Error healing SQLite user from Firestore:', healErr);
    }

    return {
      id: uId,
      email: normalizedEmail,
      password_hash: fHash,
      full_name: uFullName,
      role: uRole,
      status: uStatus,
    };
  } catch (err) {
    console.warn('[Auth] Firestore fallback auth error:', err);
    return null;
  }
}

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
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, fullName, phone, icaiRegistrationNumber, caLevel } = req.body;

    if (!email || !password || !fullName || !icaiRegistrationNumber) {
      return res.status(400).json({ error: 'Please provide all required fields (Name, Email, Password, ICAI Registration Number).' });
    }

    const srnValidation = validateSrn(icaiRegistrationNumber);
    if (!srnValidation.isValid) {
      return res.status(400).json({
        error: srnValidation.error,
        code: 'INVALID_SRN',
      });
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
      `).run(userId, srnValidation.normalized, caLevel || 'INTERMEDIATE');

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

    // Sync newly registered user and profile to Cloud Firestore immediately
    try {
      const uRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
      const spRow = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(userId) as any;
      if (uRow) await syncRecordToFirestore('users', userId, uRow);
      if (spRow) await syncRecordToFirestore('student_profiles', userId, spRow);
    } catch (syncErr) {
      console.warn('[Auth] Register firestore sync warning:', syncErr);
    }

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
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    let user = db.prepare(`
      SELECT id, email, password_hash, full_name, role, status FROM users WHERE lower(email) = ?
    `).get(normalizedEmail) as {
      id: string;
      email: string;
      password_hash: string;
      full_name: string;
      role: UserRole;
      status: string;
    } | undefined;

    let isAuthenticated = false;
    if (user && verifyPassword(password, user.password_hash)) {
      isAuthenticated = true;
    } else {
      // Direct Cloud Firestore fallback & self-healing
      const firestoreUser = await authenticateWithFirestoreFallback(normalizedEmail, password);
      if (firestoreUser) {
        user = firestoreUser;
        isAuthenticated = true;
      }
    }

    if (!user || !isAuthenticated) {
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

    // Role-Based MFA Evaluation:
    // Check if MFA challenge is required or if mandatory enrollment is needed
    const mfaCheck = await evaluateMfaRequirementForLogin(user);
    if (mfaCheck.requireMfa) {
      return res.json({
        mfaRequired: true,
        mfaEnrolled: mfaCheck.mfaEnrolled,
        mfaSessionToken: mfaCheck.mfaSessionToken,
        maskedPhone: mfaCheck.maskedPhone,
        role: mfaCheck.role,
        message: mfaCheck.message,
        devOtp: mfaCheck.devOtp,
      });
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

interface VerifiedGoogleIdentity {
  email: string;
  fullName: string;
  uid: string;
}

export function verifyGoogleToken(token: string): { valid: boolean; identity?: VerifiedGoogleIdentity; error?: string; code?: string } {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Google authentication credential is required.', code: 'GOOGLE_AUTH_FAILED' };
  }
  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Malformed authentication token.', code: 'GOOGLE_AUTH_FAILED' };
  }

  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
  } catch {
    return { valid: false, error: 'Invalid authentication token encoding.', code: 'GOOGLE_AUTH_FAILED' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < nowSec - 60) {
    return { valid: false, error: 'Google session has expired. Please sign in again.', code: 'GOOGLE_AUTH_FAILED' };
  }

  if (!payload.email || typeof payload.email !== 'string') {
    return { valid: false, error: 'Google credential missing email address.', code: 'GOOGLE_AUTH_FAILED' };
  }

  if (payload.email_verified === false) {
    return { valid: false, error: 'Google email address is not verified.', code: 'GOOGLE_AUTH_FAILED' };
  }

  return {
    valid: true,
    identity: {
      email: payload.email.toLowerCase().trim(),
      fullName: payload.name || payload.given_name || 'CA Student',
      uid: payload.sub || payload.user_id || payload.uid || `usr_${crypto.randomBytes(8).toString('hex')}`,
    },
  };
}

// Google Sign-In Endpoint
router.post('/google', async (req: Request, res: Response) => {
  try {
    const rawToken = req.body?.idToken || req.body?.credential;
    if (!rawToken || typeof rawToken !== 'string') {
      return res.status(400).json({
        error: 'Google authentication credential is required.',
        code: 'GOOGLE_AUTH_FAILED',
      });
    }

    const verification = verifyGoogleToken(rawToken);
    if (!verification.valid || !verification.identity) {
      return res.status(401).json({
        error: verification.error || 'Google authentication failed. Please try again.',
        code: verification.code || 'GOOGLE_AUTH_FAILED',
      });
    }

    const { email: verifiedEmail, fullName: verifiedName } = verification.identity;

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
      // 1. Enforce account status for existing user
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
          code: 'ACCOUNT_DISABLED',
        });
      }

      // Check role constraints
      if (user.role === 'INSTITUTE_ADMIN') {
        return res.status(403).json({
          error: 'This account is registered as a Coaching Institute Admin. Please sign in via the Institute Portal.',
          code: 'ROLE_MISMATCH',
        });
      }

      // Check student profile completeness (ICAI SRN check)
      const studentProfile = db.prepare(`
        SELECT * FROM student_profiles WHERE user_id = ?
      `).get(user.id) as any;

      const isSrnValid = studentProfile && validateSrn(studentProfile.icai_registration_number).isValid;

      if (!isSrnValid) {
        // Check if client provided profile in this request
        if (req.body?.profile?.icaiRegistrationNumber) {
          const srnVal = validateSrn(req.body.profile.icaiRegistrationNumber);
          if (!srnVal.isValid) {
            return res.status(400).json({ error: srnVal.error, code: 'INVALID_SRN' });
          }
          if (studentProfile) {
            db.prepare(`
              UPDATE student_profiles
              SET icai_registration_number = ?,
                  ca_level = COALESCE(?, ca_level),
                  updated_at = CURRENT_TIMESTAMP
              WHERE user_id = ?
            `).run(srnVal.normalized, req.body.profile.caLevel || null, user.id);
          } else {
            db.prepare(`
              INSERT INTO student_profiles (user_id, icai_registration_number, ca_level, free_evaluations_used, purchased_credits)
              VALUES (?, ?, ?, 0, 0)
            `).run(user.id, srnVal.normalized, req.body.profile.caLevel || 'INTERMEDIATE');
          }
        } else {
          // Issue temporary onboarding token to complete profile
          const onboardingToken = jwt.sign(
            { email: verifiedEmail, fullName: user.full_name, userId: user.id, type: 'GOOGLE_ONBOARDING' },
            JWT_SECRET,
            { expiresIn: '30m' }
          );
          return res.json({
            code: 'PROFILE_INCOMPLETE',
            message: 'Please complete your CA Student profile with a valid ICAI Student Registration Number.',
            onboardingToken,
            tempUser: {
              email: verifiedEmail,
              fullName: user.full_name,
            },
          });
        }
      }

      if (user.role === 'STUDENT') {
        syncPendingInstituteEnrollments(user.id, user.email);
      }
    } else {
      // New user via Google Sign-In
      // MANDATORY SECURITY RULE: Google Sign-In must NOT create Admin or Institute Admin accounts.
      // Role is STRICTLY 'STUDENT'.
      if (req.body?.profile?.icaiRegistrationNumber) {
        const srnVal = validateSrn(req.body.profile.icaiRegistrationNumber);
        if (!srnVal.isValid) {
          return res.status(400).json({ error: srnVal.error, code: 'INVALID_SRN' });
        }

        const userId = `usr_${crypto.randomBytes(8).toString('hex')}`;
        const randomPassword = crypto.randomBytes(32).toString('hex');
        const passwordHash = hashPassword(randomPassword);
        const role: UserRole = 'STUDENT';

        db.prepare(`
          INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
          VALUES (?, ?, ?, ?, ?, 'STUDENT', 'ACTIVE')
        `).run(userId, verifiedEmail, passwordHash, req.body.profile.fullName || verifiedName, req.body.profile.phone || null);

        db.prepare(`
          INSERT INTO student_profiles (user_id, icai_registration_number, ca_level, free_evaluations_used, purchased_credits)
          VALUES (?, ?, ?, 0, 0)
        `).run(userId, srnVal.normalized, req.body.profile.caLevel || 'INTERMEDIATE');

        syncPendingInstituteEnrollments(userId, verifiedEmail);

        db.prepare(`
          INSERT INTO notifications (id, user_id, title, message, type)
          VALUES (?, ?, 'Welcome to CA Exam Checker AI', 'Your Google account has been linked. You receive 2 free full-paper evaluations!', 'SYSTEM')
        `).run(`notif_${crypto.randomBytes(8).toString('hex')}`, userId);

        db.prepare(`
          INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
          VALUES (?, ?, 'GOOGLE_SIGNUP', 'USER', ?, 'New student account created via Google OAuth')
        `).run(`log_${crypto.randomBytes(8).toString('hex')}`, userId, userId);

        user = {
          id: userId,
          email: verifiedEmail,
          full_name: req.body.profile.fullName || verifiedName,
          role,
          status: 'ACTIVE',
        };

        try {
          const uRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
          const spRow = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(userId) as any;
          if (uRow) syncRecordToFirestore('users', userId, uRow).catch(() => {});
          if (spRow) syncRecordToFirestore('student_profiles', userId, spRow).catch(() => {});
        } catch {}
      } else {
        // Return PROFILE_INCOMPLETE to prompt for SRN and profile details
        const onboardingToken = jwt.sign(
          { email: verifiedEmail, fullName: verifiedName, isNewUser: true, type: 'GOOGLE_ONBOARDING' },
          JWT_SECRET,
          { expiresIn: '30m' }
        );
        return res.json({
          code: 'PROFILE_INCOMPLETE',
          message: 'Please complete your CA Student profile with your ICAI Student Registration Number.',
          onboardingToken,
          tempUser: {
            email: verifiedEmail,
            fullName: verifiedName,
          },
        });
      }
    }

    // 2-Device Limit Enforcement for Student Accounts
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
          code: 'SESSION_LIMIT_REACHED',
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

    // Role-Based MFA Evaluation for Google Sign-In
    const mfaCheck = await evaluateMfaRequirementForLogin(user);
    if (mfaCheck.requireMfa) {
      return res.json({
        mfaRequired: true,
        mfaEnrolled: mfaCheck.mfaEnrolled,
        mfaSessionToken: mfaCheck.mfaSessionToken,
        maskedPhone: mfaCheck.maskedPhone,
        role: mfaCheck.role,
        message: mfaCheck.message,
        devOtp: mfaCheck.devOtp,
      });
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
    return res.status(500).json({ error: 'Google authentication failed. Please try again.', code: 'SERVER_ERROR' });
  }
});

// Google Onboarding / Complete Profile Endpoint
router.post('/google/complete-profile', async (req: Request, res: Response) => {
  try {
    const { onboardingToken, fullName, phone, icaiRegistrationNumber, caLevel } = req.body;

    if (!onboardingToken || typeof onboardingToken !== 'string') {
      return res.status(401).json({
        error: 'Onboarding session is missing. Please sign in with Google again.',
        code: 'GOOGLE_AUTH_FAILED',
      });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(onboardingToken, JWT_SECRET);
      if (decoded?.type !== 'GOOGLE_ONBOARDING' || !decoded?.email) {
        return res.status(401).json({
          error: 'Invalid onboarding session. Please sign in with Google again.',
          code: 'GOOGLE_AUTH_FAILED',
        });
      }
    } catch {
      return res.status(401).json({
        error: 'Onboarding session has expired. Please sign in with Google again.',
        code: 'GOOGLE_AUTH_FAILED',
      });
    }

    if (!icaiRegistrationNumber) {
      return res.status(400).json({
        error: 'Student Registration Number is required.',
        code: 'INVALID_SRN',
      });
    }

    const srnValidation = validateSrn(icaiRegistrationNumber);
    if (!srnValidation.isValid) {
      return res.status(400).json({
        error: srnValidation.error,
        code: 'INVALID_SRN',
      });
    }

    const normalizedEmail = decoded.email.toLowerCase().trim();

    let user = db.prepare(`
      SELECT id, email, full_name, role, status FROM users WHERE lower(email) = ?
    `).get(normalizedEmail) as any;

    if (user) {
      // Update name / phone if provided
      db.prepare(`
        UPDATE users
        SET full_name = COALESCE(?, full_name),
            phone = COALESCE(?, phone),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(fullName?.trim() || null, phone?.trim() || null, user.id);

      // Insert or update student profile
      const existingProfile = db.prepare('SELECT user_id FROM student_profiles WHERE user_id = ?').get(user.id);
      if (existingProfile) {
        db.prepare(`
          UPDATE student_profiles
          SET icai_registration_number = ?,
              ca_level = COALESCE(?, ca_level),
              updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `).run(srnValidation.normalized, caLevel || null, user.id);
      } else {
        db.prepare(`
          INSERT INTO student_profiles (user_id, icai_registration_number, ca_level, free_evaluations_used, purchased_credits)
          VALUES (?, ?, ?, 0, 0)
        `).run(user.id, srnValidation.normalized, caLevel || 'INTERMEDIATE');
      }

      user.full_name = fullName?.trim() || user.full_name;
    } else {
      // Create new student
      const userId = `usr_${crypto.randomBytes(8).toString('hex')}`;
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = hashPassword(randomPassword);

      db.prepare(`
        INSERT INTO users (id, email, password_hash, full_name, phone, role, status)
        VALUES (?, ?, ?, ?, ?, 'STUDENT', 'ACTIVE')
      `).run(userId, normalizedEmail, passwordHash, fullName?.trim() || decoded.fullName || 'CA Student', phone?.trim() || null);

      db.prepare(`
        INSERT INTO student_profiles (user_id, icai_registration_number, ca_level, free_evaluations_used, purchased_credits)
        VALUES (?, ?, ?, 0, 0)
      `).run(userId, srnValidation.normalized, caLevel || 'INTERMEDIATE');

      syncPendingInstituteEnrollments(userId, normalizedEmail);

      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type)
        VALUES (?, ?, 'Welcome to CA Exam Checker AI', 'Your Google account has been linked. You receive 2 free full-paper evaluations!', 'SYSTEM')
      `).run(`notif_${crypto.randomBytes(8).toString('hex')}`, userId);

      db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
        VALUES (?, ?, 'GOOGLE_SIGNUP', 'USER', ?, 'New student account created via Google OAuth')
      `).run(`log_${crypto.randomBytes(8).toString('hex')}`, userId, userId);

      user = {
        id: userId,
        email: normalizedEmail,
        full_name: fullName?.trim() || decoded.fullName || 'CA Student',
        role: 'STUDENT',
        status: 'ACTIVE',
      };
    }

    // 2-Device Limit Check
    let sessionId: string | undefined;
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
        code: 'SESSION_LIMIT_REACHED',
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

    // Role-Based MFA Evaluation for Complete Profile
    const mfaCheck = await evaluateMfaRequirementForLogin(user);
    if (mfaCheck.requireMfa) {
      return res.json({
        mfaRequired: true,
        mfaEnrolled: mfaCheck.mfaEnrolled,
        mfaSessionToken: mfaCheck.mfaSessionToken,
        maskedPhone: mfaCheck.maskedPhone,
        role: mfaCheck.role,
        message: mfaCheck.message,
        devOtp: mfaCheck.devOtp,
      });
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
    console.error('Complete Profile error:', error);
    return res.status(500).json({ error: 'Failed to complete profile. Please try again.', code: 'SERVER_ERROR' });
  }
});


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
router.post('/institute/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    let user = db.prepare(`
      SELECT id, email, password_hash, full_name, role, status FROM users WHERE lower(email) = ?
    `).get(normalizedEmail) as {
      id: string;
      email: string;
      password_hash: string;
      full_name: string;
      role: UserRole;
      status: string;
    } | undefined;

    let isAuthenticated = false;
    if (user && verifyPassword(password, user.password_hash)) {
      isAuthenticated = true;
    } else {
      const firestoreUser = await authenticateWithFirestoreFallback(normalizedEmail, password, 'INSTITUTE_ADMIN');
      if (firestoreUser) {
        user = firestoreUser;
        isAuthenticated = true;
      }
    }

    if (!user || !isAuthenticated) {
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

    // Role-Based MFA Evaluation for Institute Login (MANDATORY)
    const mfaCheck = await evaluateMfaRequirementForLogin(user);
    if (mfaCheck.requireMfa) {
      return res.json({
        mfaRequired: true,
        mfaEnrolled: mfaCheck.mfaEnrolled,
        mfaSessionToken: mfaCheck.mfaSessionToken,
        maskedPhone: mfaCheck.maskedPhone,
        role: mfaCheck.role,
        message: mfaCheck.message,
        devOtp: mfaCheck.devOtp,
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
      SELECT id, email, full_name, phone, role, status, mfa_enabled, mfa_phone, created_at FROM users WHERE id = ?
    `).get(userId) as {
      id: string;
      email: string;
      full_name: string;
      phone: string | null;
      role: UserRole;
      status: string;
      mfa_enabled: number;
      mfa_phone: string | null;
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
        mfaEnabled: Boolean(user.mfa_enabled),
        mfaPhone: user.mfa_phone ? maskPhoneNumber(user.mfa_phone) : null,
        mfaVerified: req.user.mfaVerified ?? false,
        mfaMandatory: user.role === 'INSTITUTE_ADMIN' || user.role === 'SUPER_ADMIN',
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
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Valid email address is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT id, email, full_name FROM users WHERE lower(email) = ?').get(normalizedEmail) as {
      id: string;
      email: string;
      full_name: string;
    } | undefined;

    if (user) {
      // Invalidate existing unused tokens
      db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0').run(user.id);

      // Generate secure 32-byte token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const tokenId = `prt_${crypto.randomBytes(8).toString('hex')}`;
      const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour

      db.prepare(`
        INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used, created_at)
        VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
      `).run(tokenId, user.id, tokenHash, expiresAt);

      // Audit log
      db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
        VALUES (?, ?, 'REQUEST_PASSWORD_RESET', 'USER', ?, ?)
      `).run(
        `log_${crypto.randomBytes(8).toString('hex')}`,
        user.id,
        user.id,
        `Password reset requested for ${user.email}`
      );

      // Record in-app notification so user is alerted
      try {
        db.prepare(`
          INSERT INTO notifications (id, user_id, title, message, type)
          VALUES (?, ?, 'Password Reset Request', ?, 'SYSTEM')
        `).run(
          `notif_${crypto.randomBytes(8).toString('hex')}`,
          user.id,
          'A password reset request was initiated for your account. A secure reset link has been sent to your registered email address.'
        );
      } catch {
        // Non-fatal
      }

      // Dispatch email via Resend SMTP
      await sendPasswordResetEmail(user.email, rawToken, user.full_name);

      // Return strictly secure, uniform response (no devResetUrl or token leakage)
      return res.json({
        success: true,
        message: 'If an account exists with this email address, a password reset link has been dispatched to your inbox. The link will expire in 1 hour.',
      });
    }

    // Return uniform message to prevent account enumeration
    return res.json({
      success: true,
      message: 'If an account exists with this email address, a password reset link has been dispatched to your inbox. The link will expire in 1 hour.',
    });
  } catch (error: unknown) {
    console.error('[AuthRoutes] Forgot password error:', error);
    return res.status(500).json({ error: 'Unable to process password reset request at this time.' });
  }
});

// Verify Password Reset Token
router.post('/verify-reset-token', (req: Request, res: Response) => {
  try {
    const { token, email } = req.body;
    if (!token || !email) {
      return res.status(400).json({ valid: false, error: 'Token and email are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT id, email FROM users WHERE lower(email) = ?').get(normalizedEmail) as {
      id: string;
      email: string;
    } | undefined;

    if (!user) {
      return res.status(400).json({ valid: false, error: 'Invalid or expired password reset link' });
    }

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const resetRecord = db.prepare(`
      SELECT id, expires_at, used 
      FROM password_reset_tokens 
      WHERE user_id = ? AND token_hash = ?
      ORDER BY created_at DESC 
      LIMIT 1
    `).get(user.id, tokenHash) as { id: string; expires_at: string; used: number } | undefined;

    if (!resetRecord) {
      return res.status(400).json({ valid: false, error: 'Invalid reset link. Please request a new one.' });
    }

    if (resetRecord.used === 1) {
      return res.status(400).json({ valid: false, error: 'This reset link has already been used. Please request a new one.' });
    }

    const isExpired = new Date(resetRecord.expires_at).getTime() < Date.now();
    if (isExpired) {
      return res.status(400).json({ valid: false, error: 'This reset link has expired. Reset links are valid for 1 hour.' });
    }

    return res.json({ valid: true });
  } catch (error: unknown) {
    console.error('[AuthRoutes] Verify reset token error:', error);
    return res.status(500).json({ valid: false, error: 'Failed to verify reset token' });
  }
});

// Complete Password Reset
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, email, newPassword } = req.body;
    if (!token || !email || !newPassword) {
      return res.status(400).json({ error: 'Token, email, and new password are required' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT id, email, full_name FROM users WHERE lower(email) = ?').get(normalizedEmail) as {
      id: string;
      email: string;
      full_name: string;
    } | undefined;

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const resetRecord = db.prepare(`
      SELECT id, expires_at, used 
      FROM password_reset_tokens 
      WHERE user_id = ? AND token_hash = ?
      ORDER BY created_at DESC 
      LIMIT 1
    `).get(user.id, tokenHash) as { id: string; expires_at: string; used: number } | undefined;

    if (!resetRecord || resetRecord.used === 1) {
      return res.status(400).json({ error: 'Invalid or already used reset link. Please request a new one.' });
    }

    const isExpired = new Date(resetRecord.expires_at).getTime() < Date.now();
    if (isExpired) {
      return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
    }

    // Hash the new password
    const hashedPassword = hashPassword(newPassword);

    // Update password
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      hashedPassword,
      user.id
    );

    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as any;
    if (updatedUser) {
      syncRecordToFirestore('users', user.id, updatedUser).catch(() => {});
    }

    // Mark token as used
    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(resetRecord.id);

    // Invalidate all active sessions for security
    revokeAllSessionsForUser(user.id);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'RESET_PASSWORD_SUCCESS', 'USER', ?, ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      user.id,
      user.id,
      `Password successfully reset for ${user.email}`
    );

    // Send confirmation email
    await sendPasswordChangedConfirmation(user.email, user.full_name);

    return res.json({
      success: true,
      message: 'Your password has been reset successfully. Please log in with your new password.',
    });
  } catch (error: unknown) {
    console.error('[AuthRoutes] Reset password error:', error);
    return res.status(500).json({ error: 'Failed to reset password. Please try again.' });
  }
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
