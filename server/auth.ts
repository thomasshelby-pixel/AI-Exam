import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from './db.js';
import { User, UserRole } from '../src/types/index.js';
import { getValidStudentCreditBalance } from './services/studentCreditService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'ca-exam-checker-super-secure-jwt-secret-2026-production';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    fullName: string;
    sessionId?: string;
  };
}

export function generateToken(
  user: { id: string; email: string; role: UserRole; fullName: string },
  sessionId?: string
): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email.toLowerCase(),
      role: user.role,
      fullName: user.fullName,
      sessionId,
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
      sessionId?: string;
    };

    // Verify user in database
    const user = db.prepare('SELECT id, email, role, full_name, status FROM users WHERE id = ?').get(decoded.id) as {
      id: string;
      email: string;
      role: UserRole;
      full_name: string;
      status: string;
    } | undefined;

    if (!user) {
      return res.status(401).json({ error: 'User account not found.' });
    }

    // Check account status
    if (user.status === 'SUSPENDED') {
      // Invalidate active sessions immediately
      try {
        db.prepare("UPDATE user_sessions SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND status = 'ACTIVE'").run(user.id);
      } catch {
        // ignore
      }

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
        success: false,
        code: 'ACCOUNT_SUSPENDED',
        error: 'Your account has been suspended by the administrator.',
        status: 'SUSPENDED',
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

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Your account is disabled, inactive, or does not exist.' });
    }

    // Check session validity if sessionId is present in token
    if (decoded.sessionId) {
      const session = db.prepare(`
        SELECT id, status, expires_at FROM user_sessions WHERE id = ?
      `).get(decoded.sessionId) as { id: string; status: string; expires_at: string } | undefined;

      if (session) {
        if (session.status === 'REVOKED') {
          return res.status(401).json({
            code: 'SESSION_REVOKED',
            error: 'Your session has been logged out or terminated. Please log in again.'
          });
        }
        if (session.status === 'EXPIRED' || new Date(session.expires_at).getTime() <= Date.now()) {
          return res.status(401).json({
            code: 'SESSION_EXPIRED',
            error: 'Your session has expired. Please log in again.'
          });
        }
      }
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
      sessionId: decoded.sessionId,
    };

    next();
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
  }
}

/**
 * Dedicated authentication middleware for suspended account revocation appeals.
 * Allows users with status 'SUSPENDED' to access their own appeal endpoints.
 */
export function authenticateRevocationToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token && req.headers['cookie']) {
    token = parseCookie(req.headers['cookie'], 'ca_token');
  }

  if (!token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in or provide revocation token.' });
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

    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    if (user.status !== 'SUSPENDED' && user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Account is deactivated.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
    };

    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired revocation session token.' });
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

    if (user && (user.status === 'ACTIVE' || user.status === 'SUSPENDED')) {
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
      };
      if (user.status === 'SUSPENDED') {
        (req as any).isSuspended = true;
      }
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
  tier: 'PERMANENT_FREE' | 'INSTITUTE_SPONSORED' | 'PROMOTIONAL_AI30' | 'FREE_TIER' | 'PURCHASED_CREDITS' | 'EXHAUSTED';
  freeEvaluationsRemaining: number;
  purchasedCredits: number;
  instituteSponsored: boolean;
  instituteName?: string;
  hasPermanentFreeAccess: boolean;
  referralCode?: string;
  referralExpiry?: string;
  referralRedemptionId?: string;
  referralMaxEvaluations?: number;
  referralEvaluationsUsed?: number;
  referralEvaluationsRemaining?: number;
  reason?: string;
}

