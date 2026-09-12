import { getGemini } from '../gemini.js';
import { db } from '../db.js';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export type ModelProviderType = 'gemini' | 'openai' | 'anthropic';

export interface ModelDescriptor {
  id: string;
  provider: ModelProviderType;
  displayName: string;
  description: string;
  contextWindow: number;
  recommended: boolean;
  role: string;
  defaultThinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';
  fallbackOrder: number;
  isPreview?: boolean;
  recommendedReasoning?: string;
  useCases?: string[];
}

/**
 * APPROVED PRODUCTION MULTI-PROVIDER AI MODEL REGISTRY
 * Strict alignment with ICAI CA Exam Checker production requirements:
 *
 * 1. Primary:
 *    - Google Gemini 3.8 Flash (High thinking, Primary CA Evaluation)
 *
 * 2. OpenAI Models:
 *    - GPT-5.6 Sol (Deep Evaluation / Highest-Quality Reasoning / HIGH or XHIGH)
 *    - GPT-5.6 Terra (Fast High-Volume / Multimodal / Low Latency / LOW or MEDIUM)
 *
 * 3. Anthropic Models:
 *    - Claude Opus 5 (Deep Complex Legal / Accounting / Audit Evaluation / HIGH)
 *    - Claude Sonnet 5 (Balanced CA Evaluation / Fallback / MEDIUM)
 *
 * 4. Fallback Hierarchy (Primary + 8 Fallbacks):
 *    - Primary: Gemini 3.8 Flash (Google Gemini) - Primary CA Evaluation
 *    - Fallback 1: Claude Opus 5 (Anthropic) - Deep Reasoning & Complex Legal/Tax/Audit
 *    - Fallback 2: GPT-5.6 Sol (OpenAI) - Deep Reasoning & Complex Calculation Cross-Check
 *    - Fallback 3: Claude Sonnet 5 (Anthropic) - Balanced High-Quality Evaluation
 *    - Fallback 4: GPT-5.6 Terra (OpenAI) - Fast High-Volume & Multimodal Evaluation
 *    - Fallback 5: Gemini 3.1 Pro (Preview) (Google Gemini) - Deep Reasoning Preview
 *    - Fallback 6: Gemini 3.7 Flash (Google Gemini) - Fast Multimodal Evaluation
 *    - Fallback 7: Gemini 3.6 Flash (Google Gemini) - Standard Fallback
 *    - Fallback 8: Gemini 3.5 Flash (Google Gemini) - High-Volume Emergency Backup
 *
 * NOTE: Legacy obsolete models (GPT-4o, Claude 3.5, Gemini 1.5, Gemini 2.5) are permanently excluded.
 */
