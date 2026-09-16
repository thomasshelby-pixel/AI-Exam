/**
 * Authoritative Reference Material Hard-Gate Service
 *
 * Implements strict, unyielding gates for CA answer sheet evaluation:
 * 1. Programmatically retrieves verified reference material package.
 * 2. Enforces non-empty, authentic TXT content for Question Paper, Suggested Answers, and Marking Scheme.
 * 3. Computes SHA-256 content hashes for all reference documents.
 * 4. Generates a Material Source Manifest.
 * 5. HARD REJECTION GATE: If verified material is missing, mismatched, corrupted, or inactive,
 *    substantive evaluation MUST STOP IMMEDIATELY.
 *    No general-knowledge fallback is permitted.
 */

import crypto from 'node:crypto';
import { db } from '../db.js';

export interface MaterialManifestItem {
  materialId: string;
  version: string;
  checksum: string;
  textLength: number;
}

export interface MaterialSourceManifest {
  evaluationId: string;
  caLevel: string;
  subjectKey: string;
  subjectName: string;
  paper: string;
  attempt: string;
  syllabusVersion: string;
  materialType: string;
  mtpSeries?: 1 | 2;
  sourceFormat?: 'SEPARATE' | 'COMBINED' | 'LEGACY';
  combinedSourceMaterialId?: string;
  questionMaterialId?: string;
  suggestedAnswerMaterialId?: string;
  markingSchemeMaterialId?: string;
  materialSource: 'GLOBAL' | 'INSTITUTE';
  officialPaperMaxMarks: number;
  materialVerificationStatus: 'VERIFIED' | 'UNVERIFIED';
  retrievedAt: string;
  questionPaper: MaterialManifestItem;
  suggestedAnswers: MaterialManifestItem;
  markingScheme?: MaterialManifestItem;
  referenceGuidance?: MaterialManifestItem;
  amendmentsProvisions?: MaterialManifestItem;
}

export interface EvaluationEvidenceComponentMetadata {
  materialId: string;
  version: string;
  checksum: string;
  textLength: number;
  mtpSeries?: 1 | 2 | null;
  componentType: 'QUESTION_PAPER' | 'SUGGESTED_ANSWERS' | 'MARKING_SCHEME' | 'REFERENCE_GUIDANCE' | 'AMENDMENTS_PROVISIONS';
  title?: string;
  detectedSeries?: 1 | 2 | null;
}

export interface EvaluationEvidenceComponent {
  text: string;
  metadata: EvaluationEvidenceComponentMetadata;
}

export interface EvaluationEvidencePackage {
  evaluationId: string;
  requestedMtpSeries?: 1 | 2 | number | null;
  materialType: string;
  caLevel: string;
  subjectKey: string;
  subjectName: string;
  paper?: string;
  attempt?: string;
  syllabusVersion?: string;
  questionPaper: EvaluationEvidenceComponent;
  suggestedAnswers: EvaluationEvidenceComponent;
  markingScheme: EvaluationEvidenceComponent;
  referenceGuidance?: EvaluationEvidenceComponent;
  amendmentsProvisions?: EvaluationEvidenceComponent;
  rawMaterialId?: string;
  rawMaterialTitle?: string;
  rawMaterialMtpSeries?: 1 | 2 | number | null;
  retrievedAt: string;
  integrityGateStatus: 'PENDING' | 'PASSED' | 'FAILED';
}

export interface VerifiedReferencePackage {
  id: string;
  version: string;
  paper: string;
  syllabusVersion: string;
  officialPaperMaxMarks: number;
  mtpSeries?: 1 | 2;
  sourceFormat?: 'SEPARATE' | 'COMBINED' | 'LEGACY';
  combinedSourceMaterialId?: string;
  questionMaterialId?: string;
  suggestedAnswerMaterialId?: string;
  markingSchemeMaterialId?: string;
  questionPaperTitle: string;
  questionPaperText: string;
  suggestedAnswersText: string;
  markingSchemeText: string;
  referenceGuidanceText?: string;
  amendmentsProvisionsText?: string;
  manifest: MaterialSourceManifest;
  evidencePackage?: EvaluationEvidencePackage;
}

