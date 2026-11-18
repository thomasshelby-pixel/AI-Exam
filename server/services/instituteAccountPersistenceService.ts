import { db, isTombstoned as isLocalTombstoned } from '../db.js';
import {
  getFirestoreDb,
  getFirestoreDoc,
  queryFirestoreDocs,
  isTombstoned as isCloudTombstoned,
  setFirestoreDocsAtomically,
} from './firestoreDbService.js';

export interface InstituteAccountBundle {
  institute: Record<string, any>;
  user: Record<string, any>;
  batches: Array<Record<string, any>>;
  auditLogs?: Array<Record<string, any>>;
}

export type InstituteAccountPersistenceResult =
  | 'persisted'
  | 'unconfigured'
  | 'failed'
  | 'conflict';

export type InstituteAccountRecoveryResult =
  | 'recovered'
  | 'already-present'
  | 'not-found'
  | 'incomplete'
  | 'conflict'
  | 'unconfigured'
  | 'failed';

export interface InstituteAccountPersistenceAdapter {
  isConfigured(): boolean;
  findInstitutesByEmail(email: string): Promise<Array<Record<string, any>>>;
  findUsersByEmail(email: string): Promise<Array<Record<string, any>>>;
  findBatchesByInstituteId(instituteId: string): Promise<Array<Record<string, any>>>;
  getDocument<T>(collectionName: string, id: string): Promise<T | null>;
  isTombstoned(collectionName: string, id: string): Promise<boolean>;
  setDocumentsAtomically(
    writes: Array<{ collectionName: string; docId: string; data: Record<string, any> }>
  ): Promise<boolean>;
}

export interface InstituteAccountRecoveryAdapter extends Omit<InstituteAccountPersistenceAdapter, 'setDocumentsAtomically'> {}

const defaultAdapter: InstituteAccountPersistenceAdapter = {
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
  findBatchesByInstituteId: (instituteId) => queryFirestoreDocs<Record<string, any>>(
    'batches',
    [{ field: 'institute_id', op: '==', value: instituteId }],
    { failOnError: true },
  ),
  getDocument: getFirestoreDoc,
  isTombstoned: isCloudTombstoned,
  setDocumentsAtomically: setFirestoreDocsAtomically,
};

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function asId(record: Record<string, any> | undefined): string {
  return String(record?.id || '').trim();
}

function hasValidInstituteBundle(bundle: InstituteAccountBundle): boolean {
  const instituteId = asId(bundle.institute);
  const userId = asId(bundle.user);
  const email = normalizeEmail(bundle.institute?.email);
  return Boolean(
    instituteId &&
    userId &&
    email &&
    email.includes('@') &&
    email === normalizeEmail(bundle.user?.email) &&
    String(bundle.user?.role || '').toUpperCase() === 'INSTITUTE_ADMIN' &&
    typeof bundle.user?.password_hash === 'string' &&
    bundle.user.password_hash.length > 0 &&
    Array.isArray(bundle.batches) &&
    bundle.batches.every((batch) =>
      Boolean(asId(batch) && String(batch.institute_id || '') === instituteId)
    ) &&
    (bundle.auditLogs || []).every((log) => Boolean(asId(log))),
  );
}

async function isProtectedFromRecreation(
  adapter: Pick<InstituteAccountPersistenceAdapter, 'isTombstoned'>,
  collectionName: string,
  id: string,
): Promise<boolean> {
  if (!id) return true;
  try {
    return Boolean(await adapter.isTombstoned(collectionName, id)) ||
      Boolean(isLocalTombstoned(collectionName, id));
  } catch {
    // A tombstone lookup error is not equivalent to "not deleted".
    return true;
  }
}

/**
 * Durably persists the institute admin, institute, batches and signup audit row
 * as one Firestore batch and verifies every document by reading it back.
 * A successful local-only insert is not considered a completed production signup.
 */
