import { getGemini } from '../gemini.js';
import { db } from '../db.js';

export type ModelProviderType = 'gemini' | 'openai' | 'anthropic' | 'local';

export interface ModelDescriptor {
  id: string;
  provider: ModelProviderType;
  displayName: string;
  description: string;
  contextWindow: number;
  recommended: boolean;
  role: 'Primary' | 'Deep Reasoning' | 'Fast Multimodal' | 'Fallback #1' | 'Fallback #2';
  defaultThinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  fallbackOrder: number;
  isPreview?: boolean;
}

/**
 * APPROVED GEMINI MODEL REGISTRY
 * Strict alignment with ICAI CA Exam Checker production requirements:
 * 1. Primary: gemini-3.8-flash (High thinking)
 * 2. Deep Reasoning: gemini-3.1-pro-preview (High thinking, Preview)
 * 3. Fast Multimodal: gemini-3.7-flash (Medium thinking)
 * 4. Fallback #1: gemini-3.6-flash (Medium/High thinking)
 * 5. Fallback #2: gemini-3.5-flash (Medium thinking)
 *
 * NOTE: Legacy models (gemini-2.5, gemini-1.5, gemini-3.8-pro, gpt-4o, claude-3-5)
 * are completely excluded from active selection and fallback cascades.
 */
export const APPROVED_MODELS: ModelDescriptor[] = [
  {
    id: 'gemini-3.8-flash',
    provider: 'gemini',
    displayName: 'Gemini 3.8 Flash — Primary CA Evaluation',
    description: 'Primary production model for CA answer-sheet evaluation, PDF understanding, handwriting/image understanding, semantic evaluation, question-wise marking, step marking, calculations, legal/accounting/tax/audit reasoning and report generation.',
    contextWindow: 1048576,
    recommended: true,
    role: 'Primary',
    defaultThinkingLevel: 'HIGH',
    fallbackOrder: 1,
  },
  {
    id: 'gemini-3.1-pro-preview',
    provider: 'gemini',
    displayName: 'Gemini 3.1 Pro — Deep Complex Evaluation (Preview)',
    description: 'Difficult and highly ambiguous CA evaluations, complex legal/accounting/tax/audit reasoning, difficult calculations, consequential-error analysis and cases requiring deeper reasoning. (PREVIEW: Not for default production).',
    contextWindow: 2097152,
    recommended: false,
    role: 'Deep Reasoning',
    defaultThinkingLevel: 'HIGH',
    fallbackOrder: 2,
    isPreview: true,
  },
  {
    id: 'gemini-3.7-flash',
    provider: 'gemini',
    displayName: 'Gemini 3.7 Flash — Fast Multimodal Evaluation',
    description: 'High-speed PDF/image understanding, handwriting/OCR, routine evaluation and high-volume processing.',
    contextWindow: 1048576,
    recommended: false,
    role: 'Fast Multimodal',
    defaultThinkingLevel: 'MEDIUM',
    fallbackOrder: 3,
  },
  {
    id: 'gemini-3.6-flash',
    provider: 'gemini',
    displayName: 'Gemini 3.6 Flash — Evaluation Fallback',
    description: 'Fallback when Gemini 3.8 Flash or Gemini 3.7 Flash is temporarily unavailable, rate-limited or fails.',
    contextWindow: 1048576,
    recommended: false,
    role: 'Fallback #1',
    defaultThinkingLevel: 'MEDIUM',
    fallbackOrder: 4,
  },
  {
    id: 'gemini-3.5-flash',
    provider: 'gemini',
    displayName: 'Gemini 3.5 Flash — High-Volume Backup',
    description: 'Emergency/high-volume fallback only.',
    contextWindow: 1048576,
    recommended: false,
    role: 'Fallback #2',
    defaultThinkingLevel: 'MEDIUM',
    fallbackOrder: 5,
  },
];

export const REGISTERED_MODELS = APPROVED_MODELS;

export interface ModelExecutionParams {
  systemPrompt: string;
  userPrompt: string;
  pdfBase64?: string;
  mimeType?: string;
  maxTokens?: number;
  thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  responseMimeType?: string;
  context?: {
    level?: string;
    subjectKey?: string;
    subjectName?: string;
    checkingMode?: string;
    hasCalculationHeavyContent?: boolean;
    isAmbiguousOrComplex?: boolean;
    isRoutineOrHighVolume?: boolean;
    adminPreferredModel?: string;
  };
}

