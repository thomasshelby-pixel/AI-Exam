import { db } from '../db.js';

export interface MaterialIdentityInput {
  level: string;
  subjectKey: string;
  subjectName?: string;
  attempt: string;
  materialType: string;
  mtpSeries?: any;
  paper?: string;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  message: string;
  duplicateKey: string;
  details: {
    level: string;
    subject: string;
    attempt: string;
    materialType: string;
    series?: string;
    paper?: string;
  };
  existingMaterial: any | null;
}

// Master subject definition map for all 3 CA levels
export const CA_SUBJECTS_CATALOG: Record<string, { key: string; name: string; paper: string; level: string }> = {
  // Foundation
  'foundation_accounting': { key: 'foundation_accounting', name: 'Accounting', paper: 'Paper 1', level: 'FOUNDATION' },
  'foundation_business_laws': { key: 'foundation_business_laws', name: 'Business Laws', paper: 'Paper 2', level: 'FOUNDATION' },
  'foundation_quantitative_aptitude': { key: 'foundation_quantitative_aptitude', name: 'Quantitative Aptitude', paper: 'Paper 3', level: 'FOUNDATION' },
  'foundation_business_economics': { key: 'foundation_business_economics', name: 'Business Economics', paper: 'Paper 4', level: 'FOUNDATION' },

  // Intermediate
  'inter_advanced_accounting': { key: 'inter_advanced_accounting', name: 'Advanced Accounting', paper: 'Paper 1', level: 'INTERMEDIATE' },
  'inter_corporate_laws': { key: 'inter_corporate_laws', name: 'Corporate and Other Laws', paper: 'Paper 2', level: 'INTERMEDIATE' },
  'inter_taxation': { key: 'inter_taxation', name: 'Taxation (Income Tax & GST)', paper: 'Paper 3', level: 'INTERMEDIATE' },
  'inter_cost_accounting': { key: 'inter_cost_accounting', name: 'Cost and Management Accounting', paper: 'Paper 4', level: 'INTERMEDIATE' },
  'inter_auditing_ethics': { key: 'inter_auditing_ethics', name: 'Auditing and Ethics', paper: 'Paper 5', level: 'INTERMEDIATE' },
  'inter_fm_sm': { key: 'inter_fm_sm', name: 'Financial Management and Strategic Management', paper: 'Paper 6', level: 'INTERMEDIATE' },

  // Final
  'final_financial_reporting': { key: 'final_financial_reporting', name: 'Financial Reporting (Ind AS)', paper: 'Paper 1', level: 'FINAL' },
  'final_afm': { key: 'final_afm', name: 'Advanced Financial Management', paper: 'Paper 2', level: 'FINAL' },
  'final_advanced_auditing': { key: 'final_advanced_auditing', name: 'Advanced Auditing and Professional Ethics', paper: 'Paper 3', level: 'FINAL' },
  'final_direct_tax': { key: 'final_direct_tax', name: 'Direct Tax Laws and International Taxation', paper: 'Paper 4', level: 'FINAL' },
  'final_indirect_tax': { key: 'final_indirect_tax', name: 'Indirect Tax Laws (GST & Customs)', paper: 'Paper 5', level: 'FINAL' },
  'final_integrated_business_solutions': { key: 'final_integrated_business_solutions', name: 'Integrated Business Solutions', paper: 'Paper 6', level: 'FINAL' },
};

export function normalizeLevel(rawLevel: any): 'FOUNDATION' | 'INTERMEDIATE' | 'FINAL' {
  if (!rawLevel) return 'INTERMEDIATE';
  const str = String(rawLevel).trim().toUpperCase();
  if (str.includes('FINAL')) return 'FINAL';
  if (str.includes('FOUNDATION')) return 'FOUNDATION';
  return 'INTERMEDIATE';
}

export function formatLevelDisplay(level: any): string {
  const norm = normalizeLevel(level);
  switch (norm) {
    case 'FOUNDATION': return 'CA Foundation';
    case 'FINAL': return 'CA Final';
    case 'INTERMEDIATE': default: return 'CA Intermediate';
  }
}

export function normalizeMaterialType(rawType: any): string {
  if (!rawType) return 'MTP';
  const str = String(rawType).trim().toUpperCase();
  if (str === 'MTP' || str.includes('MOCK')) return 'MTP';
  if (str === 'PYQ' || str.includes('PAST')) return 'PYQ';
  if (str === 'QUESTION_PAPER' || str === 'QUESTION PAPER' || str === 'QP') return 'QUESTION_PAPER';
  if (str === 'SUGGESTED_ANSWER' || str === 'SUGGESTED_ANSWERS' || str === 'SUGGESTED ANSWER' || str === 'SA') return 'SUGGESTED_ANSWER';
  if (str === 'MODEL_TEST_PAPER' || str === 'MODEL' || str === 'MODEL TEST PAPER') return 'MODEL_TEST_PAPER';
  if (str === 'RTP' || str.includes('REVISION')) return 'RTP';
  return str;
}

