import { applicationDefault, getApps, getApp, initializeApp } from 'firebase-admin/app';
import { createHash } from 'node:crypto';
import { getFirestore, type DocumentData, type Firestore } from 'firebase-admin/firestore';

import { loadAndValidateFirebaseConfig } from '../config/firebaseConfigValidator.js';

let firestoreInstance: Firestore | null = null;
let initAttempted = false;

/**
 * Return the privileged server-side Firestore connection.
 *
 * All backend reads/writes must use the Admin SDK so client Firestore rules can
 * be closed to public access. Production uses Application Default Credentials
 * from Firebase App Hosting / Cloud Run; local development needs ADC credentials.
 */
export function getFirestoreDb(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;
  if (initAttempted && !firestoreInstance) return null;

  initAttempted = true;
  try {
    const { config } = loadAndValidateFirebaseConfig();
    const app = getApps().length === 0
      ? initializeApp({
          credential: applicationDefault(),
          projectId: config.projectId,
        })
      : getApp();

    firestoreInstance = config.firestoreDatabaseId
      ? getFirestore(app, config.firestoreDatabaseId)
      : getFirestore(app);
    console.log('[Firestore Admin] Initialized privileged database:', config.firestoreDatabaseId || '(default)', 'project:', config.projectId);
    return firestoreInstance;
  } catch (err: unknown) {
    console.error('[Firestore Admin FATAL] Initialization error:', err instanceof Error ? err.message : err);
    throw err;
  }
}

export async function closeFirestoreCleanly(): Promise<void> {
  if (!firestoreInstance) return;
  try {
    await firestoreInstance.terminate();
    console.log('[Firestore Admin] Cleanly terminated database connection.');
  } catch {
    // Ignore cleanup error on process exit.
  } finally {
    firestoreInstance = null;
    initAttempted = false;
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms = 12000,
  fallback: T,
  operationName = 'Firestore operation',
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutHandle = setTimeout(() => {
      console.warn(`[Firestore Admin TIMEOUT] ${operationName} exceeded ${ms}ms threshold.`);
      resolve(fallback);
    }, ms);
  });

  // A timed-out SDK promise may still reject later; attach a handler to prevent an
  // unhandled rejection while preserving the timeout fallback for the caller.
  promise.catch(() => {});

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function cleanFirestoreData(data: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) cleaned[key] = value;
  }
  return cleaned;
}

export async function setFirestoreDoc(
  collectionName: string,
  docId: string,
  data: Record<string, any>,
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !docId) return false;
  try {
    const cleanData = cleanFirestoreData(data);
    cleanData._updatedAt = new Date().toISOString();
    return await withTimeout(
      db.collection(collectionName).doc(String(docId)).set(cleanData, { merge: true }).then(() => true),
      12000,
      false,
      `setFirestoreDoc(${collectionName}/${docId})`,
    );
  } catch (err) {
    console.warn(`[Firestore Admin] Failed to set document in ${collectionName}/${docId}:`, err);
    return false;
  }
}

export async function setFirestoreDocsAtomically(
  writes: Array<{ collectionName: string; docId: string; data: Record<string, any> }>,
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || writes.length === 0 || writes.some((write) => !write.docId)) return false;
  try {
    const batch = db.batch();
    for (const write of writes) {
      const cleanData = cleanFirestoreData(write.data);
      cleanData._updatedAt = new Date().toISOString();
      batch.set(db.collection(write.collectionName).doc(String(write.docId)), cleanData, { merge: true });
    }
    return await withTimeout(
      batch.commit().then(() => true),
      12000,
      false,
      'setFirestoreDocsAtomically',
    );
  } catch (err) {
    console.warn('[Firestore Admin] Failed to atomically persist protected records:', err);
    return false;
  }
}

export async function getFirestoreDoc<T = DocumentData>(
  collectionName: string,
  docId: string,
  options: { failOnError?: boolean } = {},
): Promise<T | null> {
  const firestore = getFirestoreDb();
  if (!firestore || !docId) {
    const error = new Error(`Firestore is unavailable while reading ${collectionName}/${docId}.`);
    if (options.failOnError) throw error;
    return null;
  }

  try {
    const snap = await withTimeout(
      firestore.collection(collectionName).doc(String(docId)).get(),
      12000,
      null as any,
      `getFirestoreDoc(${collectionName}/${docId})`,
    );
    if (!snap) {
      if (options.failOnError) throw new Error(`Firestore read timed out for ${collectionName}/${docId}.`);
      return null;
    }
    if (!snap.exists) return null;
    return { id: snap.id, ...(snap.data() || {}) } as unknown as T;
  } catch (err) {
    console.warn(`[Firestore Admin] Failed to get document in ${collectionName}/${docId}:`, err);
    if (options.failOnError) throw err;
    return null;
  }
}