export interface ModelExecutionResult {
  rawText: string;
  modelUsed: string;
  modelDisplayName: string;
  provider: ModelProviderType;
  thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  routingReason: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs: number;
  fallbackOccurred: boolean;
  fallbackReason?: string;
  originalModel?: string;
  fallbackModel?: string;
  retryCount?: number;
}

export function isProviderConfigured(provider: ModelProviderType): boolean {
  if (provider === 'gemini') {
    return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5);
  }
  if (provider === 'openai') {
    return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 5);
  }
  if (provider === 'anthropic') {
    return Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 5);
  }
  if (provider === 'local') {
    return Boolean(process.env.LOCAL_MODEL_ENDPOINT);
  }
  return false;
}

export function getProviderForModel(modelId: string): ModelProviderType {
  const descriptor = APPROVED_MODELS.find((m) => m.id === modelId);
  if (descriptor) return descriptor.provider;
  if (modelId.startsWith('gemini')) return 'gemini';
  if (modelId.startsWith('gpt') || modelId.startsWith('o3')) return 'openai';
  if (modelId.startsWith('claude')) return 'anthropic';
  return 'gemini';
}

export function getModelDisplayName(modelId: string): string {
  const found = APPROVED_MODELS.find((m) => m.id === modelId);
  return found?.displayName || modelId;
}

/**
 * Execute evaluation prompt against Gemini provider
 * GEMINI 3.x API SPECIFICATION:
 * - DO NOT SEND: temperature, top_p, top_k, candidate_count, thinking_budget
 * - DO SEND: thinkingConfig with thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH'
 */
async function callGemini(
  modelId: string,
  params: ModelExecutionParams,
  effectiveThinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'HIGH'
): Promise<{ text: string; promptTokens?: number; completionTokens?: number; totalTokens?: number }> {
  const ai = getGemini();
  const contents: any[] = [];

  if (params.pdfBase64) {
    contents.push({
      inlineData: {
        data: params.pdfBase64,
        mimeType: params.mimeType || 'application/pdf',
      },
    });
  }

  contents.push(params.userPrompt);

  const config: any = {
    thinkingConfig: {
      thinkingLevel: effectiveThinkingLevel,
    },
  };

  if (params.systemPrompt) {
    config.systemInstruction = params.systemPrompt;
  }
  if (params.maxTokens) {
    config.maxOutputTokens = params.maxTokens;
  }
  if (params.responseMimeType) {
    config.responseMimeType = params.responseMimeType;
  }

  const response = await ai.models.generateContent({
    model: modelId,
    contents,
    config,
  });

  const text = response.text || '';
  const usage = (response as any).usageMetadata;
  return {
    text,
    promptTokens: usage?.promptTokenCount,
    completionTokens: usage?.candidatesTokenCount,
    totalTokens: usage?.totalTokenCount,
  };
}

/**
 * Execute a single model with a strict timeout limit
 */
async function executeSingleModel(
  modelId: string,
  params: ModelExecutionParams,
  thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH',
  timeoutMs: number = 120000
): Promise<{ text: string; promptTokens?: number; completionTokens?: number; totalTokens?: number }> {
  const provider = getProviderForModel(modelId);

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Model ${modelId} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
  });

  let runner: Promise<{ text: string; promptTokens?: number; completionTokens?: number; totalTokens?: number }>;

  if (provider === 'gemini') {
    runner = callGemini(modelId, params, thinkingLevel);
  } else {
    throw new Error(`Unsupported model provider: ${provider}. Only approved Gemini models are supported.`);
  }

  return Promise.race([runner, timeoutPromise]);
}

/**
 * Server-Side Smart Routing Engine:
 * Evaluates context (level, subjects, checking mode, calculation complexity)
 * to choose between Primary (3.8 Flash), Deep Reasoning (3.1 Pro Preview), or Fast Multimodal (3.7 Flash).
 */