export function formatMaterialTypeDisplay(type: any): string {
  const norm = normalizeMaterialType(type);
  switch (norm) {
    case 'MTP': return 'MTP';
    case 'PYQ': return 'Question Paper (PYQ)';
    case 'QUESTION_PAPER': return 'Question Paper';
    case 'SUGGESTED_ANSWER': return 'Suggested Answer';
    case 'MODEL_TEST_PAPER': return 'Model Test Paper';
    case 'RTP': return 'RTP (Revision Test Paper)';
    default: return norm;
  }
}

/**
 * Normalizes MTP Series input to canonical integer 1, 2, 3, 4... or null.
 * Handles "Series 1", "series 1", "SERIES 1", "series-1", "s1", "1", "1.0", 1 -> 1
 */
export function normalizeMtpSeriesNumber(rawSeries: any): number | null {
  if (rawSeries === null || rawSeries === undefined || rawSeries === '') return null;
  const str = String(rawSeries).trim().toLowerCase();
  const match = str.match(/(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num > 0) return num;
  }
  return null;
}

export function formatMtpSeriesDisplay(seriesNumber: number | null | undefined): string {
  if (!seriesNumber) return 'Series 1';
  return `Series ${seriesNumber}`;
}

export function formatMtpSeriesId(seriesNumber: number | null | undefined): string {
  if (!seriesNumber) return 'series-1';
  return `series-${seriesNumber}`;
}

/**
 * Resolves subject key and name to canonical key and display name.
 */
export function resolveCanonicalSubject(rawKey: any, rawName?: any, level?: string): { canonicalKey: string; displayName: string; candidates: string[] } {
  const normLevel = normalizeLevel(level);
  const keyStr = String(rawKey || '').trim().toLowerCase();
  const nameStr = String(rawName || '').trim();

  // 1. Direct match in catalog
  if (CA_SUBJECTS_CATALOG[keyStr]) {
    const entry = CA_SUBJECTS_CATALOG[keyStr];
    return {
      canonicalKey: entry.key,
      displayName: entry.name,
      candidates: generateCandidates(entry.key, entry.name, normLevel),
    };
  }

  // 2. Search catalog by level and matching key or name
  for (const entry of Object.values(CA_SUBJECTS_CATALOG)) {
    if (entry.level === normLevel) {
      if (
        keyStr.includes(entry.key) ||
        entry.key.includes(keyStr) ||
        (nameStr && (entry.name.toLowerCase().includes(nameStr.toLowerCase()) || nameStr.toLowerCase().includes(entry.name.toLowerCase())))
      ) {
        return {
          canonicalKey: entry.key,
          displayName: entry.name,
          candidates: generateCandidates(entry.key, entry.name, normLevel),
        };
      }
    }
  }

  // 3. Fallback for custom or unlisted subject
  const fallbackKey = keyStr || nameStr.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'subject_default';
  const fallbackName = nameStr || keyStr || 'Subject';
  return {
    canonicalKey: fallbackKey,
    displayName: fallbackName,
    candidates: generateCandidates(fallbackKey, fallbackName, normLevel),
  };
}

function generateCandidates(canonicalKey: string, displayName: string, level: string): string[] {
  const set = new Set<string>();
  set.add(canonicalKey);
  set.add(canonicalKey.toUpperCase());
  set.add(displayName);
  const stripped = canonicalKey.replace(/^(inter_|final_|foundation_)/, '');
  set.add(stripped);
  set.add(stripped.toUpperCase());

  const lvlPrefix = level === 'INTERMEDIATE' ? 'inter_' : level === 'FINAL' ? 'final_' : 'foundation_';
  set.add(`${lvlPrefix}${stripped}`);
  set.add(`${lvlPrefix}${stripped}`.toUpperCase());

  // Inter Aliases
  if (stripped.includes('advanced_accounting') || stripped.includes('accounting')) {
    set.add('inter_advanced_accounting');
    set.add('ADVANCED_ACCOUNTING');
    set.add('Advanced Accounting');
  }
  if (stripped.includes('corporate') || stripped.includes('law')) {
    set.add('inter_corporate_laws');
    set.add('Corporate and Other Laws');
  }
  if (stripped.includes('tax')) {
    set.add('inter_taxation');
    set.add('Taxation (Income Tax & GST)');
    set.add('Taxation');
  }
  if (stripped.includes('cost')) {
    set.add('inter_cost_accounting');
    set.add('Cost and Management Accounting');
  }
  if (stripped.includes('audit')) {
    set.add('inter_auditing_ethics');
    set.add('Auditing and Ethics');
  }
  if (stripped.includes('fm') || stripped.includes('sm')) {
    set.add('inter_fm_sm');
    set.add('Financial Management and Strategic Management');
  }

  return Array.from(set);
}

