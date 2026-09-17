import { db } from '../db.js';
import { getAllFirestoreDocs, setFirestoreDoc } from './firestoreDbService.js';

/**
 * Normalizes MTP Series input to canonical integer 1 or 2, or null.
 * Handles "1.0", "1", 1, "Series 1", "Series-1" -> 1
 * Handles "2.0", "2", 2, "Series 2", "Series-2" -> 2
 */
export function normalizeMtpSeries(rawSeries: any): 1 | 2 | null {
  if (rawSeries === null || rawSeries === undefined || rawSeries === '') return null;
  const str = String(rawSeries).trim().toLowerCase();
  if (str === '1' || str === '1.0' || str === 'series 1' || str === 'series-1' || str === 'series 1.0') return 1;
  if (str === '2' || str === '2.0' || str === 'series 2' || str === 'series-2' || str === 'series 2.0') return 2;
  const num = Number(str);
  if (!isNaN(num)) {
    const rounded = Math.round(num);
    if (rounded === 1) return 1;
    if (rounded === 2) return 2;
  }
  return null;
}

/**
 * Normalizes subject keys to support both UI format ('inter_advanced_accounting')
 * and enum/code format ('ADVANCED_ACCOUNTING').
 */
export function getSubjectKeyCandidates(rawKey: string, level?: string): string[] {
  if (!rawKey) return [];
  const trimmed = rawKey.trim();
  const lower = trimmed.toLowerCase();
  const upper = trimmed.toUpperCase();
  const set = new Set<string>([trimmed, lower, upper]);

  // Strip prefix like 'inter_', 'final_', 'foundation_'
  const stripped = lower.replace(/^(inter_|final_|foundation_)/, '');
  set.add(stripped);

  // Add level prefix if level is provided
  if (level) {
    const lvlLower = level.toLowerCase();
    const lvlPrefix = lvlLower.startsWith('inter') ? 'inter_' : lvlLower.startsWith('final') ? 'final_' : 'foundation_';
    set.add(`${lvlPrefix}${stripped}`);
    set.add(`${lvlPrefix}${lower}`);
  }

  // Common aliases
  if (stripped.includes('advanced_accounting') || stripped.includes('advancedaccounting') || stripped.includes('adv_acc')) {
    set.add('inter_advanced_accounting');
    set.add('ADVANCED_ACCOUNTING');
    set.add('Advanced Accounting');
  }
  if (stripped.includes('corporate') || stripped.includes('law')) {
    set.add('inter_corporate_laws');
    set.add('inter_corporate_law');
    set.add('CORPORATE_AND_OTHER_LAWS');
  }
  if (stripped.includes('cost') || stripped.includes('costing')) {
    set.add('inter_cost_accounting');
    set.add('inter_costing');
  }
  if (stripped.includes('audit')) {
    set.add('inter_auditing_ethics');
    set.add('inter_auditing');
  }
  if (stripped.includes('tax')) {
    set.add('inter_taxation');
  }
  if (stripped.includes('fm') || stripped.includes('sm')) {
    set.add('inter_fm_sm');
  }

  return Array.from(set);
}

/**
 * Inserts or updates an evaluation material record into SQLite from Firestore document.
 * Guarantees mtp_series, source_format, and reference mapping IDs are preserved.
 */