export async function persistInstituteAccountToFirestore(
  bundle: InstituteAccountBundle,
  adapter: InstituteAccountPersistenceAdapter = defaultAdapter,
): Promise<InstituteAccountPersistenceResult> {
  if (!hasValidInstituteBundle(bundle)) return 'failed';
  if (!adapter.isConfigured()) return 'unconfigured';

  const instituteId = asId(bundle.institute);
  const userId = asId(bundle.user);
  const email = normalizeEmail(bundle.institute.email);

  try {
    const protectedRecords = await Promise.all([
      isProtectedFromRecreation(adapter, 'institutes', instituteId),
      isProtectedFromRecreation(adapter, 'users', userId),
      ...bundle.batches.map((batch) => isProtectedFromRecreation(adapter, 'batches', asId(batch))),
    ]);
    if (protectedRecords.some(Boolean)) return 'conflict';

    // Never let a fresh random ID overwrite an older account with the same email.
    const [matchingInstitutes, matchingUsers] = await Promise.all([
      adapter.findInstitutesByEmail(email),
      adapter.findUsersByEmail(email),
    ]);
    if (
      matchingInstitutes.some((record) => asId(record) !== instituteId) ||
      matchingUsers.some((record) => asId(record) !== userId)
    ) {
      return 'conflict';
    }

    const instituteAtId = await adapter.getDocument<Record<string, any>>('institutes', instituteId);
    const userAtId = await adapter.getDocument<Record<string, any>>('users', userId);
    if (
      (instituteAtId && normalizeEmail(instituteAtId.email) !== email) ||
      (userAtId && normalizeEmail(userAtId.email) !== email)
    ) {
      return 'conflict';
    }

    const writes: Array<{ collectionName: string; docId: string; data: Record<string, any> }> = [
      { collectionName: 'institutes', docId: instituteId, data: bundle.institute },
      { collectionName: 'users', docId: userId, data: bundle.user },
      ...bundle.batches.map((batch) => ({
        collectionName: 'batches',
        docId: asId(batch),
        data: batch,
      })),
      ...(bundle.auditLogs || []).map((log) => ({
        collectionName: 'audit_logs',
        docId: asId(log),
        data: log,
      })),
    ];

    if (!await adapter.setDocumentsAtomically(writes)) return 'failed';

    const readBack = await Promise.all(writes.map((write) =>
      adapter.getDocument<Record<string, any>>(write.collectionName, write.docId)
    ));
    if (readBack.some((record, index) => {
      if (!record || asId(record) !== writes[index].docId) return true;
      if (writes[index].collectionName === 'institutes') {
        return normalizeEmail(record.email) !== email ||
          String(record.code || '') !== String(bundle.institute.code || '');
      }
      if (writes[index].collectionName === 'users') {
        return normalizeEmail(record.email) !== email ||
          String(record.role || '').toUpperCase() !== 'INSTITUTE_ADMIN' ||
          String(record.password_hash || '') !== String(bundle.user.password_hash || '');
      }
      if (writes[index].collectionName === 'batches') {
        return String(record.institute_id || '') !== instituteId;
      }
      if (writes[index].collectionName === 'audit_logs') {
        return String(record.entity_id || '') !== instituteId ||
          String(record.action || '') !== 'INSTITUTE_SIGNUP';
      }
      return false;
    })) {
      return 'failed';
    }

    return 'persisted';
  } catch (error) {
    console.warn('[InstituteAccountPersistence] Durable institute write failed:', error);
    return 'failed';
  }
}

function insertCloudUser(user: Record<string, any>): void {
  db.prepare(`
    INSERT INTO users (
      id, email, password_hash, full_name, phone, role, status,
      account_classification, signup_platform, email_verified, email_verified_at,
      mfa_enabled, mfa_phone, mfa_enrolled_at, totp_secret, mfa_reset_required,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
  `).run(
    asId(user),
    normalizeEmail(user.email),
    String(user.password_hash || ''),
    String(user.full_name || 'Institute Administrator'),
    user.phone || null,
    String(user.role || 'INSTITUTE_ADMIN'),
    String(user.status || 'ACTIVE'),
    String(user.account_classification || 'NORMAL'),
    String(user.signup_platform || 'UNKNOWN'),
    Number(user.email_verified || 0),
    user.email_verified_at || null,
    Number(user.mfa_enabled || 0),
    user.mfa_phone || null,
    user.mfa_enrolled_at || null,
    user.totp_secret || null,
    Number(user.mfa_reset_required || 0),
    user.created_at || null,
    user.updated_at || null,
  );
}

function insertCloudInstitute(institute: Record<string, any>): void {
  db.prepare(`
    INSERT INTO institutes (
      id, name, code, logo_url, email, phone, address, website,
      contact_person, status, subscription_plan, subscription_expires_at,
      max_students, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
  `).run(
    asId(institute),
    String(institute.name || 'Institute'),
    String(institute.code || ''),
    String(institute.logo_url || ''),
    normalizeEmail(institute.email),
    String(institute.phone || ''),
    institute.address || '',
    institute.website || '',
    String(institute.contact_person || 'Administrator'),
    String(institute.status || 'ACTIVE'),
    String(institute.subscription_plan || 'PENDING_SELECTION'),
    institute.subscription_expires_at || null,
    Number(institute.max_students || 50),
    institute.created_at || null,
  );
}

function insertCloudBatch(batch: Record<string, any>): void {
  db.prepare(`
    INSERT INTO batches (id, institute_id, name, course_level, description, created_at)
    VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
  `).run(
    asId(batch),
    String(batch.institute_id || ''),
    String(batch.name || 'Institute Batch'),
    String(batch.course_level || 'INTERMEDIATE'),
    String(batch.description || ''),
    batch.created_at || null,
  );
}