/**
 * Computes the unique deterministic material key.
 * 
 * Rules:
 * MTP Identity: level + subject + attempt + materialType(=MTP) + series
 * Non-MTP Identity: level + subject + attempt + materialType + paper
 */
export function computeMaterialUniqueKey(input: MaterialIdentityInput): {
  uniqueKey: string;
  isMtp: boolean;
  normalizedLevel: 'FOUNDATION' | 'INTERMEDIATE' | 'FINAL';
  normalizedType: string;
  normalizedSeriesNumber: number | null;
  seriesId: string | null;
  seriesDisplay: string | null;
  canonicalPaper: string;
  canonicalSubject: string;
  subjectDisplayName: string;
  candidateKeys: string[];
} {
  const normalizedLevel = normalizeLevel(input.level);
  const normalizedType = normalizeMaterialType(input.materialType);
  const isMtp = normalizedType === 'MTP';

  const subjectInfo = resolveCanonicalSubject(input.subjectKey, input.subjectName, normalizedLevel);
  const normAttempt = String(input.attempt || 'Current').trim().toLowerCase();

  let normalizedSeriesNumber: number | null = null;
  let seriesId: string | null = null;
  let seriesDisplay: string | null = null;

  let canonicalPaper = (input.paper || 'Paper 1').trim();
  if (!canonicalPaper) canonicalPaper = 'Paper 1';

  let uniqueKey = '';

  if (isMtp) {
    normalizedSeriesNumber = normalizeMtpSeriesNumber(input.mtpSeries);
    seriesId = formatMtpSeriesId(normalizedSeriesNumber);
    seriesDisplay = formatMtpSeriesDisplay(normalizedSeriesNumber);

    // MTP Unique key includes level + subject + attempt + MTP + seriesId
    uniqueKey = `MTP:::${normalizedLevel}:::${subjectInfo.canonicalKey}:::${normAttempt}:::${seriesId}`;
  } else {
    // Non-MTP Unique key includes level + subject + attempt + type + paper
    uniqueKey = `${normalizedType}:::${normalizedLevel}:::${subjectInfo.canonicalKey}:::${normAttempt}:::${canonicalPaper.toLowerCase()}`;
  }

  return {
    uniqueKey,
    isMtp,
    normalizedLevel,
    normalizedType,
    normalizedSeriesNumber,
    seriesId,
    seriesDisplay,
    canonicalPaper,
    canonicalSubject: subjectInfo.canonicalKey,
    subjectDisplayName: subjectInfo.displayName,
    candidateKeys: subjectInfo.candidates,
  };
}

/**
 * Checks SQLite evaluation_materials database for any existing duplicate material.
 * Does NOT require file upload and returns complete user-friendly duplicate details.
 */
