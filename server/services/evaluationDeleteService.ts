import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';

export interface DeleteEvaluationOptions {
  reason?: string;
  notes?: string;
}

export interface DeleteEvaluationResult {
  success: boolean;
  message: string;
  deletedEvaluationId: string;
  studentEmail?: string;
  filesRemoved: number;
  warnings: string[];
}

export interface BulkDeleteEvaluationsResult {
  success: boolean;
  message: string;
  deletedCount: number;
  deletedEvaluationIds: string[];
  failedEvaluationIds: string[];
  filesRemoved: number;
  warnings: string[];
}

export interface EvaluationDetails {
  evaluation: any;
  student: {
    id: string;
    fullName: string;
    email: string;
    accountClassification: string;
    icaiNumber?: string;
  } | null;
  institute: {
    id: string;
    name: string;
  } | null;
  files: {
    originalFileExists: boolean;
    checkedCopyExists: boolean;
    reportExists: boolean;
    filenames: string[];
  };
  warnings: string[];
}

/**
 * Retrieves detailed evaluation record for inspection prior to permanent deletion.
 * Only SUPER_ADMIN is authorized.
 */
export function getEvaluationDetails(
  evaluationId: string,
  actor: { id: string; email: string; role: string }
): EvaluationDetails {
  if (!actor || actor.role !== 'SUPER_ADMIN') {
    const error: any = new Error('Access denied. Only Super Admin has permission to view administrative evaluation details.');
    error.statusCode = 403;
    throw error;
  }

  const evaluation = db.prepare(`
    SELECT e.*, COALESCE(e.account_classification, 'NORMAL') as account_classification
    FROM evaluations e
    WHERE e.id = ?
  `).get(evaluationId) as any;

  if (!evaluation) {
    // Check if was previously deleted
    const wasDeleted = db.prepare(`
      SELECT details, created_at FROM audit_logs
      WHERE entity_type = 'evaluations' AND entity_id = ? AND action = 'EVALUATION_DELETED'
      ORDER BY created_at DESC LIMIT 1
    `).get(evaluationId) as any;

    if (wasDeleted) {
      const error: any = new Error('Evaluation no longer exists. It was previously deleted by Super Admin.');
      error.statusCode = 404;
      error.code = 'EVALUATION_DELETED';
      throw error;
    }

    const error: any = new Error('Evaluation record not found.');
    error.statusCode = 404;
    throw error;
  }

  // Get student details
  const student = db.prepare(`
    SELECT u.id, u.full_name, u.email, COALESCE(u.account_classification, 'NORMAL') as account_classification,
           p.icai_registration_number
    FROM users u
    LEFT JOIN student_profiles p ON p.user_id = u.id
    WHERE u.id = ?
  `).get(evaluation.student_id) as any;

  // Get institute details if applicable
  let institute = null;
  const instituteId = evaluation.institute_id || evaluation.sponsoring_institute_id;
  if (instituteId) {
    const instRow = db.prepare('SELECT id, name FROM institutes WHERE id = ?').get(instituteId) as any;
    if (instRow) {
      institute = { id: instRow.id, name: instRow.name };
    }
  }

  // Check files on disk
  const uploadDirs = [
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), 'data', 'uploads'),
  ];

  const foundFilenames: string[] = [];
  let originalFileExists = false;
  let checkedCopyExists = false;
  let reportExists = false;

  for (const dir of uploadDirs) {
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.startsWith(evaluationId)) {
            foundFilenames.push(file);
            if (file.includes('original')) originalFileExists = true;
            if (file.includes('checked_copy')) checkedCopyExists = true;
            if (file.includes('report')) reportExists = true;
          }
        }
      }
    } catch (dirErr) {
      console.warn(`[EvaluationDeleteService] Warning scanning dir ${dir}:`, dirErr);
    }
  }

  return {
    evaluation,
    student: student
      ? {
          id: student.id,
          fullName: student.full_name,
          email: student.email,
          accountClassification: student.account_classification,
          icaiNumber: student.icai_registration_number,
        }
      : null,
    institute,
    files: {
      originalFileExists,
      checkedCopyExists,
      reportExists,
      filenames: Array.from(new Set(foundFilenames)),
    },
    warnings: [
      'Deleting this evaluation permanently removes the evaluated answer sheet, annotations, question breakdowns, and score records.',
      'Global master questions, model answers, institute curriculum materials, and student accounts are never deleted.',
    ],
  };
}