/**
 * Restores the existing institute identity into a fresh SQLite runtime.
 * It never fabricates a replacement institute and refuses ambiguous, mismatched
 * or tombstoned cloud records.
 */
export async function recoverInstituteAccountFromFirestoreByEmail(
  emailValue: string,
  expectedUserId?: string,
  adapter: InstituteAccountRecoveryAdapter = defaultAdapter,
): Promise<InstituteAccountRecoveryResult> {
  const email = normalizeEmail(emailValue);
  if (!email || !email.includes('@')) return 'not-found';
  if (!adapter.isConfigured()) return 'unconfigured';

  try {
    const [institutes, users] = await Promise.all([
      adapter.findInstitutesByEmail(email),
      adapter.findUsersByEmail(email),
    ]);
    if (institutes.length === 0 && users.length === 0) return 'not-found';
    if (institutes.length !== 1 || users.length !== 1) return 'conflict';

    const institute = institutes[0];
    const user = users[0];
    const instituteId = asId(institute);
    const userId = asId(user);
    if (
      !instituteId ||
      !userId ||
      normalizeEmail(institute.email) !== email ||
      normalizeEmail(user.email) !== email ||
      String(user.role || '').toUpperCase() !== 'INSTITUTE_ADMIN' ||
      (expectedUserId && userId !== expectedUserId) ||
      typeof user.password_hash !== 'string' ||
      !user.password_hash
    ) {
      return 'conflict';
    }

    const cloudBatches = (await adapter.findBatchesByInstituteId(instituteId))
      .filter((batch) => String(batch.institute_id || '') === instituteId);
    if (cloudBatches.some((batch) => !asId(batch))) return 'incomplete';

    const tombstones = await Promise.all([
      isProtectedFromRecreation(adapter, 'institutes', instituteId),
      isProtectedFromRecreation(adapter, 'users', userId),
      ...cloudBatches.map((batch) => isProtectedFromRecreation(adapter, 'batches', asId(batch))),
    ]);
    if (tombstones.some(Boolean)) return 'conflict';

    const localUser = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(userId) as any;
    const userByEmail = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email) as any;
    if (userByEmail && String(userByEmail.id) !== userId) return 'conflict';
    if (
      localUser &&
      (normalizeEmail(localUser.email) !== email ||
        String(localUser.role || '').toUpperCase() !== 'INSTITUTE_ADMIN')
    ) return 'conflict';

    const localInstitute = db.prepare('SELECT id, code, email FROM institutes WHERE id = ?').get(instituteId) as any;
    const instituteByEmail = db.prepare('SELECT id FROM institutes WHERE lower(email) = ?').get(email) as any;
    const instituteByCode = db.prepare('SELECT id FROM institutes WHERE code = ?').get(String(institute.code || '')) as any;
    if (
      (instituteByEmail && String(instituteByEmail.id) !== instituteId) ||
      (instituteByCode && String(instituteByCode.id) !== instituteId) ||
      (localInstitute && normalizeEmail(localInstitute.email) !== email)
    ) return 'conflict';

    const localBatchIds = new Set(
      (db.prepare('SELECT id FROM batches WHERE institute_id = ?').all(instituteId) as Array<{ id: string }>)
        .map((batch) => String(batch.id))
    );
    for (const batch of cloudBatches) {
      const localById = db.prepare('SELECT institute_id FROM batches WHERE id = ?').get(asId(batch)) as any;
      if (localById && String(localById.institute_id) !== instituteId) return 'conflict';
    }

    const missingLocalData = !localUser || !localInstitute ||
      cloudBatches.some((batch) => !localBatchIds.has(asId(batch)));

    db.exec('BEGIN IMMEDIATE');
    try {
      if (!localUser) insertCloudUser(user);
      if (!localInstitute) insertCloudInstitute(institute);
      for (const batch of cloudBatches) {
        if (!localBatchIds.has(asId(batch))) insertCloudBatch(batch);
      }

      const restoredUser = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(userId) as any;
      const restoredInstitute = db.prepare('SELECT id, email, code FROM institutes WHERE id = ?').get(instituteId) as any;
      if (
        !restoredUser ||
        !restoredInstitute ||
        normalizeEmail(restoredUser.email) !== email ||
        String(restoredUser.role || '').toUpperCase() !== 'INSTITUTE_ADMIN' ||
        normalizeEmail(restoredInstitute.email) !== email ||
        String(restoredInstitute.code || '') !== String(institute.code || '')
      ) {
        throw new Error('SQLite read-back verification failed during institute account recovery.');
      }
      db.exec('COMMIT');
    } catch (transactionError) {
      try { db.exec('ROLLBACK'); } catch {}
      throw transactionError;
    }

    return missingLocalData ? 'recovered' : 'already-present';
  } catch (error) {
    console.warn('[InstituteAccountPersistence] Could not recover institute account from Firestore:', error);
    return 'failed';
  }
}
