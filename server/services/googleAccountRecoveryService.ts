import crypto from 'node:crypto';
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getAuth, UserRecord } from 'firebase-admin/auth';
import { db } from '../db.js';
import { loadAndValidateFirebaseConfig } from '../config/firebaseConfigValidator.js';
import {
  getAllFirestoreDocs,
  getFirestoreDb,
  getFirestoreDriverMode,
  isTombstoned,
} from './firestoreDbService.js';

const RECOVERY_AUTH_APP_NAME = 'ca-exam-checker-google-account-recovery';
const FIREBASE_AUTH_PAGE_SIZE = 1000;
const MAX_FIREBASE_AUTH_USERS_PER_SCAN = 50000;

export type GoogleAccountRecoveryStatus =
  | 'FIREBASE_ONLY'
  | 'CLOUD_RECORD_RECOVERABLE'
  | 'CLOUD_RECORD_INCOMPLETE'
  | 'PREVIOUSLY_DELETED'
  | 'ROLE_CONFLICT';

export interface GoogleAccountRecoveryCandidate {
  email: string;
  displayName: string;
  firebaseCreatedAt: string | null;
  lastSignInAt: string | null;
  status: GoogleAccountRecoveryStatus;
  statusMessage: string;
}

export interface GoogleAccountRecoveryReport {
  success: true;
  scannedFirebaseUsers: number;
  googleAccountsFound: number;
  candidates: GoogleAccountRecoveryCandidate[];
  counts: Record<GoogleAccountRecoveryStatus, number>;
  scanComplete: boolean;
  nextPageToken?: string;
}

function getRecoveryFirebaseApp(): App {
  const { config } = loadAndValidateFirebaseConfig();
  if (!config.projectId) throw new Error('Firebase project ID is not configured.');

  const existing = getApps().find((app) => app.options.projectId === config.projectId);
  if (existing) return existing;

  return initializeApp({ projectId: config.projectId }, RECOVERY_AUTH_APP_NAME);
}

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function isGoogleProvider(user: UserRecord): boolean {
  return (user.providerData || []).some((provider) => provider.providerId === 'google.com');
}

function getSocialStudentId(uid: string): string {
  return `usr_social_${crypto.createHash('sha256').update(uid).digest('hex').slice(0, 24)}`;
}

export function classifyGoogleAccountRecoveryState(input: {
  expectedEmail: string;
  localRole?: string | null;
  cloudUsers: Array<Record<string, any>>;
  cloudProfile?: Record<string, any> | null;
  cloudTombstoned?: boolean;
  firebaseIdentityTombstoned?: boolean;
}): { status: GoogleAccountRecoveryStatus | null; statusMessage: string } {
  if (input.localRole) {
    if (String(input.localRole).toUpperCase() !== 'STUDENT') {
      return {
        status: 'ROLE_CONFLICT',
        statusMessage: 'A platform account already exists for this email with a non-student role. No automatic recovery is allowed.',
      };
    }
    return { status: null, statusMessage: 'The student is already present in the platform registry.' };
  }

  if (input.cloudUsers.length > 1) {
    return {
      status: 'CLOUD_RECORD_INCOMPLETE',
      statusMessage: 'Multiple cloud student records match this email. Manual identity review is required; no record was changed.',
    };
  }

  if (input.cloudUsers.length === 1) {
    const cloudUser = input.cloudUsers[0];
    const cloudUserId = String(cloudUser.id || cloudUser.userId || '').trim();
    const profile = input.cloudProfile;
    const complete =
      cloudUserId.length > 0 &&
      normalizeEmail(cloudUser.email) === normalizeEmail(input.expectedEmail) &&
      String(cloudUser.role || '').toUpperCase() === 'STUDENT' &&
      typeof cloudUser.password_hash === 'string' &&
      cloudUser.password_hash.length > 0 &&
      String(cloudUser.full_name || '').trim().length >= 2 &&
      Boolean(profile) &&
      String(profile?.user_id || '') === cloudUserId &&
      Boolean(String(profile?.icai_registration_number || '').trim()) &&
      String(profile?.icai_registration_number || '').trim().toUpperCase() !== 'REG-PENDING' &&
      ['FOUNDATION', 'INTERMEDIATE', 'FINAL'].includes(String(profile?.ca_level || '').toUpperCase());

    if (!complete) {
      return {
        status: 'CLOUD_RECORD_INCOMPLETE',
        statusMessage: 'A cloud record exists, but its student/profile data is incomplete or inconsistent. Automatic recovery is blocked to protect existing account data.',
      };
    }
    if (input.cloudTombstoned) {
      return {
        status: 'PREVIOUSLY_DELETED',
        statusMessage: 'A deletion tombstone exists for this account. Recovery is blocked to prevent deleted-account resurrection.',
      };
    }
    return {
      status: 'CLOUD_RECORD_RECOVERABLE',
      statusMessage: 'A complete student account already exists in Firestore and can be restored into the Admin account registry without creating a new identity.',
    };
  }

  if (input.firebaseIdentityTombstoned) {
    return {
      status: 'PREVIOUSLY_DELETED',
      statusMessage: 'This Firebase identity maps to a previously deleted platform account. It must not be recreated automatically.',
    };
  }
  return {
    status: 'FIREBASE_ONLY',
    statusMessage: 'Google Authentication has this verified identity, but no platform user or cloud student record exists. The student must sign in again with this same Google account and accept the current legal documents before a platform profile can be created.',
  };
}

