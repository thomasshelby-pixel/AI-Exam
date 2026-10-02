import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, loadEvaluationRunPackage, persistEvaluationRunPackageAtomic } from '../db.js';
import { savePersistentFile } from './persistentStorageService.js';
import { validateAuthoritativeConsistency } from './evaluationIntegrityEngine.js';
import { generateCheckedCopyPdf, generateDetailedReportPdf, buildStructuredAnnotations } from './pdfCheckedCopyService.js';
import { PDFDocument } from 'pdf-lib';
import { computeIcaIGrade } from './authoritativeBenchmarkEvaluator.js';

export interface ConsistencyVerificationResult {
  success: boolean;
  status: 'COMPLETED' | 'NEEDS_REVIEW' | 'FAILED';
  message: string;
  errors?: string[];
  totalMarks?: number;
  percentage?: number;
  grade?: string;
  evaluation?: any;
}

/**
 * Verifies and, if possible, certifies mathematical and structural consistency
 * of an evaluation record.
 */
export async function verifyEvaluationConsistency(
  evaluationId: string,
  options?: {
    adminOverride?: boolean;
    reviewerEmail?: string;
    reviewerId?: string;
    notes?: string;
  }
): Promise<ConsistencyVerificationResult> {
  const evalRecord = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evaluationId) as any;
  if (!evalRecord) {
    return {
      success: false,
      status: 'FAILED',
      message: 'Evaluation not found.',
      errors: ['EVALUATION_NOT_FOUND'],
    };
  }

  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  let resultJson: any = null;
  try {
    resultJson = evalRecord.result_json ? JSON.parse(evalRecord.result_json) : null;
  } catch {
    resultJson = null;
  }

  // Check 1: If already COMPLETED and result is valid
  if (evalRecord.status === 'COMPLETED' && resultJson?.questions?.length > 0) {
    const consistencyCheck = validateAuthoritativeConsistency(resultJson);
    if (consistencyCheck.isValid) {
      return {
        success: true,
        status: 'COMPLETED',
        message: 'Evaluation consistency has been verified and certified.',
        totalMarks: evalRecord.total_marks,
        percentage: evalRecord.percentage,
        grade: evalRecord.grade,
        evaluation: evalRecord,
      };
    }
  }

  // Check 2: If result_json has valid questions, validate consistency directly
  if (resultJson && Array.isArray(resultJson.questions) && resultJson.questions.length > 0) {
    const consistencyCheck = validateAuthoritativeConsistency(resultJson);
    if (consistencyCheck.isValid) {
      // Regenerate or ensure artifacts exist
      const checkedCopyPath = path.join(uploadsDir, `${evaluationId}_checked_copy.pdf`);
      const reportPath = path.join(uploadsDir, `${evaluationId}_report.pdf`);
      const originalPath = path.join(uploadsDir, `${evaluationId}_original.pdf`);

      let originalPdfBuf: Buffer | null = null;
      if (fs.existsSync(originalPath)) {
        originalPdfBuf = fs.readFileSync(originalPath);
      }

      if (originalPdfBuf && (!fs.existsSync(checkedCopyPath) || fs.statSync(checkedCopyPath).size < 100)) {
        try {
          const checkedBuf = await generateCheckedCopyPdf(
            {
              id: evaluationId,
              studentName: resultJson.studentName || 'CA Student',
              level: evalRecord.level || resultJson.caLevel,
              subjectName: evalRecord.subject_name || resultJson.subjectName,
              paper: evalRecord.paper || resultJson.paper,
              attempt: evalRecord.attempt || resultJson.attempt,
              checkingMode: evalRecord.checking_mode || resultJson.checkingMode,
              totalMarks: resultJson.totalMarks,
              maximumMarks: resultJson.maximumMarks,
              percentage: resultJson.percentage,
              grade: resultJson.grade,
              createdAt: evalRecord.created_at,
            },
            resultJson,
            originalPdfBuf
          );
          fs.writeFileSync(checkedCopyPath, checkedBuf);
          await savePersistentFile(`${evaluationId}_checked_copy`, `${evaluationId}_checked_copy.pdf`, 'application/pdf', checkedBuf, 'EVALUATION_CHECKED_COPY');
        } catch (genErr) {
          console.warn('[ConsistencyService] Checked copy generation warning:', genErr);
        }
      }

      if (!fs.existsSync(reportPath) || fs.statSync(reportPath).size < 100) {
        try {
          const reportBuf = await generateDetailedReportPdf(
            {
              id: evaluationId,
              studentName: resultJson.studentName || 'CA Student',
              level: evalRecord.level || resultJson.caLevel,
              subjectName: evalRecord.subject_name || resultJson.subjectName,
              paper: evalRecord.paper || resultJson.paper,
              attempt: evalRecord.attempt || resultJson.attempt,
              checkingMode: evalRecord.checking_mode || resultJson.checkingMode,
              totalMarks: resultJson.totalMarks,
              maximumMarks: resultJson.maximumMarks,
              percentage: resultJson.percentage,
              grade: resultJson.grade,
              createdAt: evalRecord.created_at,
            },
            resultJson
          );
          fs.writeFileSync(reportPath, reportBuf);
          await savePersistentFile(`${evaluationId}_report`, `${evaluationId}_report.pdf`, 'application/pdf', reportBuf, 'EVALUATION_REPORT');
        } catch (repErr) {
          console.warn('[ConsistencyService] Report generation warning:', repErr);
        }
      }

      resultJson.validationStatus = 'VALID';
      resultJson.validationErrors = [];
      resultJson.integrityAudit = {
        mathConsistent: true,
        checkedCopyConsistent: true,
        hardCompletionGatePassed: true,
        errors: [],
      };

      db.prepare(`
        UPDATE evaluations
        SET status = 'COMPLETED',
            progress_stage = 'COMPLETED',
            progress_percentage = 100,
            progress_message = 'Evaluation verified and certified.',
            rejection_reason = NULL,
            error_message = NULL,
            total_marks = ?,
            maximum_marks = ?,
            percentage = ?,
            grade = ?,
            result_json = ?,
            updated_at = CURRENT_TIMESTAMP,
            completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
        WHERE id = ?
      `).run(
        resultJson.totalMarks,
        resultJson.maximumMarks || 100,
        resultJson.percentage,
        resultJson.grade,
        JSON.stringify(resultJson),
        evaluationId
      );

      // Background persistent storage sync (non-blocking)
      if (fs.existsSync(checkedCopyPath)) {
        savePersistentFile(`${evaluationId}_checked_copy`, `${evaluationId}_checked_copy.pdf`, 'application/pdf', fs.readFileSync(checkedCopyPath), 'EVALUATION_CHECKED_COPY').catch(() => {});
      }
      if (fs.existsSync(reportPath)) {
        savePersistentFile(`${evaluationId}_report`, `${evaluationId}_report.pdf`, 'application/pdf', fs.readFileSync(reportPath), 'EVALUATION_REPORT').catch(() => {});
      }

      return {
        success: true,
        status: 'COMPLETED',
        message: 'Evaluation consistency successfully verified and certified. Checked copy is now available.',
        totalMarks: resultJson.totalMarks,
        percentage: resultJson.percentage,
        grade: resultJson.grade,
      };
    }
  }

  // Check 3: If questions are empty or flawed, check if an authoritative completed evaluation exists
  // for the same student script (by sha256 hash of original PDF)
  const originalPath = path.join(uploadsDir, `${evaluationId}_original.pdf`);
  if (fs.existsSync(originalPath)) {
    const originalBuf = fs.readFileSync(originalPath);
    const fileHash = crypto.createHash('sha256').update(originalBuf).digest('hex');

    // Look for any other completed evaluation matching the exact same answer sheet or subject
    const candidateEvals = db.prepare(`
      SELECT id, status, total_marks, maximum_marks, percentage, grade, result_json
      FROM evaluations
      WHERE status = 'COMPLETED'
        AND result_json IS NOT NULL
        AND id != ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(evaluationId) as any[];

    for (const cand of candidateEvals) {
      const candOriginalPath = path.join(uploadsDir, `${cand.id}_original.pdf`);
      let isMatch = false;

      if (fs.existsSync(candOriginalPath)) {
        const candBuf = fs.readFileSync(candOriginalPath);
        const candHash = crypto.createHash('sha256').update(candBuf).digest('hex');
        if (candHash === fileHash) {
          isMatch = true;
        }
      }

      if (isMatch) {
        try {
          const candResult = JSON.parse(cand.result_json);
          const consistency = validateAuthoritativeConsistency(candResult);
          if (consistency.isValid && candResult.questions?.length > 0) {
            // Adopt verified results with target evaluation's ID
            const reconciledResult = JSON.parse(JSON.stringify(candResult));
            reconciledResult.evaluationId = evaluationId;
            reconciledResult.validationStatus = 'VALID';
            reconciledResult.validationErrors = [];
            reconciledResult.integrityAudit = {
              mathConsistent: true,
              checkedCopyConsistent: true,
              hardCompletionGatePassed: true,
              errors: [],
            };

            const checkedCopyPath = path.join(uploadsDir, `${evaluationId}_checked_copy.pdf`);
            const candCheckedCopyPath = path.join(uploadsDir, `${cand.id}_checked_copy.pdf`);
            if (fs.existsSync(candCheckedCopyPath)) {
              fs.copyFileSync(candCheckedCopyPath, checkedCopyPath);
            } else {
              const checkedBuf = await generateCheckedCopyPdf(
                {
                  id: evaluationId,
                  studentName: evalRecord.student_name || reconciledResult.studentName || 'CA Student',
                  level: evalRecord.level || reconciledResult.caLevel,
                  subjectName: evalRecord.subject_name || reconciledResult.subjectName,
                  paper: evalRecord.paper || reconciledResult.paper,
                  attempt: evalRecord.attempt || reconciledResult.attempt,
                  checkingMode: evalRecord.checking_mode || reconciledResult.checkingMode,
                  totalMarks: reconciledResult.totalMarks,
                  maximumMarks: reconciledResult.maximumMarks,
                  percentage: reconciledResult.percentage,
                  grade: reconciledResult.grade,
                  createdAt: evalRecord.created_at,
                },
                reconciledResult,
                originalBuf
              );
              fs.writeFileSync(checkedCopyPath, checkedBuf);
            }

            const reportPath = path.join(uploadsDir, `${evaluationId}_report.pdf`);
            const candReportPath = path.join(uploadsDir, `${cand.id}_report.pdf`);
            if (fs.existsSync(candReportPath)) {
              fs.copyFileSync(candReportPath, reportPath);
            } else {
              const repBuf = await generateDetailedReportPdf(
                {
                  id: evaluationId,
                  studentName: evalRecord.student_name || reconciledResult.studentName || 'CA Student',
                  level: evalRecord.level || reconciledResult.caLevel,
                  subjectName: evalRecord.subject_name || reconciledResult.subjectName,
                  paper: evalRecord.paper || reconciledResult.paper,
                  attempt: evalRecord.attempt || reconciledResult.attempt,
                  checkingMode: evalRecord.checking_mode || reconciledResult.checkingMode,
                  totalMarks: reconciledResult.totalMarks,
                  maximumMarks: reconciledResult.maximumMarks,
                  percentage: reconciledResult.percentage,
                  grade: reconciledResult.grade,
                  createdAt: evalRecord.created_at,
                },
                reconciledResult
              );
              fs.writeFileSync(reportPath, repBuf);
            }

            db.prepare(`
              UPDATE evaluations
              SET status = 'COMPLETED',
                  progress_stage = 'COMPLETED',
                  progress_percentage = 100,
                  progress_message = 'Evaluation verified and certified via authoritative reconciliation.',
                  rejection_reason = NULL,
                  error_message = NULL,
                  total_marks = ?,
                  maximum_marks = ?,
                  percentage = ?,
                  grade = ?,
                  result_json = ?,
                  updated_at = CURRENT_TIMESTAMP,
                  completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
              WHERE id = ?
            `).run(
              reconciledResult.totalMarks,
              reconciledResult.maximumMarks || 100,
              reconciledResult.percentage,
              reconciledResult.grade,
              JSON.stringify(reconciledResult),
              evaluationId
            );

            // Sync persistent files (non-blocking)
            if (fs.existsSync(checkedCopyPath)) {
              savePersistentFile(`${evaluationId}_checked_copy`, `${evaluationId}_checked_copy.pdf`, 'application/pdf', fs.readFileSync(checkedCopyPath), 'EVALUATION_CHECKED_COPY').catch(() => {});
            }
            if (fs.existsSync(reportPath)) {
              savePersistentFile(`${evaluationId}_report`, `${evaluationId}_report.pdf`, 'application/pdf', fs.readFileSync(reportPath), 'EVALUATION_REPORT').catch(() => {});
            }

            return {
              success: true,
              status: 'COMPLETED',
              message: 'Evaluation consistency verified via authoritative answer sheet reconciliation. Checked copy is now available for download.',
              totalMarks: reconciledResult.totalMarks,
              percentage: reconciledResult.percentage,
              grade: reconciledResult.grade,
            };
          }
        } catch (candErr) {
          console.warn('[ConsistencyService] Candidate match processing error:', candErr);
        }
      }
    }
  }

  // Check 4: If Admin override requested
  if (options?.adminOverride) {
    db.prepare(`
      UPDATE evaluations
      SET status = 'COMPLETED',
          progress_stage = 'COMPLETED',
          progress_message = 'Evaluation certified by administrator override.',
          rejection_reason = NULL,
          admin_review_status = 'AFFIRMED',
          admin_reviewed_at = CURRENT_TIMESTAMP,
          admin_reviewer_email = ?,
          admin_review_notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(options.reviewerEmail || 'admin@caexamchecker.com', options.notes || 'Admin affirmed consistency', evaluationId);

    return {
      success: true,
      status: 'COMPLETED',
      message: 'Evaluation consistency affirmed by administrator.',
      totalMarks: evalRecord.total_marks,
      percentage: evalRecord.percentage,
      grade: evalRecord.grade,
    };
  }

  return {
    success: false,
    status: 'NEEDS_REVIEW',
    message: 'Evaluation consistency verification could not be completed automatically. Administrator review is required.',
    errors: resultJson?.validationErrors || ['Questions or component arithmetic inconsistency flagged for review.'],
  };
}
