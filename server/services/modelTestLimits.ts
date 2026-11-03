/**
 * Model Test Paper numbering varies by CA course:
 * Foundation has 10 ICAI models; Intermediate and Final retain 8.
 */
export const DEFAULT_MODEL_TEST_MAX_NUMBER = 8;
export const FOUNDATION_MODEL_TEST_MAX_NUMBER = 10;

export function getMaxModelTestNumberForLevel(level: unknown): number {
  const normalized = String(level || '').trim().toUpperCase();
  return normalized === 'FOUNDATION'
    ? FOUNDATION_MODEL_TEST_MAX_NUMBER
    : DEFAULT_MODEL_TEST_MAX_NUMBER;
}

export function isValidModelTestNumber(modelTestNumber: unknown, level: unknown): boolean {
  const number = Number(modelTestNumber);
  return Number.isInteger(number) && number >= 1 && number <= getMaxModelTestNumberForLevel(level);
}
