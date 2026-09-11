import crypto from 'node:crypto';
import { db } from '../db.js';
import { getValidStudentCreditBalance } from './studentCreditService.js';

export interface DeletePaymentOrderOptions {
  reason?: string;
  notes?: string;
}

export interface DeletePaymentOrderResult {
  success: boolean;
  message: string;
  deletedOrderId: string;
  studentEmail?: string;
  amountPaise: number;
  warnings: string[];
}

export interface BulkDeletePaymentsResult {
  success: boolean;
  message: string;
  deletedCount: number;
  deletedOrderIds: string[];
  failedOrderIds: string[];
  warnings: string[];
}

export interface PaymentOrderDetails {
  order: any;
  student: {
    id: string;
    fullName: string;
    email: string;
    accountClassification: string;
    currentCreditBalance: number;
  } | null;
  transactions: any[];
  creditLots: any[];
  creditLedger: any[];
  subscription: any | null;
  safetySummary: {
    isTestRecord: boolean;
    hasRazorpayPayment: boolean;
    razorpayWarning: string | null;
    creditStatus: string;
  };
}

/**
 * Retrieves comprehensive details of a payment order for inspection before deletion.
 */
export function getPaymentOrderDetails(
  orderId: string,
  actor: { id: string; email: string; role: string }
): PaymentOrderDetails {
  if (!actor || actor.role !== 'SUPER_ADMIN') {
    const error: any = new Error('Access denied. Only Super Admin has permission to view administrative payment details.');
    error.statusCode = 403;
    throw error;
  }

  const order = db.prepare(`
    SELECT o.*, COALESCE(o.account_classification, 'NORMAL') as account_classification
    FROM payment_orders o
    WHERE o.id = ? OR o.razorpay_order_id = ?
  `).get(orderId, orderId) as any;

  if (!order) {
    const error: any = new Error('Payment order record not found.');
    error.statusCode = 404;
    throw error;
  }

  // Get student details
  const user = db.prepare(`
    SELECT u.id, u.full_name, u.email, COALESCE(u.account_classification, 'NORMAL') as account_classification
    FROM users u
    WHERE u.id = ?
  `).get(order.student_id) as any;

  let currentCreditBalance = 0;
  if (user) {
    currentCreditBalance = getValidStudentCreditBalance(user.id);
  }

  // Get transactions
  const transactions = db.prepare(`
    SELECT t.*, COALESCE(t.account_classification, 'NORMAL') as account_classification
    FROM payment_transactions t
    WHERE t.order_id = ? OR t.order_id = ?
    ORDER BY t.created_at DESC
  `).all(order.id, order.razorpay_order_id || '') as any[];

  // Get credit lots
  const creditLots = db.prepare(`
    SELECT *
    FROM student_credit_purchases
    WHERE order_id = ? OR order_id = ?
  `).all(order.id, order.razorpay_order_id || '') as any[];

  // Get credit ledger
  const creditLedger = db.prepare(`
    SELECT *
    FROM credit_ledger
    WHERE order_id = ? OR order_id = ?
    ORDER BY created_at DESC
  `).all(order.id, order.razorpay_order_id || '') as any[];

  // Get subscription if any
  const subscription = db.prepare(`
    SELECT *
    FROM institute_subscriptions
    WHERE payment_order_ref = ? OR payment_order_ref = ?
  `).get(order.id, order.razorpay_order_id || '') as any;

  const hasRazorpayPayment = transactions.some((t) => t.razorpay_payment_id) || Boolean(order.razorpay_order_id);
  const isTestRecord = order.account_classification === 'TEST' || (user && user.account_classification === 'TEST');

  return {
    order,
    student: user
      ? {
          id: user.id,
          fullName: user.full_name,
          email: user.email,
          accountClassification: user.account_classification,
          currentCreditBalance,
        }
      : null,
    transactions,
    creditLots,
    creditLedger,
    subscription: subscription || null,
    safetySummary: {
      isTestRecord,
      hasRazorpayPayment,
      razorpayWarning: hasRazorpayPayment
        ? 'Note: Deleting this local application record does NOT call Razorpay refund APIs. Any external Razorpay payment is unchanged.'
        : null,
      creditStatus: creditLots.length > 0
        ? `${creditLots.length} credit lot(s) associated with this order.`
        : 'No credit lots issued for this order.',
    },
  };
}

