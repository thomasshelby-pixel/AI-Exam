export type CALevel = 'FOUNDATION' | 'INTERMEDIATE' | 'FINAL';

export interface ExamAttempt {
  id: string;
  caLevel: CALevel;
  attemptLabel: string;
  attemptCode: string;
  examMonth: string;
  examYear: number;
  sequenceOrder: number;
  active: boolean;
  syllabusVersion?: string;
  applicableMaterialVersion?: string;
  // Legacy aliases
  course?: string;
  month?: string;
  year?: number;
  displayName?: string;
  isActive?: boolean;
}

/**
 * Standard Material Types allowed for CA Evaluation Materials:
 * Strictly restricted to: MTP, PYQ, and Model Test Paper.
 */
export const ALLOWED_MATERIAL_TYPES = [
  { value: 'MTP', label: 'MTP (Mock Test Paper)' },
  { value: 'PYQ', label: 'PYQ (Past Year Question Paper)' },
  { value: 'MODEL_TEST_PAPER', label: 'Model Test Paper' },
] as const;

/**
 * Canonical master list of all ICAI CA exam attempts.
 * Foundation & Intermediate: Jan, May, Sep (May 2024 to Sep 2027, NO Nov).
 * Final:
 *   May 2024 to Jan 2026 (Jan, May, Sep)
 *   After May 2026: Nov 2026, May 2027, Nov 2027 (NO Sep 2026, NO Jan 2027, NO Sep 2027).
 */
