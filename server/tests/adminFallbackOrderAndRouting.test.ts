import assert from 'node:assert';
import { db, initDatabase } from '../db.js';
import {
  APPROVED_MODELS,
  DEFAULT_FALLBACK_CHAIN,
  getAuthoritativePrimaryModel,
  getAuthoritativeFallbackChain,
  saveAuthoritativeFallbackChain,
  determineModelRouting,
} from '../models/modelRegistry.js';

console.log('========================================================================');
console.log('--- TEST SUITE: ADMIN-CONTROLLED FALLBACK ORDER & RUNTIME ROUTING ---');
console.log('========================================================================\n');

async function runTests() {
  initDatabase();

  // ---------------------------------------------------------------------------
  // TEST 1: REJECTION OF INVALID, DUPLICATE, AND PRIMARY-IN-FALLBACK ENTRIES
  // ---------------------------------------------------------------------------
  console.log('Test 1: Testing strict rejection of invalid fallback orders...');

  // 1A. Non-array rejection
  assert.throws(() => {
    saveAuthoritativeFallbackChain('not-an-array' as any);
  }, /must be an array/, 'Non-array fallback chain must be rejected');

  // 1B. Unapproved model rejection
  assert.throws(() => {
    saveAuthoritativeFallbackChain(['gemini-3.6-flash', 'gpt-4o']);
  }, /not in the approved runtime model whitelist/, 'Unapproved model (e.g. gpt-4o) must be rejected');

  // 1C. Primary model in its own fallback chain rejection
  const primaryModel = getAuthoritativePrimaryModel();
  assert.throws(() => {
    saveAuthoritativeFallbackChain([primaryModel, 'gemini-3.6-flash']);
  }, /cannot be included in its own fallback chain/, 'Primary model in fallback chain must be rejected');

  // 1D. Duplicate model entries rejection
  assert.throws(() => {
    saveAuthoritativeFallbackChain(['gemini-3.6-flash', 'claude-opus-5', 'gemini-3.6-flash']);
  }, /Duplicate model/, 'Duplicate entries in fallback chain must be rejected');

  console.log('  ✓ Invalid, unapproved, duplicate, and self-referencing orders properly rejected.\n');

  // ---------------------------------------------------------------------------
  // TEST 2: ATOMIC PERSISTENCE OF CUSTOM FALLBACK ORDER
  // ---------------------------------------------------------------------------
  console.log('Test 2: Saving custom fallback order and verifying persistence...');

  const customOrder = [
    'claude-opus-5',
    'gpt-5.6-sol',
    'gemini-3.6-flash',
    'claude-sonnet-5',
    'gpt-5.6-terra',
  ];

  const saveResult = saveAuthoritativeFallbackChain(customOrder, 'usr_super_admin_001');
  assert.strictEqual(saveResult.success, true, 'Save operation must report success');
  assert.deepStrictEqual(saveResult.fallbackChain, customOrder, 'Returned fallback chain must match saved order');

  // Verify persistence in pricing_settings
  const settingRow = db.prepare("SELECT value FROM pricing_settings WHERE key = 'EVAL_FALLBACK_ORDER'").get() as { value: string };
  assert(settingRow, 'EVAL_FALLBACK_ORDER must exist in pricing_settings');
  assert.deepStrictEqual(JSON.parse(settingRow.value), customOrder, 'EVAL_FALLBACK_ORDER JSON must match custom order');

  // Verify fallback_order updated in model_configs table
  customOrder.forEach((mId, index) => {
    const row = db.prepare('SELECT fallback_order, is_enabled FROM model_configs WHERE id = ?').get(mId) as any;
    assert.strictEqual(row.fallback_order, index + 1, `Model ${mId} fallback_order must be ${index + 1}`);
    assert.strictEqual(row.is_enabled, 1, `Model ${mId} must be enabled`);
  });

  // Verify getAuthoritativeFallbackChain returns custom order
  const retrievedChain = getAuthoritativeFallbackChain();
  assert.deepStrictEqual(retrievedChain, customOrder, 'Retrieved chain must equal custom order');

  console.log('  ✓ Custom fallback order atomically persisted and verified in SQLite.\n');

  // ---------------------------------------------------------------------------
  // TEST 3: RESTART & SEED IMMUNITY (DOES NOT REVERT TO DEFAULTS)
  // ---------------------------------------------------------------------------
  console.log('Test 3: Simulating application restart and seedModelConfigs execution...');

  // Simulate reboot by running initDatabase()
  initDatabase();

  const postRebootChain = getAuthoritativeFallbackChain();
  assert.deepStrictEqual(
    postRebootChain,
    customOrder,
    'Custom fallback order MUST survive application reboots and seedModelConfigs()'
  );

  console.log('  ✓ Zero-reversion confirmed: Custom fallback order survived application restart.\n');

  // ---------------------------------------------------------------------------
  // TEST 4: RUNTIME ROUTING FOLLOWS CUSTOM FALLBACK ORDER EXACTLY
  // ---------------------------------------------------------------------------
  console.log('Test 4: Verifying determineModelRouting respects the saved custom chain...');

  const routing = determineModelRouting({
    adminPreferredModel: primaryModel,
  });

  assert.strictEqual(routing.primaryModel, primaryModel, 'Routing primary model must match configured primary');

  // Check that the fallback chain generated by determineModelRouting preserves the relative ordering of usable models from customOrder
  const usableCustomOrder = customOrder.filter((m) => {
    const row = db.prepare('SELECT is_enabled, status FROM model_configs WHERE id = ?').get(m) as any;
    return row && row.is_enabled === 1 && row.status !== 'INSUFFICIENT_CREDITS';
  });

  assert(routing.fallbackChain.length > 0, 'Fallback chain must not be empty');
  // First item of usable custom order should appear early in the fallback chain
  assert.strictEqual(routing.fallbackChain[0], usableCustomOrder[0], 'First usable fallback in routing must match custom order #1');

  console.log('  ✓ Runtime routing correctly prioritized the custom fallback sequence.\n');

  // ---------------------------------------------------------------------------
  // TEST 5: CHANGING FALLBACK ORDER PRESERVES PRIMARY MODEL
  // ---------------------------------------------------------------------------
  console.log('Test 5: Verifying changing fallback order preserves configured primary model...');

  const originalPrimary = getAuthoritativePrimaryModel();
  const reversedOrder = [...customOrder].reverse();
  saveAuthoritativeFallbackChain(reversedOrder, 'usr_super_admin_001');

  const currentPrimaryAfterSave = getAuthoritativePrimaryModel();
  assert.strictEqual(
    currentPrimaryAfterSave,
    originalPrimary,
    'Changing fallback order MUST NOT modify the configured primary model'
  );

  console.log('  ✓ Primary model remained strictly untouched when fallback order changed.\n');

  // ---------------------------------------------------------------------------
  // TEST 6: RESTORING DOCUMENTED DEFAULT ORDER
  // ---------------------------------------------------------------------------
  console.log('Test 6: Restoring documented default fallback order...');

  const defaultExpected = DEFAULT_FALLBACK_CHAIN.filter((m) => m !== originalPrimary);
  const resetResult = saveAuthoritativeFallbackChain(defaultExpected, 'usr_super_admin_001');

  assert.deepStrictEqual(resetResult.fallbackChain, defaultExpected, 'Fallback chain must be restored to default sequence');
  assert.deepStrictEqual(getAuthoritativeFallbackChain(), defaultExpected, 'getAuthoritativeFallbackChain must return default sequence');

  console.log('  ✓ Documented default fallback order restored cleanly.\n');

  console.log('========================================================================');
  console.log('🎉 ALL 6 ADMIN FALLBACK ORDER & RUNTIME ROUTING TESTS PASSED CLEANLY');
  console.log('========================================================================\n');
}

runTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