/**
 * Permanently deletes a single payment order and its child transactions safely.
 * Adheres strictly to Credit Safety, Subscription Safety, and Zero-Student-Account-Deletion rules.
 */
export function deletePaymentOrder(
  orderId: string,
  actor: { id: string; email: string; role: string },
  options?: DeletePaymentOrderOptions,
  ipAddress?: string | null,
  userAgent?: string | null
): DeletePaymentOrderResult {
  // 1. Authorization: ONLY SUPER_ADMIN
  if (!actor || actor.role !== 'SUPER_ADMIN') {
    const error: any = new Error('Access denied. Only Super Admin has permission to delete payment records.');
    error.statusCode = 403;
    throw error;
  }

  // 2. Fetch order to verify existence
  const order = db.prepare(`
    SELECT o.*, COALESCE(o.account_classification, 'NORMAL') as account_classification,
           u.full_name as student_name, u.email as student_email,
           COALESCE(u.account_classification, 'NORMAL') as user_classification
    FROM payment_orders o
    LEFT JOIN users u ON u.id = o.student_id
    WHERE o.id = ? OR o.razorpay_order_id = ?
  `).get(orderId, orderId) as any;

  if (!order) {
    const error: any = new Error(`Payment order '${orderId}' not found or already deleted.`);
    error.statusCode = 404;
    throw error;
  }

  const warnings: string[] = [];
  const deletionReason = options?.reason || 'Testing';
  const deletionNotes = options?.notes || '';
  const isTestingContext =
    order.account_classification === 'TEST' ||
    order.user_classification === 'TEST' ||
    ['Testing', 'Incorrect test transaction', 'Development data'].includes(deletionReason);

  // 3. Inspect related transactions
  const transactions = db.prepare(`
    SELECT * FROM payment_transactions WHERE order_id = ? OR order_id = ?
  `).all(order.id, order.razorpay_order_id || '') as any[];

  // 4. Inspect associated credits (Credit Safety - Requirement 6)
  const creditLots = db.prepare(`
    SELECT * FROM student_credit_purchases WHERE order_id = ? OR order_id = ?
  `).all(order.id, order.razorpay_order_id || '') as any[];

  let creditActionSummary = 'NO_CREDITS_ATTACHED';

  // 5. Begin atomic transaction
  db.exec('BEGIN IMMEDIATE');
  try {
    // 5A. Handle credit safety
    if (creditLots.length > 0 && order.student_id) {
      if (isTestingContext) {
        // Test context: safe to reverse credits created by this order
        let totalReversed = 0;
        for (const lot of creditLots) {
          if (lot.credits_remaining > 0) {
            totalReversed += lot.credits_remaining;
          }
          // Remove the credit lot
          db.prepare('DELETE FROM student_credit_purchases WHERE id = ?').run(lot.id);
        }

        // Clean related credit ledger entries for this order
        db.prepare('DELETE FROM credit_ledger WHERE order_id = ? OR order_id = ?').run(
          order.id,
          order.razorpay_order_id || ''
        );

        // Recalculate & sync student's balance safely, ensuring no negative balance
        try {
          const newBalance = getValidStudentCreditBalance(order.student_id);
          creditActionSummary = `REVERSED_${totalReversed}_TEST_CREDITS; NEW_BALANCE_${newBalance}`;
          warnings.push(`Safely reversed ${totalReversed} unused test credit(s) directly issued by this order.`);
        } catch (syncErr) {
          console.warn('[PaymentDeleteService] Error syncing student credit balance:', syncErr);
        }
      } else {
        // Non-test / ambiguous record: DO NOT automatically modify student's balance (Requirement 6)
        // Disassociate the lot references so order deletion won't fail or create orphaned references
        db.prepare(`
          UPDATE student_credit_purchases
          SET order_id = NULL, payment_id = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE order_id = ? OR order_id = ?
        `).run(order.id, order.razorpay_order_id || '');

        db.prepare(`
          UPDATE credit_ledger
          SET note = note || ' [Original Order Deleted by Super Admin]'
          WHERE order_id = ? OR order_id = ?
        `).run(order.id, order.razorpay_order_id || '');

        creditActionSummary = 'PRESERVED_STUDENT_BALANCE_MANUAL_REVIEW_REQUIRED';
        warnings.push('Student credit balance was NOT automatically modified. Explicit Super Admin review required if credit adjustment is needed.');
      }
    }

    // 5B. Handle subscription safety (Requirement 7)
    const subscriptions = db.prepare(`
      SELECT * FROM institute_subscriptions WHERE payment_order_ref = ? OR payment_order_ref = ?
    `).all(order.id, order.razorpay_order_id || '') as any[];

    if (subscriptions.length > 0) {
      for (const sub of subscriptions) {
        if (isTestingContext) {
          db.prepare("UPDATE institute_subscriptions SET status = 'CANCELLED', payment_order_ref = NULL WHERE id = ?").run(sub.id);
          warnings.push(`Associated test subscription '${sub.id}' marked CANCELLED.`);
        } else {
          db.prepare('UPDATE institute_subscriptions SET payment_order_ref = NULL WHERE id = ?').run(sub.id);
          warnings.push(`Preserved active institute subscription '${sub.id}' by detaching deleted payment order reference.`);
        }
      }
    }

    // 5C. Delete child payment transactions first to maintain referential integrity
    if (transactions.length > 0) {
      db.prepare('DELETE FROM payment_transactions WHERE order_id = ? OR order_id = ?').run(
        order.id,
        order.razorpay_order_id || ''
      );
    }

    // 5D. Delete payment order record
    db.prepare('DELETE FROM payment_orders WHERE id = ?').run(order.id);

    // 5E. Insert immutable audit log (Requirement 11)
    const auditId = `audit_${crypto.randomBytes(8).toString('hex')}`;
    const auditDetails = {
      actorEmail: actor.email,
      actorRole: actor.role,
      deletedRecordId: order.id,
      orderId: order.id,
      razorpayOrderId: order.razorpay_order_id,
      studentId: order.student_id,
      studentName: order.student_name,
      studentEmail: order.student_email,
      amountPaise: order.amount_paise,
      amountInr: order.amount_paise / 100,
      quantity: order.quantity,
      status: order.status,
      accountClassification: order.account_classification,
      deletionReason,
      deletionNotes,
      transactionsDeleted: transactions.length,
      creditAction: creditActionSummary,
      razorpayRefundTriggered: false,
      userAgent: userAgent || null,
      deletedAt: new Date().toISOString(),
    };

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES (?, ?, 'PAYMENT_RECORD_DELETED', 'PAYMENT_ORDER', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      auditId,
      actor.id,
      order.id,
      JSON.stringify(auditDetails),
      ipAddress || null
    );

    // Commit atomic transaction
    db.exec('COMMIT');

    if (transactions.some((t) => t.razorpay_payment_id) || order.status === 'SUCCESS' || order.status === 'PAID') {
      warnings.push('Reminder: Deleting this local record does NOT reverse or refund payments through Razorpay.');
    }

    return {
      success: true,
      message: `Payment order ${order.id} permanently deleted.`,
      deletedOrderId: order.id,
      studentEmail: order.student_email,
      amountPaise: order.amount_paise,
      warnings,
    };
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(`[PaymentDeleteService] Error deleting payment order ${orderId}:`, err);
    throw err;
  }
}