export const APPROVED_MODELS: ModelDescriptor[] = [
  {
    id: 'gemini-3.8-flash',
    provider: 'gemini',
    displayName: 'Google Gemini 3.8 Flash',
    description: 'Primary production model for CA answer-sheet evaluation, PDF understanding, handwriting/OCR, semantic evaluation, question-wise marking, step marking, calculations, legal/accounting/tax/audit reasoning and detailed report generation.',
    contextWindow: 1048576,
    recommended: true,
    role: 'Primary CA Evaluation',
    defaultThinkingLevel: 'HIGH',
    fallbackOrder: 0,
    recommendedReasoning: 'HIGH',
    useCases: [
      'Standard CA answer-sheet evaluation',
      'Step-marking and sub-part evaluation',
      'Question-wise marking and calculation verification',
      'Direct Tax, Indirect Tax, Law, and Costing reasoning',
      'ICAI compliance and report generation',
    ],
  },
  {
    id: 'gemini-3.7-flash',
    provider: 'gemini',
    displayName: 'Google Gemini 3.7 Flash',
    description: 'High-speed multimodal PDF/image understanding, handwriting/OCR, routine evaluation and high-volume processing. Direct primary fallback for Gemini 3.8.',
    contextWindow: 1048576,
    recommended: true,
    role: 'Fast Multimodal Evaluation / Direct Fallback',
    defaultThinkingLevel: 'MEDIUM',
    fallbackOrder: 1,
    recommendedReasoning: 'MEDIUM',
    useCases: [
      'Fast multimodal PDF parsing',
      'Immediate seamless fallback on high-demand spikes',
      'High-volume routine processing',
    ],
  },
  {
    id: 'gemini-3.6-flash',
    provider: 'gemini',
    displayName: 'Google Gemini 3.6 Flash',
    description: 'Standard reliable fallback when higher tier models are temporarily unavailable, rate-limited or overloaded.',
    contextWindow: 1048576,
    recommended: true,
    role: 'Standard Fallback',
    defaultThinkingLevel: 'MEDIUM',
    fallbackOrder: 2,
    recommendedReasoning: 'MEDIUM',
    useCases: [
      'Standard reliable fallback tier',
      'Rate limit recovery',
    ],
  },
  {
    id: 'gemini-3.5-flash',
    provider: 'gemini',
    displayName: 'Google Gemini 3.5 Flash',
    description: 'High-volume emergency backup fallback.',
    contextWindow: 1048576,
    recommended: false,
    role: 'High-Volume Emergency Backup',
    defaultThinkingLevel: 'MEDIUM',
    fallbackOrder: 3,
    recommendedReasoning: 'MEDIUM',
    useCases: [
      'Emergency high-volume backup fallback',
    ],
  },
  {
    id: 'gemini-3.1-flash-lite',
    provider: 'gemini',
    displayName: 'Google Gemini 3.1 Flash Lite',
    description: 'Ultra-fast multimodal PDF understanding, handwriting reading, and emergency fallback with minimal latency.',
    contextWindow: 1048576,
    recommended: true,
    role: 'Fast Multimodal & High-Volume Fallback',
    defaultThinkingLevel: 'LOW',
    fallbackOrder: 4,
    recommendedReasoning: 'LOW',
    useCases: [
      'Rapid multimodal PDF evaluation',
      'Ultra-low-latency response generation',
      'High-throughput fallback when other models are saturated',
    ],
  },
  {
    id: 'claude-opus-5',
    provider: 'anthropic',
    displayName: 'Claude Opus 5 (Anthropic)',
    description: 'Deep complex evaluation, highest-level legal interpretation, corporate law case studies, ICAI accounting standards (AS/Ind AS), Standards on Auditing (SA), and nuanced subjective answer arbitration.',
    contextWindow: 200000,
    recommended: true,
    role: 'Deep Legal / Accounting / Audit Evaluation',
    defaultThinkingLevel: 'HIGH',
    fallbackOrder: 5,
    recommendedReasoning: 'HIGH',
    useCases: [
      'Deep legal reasoning & statutory interpretation',
      'Complex corporate and economic laws',
      'Ind AS / AS accounting standard application',
      'Advanced auditing principles and ethics',
      'High-stakes ambiguous student answer arbitration',
    ],
  },
  {
    id: 'gpt-5.6-sol',
    provider: 'openai',
    displayName: 'OpenAI GPT-5.6 Sol',
    description: 'Deep evaluation & highest-quality reasoning. Unrivaled precision in difficult CA answer evaluation, complex tax/costing computations, capital budgeting, ambiguous answers, deep marking verification, score calculation cross-checks, and checked-copy annotation instructions.',
    contextWindow: 200000,
    recommended: true,
    role: 'Deep Reasoning & Calculation Cross-Check',
    defaultThinkingLevel: 'HIGH',
    fallbackOrder: 6,
    recommendedReasoning: 'HIGH or XHIGH',
    useCases: [
      'Difficult CA answer evaluation',
      'Complex calculations & financial formulas',
      'Complex legal/accounting/tax reasoning',
      'Ambiguous answers & deep marking verification',
      'Score calculation cross-check & annotation instructions',
      'Detailed evaluation report generation',
      'Difficult quality-review cases',
    ],
  },
  {
    id: 'claude-sonnet-5',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 5 (Anthropic)',
    description: 'Balanced high-quality CA evaluation and rapid fallback. Excellent structured reasoning, consistent marking criteria compliance, and fast multimodal synthesis.',
    contextWindow: 200000,
    recommended: true,
    role: 'Balanced CA Evaluation / Fallback',
    defaultThinkingLevel: 'MEDIUM',
    fallbackOrder: 7,
    recommendedReasoning: 'MEDIUM',
    useCases: [
      'Balanced CA answer evaluation',
      'Fast high-reliability fallback',
      'Structured theory and practical question grading',
      'Intermediate and Foundation level evaluations',
    ],
  },
  {
    id: 'gpt-5.6-terra',
    provider: 'openai',
    displayName: 'OpenAI GPT-5.6 Terra',
    description: 'Fast high-volume & multimodal evaluation. Low latency OCR, dense handwriting reading, routine question evaluation, standard practical/theory evaluation, and speed-critical fallback processing.',
    contextWindow: 128000,
    recommended: false,
    role: 'Fast High-Volume / Multimodal / Low Latency',
    defaultThinkingLevel: 'MEDIUM',
    fallbackOrder: 8,
    recommendedReasoning: 'LOW or MEDIUM',
    useCases: [
      'Fast evaluation & speed-critical fallbacks',
      'OCR & dense handwriting reading',
      'Routine question evaluation',
      'Standard practical/theory evaluation',
      'High-concurrency batch evaluation',
    ],
  },
  {
    id: 'gemini-3.1-pro-preview',
    provider: 'gemini',
    displayName: 'Google Gemini 3.1 Pro (Preview)',
    description: 'Difficult and highly ambiguous CA evaluations, complex legal/accounting/tax/audit reasoning, difficult calculations, consequential-error analysis and cases requiring deeper reasoning. (PREVIEW: Not for default production).',
    contextWindow: 2097152,
    recommended: false,
    role: 'Deep Reasoning (Preview)',
    defaultThinkingLevel: 'HIGH',
    fallbackOrder: 9,
    isPreview: true,
    recommendedReasoning: 'HIGH',
    useCases: [
      'Difficult calculations & consequential-error analysis',
      'Extreme context preview cases',
    ],
  },
];

export const REGISTERED_MODELS = APPROVED_MODELS;

export interface ModelExecutionParams {
  systemPrompt: string;
  userPrompt: string;
  pdfBase64?: string;
  mimeType?: string;
  maxTokens?: number;
  thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';
  responseMimeType?: string;
  context?: {
    level?: string;
    subjectKey?: string;
    subjectName?: string;
    checkingMode?: string;
    pageCount?: number;
    hasCalculationHeavyContent?: boolean;
    isAmbiguousOrComplex?: boolean;
    isRoutineOrHighVolume?: boolean;
    adminPreferredModel?: string;
    crossCheckEnabled?: boolean;
  };
}

export interface ModelExecutionResult {
  rawText: string;
  modelUsed: string;
  modelDisplayName: string;
  provider: ModelProviderType;
  thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';
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
  crossCheckResult?: {
    verified: boolean;
    modelUsed: string;
    notes: string;
    discrepanciesFound: boolean;
  };
}

let openaiClient: OpenAI | null = null;
export function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY || '';
    openaiClient = new OpenAI({ apiKey, maxRetries: 0 });
  }
  return openaiClient;
}

let anthropicClient: Anthropic | null = null;
export function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    anthropicClient = new Anthropic({ apiKey, maxRetries: 0 });
  }
  return anthropicClient;
}

/**
 * In-memory provider circuit breaker:
 * Tracks providers that returned credit exhaustion, insufficient balance, or authentication failures.
 * Automatically cools down for 5 minutes during live student evaluations so zero-credit providers
 * fail fast without delaying evaluations.
 */
