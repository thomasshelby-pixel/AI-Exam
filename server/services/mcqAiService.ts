import crypto from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';
import { ExtractedQuestionDraft } from './mcqDeterministicParser.js';

/**
 * ============================================================================
 * MCQ ARENA DEDICATED AI SERVICE (SERVER-SIDE ONLY)
 * ============================================================================
 *
 * ARCHITECTURAL ISOLATION CONTRACT:
 * 1. MCQ Arena uses its own dedicated Google AI Studio / Google Cloud project.
 * 2. Uses ONLY process.env.MCQ_GEMINI_API_KEY.
 * 3. NEVER imports or reuses Checker's GEMINI_API_KEY or server/gemini.ts.
 * 4. Model configurable via process.env.MCQ_AI_MODEL (default: gemini-3.1-flash-lite).
 * 5. Low-cost assistance ONLY for:
 *    - Unresolved question/option structure
 *    - Source answer mapping assistance
 *    - Drafting explanations when source explanation is missing
 * 6. Core extraction is 100% deterministic first; AI is strictly opt-in/fallback.
 * 7. Official source answers and existing explanations are NEVER overridden by AI.
 * 8. All AI drafts are tagged with explanationSource = 'AI_GENERATED_DRAFT'
 *    and require Admin review before publishing.
 * 9. Rate limit & cost safeguards:
 *    - Bounded batches (MCQ_AI_MAX_BATCH_SIZE)
 *    - Job budget (MCQ_AI_MAX_QUESTIONS_PER_JOB)
 *    - Deterministic request caching (in-memory hash)
 *    - Bounded exponential backoff retry for 429 / transient 5xx
 *    - Quota exhaustion never crashes the upload job (graceful NEEDS_REVIEW fallback)
 * ============================================================================
 */

export interface McqAiStatusResponse {
  configured: boolean;
  checkerAiUntouched: boolean;
  model: string;
  isServerSideOnly: boolean;
  maxQuestionsPerJob: number;
  maxBatchSize: number;
  maxRetries: number;
  timeoutMs: number;
}

export interface McqAiAuditMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokensUsed: number;
  taskCounts: {
    EXTRACT_UNRESOLVED_STRUCTURE: number;
    MAP_SOURCE_ANSWER: number;
    GENERATE_EXPLANATION: number;
  };
  cacheHits: number;
}

// In-memory cache for deterministic hashing
const aiResultCache = new Map<string, any>();

// Audit Metrics (server-side runtime telemetry for Admin)
const auditMetrics: McqAiAuditMetrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalTokensUsed: 0,
  taskCounts: {
    EXTRACT_UNRESOLVED_STRUCTURE: 0,
    MAP_SOURCE_ANSWER: 0,
    GENERATE_EXPLANATION: 0,
  },
  cacheHits: 0,
};

// MCQ Arena Client Singleton (isolated from Checker)
let mcqAiClient: GoogleGenAI | null = null;

export function getMcqAiModel(): string {
  return process.env.MCQ_AI_MODEL?.trim() || 'gemini-3.1-flash-lite';
}

export function isMcqAiConfigured(): boolean {
  return Boolean(process.env.MCQ_GEMINI_API_KEY && process.env.MCQ_GEMINI_API_KEY.trim().length > 0);
}

export function getMcqGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.MCQ_GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  if (!mcqAiClient) {
    mcqAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'mcq-arena-ai-assistance',
        },
      },
    });
  }
  return mcqAiClient;
}

export function getMcqAiStatus(): McqAiStatusResponse {
  const configured = isMcqAiConfigured();
  return {
    configured,
    checkerAiUntouched: true, // Checker project & config untouched
    model: getMcqAiModel(),
    isServerSideOnly: true,
    maxQuestionsPerJob: parseInt(process.env.MCQ_AI_MAX_QUESTIONS_PER_JOB || '50', 10),
    maxBatchSize: parseInt(process.env.MCQ_AI_MAX_BATCH_SIZE || '20', 10),
    maxRetries: parseInt(process.env.MCQ_AI_MAX_RETRIES || '2', 10),
    timeoutMs: parseInt(process.env.MCQ_AI_TIMEOUT_MS || '30000', 10),
  };
}

export function getMcqAiAuditMetrics(): McqAiAuditMetrics {
  return { ...auditMetrics };
}

