import crypto from 'node:crypto';
import { db } from '../db.js';

export type DuplicateStatus =
  | 'NEW'
  | 'EXACT_DUPLICATE'
  | 'POSSIBLE_DUPLICATE'
  | 'SIMILAR'
  | 'REPLACEMENT_VERSION';

export interface MaterialIdentityInput {
  level: string;
  subjectKey: string;
  subjectName?: string;
  attempt?: string;
  materialType: string;
  mtpSeries?: any;
  paper?: string;
  version?: string;
  title?: string;
  fileBuffer?: Buffer;
  fileHash?: string;
  fileName?: string;
  rawText?: string;
  source?: string;
  language?: string;
  year?: string;
  excludeMaterialId?: string;
  overrideDuplicate?: boolean;
  overrideReason?: string;
}

export interface DuplicateCheckResult {
  status: DuplicateStatus;
  isDuplicate: boolean;
  canOverride: boolean;
  similarity: number;
  message: string;
  reason: string;
  duplicateKey: string;
  fileHash?: string | null;
  contentHash?: string | null;
  details: {
    level: string;
    subject: string;
    attempt: string;
    materialType: string;
    series?: string;
    paper?: string;
    version?: string;
    title?: string;
    year?: string;
  };
  existingMaterial: {
    id: string;
    title: string;
    materialType: string;
    attempt: string;
    paper?: string;
    mtpSeries?: any;
    version?: string;
    createdAt: string;
    fileHash?: string | null;
    contentHash?: string | null;
    status?: string;
  } | null;
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
  if (str === 'MODULE' || str.includes('STUDY')) return 'MODULE';
  return str;
}

export function formatMaterialTypeDisplay(type: any): string {
  const norm = normalizeMaterialType(type);
  switch (norm) {
    case 'MTP': return 'MTP (Mock Test Paper)';
    case 'PYQ': return 'Question Paper (PYQ)';
    case 'QUESTION_PAPER': return 'Question Paper';
    case 'SUGGESTED_ANSWER': return 'Suggested Answer';
    case 'MODEL_TEST_PAPER': return 'Model Test Paper';
    case 'RTP': return 'RTP (Revision Test Paper)';
    case 'MODULE': return 'Study Module';
    default: return norm;
  }
}

/**
 * Normalizes MTP Series input to canonical integer 1, 2, 3, 4... or null.
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
 * Normalizes extracted text safely:
 * Normalizes whitespace, repeated spaces, line breaks, page footers, common PDF artifacts.
 * STRICTLY PRESERVES:
 * - numbers, section numbers (e.g. 115BAC, 139(1))
 * - question numbers (Q1, 2(a))
 * - dates, marks, answer choices, attempts, legal provisions.
 */
