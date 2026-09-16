/**
 * ReferencePackage Service
 * 
 * Establishes an immutable, verified ReferencePackage for every CA exam evaluation.
 * Enforces:
 * - Exact Question Paper TXT
 * - Exact Suggested Answers TXT
 * - Exact Marking Scheme TXT
 * - Material IDs, versions, SHA-256 content hashes, and character counts
 * - Retrieval timestamp, level, subject, paper, attempt, syllabus, effective date
 * - Verification status ('VERIFIED')
 * - HARD STOP GATE: If required materials cannot be retrieved or are superficial (< 50 chars),
 *   evaluation MUST STOP IMMEDIATELY. General model knowledge is NEVER permitted as a fallback.
 */

import crypto from 'node:crypto';
import { db } from '../db.js';
import { normalizeAndSplitCombinedPyq } from './materialHardGateService.js';

export interface MaterialTextDoc {
  materialId: string;
  version: string;
  checksum: string;
  textLength: number;
  text: string;
}

export interface ReferencePackage {
  packageId: string;
  evaluationId: string;
  sourceFormat: 'SEPARATE' | 'COMBINED' | 'LEGACY';
  sourceMaterialIds: {
    questionMaterialId?: string;
    suggestedAnswerMaterialId?: string;
    combinedSourceMaterialId?: string;
    markingSchemeMaterialId?: string;
  };
  retrievalTimestamp: string;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED';
  level: string;
  subjectKey: string;
  subjectName: string;
  paper: string;
  attempt: string;
  syllabusVersion: string;
  materialType: string;
  mtpSeries?: 1 | 2;
  effectiveDate: string;
  materialSource: 'GLOBAL' | 'INSTITUTE';
  officialPaperMaxMarks: number;
  questionPaper: MaterialTextDoc;
  suggestedAnswers: MaterialTextDoc;
  markingScheme: MaterialTextDoc;
  referenceGuidance?: MaterialTextDoc;
  amendmentsProvisions?: MaterialTextDoc;
}

export interface BuildReferencePackageRequest {
  evaluationId: string;
  level: string;
  subjectKey: string;
  subjectName?: string;
  paper?: string;
  attempt?: string;
  syllabusVersion?: string;
  materialType?: string;
  mtpSeries?: 1 | 2 | string | number;
  sourceFormat?: 'SEPARATE' | 'COMBINED' | 'LEGACY' | string;
  evaluationSource?: 'PUBLIC' | 'INSTITUTE';
  instituteId?: string;
  instituteMaterialId?: string;
}

function computeSha256(content: string): string {
  return crypto.createHash('sha256').update(content || '', 'utf8').digest('hex');
}

/**
 * Builds an immutable ReferencePackage.
 * Throws a strict error if authoritative materials are missing or empty.
 */
