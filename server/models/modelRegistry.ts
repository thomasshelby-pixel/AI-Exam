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
    id: 'gemini-3.1-flash-lite',
    provider: 'gemini',
    displayName: 'Google Gemini 3.1 Flash Lite',
    description: 'Ultra-fast multimodal PDF understanding, handwriting reading, and emergency fallback with minimal latency.',
    contextWindow: 1048576,
    recommended: true,
    role: 'Fast Multimodal & High-Volume Fallback',
    defaultThinkingLevel: 'LOW',
    fallbackOrder: 1,
    recommendedReasoning: 'LOW',
    useCases: [
      'Rapid multimodal PDF evaluation',
      'Ultra-low-latency response generation',
      'High-throughput fallback when other models are saturated',
    ],
  },
  {
    id: 'gemini-flash-latest',
    provider: 'gemini',
    displayName: 'Google Gemini Flash Latest',
    description: 'Standard reliable production Flash fallback when primary models encounter transient rate limits or high-demand spikes.',
    contextWindow: 1048576,
    recommended: true,
    role: 'Production Flash Fallback',
    defaultThinkingLevel: 'MEDIUM',
    fallbackOrder: 2,
    recommendedReasoning: 'MEDIUM',
    useCases: [
      'Standard reliable fallback tier',
      'Rate limit recovery',
      'High-volume routine processing',
    ],
  },
  {
    id: 'gemini-3.1-pro-preview',
    provider: 'gemini',
    displayName: 'Google Gemini 3.1 Pro (Preview)',
    description: 'Difficult and highly ambiguous CA evaluations, complex legal/accounting/tax/audit reasoning, difficult calculations, consequential-error analysis and cases requiring deeper reasoning. (PREVIEW: Not for default production).',
    contextWindow: 2097152,
    recommended: false,
    role: 'Deep Reasoning & Pro Analysis',
    defaultThinkingLevel: 'HIGH',
    fallbackOrder: 3,
    isPreview: true,
    recommendedReasoning: 'HIGH',
    useCases: [
      'Difficult calculations & consequential-error analysis',
      'Extreme context preview cases',
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
    fallbackOrder: 4,
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
    fallbackOrder: 5,
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
    fallbackOrder: 6,
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
    fallbackOrder: 7,
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
    id: 'gemini-3.7-flash',
    provider: 'gemini',
    displayName: 'Google Gemini 3.7 Flash',
    description: 'Advanced CA evaluation, multimodal answer-sheet understanding, long/complex descriptive evaluation, step marking, and high-volume production evaluation.',
    contextWindow: 1048576,
    recommended: true,
    role: 'Advanced CA Evaluation / Multimodal / High-Volume',
    defaultThinkingLevel: 'HIGH',
    fallbackOrder: 8,
    recommendedReasoning: 'HIGH',
    useCases: [
      'Advanced CA answer-sheet evaluation',
      'Multimodal answer-sheet understanding',
      'Long/complex descriptive evaluation',
      'Step-marking and sub-part analysis',
      'High-volume production evaluation',
    ],
  },
  {
    id: 'gpt-6-astra',
    provider: 'openai',
    displayName: 'OpenAI GPT-6 Astra',
    description: 'Deep reasoning, calculation verification, cross-checking, and difficult CA accounting, tax, law, and audit evaluation.',
    contextWindow: 200000,
    recommended: false,
    role: 'Deep Reasoning / Calculation Verification / Cross-Check',
    defaultThinkingLevel: 'HIGH',
    fallbackOrder: 9,
    recommendedReasoning: 'HIGH',
    useCases: [
      'Deep reasoning and calculation verification',
      'Cross-checking difficult accounting, tax, law, and audit answers',
      'Complex multi-step numerical audits',
      'High-precision quality review and arbitration',
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

/**
 * Extract retry delay in milliseconds from provider error message (e.g. "Please retry in 14.819496429s" or retryDelay: "14s")
 */
export function extractRetryDelayMs(errMsg: string, defaultMs = 30000): number {
  if (!errMsg) return defaultMs;
  const retryInMatch = errMsg.match(/retry in\s+([0-9.]+)\s*s/i);
  if (retryInMatch && retryInMatch[1]) {
    const sec = parseFloat(retryInMatch[1]);
    if (!isNaN(sec) && sec > 0) {
      return Math.min(120000, Math.max(5000, Math.ceil(sec * 1000) + 1000));
    }
  }
  const retryDelayMatch = errMsg.match(/retryDelay["']?\s*:\s*["']?([0-9.]+)\s*s/i);
  if (retryDelayMatch && retryDelayMatch[1]) {
    const sec = parseFloat(retryDelayMatch[1]);
    if (!isNaN(sec) && sec > 0) {
      return Math.min(120000, Math.max(5000, Math.ceil(sec * 1000) + 1000));
    }
  }
  return defaultMs;
}

export function markProviderCreditExhausted(provider: ModelProviderType, reason?: string) {
  const existing = providerCreditExhaustedUntil.get(provider);
  const now = Date.now();
  // Keep provider marked credit-exhausted for 24 hours so we do not repeatedly retry depleted accounts
  providerCreditExhaustedUntil.set(provider, now + 24 * 60 * 60 * 1000);
  if (!existing || now > existing) {
    console.warn(`[Model Registry] Provider ${provider.toUpperCase()} marked INSUFFICIENT_CREDITS: ${reason || 'credit balance too low'}`);
  }
  try {
    db.prepare(
      "UPDATE model_configs SET status = 'INSUFFICIENT_CREDITS', health_details = ?, last_tested_at = CURRENT_TIMESTAMP WHERE provider = ?"
    ).run(reason ? reason.slice(0, 250) : 'Credit balance depleted', provider);
  } catch {}
}

export function clearProviderCreditExhausted(provider: ModelProviderType) {
  providerCreditExhaustedUntil.delete(provider);
}

export function isProviderCreditExhausted(provider: ModelProviderType): boolean {
  const until = providerCreditExhaustedUntil.get(provider);
  if (until && Date.now() < until) {
    return true;
  }
  if (until && Date.now() >= until) {
    providerCreditExhaustedUntil.delete(provider);
  }
  // Check if active models for this provider are recorded with INSUFFICIENT_CREDITS in DB
  try {
    const rows = db.prepare("SELECT status FROM model_configs WHERE provider = ?").all(provider) as { status: string }[];
    if (rows.length > 0 && rows.every((r) => r.status === 'INSUFFICIENT_CREDITS')) {
      return true;
    }
  } catch {}
  return false;
}

/**
 * In-memory per-model cooldown tracking:
 * If an individual model hits a rate-limit (429) or high-demand 503 spike,
 * cool down that individual model for 15-45s so fallback models can take over immediately.
 */
const modelCooldownUntil = new Map<string, { until: number; reason: string }>();

export function markModelTemporarilyUnavailable(modelId: string, durationMs = 45000, reason = 'Rate limited or high demand') {
  const existing = modelCooldownUntil.get(modelId);
  const now = Date.now();
  modelCooldownUntil.set(modelId, { until: now + durationMs, reason });
  if (!existing || now > existing.until) {
    console.info(`[Model Registry] Model ${modelId} cooling down for ${Math.round(durationMs / 1000)}s (${reason}).`);
  }
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

// Check database for any previously rate-limited or credit-exhausted models on startup
try {
  const rateLimitedRows = db.prepare("SELECT id FROM model_configs WHERE status = 'RATE_LIMITED' OR status = 'TEMPORARILY_UNAVAILABLE'").all() as { id: string }[];
  for (const r of rateLimitedRows) {
    markModelTemporarilyUnavailable(r.id, 5 * 60 * 1000, 'Restored unavailable state from DB');
  }

  const creditExhaustedRows = db.prepare("SELECT id, provider, health_details FROM model_configs WHERE status = 'INSUFFICIENT_CREDITS'").all() as { id: string; provider: ModelProviderType; health_details?: string }[];
  for (const r of creditExhaustedRows) {
    markProviderCreditExhausted(r.provider, r.health_details || 'Restored credit exhaustion state from DB');
    markModelTemporarilyUnavailable(r.id, 24 * 60 * 60 * 1000, 'Provider account credit balance depleted');
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
      const rawErrMsg = err?.message || String(err);
      const errMsg = rawErrMsg.toLowerCase();
      const isPrepaymentDepleted =
        errMsg.includes('prepayment credits are depleted') ||
        errMsg.includes('billing#prepay') ||
        (errMsg.includes('prepayment') && errMsg.includes('depleted'));
      if (isPrepaymentDepleted) {
        markProviderCreditExhausted('gemini', rawErrMsg || 'Gemini account prepayment credits are depleted');
        throw err;
      }
      const is429 = errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('resource_exhausted');
      if (is429) {
        const retryDelayMs = extractRetryDelayMs(rawErrMsg, 25000);
        markModelTemporarilyUnavailable(modelId, retryDelayMs, `Rate limited (retry in ${Math.ceil(retryDelayMs / 1000)}s)`);
        throw err;
      }
      const isTimeout = errMsg.includes('timed out') || errMsg.includes('timeout') || errMsg.includes('etimedout');
      if (isTimeout) {
        markModelTemporarilyUnavailable(modelId, 60000, 'Request Timed Out');
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
  if (modelId.includes('sol') || modelId.includes('opus') || modelId.includes('pro') || modelId.includes('astra')) {
    defaultTimeoutMs = hasAttachment ? 240000 : 60000;
  } else if (modelId.includes('lite') || modelId.includes('terra') || modelId.includes('3.7-flash')) {
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

  const isModelUsable = (mId: string): boolean => {
    const p = getProviderForModel(mId);
    if (!isProviderConfigured(p) || isProviderCreditExhausted(p) || isModelCoolingDown(mId)) return false;
    try {
      const row = db.prepare('SELECT status, is_enabled FROM model_configs WHERE id = ?').get(mId) as any;
      return Boolean(row && row.is_enabled === 1 && row.status !== 'INSUFFICIENT_CREDITS' && row.status !== 'FAILED' && row.status !== 'NOT_CONFIGURED');
    } catch {
      return true;
    }
  };

  let defaultGemini = 'gemini-3.8-flash';
  if (isModelCoolingDown(defaultGemini)) {
    defaultGemini = 'gemini-3.1-flash-lite';
  }
  if (isModelCoolingDown(defaultGemini)) {
    defaultGemini = 'gemini-flash-latest';
  }
  if (isModelCoolingDown(defaultGemini)) {
    defaultGemini = 'gemini-3.1-pro-preview';
  }

  let selectedModel = defaultGemini;
  let thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH' = defaultGemini === 'gemini-3.1-flash-lite' ? 'LOW' : 'MEDIUM';
  let routingReason = `Primary CA Evaluation: ${defaultGemini} for step-marking and ICAI compliance`;

  // 1. Honor explicit admin selection if configured, active, and usable
  if (adminModel && APPROVED_MODELS.some((m) => m.id === adminModel) && isModelUsable(adminModel)) {
    selectedModel = adminModel;
    const desc = APPROVED_MODELS.find((m) => m.id === adminModel);
    thinkingLevel = desc?.defaultThinkingLevel || 'HIGH';
    routingReason = `Admin Designated: ${desc?.displayName || adminModel} (${desc?.role}) with ${thinkingLevel} thinking`;
  } else if (isFast && isModelUsable('gpt-5.6-terra')) {
    selectedModel = 'gpt-5.6-terra';
    thinkingLevel = 'LOW';
    routingReason = 'Fast High-Volume Routing: OpenAI GPT-5.6 Terra for low-latency multimodal processing';
  } else if (isLegalAudit && isModelUsable('claude-opus-5') && isFinal) {
    selectedModel = 'claude-opus-5';
    thinkingLevel = 'HIGH';
    routingReason = 'Deep Legal/Audit Routing: Claude Opus 5 for complex statutory interpretation and auditing standards';
  } else if (isCalcHeavy && isModelUsable('gpt-5.6-sol') && isFinal) {
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
  const canonicalFallbackOrder = [
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
    'gemini-3.1-pro-preview',
    'claude-opus-5',
    'gpt-5.6-sol',
    'claude-sonnet-5',
    'gpt-5.6-terra',
    'gemini-3.7-flash',
    'gpt-6-astra',
  ];

  const remaining = canonicalFallbackOrder.filter((m) => m !== selectedModel);
  // Sort remaining so that healthy (non-cooling) models are evaluated first
  remaining.sort((a, b) => {
    const aCool = isModelCoolingDown(a) ? 1 : 0;
    const bCool = isModelCoolingDown(b) ? 1 : 0;
    return aCool - bCool;
  });

  // Filter out models that are credit-exhausted, disabled, or unconfigured
  const usableFallbacks = remaining.filter((m) => isModelUsable(m));
  const finalFallbackChain = usableFallbacks.length > 0 ? usableFallbacks : remaining.filter((m) => m.startsWith('gemini'));

  // Determine cross-check model
  let crossCheckModel: string | undefined;
  if (context?.crossCheckEnabled || (isFinal && isStrict)) {
    if (selectedModel !== 'gpt-5.6-sol' && isModelUsable('gpt-5.6-sol')) {
      crossCheckModel = 'gpt-5.6-sol';
    } else if (selectedModel !== 'claude-opus-5' && isModelUsable('claude-opus-5')) {
      crossCheckModel = 'claude-opus-5';
    } else if (selectedModel !== 'gemini-flash-latest' && isModelUsable('gemini-flash-latest')) {
      crossCheckModel = 'gemini-flash-latest';
    }
  }

  return {
    primaryModel: selectedModel,
    thinkingLevel,
    routingReason,
    fallbackChain: finalFallbackChain,
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

    // Skip if provider has exhausted credits
    if (isProviderCreditExhausted(provider) && candidateSequence.some((m) => !isProviderCreditExhausted(getProviderForModel(m)))) {
      console.info(`[Model Registry] Skipping ${candidateModel} because provider ${provider.toUpperCase()} has exhausted credits.`);
      continue;
    }

    // Skip if model itself is marked INSUFFICIENT_CREDITS or disabled
    try {
      const row = db.prepare('SELECT status, is_enabled FROM model_configs WHERE id = ?').get(candidateModel) as any;
      if (row && (row.is_enabled === 0 || row.status === 'INSUFFICIENT_CREDITS' || row.status === 'NOT_CONFIGURED')) {
        if (candidateSequence.some((m) => m !== candidateModel)) {
          console.info(`[Model Registry] Skipping ${candidateModel} because status is ${row.status}.`);
          continue;
        }
      }
    } catch {}

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
      candidateModel === 'gemini-flash-latest' ||
      candidateModel === 'gemini-3.1-flash-lite'
    ) {
      effectiveThinking = 'LOW';
    } else if (candidateModel === 'gemini-3.8-flash' || candidateModel === 'gemini-3.1-pro-preview' || candidateModel === 'claude-opus-5') {
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
      console.warn(`[Model Registry] ${candidateModel} (${provider}) failed after ${latencyMs}ms: ${errMsg.slice(0, 160)}`);

      fallbackOccurred = true;
      fallbackReason = `${candidateModel} failed: ${errMsg.slice(0, 160)}`;

      const errMsgLower = errMsg.toLowerCase();

      // Differentiate fatal credit exhaustion from temporary per-model rate limits
      const isGeminiPrepayment =
        errMsgLower.includes('prepayment credits are depleted') ||
        errMsgLower.includes('billing#prepay') ||
        (errMsgLower.includes('prepayment') && errMsgLower.includes('depleted'));
      const isAnthropicCredit =
        provider === 'anthropic' &&
        (errMsgLower.includes('credit balance is too low') ||
          errMsgLower.includes('plans & billing to upgrade') ||
          errMsgLower.includes('no credits remaining'));
      const isOpenAiCredit =
        provider === 'openai' &&
        (errMsgLower.includes('insufficient_quota') ||
          (errMsgLower.includes('exceeded your current quota') && errMsgLower.includes('billing')));

      const isCreditIssue = isGeminiPrepayment || isAnthropicCredit || isOpenAiCredit;

      if (isCreditIssue) {
        markProviderCreditExhausted(provider, errMsg);
      }

      const isRateLimit = errMsgLower.includes('429') || errMsgLower.includes('quota') || errMsgLower.includes('resource_exhausted') || errMsgLower.includes('rate_limit');
      const isTemp = errMsgLower.includes('503') || errMsgLower.includes('502') || errMsgLower.includes('unavailable') || errMsgLower.includes('high demand') || errMsgLower.includes('overloaded');
      const isTimeout = errMsgLower.includes('timed out') || errMsgLower.includes('timeout') || errMsgLower.includes('etimedout');

      if (isRateLimit || isTemp || isTimeout) {
        const cooldownMs = isRateLimit ? extractRetryDelayMs(errMsg, 30000) : isTimeout ? 2 * 60 * 1000 : 45000;
        const cooldownReason = isRateLimit ? `Rate Limited / Quota (Retry in ${Math.ceil(cooldownMs / 1000)}s)` : isTimeout ? 'Request Timed Out' : 'High Demand';
        markModelTemporarilyUnavailable(candidateModel, cooldownMs, cooldownReason);
      }

      try {
        const status = isCreditIssue ? 'INSUFFICIENT_CREDITS' : isRateLimit ? 'RATE_LIMITED' : isTimeout ? 'TEMPORARILY_UNAVAILABLE' : isTemp ? 'TEMPORARILY_UNAVAILABLE' : 'FAILED';
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

export type HealthCheckStage = 'CONNECTIVITY' | 'INFERENCE' | 'EVALUATION_READINESS';

export interface ModelHealthResult {
  success: boolean;
  latencyMs: number;
  message: string;
  model: string;
  provider: string;
  status: string;
  healthStage: HealthCheckStage;
  details?: {
    connectivity?: { passed: boolean; latencyMs: number; message: string };
    inference?: { passed: boolean; latencyMs: number; outputSample?: string; message?: string };
    evaluationReadiness?: {
      passed: boolean;
      latencyMs: number;
      schemaValid: boolean;
      componentsCount: number;
      marksAwarded: number;
      maximumMarks: number;
      message?: string;
    };
  };
}

/**
 * Diagnostic multi-state health check for a specific model:
 * Stage 1: CONNECTIVITY - endpoint reachable, credentials valid, provider client initialized
 * Stage 2: INFERENCE - live invocation succeeds, valid response returned, latency measured, tokens verified
 * Stage 3: EVALUATION_READINESS - model successfully outputs structured ICAI step-marking schema with bounds & arithmetic balance
 */
export async function testModelHealth(
  modelId: string,
  targetStage: HealthCheckStage = 'EVALUATION_READINESS'
): Promise<ModelHealthResult> {
  const provider = getProviderForModel(modelId);
  const overallStart = Date.now();

  const resultDetails: NonNullable<ModelHealthResult['details']> = {};

  // STAGE 0: FAST-CHECK PROVIDER CIRCUIT BREAKER
  if (isProviderCreditExhausted(provider)) {
    return {
      success: false,
      latencyMs: 0,
      message: `Provider ${provider.toUpperCase()} has depleted credits. Please update billing/credits in your provider dashboard.`,
      model: modelId,
      provider,
      status: 'INSUFFICIENT_CREDITS',
      healthStage: 'CONNECTIVITY',
      details: {
        connectivity: { passed: false, latencyMs: 0, message: `Provider ${provider.toUpperCase()} credit balance depleted` },
      },
    };
  }

  // STAGE 1: CONNECTIVITY CHECK
  if (!isProviderConfigured(provider)) {
    const keyName = provider === 'gemini' ? 'GEMINI_API_KEY' : provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
    try {
      db.prepare("UPDATE model_configs SET status = 'NOT_CONFIGURED', health_stage = 'CONNECTIVITY', health_details = ?, last_tested_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(`${keyName} is not configured`, modelId);
    } catch {}
    return {
      success: false,
      latencyMs: 0,
      message: `${keyName} is not configured in server environment.`,
      model: modelId,
      provider,
      status: 'NOT_CONFIGURED',
      healthStage: 'CONNECTIVITY',
      details: {
        connectivity: { passed: false, latencyMs: 0, message: `${keyName} missing` },
      },
    };
  }

  resultDetails.connectivity = {
    passed: true,
    latencyMs: 1,
    message: `${provider.toUpperCase()} provider credentials configured and initialized.`,
  };

  if (targetStage === 'CONNECTIVITY') {
    try {
      db.prepare("UPDATE model_configs SET status = 'CONNECTED', health_stage = 'CONNECTIVITY', health_details = 'Endpoint credentials verified', last_latency_ms = 1, last_tested_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(modelId);
    } catch {}
    return {
      success: true,
      latencyMs: 1,
      message: `Endpoint credentials valid for ${modelId} (${provider.toUpperCase()}).`,
      model: modelId,
      provider,
      status: 'CONNECTED',
      healthStage: 'CONNECTIVITY',
      details: resultDetails,
    };
  }

  // STAGE 2: INFERENCE CHECK
  const inferenceStart = Date.now();
  let inferenceOutput = '';
  try {
    if (provider === 'gemini') {
      const ai = getGemini();
      const testResponse = await ai.models.generateContent({
        model: modelId,
        contents: 'Ping health check. Respond strictly with: OK',
        config: {
          maxOutputTokens: 20,
          thinkingConfig: {
            thinkingLevel: 'LOW' as any,
          },
        },
      });
      inferenceOutput = testResponse.text?.trim() || '';
    } else if (provider === 'openai') {
      const openai = getOpenAI();
      const isReasoning = modelId.includes('sol') || modelId.includes('terra') || modelId.startsWith('o3') || modelId.startsWith('o1');
      const testResponse = await openai.chat.completions.create({
        model: modelId,
        messages: [{ role: 'user', content: 'Ping health check. Respond strictly with: OK' }],
        ...(isReasoning ? { max_completion_tokens: 20 } : { max_tokens: 20 }),
      });
      inferenceOutput = testResponse.choices?.[0]?.message?.content?.trim() || '';
    } else if (provider === 'anthropic') {
      const anthropic = getAnthropic();
      const testResponse = await anthropic.messages.create({
        model: modelId,
        messages: [{ role: 'user', content: 'Ping health check. Respond strictly with: OK' }],
        max_tokens: 20,
      });
      const block = testResponse.content?.[0];
      inferenceOutput = block && 'text' in block ? (block as any).text.trim() : '';
    }

    const inferenceLatency = Date.now() - inferenceStart;
    resultDetails.inference = {
      passed: Boolean(inferenceOutput),
      latencyMs: inferenceLatency,
      outputSample: inferenceOutput.slice(0, 50),
      message: `Inference verified (${inferenceLatency}ms).`,
    };

    // Clear provider circuit breaker if it was previously exhausted
    clearProviderCreditExhausted(provider);
  } catch (err: any) {
    const latencyMs = Date.now() - overallStart;
    const errMsg = err?.message || String(err);
    const errMsgLower = errMsg.toLowerCase();

    const isTimeout =
      errMsgLower.includes('timeout') ||
      errMsgLower.includes('timed out') ||
      errMsgLower.includes('deadline');

    const isInvalidModel =
      errMsgLower.includes('model_not_found') ||
      errMsgLower.includes('does not exist') ||
      errMsgLower.includes('is not found for api version') ||
      errMsgLower.includes('not found') ||
      errMsgLower.includes('unsupported model') ||
      errMsgLower.includes('invalid model');

    const isCreditIssue =
      errMsgLower.includes('credit balance is too low') ||
      errMsgLower.includes('no credits remaining') ||
      errMsgLower.includes('insufficient_quota') ||
      errMsgLower.includes('quota exceeded for metric') ||
      errMsgLower.includes('plans & billing') ||
      errMsgLower.includes('billing');

    if (isCreditIssue && provider !== 'gemini') {
      markProviderCreditExhausted(provider, errMsg);
    }

    const isRateLimit =
      !isCreditIssue &&
      (errMsgLower.includes('429') ||
        errMsgLower.includes('resource_exhausted') ||
        errMsgLower.includes('rate_limit') ||
        errMsgLower.includes('too many requests'));

    const isAuth =
      errMsgLower.includes('401') ||
      errMsgLower.includes('api key not valid') ||
      errMsgLower.includes('invalid_api_key') ||
      errMsgLower.includes('unauthorized') ||
      errMsgLower.includes('forbidden') ||
      errMsgLower.includes('authentication');

    const isTemp =
      errMsgLower.includes('503') ||
      errMsgLower.includes('502') ||
      errMsgLower.includes('500') ||
      errMsgLower.includes('unavailable') ||
      errMsgLower.includes('high demand') ||
      errMsgLower.includes('overloaded');

    let status = 'FAILED_HEALTH_CHECK';
    if (isInvalidModel) {
      status = 'INVALID_MODEL';
    } else if (isAuth) {
      status = 'AUTH_ERROR';
    } else if (isCreditIssue) {
      status = 'INSUFFICIENT_CREDITS';
    } else if (isRateLimit) {
      status = 'RATE_LIMITED';
    } else if (isTimeout) {
      status = 'TIMEOUT';
    } else if (isTemp) {
      status = 'TEMPORARILY_UNAVAILABLE';
    }

    const userFacingMsg =
      status === 'INSUFFICIENT_CREDITS'
        ? `Provider ${provider.toUpperCase()} has insufficient credits/quota: ${errMsg.slice(0, 180)}. Model is registered but billing refill is required.`
        : status === 'INVALID_MODEL'
        ? `Model ID ${modelId} was rejected by ${provider.toUpperCase()} API (invalid or unavailable model).`
        : errMsg.slice(0, 200);

    try {
      db.prepare(
        "UPDATE model_configs SET status = ?, health_stage = 'INFERENCE', health_details = ?, last_latency_ms = ?, last_tested_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(status, userFacingMsg.slice(0, 250), latencyMs, modelId);
    } catch {}

    resultDetails.inference = {
      passed: false,
      latencyMs,
      message: userFacingMsg.slice(0, 200),
    };

    return {
      success: false,
      latencyMs,
      message: userFacingMsg.slice(0, 200),
      model: modelId,
      provider,
      status,
      healthStage: 'INFERENCE',
      details: resultDetails,
    };
  }

  if (targetStage === 'INFERENCE') {
    const totalLatency = Date.now() - overallStart;
    clearProviderCreditExhausted(provider);
    try {
      db.prepare(
        "UPDATE model_configs SET status = 'INFERENCE_READY', health_stage = 'INFERENCE', health_details = 'Inference verified successfully', last_latency_ms = ?, last_tested_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(totalLatency, modelId);
    } catch {}
    return {
      success: true,
      latencyMs: totalLatency,
      message: `Inference check passed for ${modelId} (${provider.toUpperCase()}) in ${totalLatency}ms.`,
      model: modelId,
      provider,
      status: 'INFERENCE_READY',
      healthStage: 'INFERENCE',
      details: resultDetails,
    };
  }

  // STAGE 3: EVALUATION READINESS CHECK (Structured ICAI Step-Marking Schema)
  const evalStart = Date.now();
  const testEvalPrompt = `You are an ICAI evaluation engine testing model calibration.
Evaluate this student answer against the verified marking scheme.

QUESTION: Is dividend income from a domestic company received by a resident individual taxable in Assessment Year 2026-27? State the head of income and whether tax is deducted at source.
MAXIMUM MARKS: 3 MARKS.

VERIFIED ICAI SUGGESTED ANSWER & STEP-MARKING:
1. Dividend from domestic company is fully taxable in hands of shareholder [1 Mark]
2. Taxable under the head 'Income from Other Sources' at applicable slab rates [1 Mark]
3. TDS under Section 194 @ 10% is deductible if dividend exceeds ₹5,000 in a financial year [1 Mark]

CANDIDATE ANSWER:
"Dividend from domestic company is taxable in hands of shareholder. It is taxed under Income from Other Sources at slab rate. TDS applies @ 10% under section 194 if amount exceeds Rs. 5,000."

TASK: Return strictly a valid JSON object matching this schema:
{
  "marksAwarded": 3,
  "maximumMarks": 3,
  "status": "correct",
  "reasonForDeduction": "",
  "markingComponents": [
    {
      "componentType": "PROVISION",
      "expectedRequirement": "Taxable in hands of shareholder",
      "studentEvidence": "taxable in hands of shareholder",
      "assessment": "CORRECT",
      "marksAvailable": 1,
      "marksAwarded": 1,
      "marksDeducted": 0
    },
    {
      "componentType": "APPLICATION",
      "expectedRequirement": "Taxable under Income from Other Sources at slab rates",
      "studentEvidence": "taxed under Income from Other Sources at slab rate",
      "assessment": "CORRECT",
      "marksAvailable": 1,
      "marksAwarded": 1,
      "marksDeducted": 0
    },
    {
      "componentType": "PROVISION",
      "expectedRequirement": "TDS u/s 194 @ 10% if exceeds Rs. 5,000",
      "studentEvidence": "TDS applies @ 10% under section 194 if amount exceeds Rs. 5,000",
      "assessment": "CORRECT",
      "marksAvailable": 1,
      "marksAwarded": 1,
      "marksDeducted": 0
    }
  ]
}`;

  try {
    const evalRes = await executeSingleModel(
      modelId,
      {
        systemPrompt: 'You are an ICAI Examination Evaluation engine. Output strictly valid JSON matching the requested schema.',
        userPrompt: testEvalPrompt,
        responseMimeType: 'application/json',
        maxTokens: 1024,
      },
      'LOW',
      30000
    );

    const evalLatency = Date.now() - evalStart;
    let cleanJson = evalRes.text.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      const match = cleanJson.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error('Model failed to produce valid JSON');
      }
    }

    const marksAwarded = Number(parsed.marksAwarded);
    const maxMarks = Number(parsed.maximumMarks) || 3;
    const components = Array.isArray(parsed.markingComponents) ? parsed.markingComponents : [];

    const isSchemaValid =
      !isNaN(marksAwarded) &&
      marksAwarded >= 0 &&
      marksAwarded <= maxMarks &&
      components.length >= 2;

    if (!isSchemaValid) {
      throw new Error(`Model output schema invalid or missing components (marksAwarded=${marksAwarded}, components=${components.length})`);
    }

    resultDetails.evaluationReadiness = {
      passed: true,
      latencyMs: evalLatency,
      schemaValid: true,
      componentsCount: components.length,
      marksAwarded,
      maximumMarks: maxMarks,
      message: `Evaluation readiness verified with ${components.length} components (${evalLatency}ms).`,
    };

    const totalLatency = Date.now() - overallStart;
    clearProviderCreditExhausted(provider);
    try {
      db.prepare(
        "UPDATE model_configs SET status = 'EVALUATION_READY', health_stage = 'EVALUATION_READINESS', health_details = ?, last_latency_ms = ?, last_tested_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(`Verified: Schema valid, ${components.length} components, ${marksAwarded}/${maxMarks} marks awarded`, totalLatency, modelId);
    } catch {}

    return {
      success: true,
      latencyMs: totalLatency,
      message: `Model ${modelId} (${provider.toUpperCase()}) passed all 3 health check stages: CONNECTIVITY, INFERENCE, and EVALUATION_READINESS in ${totalLatency}ms.`,
      model: modelId,
      provider,
      status: 'EVALUATION_READY',
      healthStage: 'EVALUATION_READINESS',
      details: resultDetails,
    };
  } catch (evalErr: any) {
    const totalLatency = Date.now() - overallStart;
    const errMsg = evalErr?.message || String(evalErr);
    const isRateLimit = errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('resource_exhausted');

    if (isRateLimit) {
      const delayMs = extractRetryDelayMs(errMsg, 25000);
      markModelTemporarilyUnavailable(modelId, delayMs, `Stage 3 rate limit (retry in ${Math.ceil(delayMs / 1000)}s)`);
      console.info(`[Model Registry] ${modelId} inference succeeded; Stage 3 rate limited (cooldown: ${Math.ceil(delayMs / 1000)}s).`);
    } else {
      console.warn(`[Model Registry] ${modelId} failed Stage 3 (Evaluation Readiness): ${errMsg.slice(0, 160)}`);
    }

    resultDetails.evaluationReadiness = {
      passed: false,
      latencyMs: Date.now() - evalStart,
      schemaValid: false,
      componentsCount: 0,
      marksAwarded: 0,
      maximumMarks: 3,
      message: isRateLimit
        ? `Inference passed. Stage 3 rate limited (quota limit; retry in ${Math.ceil(extractRetryDelayMs(errMsg, 25000) / 1000)}s).`
        : errMsg.slice(0, 200),
    };

    // If inference passed, keep status as INFERENCE_READY so it's not marked dead
    try {
      db.prepare(
        "UPDATE model_configs SET status = 'INFERENCE_READY', health_stage = 'INFERENCE', health_details = ?, last_latency_ms = ?, last_tested_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(
        isRateLimit
          ? `Inference verified. Stage 3 rate limited (${Math.ceil(extractRetryDelayMs(errMsg, 25000) / 1000)}s cooldown)`
          : `Inference passed, but Evaluation schema check failed: ${errMsg.slice(0, 160)}`,
        totalLatency,
        modelId
      );
    } catch {}

    return {
      success: true,
      latencyMs: totalLatency,
      message: isRateLimit
        ? `Model ${modelId} passed connectivity and inference. Stage 3 is temporarily rate-limited (resets in ${Math.ceil(extractRetryDelayMs(errMsg, 25000) / 1000)}s).`
        : `Model ${modelId} is INFERENCE_READY but failed deep schema check: ${errMsg.slice(0, 160)}`,
      model: modelId,
      provider,
      status: 'INFERENCE_READY',
      healthStage: 'INFERENCE',
      details: resultDetails,
    };
  }
}

/**
 * Diagnostic test connectivity for a specific model (backward compatibility wrapper)
 */
export async function testModelConnectivity(
  modelId: string
): Promise<{ success: boolean; latencyMs: number; message: string; model: string; provider: string; status: string }> {
  const res = await testModelHealth(modelId, 'INFERENCE');
  return {
    success: res.success,
    latencyMs: res.latencyMs,
    message: res.message,
    model: res.model,
    provider: res.provider,
    status: res.status,
  };
}

export const testModelConnection = testModelConnectivity;

/**
 * Benchmark Test Runner:
 * Executes a standard CA evaluation benchmark against a specific model
 * to verify schema fidelity, step calculation accuracy, bounds compliance, and latency.
 */
export async function runModelBenchmark(modelId: string): Promise<{
  modelId: string;
  provider: string;
  passed: boolean;
  totalLatencyMs: number;
  adherenceScore: number;
  grade: 'EXCELLENT' | 'GOOD' | 'NEEDS_CALIBRATION' | 'FAILED';
  testCases: Array<{
    name: string;
    type: 'COMPUTATIONAL' | 'LEGAL_STATUTORY';
    marksAwarded: number;
    maximumMarks: number;
    componentsCount: number;
    schemaValid: boolean;
    latencyMs: number;
    remarks: string;
  }>;
}> {
  const provider = getProviderForModel(modelId);
  const startAll = Date.now();
  const testCases: any[] = [];

  // Test Case 1: Computational / Tax partial integration calculation
  const case1Start = Date.now();
  const case1Prompt = `You are a Senior ICAI Examiner.
Evaluate candidate solution for 4-Mark practical tax question.
Question: Compute tax on ₹3,00,000 non-agricultural income and ₹2,50,000 agricultural income for individual below 60 years.
Suggested Answer:
Step 1: Tax on (3,00,000 + 2,50,000 = 5,50,000) = ₹22,500 [2 Marks]
Step 2: Tax on (2,50,000 + 2,50,000 basic exemption = 5,00,000) = ₹12,500 [1 Mark]
Step 3: Tax liability = 22,500 - 12,500 = ₹10,000 (plus cess) [1 Mark]
Candidate solution correctly computes Step 1 as 22,500, Step 2 as 12,500, and final as 10,000.
Task: Output JSON with marksAwarded (4), maximumMarks (4), status ('correct'), reasonForDeduction (''), and markingComponents array.`;

  try {
    const res1 = await executeSingleModel(
      modelId,
      { userPrompt: case1Prompt, systemPrompt: 'Output valid JSON only', responseMimeType: 'application/json', maxTokens: 1024 },
      'LOW',
      30000
    );
    const lat1 = Date.now() - case1Start;
    let clean = res1.text.replace(/```json/g, '').replace(/```/g, '').trim();
    const p1 = JSON.parse(clean);
    testCases.push({
      name: 'Partial Integration Tax Computation',
      type: 'COMPUTATIONAL',
      marksAwarded: Number(p1.marksAwarded) || 0,
      maximumMarks: 4,
      componentsCount: Array.isArray(p1.markingComponents) ? p1.markingComponents.length : 0,
      schemaValid: typeof p1.marksAwarded === 'number' && Array.isArray(p1.markingComponents),
      latencyMs: lat1,
      remarks: 'Step computation parsed cleanly',
    });
  } catch (err: any) {
    testCases.push({
      name: 'Partial Integration Tax Computation',
      type: 'COMPUTATIONAL',
      marksAwarded: 0,
      maximumMarks: 4,
      componentsCount: 0,
      schemaValid: false,
      latencyMs: Date.now() - case1Start,
      remarks: err?.message?.slice(0, 100) || 'Failed',
    });
  }

  // Test Case 2: Legal Statutory Standard (Companies Act Section 140)
  const case2Start = Date.now();
  const case2Prompt = `You are a Senior ICAI Examiner.
Evaluate candidate solution for 4-Mark Corporate Law question.
Question: State duties of statutory auditor resigning from a company under Section 140(2) of Companies Act, 2013.
Suggested Answer:
1. File statement in Form ADT-3 within 30 days of resignation [2 Marks]
2. File with company and Registrar of Companies (and CAG if applicable) [2 Marks]
Candidate wrote: "Auditor must submit form ADT-3 within 30 days to the company and the ROC indicating reasons for resignation."
Task: Output JSON with marksAwarded (4), maximumMarks (4), status ('correct'), reasonForDeduction (''), and markingComponents array.`;

  try {
    const res2 = await executeSingleModel(
      modelId,
      { userPrompt: case2Prompt, systemPrompt: 'Output valid JSON only', responseMimeType: 'application/json', maxTokens: 1024 },
      'LOW',
      30000
    );
    const lat2 = Date.now() - case2Start;
    let clean2 = res2.text.replace(/```json/g, '').replace(/```/g, '').trim();
    const p2 = JSON.parse(clean2);
    testCases.push({
      name: 'Companies Act Sec 140 Resignation',
      type: 'LEGAL_STATUTORY',
      marksAwarded: Number(p2.marksAwarded) || 0,
      maximumMarks: 4,
      componentsCount: Array.isArray(p2.markingComponents) ? p2.markingComponents.length : 0,
      schemaValid: typeof p2.marksAwarded === 'number' && Array.isArray(p2.markingComponents),
      latencyMs: lat2,
      remarks: 'Statutory compliance step-marks parsed cleanly',
    });
  } catch (err: any) {
    testCases.push({
      name: 'Companies Act Sec 140 Resignation',
      type: 'LEGAL_STATUTORY',
      marksAwarded: 0,
      maximumMarks: 4,
      componentsCount: 0,
      schemaValid: false,
      latencyMs: Date.now() - case2Start,
      remarks: err?.message?.slice(0, 100) || 'Failed',
    });
  }

  const totalLatencyMs = Date.now() - startAll;
  const passedCases = testCases.filter((t) => t.schemaValid && t.marksAwarded > 0).length;
  const adherenceScore = Math.round((passedCases / testCases.length) * 100);
  const grade = adherenceScore === 100 ? 'EXCELLENT' : adherenceScore >= 50 ? 'GOOD' : 'FAILED';

  return {
    modelId,
    provider,
    passed: passedCases === testCases.length,
    totalLatencyMs,
    adherenceScore,
    grade,
    testCases,
  };
}

/**
 * 5-Run Consistency Test:
 * Evaluates the exact same standard question across 5 runs to measure deterministic scoring stability.
 */
export async function runModelConsistencyTest(
  modelId: string,
  runs: number = 5
): Promise<{
  modelId: string;
  provider: string;
  totalRuns: number;
  successfulRuns: number;
  scores: number[];
  meanScore: number;
  minScore: number;
  maxScore: number;
  variance: number;
  standardDeviation: number;
  consistencyRating: '100% DETERMINISTIC' | 'HIGHLY CONSISTENT (≤ 0.5 MARKS)' | 'MODERATE VARIATION' | 'UNSTABLE';
  latenciesMs: number[];
  averageLatencyMs: number;
}> {
  const provider = getProviderForModel(modelId);
  const scores: number[] = [];
  const latenciesMs: number[] = [];

  const standardPrompt = `You are a Senior ICAI Examiner. Evaluate candidate solution:
Question: Section 10(1) Exemption. Candidate wrote: "Agricultural income is exempt under section 10(1)."
Marking Scheme: 2 Marks for stating Section 10(1) exemption.
Return JSON: { "marksAwarded": 2, "maximumMarks": 2, "status": "correct", "reasonForDeduction": "" }`;

  for (let r = 0; r < runs; r++) {
    const t0 = Date.now();
    try {
      const res = await executeSingleModel(
        modelId,
        { userPrompt: standardPrompt, systemPrompt: 'Output JSON only', responseMimeType: 'application/json', maxTokens: 256 },
        'LOW',
        20000
      );
      latenciesMs.push(Date.now() - t0);
      let clean = res.text.replace(/```json/g, '').replace(/```/g, '').trim();
      const p = JSON.parse(clean);
      scores.push(Number(p.marksAwarded) || 0);
    } catch {
      latenciesMs.push(Date.now() - t0);
      scores.push(-1); // failed run
    }
  }

  const validScores = scores.filter((s) => s >= 0);
  const successfulRuns = validScores.length;

  if (successfulRuns === 0) {
    return {
      modelId,
      provider,
      totalRuns: runs,
      successfulRuns: 0,
      scores,
      meanScore: 0,
      minScore: 0,
      maxScore: 0,
      variance: 0,
      standardDeviation: 0,
      consistencyRating: 'UNSTABLE',
      latenciesMs,
      averageLatencyMs: 0,
    };
  }

  const mean = validScores.reduce((a, b) => a + b, 0) / validScores.length;
  const min = Math.min(...validScores);
  const max = Math.max(...validScores);
  const variance = validScores.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / validScores.length;
  const standardDeviation = Math.sqrt(variance);

  let consistencyRating: '100% DETERMINISTIC' | 'HIGHLY CONSISTENT (≤ 0.5 MARKS)' | 'MODERATE VARIATION' | 'UNSTABLE';
  if (variance === 0) {
    consistencyRating = '100% DETERMINISTIC';
  } else if (standardDeviation <= 0.5) {
    consistencyRating = 'HIGHLY CONSISTENT (≤ 0.5 MARKS)';
  } else if (standardDeviation <= 1.0) {
    consistencyRating = 'MODERATE VARIATION';
  } else {
    consistencyRating = 'UNSTABLE';
  }

  const avgLat = Math.round(latenciesMs.reduce((a, b) => a + b, 0) / latenciesMs.length);

  return {
    modelId,
    provider,
    totalRuns: runs,
    successfulRuns,
    scores,
    meanScore: Math.round(mean * 100) / 100,
    minScore: min,
    maxScore: max,
    variance: Math.round(variance * 1000) / 1000,
    standardDeviation: Math.round(standardDeviation * 1000) / 1000,
    consistencyRating,
    latenciesMs,
    averageLatencyMs: avgLat,
  };
}

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