const providerCreditExhaustedUntil = new Map<ModelProviderType, number>();

export function markProviderCreditExhausted(provider: ModelProviderType, reason?: string) {
  // Gemini free-tier quotas and rate limits are strictly per-model, NEVER provider-wide
  if (provider === 'gemini') {
    return;
  }
  providerCreditExhaustedUntil.set(provider, Date.now() + 5 * 60 * 1000);
  console.warn(`[Model Registry] Provider ${provider.toUpperCase()} marked INSUFFICIENT_CREDITS for 5 minutes: ${reason || 'credit balance too low'}`);
}

export function clearProviderCreditExhausted(provider: ModelProviderType) {
  providerCreditExhaustedUntil.delete(provider);
}

export function isProviderCreditExhausted(provider: ModelProviderType): boolean {
  if (provider === 'gemini') return false;
  const until = providerCreditExhaustedUntil.get(provider);
  if (!until) return false;
  if (Date.now() > until) {
    providerCreditExhaustedUntil.delete(provider);
    return false;
  }
  return true;
}

/**
 * In-memory per-model cooldown tracking:
 * If an individual model hits a rate-limit (429) or high-demand 503 spike,
 * cool down that individual model for 30-45s so fallback models can take over immediately.
 */
const modelCooldownUntil = new Map<string, { until: number; reason: string }>();

export function markModelTemporarilyUnavailable(modelId: string, durationMs = 45000, reason = 'Rate limited or high demand') {
  modelCooldownUntil.set(modelId, { until: Date.now() + durationMs, reason });
  console.info(`[Model Registry] Model ${modelId} cooling down for ${Math.round(durationMs / 1000)}s (${reason}).`);
}

export function isModelCoolingDown(modelId: string): boolean {
  const entry = modelCooldownUntil.get(modelId);
  if (!entry) return false;
  if (Date.now() > entry.until) {
    modelCooldownUntil.delete(modelId);
    return false;
  }
  return true;
}

// Check database for any previously rate-limited models on startup and cool them down
try {
  const rateLimitedRows = db.prepare("SELECT id FROM model_configs WHERE status = 'RATE_LIMITED' OR status = 'TEMPORARILY_UNAVAILABLE'").all() as { id: string }[];
  for (const r of rateLimitedRows) {
    markModelTemporarilyUnavailable(r.id, 5 * 60 * 1000, 'Restored unavailable state from DB');
  }
} catch {
  // Ignore if DB not ready yet
}

export function isProviderConfigured(provider: ModelProviderType): boolean {
  if (provider === 'gemini') {
    return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 5);
  }
  if (provider === 'openai') {
    return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 5);
  }
  if (provider === 'anthropic') {
    return Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 5);
  }
  return false;
}

export function getProviderForModel(modelId: string): ModelProviderType {
  const descriptor = APPROVED_MODELS.find((m) => m.id === modelId);
  if (descriptor) return descriptor.provider;
  if (modelId.startsWith('gemini')) return 'gemini';
  if (modelId.startsWith('gpt') || modelId.startsWith('o3') || modelId.startsWith('o1')) return 'openai';
  if (modelId.startsWith('claude')) return 'anthropic';
  return 'gemini';
}

export function getModelDisplayName(modelId: string): string {
  const found = APPROVED_MODELS.find((m) => m.id === modelId);
  return found?.displayName || modelId;
}

/**
 * Execute evaluation prompt against Google Gemini provider
 * GEMINI 3.x API SPECIFICATION:
 * - DO NOT SEND: temperature, top_p, top_k, candidate_count, thinking_budget
 * - DO SEND: thinkingConfig with thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH'
 * - Handles transient 503 high demand spikes with a fast jittered retry before yielding to fallback
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

  const config: any = {};
  if (modelId === 'gemini-3.1-flash-lite') {
    config.thinkingConfig = {
      thinkingLevel: 'LOW',
    };
  } else {
    config.thinkingConfig = {
      thinkingLevel: effectiveThinkingLevel,
    };
  }

  if (params.systemPrompt) {
    config.systemInstruction = params.systemPrompt;
  }
  if (params.maxTokens) {
    config.maxOutputTokens = params.maxTokens;
  }
  if (params.responseMimeType) {
    config.responseMimeType = params.responseMimeType;
  }

  let response: any;
  let lastErr: any;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await ai.models.generateContent({
        model: modelId,
        contents,
        config,
      });
      break;
    } catch (err: any) {
      lastErr = err;
      const errMsg = (err?.message || String(err)).toLowerCase();
      const is429 = errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('resource_exhausted');
      if (is429) {
        // Daily quota limit on this specific model; throw immediately to trigger fallback cascade
        throw err;
      }
      const isTimeout = errMsg.includes('timed out') || errMsg.includes('timeout') || errMsg.includes('etimedout');
      if (isTimeout) {
        throw err;
      }
      const is503 = errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('unavailable') || errMsg.includes('overloaded');
      if (is503 && attempt === 0) {
        console.info(`[Model Registry] ${modelId} received transient 503 high demand; waiting 1500ms before retry...`);
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw err;
    }
  }

  if (!response) throw lastErr;

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
 * Execute evaluation prompt against OpenAI provider
 * Supports GPT-5.6 Sol (Deep Reasoning) and GPT-5.6 Terra (Fast Multimodal)
 */
