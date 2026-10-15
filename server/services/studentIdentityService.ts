import { db as defaultDb } from '../db.js';
import crypto from 'node:crypto';

/**
 * Helper to safely resolve active database handle
 */
export function getDb(customDb?: any) {
  return customDb || defaultDb;
}

/**
 * Character set for permanent Student Codes:
 * Upper-case alphanumeric excluding easily ambiguous characters (0, O, 1, I, L)
 */
const STUDENT_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const STUDENT_CODE_RANDOM_LENGTH = 4; // Yields ST-XXXX e.g. ST-K7P4

/**
 * Canonical Subject Code Mappings
 * Maps canonical subject keys, level titles, and display titles to concise uppercase codes.
 */
export const CANONICAL_SUBJECT_CODES: Record<string, string> = {
  // CA Intermediate
  inter_advanced_accounting: 'AA',
  inter_corporate_law: 'LAW',
  inter_taxation: 'TX',
  inter_costing: 'COST',
  inter_auditing: 'AUD',
  inter_fm_sm: 'FM-SM',
  inter_financial_management: 'FM',
  inter_strategic_management: 'SM',

  // CA Final
  final_fr: 'FR',
  final_afm: 'AFM',
  final_advanced_auditing: 'AUD',
  final_direct_tax: 'DT',
  final_indirect_tax: 'IDT',
  final_ibs: 'IBS',

  // CA Foundation
  foundation_accounting: 'ACC',
  foundation_business_law: 'BLAW',
  foundation_quantitative_aptitude: 'QA',
  foundation_business_economics: 'ECO',
};

/**
 * Resolve canonical 2-4 letter Subject Code from subject key, level, and title.
 */
export function getCanonicalSubjectCode(
  subjectKey?: string | null,
  subjectName?: string | null,
  level?: string | null
): string {
  const normKey = (subjectKey || '').toLowerCase().trim();
  if (normKey && CANONICAL_SUBJECT_CODES[normKey]) {
    return CANONICAL_SUBJECT_CODES[normKey];
  }

  const normName = (subjectName || '').toLowerCase().trim();
  if (normName.includes('advanced accounting') || normName === 'accounting' && level?.toUpperCase() === 'INTERMEDIATE') {
    return 'AA';
  }
  if (normName.includes('corporate') || normName.includes('law') || normName.includes('business law')) {
    return level?.toUpperCase() === 'FOUNDATION' ? 'BLAW' : 'LAW';
  }
  if (normName.includes('tax') || normName.includes('gst')) {
    if (normName.includes('direct tax') && !normName.includes('in-direct')) return 'DT';
    if (normName.includes('indirect tax')) return 'IDT';
    return 'TX';
  }
  if (normName.includes('cost') || normName.includes('management accounting')) {
    return 'COST';
  }
  if (normName.includes('audit')) {
    return 'AUD';
  }
  if ((normName.includes('financial management') && normName.includes('strategic management')) || normName.includes('fm-sm') || normName.includes('fm sm') || normName.includes('fm & sm')) {
    return 'FM-SM';
  }
  if (normName.includes('financial management') || normName === 'fm') {
    return 'FM';
  }
  if (normName.includes('strategic management') || normName === 'sm') {
    return 'SM';
  }
  if (normName.includes('fm')) {
    return 'FM-SM';
  }
  if (normName.includes('financial reporting') || normName.includes('fr')) {
    return 'FR';
  }
  if (normName.includes('afm') || normName.includes('advanced financial management')) {
    return 'AFM';
  }
  if (normName.includes('integrated business') || normName.includes('ibs')) {
    return 'IBS';
  }
  if (normName.includes('quantitative') || normName.includes('math')) {
    return 'QA';
  }
  if (normName.includes('economics') || normName.includes('eco')) {
    return 'ECO';
  }
  if (normName.includes('accounting') || normName.includes('accounts')) {
    return 'ACC';
  }

  // Fallback: sanitized 2-4 letter alphanumeric code
  const cleaned = (subjectKey || subjectName || 'GEN')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return cleaned.slice(0, 4) || 'GEN';
}

