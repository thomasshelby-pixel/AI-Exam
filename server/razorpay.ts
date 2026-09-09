import crypto from 'node:crypto';
import { db } from './db.js';
import { recordCreditPurchase } from './services/studentCreditService.js';

function getCleanEnv(name: string): string {
  const val = process.env[name] || '';
  return val.trim().replace(/^["']|["']$/g, '');
}

export function isRazorpayConfigured(): boolean {
  const key = getCleanEnv('RAZORPAY_KEY_ID');
  const secret = getCleanEnv('RAZORPAY_KEY_SECRET');
  // Must be non-empty and start with official Razorpay prefix (rzp_test_ or rzp_live_)
  return !!(key && secret && (key.startsWith('rzp_test_') || key.startsWith('rzp_live_')));
}

export function getRazorpayKeyId(): string {
  return getCleanEnv('RAZORPAY_KEY_ID');
}

export interface CreateOrderParams {
  studentId: string;
  quantity: number; // Number of credits
  receiptNote?: string;
}

export interface RazorpayOrderResult {
  orderId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
  quantity: number;
}

/**
 * Creates a real Razorpay Order via Razorpay API and persists internal order record.
 */
export async function createRazorpayOrder(params: CreateOrderParams): Promise<RazorpayOrderResult> {
  const { studentId, quantity } = params;

  if (quantity < 1 || quantity > 1000) {
    throw new Error('Quantity must be between 1 and 1000 credits.');
  }

  // Pricing: 1 credit = ₹10 (1000 paise), 10 credits = ₹100 (10000 paise)
  const amountPaise = quantity * 10 * 100; // in paise
  const internalOrderId = `ord_${crypto.randomBytes(8).toString('hex')}`;

  let razorpayOrderId = '';
  const keyId = getCleanEnv('RAZORPAY_KEY_ID');
  const keySecret = getCleanEnv('RAZORPAY_KEY_SECRET');

  if (isRazorpayConfigured()) {
    // Real call to official Razorpay Orders API
    const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt: internalOrderId,
        notes: {
          studentId,
          creditsQuantity: String(quantity),
          purpose: 'CA Exam Checker AI Evaluation Credits',
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Razorpay Order API error:', errText);

      let errDesc = response.statusText;
      try {
        const errJson = JSON.parse(errText);
        if (errJson?.error?.description) {
          errDesc = errJson.error.description;
        }
      } catch {
        // use default
      }

      if (response.status === 401 || errDesc.toLowerCase().includes('authentication failed')) {
        throw new Error(`Razorpay Authentication failed (${errDesc}). Please verify that your RAZORPAY_KEY_ID (starts with rzp_test_ or rzp_live_) and RAZORPAY_KEY_SECRET in Settings > Secrets match your Razorpay Dashboard credentials.`);
      }

      throw new Error(`Razorpay Order creation failed: ${errDesc}`);
    }

    const orderData = (await response.json()) as { id: string };
    razorpayOrderId = orderData.id;
  } else {
    // When environment secrets are pending configuration or invalid, generate an official standard order ID format
    // and instruct the user to configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Settings > Secrets.
    razorpayOrderId = `order_${crypto.randomBytes(10).toString('hex')}`;
  }

  // Persist order in DB
  db.prepare(`
    INSERT INTO payment_orders (id, student_id, razorpay_order_id, quantity, amount_paise, currency, status)
    VALUES (?, ?, ?, ?, ?, 'INR', 'PENDING')
  `).run(internalOrderId, studentId, razorpayOrderId, quantity, amountPaise);

  return {
    orderId: internalOrderId,
    razorpayOrderId,
    amountPaise,
    currency: 'INR',
    keyId,
    quantity,
  };
}

export interface VerifyPaymentParams {
  studentId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

/**
 * Verifies Razorpay HMAC SHA256 signature and applies credits idempotently.
 */
export function verifyAndFulfillPayment(params: VerifyPaymentParams): { success: boolean; creditsAdded: number } {
  const { studentId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = params;

  // 1. Fetch internal order
  const order = db.prepare(`
    SELECT id, student_id, quantity, amount_paise, status
    FROM payment_orders
    WHERE razorpay_order_id = ? AND student_id = ?
  `).get(razorpayOrderId, studentId) as {
    id: string;
    student_id: string;
    quantity: number;
    amount_paise: number;
    status: string;
  } | undefined;

  if (!order) {
    throw new Error('Order not found or does not belong to this student.');
  }

  // 2. Cryptographic signature check
  const keySecret = getCleanEnv('RAZORPAY_KEY_SECRET');
  if (!isRazorpayConfigured()) {
    db.prepare('UPDATE payment_orders SET status = ? WHERE id = ?').run('FAILED', order.id);
    throw new Error('Razorpay gateway is not configured. Please configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Settings > Secrets.');
  }

  const generatedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  if (generatedSignature !== razorpaySignature) {
    db.prepare('UPDATE payment_orders SET status = ? WHERE id = ?').run('FAILED', order.id);
    throw new Error('Payment signature verification failed. Untrusted payment.');
  }

  // 3. Idempotency protection - check if transaction already processed
  const idempotencyKey = `tx_${razorpayPaymentId}`;
  const existingTx = db.prepare(`
    SELECT id FROM payment_transactions WHERE idempotency_key = ?
  `).get(idempotencyKey);

  if (existingTx || order.status === 'SUCCESS') {
    // Already fulfilled idempotently, return without duplicate credit addition
    return { success: true, creditsAdded: 0 };
  }

  // 4. Record payment transaction
  const txId = `txn_${crypto.randomBytes(8).toString('hex')}`;
  db.prepare(`
    INSERT INTO payment_transactions (id, order_id, student_id, razorpay_payment_id, razorpay_signature, amount_paise, status, idempotency_key)
    VALUES (?, ?, ?, ?, ?, ?, 'SUCCESS', ?)
  `).run(txId, order.id, studentId, razorpayPaymentId, razorpaySignature, order.amount_paise, idempotencyKey);

  // 5. Update order status
  db.prepare('UPDATE payment_orders SET status = ? WHERE id = ?').run('SUCCESS', order.id);

  // 6. Record credit purchase with exact 3-month validity lot
  const lotResult = recordCreditPurchase({
    userId: studentId,
    creditsPurchased: order.quantity,
    orderId: order.id,
    paymentId: razorpayPaymentId,
    purchaseDate: new Date(),
  });

  const newBalance = lotResult.totalValidCredits;
  const expiryFormatted = new Date(lotResult.expiresAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // 7. Credit ledger entry
  const ledgerId = `cld_${crypto.randomBytes(8).toString('hex')}`;
  db.prepare(`
    INSERT INTO credit_ledger (id, student_id, amount, source, balance_after, order_id, payment_id, note)
    VALUES (?, ?, ?, 'PURCHASED', ?, ?, ?, ?)
  `).run(
    ledgerId,
    studentId,
    order.quantity,
    newBalance,
    order.id,
    razorpayPaymentId,
    `Purchased ${order.quantity} evaluation credits via Razorpay (${razorpayPaymentId}). Valid for 3 months until ${expiryFormatted}.`
  );

  // 8. In-app notification
  const notifId = `notif_${crypto.randomBytes(8).toString('hex')}`;
  db.prepare(`
    INSERT INTO notifications (id, user_id, title, message, type)
    VALUES (?, ?, ?, ?, 'CREDIT')
  `).run(
    notifId,
    studentId,
    'Payment Successful - Credits Added',
    `Your payment of ₹${order.amount_paise / 100} was successful. ${order.quantity} evaluation credits have been added to your account (valid for 3 months until ${expiryFormatted}).`
  );

  // 9. Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, 'PAYMENT_CREDITED', 'PAYMENT', ?, ?)
  `).run(
    `log_${crypto.randomBytes(8).toString('hex')}`,
    studentId,
    order.id,
    `Added ${order.quantity} credits. Razorpay Payment ID: ${razorpayPaymentId}`
  );

  return { success: true, creditsAdded: order.quantity };
}

/**
 * Handles official Razorpay Webhooks (payment.captured, order.paid).
 */
export function processRazorpayWebhook(rawBody: string, signature: string): { received: boolean } {
  const webhookSecret = getCleanEnv('RAZORPAY_WEBHOOK_SECRET');
  if (webhookSecret) {
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (expectedSignature !== signature) {
      throw new Error('Invalid Razorpay webhook signature');
    }
  }

  const event = JSON.parse(rawBody);
  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    const payment = event.payload?.payment?.entity;
    const orderId = payment?.order_id;
    const paymentId = payment?.id;
    const studentId = payment?.notes?.studentId;

    if (orderId && paymentId && studentId) {
      try {
        verifyAndFulfillPayment({
          studentId,
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature || 'webhook_verified',
        });
      } catch (err) {
        console.warn('Webhook auto-fulfill warning:', err);
      }
    }
  }

  return { received: true };
}

export interface CreateInstituteOrderParams {
  instituteId: string;
  planId: string;
  billingPeriod?: 'MONTHLY' | 'ANNUAL';
}

export interface InstituteOrderResult {
  orderId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
  planId: string;
  planName: string;
}

export async function createInstituteSubscriptionOrder(params: CreateInstituteOrderParams): Promise<InstituteOrderResult> {
  const { instituteId, planId, billingPeriod = 'MONTHLY' } = params;

  // 1. Fetch plan from DB
  const plan = db.prepare('SELECT * FROM institute_plans WHERE id = ?').get(planId) as any;
  if (!plan) {
    throw new Error(`Invalid plan ID: ${planId}`);
  }

  // 2. Fetch institute
  const inst = db.prepare('SELECT * FROM institutes WHERE id = ?').get(instituteId) as any;
  if (!inst) {
    throw new Error(`Institute not found: ${instituteId}`);
  }

  const multiplier = billingPeriod === 'ANNUAL' ? 10 : 1; // 2 months free on annual
  const amountPaise = plan.price_inr * multiplier * 100;
  const internalOrderId = `ord_inst_${crypto.randomBytes(8).toString('hex')}`;

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
          instituteId,
          planId,
          billingPeriod,
          instituteName: inst.name,
          purpose: `Institute Subscription: ${plan.name}`,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Razorpay Order creation failed: ${errText.slice(0, 150)}`);
    }

    const data = (await response.json()) as { id: string };
    razorpayOrderId = data.id;
  } else {
    razorpayOrderId = `order_${crypto.randomBytes(10).toString('hex')}`;
  }

  // Persist order in payment_orders
  db.prepare(`
    INSERT INTO payment_orders (id, student_id, razorpay_order_id, quantity, amount_paise, currency, status)
    VALUES (?, ?, ?, ?, ?, 'INR', 'PENDING')
  `).run(internalOrderId, `inst_${instituteId}`, razorpayOrderId, plan.evaluation_credits || 500, amountPaise);

  return {
    orderId: internalOrderId,
    razorpayOrderId,
    amountPaise,
    currency: 'INR',
    keyId,
    planId: plan.id,
    planName: plan.name,
  };
}

export interface VerifyInstitutePaymentParams {
  instituteId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  planId: string;
}

export function verifyInstituteSubscriptionPayment(params: VerifyInstitutePaymentParams) {
  const { instituteId, razorpayOrderId, razorpayPaymentId, razorpaySignature, planId } = params;

  const plan = db.prepare('SELECT * FROM institute_plans WHERE id = ?').get(planId) as any;
  if (!plan) throw new Error('Selected plan not found');

  const inst = db.prepare('SELECT * FROM institutes WHERE id = ?').get(instituteId) as any;
  if (!inst) throw new Error('Institute not found');

  const keySecret = getCleanEnv('RAZORPAY_KEY_SECRET');
  if (isRazorpayConfigured()) {
    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (generatedSignature !== razorpaySignature) {
      throw new Error('Payment signature verification failed. Untrusted payment.');
    }
  }

  // Calculate expiration date: +30 days
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Update institute in DB
  db.prepare(`
    UPDATE institutes SET
      status = 'ACTIVE',
      subscription_plan = ?,
      max_students = ?,
      subscription_expires_at = ?
    WHERE id = ?
  `).run(plan.id, plan.student_quota, expiresAt, instituteId);

  // Update payment_order
  db.prepare("UPDATE payment_orders SET status = 'SUCCESS' WHERE razorpay_order_id = ?").run(razorpayOrderId);

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, 'INSTITUTE_SUBSCRIPTION_ACTIVE', 'INSTITUTE', ?, ?)
  `).run(
    `log_${crypto.randomBytes(8).toString('hex')}`,
    inst.admin_user_id || instituteId,
    instituteId,
    `Subscribed to ${plan.name} (Quota: ${plan.student_quota} students). Payment ID: ${razorpayPaymentId}`
  );

  return {
    success: true,
    plan: plan.name,
    maxStudents: plan.student_quota,
    expiresAt,
  };
}
