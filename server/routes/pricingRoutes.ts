import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { optionalAuthenticateToken, authenticateToken, AuthRequest } from '../auth.js';
import { isRazorpayConfigured, getRazorpayKeyId, verifyCheckoutPaymentSignature, fulfillPaymentOrder } from '../razorpay.js';
import { syncStudentCreditsToFirestore } from '../services/studentCreditService.js';

const router = Router();

function getCleanEnv(name: string): string {
  const val = process.env[name] || '';
  return val.trim().replace(/^["']|["']$/g, '');
}

export interface PricingPlanRecord {
  id: string;
  name: string;
  category: 'INSTITUTE' | 'STUDENT';
  billing_period: 'MONTHLY' | 'ANNUAL';
  price_inr: number;
  original_price_inr: number | null;
  evaluation_allowance: number;
  student_capacity: number;
  unlimited_badge: number;
  badge: string | null;
  min_students?: number;
  max_students?: number;
  tier_code?: string;
  is_custom?: number;
  benefits_json: string;
  is_active: number;
  sort_order: number;
}

// 1. Get All Active Pricing Plans (Strictly Database-Driven)
router.get('/plans', (req: Request, res: Response) => {
  try {
    const category = (req.query.category as string)?.toUpperCase();
    let query = `
      SELECT * FROM pricing_plans
      WHERE is_active = 1
    `;
    const params: any[] = [];

    if (category && (category === 'INSTITUTE' || category === 'STUDENT')) {
      query += ` AND category = ? `;
      params.push(category);
    }

    query += ` ORDER BY sort_order ASC`;

    const rawPlans = (db.prepare(query).all(...params) as unknown) as PricingPlanRecord[];

    if (!rawPlans || rawPlans.length === 0) {
      return res.status(500).json({
        error: 'Pricing plans unavailable. Database returned no active plans.',
      });
    }

    const plans = rawPlans.map((p) => {
      let benefits: string[] = [];
      try {
        benefits = JSON.parse(p.benefits_json);
      } catch {
        benefits = [p.benefits_json];
      }

      return {
        id: p.id,
        name: p.name,
        category: p.category || 'INSTITUTE',
        billingPeriod: p.billing_period,
        priceInr: p.price_inr,
        originalPriceInr: p.original_price_inr,
        evaluationAllowance: p.evaluation_allowance,
        isUnlimited: p.unlimited_badge === 1 || p.evaluation_allowance >= 999999,
        studentCapacity: p.student_capacity,
        badge: p.badge,
        minStudents: p.min_students || 0,
        maxStudents: p.max_students || 0,
        tierCode: p.tier_code || null,
        isCustom: p.is_custom === 1,
        benefits,
        sortOrder: p.sort_order,
      };
    });

    return res.json({ plans });
  } catch (error: unknown) {
    console.error('Fetch pricing plans error:', error);
    return res.status(500).json({
      error: 'Failed to retrieve pricing plans from server.',
    });
  }
});

// 2. Create Order for Plan Subscription
router.post('/order', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { planId } = req.body;
    const userId = req.user!.id;

    if (!planId) {
      return res.status(400).json({ error: 'planId is required' });
    }

    if (req.user!.role !== 'STUDENT' && req.user!.role !== 'INSTITUTE_ADMIN') {
      return res.status(403).json({ error: 'This account cannot purchase student or institute plans.' });
    }

    const plan = (db.prepare('SELECT * FROM pricing_plans WHERE id = ? AND is_active = 1').get(planId) as unknown) as PricingPlanRecord | undefined;
    if (!plan) {
      return res.status(404).json({ error: 'Selected pricing plan is not available.' });
    }

    const expectedCategory = req.user!.role === 'STUDENT' ? 'STUDENT' : 'INSTITUTE';
    if (plan.category !== expectedCategory) {
      return res.status(403).json({ error: 'This plan is not available for your account type.' });
    }
    if (!Number.isFinite(plan.price_inr) || plan.price_inr <= 0) {
      return res.status(400).json({ error: 'Free plans are included with eligible signup and cannot be purchased.' });
    }

    const amountPaise = plan.price_inr * 100;
    const internalOrderId = `ord_plan_${crypto.randomBytes(8).toString('hex')}`;
    let razorpayOrderId = '';
    const keyId = getCleanEnv('RAZORPAY_KEY_ID');
    const keySecret = getCleanEnv('RAZORPAY_KEY_SECRET');

    if (isRazorpayConfigured()) {
      const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency: 'INR',
          receipt: internalOrderId,
          notes: {
            userId,
            planId: plan.id,
            planName: plan.name,
            billingPeriod: plan.billing_period,
            purpose: `Plan Subscription: ${plan.name}`,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Razorpay Order creation failed: ${errText.slice(0, 150)}`);
      }

      const orderData = (await response.json()) as { id: string };
      razorpayOrderId = orderData.id;
    } else {
      razorpayOrderId = `order_${crypto.randomBytes(10).toString('hex')}`;
    }

    // Persist order in payment_orders
    db.prepare(`
      INSERT INTO payment_orders (id, student_id, razorpay_order_id, quantity, amount_paise, currency, status)
      VALUES (?, ?, ?, ?, ?, 'INR', 'PENDING')
    `).run(internalOrderId, userId, razorpayOrderId, plan.evaluation_allowance, amountPaise);

    return res.json({
      orderId: internalOrderId,
      razorpayOrderId,
      amountPaise,
      currency: 'INR',
      keyId,
      isConfigured: isRazorpayConfigured(),
      planId: plan.id,
      planName: plan.name,
    });
  } catch (error: unknown) {
    console.error('Create plan order error:', error);
    return res.status(500).json({ error: 'Failed to initiate payment for plan.' });
  }
});

// 3. Verify Payment and Activate Plan
router.post('/verify', authenticateToken, async (req: AuthRequest, res: Response) => {
  let transactionOpen = false;
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, planId } = req.body || {};
    const userId = req.user!.id;
    const role = req.user!.role;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !planId) {
      return res.status(400).json({ error: 'Missing required payment verification parameters.' });
    }
    if (role !== 'STUDENT' && role !== 'INSTITUTE_ADMIN') {
      return res.status(403).json({ error: 'This account cannot activate student or institute plans.' });
    }
    if (!isRazorpayConfigured()) {
      return res.status(503).json({
        error: 'Razorpay verification is unavailable because the gateway is not configured. No plan or credits were activated.',
        code: 'RAZORPAY_NOT_CONFIGURED',
      });
    }

    const plan = db.prepare(
      'SELECT * FROM pricing_plans WHERE id = ?'
    ).get(planId) as PricingPlanRecord | undefined;
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });

    const expectedCategory = role === 'STUDENT' ? 'STUDENT' : 'INSTITUTE';
    if (plan.category !== expectedCategory) {
      return res.status(403).json({ error: 'This plan is not available for your account type.' });
    }
    if (!Number.isFinite(plan.price_inr) || plan.price_inr <= 0) {
      return res.status(400).json({ error: 'A paid plan is required for payment verification.' });
    }

    const order = db.prepare(`
      SELECT id, student_id, quantity, amount_paise, currency, status
      FROM payment_orders
      WHERE razorpay_order_id = ? AND student_id = ?
      LIMIT 1
    `).get(razorpayOrderId, userId) as {
      id: string;
      student_id: string;
      quantity: number;
      amount_paise: number;
      currency: string;
      status: string;
    } | undefined;

    if (!order) {
      return res.status(404).json({ error: 'Payment order not found for this account.' });
    }
    if (order.quantity !== plan.evaluation_allowance || order.amount_paise !== plan.price_inr * 100 || order.currency.toUpperCase() !== 'INR') {
      return res.status(400).json({ error: 'Payment order does not match the selected plan amount and allowance.' });
    }

    const validSignature = verifyCheckoutPaymentSignature({
      razorpayOrderId: String(razorpayOrderId),
      razorpayPaymentId: String(razorpayPaymentId),
      razorpaySignature: String(razorpaySignature),
    });
    if (!validSignature) {
      if (order.status !== 'SUCCESS') {
        db.prepare("UPDATE payment_orders SET status = 'FAILED' WHERE id = ? AND status = 'PENDING'").run(order.id);
      }
      return res.status(400).json({ error: 'Payment signature verification failed. Untrusted payment.' });
    }

    // The shared student fulfillment engine is transactional and idempotent. A
    // retried browser callback cannot grant a second credit lot.
    if (role === 'STUDENT') {
      const fulfillment = fulfillPaymentOrder({
        razorpayOrderId: String(razorpayOrderId),
        razorpayPaymentId: String(razorpayPaymentId),
        studentId: userId,
        signatureRecord: String(razorpaySignature),
        source: 'CHECKOUT',
        paymentAmountPaise: order.amount_paise,
        paymentCurrency: order.currency,
      });
      await syncStudentCreditsToFirestore(userId);

      const lot = db.prepare(`
        SELECT expires_at FROM student_credit_purchases
        WHERE user_id = ? AND payment_id = ?
        ORDER BY datetime(created_at) DESC LIMIT 1
      `).get(userId, razorpayPaymentId) as { expires_at?: string } | undefined;

      return res.json({
        success: true,
        alreadyFulfilled: fulfillment.alreadyFulfilled,
        creditsAdded: fulfillment.creditsAdded,
        message: fulfillment.alreadyFulfilled
          ? 'This plan payment was already verified. No duplicate credits were added.'
          : `Successfully purchased ${plan.name}; ${fulfillment.creditsAdded} evaluation credits were added.`,
        plan: plan.name,
        expiresAt: lot?.expires_at || null,
      });
    }

    // Institute purchases use their own subscription records, but they still
    // require a user-owned order and an atomic/idempotent transaction.
    const institute = db.prepare(
      'SELECT id FROM institutes WHERE email = ? LIMIT 1'
    ).get(req.user!.email) as { id: string } | undefined;
    if (!institute) {
      return res.status(404).json({ error: 'No institute is linked to this administrator account.' });
    }

    db.exec('BEGIN IMMEDIATE');
    transactionOpen = true;
    const currentOrder = db.prepare(
      'SELECT status FROM payment_orders WHERE id = ? AND student_id = ?'
    ).get(order.id, userId) as { status: string } | undefined;
    const existingPayment = db.prepare(`
      SELECT id, order_id, student_id, razorpay_payment_id
      FROM payment_transactions
      WHERE razorpay_payment_id = ? OR idempotency_key = ?
      LIMIT 1
    `).get(razorpayPaymentId, `tx_${razorpayPaymentId}`) as {
      id: string; order_id: string; student_id: string; razorpay_payment_id: string;
    } | undefined;

    if (currentOrder?.status === 'SUCCESS' || existingPayment) {
      db.exec('ROLLBACK');
      transactionOpen = false;
      if (currentOrder?.status === 'SUCCESS' && existingPayment?.order_id === razorpayOrderId &&
          existingPayment?.student_id === userId && existingPayment?.razorpay_payment_id === razorpayPaymentId) {
        return res.json({ success: true, alreadyFulfilled: true, message: 'This plan payment was already verified.', plan: plan.name });
      }
      return res.status(409).json({ error: 'This payment or order has already been processed.' });
    }
    if (!currentOrder || currentOrder.status !== 'PENDING') {
      db.exec('ROLLBACK');
      transactionOpen = false;
      return res.status(409).json({ error: 'This payment order is no longer pending.' });
    }

    const days = plan.billing_period === 'ANNUAL' ? 365 : 30;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      UPDATE institutes
      SET status = 'ACTIVE', subscription_plan = ?, max_students = ?, subscription_expires_at = ?
      WHERE id = ?
    `).run(plan.id, plan.student_capacity, expiresAt, institute.id);

    const subId = `sub_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO institute_subscriptions (
        id, institute_id, plan_id, billing_cycle, price_inr, student_capacity,
        evaluation_allowance, evaluations_used, evaluations_remaining, payment_order_ref,
        payment_id, start_date, expiry_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, CURRENT_TIMESTAMP, ?, 'ACTIVE')
    `).run(
      subId, institute.id, plan.id, plan.billing_period, plan.price_inr, plan.student_capacity,
      plan.evaluation_allowance, plan.evaluation_allowance, razorpayOrderId, razorpayPaymentId, expiresAt
    );

    const txId = `txn_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO payment_transactions (id, order_id, student_id, razorpay_payment_id, razorpay_signature, amount_paise, status, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?, 'SUCCESS', ?)
    `).run(txId, order.id, userId, razorpayPaymentId, razorpaySignature, order.amount_paise, `tx_${razorpayPaymentId}`);
    db.prepare("UPDATE payment_orders SET status = 'SUCCESS' WHERE id = ? AND status = 'PENDING'").run(order.id);
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type)
      VALUES (?, ?, 'Subscription Activated', ?, 'CREDIT')
    `).run(
      `notif_${crypto.randomBytes(8).toString('hex')}`,
      userId,
      `Your subscription to ${plan.name} has been successfully activated.`
    );
    db.exec('COMMIT');
    transactionOpen = false;

    return res.json({ success: true, alreadyFulfilled: false, message: `Successfully subscribed to ${plan.name}`, plan: plan.name, expiresAt });
  } catch (error: unknown) {
    if (transactionOpen) {
      try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    }
    console.error('Verify plan payment error:', error);
    const message = error instanceof Error ? error.message : 'Failed to verify plan payment.';
    return res.status(500).json({ error: message });
  }
});

export default router;
