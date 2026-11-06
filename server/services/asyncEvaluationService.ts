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
  syncStudentCreditsToFirestore,
} from './studentCreditService.js';
import { savePersistentFile, getPersistentFile, deletePersistentFile } from './persistentStorageService.js';
import { syncRecordToFirestore } from './firestoreSyncService.js';
import { getFirestoreDoc, queryFirestoreDocs, runFirestoreTransaction } from './firestoreDbService.js';
import { releaseFacultyMockFreeCopy, releaseFacultyMockPaidCopy } from './facultyMockEntitlementService.js';
import { validateAuthoritativeConsistency } from './evaluationIntegrityEngine.js';
import { isEvaluationValidationSafeForCertification } from './evaluationIntegrityHardening.js';
import { finalizeEvaluationRun } from './canonicalQuestionInventoryService.js';
import { validateQuestionDeduplication, deduplicateQuestionList } from './canonicalQuestionService.js';
import { getAuthoritativePaperStructure } from './paperStructureService.js';
import { getMaxModelTestNumberForLevel } from './modelTestLimits.js';
import {
  EvaluationEvidencePackage,
  enforceEvaluationEvidencePackageMtpGate,
  detectMtpSeriesFromText,
  normalizeAndSplitCombinedPyq,
} from './materialHardGateService.js';

export interface EvaluationJobData {
  evaluationId: string;
  studentId: string;
  studentName: string;
  icaiRegistrationNumber: string;
  level: CALevel;
  materialType: MaterialType;
  mtpSeries?: 1 | 2;
  modelTestNumber?: number;
  facultyMockTestId?: string;
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
  entitlementSource: 'INSTITUTE_ALLOCATION' | 'PERMANENT_FREE' | 'PROMO' | 'PERSONAL_FREE' | 'PERSONAL_PURCHASED_CREDIT' | 'FACULTY_MOCK_SPONSORED';
  resolvedSponsoringInstituteId?: string | null;
  resolvedSponsoringEnrollmentId?: string | null;
  resolvedSponsoringBatchId?: string | null;
  resolvedInstituteName?: string | null;
  requestedEvalSource: 'PUBLIC' | 'INSTITUTE' | 'FACULTY_MOCK';
  personalEntitlement?: any;
  creditAlreadyConsumed?: boolean;
  /** Retry of an existing evaluation: do not consume or refund its original entitlement again. */
  isRecoveryRetry?: boolean;
}

// Keep the supervisor correction loop opt-in until its model/pipeline is validated.
// This prevents extra model calls on the normal evaluation path by default.
const ENABLE_EVALUATION_SUPERVISOR = process.env.EVALUATION_SUPERVISOR_ENABLED === 'true';

// In-memory active job tracker to prevent duplicate concurrent runs for the same evaluationId.
const activeJobs = new Map<string, Promise<void>>();
const TERMINAL_EVALUATION_STATUSES = new Set([
  'COMPLETED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED', 'PERSISTENCE_FAILED', 'CANCELLED',
]);

function isTerminalEvaluationStatus(status: unknown): boolean {
  return TERMINAL_EVALUATION_STATUSES.has(String(status || '').toUpperCase());
}

/**
 * Revalidate the selected source before the expensive AI run. This keeps
 * Model Test / Faculty jobs on the shared MTP/PYQ evaluator without accepting
 * a stale UI selection or a reference TXT from another test.
 */
function assertExactEvaluationSourceBinding(job: EvaluationJobData): void {
  const evaluation = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(job.evaluationId) as any;
  if (!evaluation) {
    throw new Error('EVALUATION_SOURCE_BINDING_FAILED: Evaluation record not found.');
  }

  const isModelTest = job.materialType === 'MODEL_TEST_PAPER';
  const isFacultyMock = job.requestedEvalSource === 'FACULTY_MOCK' || job.materialType === 'FACULTY_MOCK_TEST';
  // Do not impose this extra Model/Faculty source binding on legacy PYQ/MTP
  // or institute-specific jobs; they retain their existing validated flow.
  if (!isModelTest && !isFacultyMock) return;

  const sameText = (left: unknown, right: unknown): boolean => {
    const leftHash = crypto.createHash('sha256').update(String(left || '').trim(), 'utf8').digest('hex');
    const rightHash = crypto.createHash('sha256').update(String(right || '').trim(), 'utf8').digest('hex');
    return leftHash === rightHash;
  };
  const same = (left: unknown, right: unknown): boolean =>
    String(left ?? '').trim().toUpperCase() === String(right ?? '').trim().toUpperCase();

  if (!same(evaluation.level, job.level) ||
      !same(evaluation.subject_key, job.subjectKey) ||
      !same(evaluation.subject_name, job.subjectName) ||
      !same(evaluation.paper, job.paper || 'Paper 1') ||
      !same(evaluation.attempt, job.attempt)) {
    throw new Error('EVALUATION_SOURCE_BINDING_FAILED: Selected course, subject, paper or attempt no longer matches the accepted evaluation.');
  }

  if (job.materialType === 'MODEL_TEST_PAPER') {
    const maxModelTestNumber = getMaxModelTestNumberForLevel(job.level);
    const expectedNumber = Number(job.modelTestNumber);
    if (!Number.isInteger(expectedNumber) || expectedNumber < 1 || expectedNumber > maxModelTestNumber ||
        Number(evaluation.model_test_number) !== expectedNumber ||
        String(evaluation.material_id || '') !== String(job.referenceMaterialId || '')) {
      throw new Error('MODEL_TEST_SOURCE_BINDING_FAILED: Selected Model Test number or material ID does not match the saved evaluation.');
    }

    const material = db.prepare(
      "SELECT id, level, subject_key, subject_name, paper, model_test_number, source_format, question_paper_text, suggested_answers_text, marking_scheme_text FROM evaluation_materials WHERE id = ? AND material_type = 'MODEL_TEST_PAPER' AND status = 'ACTIVE' AND source_type = 'ADMIN' AND admin_approved = 1 LIMIT 1"
    ).get(job.referenceMaterialId) as any;

    let authoritativeQuestionPaper = String(material?.question_paper_text || '').trim();
    let authoritativeSuggestedAnswers = String(material?.suggested_answers_text || '').trim();
    const authoritativeMarkingScheme = String(material?.marking_scheme_text || '').trim();
    if (material?.source_format === 'COMBINED' &&
        (!authoritativeQuestionPaper || !authoritativeSuggestedAnswers ||
          authoritativeQuestionPaper === authoritativeSuggestedAnswers ||
          authoritativeQuestionPaper.length < 50 || authoritativeSuggestedAnswers.length < 50)) {
      const sourceForSplit = authoritativeQuestionPaper.length >= 50
        ? authoritativeQuestionPaper
        : authoritativeSuggestedAnswers;
      if (sourceForSplit.length >= 50) {
        const normalized = normalizeAndSplitCombinedPyq(sourceForSplit);
        authoritativeQuestionPaper = normalized.questionPaperText;
        authoritativeSuggestedAnswers = normalized.suggestedAnswersText;
      }
    }

    if (!material ||
        Number(material.model_test_number) !== expectedNumber ||
        !same(material.level, job.level) ||
        !same(material.subject_key, job.subjectKey) ||
        !same(material.subject_name, job.subjectName) ||
        !same(material.paper, job.paper || 'Paper 1') ||
        !sameText(authoritativeQuestionPaper, job.referenceQuestionPaperText) ||
        !sameText(authoritativeSuggestedAnswers, job.referenceSuggestedAnswersText) ||
        !sameText(authoritativeMarkingScheme, job.markingSchemeText)) {
      throw new Error('MODEL_TEST_SOURCE_BINDING_FAILED: The selected Model Test Question Paper, Suggested Answer or Marking Scheme changed or belongs to another test.');
    }
  }

  if (job.requestedEvalSource === 'FACULTY_MOCK' || job.materialType === 'FACULTY_MOCK_TEST') {
    const mockId = String(job.facultyMockTestId || '').trim();
    if (!mockId || job.requestedEvalSource !== 'FACULTY_MOCK' ||
        job.materialType !== 'FACULTY_MOCK_TEST' ||
        String(evaluation.faculty_mock_test_id || '') !== mockId ||
        String(evaluation.material_id || '') !== mockId ||
        String(job.referenceMaterialId || '') !== mockId) {
      throw new Error('FACULTY_MOCK_SOURCE_BINDING_FAILED: Selected Faculty Mock ID does not match the saved evaluation.');
    }

    const mock = db.prepare('SELECT * FROM faculty_mock_tests WHERE id = ?').get(mockId) as any;
    if (!mock ||
        !same(mock.course_level, job.level) ||
        !same(mock.subject_key, job.subjectKey) ||
        !same(mock.subject_name, job.subjectName) ||
        !same(mock.paper || 'Paper 1', job.paper || 'Paper 1') ||
        !same(mock.attempt, job.attempt) ||
        !sameText(mock.question_paper_text, job.referenceQuestionPaperText) ||
        !sameText(mock.suggested_answers_text, job.referenceSuggestedAnswersText) ||
        !sameText(mock.marking_scheme_text, job.markingSchemeText)) {
      throw new Error('FACULTY_MOCK_SOURCE_BINDING_FAILED: The selected Faculty Mock QP or private TXT reference changed or belongs to another mock.');
    }
  }
}


