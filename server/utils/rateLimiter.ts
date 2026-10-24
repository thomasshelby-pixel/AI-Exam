import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { getApps as getAdminApps, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, type Firestore as AdminFirestore } from 'firebase-admin/firestore';
import { loadAndValidateFirebaseConfig } from '../config/firebaseConfigValidator.js';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitRecord>();

// Garbage collect expired rate limit records periodically every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (record.resetAt <= now) {
      memoryStore.delete(key);
    }
  }
}, 2 * 60 * 1000).unref();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  /** Use a shared Firestore counter for security-sensitive routes in production. */
  sharedStore?: boolean;
}

export function getClientIp(req: Request): string {
  // Express derives req.ip using the application's configured trusted-proxy
  // policy. Do not parse X-Forwarded-For directly: clients can supply that
  // header, and trusting its left-most value lets them rotate rate-limit keys.
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

function getNormalizedBodyEmail(req: Request): string {
  const email = req.body?.email;
  return typeof email === 'string' ? email.toLowerCase().trim() : '';
}

let sharedRateLimitFirestore: AdminFirestore | null = null;
let lastSharedRateLimitCleanupAt = 0;
let sharedRateLimitCleanupInFlight = false;

function getSharedRateLimitFirestore(): AdminFirestore {
  if (sharedRateLimitFirestore) return sharedRateLimitFirestore;
  const { config } = loadAndValidateFirebaseConfig();
  const appName = 'ca-exam-shared-rate-limits';
  let app = getAdminApps().find((candidate) => candidate.name === appName);
  if (!app) {
    app = initializeAdminApp({ projectId: config.projectId }, appName);
  }
  sharedRateLimitFirestore = config.firestoreDatabaseId
    ? getAdminFirestore(app, config.firestoreDatabaseId)
    : getAdminFirestore(app);
  return sharedRateLimitFirestore;
}

async function cleanupExpiredSharedRateLimits(firestore: AdminFirestore): Promise<void> {
  const now = Date.now();
  if (sharedRateLimitCleanupInFlight || now - lastSharedRateLimitCleanupAt < 10 * 60 * 1000) return;
  lastSharedRateLimitCleanupAt = now;
  sharedRateLimitCleanupInFlight = true;
  try {
    // Keep the shared counter collection bounded even if Firestore TTL is not configured.
    const expired = await firestore.collection('api_rate_limit_counters')
      .where('expiresAt', '<=', new Date(now))
      .limit(200)
      .get();
    if (!expired.empty) {
      const batch = firestore.batch();
      expired.docs.forEach((document) => batch.delete(document.ref));
      await batch.commit();
    }
  } catch (error: any) {
    console.warn('[RateLimiter] Shared counter cleanup failed:', error?.message || 'unknown error');
  } finally {
    sharedRateLimitCleanupInFlight = false;
  }
}

interface ConsumedRateLimitRecord {
  count: number;
  resetAt: number;
}

async function consumeSharedRateLimit(
  key: string,
  windowMs: number,
): Promise<ConsumedRateLimitRecord> {
  const firestore = getSharedRateLimitFirestore();
  void cleanupExpiredSharedRateLimits(firestore);
  // Hash the key so raw IP addresses and email addresses are never stored in Firestore.
  const docId = crypto.createHash('sha256').update('api-rate-limit:' + key).digest('hex');
  const reference = firestore.collection('api_rate_limit_counters').doc(docId);
  const now = Date.now();
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const previous = snapshot.exists ? snapshot.data() : undefined;
    const previousReset = Number(previous?.resetAt);
    const activeWindow = previous && Number.isFinite(previousReset) && previousReset > now;
    const count = activeWindow ? Number(previous?.count || 0) + 1 : 1;
    const resetAt = activeWindow ? previousReset : now + windowMs;
    transaction.set(reference, {
      count,
      resetAt,
      expiresAt: new Date(resetAt + windowMs),
      updatedAt: new Date(now),
    });
    return { count, resetAt };
  });
}

function applyRateLimitResult(
  record: ConsumedRateLimitRecord,
  max: number,
  message: string,
  res: Response,
  next: NextFunction,
): void {
  const resetSeconds = Math.max(1, Math.ceil((record.resetAt - Date.now()) / 1000));
  const remaining = Math.max(0, max - record.count);
  res.setHeader('RateLimit-Limit', String(max));
  res.setHeader('RateLimit-Remaining', String(remaining));
  res.setHeader('RateLimit-Reset', String(resetSeconds));
  if (record.count > max) {
    res.setHeader('Retry-After', String(resetSeconds));
    res.status(429).json({
      error: message,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfterSeconds: resetSeconds,
    });
    return;
  }
  next();
}

