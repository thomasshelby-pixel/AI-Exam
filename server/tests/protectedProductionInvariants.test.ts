import assert from 'node:assert/strict';
import { db, initDatabase } from '../db.js';
import {
  fixInconsistentAdminMfaStates,
  getAuthoritativeUserMfaState,
  initMfaRecoveryTables,
} from '../services/mfaRecoveryService.js';
import { isEntityTombstoned, requireConfirmedDeletions } from '../services/deletionPersistence.js';
import {
  applyModelRoutingConfiguration,
  buildModelRoutingConfiguration,
  validateModelRoutingConfiguration,
} from '../services/modelRoutingConfig.js';
import { APPROVED_MODELS, determineModelRouting } from '../models/modelRegistry.js';

async function run(): Promise<void> {
  initDatabase();
  initMfaRecoveryTables(true);

  // MFA: a partial local cache must not clear an enrolled administrator.
  const missingSecretAdmin = `test_mfa_missing_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status, mfa_enabled, mfa_reset_required)
    VALUES (?, ?, 'test-hash', 'MFA Regression Admin', 'SUPER_ADMIN', 'ACTIVE', 1, 0)
  `).run(missingSecretAdmin, `${missingSecretAdmin}@example.test`);
  fixInconsistentAdminMfaStates();
  const preserved = db.prepare('SELECT mfa_enabled, mfa_reset_required, totp_secret FROM users WHERE id = ?')
    .get(missingSecretAdmin) as { mfa_enabled: number; mfa_reset_required: number; totp_secret: string | null };
  const state = await getAuthoritativeUserMfaState(missingSecretAdmin);
  assert.equal(preserved.mfa_enabled, 1, 'MFA repair must preserve the enrolled flag when the local cache lacks a secret');
  assert.equal(preserved.mfa_reset_required, 0, 'MFA repair must not turn missing local data into an admin reset');
  assert.equal(preserved.totp_secret, null, 'MFA repair must not fabricate a secret');
  assert.equal(state.state, 'MFA_RECOVERY_REQUIRED', 'An unavailable secret must enter the explicit recovery state');

  // Model configuration: routine initialization must preserve an admin choice and exact order.
  const approvedIds = APPROVED_MODELS.map((model) => model.id);
  const primaryModel = 'gpt-5.6-sol';
  const fallbackOrder = ['claude-sonnet-5', 'gemini-3.6-flash', 'gpt-5.6-terra'];
  db.prepare('UPDATE model_configs SET is_primary = 0').run();
  db.prepare('UPDATE model_configs SET is_primary = 1, is_enabled = 1 WHERE id = ?').run(primaryModel);
  fallbackOrder.forEach((id, index) => {
    db.prepare('UPDATE model_configs SET is_enabled = 1, fallback_order = ? WHERE id = ?').run(index + 1, id);
  });
  initDatabase();
  const primaryAfterStartup = db.prepare('SELECT id FROM model_configs WHERE is_primary = 1').get() as { id: string };
  const fallbackAfterStartup = (db.prepare(`
    SELECT id FROM model_configs WHERE is_enabled = 1 AND is_primary = 0
      AND id IN (${fallbackOrder.map(() => '?').join(',')})
    ORDER BY fallback_order ASC
  `).all(...fallbackOrder) as Array<{ id: string }>).map((row) => row.id);
  assert.equal(primaryAfterStartup.id, primaryModel, 'Database startup must preserve the saved primary model');
  assert.deepEqual(fallbackAfterStartup, fallbackOrder, 'Database startup must preserve the exact saved fallback order');

  db.prepare("DELETE FROM model_configs WHERE id = 'gemini-3.8-flash'").run();
  initDatabase();
  const primaryAfterModelSeed = db.prepare('SELECT id FROM model_configs WHERE is_primary = 1').get() as { id: string };
  assert.equal(primaryAfterModelSeed.id, primaryModel, 'Seeding a newly added Gemini registry row must not create a second primary');

  const config = { primaryModel: 'claude-sonnet-5', fallbackOrder: ['gpt-5.6-terra', 'gemini-3.1-flash-lite'] };
  const validConfig = validateModelRoutingConfiguration(config, approvedIds);
  assert.equal('error' in validConfig, false, 'Approved primary and fallback entries must validate');
  if ('error' in validConfig) throw new Error(validConfig.error);
  applyModelRoutingConfiguration(db, validConfig.config, approvedIds);
  const builtConfig = buildModelRoutingConfiguration(
    db.prepare('SELECT id, is_primary, is_enabled, fallback_order FROM model_configs').all() as any[],
    approvedIds,
  );
  assert.equal(builtConfig.primaryModel, config.primaryModel, 'Hydration must apply the authoritative primary to SQLite');
  assert.deepEqual(builtConfig.fallbackOrder, config.fallbackOrder, 'Hydration must preserve the authoritative ordered fallback list');

  const duplicateConfig = validateModelRoutingConfiguration(
    { primaryModel, fallbackOrder: [fallbackOrder[0], fallbackOrder[0]] },
    approvedIds,
  );
  assert.equal('error' in duplicateConfig, true, 'Duplicate fallback entries must be rejected');
  const primaryAsFallback = validateModelRoutingConfiguration(
    { primaryModel, fallbackOrder: [primaryModel] },
    approvedIds,
  );
  assert.equal('error' in primaryAsFallback, true, 'A primary model cannot also appear as its fallback');

  // Runtime must honor the persisted order, without sorting by model registry order.
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  const routed = determineModelRouting({
    level: 'INTERMEDIATE',
    adminPreferredModel: config.primaryModel,
    adminFallbackOrder: config.fallbackOrder,
  });
  assert.equal(routed.primaryModel, config.primaryModel, 'Runtime must use the configured primary model');
  assert.deepEqual(routed.fallbackChain, config.fallbackOrder, 'Runtime must retain administrator fallback order');

  // Deletion: asynchronous tombstone-backed deletes must be awaited and fail closed.
  const targets: Array<[string, string, string]> = [
    ['users', 'student-test-id', 'test deletion'],
    ['student_profiles', 'student-test-id', 'test profile deletion'],
    ['evaluations', 'evaluation-test-id', 'test evaluation deletion'],
  ];
  assert.equal(
    isEntityTombstoned(new Set(['users:student-test-id']), 'users', 'student-test-id'),
    true,
    'Hydration and baseline seeding must recognize the canonical collection/id tombstone format',
  );
  const completed: string[] = [];
  await requireConfirmedDeletions(targets, async (_collection, id) => {
    await Promise.resolve();
    completed.push(id);
    return true;
  });
  assert.deepEqual(completed, targets.map((target) => target[1]), 'Deletion must await each target in order');

  const attemptedOnFailure: string[] = [];
  await assert.rejects(
    () => requireConfirmedDeletions(targets, async (_collection, id) => {
      attemptedOnFailure.push(id);
      return id !== 'student-test-id';
    }),
    (error: any) => error.statusCode === 503,
    'A failed durable deletion must surface a retryable persistence error',
  );
  assert.deepEqual(attemptedOnFailure, ['student-test-id'], 'Deletion must stop at the first unconfirmed target');

  console.log('Protected production invariant regression suite passed.');
}

await run();
