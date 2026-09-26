import crypto from 'node:crypto';
import * as XLSX from 'xlsx';
import db from '../db.js';
import {
  McqQuestion,
  McqCourse,
  McqQuestionType,
  McqDifficulty,
  McqSource,
  McqStatus,
  McqCase,
} from '../../src/types/index.js';

export interface ValidatedBulkRow {
  rowNumber: number;
  isValid: boolean;
  errors: string[];
  data: Partial<McqQuestion> & {
    caseId?: string;
    caseTitle?: string;
    caseScenario?: string;
    caseSequence?: number;
    caseDifficulty?: string;
    sourceMaterialId?: string;
    source_material_id?: string;
  };
}

export interface BulkImportPreviewResult {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  caseCount: number;
  normalCount: number;
  rows: ValidatedBulkRow[];
  detectedColumns: string[];
  casesSummary?: Array<{
    caseId: string;
    caseTitle: string;
    course: string;
    subject: string;
    chapter: string;
    questionCount: number;
    sequences: number[];
  }>;
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
 * Parses XLSX buffer into 2D string array.
 */
export function parseXlsxBuffer(buffer: Buffer): string[][] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const worksheet = workbook.Sheets[sheetName];
  const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  return rawData.map((row) => row.map((cell) => String(cell || '').trim()));
}

/**
 * Normalizes column header strings to standard field keys.
 */
export function normalizeHeader(header: string): string {
  const clean = header.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

  if (clean === 'question_id' || clean === 'qid' || clean === 'q_id') return 'question_id';
  if (clean === 'case_id' || clean === 'caseid' || clean === 'bundle_id') return 'case_id';
  if (clean === 'case_title' || clean === 'casetitle') return 'case_title';
  if (clean === 'case_scenario' || clean === 'casescenario' || clean === 'case_study' || clean === 'case_text') return 'case_scenario';
  if (clean === 'case_sequence' || clean === 'casesequence' || clean === 'case_seq' || clean === 'q_seq' || clean === 'sequence') return 'case_sequence';

  if (clean.includes('question') && !clean.includes('type') && !clean.includes('id')) return 'question_text';
  if (clean === 'a' || clean === 'option_a' || clean === 'opt_a' || clean === 'option_1') return 'option_a';
  if (clean === 'b' || clean === 'option_b' || clean === 'opt_b' || clean === 'option_2') return 'option_b';
  if (clean === 'c' || clean === 'option_c' || clean === 'opt_c' || clean === 'option_3') return 'option_c';
  if (clean === 'd' || clean === 'option_d' || clean === 'opt_d' || clean === 'option_4') return 'option_d';

  if (clean.includes('answer') || clean === 'ans' || clean === 'correct') return 'correct_answer';
  if (clean.includes('explain') || clean.includes('solution') || clean.includes('reason')) return 'explanation';
  if (clean.includes('ref') || clean.includes('section')) return 'reference';
  if (clean.includes('course') || clean.includes('level')) return 'course';
  if (clean.includes('sub') && !clean.includes('seq')) return 'subject';
  if (clean.includes('chap')) return 'chapter';
  if (clean.includes('top')) return 'topic';
  if (clean.includes('diff')) return 'difficulty';
  if (clean === 'question_type' || clean === 'q_type' || clean === 'type') return 'question_type';
  if (clean === 'source') return 'source';
  if (clean.includes('attempt') || clean.includes('year')) return 'attempt';
  if (clean.includes('applicable_from') || clean === 'from') return 'applicable_from';
  if (clean.includes('applicable_till') || clean === 'till') return 'applicable_till';
  if (clean.includes('amend') || clean.includes('scheme') || clean.includes('version')) return 'amendment_version';
  if (clean.includes('material') || clean.includes('source_mat') || clean === 'source_material_id') return 'source_material_id';

  return clean;
}

/**
 * Normalizes course string representation to canonical key.
 */