/**
 * Returns Faculty Mock copy access when asynchronous AI evaluation fails.
 * Successful / NEEDS_REVIEW evaluations keep the copy consumed.
 */
async function releaseFacultyMockCopyAccessForFailedEvaluation(evaluationId: string): Promise<void> {
  try {
    const evaluation = db.prepare(`
      SELECT student_id, faculty_mock_test_id, faculty_mock_payment_order_id
      FROM evaluations WHERE id = ?
    `).get(evaluationId) as {
      student_id?: string;
      faculty_mock_test_id?: string | null;
      faculty_mock_payment_order_id?: string | null;
    } | undefined;
    if (!evaluation?.faculty_mock_test_id || !evaluation.student_id) return;

    if (evaluation.faculty_mock_payment_order_id) {
      await releaseFacultyMockPaidCopy(
        evaluation.faculty_mock_payment_order_id,
        evaluation.student_id,
        evaluation.faculty_mock_test_id,
        evaluationId,
      );
      db.prepare(`
        UPDATE faculty_mock_copy_purchases
        SET status = 'AVAILABLE', evaluation_id = NULL, consumed_at = NULL
        WHERE order_id = ? AND evaluation_id = ? AND status = 'CONSUMED'
      `).run(evaluation.faculty_mock_payment_order_id, evaluationId);
    } else {
      await releaseFacultyMockFreeCopy(evaluation.student_id, evaluation.faculty_mock_test_id, evaluationId);
      db.prepare(`
        DELETE FROM faculty_mock_free_uses
        WHERE student_id = ? AND faculty_mock_test_id = ? AND evaluation_id = ?
      `).run(evaluation.student_id, evaluation.faculty_mock_test_id, evaluationId);
    }
  } catch (error) {
    console.warn(`[AsyncEval] Could not restore Faculty Mock copy access for ${evaluationId}:`, error);
  }
}

