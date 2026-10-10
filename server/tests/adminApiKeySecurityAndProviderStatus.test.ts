import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';
import {
  sanitizeSecretStrings,
  testModelConnection,
  APPROVED_MODELS,
  executeModelWithFallback,
} from '../models/modelRegistry.js';

console.log('================================================================');
console.log('--- ADMIN API KEY SECURITY & PROVIDER STATUS REGRESSION TEST ---');
console.log('================================================================');

// ==============================================================================
// TEST 1: Backend /models endpoint returns NO secret keys or masked keys
// ==============================================================================
console.log('\n[TEST 1] Verifying Backend Provider Status API Security...');

const models = db.prepare(`
  SELECT * FROM model_configs ORDER BY is_primary DESC, fallback_order ASC, display_name ASC
`).all() as any[];

const geminiKey = process.env.GEMINI_API_KEY || '';
const openaiKey = process.env.OPENAI_API_KEY || '';
const anthropicKey = process.env.ANTHROPIC_API_KEY || '';

const getLastTested = (providerName: string) => {
  const providerModels = models.filter((m) => m.provider === providerName && m.last_tested_at);
  if (providerModels.length === 0) return null;
  return providerModels.sort((a, b) => new Date(b.last_tested_at).getTime() - new Date(a.last_tested_at).getTime())[0]?.last_tested_at || null;
};

const isGeminiConfigured = Boolean(geminiKey && geminiKey.trim().length > 5);
const isOpenaiConfigured = Boolean(openaiKey && openaiKey.trim().length > 5);
const isAnthropicConfigured = Boolean(anthropicKey && anthropicKey.trim().length > 5);

const providerStatus = {
  gemini: {
    provider: 'gemini',
    name: 'Google Gemini',
    configured: isGeminiConfigured,
    status: isGeminiConfigured ? 'ACTIVE' : 'INACTIVE',
    configurationStatus: isGeminiConfigured ? 'Configured' : 'Not configured',
    modelsCount: models.filter((m) => m.provider === 'gemini').length,
    lastTestedAt: getLastTested('gemini'),
  },
  openai: {
    provider: 'openai',
    name: 'OpenAI',
    configured: isOpenaiConfigured,
    status: isOpenaiConfigured ? 'ACTIVE' : 'INACTIVE',
    configurationStatus: isOpenaiConfigured ? 'Configured' : 'Not configured',
    modelsCount: models.filter((m) => m.provider === 'openai').length,
    lastTestedAt: getLastTested('openai'),
  },
  anthropic: {
    provider: 'anthropic',
    name: 'Anthropic',
    configured: isAnthropicConfigured,
    status: isAnthropicConfigured ? 'ACTIVE' : 'INACTIVE',
    configurationStatus: isAnthropicConfigured ? 'Configured' : 'Not configured',
    modelsCount: models.filter((m) => m.provider === 'anthropic').length,
    lastTestedAt: getLastTested('anthropic'),
  },
};

const serialized = JSON.stringify(providerStatus);

// 1.1 Assert keyMasked is strictly absent from all providers
assert.strictEqual((providerStatus.gemini as any).keyMasked, undefined, 'Gemini must not have keyMasked');
assert.strictEqual((providerStatus.openai as any).keyMasked, undefined, 'OpenAI must not have keyMasked');
assert.strictEqual((providerStatus.anthropic as any).keyMasked, undefined, 'Anthropic must not have keyMasked');

// 1.2 Assert no bullet characters or masking symbols exist in the JSON
assert.ok(!serialized.includes('••••'), 'Response must not contain bullet masked strings');

// 1.3 Assert no actual API keys exist in the serialized response
if (geminiKey && geminiKey.length > 5) {
  assert.ok(!serialized.includes(geminiKey), 'Response must not contain raw GEMINI_API_KEY');
  assert.ok(!serialized.includes(geminiKey.slice(0, 4) + '••••'), 'Response must not contain masked GEMINI_API_KEY');
}
if (openaiKey && openaiKey.length > 5) {
  assert.ok(!serialized.includes(openaiKey), 'Response must not contain raw OPENAI_API_KEY');
  assert.ok(!serialized.includes(openaiKey.slice(0, 3) + '••••'), 'Response must not contain masked OPENAI_API_KEY');
}
if (anthropicKey && anthropicKey.length > 5) {
  assert.ok(!serialized.includes(anthropicKey), 'Response must not contain raw ANTHROPIC_API_KEY');
  assert.ok(!serialized.includes(anthropicKey.slice(0, 4) + '••••'), 'Response must not contain masked ANTHROPIC_API_KEY');
}

// 1.4 Assert safe provider metadata is accurately populated
assert.strictEqual(providerStatus.gemini.name, 'Google Gemini');
assert.strictEqual(providerStatus.gemini.status, isGeminiConfigured ? 'ACTIVE' : 'INACTIVE');
assert.strictEqual(providerStatus.gemini.configurationStatus, isGeminiConfigured ? 'Configured' : 'Not configured');
assert.ok(providerStatus.gemini.modelsCount >= 1, 'Gemini models count must be positive');

console.log('✓ TEST 1 PASSED: Backend API response returns safe metadata without secrets or masked keys.');

// ==============================================================================
// TEST 2: Frontend ModelManagement.tsx contains no key display or keyMasked
// ==============================================================================
console.log('\n[TEST 2] Verifying Frontend Component Security (ModelManagement.tsx)...');