function normalizeCourse(rawCourse?: string): McqCourse | null {
  if (!rawCourse || !rawCourse.trim()) return null;
  const clean = rawCourse.toUpperCase().replace(/[\s_-]+/g, '');
  if (clean.includes('FOUNDATION')) return 'CA_FOUNDATION';
  if (clean.includes('FINAL')) return 'CA_FINAL';
  if (clean.includes('INTER')) return 'CA_INTERMEDIATE';
  return null;
}

/**
 * Validates parsed rows against MCQ constraints.
 */
export function validateBulkQuestions(
  parsedRows: string[][],
  defaultValues: {
    course?: string;
    subject?: string;
    chapter?: string;
    topic?: string;
    questionType?: string;
    difficulty?: string;
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
      caseCount: 0,
      normalCount: 0,
      rows: [],
      detectedColumns: [],
    };
  }

  // Row 0 is header row
  const rawHeaders = parsedRows[0];
  const headerKeys = rawHeaders.map(normalizeHeader);
  const dataRows = parsedRows.slice(1);

  const validatedRows: ValidatedBulkRow[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let caseCount = 0;
  let normalCount = 0;

  // Question Type & Difficulty Modes from Import Settings
  const configQType = (defaultValues.questionType || 'MIXED').toUpperCase().replace(/[\s-]+/g, '_');
  const isModeSingle = configQType === 'SINGLE' || configQType === 'NORMAL';
  const isModeCase = configQType === 'CASE_BASED' || configQType === 'CASE';
  const isModeMixedQ = configQType === 'MIXED';

  const configDiff = defaultValues.difficulty ? defaultValues.difficulty.toLowerCase().trim() : '';
  const isDiffEasy = configDiff === 'easy';
  const isDiffModerate = configDiff === 'moderate';
  const isDiffHard = configDiff === 'hard';
  const isDiffMixed = configDiff === 'mixed';

  // Intermediate bucket for Case ID consistency verification
  const caseBuckets = new Map<
    string,
    Array<{
      rowIndex: number;
      rowNumber: number;
      caseTitle: string;
      caseScenario: string;
      caseSequence: number | null;
      course: string;
      subject: string;
      chapter: string;
      difficulty: string;
    }>
  >();

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    const rowNumber = r + 2; // 1-indexed in sheet (header is row 1)
    const errors: string[] = [];

    const rowObj: Record<string, string> = {};
    for (let c = 0; c < headerKeys.length; c++) {
      rowObj[headerKeys[c]] = (row[c] || '').trim();
    }

    // 1. QUESTION TYPE VALIDATION
    // Mode Rules:
    // Single MCQ -> rows must be NORMAL.
    // Case-Based MCQ -> rows must be CASE_BASED.
    // Mixed -> file may contain both, but each row MUST have explicit questionType.
    const rawRowQType = (rowObj.question_type || '').toUpperCase().replace(/[\s-]+/g, '_');
    let resolvedQType: 'NORMAL' | 'CASE_BASED' = 'NORMAL';

    if (isModeSingle) {
      if (rawRowQType && rawRowQType !== 'NORMAL') {
        errors.push(`Row Question Type "${rowObj.question_type}" is invalid for Single MCQ import mode. All rows must be NORMAL.`);
      }
      resolvedQType = 'NORMAL';
    } else if (isModeCase) {
      if (rawRowQType && rawRowQType !== 'CASE_BASED') {
        errors.push(`Row Question Type "${rowObj.question_type}" is invalid for Case-Based MCQ import mode. All rows must be CASE_BASED.`);
      }
      resolvedQType = 'CASE_BASED';
    } else {
      // Mixed mode: row MUST contain explicit questionType
      if (!rawRowQType) {
        errors.push('Question Type is required for every row in Mixed mode (must be explicitly NORMAL or CASE_BASED).');
      } else if (rawRowQType !== 'NORMAL' && rawRowQType !== 'CASE_BASED') {
        errors.push(`Invalid Question Type "${rowObj.question_type}". In Mixed mode, Allowed values are strictly NORMAL or CASE_BASED.`);
      } else {
        resolvedQType = rawRowQType as 'NORMAL' | 'CASE_BASED';
      }
    }
    const isCaseBased = resolvedQType === 'CASE_BASED';

    // 2. METADATA PRIORITY: Row Explicit -> Import Default -> Validation Error
    const rawCourse = rowObj.course || defaultValues.course || '';
    const normCourse = normalizeCourse(rawCourse);
    if (!normCourse) {
      errors.push('Course is missing or invalid. Must be CA Foundation, CA Intermediate, or CA Final.');
    }

    const subject = rowObj.subject || defaultValues.subject || '';
    if (!subject.trim()) {
      errors.push('Subject is required. Provide in row or select in Import Defaults.');
    }

    const chapter = rowObj.chapter || defaultValues.chapter || '';
    if (!chapter.trim()) {
      errors.push('Chapter is required. Provide in row or select in Import Defaults.');
    }

    const topic = rowObj.topic || defaultValues.topic || '';
    const sourceMaterialId = rowObj.source_material_id || defaultValues.sourceMaterialId || undefined;

    // 3. CORE QUESTION FIELDS VALIDATION
    const questionText = rowObj.question_text || '';
    if (!questionText.trim()) {
      errors.push('Question text is missing.');
    }

    const optA = rowObj.option_a || '';
    const optB = rowObj.option_b || '';
    const optC = rowObj.option_c || '';
    const optD = rowObj.option_d || '';

    if (!optA.trim()) errors.push('Option A is required.');
    if (!optB.trim()) errors.push('Option B is required.');
    if (!optC.trim()) errors.push('Option C is required.');
    if (!optD.trim()) errors.push('Option D is required.');

    let ans = (rowObj.correct_answer || '').trim().toUpperCase();
    if (ans.startsWith('(') && ans.endsWith(')')) ans = ans.slice(1, -1).trim();
    if (ans === '1') ans = 'A';
    if (ans === '2') ans = 'B';
    if (ans === '3') ans = 'C';
    if (ans === '4') ans = 'D';

    if (!['A', 'B', 'C', 'D'].includes(ans)) {
      errors.push(`Invalid Correct Answer "${rowObj.correct_answer}". Must be A, B, C, or D.`);
    }

    // DIFFICULTY VALIDATION
    // If Easy -> every row must be Easy
    // If Moderate -> every row must be Moderate
    // If Hard -> every row must be Hard
    // If Mixed -> each row must provide its own explicit difficulty
    let diff: McqDifficulty = 'moderate';
    const rowDiff = (rowObj.difficulty || '').trim().toLowerCase();

    if (isDiffEasy) {
      if (rowDiff && rowDiff !== 'easy') {
        errors.push(`Row difficulty "${rowObj.difficulty}" conflicts with configured Easy difficulty mode.`);
      }
      diff = 'easy';
    } else if (isDiffModerate) {
      if (rowDiff && rowDiff !== 'moderate') {
        errors.push(`Row difficulty "${rowObj.difficulty}" conflicts with configured Moderate difficulty mode.`);
      }
      diff = 'moderate';
    } else if (isDiffHard) {
      if (rowDiff && rowDiff !== 'hard') {
        errors.push(`Row difficulty "${rowObj.difficulty}" conflicts with configured Hard difficulty mode.`);
      }
      diff = 'hard';
    } else if (isDiffMixed) {
      if (!rowDiff) {
        errors.push('Difficulty is required for every row in Mixed difficulty mode (Easy, Moderate, or Hard).');
      } else if (!['easy', 'moderate', 'hard'].includes(rowDiff)) {
        errors.push(`Invalid difficulty "${rowObj.difficulty}". Must be Easy, Moderate, or Hard.`);
      } else {
        diff = rowDiff as McqDifficulty;
      }
    } else {
      if (['easy', 'moderate', 'hard'].includes(rowDiff)) {
        diff = rowDiff as McqDifficulty;
      } else {
        diff = 'moderate';
      }
    }

    // 4. CASE-BASED VS NORMAL ARCHITECTURAL CONSTRAINTS
    const caseId = (rowObj.case_id || '').trim();
    const caseTitle = (rowObj.case_title || '').trim();
    const caseScenario = (rowObj.case_scenario || '').trim();
    const rawCaseSeq = (rowObj.case_sequence || '').trim();
    let parsedCaseSeq: number | null = null;

    if (!isCaseBased) {
      // NORMAL QUESTION CONSTRAINTS
      if (caseId) {
        errors.push(`NORMAL question must not have a Case ID (found "${caseId}"). Set Question Type to CASE_BASED or leave Case ID blank.`);
      }
      if (caseTitle) {
        errors.push('NORMAL question must not have a Case Title. Leave Case Title blank.');
      }
      if (caseScenario) {
        errors.push('NORMAL question must not have a Case Scenario. Leave Case Scenario blank.');
      }
      if (rawCaseSeq) {
        errors.push('NORMAL question must not have a Case Sequence. Leave Case Sequence blank.');
      }
    } else {
      // CASE_BASED QUESTION CONSTRAINTS (All required)
      if (!caseId) {
        errors.push('Case ID is mandatory for CASE_BASED questions (e.g. CASE-001).');
      }
      if (!caseTitle) {
        errors.push('Case Title is mandatory for CASE_BASED questions.');
      }
      if (!caseScenario) {
        errors.push('Case Scenario is mandatory for CASE_BASED questions.');
      }
      if (!rawCaseSeq) {
        errors.push('Case Sequence is mandatory for CASE_BASED questions (e.g. 1, 2, 3).');
      } else {
        parsedCaseSeq = parseInt(rawCaseSeq, 10);
        if (isNaN(parsedCaseSeq) || parsedCaseSeq < 1) {
          errors.push(`Invalid Case Sequence "${rawCaseSeq}". Must be a positive integer (1, 2, 3...).`);
        }
      }

      // Collect for batch consistency check
      if (caseId) {
        if (!caseBuckets.has(caseId)) {
          caseBuckets.set(caseId, []);
        }
        caseBuckets.get(caseId)!.push({
          rowIndex: r,
          rowNumber,
          caseTitle,
          caseScenario,
          caseSequence: parsedCaseSeq,
          course: normCourse || rawCourse,
          subject,
          chapter,
          difficulty: diff,
        });
      }
    }

    const explanation = rowObj.explanation?.trim() || `Option (${ans}) is the correct answer according to ICAI syllabus provisions.`;
    const reference = rowObj.reference?.trim() || '';

    // SOURCE CATEGORY & CONDITIONAL ATTEMPT
    // Canonical sources: RTP, MTP, PYQ, ICAI Module, Self-Created, Conceptual Practice, Practical, Other
    const rawSource = rowObj.source?.trim() || defaultValues.source?.trim() || 'ICAI Module';
    let source: McqSource = 'ICAI Module';
    const cleanSource = rawSource.toLowerCase().replace(/[\s_-]+/g, '');
    if (cleanSource === 'rtp') source = 'RTP';
    else if (cleanSource === 'mtp') source = 'MTP';
    else if (cleanSource === 'pyq') source = 'PYQ';
    else if (cleanSource.includes('selfcreated') || cleanSource.includes('self')) source = 'Self-Created';
    else if (cleanSource.includes('conceptualpractice') || cleanSource.includes('conceptual')) source = 'Conceptual Practice';
    else if (cleanSource.includes('practical')) source = 'Practical';
    else if (cleanSource.includes('module') || cleanSource.includes('icai')) source = 'ICAI Module';
    else if (cleanSource === 'other') source = 'Other';
    else source = 'ICAI Module';

    // Attempt / Year ONLY when source is RTP, MTP, or PYQ
    const isAttemptReq = source === 'RTP' || source === 'MTP' || source === 'PYQ';
    const attempt = isAttemptReq ? (rowObj.attempt?.trim() || defaultValues.attempt?.trim() || 'May 2026') : undefined;
    const amendmentVersion = rowObj.amendment_version?.trim() || 'New Scheme 2024';

    validatedRows.push({
      rowNumber,
      isValid: errors.length === 0,
      errors,
      data: {
        id: rowObj.question_id || undefined,
        course: normCourse || 'CA_INTERMEDIATE',
        subject,
        chapter,
        topic: topic === 'Not Applicable' ? undefined : (topic || undefined),
        questionType: (isCaseBased ? 'case_based' : 'normal') as McqQuestionType,
        caseId: isCaseBased ? caseId : undefined,
        caseTitle: isCaseBased ? caseTitle : undefined,
        caseSequence: isCaseBased && parsedCaseSeq ? parsedCaseSeq : undefined,
        caseStudyScenario: isCaseBased ? caseScenario : undefined,
        difficulty: diff as McqDifficulty,
        source,
        attempt,
        applicableFrom: rowObj.applicable_from || undefined,
        applicableTill: rowObj.applicable_till || undefined,
        amendmentVersion,
        questionText,
        optionA: optA,
        optionB: optB,
        optionC: optC,
        optionD: optD,
        correctAnswer: ans as 'A' | 'B' | 'C' | 'D',
        explanation,
        reference,
        status: 'draft',
        sourceMaterialId,
        source_material_id: sourceMaterialId,
      },
    });
  }

  // 5. CASE ID CONSISTENCY AND DUPLICATE SEQUENCE VERIFICATION
  const casesSummary: Array<{
    caseId: string;
    caseTitle: string;
    course: string;
    subject: string;
    chapter: string;
    questionCount: number;
    sequences: number[];
  }> = [];

  for (const [cId, rowsInCase] of caseBuckets.entries()) {
    const first = rowsInCase[0];
    const seenSequences = new Map<number, number>();
    const seqList: number[] = [];

    for (const item of rowsInCase) {
      const targetRow = validatedRows[item.rowIndex];

      // Inconsistent Course
      if (item.course && first.course && item.course !== first.course) {
        const firstRow = validatedRows[first.rowIndex];
        const msg = `Case ID "${cId}" has inconsistent Course across questions (${item.course} vs ${first.course}). All questions under the same Case ID must have the same course.`;
        targetRow.errors.push(msg);
        targetRow.isValid = false;
        if (!firstRow.errors.includes(msg)) {
          firstRow.errors.push(msg);
          firstRow.isValid = false;
        }
      }

      // Inconsistent Subject
      if (item.subject && first.subject && item.subject.toLowerCase() !== first.subject.toLowerCase()) {
        const firstRow = validatedRows[first.rowIndex];
        const msg = `Case ID "${cId}" has inconsistent Subject ("${item.subject}" vs "${first.subject}"). All questions under the same Case ID must belong to the same Subject.`;
        targetRow.errors.push(msg);
        targetRow.isValid = false;
        if (!firstRow.errors.includes(msg)) {
          firstRow.errors.push(msg);
          firstRow.isValid = false;
        }
      }

      // Inconsistent Title
      if (item.caseTitle && first.caseTitle && item.caseTitle.toLowerCase() !== first.caseTitle.toLowerCase()) {
        const firstRow = validatedRows[first.rowIndex];
        const msg = `Case ID "${cId}" has conflicting Case Titles ("${item.caseTitle}" vs "${first.caseTitle}"). All questions for Case ID "${cId}" must share the identical title.`;
        targetRow.errors.push(msg);
        targetRow.isValid = false;
        if (!firstRow.errors.includes(msg)) {
          firstRow.errors.push(msg);
          firstRow.isValid = false;
        }
      }

      // Duplicate sequence check
      if (item.caseSequence != null) {
        seqList.push(item.caseSequence);
        if (seenSequences.has(item.caseSequence)) {
          const prevRowIndex = seenSequences.get(item.caseSequence)!;
          const prevRow = validatedRows[prevRowIndex];
          const dupMsg = `Duplicate Case Sequence ${item.caseSequence} in Case ID "${cId}". Each question in the case bundle must have a unique sequence number.`;
          targetRow.errors.push(dupMsg);
          targetRow.isValid = false;
          if (!prevRow.errors.includes(dupMsg)) {
            prevRow.errors.push(dupMsg);
            prevRow.isValid = false;
          }
        } else {
          seenSequences.set(item.caseSequence, item.rowIndex);
        }
      }
    }

    casesSummary.push({
      caseId: cId,
      caseTitle: first.caseTitle,
      course: first.course,
      subject: first.subject,
      chapter: first.chapter,
      questionCount: rowsInCase.length,
      sequences: seqList.sort((a, b) => a - b),
    });
  }

  // Recalculate totals
  validCount = validatedRows.filter((r) => r.isValid).length;
  invalidCount = validatedRows.length - validCount;
  caseCount = casesSummary.length;
  normalCount = validatedRows.filter((r) => r.data.questionType === 'normal').length;

  return {
    totalRows: dataRows.length,
    validCount,
    invalidCount,
    caseCount,
    normalCount,
    rows: validatedRows,
    detectedColumns: headerKeys,
    casesSummary,
  };
}

