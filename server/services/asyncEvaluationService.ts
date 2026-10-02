import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { db, persistEvaluationRunPackageAtomic } from '../db.js';
import { evaluateCAAnswerSheet } from '../gemini.js';
import { CALevel, MaterialType, CheckingMode, EvaluationResult } from '../../src/types/index.js';
import {
  generateCheckedCopyPdf,
  generateDetailedReportPdf,
  buildStructuredAnnotations,
} from './pdfCheckedCopyService.js';
import {
  consumeCreditFEFO,
  consumeEvaluationEntitlementAtomic,
  refundEvaluationCreditAtomic,
} from './studentCreditService.js';
import { savePersistentFile, getPersistentFile } from './persistentStorageService.js';
import { syncRecordToFirestore } from './firestoreSyncService.js';
import { validateAuthoritativeConsistency } from './evaluationIntegrityEngine.js';
import { finalizeEvaluationRun } from './canonicalQuestionInventoryService.js';
import { validateQuestionDeduplication, deduplicateQuestionList } from './canonicalQuestionService.js';
import { getAuthoritativePaperStructure } from './paperStructureService.js';
import {
  EvaluationEvidencePackage,
  enforceEvaluationEvidencePackageMtpGate,
  detectMtpSeriesFromText,
} from './materialHardGateService.js';

export interface EvaluationJobData {
  evaluationId: string;
  studentId: string;
  studentName: string;
  icaiRegistrationNumber: string;
  level: CALevel;
  materialType: MaterialType;
  mtpSeries?: 1 | 2;
  modelGroup?: string;
  subjectKey: string;
  subjectName: string;
  paper?: string;
  attempt?: string;
  syllabusVersion?: string;
  checkingMode: CheckingMode;
  fileBase64: string;
  mimeType: string;
  filename: string;
  pdfBuf: Buffer;
  referenceQuestionPaperText: string;
  referenceSuggestedAnswersText: string;
  markingSchemeText: string;
  referenceMaterialTitle?: string;
  referenceMaterialVersion?: string;
  referenceMaterialId?: string;
  officialPaperMaxMarks?: number;
  sourceFormat?: 'SEPARATE' | 'COMBINED' | 'LEGACY';
  combinedSourceMaterialId?: string;
  questionMaterialId?: string;
  suggestedAnswerMaterialId?: string;
  markingSchemeMaterialId?: string;
  entitlementSource: 'INSTITUTE_ALLOCATION' | 'PERMANENT_FREE' | 'PROMO' | 'PERSONAL_FREE' | 'PERSONAL_PURCHASED_CREDIT';
  resolvedSponsoringInstituteId?: string | null;
  resolvedSponsoringEnrollmentId?: string | null;
  resolvedSponsoringBatchId?: string | null;
  resolvedInstituteName?: string | null;
  requestedEvalSource: 'PUBLIC' | 'INSTITUTE';
  personalEntitlement?: any;
  creditAlreadyConsumed?: boolean;
}

// In-memory active job tracker to prevent duplicate concurrent runs for the same evaluationId
const activeJobs = new Map<string, Promise<void>>();

export function isEvaluationJobActive(evaluationId: string): boolean {
  return activeJobs.has(evaluationId);
}

