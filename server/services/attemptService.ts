import { db } from '../db.js';
import {
  ATTEMPT_MASTER_CONFIG,
  ExamAttemptConfig,
  CALevel,
} from '../config/attemptMaster.js';

export type { CALevel, ExamAttemptConfig };
export { ATTEMPT_MASTER_CONFIG };

export interface ExamAttemptRecord {
  id: string;
  caLevel: CALevel;
  attemptLabel: string;
  attemptCode: string;
  examMonth: string;
  examYear: number;
  sequenceOrder: number;
  active: boolean;
  syllabusVersion: string;
  applicableMaterialVersion?: string;
  startDate?: string;
  endDate?: string;
  createdAt?: string;
  updatedAt?: string;
  // Legacy compatibility fields
  course?: string;
  month?: string;
  year?: number;
  displayName?: string;
  isActive?: boolean;
}

/**
 * Seeds or synchronizes the master attempts table in SQLite database.
 * Upserts canonical attempts, fixes columns, and deactivates invalid/out-of-range records.
 */
export function seedExamAttemptsMaster() {
  try {
    for (const item of ATTEMPT_MASTER_CONFIG) {
      const existing = db.prepare('SELECT id FROM exam_attempts WHERE id = ?').get(item.id);

      if (existing) {
        db.prepare(`
          UPDATE exam_attempts
          SET course = ?,
              month = ?,
              year = ?,
              display_name = ?,
              ca_level = ?,
              attempt_label = ?,
              attempt_code = ?,
              exam_month = ?,
              exam_year = ?,
              sequence_order = ?,
              is_active = ?,
              active = ?,
              syllabus_version = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          item.caLevel,
          item.examMonth,
          item.examYear,
          item.attemptLabel,
          item.caLevel,
          item.attemptLabel,
          item.attemptCode,
          item.examMonth,
          item.examYear,
          item.sequenceOrder,
          item.active ? 1 : 0,
          item.active ? 1 : 0,
          item.syllabusVersion,
          item.id
        );
      } else {
        db.prepare(`
          INSERT INTO exam_attempts (
            id, course, month, year, display_name,
            ca_level, attempt_label, attempt_code, exam_month, exam_year,
            sequence_order, is_active, active, syllabus_version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(
          item.id,
          item.caLevel,
          item.examMonth,
          item.examYear,
          item.attemptLabel,
          item.caLevel,
          item.attemptLabel,
          item.attemptCode,
          item.examMonth,
          item.examYear,
          item.sequenceOrder,
          item.active ? 1 : 0,
          item.active ? 1 : 0,
          item.syllabusVersion
        );
      }
    }

    // Deactivate any out-of-schedule records
    db.prepare(`
      UPDATE exam_attempts
      SET is_active = 0, active = 0
      WHERE (year > 2027)
         OR (course IN ('FOUNDATION', 'INTERMEDIATE') AND month = 'November')
         OR (course = 'FINAL' AND year = 2026 AND month = 'September')
         OR (course = 'FINAL' AND year = 2027 AND month IN ('January', 'September'))
    `).run();

    console.log('[AttemptMaster] Successfully synchronized 32 canonical exam attempts.');
  } catch (err) {
    console.error('[AttemptMaster] Error synchronizing exam attempts:', err);
  }
}

/**
 * Normalizes and formats a database attempt row into a consistent ExamAttemptRecord.
 */
export function formatAttemptRow(row: any): ExamAttemptRecord {
  const caLevel = (row.ca_level || row.course || '').toUpperCase() as CALevel;
  const attemptLabel = row.attempt_label || row.display_name || `${row.month} ${row.year}`;
  const examMonth = row.exam_month || row.month || '';
  const examYear = Number(row.exam_year || row.year);
  const sequenceOrder = Number(row.sequence_order || 0);
  const active = Boolean(row.active !== undefined ? row.active : row.is_active);

  // Generate fallback attempt code if missing
  const levelPrefix = caLevel === 'FOUNDATION' ? 'FND' : caLevel === 'INTERMEDIATE' ? 'INT' : 'FIN';
  const monthPrefix = examMonth.slice(0, 3).toUpperCase();
  const yearSuffix = String(examYear).slice(-2);
  const attemptCode = row.attempt_code || `${levelPrefix}_${monthPrefix}${yearSuffix}`;

  return {
    id: row.id,
    caLevel,
    attemptLabel,
    attemptCode,
    examMonth,
    examYear,
    sequenceOrder,
    active,
    syllabusVersion: row.syllabus_version || 'New Scheme 2024',
    applicableMaterialVersion: row.applicable_material_version || '1.0',
    startDate: row.start_date || undefined,
    endDate: row.end_date || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Legacy fields
    course: caLevel,
    month: examMonth,
    year: examYear,
    displayName: attemptLabel,
    isActive: active,
  };
}

/**
 * Retrieves valid attempts from the database for a specific CA level (or all levels).
 * Ordered chronologically by sequence_order ASC (or exam_year, sequence_order).
 */
export function getValidAttemptsForLevel(level?: string, activeOnly = true): ExamAttemptRecord[] {
  let query = 'SELECT * FROM exam_attempts';
  const conditions: string[] = [];
  const params: any[] = [];

  if (activeOnly) {
    conditions.push('(is_active = 1 OR active = 1)');
  }

  if (level) {
    const normalizedLevel = level.trim().toUpperCase();
    conditions.push('(upper(course) = ? OR upper(ca_level) = ?)');
    params.push(normalizedLevel, normalizedLevel);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY exam_year ASC, sequence_order ASC, id ASC';

  try {
    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(formatAttemptRow);
  } catch (err) {
    console.error('[AttemptMaster] Error querying attempts:', err);
    // In-memory fallback
    const target = (level || '').trim().toUpperCase();
    return ATTEMPT_MASTER_CONFIG
      .filter((a) => (!target || a.caLevel === target) && (!activeOnly || a.active))
      .map((a) => ({
        ...a,
        course: a.caLevel,
        month: a.examMonth,
        year: a.examYear,
        displayName: a.attemptLabel,
        isActive: a.active,
      }));
  }
}

/**
 * Resolves an attempt identifier (ID, code, or label like "May 2026")
 * to its canonical ExamAttemptRecord for a given level.
 */
export function resolveAttempt(level: string, attemptIdentifier: string): ExamAttemptRecord | null {
  if (!level || !attemptIdentifier) return null;

  const normalizedLevel = level.trim().toUpperCase();
  const trimmed = attemptIdentifier.trim();

  try {
    const row = db.prepare(`
      SELECT * FROM exam_attempts
      WHERE (upper(course) = ? OR upper(ca_level) = ?)
        AND (id = ? OR attempt_code = ? OR attempt_label = ? OR display_name = ?)
      LIMIT 1
    `).get(normalizedLevel, normalizedLevel, trimmed, trimmed, trimmed, trimmed) as any;

    if (row) {
      return formatAttemptRow(row);
    }
  } catch (err) {
    console.warn('[AttemptMaster] Lookup warning:', err);
  }

  // Fallback to static master configuration
  const found = ATTEMPT_MASTER_CONFIG.find(
    (a) =>
      a.caLevel === normalizedLevel &&
      (a.id === trimmed ||
        a.attemptCode.toUpperCase() === trimmed.toUpperCase() ||
        a.attemptLabel.toLowerCase() === trimmed.toLowerCase())
  );

  return found
    ? {
        ...found,
        course: found.caLevel,
        month: found.examMonth,
        year: found.examYear,
        displayName: found.attemptLabel,
        isActive: found.active,
      }
    : null;
}

/**
 * Validates whether a CA Level and Attempt combination is valid according to ICAI schedule.
 * Rejects:
 * - CA Foundation + November
 * - CA Intermediate + November
 * - CA Final + September 2026
 * - CA Final + January 2027
 * - CA Final + September 2027
 * - Any attempt outside May 2024 to November 2027
 */
export function validateLevelAndAttempt(
  level: string,
  attemptIdentifier: string
): { valid: boolean; attempt?: ExamAttemptRecord; error?: string } {
  if (!level) {
    return { valid: false, error: 'CA Level is required (FOUNDATION, INTERMEDIATE, or FINAL).' };
  }

  const normalizedLevel = level.trim().toUpperCase();
  if (!['FOUNDATION', 'INTERMEDIATE', 'FINAL'].includes(normalizedLevel)) {
    return { valid: false, error: `Invalid CA Level: ${level}. Must be FOUNDATION, INTERMEDIATE, or FINAL.` };
  }

  if (!attemptIdentifier) {
    return { valid: false, error: 'Exam attempt is required.' };
  }

  const resolved = resolveAttempt(normalizedLevel, attemptIdentifier);
  if (!resolved) {
    return {
      valid: false,
      error: `Invalid exam attempt "${attemptIdentifier}" for CA ${normalizedLevel}. Please select a valid attempt from the ICAI Attempt Master.`,
    };
  }

  if (!resolved.active) {
    return {
      valid: false,
      error: `Exam attempt "${resolved.attemptLabel}" for CA ${normalizedLevel} is currently disabled or inactive.`,
    };
  }

  // Rule verification:
  if ((normalizedLevel === 'FOUNDATION' || normalizedLevel === 'INTERMEDIATE') && resolved.examMonth === 'November') {
    return {
      valid: false,
      error: `November attempt is NOT applicable for CA ${normalizedLevel}. Available attempts are January, May, and September.`,
    };
  }

  if (normalizedLevel === 'FINAL') {
    if (resolved.examYear === 2026 && resolved.examMonth === 'September') {
      return {
        valid: false,
        error: 'September 2026 is NOT an available attempt for CA Final.',
      };
    }
    if (resolved.examYear === 2027 && (resolved.examMonth === 'January' || resolved.examMonth === 'September')) {
      return {
        valid: false,
        error: `${resolved.examMonth} 2027 is NOT an available attempt for CA Final. Only May 2027 and November 2027 are scheduled.`,
      };
    }
  }

  return { valid: true, attempt: resolved };
}