/**
 * Permanently deletes a single evaluation record and its directly generated/owned assets.
 * Strictly adheres to:
 * - SUPER_ADMIN authorization
 * - Transactional integrity (BEGIN IMMEDIATE / COMMIT / ROLLBACK)
 * - Safe cascading deletion of dependent assignment submissions
 * - Nullification of references in support tickets and ledgers
 * - Removal of evaluation-specific uploaded/generated files on disk
 * - Absolute preservation of global materials, institute entities, and student accounts
 * - Credit safety (no unintended credit balance tampering)
 * - Immutable audit logging (action: EVALUATION_DELETED)
 */
export function deleteEvaluation(
  evaluationId: string,
  actor: { id: string; email: string; role: string },
  options?: DeleteEvaluationOptions,
  ipAddress?: string | null,
  userAgent?: string | null
): DeleteEvaluationResult {
  // 1. Authorization: ONLY SUPER_ADMIN
  if (!actor || actor.role !== 'SUPER_ADMIN') {
    const error: any = new Error('Access denied. Only Super Admin has permission to delete evaluations.');
    error.statusCode = 403;
    throw error;
  }

  // 2. Fetch evaluation record before deletion
  const evaluation = db.prepare(`
    SELECT e.*, COALESCE(e.account_classification, 'NORMAL') as account_classification
    FROM evaluations e
    WHERE e.id = ?
  `).get(evaluationId) as any;

  if (!evaluation) {
    const wasDeleted = db.prepare(`
      SELECT details, created_at FROM audit_logs
      WHERE entity_type = 'evaluations' AND entity_id = ? AND action = 'EVALUATION_DELETED'
      ORDER BY created_at DESC LIMIT 1
    `).get(evaluationId) as any;

    if (wasDeleted) {
      const error: any = new Error('Evaluation no longer exists. It was previously deleted by Super Admin.');
      error.statusCode = 404;
      error.code = 'EVALUATION_DELETED';
      throw error;
    }

    const error: any = new Error('Evaluation record not found.');
    error.statusCode = 404;
    throw error;
  }

  // Fetch student info
  const student = db.prepare('SELECT full_name, email, account_classification FROM users WHERE id = ?').get(evaluation.student_id) as any;
  const studentName = student?.full_name || 'Unknown Student';
  const studentEmail = student?.email || 'unknown@example.com';

  // Fetch institute name if applicable
  let instituteName: string | null = null;
  const instId = evaluation.institute_id || evaluation.sponsoring_institute_id;
  if (instId) {
    const inst = db.prepare('SELECT name FROM institutes WHERE id = ?').get(instId) as any;
    if (inst) instituteName = inst.name;
  }

  // 3. Remove disk files directly associated with this evaluation ID
  const uploadDirs = [
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), 'data', 'uploads'),
  ];

  let filesRemoved = 0;
  for (const dir of uploadDirs) {
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          // Match files starting with this specific evaluationId
          if (file.startsWith(evaluationId)) {
            try {
              const fullPath = path.join(dir, file);
              fs.unlinkSync(fullPath);
              filesRemoved++;
            } catch (unlinkErr) {
              console.warn(`[EvaluationDelete] Could not delete disk file ${file}:`, unlinkErr);
            }
          }
        }
      }
    } catch (dirErr) {
      console.warn(`[EvaluationDelete] Could not scan directory ${dir}:`, dirErr);
    }
  }

  // 4. Atomic Database Transaction
  db.exec('BEGIN IMMEDIATE');
  try {
    // 4A. Clean up dependent assignment submissions (if any)
    db.prepare('DELETE FROM assignment_submissions WHERE evaluation_id = ?').run(evaluationId);

    // 4B. Nullify evaluation reference in support tickets so student support history is preserved
    db.prepare('UPDATE support_tickets SET evaluation_id = NULL WHERE evaluation_id = ?').run(evaluationId);

    // 4C. Nullify evaluation reference in credit ledger to keep credit accounting clean
    db.prepare('UPDATE credit_ledger SET evaluation_id = NULL WHERE evaluation_id = ?').run(evaluationId);

    // 4D. Nullify evaluation reference in institute usage ledger
    db.prepare('UPDATE institute_usage_ledger SET evaluation_id = NULL WHERE evaluation_id = ?').run(evaluationId);

    // 4E. Remove evaluation record from evaluations table
    db.prepare('DELETE FROM evaluations WHERE id = ?').run(evaluationId);

    // 4F. Create immutable Audit Log
    const auditLogId = `aud_${crypto.randomBytes(8).toString('hex')}`;
    const auditDetails = {
      superAdminId: actor.id,
      superAdminEmail: actor.email,
      evaluationId,
      studentId: evaluation.student_id,
      studentName,
      studentEmail,
      caLevel: evaluation.level,
      subject: evaluation.subject_name,
      paper: evaluation.paper || null,
      attempt: evaluation.attempt || null,
      evaluationSource: evaluation.evaluation_source || 'PUBLIC',
      instituteId: evaluation.institute_id || evaluation.sponsoring_institute_id || null,
      instituteName,
      status: evaluation.status,
      totalMarks: evaluation.total_marks,
      maximumMarks: evaluation.maximum_marks,
      percentage: evaluation.percentage,
      grade: evaluation.grade,
      accountClassification: evaluation.account_classification,
      entitlementSource: evaluation.entitlement_source,
      reason: options?.reason || 'Administrative cleanup',
      notes: options?.notes || null,
      filesRemovedCount: filesRemoved,
      creditSafetyNote: 'Student credit balance preserved unchanged in accordance with credit safety policy.',
      userAgent: userAgent || null,
      deletedAt: new Date().toISOString(),
    };

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES (?, ?, 'EVALUATION_DELETED', 'evaluations', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      auditLogId,
      actor.id,
      evaluationId,
      JSON.stringify(auditDetails),
      ipAddress || null
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('[EvaluationDelete] Transaction failed, rolled back:', err);
    throw err;
  }

  return {
    success: true,
    message: `Evaluation ${evaluationId} (${evaluation.subject_name || 'Evaluation'}) permanently deleted.`,
    deletedEvaluationId: evaluationId,
    studentEmail,
    filesRemoved,
    warnings: [
      'Evaluated copy, marks breakdown, and feedback have been permanently removed.',
      'Student account and shared curriculum materials remain safely untouched.',
    ],
  };
}