export function updateEvaluationProgress(
  evaluationId: string,
  status: string,
  stage: string,
  percentage: number,
  message: string
) {
  try {
    db.prepare(`
      UPDATE evaluations
      SET status = ?,
          progress_stage = ?,
          progress_percentage = ?,
          progress_message = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, stage, Math.min(100, Math.max(0, Math.round(percentage))), message, evaluationId);
  } catch (err) {
    console.warn(`[AsyncEval] Error updating progress for ${evaluationId}:`, err);
  }
}

/**
 * Executes the full AI evaluation pipeline asynchronously in the background.
 * The HTTP caller receives an immediate job-created response, and the student's
 * client tracks authoritative state from the database.
 */
export async function executeEvaluationJob(job: EvaluationJobData): Promise<void> {
  const { evaluationId, studentId, subjectName, entitlementSource, resolvedSponsoringInstituteId, resolvedInstituteName, requestedEvalSource, personalEntitlement } = job;

  console.log(`[AsyncEval] Starting background evaluation for ${evaluationId} (${subjectName}, Student: ${studentId})`);

  try {
    // Stage 1: Optical / Answer Sheet Processing
    updateEvaluationProgress(
      evaluationId,
      'READING_ANSWER_SHEET',
      'READING_ANSWER_SHEET',
      15,
      'Reading handwritten answer pages, ledger tables and optical layouts...'
    );

    // Stage 2: Question Mapping & Coverage
    updateEvaluationProgress(
      evaluationId,
      'IDENTIFYING_QUESTIONS',
      'IDENTIFYING_QUESTIONS',
      35,
      'Identifying question numbers, sub-questions, and compulsory parts...'
    );

    // Stage 3: AI Step-Marking Execution against ICAI Rubrics
    updateEvaluationProgress(
      evaluationId,
      'EVALUATING_ANSWERS',
      'EVALUATING_ANSWERS',
      55,
      'Evaluating step-by-step working notes, legal provisions, and standard answers...'
    );

    // SERVER-SIDE INTEGRITY GATE: Validate mtpSeries across the entire EvaluationEvidencePackage
    // Compares requested series against metadata of retrieved Question Paper, Suggested Answer, and Marking Scheme
    const evidencePackage: EvaluationEvidencePackage = {
      evaluationId,
      requestedMtpSeries: job.mtpSeries,
      materialType: job.materialType,
      caLevel: job.level,
      subjectKey: job.subjectKey,
      subjectName: job.subjectName,
      paper: job.paper,
      attempt: job.attempt,
      syllabusVersion: job.syllabusVersion,
      rawMaterialId: job.referenceMaterialId,
      rawMaterialTitle: job.referenceMaterialTitle,
      rawMaterialMtpSeries: job.mtpSeries,
      retrievedAt: new Date().toISOString(),
      integrityGateStatus: 'PENDING',
      questionPaper: {
        text: job.referenceQuestionPaperText,
        metadata: {
          materialId: job.questionMaterialId || job.combinedSourceMaterialId || job.referenceMaterialId,
          version: job.referenceMaterialVersion || 'UNSPECIFIED',
          checksum: crypto.createHash('sha256').update(job.referenceQuestionPaperText || '', 'utf8').digest('hex'),
          textLength: (job.referenceQuestionPaperText || '').length,
          mtpSeries: job.mtpSeries,
          componentType: 'QUESTION_PAPER',
          title: job.referenceMaterialTitle,
          detectedSeries:
            detectMtpSeriesFromText(job.referenceMaterialTitle || '') ||
            detectMtpSeriesFromText((job.referenceQuestionPaperText || '').slice(0, 1000)),
        },
      },
      suggestedAnswers: {
        text: job.referenceSuggestedAnswersText,
        metadata: {
          materialId: job.suggestedAnswerMaterialId || job.combinedSourceMaterialId || job.referenceMaterialId,
          version: job.referenceMaterialVersion || 'UNSPECIFIED',
          checksum: crypto.createHash('sha256').update(job.referenceSuggestedAnswersText || '', 'utf8').digest('hex'),
          textLength: (job.referenceSuggestedAnswersText || '').length,
          mtpSeries: job.mtpSeries,
          componentType: 'SUGGESTED_ANSWERS',
          title: job.referenceMaterialTitle,
          detectedSeries:
            detectMtpSeriesFromText(job.referenceMaterialTitle || '') ||
            detectMtpSeriesFromText((job.referenceSuggestedAnswersText || '').slice(0, 1000)),
        },
      },
      markingScheme: {
        text: job.markingSchemeText || '',
        metadata: {
          materialId: job.markingSchemeMaterialId || job.combinedSourceMaterialId || job.referenceMaterialId,
          version: job.referenceMaterialVersion || 'UNSPECIFIED',
          checksum: crypto.createHash('sha256').update(job.markingSchemeText || '', 'utf8').digest('hex'),
          textLength: (job.markingSchemeText || '').length,
          mtpSeries: job.mtpSeries,
          componentType: 'MARKING_SCHEME',
          title: `${job.referenceMaterialTitle || 'Reference Material'} Marking Scheme`,
          detectedSeries: detectMtpSeriesFromText((job.markingSchemeText || '').slice(0, 1000)),
        },
      },
    };

    try {
      enforceEvaluationEvidencePackageMtpGate(evidencePackage);
    } catch (gateErr: any) {
      console.error(`[AsyncEval] Integrity Gate Mismatch for evaluation ${evaluationId}:`, gateErr.message);
      db.prepare(`
        UPDATE evaluations
        SET status = 'REJECTED', rejection_reason = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(gateErr.message, evaluationId);
      throw gateErr;
    }

    const evaluationResult = await evaluateCAAnswerSheet({
      evaluationId,
      studentName: job.studentName,
      icaiRegistrationNumber: job.icaiRegistrationNumber || 'N/A',
      level: job.level,
      materialType: job.materialType,
      mtpSeries: job.mtpSeries,
      subjectKey: job.subjectKey,
      subjectName: job.subjectName,
      paper: job.paper,
      attempt: job.attempt,
      syllabusVersion: job.syllabusVersion,
      officialPaperMaxMarks: job.officialPaperMaxMarks,
      checkingMode: job.checkingMode,
      fileBase64: job.fileBase64,
      mimeType: job.mimeType || 'application/pdf',
      referenceQuestionPaperText: job.referenceQuestionPaperText,
      referenceSuggestedAnswersText: job.referenceSuggestedAnswersText,
      markingSchemeText: job.markingSchemeText || '',
      referenceMaterialTitle: job.referenceMaterialTitle,
      referenceMaterialVersion: job.referenceMaterialVersion,
      referenceMaterialId: job.referenceMaterialId,
      sourceFormat: job.sourceFormat,
      combinedSourceMaterialId: job.combinedSourceMaterialId,
      questionMaterialId: job.questionMaterialId,
      suggestedAnswerMaterialId: job.suggestedAnswerMaterialId,
      markingSchemeMaterialId: job.markingSchemeMaterialId,
    });

    // Stage 4: Marks Allocation & Consequential Verification
    updateEvaluationProgress(
      evaluationId,
      'CALCULATING_MARKS',
      'CALCULATING_MARKS',
      75,
      'Verifying step calculations, MCQ scores, and total mark allocation...'
    );

    // Structural Deduplication Validation: Canonical Exactly-Once Rule
    const paperStruct = getAuthoritativePaperStructure({
      level: job.level,
      paper: job.paper || job.subjectName,
      subjectName: job.subjectName,
      questionPaperText: job.referenceQuestionPaperText,
      markingSchemeText: job.markingSchemeText,
      suggestedAnswersText: job.referenceSuggestedAnswersText,
      officialPaperMaxMarks: job.officialPaperMaxMarks || 100,
    });

    let dedupValidation = validateQuestionDeduplication(evaluationResult.questions || [], paperStruct.subQuestions);
    if (!dedupValidation.isValid) {
      console.warn(`[AsyncEval] Duplicate question instances detected for evaluation ${evaluationId}: ${dedupValidation.details}. Resolving deterministically.`);
      evaluationResult.questions = deduplicateQuestionList(evaluationResult.questions || [], paperStruct.subQuestions);
      if (evaluationResult.coverageMap && Array.isArray(evaluationResult.coverageMap.attemptedQuestions)) {
        evaluationResult.coverageMap.attemptedQuestions = deduplicateQuestionList(evaluationResult.coverageMap.attemptedQuestions, paperStruct.subQuestions);
      }
      dedupValidation = validateQuestionDeduplication(evaluationResult.questions || [], paperStruct.subQuestions);
      if (!dedupValidation.isValid) {
        throw new Error(`CRITICAL_INTEGRITY_VIOLATION: Cannot generate final report due to persistent question duplication: ${dedupValidation.details}`);
      }
    } else if (evaluationResult.coverageMap && Array.isArray(evaluationResult.coverageMap.attemptedQuestions)) {
      evaluationResult.coverageMap.attemptedQuestions = deduplicateQuestionList(evaluationResult.coverageMap.attemptedQuestions, paperStruct.subQuestions);
    }

    // Stage 5: Artifact Generation (Checked Copy & Detailed Report PDFs)
    updateEvaluationProgress(
      evaluationId,
      'FINALIZING_REPORT',
      'FINALIZING_REPORT',
      85,
      'Pre-generating verified Checked Copy and Detailed Diagnostic Report...'
    );

    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    let originalPageCount = 1;
    let checkedCopyStatus = 'PENDING';
    let reportStatus = 'PENDING';
    let structuredAnnotationsJson = '[]';

    // 5A. Generate Checked Copy PDF
    try {
      const origDoc = await PDFDocument.load(job.pdfBuf, { ignoreEncryption: true });
      originalPageCount = origDoc.getPageCount();

      const meta = {
        id: evaluationId,
        studentName: job.studentName,
        level: job.level,
        subjectName: job.subjectName,
        paper: job.paper || 'Paper 1',
        attempt: job.attempt || 'May 2026',
        materialType: job.materialType,
        mtpSeries: job.mtpSeries,
        checkingMode: job.checkingMode,
        totalMarks: evaluationResult.totalMarks,
        maximumMarks: evaluationResult.maximumMarks,
        percentage: evaluationResult.percentage,
        grade: evaluationResult.grade,
        createdAt: new Date().toISOString(),
      };

      const structuredAnn = buildStructuredAnnotations(meta, evaluationResult, originalPageCount);
      structuredAnnotationsJson = JSON.stringify(structuredAnn);

      const checkedPdfBuf = await generateCheckedCopyPdf(meta, evaluationResult, job.pdfBuf);
      const checkedFilePath = path.join(uploadsDir, `${evaluationId}_checked_copy.pdf`);
      fs.writeFileSync(checkedFilePath, checkedPdfBuf);

      // Persist checked copy to Cloud Storage / persistent cache
      await savePersistentFile(
        `${evaluationId}_checked_copy`,
        `${evaluationId}_checked_copy.pdf`,
        'application/pdf',
        checkedPdfBuf,
        'EVALUATION_CHECKED_COPY',
        {
          ownerUserId: studentId,
          evaluationId,
          instituteId: resolvedSponsoringInstituteId || null,
        }
      );
      checkedCopyStatus = 'READY';
    } catch (annErr) {
      console.warn('[AsyncEval] Error generating checked copy PDF:', annErr);
    }

    // 5B. Generate Detailed Report PDF
    try {
      const studentRow = db.prepare('SELECT full_name FROM users WHERE id = ?').get(studentId) as any;
      const reportMeta = {
        id: evaluationId,
        studentName: studentRow?.full_name || job.studentName || 'CA Student',
        level: job.level,
        subjectName: job.subjectName,
        paper: job.paper || 'Paper 1',
        attempt: job.attempt || 'May 2026',
        materialType: job.materialType,
        mtpSeries: job.mtpSeries,
        checkingMode: job.checkingMode,
        totalMarks: evaluationResult.totalMarks,
        maximumMarks: evaluationResult.maximumMarks,
        percentage: evaluationResult.percentage,
        grade: evaluationResult.grade,
        createdAt: new Date().toISOString(),
        evaluationSource: requestedEvalSource,
        instituteName: resolvedInstituteName || undefined,
      };

      const reportPdfBuf = await generateDetailedReportPdf(reportMeta, evaluationResult);
      const reportFilePath = path.join(uploadsDir, `${evaluationId}_report.pdf`);
      fs.writeFileSync(reportFilePath, reportPdfBuf);

      // Persist detailed report to Cloud Storage / persistent cache
      await savePersistentFile(
        `${evaluationId}_report`,
        `Evaluation_Report_${evaluationId}.pdf`,
        'application/pdf',
        reportPdfBuf,
        'EVALUATION_REPORT',
        {
          ownerUserId: studentId,
          evaluationId,
          instituteId: resolvedSponsoringInstituteId || null,
        }
      );
      reportStatus = 'READY';
    } catch (reportErr) {
      console.warn('[AsyncEval] Error pre-generating detailed report PDF:', reportErr);
    }

    // MTP Series Authoritative Integrity Gate (Requirement: verify series matching before COMPLETED)
    if (job.materialType === 'MTP') {
      const evalRow = db.prepare('SELECT mtp_series, material_id FROM evaluations WHERE id = ?').get(evaluationId) as any;
      const dbSeries = evalRow?.mtp_series !== undefined && evalRow?.mtp_series !== null ? Number(evalRow.mtp_series) : null;
      const jobSeries = job.mtpSeries !== undefined && job.mtpSeries !== null ? Number(job.mtpSeries) : null;

      let materialSeries: number | null = null;
      if (evalRow?.material_id) {
        const matRow = (db.prepare('SELECT mtp_series FROM evaluation_materials WHERE id = ?').get(evalRow.material_id) as any)
          || (db.prepare('SELECT mtp_series FROM institute_materials WHERE id = ?').get(evalRow.material_id) as any);
        if (matRow && matRow.mtp_series !== null && matRow.mtp_series !== undefined) {
          materialSeries = Number(matRow.mtp_series);
        }
      }

      const isSeriesValid = jobSeries === 1 || jobSeries === 2;
      const matchesDb = dbSeries === jobSeries;
      const matchesMaterial = materialSeries === null || materialSeries === jobSeries;

      if (!isSeriesValid || !matchesDb || !matchesMaterial) {
        const mismatchErr = `CRITICAL_INTEGRITY_VIOLATION: MTP Series mismatch detected (Job: ${jobSeries}, DB: ${dbSeries}, Material: ${materialSeries}). Evaluation halted to protect academic validity.`;
        console.error(`[AsyncEval] ${mismatchErr}`);
        db.prepare(`
          UPDATE evaluations
          SET status = 'FAILED',
              progress_stage = 'FAILED',
              progress_percentage = 0,
              progress_message = ?,
              error_message = ?,
              completed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(mismatchErr, mismatchErr, evaluationId);
        // The upload may already have consumed a personal entitlement. A source
        // binding failure is a protected system failure, so return that credit.
        if (
          job.creditAlreadyConsumed &&
          (entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'PERSONAL_PURCHASED_CREDIT')
        ) {
          refundEvaluationCreditAtomic({ userId: studentId, evaluationId, entitlementSource });
        }
        return;
      }
    }

    // Stage 6: Only finalize after every validation, render, and persistence gate passes.
    const consistencyReport = validateAuthoritativeConsistency(evaluationResult);
    const runPackage = evaluationResult.evaluationRunPackage;
    const renderManifest = runPackage?.renderManifest;
    const integrityChecksPassed =
      consistencyReport.isValid &&
      evaluationResult.validationStatus === 'VALID' &&
      evaluationResult.completionGateReport?.isPassed === true &&
      Boolean(runPackage?.scoreLedger?.isReconciled) &&
      Boolean(runPackage?.reconciliation?.isFullyReconciled);
    const artifactsPassed =
      checkedCopyStatus === 'READY' &&
      reportStatus === 'READY' &&
      renderManifest?.isRenderValid === true;
    const eligibleForFinalization = Boolean(runPackage) && integrityChecksPassed && artifactsPassed;

    let durablePackagePersisted = false;
    let finalStatus: 'COMPLETED' | 'NEEDS_REVIEW' = 'NEEDS_REVIEW';
    let finalizationErrors: string[] = [];
    if (runPackage) {
      const packageToPersist = {
        ...runPackage,
        durablePersistenceConfirmed: true,
        finalizationStatus: eligibleForFinalization ? 'PERSISTED' as const : 'INTEGRITY_FAILED' as const,
      };
      evaluationResult.evaluationRunPackage = packageToPersist;
      try {
        persistEvaluationRunPackageAtomic(packageToPersist);
        durablePackagePersisted = true;
        console.log(`[AsyncEval] Durably persisted authoritative EvaluationRunPackage for ${evaluationId}`);
      } catch (persistErr: any) {
        console.error(`[AsyncEval] Error persisting EvaluationRunPackage for ${evaluationId}:`, persistErr.message);
        finalizationErrors.push(`EvaluationRunPackage persistence failed: ${persistErr.message}`);
        evaluationResult.evaluationRunPackage = {
          ...packageToPersist,
          durablePersistenceConfirmed: false,
          finalizationStatus: 'PERSISTENCE_FAILED',
        };
      }

      if (eligibleForFinalization && durablePackagePersisted) {
        const finalizationResult = finalizeEvaluationRun({
          runPackage: evaluationResult.evaluationRunPackage!,
          evaluationId,
        });
        evaluationResult.evaluationRunPackage = finalizationResult.package;
        if (finalizationResult.success) {
          finalStatus = 'COMPLETED';
        } else {
          finalizationErrors = finalizationResult.errors;
          console.error(`[AsyncEval] Finalization gate rejected ${evaluationId}:`, finalizationResult.errors);
          try {
            persistEvaluationRunPackageAtomic(finalizationResult.package);
          } catch (persistErr: any) {
            console.error(`[AsyncEval] Could not persist rejected finalization package for ${evaluationId}:`, persistErr.message);
          }
        }
      }
    }

    if (finalStatus !== 'COMPLETED') {
      const reviewErrors = Array.from(new Set([
        ...(!consistencyReport.isValid ? consistencyReport.errors : []),
        ...(evaluationResult.validationErrors || []),
        ...(!integrityChecksPassed && consistencyReport.isValid && evaluationResult.validationStatus === 'VALID'
          ? ['One or more hard completion checks did not pass.']
          : []),
        ...(!artifactsPassed ? ['Checked copy, report, or render verification is not ready.'] : []),
        ...(!durablePackagePersisted ? ['EvaluationRunPackage persistence was not confirmed.'] : []),
        ...(renderManifest?.renderErrors || []),
        ...finalizationErrors,
      ]));
      evaluationResult.validationStatus = 'NEEDS_REVIEW';
      evaluationResult.validationErrors = reviewErrors;
      evaluationResult.completionGateReport = {
        ...(evaluationResult.completionGateReport || { passedCount: 0, failedCount: 0, checks: [], timestamp: new Date().toISOString() }),
        isPassed: false,
        failedCount: Math.max(1, reviewErrors.length),
      };
      evaluationResult.integrityAudit = {
        ...(evaluationResult.integrityAudit || {}),
        hardCompletionGatePassed: false,
        errors: reviewErrors,
      };
      console.warn(`[AsyncEval] Evaluation ${evaluationId} remains NEEDS_REVIEW:`, reviewErrors);
    }

    db.prepare(`
      UPDATE evaluations
      SET status = ?,
          progress_stage = ?,
          progress_percentage = 100,
          progress_message = ?,
          total_marks = ?,
          maximum_marks = ?,
          percentage = ?,
          grade = ?,
          confidence_score = ?,
          model_provider = ?,
          model_used = ?,
          original_model = ?,
          fallback_model = ?,
          retry_count = ?,
          prompt_tokens = ?,
          completion_tokens = ?,
          total_tokens = ?,
          latency_ms = ?,
          fallback_occurred = ?,
          fallback_reason = ?,
          result_json = ?,
          annotations_json = ?,
          original_page_count = ?,
          checked_copy_page_count = ?,
          checked_copy_status = ?,
          report_status = ?,
          mtp_series = COALESCE(?, mtp_series),
          pyq_source_format = COALESCE(?, pyq_source_format),
          normalized_package_json = ?,
          question_sources_json = ?,
          evaluation_run_package_id = COALESCE(?, evaluation_run_package_id),
          score_ledger_total = COALESCE(?, score_ledger_total),
          durable_persistence_confirmed = ?,
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      finalStatus,
      finalStatus === 'COMPLETED' ? 'COMPLETED' : 'NEEDS_REVIEW',
      finalStatus === 'COMPLETED'
        ? 'Evaluation complete and verified'
        : 'Integrity checks did not pass. The evaluation is preserved for review; no final score was issued.',
      evaluationResult.totalMarks,
      evaluationResult.maximumMarks,
      evaluationResult.percentage,
      evaluationResult.grade,
      evaluationResult.confidenceScore || (evaluationResult as any).overallConfidenceScore || 95.0,
      evaluationResult.modelProvider || 'gemini',
      evaluationResult.modelUsed || 'gemini-3.8-flash',
      evaluationResult.originalModel || 'gemini-3.8-flash',
      evaluationResult.fallbackModel || null,
      evaluationResult.retryCount || 0,
      evaluationResult.promptTokens || 0,
      evaluationResult.completionTokens || 0,
      evaluationResult.totalTokens || 0,
      evaluationResult.latencyMs || 0,
      evaluationResult.fallbackOccurred ? 1 : 0,
      evaluationResult.fallbackReason || null,
      JSON.stringify(evaluationResult),
      structuredAnnotationsJson,
      originalPageCount,
      originalPageCount,
      checkedCopyStatus,
      reportStatus,
      job.mtpSeries || null,
      job.sourceFormat || null,
      JSON.stringify({
        materialId: job.referenceMaterialId,
        title: job.referenceMaterialTitle,
        version: job.referenceMaterialVersion,
        materialType: job.materialType,
        sourceFormat: job.sourceFormat || 'SEPARATE',
        combinedSourceMaterialId: job.combinedSourceMaterialId,
        questionMaterialId: job.questionMaterialId,
        suggestedAnswerMaterialId: job.suggestedAnswerMaterialId,
        markingSchemeMaterialId: job.markingSchemeMaterialId,
      }),
      JSON.stringify((evaluationResult.questions || []).map(q => ({
        questionNumber: q.questionNumber,
        sources: (q as any).sources || {
          questionSourceId: job.sourceFormat === 'COMBINED' ? job.combinedSourceMaterialId : job.questionMaterialId,
          suggestedAnswerSourceId: job.sourceFormat === 'COMBINED' ? job.combinedSourceMaterialId : job.suggestedAnswerMaterialId,
          markingSchemeSourceId: job.markingSchemeMaterialId,
          sourceFormat: job.sourceFormat || 'SEPARATE',
        }
      }))),
      evaluationResult.evaluationRunPackage?.runId || null,
      evaluationResult.evaluationRunPackage?.scoreLedger?.totalAwardedMarks ?? evaluationResult.totalMarks,
      durablePackagePersisted ? 1 : 0,
      evaluationId
    );

    if (finalStatus !== 'COMPLETED') {
      // The personal entitlement was charged when the upload was accepted.
      // Return it when the system could not produce a verified final result.
      if (
        job.creditAlreadyConsumed &&
        (entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'PERSONAL_PURCHASED_CREDIT')
      ) {
        try {
          refundEvaluationCreditAtomic({ userId: studentId, evaluationId, entitlementSource });
          db.prepare('UPDATE evaluations SET consumed_from_personal_credits = 0 WHERE id = ?').run(evaluationId);
        } catch (refundErr) {
          console.error(`[AsyncEval] Refund error for review-required evaluation ${evaluationId}:`, refundErr);
        }
      }

      try {
        db.prepare(`
          INSERT INTO notifications (id, user_id, title, message, type)
          VALUES (?, ?, ?, ?, 'EVALUATION')
        `).run(
          `notif_${crypto.randomBytes(8).toString('hex')}`,
          studentId,
          'Evaluation Requires Review',
          `Your evaluation for ${subjectName} is preserved for review. No final score was issued.`,
        );
      } catch (notifErr) {
        console.warn('[AsyncEval] Error adding review notification:', notifErr);
      }

      try {
        const reviewEvalRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId);
        if (reviewEvalRow) syncRecordToFirestore('evaluations', evaluationId, reviewEvalRow as any);
      } catch (syncErr) {
        console.warn('[AsyncEval] Error syncing review-required evaluation to Firestore:', syncErr);
      }
      return;
    }

    // Stage 7: Consume Credit / Quota ONLY ON SUCCESS
    if (entitlementSource === 'INSTITUTE_ALLOCATION' && resolvedSponsoringInstituteId) {
      const idempotencyKey = `inst_eval_${evaluationId}`;
      const existingLedger = db.prepare('SELECT id FROM institute_usage_ledger WHERE idempotency_key = ?').get(idempotencyKey);
      if (!existingLedger) {
        db.prepare(`
          UPDATE institute_subscriptions
          SET evaluations_used = evaluations_used + 1,
              evaluations_remaining = MAX(0, evaluations_remaining - 1)
          WHERE institute_id = ? AND status = 'ACTIVE'
        `).run(resolvedSponsoringInstituteId);

        db.prepare(`
          INSERT INTO institute_usage_ledger (
            id, institute_id, student_id, evaluation_id, usage_type,
            evaluations_deducted, description, idempotency_key
          ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
          `usg_${crypto.randomBytes(8).toString('hex')}`,
          resolvedSponsoringInstituteId,
          studentId,
          evaluationId,
          requestedEvalSource === 'PUBLIC' ? 'STUDENT_PUBLIC_EVALUATION' : 'STUDENT_EVALUATION',
          `Sponsored ${requestedEvalSource} Evaluation (${subjectName}) for student`,
          idempotencyKey
        );

        db.prepare(`
          UPDATE evaluations
          SET consumed_from_institute_allocation = 1,
              consumed_from_personal_credits = 0
          WHERE id = ?
        `).run(evaluationId);

        db.prepare(`
          INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
          VALUES (?, ?, ?, 'EVALUATION', ?, ?)
        `).run(
          `aud_${crypto.randomBytes(8).toString('hex')}`,
          studentId,
          requestedEvalSource === 'PUBLIC' ? 'EVALUATION_PUBLIC_INSTITUTE_SPONSORED' : 'EVALUATION_INSTITUTE_SPONSORED',
          evaluationId,
          `1 evaluation credit deducted from sponsoring institute (${resolvedInstituteName || resolvedSponsoringInstituteId}). Personal credits untouched.`
        );
      }
    } else if (entitlementSource === 'PROMO' && personalEntitlement?.referralRedemptionId) {
      db.prepare(`
        UPDATE referral_redemptions
        SET evaluations_used = evaluations_used + 1,
            evaluations_remaining = MAX(0, evaluations_remaining - 1),
            status = CASE WHEN evaluations_remaining - 1 <= 0 THEN 'EXHAUSTED' ELSE status END
        WHERE id = ?
      `).run(personalEntitlement.referralRedemptionId);

      db.prepare(`
        INSERT INTO credit_ledger (id, student_id, amount, source, balance_after, evaluation_id, note)
        VALUES (?, ?, -1, 'CONSUMED_PROMO_AI30', ?, ?, 'Consumed 1 promotional evaluation (${personalEntitlement.referralCode || 'AI30'})')
      `).run(
        `cld_${crypto.randomBytes(8).toString('hex')}`,
        studentId,
        Math.max(0, (personalEntitlement.referralEvaluationsRemaining || 1) - 1),
        evaluationId
      );

      db.prepare(`
        UPDATE evaluations
        SET consumed_from_institute_allocation = 0,
            consumed_from_personal_credits = 0
        WHERE id = ?
      `).run(evaluationId);
    } else if (entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'PERSONAL_PURCHASED_CREDIT') {
      if (!job.creditAlreadyConsumed) {
        // If not already deducted at acceptance time, atomically deduct now
        consumeEvaluationEntitlementAtomic({
          userId: studentId,
          evaluationId,
        });
      } else {
        // Already deducted atomically at acceptance time; record completion audit log
        try {
          db.prepare(`
            INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
            VALUES (?, ?, 'EVALUATION_COMPLETED_CREDIT', 'EVALUATION', ?, ?)
          `).run(
            `aud_${crypto.randomBytes(8).toString('hex')}`,
            studentId,
            evaluationId,
            `Evaluation completed successfully under entitlement source: ${entitlementSource}`
          );
        } catch (auditErr) {
          console.warn('[AsyncEval] Audit log error:', auditErr);
        }
      }
    }

    // Stage 8: Student Notification
    try {
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type)
        VALUES (?, ?, ?, ?, 'EVALUATION')
      `).run(
        `notif_${crypto.randomBytes(8).toString('hex')}`,
        studentId,
        'Answer Sheet Evaluation Complete',
        `Your evaluation for ${subjectName} is complete. You scored ${evaluationResult.totalMarks}/${evaluationResult.maximumMarks} (${evaluationResult.percentage}%).`
      );
    } catch (notifErr) {
      console.warn('[AsyncEval] Error adding completion notification:', notifErr);
    }

    // Stage 9: Sync completed evaluation to Cloud Firestore
    try {
      const completedEvalRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId);
      if (completedEvalRow) {
        syncRecordToFirestore('evaluations', evaluationId, completedEvalRow as any);
      }
    } catch (syncErr) {
      console.warn('[AsyncEval] Error syncing completed evaluation to Firestore:', syncErr);
    }

    console.log(`[AsyncEval] Successfully completed evaluation ${evaluationId} (${evaluationResult.totalMarks}/${evaluationResult.maximumMarks} marks)`);
  } catch (error: unknown) {
    console.error(`[AsyncEval] Evaluation failed for ${evaluationId}:`, error);

    const errMsg = error instanceof Error ? error.message : 'Evaluation processing encountered an unexpected issue.';

    // Refund credit/free evaluation atomically if it was already deducted on acceptance
    if (job.creditAlreadyConsumed && (entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'PERSONAL_PURCHASED_CREDIT')) {
      try {
        refundEvaluationCreditAtomic({
          userId: studentId,
          evaluationId,
          entitlementSource,
        });
      } catch (refundErr) {
        console.warn(`[AsyncEval] Refund error on failure for ${evaluationId}:`, refundErr);
      }
    }

    // Mark as failed in DB, NO CREDITS CONSUMED
    db.prepare(`
      UPDATE evaluations
      SET status = 'FAILED',
          progress_stage = 'FAILED',
          progress_percentage = 0,
          progress_message = ?,
          error_message = ?,
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(errMsg.slice(0, 500), errMsg.slice(0, 500), evaluationId);
  } finally {
    activeJobs.delete(evaluationId);
  }
}

/**
 * Safely enqueues an evaluation job to run asynchronously in the background.
 * Returns immediately without blocking the caller.
 */
export function enqueueEvaluation(job: EvaluationJobData): void {
  if (activeJobs.has(job.evaluationId)) {
    console.log(`[AsyncEval] Evaluation ${job.evaluationId} is already running in background.`);
    return;
  }

  // Update status to QUEUED in database
  updateEvaluationProgress(
    job.evaluationId,
    'QUEUED',
    'QUEUED',
    5,
    'Evaluation job safely queued. Starting processing pipeline...'
  );

  // Run in background without blocking
  const promise = executeEvaluationJob(job).catch((err) => {
    console.error(`[AsyncEval] Unhandled error in background evaluation ${job.evaluationId}:`, err);
  });

  activeJobs.set(job.evaluationId, promise);
}