export const MASTER_EXAM_ATTEMPTS: ExamAttempt[] = [
  // =========================================================================
  // CA FOUNDATION (11 attempts)
  // =========================================================================
  {
    id: 'att_fnd_may24',
    caLevel: 'FOUNDATION',
    attemptLabel: 'May 2024',
    attemptCode: 'FND_MAY24',
    examMonth: 'May',
    examYear: 2024,
    sequenceOrder: 1,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'May 2024',
    course: 'FOUNDATION',
  },
  {
    id: 'att_fnd_sep24',
    caLevel: 'FOUNDATION',
    attemptLabel: 'September 2024',
    attemptCode: 'FND_SEP24',
    examMonth: 'September',
    examYear: 2024,
    sequenceOrder: 2,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'September 2024',
    course: 'FOUNDATION',
  },
  {
    id: 'att_fnd_jan25',
    caLevel: 'FOUNDATION',
    attemptLabel: 'January 2025',
    attemptCode: 'FND_JAN25',
    examMonth: 'January',
    examYear: 2025,
    sequenceOrder: 3,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'January 2025',
    course: 'FOUNDATION',
  },
  {
    id: 'att_fnd_may25',
    caLevel: 'FOUNDATION',
    attemptLabel: 'May 2025',
    attemptCode: 'FND_MAY25',
    examMonth: 'May',
    examYear: 2025,
    sequenceOrder: 4,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'May 2025',
    course: 'FOUNDATION',
  },
  {
    id: 'att_fnd_sep25',
    caLevel: 'FOUNDATION',
    attemptLabel: 'September 2025',
    attemptCode: 'FND_SEP25',
    examMonth: 'September',
    examYear: 2025,
    sequenceOrder: 5,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'September 2025',
    course: 'FOUNDATION',
  },
  {
    id: 'att_fnd_jan26',
    caLevel: 'FOUNDATION',
    attemptLabel: 'January 2026',
    attemptCode: 'FND_JAN26',
    examMonth: 'January',
    examYear: 2026,
    sequenceOrder: 6,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'January 2026',
    course: 'FOUNDATION',
  },
  {
    id: 'att_fnd_may26',
    caLevel: 'FOUNDATION',
    attemptLabel: 'May 2026',
    attemptCode: 'FND_MAY26',
    examMonth: 'May',
    examYear: 2026,
    sequenceOrder: 7,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'May 2026',
    course: 'FOUNDATION',
  },
  {
    id: 'att_fnd_sep26',
    caLevel: 'FOUNDATION',
    attemptLabel: 'September 2026',
    attemptCode: 'FND_SEP26',
    examMonth: 'September',
    examYear: 2026,
    sequenceOrder: 8,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'September 2026',
    course: 'FOUNDATION',
  },
  {
    id: 'att_fnd_jan27',
    caLevel: 'FOUNDATION',
    attemptLabel: 'January 2027',
    attemptCode: 'FND_JAN27',
    examMonth: 'January',
    examYear: 2027,
    sequenceOrder: 9,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'January 2027',
    course: 'FOUNDATION',
  },
  {
    id: 'att_fnd_may27',
    caLevel: 'FOUNDATION',
    attemptLabel: 'May 2027',
    attemptCode: 'FND_MAY27',
    examMonth: 'May',
    examYear: 2027,
    sequenceOrder: 10,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'May 2027',
    course: 'FOUNDATION',
  },
  {
    id: 'att_fnd_sep27',
    caLevel: 'FOUNDATION',
    attemptLabel: 'September 2027',
    attemptCode: 'FND_SEP27',
    examMonth: 'September',
    examYear: 2027,
    sequenceOrder: 11,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'September 2027',
    course: 'FOUNDATION',
  },

  // =========================================================================
  // CA INTERMEDIATE (11 attempts)
  // =========================================================================
  {
    id: 'att_int_may24',
    caLevel: 'INTERMEDIATE',
    attemptLabel: 'May 2024',
    attemptCode: 'INT_MAY24',
    examMonth: 'May',
    examYear: 2024,
    sequenceOrder: 1,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'May 2024',
    course: 'INTERMEDIATE',
  },
  {
    id: 'att_int_sep24',
    caLevel: 'INTERMEDIATE',
    attemptLabel: 'September 2024',
    attemptCode: 'INT_SEP24',
    examMonth: 'September',
    examYear: 2024,
    sequenceOrder: 2,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'September 2024',
    course: 'INTERMEDIATE',
  },
  {
    id: 'att_int_jan25',
    caLevel: 'INTERMEDIATE',
    attemptLabel: 'January 2025',
    attemptCode: 'INT_JAN25',
    examMonth: 'January',
    examYear: 2025,
    sequenceOrder: 3,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'January 2025',
    course: 'INTERMEDIATE',
  },
  {
    id: 'att_int_may25',
    caLevel: 'INTERMEDIATE',
    attemptLabel: 'May 2025',
    attemptCode: 'INT_MAY25',
    examMonth: 'May',
    examYear: 2025,
    sequenceOrder: 4,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'May 2025',
    course: 'INTERMEDIATE',
  },
  {
    id: 'att_int_sep25',
    caLevel: 'INTERMEDIATE',
    attemptLabel: 'September 2025',
    attemptCode: 'INT_SEP25',
    examMonth: 'September',
    examYear: 2025,
    sequenceOrder: 5,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'September 2025',
    course: 'INTERMEDIATE',
  },
  {
    id: 'att_int_jan26',
    caLevel: 'INTERMEDIATE',
    attemptLabel: 'January 2026',
    attemptCode: 'INT_JAN26',
    examMonth: 'January',
    examYear: 2026,
    sequenceOrder: 6,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'January 2026',
    course: 'INTERMEDIATE',
  },
  {
    id: 'att_int_may26',
    caLevel: 'INTERMEDIATE',
    attemptLabel: 'May 2026',
    attemptCode: 'INT_MAY26',
    examMonth: 'May',
    examYear: 2026,
    sequenceOrder: 7,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'May 2026',
    course: 'INTERMEDIATE',
  },
  {
    id: 'att_int_sep26',
    caLevel: 'INTERMEDIATE',
    attemptLabel: 'September 2026',
    attemptCode: 'INT_SEP26',
    examMonth: 'September',
    examYear: 2026,
    sequenceOrder: 8,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'September 2026',
    course: 'INTERMEDIATE',
  },
  {
    id: 'att_int_jan27',
    caLevel: 'INTERMEDIATE',
    attemptLabel: 'January 2027',
    attemptCode: 'INT_JAN27',
    examMonth: 'January',
    examYear: 2027,
    sequenceOrder: 9,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'January 2027',
    course: 'INTERMEDIATE',
  },
  {
    id: 'att_int_may27',
    caLevel: 'INTERMEDIATE',
    attemptLabel: 'May 2027',
    attemptCode: 'INT_MAY27',
    examMonth: 'May',
    examYear: 2027,
    sequenceOrder: 10,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'May 2027',
    course: 'INTERMEDIATE',
  },
  {
    id: 'att_int_sep27',
    caLevel: 'INTERMEDIATE',
    attemptLabel: 'September 2027',
    attemptCode: 'INT_SEP27',
    examMonth: 'September',
    examYear: 2027,
    sequenceOrder: 11,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'September 2027',
    course: 'INTERMEDIATE',
  },

  // =========================================================================
  // CA FINAL (10 attempts)
  // =========================================================================
  {
    id: 'att_fin_may24',
    caLevel: 'FINAL',
    attemptLabel: 'May 2024',
    attemptCode: 'FIN_MAY24',
    examMonth: 'May',
    examYear: 2024,
    sequenceOrder: 1,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'May 2024',
    course: 'FINAL',
  },
  {
    id: 'att_fin_sep24',
    caLevel: 'FINAL',
    attemptLabel: 'September 2024',
    attemptCode: 'FIN_SEP24',
    examMonth: 'September',
    examYear: 2024,
    sequenceOrder: 2,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'September 2024',
    course: 'FINAL',
  },
  {
    id: 'att_fin_jan25',
    caLevel: 'FINAL',
    attemptLabel: 'January 2025',
    attemptCode: 'FIN_JAN25',
    examMonth: 'January',
    examYear: 2025,
    sequenceOrder: 3,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'January 2025',
    course: 'FINAL',
  },
  {
    id: 'att_fin_may25',
    caLevel: 'FINAL',
    attemptLabel: 'May 2025',
    attemptCode: 'FIN_MAY25',
    examMonth: 'May',
    examYear: 2025,
    sequenceOrder: 4,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'May 2025',
    course: 'FINAL',
  },
  {
    id: 'att_fin_sep25',
    caLevel: 'FINAL',
    attemptLabel: 'September 2025',
    attemptCode: 'FIN_SEP25',
    examMonth: 'September',
    examYear: 2025,
    sequenceOrder: 5,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'September 2025',
    course: 'FINAL',
  },
  {
    id: 'att_fin_jan26',
    caLevel: 'FINAL',
    attemptLabel: 'January 2026',
    attemptCode: 'FIN_JAN26',
    examMonth: 'January',
    examYear: 2026,
    sequenceOrder: 6,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'January 2026',
    course: 'FINAL',
  },
  {
    id: 'att_fin_may26',
    caLevel: 'FINAL',
    attemptLabel: 'May 2026',
    attemptCode: 'FIN_MAY26',
    examMonth: 'May',
    examYear: 2026,
    sequenceOrder: 7,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'May 2026',
    course: 'FINAL',
  },
  {
    id: 'att_fin_nov26',
    caLevel: 'FINAL',
    attemptLabel: 'November 2026',
    attemptCode: 'FIN_NOV26',
    examMonth: 'November',
    examYear: 2026,
    sequenceOrder: 8,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'November 2026',
    course: 'FINAL',
  },
  {
    id: 'att_fin_may27',
    caLevel: 'FINAL',
    attemptLabel: 'May 2027',
    attemptCode: 'FIN_MAY27',
    examMonth: 'May',
    examYear: 2027,
    sequenceOrder: 9,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'May 2027',
    course: 'FINAL',
  },
  {
    id: 'att_fin_nov27',
    caLevel: 'FINAL',
    attemptLabel: 'November 2027',
    attemptCode: 'FIN_NOV27',
    examMonth: 'November',
    examYear: 2027,
    sequenceOrder: 10,
    active: true,
    syllabusVersion: 'New Scheme 2024',
    displayName: 'November 2027',
    course: 'FINAL',
  },
];