function toCandidate(
  authUser: UserRecord,
  status: GoogleAccountRecoveryStatus,
  statusMessage: string,
): GoogleAccountRecoveryCandidate {
  return {
    email: normalizeEmail(authUser.email),
    displayName: String(authUser.displayName || 'CA Student').trim() || 'CA Student',
    firebaseCreatedAt: authUser.metadata?.creationTime || null,
    lastSignInAt: authUser.metadata?.lastSignInTime || null,
    status,
    statusMessage,
  };
}

async function assertAuthoritativeFirestoreAvailable(): Promise<void> {
  if (!getFirestoreDb() || getFirestoreDriverMode() !== 'ADMIN_SDK') {
    throw new Error('Google-account recovery requires the authoritative Firebase Admin Firestore connection. No recovery scan was performed.');
  }
}

/**
 * Lists verified Google identities that are not fully represented in the
 * platform's local SQL account registry. This is a read-only Admin diagnostic:
 * it never creates users, grants credits, or changes evaluation records.
 */
export async function scanUnlinkedGoogleAccounts(options: {
  pageToken?: string;
  maxUsers?: number;
} = {}): Promise<GoogleAccountRecoveryReport> {
  await assertAuthoritativeFirestoreAvailable();

  const auth = getAuth(getRecoveryFirebaseApp());
  const maxUsers = Math.min(
    MAX_FIREBASE_AUTH_USERS_PER_SCAN,
    Math.max(FIREBASE_AUTH_PAGE_SIZE, Number(options.maxUsers) || MAX_FIREBASE_AUTH_USERS_PER_SCAN),
  );

  const [cloudUsers, cloudProfiles] = await Promise.all([
    getAllFirestoreDocs<Record<string, any>>('users', { failOnError: true }),
    getAllFirestoreDocs<Record<string, any>>('student_profiles', { failOnError: true }),
  ]);

  if (getFirestoreDriverMode() !== 'ADMIN_SDK') {
    throw new Error('Authoritative Firestore access was lost during the recovery scan. Results were discarded.');
  }

  const localUsers = db.prepare(
    `SELECT id, email, full_name, role, status FROM users WHERE lower(email) <> ''`
  ).all() as Array<{ id: string; email: string; full_name: string; role: string; status: string }>;

  const localByEmail = new Map(localUsers.map((user) => [normalizeEmail(user.email), user]));
  const cloudUsersByEmail = new Map<string, Record<string, any>[]>();
  for (const user of cloudUsers) {
    const email = normalizeEmail(user.email);
    if (!email) continue;
    const matches = cloudUsersByEmail.get(email) || [];
    matches.push(user);
    cloudUsersByEmail.set(email, matches);
  }
  const profilesByUserId = new Map<string, Record<string, any>>();
  for (const profile of cloudProfiles) {
    const userId = String(profile.user_id || profile.id || '').trim();
    if (userId) profilesByUserId.set(userId, profile);
  }

  const candidates: GoogleAccountRecoveryCandidate[] = [];
  let pageToken = options.pageToken;
  let scannedFirebaseUsers = 0;
  let googleAccountsFound = 0;
  let nextPageToken: string | undefined;

  while (scannedFirebaseUsers < maxUsers) {
    const pageSize = Math.min(FIREBASE_AUTH_PAGE_SIZE, maxUsers - scannedFirebaseUsers);
    const page = await auth.listUsers(pageSize, pageToken);
    scannedFirebaseUsers += page.users.length;

    for (const authUser of page.users) {
      if (!isGoogleProvider(authUser) || !authUser.email || !authUser.emailVerified || authUser.disabled) continue;
      googleAccountsFound += 1;
      const email = normalizeEmail(authUser.email);
      const local = localByEmail.get(email);
      const cloudMatches = cloudUsersByEmail.get(email) || [];

      if (local) {
        const classification = classifyGoogleAccountRecoveryState({
          expectedEmail: email,
          localRole: local.role,
          cloudUsers: cloudMatches,
        });
        if (classification.status) {
          candidates.push(toCandidate(authUser, classification.status, classification.statusMessage));
        }
        continue;
      }

      if (cloudMatches.length > 0) {
        const cloudUserId = String(cloudMatches[0]?.id || cloudMatches[0]?.userId || '').trim();
        const cloudProfile = cloudUserId ? profilesByUserId.get(cloudUserId) : undefined;
        const cloudTombstoned = cloudUserId
          ? await isTombstoned('users', cloudUserId) || await isTombstoned('student_profiles', cloudUserId)
          : false;
        const classification = classifyGoogleAccountRecoveryState({
          expectedEmail: email,
          cloudUsers: cloudMatches,
          cloudProfile,
          cloudTombstoned,
        });
        if (classification.status) {
          candidates.push(toCandidate(authUser, classification.status, classification.statusMessage));
        }
        continue;
      }

      const socialUserId = getSocialStudentId(authUser.uid);
      const identityTombstoned =
        await isTombstoned('users', socialUserId) ||
        await isTombstoned('student_profiles', socialUserId);
      const classification = classifyGoogleAccountRecoveryState({
        expectedEmail: email,
        cloudUsers: [],
        firebaseIdentityTombstoned: identityTombstoned,
      });
      if (classification.status) {
        candidates.push(toCandidate(authUser, classification.status, classification.statusMessage));
      }
    }

    if (!page.nextPageToken) {
      nextPageToken = undefined;
      break;
    }
    pageToken = page.nextPageToken;
    nextPageToken = page.nextPageToken;
  }

  const counts: Record<GoogleAccountRecoveryStatus, number> = {
    FIREBASE_ONLY: 0,
    CLOUD_RECORD_RECOVERABLE: 0,
    CLOUD_RECORD_INCOMPLETE: 0,
    PREVIOUSLY_DELETED: 0,
    ROLE_CONFLICT: 0,
  };
  for (const candidate of candidates) counts[candidate.status] += 1;

  return {
    success: true,
    scannedFirebaseUsers,
    googleAccountsFound,
    candidates,
    counts,
    scanComplete: !nextPageToken,
    nextPageToken,
  };
}

/** Confirms that a requested recovery email belongs to a verified Google identity. */
export async function getVerifiedFirebaseGoogleAccountByEmail(emailValue: string): Promise<UserRecord | null> {
  const email = normalizeEmail(emailValue);
  if (!email) return null;
  try {
    const user = await getAuth(getRecoveryFirebaseApp()).getUserByEmail(email);
    return isGoogleProvider(user) && user.emailVerified && !user.disabled ? user : null;
  } catch (error: any) {
    if (error?.code === 'auth/user-not-found') return null;
    throw error;
  }
}
