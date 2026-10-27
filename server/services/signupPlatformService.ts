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

/**
 * Counts student accounts by recorded signup source. Synthetic/test accounts
 * are excluded. Legacy records without source metadata remain in UNKNOWN.
 */
export function getStudentSignupPlatformCounts(): StudentSignupPlatformCounts {
  const result = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN UPPER(COALESCE(signup_platform, 'UNKNOWN')) = 'APP' THEN 1 ELSE 0 END) AS app,
      SUM(CASE WHEN UPPER(COALESCE(signup_platform, 'UNKNOWN')) = 'WEB' THEN 1 ELSE 0 END) AS web,
      SUM(CASE WHEN UPPER(COALESCE(signup_platform, 'UNKNOWN')) NOT IN ('APP', 'WEB') THEN 1 ELSE 0 END) AS unknown
    FROM users
    WHERE role = 'STUDENT'
      AND COALESCE(account_classification, 'NORMAL') <> 'TEST'
  `).get() as { total?: number; app?: number; web?: number; unknown?: number };

  return {
    app: Number(result.app || 0),
    web: Number(result.web || 0),
    unknown: Number(result.unknown || 0),
    total: Number(result.total || 0),
  };
}
