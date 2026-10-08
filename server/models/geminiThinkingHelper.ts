/**
 * Centralized Gemini 3.x Thinking Level & Config Compatibility Helper
 *
 * MIGRATION SPECIFICATION:
 * - Deprecated parameters REMOVED: temperature, top_p, topP, top_k, topK, thinking_budget, thinkingBudget
 * - Replaced with: thinkingConfig.thinkingLevel (compatible with @google/genai SDK v2.4.0)
 * - Model-specific thinking level validation:
 *     gemini-3.8-flash: low, medium, high (NEVER minimal)
 *     gemini-3.7-flash: low, medium, high
 *     gemini-3.6-flash: minimal, low, medium, high
 *     gemini-3.1-flash-lite: minimal, low, medium, high (default: low for latency)
 *     gemini-3.1-pro-preview: low, medium, high
 *     gemini-flash-latest: low, medium, high
 *     gemini-3.5-flash: low, medium, high
 */

export type GeminiThinkingLevel = 'low' | 'medium' | 'high' | 'minimal';

/**
 * Map of approved/supported Gemini models to their supported thinking levels.
 */
const MODEL_SUPPORTED_THINKING_LEVELS: Record<string, GeminiThinkingLevel[]> = {
  'gemini-3.8-flash': ['low', 'medium', 'high'], // IMPORTANT: 'minimal' is strictly prohibited
  'gemini-3.7-flash': ['low', 'medium', 'high'],
  'gemini-3.6-flash': ['minimal', 'low', 'medium', 'high'],
  'gemini-3.1-flash-lite': ['minimal', 'low', 'medium', 'high'],
  'gemini-3.1-pro-preview': ['low', 'medium', 'high'],
  'gemini-flash-latest': ['low', 'medium', 'high'],
  'gemini-3.5-flash': ['low', 'medium', 'high'],
};

/**
 * Returns the list of supported thinking levels for a given Gemini model.
 */
export function getSupportedThinkingLevels(model: string): GeminiThinkingLevel[] {
  const normalizedModel = (model || '').trim().toLowerCase();
  if (MODEL_SUPPORTED_THINKING_LEVELS[normalizedModel]) {
    return [...MODEL_SUPPORTED_THINKING_LEVELS[normalizedModel]];
  }

  // Model family matching
  if (normalizedModel.includes('3.8')) {
    return ['low', 'medium', 'high'];
  }
  if (normalizedModel.includes('3.7')) {
    return ['low', 'medium', 'high'];
  }
  if (normalizedModel.includes('3.6')) {
    return ['minimal', 'low', 'medium', 'high'];
  }
  if (normalizedModel.includes('flash-lite')) {
    return ['minimal', 'low', 'medium', 'high'];
  }
  if (normalizedModel.includes('gemini-3.')) {
    return ['low', 'medium', 'high'];
  }

  // Default fallback for Gemini 3.x Flash series
  return ['low', 'medium', 'high'];
}

/**
 * Validates and returns the appropriate supported thinking level for a specific model.
 *
 * Rules:
 * 1. For gemini-3.8-flash: ONLY 'low', 'medium', 'high'. NEVER 'minimal'.
 *    If 'minimal' is requested, it safely maps to 'low'.
 * 2. If 'xhigh' or 'XHIGH' is requested, maps to 'high'.
 * 3. If requested level is supported by the model, returns it (in lowercase).
 * 4. If requested level is NOT supported, returns the closest safe supported level.
 * 5. If no level is requested, returns the recommended default for that model:
 *    - gemini-3.1-flash-lite -> 'low' (to minimize latency)
 *    - gemini-3.8-flash -> 'high' (for deep CA answer evaluation)
 *    - others -> 'medium'
 */