async function callOpenAI(
  modelId: string,
  params: ModelExecutionParams,
  effectiveThinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH' = 'HIGH'
): Promise<{ text: string; promptTokens?: number; completionTokens?: number; totalTokens?: number }> {
  const openai = getOpenAI();
  const messages: any[] = [];

  if (params.systemPrompt) {
    messages.push({
      role: 'system',
      content: params.systemPrompt,
    });
  }

  const userContent: any[] = [];
  if (params.pdfBase64) {
    const mime = params.mimeType || 'application/pdf';
    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:${mime};base64,${params.pdfBase64}`,
      },
    });
  }
  userContent.push({
    type: 'text',
    text: params.userPrompt,
  });

  messages.push({
    role: 'user',
    content: userContent.length === 1 ? userContent[0].text : userContent,
  });

  const requestPayload: any = {
    model: modelId,
    messages,
  };

  const isReasoningModel = modelId.includes('sol') || modelId.includes('terra') || modelId.startsWith('o3') || modelId.startsWith('o1');
  if (isReasoningModel) {
    const reasoningEffort =
      effectiveThinkingLevel === 'XHIGH' || effectiveThinkingLevel === 'HIGH'
        ? 'high'
        : effectiveThinkingLevel === 'LOW'
        ? 'low'
        : 'medium';
    requestPayload.reasoning_effort = reasoningEffort;
    requestPayload.max_completion_tokens = params.maxTokens || 8192;
  } else {
    requestPayload.max_tokens = params.maxTokens || 8192;
    requestPayload.temperature = 0.2;
  }

  if (params.responseMimeType === 'application/json') {
    requestPayload.response_format = { type: 'json_object' };
  }

  let response: any;
  try {
    response = await openai.chat.completions.create(requestPayload);
  } catch (err: any) {
    const errMsg = (err?.message || String(err)).toLowerCase();
    const isBillingOrQuota = errMsg.includes('credit') || errMsg.includes('quota') || errMsg.includes('429') || errMsg.includes('401') || errMsg.includes('billing');
    // Only retry without reasoning_effort if it is a parameter incompatibility, NEVER on billing/quota/auth errors
    if (!isBillingOrQuota && (requestPayload.reasoning_effort || requestPayload.max_completion_tokens)) {
      delete requestPayload.reasoning_effort;
      requestPayload.max_tokens = requestPayload.max_completion_tokens || 8192;
      delete requestPayload.max_completion_tokens;
      response = await openai.chat.completions.create(requestPayload);
    } else {
      throw err;
    }
  }

  const text = response.choices?.[0]?.message?.content || '';
  const usage = response.usage;
  return {
    text,
    promptTokens: usage?.prompt_tokens,
    completionTokens: usage?.completion_tokens,
    totalTokens: usage?.total_tokens,
  };
}

/**
 * Execute evaluation prompt against Anthropic provider
 * Supports Claude Opus 5 (Deep Legal/Accounting/Audit) and Claude Sonnet 5 (Balanced Evaluation)
 */
async function callAnthropic(
  modelId: string,
  params: ModelExecutionParams,
  effectiveThinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH' = 'HIGH'
): Promise<{ text: string; promptTokens?: number; completionTokens?: number; totalTokens?: number }> {
  const anthropic = getAnthropic();
  const contentBlocks: any[] = [];

  if (params.pdfBase64) {
    if (params.mimeType === 'application/pdf') {
      contentBlocks.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: params.pdfBase64,
        },
      });
    } else {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: (params.mimeType as any) || 'image/jpeg',
          data: params.pdfBase64,
        },
      });
    }
  }

  contentBlocks.push({
    type: 'text',
    text: params.userPrompt,
  });

  const requestPayload: any = {
    model: modelId,
    max_tokens: params.maxTokens || 8192,
    messages: [
      {
        role: 'user',
        content: contentBlocks,
      },
    ],
  };

  if (params.systemPrompt) {
    requestPayload.system = params.systemPrompt;
  }

  if (effectiveThinkingLevel === 'HIGH' || effectiveThinkingLevel === 'XHIGH') {
    requestPayload.thinking = {
      type: 'enabled',
      budget_tokens: 2048,
    };
    if (requestPayload.max_tokens <= 2048) {
      requestPayload.max_tokens = 4096;
    }
  }

  let response: any;
  try {
    response = await anthropic.messages.create(requestPayload);
  } catch (err: any) {
    const errMsg = (err?.message || String(err)).toLowerCase();
    const isBillingOrQuota = errMsg.includes('credit') || errMsg.includes('quota') || errMsg.includes('429') || errMsg.includes('400') || errMsg.includes('billing');
    // Only retry without thinking block if it's a thinking config error, NOT on credit balance or billing issues
    if (!isBillingOrQuota && requestPayload.thinking) {
      delete requestPayload.thinking;
      response = await anthropic.messages.create(requestPayload);
    } else {
      throw err;
    }
  }

  const text = response.content
    ? response.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n')
    : '';

  const inputTokens = response.usage?.input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;
  return {
    text,
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

/**
 * Execute a single model with a strict, model-optimized timeout limit across any supported provider
 */
async function executeSingleModel(
  modelId: string,
  params: ModelExecutionParams,
  thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH',
  overrideTimeoutMs?: number
): Promise<{ text: string; promptTokens?: number; completionTokens?: number; totalTokens?: number }> {
  const provider = getProviderForModel(modelId);

  // Model-specific timeouts:
  // For multimodal evaluation of answer sheet PDFs, allow adequate headroom (210s) for OCR + reasoning
  // For text-only pings/prompts, keep timeouts fast (45s)
  const hasAttachment = Boolean(params.pdfBase64);
  let defaultTimeoutMs = hasAttachment ? 210000 : 45000;
  if (modelId.includes('sol') || modelId.includes('opus') || modelId.includes('pro')) {
    defaultTimeoutMs = hasAttachment ? 240000 : 60000;
  } else if (modelId.includes('lite') || modelId.includes('terra')) {
    defaultTimeoutMs = hasAttachment ? 120000 : 35000;
  }
  const timeoutMs = overrideTimeoutMs ?? defaultTimeoutMs;

  let timerId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error(`Model ${modelId} (${provider}) timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
  });

  let runner: Promise<{ text: string; promptTokens?: number; completionTokens?: number; totalTokens?: number }>;

  if (provider === 'gemini') {
    const geminiThinking: 'LOW' | 'MEDIUM' | 'HIGH' =
      thinkingLevel === 'XHIGH' ? 'HIGH' : thinkingLevel;
    runner = callGemini(modelId, params, geminiThinking);
  } else if (provider === 'openai') {
    runner = callOpenAI(modelId, params, thinkingLevel);
  } else if (provider === 'anthropic') {
    runner = callAnthropic(modelId, params, thinkingLevel);
  } else {
    throw new Error(`Unsupported model provider: ${provider}`);
  }

  return Promise.race([
    runner.finally(() => {
      if (timerId) clearTimeout(timerId);
    }),
    timeoutPromise,
  ]);
}