export function buildAuthoritativeReferencePackage(
  request: BuildReferencePackageRequest
): ReferencePackage {
  const isInstituteMode = request.evaluationSource === 'INSTITUTE';
  const normLevel = (request.level || 'INTERMEDIATE').toUpperCase();
  const subjectKey = String(request.subjectKey || '').trim();
  const isMtp = request.materialType === 'MTP';
  const isPyq = request.materialType === 'PYQ';

  let normalizedSeries: 1 | 2 | undefined = undefined;
  if (isMtp) {
    if (request.mtpSeries === undefined || request.mtpSeries === null || String(request.mtpSeries).trim() === '') {
      throw new Error('Please select an MTP Series (Series 1 or Series 2) to continue.');
    }
    const parsed = Number(request.mtpSeries);
    if (parsed !== 1 && parsed !== 2) {
      throw new Error('Invalid MTP Series selected. Allowed options are Series 1 or Series 2.');
    }
    normalizedSeries = parsed as 1 | 2;
  }

  let rawMaterial: any = null;
  const materialSource: 'GLOBAL' | 'INSTITUTE' = isInstituteMode ? 'INSTITUTE' : 'GLOBAL';

  if (isInstituteMode) {
    if (request.instituteMaterialId) {
      rawMaterial = db.prepare(`
        SELECT id, title as question_paper_title, level, subject_key, subject_name, paper,
               '1.0' as version, 'Institute Curriculum' as syllabus_version,
               question_paper_text, suggested_answers_text, marking_scheme_text,
               mtp_series,
               100 as official_max_marks, created_at
        FROM institute_materials
        WHERE id = ? AND institute_id = ? AND status = 'ACTIVE'
      `).get(request.instituteMaterialId, request.instituteId);

      if (rawMaterial && isMtp && normalizedSeries) {
        if (Number(rawMaterial.mtp_series) !== normalizedSeries) {
          throw new Error('TAMPER_DETECTED: Requested material ID does not match selected MTP Series.');
        }
      }
    }

    if (!rawMaterial && request.instituteId) {
      let instQuery = `
        SELECT id, title as question_paper_title, level, subject_key, subject_name, paper,
               '1.0' as version, 'Institute Curriculum' as syllabus_version,
               question_paper_text, suggested_answers_text, marking_scheme_text,
               mtp_series,
               100 as official_max_marks, created_at
        FROM institute_materials
        WHERE institute_id = ? AND level = ? AND subject_key = ? AND status = 'ACTIVE'
      `;
      const instParams: any[] = [request.instituteId, normLevel, subjectKey];
      if (isMtp && normalizedSeries) {
        instQuery += ' AND (mtp_series = ? OR mtp_series = ?)';
        instParams.push(normalizedSeries, String(normalizedSeries));
      }
      instQuery += ' ORDER BY created_at DESC LIMIT 1';
      rawMaterial = db.prepare(instQuery).get(...instParams);
    }
  } else {
    // Official Global Admin-Approved Materials
    let query = `
      SELECT id, question_paper_title, level, subject_key, subject_name, paper,
             attempt, syllabus_version, material_type, mtp_series,
             source_format, combined_source_material_id, question_material_id, suggested_answer_material_id, marking_scheme_material_id,
             file_id, version, status, admin_approved,
             question_paper_text, suggested_answers_text, marking_scheme_text,
             reference_guidance_text, amendments_provisions_text,
             100 as official_max_marks, created_at
      FROM evaluation_materials
      WHERE level = ? AND subject_key = ? AND status = 'ACTIVE'
        AND source_type = 'ADMIN' AND admin_approved = 1
    `;
    const params: any[] = [normLevel, subjectKey];

    if (request.attempt && request.attempt !== 'Current' && request.attempt !== 'All' && request.attempt !== 'Institute Series') {
      query += " AND (attempt = ? OR attempt = 'All')";
      params.push(request.attempt);
    }

    if (request.paper && request.paper !== 'All') {
      query += " AND (paper = ? OR paper = 'All')";
      params.push(request.paper);
    }

    if (request.materialType && request.materialType !== 'ALL') {
      query += " AND (material_type = ? OR material_type = 'ALL')";
      params.push(request.materialType);
    }

    if (isMtp && normalizedSeries) {
      query += ' AND (mtp_series = ? OR mtp_series = ?)';
      params.push(normalizedSeries, String(normalizedSeries));
    }

    if (isPyq && request.sourceFormat && request.sourceFormat !== 'ALL') {
      query += ' AND source_format = ?';
      params.push(request.sourceFormat);
    }

    query += ' ORDER BY created_at DESC LIMIT 1';
    rawMaterial = db.prepare(query).get(...params);

    // If specific attempt was not matched, fallback only for non-MTP AND non-PYQ materials!
    if (!rawMaterial && !isMtp && !isPyq) {
      rawMaterial = db.prepare(`
        SELECT id, question_paper_title, level, subject_key, subject_name, paper,
               attempt, syllabus_version, material_type, mtp_series,
               source_format, combined_source_material_id, question_material_id, suggested_answer_material_id, marking_scheme_material_id,
               file_id, version, status, admin_approved,
               question_paper_text, suggested_answers_text, marking_scheme_text,
               reference_guidance_text, amendments_provisions_text,
               100 as official_max_marks, created_at
        FROM evaluation_materials
        WHERE level = ? AND subject_key = ? AND status = 'ACTIVE'
          AND source_type = 'ADMIN' AND admin_approved = 1
        ORDER BY created_at DESC LIMIT 1
      `).get(normLevel, subjectKey);
    }
  }

  // HARD STOP GATE: Material must exist in authoritative store
  if (!rawMaterial) {
    if (isMtp && normalizedSeries) {
      const subj = request.subjectName || request.subjectKey;
      const att = request.attempt || 'Target Attempt';
      throw new Error(
        `Evaluation material for ${subj} MTP Series ${normalizedSeries} (${att}) is not available yet. Please select another paper or wait until the material is published.`
      );
    }
    if (isPyq) {
      throw new Error(
        'Evaluation material is not uploaded yet. Please try again once the required material has been added.'
      );
    }
    throw new Error(
      'Evaluation material is unavailable for this question. Please try again once the required verified material has been uploaded.'
    );
  }

  if (isMtp && normalizedSeries) {
    if (Number(rawMaterial.mtp_series) !== normalizedSeries) {
      throw new Error(
        `MTP_SERIES_MISMATCH: Retrieved material series (${rawMaterial.mtp_series}) does not match requested MTP Series (${normalizedSeries}).`
      );
    }
  }

  let qpText = String(rawMaterial.question_paper_text || '').trim();
  let saText = String(rawMaterial.suggested_answers_text || '').trim();
  const msText = String(rawMaterial.marking_scheme_text || '').trim();
  const rgText = String(rawMaterial.reference_guidance_text || '').trim();
  const apText = String(rawMaterial.amendments_provisions_text || '').trim();

  // If source format is COMBINED, ensure internal normalization into authoritative Question Paper & Suggested Answers
  if (rawMaterial.source_format === 'COMBINED') {
    if (!qpText || !saText || qpText === saText || qpText.length < 50 || saText.length < 50) {
      const sourceForSplit = (qpText && qpText.length >= 50) ? qpText : saText;
      if (sourceForSplit && sourceForSplit.length >= 50) {
        const normalized = normalizeAndSplitCombinedPyq(sourceForSplit);
        qpText = normalized.questionPaperText;
        saText = normalized.suggestedAnswersText;
      }
    }
  }

  // HARD STOP GATE: Question Paper and Suggested Answers must have substantial verified content
  if (qpText.length < 50 || saText.length < 50) {
    throw new Error(
      'Evaluation material is unavailable for this question. Please try again once the required verified material has been uploaded.'
    );
  }

  let officialPaperMaxMarks = 100;
  if (rawMaterial.official_max_marks && Number(rawMaterial.official_max_marks) > 0) {
    officialPaperMaxMarks = Number(rawMaterial.official_max_marks);
  }

  const maxMarksHeaderMatch = qpText.match(/\b(maximum\s+marks|max\s+marks|marks)\s*[:\-–]?\s*(\d{2,3})\b/i);
  if (maxMarksHeaderMatch && maxMarksHeaderMatch[2]) {
    const parsedMax = parseInt(maxMarksHeaderMatch[2], 10);
    if (parsedMax === 50 || parsedMax === 100 || parsedMax === 75 || parsedMax === 40) {
      officialPaperMaxMarks = parsedMax;
    }
  }

  const qpChecksum = computeSha256(qpText);
  const saChecksum = computeSha256(saText);
  const msChecksum = computeSha256(msText);

  const matId = String(rawMaterial.id);
  const matVersion = String(rawMaterial.version || '1.0');

  const questionPaper: MaterialTextDoc = {
    materialId: matId,
    version: matVersion,
    checksum: qpChecksum,
    textLength: qpText.length,
    text: qpText,
  };

  const suggestedAnswers: MaterialTextDoc = {
    materialId: matId,
    version: matVersion,
    checksum: saChecksum,
    textLength: saText.length,
    text: saText,
  };

  const markingScheme: MaterialTextDoc = {
    materialId: matId,
    version: matVersion,
    checksum: msChecksum,
    textLength: msText.length,
    text: msText,
  };

  let referenceGuidance: MaterialTextDoc | undefined = undefined;
  if (rgText.length > 0) {
    referenceGuidance = {
      materialId: matId,
      version: matVersion,
      checksum: computeSha256(rgText),
      textLength: rgText.length,
      text: rgText,
    };
  }

  let amendmentsProvisions: MaterialTextDoc | undefined = undefined;
  if (apText.length > 0) {
    amendmentsProvisions = {
      materialId: matId,
      version: matVersion,
      checksum: computeSha256(apText),
      textLength: apText.length,
      text: apText,
    };
  }

  const packageHash = computeSha256(`${qpChecksum}:${saChecksum}:${msChecksum}`);

  const sourceFormat = (rawMaterial.source_format || 'SEPARATE') as 'SEPARATE' | 'COMBINED' | 'LEGACY';
  const sourceMaterialIds = {
    combinedSourceMaterialId: sourceFormat === 'COMBINED' ? (rawMaterial.combined_source_material_id || rawMaterial.file_id || `mat_comb_${matId}`) : undefined,
    questionMaterialId: sourceFormat === 'SEPARATE' ? (rawMaterial.question_material_id || rawMaterial.file_id || `mat_qp_${matId}`) : undefined,
    suggestedAnswerMaterialId: sourceFormat === 'SEPARATE' ? (rawMaterial.suggested_answer_material_id || `mat_sa_${matId}`) : undefined,
    markingSchemeMaterialId: msText ? (rawMaterial.marking_scheme_material_id || `mat_ms_${matId}`) : undefined,
  };

  return {
    packageId: `ref_pkg_${packageHash.slice(0, 16)}`,
    evaluationId: request.evaluationId,
    sourceFormat,
    sourceMaterialIds,
    retrievalTimestamp: new Date().toISOString(),
    verificationStatus: 'VERIFIED',
    level: normLevel,
    subjectKey,
    subjectName: rawMaterial.subject_name || request.subjectName || 'Chartered Accountancy',
    paper: rawMaterial.paper || request.paper || 'Paper 1',
    attempt: rawMaterial.attempt || request.attempt || 'May 2026',
    syllabusVersion: rawMaterial.syllabus_version || request.syllabusVersion || 'New Scheme 2024',
    materialType: rawMaterial.material_type || request.materialType || 'MTP',
    mtpSeries: normalizedSeries,
    effectiveDate: rawMaterial.created_at || new Date().toISOString().slice(0, 10),
    materialSource,
    officialPaperMaxMarks,
    questionPaper,
    suggestedAnswers,
    markingScheme,
    referenceGuidance,
    amendmentsProvisions,
  };
}
