import assert from 'node:assert';
import { db, initDatabase } from '../db.js';
import {
  APPROVED_MODELS,
  EVALUATION_MODEL_REGISTRY,
  validateEvaluationModelId,
  getEvaluationModelRegistry,
  determineModelRouting,
  clearModelCooldown,
  buildOpenAIUserContent,
  isOpenAIReasoningModel,
  getOpenAIThinkingLevel,
  isOpenAIParameterCompatibilityError,
} from '../models/modelRegistry.js';
import { buildMarksLeakReport } from '../../src/utils/marksLeakDetector.js';
import { parseAndValidateQuestionChunkOutput } from '../services/questionChunkEvaluator.js';
import { applyMultiModeMarkingPhilosophy } from '../services/multiModeMarkingEngine.js';
import {
  getSupportedThinkingLevel,
  getSupportedThinkingLevels,
  sanitizeGeminiConfig,
} from '../models/geminiThinkingHelper.js';

console.log('========================================================================');
console.log('--- REGRESSION TEST: STRICT RUNTIME AI MODEL WHITELIST & REGISTRY ---');
console.log('========================================================================\n');

async function runTests() {
  initDatabase();

  // ---------------------------------------------------------------------------
  // TEST 1: STRICT INVENTORY AUDIT & VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('Test 1: Auditing strict runtime model inventory whitelist...');

  // 1A. Google Gemini: Exactly 3 entries
  const geminiModels = APPROVED_MODELS.filter((m) => m.provider === 'gemini');
  assert.strictEqual(geminiModels.length, 3, 'Gemini must have exactly 3 entries in APPROVED_MODELS');
  const geminiIds = geminiModels.map((m) => m.id);
  assert.deepStrictEqual(
    geminiIds.sort(),
    ['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash'].sort(),
    'Gemini approved inventory must strictly be 3.8 Flash, 3.6 Flash, and 3.1 Flash Lite'
  );

  // 1B. OpenAI: Exactly 3 entries preserved
  const openaiModels = APPROVED_MODELS.filter((m) => m.provider === 'openai');
  assert.strictEqual(openaiModels.length, 3, 'OpenAI must preserve exactly 3 configured entries');
  const openaiIds = openaiModels.map((m) => m.id);
  assert.deepStrictEqual(
    openaiIds.sort(),
    ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-6-astra'].sort(),
    'OpenAI inventory must strictly contain GPT-5.6 Sol, GPT-5.6 Terra, and GPT-6 Astra'
  );

  // 1C. Anthropic Claude: Exactly 2 entries preserved
  const anthropicModels = APPROVED_MODELS.filter((m) => m.provider === 'anthropic');
  assert.strictEqual(anthropicModels.length, 2, 'Anthropic Claude must preserve exactly 2 configured entries');
  const anthropicIds = anthropicModels.map((m) => m.id);
  assert.deepStrictEqual(
    anthropicIds.sort(),
    ['claude-opus-5', 'claude-sonnet-5'].sort(),
    'Anthropic Claude inventory must strictly contain Claude Opus 5 and Claude Sonnet 5'
  );

  // Total approved models = 8 (3 Gemini, 3 OpenAI, 2 Claude)
  assert.strictEqual(APPROVED_MODELS.length, 8, 'APPROVED_MODELS must have exactly 8 entries (3 Gemini, 3 OpenAI, 2 Claude)');

  // 1D. Evaluation Selection Registry
  const { models, defaultModelId } = getEvaluationModelRegistry();
  assert.strictEqual(defaultModelId, 'gemini-3.8-flash', 'Default model must remain gemini-3.8-flash');

  const selectableModels = models.filter((m) => m.isSelectable);
  assert.strictEqual(selectableModels.length, 8, 'Selectable evaluation models registry must contain all 8 approved models (3 Gemini, 3 OpenAI, 2 Claude)');
  const selectableIds = selectableModels.map((m) => m.id);
  assert.ok(selectableIds.includes('gemini-3.8-flash'), 'Must include gemini-3.8-flash');
  assert.ok(selectableIds.includes('gemini-3.6-flash'), 'Must include gemini-3.6-flash');
  assert.ok(selectableIds.includes('gemini-3.1-flash-lite'), 'Must include gemini-3.1-flash-lite');
  assert.ok(selectableIds.includes('gpt-5.6-sol'), 'Must include gpt-5.6-sol');
  assert.ok(selectableIds.includes('gpt-5.6-terra'), 'Must include gpt-5.6-terra');
  assert.ok(selectableIds.includes('gpt-6-astra'), 'Must include gpt-6-astra');
  assert.ok(selectableIds.includes('claude-opus-5'), 'Must include claude-opus-5');
  assert.ok(selectableIds.includes('claude-sonnet-5'), 'Must include claude-sonnet-5');

  // Verify unapproved Gemini models are completely absent from active selection lists
  const unapprovedTestIds = [
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-pro-latest',
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite-preview',
    'gemini-3.1-pro-preview',
  ];
  for (const uid of unapprovedTestIds) {
    assert.strictEqual(selectableIds.includes(uid), false, `Unapproved model ${uid} must NOT be selectable`);
  }

  // Verify deprecated legacy models are labeled and not selectable
  const deprecatedModels = models.filter((m) => m.status === 'DEPRECATED');
  for (const dep of deprecatedModels) {
    assert.strictEqual(dep.isSelectable, false, `Deprecated model ${dep.id} must NOT be selectable`);
    assert.ok(dep.deprecationReason, `Deprecated model ${dep.id} must have clear deprecation reason`);
  }

  console.log('  ✓ Strict inventory validated: 3 Gemini, 3 OpenAI, 2 Claude. Unapproved models rejected.');
  // Verify provider-specific PDF transport. This is a pure unit test; no live API calls.
  const pdfContent = buildOpenAIUserContent({
    pdfBase64: 'JVBERi0xLjQ=',
    mimeType: 'application/pdf',
    userPrompt: 'Evaluate this answer sheet.',
  });
  assert.deepStrictEqual(pdfContent[0], {
    type: 'file',
    file: {
      filename: 'answer-sheet.pdf',
      file_data: 'data:application/pdf;base64,JVBERi0xLjQ=',
    },
  }, 'PDFs must use the OpenAI file content part, not image_url');
  assert.deepStrictEqual(pdfContent[1], {
    type: 'text',
    text: 'Evaluate this answer sheet.',
  });

  const imageContent = buildOpenAIUserContent({
    pdfBase64: 'aW1hZ2U=',
    mimeType: 'image/jpeg',
    userPrompt: 'Inspect this image.',
  });
  assert.strictEqual(imageContent[0].type, 'image_url', 'Non-PDF image uploads must retain image_url transport');
  assert.strictEqual(imageContent[1].type, 'text');

  console.log('  ✓ OpenAI PDF and image content-part formats validated without live API calls.');


  // ---------------------------------------------------------------------------
  // TEST 2: SERVER-SIDE VALIDATION & REJECTION LOGIC
  // ---------------------------------------------------------------------------
  console.log('\nTest 2: Verifying server-side model validation and rejection...');

  // Approved models pass
  assert.strictEqual(validateEvaluationModelId('gemini-3.8-flash').valid, true);
  assert.strictEqual(validateEvaluationModelId('gemini-3.6-flash').valid, true);
  assert.strictEqual(validateEvaluationModelId('gemini-3.1-flash-lite').valid, true);

  // Unapproved models fail
  for (const unapprovedId of unapprovedTestIds) {
    const res = validateEvaluationModelId(unapprovedId);
    assert.strictEqual(res.valid, false, `Model '${unapprovedId}' must fail validation`);
    assert.ok(res.error, `Validation error message expected for '${unapprovedId}'`);
  }

  // Deprecated models fail
  assert.strictEqual(validateEvaluationModelId('gemini-2.5-flash').valid, false);
  assert.strictEqual(validateEvaluationModelId('gemini-2.5-pro').valid, false);

  // Arbitrary / fake / incompatible models fail
  assert.strictEqual(validateEvaluationModelId('fake-llm-9000').valid, false);
  assert.strictEqual(validateEvaluationModelId('gemini-3.8-flash-tts').valid, false);

  console.log('  ✓ Server-side validation cleanly accepts approved models and rejects all unapproved models.');

  // ---------------------------------------------------------------------------
  // TEST 3: DATABASE CONFIGURATION & FALLBACK SETTINGS
  // ---------------------------------------------------------------------------
  console.log('\nTest 3: Testing database settings persistence and fallback defaults...');

  const fallbackSetting = db
    .prepare("SELECT value FROM pricing_settings WHERE key = 'EVAL_FALLBACK_MODEL'")
    .get() as { value: string };
  assert.strictEqual(fallbackSetting.value, 'gemini-3.6-flash', 'Default fallback model must be gemini-3.6-flash');

  // Verify database model_configs table strictly has the approved models
  const dbModelConfigs = db.prepare('SELECT id, provider, is_primary FROM model_configs').all() as any[];
  assert.strictEqual(dbModelConfigs.length, 8, 'model_configs table must contain exactly 8 approved models');
  for (const m of dbModelConfigs) {
    assert.ok(APPROVED_MODELS.some((am) => am.id === m.id), `Database contains unapproved model: ${m.id}`);
  }

  // Test updating EVAL_MODEL_PROVIDER to gemini-3.6-flash and restoring
  const initialModel = db
    .prepare("SELECT value FROM pricing_settings WHERE key = 'EVAL_MODEL_PROVIDER'")
    .get() as { value: string } | undefined;

  db.prepare(`
    INSERT INTO pricing_settings (key, value, updated_at)
    VALUES ('EVAL_MODEL_PROVIDER', 'gemini-3.6-flash', CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run();

  const checkUpdated = db.prepare("SELECT value FROM pricing_settings WHERE key = 'EVAL_MODEL_PROVIDER'").get() as { value: string };
  assert.strictEqual(checkUpdated.value, 'gemini-3.6-flash');

  // Restore production default
  const defaultToRestore = initialModel?.value || 'gemini-3.8-flash';
  db.prepare("UPDATE pricing_settings SET value = ? WHERE key = 'EVAL_MODEL_PROVIDER'").run(defaultToRestore);
  db.prepare('UPDATE model_configs SET is_primary = CASE WHEN id = ? THEN 1 ELSE 0 END').run(defaultToRestore);

  console.log(`  ✓ Database persistence verified and production default restored (${defaultToRestore})`);

  // ---------------------------------------------------------------------------
  // TEST 4: DETERMINISTIC MULTI-PROVIDER ROUTING & FALLBACK HIERARCHY
  // ---------------------------------------------------------------------------
  console.log('\nTest 4: Testing deterministic multi-provider runtime routing...');

  clearModelCooldown();

  // Default routing
  const defaultRouting = determineModelRouting({});
  assert.strictEqual(defaultRouting.primaryModel, 'gemini-3.8-flash', 'Primary model must default to gemini-3.8-flash');
  assert.ok(defaultRouting.fallbackChain.length > 0, 'Fallback chain must be populated');
  for (const fb of defaultRouting.fallbackChain) {
    assert.ok(APPROVED_MODELS.some((m) => m.id === fb), `Fallback model ${fb} must be in APPROVED_MODELS`);
  }

  // Routing with calculation heavy context: should pick gpt-5.6-sol for CA final
  const calcRouting = determineModelRouting({
    level: 'FINAL',
    hasCalculationHeavyContent: true,
  });
  assert.strictEqual(calcRouting.primaryModel, 'gpt-5.6-sol', 'Calculation-heavy CA Final must route to GPT-5.6 Sol');
  assert.strictEqual(calcRouting.thinkingLevel, 'XHIGH');

  // Routing with legal/audit heavy context: should pick claude-opus-5 for CA final
  const legalRouting = determineModelRouting({
    level: 'FINAL',
    subjectKey: 'law',
    subjectName: 'Corporate and Economic Laws',
  });
  assert.strictEqual(legalRouting.primaryModel, 'claude-opus-5', 'Legal/Audit CA Final must route to Claude Opus 5');

  // Wire thinkingLevel sanitization for approved Gemini models
  for (const m of ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite']) {
    const levels = getSupportedThinkingLevels(m);
    assert.ok(levels.length > 0);
    const def = getSupportedThinkingLevel(m);
    assert.ok(levels.includes(def));
    const clean = sanitizeGeminiConfig(
      {
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40,
        thinking_budget: 1024,
        thinkingConfig: { thinkingLevel: def },
      },
      m
    );
    assert.strictEqual(clean.temperature, undefined, 'temperature must be stripped');
    assert.strictEqual(clean.top_p, undefined, 'top_p must be stripped');
    assert.strictEqual(clean.top_k, undefined, 'top_k must be stripped');
    assert.strictEqual(clean.thinking_budget, undefined, 'thinking_budget must be stripped');
    assert.strictEqual(clean.thinkingConfig.thinkingLevel, def);
  }

  // Provider parity: registry HIGH-reasoning Astra must use reasoning API parameters.
  assert.strictEqual(isOpenAIReasoningModel('gpt-6-astra'), true, 'GPT-6 Astra must be treated as a reasoning model');
  assert.strictEqual(isOpenAIReasoningModel('gpt-5.6-sol'), true, 'GPT-5.6 Sol must be treated as a reasoning model');
  assert.strictEqual(isOpenAIReasoningModel('gpt-5.6-terra'), true, 'GPT-5.6 Terra compatibility must remain intact');
  assert.strictEqual(isOpenAIReasoningModel('gpt-4.1'), false, 'Standard GPT model must not be treated as reasoning');
  assert.strictEqual(getOpenAIThinkingLevel('gpt-6-astra', 'HIGH'), 'HIGH', 'Astra must retain HIGH thinking from registry/admin routing');
  assert.strictEqual(getOpenAIThinkingLevel('gpt-6-astra', 'MEDIUM'), 'HIGH', 'Astra fallback must not silently drop to MEDIUM');
  assert.strictEqual(getOpenAIThinkingLevel('gpt-6-astra', 'XHIGH'), 'XHIGH', 'Astra must retain XHIGH thinking when explicitly requested');
  assert.strictEqual(getOpenAIThinkingLevel('gpt-5.6-sol', 'MEDIUM'), 'HIGH', 'Sol retains its configured deep-reasoning minimum');
  assert.strictEqual(getOpenAIThinkingLevel('gpt-5.6-terra', 'HIGH'), 'LOW', 'Terra remains on low-latency reasoning');
  assert.strictEqual(isOpenAIParameterCompatibilityError('Unsupported parameter: reasoning_effort'), true, 'Explicit reasoning parameter rejection may use compatibility retry');
  assert.strictEqual(isOpenAIParameterCompatibilityError('Model not found for this project'), false, 'Unrelated provider failures must not trigger a reasoning downgrade');

  // Marks Leak Detector: only explicit attempt and component evidence is counted.
  const leakReport = buildMarksLeakReport({
    questions: [{
      questionNumber: '1',
      fullQuestionCode: 'Q1(a)',
      maximumMarks: 10,
      marksAwarded: 6,
      marksLost: 4,
      status: 'partially_correct',
      detailedFeedback: 'Working incomplete',
      sourcePages: [2],
      markingComponents: [{
        componentId: 'working-1',
        componentType: 'WORKING',
        expectedRequirement: 'Show full calculation',
        studentEvidence: 'Final answer only',
        assessment: 'INCORRECT',
        marksAvailable: 2,
        marksAwarded: 0,
        marksDeducted: 2,
        deductionReason: 'Working not shown',
        confidence: 90,
        pageNumber: 2,
      }],
    }],
    canonicalLedger: { records: [{
      questionId: 'Q2(b)',
      attempted: false,
      maxMarks: 5,
      awardedMarks: 0,
      evaluationStatus: 'UNATTEMPTED',
      sourcePages: [],
      rendered: true,
      counted: true,
      studentPages: [],
    }] },
  } as any);
  assert.strictEqual(leakReport.unattemptedMarks, 5, 'Unattempted canonical question marks must be detected');
  assert.strictEqual(leakReport.incompleteAnswerMarks, 2, 'Missing working marks must be classified separately');
  assert.strictEqual(leakReport.totalMarksAtStake, 7, 'Evidence-backed marks at stake must reconcile');
  assert.ok(leakReport.findings.some((finding) => finding.pages.includes(2)), 'Finding must retain answer-sheet page evidence');
  const legacyLeakReport = buildMarksLeakReport({
    questions: [{
      questionNumber: '3',
      fullQuestionCode: 'Q3',
      maximumMarks: 8,
      marksAwarded: 5,
      marksLost: 3,
      status: 'partially_correct',
      detailedFeedback: 'Question-level deduction retained; no component breakdown exists.',
    }],
  } as any);
  assert.strictEqual(legacyLeakReport.stepMarksLost, 3, 'Legacy question-level marksLost must remain detectable');


  // Evaluation output safety: malformed or internally inconsistent model output
  // must be rejected before it can be converted into a score.
  const validChunk = {
    marksAwarded: 2,
    status: 'partially_correct',
    reasonForDeduction: 'The final calculation is missing.',
    detailedFeedback: 'The candidate has shown a correct formula. The final computation and conclusion are missing.',
    confidence: 72,
    technicalEvaluation: 'Formula matches the relevant method in the supplied reference.',
    finalConclusionAssessment: 'Conclusion omitted.',
    markingComponents: [{
      componentId: 'Q1a-calculation',
      componentType: 'CALCULATION',
      expectedRequirement: 'Apply the prescribed formula.',
      studentEvidence: 'Candidate wrote the correct formula but did not complete the calculation.',
      assessment: 'PARTIALLY_CORRECT',
      marksAvailable: 5,
      marksAwarded: 2,
      marksDeducted: 3,
      deductionReason: 'Final computation not completed.',
      supportingProvision: '',
      pageNumber: 1,
      annotationInstructions: '2/5',
    }],
  };
  assert.equal(parseAndValidateQuestionChunkOutput(JSON.stringify(validChunk), 5).marksAwarded, 2);
  assert.throws(
    () => parseAndValidateQuestionChunkOutput('not valid JSON', 5),
    /QUESTION_CHUNK_INVALID_JSON/,
    'Invalid JSON must fail closed and trigger provider fallback.',
  );
  assert.throws(
    () => parseAndValidateQuestionChunkOutput(JSON.stringify({
      ...validChunk,
      markingComponents: [{ ...validChunk.markingComponents[0], marksAvailable: 4 }],
    }), 5),
    /QUESTION_CHUNK_ALLOCATION_MISMATCH/,
    'Component allocation must equal the official question maximum.',
  );
  assert.throws(
    () => parseAndValidateQuestionChunkOutput(JSON.stringify({
      ...validChunk,
      marksAwarded: 4,
    }), 5),
    /QUESTION_CHUNK_SCORE_MISMATCH/,
    'Question total must equal the sum of component awards.',
  );

  const unclearChunk = {
    marksAwarded: 0,
    status: 'unclear',
    reasonForDeduction: 'The answer could not be reliably read; reviewer required.',
    detailedFeedback: 'Automated checking is inconclusive. No academic deduction has been confirmed.',
    confidence: 12,
    technicalEvaluation: 'Insufficient evidence to determine whether the step is correct.',
    finalConclusionAssessment: 'Human review required.',
    markingComponents: [{
      componentId: 'Q1a-review',
      componentType: 'APPLICATION',
      expectedRequirement: 'Apply the relevant rule to the facts.',
      studentEvidence: 'The evidence is not sufficiently legible to determine the candidate treatment.',
      assessment: 'INCORRECT',
      marksAvailable: 5,
      marksAwarded: 0,
      marksDeducted: 5,
      deductionReason: 'Unable to determine correctness; review required.',
      supportingProvision: '',
      pageNumber: 1,
      annotationInstructions: 'Review required.',
    }],
  };
  assert.equal(parseAndValidateQuestionChunkOutput(JSON.stringify(unclearChunk), 5).status, 'unclear');

  const provisionalQuestion = {
    questionNumber: '1',
    subQuestion: 'a',
    maximumMarks: 5,
    marksAwarded: 0,
    marksLost: 0,
    status: 'unclear',
    detailedFeedback: 'Technical evaluation pending human review.',
    markingComponents: [],
    flags: ['FAILED_TO_EVALUATE', 'REVIEW_REQUIRED', 'RECHECK_RECOMMENDED'],
  };
  for (const mode of ['standard', 'strict', 'lenient'] as const) {
    const modeResult = applyMultiModeMarkingPhilosophy(
      [provisionalQuestion as any],
      mode,
      100,
    );
    assert.equal(modeResult.activeQuestions[0].status, 'unclear', `${mode} mode must preserve unresolved status.`);
    assert.equal(modeResult.activeQuestions[0].marksAwarded, 0, `${mode} mode must not invent academic marks.`);
    assert.equal(modeResult.activeQuestions[0].marksLost, 0, `${mode} mode must not convert technical failure into academic mark loss.`);
  }


  console.log('  ✓ Deterministic routing and wire config sanitization verified.');

  console.log('\n========================================================================');
  console.log('--- ALL AI EVALUATION MODEL REGISTRY REGRESSION TESTS PASSED CLEANLY ---');
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