export function normalizeExtractedContent(rawText: string): string {
  if (!rawText) return '';
  return rawText
    // Remove null bytes and UTF-8 BOM
    .replace(/\uFEFF/g, '')
    .replace(/\0/g, '')
    // Normalize unicode whitespace
    .replace(/[\u00A0\u1680\u180e\u2000-\u200b\u202f\u205f\u3000]/g, ' ')
    // Normalize common PDF page headers and footers safely
    .replace(/(?:^|\n)\s*(?:[-=~_*]{2,}\s*)?(?:Page|PAGE)\s*[:#-]?\s*\d+\s*(?:of|\/)?\s*\d*(?:\s*[-=~_*]{2,})?\s*(?:\n|$)/gi, '\n')
    // Remove repeated horizontal separator bars
    .replace(/^[ \t]*[-=_*~]{3,}[ \t]*$/gm, '')
    // Normalize newlines
    .replace(/\r\n|\r/g, '\n')
    // Replace 3+ consecutive newlines with 2
    .replace(/\n{3,}/g, '\n\n')
    // Replace multiple horizontal spaces/tabs with single space
    .replace(/[ \t]+/g, ' ')
    // Trim each line
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

/**
 * Computes cryptographic SHA-256 hash of a file buffer.
 */
export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Computes cryptographic SHA-256 hash of normalized text content.
 */
export function computeContentHash(normalizedText: string): string {
  return crypto.createHash('sha256').update(normalizedText.toLowerCase()).digest('hex');
}

/**
 * Tokenizes text into normalized word tokens.
 * Retains numbers, alphanumeric words, statutory sections, question identifiers.
 */
export function tokenizeText(text: string): string[] {
  if (!text) return [];
  const normalized = normalizeExtractedContent(text).toLowerCase();
  const tokens = normalized.match(/[a-z0-9_]+/g);
  return tokens || [];
}

/**
 * Computes 3-gram shingles from token list for phrase and structure comparison.
 */
function createShingles(tokens: string[], n: number = 3): Set<string> {
  const shingles = new Set<string>();
  if (tokens.length < n) {
    if (tokens.length > 0) shingles.add(tokens.join(' '));
    return shingles;
  }
  for (let i = 0; i <= tokens.length - n; i++) {
    shingles.add(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
  }
  return shingles;
}

/**
 * Calculates content similarity between two texts using token-level and shingle-level Dice/Jaccard overlap.
 * Returns percentage from 0 to 100.
 */
export function calculateContentSimilarity(textA: string, textB: string): {
  similarity: number;
  wordCountA: number;
  wordCountB: number;
  tokenOverlapRatio: number;
  shingleOverlapRatio: number;
} {
  const normA = normalizeExtractedContent(textA);
  const normB = normalizeExtractedContent(textB);

  if (!normA || !normB) {
    return { similarity: 0, wordCountA: 0, wordCountB: 0, tokenOverlapRatio: 0, shingleOverlapRatio: 0 };
  }

  // Exact match shortcut
  if (normA === normB) {
    return { similarity: 100, wordCountA: normA.length, wordCountB: normB.length, tokenOverlapRatio: 1, shingleOverlapRatio: 1 };
  }

  const tokensA = tokenizeText(normA);
  const tokensB = tokenizeText(normB);

  if (tokensA.length === 0 || tokensB.length === 0) {
    return { similarity: 0, wordCountA: 0, wordCountB: 0, tokenOverlapRatio: 0, shingleOverlapRatio: 0 };
  }

  // 1. Token frequency multiset intersection (Bag-of-Words Dice coefficient)
  const freqA = new Map<string, number>();
  for (const t of tokensA) freqA.set(t, (freqA.get(t) || 0) + 1);

  const freqB = new Map<string, number>();
  for (const t of tokensB) freqB.set(t, (freqB.get(t) || 0) + 1);

  let commonTokens = 0;
  for (const [token, countA] of freqA.entries()) {
    const countB = freqB.get(token) || 0;
    commonTokens += Math.min(countA, countB);
  }

  const tokenDice = (2 * commonTokens) / (tokensA.length + tokensB.length);

  // 2. 3-gram Shingle Jaccard overlap (captures phrase and question ordering)
  const shinglesA = createShingles(tokensA, 3);
  const shinglesB = createShingles(tokensB, 3);

  let commonShingles = 0;
  for (const shingle of shinglesA) {
    if (shinglesB.has(shingle)) commonShingles++;
  }

  const totalShinglesUnion = new Set([...shinglesA, ...shinglesB]).size;
  const shingleJaccard = totalShinglesUnion > 0 ? commonShingles / totalShinglesUnion : 0;

  // Weighted blend: 40% bag-of-words token Dice + 60% 3-gram shingle Jaccard
  const blendedScore = (0.4 * tokenDice) + (0.6 * shingleJaccard);
  const similarity = Math.round(blendedScore * 1000) / 10;

  return {
    similarity,
    wordCountA: tokensA.length,
    wordCountB: tokensB.length,
    tokenOverlapRatio: Math.round(tokenDice * 100) / 100,
    shingleOverlapRatio: Math.round(shingleJaccard * 100) / 100,
  };
}

/**
 * Computes the unique deterministic material key for structured reference.
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
    uniqueKey = `MTP:::${normalizedLevel}:::${subjectInfo.canonicalKey}:::${normAttempt}:::${seriesId}`;
  } else {
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
 * Checks SQLite evaluation_materials database using staged duplicate detection:
 *
 * Stage 1: File-level cryptographic SHA-256 hash comparison.
 * Stage 2: Content-level normalized text hash and token/shingle similarity.
 * Stage 3: Metadata scoping and version handling.
 *
 * Distinguishes:
 * - EXACT_DUPLICATE: Identical file or content (blocked)
 * - POSSIBLE_DUPLICATE: Very high similarity (>= 85%), admin reviewable, can override
 * - SIMILAR: Shared questions or concepts (40% - 84%), allowed without blocking
 * - NEW: Clean distinct material, allowed
 * - REPLACEMENT_VERSION: Updated version, allowed
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
  } = computed;

  const attemptLower = String(input.attempt || 'Current').trim().toLowerCase();
  const yearMatch = (input.attempt || '').match(/\b(20\d\d)\b/);
  const year = input.year || (yearMatch ? yearMatch[1] : undefined);

  // Compute file SHA-256 hash if buffer or hash string provided
  let computedFileHash: string | null = null;
  if (input.fileHash) {
    computedFileHash = input.fileHash.toLowerCase().trim();
  } else if (input.fileBuffer && input.fileBuffer.length > 0) {
    computedFileHash = computeFileHash(input.fileBuffer);
  }

  // Check if caller provided an admin override
  if (input.overrideDuplicate) {
    return {
      status: 'POSSIBLE_DUPLICATE',
      isDuplicate: false, // Allowed due to admin override
      canOverride: false,
      similarity: 0,
      message: 'Duplicate check overridden by administrator.',
      reason: input.overrideReason || 'Admin confirmed material is distinct or intentional version.',
      duplicateKey: uniqueKey,
      fileHash: computedFileHash,
      details: {
        level: formatLevelDisplay(normalizedLevel),
        subject: subjectDisplayName,
        attempt: input.attempt || 'Current',
        materialType: formatMaterialTypeDisplay(normalizedType),
        series: isMtp ? (seriesDisplay || undefined) : undefined,
        paper: !isMtp ? canonicalPaper : undefined,
        version: input.version,
        title: input.title,
        year,
      },
      existingMaterial: null,
    };
  }

  // =========================================================================
  // STAGE 1: File-Level Cryptographic SHA-256 Check (Exact File Duplicate)
  // =========================================================================
  if (computedFileHash) {
    try {
      let sql = `
        SELECT * FROM evaluation_materials
        WHERE (checksum = ? OR file_hash = ?)
          AND status != 'DELETED'
      `;
      const params: any[] = [computedFileHash, computedFileHash];
      if (excludeMaterialId) {
        sql += ' AND id != ?';
        params.push(excludeMaterialId);
      }
      const existingFileRow = db.prepare(sql).get(...params) as any;

      if (existingFileRow) {
        return {
          status: 'EXACT_DUPLICATE',
          isDuplicate: true,
          canOverride: false,
          similarity: 100,
          message: 'Exact duplicate detected. This file already exists.',
          reason: 'Cryptographic SHA-256 checksum is identical to existing material.',
          duplicateKey: `FILE_HASH:::${computedFileHash}`,
          fileHash: computedFileHash,
          details: {
            level: formatLevelDisplay(normalizedLevel),
            subject: subjectDisplayName,
            attempt: input.attempt || 'Current',
            materialType: formatMaterialTypeDisplay(normalizedType),
            series: isMtp ? (seriesDisplay || undefined) : undefined,
            paper: !isMtp ? canonicalPaper : undefined,
            version: input.version,
            title: input.title,
            year,
          },
          existingMaterial: {
            id: existingFileRow.id,
            title: existingFileRow.question_paper_title,
            materialType: formatMaterialTypeDisplay(existingFileRow.material_type),
            attempt: existingFileRow.attempt || 'Current',
            createdAt: existingFileRow.created_at,
            paper: existingFileRow.paper,
            mtpSeries: existingFileRow.mtp_series,
            version: existingFileRow.version,
            fileHash: existingFileRow.checksum || existingFileRow.file_hash,
            contentHash: existingFileRow.content_hash,
            status: existingFileRow.status,
          },
        };
      }
    } catch (err) {
      console.warn('[DuplicateProtection] Error checking file hash:', err);
    }
  }

  // =========================================================================
  // STAGE 2: Content-Level Normalized Text & Similarity Check
  // =========================================================================
  const rawText = input.rawText || '';
  const normalizedText = normalizeExtractedContent(rawText);

  if (normalizedText.length >= 30) {
    const computedContentHash = computeContentHash(normalizedText);

    // 2A. Exact Normalized Content Hash Check
    try {
      let sql = `
        SELECT * FROM evaluation_materials
        WHERE content_hash = ?
          AND status != 'DELETED'
      `;
      const params: any[] = [computedContentHash];
      if (excludeMaterialId) {
        sql += ' AND id != ?';
        params.push(excludeMaterialId);
      }
      const existingContentRow = db.prepare(sql).get(...params) as any;

      if (existingContentRow) {
        return {
          status: 'EXACT_DUPLICATE',
          isDuplicate: true,
          canOverride: false,
          similarity: 100,
          message: 'Exact duplicate detected. Identical material content already exists.',
          reason: 'Normalized content hash is identical to existing material.',
          duplicateKey: `CONTENT_HASH:::${computedContentHash}`,
          fileHash: computedFileHash,
          contentHash: computedContentHash,
          details: {
            level: formatLevelDisplay(normalizedLevel),
            subject: subjectDisplayName,
            attempt: input.attempt || 'Current',
            materialType: formatMaterialTypeDisplay(normalizedType),
            series: isMtp ? (seriesDisplay || undefined) : undefined,
            paper: !isMtp ? canonicalPaper : undefined,
            version: input.version,
            title: input.title,
            year,
          },
          existingMaterial: {
            id: existingContentRow.id,
            title: existingContentRow.question_paper_title,
            materialType: formatMaterialTypeDisplay(existingContentRow.material_type),
            attempt: existingContentRow.attempt || 'Current',
            createdAt: existingContentRow.created_at,
            paper: existingContentRow.paper,
            mtpSeries: existingContentRow.mtp_series,
            version: existingContentRow.version,
            fileHash: existingContentRow.checksum || existingContentRow.file_hash,
            contentHash: existingContentRow.content_hash,
            status: existingContentRow.status,
          },
        };
      }
    } catch (err) {
      console.warn('[DuplicateProtection] Error checking content hash:', err);
    }

    // 2B. Staged Candidate Text Comparison
    try {
      let candidateSql = `
        SELECT id, question_paper_title, material_type, attempt, paper, mtp_series,
               version, created_at, checksum, file_hash, content_hash, status,
               question_paper_text, suggested_answers_text
        FROM evaluation_materials
        WHERE UPPER(level) = ?
          AND status != 'DELETED'
          AND (question_paper_text IS NOT NULL OR suggested_answers_text IS NOT NULL)
      `;
      const candidateParams: any[] = [normalizedLevel];
      if (excludeMaterialId) {
        candidateSql += ' AND id != ?';
        candidateParams.push(excludeMaterialId);
      }

      const candidates = db.prepare(candidateSql).all(...candidateParams) as any[];

      let highestSimilarity = 0;
      let highestCandidate: any = null;

      for (const cand of candidates) {
        const candidateFullText = `${cand.question_paper_text || ''}\n\n${cand.suggested_answers_text || ''}`.trim();
        if (candidateFullText.length < 30) continue;

        const simResult = calculateContentSimilarity(normalizedText, candidateFullText);
        if (simResult.similarity > highestSimilarity) {
          highestSimilarity = simResult.similarity;
          highestCandidate = cand;
        }
      }

      // Evaluate similarity thresholds
      if (highestCandidate && highestSimilarity >= 98) {
        return {
          status: 'EXACT_DUPLICATE',
          isDuplicate: true,
          canOverride: false,
          similarity: highestSimilarity,
          message: 'Exact duplicate detected. This content already exists.',
          reason: `Document content matches existing material '${highestCandidate.question_paper_title}' (${highestSimilarity}% match).`,
          duplicateKey: `SIMILARITY:::${highestSimilarity}`,
          fileHash: computedFileHash,
          contentHash: computedContentHash,
          details: {
            level: formatLevelDisplay(normalizedLevel),
            subject: subjectDisplayName,
            attempt: input.attempt || 'Current',
            materialType: formatMaterialTypeDisplay(normalizedType),
            series: isMtp ? (seriesDisplay || undefined) : undefined,
            paper: !isMtp ? canonicalPaper : undefined,
            version: input.version,
            title: input.title,
            year,
          },
          existingMaterial: {
            id: highestCandidate.id,
            title: highestCandidate.question_paper_title,
            materialType: formatMaterialTypeDisplay(highestCandidate.material_type),
            attempt: highestCandidate.attempt || 'Current',
            createdAt: highestCandidate.created_at,
            paper: highestCandidate.paper,
            mtpSeries: highestCandidate.mtp_series,
            version: highestCandidate.version,
            fileHash: highestCandidate.checksum || highestCandidate.file_hash,
            contentHash: highestCandidate.content_hash,
            status: highestCandidate.status,
          },
        };
      }

      if (highestCandidate && highestSimilarity >= 85) {
        return {
          status: 'POSSIBLE_DUPLICATE',
          isDuplicate: true,
          canOverride: true,
          similarity: highestSimilarity,
          message: 'This material appears very similar to an existing material. Please review before importing.',
          reason: `High similarity (${highestSimilarity}%) detected with existing material '${highestCandidate.question_paper_title}'.`,
          duplicateKey: `SIMILARITY:::${highestSimilarity}`,
          fileHash: computedFileHash,
          contentHash: computedContentHash,
          details: {
            level: formatLevelDisplay(normalizedLevel),
            subject: subjectDisplayName,
            attempt: input.attempt || 'Current',
            materialType: formatMaterialTypeDisplay(normalizedType),
            series: isMtp ? (seriesDisplay || undefined) : undefined,
            paper: !isMtp ? canonicalPaper : undefined,
            version: input.version,
            title: input.title,
            year,
          },
          existingMaterial: {
            id: highestCandidate.id,
            title: highestCandidate.question_paper_title,
            materialType: formatMaterialTypeDisplay(highestCandidate.material_type),
            attempt: highestCandidate.attempt || 'Current',
            createdAt: highestCandidate.created_at,
            paper: highestCandidate.paper,
            mtpSeries: highestCandidate.mtp_series,
            version: highestCandidate.version,
            fileHash: highestCandidate.checksum || highestCandidate.file_hash,
            contentHash: highestCandidate.content_hash,
            status: highestCandidate.status,
          },
        };
      }

      if (highestCandidate && highestSimilarity >= 40) {
        return {
          status: 'SIMILAR',
          isDuplicate: false, // NOT blocked
          canOverride: false,
          similarity: highestSimilarity,
          message: 'Similar material found, but the uploaded material is different.',
          reason: `Overlapping topics or questions detected (${highestSimilarity}%), but the material is distinct.`,
          duplicateKey: `SIMILARITY:::${highestSimilarity}`,
          fileHash: computedFileHash,
          contentHash: computedContentHash,
          details: {
            level: formatLevelDisplay(normalizedLevel),
            subject: subjectDisplayName,
            attempt: input.attempt || 'Current',
            materialType: formatMaterialTypeDisplay(normalizedType),
            series: isMtp ? (seriesDisplay || undefined) : undefined,
            paper: !isMtp ? canonicalPaper : undefined,
            version: input.version,
            title: input.title,
            year,
          },
          existingMaterial: {
            id: highestCandidate.id,
            title: highestCandidate.question_paper_title,
            materialType: formatMaterialTypeDisplay(highestCandidate.material_type),
            attempt: highestCandidate.attempt || 'Current',
            createdAt: highestCandidate.created_at,
            paper: highestCandidate.paper,
            mtpSeries: highestCandidate.mtp_series,
            version: highestCandidate.version,
            fileHash: highestCandidate.checksum || highestCandidate.file_hash,
            contentHash: highestCandidate.content_hash,
            status: highestCandidate.status,
          },
        };
      }
    } catch (err) {
      console.warn('[DuplicateProtection] Error comparing candidate similarity:', err);
    }
  }

  // =========================================================================
  // STAGE 3: Metadata Context (Form Pre-Check / Version Inspection)
  // =========================================================================
  let existingMetaRow: any = null;
  try {
    if (isMtp) {
      let sql = `
        SELECT * FROM evaluation_materials
        WHERE UPPER(level) = ?
          AND subject_key = ?
          AND LOWER(attempt) = ?
          AND UPPER(material_type) = 'MTP'
          AND status != 'DELETED'
      `;
      const params: any[] = [normalizedLevel, computed.canonicalSubject, attemptLower];
      if (excludeMaterialId) {
        sql += ' AND id != ?';
        params.push(excludeMaterialId);
      }
      const rows = db.prepare(sql).all(...params) as any[];
      for (const r of rows) {
        if (normalizeMtpSeriesNumber(r.mtp_series) === normalizedSeriesNumber) {
          existingMetaRow = r;
          break;
        }
      }
    } else {
      let sql = `
        SELECT * FROM evaluation_materials
        WHERE UPPER(level) = ?
          AND subject_key = ?
          AND LOWER(attempt) = ?
          AND UPPER(material_type) = ?
          AND (LOWER(paper) = ? OR (paper IS NULL AND ? = 'paper 1'))
          AND status != 'DELETED'
      `;
      const params: any[] = [
        normalizedLevel,
        computed.canonicalSubject,
        attemptLower,
        normalizedType,
        canonicalPaper.toLowerCase(),
        canonicalPaper.toLowerCase(),
      ];
      if (excludeMaterialId) {
        sql += ' AND id != ?';
        params.push(excludeMaterialId);
      }
      existingMetaRow = db.prepare(sql).get(...params);
    }
  } catch {}

  if (existingMetaRow) {
    const isNewVersion = input.version && existingMetaRow.version && String(input.version).trim() !== String(existingMetaRow.version).trim();
    if (isNewVersion) {
      return {
        status: 'REPLACEMENT_VERSION',
        isDuplicate: false,
        canOverride: false,
        similarity: 0,
        message: `New version ${input.version} detected for existing ${formatMaterialTypeDisplay(normalizedType)}.`,
        reason: 'Version increment detected; allowed as new material version.',
        duplicateKey: uniqueKey,
        fileHash: computedFileHash,
        details: {
          level: formatLevelDisplay(normalizedLevel),
          subject: existingMetaRow.subject_name || subjectDisplayName,
          attempt: existingMetaRow.attempt || input.attempt || 'Current',
          materialType: formatMaterialTypeDisplay(normalizedType),
          series: isMtp ? (seriesDisplay || `Series ${existingMetaRow.mtp_series || 1}`) : undefined,
          paper: !isMtp ? (existingMetaRow.paper || canonicalPaper) : undefined,
          version: input.version,
          title: input.title,
          year,
        },
        existingMaterial: {
          id: existingMetaRow.id,
          title: existingMetaRow.question_paper_title,
          materialType: formatMaterialTypeDisplay(existingMetaRow.material_type),
          attempt: existingMetaRow.attempt || 'Current',
          createdAt: existingMetaRow.created_at,
          paper: existingMetaRow.paper,
          mtpSeries: existingMetaRow.mtp_series,
          version: existingMetaRow.version,
          fileHash: existingMetaRow.checksum || existingMetaRow.file_hash,
          contentHash: existingMetaRow.content_hash,
          status: existingMetaRow.status,
        },
      };
    }

    // Informational pre-check status: Existing material exists with same metadata,
    // but distinct files or text are ALLOWED to be uploaded!
    return {
      status: 'SIMILAR',
      isDuplicate: false, // NOT blocked
      canOverride: false,
      similarity: 0,
      message: `An existing material exists for ${subjectDisplayName} (${input.attempt || 'Current'}). You can upload a new file, distinct content, or updated version.`,
      reason: 'Metadata match found; uniqueness verified via file checksum and content comparison upon upload.',
      duplicateKey: uniqueKey,
      fileHash: computedFileHash,
      details: {
        level: formatLevelDisplay(normalizedLevel),
        subject: existingMetaRow.subject_name || subjectDisplayName,
        attempt: existingMetaRow.attempt || input.attempt || 'Current',
        materialType: formatMaterialTypeDisplay(normalizedType),
        series: isMtp ? (seriesDisplay || `Series ${existingMetaRow.mtp_series || 1}`) : undefined,
        paper: !isMtp ? (existingMetaRow.paper || canonicalPaper) : undefined,
        version: input.version,
        title: input.title,
        year,
      },
      existingMaterial: {
        id: existingMetaRow.id,
        title: existingMetaRow.question_paper_title,
        materialType: formatMaterialTypeDisplay(existingMetaRow.material_type),
        attempt: existingMetaRow.attempt || 'Current',
        createdAt: existingMetaRow.created_at,
        paper: existingMetaRow.paper,
        mtpSeries: existingMetaRow.mtp_series,
        version: existingMetaRow.version,
        fileHash: existingMetaRow.checksum || existingMetaRow.file_hash,
        contentHash: existingMetaRow.content_hash,
        status: existingMetaRow.status,
      },
    };
  }

  // Purely new material
  return {
    status: 'NEW',
    isDuplicate: false,
    canOverride: false,
    similarity: 0,
    message: 'Material is unique and ready to upload.',
    reason: 'No duplicate or conflicting material found.',
    duplicateKey: uniqueKey,
    fileHash: computedFileHash,
    details: {
      level: formatLevelDisplay(normalizedLevel),
      subject: subjectDisplayName,
      attempt: input.attempt || 'Current',
      materialType: formatMaterialTypeDisplay(normalizedType),
      series: isMtp ? (seriesDisplay || undefined) : undefined,
      paper: !isMtp ? canonicalPaper : undefined,
      version: input.version,
      title: input.title,
      year,
    },
    existingMaterial: null,
  };
}

/**
 * Initializes database columns and indices safely for staged duplicate protection.
 * Drops the false-positive unique constraint and backfills content_hash for existing materials.
 */
export function initializeMaterialDuplicateProtection(): void {
  try {
    // 1. Drop restrictive unique constraint
    db.prepare('DROP INDEX IF EXISTS idx_eval_materials_unique_identity').run();

    // 2. Ensure columns exist
    const tableInfo = db.prepare('PRAGMA table_info(evaluation_materials)').all() as Array<{ name: string }>;
    const cols = new Set(tableInfo.map((c) => c.name));

    if (!cols.has('content_hash')) {
      db.prepare('ALTER TABLE evaluation_materials ADD COLUMN content_hash TEXT').run();
    }
    if (!cols.has('file_hash')) {
      db.prepare('ALTER TABLE evaluation_materials ADD COLUMN file_hash TEXT').run();
    }
    if (!cols.has('year')) {
      db.prepare('ALTER TABLE evaluation_materials ADD COLUMN year TEXT').run();
    }
    if (!cols.has('language')) {
      db.prepare("ALTER TABLE evaluation_materials ADD COLUMN language TEXT DEFAULT 'English'").run();
    }
    if (!cols.has('source')) {
      db.prepare("ALTER TABLE evaluation_materials ADD COLUMN source TEXT DEFAULT 'ICAI'").run();
    }

    // 3. Create fast lookup indices
    db.prepare('CREATE INDEX IF NOT EXISTS idx_eval_materials_checksum ON evaluation_materials(checksum)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_eval_materials_content_hash ON evaluation_materials(content_hash)').run();

    // 4. Backfill content_hash and year for existing materials
    const rows = db.prepare(`
      SELECT id, question_paper_text, suggested_answers_text, attempt, content_hash, checksum, file_hash
      FROM evaluation_materials
      WHERE content_hash IS NULL OR content_hash = ''
    `).all() as any[];

    if (rows.length > 0) {
      const updateStmt = db.prepare('UPDATE evaluation_materials SET content_hash = ?, year = COALESCE(year, ?), file_hash = COALESCE(file_hash, ?) WHERE id = ?');
      for (const row of rows) {
        const fullText = `${row.question_paper_text || ''}\n\n${row.suggested_answers_text || ''}`.trim();
        const cHash = fullText.length >= 30 ? computeContentHash(normalizeExtractedContent(fullText)) : null;
        const yearMatch = (row.attempt || '').match(/\b(20\d\d)\b/);
        const y = yearMatch ? yearMatch[1] : null;
        updateStmt.run(cHash, y, row.checksum || null, row.id);
      }
    }
  } catch (err) {
    console.error('[DuplicateProtection] Error initializing duplicate protection:', err);
  }
}

// Backward compatibility export
export const initializeMaterialUniqueIdentity = initializeMaterialDuplicateProtection;
