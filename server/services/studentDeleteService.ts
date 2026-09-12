import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { permanentlyDeleteFromFirestore } from './firestoreSyncService.js';

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
  if (!actor || actor.role !== 'SUPER_ADMIN') {
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
  if (!actor || actor.role !== 'SUPER_ADMIN') {
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
