import { db } from '../db.js';
import {
  getFirestoreDb,
  getAllFirestoreDocs,
  getFirestoreDoc,
  setFirestoreDoc,
  deleteFirestoreDoc,
} from './firestoreDbService.js';

type FeatureControlCollection = 'feature_flags' | 'feature_testers';

export interface FeatureControlCloudDocument {
  id: string;
  [key: string]: any;
}

export interface FeatureControlPersistenceAdapter {
  isConfigured(): boolean;
  getCollection(collectionName: FeatureControlCollection): Promise<FeatureControlCloudDocument[]>;
  getDocument(collectionName: string, documentId: string): Promise<FeatureControlCloudDocument | null>;
  setDocument(collectionName: string, documentId: string, data: Record<string, any>): Promise<boolean>;
  deleteDocument(collectionName: string, documentId: string): Promise<boolean>;
}

const STATE_COLLECTION = 'feature_control_meta';
const STATE_DOCUMENT_ID = 'primary';
const VALID_STATUSES = new Set(['ENABLED', 'TESTING', 'DISABLED', 'COMING_SOON']);
const VALID_APPLICATIONS = new Set(['CHECKER', 'MCQ_ARENA']);

const firestoreAdapter: FeatureControlPersistenceAdapter = {
  isConfigured: () => getFirestoreDb() !== null,
  getCollection: (collectionName) => getAllFirestoreDocs<FeatureControlCloudDocument>(collectionName, { failOnError: true }),
  getDocument: (collectionName, documentId) => getFirestoreDoc<FeatureControlCloudDocument>(collectionName, documentId, { failOnError: true }),
  setDocument: setFirestoreDoc,
  deleteDocument: deleteFirestoreDoc,
};

function toSqliteValue(value: any): any {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value;
}

function upsertLocalRecord(tableName: FeatureControlCollection, record: FeatureControlCloudDocument): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  const allowedColumns = new Set(columns.map((column) => column.name));
  const entries = Object.entries(record).filter(([key, value]) =>
    allowedColumns.has(key) && value !== undefined
  );

  if (!record.id || !entries.some(([key]) => key === 'id')) {
    throw new Error(`Cannot hydrate ${tableName}: a valid document ID is required.`);
  }
  if (!entries.length) return;

  const names = entries.map(([key]) => `"${key}"`).join(', ');
  const placeholders = entries.map(() => '?').join(', ');
  const updates = entries
    .map(([key]) => key)
    .filter((key) => key !== 'id')
    .map((key) => `"${key}" = excluded."${key}"`);

  const sql = updates.length
    ? `INSERT INTO "${tableName}" (${names}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates.join(', ')}`
    : `INSERT OR IGNORE INTO "${tableName}" (${names}) VALUES (${placeholders})`;

  db.prepare(sql).run(...entries.map(([, value]) => toSqliteValue(value)));
}

function normalizeFeatureFlag(record: FeatureControlCloudDocument): FeatureControlCloudDocument | null {
  const application = String(record.application || '').toUpperCase();
  const status = String(record.status || '').toUpperCase();
  const featureKey = String(record.feature_key || '').trim().toLowerCase();
  if (
    !record.id ||
    !VALID_APPLICATIONS.has(application) ||
    !VALID_STATUSES.has(status) ||
    !/^[a-z0-9_-]{2,64}$/.test(featureKey)
  ) {
    return null;
  }

  return {
    ...record,
    id: String(record.id),
    application,
    feature_key: featureKey,
    status,
    display_in_student_dashboard: Number(record.display_in_student_dashboard ?? 1) ? 1 : 0,
    display_order: Number(record.display_order || 0),
  };
}

function normalizeTester(record: FeatureControlCloudDocument): FeatureControlCloudDocument | null {
  const id = String(record.id || '').trim();
  const email = String(record.email || '').trim().toLowerCase();
  const featureKey = String(record.feature_key || '').trim().toLowerCase();
  if (!id || !email || !featureKey) return null;
  return {
    ...record,
    id,
    email,
    feature_key: featureKey,
    application: String(record.application || 'MCQ_ARENA').toUpperCase(),
  };
}

function assertWriteSucceeded(saved: boolean, label: string): void {
  if (!saved) {
    throw new Error(`Firestore did not confirm persistence for ${label}.`);
  }
}

