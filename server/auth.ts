import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from './db.js';
import { User, UserRole } from '../src/types/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'ca-exam-checker-super-secure-jwt-secret-2026-production';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    fullName: string;
  };
}

export function generateToken(user: { id: string; email: string; role: UserRole; fullName: string }): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email.toLowerCase(),
      role: user.role,
      fullName: user.fullName,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function parseCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token && req.headers['cookie']) {
    token = parseCookie(req.headers['cookie'], 'ca_token');
  }

  // Also support token passed in query parameter for direct PDF and file downloads
  if (!token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      role: UserRole;
      fullName: string;
    };

    // Verify user is still active in database
    const user = db.prepare('SELECT id, email, role, full_name, status FROM users WHERE id = ?').get(decoded.id) as {
      id: string;
      email: string;
      role: UserRole;
      full_name: string;
      status: string;
    } | undefined;

    if (!user || user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Your account is disabled, suspended, or does not exist.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
    };

    next();
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
  }
}

export function optionalAuthenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token && req.headers['cookie']) {
    token = parseCookie(req.headers['cookie'], 'ca_token');
  }

  if (!token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      role: UserRole;
      fullName: string;
    };

    const user = db.prepare('SELECT id, email, role, full_name, status FROM users WHERE id = ?').get(decoded.id) as {
      id: string;
      email: string;
      role: UserRole;
      full_name: string;
      status: string;
    } | undefined;

    if (user && user.status === 'ACTIVE') {
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
      };
    }
  } catch {
    // Stale or invalid token - silently leave unauthenticated
  }

  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Role ${req.user.role} is not authorized for this resource.`,
      });
    }

    next();
  };
}

export function checkPermanentFreeAccess(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  // Check in database table
  const record = db.prepare(`
    SELECT is_active FROM permanent_free_entitlements WHERE lower(email) = ? AND is_active = 1
  `).get(normalized) as { is_active: number } | undefined;

  return !!record;
}

export interface StudentEntitlement {
  canEvaluate: boolean;
  tier: 'PERMANENT_FREE' | 'INSTITUTE_SPONSORED' | 'FREE_TIER' | 'PURCHASED_CREDITS' | 'EXHAUSTED';
  freeEvaluationsRemaining: number;
  purchasedCredits: number;
  instituteSponsored: boolean;
  instituteName?: string;
  hasPermanentFreeAccess: boolean;
  referralCode?: string;
  referralExpiry?: string;
  reason?: string;
}

export function getStudentEntitlement(userId: string): StudentEntitlement {
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!user) {
    return {
      canEvaluate: false,
      tier: 'EXHAUSTED',
      freeEvaluationsRemaining: 0,
      purchasedCredits: 0,
      instituteSponsored: false,
      hasPermanentFreeAccess: false,
      reason: 'User not found',
    };
  }

  const isPermanentFree = checkPermanentFreeAccess(user.email);
  if (isPermanentFree) {
    return {
      canEvaluate: true,
      tier: 'PERMANENT_FREE',
      freeEvaluationsRemaining: 9999,
      purchasedCredits: 9999,
      instituteSponsored: false,
      hasPermanentFreeAccess: true,
      reason: 'Permanent Free Entitlement Active',
    };
  }

  // Check active promotional referral code redemption (e.g. AI30 1-Month Free Access)
  try {
    const activeReferral = db.prepare(`
      SELECT referral_code, expiry_date, benefit_type
      FROM referral_redemptions
      WHERE user_id = ? AND status = 'ACTIVE' AND datetime(expiry_date) > datetime('now')
      ORDER BY expiry_date DESC LIMIT 1
    `).get(userId) as { referral_code: string; expiry_date: string; benefit_type: string } | undefined;

    if (activeReferral) {
      return {
        canEvaluate: true,
        tier: 'PERMANENT_FREE',
        freeEvaluationsRemaining: 999,
        purchasedCredits: 999,
        instituteSponsored: false,
        hasPermanentFreeAccess: true,
        referralCode: activeReferral.referral_code,
        referralExpiry: activeReferral.expiry_date,
        reason: `Promotional Code Active (${activeReferral.referral_code} 1-Month Free Access)`,
      };
    }
  } catch (err) {
    console.warn('Referral check warning:', err);
  }

  const profile = db.prepare(`
    SELECT free_evaluations_used, purchased_credits, institute_id FROM student_profiles WHERE user_id = ?
  `).get(userId) as {
    free_evaluations_used: number;
    purchased_credits: number;
    institute_id?: string;
  } | undefined;

  const freeUsed = profile ? profile.free_evaluations_used : 0;
  const purchased = profile ? profile.purchased_credits : 0;
  const freeRemaining = Math.max(0, 2 - freeUsed);

  // Check if student belongs to an ACTIVE institute with an active subscription
  let instituteSponsored = false;
  let instituteName: string | undefined;

  if (profile?.institute_id) {
    const inst = db.prepare(`
      SELECT i.name, i.status, i.subscription_expires_at
      FROM institutes i
      JOIN institute_memberships m ON m.institute_id = i.id
      WHERE m.student_id = ? AND m.status = 'ACTIVE' AND i.status = 'ACTIVE'
    `).get(userId) as {
      name: string;
      status: string;
      subscription_expires_at?: string;
    } | undefined;

    if (inst) {
      const notExpired = !inst.subscription_expires_at || new Date(inst.subscription_expires_at) > new Date();
      if (notExpired) {
        instituteSponsored = true;
        instituteName = inst.name;
        return {
          canEvaluate: true,
          tier: 'INSTITUTE_SPONSORED',
          freeEvaluationsRemaining: freeRemaining,
          purchasedCredits: purchased,
          instituteSponsored: true,
          instituteName,
          hasPermanentFreeAccess: false,
        };
      }
    }
  }

  // Normal Student First 2 Answer Sheets Free
  if (freeRemaining > 0) {
    return {
      canEvaluate: true,
      tier: 'FREE_TIER',
      freeEvaluationsRemaining: freeRemaining,
      purchasedCredits: purchased,
      instituteSponsored: false,
      hasPermanentFreeAccess: false,
    };
  }

  // Purchased Credits
  if (purchased > 0) {
    return {
      canEvaluate: true,
      tier: 'PURCHASED_CREDITS',
      freeEvaluationsRemaining: 0,
      purchasedCredits: purchased,
      instituteSponsored: false,
      hasPermanentFreeAccess: false,
    };
  }

  return {
    canEvaluate: false,
    tier: 'EXHAUSTED',
    freeEvaluationsRemaining: 0,
    purchasedCredits: 0,
    instituteSponsored: false,
    hasPermanentFreeAccess: false,
    reason: 'Free evaluations exhausted. Please purchase evaluation credits.',
  };
}
