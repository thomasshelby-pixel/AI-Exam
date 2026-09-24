import crypto from 'node:crypto';
import db from '../db.js';
import { McqQuestion, McqCourse, McqQuestionType, McqDifficulty, McqSource, McqStatus } from '../../src/types/index.js';

export interface BulkImportRowInput {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  explanation?: string;
  reference?: string;
  course?: string;
  subject?: string;
  chapter?: string;
  topic?: string;
  difficulty?: string;
  question_type?: string;
  case_study_scenario?: string;
  source?: string;
  attempt?: string;
  amendment_version?: string;
  source_material_id?: string;
}

export interface ValidatedBulkRow {
  rowNumber: number;
  isValid: boolean;
  errors: string[];
  data: Partial<McqQuestion> & { source_material_id?: string };
}

export interface BulkImportPreviewResult {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  rows: ValidatedBulkRow[];
  detectedColumns: string[];
}

/**
 * Robust CSV parser that handles quotes, escaped quotes (""), newlines within fields, and commas.
 */
export function parseCsvText(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \r\n
      }
      currentRow.push(currentField.trim());
      currentField = '';
      if (currentRow.some((f) => f.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Normalizes column header strings to standard field keys.
 */
function normalizeHeader(header: string): string {
  const clean = header.toLowerCase().replace(/[^a-z0-9]/g, '_');
  if (clean.includes('question') && !clean.includes('type')) return 'question_text';
  if (clean === 'a' || clean === 'option_a' || clean.includes('option_1')) return 'option_a';
  if (clean === 'b' || clean === 'option_b' || clean.includes('option_2')) return 'option_b';
  if (clean === 'c' || clean === 'option_c' || clean.includes('option_3')) return 'option_c';
  if (clean === 'd' || clean === 'option_d' || clean.includes('option_4')) return 'option_d';
  if (clean.includes('answer') || clean === 'ans' || clean === 'correct') return 'correct_answer';
  if (clean.includes('explain') || clean.includes('solution') || clean.includes('reason')) return 'explanation';
  if (clean.includes('ref') || clean.includes('section')) return 'reference';
  if (clean.includes('course') || clean.includes('level')) return 'course';
  if (clean.includes('sub')) return 'subject';
  if (clean.includes('chap')) return 'chapter';
  if (clean.includes('top')) return 'topic';
  if (clean.includes('diff')) return 'difficulty';
  if (clean.includes('type')) return 'question_type';
  if (clean.includes('case') || clean.includes('scenario')) return 'case_study_scenario';
  if (clean.includes('source') && !clean.includes('mat')) return 'source';
  if (clean.includes('attempt') || clean.includes('year')) return 'attempt';
  if (clean.includes('amend') || clean.includes('scheme')) return 'amendment_version';
  if (clean.includes('material') || clean.includes('source_mat')) return 'source_material_id';
  return clean;
}

/**
 * Validates parsed rows against MCQ constraints.
 */
export function validateBulkQuestions(
  parsedRows: string[][],
  defaultValues: {
    course?: McqCourse;
    subject?: string;
    chapter?: string;
    source?: string;
    attempt?: string;
    sourceMaterialId?: string;
  } = {}
): BulkImportPreviewResult {
  if (parsedRows.length === 0) {
    return {
      totalRows: 0,
      validCount: 0,
      invalidCount: 0,
      rows: [],
      detectedColumns: [],
    };
  }

  // Row 0 is assumed headers
  const rawHeaders = parsedRows[0];
  const headerKeys = rawHeaders.map(normalizeHeader);
  const dataRows = parsedRows.slice(1);

  const validatedRows: ValidatedBulkRow[] = [];
  let validCount = 0;
  let invalidCount = 0;

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    const rowNumber = r + 2; // 1-indexed line in file (accounting for header)
    const errors: string[] = [];

    const rowObj: Record<string, string> = {};
    for (let c = 0; c < headerKeys.length; c++) {
      rowObj[headerKeys[c]] = row[c] || '';
    }

    // Required fields
    const questionText = rowObj.question_text || '';
    if (!questionText.trim()) {
      errors.push('Question text is missing');
    }

    const optA = rowObj.option_a || '';
    const optB = rowObj.option_b || '';
    const optC = rowObj.option_c || '';
    const optD = rowObj.option_d || '';

    if (!optA.trim()) errors.push('Option A is required');
    if (!optB.trim()) errors.push('Option B is required');
    if (!optC.trim()) errors.push('Option C is required');
    if (!optD.trim()) errors.push('Option D is required');

    let ans = (rowObj.correct_answer || '').trim().toUpperCase();
    if (ans.startsWith('(') && ans.endsWith(')')) ans = ans.slice(1, -1).trim();
    if (ans === '1') ans = 'A';
    if (ans === '2') ans = 'B';
    if (ans === '3') ans = 'C';
    if (ans === '4') ans = 'D';

    if (!['A', 'B', 'C', 'D'].includes(ans)) {
      errors.push(`Invalid correct answer "${rowObj.correct_answer}". Must be A, B, C, or D`);
    }

    // Course normalization
    let rawCourse = (rowObj.course || defaultValues.course || 'CA_INTERMEDIATE').trim().toUpperCase();
    if (rawCourse.includes('FOUNDATION')) rawCourse = 'CA_FOUNDATION';
    else if (rawCourse.includes('FINAL')) rawCourse = 'CA_FINAL';
    else rawCourse = 'CA_INTERMEDIATE';

    const course = rawCourse as McqCourse;
    const subject = rowObj.subject?.trim() || defaultValues.subject || 'Corporate and Other Laws';
    const chapter = rowObj.chapter?.trim() || defaultValues.chapter || 'Chapter 1 - General';
    const topic = rowObj.topic?.trim() || '';

    let diff = (rowObj.difficulty || 'moderate').trim().toLowerCase();
    if (!['easy', 'moderate', 'hard'].includes(diff)) diff = 'moderate';

    let qType = (rowObj.question_type || 'normal').trim().toLowerCase();
    if (!['normal', 'case_based'].includes(qType)) qType = 'normal';

    const explanation = rowObj.explanation?.trim() || `Correct answer is Option (${ans}).`;
    const reference = rowObj.reference?.trim() || '';
    const source = rowObj.source?.trim() || defaultValues.source || 'ICAI Module';
    const attempt = rowObj.attempt?.trim() || defaultValues.attempt || 'May 2026';
    const amendmentVersion = rowObj.amendment_version?.trim() || 'New Scheme 2024';
    const sourceMaterialId = rowObj.source_material_id?.trim() || defaultValues.sourceMaterialId || undefined;

    const isValid = errors.length === 0;
    if (isValid) validCount++;
    else invalidCount++;

    validatedRows.push({
      rowNumber,
      isValid,
      errors,
      data: {
        course,
        subject,
        chapter,
        topic,
        questionType: qType as McqQuestionType,
        caseStudyScenario: rowObj.case_study_scenario?.trim() || undefined,
        difficulty: diff as McqDifficulty,
        source: (source || 'ICAI Module') as McqSource,
        attempt,
        amendmentVersion,
        questionText,
        optionA: optA,
        optionB: optB,
        optionC: optC,
        optionD: optD,
        correctAnswer: ans as 'A' | 'B' | 'C' | 'D',
        explanation,
        reference,
        status: 'published',
        source_material_id: sourceMaterialId,
      },
    });
  }

  return {
    totalRows: dataRows.length,
    validCount,
    invalidCount,
    rows: validatedRows,
    detectedColumns: headerKeys,
  };
}

/**
 * Commits pre-validated questions into mcq_questions table.
 */
export function commitBulkQuestions(
  validRows: ValidatedBulkRow[],
  adminUser: string = 'MCQ_ADMIN'
): { importedCount: number; importedIds: string[] } {
  const insertStmt = db.prepare(`
    INSERT INTO mcq_questions (
      id, course, subject, chapter, topic, question_type,
      case_study_scenario, difficulty, source, attempt, amendment_version,
      question_text, option_a, option_b, option_c, option_d,
      correct_answer, explanation, reference, status, created_by,
      source_material_id, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, datetime('now'), datetime('now')
    )
  `);

  const importedIds: string[] = [];

  db.exec('BEGIN TRANSACTION');
  try {
    for (const r of validRows) {
      if (!r.isValid) continue;
      const d = r.data;
      const id = `mcq_${crypto.randomBytes(8).toString('hex')}`;

      insertStmt.run(
        id,
        d.course || 'CA_INTERMEDIATE',
        d.subject || 'Corporate and Other Laws',
        d.chapter || 'Chapter 1',
        d.topic || null,
        d.questionType || 'normal',
        d.caseStudyScenario || null,
        d.difficulty || 'moderate',
        d.source || 'ICAI Module',
        d.attempt || null,
        d.amendmentVersion || 'New Scheme 2024',
        d.questionText,
        d.optionA,
        d.optionB,
        d.optionC,
        d.optionD,
        d.correctAnswer,
        d.explanation,
        d.reference || null,
        d.status || 'published',
        adminUser,
        d.source_material_id || null
      );

      importedIds.push(id);
    }
    db.exec('COMMIT');
  } catch (txErr) {
    db.exec('ROLLBACK');
    throw txErr;
  }

  // Write audit log
  try {
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES (?, ?, 'MCQ_BULK_IMPORT_CSV', 'MCQ_QUESTION_BATCH', ?, ?, '127.0.0.1', datetime('now'))
    `).run(
      `aud_${crypto.randomBytes(8).toString('hex')}`,
      adminUser,
      importedIds[0] || 'batch',
      JSON.stringify({ importedCount: importedIds.length })
    );
  } catch (err) {
    console.warn('Audit log write note:', err);
  }

  return {
    importedCount: importedIds.length,
    importedIds,
  };
}
