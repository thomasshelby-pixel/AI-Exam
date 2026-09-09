import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { optionalAuthenticateToken, authenticateToken, AuthRequest } from '../auth.js';
import { isRazorpayConfigured, getRazorpayKeyId } from '../razorpay.js';
import { recordCreditPurchase } from '../services/studentCreditService.js';

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

    const plan = (db.prepare('SELECT * FROM pricing_plans WHERE id = ? AND is_active = 1').get(planId) as unknown) as PricingPlanRecord | undefined;
    if (!plan) {
      return res.status(404).json({ error: 'Selected pricing plan is not available.' });
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
      planId: plan.id,
      planName: plan.name,
    });
  } catch (error: unknown) {
    console.error('Create plan order error:', error);
    return res.status(500).json({ error: 'Failed to initiate payment for plan.' });
  }
});

// 3. Verify Payment and Activate Plan
router.post('/verify', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, planId } = req.body;
    const userId = req.user!.id;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !planId) {
      return res.status(400).json({ error: 'Missing required payment verification parameters.' });
    }

    const plan = (db.prepare('SELECT * FROM pricing_plans WHERE id = ?').get(planId) as unknown) as PricingPlanRecord | undefined;
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found.' });
    }

    const keySecret = getCleanEnv('RAZORPAY_KEY_SECRET');
    if (isRazorpayConfigured()) {
      const generatedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

      if (generatedSignature !== razorpaySignature) {
        return res.status(400).json({ error: 'Payment signature verification failed. Untrusted payment.' });
      }
    }

    // Days to add: 30 for MONTHLY, 365 for ANNUAL
    const days = plan.billing_period === 'ANNUAL' ? 365 : 30;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    // If user is a student: add credits & set subscription
    if (req.user!.role === 'STUDENT') {
      const addedCredits = plan.evaluation_allowance >= 99999 ? 999999 : plan.evaluation_allowance;
      const lotResult = recordCreditPurchase({
        userId,
        creditsPurchased: addedCredits,
        paymentId: razorpayPaymentId,
        purchaseDate: new Date(),
      });

      const newCredits = lotResult.totalValidCredits;

      // Ledger entry
      db.prepare(`
        INSERT INTO credit_ledger (id, student_id, amount, source, balance_after, payment_id, note)
        VALUES (?, ?, ?, 'PURCHASED', ?, ?, ?)
      `).run(
        `cld_${crypto.randomBytes(8).toString('hex')}`,
        userId,
        addedCredits,
        newCredits,
        razorpayPaymentId,
        `Subscribed to ${plan.name} via Razorpay (${razorpayPaymentId}). Valid for 3 months until ${new Date(lotResult.expiresAt).toLocaleDateString('en-IN')}.`
      );
    } else if (req.user!.role === 'INSTITUTE_ADMIN') {
      // Find institute associated with this user
      const inst = db.prepare('SELECT id FROM institutes WHERE email = ?').get(req.user!.email) as { id: string } | undefined;
      if (inst) {
        db.prepare(`
          UPDATE institutes
          SET status = 'ACTIVE',
              subscription_plan = ?,
              max_students = ?,
              subscription_expires_at = ?
          WHERE id = ?
        `).run(plan.id, plan.student_capacity, expiresAt, inst.id);

        const subId = `sub_${crypto.randomBytes(8).toString('hex')}`;
        db.prepare(`
          INSERT INTO institute_subscriptions (
            id, institute_id, plan_id, billing_cycle, price_inr, student_capacity,
            evaluation_allowance, evaluations_used, evaluations_remaining, payment_order_ref,
            payment_id, start_date, expiry_date, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, CURRENT_TIMESTAMP, ?, 'ACTIVE')
        `).run(
          subId, inst.id, plan.id, plan.billing_period, plan.price_inr, plan.student_capacity,
          plan.evaluation_allowance, plan.evaluation_allowance, razorpayOrderId, razorpayPaymentId, expiresAt
        );
      }
    }

    // Update payment order status
    db.prepare("UPDATE payment_orders SET status = 'SUCCESS' WHERE razorpay_order_id = ?").run(razorpayOrderId);

    // Record transaction
    const txId = `txn_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO payment_transactions (id, order_id, student_id, razorpay_payment_id, razorpay_signature, amount_paise, status, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?, 'SUCCESS', ?)
    `).run(txId, razorpayOrderId, userId, razorpayPaymentId, razorpaySignature, plan.price_inr * 100, `tx_${razorpayPaymentId}`);

    // Welcome Notification
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type)
      VALUES (?, ?, 'Subscription Activated', ?, 'CREDIT')
    `).run(
      `notif_${crypto.randomBytes(8).toString('hex')}`,
      userId,
      `Your subscription to ${plan.name} has been successfully activated. Enjoy your evaluations!`
    );

    return res.json({
      success: true,
      message: `Successfully subscribed to ${plan.name}`,
      plan: plan.name,
      expiresAt,
    });
  } catch (error: unknown) {
    console.error('Verify plan payment error:', error);
    return res.status(500).json({ error: 'Failed to verify plan payment.' });
  }
});

export default router;