/**
 * Deterministic hash for caching AI calls.
 * Changes to taskType, model, candidate text, or context immediately invalidate the cache.
 */
function computeCacheKey(taskType: string, model: string, payload: any): string {
  const serialized = JSON.stringify({ taskType, model, payload });
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

/**
 * Executes a Gemini request with bounded retries and exponential backoff for transient 429/5xx.
 * Gracefully falls back if quota or model is unavailable.
 */
async function callMcqGeminiWithRetry(
  ai: GoogleGenAI,
  model: string,
  params: any,
  maxRetries = 2
): Promise<any> {
  let attempt = 0;
  let delay = 500;

  while (attempt <= maxRetries) {
    try {
      auditMetrics.totalRequests++;
      const response = await ai.models.generateContent({
        model,
        ...params,
      });
      auditMetrics.successfulRequests++;
      return response;
    } catch (err: any) {
      attempt++;
      const isTransient =
        err?.status === 429 ||
        err?.status === 503 ||
        err?.message?.includes('429') ||
        err?.message?.includes('RESOURCE_EXHAUSTED') ||
        err?.message?.includes('quota') ||
        err?.message?.includes('temporarily unavailable');

      if (isTransient && attempt <= maxRetries) {
        console.warn(`[MCQ AI] Transient error (${err?.message || err}). Retrying in ${delay}ms (Attempt ${attempt}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        auditMetrics.failedRequests++;
        console.warn(`[MCQ AI] Request failed after ${attempt} attempts: ${err?.message || err}. Gracefully falling back to Needs Review.`);
        return null;
      }
    }
  }
  return null;
}

/**
 * Task A: EXTRACT_UNRESOLVED_STRUCTURE
 * Extracts question body and 4 options from raw text snippets that failed deterministic option parsing.
 */
export async function assistUnresolvedStructure(
  unresolvedSnippets: Array<{ candidateId: string; rawSnippet: string }>
): Promise<Array<{
  candidateId: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer?: 'A' | 'B' | 'C' | 'D' | '';
  explanation?: string;
}>> {
  if (!unresolvedSnippets || unresolvedSnippets.length === 0) return [];

  const ai = getMcqGeminiClient();
  const model = getMcqAiModel();
  if (!ai) {
    return [];
  }

  auditMetrics.taskCounts.EXTRACT_UNRESOLVED_STRUCTURE += unresolvedSnippets.length;

  const results: Array<{
    candidateId: string;
    questionText: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    correctAnswer?: 'A' | 'B' | 'C' | 'D' | '';
    explanation?: string;
  }> = [];

  const unCachedItems: Array<{ candidateId: string; rawSnippet: string }> = [];

  for (const item of unresolvedSnippets) {
    const key = computeCacheKey('EXTRACT_UNRESOLVED_STRUCTURE', model, item);
    if (aiResultCache.has(key)) {
      auditMetrics.cacheHits++;
      results.push(aiResultCache.get(key));
    } else {
      unCachedItems.push(item);
    }
  }

  if (unCachedItems.length === 0) {
    return results;
  }

  const prompt = `You are an expert CA examination question structuring engine.
Given the following raw question snippet(s) from official ICAI study materials or mock test papers that could not be cleanly partitioned by the local rule-based parser:
Extract each into a clean question body and four distinct options (A, B, C, D).
Strict Rules:
1. Preserve the exact meaning of the question and options.
2. If options are present in the text, partition them into optionA, optionB, optionC, optionD.
3. If an explicit answer is mentioned (e.g., Answer: B or Ans: (c)), normalize to 'A', 'B', 'C', or 'D'. If not explicitly stated, leave correctAnswer as empty string (""). NEVER guess the answer.
4. If an explanation is present in the snippet, capture it in explanation. If absent, leave explanation as empty string (""). NEVER fabricate an explanation or invent sections/rules.
5. Return strictly valid JSON adhering to the specified schema.

Input Snippets:
${JSON.stringify(unCachedItems, null, 2)}`;

  const response = await callMcqGeminiWithRetry(ai, model, {
    contents: prompt,
    config: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                candidateId: { type: Type.STRING },
                questionText: { type: Type.STRING },
                optionA: { type: Type.STRING },
                optionB: { type: Type.STRING },
                optionC: { type: Type.STRING },
                optionD: { type: Type.STRING },
                correctAnswer: { type: Type.STRING, enum: ['A', 'B', 'C', 'D', ''] },
                explanation: { type: Type.STRING },
              },
              required: ['candidateId', 'questionText', 'optionA', 'optionB', 'optionC', 'optionD'],
            },
          },
        },
        required: ['questions'],
      },
    },
  });

  if (response && response.text) {
    try {
      const parsed = JSON.parse(response.text);
      if (Array.isArray(parsed.questions)) {
        for (const q of parsed.questions) {
          if (q.questionText && q.optionA && q.optionB) {
            const entry = {
              candidateId: q.candidateId,
              questionText: q.questionText.trim(),
              optionA: q.optionA.trim(),
              optionB: q.optionB.trim(),
              optionC: (q.optionC || 'None of the above').trim(),
              optionD: (q.optionD || 'All of the above').trim(),
              correctAnswer: (['A', 'B', 'C', 'D'].includes(q.correctAnswer) ? q.correctAnswer : '') as any,
              explanation: q.explanation?.trim() || '',
            };
            results.push(entry);
            const key = computeCacheKey('EXTRACT_UNRESOLVED_STRUCTURE', model, {
              candidateId: q.candidateId,
              rawSnippet: unCachedItems.find((u) => u.candidateId === q.candidateId)?.rawSnippet,
            });
            aiResultCache.set(key, entry);
          }
        }
      }
    } catch (parseErr) {
      console.warn('[MCQ AI] Failed to parse JSON response for unresolved structure:', parseErr);
    }
  }

  return results;
}

/**
 * Task B: MAP_SOURCE_ANSWER
 * When source answer is present in document text / answer key section but unmapped deterministically.
 * AI assists ONLY in locating and mapping the official source answer. Never guesses if missing.
 */
export async function assistSourceAnswerMapping(
  items: Array<{
    candidateId: string;
    questionText: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    sourceContext: string;
  }>
): Promise<Array<{
  candidateId: string;
  mappedAnswer: 'A' | 'B' | 'C' | 'D' | '';
  sourceFound: boolean;
  explanationSnippet?: string;
}>> {
  if (!items || items.length === 0) return [];

  const ai = getMcqGeminiClient();
  const model = getMcqAiModel();
  if (!ai) return [];

  auditMetrics.taskCounts.MAP_SOURCE_ANSWER += items.length;

  const results: Array<{
    candidateId: string;
    mappedAnswer: 'A' | 'B' | 'C' | 'D' | '';
    sourceFound: boolean;
    explanationSnippet?: string;
  }> = [];

  const unCachedItems: typeof items = [];

  for (const item of items) {
    const key = computeCacheKey('MAP_SOURCE_ANSWER', model, item);
    if (aiResultCache.has(key)) {
      auditMetrics.cacheHits++;
      results.push(aiResultCache.get(key));
    } else {
      unCachedItems.push(item);
    }
  }

  if (unCachedItems.length === 0) {
    return results;
  }

  const prompt = `You are an authoritative ICAI examination answer mapper.
Your sole job is to locate the OFFICIAL source answer from the provided source context for each question candidate.
Strict Rules:
1. ONLY map the answer if the source context explicitly indicates the answer (e.g. "1. (b)", "Answer: C", "Correct Option is (a)").
2. Normalize the answer to 'A', 'B', 'C', or 'D'.
3. If the answer is NOT explicitly present or is ambiguous in the source context:
   - Set mappedAnswer to "" (empty string).
   - Set sourceFound to false.
   - DO NOT GUESS THE ANSWER UNDER ANY CIRCUMSTANCES.
4. If a source explanation or reasoning is present in the context, extract it into explanationSnippet.

Items to map:
${JSON.stringify(unCachedItems, null, 2)}`;

  const response = await callMcqGeminiWithRetry(ai, model, {
    contents: prompt,
    config: {
      temperature: 0.0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          mappings: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                candidateId: { type: Type.STRING },
                mappedAnswer: { type: Type.STRING, enum: ['A', 'B', 'C', 'D', ''] },
                sourceFound: { type: Type.BOOLEAN },
                explanationSnippet: { type: Type.STRING },
              },
              required: ['candidateId', 'mappedAnswer', 'sourceFound'],
            },
          },
        },
        required: ['mappings'],
      },
    },
  });

  if (response && response.text) {
    try {
      const parsed = JSON.parse(response.text);
      if (Array.isArray(parsed.mappings)) {
        for (const m of parsed.mappings) {
          const entry = {
            candidateId: m.candidateId,
            mappedAnswer: (['A', 'B', 'C', 'D'].includes(m.mappedAnswer) ? m.mappedAnswer : '') as any,
            sourceFound: Boolean(m.sourceFound && ['A', 'B', 'C', 'D'].includes(m.mappedAnswer)),
            explanationSnippet: m.explanationSnippet?.trim() || '',
          };
          results.push(entry);
          const key = computeCacheKey(
            'MAP_SOURCE_ANSWER',
            model,
            unCachedItems.find((u) => u.candidateId === m.candidateId)
          );
          aiResultCache.set(key, entry);
        }
      }
    } catch (parseErr) {
      console.warn('[MCQ AI] Failed to parse JSON response for source answer mapping:', parseErr);
    }
  }

  return results;
}

/**
 * Task C: GENERATE_EXPLANATION
 * When source explanation is genuinely missing and the question has a verified answer:
 * Generates an explanation draft.
 * Rules:
 * - Directly explains why the verified answer is correct.
 * - Shows calculation steps for numerical problems.
 * - Does NOT invent sections, rules, or standards not given.
 * - Marks explanationSource = 'AI_GENERATED_DRAFT', needsReview = true.
 */
export async function assistExplanationDraft(
  items: Array<{
    candidateId: string;
    questionText: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    correctAnswer: 'A' | 'B' | 'C' | 'D';
    subject: string;
    chapter?: string;
  }>
): Promise<Array<{
  candidateId: string;
  explanationDraft: string;
}>> {
  if (!items || items.length === 0) return [];

  const ai = getMcqGeminiClient();
  const model = getMcqAiModel();
  if (!ai) return [];

  auditMetrics.taskCounts.GENERATE_EXPLANATION += items.length;

  const results: Array<{ candidateId: string; explanationDraft: string }> = [];
  const unCachedItems: typeof items = [];

  for (const item of items) {
    const key = computeCacheKey('GENERATE_EXPLANATION', model, item);
    if (aiResultCache.has(key)) {
      auditMetrics.cacheHits++;
      results.push(aiResultCache.get(key));
    } else {
      unCachedItems.push(item);
    }
  }

  if (unCachedItems.length === 0) {
    return results;
  }

  const prompt = `You are an expert CA tutor assisting with drafting concise, educational explanations for CA students.
For each question below, the verified correct answer is already provided.
Your job is to write a clear, accurate explanation draft explaining why that specific option is correct.

Strict Rules:
1. Directly explain the core concept or calculation leading to the verified correct option.
2. For numerical questions, show the step-by-step arithmetic/working.
3. Keep the explanation concise and focused (typically 2-4 sentences or clear calculation steps).
4. DO NOT invent fictitious section numbers, rules, Accounting Standards, Standards on Auditing, case laws, circulars, or dates. Only mention statutory references if they are standard foundational facts (e.g. Section 2(h) of Indian Contract Act for contract definition), otherwise focus on the conceptual rationale.
5. Never state that an option is correct merely by restating it. Explain the underlying reasoning.

Questions:
${JSON.stringify(unCachedItems, null, 2)}`;

  const response = await callMcqGeminiWithRetry(ai, model, {
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          explanations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                candidateId: { type: Type.STRING },
                explanationDraft: { type: Type.STRING },
              },
              required: ['candidateId', 'explanationDraft'],
            },
          },
        },
        required: ['explanations'],
      },
    },
  });

  if (response && response.text) {
    try {
      const parsed = JSON.parse(response.text);
      if (Array.isArray(parsed.explanations)) {
        for (const exp of parsed.explanations) {
          if (exp.explanationDraft && exp.explanationDraft.trim().length > 10) {
            const entry = {
              candidateId: exp.candidateId,
              explanationDraft: exp.explanationDraft.trim(),
            };
            results.push(entry);
            const key = computeCacheKey(
              'GENERATE_EXPLANATION',
              model,
              unCachedItems.find((u) => u.candidateId === exp.candidateId)
            );
            aiResultCache.set(key, entry);
          }
        }
      }
    } catch (parseErr) {
      console.warn('[MCQ AI] Failed to parse JSON response for explanations:', parseErr);
    }
  }

  return results;
}

/**
 * Main Orchestration Function:
 * Runs bounded AI assistance ONLY for unresolved items in a material processing job.
 * Deterministic records and source explanations are NEVER modified.
 */
export async function applyOptionalAiAssistance(params: {
  questions: ExtractedQuestionDraft[];
  rawText: string;
  course: string;
  subject: string;
  enableAi: boolean;
}): Promise<{
  questions: ExtractedQuestionDraft[];
  aiAssistedCount: number;
  sourceExtractedCount: number;
  aiExplanationDraftCount: number;
  aiAuditNotes: string[];
}> {
  const { questions, enableAi, subject } = params;
  const aiAuditNotes: string[] = [];

  let sourceExtractedCount = 0;
  let aiAssistedCount = 0;
  let aiExplanationDraftCount = 0;

  // 1. Audit baseline source counts
  for (const q of questions) {
    if (q.explanation && q.explanation.trim().length > 0) {
      q.explanationSource = 'SOURCE';
      sourceExtractedCount++;
    } else {
      q.explanationSource = 'MISSING';
    }

    if (q.correctAnswer && ['A', 'B', 'C', 'D'].includes(q.correctAnswer)) {
      q.answerSource = 'SOURCE';
    } else {
      q.answerSource = 'MISSING';
    }
  }

  // If AI assistance is not requested, return 100% deterministic result
  if (!enableAi) {
    return {
      questions,
      aiAssistedCount: 0,
      sourceExtractedCount,
      aiExplanationDraftCount: 0,
      aiAuditNotes: ['100% Rule-Based Processing: AI Assistance disabled by Admin.'],
    };
  }

  // Check if MCQ AI key is configured
  if (!isMcqAiConfigured()) {
    aiAuditNotes.push(
      'MCQ AI is not configured (MCQ_GEMINI_API_KEY unset). Retaining 100% deterministic extraction.'
    );
    return {
      questions,
      aiAssistedCount: 0,
      sourceExtractedCount,
      aiExplanationDraftCount: 0,
      aiAuditNotes,
    };
  }

  const maxQuestions = parseInt(process.env.MCQ_AI_MAX_QUESTIONS_PER_JOB || '50', 10);
  const maxBatchSize = parseInt(process.env.MCQ_AI_MAX_BATCH_SIZE || '20', 10);

  // 2. Identify candidates needing explanation drafts (where verified answer exists, but explanation is missing)
  const missingExplanationCandidates = questions.filter(
    (q) =>
      q.correctAnswer &&
      ['A', 'B', 'C', 'D'].includes(q.correctAnswer) &&
      (!q.explanation || q.explanation.trim().length === 0 || q.explanationSource === 'MISSING')
  );

  if (missingExplanationCandidates.length > 0) {
    const toProcess = missingExplanationCandidates.slice(0, maxQuestions);
    aiAuditNotes.push(
      `Generating explanation drafts for ${toProcess.length} questions with verified answers but missing source explanations (Batch size: ${maxBatchSize}, Budget limit: ${maxQuestions}).`
    );

    // Process in bounded batches
    for (let i = 0; i < toProcess.length; i += maxBatchSize) {
      const chunk = toProcess.slice(i, i + maxBatchSize);
      const drafts = await assistExplanationDraft(
        chunk.map((c) => ({
          candidateId: c.id,
          questionText: c.questionText,
          optionA: c.optionA,
          optionB: c.optionB,
          optionC: c.optionC,
          optionD: c.optionD,
          correctAnswer: c.correctAnswer as 'A' | 'B' | 'C' | 'D',
          subject,
          chapter: c.chapter,
        }))
      );

      for (const draft of drafts) {
        const target = questions.find((q) => q.id === draft.candidateId);
        if (target && draft.explanationDraft) {
          target.explanation = draft.explanationDraft;
          target.explanationSource = 'AI_GENERATED_DRAFT';
          target.needsReview = true; // Admin review strictly required before publishing!
          target.aiAssisted = true;
          if (!target.reviewReason) {
            target.reviewReason = 'AI explanation draft generated; requires Admin review.';
          } else if (!target.reviewReason.includes('AI explanation draft')) {
            target.reviewReason += ' (AI explanation draft generated)';
          }
          aiExplanationDraftCount++;
          aiAssistedCount++;
        }
      }
    }
  }

  return {
    questions,
    aiAssistedCount,
    sourceExtractedCount,
    aiExplanationDraftCount,
    aiAuditNotes,
  };
}