/**
 * Returns the valid attempts for a specified CA level synchronously from configuration.
 */
export function getAttemptsForLevel(level?: string): ExamAttempt[] {
  if (!level) return MASTER_EXAM_ATTEMPTS.filter((a) => a.active);
  const normalized = level.trim().toUpperCase();
  return MASTER_EXAM_ATTEMPTS.filter(
    (a) => a.caLevel === normalized && a.active
  );
}

/**
 * Fetches attempts dynamically from the centralized server database endpoint.
 * Falls back safely to MASTER_EXAM_ATTEMPTS if network is unavailable.
 */
export async function fetchExamAttempts(level?: string): Promise<ExamAttempt[]> {
  try {
    const url = level
      ? `/api/public/attempts?level=${encodeURIComponent(level.toUpperCase())}`
      : '/api/public/attempts';
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.attempts) && data.attempts.length > 0) {
        return data.attempts.map((item: any) => ({
          id: item.id,
          caLevel: (item.caLevel || item.course || 'INTERMEDIATE').toUpperCase() as CALevel,
          attemptLabel: item.attemptLabel || item.displayName || `${item.month} ${item.year}`,
          attemptCode: item.attemptCode || item.id,
          examMonth: item.examMonth || item.month,
          examYear: Number(item.examYear || item.year),
          sequenceOrder: Number(item.sequenceOrder || 0),
          active: Boolean(item.active !== undefined ? item.active : item.isActive),
          syllabusVersion: item.syllabusVersion || 'New Scheme 2024',
          applicableMaterialVersion: item.applicableMaterialVersion,
          course: item.course || item.caLevel,
          displayName: item.displayName || item.attemptLabel,
        }));
      }
    }
  } catch (err) {
    console.warn('[AttemptMaster] Error fetching dynamic attempts, using master config:', err);
  }

  return getAttemptsForLevel(level);
}