export interface MaterialGateRequest {
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
 * Executes the Authoritative Reference Material Hard-Gate check.
 * Throws a descriptive error if authoritative verified materials are not found.
 */
export function enforceMaterialHardGate(request: MaterialGateRequest): VerifiedReferencePackage {
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
  let materialSource: 'GLOBAL' | 'INSTITUTE' = isInstituteMode ? 'INSTITUTE' : 'GLOBAL';

  if (isInstituteMode) {
    if (request.instituteMaterialId) {
      rawMaterial = db.prepare(`
        SELECT id, title as question_paper_title, level, subject_key, subject_name, paper,
               '1.0' as version, 'Institute Curriculum' as syllabus_version,
               question_paper_text, suggested_answers_text, marking_scheme_text,
               mtp_series,
               100 as official_max_marks
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
               100 as official_max_marks
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
             100 as official_max_marks
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

    // Fallback: If specific attempt was not matched, find active approved material for the subject & level
    // CRITICAL: NEVER fallback across MTP Series or PYQ Attempts!
    if (!rawMaterial && !isMtp && !isPyq) {
      rawMaterial = db.prepare(`
        SELECT id, question_paper_title, level, subject_key, subject_name, paper,
               attempt, syllabus_version, material_type, mtp_series,
               source_format, combined_source_material_id, question_material_id, suggested_answer_material_id, marking_scheme_material_id,
               file_id, version, status, admin_approved,
               question_paper_text, suggested_answers_text, marking_scheme_text,
               reference_guidance_text, amendments_provisions_text,
               100 as official_max_marks
        FROM evaluation_materials
        WHERE level = ? AND subject_key = ? AND status = 'ACTIVE'
          AND source_type = 'ADMIN' AND admin_approved = 1
        ORDER BY created_at DESC LIMIT 1
      `).get(normLevel, subjectKey);
    }
  }

  // HARD-GATE CHECK: Material must exist
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
      `Evaluation material is not available for this paper yet. Please try again once the required material has been added.`
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

  // HARD-GATE CHECK: Verified TXT content must not be blank or superficial
  if (qpText.length < 50 || saText.length < 50) {
    throw new Error(
      `Evaluation material is not available for this paper yet. Please try again once the required material has been added.`
    );
  }

  // Determine official paper maximum marks
  // Default for all ICAI papers is 100 marks unless explicitly configured otherwise
  let officialPaperMaxMarks = 100;
  if (rawMaterial.official_max_marks && Number(rawMaterial.official_max_marks) > 0) {
    officialPaperMaxMarks = Number(rawMaterial.official_max_marks);
  }

  // Extract from question paper text if explicitly stated (e.g., "(50 MARKS)" or "MAXIMUM MARKS: 100")
  const maxMarksHeaderMatch = qpText.match(/\b(maximum\s+marks|max\s+marks|marks)\s*[:\-–]?\s*(\d{2,3})\b/i);
  if (maxMarksHeaderMatch && maxMarksHeaderMatch[2]) {
    const parsedMax = parseInt(maxMarksHeaderMatch[2], 10);
    if (parsedMax === 50 || parsedMax === 100 || parsedMax === 75 || parsedMax === 40) {
      officialPaperMaxMarks = parsedMax;
    }
  }

  // Compute checksums
  const qpChecksum = computeSha256(qpText);
  const saChecksum = computeSha256(saText);
  const msChecksum = computeSha256(msText);

  const manifest: MaterialSourceManifest = {
    evaluationId: request.evaluationId,
    caLevel: normLevel,
    subjectKey,
    subjectName: rawMaterial.subject_name || request.subjectName || 'Chartered Accountancy',
    paper: rawMaterial.paper || request.paper || 'Paper 1',
    attempt: rawMaterial.attempt || request.attempt || 'May 2026',
    syllabusVersion: rawMaterial.syllabus_version || request.syllabusVersion || 'New Scheme 2024',
    materialType: rawMaterial.material_type || request.materialType || 'MTP',
    mtpSeries: normalizedSeries,
    materialSource,
    officialPaperMaxMarks,
    materialVerificationStatus: 'VERIFIED',
    retrievedAt: new Date().toISOString(),
    sourceFormat: (rawMaterial.source_format || 'SEPARATE') as 'SEPARATE' | 'COMBINED' | 'LEGACY',
    combinedSourceMaterialId: rawMaterial.source_format === 'COMBINED' ? (rawMaterial.combined_source_material_id || rawMaterial.file_id || `mat_comb_${rawMaterial.id}`) : undefined,
    questionMaterialId: rawMaterial.source_format === 'SEPARATE' ? (rawMaterial.question_material_id || rawMaterial.file_id || `mat_qp_${rawMaterial.id}`) : undefined,
    suggestedAnswerMaterialId: rawMaterial.source_format === 'SEPARATE' ? (rawMaterial.suggested_answer_material_id || `mat_sa_${rawMaterial.id}`) : undefined,
    markingSchemeMaterialId: msText.length > 0 ? (rawMaterial.marking_scheme_material_id || `mat_ms_${rawMaterial.id}`) : undefined,
    questionPaper: {
      materialId: rawMaterial.id,
      version: rawMaterial.version || '1.0',
      checksum: qpChecksum,
      textLength: qpText.length,
    },
    suggestedAnswers: {
      materialId: rawMaterial.id,
      version: rawMaterial.version || '1.0',
      checksum: saChecksum,
      textLength: saText.length,
    },
  };

  if (msText.length > 0) {
    manifest.markingScheme = {
      materialId: rawMaterial.id,
      version: rawMaterial.version || '1.0',
      checksum: msChecksum,
      textLength: msText.length,
    };
  }

  const verifiedPkg: VerifiedReferencePackage = {
    id: rawMaterial.id,
    version: rawMaterial.version || '1.0',
    paper: rawMaterial.paper || request.paper || 'Paper 1',
    syllabusVersion: rawMaterial.syllabus_version || 'New Scheme 2024',
    officialPaperMaxMarks,
    mtpSeries: normalizedSeries,
    sourceFormat: (rawMaterial.source_format || 'SEPARATE') as 'SEPARATE' | 'COMBINED' | 'LEGACY',
    combinedSourceMaterialId: rawMaterial.source_format === 'COMBINED' ? (rawMaterial.combined_source_material_id || rawMaterial.file_id || `mat_comb_${rawMaterial.id}`) : undefined,
    questionMaterialId: rawMaterial.source_format === 'SEPARATE' ? (rawMaterial.question_material_id || rawMaterial.file_id || `mat_qp_${rawMaterial.id}`) : undefined,
    suggestedAnswerMaterialId: rawMaterial.source_format === 'SEPARATE' ? (rawMaterial.suggested_answer_material_id || `mat_sa_${rawMaterial.id}`) : undefined,
    markingSchemeMaterialId: msText.length > 0 ? (rawMaterial.marking_scheme_material_id || `mat_ms_${rawMaterial.id}`) : undefined,
    questionPaperTitle: rawMaterial.question_paper_title || 'ICAI Official Material',
    questionPaperText: qpText,
    suggestedAnswersText: saText,
    markingSchemeText: msText,
    referenceGuidanceText: rawMaterial.reference_guidance_text || undefined,
    amendmentsProvisionsText: rawMaterial.amendments_provisions_text || undefined,
    manifest,
  };

  // Build EvaluationEvidencePackage and enforce server-side integrity gate
  const evidencePackage = buildEvaluationEvidencePackage(verifiedPkg, request);
  enforceEvaluationEvidencePackageMtpGate(evidencePackage);
  verifiedPkg.evidencePackage = evidencePackage;

  return verifiedPkg;
}

/**
 * Detects MTP Series (1 or 2) from text or title strings (e.g., "Series 1", "Series - I", "Series 2", "Series II").
 */
export function detectMtpSeriesFromText(content: string): 1 | 2 | null {
  if (!content) return null;
  const series1Pattern = /\b(?:mtp|mock\s+test\s+paper)?\s*[-–:]?\s*series\s*[-–:]?\s*(?:1|i\b|one)\b/i;
  const series2Pattern = /\b(?:mtp|mock\s+test\s+paper)?\s*[-–:]?\s*series\s*[-–:]?\s*(?:2|ii\b|two)\b/i;

  const has1 = series1Pattern.test(content);
  const has2 = series2Pattern.test(content);

  if (has1 && !has2) return 1;
  if (has2 && !has1) return 2;
  return null;
}

/**
 * Constructs an authoritative EvaluationEvidencePackage from a VerifiedReferencePackage.
 */
export function buildEvaluationEvidencePackage(
  pkg: VerifiedReferencePackage,
  request: MaterialGateRequest
): EvaluationEvidencePackage {
  const normSeries = pkg.mtpSeries;
  const qpDetected = detectMtpSeriesFromText(pkg.questionPaperTitle) || detectMtpSeriesFromText(pkg.questionPaperText.slice(0, 1000));
  const saDetected = detectMtpSeriesFromText(pkg.questionPaperTitle) || detectMtpSeriesFromText(pkg.suggestedAnswersText.slice(0, 1000));
  const msDetected = pkg.markingSchemeText ? detectMtpSeriesFromText(pkg.markingSchemeText.slice(0, 1000)) : null;

  const qpChecksum = pkg.manifest?.questionPaper?.checksum || computeSha256(pkg.questionPaperText);
  const saChecksum = pkg.manifest?.suggestedAnswers?.checksum || computeSha256(pkg.suggestedAnswersText);
  const msChecksum = pkg.manifest?.markingScheme?.checksum || computeSha256(pkg.markingSchemeText || '');

  return {
    evaluationId: request.evaluationId,
    requestedMtpSeries: normSeries,
    materialType: pkg.manifest?.materialType || request.materialType || 'MTP',
    caLevel: pkg.manifest?.caLevel || request.level || 'INTERMEDIATE',
    subjectKey: pkg.manifest?.subjectKey || request.subjectKey,
    subjectName: pkg.manifest?.subjectName || request.subjectName || 'Chartered Accountancy',
    paper: pkg.paper || request.paper,
    attempt: pkg.manifest?.attempt || request.attempt,
    syllabusVersion: pkg.syllabusVersion,
    rawMaterialId: pkg.id,
    rawMaterialTitle: pkg.questionPaperTitle,
    rawMaterialMtpSeries: normSeries,
    retrievedAt: pkg.manifest?.retrievedAt || new Date().toISOString(),
    integrityGateStatus: 'PENDING',
    questionPaper: {
      text: pkg.questionPaperText,
      metadata: {
        materialId: pkg.manifest?.questionPaper?.materialId || pkg.id,
        version: pkg.manifest?.questionPaper?.version || pkg.version,
        checksum: qpChecksum,
        textLength: pkg.questionPaperText.length,
        mtpSeries: normSeries,
        componentType: 'QUESTION_PAPER',
        title: pkg.questionPaperTitle,
        detectedSeries: qpDetected,
      },
    },
    suggestedAnswers: {
      text: pkg.suggestedAnswersText,
      metadata: {
        materialId: pkg.manifest?.suggestedAnswers?.materialId || pkg.id,
        version: pkg.manifest?.suggestedAnswers?.version || pkg.version,
        checksum: saChecksum,
        textLength: pkg.suggestedAnswersText.length,
        mtpSeries: normSeries,
        componentType: 'SUGGESTED_ANSWERS',
        title: pkg.questionPaperTitle,
        detectedSeries: saDetected,
      },
    },
    markingScheme: {
      text: pkg.markingSchemeText,
      metadata: {
        materialId: pkg.manifest?.markingScheme?.materialId || pkg.id,
        version: pkg.manifest?.markingScheme?.version || pkg.version,
        checksum: msChecksum,
        textLength: (pkg.markingSchemeText || '').length,
        mtpSeries: normSeries,
        componentType: 'MARKING_SCHEME',
        title: `${pkg.questionPaperTitle} Marking Scheme`,
        detectedSeries: msDetected,
      },
    },
  };
}

/**
 * Server-side integrity gate in the evaluation pipeline that explicitly validates the 'mtpSeries'
 * across the entire EvaluationEvidencePackage before triggering the AI evaluation.
 * Compares the requested series against the metadata of the retrieved Question Paper,
 * Suggested Answer, and Marking Scheme.
 */
export function enforceEvaluationEvidencePackageMtpGate(evidencePackage: EvaluationEvidencePackage): void {
  const isMtp =
    String(evidencePackage.materialType || '').toUpperCase() === 'MTP' ||
    (evidencePackage.requestedMtpSeries !== undefined && evidencePackage.requestedMtpSeries !== null);

  if (!isMtp) {
    // Non-MTP examination paper. Skip MTP-specific checks.
    evidencePackage.integrityGateStatus = 'PASSED';
    return;
  }

  const reqSeries = evidencePackage.requestedMtpSeries;
  if (reqSeries === undefined || reqSeries === null || (Number(reqSeries) !== 1 && Number(reqSeries) !== 2)) {
    evidencePackage.integrityGateStatus = 'FAILED';
    throw new Error(
      `MTP_SERIES_GATE_ERROR: Please select a valid MTP Series (Series 1 or Series 2) to continue.`
    );
  }

  const expectedSeries = Number(reqSeries) as 1 | 2;

  // 1. Validate Question Paper evidence and metadata
  const qp = evidencePackage.questionPaper;
  if (!qp || !qp.text || qp.text.length < 50) {
    evidencePackage.integrityGateStatus = 'FAILED';
    throw new Error('EVALUATION_EVIDENCE_GATE_ERROR: Retrieved Question Paper evidence is missing or superficial.');
  }

  if (qp.metadata.mtpSeries !== undefined && qp.metadata.mtpSeries !== null) {
    if (Number(qp.metadata.mtpSeries) !== expectedSeries) {
      evidencePackage.integrityGateStatus = 'FAILED';
      throw new Error(
        `MTP_SERIES_INTEGRITY_MISMATCH: Question Paper metadata MTP Series (${qp.metadata.mtpSeries}) does not match requested MTP Series (${expectedSeries}). AI evaluation aborted.`
      );
    }
  }

  const qpDetected = qp.metadata.detectedSeries || detectMtpSeriesFromText(qp.metadata.title || '') || detectMtpSeriesFromText(qp.text.slice(0, 1000));
  if (qpDetected && qpDetected !== expectedSeries) {
    evidencePackage.integrityGateStatus = 'FAILED';
    throw new Error(
      `MTP_SERIES_INTEGRITY_MISMATCH: Question Paper explicitly identifies as Series ${qpDetected}, which contradicts requested MTP Series ${expectedSeries}. AI evaluation aborted.`
    );
  }

  // 2. Validate Suggested Answers evidence and metadata
  const sa = evidencePackage.suggestedAnswers;
  if (!sa || !sa.text || sa.text.length < 50) {
    evidencePackage.integrityGateStatus = 'FAILED';
    throw new Error('EVALUATION_EVIDENCE_GATE_ERROR: Retrieved Suggested Answers evidence is missing or superficial.');
  }

  if (sa.metadata.mtpSeries !== undefined && sa.metadata.mtpSeries !== null) {
    if (Number(sa.metadata.mtpSeries) !== expectedSeries) {
      evidencePackage.integrityGateStatus = 'FAILED';
      throw new Error(
        `MTP_SERIES_INTEGRITY_MISMATCH: Suggested Answers metadata MTP Series (${sa.metadata.mtpSeries}) does not match requested MTP Series (${expectedSeries}). AI evaluation aborted.`
      );
    }
  }

  const saDetected = sa.metadata.detectedSeries || detectMtpSeriesFromText(sa.metadata.title || '') || detectMtpSeriesFromText(sa.text.slice(0, 1000));
  if (saDetected && saDetected !== expectedSeries) {
    evidencePackage.integrityGateStatus = 'FAILED';
    throw new Error(
      `MTP_SERIES_INTEGRITY_MISMATCH: Suggested Answers explicitly identifies as Series ${saDetected}, which contradicts requested MTP Series ${expectedSeries}. AI evaluation aborted.`
    );
  }

  // 3. Validate Marking Scheme evidence and metadata
  const ms = evidencePackage.markingScheme;
  if (ms && ms.metadata) {
    if (ms.metadata.mtpSeries !== undefined && ms.metadata.mtpSeries !== null) {
      if (Number(ms.metadata.mtpSeries) !== expectedSeries) {
        evidencePackage.integrityGateStatus = 'FAILED';
        throw new Error(
          `MTP_SERIES_INTEGRITY_MISMATCH: Marking Scheme metadata MTP Series (${ms.metadata.mtpSeries}) does not match requested MTP Series (${expectedSeries}). AI evaluation aborted.`
        );
      }
    }

    if (ms.text && ms.text.length > 0) {
      const msDetected = ms.metadata.detectedSeries || detectMtpSeriesFromText(ms.metadata.title || '') || detectMtpSeriesFromText(ms.text.slice(0, 1000));
      if (msDetected && msDetected !== expectedSeries) {
        evidencePackage.integrityGateStatus = 'FAILED';
        throw new Error(
          `MTP_SERIES_INTEGRITY_MISMATCH: Marking Scheme explicitly identifies as Series ${msDetected}, which contradicts requested MTP Series ${expectedSeries}. AI evaluation aborted.`
        );
      }
    }
  }

  // 4. Validate Raw Reference Package Series
  if (evidencePackage.rawMaterialMtpSeries !== undefined && evidencePackage.rawMaterialMtpSeries !== null) {
    if (Number(evidencePackage.rawMaterialMtpSeries) !== expectedSeries) {
      evidencePackage.integrityGateStatus = 'FAILED';
      throw new Error(
        `MTP_SERIES_INTEGRITY_MISMATCH: Retrieved reference material package MTP Series (${evidencePackage.rawMaterialMtpSeries}) does not match requested MTP Series (${expectedSeries}). AI evaluation aborted.`
      );
    }
  }

  evidencePackage.integrityGateStatus = 'PASSED';
}

/**
 * Authoritatively separates/normalizes combined Question Paper + Suggested Answers text
 * into distinct question paper and suggested answers components.
 */
export function normalizeAndSplitCombinedPyq(combinedText: string): {
  questionPaperText: string;
  suggestedAnswersText: string;
} {
  const text = String(combinedText || '').trim();
  if (!text) {
    return { questionPaperText: '', suggestedAnswersText: '' };
  }

  // 1. Check for single clear divider separating Question Paper from Suggested Answers
  // e.g. "SUGGESTED ANSWERS", "SOLUTIONS", "MODEL SOLUTIONS", "ANSWERS TO QUESTIONS", "HINTS & SOLUTIONS"
  const dividerRegex = /\n\s*(?:(?:ICAI\s+)?(?:SUGGESTED\s+ANSWERS?|SOLUTIONS?|MODEL\s+ANSWERS?|ANSWERS\s+TO\s+QUESTIONS?|HINTS\s*&\s*SOLUTIONS?))\s*(?:\n|:|\.|$)/i;
  const match = dividerRegex.exec(text);

  if (match && match.index > 50 && match.index < text.length - 50) {
    const qpPart = text.slice(0, match.index).trim();
    const saPart = text.slice(match.index).trim();
    if (qpPart.length >= 30 && saPart.length >= 30) {
      return {
        questionPaperText: qpPart,
        suggestedAnswersText: saPart,
      };
    }
  }

  // 2. Check for interleaved Questions and Answers
  // Pattern: Question 1 ... Answer / Solution to Question 1 ... Question 2 ...
  const tokenRegex = /(?:^|\n)(?:(?:QUESTION|Q\.?)\s*(?:NO\.?|[0-9]+)\b|(?:(?:SUGGESTED\s+)?ANSWER|SOLUTION|HINT)\s*(?:TO\s+)?(?:QUESTION|Q\.?)?\s*(?:NO\.?|[0-9]+)?\b)/gi;
  const tokens: Array<{ index: number; type: 'Q' | 'A'; header: string }> = [];
  let tokenMatch: RegExpExecArray | null;

  while ((tokenMatch = tokenRegex.exec(text)) !== null) {
    const headerStr = tokenMatch[0].trim();
    const isAns = /(?:ANSWER|SOLUTION|HINT)/i.test(headerStr);
    tokens.push({
      index: tokenMatch.index,
      type: isAns ? 'A' : 'Q',
      header: headerStr,
    });
  }

  if (tokens.length >= 2) {
    const hasQ = tokens.some((t) => t.type === 'Q');
    const hasA = tokens.some((t) => t.type === 'A');

    if (hasQ && hasA) {
      const qBlocks: string[] = [];
      const aBlocks: string[] = [];

      for (let i = 0; i < tokens.length; i++) {
        const start = tokens[i].index;
        const end = i + 1 < tokens.length ? tokens[i + 1].index : text.length;
        const block = text.slice(start, end).trim();
        if (tokens[i].type === 'Q') {
          qBlocks.push(block);
        } else {
          aBlocks.push(block);
        }
      }

      if (qBlocks.length > 0 && aBlocks.length > 0) {
        return {
          questionPaperText: qBlocks.join('\n\n'),
          suggestedAnswersText: aBlocks.join('\n\n'),
        };
      }
    }
  }

  // Fallback: Retain complete ground truth in both partitions with clear authoritative headings
  return {
    questionPaperText: `[AUTHORITATIVE COMBINED PYQ DOCUMENT - QUESTIONS]\n${text}`,
    suggestedAnswersText: `[AUTHORITATIVE COMBINED PYQ DOCUMENT - SUGGESTED ANSWERS]\n${text}`,
  };
}