/**
 * Firestore is the durable source of truth for Feature Control.
 *
 * The local SQLite tables are only a runtime cache: Firebase App Hosting / Cloud
 * Run containers can be replaced on deploy and their writable filesystem is not
 * a durable database. The one-time marker prevents an intentionally emptied
 * tester allowlist from being re-seeded on later deployments.
 */
export async function hydrateFeatureControlsFromFirestore(
  options: { requireComplete?: boolean } = {},
  adapter: FeatureControlPersistenceAdapter = firestoreAdapter,
): Promise<{ hydratedFlags: number; hydratedTesters: number; skipped: boolean }> {
  const requireComplete = options.requireComplete === true;
  let configured = false;
  try {
    configured = adapter.isConfigured();
  } catch (error) {
    if (requireComplete) throw error;
    console.warn('[FeatureControlPersistence] Firestore configuration unavailable; keeping local feature settings.', error);
  }

  if (!configured) {
    if (requireComplete) {
      throw new Error('Feature Control persistence requires Cloud Firestore, but Firestore is unavailable.');
    }
    return { hydratedFlags: 0, hydratedTesters: 0, skipped: true };
  }

  try {
    let [state, cloudFlags, cloudTesters] = await Promise.all([
      adapter.getDocument(STATE_COLLECTION, STATE_DOCUMENT_ID),
      adapter.getCollection('feature_flags'),
      adapter.getCollection('feature_testers'),
    ]);

    const isInitialized = state?.initialized === true;
    if (!isInitialized) {
      // One-time migration: copy current local settings to Firestore only when the
      // corresponding cloud document does not already exist. Never overwrite a
      // previously persisted Super Admin choice.
      const localFlags = db.prepare('SELECT * FROM feature_flags').all() as FeatureControlCloudDocument[];
      const localTesters = db.prepare('SELECT * FROM feature_testers').all() as FeatureControlCloudDocument[];
      const cloudFlagIds = new Set(cloudFlags.map((row) => String(row.id)));
      const cloudTesterIds = new Set(cloudTesters.map((row) => String(row.id)));

      for (const flag of localFlags) {
        if (!cloudFlagIds.has(String(flag.id))) {
          assertWriteSucceeded(await adapter.setDocument('feature_flags', String(flag.id), flag), `feature_flags/${flag.id}`);
        }
      }
      for (const tester of localTesters) {
        if (!cloudTesterIds.has(String(tester.id))) {
          assertWriteSucceeded(await adapter.setDocument('feature_testers', String(tester.id), tester), `feature_testers/${tester.id}`);
        }
      }

      assertWriteSucceeded(
        await adapter.setDocument(STATE_COLLECTION, STATE_DOCUMENT_ID, {
          initialized: true,
          schemaVersion: 1,
          initializedAt: new Date().toISOString(),
        }),
        'feature_control_meta/primary',
      );

      [cloudFlags, cloudTesters] = await Promise.all([
        adapter.getCollection('feature_flags'),
        adapter.getCollection('feature_testers'),
      ]);
    }

    if (cloudFlags.length === 0) {
      throw new Error('Cloud Firestore Feature Control store is initialized but contains no feature flags; refusing to silently restore defaults.');
    }

    // Add newly introduced code-defined features, but never overwrite an existing
    // cloud document (which may contain a Super Admin override).
    const cloudFlagIds = new Set(cloudFlags.map((row) => String(row.id)));
    const localFlags = db.prepare('SELECT * FROM feature_flags').all() as FeatureControlCloudDocument[];
    for (const localFlag of localFlags) {
      if (!cloudFlagIds.has(String(localFlag.id))) {
        assertWriteSucceeded(await adapter.setDocument('feature_flags', String(localFlag.id), localFlag), `feature_flags/${localFlag.id}`);
        cloudFlags.push(localFlag);
      }
    }

    let hydratedFlags = 0;
    for (const rawFlag of cloudFlags) {
      const flag = normalizeFeatureFlag(rawFlag);
      if (!flag) {
        console.warn('[FeatureControlPersistence] Ignoring malformed cloud feature flag:', rawFlag.id);
        continue;
      }
      upsertLocalRecord('feature_flags', flag);
      hydratedFlags++;
    }

    const validCloudTesters = cloudTesters
      .map(normalizeTester)
      .filter((tester): tester is FeatureControlCloudDocument => Boolean(tester));
    const cloudTesterIds = new Set(validCloudTesters.map((tester) => tester.id));

    // The allowlist is an exact mirror: removal in Firestore must not leave a
    // stale local tester grant behind after a fresh deployment.
    const localTesters = db.prepare('SELECT id FROM feature_testers').all() as Array<{ id: string }>;
    for (const tester of localTesters) {
      if (!cloudTesterIds.has(tester.id)) {
        db.prepare('DELETE FROM feature_testers WHERE id = ?').run(tester.id);
      }
    }

    for (const tester of validCloudTesters) {
      upsertLocalRecord('feature_testers', tester);
    }

    return { hydratedFlags, hydratedTesters: validCloudTesters.length, skipped: false };
  } catch (error) {
    console.error('[FeatureControlPersistence] Cloud hydration failed:', error);
    if (requireComplete) throw error;
    return { hydratedFlags: 0, hydratedTesters: 0, skipped: true };
  }
}