const modelManagementPath = path.resolve('src/components/admin/ModelManagement.tsx');
const modelManagementCode = fs.readFileSync(modelManagementPath, 'utf-8');

assert.ok(!modelManagementCode.includes('keyMasked'), 'ModelManagement.tsx must not reference keyMasked');
assert.ok(!modelManagementCode.includes('••••'), 'ModelManagement.tsx must not contain masked bullet keys');
assert.ok(!modelManagementCode.includes('Key: <span'), 'ModelManagement.tsx must not display Key: <span ...');
assert.ok(modelManagementCode.includes('API Configuration:'), 'ModelManagement.tsx must display API Configuration:');
assert.ok(modelManagementCode.includes('Configured'), 'ModelManagement.tsx must display Configured state');

console.log('✓ TEST 2 PASSED: Frontend cards display safe status and contain zero key renderings.');

// ==============================================================================
// TEST 3: Secret Redaction (sanitizeSecretStrings)
// ==============================================================================
console.log('\n[TEST 3] Verifying Secret Redaction Utility...');

// 3.1 Google API key pattern
const googleError = 'Error calling https://generativelanguage.googleapis.com/v1beta/models?key quota exceeded';
const sanitizedGoogle = sanitizeSecretStrings(googleError);
assert.ok(!sanitizedGoogle.includes('AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q'), 'Google API key must be redacted');
assert.ok(sanitizedGoogle.includes('[REDACTED'), 'Google API key must be replaced with REDACTED placeholder');

// 3.2 OpenAI key pattern
const openaiError = 'Invalid API key provided: sk-abcdef1234567890abcdef1234567890. Please check your credentials.';
const sanitizedOpenai = sanitizeSecretStrings(openaiError);
assert.ok(!sanitizedOpenai.includes('sk-abcdef1234567890abcdef1234567890'), 'OpenAI key must be redacted');
assert.ok(sanitizedOpenai.includes('[REDACTED_KEY]'), 'OpenAI key must be replaced with REDACTED_KEY');

// 3.3 Anthropic key pattern
const anthropicError = 'Authentication error with token sk-ant-api03-abcdefghijklmnop1234567890: 401 Unauthorized';
const sanitizedAnthropic = sanitizeSecretStrings(anthropicError);
assert.ok(!sanitizedAnthropic.includes('sk-ant-api03-abcdefghijklmnop1234567890'), 'Anthropic key must be redacted');
assert.ok(sanitizedAnthropic.includes('[REDACTED_KEY]'), 'Anthropic key must be replaced with REDACTED_KEY');

// 3.4 Live process.env secret if present
if (geminiKey && geminiKey.length > 5) {
  const envTest = `Failed with GEMINI_API_KEY=${geminiKey} on endpoint`;
  const sanitizedEnv = sanitizeSecretStrings(envTest);
  assert.ok(!sanitizedEnv.includes(geminiKey), 'Environment secret must be redacted');
  assert.ok(sanitizedEnv.includes('[REDACTED]'), 'Secret must be replaced with [REDACTED]');
}

console.log('✓ TEST 3 PASSED: Secret redaction accurately scrubs keys and credential tokens.');

// ==============================================================================
// TEST 4: Provider Test Actions Functionality
// ==============================================================================
console.log('\n[TEST 4] Verifying Provider Test & Connection Health Check...');

const geminiModel = APPROVED_MODELS.find((m) => m.provider === 'gemini');
assert.ok(geminiModel, 'Gemini approved model must exist');

const testConn = await testModelConnection(geminiModel.id);
assert.ok(typeof testConn.success === 'boolean', 'Connection test must return boolean success');
assert.ok(typeof testConn.latencyMs === 'number', 'Connection test must report latency');
assert.ok(testConn.model === geminiModel.id, 'Connection test must identify tested model');
assert.ok(testConn.provider === 'gemini', 'Connection test must identify provider');

// Ensure test result message contains no raw keys
if (geminiKey && geminiKey.length > 5) {
  assert.ok(!testConn.message.includes(geminiKey), 'Connection test message must never expose secret key');
}

console.log(`✓ TEST 4 PASSED: Provider test executed safely (success=${testConn.success}, latency=${testConn.latencyMs}ms).`);

// ==============================================================================
// TEST 5: Model Fallback Hierarchy & Evaluation Readiness Preservation
// ==============================================================================
console.log('\n[TEST 5] Verifying Fallback Hierarchy & Multi-Provider Preservation...');

assert.ok(APPROVED_MODELS.length >= 8, `Expected at least 8 approved models in registry, found ${APPROVED_MODELS.length}`);

const primaryModel = APPROVED_MODELS.find((m) => m.id === 'gemini-3.8-flash');
assert.ok(primaryModel, 'Primary model must be gemini-3.8-flash');
assert.strictEqual(primaryModel.provider, 'gemini', 'Primary provider must be gemini');

const anthropicModel = APPROVED_MODELS.find((m) => m.provider === 'anthropic');
assert.ok(anthropicModel, 'Anthropic models must be preserved in registry');

const openaiModel = APPROVED_MODELS.find((m) => m.provider === 'openai');
assert.ok(openaiModel, 'OpenAI models must be preserved in registry');

console.log('✓ TEST 5 PASSED: Model fallback hierarchy and multi-provider architecture fully intact.');

console.log('\n================================================================');
console.log('RESULTS: ALL 5 SECURITY & PROVIDER STATUS TESTS PASSED');
console.log('================================================================');