export function getSupportedThinkingLevel(
  model: string,
  requestedLevel?: string | null
): GeminiThinkingLevel {
  const supported = getSupportedThinkingLevels(model);
  const normalizedModel = (model || '').trim().toLowerCase();

  // Normalize requested level string
  let raw = (requestedLevel || '').trim().toLowerCase();
  if (raw === 'xhigh') {
    raw = 'high';
  }

  // Specific rule for gemini-3.8-flash: NEVER use minimal
  if (normalizedModel.includes('3.8') && raw === 'minimal') {
    return 'low';
  }

  // If a valid level was provided and is supported by this model
  if (raw && (supported as string[]).includes(raw)) {
    return raw as GeminiThinkingLevel;
  }

  // If unsupported level requested, find safe fallback
  if (raw) {
    if (raw === 'minimal') {
      return supported.includes('low') ? 'low' : supported[0];
    }
    if (raw === 'high') {
      return supported.includes('medium') ? 'medium' : supported[0];
    }
    return supported[0] || 'low';
  }

  // Default selection based on model role
  if (normalizedModel.includes('flash-lite')) {
    return 'low';
  }
  if (normalizedModel.includes('3.8')) {
    return 'high';
  }
  if (normalizedModel.includes('pro')) {
    return 'high';
  }
  return 'medium';
}

/**
 * Builds a Gemini SDK-compatible thinkingConfig object with verified supported level.
 * Note: @google/genai SDK accepts thinkingConfig: { thinkingLevel: 'low' | 'medium' | 'high' }
 */
export function buildGeminiThinkingConfig(
  model: string,
  requestedLevel?: string | null
): { thinkingLevel: GeminiThinkingLevel } {
  const level = getSupportedThinkingLevel(model, requestedLevel);
  return {
    thinkingLevel: level,
  };
}

/**
 * Sanitizes any Gemini request configuration object:
 * 1. Permanently REMOVES deprecated parameters:
 *    - temperature
 *    - top_p / topP
 *    - top_k / topK
 *    - thinking_budget / thinkingBudget
 * 2. Normalizes thinking configuration to thinkingConfig.thinkingLevel for the target model.
 * 3. Never mutates the input object.
 */
export function sanitizeGeminiConfig(rawConfig?: any, model?: string): any {
  if (!rawConfig || typeof rawConfig !== 'object') {
    if (model) {
      return {
        thinkingConfig: buildGeminiThinkingConfig(model),
      };
    }
    return {};
  }

  // Create a shallow copy to prevent caller mutation
  const sanitized: Record<string, any> = { ...rawConfig };

  // 1. Remove deprecated sampling parameters unconditionally
  delete sanitized.temperature;
  delete sanitized.top_p;
  delete sanitized.topP;
  delete sanitized.top_k;
  delete sanitized.topK;

  // 2. Remove deprecated budget parameters unconditionally
  delete sanitized.thinking_budget;
  delete sanitized.thinkingBudget;

  // 3. Handle root-level thinking_level or thinkingLevel if passed
  const rootThinkingLevel = sanitized.thinking_level || sanitized.thinkingLevel;
  delete sanitized.thinking_level;

  // 4. Handle thinkingConfig
  let currentThinkingLevel = rootThinkingLevel;
  if (sanitized.thinkingConfig && typeof sanitized.thinkingConfig === 'object') {
    // Clone thinkingConfig
    const tc = { ...sanitized.thinkingConfig };
    delete tc.thinking_budget;
    delete tc.thinkingBudget;

    if (tc.thinking_level) {
      currentThinkingLevel = tc.thinking_level;
      delete tc.thinking_level;
    }
    if (tc.thinkingLevel) {
      currentThinkingLevel = tc.thinkingLevel;
    }
    sanitized.thinkingConfig = tc;
  }

  // 5. If model is known, ensure thinkingConfig has a valid supported level
  if (model) {
    const validLevel = getSupportedThinkingLevel(model, currentThinkingLevel);
    sanitized.thinkingConfig = {
      ...(sanitized.thinkingConfig || {}),
      thinkingLevel: validLevel,
    };
  } else if (currentThinkingLevel) {
    // If no model passed but level was requested, normalize to lowercase
    const normalized = String(currentThinkingLevel).toLowerCase();
    sanitized.thinkingConfig = {
      ...(sanitized.thinkingConfig || {}),
      thinkingLevel: normalized === 'minimal' ? 'low' : normalized === 'xhigh' ? 'high' : normalized,
    };
  }

  return sanitized;
}
