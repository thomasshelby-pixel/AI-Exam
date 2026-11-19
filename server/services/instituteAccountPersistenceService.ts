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

export interface InstituteAccountRecoveryAdapter extends Omit<InstituteAccountPersistenceAdapter, 'setDocumentsAtomically'> {
  findInstituteSignupAuditLogs?(adminUserId: string): Promise<Array<Record<string, any>>>;
}

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
  findInstituteSignupAuditLogs: (adminUserId) => queryFirestoreDocs<Record<string, any>>(
    'audit_logs',
    [{ field: 'user_id', op: '==', value: adminUserId }],
    { failOnError: true },
  ),
  getDocument: <T>(collectionName: string, id: string) => getFirestoreDoc<T>(collectionName, id, { failOnError: true }),
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

    const batchAndAuditWrites: Array<{ collectionName: string; docId: string; data: Record<string, any> }> = [
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
    const baseWrites = [
      { collectionName: 'institutes', docId: instituteId, data: bundle.institute },
      { collectionName: 'users', docId: userId, data: bundle.user },
    ];
    const candidateWrites = [...baseWrites, ...batchAndAuditWrites];
    const existingDocuments = await Promise.all(candidateWrites.map((write) =>
      adapter.getDocument<Record<string, any>>(write.collectionName, write.docId)
    ));

    // A matching cloud document is already authoritative. Verify its identity,
    // but never replace its newer profile/password/settings with a local SQLite
    // snapshot simply because the administrator logged in on a fresh instance.
    for (let index = 0; index < existingDocuments.length; index += 1) {
      const existing = existingDocuments[index];
      if (!existing) continue;
      const candidate = candidateWrites[index];
      if (asId(existing) !== candidate.docId) return 'conflict';
      if (candidate.collectionName === 'institutes') {
        if (normalizeEmail(existing.email) !== email) return 'conflict';
      } else if (candidate.collectionName === 'users') {
        if (
          normalizeEmail(existing.email) !== email ||
          String(existing.role || '').toUpperCase() !== 'INSTITUTE_ADMIN' ||
          typeof existing.password_hash !== 'string' ||
          !existing.password_hash
        ) return 'conflict';
      } else if (candidate.collectionName === 'batches') {
        if (String(existing.institute_id || '') !== instituteId) return 'conflict';
      } else if (candidate.collectionName === 'audit_logs') {
        if (
          String(existing.entity_id || '') !== instituteId ||
          String(existing.action || '') !== 'INSTITUTE_SIGNUP'
        ) return 'conflict';
      }
    }

    const missingWrites = candidateWrites.filter((write, index) => !existingDocuments[index]);
    if (missingWrites.length > 0 && !await adapter.setDocumentsAtomically(missingWrites)) {
      return 'failed';
    }

    // Confirm every expected record exists after the atomic write. Identity
    // checks intentionally permit newer Firestore fields to remain untouched.
    const readBack = await Promise.all(candidateWrites.map((write) =>
      adapter.getDocument<Record<string, any>>(write.collectionName, write.docId)
    ));
    if (readBack.some((record, index) => {
      if (!record || asId(record) !== candidateWrites[index].docId) return true;
      if (candidateWrites[index].collectionName === 'institutes') {
        return normalizeEmail(record.email) !== email;
      }
      if (candidateWrites[index].collectionName === 'users') {
        return normalizeEmail(record.email) !== email ||
          String(record.role || '').toUpperCase() !== 'INSTITUTE_ADMIN' ||
          typeof record.password_hash !== 'string' ||
          !record.password_hash;
      }
      if (candidateWrites[index].collectionName === 'batches') {
        return String(record.institute_id || '') !== instituteId;
      }
      if (candidateWrites[index].collectionName === 'audit_logs') {
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

/**
 * The pre-recovery institute dashboard used to create a temporary
 * "{Admin Name} Academy" record when the original profile was missing locally.
 * Identify only that very specific, empty placeholder shape; never treat a
 * normally registered institute as disposable.
 */
function isLegacyAutoProvisionedPlaceholder(
  institute: Record<string, any> | undefined,
  admin: Record<string, any> | undefined,
): boolean {
  if (!institute || !admin) return false;
  const adminName = String(admin.full_name || '').trim();
  const expectedName = `${adminName || 'CA'} Academy`;
  const plan = String(institute.subscription_plan || '').trim().toUpperCase();
  const phone = String(institute.phone || '').trim();
  const adminPhone = String(admin.phone || '9999999999').trim();
  return (
    String(institute.name || '').trim() === expectedName &&
    /^INST-[A-F0-9]{6}$/i.test(String(institute.code || '').trim()) &&
    normalizeEmail(institute.email) === normalizeEmail(admin.email) &&
    String(institute.contact_person || '').trim() === (adminName || 'Administrator') &&
    (!String(institute.address || '').trim()) &&
    (!String(institute.website || '').trim()) &&
    (!phone || phone === adminPhone) &&
    ['NONE', 'FREE_STARTER_TRIAL_V1'].includes(plan)
  );
}

function hasOperationalInstituteData(instituteId: string): boolean {
  const checks: Array<{ table: string; sql: string }> = [
    { table: 'institute_memberships', sql: 'SELECT COUNT(*) AS count FROM institute_memberships WHERE institute_id = ?' },
    { table: 'institute_materials', sql: 'SELECT COUNT(*) AS count FROM institute_materials WHERE institute_id = ?' },
    { table: 'institute_tests', sql: 'SELECT COUNT(*) AS count FROM institute_tests WHERE institute_id = ?' },
    { table: 'institute_assignments', sql: 'SELECT COUNT(*) AS count FROM institute_assignments WHERE institute_id = ?' },
    { table: 'student_profiles', sql: 'SELECT COUNT(*) AS count FROM student_profiles WHERE institute_id = ?' },
    { table: 'evaluations', sql: 'SELECT COUNT(*) AS count FROM evaluations WHERE institute_id = ?' },
    { table: 'evaluation_materials', sql: 'SELECT COUNT(*) AS count FROM evaluation_materials WHERE institute_id = ?' },
  ];
  for (const check of checks) {
    const result = db.prepare(check.sql).get(instituteId) as { count?: number };
    if (Number(result?.count || 0) > 0) return true;
  }
  return false;
}

function hasInstituteSignupAuditForId(instituteId: string): boolean {
  return Boolean(db.prepare(`
    SELECT id FROM audit_logs
    WHERE entity_type = 'INSTITUTE'
      AND entity_id = ?
      AND action = 'INSTITUTE_SIGNUP'
    LIMIT 1
  `).get(instituteId));
}

/**
 * Select a single canonical Institute record for an admin. If old deployments
 * created extra placeholder records, the original INSTITUTE_SIGNUP audit entry
 * wins; otherwise a unique non-placeholder record is required.
 */
function selectCanonicalInstitute(
  institutes: Array<Record<string, any>>,
  user: Record<string, any>,
  signupAuditLogs: Array<Record<string, any>>,
): Record<string, any> | null {
  const candidates = institutes.filter((record) =>
    normalizeEmail(record.email) === normalizeEmail(user.email) &&
    String(record.status || '').toUpperCase() !== 'RECOVERED_DUPLICATE'
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const candidateIds = new Set(candidates.map(asId));
  const signupIds = Array.from(new Set(signupAuditLogs
    .filter((log) =>
      String(log.action || '').toUpperCase() === 'INSTITUTE_SIGNUP' &&
      String(log.entity_type || '').toUpperCase() === 'INSTITUTE' &&
      candidateIds.has(String(log.entity_id || ''))
    )
    .map((log) => String(log.entity_id || ''))
  ));
  if (signupIds.length === 1) {
    const selected = candidates.find((record) => asId(record) === signupIds[0]);
    const duplicates = candidates.filter((record) => asId(record) !== signupIds[0]);
    if (selected && duplicates.every((record) => isLegacyAutoProvisionedPlaceholder(record, user))) {
      return selected;
    }
  }

  const nonPlaceholders = candidates.filter((record) => !isLegacyAutoProvisionedPlaceholder(record, user));
  return nonPlaceholders.length === 1 ? nonPlaceholders[0] : null;
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
    const [matchingInstitutes, users] = await Promise.all([
      adapter.findInstitutesByEmail(email),
      adapter.findUsersByEmail(email),
    ]);
    if (matchingInstitutes.length === 0 && users.length === 0) return 'not-found';
    if (users.length !== 1) return 'conflict';

    const user = users[0];
    const userId = asId(user);
    if (
      !userId ||
      normalizeEmail(user.email) !== email ||
      String(user.role || '').toUpperCase() !== 'INSTITUTE_ADMIN' ||
      (expectedUserId && userId !== expectedUserId) ||
      typeof user.password_hash !== 'string' ||
      !user.password_hash
    ) return 'conflict';

    const signupAuditLogs = adapter.findInstituteSignupAuditLogs
      ? await adapter.findInstituteSignupAuditLogs(userId)
      : [];
    const institute = selectCanonicalInstitute(matchingInstitutes, user, signupAuditLogs);
    if (!institute) return matchingInstitutes.length === 0 ? 'not-found' : 'conflict';

    const instituteId = asId(institute);
    if (!instituteId) return 'conflict';
    const duplicateCloudInstitutes = matchingInstitutes.filter((record) => asId(record) !== instituteId);
    if (!duplicateCloudInstitutes.every((record) => isLegacyAutoProvisionedPlaceholder(record, user))) {
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

    const localUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    const userByEmail = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email) as any;
    if (userByEmail && String(userByEmail.id) !== userId) return 'conflict';
    if (
      localUser &&
      (normalizeEmail(localUser.email) !== email ||
        String(localUser.role || '').toUpperCase() !== 'INSTITUTE_ADMIN')
    ) return 'conflict';

    const localInstitute = db.prepare('SELECT * FROM institutes WHERE id = ?').get(instituteId) as any;
    const localInstituteByEmail = db.prepare('SELECT * FROM institutes WHERE lower(email) = ?').get(email) as any;
    const localPlaceholder = localInstituteByEmail && String(localInstituteByEmail.id) !== instituteId
      ? localInstituteByEmail
      : null;

    if (localPlaceholder) {
      const hasMatchingOriginalSignup = hasInstituteSignupAuditForId(String(localPlaceholder.id));
      if (
        !isLegacyAutoProvisionedPlaceholder(localPlaceholder, user) ||
        hasMatchingOriginalSignup ||
        hasOperationalInstituteData(String(localPlaceholder.id))
      ) return 'conflict';
    }

    const instituteByCode = db.prepare('SELECT id FROM institutes WHERE code = ?').get(String(institute.code || '')) as any;
    if (instituteByCode && String(instituteByCode.id) !== instituteId && String(instituteByCode.id) !== String(localPlaceholder?.id || '')) {
      return 'conflict';
    }
    if (
      localInstitute &&
      (normalizeEmail(localInstitute.email) !== email ||
        String(localInstitute.code || '') !== String(institute.code || ''))
    ) return 'conflict';

    const localBatchIds = new Set(
      (db.prepare('SELECT id FROM batches WHERE institute_id = ?').all(instituteId) as Array<{ id: string }>)
        .map((batch) => String(batch.id))
    );
    for (const batch of cloudBatches) {
      const localById = db.prepare('SELECT institute_id FROM batches WHERE id = ?').get(asId(batch)) as any;
      if (localById && String(localById.institute_id) !== instituteId && String(localById.institute_id) !== String(localPlaceholder?.id || '')) {
        return 'conflict';
      }
    }

    const missingLocalData = !localUser || !localInstitute ||
      Boolean(localPlaceholder) ||
      cloudBatches.some((batch) => !localBatchIds.has(asId(batch)));

    db.exec('BEGIN IMMEDIATE');
    try {
      if (localPlaceholder) {
        const placeholderId = String(localPlaceholder.id);
        const placeholderAlias = `recovered+${placeholderId}@invalid.caexamcheckerai.com`;

        // Retain the old row as a disabled audit shell, but release its email so
        // the original Cloud Firestore institute can be restored without a
        // duplicate-email collision.
        db.prepare(`
          UPDATE institutes
          SET email = ?, status = 'RECOVERED_DUPLICATE',
              subscription_plan = 'RECOVERED_DUPLICATE', max_students = 0
          WHERE id = ?
        `).run(placeholderAlias, placeholderId);

        const canonicalSubscriptions = db.prepare(
          'SELECT id FROM institute_subscriptions WHERE institute_id = ? LIMIT 1'
        ).get(instituteId);
        if (!canonicalSubscriptions) {
          // Preserve a one-time starter trial that the old auto-provision path
          // may already have granted against the temporary institute ID.
          db.prepare(
            'UPDATE institute_subscriptions SET institute_id = ? WHERE institute_id = ?'
          ).run(instituteId, placeholderId);
        } else {
          db.prepare(`
            UPDATE institute_subscriptions
            SET status = 'SUPERSEDED', updated_at = CURRENT_TIMESTAMP
            WHERE institute_id = ? AND status = 'ACTIVE'
          `).run(placeholderId);
        }

        db.prepare(
          'UPDATE institute_usage_ledger SET institute_id = ? WHERE institute_id = ?'
        ).run(instituteId, placeholderId);

        const legacyClaim = db.prepare(
          'SELECT * FROM institute_trial_claims WHERE institute_id = ? LIMIT 1'
        ).get(placeholderId) as any;
        if (legacyClaim) {
          const canonicalClaim = db.prepare(
            'SELECT id FROM institute_trial_claims WHERE institute_id = ? LIMIT 1'
          ).get(instituteId);
          if (!canonicalClaim) {
            db.prepare('UPDATE institute_trial_claims SET institute_id = ? WHERE id = ?')
              .run(instituteId, legacyClaim.id);
          }
        }

        db.prepare(`
          UPDATE audit_logs SET entity_id = ?
          WHERE entity_id = ? AND user_id = ? AND action = 'INSTITUTE_FREE_TRIAL_ACTIVATED'
        `).run(instituteId, placeholderId, userId);
      }

      if (!localUser) insertCloudUser(user);
      if (!localInstitute) insertCloudInstitute(institute);
      for (const batch of cloudBatches) {
        const batchId = asId(batch);
        if (localBatchIds.has(batchId)) continue;
        const oldPlaceholderBatch = localPlaceholder
          ? db.prepare('SELECT institute_id FROM batches WHERE id = ?').get(batchId) as any
          : null;
        if (oldPlaceholderBatch && String(oldPlaceholderBatch.institute_id) === String(localPlaceholder.id)) {
          db.prepare(`
            UPDATE batches
            SET institute_id = ?, name = ?, course_level = ?, description = ?
            WHERE id = ?
          `).run(
            instituteId,
            String(batch.name || 'Institute Batch'),
            String(batch.course_level || 'INTERMEDIATE'),
            String(batch.description || ''),
            batchId,
          );
        } else if (!oldPlaceholderBatch) {
          insertCloudBatch(batch);
        } else {
          throw new Error(`Institute batch identity conflict while recovering ${batchId}.`);
        }
      }

      // When moving an earlier placeholder trial, preserve its entitlement on
      // the canonical institute only if that institute had no subscription.
      const activeSubscription = db.prepare(`
        SELECT plan_id, student_capacity, expiry_date
        FROM institute_subscriptions
        WHERE institute_id = ? AND status = 'ACTIVE'
        ORDER BY datetime(expiry_date) DESC
        LIMIT 1
      `).get(instituteId) as any;
      if (activeSubscription) {
        db.prepare(`
          UPDATE institutes
          SET subscription_plan = ?, max_students = ?, subscription_expires_at = ?
          WHERE id = ?
        `).run(activeSubscription.plan_id, activeSubscription.student_capacity, activeSubscription.expiry_date, instituteId);
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
