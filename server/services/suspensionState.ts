function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  let parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return parsed;

  // SQLite CURRENT_TIMESTAMP commonly uses "YYYY-MM-DD HH:mm:ss" without a timezone.
  const normalized = value.trim().replace(' ', 'T');
  parsed = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? normalized : `${normalized}Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A stale Firestore REINSTATED ledger document must not undo a newer local
 * administrator suspension. An explicit, newer REINSTATED event is allowed.
 */
export function shouldPreserveLocalSuspension(
  localStatus: string | null | undefined,
  localUpdatedAt: string | null | undefined,
  incomingStatus: string | null | undefined,
  incomingUpdatedAt: string | null | undefined,
): boolean {
  if (String(localStatus || '').toUpperCase() !== 'SUSPENDED') return false;
  if (String(incomingStatus || '').toUpperCase() === 'SUSPENDED') return false;

  const localTime = parseTimestamp(localUpdatedAt);
  const incomingTime = parseTimestamp(incomingUpdatedAt);

  // With no authoritative time on the incoming document, fail closed and keep the ban.
  if (incomingTime === null) return true;
  if (localTime === null) return false;
  return localTime >= incomingTime;
}
