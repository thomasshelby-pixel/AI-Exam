/**
 * Global Timezone Utilities for Server (CA Exam Checker AI)
 * Canonical Application Timezone: Asia/Kolkata (Indian Standard Time, IST, UTC+05:30)
 * Canonical Locale: en-IN
 */

export const APPLICATION_TIMEZONE = 'Asia/Kolkata';
export const APPLICATION_LOCALE = 'en-IN';

export function parseDateSafe(dateOrIsoString: string | number | Date | null | undefined): Date | null {
  if (dateOrIsoString === null || dateOrIsoString === undefined || dateOrIsoString === '') {
    return null;
  }
  const d = new Date(dateOrIsoString);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDateTimeIST(
  dateOrIsoString: string | number | Date | null | undefined,
  includeSeconds: boolean = true
): string {
  const d = parseDateSafe(dateOrIsoString);
  if (!d) return '—';

  const options: Intl.DateTimeFormatOptions = {
    timeZone: APPLICATION_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };

  if (includeSeconds) {
    options.second = '2-digit';
  }

  const raw = new Intl.DateTimeFormat(APPLICATION_LOCALE, options).format(d);
  const normalized = raw
    .replace(/\b(am|pm)\b/gi, (match) => match.toUpperCase())
    .replace(/\s+IST/gi, '');

  return `${normalized} IST`;
}

export function formatDateIST(dateOrIsoString: string | number | Date | null | undefined): string {
  const d = parseDateSafe(dateOrIsoString);
  if (!d) return '—';

  return new Intl.DateTimeFormat(APPLICATION_LOCALE, {
    timeZone: APPLICATION_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatTimeIST(
  dateOrIsoString: string | number | Date | null | undefined,
  includeSeconds: boolean = true
): string {
  const d = parseDateSafe(dateOrIsoString);
  if (!d) return '—';

  const options: Intl.DateTimeFormatOptions = {
    timeZone: APPLICATION_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };

  if (includeSeconds) {
    options.second = '2-digit';
  }

  const raw = new Intl.DateTimeFormat(APPLICATION_LOCALE, options).format(d);
  const normalized = raw
    .replace(/\b(am|pm)\b/gi, (match) => match.toUpperCase())
    .replace(/\s+IST/gi, '');

  return `${normalized} IST`;
}

export function formatAuditTimestampIST(
  dateOrIsoString: string | number | Date | null | undefined
): string {
  return formatDateTimeIST(dateOrIsoString, true);
}