export function determineModelRouting(context?: {
  level?: string;
  subjectKey?: string;
  subjectName?: string;
  checkingMode?: string;
  hasCalculationHeavyContent?: boolean;
  isAmbiguousOrComplex?: boolean;
  isRoutineOrHighVolume?: boolean;
  adminPreferredModel?: string;
}): {
  primaryModel: string;
  thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  routingReason: string;
  fallbackChain: string[];
} {
  const adminModel = context?.adminPreferredModel;
  const isFinal = context?.level === 'FINAL';
  const isStrict = context?.checkingMode === 'strict';

  const complexSubjects = [
    'tax',
    'audit',
    'financial_reporting',
    'law',
    'costing',
    'advanced_accounting',
  ];
  const subjectKeyLower = (context?.subjectKey || '').toLowerCase();
  const isComplexSubject = complexSubjects.some((s) => subjectKeyLower.includes(s));

  const isComplex =
    context?.isAmbiguousOrComplex ||
    context?.hasCalculationHeavyContent ||
    (isFinal && isStrict) ||
    (isFinal && isComplexSubject);

  const isFast = context?.checkingMode === 'fast' || context?.isRoutineOrHighVolume;

  let selectedModel = 'gemini-3.8-flash';
  let thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'HIGH';
  let routingReason = 'Primary CA Evaluation: Gemini 3.8 Flash with high thinking for step-marking and accounting reasoning';

  // 1. Honor explicit admin selection if provided from approved registry
  if (
    adminModel &&
    APPROVED_MODELS.some((m) => m.id === adminModel)
  ) {
    selectedModel = adminModel;
    if (adminModel === 'gemini-3.1-pro-preview') {
      thinkingLevel = 'HIGH';
      routingReason = 'Admin Selected: Gemini 3.1 Pro (Preview) with high thinking for deep complex evaluation';
    } else if (adminModel === 'gemini-3.7-flash') {
      thinkingLevel = isComplex ? 'HIGH' : 'MEDIUM';
      routingReason = `Admin Selected: Gemini 3.7 Flash Fast Multimodal with ${thinkingLevel.toLowerCase()} thinking`;
    } else if (adminModel === 'gemini-3.6-flash') {
      thinkingLevel = isComplex ? 'HIGH' : 'MEDIUM';
      routingReason = `Admin Selected: Gemini 3.6 Flash Fallback with ${thinkingLevel.toLowerCase()} thinking`;
    } else if (adminModel === 'gemini-3.5-flash') {
      thinkingLevel = 'MEDIUM';
      routingReason = 'Admin Selected: Gemini 3.5 Flash High-Volume Backup with medium thinking';
    } else {
      thinkingLevel = 'HIGH';
      routingReason = 'Admin Selected: Gemini 3.8 Flash Primary CA Evaluation with high thinking';
    }
  } else if (isComplex) {
    // 2. Complex / Ambiguous / Calculation-heavy -> Gemini 3.1 Pro Preview
    selectedModel = 'gemini-3.1-pro-preview';
    thinkingLevel = 'HIGH';
    routingReason = 'Complex Evaluation Routing: Gemini 3.1 Pro (Preview) deep reasoning for advanced CA examination analysis';
  } else if (isFast) {
    // 3. Fast Multimodal -> Gemini 3.7 Flash
    selectedModel = 'gemini-3.7-flash';
    thinkingLevel = 'MEDIUM';
    routingReason = 'Fast Multimodal Routing: Gemini 3.7 Flash for routine high-speed multimodal evaluation';
  } else {
    // 4. Default -> Gemini 3.8 Flash
    selectedModel = 'gemini-3.8-flash';
    thinkingLevel = 'HIGH';
    routingReason = 'Default Primary Routing: Gemini 3.8 Flash with high thinking for ICAI standard evaluation';
  }

  // Build deterministic fallback sequence:
  // Fallback #1: gemini-3.6-flash
  // Fallback #2: gemini-3.5-flash
  // Other approved models if not selected
  const allApproved = ['gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];
  const remaining = allApproved.filter((m) => m !== selectedModel);
  const orderedFallbacks = [
    ...remaining.filter((m) => m === 'gemini-3.6-flash'),
    ...remaining.filter((m) => m === 'gemini-3.5-flash'),
    ...remaining.filter((m) => m !== 'gemini-3.6-flash' && m !== 'gemini-3.5-flash'),
  ];

  return {
    primaryModel: selectedModel,
    thinkingLevel,
    routingReason,
    fallbackChain: orderedFallbacks,
  };
}

/**
 * Model Fallback Orchestrator:
 * Executes evaluation with smart routing and deterministic fallback.
 * Only falls back across approved, configured, and healthy models.
 * If all models fail, throws a clean evaluation-unavailable error without deducting credits.
 */
export async function executeModelWithFallback(
  params: ModelExecutionParams
): Promise<ModelExecutionResult> {
  // Determine routing context and preferences
  let adminPreferredModel: string | undefined;
  try {
    const primaryRow = db
      .prepare("SELECT id FROM model_configs WHERE is_primary = 1 AND is_enabled = 1")
      .get() as { id: string } | undefined;
    if (primaryRow?.id && APPROVED_MODELS.some((m) => m.id === primaryRow.id)) {
      adminPreferredModel = primaryRow.id;
    } else {
      const pSetting = db
        .prepare("SELECT value FROM pricing_settings WHERE key = 'EVAL_MODEL_PROVIDER'")
        .get() as { value: string } | undefined;
      if (pSetting?.value && APPROVED_MODELS.some((m) => m.id === pSetting.value)) {
        adminPreferredModel = pSetting.value;
      }
    }
  } catch (err) {
    console.warn('Could not read admin model preference from db:', err);
  }

  const routing = determineModelRouting({
    ...params.context,
    adminPreferredModel: params.context?.adminPreferredModel || adminPreferredModel,
  });

  // Query database for model statuses to skip any disabled models
  let enabledModelIds = new Set<string>(['gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash']);
  try {
    const dbModels = db.prepare('SELECT id, is_enabled, status FROM model_configs').all() as Array<{
      id: string;
      is_enabled: number;
      status: string;
    }>;
    if (dbModels && dbModels.length > 0) {
      enabledModelIds = new Set(
        dbModels
          .filter((m) => m.is_enabled === 1 && m.status !== 'RETIRED' && m.status !== 'FAILED')
          .map((m) => m.id)
      );
    }
  } catch (err) {
    console.warn('Could not query model_configs for enabled statuses:', err);
  }

  const candidateSequence = [
    routing.primaryModel,
    ...routing.fallbackChain,
  ].filter((m) => enabledModelIds.has(m) || m === routing.primaryModel);

  let fallbackOccurred = false;
  let fallbackReason: string | undefined;
  let originalModel = routing.primaryModel;
  let fallbackModel: string | undefined;
  let retriesCount = 0;

  for (let i = 0; i < candidateSequence.length; i++) {
    const candidateModel = candidateSequence[i];
    const isPrimaryAttempt = i === 0;

    // Verify Gemini API key is configured
    if (!isProviderConfigured('gemini')) {
      throw new Error(
        'AI Evaluation service is not configured. GEMINI_API_KEY is missing from server environment.'
      );
    }

    // Determine thinking level for candidate:
    // Gemini 3.8 Flash & 3.1 Pro -> HIGH
    // Gemini 3.7 Flash -> MEDIUM (or HIGH if complex)
    // Gemini 3.6 Flash -> HIGH if complex, else MEDIUM
    // Gemini 3.5 Flash -> MEDIUM
    let effectiveThinking: 'LOW' | 'MEDIUM' | 'HIGH' = 'HIGH';
    if (candidateModel === 'gemini-3.5-flash') {
      effectiveThinking = 'MEDIUM';
    } else if (candidateModel === 'gemini-3.6-flash') {
      effectiveThinking = routing.thinkingLevel === 'HIGH' ? 'HIGH' : 'MEDIUM';
    } else if (candidateModel === 'gemini-3.7-flash') {
      effectiveThinking = routing.thinkingLevel;
    } else {
      effectiveThinking = 'HIGH';
    }

    const startTime = Date.now();
    try {
      console.info(
        `[Model Registry] Attempting evaluation using ${candidateModel} (Thinking: ${effectiveThinking}, Attempt: ${i + 1})...`
      );

      const output = await executeSingleModel(candidateModel, params, effectiveThinking, 120000);
      const latencyMs = Date.now() - startTime;

      try {
        db.prepare(
          "UPDATE model_configs SET status = 'AVAILABLE', last_latency_ms = ?, last_tested_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(latencyMs, candidateModel);
      } catch {}

      if (fallbackOccurred) {
        fallbackModel = candidateModel;
      }

      return {
        rawText: output.text,
        modelUsed: candidateModel,
        modelDisplayName: getModelDisplayName(candidateModel),
        provider: 'gemini',
        thinkingLevel: effectiveThinking,
        routingReason: routing.routingReason,
        promptTokens: output.promptTokens,
        completionTokens: output.completionTokens,
        totalTokens: output.totalTokens,
        latencyMs,
        fallbackOccurred,
        fallbackReason,
        originalModel,
        fallbackModel,
        retryCount: retriesCount,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const errMsg = err?.message || String(err);
      retriesCount++;
      console.warn(`[Model Registry] ${candidateModel} failed after ${latencyMs}ms: ${errMsg}`);

      fallbackOccurred = true;
      fallbackReason = `${candidateModel} failed: ${errMsg.slice(0, 160)}`;

      try {
        const isRateLimit = errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED');
        const isTemp = errMsg.includes('503') || errMsg.includes('unavailable') || errMsg.includes('overloaded');
        const status = isRateLimit ? 'RATE_LIMITED' : (isTemp ? 'TEMPORARILY_UNAVAILABLE' : 'FAILED');
        db.prepare(
          "UPDATE model_configs SET status = ?, last_latency_ms = ?, last_tested_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(status, latencyMs, candidateModel);
      } catch {}
    }
  }

  // All configured candidates exhausted
  throw new Error(
    'AI Evaluation service is currently unavailable across all configured models. Please retry in a few moments. No credits have been deducted.'
  );
}

/**
 * Diagnostic test connectivity for a specific model
 * Executes a real API call and records actual request latency.
 */
export async function testModelConnectivity(
  modelId: string
): Promise<{ success: boolean; latencyMs: number; message: string; model: string; provider: string; status: string }> {
  const provider = getProviderForModel(modelId);
  const startTime = Date.now();

  if (!isProviderConfigured(provider)) {
    try {
      db.prepare("UPDATE model_configs SET status = 'NOT_CONFIGURED', last_tested_at = CURRENT_TIMESTAMP WHERE id = ?").run(modelId);
    } catch {}
    return {
      success: false,
      latencyMs: 0,
      message: `GEMINI_API_KEY is not configured in server environment.`,
      model: modelId,
      provider,
      status: 'NOT_CONFIGURED',
    };
  }

  try {
    const ai = getGemini();
    const testResponse = await ai.models.generateContent({
      model: modelId,
      contents: 'Ping health check. Respond with: OK',
      config: {
        maxOutputTokens: 20,
        thinkingConfig: {
          thinkingLevel: 'low' as any,
        },
      },
    });

    const latencyMs = Date.now() - startTime;
    const isOk = !!testResponse.text;

    try {
      db.prepare(
        "UPDATE model_configs SET status = 'AVAILABLE', last_latency_ms = ?, last_tested_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(latencyMs, modelId);
    } catch {}

    return {
      success: true,
      latencyMs,
      message: `Connected successfully to ${modelId} in ${latencyMs}ms.`,
      model: modelId,
      provider,
      status: 'AVAILABLE',
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const errMsg = err?.message || String(err);
    const isRateLimit = errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED');
    const isTemp = errMsg.includes('503') || errMsg.includes('unavailable') || errMsg.includes('high demand') || errMsg.includes('overloaded');
    const status = isRateLimit ? 'RATE_LIMITED' : (isTemp ? 'TEMPORARILY_UNAVAILABLE' : 'FAILED');

    try {
      db.prepare(
        "UPDATE model_configs SET status = ?, last_latency_ms = ?, last_tested_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(status, latencyMs, modelId);
    } catch {}

    return {
      success: false,
      latencyMs,
      message: errMsg.slice(0, 200),
      model: modelId,
      provider,
      status,
    };
  }
}

export const testModelConnection = testModelConnectivity;