export async function persistFeatureFlagToFirestore(
  record: Record<string, any>,
  adapter: FeatureControlPersistenceAdapter = firestoreAdapter,
): Promise<boolean> {
  try {
    if (!adapter.isConfigured()) return process.env.NODE_ENV !== 'production';
    const { testers: _testers, ...flag } = record;
    return await adapter.setDocument('feature_flags', String(flag.id), flag);
  } catch (error) {
    console.warn('[FeatureControlPersistence] Failed to persist feature flag:', error);
    return process.env.NODE_ENV !== 'production';
  }
}

export async function persistFeatureTesterToFirestore(
  record: Record<string, any>,
  adapter: FeatureControlPersistenceAdapter = firestoreAdapter,
): Promise<boolean> {
  try {
    if (!adapter.isConfigured()) return process.env.NODE_ENV !== 'production';
    return await adapter.setDocument('feature_testers', String(record.id), record);
  } catch (error) {
    console.warn('[FeatureControlPersistence] Failed to persist feature tester:', error);
    return process.env.NODE_ENV !== 'production';
  }
}

export async function deleteFeatureTesterFromFirestore(
  testerId: string,
  adapter: FeatureControlPersistenceAdapter = firestoreAdapter,
): Promise<boolean> {
  try {
    if (!adapter.isConfigured()) return process.env.NODE_ENV !== 'production';
    return await adapter.deleteDocument('feature_testers', String(testerId));
  } catch (error) {
    console.warn('[FeatureControlPersistence] Failed to remove cloud feature tester:', error);
    return process.env.NODE_ENV !== 'production';
  }
}

export function restoreFeatureFlagLocally(record: Record<string, any>): void {
  db.prepare(`
    UPDATE feature_flags
    SET application = ?, feature_key = ?, feature_name = ?, description = ?,
        status = ?, student_message = ?, display_in_student_dashboard = ?,
        display_order = ?, updated_by = ?, updated_at = ?
    WHERE id = ?
  `).run(
    record.application,
    record.feature_key,
    record.feature_name,
    record.description || '',
    record.status,
    record.student_message || '',
    Number(record.display_in_student_dashboard ?? 1),
    Number(record.display_order || 0),
    record.updated_by || 'SYSTEM_INIT',
    record.updated_at || new Date().toISOString(),
    record.id,
  );
}

export function deleteFeatureFlagLocally(featureId: string): void {
  db.prepare('DELETE FROM feature_flags WHERE id = ?').run(featureId);
}

export function restoreFeatureTesterLocally(record: Record<string, any>): void {
  db.prepare(`
    INSERT OR REPLACE INTO feature_testers (id, feature_id, application, feature_key, email, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.feature_id || null,
    record.application || 'MCQ_ARENA',
    record.feature_key,
    record.email,
    record.created_at || new Date().toISOString(),
    record.created_by || 'SYSTEM_INIT',
  );
}

export function deleteFeatureTesterLocally(testerId: string): void {
  db.prepare('DELETE FROM feature_testers WHERE id = ?').run(testerId);
}
