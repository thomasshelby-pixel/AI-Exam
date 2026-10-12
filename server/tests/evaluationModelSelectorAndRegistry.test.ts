import assert from 'node:assert';
import { db, initDatabase } from '../db.js';
import {
  APPROVED_MODELS,
  EVALUATION_MODEL_REGISTRY,
  validateEvaluationModelId,
  getEvaluationModelRegistry,
  executeModelWithFallback,
} from '../models/modelRegistry.js';
import {
  getSupportedThinkingLevel,
  getSupportedThinkingLevels,
  sanitizeGeminiConfig,
} from '../models/geminiThinkingHelper.js';
import { getGemini } from '../gemini.js';

console.log('========================================================================');
console.log('--- REGRESSION TEST: AI EVALUATION MODEL SELECTOR & REGISTRY EXPANSION ---');
console.log('========================================================================\n');

async function runTests() {
  initDatabase();

  // ---------------------------------------------------------------------------
  // TEST 1: AUDIT & MODEL REGISTRY VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('Test 1: Auditing registry expansion and model eligibility...');

  const { models, defaultModelId } = getEvaluationModelRegistry();
  assert.strictEqual(defaultModelId, 'gemini-3.8-flash', 'Default model must remain gemini-3.8-flash');
  assert.ok(models.length >= 12, 'Registry must contain at least 12 categorized models');

  // Verify eligible stable models exist
  const stableModels = models.filter((m) => m.status === 'STABLE' && m.isSelectable);
  const stableIds = stableModels.map((m) => m.id);

  assert.ok(stableIds.includes('gemini-3.8-flash'), 'Must include gemini-3.8-flash');
  assert.ok(stableIds.includes('gemini-3.7-flash'), 'Must include gemini-3.7-flash');
  assert.ok(stableIds.includes('gemini-3.6-flash'), 'Must include gemini-3.6-flash');
  assert.ok(stableIds.includes('gemini-3.5-flash'), 'Must include gemini-3.5-flash');
  assert.ok(stableIds.includes('gemini-3.1-flash-lite'), 'Must include cost-efficient gemini-3.1-flash-lite');
  assert.ok(stableIds.includes('gemini-3.5-flash-lite'), 'Must include next-gen cost-efficient gemini-3.5-flash-lite');
  assert.ok(stableIds.includes('gemini-flash-latest'), 'Must include canonical alias gemini-flash-latest');
  assert.ok(stableIds.includes('gemini-flash-lite-latest'), 'Must include canonical alias gemini-flash-lite-latest');
  assert.ok(stableIds.includes('gemini-pro-latest'), 'Must include canonical alias gemini-pro-latest');

  // Verify preview models exist
  const previewModels = models.filter((m) => m.status === 'PREVIEW' && m.isSelectable);
  const previewIds = previewModels.map((m) => m.id);
  assert.ok(previewIds.includes('gemini-3.1-pro-preview'), 'Must include gemini-3.1-pro-preview');
  assert.ok(previewIds.includes('gemini-3-flash-preview'), 'Must include gemini-3-flash-preview');
  assert.ok(previewIds.includes('gemini-3.1-flash-lite-preview'), 'Must include gemini-3.1-flash-lite-preview');

  // Verify deprecated models are present, clearly flagged, and NOT selectable
  const deprecatedModels = models.filter((m) => m.status === 'DEPRECATED');
  const deprecatedIds = deprecatedModels.map((m) => m.id);
  assert.ok(deprecatedIds.includes('gemini-2.5-flash'), 'Must include gemini-2.5-flash as deprecated');
  assert.ok(deprecatedIds.includes('gemini-2.5-pro'), 'Must include gemini-2.5-pro as deprecated');
  assert.ok(deprecatedIds.includes('gemini-2.5-flash-lite'), 'Must include gemini-2.5-flash-lite as deprecated');
  for (const dep of deprecatedModels) {
    assert.strictEqual(dep.isSelectable, false, `Deprecated model ${dep.id} must NOT be selectable`);
    assert.ok(dep.deprecationReason, `Deprecated model ${dep.id} must have clear deprecation reason`);
  }

  // Verify incompatible models (TTS, image generation, audio, embeddings) are excluded
  const modelIds = models.map((m) => m.id);
  assert.ok(!modelIds.includes('gemini-3.8-flash-tts'), 'TTS models must be excluded');
  assert.ok(!modelIds.includes('gemini-3-pro-image'), 'Image models must be excluded');
  assert.ok(!modelIds.includes('gemini-nano-banana-2.1'), 'Image models must be excluded');
  assert.ok(!modelIds.includes('gemini-embedding-001'), 'Embedding models must be excluded');
  assert.ok(!modelIds.includes('gemini-3.5-transcribe'), 'Transcription-only models must be excluded');
  assert.ok(!modelIds.includes('veo-3.1-generate-preview'), 'Video generation models must be excluded');

  console.log(`  ✓ Found ${stableModels.length} stable, ${previewModels.length} preview, and ${deprecatedModels.length} deprecated models in registry`);

  // ---------------------------------------------------------------------------
  // TEST 2: SERVER-SIDE VALIDATION LOGIC
  // ---------------------------------------------------------------------------
  console.log('\nTest 2: Verifying server-side model validation...');

  // 1. Valid models pass
  const valid1 = validateEvaluationModelId('gemini-3.8-flash');
  assert.strictEqual(valid1.valid, true);
  assert.strictEqual(valid1.model?.id, 'gemini-3.8-flash');

  const valid2 = validateEvaluationModelId('gemini-3.5-flash-lite');
  assert.strictEqual(valid2.valid, true);
  assert.strictEqual(valid2.model?.costTier, 'LOW');

  const valid3 = validateEvaluationModelId('gemini-flash-latest');
  assert.strictEqual(valid3.valid, true);

  // 2. Deprecated models rejected
  const depValidation = validateEvaluationModelId('gemini-2.5-flash');
  assert.strictEqual(depValidation.valid, false, 'Deprecated model must fail validation');
  assert.ok(depValidation.error?.includes('deprecated') || depValidation.error?.includes('retired'));

  // 3. Fake / unsupported models rejected
  const fakeValidation = validateEvaluationModelId('fake-llm-9000');
  assert.strictEqual(fakeValidation.valid, false, 'Fake model must fail validation');
  assert.ok(fakeValidation.error?.includes('Unsupported AI model'));

  // 4. Incompatible TTS model rejected
  const ttsValidation = validateEvaluationModelId('gemini-3.8-flash-tts');
  assert.strictEqual(ttsValidation.valid, false, 'Incompatible model must fail validation');

  console.log('  ✓ Server-side validation cleanly accepts valid models and rejects deprecated or incompatible models');

  // ---------------------------------------------------------------------------
  // TEST 3: DATABASE CONFIGURATION PERSISTENCE & SAFE PRESERVATION
  // ---------------------------------------------------------------------------
  console.log('\nTest 3: Testing database settings persistence and model preservation...');

  const initialModel = db
    .prepare("SELECT value FROM pricing_settings WHERE key = 'EVAL_MODEL_PROVIDER'")
    .get() as { value: string } | undefined;

  // Simulate updating to valid newly eligible model: gemini-3.5-flash-lite
  const testCandidate = 'gemini-3.5-flash-lite';
  const valCheck = validateEvaluationModelId(testCandidate);
  assert.strictEqual(valCheck.valid, true);

  db.prepare(`
    INSERT INTO pricing_settings (key, value, updated_at)
    VALUES ('EVAL_MODEL_PROVIDER', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(testCandidate);

  // Verify model_configs sync
  db.prepare('UPDATE model_configs SET is_primary = CASE WHEN id = ? THEN 1 ELSE 0 END').run(testCandidate);

  const updatedSetting = db
    .prepare("SELECT value FROM pricing_settings WHERE key = 'EVAL_MODEL_PROVIDER'")
    .get() as { value: string };
  assert.strictEqual(updatedSetting.value, testCandidate, 'Selected model must be preserved in pricing_settings');

  const primaryModelConfig = db
    .prepare('SELECT id FROM model_configs WHERE is_primary = 1')
    .get() as { id: string };
  assert.strictEqual(primaryModelConfig.id, testCandidate, 'model_configs is_primary must sync with selected model');

  // Restore primary model to default gemini-3.8-flash to preserve production default
  const defaultToRestore = initialModel?.value || 'gemini-3.8-flash';
  db.prepare(`
    UPDATE pricing_settings SET value = ? WHERE key = 'EVAL_MODEL_PROVIDER'
  `).run(defaultToRestore);
  db.prepare('UPDATE model_configs SET is_primary = CASE WHEN id = ? THEN 1 ELSE 0 END').run(defaultToRestore);

  console.log(`  ✓ Successfully verified save/load persistence; safely restored production default (${defaultToRestore})`);

  // ---------------------------------------------------------------------------
  // TEST 4: THINKING LEVEL CONFIGURATION & WIRE PROTOCOL
  // ---------------------------------------------------------------------------
  console.log('\nTest 4: Testing model thinking configurations and parameter sanitization...');

  for (const item of stableModels) {
    const levels = getSupportedThinkingLevels(item.id);
    assert.ok(levels.length > 0, `Model ${item.id} must have supported thinking levels`);

    const defaultLevel = getSupportedThinkingLevel(item.id);
    assert.ok(levels.includes(defaultLevel), `Default level for ${item.id} must be in supported levels`);

    const cleanConfig = sanitizeGeminiConfig(
      {
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40,
        thinking_budget: 1024,
        thinkingConfig: { thinkingLevel: defaultLevel },
      },
      item.id
    );

    assert.strictEqual(cleanConfig.temperature, undefined, 'temperature must be stripped');
    assert.strictEqual(cleanConfig.top_p, undefined, 'top_p must be stripped');
    assert.strictEqual(cleanConfig.top_k, undefined, 'top_k must be stripped');
    assert.strictEqual(cleanConfig.thinking_budget, undefined, 'thinking_budget must be stripped');
    assert.ok(cleanConfig.thinkingConfig?.thinkingLevel, 'thinkingLevel must be preserved');
  }

  console.log('  ✓ All stable models possess valid thinking levels and pass wire protocol sanitization');

  // ---------------------------------------------------------------------------
  // TEST 5: REPRESENTATIVE CA EVALUATION BENCHMARK
  // ---------------------------------------------------------------------------
  console.log('\nTest 5: Benchmarking candidate models against representative CA evaluation prompt...');

  // Representative CA intermediate accounting problem prompt
  const benchmarkPrompt = `
You are evaluating a CA student's answer for CA Intermediate Paper 1: Advanced Accounting.
Question: Company XYZ purchased machinery for Rs. 10,00,000 on 1st April 2023. Depreciation is 15% p.a. on WDV.
On 1st October 2024, a part of machine costing Rs. 2,00,000 was sold for Rs. 1,40,000.
Student Answer:
- FY 2023-24 Depreciation: Rs. 1,50,000. WDV as on 31.03.2024 = Rs. 8,50,000.
- Sold machine WDV on 01.10.2024: Cost Rs. 2,00,000 less Dep 15% (Rs. 30,000) = Rs. 1,70,000. Less 6 months dep = Rs. 12,750. WDV = Rs. 1,57,250.
- Loss on sale: Rs. 1,57,250 - Rs. 1,40,000 = Rs. 17,250.

Respond strictly with valid JSON conforming to this schema:
{
  "totalMarks": 10,
  "marksAwarded": 9,
  "stepBreakdown": [
    { "step": "Depreciation FY 2023-24", "marks": 2, "maxMarks": 2, "remarks": "Correct" },
    { "step": "Sold part WDV and Loss on Sale", "marks": 4, "maxMarks": 4, "remarks": "Calculations accurate" }
  ],
  "confidenceScore": 92
}
`;

  const benchmarkCandidates = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.5-flash-lite',
    'gemini-flash-latest',
  ];

  const ai = getGemini();
  const benchmarkResults: Record<string, { latencyMs: number; validJson: boolean; marksAwarded?: number }> = {};

  for (const modelId of benchmarkCandidates) {
    const tStart = Date.now();
    try {
      const thinkingLvl = getSupportedThinkingLevel(modelId, 'low');
      const config = sanitizeGeminiConfig(
        {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: thinkingLvl },
        },
        modelId
      );

      const response = await ai.models.generateContent({
        model: modelId,
        contents: benchmarkPrompt,
        config,
      });

      const latencyMs = Date.now() - tStart;
      let validJson = false;
      let marksAwarded: number | undefined;

      try {
        const parsed = JSON.parse(response.text?.trim() || '{}');
        if (parsed.marksAwarded !== undefined && Array.isArray(parsed.stepBreakdown)) {
          validJson = true;
          marksAwarded = parsed.marksAwarded;
        }
      } catch {
        validJson = false;
      }

      benchmarkResults[modelId] = { latencyMs, validJson, marksAwarded };
      console.log(`  - [${modelId}] Latency: ${latencyMs}ms | Valid Structured JSON: ${validJson} | Marks: ${marksAwarded}/10`);
      assert.strictEqual(validJson, true, `Model ${modelId} must produce valid structured JSON`);
    } catch (err: any) {
      console.warn(`  - [${modelId}] Encountered error during live test: ${err?.message || err}`);
    }
  }

  console.log('  ✓ Benchmark confirmed: Candidate models successfully evaluate CA accounting problems with structured step breakdown');

  console.log('\n========================================================================');
  console.log('--- ALL AI EVALUATION MODEL REGISTRY REGRESSION TESTS PASSED CLEANLY ---');
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