export function syncMaterialRowToSqlite(m: any): void {
  if (!m || !m.id) return;
  const canonicalSeries = normalizeMtpSeries(m.mtp_series);

  db.prepare(`
    INSERT INTO evaluation_materials (
      id, level, material_type, model_group, subject_key, subject_name,
      paper, attempt, syllabus_version, chapter_topic,
      question_paper_title, question_paper_text, suggested_answers_text,
      marking_scheme_text, reference_guidance_text, amendments_provisions_text,
      effective_date, version, status, source_type, admin_approved,
      file_id, storage_path, file_name, file_size, checksum, download_url, uploaded_by,
      mtp_series, source_format, combined_source_material_id, question_material_id,
      suggested_answer_material_id, marking_scheme_material_id, institute_id,
      approved_by, approved_at, attempt_id, attempt_code,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP
    )
    ON CONFLICT(id) DO UPDATE SET
      level = excluded.level,
      material_type = excluded.material_type,
      model_group = excluded.model_group,
      subject_key = excluded.subject_key,
      subject_name = excluded.subject_name,
      paper = excluded.paper,
      attempt = excluded.attempt,
      syllabus_version = excluded.syllabus_version,
      chapter_topic = excluded.chapter_topic,
      question_paper_title = excluded.question_paper_title,
      question_paper_text = excluded.question_paper_text,
      suggested_answers_text = excluded.suggested_answers_text,
      marking_scheme_text = excluded.marking_scheme_text,
      reference_guidance_text = excluded.reference_guidance_text,
      amendments_provisions_text = excluded.amendments_provisions_text,
      effective_date = excluded.effective_date,
      version = excluded.version,
      status = excluded.status,
      source_type = excluded.source_type,
      admin_approved = excluded.admin_approved,
      file_id = excluded.file_id,
      storage_path = excluded.storage_path,
      file_name = excluded.file_name,
      file_size = excluded.file_size,
      checksum = excluded.checksum,
      download_url = excluded.download_url,
      mtp_series = excluded.mtp_series,
      source_format = excluded.source_format,
      combined_source_material_id = excluded.combined_source_material_id,
      question_material_id = excluded.question_material_id,
      suggested_answer_material_id = excluded.suggested_answer_material_id,
      marking_scheme_material_id = excluded.marking_scheme_material_id,
      institute_id = excluded.institute_id,
      approved_by = excluded.approved_by,
      approved_at = excluded.approved_at,
      attempt_id = excluded.attempt_id,
      attempt_code = excluded.attempt_code,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    m.id,
    m.level || 'INTERMEDIATE',
    m.material_type || 'MTP',
    m.model_group || null,
    m.subject_key || '',
    m.subject_name || '',
    m.paper || 'Paper 1',
    m.attempt || 'Current',
    m.syllabus_version || 'New Scheme 2024',
    m.chapter_topic || null,
    m.question_paper_title || '',
    m.question_paper_text || '',
    m.suggested_answers_text || '',
    m.marking_scheme_text || null,
    m.reference_guidance_text || null,
    m.amendments_provisions_text || null,
    m.effective_date || null,
    m.version || '1.0',
    m.status || 'ACTIVE',
    m.source_type || 'ADMIN',
    m.admin_approved !== undefined ? (m.admin_approved ? 1 : 0) : 1,
    m.file_id || null,
    m.storage_path || null,
    m.file_name || null,
    m.file_size || null,
    m.checksum || null,
    m.download_url || null,
    m.uploaded_by || 'ADMIN',
    canonicalSeries !== null ? String(canonicalSeries) : null,
    m.source_format || 'SEPARATE',
    m.combined_source_material_id || null,
    m.question_material_id || null,
    m.suggested_answer_material_id || null,
    m.marking_scheme_material_id || null,
    m.institute_id || null,
    m.approved_by || null,
    m.approved_at || null,
    m.attempt_id || null,
    m.attempt_code || null,
    m.created_at || null
  );
}

export interface MaterialLookupOptions {
  level: string;
  subjectKey: string;
  attempt?: string;
  paper?: string;
  materialType?: string;
  mtpSeries?: any;
  sourceFormat?: string;
  isAdminApprovedRequired?: boolean;
  minTextLength?: number;
}

/**
 * Searches SQLite first, and if not found (cache miss, unhydrated, or series mismatch),
 * queries Cloud Firestore authoritatively, self-heals SQLite, and returns the verified record.
 */
export async function findAuthoritativeMaterialWithFallback(options: MaterialLookupOptions): Promise<any | null> {
  const {
    level,
    subjectKey,
    attempt,
    paper,
    materialType,
    mtpSeries,
    sourceFormat,
    isAdminApprovedRequired = false,
    minTextLength = 20,
  } = options;

  const isMtp = materialType === 'MTP';
  const isPyq = materialType === 'PYQ';
  const normalizedSeries = isMtp ? normalizeMtpSeries(mtpSeries) : null;
  const keyCandidates = getSubjectKeyCandidates(subjectKey, level);
  const keyPlaceholders = keyCandidates.map(() => '?').join(', ');

  // 1. First attempt: Query SQLite with canonical MTP series matching
  let query = `
    SELECT *
    FROM evaluation_materials
    WHERE UPPER(level) = UPPER(?) AND subject_key IN (${keyPlaceholders}) AND status = 'ACTIVE'
  `;
  const params: any[] = [String(level), ...keyCandidates];

  if (isAdminApprovedRequired) {
    query += " AND source_type = 'ADMIN' AND admin_approved = 1";
  }

  if (minTextLength > 0) {
    query += ` AND question_paper_text IS NOT NULL AND length(trim(question_paper_text)) > ${minTextLength}`;
    query += ` AND suggested_answers_text IS NOT NULL AND length(trim(suggested_answers_text)) > ${minTextLength}`;
  }

  if (attempt && attempt !== 'Current' && attempt !== 'All' && attempt !== 'Institute Series') {
    if (isPyq || isMtp) {
      query += ' AND attempt = ?';
      params.push(String(attempt));
    } else {
      query += " AND (attempt = ? OR attempt = 'All')";
      params.push(String(attempt));
    }
  }

  if (paper && paper !== 'All') {
    query += " AND (paper = ? OR paper = 'All')";
    params.push(String(paper));
  }

  if (materialType && materialType !== 'ALL') {
    query += " AND (material_type = ? OR material_type = 'ALL')";
    params.push(String(materialType));
  }

  if (isMtp && normalizedSeries) {
    // Strictly isolate Series 1 and Series 2, while tolerating int/str/float representations
    query += ' AND (mtp_series = ? OR mtp_series = ? OR CAST(mtp_series AS REAL) = ?)';
    params.push(normalizedSeries, String(normalizedSeries), normalizedSeries);
  }

  if (isPyq && sourceFormat && sourceFormat !== 'ALL') {
    query += ' AND source_format = ?';
    params.push(String(sourceFormat).toUpperCase());
  }

  query += ' ORDER BY created_at DESC LIMIT 1';

  try {
    const localHit = db.prepare(query).get(...params) as any;
    if (localHit) {
      return localHit;
    }
  } catch (sqlErr) {
    console.warn('[MaterialLookup] SQLite query error, falling back to Firestore:', sqlErr);
  }

  // 2. Authoritative Fallback: Query Cloud Firestore
  try {
    const firestoreDocs = await getAllFirestoreDocs<any>('evaluation_materials');
    for (const doc of firestoreDocs) {
      if (doc.status !== 'ACTIVE') continue;
      if (String(doc.level || '').toUpperCase() !== String(level).toUpperCase()) continue;
      if (doc.subject_key !== subjectKey && !keyCandidates.includes(doc.subject_key)) continue;

      if (isAdminApprovedRequired) {
        if (doc.source_type && doc.source_type !== 'ADMIN') continue;
        if (doc.admin_approved !== undefined && doc.admin_approved !== 1 && doc.admin_approved !== true) continue;
      }

      if (minTextLength > 0) {
        if (!doc.question_paper_text || String(doc.question_paper_text).trim().length <= minTextLength) continue;
        if (!doc.suggested_answers_text || String(doc.suggested_answers_text).trim().length <= minTextLength) continue;
      }

      if (attempt && attempt !== 'Current' && attempt !== 'All' && attempt !== 'Institute Series') {
        if (isPyq || isMtp) {
          if (doc.attempt !== attempt) continue;
        } else {
          if (doc.attempt !== attempt && doc.attempt !== 'All') continue;
        }
      }

      if (paper && paper !== 'All') {
        if (doc.paper && doc.paper !== 'All' && doc.paper !== paper) continue;
      }

      if (materialType && materialType !== 'ALL') {
        if (doc.material_type !== materialType && doc.material_type !== 'ALL') continue;
      }

      if (isMtp && normalizedSeries) {
        const docSeries = normalizeMtpSeries(doc.mtp_series);
        if (docSeries !== normalizedSeries) continue; // STRICT Series 1 vs Series 2 isolation
      }

      if (isPyq && sourceFormat && sourceFormat !== 'ALL') {
        if (doc.source_format && String(doc.source_format).toUpperCase() !== String(sourceFormat).toUpperCase()) continue;
      }

      // Found matching document in Firestore! Self-heal SQLite cache immediately.
      syncMaterialRowToSqlite(doc);

      // If Firestore doc had non-canonical mtp_series string (e.g. "1.0" or "2.0"), normalize in Firestore as well
      if (isMtp && normalizedSeries && doc.mtp_series !== normalizedSeries && doc.mtp_series !== String(normalizedSeries)) {
        try {
          await setFirestoreDoc('evaluation_materials', doc.id, { mtp_series: normalizedSeries });
        } catch {}
      }

      // Return refreshed record from SQLite (or fallback to doc)
      try {
        const healed = db.prepare(query).get(...params) as any;
        if (healed) return healed;
      } catch {}

      return doc;
    }
  } catch (fsErr) {
    console.warn('[MaterialLookup] Cloud Firestore fallback error:', fsErr);
  }

  return null;
}
