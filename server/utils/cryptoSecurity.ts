import crypto from 'node:crypto';

/**
 * Constant-time comparison of two strings to prevent timing attacks.
 * Safe against length mismatch and null/undefined values.
 */
export function safeTimingCompare(a: string | undefined | null, b: string | undefined | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    // Perform dummy timing-safe equal to mitigate timing discrepancy
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Computes a standard SHA-256 hash of an input string or buffer.
 */
export function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