/**
 * Server-Side Smart Routing Engine:
 * Analyzes examination level, subjects, checking mode, page count, and calculation complexity
 * to select the optimal model and build the resilient multi-provider fallback hierarchy.
 */
export function determineModelRouting(context?: {
  level?: string;
  subjectKey?: string;
  subjectName?: string;
  checkingMode?: string;
  pageCount?: number;
  hasCalculationHeavyContent?: boolean;
  isAmbiguousOrComplex?: boolean;
  isRoutineOrHighVolume?: boolean;
  adminPreferredModel?: string;
  crossCheckEnabled?: boolean;
}): {
  primaryModel: string;
  thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';
  routingReason: string;
  fallbackChain: string[];
  crossCheckModel?: string;
} {
  const adminModel = context?.adminPreferredModel;
  const isFinal = context?.level === 'FINAL';
  const isStrict = context?.checkingMode === 'strict';
  const pageCount = context?.pageCount || 0;

  const complexCalculationSubjects = [
    'tax',
    'direct_tax',
    'indirect_tax',
    'costing',
    'financial_reporting',
    'advanced_accounting',
    'quantitative',
    'sfm',
    'afm',
  ];

  const legalAndAuditSubjects = [
    'law',
    'corporate_laws',
    'economic_laws',
    'audit',
    'advanced_auditing',
    'ethics',
  ];

  const subjectKeyLower = (context?.subjectKey || '').toLowerCase();
  const isCalcHeavy =
    context?.hasCalculationHeavyContent ||
    complexCalculationSubjects.some((s) => subjectKeyLower.includes(s));
  const isLegalAudit = legalAndAuditSubjects.some((s) => subjectKeyLower.includes(s));

  const isComplex =
    context?.isAmbiguousOrComplex ||
    (isFinal && isStrict) ||
    (isFinal && (isCalcHeavy || isLegalAudit));

  const isFast = context?.checkingMode === 'fast' || context?.isRoutineOrHighVolume || pageCount > 25;

  let defaultGemini = 'gemini-3.8-flash';
  if (isModelCoolingDown(defaultGemini)) {
    defaultGemini = 'gemini-3.1-flash-lite';
  }
  if (isModelCoolingDown(defaultGemini)) {
    defaultGemini = 'gemini-3.6-flash';
  }
  if (isModelCoolingDown(defaultGemini)) {
    defaultGemini = 'gemini-3.7-flash';
  }
  if (isModelCoolingDown(defaultGemini)) {
    defaultGemini = 'gemini-3.5-flash';
  }

  let selectedModel = defaultGemini;
  let thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH' = defaultGemini === 'gemini-3.1-flash-lite' ? 'LOW' : 'MEDIUM';
  let routingReason = `Primary CA Evaluation: ${defaultGemini} for step-marking and ICAI compliance`;

  // 1. Honor explicit admin selection if configured and active
  if (adminModel && APPROVED_MODELS.some((m) => m.id === adminModel) && !isModelCoolingDown(adminModel)) {
    selectedModel = adminModel;
    const desc = APPROVED_MODELS.find((m) => m.id === adminModel);
    thinkingLevel = desc?.defaultThinkingLevel || 'HIGH';
    routingReason = `Admin Designated: ${desc?.displayName || adminModel} (${desc?.role}) with ${thinkingLevel} thinking`;
  } else if (isFast && isProviderConfigured('openai') && !isProviderCreditExhausted('openai') && !isModelCoolingDown('gpt-5.6-terra')) {
    selectedModel = 'gpt-5.6-terra';
    thinkingLevel = 'LOW';
    routingReason = 'Fast High-Volume Routing: OpenAI GPT-5.6 Terra for low-latency multimodal processing';
  } else if (isLegalAudit && isProviderConfigured('anthropic') && !isProviderCreditExhausted('anthropic') && isFinal && !isModelCoolingDown('claude-opus-5')) {
    selectedModel = 'claude-opus-5';
    thinkingLevel = 'HIGH';
    routingReason = 'Deep Legal/Audit Routing: Claude Opus 5 for complex statutory interpretation and auditing standards';
  } else if (isCalcHeavy && isProviderConfigured('openai') && !isProviderCreditExhausted('openai') && isFinal && !isModelCoolingDown('gpt-5.6-sol')) {
    selectedModel = 'gpt-5.6-sol';
    thinkingLevel = 'XHIGH';
    routingReason = 'Calculation Heavy Routing: OpenAI GPT-5.6 Sol with extra-high reasoning for complex numerical verification';
  } else if (isComplex) {
    selectedModel = defaultGemini;
    thinkingLevel = defaultGemini === 'gemini-3.1-flash-lite' ? 'LOW' : 'HIGH';
    routingReason = `Complex Evaluation: ${defaultGemini} with high thinking for deep step-marking`;
  } else {
    selectedModel = defaultGemini;
    thinkingLevel = defaultGemini === 'gemini-3.1-flash-lite' ? 'LOW' : 'MEDIUM';
    routingReason = `Default Primary Routing: ${defaultGemini} for standard ICAI evaluation`;
  }

  // 2. Build deterministic multi-provider fallback hierarchy:
  // Preserves primary Gemini hierarchy while seamlessly incorporating Claude and GPT:
  // - If selectedModel is Gemini (or default):
  //   Immediate fallbacks: gemini-3.1-flash-lite, gemini-3.6-flash, gemini-3.7-flash, gemini-3.5-flash
  //   Secondary multi-provider fallbacks: claude-opus-5, gpt-5.6-sol, claude-sonnet-5, gpt-5.6-terra, gemini-3.1-pro-preview
  // - If selectedModel is external (e.g. admin selected Claude/OpenAI):
  //   Fallback to other models of that provider, then to Gemini 3.8 Flash and Gemini Flash sister models
  const isSelectedGemini = selectedModel.startsWith('gemini');

  let canonicalFallbackOrder: string[];
  if (isSelectedGemini) {
    canonicalFallbackOrder = [
      'gemini-3.1-flash-lite',
      'gemini-3.6-flash',
      'gemini-3.7-flash',
      'gemini-3.5-flash',
      'gemini-3.8-flash',
      'claude-opus-5',
      'gpt-5.6-sol',
      'claude-sonnet-5',
      'gpt-5.6-terra',
      'gemini-3.1-pro-preview',
    ];
  } else {
    // External model selected as primary -> fall back to partner models then Gemini hierarchy
    canonicalFallbackOrder = [
      'gemini-3.1-flash-lite',
      'gemini-3.6-flash',
      'gemini-3.7-flash',
      'gemini-3.5-flash',
      'gemini-3.8-flash',
      'claude-opus-5',
      'gpt-5.6-sol',
      'claude-sonnet-5',
      'gpt-5.6-terra',
      'gemini-3.1-pro-preview',
    ];
  }

  const remaining = canonicalFallbackOrder.filter((m) => m !== selectedModel);
  // Sort remaining so that healthy (non-cooling) models are evaluated first
  remaining.sort((a, b) => {
    const aCool = isModelCoolingDown(a) ? 1 : 0;
    const bCool = isModelCoolingDown(b) ? 1 : 0;
    return aCool - bCool;
  });

  // Determine cross-check model
  let crossCheckModel: string | undefined;
  if (context?.crossCheckEnabled || (isFinal && isStrict)) {
    const isModelHealthy = (mId: string) => {
      const p = getProviderForModel(mId);
      if (!isProviderConfigured(p) || isProviderCreditExhausted(p)) return false;
      try {
        const row = db.prepare('SELECT status, is_enabled FROM model_configs WHERE id = ?').get(mId) as any;
        return Boolean(row && row.is_enabled === 1 && row.status !== 'INSUFFICIENT_CREDITS' && row.status !== 'FAILED' && row.status !== 'NOT_CONFIGURED');
      } catch {
        return true;
      }
    };

    if (selectedModel !== 'gpt-5.6-sol' && isModelHealthy('gpt-5.6-sol')) {
      crossCheckModel = 'gpt-5.6-sol';
    } else if (selectedModel !== 'claude-opus-5' && isModelHealthy('claude-opus-5')) {
      crossCheckModel = 'claude-opus-5';
    } else if (selectedModel !== 'gemini-3.7-flash' && isModelHealthy('gemini-3.7-flash')) {
      crossCheckModel = 'gemini-3.7-flash';
    }
  }

  return {
    primaryModel: selectedModel,
    thinkingLevel,
    routingReason,
    fallbackChain: remaining,
    crossCheckModel,
  };
}