/**
 * Creates a rate limiter. Security-sensitive endpoints use a transactional shared
 * Firestore store in production so counters are consistent across server instances.
 * In development/tests, the isolated in-memory store avoids requiring cloud config.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = 'Too many requests. Please slow down and try again later.',
    keyGenerator = (req: Request) => getClientIp(req),
    sharedStore = false,
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();

    if (sharedStore && process.env.NODE_ENV === 'production') {
      void consumeSharedRateLimit(key, windowMs)
        .then((record) => applyRateLimitResult(record, max, message, res, next))
        .catch((error: any) => {
          // Fail closed for authentication and OTP endpoints: no unprotected fallback
          // to per-instance memory if the shared security store is unavailable.
          console.error('[RateLimiter] Shared security store unavailable:', error?.message || 'unknown error');
          if (!res.headersSent) {
            res.status(503).json({
              error: 'Security verification is temporarily unavailable. Please try again shortly.',
              code: 'RATE_LIMIT_STORE_UNAVAILABLE',
            });
          }
        });
      return;
    }

    let record = memoryStore.get(key);
    if (!record || record.resetAt <= now) {
      record = { count: 1, resetAt: now + windowMs };
      memoryStore.set(key, record);
    } else {
      record.count += 1;
    }

    applyRateLimitResult(record, max, message, res, next);
  };
}

// 1. Login Protection: 10 attempts per 15 minutes per IP and email combination
export const authLoginRateLimiter = createRateLimiter({
  sharedStore: true,
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts from this network. Please wait 15 minutes before trying again.',
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const email = getNormalizedBodyEmail(req);
    return `login:${ip}:${email || 'none'}`;
  },
});

// 2. Account Registration: 10 registrations per hour per IP
export const authRegisterRateLimiter = createRateLimiter({
  sharedStore: true,
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many accounts registered from this IP. Please try again later.',
  keyGenerator: (req) => `reg:${getClientIp(req)}`,
});

// 2b. OTP Verification: 15 verification attempts per 5 minutes per IP and email.
// The OTP challenge itself still expires after 10 minutes.
export const otpVerifyRateLimiter = createRateLimiter({
  sharedStore: true,
  windowMs: 5 * 60 * 1000,
  max: 15,
  message: 'Too many verification attempts. Please wait 5 minutes before trying again.',
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const email = (req.body?.email || '').toLowerCase().trim();
    return `otp_verify:${ip}:${email || 'none'}`;
  },
});

// 2c. OTP Resend: 5 resend requests per 15 minutes per IP and email
export const otpResendRateLimiter = createRateLimiter({
  sharedStore: true,
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many verification code requests. Please wait a few minutes before requesting another code.',
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const email = (req.body?.email || '').toLowerCase().trim();
    return `otp_resend:${ip}:${email || 'none'}`;
  },
});

// 3. Password Reset: 5 requests per 15 minutes per IP and email
export const passwordResetRateLimiter = createRateLimiter({
  sharedStore: true,
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many password reset requests. Please wait 15 minutes before submitting another request.',
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const email = (req.body?.email || '').toLowerCase().trim();
    return `pwd_reset:${ip}:${email || 'none'}`;
  },
});

// 3b. Password reset-token verification: 5 requests per 5 minutes per IP and email.
export const passwordResetTokenVerifyRateLimiter = createRateLimiter({
  sharedStore: true,
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: 'Too many password reset link verification requests. Please wait 5 minutes before trying again.',
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const email = (req.body?.email || '').toLowerCase().trim();
    return `pwd_reset_verify:${ip}:${email || 'none'}`;
  },
});

// MFA challenge and recovery-code verification: 20 attempts per 15 minutes per IP,
// backed by the same transactional Firestore counter across production instances.
export const mfaVerificationRateLimiter = createRateLimiter({
  sharedStore: true,
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many MFA verification requests from this network. Please wait 15 minutes.',
  keyGenerator: (req) => `mfa_verify:${getClientIp(req)}`,
});

// MFA enrollment OTP verification: global per-IP cap plus a per-user failed-attempt lockout.
export const mfaEnrollmentVerifyRateLimiter = createRateLimiter({
  sharedStore: true,
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many authenticator verification requests from this network. Please wait 15 minutes.',
  keyGenerator: (req) => `mfa_enroll_verify:${getClientIp(req)}`,
});

// 4. Promo Redemption: 6 attempts per 10 minutes per student
export const promoRedeemRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 6,
  message: 'Too many promo code attempts. Please wait 10 minutes before trying another code.',
  keyGenerator: (req) => {
    const userId = (req as any).user?.id || getClientIp(req);
    return `promo:${userId}`;
  },
});

// 5. Payment Order Creation: 15 orders per 10 minutes
export const paymentOrderRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 15,
  message: 'Too many payment order requests. Please complete your existing pending order or wait a few minutes.',
  keyGenerator: (req) => {
    const userId = (req as any).user?.id || getClientIp(req);
    return `pay_order:${userId}`;
  },
});

// 6. Review Voting: 30 votes per minute
export const reviewVoteRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'You are voting too quickly. Please pause before voting again.',
  keyGenerator: (req) => {
    const userId = (req as any).user?.id || getClientIp(req);
    return `rev_vote:${userId}`;
  },
});

// 7. Support Contact Form: 5 tickets per 15 minutes
export const contactTicketRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many support tickets submitted. Our team will get back to you shortly.',
  keyGenerator: (req) => `contact:${getClientIp(req)}`,
});

// 8. Student AI Evaluation Submissions: 10 submissions per 5 minutes
export const evaluationSubmissionRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: 'Evaluation submission rate limit reached. Please allow in-progress evaluations to complete before submitting more.',
  keyGenerator: (req) => {
    const userId = (req as any).user?.id || getClientIp(req);
    return `eval_sub:${userId}`;
  },
});

// 9. MFA Recovery Request: 3 recovery requests per 15 minutes per IP
export const mfaRecoveryRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: 'Too many recovery requests submitted. Please wait 15 minutes before submitting another request.',
  keyGenerator: (req) => `mfa_recovery:${getClientIp(req)}`,
});

