import { db } from '../db.js';

export type SignupPlatform = 'APP' | 'WEB' | 'UNKNOWN';

export interface SignupPlatformRequestSignals {
  clientPlatform?: string | string[];
  userAgent?: string | string[];
  origin?: string | string[];
  referer?: string | string[];
}

function firstHeaderValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Classifies the client that initiated student registration.
 * Explicit client headers take precedence. The WebView fallback helps classify
 * already-installed Capacitor APKs that predate the explicit analytics header.
 * This is reporting metadata only and must never be used for authorization.
 */
export function resolveSignupPlatform(signals: SignupPlatformRequestSignals): SignupPlatform {
  const explicit = firstHeaderValue(signals.clientPlatform).toUpperCase();
  if (['APP', 'ANDROID_APP', 'IOS_APP', 'NATIVE_APP', 'CAPACITOR'].includes(explicit)) return 'APP';
  if (['WEB', 'BROWSER', 'WEBSITE'].includes(explicit)) return 'WEB';

  const userAgent = firstHeaderValue(signals.userAgent);
  const origin = firstHeaderValue(signals.origin).toLowerCase();
  const referer = firstHeaderValue(signals.referer).toLowerCase();

  if (
    /\bcapacitor\b|;\s*wv\)|\bwebview\b/i.test(userAgent) ||
    /^(capacitor|ionic):\/\//i.test(origin)
  ) {
    return 'APP';
  }

  const knownWebsite = /https?:\/\/(?:www\.)?caexamcheckerai\.com(?:[:/]|$)/i;
  if (knownWebsite.test(origin) || knownWebsite.test(referer)) return 'WEB';

  return 'UNKNOWN';
}

export interface StudentSignupPlatformCounts {
  app: number;
  web: number;
  unknown: number;
  total: number;
}

export interface StudentSignupPlatformRecord {
  role?: unknown;
  account_classification?: unknown;
  signup_platform?: unknown;
}

/**
 * Counts signup sources from a supplied account snapshot. Production callers
 * should pass the authoritative Firestore users collection rather than a
 * per-instance SQLite cache.
 */
export function countStudentSignupPlatformRecords(
  records: readonly StudentSignupPlatformRecord[],
): StudentSignupPlatformCounts {
  const students = records.filter((record) => {
    const role = String(record.role || '').trim().toUpperCase();
    const classification = String(record.account_classification || 'NORMAL').trim().toUpperCase();
    return role === 'STUDENT' && classification !== 'TEST';
  });

  const counts: StudentSignupPlatformCounts = { app: 0, web: 0, unknown: 0, total: students.length };
  for (const student of students) {
    const platform = String(student.signup_platform || 'UNKNOWN').trim().toUpperCase();
    if (platform === 'APP') counts.app += 1;
    else if (platform === 'WEB') counts.web += 1;
    else counts.unknown += 1;
  }
  return counts;
}

/**
 * Local-cache compatibility helper retained for existing tests and local tools.
 * Production dashboard counts should use countStudentSignupPlatformRecords with
 * a fresh Firestore account snapshot.
 */
export function getStudentSignupPlatformCounts(): StudentSignupPlatformCounts {
  const records = db.prepare(`
    SELECT role, account_classification, signup_platform
    FROM users
    WHERE role = 'STUDENT'
  `).all() as StudentSignupPlatformRecord[];
  return countStudentSignupPlatformRecords(records);
}