export function getStudentEntitlement(
  userId: string,
  evaluationSource?: 'PUBLIC' | 'INSTITUTE',
  targetInstituteId?: string
): StudentEntitlement {
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

  // If user explicitly requests INSTITUTE evaluation
  if (evaluationSource === 'INSTITUTE') {
    let instQuery = `
      SELECT i.name, i.status, i.subscription_expires_at, i.id as institute_id, m.id as membership_id, m.batch_id
      FROM institutes i
      JOIN institute_memberships m ON m.institute_id = i.id
      WHERE m.student_id = ? AND m.status = 'ACTIVE' AND i.status = 'ACTIVE'
    `;
    const instParams: any[] = [userId];
    if (targetInstituteId) {
      instQuery += ' AND i.id = ?';
      instParams.push(targetInstituteId);
    }
    instQuery += ' LIMIT 1';

    const inst = db.prepare(instQuery).get(...instParams) as {
      name: string;
      status: string;
      subscription_expires_at?: string;
      institute_id: string;
      membership_id: string;
      batch_id?: string;
    } | undefined;

    if (inst) {
      const notExpired = !inst.subscription_expires_at || new Date(inst.subscription_expires_at) > new Date();
      if (notExpired) {
        return {
          canEvaluate: true,
          tier: 'INSTITUTE_SPONSORED',
          freeEvaluationsRemaining: 9999,
          purchasedCredits: 9999,
          instituteSponsored: true,
          instituteName: inst.name,
          hasPermanentFreeAccess: false,
          reason: `Sponsored by ${inst.name}`,
        };
      } else {
        return {
          canEvaluate: false,
          tier: 'EXHAUSTED',
          freeEvaluationsRemaining: 0,
          purchasedCredits: 0,
          instituteSponsored: false,
          hasPermanentFreeAccess: false,
          reason: `Coaching institute subscription for ${inst.name} is currently expired. Please contact institute administration or use Public Evaluation.`,
        };
      }
    } else {
      return {
        canEvaluate: false,
        tier: 'EXHAUSTED',
        freeEvaluationsRemaining: 0,
        purchasedCredits: 0,
        instituteSponsored: false,
        hasPermanentFreeAccess: false,
        reason: 'You do not have an active enrollment in this coaching institute.',
      };
    }
  }

  // Otherwise, evaluationSource is PUBLIC or unspecified.
  // Evaluate personal student access:
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

  // Check active promotional referral code redemption (e.g. AI30 1-Month Free Access & 15 evaluations)
  try {
    const activeReferral = db.prepare(`
      SELECT id, referral_code, expiry_date, benefit_type, max_evaluations, evaluations_used, evaluations_remaining
      FROM referral_redemptions
      WHERE user_id = ? AND status = 'ACTIVE' 
        AND datetime(expiry_date) > datetime('now')
        AND evaluations_remaining > 0
      ORDER BY expiry_date DESC LIMIT 1
    `).get(userId) as { 
      id: string; 
      referral_code: string; 
      expiry_date: string; 
      benefit_type: string;
      max_evaluations: number;
      evaluations_used: number;
      evaluations_remaining: number;
    } | undefined;

    if (activeReferral) {
      const purchased = getValidStudentCreditBalance(userId);
      return {
        canEvaluate: true,
        tier: 'PROMOTIONAL_AI30',
        freeEvaluationsRemaining: activeReferral.evaluations_remaining,
        purchasedCredits: purchased,
        instituteSponsored: false,
        hasPermanentFreeAccess: false,
        referralCode: activeReferral.referral_code,
        referralExpiry: activeReferral.expiry_date,
        referralRedemptionId: activeReferral.id,
        referralMaxEvaluations: activeReferral.max_evaluations ?? 15,
        referralEvaluationsUsed: activeReferral.evaluations_used ?? 0,
        referralEvaluationsRemaining: activeReferral.evaluations_remaining ?? 15,
        reason: `Promotional Offer Active (${activeReferral.referral_code} 1-Month Access, ${activeReferral.evaluations_remaining} Evaluations Remaining)`,
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
  const purchased = getValidStudentCreditBalance(userId);
  const freeRemaining = Math.max(0, 2 - freeUsed);

  // If evaluationSource is not explicitly set to PUBLIC (unspecified fallback), check institute sponsorship
  if (!evaluationSource) {
    const inst = db.prepare(`
      SELECT i.name, i.status, i.subscription_expires_at, i.id as institute_id
      FROM institutes i
      JOIN institute_memberships m ON m.institute_id = i.id
      WHERE m.student_id = ? AND m.status = 'ACTIVE' AND i.status = 'ACTIVE'
      LIMIT 1
    `).get(userId) as {
      name: string;
      status: string;
      subscription_expires_at?: string;
      institute_id: string;
    } | undefined;

    if (inst) {
      const notExpired = !inst.subscription_expires_at || new Date(inst.subscription_expires_at) > new Date();
      if (notExpired) {
        return {
          canEvaluate: true,
          tier: 'INSTITUTE_SPONSORED',
          freeEvaluationsRemaining: 9999,
          purchasedCredits: 9999,
          instituteSponsored: true,
          instituteName: inst.name,
          hasPermanentFreeAccess: false,
          reason: `Sponsored by ${inst.name}`,
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
    purchasedCredits: purchased,
    instituteSponsored: false,
    hasPermanentFreeAccess: false,
    reason: 'You have exhausted your free evaluations. Please purchase evaluation credits to continue.',
  };
}
