import assert from 'node:assert/strict';
import { db } from '../db.js';
import {
  hydrateFeatureControlsFromFirestore,
  persistFeatureFlagToFirestore,
  persistFeatureTesterToFirestore,
  deleteFeatureTesterFromFirestore,
  type FeatureControlPersistenceAdapter,
  type FeatureControlCloudDocument,
} from '../services/featureControlPersistenceService.js';

type CollectionMap = Map<string, Map<string, FeatureControlCloudDocument>>;

const collections: CollectionMap = new Map();
const getCollectionMap = (name: string) => {
  let docs = collections.get(name);
  if (!docs) {
    docs = new Map();
    collections.set(name, docs);
  }
  return docs;
};

const adapter: FeatureControlPersistenceAdapter = {
  isConfigured: () => true,
  getCollection: async (name) => Array.from(getCollectionMap(name).values()).map((doc) => ({ ...doc })),
  getDocument: async (name, id) => {
    const doc = getCollectionMap(name).get(id);
    return doc ? { ...doc } : null;
  },
  setDocument: async (name, id, data) => {
    getCollectionMap(name).set(id, { ...data, id });
    return true;
  },
  deleteDocument: async (name, id) => getCollectionMap(name).delete(id),
};

const featureId = 'feature_cloud_persistence_regression';
const featureKey = 'checker_cloud_persistence_regression';
const testerId = 'tester_cloud_persistence_regression';
const testerEmail = 'feature-persistence-regression@example.com';

async function main() {
  try {
    db.prepare('DELETE FROM feature_testers WHERE id = ?').run(testerId);
    db.prepare('DELETE FROM feature_flags WHERE id = ?').run(featureId);
    db.prepare(`
      INSERT INTO feature_flags (
        id, application, feature_key, feature_name, description, status, student_message,
        display_in_student_dashboard, display_order, created_by, updated_by, created_at, updated_at
      ) VALUES (?, 'CHECKER', ?, 'Persistence Regression Feature', 'Cloud persistence test', 'DISABLED',
        'Temporarily unavailable', 1, 99, 'TEST', 'TEST', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(featureId, featureKey);
    // First startup migrates existing local state into Firestore without replacing
    // any cloud document that already exists.
    const firstHydration = await hydrateFeatureControlsFromFirestore({ requireComplete: true }, adapter);
    assert.strictEqual(firstHydration.skipped, false);
    assert.strictEqual(getCollectionMap('feature_flags').get(featureId)?.status, 'DISABLED');

    // An admin adds a tester after first startup; the mutation must be mirrored
    // immediately rather than waiting for another container restart.
    db.prepare(`
      INSERT INTO feature_testers (id, feature_id, application, feature_key, email, created_by)
      VALUES (?, ?, 'CHECKER', ?, ?, 'TEST')
    `).run(testerId, featureId, featureKey, testerEmail);
    const addedTester = db.prepare('SELECT * FROM feature_testers WHERE id = ?').get(testerId) as FeatureControlCloudDocument;
    assert.strictEqual(await persistFeatureTesterToFirestore(addedTester, adapter), true);
    assert.strictEqual(getCollectionMap('feature_testers').get(testerId)?.email, testerEmail);

    // Admin changes are written to the durable cloud record.
    db.prepare(`
      UPDATE feature_flags
      SET status = 'ENABLED', student_message = 'Enabled by Super Admin',
          updated_by = 'admin@example.com', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(featureId);
    const changedFlag = db.prepare('SELECT * FROM feature_flags WHERE id = ?').get(featureId) as FeatureControlCloudDocument;
    assert.strictEqual(await persistFeatureFlagToFirestore(changedFlag, adapter), true);
    assert.strictEqual(getCollectionMap('feature_flags').get(featureId)?.status, 'ENABLED');

    // Simulate a fresh deployment with an empty local SQLite cache. Startup must
    // restore the previous status and tester allowlist from Firestore.
    db.prepare('DELETE FROM feature_testers WHERE id = ?').run(testerId);
    db.prepare('DELETE FROM feature_flags WHERE id = ?').run(featureId);
    const secondHydration = await hydrateFeatureControlsFromFirestore({ requireComplete: true }, adapter);
    assert.strictEqual(secondHydration.skipped, false);
    const restoredFlag = db.prepare('SELECT * FROM feature_flags WHERE id = ?').get(featureId) as FeatureControlCloudDocument | undefined;
    assert.ok(restoredFlag, 'Feature record should be restored after a fresh deployment');
    assert.strictEqual(restoredFlag.status, 'ENABLED');
    assert.strictEqual(restoredFlag.student_message, 'Enabled by Super Admin');
    const restoredTester = db.prepare('SELECT * FROM feature_testers WHERE id = ?').get(testerId) as FeatureControlCloudDocument | undefined;
    assert.ok(restoredTester, 'Tester allowlist should be restored after a fresh deployment');
    assert.strictEqual(restoredTester.email, testerEmail);

    // Persist tester additions/removals and verify a removed tester does not get
    // resurrected from stale local state on the next hydration.
    assert.strictEqual(await deleteFeatureTesterFromFirestore(testerId, adapter), true);
    db.prepare('INSERT OR REPLACE INTO feature_testers (id, feature_id, application, feature_key, email, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(testerId, featureId, 'CHECKER', featureKey, testerEmail, 'STALE_LOCAL_CACHE');
    await hydrateFeatureControlsFromFirestore({ requireComplete: true }, adapter);
    const staleTester = db.prepare('SELECT id FROM feature_testers WHERE id = ?').get(testerId);
    assert.strictEqual(staleTester, undefined, 'Deleted cloud testers must not be restored from a stale SQLite cache');

    console.log('[PASS] Feature Control status and tester allowlist survive a fresh deployment through Firestore.');
  } finally {
    db.prepare('DELETE FROM feature_testers WHERE id = ?').run(testerId);
    db.prepare('DELETE FROM feature_flags WHERE id = ?').run(featureId);
  }
}

main().catch((error) => {
  console.error('[FAIL] Feature Control Cloud Persistence Regression:', error);
  process.exit(1);
});
