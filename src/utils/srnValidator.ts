/**
 * ICAI Student Registration Number (SRN) Validation Utility
 *
 * ICAI SRN Structure:
 * - Regional prefix: NRO, SRO, ERO, WRO, CRO (3 uppercase letters)
 * - 7-digit Student Registration Number starting with 0
 * - Complete length: exactly 10 characters
 * - Regex: /^(NRO|SRO|ERO|WRO|CRO)0[0-9]{6}$/
 *
 * NOTE ON VERIFICATION:
 * Passing this validation means the SRN is *structurally format-valid*.
 * CA Exam Checker AI does not claim or simulate official live verification
 * with ICAI SSP systems without an official ICAI integration.
 */

export const VALID_ICAI_REGIONS = ['NRO', 'SRO', 'ERO', 'WRO', 'CRO'] as const;
export type IcaiRegion = typeof VALID_ICAI_REGIONS[number];

export const ICAI_DISCLAIMER =
  'Format validation confirms structural compliance only. CA Exam Checker AI does not claim official verification with ICAI SSP records. Enter your Student Registration Number exactly as recorded in your ICAI SSP records.';

export type SrnErrorCode =
  | 'EMPTY_SRN'
  | 'INVALID_LENGTH'
  | 'INVALID_REGION'
  | 'FIRST_DIGIT_NOT_ZERO'
  | 'DIGIT_LENGTH_MISMATCH'
  | 'NON_DIGIT_CHARACTERS'
  | 'DUMMY_PLACEHOLDER'
  | 'INVALID_FORMAT';

export interface SrnValidationResult {
  isValid: boolean;
  normalized: string;
  error?: string;
  code?: SrnErrorCode;
  region?: IcaiRegion;
  digits?: string;
  statusText?: string;
}

/**
 * Normalizes an SRN:
 * - Trims leading and trailing whitespace
 * - Converts alphabetic prefix to uppercase
 * - Leaves student digits unaltered
 */
export function normalizeSrn(input: string | null | undefined): string {
  if (!input) return '';
  return input.trim().toUpperCase();
}

/**
 * Checks if 7-digit numeric portion is an obvious dummy/placeholder:
 * - All zeros: '0000000'
 * - Repeated identical digits after leading 0: '0111111', '0222222', ..., '0999999'
 * - Repeated identical digits throughout
 */
function isDummyOrRepeatedDigits(numericPortion: string): boolean {
  if (numericPortion === '0000000') return true;
  // If the 6 digits after leading 0 are all identical, it is an obvious non-real dummy value
  const remainingDigits = numericPortion.slice(1);
  if (/^(\d)\1{5}$/.test(remainingDigits)) return true;
  return false;
}

/**
 * Validates whether an SRN strictly conforms to the ICAI 10-character format:
 * - Must start with NRO, SRO, ERO, WRO, or CRO
 * - Must be followed by 7 digits
 * - The first digit of the 7 digits must be '0'
 * - Obvious dummy/placeholder and repeated-digit values are rejected
 */
export function validateSrn(input: string | null | undefined): SrnValidationResult {
  if (!input || typeof input !== 'string' || input.trim() === '') {
    return {
      isValid: false,
      normalized: '',
      error: 'Student Registration Number is required.',
      code: 'EMPTY_SRN',
    };
  }

  const normalized = normalizeSrn(input);
  const MALFORMED_ERROR = 'Enter a valid ICAI Student Registration Number in the required format.';

  // Check overall length
  if (normalized.length !== 10) {
    const isPrefixCandidate = VALID_ICAI_REGIONS.some((r) => normalized.startsWith(r));
    return {
      isValid: false,
      normalized,
      error: MALFORMED_ERROR,
      code: isPrefixCandidate ? 'DIGIT_LENGTH_MISMATCH' : 'INVALID_LENGTH',
    };
  }

  const prefix = normalized.substring(0, 3) as IcaiRegion;
  if (!VALID_ICAI_REGIONS.includes(prefix)) {
    return {
      isValid: false,
      normalized,
      error: MALFORMED_ERROR,
      code: 'INVALID_REGION',
    };
  }

  const numericPortion = normalized.substring(3);
  if (!/^[0-9]+$/.test(numericPortion)) {
    return {
      isValid: false,
      normalized,
      error: MALFORMED_ERROR,
      code: 'NON_DIGIT_CHARACTERS',
    };
  }

  if (numericPortion[0] !== '0') {
    return {
      isValid: false,
      normalized,
      error: MALFORMED_ERROR,
      code: 'FIRST_DIGIT_NOT_ZERO',
    };
  }

  if (numericPortion.length !== 7) {
    return {
      isValid: false,
      normalized,
      error: MALFORMED_ERROR,
      code: 'DIGIT_LENGTH_MISMATCH',
    };
  }

  // Reject all zeros (e.g. CRO0000000, NRO0000000, SRO0000000, ERO0000000, WRO0000000)
  // and repeated dummy digits (e.g. 0111111, 0999999)
  if (isDummyOrRepeatedDigits(numericPortion)) {
    return {
      isValid: false,
      normalized,
      error: MALFORMED_ERROR,
      code: 'DUMMY_PLACEHOLDER',
    };
  }

  return {
    isValid: true,
    normalized,
    region: prefix,
    digits: numericPortion,
    statusText: 'Format valid as per ICAI 10-character standard',
  };
}

/**
 * Parses an input string into its regional prefix and numeric part if applicable
 */
export function parseSrn(input: string | null | undefined): {
  region: IcaiRegion | '';
  digits: string;
} {
  const normalized = normalizeSrn(input);
  if (normalized.length < 3) {
    return { region: '', digits: normalized.replace(/[^0-9]/g, '') };
  }

  const candidatePrefix = normalized.substring(0, 3) as IcaiRegion;
  if (VALID_ICAI_REGIONS.includes(candidatePrefix)) {
    return {
      region: candidatePrefix,
      digits: normalized.substring(3).replace(/[^0-9]/g, '').slice(0, 7),
    };
  }

  return {
    region: '',
    digits: normalized.replace(/[^0-9]/g, '').slice(0, 7),
  };
}

/**
 * Formats an SRN for display without altering digits or shortening
 */
export function formatSrnDisplay(srn: string | null | undefined): string {
  if (!srn || srn === '000' || srn === 'NEW_STUDENT' || srn === 'N/A') {
    return 'REG-PENDING';
  }
  return normalizeSrn(srn);
}