/**
 * Generate a random collision-safe student suffix using crypto randomness.
 */
function generateRandomStudentSuffix(): string {
  let result = '';
  const bytes = crypto.randomBytes(STUDENT_CODE_RANDOM_LENGTH);
  for (let i = 0; i < STUDENT_CODE_RANDOM_LENGTH; i++) {
    result += STUDENT_CODE_ALPHABET[bytes[i] % STUDENT_CODE_ALPHABET.length];
  }
  return result;
}

/**
 * Generate a new permanent, unique Student Code (e.g. ST-K7P4).
 * Collision-safe with database-backed uniqueness verification.
 */
export function generateUniqueStudentCode(customDb?: any): string {
  const activeDb = getDb(customDb);
  const maxAttempts = 100;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = `ST-${generateRandomStudentSuffix()}`;
    const existing = activeDb.prepare('SELECT student_code FROM student_profiles WHERE student_code = ?').get(candidate);
    if (!existing) {
      return candidate;
    }
  }
  // Extremely rare fallback: lengthen by 1 character
  return `ST-${generateRandomStudentSuffix()}${STUDENT_CODE_ALPHABET[Math.floor(Math.random() * STUDENT_CODE_ALPHABET.length)]}`;
}

/**
 * Get or assign a permanent Student Code for a student account.
 * Never regenerates if already assigned; persists permanently.
 */