export async function findFirestoreDocsByField<T = DocumentData>(
  collectionName: string,
  fieldName: string,
  fieldValue: unknown,
  limitCount = 1,
): Promise<T[]> {
  const firestore = getFirestoreDb();
  if (!firestore) throw new Error('Firestore is unavailable while querying records.');
  if (!collectionName || !fieldName) throw new Error('Collection name and field name are required.');
  const safeLimit = Number.isInteger(limitCount) ? Math.min(100, Math.max(1, limitCount)) : 1;
  const snap = await firestore.collection(collectionName).where(fieldName, '==', fieldValue).limit(safeLimit).get();
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as unknown as T);
}

export interface StudentRegistrationNumberClaimInput {
  normalizedSrn: string;
  userId: string;
  email: string;
}

export interface StudentRegistrationNumberClaimResult {
  claimed: boolean;
  globallyEnforced: boolean;
  conflictKind?: 'EXACT' | 'REGION_VARIANT';
}

/**
 * Claim one ICAI seven-digit registration sequence globally, across all App Hosting
 * instances. The three-letter regional prefix is retained for diagnostics; the hash
 * key uses the seven numeric digits so a regional-prefix variant cannot farm another
 * trial. The transaction also checks legacy exact-SRN profile documents.
 *
 * This is intentionally fail-closed in production when the authoritative store is
 * unavailable. Local tests/dev without Firebase credentials can continue using the
 * existing single-instance SQLite checks.
 */
export async function claimStudentRegistrationNumber(
  input: StudentRegistrationNumberClaimInput,
): Promise<StudentRegistrationNumberClaimResult> {
  const normalizedSrn = String(input.normalizedSrn || '').trim().toUpperCase();
  const userId = String(input.userId || '').trim();
  const email = String(input.email || '').trim().toLowerCase();

  if (!/^[A-Z]{3}\d{7}$/.test(normalizedSrn) || !userId || !email) {
    throw new Error('A valid normalized ICAI registration number, user ID, and email are required.');
  }

  let firestore: Firestore | null;
  try {
    firestore = getFirestoreDb();
  } catch (error) {
    const productionRuntime = process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE);
    if (productionRuntime) throw error;
    console.warn('[SrnClaim] Firestore unavailable outside production; using local-only uniqueness checks.');
    return { claimed: true, globallyEnforced: false };
  }

  if (!firestore) {
    const productionRuntime = process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE);
    if (productionRuntime) throw new Error('Firestore is required to enforce global ICAI registration uniqueness.');
    return { claimed: true, globallyEnforced: false };
  }

  const numericSequence = normalizedSrn.slice(-7);
  const sequenceHash = createHash('sha256').update(numericSequence).digest('hex');
  const claimRef = firestore.collection('student_registration_claims').doc(`srn_${sequenceHash}`);

  return await firestore.runTransaction(async (transaction) => {
    const existingClaim = await transaction.get(claimRef);
    if (existingClaim.exists) {
      const existingData = existingClaim.data() || {};
      const existingUserId = String(existingData.user_id || '');
      if (existingUserId === userId) {
        return { claimed: true, globallyEnforced: true };
      }
      const existingSrn = String(existingData.normalized_srn || '').toUpperCase();
      return {
        claimed: false,
        globallyEnforced: true,
        conflictKind: existingSrn === normalizedSrn ? 'EXACT' : 'REGION_VARIANT',
      };
    }

    // Preserve uniqueness for pre-existing accounts created before the global claim
    // ledger was introduced. Exact legacy profile matches are promoted into the claim
    // ledger as part of this same transaction.
    const legacyProfiles = await transaction.get(
      firestore.collection('student_profiles')
        .where('icai_registration_number', '==', normalizedSrn)
        .limit(1),
    );
    if (!legacyProfiles.empty) {
      const legacyOwnerId = legacyProfiles.docs[0].id;
      const now = new Date().toISOString();
      transaction.create(claimRef, {
        normalized_srn: normalizedSrn,
        numeric_sequence_hash: sequenceHash,
        user_id: legacyOwnerId,
        email: '',
        status: 'LEGACY_EXISTING_ACCOUNT',
        source: 'LEGACY_EXISTING_ACCOUNT',
        created_at: now,
        updated_at: now,
      });
      // Startup backfill is allowed to claim an already-existing profile for its owner.
      // A new registration always supplies a fresh userId and therefore receives a conflict.
      return legacyOwnerId === userId
        ? { claimed: true, globallyEnforced: true }
        : { claimed: false, globallyEnforced: true, conflictKind: 'EXACT' };
    }

    const now = new Date().toISOString();
    transaction.create(claimRef, {
      normalized_srn: normalizedSrn,
      numeric_sequence_hash: sequenceHash,
      user_id: userId,
      email,
      status: 'ACTIVE',
      source: 'STUDENT_REGISTRATION',
      created_at: now,
      updated_at: now,
    });
    return { claimed: true, globallyEnforced: true };
  });
}

