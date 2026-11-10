/**
 * Distinguishes a task-specific structured-output rejection from an actual
 * model/provider outage. A single question's invalid rubric JSON must not put
 * an otherwise responsive model into a global cooldown for subsequent questions.
 */
export function isTaskSpecificOutputValidationFailure(message: unknown): boolean {
  const normalized = String(message || '').toLowerCase();
  const hasOutputValidationFailure = normalized.includes('model_output_validation_failed');
  const isProviderOutputIncomplete =
    normalized.includes('openai_output_truncated') ||
    normalized.includes('openai_output_incomplete') ||
    normalized.includes('openai_empty_output');
  return hasOutputValidationFailure && !isProviderOutputIncomplete;
}

export function isProviderOutputIncompleteFailure(message: unknown): boolean {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('openai_output_truncated') ||
    normalized.includes('openai_output_incomplete') ||
    normalized.includes('openai_empty_output');
}
