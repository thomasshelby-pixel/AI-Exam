import { useState, useEffect } from 'react';
import { apiRequest } from '../api/client.js';
import { CALevel, ExamAttempt } from '../types';

// Official 32 Attempt Master - Single Source of Truth
export const OFFICIAL_FOUNDATION_ATTEMPTS: string[] = [
  'May 2024',
  'September 2024',
  'January 2025',
  'May 2025',
  'September 2025',
  'January 2026',
  'May 2026',
  'September 2026',
  'January 2027',
  'May 2027',
  'September 2027',
];

export const OFFICIAL_INTERMEDIATE_ATTEMPTS: string[] = [
  'May 2024',
  'September 2024',
  'January 2025',
  'May 2025',
  'September 2025',
  'January 2026',
  'May 2026',
  'September 2026',
  'January 2027',
  'May 2027',
  'September 2027',
];

export const OFFICIAL_FINAL_ATTEMPTS: string[] = [
  'May 2024',
  'September 2024',
  'January 2025',
  'May 2025',
  'September 2025',
  'January 2026',
  'May 2026',
  'November 2026',
  'May 2027',
  'November 2027',
];

// Approved official material types per ICAI repository requirements
export const OFFICIAL_MATERIAL_TYPES = [
  { value: 'MTP', label: 'MTP (Mock Test Paper)', shortLabel: 'MTP' },
  { value: 'PYQ', label: 'PYQ (Previous Year Question Paper)', shortLabel: 'PYQ' },
  { value: 'MODEL', label: 'Model Test Paper', shortLabel: 'Model Paper' },
] as const;

export function getOfficialAttemptsForLevel(level?: string | CALevel): string[] {
  if (!level) return OFFICIAL_INTERMEDIATE_ATTEMPTS;
  const upper = level.toUpperCase().trim();
  if (upper === 'FOUNDATION') return OFFICIAL_FOUNDATION_ATTEMPTS;
  if (upper === 'FINAL') return OFFICIAL_FINAL_ATTEMPTS;
  return OFFICIAL_INTERMEDIATE_ATTEMPTS;
}

export function getDefaultAttemptForLevel(level?: string | CALevel): string {
  // Current active ICAI exam attempt under testing & evaluation
  return 'May 2026';
}

// In-memory cache for fetched attempts
const attemptsCache: Record<string, ExamAttempt[]> = {};

export async function fetchExamAttempts(course?: string): Promise<ExamAttempt[]> {
  const cacheKey = (course || 'ALL').toUpperCase();
  if (attemptsCache[cacheKey]) {
    return attemptsCache[cacheKey];
  }

  try {
    const url = course && course !== 'ALL'
      ? `/api/public/attempts?course=${encodeURIComponent(course.toUpperCase())}`
      : '/api/public/attempts';

    const res = await apiRequest<{ attempts: ExamAttempt[] }>(url);
    if (res && Array.isArray(res.attempts) && res.attempts.length > 0) {
      attemptsCache[cacheKey] = res.attempts;
      return res.attempts;
    }
  } catch (err) {
    console.warn('Failed to fetch dynamic attempts from server, using official attempt master fallback:', err);
  }

  // Fallback to static master definitions if offline or initial load
  const fallbackList = getOfficialAttemptsForLevel(course).map((label, idx) => {
    const [month, yearStr] = label.split(' ');
    const year = Number(yearStr) || 2026;
    const normCourse = (course || 'INTERMEDIATE').toUpperCase() as CALevel;
    const code = `${normCourse.toLowerCase()}_${month.toLowerCase()}_${year}`;
    return {
      id: code,
      caLevel: normCourse,
      course: normCourse,
      attemptLabel: label,
      displayName: label,
      attemptCode: code,
      examMonth: month,
      month,
      examYear: year,
      year,
      sequence: idx + 1,
      sortOrder: idx + 1,
      syllabusVersion: 'New Scheme 2024',
      applicableMaterialVersion: '1.0',
      isActive: true,
      active: true,
    } as ExamAttempt;
  });

  attemptsCache[cacheKey] = fallbackList;
  return fallbackList;
}

// React Hook to consume dynamic attempts with guaranteed master fallback
export function useExamAttempts(course?: string | CALevel) {
  const normCourse = (course || 'INTERMEDIATE').toUpperCase();
  const [attempts, setAttempts] = useState<ExamAttempt[]>(() => {
    return attemptsCache[normCourse] || [];
  });
  const [loading, setLoading] = useState<boolean>(attempts.length === 0);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const data = await fetchExamAttempts(normCourse);
      if (mounted) {
        setAttempts(data);
        setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [normCourse]);

  const attemptLabels = attempts.length > 0
    ? attempts.map((a) => a.displayName || a.attemptLabel)
    : getOfficialAttemptsForLevel(normCourse);

  return {
    attempts,
    attemptLabels,
    loading,
    defaultAttempt: getDefaultAttemptForLevel(normCourse),
  };
}