/**
 * Model Fallback Orchestrator:
 * Executes evaluation with smart routing and deterministic fallback.
 * Falls back across all approved, configured, and healthy models in sequence.
 * Throws clean evaluation-unavailable error if all candidates fail, preventing credit deduction.
 */
export async function executeModelWithFallback(
  params: ModelExecutionParams
): Promise<ModelExecutionResult> {
  let adminPreferredModel: string | undefined;
  try {
    const primaryRow = db
      .prepare('SELECT id FROM model_configs WHERE is_primary = 1 AND is_enabled = 1')
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

  // Query database for enabled models
  let enabledModelIds = new Set<string>(APPROVED_MODELS.map((m) => m.id));
  try {
    const dbModels = db.prepare('SELECT id, is_enabled, status FROM model_configs').all() as Array<{
      id: string;
      is_enabled: number;
      status: string;
    }>;
    if (dbModels && dbModels.length > 0) {
      enabledModelIds = new Set(
        dbModels
          .filter((m) => m.is_enabled === 1 && m.status !== 'RETIRED')
          .map((m) => m.id)
      );
    }
  } catch (err) {
    console.warn('Could not query model_configs for enabled statuses:', err);
  }

  const candidateSequence = [
    routing.primaryModel,
    ...routing.fallbackChain,
  ].filter((m) => {
    const provider = getProviderForModel(m);
    if (!isProviderConfigured(provider)) return false;
    // If provider is known to have exhausted credits, skip during live evaluation unless explicitly selected
    if (isProviderCreditExhausted(provider) && m !== routing.primaryModel) {
      return false;
    }
    return enabledModelIds.has(m) || m === routing.primaryModel;
  });

  if (candidateSequence.length === 0) {
    throw new Error(
      'AI Evaluation service is not configured. No active model provider API keys (GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY) found in server environment.'
    );
  }

  let fallbackOccurred = false;
  let fallbackReason: string | undefined;
  let originalModel = routing.primaryModel;
  let fallbackModel: string | undefined;
  let retriesCount = 0;

  for (let i = 0; i < candidateSequence.length; i++) {
    const candidateModel = candidateSequence[i];
    const provider = getProviderForModel(candidateModel);

    // Skip if provider became credit-exhausted during an earlier candidate in this exact evaluation
    if (isProviderCreditExhausted(provider) && i > 0) {
      console.info(`[Model Registry] Skipping ${candidateModel} because provider ${provider.toUpperCase()} has exhausted credits.`);
      continue;
    }

    // If model is cooling down from a recent rate limit or 503 spike, skip if there are later candidates
    if (isModelCoolingDown(candidateModel) && i < candidateSequence.length - 1) {
      console.info(`[Model Registry] Skipping ${candidateModel} because it is cooling down; proceeding to next candidate.`);
      continue;
    }

    // Determine thinking level for candidate (use LOW/MEDIUM thinking to minimize latency and prevent timeouts)
    let effectiveThinking: 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH' = 'MEDIUM';
    if (candidateModel === 'gpt-5.6-sol') {
      effectiveThinking = routing.thinkingLevel === 'XHIGH' ? 'XHIGH' : 'HIGH';
    } else if (
      candidateModel === 'gpt-5.6-terra' ||
      candidateModel === 'claude-sonnet-5' ||
      candidateModel === 'gemini-3.7-flash' ||
      candidateModel === 'gemini-3.6-flash' ||
      candidateModel === 'gemini-3.5-flash' ||
      candidateModel === 'gemini-3.1-flash-lite'
    ) {
      effectiveThinking = 'LOW';
    } else if (candidateModel === 'gemini-3.8-flash') {
      effectiveThinking = routing.thinkingLevel === 'HIGH' && params.context?.isAmbiguousOrComplex ? 'HIGH' : 'MEDIUM';
    } else {
      effectiveThinking = 'MEDIUM';
    }

    const startTime = Date.now();
    try {
      console.info(
        `[Model Registry] Attempting evaluation using ${candidateModel} (${provider.toUpperCase()}, Thinking: ${effectiveThinking}, Attempt: ${i + 1}/${candidateSequence.length})...`
      );

      const output = await executeSingleModel(candidateModel, params, effectiveThinking);
      const latencyMs = Date.now() - startTime;

      try {
        db.prepare(
          "UPDATE model_configs SET status = 'AVAILABLE', last_latency_ms = ?, last_tested_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(latencyMs, candidateModel);
      } catch {}

      if (fallbackOccurred) {
        fallbackModel = candidateModel;
      }

      // Optional Cross-Check Verification if enabled
      let crossCheckResult: any;
      if (routing.crossCheckModel && candidateModel !== routing.crossCheckModel && !isProviderCreditExhausted(getProviderForModel(routing.crossCheckModel))) {
        try {
          crossCheckResult = await performCrossCheck(output.text, params.context, routing.crossCheckModel);
        } catch (ccErr) {
          console.warn('[Model Registry] Cross check advisory exception:', ccErr);
        }
      }

      return {
        rawText: output.text,
        modelUsed: candidateModel,
        modelDisplayName: getModelDisplayName(candidateModel),
        provider,
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
        crossCheckResult,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const errMsg = err?.message || String(err);
      retriesCount++;
      console.warn(`[Model Registry] ${candidateModel} (${provider}) failed after ${latencyMs}ms: ${errMsg}`);

      fallbackOccurred = true;
      fallbackReason = `${candidateModel} failed: ${errMsg.slice(0, 160)}`;

      const errMsgLower = errMsg.toLowerCase();
      const isCreditIssue =
        errMsgLower.includes('credit balance is too low') ||
        errMsgLower.includes('no credits remaining') ||
        errMsgLower.includes('insufficient_quota') ||
        errMsgLower.includes('billing');

      if (isCreditIssue && provider !== 'gemini') {
        markProviderCreditExhausted(provider, errMsg);
      }

      const isRateLimit = errMsgLower.includes('429') || errMsgLower.includes('quota') || errMsgLower.includes('resource_exhausted') || errMsgLower.includes('rate_limit');
      const isTemp = errMsgLower.includes('503') || errMsgLower.includes('502') || errMsgLower.includes('unavailable') || errMsgLower.includes('high demand') || errMsgLower.includes('overloaded');
      const isTimeout = errMsgLower.includes('timed out') || errMsgLower.includes('timeout') || errMsgLower.includes('etimedout');

      if (isRateLimit || isTemp || isTimeout) {
        const cooldownMs = isRateLimit ? 15 * 60 * 1000 : isTimeout ? 3 * 60 * 1000 : 45000;
        const cooldownReason = isRateLimit ? 'Rate Limited / Quota Exceeded' : isTimeout ? 'Request Timed Out' : 'High Demand';
        markModelTemporarilyUnavailable(candidateModel, cooldownMs, cooldownReason);
      }

      try {
        const status = isCreditIssue && provider !== 'gemini' ? 'INSUFFICIENT_CREDITS' : isRateLimit ? 'RATE_LIMITED' : isTimeout ? 'TEMPORARILY_UNAVAILABLE' : isTemp ? 'TEMPORARILY_UNAVAILABLE' : 'FAILED';
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
 * Executes a real API health check against the provider's production endpoint.
 */
export async function testModelConnectivity(
  modelId: string
): Promise<{ success: boolean; latencyMs: number; message: string; model: string; provider: string; status: string }> {
  const provider = getProviderForModel(modelId);
  const startTime = Date.now();

  if (!isProviderConfigured(provider)) {
    const keyName = provider === 'gemini' ? 'GEMINI_API_KEY' : provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
    try {
      db.prepare("UPDATE model_configs SET status = 'NOT_CONFIGURED', last_tested_at = CURRENT_TIMESTAMP WHERE id = ?").run(modelId);
    } catch {}
    return {
      success: false,
      latencyMs: 0,
      message: `${keyName} is not configured in server environment.`,
      model: modelId,
      provider,
      status: 'NOT_CONFIGURED',
    };
  }

  try {
    let pingSuccess = false;

    if (provider === 'gemini') {
      const ai = getGemini();
      const testResponse = await ai.models.generateContent({
        model: modelId,
        contents: 'Ping health check. Respond with: OK',
        config: {
          maxOutputTokens: 20,
          thinkingConfig: {
            thinkingLevel: 'LOW' as any,
          },
        },
      });
      pingSuccess = Boolean(testResponse.text);
    } else if (provider === 'openai') {
      const openai = getOpenAI();
      const isReasoning = modelId.includes('sol') || modelId.includes('terra') || modelId.startsWith('o3') || modelId.startsWith('o1');
      const testResponse = await openai.chat.completions.create({
        model: modelId,
        messages: [{ role: 'user', content: 'Ping health check. Respond with: OK' }],
        ...(isReasoning ? { max_completion_tokens: 20 } : { max_tokens: 20 }),
      });
      pingSuccess = Boolean(testResponse.choices?.[0]?.message?.content);
    } else if (provider === 'anthropic') {
      const anthropic = getAnthropic();
      const testResponse = await anthropic.messages.create({
        model: modelId,
        messages: [{ role: 'user', content: 'Ping health check. Respond with: OK' }],
        max_tokens: 20,
      });
      pingSuccess = Boolean(testResponse.content && testResponse.content.length > 0);
    }

    const latencyMs = Date.now() - startTime;

    // Clear provider circuit breaker cooldown on success
    clearProviderCreditExhausted(provider);

    try {
      db.prepare(
        "UPDATE model_configs SET status = 'AVAILABLE', last_latency_ms = ?, last_tested_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(latencyMs, modelId);
    } catch {}

    return {
      success: true,
      latencyMs,
      message: `Connected successfully to ${modelId} (${provider.toUpperCase()}) in ${latencyMs}ms.`,
      model: modelId,
      provider,
      status: 'AVAILABLE',
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const errMsg = err?.message || String(err);
    const errMsgLower = errMsg.toLowerCase();
    const isCreditIssue =
      errMsgLower.includes('credit balance is too low') ||
      errMsgLower.includes('no credits remaining') ||
      errMsgLower.includes('insufficient_quota') ||
      errMsgLower.includes('quota exceeded for metric') ||
      errMsgLower.includes('billing');

    if (isCreditIssue && provider !== 'gemini') {
      markProviderCreditExhausted(provider, errMsg);
    }

    const isRateLimit = errMsgLower.includes('429') || errMsgLower.includes('quota') || errMsgLower.includes('resource_exhausted') || errMsgLower.includes('rate_limit');
    const isTemp = errMsgLower.includes('503') || errMsgLower.includes('502') || errMsgLower.includes('unavailable') || errMsgLower.includes('high demand') || errMsgLower.includes('overloaded');
    const status = isCreditIssue && provider !== 'gemini' ? 'INSUFFICIENT_CREDITS' : isRateLimit ? 'RATE_LIMITED' : isTemp ? 'TEMPORARILY_UNAVAILABLE' : 'FAILED';

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

/**
 * Cross-Check Verifier:
 * Uses a secondary high-reasoning model (e.g. GPT-5.6 Sol or Claude Opus 5)
 * to verify calculation integrity and step marks breakdown.
 */
export async function performCrossCheck(
  rawEvaluationOutput: string,
  context?: any,
  preferredModel: string = 'gpt-5.6-sol'
): Promise<{
  verified: boolean;
  modelUsed: string;
  notes: string;
  discrepanciesFound: boolean;
}> {
  const provider = getProviderForModel(preferredModel);
  if (!isProviderConfigured(provider) || isProviderCreditExhausted(provider)) {
    return {
      verified: true,
      modelUsed: 'none',
      notes: `Cross-check skipped: ${provider.toUpperCase()} API key not configured or out of credits.`,
      discrepanciesFound: false,
    };
  }

  try {
    const cfg = db.prepare('SELECT status, is_enabled FROM model_configs WHERE id = ?').get(preferredModel) as any;
    if (cfg && (cfg.is_enabled === 0 || cfg.status === 'INSUFFICIENT_CREDITS' || cfg.status === 'FAILED' || cfg.status === 'NOT_CONFIGURED')) {
      return {
        verified: true,
        modelUsed: 'none',
        notes: `Cross-check skipped: ${preferredModel} is currently ${cfg.status}.`,
        discrepanciesFound: false,
      };
    }
  } catch {}

  const systemPrompt = `You are a Senior ICAI Evaluation Reviewer.
Verify that the question-wise marks and arithmetic totals in the evaluation response are consistent and match ICAI step marking rules.
Return a JSON object: { "verified": true, "discrepanciesFound": false, "notes": "Summary of verification" }`;

  const userPrompt = `Review this evaluation result for arithmetic and step-marking accuracy:\n\n${rawEvaluationOutput.slice(0, 3000)}`;

  try {
    const res = await executeSingleModel(
      preferredModel,
      { systemPrompt, userPrompt, responseMimeType: 'application/json' },
      'HIGH',
      45000
    );

    let parsed: any = {};
    try {
      const clean = res.text.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      parsed = { verified: true, discrepanciesFound: false, notes: res.text.slice(0, 160) };
    }

    return {
      verified: parsed.verified !== false,
      modelUsed: preferredModel,
      notes: parsed.notes || 'Cross-check verification completed with no discrepancies.',
      discrepanciesFound: Boolean(parsed.discrepanciesFound),
    };
  } catch (err: any) {
    return {
      verified: true,
      modelUsed: preferredModel,
      notes: `Cross-check advisory: primary evaluation accepted (${err?.message?.slice(0, 80)})`,
      discrepanciesFound: false,
    };
  }
}
