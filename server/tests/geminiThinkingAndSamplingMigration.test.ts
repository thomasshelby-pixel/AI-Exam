import assert from 'node:assert';
import {
  getSupportedThinkingLevel,
  getSupportedThinkingLevels,
  buildGeminiThinkingConfig,
  sanitizeGeminiConfig,
} from '../models/geminiThinkingHelper.js';
import { generateContentWithResilience, getGemini } from '../gemini.js';
import { executeModelWithFallback } from '../models/modelRegistry.js';

console.log('--- STARTING GEMINI THINKING & SAMPLING MIGRATION REGRESSION TESTS ---');

// ==============================================================================
// TEST SUITE A: Gemini requests never contain deprecated parameters
// ==============================================================================
console.log('\n[TEST A] Checking sanitization strips deprecated parameters...');

const dirtyConfig = {
  temperature: 0.7,
  top_p: 0.95,
  topP: 0.9,
  top_k: 40,
  topK: 50,
  thinking_budget: 1024,
  thinkingBudget: 2048,
  responseMimeType: 'application/json',
  thinkingConfig: {
    thinking_budget: 4096,
    thinkingBudget: 8192,
    thinkingLevel: 'HIGH',
  },
};

const sanitized = sanitizeGeminiConfig(dirtyConfig, 'gemini-3.8-flash');

assert.strictEqual(sanitized.temperature, undefined, 'temperature must be stripped');
assert.strictEqual(sanitized.top_p, undefined, 'top_p must be stripped');
assert.strictEqual(sanitized.topP, undefined, 'topP must be stripped');
assert.strictEqual(sanitized.top_k, undefined, 'top_k must be stripped');
assert.strictEqual(sanitized.topK, undefined, 'topK must be stripped');
assert.strictEqual(sanitized.thinking_budget, undefined, 'thinking_budget must be stripped');
assert.strictEqual(sanitized.thinkingBudget, undefined, 'thinkingBudget must be stripped');
assert.strictEqual(sanitized.thinkingConfig.thinking_budget, undefined, 'thinkingConfig.thinking_budget must be stripped');
assert.strictEqual(sanitized.thinkingConfig.thinkingBudget, undefined, 'thinkingConfig.thinkingBudget must be stripped');
assert.strictEqual(sanitized.responseMimeType, 'application/json', 'valid options must be preserved');
console.log('✓ TEST A PASSED: All deprecated parameters stripped completely.');

// ==============================================================================
// TEST SUITE B: Gemini 3.8 Flash uses supported thinking_level & rejects minimal
// ==============================================================================
console.log('\n[TEST B] Checking Gemini 3.8 Flash thinking level validation...');

const levels38 = getSupportedThinkingLevels('gemini-3.8-flash');
assert.deepStrictEqual(levels38, ['low', 'medium', 'high'], 'gemini-3.8-flash supported levels must be low, medium, high');
assert.ok(!levels38.includes('minimal' as any), 'gemini-3.8-flash must NEVER support minimal');

// Default when none specified
assert.strictEqual(getSupportedThinkingLevel('gemini-3.8-flash'), 'high', 'Default for 3.8 Flash is high');

// Valid requests
assert.strictEqual(getSupportedThinkingLevel('gemini-3.8-flash', 'low'), 'low');
assert.strictEqual(getSupportedThinkingLevel('gemini-3.8-flash', 'LOW'), 'low');
assert.strictEqual(getSupportedThinkingLevel('gemini-3.8-flash', 'medium'), 'medium');
assert.strictEqual(getSupportedThinkingLevel('gemini-3.8-flash', 'high'), 'high');
assert.strictEqual(getSupportedThinkingLevel('gemini-3.8-flash', 'XHIGH'), 'high');