/**
 * Bulk deletes multiple evaluation records in a single administrative operation.
 * Only SUPER_ADMIN is authorized.
 */
export function bulkDeleteEvaluations(
  evaluationIds: string[],
  actor: { id: string; email: string; role: string },
  options?: DeleteEvaluationOptions,
  ipAddress?: string | null,
  userAgent?: string | null
): BulkDeleteEvaluationsResult {
  if (!actor || actor.role !== 'SUPER_ADMIN') {
    const error: any = new Error('Access denied. Only Super Admin has permission to bulk delete evaluations.');
    error.statusCode = 403;
    throw error;
  }

  if (!Array.isArray(evaluationIds) || evaluationIds.length === 0) {
    const error: any = new Error('No evaluation IDs provided for bulk deletion.');
    error.statusCode = 400;
    throw error;
  }

  const deletedEvaluationIds: string[] = [];
  const failedEvaluationIds: string[] = [];
  let totalFilesRemoved = 0;

  for (const id of evaluationIds) {
    try {
      const res = deleteEvaluation(id, actor, options, ipAddress, userAgent);
      deletedEvaluationIds.push(id);
      totalFilesRemoved += res.filesRemoved;
    } catch (err: any) {
      console.warn(`[BulkDeleteEvaluations] Failed to delete evaluation ${id}:`, err?.message);
      failedEvaluationIds.push(id);
    }
  }

  return {
    success: deletedEvaluationIds.length > 0,
    message: `Successfully deleted ${deletedEvaluationIds.length} of ${evaluationIds.length} evaluations.`,
    deletedCount: deletedEvaluationIds.length,
    deletedEvaluationIds,
    failedEvaluationIds,
    filesRemoved: totalFilesRemoved,
    warnings: failedEvaluationIds.length > 0
      ? [`${failedEvaluationIds.length} evaluations could not be deleted (already removed or invalid).`]
      : [],
  };
}
