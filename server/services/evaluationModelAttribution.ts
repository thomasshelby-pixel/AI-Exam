import type { QuestionEvaluation } from '../../src/types/index.js';

export interface EvaluationModelAttribution {
  modelUsed: string;
  modelDisplayName: string;
  modelProvider: string;
  fallbackOccurred: boolean;
  fallbackReason?: string;
}

/**
 * Aggregate the actual per-question provider execution metadata for an
 * authoritative PDF evaluation. A question may use a different provider after
 * fallback, so a hard-coded top-level provider label is inaccurate.
 */
export function deriveEvaluationModelAttribution(
  questions: readonly Pick<QuestionEvaluation, 'modelUsed' | 'modelProvider' | 'fallbackOccurred' | 'fallbackReason'>[]
): EvaluationModelAttribution {
  const unique = (values: Array<string | undefined>): string[] => {
    const seen = new Set<string>();
    for (const value of values) {
      const normalized = String(value || '').trim();
      if (normalized) seen.add(normalized);
    }
    return [...seen];
  };

  const models = unique(questions.map((question) => question.modelUsed));
  const providers = unique(questions.map((question) => question.modelProvider).map((value) => value?.toLowerCase()));
  const fallbackReasons = unique(questions.map((question) => question.fallbackReason));
  const fallbackOccurred = questions.some((question) => question.fallbackOccurred === true);

  const modelUsed = models.length === 0
    ? 'deterministic'
    : models.length === 1
      ? models[0]
      : `multi-model (${models.join(', ')})`;

  const modelProvider = providers.length === 0
    ? 'deterministic'
    : providers.length === 1
      ? providers[0]
      : `multi-provider (${providers.join(' + ')})`;

  return {
    modelUsed,
    modelDisplayName: modelUsed === 'deterministic' ? 'Deterministic Evaluation' : modelUsed,
    modelProvider,
    fallbackOccurred,
    ...(fallbackReasons.length > 0 ? { fallbackReason: fallbackReasons.join(' | ') } : {}),
  };
}