// Prohibited 'minimal' mapping for 3.8 Flash
assert.strictEqual(
  getSupportedThinkingLevel('gemini-3.8-flash', 'minimal'),
  'low',
  'gemini-3.8-flash must safely map minimal to low'
);
assert.strictEqual(
  getSupportedThinkingLevel('gemini-3.8-flash', 'MINIMAL'),
  'low',
  'gemini-3.8-flash must safely map MINIMAL to low'
);

const configWithMinimal = sanitizeGeminiConfig({
  thinkingConfig: { thinkingLevel: 'minimal' },
}, 'gemini-3.8-flash');
assert.strictEqual(
  configWithMinimal.thinkingConfig.thinkingLevel,
  'low',
  'Sanitizer must ensure 3.8 flash receives low instead of minimal'
);

console.log('✓ TEST B PASSED: Gemini 3.8 Flash correctly validated and never receives minimal.');

// ==============================================================================
// TEST SUITE C: Fallback models receive compatible thinking levels
// ==============================================================================
console.log('\n[TEST C] Checking fallback model thinking levels...');

// gemini-3.7-flash
const levels37 = getSupportedThinkingLevels('gemini-3.7-flash');
assert.deepStrictEqual(levels37, ['low', 'medium', 'high']);
assert.strictEqual(getSupportedThinkingLevel('gemini-3.7-flash', 'minimal'), 'low', '3.7 maps minimal to low');
assert.strictEqual(getSupportedThinkingLevel('gemini-3.7-flash', 'high'), 'high');

// gemini-3.6-flash supports minimal
const levels36 = getSupportedThinkingLevels('gemini-3.6-flash');
assert.deepStrictEqual(levels36, ['minimal', 'low', 'medium', 'high']);
assert.strictEqual(getSupportedThinkingLevel('gemini-3.6-flash', 'minimal'), 'minimal', '3.6 supports minimal');

// gemini-3.1-flash-lite default is low for latency
assert.strictEqual(getSupportedThinkingLevel('gemini-3.1-flash-lite'), 'low', '3.1 flash lite default is low');

// gemini-flash-latest
assert.strictEqual(getSupportedThinkingLevel('gemini-flash-latest', 'high'), 'high');

console.log('✓ TEST C PASSED: Fallback models receive only supported thinking levels.');

// ==============================================================================
// TEST SUITE D: Retry and fallback paths do not reintroduce deprecated parameters
// ==============================================================================
console.log('\n[TEST D] Checking retry and fallback paths never reintroduce deprecated parameters...');