function getEvaluationStatus(evaluationId: string): string {
  const row = db.prepare('SELECT status FROM evaluations WHERE id = ?').get(evaluationId) as { status?: string } | undefined;
  return String(row?.status || '').toUpperCase();
}

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
    const update = db.prepare(`
      UPDATE evaluations
      SET status = ?,
          progress_stage = ?,
          progress_percentage = ?,
          progress_message = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND UPPER(COALESCE(status, '')) NOT IN ('COMPLETED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED', 'PERSISTENCE_FAILED', 'CANCELLED')
    `).run(status, stage, Math.min(100, Math.max(0, Math.round(percentage))), message, evaluationId);

    if (update.changes !== 1 && isTerminalEvaluationStatus(getEvaluationStatus(evaluationId))) {
      throw new Error(`TERMINAL_EVALUATION_STATE_PRESERVED:${getEvaluationStatus(evaluationId)}`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('TERMINAL_EVALUATION_STATE_PRESERVED:')) throw err;
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
      requestedModelTestNumber: job.modelTestNumber,
      rawMaterialModelTestNumber: job.modelTestNumber,
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
          modelTestNumber: job.modelTestNumber,
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
          modelTestNumber: job.modelTestNumber,
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
          modelTestNumber: job.modelTestNumber,
          componentType: 'MARKING_SCHEME',
          title: `${job.referenceMaterialTitle || 'Reference Material'} Marking Scheme`,
          detectedSeries: detectMtpSeriesFromText((job.markingSchemeText || '').slice(0, 1000)),
        },
      },
    };

    // Fail closed before any AI work if the selected Model / Faculty material
    // no longer matches the exact submission captured by the API route.
    assertExactEvaluationSourceBinding(job);

    try {
      enforceEvaluationEvidencePackageMtpGate(evidencePackage);
    } catch (gateErr: any) {
      const gateReason = String(gateErr?.message || 'Reference-material integrity check failed.').slice(0, 500);
      const studentFacingReason = 'The selected question paper, suggested answer or marking scheme did not pass the reference-material integrity checks. Please verify your selected exam attempt and paper, or contact support for a review.';
      console.error(`[AsyncEval] Integrity Gate Mismatch for evaluation ${evaluationId}:`, gateReason);
      const rejectionUpdate = db.prepare(`
        UPDATE evaluations
        SET status = 'REJECTED',
            rejection_reason = ?,
            error_message = ?,
            progress_stage = 'REJECTED',
            progress_percentage = 100,
            progress_message = 'Reference material verification failed',
            completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND UPPER(COALESCE(status, '')) NOT IN ('COMPLETED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED', 'PERSISTENCE_FAILED', 'CANCELLED')
      `).run(studentFacingReason, gateReason, evaluationId);

      if (rejectionUpdate.changes === 1) {
        const notificationId = `notif_eval_rejected_${evaluationId}`;
        const notificationMessage = `Your evaluation for ${subjectName || 'the selected paper'} was rejected. Reason: ${studentFacingReason}\n\nIf you believe this decision is incorrect, please contact support for a review.`;
        db.prepare(`
          INSERT OR IGNORE INTO notifications (id, user_id, title, message, type)
          VALUES (?, ?, 'Evaluation Rejected', ?, 'EVALUATION')
        `).run(notificationId, studentId, notificationMessage);

        const rejectedRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId) as any;
        const notificationRow = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notificationId) as any;
        if (rejectedRow) await syncRecordToFirestore('evaluations', evaluationId, rejectedRow);
        if (notificationRow) await syncRecordToFirestore('notifications', notificationId, notificationRow);

        // The integrity gate can run after an entitlement was accepted. Refund only if
        // this worker established the rejection transition, avoiding duplicate refunds.
        if (job.creditAlreadyConsumed && !job.isRecoveryRetry &&
          (entitlementSource === 'PROMO' || entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'PERSONAL_PURCHASED_CREDIT')) {
          try {
            const restored = refundEvaluationCreditAtomic({ userId: studentId, evaluationId, entitlementSource });
            if (restored) {
              db.prepare('UPDATE evaluations SET consumed_from_personal_credits = 0 WHERE id = ?').run(evaluationId);
              await syncStudentCreditsToFirestore(studentId);
            }
          } catch (refundErr) {
            console.warn(`[AsyncEval] Rejection refund error for ${evaluationId}:`, refundErr);
          }
        }
      }
      throw gateErr;
    }

    let evaluationResult = await evaluateCAAnswerSheet({
      evaluationId,
      studentName: job.studentName,
      icaiRegistrationNumber: job.icaiRegistrationNumber || 'N/A',
      level: job.level,
      materialType: job.materialType,
      mtpSeries: job.mtpSeries,
      modelTestNumber: job.modelTestNumber,
      facultyMockTestId: job.facultyMockTestId,
      evaluationSource: job.requestedEvalSource,
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
      materialType: job.materialType,
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

    // Stage 4B is opt-in while the supervisor correction pipeline is being validated.
    // Main CA evaluation, deterministic integrity checks, PDF extraction, and report
    // generation remain active when the flag is unset (the production-safe default).
    if (ENABLE_EVALUATION_SUPERVISOR) {
      const { runEvaluationSupervisor } = await import('./evaluationSupervisorService.js');
      evaluationResult = await runEvaluationSupervisor({
        evaluationResult,
        pdfBuffer: job.pdfBuf,
        paperStructure: paperStruct,
        questionPaperText: job.referenceQuestionPaperText || '',
        suggestedAnswersText: job.referenceSuggestedAnswersText || '',
        markingSchemeText: job.markingSchemeText || '',
        checkingMode: (job.checkingMode as any) || 'standard',
        level: job.level,
        subjectName: job.subjectName,
        officialPaperMaxMarks: job.officialPaperMaxMarks || 100,
        paper: job.paper,
        subjectKey: job.subjectKey,
        materialId: job.questionMaterialId || job.combinedSourceMaterialId || job.referenceMaterialId,
        coverageMap: evaluationResult.coverageMap || null,
      });
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

    const evalIdentityRow = db.prepare(`
      SELECT e.display_id, p.student_code, p.icai_registration_number, u.full_name
      FROM evaluations e
      LEFT JOIN student_profiles p ON p.user_id = e.student_id
      LEFT JOIN users u ON u.id = e.student_id
      WHERE e.id = ?
    `).get(evaluationId) as any;
    const resolvedDisplayId = evalIdentityRow?.display_id || evaluationId;
    const resolvedStudentCode = evalIdentityRow?.student_code || undefined;
    const resolvedRegNo = evalIdentityRow?.icai_registration_number || undefined;

    // 5A. Generate Checked Copy PDF
    try {
      const origDoc = await PDFDocument.load(job.pdfBuf, { ignoreEncryption: true });
      originalPageCount = origDoc.getPageCount();

      const meta = {
        id: evaluationId,
        modelTestNumber: job.modelTestNumber,
        displayId: resolvedDisplayId,
        studentCode: resolvedStudentCode,
        icaiRegistrationNumber: resolvedRegNo,
        studentName: evalIdentityRow?.full_name || job.studentName,
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
      const reportMeta = {
        id: evaluationId,
        displayId: resolvedDisplayId,
        studentCode: resolvedStudentCode,
        icaiRegistrationNumber: resolvedRegNo,
        studentName: evalIdentityRow?.full_name || job.studentName || 'CA Student',
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
        const failureClaim = db.prepare(`
          UPDATE evaluations
          SET status = 'FAILED',
              progress_stage = 'FAILED',
              progress_percentage = 0,
              progress_message = ?,
              error_message = ?,
              completed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND UPPER(COALESCE(status, '')) NOT IN ('COMPLETED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED', 'PERSISTENCE_FAILED', 'CANCELLED')
        `).run(mismatchErr, mismatchErr, evaluationId);

        // A concurrent terminal decision wins. Only refund if this worker actually
        // claimed the FAILED transition.
        if (failureClaim.changes === 1) {
          await releaseFacultyMockCopyAccessForFailedEvaluation(evaluationId);
          if (
            job.creditAlreadyConsumed && !job.isRecoveryRetry &&
            (entitlementSource === 'PROMO' || entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'PERSONAL_PURCHASED_CREDIT')
          ) {
            try {
              const restored = refundEvaluationCreditAtomic({ userId: studentId, evaluationId, entitlementSource });
              if (restored) {
                db.prepare('UPDATE evaluations SET consumed_from_personal_credits = 0 WHERE id = ?').run(evaluationId);
                await syncStudentCreditsToFirestore(studentId);
              }
            } catch (refundErr) {
              console.warn(`[AsyncEval] MTP integrity failure refund error for ${evaluationId}:`, refundErr);
            }
          }
          const failedRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId) as any;
          if (failedRow) await syncRecordToFirestore('evaluations', evaluationId, failedRow);
        }
        return;
      }
    }

    // Model Test Paper identity must still match across the job, saved evaluation,
    // and exact reference material before a result can be certified.
    if (job.materialType === 'MODEL_TEST_PAPER') {
      const evalRow = db.prepare('SELECT model_test_number, material_id FROM evaluations WHERE id = ?').get(evaluationId) as any;
      const dbModelNumber = evalRow?.model_test_number !== undefined && evalRow?.model_test_number !== null
        ? Number(evalRow.model_test_number)
        : null;
      const jobModelNumber = job.modelTestNumber !== undefined && job.modelTestNumber !== null
        ? Number(job.modelTestNumber)
        : null;

      let materialModelNumber: number | null = null;
      if (evalRow?.material_id) {
        const materialRow = db.prepare(
          'SELECT model_test_number FROM evaluation_materials WHERE id = ? AND material_type = ?'
        ).get(evalRow.material_id, 'MODEL_TEST_PAPER') as any;
        if (materialRow?.model_test_number !== undefined && materialRow?.model_test_number !== null) {
          materialModelNumber = Number(materialRow.model_test_number);
        }
      }

      const isModelNumberValid = Number.isInteger(jobModelNumber) && jobModelNumber! >= 1 && jobModelNumber! <= getMaxModelTestNumberForLevel(job.level);
      const matchesEvaluation = dbModelNumber === jobModelNumber;
      const matchesMaterial = materialModelNumber === jobModelNumber;

      if (!isModelNumberValid || !matchesEvaluation || !matchesMaterial) {
        const mismatchErr = `CRITICAL_INTEGRITY_VIOLATION: Model Test Paper identity mismatch detected (Job: ${jobModelNumber}, Evaluation: ${dbModelNumber}, Material: ${materialModelNumber}). Evaluation halted to protect academic validity.`;
        console.error(`[AsyncEval] ${mismatchErr}`);
        const failureClaim = db.prepare(`
          UPDATE evaluations
          SET status = 'FAILED',
              progress_stage = 'FAILED',
              progress_percentage = 0,
              progress_message = ?,
              error_message = ?,
              completed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND UPPER(COALESCE(status, '')) NOT IN ('COMPLETED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED', 'PERSISTENCE_FAILED', 'CANCELLED')
        `).run(mismatchErr, mismatchErr, evaluationId);

        if (failureClaim.changes === 1) {
          await releaseFacultyMockCopyAccessForFailedEvaluation(evaluationId);
          if (
            job.creditAlreadyConsumed && !job.isRecoveryRetry &&
            (entitlementSource === 'PROMO' || entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'PERSONAL_PURCHASED_CREDIT')
          ) {
            try {
              refundEvaluationCreditAtomic({ userId: studentId, evaluationId, entitlementSource });
              await syncStudentCreditsToFirestore(studentId);
            } catch (refundErr) {
              console.warn(`[AsyncEval] Model Test integrity failure refund error for ${evaluationId}:`, refundErr);
            }
          }
          const failedRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId) as any;
          if (failedRow) await syncRecordToFirestore('evaluations', evaluationId, failedRow);
        }
        return;
      }
    }

    // Stage 6: Automatic deterministic consistency verification & certification gate
    const consistencyReport = validateAuthoritativeConsistency(evaluationResult);
    const runPackage = evaluationResult.evaluationRunPackage;
    const renderManifest = runPackage?.renderManifest;

    // Check critical integrity: questions exist, ledger arithmetic is sound, no bounds violations
    const hasValidQuestions = Array.isArray(evaluationResult.questions) && evaluationResult.questions.length > 0;
    const isMathConsistent = consistencyReport.isValid && (!runPackage?.scoreLedger || runPackage.scoreLedger.isReconciled);
    const supervisorAuditStatus = (evaluationResult.integrityAudit as any)?.supervisor?.status;
    const supervisorApproved =
      !ENABLE_EVALUATION_SUPERVISOR ||
      supervisorAuditStatus === undefined ||
      supervisorAuditStatus === 'PASS';
    const evaluationValidationPassed = isEvaluationValidationSafeForCertification(evaluationResult.validationStatus);
    const criticalIntegrityPassed =
      hasValidQuestions &&
      isMathConsistent &&
      evaluationValidationPassed &&
      supervisorApproved;

    let durablePackagePersisted = false;
    let finalStatus: 'COMPLETED' | 'NEEDS_REVIEW' = criticalIntegrityPassed ? 'COMPLETED' : 'NEEDS_REVIEW';
    let finalizationErrors: string[] = [];
    let reviewErrors: string[] = [];

    if (runPackage) {
      const packageToPersist = {
        ...runPackage,
        durablePersistenceConfirmed: true,
        finalizationStatus: criticalIntegrityPassed ? 'PERSISTED' as const : 'INTEGRITY_FAILED' as const,
      };
      evaluationResult.evaluationRunPackage = packageToPersist;
      try {
        persistEvaluationRunPackageAtomic(packageToPersist);
        durablePackagePersisted = true;
        console.log(`[AsyncEval] Durably persisted authoritative EvaluationRunPackage for ${evaluationId}`);
      } catch (persistErr: any) {
        console.warn(`[AsyncEval] Notice persisting EvaluationRunPackage for ${evaluationId}:`, persistErr.message);
      }

      if (criticalIntegrityPassed) {
        try {
          const finalizationResult = finalizeEvaluationRun({
            runPackage: evaluationResult.evaluationRunPackage!,
            evaluationId,
          });
          evaluationResult.evaluationRunPackage = finalizationResult.package;
          if (finalizationResult.success) {
            finalStatus = 'COMPLETED';
          } else {
            finalStatus = 'NEEDS_REVIEW';
            finalizationErrors = finalizationResult.errors || ['Evaluation finalization checks need review.'];
          }
        } catch (finErr: any) {
          console.warn(`[AsyncEval] Finalization run warning:`, finErr.message);
        }
      }
    }

    if (finalStatus === 'COMPLETED') {
      evaluationResult.validationStatus = 'VALID';
      evaluationResult.certificationStatus = 'CERTIFIED';
      evaluationResult.downloadsUnlocked = true;
      evaluationResult.academicScore = evaluationResult.canonicalLedger?.totalAwardedMarks ?? evaluationResult.totalMarks;
      evaluationResult.validationErrors = [];
      evaluationResult.completionGateReport = {
        passedCount: evaluationResult.completionGateReport?.passedCount ?? 12,
        failedCount: 0,
        checks: evaluationResult.completionGateReport?.checks || [],
        timestamp: new Date().toISOString(),
        isPassed: true,
      };
      evaluationResult.integrityAudit = {
        ...(evaluationResult.integrityAudit || {}),
        mathConsistent: true,
        hardCompletionGatePassed: true,
        errors: [],
      };
      console.log(`[AsyncEval] Evaluation ${evaluationId} automatically verified and CERTIFIED.`);
    } else {
      reviewErrors = Array.from(new Set([
        ...(!consistencyReport.isValid ? consistencyReport.errors : []),
        ...(evaluationResult.validationErrors || []),
        ...finalizationErrors,
      ]));
      evaluationResult.validationStatus = 'NEEDS_REVIEW';
      evaluationResult.certificationStatus = 'REVIEW_REQUIRED';
      evaluationResult.downloadsUnlocked = false;
      evaluationResult.validationErrors = reviewErrors;
      evaluationResult.academicScore = evaluationResult.canonicalLedger?.totalAwardedMarks ?? evaluationResult.totalMarks;
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
      console.info(`[AsyncEval] Evaluation ${evaluationId} status: NEEDS_REVIEW (${reviewErrors.length} critical validation items flagged)`);
    }

    const finalizationUpdate = db.prepare(`
      UPDATE evaluations
      SET status = ?,
          certification_status = ?,
          downloads_unlocked = ?,
          certified_at = CASE WHEN ? = 'COMPLETED' THEN COALESCE(certified_at, CURRENT_TIMESTAMP) ELSE certified_at END,
          progress_stage = ?,
          progress_percentage = 100,
          progress_message = ?,
          error_message = ?,
          rejection_reason = NULL,
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
        AND UPPER(COALESCE(status, '')) NOT IN ('COMPLETED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED', 'PERSISTENCE_FAILED', 'CANCELLED')
    `).run(
      finalStatus,
      finalStatus === 'COMPLETED' ? 'CERTIFIED' : 'REVIEW_REQUIRED',
      finalStatus === 'COMPLETED' ? 1 : 0,
      finalStatus,
      finalStatus === 'COMPLETED' ? 'COMPLETED' : 'NEEDS_REVIEW',
      finalStatus === 'COMPLETED'
        ? 'Evaluation complete and certified'
        : 'Evaluation preserved. Academic score recorded; review required.',
      finalStatus === 'COMPLETED' ? null : (reviewErrors.join(' | ') || 'Evaluation preserved for academic review; no document rejection was made.'),
      evaluationResult.canonicalLedger?.totalAwardedMarks ?? evaluationResult.totalMarks,
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

    if (finalizationUpdate.changes !== 1) {
      const latestStatus = getEvaluationStatus(evaluationId);
      if (isTerminalEvaluationStatus(latestStatus)) {
        console.info(`[AsyncEval] Preserving terminal state ${latestStatus} for ${evaluationId}; stale job finalization was ignored.`);
        return;
      }
      throw new Error(`Could not finalize evaluation ${evaluationId}; current status is ${latestStatus || 'UNKNOWN'}.`);
    }

    if (finalStatus !== 'COMPLETED') {
      // The personal entitlement was charged when the upload was accepted.
      // Return it when the system could not produce a verified final result.
      if (
        job.creditAlreadyConsumed && !job.isRecoveryRetry &&
        (entitlementSource === 'PROMO' || entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'PERSONAL_PURCHASED_CREDIT')
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
    } else if (entitlementSource === 'PROMO') {
      if (!job.creditAlreadyConsumed) {
        // If not already deducted at acceptance time, atomically deduct now
        consumeEvaluationEntitlementAtomic({
          userId: studentId,
          evaluationId,
          forcedSource: 'PROMO',
        });
      } else {
        // Already deducted atomically at acceptance time; record completion audit log
        try {
          db.prepare(`
            INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
            VALUES (?, ?, 'EVALUATION_COMPLETED_PROMO', 'EVALUATION', ?, ?)
          `).run(
            `aud_${crypto.randomBytes(8).toString('hex')}`,
            studentId,
            evaluationId,
            `Evaluation completed successfully under promotional entitlement (${personalEntitlement?.referralCode || 'AI30'})`
          );
        } catch (auditErr) {
          console.warn('[AsyncEval] Audit log error:', auditErr);
        }
      }
    } else if (entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'PERSONAL_PURCHASED_CREDIT') {
      if (!job.creditAlreadyConsumed) {
        // If not already deducted at acceptance time, atomically deduct now
        consumeEvaluationEntitlementAtomic({
          userId: studentId,
          evaluationId,
        });
        await syncStudentCreditsToFirestore(studentId);
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
    const currentStatus = getEvaluationStatus(evaluationId);
    if (isTerminalEvaluationStatus(currentStatus)) {
      // Preserve the terminal evaluation state, but reconcile any entitlement
      // left debited by an earlier/competing failure path. The credit ledger makes
      // this safe to call repeatedly and refuses refunds without a matching debit.
      if (
        currentStatus !== 'COMPLETED' &&
        !job.isRecoveryRetry &&
        (entitlementSource === 'PROMO' || entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'PERSONAL_PURCHASED_CREDIT')
      ) {
        try {
          const restored = refundEvaluationCreditAtomic({ userId: studentId, evaluationId, entitlementSource });
          if (restored) {
            db.prepare('UPDATE evaluations SET consumed_from_personal_credits = 0 WHERE id = ?').run(evaluationId);
            await syncStudentCreditsToFirestore(studentId);
          }
        } catch (refundErr) {
          console.warn(`[AsyncEval] Terminal-state entitlement repair failed for ${evaluationId} (${currentStatus}):`, refundErr);
        }
      }
      console.info(`[AsyncEval] Preserving terminal status ${currentStatus} for ${evaluationId}; no stale status mutation applied.`);
      return;
    }

    // Claim the failure transition before refunding. If another request rejects or
    // completes the evaluation concurrently, this compare-and-set prevents mutation.
    const failureUpdate = db.prepare(`
      UPDATE evaluations
      SET status = 'FAILED',
          progress_stage = 'FAILED',
          progress_percentage = 0,
          progress_message = ?,
          error_message = ?,
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND UPPER(COALESCE(status, '')) NOT IN ('COMPLETED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED', 'PERSISTENCE_FAILED', 'CANCELLED')
    `).run(errMsg.slice(0, 500), errMsg.slice(0, 500), evaluationId);

    if (failureUpdate.changes !== 1) {
      const latestStatus = getEvaluationStatus(evaluationId);
      if (isTerminalEvaluationStatus(latestStatus)) {
        if (
          latestStatus !== 'COMPLETED' &&
          !job.isRecoveryRetry &&
          (entitlementSource === 'PROMO' || entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'PERSONAL_PURCHASED_CREDIT')
        ) {
          try {
            const restored = refundEvaluationCreditAtomic({ userId: studentId, evaluationId, entitlementSource });
            if (restored) {
              db.prepare('UPDATE evaluations SET consumed_from_personal_credits = 0 WHERE id = ?').run(evaluationId);
              await syncStudentCreditsToFirestore(studentId);
            }
          } catch (refundErr) {
            console.warn(`[AsyncEval] Failure-claim race entitlement repair failed for ${evaluationId}:`, refundErr);
          }
        }
        console.info(`[AsyncEval] Preserving terminal status ${latestStatus} for ${evaluationId} after failure-claim race.`);
        return;
      }
      console.error(`[AsyncEval] Could not claim failure status for ${evaluationId}; status is now ${latestStatus || 'UNKNOWN'}.`);
      return;
    }

    await releaseFacultyMockCopyAccessForFailedEvaluation(evaluationId);

    // Refund only after successfully recording this job's FAILED transition.
    if (job.creditAlreadyConsumed && !job.isRecoveryRetry && (entitlementSource === 'PROMO' || entitlementSource === 'PERSONAL_FREE' || entitlementSource === 'PERSONAL_PURCHASED_CREDIT')) {
      try {
        const restored = refundEvaluationCreditAtomic({
          userId: studentId,
          evaluationId,
          entitlementSource,
        });
        if (restored) {
          db.prepare('UPDATE evaluations SET consumed_from_personal_credits = 0 WHERE id = ?').run(evaluationId);
          await syncStudentCreditsToFirestore(studentId);
        }
      } catch (refundErr) {
        console.warn(`[AsyncEval] Refund error for ${evaluationId}:`, refundErr);
      }
    }

    try {
      const failedRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId) as any;
      if (failedRow) await syncRecordToFirestore('evaluations', evaluationId, failedRow);
    } catch (syncErr) {
      console.warn(`[AsyncEval] Could not sync failed evaluation ${evaluationId}:`, syncErr);
    }
  } finally {
    activeJobs.delete(evaluationId);
  }
}

const DURABLE_EVALUATION_QUEUE_COLLECTION = 'evaluation_jobs';
const DURABLE_QUEUE_LEASE_MS = 15 * 60 * 1000;
const DURABLE_QUEUE_HEARTBEAT_MS = 45 * 1000;
const DURABLE_QUEUE_POLL_MS = 15 * 1000;
const DURABLE_QUEUE_MAX_ATTEMPTS = 3;
const DURABLE_QUEUE_MAX_LOCAL_CONCURRENCY = Math.max(
  1,
  Math.min(5, Number.parseInt(process.env.EVALUATION_WORKER_MAX_CONCURRENT || '2', 10) || 2)
);
const durableQueueWorkerId = `worker_${process.pid}_${crypto.randomBytes(8).toString('hex')}`;
let durableQueuePoller: NodeJS.Timeout | null = null;
let durableQueueRecoveryInProgress = false;

interface DurableEvaluationQueueRecord {
  evaluationId: string;
  studentId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'NEEDS_REVIEW' | 'FAILED';
  payloadFileId: string;
  payloadFilename: string;
  originalFileId: string;
  originalFilename: string;
  entitlementSource: EvaluationJobData['entitlementSource'];
  creditAlreadyConsumed: boolean;
  isRecoveryRetry: boolean;
  attemptCount: number;
  workerId?: string | null;
  heartbeatAt?: string | null;
  leaseExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  lastError?: string | null;
}

export function serializeEvaluationJobForDurableQueue(job: EvaluationJobData): Record<string, any> {
  const serializable: Record<string, any> = {
    ...job,
    // Binary PDF bytes live once in Cloud Storage; never duplicate them inside job JSON.
    pdfBuf: undefined,
    fileBase64: undefined,
  };
  return serializable;
}

export function isDurableQueueLeaseExpired(record: { status?: string; leaseExpiresAt?: string | null }, nowMs = Date.now()): boolean {
  if (String(record.status || '').toUpperCase() === 'QUEUED') return true;
  if (String(record.status || '').toUpperCase() !== 'RUNNING') return false;
  const expiry = record.leaseExpiresAt ? Date.parse(record.leaseExpiresAt) : Number.NaN;
  return !Number.isFinite(expiry) || expiry <= nowMs;
}

function isPersonalEvaluationEntitlement(source: unknown): source is 'PROMO' | 'PERSONAL_FREE' | 'PERSONAL_PURCHASED_CREDIT' {
  return source === 'PROMO' || source === 'PERSONAL_FREE' || source === 'PERSONAL_PURCHASED_CREDIT';
}

async function persistDurableEvaluationJob(job: EvaluationJobData): Promise<DurableEvaluationQueueRecord | null> {
  const evaluationId = String(job.evaluationId || '').trim();
  if (!evaluationId) throw new Error('A durable evaluation queue entry requires an evaluation ID.');
  if (!job.pdfBuf || job.pdfBuf.length === 0) throw new Error('The original answer-sheet PDF is empty and cannot be queued.');

  const originalFileId = `${evaluationId}_original`;
  const originalFilename = `${evaluationId}_original.pdf`;
  const originalMetadata = await savePersistentFile(
    originalFileId,
    originalFilename,
    'application/pdf',
    job.pdfBuf,
    'EVALUATION_ORIGINAL',
    { ownerUserId: job.studentId, evaluationId }
  );
  if (originalMetadata.status !== 'ACTIVE') {
    throw new Error('The original answer sheet could not be confirmed in durable Cloud Storage; evaluation was not queued.');
  }

  const payloadFileId = `${evaluationId}_job_${crypto.randomBytes(5).toString('hex')}`;
  const payloadFilename = `${payloadFileId}.json`;
  const payloadJson = JSON.stringify({
    version: 1,
    createdAt: new Date().toISOString(),
    job: serializeEvaluationJobForDurableQueue(job),
  });
  const payloadMetadata = await savePersistentFile(
    payloadFileId,
    payloadFilename,
    'application/json',
    Buffer.from(payloadJson, 'utf8'),
    'GENERAL_DOCUMENT',
    { ownerUserId: job.studentId, evaluationId }
  );
  if (payloadMetadata.status !== 'ACTIVE') {
    await deletePersistentFile(payloadFileId).catch(() => false);
    throw new Error('The evaluation job payload could not be confirmed in durable Cloud Storage; evaluation was not queued.');
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const record: DurableEvaluationQueueRecord = {
    evaluationId,
    studentId: job.studentId,
    status: 'QUEUED',
    payloadFileId,
    payloadFilename,
    originalFileId,
    originalFilename,
    entitlementSource: job.entitlementSource,
    creditAlreadyConsumed: job.creditAlreadyConsumed === true,
    isRecoveryRetry: job.isRecoveryRetry === true,
    attemptCount: 0,
    workerId: null,
    heartbeatAt: null,
    leaseExpiresAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  let reserved = false;
  try {
    reserved = await runFirestoreTransaction(async (transaction) => {
      const snapshot = await transaction.get(DURABLE_EVALUATION_QUEUE_COLLECTION, evaluationId);
      const existing = snapshot.exists ? (snapshot.data() || {}) : null;
      const existingStatus = String(existing?.status || '').toUpperCase();
      const isAlreadyPending =
        existingStatus === 'QUEUED' ||
        (existingStatus === 'RUNNING' && !isDurableQueueLeaseExpired(existing, Date.now()));

      if (isAlreadyPending) return false;

      transaction.set(DURABLE_EVALUATION_QUEUE_COLLECTION, evaluationId, {
        ...record,
        previousAttemptCount: Number(existing?.attemptCount || 0),
        lastError: null,
      });
      return true;
    });
  } catch (error) {
    await deletePersistentFile(payloadFileId).catch(() => false);
    throw error;
  }

  if (!reserved) {
    await deletePersistentFile(payloadFileId).catch(() => false);
    return null;
  }

  return record;
}

async function updateDurableQueueLease(
  evaluationId: string,
  workerId: string,
  values: Record<string, any>
): Promise<boolean> {
  return runFirestoreTransaction(async (transaction) => {
    const snapshot = await transaction.get(DURABLE_EVALUATION_QUEUE_COLLECTION, evaluationId);
    if (!snapshot.exists) return false;
    const existing = snapshot.data() || {};
    if (
      String(existing.status || '').toUpperCase() !== 'RUNNING' ||
      String(existing.workerId || '') !== workerId
    ) return false;
    transaction.set(DURABLE_EVALUATION_QUEUE_COLLECTION, evaluationId, {
      ...values,
      updatedAt: new Date().toISOString(),
    });
    return true;
  });
}

async function claimDurableEvaluationJob(evaluationId: string): Promise<
  | { state: 'CLAIMED'; record: DurableEvaluationQueueRecord }
  | { state: 'EXHAUSTED'; record: DurableEvaluationQueueRecord }
  | { state: 'NOT_CLAIMED' | 'MISSING' }
> {
  return runFirestoreTransaction(async (transaction) => {
    const snapshot = await transaction.get(DURABLE_EVALUATION_QUEUE_COLLECTION, evaluationId);
    if (!snapshot.exists) return { state: 'MISSING' as const };

    const current = snapshot.data() || {};
    const status = String(current.status || '').toUpperCase();
    if (status !== 'QUEUED' && !(status === 'RUNNING' && isDurableQueueLeaseExpired(current, Date.now()))) {
      return { state: 'NOT_CLAIMED' as const };
    }

    const attempts = Number(current.attemptCount || 0);
    const normalizedRecord = { ...current, evaluationId } as DurableEvaluationQueueRecord;
    if (attempts >= DURABLE_QUEUE_MAX_ATTEMPTS) {
      transaction.set(DURABLE_EVALUATION_QUEUE_COLLECTION, evaluationId, {
        status: 'FAILED',
        workerId: durableQueueWorkerId,
        lastError: `The evaluation worker lease expired ${attempts} times. Automatic retries stopped to prevent duplicate evaluation charges.`,
        leaseExpiresAt: null,
        updatedAt: new Date().toISOString(),
      });
      return { state: 'EXHAUSTED' as const, record: normalizedRecord };
    }

    const now = new Date();
    const claimedRecord = {
      ...normalizedRecord,
      status: 'RUNNING' as const,
      workerId: durableQueueWorkerId,
      attemptCount: attempts + 1,
      heartbeatAt: now.toISOString(),
      leaseExpiresAt: new Date(now.getTime() + DURABLE_QUEUE_LEASE_MS).toISOString(),
      updatedAt: now.toISOString(),
    };
    transaction.set(DURABLE_EVALUATION_QUEUE_COLLECTION, evaluationId, claimedRecord as any);
    return { state: 'CLAIMED' as const, record: claimedRecord };
  });
}

function getDurableEvaluationFinalQueueStatus(evaluationId: string): {
  queueStatus: 'COMPLETED' | 'NEEDS_REVIEW' | 'FAILED' | 'QUEUED';
  evaluationStatus: string;
} {
  const evaluationStatus = getEvaluationStatus(evaluationId);
  if (evaluationStatus === 'COMPLETED') return { queueStatus: 'COMPLETED', evaluationStatus };
  if (evaluationStatus === 'NEEDS_REVIEW') return { queueStatus: 'NEEDS_REVIEW', evaluationStatus };
  if (['FAILED', 'REJECTED', 'PERSISTENCE_FAILED', 'CANCELLED'].includes(evaluationStatus)) {
    return { queueStatus: 'FAILED', evaluationStatus };
  }
  return { queueStatus: 'QUEUED', evaluationStatus: evaluationStatus || 'UNKNOWN' };
}

async function markDurableQueueFinished(
  evaluationId: string,
  workerId: string,
  payloadFileId: string
): Promise<void> {
  const finalStatus = getDurableEvaluationFinalQueueStatus(evaluationId);
  await updateDurableQueueLease(evaluationId, workerId, {
    status: finalStatus.queueStatus,
    evaluationStatus: finalStatus.evaluationStatus,
    finishedAt: finalStatus.queueStatus === 'QUEUED' ? null : new Date().toISOString(),
    workerId: null,
    heartbeatAt: null,
    leaseExpiresAt: null,
    lastError: finalStatus.queueStatus === 'QUEUED'
      ? 'Worker returned before the evaluation reached a terminal status; it has been re-queued.'
      : null,
  });

  if (finalStatus.queueStatus !== 'QUEUED') {
    await deletePersistentFile(payloadFileId).catch((error) => {
      console.warn(`[AsyncEval] Could not delete completed queue payload ${payloadFileId}:`, error);
      return false;
    });
  }
}

async function failDurableQueueJobBeforeExecution(
  record: DurableEvaluationQueueRecord,
  reason: string
): Promise<void> {
  const safeReason = String(reason || 'Durable evaluation job could not be restored.').slice(0, 500);
  const update = db.prepare(`
    UPDATE evaluations
    SET status = 'FAILED',
        error_message = ?,
        progress_stage = 'FAILED',
        progress_percentage = 100,
        progress_message = ?,
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND UPPER(COALESCE(status, '')) NOT IN ('COMPLETED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED', 'PERSISTENCE_FAILED', 'CANCELLED')
  `).run(safeReason, safeReason, record.evaluationId);

  await releaseFacultyMockCopyAccessForFailedEvaluation(record.evaluationId).catch((error) => {
    console.warn(`[AsyncEval] Could not release faculty mock access after queue restoration failure ${record.evaluationId}:`, error);
  });

  if (
    (update.changes === 1 || getEvaluationStatus(record.evaluationId) !== 'COMPLETED') &&
    record.creditAlreadyConsumed &&
    !record.isRecoveryRetry &&
    isPersonalEvaluationEntitlement(record.entitlementSource)
  ) {
    try {
      const restored = refundEvaluationCreditAtomic({
        userId: record.studentId,
        evaluationId: record.evaluationId,
        entitlementSource: record.entitlementSource,
      });
      if (restored) await syncStudentCreditsToFirestore(record.studentId);
    } catch (error) {
      console.error(`[AsyncEval] Could not refund the exact entitlement after queue restoration failure ${record.evaluationId}:`, error);
    }
  }

  try {
    const failedRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(record.evaluationId) as any;
    if (failedRow) await syncRecordToFirestore('evaluations', record.evaluationId, failedRow);
  } catch (error) {
    console.warn(`[AsyncEval] Could not sync queue restoration failure ${record.evaluationId}:`, error);
  }

  await setQueueRecordTerminal(record.evaluationId, 'FAILED', safeReason);
}

async function setQueueRecordTerminal(evaluationId: string, status: 'FAILED' | 'COMPLETED' | 'NEEDS_REVIEW', lastError?: string): Promise<void> {
  await runFirestoreTransaction(async (transaction) => {
    const snapshot = await transaction.get(DURABLE_EVALUATION_QUEUE_COLLECTION, evaluationId);
    if (!snapshot.exists) return;
    transaction.set(DURABLE_EVALUATION_QUEUE_COLLECTION, evaluationId, {
      status,
      workerId: null,
      heartbeatAt: null,
      leaseExpiresAt: null,
      lastError: lastError || null,
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });
}

async function processDurableEvaluationQueueItem(evaluationId: string): Promise<void> {
  if (activeJobs.has(evaluationId) || activeJobs.size >= DURABLE_QUEUE_MAX_LOCAL_CONCURRENCY) return;

  const existingEvaluationStatus = getEvaluationStatus(evaluationId);
  if (isTerminalEvaluationStatus(existingEvaluationStatus)) {
    await setQueueRecordTerminal(
      evaluationId,
      existingEvaluationStatus === 'COMPLETED' ? 'COMPLETED' :
        existingEvaluationStatus === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : 'FAILED'
    );
    return;
  }

  const claim = await claimDurableEvaluationJob(evaluationId);
  if (claim.state === 'MISSING' || claim.state === 'NOT_CLAIMED') return;
  if (claim.state === 'EXHAUSTED') {
    await failDurableQueueJobBeforeExecution(
      claim.record,
      `Evaluation worker lease expired ${DURABLE_QUEUE_MAX_ATTEMPTS} times. Please retry from Admin after reviewing the saved answer sheet.`
    );
    return;
  }

  const record = claim.record;
  const heartbeatTimer = setInterval(() => {
    void updateDurableQueueLease(evaluationId, durableQueueWorkerId, {
      heartbeatAt: new Date().toISOString(),
      leaseExpiresAt: new Date(Date.now() + DURABLE_QUEUE_LEASE_MS).toISOString(),
    }).catch((error) => {
      console.warn(`[AsyncEval] Durable queue heartbeat failed for ${evaluationId}:`, error);
    });
  }, DURABLE_QUEUE_HEARTBEAT_MS);
  heartbeatTimer.unref?.();

  const workerPromise = (async () => {
    try {
      const payload = await getPersistentFile(record.payloadFileId, record.payloadFilename);
      if (!payload?.buffer?.length) {
        throw new Error('Durable evaluation job payload was not found in Cloud Storage.');
      }
      const envelope = JSON.parse(payload.buffer.toString('utf8'));
      if (Number(envelope?.version) !== 1 || !envelope?.job) {
        throw new Error('Durable evaluation job payload has an unsupported format.');
      }

      const original = await getPersistentFile(record.originalFileId, record.originalFilename);
      if (!original?.buffer?.length) {
        throw new Error('The original answer-sheet PDF could not be restored from Cloud Storage.');
      }
      const pdfBuf = original.buffer;
      const job = {
        ...envelope.job,
        evaluationId,
        pdfBuf,
        fileBase64: pdfBuf.toString('base64'),
      } as EvaluationJobData;

      console.log(`[AsyncEval] Restored durable job ${evaluationId} (attempt ${record.attemptCount}).`);
      await executeEvaluationJob(job);
      await markDurableQueueFinished(evaluationId, durableQueueWorkerId, record.payloadFileId);
    } catch (error: any) {
      const reason = String(error?.message || error || 'Durable worker failed before execution').slice(0, 500);
      console.error(`[AsyncEval] Durable queue processing failed for ${evaluationId}:`, error);
      await failDurableQueueJobBeforeExecution(record, reason);
      await deletePersistentFile(record.payloadFileId).catch(() => false);
    } finally {
      clearInterval(heartbeatTimer);
      activeJobs.delete(evaluationId);
    }
  })();

  activeJobs.set(evaluationId, workerPromise);
}

async function recoverDurableEvaluationQueue(): Promise<void> {
  if (durableQueueRecoveryInProgress || activeJobs.size >= DURABLE_QUEUE_MAX_LOCAL_CONCURRENCY) return;
  durableQueueRecoveryInProgress = true;
  try {
    const [queued, running] = await Promise.all([
      queryFirestoreDocs<DurableEvaluationQueueRecord>(
        DURABLE_EVALUATION_QUEUE_COLLECTION,
        [{ field: 'status', op: '==', value: 'QUEUED' }],
        { failOnError: true }
      ),
      queryFirestoreDocs<DurableEvaluationQueueRecord>(
        DURABLE_EVALUATION_QUEUE_COLLECTION,
        [{ field: 'status', op: '==', value: 'RUNNING' }],
        { failOnError: true }
      ),
    ]);

    const candidates = new Map<string, DurableEvaluationQueueRecord>();
    for (const record of [...queued, ...running]) {
      const evaluationId = String(record.evaluationId || (record as any).id || '');
      if (evaluationId) candidates.set(evaluationId, { ...record, evaluationId });
    }

    for (const evaluationId of candidates.keys()) {
      if (activeJobs.size >= DURABLE_QUEUE_MAX_LOCAL_CONCURRENCY) break;
      void processDurableEvaluationQueueItem(evaluationId).catch((error) => {
        console.error(`[AsyncEval] Could not recover durable evaluation ${evaluationId}:`, error);
      });
    }
  } catch (error) {
    console.warn('[AsyncEval] Durable queue recovery scan failed:', error);
  } finally {
    durableQueueRecoveryInProgress = false;
  }
}

export function startDurableEvaluationQueueRecovery(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (durableQueuePoller) return;

  console.log('[AsyncEval] Starting durable Cloud Storage / Firestore evaluation queue recovery.');
  void recoverDurableEvaluationQueue();
  durableQueuePoller = setInterval(() => {
    void recoverDurableEvaluationQueue();
  }, DURABLE_QUEUE_POLL_MS);
  durableQueuePoller.unref?.();
}

export function stopDurableEvaluationQueueRecovery(): void {
  if (durableQueuePoller) clearInterval(durableQueuePoller);
  durableQueuePoller = null;
}

/**
 * Safely enqueues an evaluation job. Production requires durable Cloud Storage
 * payload + Firestore lease metadata before the API reports the evaluation as accepted.
 */
export async function enqueueEvaluation(job: EvaluationJobData): Promise<void> {
  if (activeJobs.has(job.evaluationId)) {
    console.log(`[AsyncEval] Evaluation ${job.evaluationId} is already running in background.`);
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    updateEvaluationProgress(
      job.evaluationId,
      'QUEUED',
      'QUEUED',
      5,
      'Evaluation job queued in the local development worker.'
    );
    const promise = executeEvaluationJob(job).catch((error) => {
      console.error(`[AsyncEval] Unhandled local evaluation job error ${job.evaluationId}:`, error);
    });
    activeJobs.set(job.evaluationId, promise);
    return;
  }

  const record = await persistDurableEvaluationJob(job);
  if (!record) {
    console.log(`[AsyncEval] A durable job for ${job.evaluationId} is already queued or running; duplicate enqueue ignored.`);
    return;
  }

  updateEvaluationProgress(
    job.evaluationId,
    'QUEUED',
    'QUEUED',
    5,
    'Evaluation job durably queued. The worker can resume after an instance restart.'
  );
  void processDurableEvaluationQueueItem(job.evaluationId).catch((error) => {
    console.error(`[AsyncEval] Initial durable worker launch failed for ${job.evaluationId}; recovery scan will retry:`, error);
  });
}
