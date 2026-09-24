import { Request, Response, NextFunction } from 'express';

export function applySecurityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  // Prevent MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent legacy reflected XSS in older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Strict Referrer Policy: Send full URL on same-origin, only origin on cross-origin HTTPS, no referrer on downgrade
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict unnecessary browser features
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Anti-clickjacking / framing: allow AI Studio preview while blocking unauthorized third-party embeds
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://*.google.com https://*.googleusercontent.com;"
  );

  // Enable HSTS in production or HTTPS environments
  if (process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Prevent caching of sensitive dynamic API responses
  if (req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  // Remove Express fingerprinting header
  res.removeHeader('X-Powered-By');

  next();
}
