import { Request, Response, NextFunction } from 'express';

const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https?:\/\/localhost(:[0-9]+)?$/,
  /^https?:\/\/127\.0\.0\.1(:[0-9]+)?$/,
  /^https?:\/\/0\.0\.0\.0(:[0-9]+)?$/,
  /^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/,
  /^https:\/\/[a-z0-9-]+\.run\.app$/,
  /^https:\/\/(?:[a-z0-9-]+\.)?caexamcheckerai\.com$/,
];

// Add any explicitly configured custom origins from environment
const envAllowed = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim().toLowerCase())
  : [];

export function isOriginAllowed(origin?: string): boolean {
  if (!origin) {
    // Same-origin or server-to-server requests without Origin header are always permitted
    return true;
  }

  const clean = origin.trim().toLowerCase();

  // Check explicit environment origins
  if (envAllowed.includes(clean)) {
    return true;
  }

  // Check pattern whitelist
  return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(clean));
}

/**
 * Hardened CORS Middleware.
 * Prevents arbitrary credentialed cross-origin access by strictly validating the request origin.
 */
export function hardenedCorsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;

  if (origin) {
    res.setHeader('Vary', 'Origin');

    if (isOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Razorpay-Signature, X-Device-Id, X-Device-Trust-Token, X-Mfa-Session-Token'
      );
      res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
    } else if (req.method === 'OPTIONS') {
      // Reject cross-origin preflight from untrusted origin
      return res.status(403).json({ error: 'CORS origin not permitted.' });
    }
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
}