/** Release a just-created claim only when its owner matches; used if local account creation fails. */
export async function releaseStudentRegistrationNumberClaim(
  normalizedSrnInput: string,
  userIdInput: string,
): Promise<void> {
  const normalizedSrn = String(normalizedSrnInput || '').trim().toUpperCase();
  const userId = String(userIdInput || '').trim();
  if (!/^[A-Z]{3}\d{7}$/.test(normalizedSrn) || !userId) return;

  const firestore = getFirestoreDb();
  if (!firestore) throw new Error('Firestore is unavailable while releasing an SRN claim.');
  const sequenceHash = createHash('sha256').update(normalizedSrn.slice(-7)).digest('hex');
  const claimRef = firestore.collection('student_registration_claims').doc(`srn_${sequenceHash}`);

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(claimRef);
    if (!snapshot.exists) return;
    if (String(snapshot.get('user_id') || '') !== userId) return;
    if (String(snapshot.get('source') || '') === 'LEGACY_EXISTING_ACCOUNT') return;
    transaction.delete(claimRef);
  });
}

export interface AccountStatusEventInput {
  userId: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'DISABLED' | 'DELETED';
  changedBy: string;
  reason?: string;
  source: string;
}

export interface AccountStatusEventRecord {
  id: string;
  user_id: string;
  status: AccountStatusEventInput['status'];
  version: number;
  reason: string;
  changed_by: string;
  source: string;
  created_at: string;
  updated_at: string;
}

/**
 * Append an immutable, monotonically versioned account-status event in Firestore.
 * The status-event ledger, not mutable users/account_suspensions documents, is the
 * durable source of truth during App Hosting instance replacement.
 */
export async function appendAccountStatusEvent(
  input: AccountStatusEventInput,
): Promise<AccountStatusEventRecord> {
  const firestore = getFirestoreDb();
  if (!firestore) throw new Error('Firestore is unavailable while recording account status.');

  const userId = String(input.userId || '').trim();
  const status = String(input.status || '').toUpperCase() as AccountStatusEventInput['status'];
  if (!userId || !['ACTIVE', 'SUSPENDED', 'BLOCKED', 'DISABLED', 'DELETED'].includes(status)) {
    throw new Error('A valid user ID and account status are required.');
  }

  const sequenceRef = firestore.collection('account_status_sequences').doc(userId);
  const createdEvent = await firestore.runTransaction(async (transaction) => {
    const sequenceSnapshot = await transaction.get(sequenceRef);
    let currentVersion = Number(sequenceSnapshot.get('version') || 0);

    // Rebuild a missing counter from prior immutable events rather than starting at 1
    // and colliding with an existing event after a partial restore.
    if (!sequenceSnapshot.exists) {
      const previousEvents = await transaction.get(
        firestore.collection('account_status_events').where('user_id', '==', userId),
      );
      for (const docSnap of previousEvents.docs) {
        currentVersion = Math.max(currentVersion, Number(docSnap.get('version') || 0));
      }
    }

    const version = currentVersion + 1;
    const id = `status_${userId}_${String(version).padStart(10, '0')}`;
    const eventRef = firestore.collection('account_status_events').doc(id);
    const timestamp = new Date().toISOString();
    const event: AccountStatusEventRecord = {
      id,
      user_id: userId,
      status,
      version,
      reason: String(input.reason || '').trim(),
      changed_by: String(input.changedBy || 'system').trim(),
      source: String(input.source || 'SERVER').trim(),
      created_at: timestamp,
      updated_at: timestamp,
    };

    // create() enforces append-only identity; it never silently overwrites an older event.
    transaction.create(eventRef, event);
    transaction.set(sequenceRef, {
      user_id: userId,
      version,
      status,
      reason: event.reason,
      changed_by: event.changed_by,
      source: event.source,
      event_id: event.id,
      updated_at: timestamp,
    }, { merge: true });
    return event;
  });

  return createdEvent;
}

export interface AccountStatusSnapshot {
  userId: string;
  status: AccountStatusEventInput['status'];
  version: number;
  reason: string;
  changedBy: string;
  source: string;
  eventId: string;
  updatedAt: string;
}

