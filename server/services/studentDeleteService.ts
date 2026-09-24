import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { db, verifyPassword } from '../db.js';
import { permanentlyDeleteFromFirestore } from './firestoreSyncService.js';
import { deleteEvaluationCloudFiles, deleteStudentCloudFiles } from './persistentStorageService.js';
import { revokeAllSessionsForUser } from './sessionService.js';

export interface DeleteStudentResult {
  success: boolean;
  message: string;
  deletedStudent: {
    id: string;
    email: string;
    fullName: string;
    accountClassification: 'NORMAL' | 'TEST';
  };
  cleanupSummary: {
    evaluationsRemoved: number;
    filesRemoved: number;
    membershipsRemoved: number;
    redemptionsCleaned: number;
    sessionsRevoked: number;
    financialRecordsRetained: number;
  };
}

export function deleteStudentAccount(
  studentId: string,
  actor: { id: string; email: string; role: string },
  ipAddress?: string | null,
  userAgent?: string | null
): DeleteStudentResult {
  // 1. Authorization: Only SUPER_ADMIN can permanently delete
  const actorRole = (actor?.role || '').toUpperCase();
  const actorEmail = (actor?.email || '').toLowerCase().trim();
  if (!actor || actorRole !== 'SUPER_ADMIN' || actorEmail === 'priyatca15@gmail.com' || actor.id === 'usr_mcq_admin_priyatca15') {
    const error: any = new Error('Access denied. Only Super Admin has permission to permanently delete student accounts.');
    error.statusCode = 403;
    throw error;
  }

  // 2. Validate target user exists
  const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(studentId) as {
    id: string;
    email: string;
    full_name: string;
    role: string;
    status: string;
    account_classification?: 'NORMAL' | 'TEST';
  } | undefined;

  if (!targetUser) {
    const error: any = new Error('Student account not found or has already been deleted.');
    error.statusCode = 404;
    throw error;
  }

  // 3. Strict Student Role Check: Admins or Institutes cannot be deleted here
  if (targetUser.role !== 'STUDENT') {
    const error: any = new Error(`Cannot delete user with role ${targetUser.role}. Only student accounts can be deleted.`);
    error.statusCode = 400;
    throw error;
  }

  // 4. Collect all student-owned evaluations and locate associated files on disk
  const studentEvaluations = db.prepare('SELECT id FROM evaluations WHERE student_id = ?').all(studentId) as { id: string }[];
  
  const uploadDirs = [
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), 'data', 'uploads'),
  ];

  let filesRemovedCount = 0;
  for (const ev of studentEvaluations) {
    for (const dir of uploadDirs) {
      try {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            // Target original answer sheet, checked copy, or report files matching this evaluation id
            if (file.startsWith(ev.id)) {
              try {
                fs.unlinkSync(path.join(dir, file));
                filesRemovedCount++;
              } catch (fileErr) {
                console.warn(`[StudentDelete] Failed to delete file ${file}:`, fileErr);
              }
            }
          }
        }
      } catch (dirErr) {
        console.warn(`[StudentDelete] Error scanning dir ${dir}:`, dirErr);
      }
    }
  }

  // 5. Query Promo/Referral redemptions before transaction to recalculate campaigns
  const redeemedCodes = db.prepare('SELECT referral_code FROM referral_redemptions WHERE user_id = ?').all(studentId) as { referral_code: string }[];

  // 6. Query Financial & Session records count for audit logging
  const paymentTxRows = db.prepare('SELECT id FROM payment_transactions WHERE student_id = ?').all(studentId) as { id: string }[];
  const sessionsCount = (db.prepare('SELECT COUNT(*) as cnt FROM user_sessions WHERE user_id = ?').get(studentId) as any)?.cnt || 0;
  const membershipsCount = (db.prepare('SELECT COUNT(*) as cnt FROM institute_memberships WHERE student_id = ?').get(studentId) as any)?.cnt || 0;

  // 7. Atomic Database Transaction
  db.exec('BEGIN IMMEDIATE');
  try {
    // 7A. Financial / Audit Data Retention (Rule 5):
    // Preserves successful payment transactions and Razorpay orders for tax/statutory audit,
    // while completely dissociating the student's personal information.
    if (paymentTxRows.length > 0) {
      const ARCHIVE_USER_ID = 'usr_financial_audit_archive';
      const existingArchiveUser = db.prepare('SELECT id FROM users WHERE id = ?').get(ARCHIVE_USER_ID);
      if (!existingArchiveUser) {
        db.prepare(`
          INSERT INTO users (id, email, password_hash, full_name, phone, role, status, account_classification, created_at, updated_at)
          VALUES (?, 'financial-audit-retention@caexamchecker.internal', 'DISABLED_ACCOUNT_CANNOT_LOGIN', 'Anonymized Financial Audit Retention', NULL, 'STUDENT', 'ANONYMIZED', 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(ARCHIVE_USER_ID);
      }

      // Re-assign payment records to the retained audit system entity
      db.prepare('UPDATE payment_orders SET student_id = ? WHERE student_id = ?').run(ARCHIVE_USER_ID, studentId);
      db.prepare('UPDATE payment_transactions SET student_id = ? WHERE student_id = ?').run(ARCHIVE_USER_ID, studentId);
    } else {
      // If no successful payments, safely delete any abandoned or pending payment orders
      db.prepare('DELETE FROM payment_orders WHERE student_id = ?').run(studentId);
    }

    // 7B. Institute Usage Ledger:
    // Retain quota ledger history for institutes so their usage audits stay mathematically sound
    try {
      db.prepare("UPDATE institute_usage_ledger SET student_id = 'deleted_student_record' WHERE student_id = ?").run(studentId);
    } catch {
      // optional ledger table
    }

    // 7C. Promo & Referral Redemptions Cleanup (Rule 7):
    // Remove test redemption from active production redemption count
    db.prepare('DELETE FROM referral_redemptions WHERE user_id = ?').run(studentId);

    // If a campaign was previously EXHAUSTED, recalculate genuine redemptions and restore ACTIVE status
    for (const r of redeemedCodes) {
      const campaign = db.prepare('SELECT * FROM referral_campaigns WHERE UPPER(code) = UPPER(?)').get(r.referral_code) as any;
      if (campaign) {
        const countRow = db.prepare(`
          SELECT COUNT(*) as total
          FROM referral_redemptions r
          LEFT JOIN users u ON u.id = r.user_id
          WHERE UPPER(r.referral_code) = UPPER(?)
            AND (u.account_classification IS NULL OR u.account_classification != 'TEST')
        `).get(r.referral_code) as { total: number };

        const totalActiveGenuine = countRow?.total || 0;
        const maxRedemptions = campaign.max_redemptions || 20;

        if (totalActiveGenuine < maxRedemptions && campaign.status === 'EXHAUSTED' && campaign.is_active === 1) {
          db.prepare(`UPDATE referral_campaigns SET status = 'ACTIVE' WHERE UPPER(code) = UPPER(?)`).run(r.referral_code);
        }
      }
    }

    // 7D. Permanent Free Entitlements
    db.prepare('DELETE FROM permanent_free_entitlements WHERE lower(email) = lower(?)').run(targetUser.email);

    // 7E. Support & Ticket Records
    db.prepare('DELETE FROM support_tickets WHERE user_id = ? OR lower(email) = lower(?)').run(studentId, targetUser.email);

    // 7F. Student-Owned Data Cleanup
    db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(studentId);
    db.prepare('DELETE FROM account_suspensions WHERE user_id = ?').run(studentId);
    db.prepare('DELETE FROM revocation_requests WHERE user_id = ?').run(studentId);
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(studentId);
    db.prepare('DELETE FROM assignment_submissions WHERE student_id = ?').run(studentId);
    db.prepare('DELETE FROM institute_memberships WHERE student_id = ?').run(studentId);
    db.prepare('DELETE FROM credit_ledger WHERE student_id = ?').run(studentId);
    db.prepare('DELETE FROM student_credit_purchases WHERE user_id = ?').run(studentId);
    db.prepare('DELETE FROM evaluations WHERE student_id = ?').run(studentId);
    db.prepare('DELETE FROM student_profiles WHERE user_id = ?').run(studentId);

    // 7G. Permanently Delete User Platform Account
    db.prepare('DELETE FROM users WHERE id = ?').run(studentId);

    // 7H. Create Permanent Audit Log Entry (Rule 10)
    const auditId = `audit_${crypto.randomBytes(8).toString('hex')}`;
    const auditDetails = JSON.stringify({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: 'SUPER_ADMIN',
      deletedStudentId: targetUser.id,
      deletedStudentEmail: targetUser.email,
      deletedStudentName: targetUser.full_name,
      deletionTimestamp: new Date().toISOString(),
      accountClassification: targetUser.account_classification || 'NORMAL',
      dataCleanupSummary: {
        evaluationsRemoved: studentEvaluations.length,
        filesRemoved: filesRemovedCount,
        membershipsRemoved: membershipsCount,
        redemptionsCleaned: redeemedCodes.length,
        sessionsRevoked: sessionsCount,
        financialRecordsRetained: paymentTxRows.length,
      },
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    });

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES (?, ?, 'DELETE_STUDENT_ACCOUNT', 'USER', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      auditId,
      actor.id,
      targetUser.id,
      auditDetails,
      ipAddress || null
    );

    // Commit atomic transaction
    db.exec('COMMIT');

    // 7I. Cloud Firestore Synchronization & Tombstoning (Prevents resurrection upon restart)
    try {
      permanentlyDeleteFromFirestore('users', studentId, `Super admin permanently deleted student ${targetUser.email}`);
      permanentlyDeleteFromFirestore('student_profiles', studentId, `Deleted student profile for ${studentId}`);
      for (const ev of studentEvaluations) {
        permanentlyDeleteFromFirestore('evaluations', ev.id, `Cascaded deletion of evaluation for deleted student ${studentId}`);
      }
    } catch (fsErr) {
      console.warn('[StudentDeleteService] Firestore permanent deletion warning:', fsErr);
    }

    return {
      success: true,
      message: `Student account ${targetUser.full_name} (${targetUser.email}) has been permanently deleted.`,
      deletedStudent: {
        id: targetUser.id,
        email: targetUser.email,
        fullName: targetUser.full_name,
        accountClassification: targetUser.account_classification || 'NORMAL',
      },
      cleanupSummary: {
        evaluationsRemoved: studentEvaluations.length,
        filesRemoved: filesRemovedCount,
        membershipsRemoved: membershipsCount,
        redemptionsCleaned: redeemedCodes.length,
        sessionsRevoked: sessionsCount,
        financialRecordsRetained: paymentTxRows.length,
      },
    };
  } catch (txErr) {
    db.exec('ROLLBACK');
    console.error('[StudentDeleteService] Transaction error:', txErr);
    throw txErr;
  }
}

export function updateStudentClassification(
  studentId: string,
  classification: 'NORMAL' | 'TEST',
  actor: { id: string; email: string; role: string }
) {
  const actorRole = (actor?.role || '').toUpperCase();
  const actorEmail = (actor?.email || '').toLowerCase().trim();
  if (!actor || actorRole !== 'SUPER_ADMIN' || actorEmail === 'priyatca15@gmail.com' || actor.id === 'usr_mcq_admin_priyatca15') {
    const error: any = new Error('Access denied. Only Super Admin can change account classification.');
    error.statusCode = 403;
    throw error;
  }

  if (classification !== 'NORMAL' && classification !== 'TEST') {
    const error: any = new Error("Invalid classification. Must be 'NORMAL' or 'TEST'.");
    error.statusCode = 400;
    throw error;
  }

  const targetUser = db.prepare('SELECT id, email, full_name, role, account_classification FROM users WHERE id = ?').get(studentId) as any;
  if (!targetUser) {
    const error: any = new Error('Student account not found.');
    error.statusCode = 404;
    throw error;
  }

  if (targetUser.role !== 'STUDENT') {
    const error: any = new Error('Only student accounts can be classified as NORMAL or TEST.');
    error.statusCode = 400;
    throw error;
  }

  db.prepare('UPDATE users SET account_classification = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(classification, studentId);

  // Audit log
  const auditId = `audit_${crypto.randomBytes(8).toString('hex')}`;
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, 'UPDATE_STUDENT_CLASSIFICATION', 'USER', ?, ?, CURRENT_TIMESTAMP)
  `).run(
    auditId,
    actor.id,
    studentId,
    JSON.stringify({
      actorEmail: actor.email,
      studentEmail: targetUser.email,
      previousClassification: targetUser.account_classification || 'NORMAL',
      newClassification: classification,
      updatedAt: new Date().toISOString(),
    })
  );

  return {
    success: true,
    student: {
      id: targetUser.id,
      email: targetUser.email,
      fullName: targetUser.full_name,
      accountClassification: classification,
    },
  };
}

export interface SelfDeleteStudentParams {
  studentId: string;
  confirmationText: string;
  currentPassword?: string;
  emailConfirmation?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface SelfDeleteStudentResult {
  success: boolean;
  message: string;
  status: 'DELETED';
  alreadyDeleted?: boolean;
  cleanupSummary: {
    evaluationsRemoved: number;
    filesRemoved: number;
    membershipsRemoved: number;
    redemptionsCleaned: number;
    sessionsRevoked: number;
    financialRecordsRetained: number;
  };
}

/**
 * Authoritative self-service account deletion for students.
 * Strictly verifies identity, re-authentication, explicit confirmation 'DELETE',
 * cleans up user-owned records and Cloud Storage, preserves statutory payment audits without personal data,
 * and permanently invalidates sessions.
 */
export async function selfDeleteStudentAccount(
  params: SelfDeleteStudentParams
): Promise<SelfDeleteStudentResult> {
  const { studentId, confirmationText, currentPassword, emailConfirmation, ipAddress, userAgent } = params;

  // 1. Idempotency & Existence Check
  const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(studentId) as {
    id: string;
    email: string;
    full_name: string;
    password_hash: string;
    role: string;
    status: string;
    account_classification?: 'NORMAL' | 'TEST';
  } | undefined;

  if (!targetUser) {
    // Check if previously recorded in account_deletion_requests
    const previousDeletion = db.prepare(`
      SELECT status, completed_at FROM account_deletion_requests
      WHERE user_id = ? AND status = 'DELETED'
      ORDER BY completed_at DESC LIMIT 1
    `).get(studentId) as { status: string; completed_at: string } | undefined;

    if (previousDeletion) {
      return {
        success: true,
        message: 'Your account has been deleted successfully.',
        status: 'DELETED',
        alreadyDeleted: true,
        cleanupSummary: {
          evaluationsRemoved: 0,
          filesRemoved: 0,
          membershipsRemoved: 0,
          redemptionsCleaned: 0,
          sessionsRevoked: 0,
          financialRecordsRetained: 0,
        },
      };
    }

    const error: any = new Error('Student account not found or has already been deleted.');
    error.statusCode = 404;
    throw error;
  }

  // If user status is already DELETED
  if (targetUser.status === 'DELETED') {
    return {
      success: true,
      message: 'Your account has been deleted successfully.',
      status: 'DELETED',
      alreadyDeleted: true,
      cleanupSummary: {
        evaluationsRemoved: 0,
        filesRemoved: 0,
        membershipsRemoved: 0,
        redemptionsCleaned: 0,
        sessionsRevoked: 0,
        financialRecordsRetained: 0,
      },
    };
  }

  // 2. Strict Role Verification: Only STUDENT accounts can self-delete
  if (targetUser.role !== 'STUDENT') {
    const error: any = new Error('Privileged administrative accounts (Institute Admin, Super Admin) cannot be deleted via student self-service. Please contact support or use the administrative account deactivation process.');
    error.statusCode = 403;
    throw error;
  }

  // 3. Explicit Confirmation Check: Must type DELETE
  if (!confirmationText || confirmationText.trim() !== 'DELETE') {
    const error: any = new Error('Explicit confirmation required. Please type DELETE in all caps to confirm permanent account deletion.');
    error.statusCode = 400;
    throw error;
  }

  // 4. Secure Re-Authentication
  const isPasswordAccount = targetUser.password_hash &&
    !targetUser.password_hash.startsWith('GOOGLE_') &&
    targetUser.password_hash !== 'EXTERNAL_OAUTH' &&
    targetUser.password_hash !== 'DISABLED_ACCOUNT_CANNOT_LOGIN';

  if (isPasswordAccount) {
    if (!currentPassword || typeof currentPassword !== 'string' || currentPassword.trim() === '') {
      const error: any = new Error('Please enter your current password to verify your identity.');
      error.statusCode = 400;
      throw error;
    }
    const isPwdValid = verifyPassword(currentPassword, targetUser.password_hash);
    if (!isPwdValid) {
      const error: any = new Error('Incorrect current password. Identity verification failed.');
      error.statusCode = 401;
      throw error;
    }
  } else {
    // External or Google OAuth user: verify registered email confirmation
    if (!emailConfirmation || emailConfirmation.trim().toLowerCase() !== targetUser.email.toLowerCase()) {
      const error: any = new Error('Please confirm your registered email address to verify your identity.');
      error.statusCode = 400;
      throw error;
    }
  }

  // 5. Deletion State Management & Idempotency
  const activeReq = db.prepare(`
    SELECT id, status, started_at FROM account_deletion_requests
    WHERE user_id = ? AND status IN ('DELETE_PENDING', 'DELETING')
    ORDER BY started_at DESC LIMIT 1
  `).get(studentId) as { id: string; status: string; started_at: string } | undefined;

  if (activeReq) {
    const elapsedSeconds = (Date.now() - new Date(activeReq.started_at).getTime()) / 1000;
    if (elapsedSeconds < 60) {
      return {
        success: true,
        message: 'Your account deletion is already in progress.',
        status: 'DELETED',
        cleanupSummary: {
          evaluationsRemoved: 0,
          filesRemoved: 0,
          membershipsRemoved: 0,
          redemptionsCleaned: 0,
          sessionsRevoked: 0,
          financialRecordsRetained: 0,
        },
      };
    }
  }

  const requestId = `del_req_${crypto.randomBytes(8).toString('hex')}`;
  db.prepare(`
    INSERT INTO account_deletion_requests (id, user_id, email, status, reason, started_at)
    VALUES (?, ?, ?, 'DELETE_PENDING', 'Student self-service account deletion', CURRENT_TIMESTAMP)
  `).run(requestId, studentId, targetUser.email);

  // Invalidate all active sessions immediately
  revokeAllSessionsForUser(studentId);

  // Transition state to DELETING
  db.prepare("UPDATE account_deletion_requests SET status = 'DELETING' WHERE id = ?").run(requestId);
  db.prepare("UPDATE users SET status = 'DELETING', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(studentId);

  // 6. Collect student-owned evaluations and remove disk & cloud files
  const studentEvaluations = db.prepare('SELECT id FROM evaluations WHERE student_id = ?').all(studentId) as { id: string }[];

  const uploadDirs = [
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), 'data', 'uploads'),
  ];

  let filesRemovedCount = 0;
  for (const ev of studentEvaluations) {
    for (const dir of uploadDirs) {
      try {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            if (file.startsWith(ev.id)) {
              try {
                fs.unlinkSync(path.join(dir, file));
                filesRemovedCount++;
              } catch (fileErr) {
                console.warn(`[StudentSelfDelete] Failed to delete file ${file}:`, fileErr);
              }
            }
          }
        }
      } catch (dirErr) {
        console.warn(`[StudentSelfDelete] Error scanning dir ${dir}:`, dirErr);
      }
    }
  }

  // Cloud Storage Cleanup for evaluations and student documents
  try {
    for (const ev of studentEvaluations) {
      await deleteEvaluationCloudFiles(ev.id);
    }
    await deleteStudentCloudFiles(studentId);
  } catch (cloudErr) {
    console.warn(`[StudentSelfDelete] Cloud storage deletion non-blocking warning:`, cloudErr);
  }

  // 7. Query redemptions, payment records, memberships for summary
  const redeemedCodes = db.prepare('SELECT referral_code FROM referral_redemptions WHERE user_id = ?').all(studentId) as { referral_code: string }[];
  const paymentTxRows = db.prepare('SELECT id FROM payment_transactions WHERE student_id = ?').all(studentId) as { id: string }[];
  const sessionsCount = (db.prepare('SELECT COUNT(*) as cnt FROM user_sessions WHERE user_id = ?').get(studentId) as any)?.cnt || 0;
  const membershipsCount = (db.prepare('SELECT COUNT(*) as cnt FROM institute_memberships WHERE student_id = ?').get(studentId) as any)?.cnt || 0;

  // 8. Atomic Database Deletion
  db.exec('BEGIN IMMEDIATE');
  try {
    // 8A. Financial / Accounting Data Retention:
    // Dissociates student personal identity while maintaining required statutory transaction records
    if (paymentTxRows.length > 0) {
      const ARCHIVE_USER_ID = 'usr_financial_audit_archive';
      const existingArchiveUser = db.prepare('SELECT id FROM users WHERE id = ?').get(ARCHIVE_USER_ID);
      if (!existingArchiveUser) {
        db.prepare(`
          INSERT INTO users (id, email, password_hash, full_name, phone, role, status, account_classification, created_at, updated_at)
          VALUES (?, 'financial-audit-retention@caexamchecker.internal', 'DISABLED_ACCOUNT_CANNOT_LOGIN', 'Anonymized Financial Audit Retention', NULL, 'STUDENT', 'ANONYMIZED', 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(ARCHIVE_USER_ID);
      }

      db.prepare('UPDATE payment_orders SET student_id = ? WHERE student_id = ?').run(ARCHIVE_USER_ID, studentId);
      db.prepare('UPDATE payment_transactions SET student_id = ? WHERE student_id = ?').run(ARCHIVE_USER_ID, studentId);
    } else {
      db.prepare('DELETE FROM payment_orders WHERE student_id = ?').run(studentId);
    }

    // 8B. Institute Usage Ledger:
    // Retains mathematical aggregate count for institute quotas without retaining student profile
    try {
      db.prepare("UPDATE institute_usage_ledger SET student_id = 'deleted_student_record' WHERE student_id = ?").run(studentId);
    } catch {
      // optional ledger table
    }

    // 8C. Promo / Referral Redemptions Cleanup
    db.prepare('DELETE FROM referral_redemptions WHERE user_id = ?').run(studentId);
    for (const r of redeemedCodes) {
      const campaign = db.prepare('SELECT * FROM referral_campaigns WHERE UPPER(code) = UPPER(?)').get(r.referral_code) as any;
      if (campaign) {
        const countRow = db.prepare(`
          SELECT COUNT(*) as total
          FROM referral_redemptions r
          LEFT JOIN users u ON u.id = r.user_id
          WHERE UPPER(r.referral_code) = UPPER(?)
            AND (u.account_classification IS NULL OR u.account_classification != 'TEST')
        `).get(r.referral_code) as { total: number };

        const totalActiveGenuine = countRow?.total || 0;
        const maxRedemptions = campaign.max_redemptions || 20;

        if (totalActiveGenuine < maxRedemptions && campaign.status === 'EXHAUSTED' && campaign.is_active === 1) {
          db.prepare(`UPDATE referral_campaigns SET status = 'ACTIVE' WHERE UPPER(code) = UPPER(?)`).run(r.referral_code);
        }
      }
    }

    // 8D. Permanent Free Entitlements & Support Tickets
    db.prepare('DELETE FROM permanent_free_entitlements WHERE lower(email) = lower(?)').run(targetUser.email);
    db.prepare('DELETE FROM support_tickets WHERE user_id = ? OR lower(email) = lower(?)').run(studentId, targetUser.email);

    // 8E. Evaluation & Academic Cleanup
    db.prepare('DELETE FROM student_examiner_profiles WHERE student_id = ?').run(studentId);
    db.prepare('DELETE FROM recheck_requests WHERE student_id = ?').run(studentId);
    for (const ev of studentEvaluations) {
      db.prepare('DELETE FROM evaluation_versions WHERE evaluation_id = ?').run(ev.id);
    }
    db.prepare('DELETE FROM assignment_submissions WHERE student_id = ?').run(studentId);
    db.prepare('DELETE FROM institute_memberships WHERE student_id = ?').run(studentId);
    db.prepare('DELETE FROM credit_ledger WHERE student_id = ?').run(studentId);
    db.prepare('DELETE FROM student_credit_purchases WHERE user_id = ?').run(studentId);
    db.prepare('DELETE FROM evaluations WHERE student_id = ?').run(studentId);
    db.prepare('DELETE FROM student_profiles WHERE user_id = ?').run(studentId);
    db.prepare('DELETE FROM exam_attempts WHERE student_id = ?').run(studentId);

    // 8F. Security & Session Cleanup
    db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(studentId);
    db.prepare('DELETE FROM account_suspensions WHERE user_id = ?').run(studentId);
    db.prepare('DELETE FROM revocation_requests WHERE user_id = ?').run(studentId);
    db.prepare('DELETE FROM mfa_verifications WHERE user_id = ?').run(studentId);
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(studentId);
    db.prepare('DELETE FROM legal_acknowledgements WHERE user_id = ?').run(studentId);
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(studentId);

    // 8G. Update Deletion Request Status to DELETED
    db.prepare(`
      UPDATE account_deletion_requests
      SET status = 'DELETED', completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(requestId);

    // 8H. Permanently Delete User from Users table
    db.prepare('DELETE FROM users WHERE id = ?').run(studentId);

    // 8I. Audit Log (Never log passwords or tokens)
    const auditId = `audit_${crypto.randomBytes(8).toString('hex')}`;
    const auditDetails = JSON.stringify({
      actorUserId: studentId,
      actorRole: 'STUDENT',
      actionType: 'SELF_SERVICE_ACCOUNT_DELETION',
      deletedStudentEmail: targetUser.email,
      timestamp: new Date().toISOString(),
      evaluationsRemoved: studentEvaluations.length,
      filesRemoved: filesRemovedCount,
      membershipsRemoved: membershipsCount,
      sessionsRevoked: sessionsCount,
      financialRecordsRetained: paymentTxRows.length,
    });

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES (?, ?, 'STUDENT_SELF_DELETE_ACCOUNT', 'USER', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      auditId,
      studentId,
      studentId,
      auditDetails,
      ipAddress || null
    );

    // Commit atomic transaction
    db.exec('COMMIT');

    // 8J. Cloud Firestore Permanent Deletion & Tombstoning
    try {
      permanentlyDeleteFromFirestore('users', studentId, `Student self-deleted account: ${targetUser.email}`);
      permanentlyDeleteFromFirestore('student_profiles', studentId, `Self-deleted student profile: ${studentId}`);
      permanentlyDeleteFromFirestore('student_examiner_profiles', studentId, `Self-deleted student examiner profile: ${studentId}`);
      for (const ev of studentEvaluations) {
        permanentlyDeleteFromFirestore('evaluations', ev.id, `Cascaded deletion for self-deleted student: ${studentId}`);
      }
    } catch (fsErr) {
      console.warn('[StudentDeleteService] Firestore permanent deletion warning:', fsErr);
    }

    return {
      success: true,
      message: 'Your account has been deleted successfully.',
      status: 'DELETED',
      cleanupSummary: {
        evaluationsRemoved: studentEvaluations.length,
        filesRemoved: filesRemovedCount,
        membershipsRemoved: membershipsCount,
        redemptionsCleaned: redeemedCodes.length,
        sessionsRevoked: sessionsCount,
        financialRecordsRetained: paymentTxRows.length,
      },
    };
  } catch (txErr: any) {
    db.exec('ROLLBACK');
    console.error('[StudentDeleteService] Self-deletion transaction failed:', {
      studentId,
      errorName: txErr?.name,
      errorMessage: txErr?.message,
    });

    try {
      db.prepare(`
        UPDATE account_deletion_requests
        SET status = 'DELETION_FAILED', error_message = ?
        WHERE id = ?
      `).run(txErr?.message || 'Database transaction failed', requestId);
      db.prepare("UPDATE users SET status = 'ACTIVE' WHERE id = ?").run(studentId);
    } catch (recErr) {
      console.error('[StudentDeleteService] Failed to record DELETION_FAILED state:', recErr);
    }

    const failureError: any = new Error('Account deletion could not be completed. Please try again or contact support.');
    failureError.statusCode = 500;
    failureError.supportEmail = 'support@caexamcheckerai.com';
    throw failureError;
  }
}