export function checkMaterialDuplicate(
  input: MaterialIdentityInput,
  excludeMaterialId?: string
): DuplicateCheckResult {
  const computed = computeMaterialUniqueKey(input);
  const {
    uniqueKey,
    isMtp,
    normalizedLevel,
    normalizedType,
    normalizedSeriesNumber,
    seriesDisplay,
    canonicalPaper,
    subjectDisplayName,
    candidateKeys,
  } = computed;

  const attemptLower = String(input.attempt || 'Current').trim().toLowerCase();

  // 1. Direct query on unique_identity_key
  let existingRow: any = null;
  try {
    let sql = `
      SELECT * FROM evaluation_materials
      WHERE unique_identity_key = ?
        AND status != 'DELETED'
    `;
    const params: any[] = [uniqueKey];
    if (excludeMaterialId) {
      sql += ' AND id != ?';
      params.push(excludeMaterialId);
    }
    existingRow = db.prepare(sql).get(...params);
  } catch {
    // Table or column may be uninitialized, fallback below
  }

  // 2. Comprehensive composite attribute fallback check
  if (!existingRow) {
    const placeholders = candidateKeys.map(() => '?').join(', ');
    if (isMtp) {
      // Must match level + subject + attempt + MTP + series
      let sql = `
        SELECT * FROM evaluation_materials
        WHERE UPPER(level) = ?
          AND subject_key IN (${placeholders})
          AND LOWER(attempt) = ?
          AND UPPER(material_type) = 'MTP'
          AND status != 'DELETED'
      `;
      const params: any[] = [normalizedLevel, ...candidateKeys, attemptLower];

      if (excludeMaterialId) {
        sql += ' AND id != ?';
        params.push(excludeMaterialId);
      }

      const rows = db.prepare(sql).all(...params) as any[];
      // Find row matching the normalized series
      for (const row of rows) {
        const rowSeries = normalizeMtpSeriesNumber(row.mtp_series);
        if (rowSeries === normalizedSeriesNumber) {
          existingRow = row;
          break;
        }
      }
    } else {
      // Must match level + subject + attempt + materialType + paper
      let sql = `
        SELECT * FROM evaluation_materials
        WHERE UPPER(level) = ?
          AND subject_key IN (${placeholders})
          AND LOWER(attempt) = ?
          AND UPPER(material_type) = ?
          AND (LOWER(paper) = ? OR (paper IS NULL AND ? = 'paper 1'))
          AND status != 'DELETED'
      `;
      const params: any[] = [
        normalizedLevel,
        ...candidateKeys,
        attemptLower,
        normalizedType,
        canonicalPaper.toLowerCase(),
        canonicalPaper.toLowerCase(),
      ];

      if (excludeMaterialId) {
        sql += ' AND id != ?';
        params.push(excludeMaterialId);
      }

      existingRow = db.prepare(sql).get(...params);
    }
  }

  if (existingRow) {
    const message = isMtp
      ? 'This MTP is already uploaded for the selected subject, attempt and Series.'
      : 'This material is already uploaded.';

    return {
      isDuplicate: true,
      message,
      duplicateKey: uniqueKey,
      details: {
        level: formatLevelDisplay(normalizedLevel),
        subject: existingRow.subject_name || subjectDisplayName,
        attempt: existingRow.attempt || input.attempt,
        materialType: isMtp ? 'MTP' : formatMaterialTypeDisplay(normalizedType),
        series: isMtp ? (seriesDisplay || `Series ${existingRow.mtp_series || 1}`) : undefined,
        paper: !isMtp ? (existingRow.paper || canonicalPaper) : undefined,
      },
      existingMaterial: {
        id: existingRow.id,
        title: existingRow.question_paper_title,
        createdAt: existingRow.created_at,
        paper: existingRow.paper,
        mtpSeries: existingRow.mtp_series,
        status: existingRow.status,
      },
    };
  }

  return {
    isDuplicate: false,
    message: 'Material is unique and can be uploaded.',
    duplicateKey: uniqueKey,
    details: {
      level: formatLevelDisplay(normalizedLevel),
      subject: subjectDisplayName,
      attempt: input.attempt,
      materialType: isMtp ? 'MTP' : formatMaterialTypeDisplay(normalizedType),
      series: isMtp ? (seriesDisplay || undefined) : undefined,
      paper: !isMtp ? canonicalPaper : undefined,
    },
    existingMaterial: null,
  };
}

/**
 * Initializes database column and unique index for atomic duplicate prevention.
 * Migrates existing materials safely without corrupting any record.
 */
export function initializeMaterialUniqueIdentity(): void {
  try {
    // 1. Add unique_identity_key column if not present
    const tableInfo = db.prepare("PRAGMA table_info(evaluation_materials)").all() as Array<{ name: string }>;
    const hasCol = tableInfo.some((col) => col.name === 'unique_identity_key');
    if (!hasCol) {
      db.prepare("ALTER TABLE evaluation_materials ADD COLUMN unique_identity_key TEXT").run();
      console.log('[DuplicateProtection] Added unique_identity_key column to evaluation_materials');
    }

    // 2. Backfill existing records
    const rows = db.prepare(`
      SELECT id, level, material_type, subject_key, subject_name, paper, attempt, mtp_series
      FROM evaluation_materials
      WHERE unique_identity_key IS NULL OR unique_identity_key = ''
    `).all() as any[];

    if (rows.length > 0) {
      console.log(`[DuplicateProtection] Backfilling unique_identity_key for ${rows.length} materials...`);
      const updateStmt = db.prepare('UPDATE evaluation_materials SET unique_identity_key = ? WHERE id = ?');
      const seenKeys = new Set<string>();

      for (const row of rows) {
        const computed = computeMaterialUniqueKey({
          level: row.level,
          subjectKey: row.subject_key,
          subjectName: row.subject_name,
          attempt: row.attempt,
          materialType: row.material_type,
          mtpSeries: row.mtp_series,
          paper: row.paper,
        });

        let finalKey = computed.uniqueKey;
        // In the extremely rare event of existing duplicate rows in historical data, append id suffix so migration never fails
        if (seenKeys.has(finalKey)) {
          finalKey = `${finalKey}:::legacy_${row.id}`;
        }
        seenKeys.add(finalKey);
        updateStmt.run(finalKey, row.id);
      }
      console.log('[DuplicateProtection] Successfully backfilled unique_identity_key on existing materials.');
    }

    // 3. Create unique index for atomic database-level enforcement
    db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_eval_materials_unique_identity
      ON evaluation_materials(unique_identity_key)
    `).run();
    console.log('[DuplicateProtection] Verified unique index idx_eval_materials_unique_identity');
  } catch (err) {
    console.error('[DuplicateProtection] Error initializing unique material constraint:', err);
  }
}