/**
 * Bulk deletes multiple selected payment orders.
 */
export function bulkDeletePaymentOrders(
  orderIds: string[],
  actor: { id: string; email: string; role: string },
  options?: DeletePaymentOrderOptions,
  ipAddress?: string | null,
  userAgent?: string | null
): BulkDeletePaymentsResult {
  if (!actor || actor.role !== 'SUPER_ADMIN') {
    const error: any = new Error('Access denied. Only Super Admin has permission to bulk delete payment records.');
    error.statusCode = 403;
    throw error;
  }

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    const error: any = new Error('No payment order IDs provided for bulk deletion.');
    error.statusCode = 400;
    throw error;
  }

  const deletedOrderIds: string[] = [];
  const failedOrderIds: string[] = [];
  const allWarnings: string[] = [];

  for (const id of orderIds) {
    try {
      const result = deletePaymentOrder(id, actor, options, ipAddress, userAgent);
      deletedOrderIds.push(result.deletedOrderId);
      if (result.warnings && result.warnings.length > 0) {
        allWarnings.push(...result.warnings);
      }
    } catch (err: any) {
      console.error(`[BulkDelete] Failed to delete order ${id}:`, err);
      failedOrderIds.push(id);
    }
  }

  // Insert bulk audit log summary
  const auditId = `audit_${crypto.randomBytes(8).toString('hex')}`;
  try {
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES (?, ?, 'BULK_PAYMENT_RECORDS_DELETED', 'PAYMENT_ORDER', 'BULK', ?, ?, CURRENT_TIMESTAMP)
    `).run(
      auditId,
      actor.id,
      JSON.stringify({
        actorEmail: actor.email,
        requestedCount: orderIds.length,
        deletedCount: deletedOrderIds.length,
        failedCount: failedOrderIds.length,
        deletedOrderIds,
        failedOrderIds,
        deletionReason: options?.reason || 'Testing',
        timestamp: new Date().toISOString(),
      }),
      ipAddress || null
    );
  } catch (auditErr) {
    console.warn('[BulkDelete] Failed to write bulk audit summary:', auditErr);
  }

  const uniqueWarnings = Array.from(new Set(allWarnings));

  return {
    success: true,
    message: `Successfully deleted ${deletedOrderIds.length} payment record(s).${failedOrderIds.length > 0 ? ` (${failedOrderIds.length} failed)` : ''}`,
    deletedCount: deletedOrderIds.length,
    deletedOrderIds,
    failedOrderIds,
    warnings: uniqueWarnings,
  };
}

/**
 * Permanently deletes a single payment transaction.
 */
export function deletePaymentTransaction(
  transactionId: string,
  actor: { id: string; email: string; role: string },
  options?: DeletePaymentOrderOptions,
  ipAddress?: string | null,
  userAgent?: string | null
) {
  if (!actor || actor.role !== 'SUPER_ADMIN') {
    const error: any = new Error('Access denied. Only Super Admin has permission to delete payment transactions.');
    error.statusCode = 403;
    throw error;
  }

  const tx = db.prepare('SELECT * FROM payment_transactions WHERE id = ?').get(transactionId) as any;
  if (!tx) {
    const error: any = new Error(`Payment transaction '${transactionId}' not found or already deleted.`);
    error.statusCode = 404;
    throw error;
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM payment_transactions WHERE id = ?').run(transactionId);

    const auditId = `audit_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES (?, ?, 'PAYMENT_RECORD_DELETED', 'PAYMENT_TRANSACTION', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      auditId,
      actor.id,
      transactionId,
      JSON.stringify({
        actorEmail: actor.email,
        deletedRecordId: transactionId,
        transactionId,
        orderId: tx.order_id,
        amountPaise: tx.amount_paise,
        razorpayPaymentId: tx.razorpay_payment_id,
        deletionReason: options?.reason || 'Testing',
        deletionNotes: options?.notes || '',
        deletedAt: new Date().toISOString(),
      }),
      ipAddress || null
    );

    db.exec('COMMIT');
    return {
      success: true,
      message: `Payment transaction ${transactionId} permanently deleted.`,
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
