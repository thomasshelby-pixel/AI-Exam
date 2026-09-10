import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { deleteStudentAccount } from './studentDeleteService.js';
import { deleteInstituteAccount } from './instituteDeleteService.js';

export interface TestCleanupPreview {
  summary: {
    totalTestItems: number;
    studentsCount: number;
    institutesCount: number;
    ordersCount: number;
    transactionsCount: number;
    evaluationsCount: number;
    promoRedemptionsCount: number;
    creditEntriesCount: number;
    filesCount: number;
  };
  details: {
    students: Array<{ id: string; name: string; email: string; createdAt: string }>;
    institutes: Array<{ id: string; name: string; code: string; email: string; createdAt: string }>;
    orders: Array<{ id: string; studentName: string; studentEmail: string; amountPaise: number; status: string; createdAt: string }>;
    transactions: Array<{ id: string; orderId: string; amountPaise: number; status: string; razorpayPaymentId: string | null; createdAt: string }>;
    evaluations: Array<{ id: string; studentName: string; subject: string; level: string; status: string; createdAt: string }>;
    promoRedemptions: Array<{ id: string; referralCode: string; userEmail: string; redeemedAt: string }>;
  };
}

/**
 * Scans the database and file system for all explicitly marked TEST records and assets.
 */
export function getTestCleanupPreview(): TestCleanupPreview {
  // 1. Test Students
  const students = db.prepare(`
    SELECT id, full_name as name, email, created_at as createdAt
    FROM users
    WHERE role = 'STUDENT' AND account_classification = 'TEST'
    ORDER BY created_at DESC
  `).all() as any[];

  // 2. Test Institutes
  const institutes = db.prepare(`
    SELECT id, name, code, email, created_at as createdAt
    FROM institutes
    WHERE account_classification = 'TEST'
    ORDER BY created_at DESC
  `).all() as any[];

  // 3. Test Orders
  const orders = db.prepare(`
    SELECT o.id, COALESCE(u.full_name, 'Test User') as studentName, COALESCE(u.email, 'test@internal') as studentEmail,
           o.amount_paise as amountPaise, o.status, o.created_at as createdAt
    FROM payment_orders o
    LEFT JOIN users u ON u.id = o.student_id
    WHERE o.account_classification = 'TEST' 
       OR o.student_id IN (SELECT id FROM users WHERE account_classification = 'TEST')
    ORDER BY o.created_at DESC
  `).all() as any[];

  // 4. Test Transactions
  const transactions = db.prepare(`
    SELECT t.id, t.order_id as orderId, t.amount_paise as amountPaise, t.status,
           t.razorpay_payment_id as razorpayPaymentId, t.created_at as createdAt
    FROM payment_transactions t
    WHERE t.account_classification = 'TEST'
       OR t.student_id IN (SELECT id FROM users WHERE account_classification = 'TEST')
    ORDER BY t.created_at DESC
  `).all() as any[];

  // 5. Test Evaluations
  const evaluations = db.prepare(`
    SELECT e.id, COALESCE(u.full_name, 'Test Student') as studentName, e.subject_name as subject,
           e.level, e.status, e.created_at as createdAt
    FROM evaluations e
    LEFT JOIN users u ON u.id = e.student_id
    WHERE e.account_classification = 'TEST'
       OR e.student_id IN (SELECT id FROM users WHERE account_classification = 'TEST')
       OR e.institute_id IN (SELECT id FROM institutes WHERE account_classification = 'TEST')
    ORDER BY e.created_at DESC
  `).all() as any[];

  // 6. Test Promo Redemptions
  const promoRedemptions = db.prepare(`
    SELECT r.id, r.referral_code as referralCode, u.email as userEmail, COALESCE(r.redeemed_at, 'Recently') as redeemedAt
    FROM referral_redemptions r
    JOIN users u ON u.id = r.user_id
    WHERE u.account_classification = 'TEST'
    ORDER BY r.redeemed_at DESC
  `).all() as any[];

  // 7. Test Credit Ledger Entries count
  const creditEntriesCount = (db.prepare(`
    SELECT COUNT(*) as cnt
    FROM credit_ledger l
    JOIN users u ON u.id = l.student_id
    WHERE u.account_classification = 'TEST'
  `).get() as any)?.cnt || 0;

  // 8. Estimate Test Files on disk
  const uploadDirs = [
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), 'data', 'uploads'),
  ];
  let filesCount = 0;
  const evalIds = new Set(evaluations.map((e) => e.id));
  if (evalIds.size > 0) {
    for (const dir of uploadDirs) {
      try {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            for (const evId of evalIds) {
              if (file.startsWith(evId)) {
                filesCount++;
                break;
              }
            }
          }
        }
      } catch {
        // ignore scan errors
      }
    }
  }

  const totalTestItems =
    students.length +
    institutes.length +
    orders.length +
    transactions.length +
    evaluations.length +
    promoRedemptions.length +
    creditEntriesCount +
    filesCount;

  return {
    summary: {
      totalTestItems,
      studentsCount: students.length,
      institutesCount: institutes.length,
      ordersCount: orders.length,
      transactionsCount: transactions.length,
      evaluationsCount: evaluations.length,
      promoRedemptionsCount: promoRedemptions.length,
      creditEntriesCount,
      filesCount,
    },
    details: {
      students,
      institutes,
      orders,
      transactions,
      evaluations,
      promoRedemptions,
    },
  };
}

