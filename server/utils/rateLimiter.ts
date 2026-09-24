import { Request, Response, NextFunction } from 'express';

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
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

/**
 * Creates an Express rate-limiting middleware using a high-performance in-memory store.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = 'Too many requests. Please slow down and try again later.',
    keyGenerator = (req: Request) => getClientIp(req),
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();

    let record = memoryStore.get(key);
    if (!record || record.resetAt <= now) {
      record = {
        count: 1,
        resetAt: now + windowMs,
      };
      memoryStore.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.ceil((record.resetAt - now) / 1000);

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetSeconds));

    if (record.count > max) {
      res.setHeader('Retry-After', String(resetSeconds));
      return res.status(429).json({
        error: message,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds: resetSeconds,
      });
    }

    next();
  };
}

// 1. Login Protection: 10 attempts per 15 minutes per IP and email combination
export const authLoginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts from this network. Please wait 15 minutes before trying again.',
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const email = (req.body?.email || '').toLowerCase().trim();
    return `login:${ip}:${email || 'none'}`;
  },
});

// 2. Account Registration: 10 registrations per hour per IP
export const authRegisterRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many accounts registered from this IP. Please try again later.',
  keyGenerator: (req) => `reg:${getClientIp(req)}`,
});

// 3. Password Reset: 5 requests per 15 minutes per IP and email
export const passwordResetRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many password reset requests. Please wait 15 minutes before submitting another request.',
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const email = (req.body?.email || '').toLowerCase().trim();
    return `pwd_reset:${ip}:${email || 'none'}`;
  },
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
