import crypto from 'node:crypto';
import {
  getFirestoreDb,
  getFirestoreDoc,
  getFirestoreDriverMode,
  setFirestoreDoc,
} from './firestoreDbService.js';

export type GoogleAuthActivityPlatform = 'APP' | 'WEB' | 'UNKNOWN';

export interface RecordUnlinkedGoogleAuthAttemptInput {
  firebaseUid: string;
  email: string;
  displayName?: string | null;
  platform?: GoogleAuthActivityPlatform;
  outcome: 'LEGAL_CONSENT_REQUIRED' | 'LEGAL_VERSION_CHANGED' | 'SOCIAL_ACCOUNT_SYNC_PENDING';
}

function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return clean ? clean.slice(0, maxLength) : null;
}

function safeCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.min(Math.floor(parsed), 2_147_483_647)
    : 0;
}

/**
 * Stores minimal, verified Google sign-in backend metadata for identities that
 * have not yet become platform student accounts. No tokens, IP addresses,
 * passwords, uploaded content or raw user-agent strings are stored.
 */
export async function recordUnlinkedGoogleAuthAttempt(
  input: RecordUnlinkedGoogleAuthAttemptInput,
): Promise<boolean> {
  const firebaseUid = safeText(input.firebaseUid, 160);
  const email = safeText(input.email, 254)?.toLowerCase() || null;
  if (!firebaseUid || !email) return false;

  if (!getFirestoreDb() || getFirestoreDriverMode() !== 'ADMIN_SDK') return false;

  const rawPlatform = String(input.platform || '').toUpperCase();
  const platform: GoogleAuthActivityPlatform =
    rawPlatform === 'APP' || rawPlatform === 'WEB' ? rawPlatform : 'UNKNOWN';
  const documentId = `uga_${crypto.createHash('sha256').update(firebaseUid).digest('hex').slice(0, 40)}`;
  const now = new Date().toISOString();

  const previous = await getFirestoreDoc<Record<string, any>>(
    'unlinked_google_auth_activity',
    documentId,
    { failOnError: true },
  );
  if (getFirestoreDriverMode() !== 'ADMIN_SDK') return false;

  const previousEvents = Array.isArray(previous?.recent_attempts)
    ? previous!.recent_attempts.filter((item: any) =>
        item && typeof item.at === 'string' && typeof item.platform === 'string' && typeof item.outcome === 'string')
    : [];
  const previousCount = safeCount(previous?.attempt_count);
  const previousApp = safeCount(previous?.app_attempt_count);
  const previousWeb = safeCount(previous?.web_attempt_count);
  const previousUnknown = safeCount(previous?.unknown_attempt_count);
  const event = {
    at: now,
    platform,
    outcome: input.outcome,
  };

  const payload = {
    id: documentId,
    firebase_uid: firebaseUid,
    email,
    display_name: safeText(input.displayName, 200) || 'CA Student',
    provider: 'google',
    first_seen_at: safeText(previous?.first_seen_at, 64) || now,
    last_attempt_at: now,
    last_platform: platform,
    last_outcome: input.outcome,
    attempt_count: Math.min(previousCount + 1, 2_147_483_647),
    app_attempt_count: Math.min(previousApp + (platform === 'APP' ? 1 : 0), 2_147_483_647),
    web_attempt_count: Math.min(previousWeb + (platform === 'WEB' ? 1 : 0), 2_147_483_647),
    unknown_attempt_count: Math.min(previousUnknown + (platform === 'UNKNOWN' ? 1 : 0), 2_147_483_647),
    recent_attempts: [...previousEvents, event].slice(-20),
  };

  const saved = await setFirestoreDoc('unlinked_google_auth_activity', documentId, payload);
  return saved && getFirestoreDriverMode() === 'ADMIN_SDK';
}
