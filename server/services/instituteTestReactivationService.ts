import { db, isTombstoned as isLocalTombstoned } from '../db.js';
import {
  getFirestoreDb,
  getFirestoreDoc,
  queryFirestoreDocs,
  setFirestoreDoc,
  isTombstoned as isCloudTombstoned,
  recordTombstone,
  deleteFirestoreDoc,
} from './firestoreDbService.js';
import { isConfiguredInstituteTestAccountMfaBypass } from './mfaTestAccountBypass.js';

export type TestInstituteReactivationResult =
  | 'prepared'
  | 'not-eligible'
  | 'conflict'
  | 'unconfigured'
  | 'failed';

export type TestInstituteTrialClaimResetResult = 'cleared' | 'not-eligible' | 'failed';

export interface TestInstituteReactivationAdapter {
  isConfigured(): boolean;
  findInstitutesByEmail(email: string): Promise<Array<Record<string, any>>>;
  findUsersByEmail(email: string): Promise<Array<Record<string, any>>>;
  isUserTombstoned(userId: string): Promise<boolean>;
  setUserDocument(userId: string, data: Record<string, any>): Promise<boolean>;
  getUserDocument(userId: string): Promise<Record<string, any> | null>;
  findTrialClaimsByEmail(email: string): Promise<Array<Record<string, any>>>;
  tombstoneTrialClaim(claimId: string): Promise<boolean>;
  deleteTrialClaim(claimId: string): Promise<boolean>;
}

const defaultAdapter: TestInstituteReactivationAdapter = {
  isConfigured: () => {
    try {
      return getFirestoreDb() !== null;
    } catch {
      return false;
    }
  },
  findInstitutesByEmail: (email) => queryFirestoreDocs<Record<string, any>>(
    'institutes',
    [{ field: 'email', op: '==', value: email }],
    { failOnError: true },
  ),
  findUsersByEmail: (email) => queryFirestoreDocs<Record<string, any>>(
    'users',
    [{ field: 'email', op: '==', value: email }],
    { failOnError: true },
  ),
  isUserTombstoned: (userId) => isCloudTombstoned('users', userId),
  setUserDocument: (userId, data) => setFirestoreDoc('users', userId, data),
  getUserDocument: (userId) => getFirestoreDoc<Record<string, any>>('users', userId, { failOnError: true }),
  findTrialClaimsByEmail: (email) => queryFirestoreDocs<Record<string, any>>(
    'institute_trial_claims',
    [{ field: 'admin_email', op: '==', value: email }],
    { failOnError: true },
  ),
  tombstoneTrialClaim: (claimId) => recordTombstone(
    'institute_trial_claims',
    claimId,
    'TEST_INSTITUTE_ACCOUNT_REACTIVATED_FOR_REREGISTRATION',
    { failOnError: true },
  ),
  deleteTrialClaim: (claimId) => deleteFirestoreDoc('institute_trial_claims', claimId),
};

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

/**
 * A narrowly scoped repair for the one explicitly configured test Institute Admin.
 * It may reuse an orphaned admin identity only when the local institute profile is
 * absent, the cloud institute profile is absent, and no conflicting/tombstoned
 * account identity exists. Regular institute registrations are never affected.
 */