/** Read the atomically-maintained current status projection for a user. */
export async function getAccountStatusSnapshot(userIdInput: string): Promise<AccountStatusSnapshot | null> {
  const userId = String(userIdInput || '').trim();
  if (!userId) throw new Error('User ID is required to read account status.');
  const sequence = await getFirestoreDoc<Record<string, any>>(
    'account_status_sequences',
    userId,
    { failOnError: true },
  );
  if (!sequence) return null;

  const status = String(sequence.status || '').toUpperCase();
  const version = Number(sequence.version);
  if (!['ACTIVE', 'SUSPENDED', 'BLOCKED', 'DISABLED', 'DELETED'].includes(status) ||
      !Number.isInteger(version) || version < 1) {
    throw new Error(`Invalid authoritative account-status snapshot for ${userId}.`);
  }

  return {
    userId,
    status: status as AccountStatusEventInput['status'],
    version,
    reason: String(sequence.reason || ''),
    changedBy: String(sequence.changed_by || 'system'),
    source: String(sequence.source || 'SERVER'),
    eventId: String(sequence.event_id || ''),
    updatedAt: String(sequence.updated_at || ''),
  };
}

export async function deleteFirestoreDoc(collectionName: string, docId: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !docId) return false;
  try {
    return await withTimeout(
      db.collection(collectionName).doc(String(docId)).delete().then(() => true),
      12000,
      false,
      `deleteFirestoreDoc(${collectionName}/${docId})`,
    );
  } catch (err) {
    console.warn(`[Firestore Admin] Failed to delete document in ${collectionName}/${docId}:`, err);
    return false;
  }
}

export async function getAllFirestoreDocs<T = DocumentData>(
  collectionName: string,
  options: { failOnError?: boolean } = {},
): Promise<T[]> {
  const db = getFirestoreDb();
  if (!db) {
    if (options.failOnError) throw new Error(`Firestore is unavailable while reading ${collectionName}.`);
    return [];
  }

  try {
    let snap = await withTimeout(
      db.collection(collectionName).get(),
      12000,
      null as any,
      `getAllFirestoreDocs(${collectionName})`,
    );

    if (!snap) {
      console.log(`[Firestore Admin] Retrying getAllFirestoreDocs for ${collectionName}...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      snap = await withTimeout(
        db.collection(collectionName).get(),
        15000,
        null as any,
        `getAllFirestoreDocs_Retry(${collectionName})`,
      );
    }

    if (!snap) {
      console.warn(`[Firestore Admin WARN] Failed to retrieve documents from ${collectionName} after retry.`);
      if (options.failOnError) throw new Error(`Firestore returned no result while reading ${collectionName} after retry.`);
      return [];
    }

    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as unknown as T);
  } catch (err) {
    console.warn(`[Firestore Admin] Failed to list documents in ${collectionName}:`, err);
    if (options.failOnError) throw err;
    return [];
  }
}

// Tombstones: Ensure permanent deletions survive restarts and prevent re-seeding.
export async function recordTombstone(
  collectionName: string,
  docId: string,
  reason?: string,
  options: { failOnError?: boolean } = {},
): Promise<boolean> {
  const firestore = getFirestoreDb();
  if (!firestore || !docId) {
    const error = new Error(`Firestore is unavailable while recording a deletion tombstone for ${collectionName}/${docId}.`);
    if (options.failOnError) throw error;
    return false;
  }
  try {
    const tombstoneId = `${collectionName}_${docId}`;
    const recorded = await withTimeout(
      firestore.collection('tombstones').doc(tombstoneId).set({
        collectionName,
        targetId: docId,
        reason: reason || 'PERMANENT_DELETION',
        deletedAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
      }).then(() => true),
      12000,
      false,
      `recordTombstone(${collectionName}/${docId})`,
    );
    if (!recorded && options.failOnError) throw new Error(`Firestore did not confirm the deletion tombstone for ${collectionName}/${docId}.`);
    return recorded;
  } catch (err) {
    console.warn(`[Firestore Admin] Failed to record tombstone for ${collectionName}/${docId}:`, err);
    if (options.failOnError) throw err;
    return false;
  }
}

export async function isTombstoned(collectionName: string, docId: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !docId) throw new Error('Firestore is unavailable while checking a deletion tombstone.');

  try {
    if (collectionName === 'student_profiles' || collectionName === 'student_credit_purchases' || collectionName === 'credit_ledger') {
      const userTombstoneSnap = await withTimeout(
        db.collection('tombstones').doc(`users_${docId}`).get(),
        2500,
        null,
        `isTombstoned(users/${docId})`,
      );
      if (userTombstoneSnap?.exists) return true;
      return false;
    }

    const tombstoneId = `${collectionName}_${docId}`;
    const snap = await withTimeout(
      db.collection('tombstones').doc(tombstoneId).get(),
      12000,
      null,
      `isTombstoned(${collectionName}/${docId})`,
    );
    if (!snap) throw new Error(`Timed out checking tombstone for ${collectionName}/${docId}.`);
    return snap.exists;
  } catch (err) {
    console.error(`[Firestore Admin] Could not verify tombstone state for ${collectionName}/${docId}:`, err);
    throw err;
  }
}