/**
 * Commits pre-validated questions into canonical mcq_cases and mcq_questions tables.
 * Supports importing as 'draft' (Step 5) or 'published' (Step 7).
 */
export function commitBulkQuestions(
  validRows: ValidatedBulkRow[],
  adminUser: string = 'MCQ_ADMIN',
  targetStatus: 'draft' | 'published' = 'draft'
): { importedCount: number; casesCount: number; importedIds: string[] } {
  const insertCaseStmt = db.prepare(`
    INSERT INTO mcq_cases (
      case_id, case_title, case_scenario, case_difficulty, course, subject,
      chapter, topic, source, attempt, applicable_from, applicable_till,
      amendment_version, generation_method, status, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, 'IMPORTED', ?, ?, datetime('now'), datetime('now')
    )
    ON CONFLICT(case_id) DO UPDATE SET
      case_title = excluded.case_title,
      case_scenario = excluded.case_scenario,
      case_difficulty = excluded.case_difficulty,
      course = excluded.course,
      subject = excluded.subject,
      chapter = excluded.chapter,
      topic = excluded.topic,
      generation_method = 'IMPORTED',
      status = excluded.status,
      updated_at = datetime('now')
  `);

  const insertQuestionStmt = db.prepare(`
    INSERT INTO mcq_questions (
      id, course, subject, chapter, topic, question_type,
      case_id, case_sequence, case_study_scenario,
      difficulty, source, attempt, applicable_from, applicable_till, amendment_version,
      generation_method,
      question_text, option_a, option_b, option_c, option_d,
      correct_answer, explanation, reference, status, created_by,
      source_material_id, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      'IMPORTED',
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, datetime('now'), datetime('now')
    )
  `);

  const importedIds: string[] = [];
  const processedCaseIds = new Set<string>();

  db.exec('BEGIN TRANSACTION');
  try {
    for (const r of validRows) {
      if (!r.isValid) continue;
      const d = r.data;

      // 1. If Case-Based, upsert parent Case Bundle first
      if (d.questionType === 'case_based' && d.caseId && !processedCaseIds.has(d.caseId)) {
        insertCaseStmt.run(
          d.caseId,
          d.caseTitle || `Case Study ${d.caseId}`,
          d.caseStudyScenario || '',
          d.difficulty || 'moderate',
          d.course || 'CA_INTERMEDIATE',
          d.subject || 'Corporate and Other Laws',
          d.chapter || 'General',
          d.topic || null,
          d.source || 'ICAI Module',
          d.attempt || 'May 2026',
          d.applicableFrom || null,
          d.applicableTill || null,
          d.amendmentVersion || 'New Scheme 2024',
          targetStatus,
          adminUser
        );
        processedCaseIds.add(d.caseId);
      }

      // 2. Insert child Question
      const qId = d.id && !d.id.startsWith('row_') ? d.id : `mcq_${crypto.randomBytes(8).toString('hex')}`;

      insertQuestionStmt.run(
        qId,
        d.course || 'CA_INTERMEDIATE',
        d.subject || 'Corporate and Other Laws',
        d.chapter || 'Chapter 1',
        d.topic || null,
        d.questionType || 'normal',
        d.caseId || null,
        d.caseSequence != null ? d.caseSequence : null,
        d.caseStudyScenario || null,
        d.difficulty || 'moderate',
        d.source || 'ICAI Module',
        d.attempt || 'May 2026',
        d.applicableFrom || null,
        d.applicableTill || null,
        d.amendmentVersion || 'New Scheme 2024',
        d.questionText,
        d.optionA,
        d.optionB,
        d.optionC,
        d.optionD,
        d.correctAnswer,
        d.explanation,
        d.reference || null,
        targetStatus,
        adminUser,
        d.sourceMaterialId || d.source_material_id || null
      );

      importedIds.push(qId);
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
      VALUES (?, ?, 'MCQ_BULK_IMPORT', 'MCQ_QUESTION_BATCH', ?, ?, '127.0.0.1', datetime('now'))
    `).run(
      `aud_${crypto.randomBytes(8).toString('hex')}`,
      adminUser,
      importedIds[0] || 'batch',
      JSON.stringify({
        importedQuestions: importedIds.length,
        importedCases: processedCaseIds.size,
        status: targetStatus,
      })
    );
  } catch (err) {
    console.warn('Audit log write note:', err);
  }

  return {
    importedCount: importedIds.length,
    casesCount: processedCaseIds.size,
    importedIds,
  };
}

/**
 * Standard CSV template content covering NORMAL and CASE_BASED questions.
 */
export const CANONICAL_CSV_TEMPLATE = `Question ID,Case ID,Case Title,Case Scenario,Case Sequence,Question Text,Option A,Option B,Option C,Option D,Correct Answer,Explanation,Reference,Course,Subject,Chapter,Topic,Difficulty,Question Type,Source,Attempt,Applicable From,Applicable Till,Amendment Version
Q-N-001,,,,,"Under Section 2(46) of the Companies Act 2013, a holding company in relation to one or more other companies means:","A company of which such companies are subsidiary companies","A company holding more than 20% shares","A company whose directors control another board","Any listed entity",A,"As per Section 2(46), holding company means a company of which such companies are subsidiary companies.","Companies Act 2013 Sec 2(46)",CA Intermediate,Corporate and Other Laws,Preliminary - Sec 1 to 2,Company Classification,Moderate,NORMAL,ICAI Module,May 2026,2024-05-01,2028-12-31,New Scheme 2024
Q-C-001,CASE-001,ABC Ltd Compliance Case,"ABC Ltd is an unlisted public company having a paid-up share capital of Rs. 10 Crores and turnover of Rs. 120 Crores during the preceding financial year. The Board consists of 6 directors. The company proposes to hold an Extraordinary General Meeting (EGM) upon requisition received from members holding 12% of the paid-up capital on 10th January.",1,"Based on the facts above, which statutory provision governs the calling of an EGM on requisition?","Section 96 of Companies Act 2013","Section 100 of Companies Act 2013","Section 108 of Companies Act 2013","Section 111 of Companies Act 2013",B,"Section 100 provides that the Board shall call an EGM on the requisition of members holding not less than one-tenth of paid-up share capital.","Companies Act 2013 Sec 100",CA Intermediate,Corporate and Other Laws,Management and Administration - Sec 88 to 122,Annual General Meeting (AGM) & EGM,Moderate,CASE_BASED,ICAI Module,May 2026,2024-05-01,2028-12-31,New Scheme 2024
Q-C-002,CASE-001,ABC Ltd Compliance Case,"ABC Ltd is an unlisted public company having a paid-up share capital of Rs. 10 Crores and turnover of Rs. 120 Crores during the preceding financial year. The Board consists of 6 directors. The company proposes to hold an Extraordinary General Meeting (EGM) upon requisition received from members holding 12% of the paid-up capital on 10th January.",2,"Within what time period from the date of receipt of a valid requisition must the Board proceed to call the meeting?","Within 21 days","Within 30 days","Within 45 days","Within 60 days",A,"Under Section 100(2), the Board must within 21 days from the date of receipt of a valid requisition proceed to call a meeting on a day not later than 45 days.","Companies Act 2013 Sec 100(2)",CA Intermediate,Corporate and Other Laws,Management and Administration - Sec 88 to 122,Annual General Meeting (AGM) & EGM,Moderate,CASE_BASED,ICAI Module,May 2026,2024-05-01,2028-12-31,New Scheme 2024`;
