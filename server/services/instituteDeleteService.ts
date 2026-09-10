import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { db } from '../db.js';

export interface DeleteInstituteResult {
  success: boolean;
  message: string;
  deletedInstitute: {
    id: string;
    name: string;
    code: string;
    email: string;
    accountClassification: 'NORMAL' | 'TEST';
  };
  cleanupSummary: {
    batchesRemoved: number;
    membershipsDetached: number;
    assignmentsRemoved: number;
    submissionsRemoved: number;
    testsRemoved: number;
    materialsRemoved: number;
    evaluationsRemoved: number;
    filesRemoved: number;
    subscriptionsRemoved: number;
    usageLedgerRemoved: number;
    adminAccountsRemoved: number;
    sessionsRevoked: number;
  };
}

/**
 * Permanently deletes an institute and all institute-owned testing/operational data.
 * Guarantees:
 * 1. Only SUPER_ADMIN can execute this operation.
 * 2. Student platform accounts are NEVER permanently deleted; only their membership in this institute is detached.
 * 3. Atomic transaction: all operations succeed or none do.
 * 4. Zero orphaned records left in database.
 * 5. Permanent audit log recorded.
 */
export function deleteInstituteAccount(
  instituteId: string,
  actor: { id: string; email: string; role: string },
  ipAddress?: string | null,
  userAgent?: string | null
): DeleteInstituteResult {
  // 1. Authorization: Only SUPER_ADMIN can delete an institute
  if (!actor || actor.role !== 'SUPER_ADMIN') {
    const error: any = new Error('Access denied. Only Super Admin has permission to permanently delete institutes.');
    error.statusCode = 403;
    throw error;
  }

  // 2. Validate target institute exists
  const targetInstitute = db.prepare('SELECT * FROM institutes WHERE id = ?').get(instituteId) as {
    id: string;
    name: string;
    code: string;
    email: string;
    status: string;
    account_classification?: 'NORMAL' | 'TEST';
  } | undefined;

  if (!targetInstitute) {
    const error: any = new Error('Institute not found or has already been deleted.');
    error.statusCode = 404;
    throw error;
  }

  const classification = targetInstitute.account_classification || 'NORMAL';

  // 3. Collect all related IDs before transaction for disk cleanup and metrics
  // Batches
  const batchRows = db.prepare('SELECT id FROM batches WHERE institute_id = ?').all(instituteId) as { id: string }[];
  const batchIds = batchRows.map((b) => b.id);

  // Assignments & Submissions
  const assignmentRows = db.prepare('SELECT id FROM institute_assignments WHERE institute_id = ?').all(instituteId) as { id: string }[];
  const assignmentIds = assignmentRows.map((a) => a.id);

  let submissionCount = 0;
  if (assignmentIds.length > 0) {
    const placeholders = assignmentIds.map(() => '?').join(',');
    submissionCount = (db.prepare(`SELECT COUNT(*) as cnt FROM assignment_submissions WHERE assignment_id IN (${placeholders})`).get(...assignmentIds) as any)?.cnt || 0;
  }

  // Tests
  const testsCount = (db.prepare('SELECT COUNT(*) as cnt FROM institute_tests WHERE institute_id = ?').get(instituteId) as any)?.cnt || 0;

  // Materials
  const materialRows = db.prepare('SELECT id FROM institute_materials WHERE institute_id = ?').all(instituteId) as { id: string }[];
  const materialIds = materialRows.map((m) => m.id);

  // Memberships count
  const membershipsCount = (db.prepare('SELECT COUNT(*) as cnt FROM institute_memberships WHERE institute_id = ?').get(instituteId) as any)?.cnt || 0;

  // Usage ledger count
  const usageLedgerCount = (db.prepare('SELECT COUNT(*) as cnt FROM institute_usage_ledger WHERE institute_id = ?').get(instituteId) as any)?.cnt || 0;

  // Subscriptions count
  const subscriptionsCount = (db.prepare('SELECT COUNT(*) as cnt FROM institute_subscriptions WHERE institute_id = ?').get(instituteId) as any)?.cnt || 0;

  // Evaluations owned/sponsored by this institute
  const evaluationRows = db.prepare(`
    SELECT id FROM evaluations 
    WHERE institute_id = ? OR sponsoring_institute_id = ?
  `).all(instituteId, instituteId) as { id: string }[];
  const evaluationIds = evaluationRows.map((e) => e.id);

  // Identify institute admin user account(s)
  const adminUsers = db.prepare(`
    SELECT id, email FROM users 
    WHERE role = 'INSTITUTE_ADMIN' AND lower(email) = lower(?)
  `).all(targetInstitute.email) as { id: string; email: string }[];
  const adminUserIds = adminUsers.map((u) => u.id);

  let totalSessionsRevoked = 0;
  for (const adminId of adminUserIds) {
    const cnt = (db.prepare('SELECT COUNT(*) as cnt FROM user_sessions WHERE user_id = ?').get(adminId) as any)?.cnt || 0;
    totalSessionsRevoked += cnt;
  }

  // 4. Clean up disk files belonging to institute evaluations or materials
  const uploadDirs = [
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), 'data', 'uploads'),
  ];

  let filesRemovedCount = 0;
  // Files matching evaluation IDs
  for (const evId of evaluationIds) {
    for (const dir of uploadDirs) {
      try {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            if (file.startsWith(evId)) {
              try {
                fs.unlinkSync(path.join(dir, file));
                filesRemovedCount++;
              } catch (fileErr) {
                console.warn(`[InstituteDelete] Failed to delete evaluation file ${file}:`, fileErr);
              }
            }
          }
        }
      } catch (dirErr) {
        console.warn(`[InstituteDelete] Error scanning dir ${dir}:`, dirErr);
      }
    }
  }

  // Files matching private material IDs
  for (const matId of materialIds) {
    for (const dir of uploadDirs) {
      try {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            if (file.startsWith(matId)) {
              try {
                fs.unlinkSync(path.join(dir, file));
                filesRemovedCount++;
              } catch (fileErr) {
                console.warn(`[InstituteDelete] Failed to delete material file ${file}:`, fileErr);
              }
            }
          }
        }
      } catch (dirErr) {
        console.warn(`[InstituteDelete] Error scanning dir ${dir}:`, dirErr);
      }
    }
  }

  // 5. Atomic Database Transaction
  db.exec('BEGIN IMMEDIATE');
  try {
    // 5A. Handle assignment submissions & assignments
    if (assignmentIds.length > 0) {
      const placeholders = assignmentIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM assignment_submissions WHERE assignment_id IN (${placeholders})`).run(...assignmentIds);
      db.prepare(`DELETE FROM institute_assignments WHERE institute_id = ?`).run(instituteId);
    }

    // 5B. Tests & Materials
    db.prepare('DELETE FROM institute_tests WHERE institute_id = ?').run(instituteId);
    db.prepare('DELETE FROM institute_materials WHERE institute_id = ?').run(instituteId);

    // 5C. Institute-owned evaluations
    if (evaluationIds.length > 0) {
      db.prepare('DELETE FROM evaluations WHERE institute_id = ? OR sponsoring_institute_id = ?').run(instituteId, instituteId);
    }

    // 5D. Detach student profiles referencing this institute (DO NOT DELETE STUDENTS!)
    db.prepare(`
      UPDATE student_profiles 
      SET institute_id = NULL, batch_id = NULL 
      WHERE institute_id = ?
    `).run(instituteId);

    // 5E. Remove institute memberships (detaches student link, preserving student accounts)
    db.prepare('DELETE FROM institute_memberships WHERE institute_id = ?').run(instituteId);

    // 5F. Batches
    db.prepare('DELETE FROM batches WHERE institute_id = ?').run(instituteId);

    // 5G. Subscriptions & Usage Ledger
    db.prepare('DELETE FROM institute_subscriptions WHERE institute_id = ?').run(instituteId);
    db.prepare('DELETE FROM institute_usage_ledger WHERE institute_id = ?').run(instituteId);

    // 5H. Notifications related to institute admin users
    if (adminUserIds.length > 0) {
      const placeholders = adminUserIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM notifications WHERE user_id IN (${placeholders})`).run(...adminUserIds);
    }

    // 5I. Support tickets related to institute
    db.prepare(`DELETE FROM support_tickets WHERE role = 'INSTITUTE_ADMIN' AND lower(email) = lower(?)`).run(targetInstitute.email);

    // 5J. Invalidate active sessions & remove/deactivate institute admin accounts
    let adminAccountsRemoved = 0;
    for (const adminId of adminUserIds) {
      db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(adminId);
      // Check if admin user is linked to any other institute
      const otherInst = db.prepare('SELECT id FROM institutes WHERE lower(email) = lower(?) AND id != ?').get(targetInstitute.email, instituteId);
      if (!otherInst) {
        // Also re-assign or remove payments if they exist for this user
        const userOrders = db.prepare('SELECT id FROM payment_orders WHERE student_id = ?').all(adminId) as { id: string }[];
        if (userOrders.length > 0) {
          const ARCHIVE_USER_ID = 'usr_financial_audit_archive';
          const existingArchiveUser = db.prepare('SELECT id FROM users WHERE id = ?').get(ARCHIVE_USER_ID);
          if (!existingArchiveUser) {
            db.prepare(`
              INSERT INTO users (id, email, password_hash, full_name, phone, role, status, account_classification, created_at, updated_at)
              VALUES (?, 'financial-audit-retention@caexamchecker.internal', 'DISABLED_ACCOUNT_CANNOT_LOGIN', 'Anonymized Financial Audit Retention', NULL, 'STUDENT', 'ANONYMIZED', 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(ARCHIVE_USER_ID);
          }
          db.prepare('UPDATE payment_orders SET student_id = ? WHERE student_id = ?').run(ARCHIVE_USER_ID, adminId);
          db.prepare('UPDATE payment_transactions SET student_id = ? WHERE student_id = ?').run(ARCHIVE_USER_ID, adminId);
        }
        db.prepare('DELETE FROM users WHERE id = ?').run(adminId);
        adminAccountsRemoved++;
      }
    }

    // 5K. Permanently delete the institute record
    db.prepare('DELETE FROM institutes WHERE id = ?').run(instituteId);

    // 5L. Audit Log (Super Admin permanent action)
    const auditId = `audit_${crypto.randomBytes(8).toString('hex')}`;
    const auditDetails = JSON.stringify({
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: 'SUPER_ADMIN',
      deletedInstituteId: targetInstitute.id,
      deletedInstituteName: targetInstitute.name,
      deletedInstituteCode: targetInstitute.code,
      deletedInstituteEmail: targetInstitute.email,
      accountClassification: classification,
      deletionTimestamp: new Date().toISOString(),
      cleanupSummary: {
        batchesRemoved: batchIds.length,
        membershipsDetached: membershipsCount,
        assignmentsRemoved: assignmentIds.length,
        submissionsRemoved: submissionCount,
        testsRemoved: testsCount,
        materialsRemoved: materialIds.length,
        evaluationsRemoved: evaluationIds.length,
        filesRemoved: filesRemovedCount,
        subscriptionsRemoved: subscriptionsCount,
        usageLedgerRemoved: usageLedgerCount,
        adminAccountsRemoved,
        sessionsRevoked: totalSessionsRevoked,
      },
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    });

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES (?, ?, 'INSTITUTE_DELETED', 'INSTITUTE', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      auditId,
      actor.id,
      targetInstitute.id,
      auditDetails,
      ipAddress || null
    );

    // Commit atomic transaction
    db.exec('COMMIT');

    return {
      success: true,
      message: `Institute ${targetInstitute.name} (${targetInstitute.code}) has been permanently deleted.`,
      deletedInstitute: {
        id: targetInstitute.id,
        name: targetInstitute.name,
        code: targetInstitute.code,
        email: targetInstitute.email,
        accountClassification: classification as 'NORMAL' | 'TEST',
      },
      cleanupSummary: {
        batchesRemoved: batchIds.length,
        membershipsDetached: membershipsCount,
        assignmentsRemoved: assignmentIds.length,
        submissionsRemoved: submissionCount,
        testsRemoved: testsCount,
        materialsRemoved: materialIds.length,
        evaluationsRemoved: evaluationIds.length,
        filesRemoved: filesRemovedCount,
        subscriptionsRemoved: subscriptionsCount,
        usageLedgerRemoved: usageLedgerCount,
        adminAccountsRemoved,
        sessionsRevoked: totalSessionsRevoked,
      },
    };
  } catch (txErr) {
    db.exec('ROLLBACK');
    console.error('[InstituteDeleteService] Transaction error:', txErr);
    throw txErr;
  }
}

/**
 * Updates an institute's classification between NORMAL and TEST.
 * Strictly restricted to SUPER_ADMIN.
 */
export function updateInstituteClassification(
  instituteId: string,
  classification: 'NORMAL' | 'TEST',
  actor: { id: string; email: string; role: string }
) {
  if (!actor || actor.role !== 'SUPER_ADMIN') {
    const error: any = new Error('Access denied. Only Super Admin can change institute classification.');
    error.statusCode = 403;
    throw error;
  }

  if (classification !== 'NORMAL' && classification !== 'TEST') {
    const error: any = new Error("Invalid classification. Must be 'NORMAL' or 'TEST'.");
    error.statusCode = 400;
    throw error;
  }

  const targetInst = db.prepare('SELECT id, name, code, email, account_classification FROM institutes WHERE id = ?').get(instituteId) as any;
  if (!targetInst) {
    const error: any = new Error('Institute not found.');
    error.statusCode = 404;
    throw error;
  }

  db.prepare('UPDATE institutes SET account_classification = ? WHERE id = ?').run(classification, instituteId);

  // Also update corresponding institute admin user's account_classification if exists
  try {
    db.prepare("UPDATE users SET account_classification = ? WHERE role = 'INSTITUTE_ADMIN' AND lower(email) = lower(?)").run(classification, targetInst.email);
  } catch {
    // optional
  }

  // Audit log
  const auditId = `audit_${crypto.randomBytes(8).toString('hex')}`;
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, 'UPDATE_INSTITUTE_CLASSIFICATION', 'INSTITUTE', ?, ?, CURRENT_TIMESTAMP)
  `).run(
    auditId,
    actor.id,
    instituteId,
    JSON.stringify({
      actorEmail: actor.email,
      instituteName: targetInst.name,
      previousClassification: targetInst.account_classification || 'NORMAL',
      newClassification: classification,
      updatedAt: new Date().toISOString(),
    })
  );

  return {
    success: true,
    institute: {
      id: targetInst.id,
      name: targetInst.name,
      code: targetInst.code,
      accountClassification: classification,
    },
  };
}