/**
 * Deletes an individual test record from the system.
 */
export function deleteSingleTestRecord(
  category: 'STUDENTS' | 'INSTITUTES' | 'ORDERS' | 'PAYMENTS' | 'EVALUATIONS' | 'PROMO_REDEMPTIONS',
  id: string,
  actor: { id: string; email: string; role: string },
  ipAddress?: string | null,
  userAgent?: string | null
) {
  if (!actor || actor.role !== 'SUPER_ADMIN') {
    const error: any = new Error('Access denied. Only Super Admin has permission to execute test data cleanup.');
    error.statusCode = 403;
    throw error;
  }

  switch (category) {
    case 'STUDENTS': {
      return deleteStudentAccount(id, actor, ipAddress, userAgent);
    }
    case 'INSTITUTES': {
      return deleteInstituteAccount(id, actor, ipAddress, userAgent);
    }
    case 'ORDERS': {
      const order = db.prepare('SELECT * FROM payment_orders WHERE id = ?').get(id) as any;
      if (!order) {
        const error: any = new Error('Order not found or already deleted.');
        error.statusCode = 404;
        throw error;
      }

      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('DELETE FROM payment_transactions WHERE order_id = ?').run(id);
        db.prepare('DELETE FROM payment_orders WHERE id = ?').run(id);

        const auditId = `audit_${crypto.randomBytes(8).toString('hex')}`;
        db.prepare(`
          INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
          VALUES (?, ?, 'TEST_ORDER_DELETED', 'PAYMENT_ORDER', ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
          auditId,
          actor.id,
          id,
          JSON.stringify({
            actorEmail: actor.email,
            orderId: id,
            amountPaise: order.amount_paise,
            status: order.status,
            deletedAt: new Date().toISOString(),
          }),
          ipAddress || null
        );

        db.exec('COMMIT');
        return { success: true, message: `Test order ${id} deleted successfully.` };
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
    case 'PAYMENTS': {
      const tx = db.prepare('SELECT * FROM payment_transactions WHERE id = ?').get(id) as any;
      if (!tx) {
        const error: any = new Error('Payment transaction not found or already deleted.');
        error.statusCode = 404;
        throw error;
      }

      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('DELETE FROM payment_transactions WHERE id = ?').run(id);

        const auditId = `audit_${crypto.randomBytes(8).toString('hex')}`;
        db.prepare(`
          INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
          VALUES (?, ?, 'TEST_PAYMENT_DELETED', 'PAYMENT_TRANSACTION', ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
          auditId,
          actor.id,
          id,
          JSON.stringify({
            actorEmail: actor.email,
            transactionId: id,
            orderId: tx.order_id,
            amountPaise: tx.amount_paise,
            deletedAt: new Date().toISOString(),
          }),
          ipAddress || null
        );

        db.exec('COMMIT');
        return { success: true, message: `Test payment transaction ${id} deleted successfully.` };
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
    case 'EVALUATIONS': {
      const evaluation = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(id) as any;
      if (!evaluation) {
        const error: any = new Error('Evaluation not found or already deleted.');
        error.statusCode = 404;
        throw error;
      }

      // Delete files on disk
      const uploadDirs = [
        path.join(process.cwd(), 'uploads'),
        path.join(process.cwd(), 'data', 'uploads'),
      ];
      for (const dir of uploadDirs) {
        try {
          if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            for (const file of files) {
              if (file.startsWith(id)) {
                try {
                  fs.unlinkSync(path.join(dir, file));
                } catch {
                  // ignore
                }
              }
            }
          }
        } catch {
          // ignore
        }
      }

      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('DELETE FROM evaluations WHERE id = ?').run(id);

        const auditId = `audit_${crypto.randomBytes(8).toString('hex')}`;
        db.prepare(`
          INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
          VALUES (?, ?, 'TEST_EVALUATION_DELETED', 'EVALUATION', ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
          auditId,
          actor.id,
          id,
          JSON.stringify({
            actorEmail: actor.email,
            evaluationId: id,
            subject: evaluation.subject_name,
            level: evaluation.level,
            deletedAt: new Date().toISOString(),
          }),
          ipAddress || null
        );

        db.exec('COMMIT');
        return { success: true, message: `Test evaluation ${id} deleted successfully.` };
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
    case 'PROMO_REDEMPTIONS': {
      const redemption = db.prepare('SELECT * FROM referral_redemptions WHERE id = ?').get(id) as any;
      if (!redemption) {
        const error: any = new Error('Promo redemption record not found or already deleted.');
        error.statusCode = 404;
        throw error;
      }

      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('DELETE FROM referral_redemptions WHERE id = ?').run(id);

        // Recalculate campaign status if needed
        const campaign = db.prepare('SELECT * FROM referral_campaigns WHERE UPPER(code) = UPPER(?)').get(redemption.referral_code) as any;
        if (campaign) {
          const countRow = db.prepare(`
            SELECT COUNT(*) as total
            FROM referral_redemptions r
            JOIN users u ON u.id = r.user_id
            WHERE UPPER(r.referral_code) = UPPER(?)
              AND (u.account_classification IS NULL OR u.account_classification != 'TEST')
          `).get(redemption.referral_code) as { total: number };
          const activeGenuine = countRow?.total || 0;
          if (activeGenuine < (campaign.max_redemptions || 20) && campaign.status === 'EXHAUSTED') {
            db.prepare("UPDATE referral_campaigns SET status = 'ACTIVE' WHERE id = ?").run(campaign.id);
          }
        }

        const auditId = `audit_${crypto.randomBytes(8).toString('hex')}`;
        db.prepare(`
          INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
          VALUES (?, ?, 'TEST_PROMO_REDEMPTION_DELETED', 'REFERRAL_REDEMPTION', ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
          auditId,
          actor.id,
          id,
          JSON.stringify({
            actorEmail: actor.email,
            referralCode: redemption.referral_code,
            deletedAt: new Date().toISOString(),
          }),
          ipAddress || null
        );

        db.exec('COMMIT');
        return { success: true, message: `Test promo redemption ${id} deleted successfully.` };
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
    default: {
      const error: any = new Error(`Unsupported category: ${category}`);
      error.statusCode = 400;
      throw error;
    }
  }
}

/**
 * Bulk deletes all records in a single TEST category.
 */
export function bulkDeleteTestCategory(
  category: 'STUDENTS' | 'INSTITUTES' | 'ORDERS' | 'PAYMENTS' | 'EVALUATIONS' | 'PROMO_REDEMPTIONS',
  actor: { id: string; email: string; role: string },
  ipAddress?: string | null,
  userAgent?: string | null
) {
  if (!actor || actor.role !== 'SUPER_ADMIN') {
    const error: any = new Error('Access denied. Only Super Admin has permission to execute bulk test cleanup.');
    error.statusCode = 403;
    throw error;
  }

  switch (category) {
    case 'STUDENTS': {
      const testStudents = db.prepare(`
        SELECT id FROM users WHERE role = 'STUDENT' AND account_classification = 'TEST'
      `).all() as { id: string }[];

      let count = 0;
      for (const s of testStudents) {
        try {
          deleteStudentAccount(s.id, actor, ipAddress, userAgent);
          count++;
        } catch (err) {
          console.error(`[BulkTestCleanup] Failed to delete test student ${s.id}:`, err);
        }
      }
      return { success: true, message: `Deleted ${count} test student accounts.`, count };
    }
    case 'INSTITUTES': {
      const testInstitutes = db.prepare(`
        SELECT id FROM institutes WHERE account_classification = 'TEST'
      `).all() as { id: string }[];

      let count = 0;
      for (const inst of testInstitutes) {
        try {
          deleteInstituteAccount(inst.id, actor, ipAddress, userAgent);
          count++;
        } catch (err) {
          console.error(`[BulkTestCleanup] Failed to delete test institute ${inst.id}:`, err);
        }
      }
      return { success: true, message: `Deleted ${count} test institutes.`, count };
    }
    case 'ORDERS': {
      db.exec('BEGIN IMMEDIATE');
      try {
        const testOrderIds = (db.prepare(`
          SELECT id FROM payment_orders 
          WHERE account_classification = 'TEST' 
             OR student_id IN (SELECT id FROM users WHERE account_classification = 'TEST')
        `).all() as { id: string }[]).map((o) => o.id);

        if (testOrderIds.length > 0) {
          const placeholders = testOrderIds.map(() => '?').join(',');
          db.prepare(`DELETE FROM payment_transactions WHERE order_id IN (${placeholders})`).run(...testOrderIds);
          db.prepare(`DELETE FROM payment_orders WHERE id IN (${placeholders})`).run(...testOrderIds);
        }

        const auditId = `audit_${crypto.randomBytes(8).toString('hex')}`;
        db.prepare(`
          INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
          VALUES (?, ?, 'BULK_TEST_ORDERS_DELETED', 'PAYMENT_ORDER', 'BULK', ?, ?, CURRENT_TIMESTAMP)
        `).run(
          auditId,
          actor.id,
          JSON.stringify({ actorEmail: actor.email, ordersDeleted: testOrderIds.length, timestamp: new Date().toISOString() }),
          ipAddress || null
        );

        db.exec('COMMIT');
        return { success: true, message: `Deleted ${testOrderIds.length} test payment orders and transactions.`, count: testOrderIds.length };
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
    case 'PAYMENTS': {
      db.exec('BEGIN IMMEDIATE');
      try {
        const testTxIds = (db.prepare(`
          SELECT id FROM payment_transactions 
          WHERE account_classification = 'TEST'
             OR student_id IN (SELECT id FROM users WHERE account_classification = 'TEST')
        `).all() as { id: string }[]).map((t) => t.id);

        if (testTxIds.length > 0) {
          const placeholders = testTxIds.map(() => '?').join(',');
          db.prepare(`DELETE FROM payment_transactions WHERE id IN (${placeholders})`).run(...testTxIds);
        }

        const auditId = `audit_${crypto.randomBytes(8).toString('hex')}`;
        db.prepare(`
          INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
          VALUES (?, ?, 'BULK_TEST_PAYMENTS_DELETED', 'PAYMENT_TRANSACTION', 'BULK', ?, ?, CURRENT_TIMESTAMP)
        `).run(
          auditId,
          actor.id,
          JSON.stringify({ actorEmail: actor.email, transactionsDeleted: testTxIds.length, timestamp: new Date().toISOString() }),
          ipAddress || null
        );

        db.exec('COMMIT');
        return { success: true, message: `Deleted ${testTxIds.length} test payment transactions.`, count: testTxIds.length };
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
    case 'EVALUATIONS': {
      const testEvalIds = (db.prepare(`
        SELECT id FROM evaluations
        WHERE account_classification = 'TEST'
           OR student_id IN (SELECT id FROM users WHERE account_classification = 'TEST')
           OR institute_id IN (SELECT id FROM institutes WHERE account_classification = 'TEST')
      `).all() as { id: string }[]).map((e) => e.id);

      // Clean files on disk
      const uploadDirs = [
        path.join(process.cwd(), 'uploads'),
        path.join(process.cwd(), 'data', 'uploads'),
      ];
      for (const evId of testEvalIds) {
        for (const dir of uploadDirs) {
          try {
            if (fs.existsSync(dir)) {
              const files = fs.readdirSync(dir);
              for (const file of files) {
                if (file.startsWith(evId)) {
                  try {
                    fs.unlinkSync(path.join(dir, file));
                  } catch {
                    // ignore
                  }
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }

      db.exec('BEGIN IMMEDIATE');
      try {
        if (testEvalIds.length > 0) {
          const placeholders = testEvalIds.map(() => '?').join(',');
          db.prepare(`DELETE FROM evaluations WHERE id IN (${placeholders})`).run(...testEvalIds);
        }

        const auditId = `audit_${crypto.randomBytes(8).toString('hex')}`;
        db.prepare(`
          INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
          VALUES (?, ?, 'BULK_TEST_EVALUATIONS_DELETED', 'EVALUATION', 'BULK', ?, ?, CURRENT_TIMESTAMP)
        `).run(
          auditId,
          actor.id,
          JSON.stringify({ actorEmail: actor.email, evaluationsDeleted: testEvalIds.length, timestamp: new Date().toISOString() }),
          ipAddress || null
        );

        db.exec('COMMIT');
        return { success: true, message: `Deleted ${testEvalIds.length} test evaluations.`, count: testEvalIds.length };
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
    case 'PROMO_REDEMPTIONS': {
      db.exec('BEGIN IMMEDIATE');
      try {
        const testRedemptionIds = (db.prepare(`
          SELECT r.id, r.referral_code FROM referral_redemptions r
          JOIN users u ON u.id = r.user_id
          WHERE u.account_classification = 'TEST'
        `).all() as { id: string; referral_code: string }[]);

        if (testRedemptionIds.length > 0) {
          const placeholders = testRedemptionIds.map(() => '?').join(',');
          const ids = testRedemptionIds.map((r) => r.id);
          db.prepare(`DELETE FROM referral_redemptions WHERE id IN (${placeholders})`).run(...ids);

          // Restore campaign statuses if needed
          const codes = [...new Set(testRedemptionIds.map((r) => r.referral_code))];
          for (const code of codes) {
            const campaign = db.prepare('SELECT * FROM referral_campaigns WHERE UPPER(code) = UPPER(?)').get(code) as any;
            if (campaign && campaign.status === 'EXHAUSTED') {
              const activeCount = (db.prepare(`
                SELECT COUNT(*) as cnt FROM referral_redemptions r
                JOIN users u ON u.id = r.user_id
                WHERE UPPER(r.referral_code) = UPPER(?) AND (u.account_classification IS NULL OR u.account_classification != 'TEST')
              `).get(code) as any)?.cnt || 0;
              if (activeCount < (campaign.max_redemptions || 20)) {
                db.prepare("UPDATE referral_campaigns SET status = 'ACTIVE' WHERE id = ?").run(campaign.id);
              }
            }
          }
        }

        const auditId = `audit_${crypto.randomBytes(8).toString('hex')}`;
        db.prepare(`
          INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
          VALUES (?, ?, 'BULK_TEST_PROMO_REDEMPTIONS_DELETED', 'REFERRAL_REDEMPTION', 'BULK', ?, ?, CURRENT_TIMESTAMP)
        `).run(
          auditId,
          actor.id,
          JSON.stringify({ actorEmail: actor.email, redemptionsDeleted: testRedemptionIds.length, timestamp: new Date().toISOString() }),
          ipAddress || null
        );

        db.exec('COMMIT');
        return { success: true, message: `Deleted ${testRedemptionIds.length} test promo redemptions.`, count: testRedemptionIds.length };
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
    default: {
      const error: any = new Error(`Unsupported category: ${category}`);
      error.statusCode = 400;
      throw error;
    }
  }
}

/**
 * Executes a full system test-data wipe across all TEST entities.
 * Strictly guarantees that NORMAL/production records are untouched.
 */
export function bulkDeleteAllTestData(
  actor: { id: string; email: string; role: string },
  ipAddress?: string | null,
  userAgent?: string | null
) {
  if (!actor || actor.role !== 'SUPER_ADMIN') {
    const error: any = new Error('Access denied. Only Super Admin has permission to execute full test data cleanup.');
    error.statusCode = 403;
    throw error;
  }

  // 1. Delete all test institutes first
  const institutesRes = bulkDeleteTestCategory('INSTITUTES', actor, ipAddress, userAgent);

  // 2. Delete all test students
  const studentsRes = bulkDeleteTestCategory('STUDENTS', actor, ipAddress, userAgent);

  // 3. Delete all orphaned test evaluations
  const evaluationsRes = bulkDeleteTestCategory('EVALUATIONS', actor, ipAddress, userAgent);

  // 4. Delete all test orders and transactions
  const ordersRes = bulkDeleteTestCategory('ORDERS', actor, ipAddress, userAgent);

  // 5. Delete all test promo redemptions
  const promoRes = bulkDeleteTestCategory('PROMO_REDEMPTIONS', actor, ipAddress, userAgent);

  const totalCleaned =
    (institutesRes.count || 0) +
    (studentsRes.count || 0) +
    (evaluationsRes.count || 0) +
    (ordersRes.count || 0) +
    (promoRes.count || 0);

  // Audit log
  const auditId = `audit_${crypto.randomBytes(8).toString('hex')}`;
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
    VALUES (?, ?, 'DELETE_ALL_TEST_DATA', 'SYSTEM', 'TEST_DATA_CLEANUP', ?, ?, CURRENT_TIMESTAMP)
  `).run(
    auditId,
    actor.id,
    JSON.stringify({
      actorEmail: actor.email,
      actorRole: 'SUPER_ADMIN',
      summary: {
        institutesDeleted: institutesRes.count || 0,
        studentsDeleted: studentsRes.count || 0,
        evaluationsDeleted: evaluationsRes.count || 0,
        ordersDeleted: ordersRes.count || 0,
        promoRedemptionsDeleted: promoRes.count || 0,
        totalEntitiesCleaned: totalCleaned,
      },
      completedAt: new Date().toISOString(),
    }),
    ipAddress || null
  );

  return {
    success: true,
    message: `All test data successfully purged. Total ${totalCleaned} testing records and associated assets removed.`,
    summary: {
      institutesDeleted: institutesRes.count || 0,
      studentsDeleted: studentsRes.count || 0,
      evaluationsDeleted: evaluationsRes.count || 0,
      ordersDeleted: ordersRes.count || 0,
      promoRedemptionsDeleted: promoRes.count || 0,
      totalCleaned,
    },
  };
}