// Simulate incoming retry payloads with older or mixed parameters
const retryCandidateConfigs = [
  { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
  { top_p: 0.9, top_k: 20 },
  { thinking_budget: 2000, temperature: 0.5 },
  { thinking_level: 'minimal' },
];

for (const candidate of retryCandidateConfigs) {
  for (const model of ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite']) {
    const cleaned = sanitizeGeminiConfig(candidate, model);
    assert.strictEqual(cleaned.temperature, undefined);
    assert.strictEqual(cleaned.top_p, undefined);
    assert.strictEqual(cleaned.top_k, undefined);
    assert.strictEqual(cleaned.thinking_budget, undefined);
    assert.strictEqual(cleaned.thinkingBudget, undefined);
    assert.ok(cleaned.thinkingConfig, 'thinkingConfig must be present');
    assert.strictEqual(cleaned.thinkingConfig.thinking_budget, undefined);
    assert.strictEqual(cleaned.thinkingConfig.thinkingBudget, undefined);

    const levels = getSupportedThinkingLevels(model);
    assert.ok(
      levels.includes(cleaned.thinkingConfig.thinkingLevel),
      `Model ${model} must only receive a supported thinking level (got ${cleaned.thinkingConfig.thinkingLevel})`
    );
  }
}
console.log('✓ TEST D PASSED: Retry and fallback paths never reintroduce deprecated parameters.');

// ==============================================================================
// TEST SUITE E: Wire protocol simulation against @google/genai SDK
// ==============================================================================
console.log('\n[TEST E] Intercepting SDK request payload structure...');

async function testSdkWirePayload() {
  const originalFetch = global.fetch;
  let interceptedPayload: any = null;

  try {
    global.fetch = async (_url: any, options: any) => {
      interceptedPayload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ status: 'OK', marksAwarded: 5 }) }],
              },
            },
          ],
        }),
        text: async () =>
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify({ status: 'OK', marksAwarded: 5 }) }],
                },
              },
            ],
          }),
      } as any;
    };

    const ai = getGemini();

    // 1. Test generateContentWithResilience with dirty config containing legacy params
    await generateContentWithResilience(ai, {
      contents: [{ text: 'Evaluate student CA answer sheet' }],
      config: {
        temperature: 0.1,
        top_p: 0.95,
        thinking_budget: 4096,
        responseMimeType: 'application/json',
      },
    });

    assert.ok(interceptedPayload, 'Request payload was intercepted');
    const genConfig = interceptedPayload.generationConfig;
    assert.ok(genConfig, 'generationConfig exists');

    // Verify wire payload fields:
    assert.strictEqual(genConfig.temperature, undefined, 'Wire payload must NOT have temperature');
    assert.strictEqual(genConfig.topP, undefined, 'Wire payload must NOT have topP');
    assert.strictEqual(genConfig.top_p, undefined, 'Wire payload must NOT have top_p');
    assert.strictEqual(genConfig.topK, undefined, 'Wire payload must NOT have topK');
    assert.strictEqual(genConfig.top_k, undefined, 'Wire payload must NOT have top_k');
    assert.strictEqual(genConfig.thinkingBudget, undefined, 'Wire payload must NOT have thinkingBudget');
    assert.strictEqual(genConfig.thinking_budget, undefined, 'Wire payload must NOT have thinking_budget');

    assert.ok(genConfig.thinkingConfig, 'Wire payload must have thinkingConfig');
    assert.strictEqual(genConfig.thinkingConfig.thinkingBudget, undefined, 'Wire thinkingConfig must NOT have thinkingBudget');
    assert.strictEqual(genConfig.thinkingConfig.thinking_budget, undefined, 'Wire thinkingConfig must NOT have thinking_budget');
    assert.strictEqual(genConfig.thinkingConfig.thinkingLevel, 'high', 'Gemini 3.8 Flash wire thinkingLevel is high');

    console.log('✓ TEST E PASSED: Wire HTTP payload intercepted and verified free of deprecated parameters.');
  } finally {
    global.fetch = originalFetch;
  }
}

await testSdkWirePayload();

// ==============================================================================
// TEST SUITE F: Static Source Code Audit
// ==============================================================================
console.log('\n[TEST F] Running static repository audit on production Gemini call sites...');

import fs from 'node:fs';

const filesToAudit = [
  'server/gemini.ts',
  'server/models/modelRegistry.ts',
  'server/services/mcqAiService.ts',
  'server/services/questionChunkEvaluator.ts',
  'server/services/answerSheetCoverageService.ts',
];

for (const relPath of filesToAudit) {
  const content = fs.readFileSync(relPath, 'utf8');

  // Verify no active call site sets temperature in config passed to Gemini
  // (Ignoring comments or OpenAI provider call)
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/*') ||
      relPath.includes('modelRegistry.ts') && line.includes('requestPayload.temperature') // OpenAI block
    ) {
      return;
    }
    assert.ok(
      !line.includes('temperature:') && !line.includes('temperature ='),
      `Deprecated temperature found in ${relPath}:${idx + 1}: ${line}`
    );
    assert.ok(
      !line.includes('thinking_budget:') && !line.includes('thinkingBudget:'),
      `Deprecated thinking_budget found in ${relPath}:${idx + 1}: ${line}`
    );
  });
}

console.log('✓ TEST F PASSED: All production Gemini call sites verified clean.');

console.log('\n=============================================================');
console.log('ALL GEMINI THINKING & SAMPLING MIGRATION TESTS PASSED (6/6)');
console.log('=============================================================\n');