export function getOrAssignStudentCode(userId: string, customDb?: any): string {
  if (!userId) return 'ST-GEN0';
  const activeDb = getDb(customDb);

  // 1. Check if student already has a permanent Student Code in student_profiles
  const profileRow = activeDb.prepare('SELECT student_code FROM student_profiles WHERE user_id = ?').get(userId) as {
    student_code?: string | null;
  } | undefined;

  if (profileRow?.student_code && profileRow.student_code.trim()) {
    return profileRow.student_code.trim().toUpperCase();
  }

  // 2. Generate and atomically set if profile exists
  const newCode = generateUniqueStudentCode(activeDb);
  if (profileRow) {
    activeDb.prepare('UPDATE student_profiles SET student_code = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(newCode, userId);
  } else {
    // If student_profiles record does not exist yet, create or insert
    try {
      activeDb.prepare(`
        INSERT INTO student_profiles (user_id, icai_registration_number, ca_level, student_code, created_at, updated_at)
        VALUES (?, 'REG-PENDING', 'INTERMEDIATE', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET student_code = COALESCE(student_profiles.student_code, excluded.student_code)
      `).run(userId, newCode);
    } catch (err) {
      console.warn('[StudentCode] Error ensuring student profile for code assignment:', err);
    }
  }

  // Return authoritative code (check again in case of concurrent insert)
  const finalRow = activeDb.prepare('SELECT student_code FROM student_profiles WHERE user_id = ?').get(userId) as {
    student_code?: string | null;
  } | undefined;
  return (finalRow?.student_code || newCode).toUpperCase();
}

/**
 * Format 2-digit zero-padded sequence number (e.g. 1 -> "01", 12 -> "12")
 */
export function formatSequenceNumber(seq: number): string {
  return seq < 10 ? `0${seq}` : String(seq);
}

/**
 * Determine the next evaluation sequence number for a student.
 * Continuous across all subjects, calendar years, and evaluation types.
 * Deleted sequence numbers are never reused (MAX + 1 logic backed by persistent student profile watermark).
 */
export function getNextEvaluationSequence(studentId: string, customDb?: any): number {
  if (!studentId) return 1;
  const activeDb = getDb(customDb);

  // 1. Fetch current highest_evaluation_sequence recorded on student_profiles
  let profileHighest = 0;
  try {
    const profileRow = activeDb.prepare(`
      SELECT highest_evaluation_sequence FROM student_profiles WHERE user_id = ?
    `).get(studentId) as { highest_evaluation_sequence?: number | null } | undefined;
    profileHighest = Number(profileRow?.highest_evaluation_sequence) || 0;
  } catch {
    // Column might be initializing
  }

  // 2. Find maximum evaluation_sequence assigned to this student so far in evaluations
  const row = activeDb.prepare(`
    SELECT MAX(evaluation_sequence) as max_seq
    FROM evaluations
    WHERE student_id = ?
  `).get(studentId) as { max_seq: number | null } | undefined;
  const evalMax = Number(row?.max_seq) || 0;

  // 3. Fallback: If evaluations exist but evaluation_sequence was null (prior to backfill), count total evaluations
  const countRow = activeDb.prepare('SELECT COUNT(*) as c FROM evaluations WHERE student_id = ?').get(studentId) as {
    c: number;
  } | undefined;
  const countVal = Number(countRow?.c) || 0;

  const currentMax = Math.max(profileHighest, evalMax, countVal);
  const nextSeq = currentMax + 1;

  // 4. Atomically persist the watermark on student profile so even if this evaluation is later deleted,
  // the sequence number will never be reused!
  try {
    activeDb.prepare(`
      UPDATE student_profiles
      SET highest_evaluation_sequence = MAX(COALESCE(highest_evaluation_sequence, 0), ?),
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(nextSeq, studentId);
  } catch (err) {
    console.warn('[studentIdentityService] Warning recording highest_evaluation_sequence:', err);
  }

  return nextSeq;
}

/**
 * Extract 2-digit year (e.g. 26 for 2026) from year number, date string, or Date object.
 */
export function extractTwoDigitYear(yearInput?: number | string | Date | null): string {
  if (!yearInput) {
    return String(new Date().getFullYear()).slice(-2);
  }
  if (typeof yearInput === 'number') {
    // If passed 2026
    if (yearInput >= 2000 && yearInput <= 2099) {
      return String(yearInput).slice(-2);
    }
    // If passed 26
    if (yearInput >= 0 && yearInput < 100) {
      return formatSequenceNumber(yearInput);
    }
  }
  if (typeof yearInput === 'string') {
    const trimmed = yearInput.trim();
    // Check if it's already a 4-digit year e.g. "2026"
    if (/^\d{4}$/.test(trimmed)) {
      return trimmed.slice(-2);
    }
    // Check if it's a 2-digit year e.g. "26"
    if (/^\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    // Parse date string like "2026-10-06 07:16:51" or ISO string
    const d = new Date(trimmed.includes(' ') && !trimmed.includes('T') ? trimmed.replace(' ', 'T') : trimmed);
    if (!isNaN(d.getFullYear())) {
      return String(d.getFullYear()).slice(-2);
    }
  }
  if (yearInput instanceof Date && !isNaN(yearInput.getFullYear())) {
    return String(yearInput.getFullYear()).slice(-2);
  }
  return String(new Date().getFullYear()).slice(-2);
}

/**
 * Build canonical human-friendly Evaluation ID:
 * CEA-YY-STUDENTCODE-SUBJECTCODE-SEQUENCE
 * e.g. CEA-26-ST-K7P4-TX-01
 */
export function formatEvaluationDisplayId(params: {
  year?: number | string | Date | null;
  studentCode: string;
  subjectCode: string;
  sequence: number;
}): string {
  const yy = extractTwoDigitYear(params.year);
  const stCode = (params.studentCode || 'ST-0000').toUpperCase().trim();
  const subCode = (params.subjectCode || 'GEN').toUpperCase().trim();
  const seqStr = formatSequenceNumber(params.sequence);

  return `CEA-${yy}-${stCode}-${subCode}-${seqStr}`;
}

/**
 * Generate a new canonical Evaluation ID and continuous sequence for a new evaluation.
 */
export function generateCanonicalEvaluationId(params: {
  studentId: string;
  subjectKey?: string | null;
  subjectName?: string | null;
  level?: string | null;
  createdAt?: string | Date | null;
}, customDb?: any): { displayId: string; sequence: number; studentCode: string; subjectCode: string } {
  const activeDb = getDb(customDb);
  const studentCode = getOrAssignStudentCode(params.studentId, activeDb);
  const initialSeq = getNextEvaluationSequence(params.studentId, activeDb);
  let sequence = initialSeq;
  const subjectCode = getCanonicalSubjectCode(params.subjectKey, params.subjectName, params.level);

  let displayId = formatEvaluationDisplayId({
    year: params.createdAt || new Date(),
    studentCode,
    subjectCode,
    sequence,
  });

  // Collision safeguard: ensure displayId is unique across the database
  while (activeDb.prepare('SELECT 1 FROM evaluations WHERE display_id = ?').get(displayId)) {
    sequence++;
    displayId = formatEvaluationDisplayId({
      year: params.createdAt || new Date(),
      studentCode,
      subjectCode,
      sequence,
    });
  }

  if (sequence !== initialSeq) {
    try {
      activeDb.prepare(`
        UPDATE student_profiles
        SET highest_evaluation_sequence = MAX(COALESCE(highest_evaluation_sequence, 0), ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(sequence, params.studentId);
    } catch {}
  }

  return {
    displayId,
    sequence,
    studentCode,
    subjectCode,
  };
}

/**
 * Backfill existing student accounts and evaluations with Student Code and Evaluation ID.
 * Runs idempotently on startup or database initialization.
 */
export function backfillStudentCodesAndEvaluationIds(customDb?: any): {
  studentsBackfilled: number;
  evaluationsBackfilled: number;
} {
  const activeDb = getDb(customDb);
  let studentsBackfilled = 0;
  let evaluationsBackfilled = 0;

  try {
    // 1. Backfill student_profiles where student_code IS NULL or empty
    const profilesWithoutCode = activeDb.prepare(`
      SELECT user_id FROM student_profiles WHERE student_code IS NULL OR TRIM(student_code) = ''
    `).all() as Array<{ user_id: string }>;

    for (const p of profilesWithoutCode) {
      const code = generateUniqueStudentCode(activeDb);
      activeDb.prepare('UPDATE student_profiles SET student_code = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(code, p.user_id);
      studentsBackfilled++;
    }

    // Also check student users who may not have a student_profiles row yet
    const studentUsersWithoutProfile = activeDb.prepare(`
      SELECT u.id FROM users u
      LEFT JOIN student_profiles p ON p.user_id = u.id
      WHERE u.role = 'STUDENT' AND p.user_id IS NULL
    `).all() as Array<{ id: string }>;

    for (const u of studentUsersWithoutProfile) {
      const code = generateUniqueStudentCode(activeDb);
      activeDb.prepare(`
        INSERT INTO student_profiles (user_id, icai_registration_number, ca_level, student_code, created_at, updated_at)
        VALUES (?, 'REG-PENDING', 'INTERMEDIATE', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(u.id, code);
      studentsBackfilled++;
    }

    // 2. Backfill evaluations where display_id IS NULL or evaluation_sequence IS NULL
    const studentsWithEvals = activeDb.prepare(`
      SELECT DISTINCT student_id FROM evaluations ORDER BY student_id ASC
    `).all() as Array<{ student_id: string }>;

    for (const s of studentsWithEvals) {
      const studentCode = getOrAssignStudentCode(s.student_id, activeDb);

      // Fetch all evaluations for this student ordered by creation date ascending
      const evals = activeDb.prepare(`
        SELECT id, subject_key, subject_name, level, created_at, display_id, evaluation_sequence
        FROM evaluations
        WHERE student_id = ?
        ORDER BY datetime(created_at) ASC, id ASC
      `).all(s.student_id) as Array<{
        id: string;
        subject_key?: string | null;
        subject_name?: string | null;
        level?: string | null;
        created_at: string;
        display_id?: string | null;
        evaluation_sequence?: number | null;
      }>;

      // Collect all already assigned sequences for this student
      const assignedSequences = new Set<number>();
      for (const ev of evals) {
        if (ev.evaluation_sequence != null && Number(ev.evaluation_sequence) > 0) {
          assignedSequences.add(Number(ev.evaluation_sequence));
        } else if (ev.display_id) {
          const match = ev.display_id.match(/-(\d+)$/);
          if (match) {
            const parsedSeq = parseInt(match[1], 10);
            if (!isNaN(parsedSeq) && parsedSeq > 0) {
              assignedSequences.add(parsedSeq);
              try {
                activeDb.prepare('UPDATE evaluations SET evaluation_sequence = ? WHERE id = ?').run(parsedSeq, ev.id);
              } catch {}
            }
          }
        }
      }

      // Check current watermark on student profile
      const profileRow = activeDb.prepare('SELECT highest_evaluation_sequence FROM student_profiles WHERE user_id = ?').get(s.student_id) as {
        highest_evaluation_sequence?: number | null;
      } | undefined;
      let highestSeq = Math.max(0, ...Array.from(assignedSequences), Number(profileRow?.highest_evaluation_sequence || 0));

      for (const ev of evals) {
        if (ev.display_id && !ev.evaluation_sequence) {
          let nextSeq = highestSeq + 1;
          const match = ev.display_id.match(/-(\d+)$/);
          const parsedSeq = match ? parseInt(match[1], 10) : 0;
          if (parsedSeq > 0 && !assignedSequences.has(parsedSeq)) {
            nextSeq = parsedSeq;
          } else {
            while (assignedSequences.has(nextSeq)) {
              nextSeq++;
            }
          }
          activeDb.prepare('UPDATE evaluations SET evaluation_sequence = ? WHERE id = ?').run(nextSeq, ev.id);
          assignedSequences.add(nextSeq);
          highestSeq = Math.max(highestSeq, nextSeq);
          evaluationsBackfilled++;
          continue;
        }

        if (!ev.display_id) {
          let nextSeq = highestSeq + 1;
          while (assignedSequences.has(nextSeq)) {
            nextSeq++;
          }

          const subCode = getCanonicalSubjectCode(ev.subject_key, ev.subject_name, ev.level);
          let displayId = formatEvaluationDisplayId({
            year: ev.created_at || '2026',
            studentCode,
            subjectCode: subCode,
            sequence: nextSeq,
          });

          // Safeguard: Ensure displayId is globally unique across evaluations table
          while (activeDb.prepare('SELECT 1 FROM evaluations WHERE display_id = ?').get(displayId)) {
            nextSeq++;
            displayId = formatEvaluationDisplayId({
              year: ev.created_at || '2026',
              studentCode,
              subjectCode: subCode,
              sequence: nextSeq,
            });
          }

          activeDb.prepare(`
            UPDATE evaluations
            SET display_id = ?, evaluation_sequence = ?
            WHERE id = ?
          `).run(displayId, nextSeq, ev.id);

          assignedSequences.add(nextSeq);
          highestSeq = Math.max(highestSeq, nextSeq);
          evaluationsBackfilled++;
        }
      }

      // Record highest sequence reached for this student
      if (highestSeq > 0) {
        activeDb.prepare(`
          UPDATE student_profiles
          SET highest_evaluation_sequence = MAX(COALESCE(highest_evaluation_sequence, 0), ?)
          WHERE user_id = ?
        `).run(highestSeq, s.student_id);
      }
    }
  } catch (err) {
    console.warn('[StudentCode & EvalID] Error during backfill:', err);
  }

  return { studentsBackfilled, evaluationsBackfilled };
}