export async function prepareOrphanedTestInstituteAdminForRegistration(
  params: {
    email: string;
    userId: string;
    userRecord: Record<string, any>;
  },
  adapter: TestInstituteReactivationAdapter = defaultAdapter,
): Promise<TestInstituteReactivationResult> {
  const email = normalizeEmail(params.email);
  const userId = String(params.userId || '').trim();
  const userRecord = params.userRecord;

  if (
    !email ||
    !userId ||
    !isConfiguredInstituteTestAccountMfaBypass({
      email,
      role: 'INSTITUTE_ADMIN',
      status: 'ACTIVE',
    })
  ) return 'not-eligible';

  try {
    if (!adapter.isConfigured()) return 'unconfigured';

    const localUser = db.prepare(
      'SELECT id, email, role, status FROM users WHERE id = ? LIMIT 1'
    ).get(userId) as any;
    if (
      !localUser ||
      normalizeEmail(localUser.email) !== email ||
      String(localUser.role || '').toUpperCase() !== 'INSTITUTE_ADMIN' ||
      String(localUser.status || '').toUpperCase() !== 'ACTIVE' ||
      normalizeEmail(userRecord?.email) !== email ||
      String(userRecord?.id || '') !== userId ||
      String(userRecord?.role || '').toUpperCase() !== 'INSTITUTE_ADMIN' ||
      String(userRecord?.status || '').toUpperCase() !== 'ACTIVE' ||
      typeof userRecord?.password_hash !== 'string' ||
      !userRecord.password_hash
    ) return 'conflict';

    const localInstitute = db.prepare(
      'SELECT id FROM institutes WHERE lower(email) = ? LIMIT 1'
    ).get(email);
    if (localInstitute || isLocalTombstoned('users', userId)) return 'conflict';

    const [cloudInstitutes, cloudUsers] = await Promise.all([
      adapter.findInstitutesByEmail(email),
      adapter.findUsersByEmail(email),
    ]);
    if (cloudInstitutes.length > 0 || cloudUsers.length > 1) return 'conflict';
    if (cloudUsers.length === 1) {
      const cloudUser = cloudUsers[0];
      if (
        String(cloudUser.id || '') !== userId ||
        normalizeEmail(cloudUser.email) !== email ||
        String(cloudUser.role || '').toUpperCase() !== 'INSTITUTE_ADMIN'
      ) return 'conflict';
    }
    if (await adapter.isUserTombstoned(userId)) return 'conflict';

    // Re-apply the new password/profile to the same orphaned admin document.
    // Reusing the exact user ID avoids creating a second cloud identity for this email.
    if (!await adapter.setUserDocument(userId, userRecord)) return 'failed';
    const readBack = await adapter.getUserDocument(userId);
    if (
      !readBack ||
      String(readBack.id || '') !== userId ||
      normalizeEmail(readBack.email) !== email ||
      String(readBack.role || '').toUpperCase() !== 'INSTITUTE_ADMIN' ||
      String(readBack.status || '').toUpperCase() !== 'ACTIVE' ||
      String(readBack.password_hash || '') !== String(userRecord.password_hash)
    ) return 'failed';

    return 'prepared';
  } catch (error) {
    console.warn('[InstituteTestReactivation] Could not prepare the explicitly configured orphaned test admin:', error);
    return 'failed';
  }
}

/**
 * Resets only the configured test email's one-time trial claim after that
 * orphaned test admin has been safely re-registered. Trial claims for every
 * other institute remain untouched.
 */
export async function clearOrphanedTestInstituteTrialClaims(
  emailValue: string,
  userIdValue: string,
  adapter: TestInstituteReactivationAdapter = defaultAdapter,
): Promise<TestInstituteTrialClaimResetResult> {
  const email = normalizeEmail(emailValue);
  const userId = String(userIdValue || '').trim();
  if (
    !email ||
    !userId ||
    !isConfiguredInstituteTestAccountMfaBypass({
      email,
      role: 'INSTITUTE_ADMIN',
      status: 'ACTIVE',
    })
  ) return 'not-eligible';

  try {
    if (!adapter.isConfigured()) return 'failed';
    const cloudClaims = await adapter.findTrialClaimsByEmail(email);
    for (const claim of cloudClaims) {
      const claimId = String(claim.id || '').trim();
      if (!claimId || normalizeEmail(claim.admin_email) !== email) return 'failed';
      if (!await adapter.tombstoneTrialClaim(claimId)) return 'failed';
      if (!await adapter.deleteTrialClaim(claimId)) return 'failed';
    }

    const remainingCloudClaims = await adapter.findTrialClaimsByEmail(email);
    if (remainingCloudClaims.length > 0) return 'failed';

    db.prepare(
      'DELETE FROM institute_trial_claims WHERE lower(admin_email) = ? OR admin_user_id = ?'
    ).run(email, userId);

    return 'cleared';
  } catch (error) {
    console.warn('[InstituteTestReactivation] Could not clear the one-time test trial claim:', error);
    return 'failed';
  }
}
