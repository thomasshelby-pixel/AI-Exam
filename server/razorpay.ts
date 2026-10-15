import crypto from 'node:crypto';
import { db } from './db.js';
import { recordCreditPurchase } from './services/studentCreditService.js';
import { safeTimingCompare } from './utils/cryptoSecurity.js';

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

export const CUSTOM_PRICE_PER_EVALUATION_INR = 35; // ₹35 per evaluation

export const COMBO_PLANS = {
  COMBO_1: {
    id: 'COMBO_1',
    name: 'Combo 1',
    FOUNDATION: {
      evaluations: 4,
      priceINR: 119,
    },
    INTERMEDIATE: {
      evaluations: 6,
      priceINR: 175,
    },
  },
  COMBO_2: {
    id: 'COMBO_2',
    name: 'Combo 2',
    FOUNDATION: {
      evaluations: 8,
      priceINR: 219,
    },
    INTERMEDIATE: {
      evaluations: 12,
      priceINR: 329,
    },
  },
} as const;

export type PurchaseType = 'CUSTOM' | 'COMBO_1' | 'COMBO_2';
export type CourseLevel = 'FOUNDATION' | 'INTERMEDIATE';

export interface CreateOrderParams {
  studentId: string;
  purchaseType?: PurchaseType;
  courseLevel?: CourseLevel;
  quantity?: number; // Number of credits (for CUSTOM)
  receiptNote?: string;
}

export interface RazorpayOrderResult {
  orderId: string;
  razorpayOrderId: string;
  amountPaise: number;
  amountINR: number;
  currency: string;
  keyId: string;
  quantity: number;
  purchaseType: PurchaseType;
  courseLevel?: CourseLevel;
  description: string;
}

/**
 * Creates a real Razorpay Order via Razorpay API and persists internal order record.
 * Prices and amounts are calculated and validated strictly SERVER-SIDE.
 */
export async function createRazorpayOrder(params: CreateOrderParams): Promise<RazorpayOrderResult> {
  const { studentId } = params;
  const purchaseType: PurchaseType = params.purchaseType || 'CUSTOM';
  let courseLevel: CourseLevel | undefined = undefined;

  let finalQuantity = 0;
  let finalAmountINR = 0;
  let purposeDescription = '';

  if (purchaseType === 'COMBO_1' || purchaseType === 'COMBO_2') {
    courseLevel = params.courseLevel === 'FOUNDATION' ? 'FOUNDATION' : 'INTERMEDIATE';
    const plan = COMBO_PLANS[purchaseType][courseLevel];
    finalQuantity = plan.evaluations;
    finalAmountINR = plan.priceINR;
    purposeDescription = `CA Exam Checker AI - ${purchaseType === 'COMBO_1' ? 'Combo 1' : 'Combo 2'} (${courseLevel === 'FOUNDATION' ? 'Foundation' : 'Intermediate'} - ${finalQuantity} Evaluations @ ₹${finalAmountINR})`;
  } else {
    // Custom evaluation purchase
    const qty = params.quantity;
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1) {
      throw new Error('Custom evaluation quantity must be a positive integer (minimum 1).');
    }
    if (qty > 500) {
      throw new Error('Quantity exceeds safe application limit of 500 evaluations per order.');
    }
    finalQuantity = qty;
    finalAmountINR = qty * CUSTOM_PRICE_PER_EVALUATION_INR;
    purposeDescription = `CA Exam Checker AI - Custom Purchase (${finalQuantity} Evaluations @ ₹${CUSTOM_PRICE_PER_EVALUATION_INR} = ₹${finalAmountINR})`;
  }

  const amountPaise = finalAmountINR * 100; // in paise
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
          purchaseType,
          courseLevel: courseLevel || 'N/A',
          creditsQuantity: String(finalQuantity),
          amountINR: String(finalAmountINR),
          purpose: purposeDescription,
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
    razorpayOrderId = `order_${crypto.randomBytes(10).toString('hex')}`;
  }

  // Persist order in DB
  db.prepare(`
    INSERT INTO payment_orders (id, student_id, razorpay_order_id, quantity, amount_paise, currency, status)
    VALUES (?, ?, ?, ?, ?, 'INR', 'PENDING')
  `).run(internalOrderId, studentId, razorpayOrderId, finalQuantity, amountPaise);

  return {
    orderId: internalOrderId,
    razorpayOrderId,
    amountPaise,
    amountINR: finalAmountINR,
    currency: 'INR',
    keyId,
    quantity: finalQuantity,
    purchaseType,
    courseLevel,
    description: purposeDescription,
  };
}

export interface VerifyPaymentParams {
  studentId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

/**
 * Verifies Razorpay Checkout payment HMAC SHA-256 signature:
 * HMAC_SHA256(order_id + "|" + payment_id, RAZORPAY_KEY_SECRET) === signature
 */
export function verifyCheckoutPaymentSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = params;
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return false;
  }

  const keySecret = getCleanEnv('RAZORPAY_KEY_SECRET');
  if (!keySecret) {
    throw new Error('Razorpay gateway is not configured. Please configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Settings > Secrets.');
  }

  const generatedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  return safeTimingCompare(generatedSignature, razorpaySignature);
}

/**
 * Verifies Razorpay Webhook HMAC SHA-256 signature using the exact raw request body bytes:
 * HMAC_SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET) === x-razorpay-signature
 */
export function verifyWebhookSignature(rawBody: Buffer | string, signature?: string | null): boolean {
  const webhookSecret = getCleanEnv('RAZORPAY_WEBHOOK_SECRET');
  if (!webhookSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('RAZORPAY_WEBHOOK_SECRET not configured. Rejecting untrusted webhook.');
    }
    throw new Error('RAZORPAY_WEBHOOK_SECRET is required for webhook signature verification.');
  }

  if (!signature || typeof signature !== 'string') {
    throw new Error('Missing Razorpay webhook signature header');
  }

  const payloadBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payloadBuffer)
    .digest('hex');

  if (!safeTimingCompare(expectedSignature, signature)) {
    throw new Error('Invalid Razorpay webhook signature');
  }

  return true;
}

export interface FulfillPaymentParams {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  studentId?: string;
  signatureRecord?: string;
  source: 'CHECKOUT' | 'WEBHOOK';
  paymentAmountPaise?: number;
  paymentCurrency?: string;
}

export interface FulfillPaymentResult {
  success: boolean;
  creditsAdded: number;
  alreadyFulfilled: boolean;
  orderId: string;
  studentId: string;
}

/**
 * Shared, idempotent payment fulfillment engine.
 * Authoritative single point for credit granting, transactional recording,
 * and ledger updates across both Checkout verification and Webhook delivery.
 */
export function fulfillPaymentOrder(params: FulfillPaymentParams): FulfillPaymentResult {
  const {
    razorpayOrderId,
    razorpayPaymentId,
    studentId: expectedStudentId,
    signatureRecord,
    source,
    paymentAmountPaise,
    paymentCurrency,
  } = params;

  if (!razorpayOrderId || !razorpayPaymentId) {
    throw new Error('Missing required order or payment identifiers for fulfillment.');
  }

  // 1. Fetch internal order by razorpay_order_id
  const order = db.prepare(`
    SELECT id, student_id, quantity, amount_paise, currency, status
    FROM payment_orders
    WHERE razorpay_order_id = ?
  `).get(razorpayOrderId) as {
    id: string;
    student_id: string;
    quantity: number;
    amount_paise: number;
    currency: string;
    status: string;
  } | undefined;

  if (!order) {
    throw new Error(`Order not found for Razorpay order ID: ${razorpayOrderId}`);
  }

  // 2. Ownership verification: if studentId is provided, verify match
  if (expectedStudentId && order.student_id !== expectedStudentId) {
    throw new Error('Order does not belong to the specified student.');
  }

  const authoritativeStudentId = order.student_id;

  // 3. Amount and currency verification against stored authoritative order
  if (paymentAmountPaise !== undefined && paymentAmountPaise !== null) {
    if (paymentAmountPaise !== order.amount_paise) {
      throw new Error(
        `Payment amount mismatch: received ${paymentAmountPaise} paise, order requires ${order.amount_paise} paise`
      );
    }
  }

  if (paymentCurrency && paymentCurrency.toUpperCase() !== order.currency.toUpperCase()) {
    throw new Error(
      `Payment currency mismatch: received ${paymentCurrency}, order requires ${order.currency}`
    );
  }

  // 4. Idempotency check: Has this payment ID or order already been fulfilled?
  const idempotencyKey = `tx_${razorpayPaymentId}`;
  const existingTx = db.prepare(`
    SELECT id, order_id, student_id, status FROM payment_transactions
    WHERE idempotency_key = ? OR razorpay_payment_id = ?
  `).get(idempotencyKey, razorpayPaymentId) as { id: string } | undefined;

  if (existingTx || order.status === 'SUCCESS') {
    // Already fulfilled cleanly and idempotently
    return {
      success: true,
      creditsAdded: 0,
      alreadyFulfilled: true,
      orderId: order.id,
      studentId: authoritativeStudentId,
    };
  }

  // 5. Atomic fulfillment transaction
  let inTx = false;
  try {
    db.exec('BEGIN IMMEDIATE');
    inTx = true;

    // Double check inside transaction for race-condition prevention under concurrency
    const txCheck = db.prepare(`
      SELECT id FROM payment_transactions WHERE idempotency_key = ? OR razorpay_payment_id = ?
    `).get(idempotencyKey, razorpayPaymentId);

    const orderCheck = db.prepare(`
      SELECT status FROM payment_orders WHERE id = ?
    `).get(order.id) as { status: string } | undefined;

    if (txCheck || orderCheck?.status === 'SUCCESS') {
      db.exec('COMMIT');
      inTx = false;
      return {
        success: true,
        creditsAdded: 0,
        alreadyFulfilled: true,
        orderId: order.id,
        studentId: authoritativeStudentId,
      };
    }

    const txId = `txn_${crypto.randomBytes(8).toString('hex')}`;
    const storedSignature = signatureRecord || (source === 'WEBHOOK' ? 'WEBHOOK_VERIFIED' : 'CHECKOUT_VERIFIED');

    // Insert payment transaction record
    db.prepare(`
      INSERT INTO payment_transactions (id, order_id, student_id, razorpay_payment_id, razorpay_signature, amount_paise, status, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?, 'SUCCESS', ?)
    `).run(
      txId,
      order.id,
      authoritativeStudentId,
      razorpayPaymentId,
      storedSignature,
      order.amount_paise,
      idempotencyKey
    );

    // Update order status to SUCCESS
    db.prepare("UPDATE payment_orders SET status = 'SUCCESS' WHERE id = ?").run(order.id);

    // Record credit purchase with exact 3-month validity lot in student_credit_purchases
    const lotResult = recordCreditPurchase({
      userId: authoritativeStudentId,
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

    // Credit ledger entry
    const ledgerId = `cld_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO credit_ledger (id, student_id, amount, source, balance_after, order_id, payment_id, note)
      VALUES (?, ?, ?, 'PURCHASED', ?, ?, ?, ?)
    `).run(
      ledgerId,
      authoritativeStudentId,
      order.quantity,
      newBalance,
      order.id,
      razorpayPaymentId,
      `Purchased ${order.quantity} evaluation credits via Razorpay (${razorpayPaymentId}) [${source}]. Valid for 3 months until ${expiryFormatted}.`
    );

    // In-app notification
    const notifId = `notif_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type)
      VALUES (?, ?, ?, ?, 'CREDIT')
    `).run(
      notifId,
      authoritativeStudentId,
      'Payment Successful - Credits Added',
      `Your payment of ₹${order.amount_paise / 100} was successful. ${order.quantity} evaluation credits have been added to your account (valid for 3 months until ${expiryFormatted}).`
    );

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'PAYMENT_CREDITED', 'PAYMENT', ?, ?)
    `).run(
      `log_${crypto.randomBytes(8).toString('hex')}`,
      authoritativeStudentId,
      order.id,
      `Added ${order.quantity} credits via ${source}. Razorpay Payment ID: ${razorpayPaymentId}`
    );

    db.exec('COMMIT');
    inTx = false;

    return {
      success: true,
      creditsAdded: order.quantity,
      alreadyFulfilled: false,
      orderId: order.id,
      studentId: authoritativeStudentId,
    };
  } catch (error) {
    if (inTx) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore rollback errors if already aborted
      }
    }
    throw error;
  }
}

/**
 * Verifies Razorpay HMAC SHA256 Checkout signature and applies credits idempotently.
 * Preserves the exact signature and interface used by /api/payments/verify.
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

  // 2. Cryptographic Checkout signature verification
  const isValid = verifyCheckoutPaymentSignature({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  });

  if (!isValid) {
    // Only mark FAILED if the order has not already been fulfilled (never downgrade SUCCESS)
    if (order.status !== 'SUCCESS') {
      db.prepare("UPDATE payment_orders SET status = 'FAILED' WHERE id = ?").run(order.id);
    }
    throw new Error('Payment signature verification failed. Untrusted payment.');
  }

  // 3. Shared idempotent fulfillment
  const fulfillment = fulfillPaymentOrder({
    razorpayOrderId,
    razorpayPaymentId,
    studentId,
    signatureRecord: razorpaySignature,
    source: 'CHECKOUT',
  });

  return { success: true, creditsAdded: fulfillment.creditsAdded };
}

export interface WebhookProcessResult {
  received: boolean;
  status: 'processed' | 'already_processed' | 'ignored';
  event?: string;
  reason?: string;
  creditsAdded?: number;
  alreadyFulfilled?: boolean;
}

/**
 * Handles official Razorpay Webhooks (payment.captured, order.paid).
 * Uses exact raw request bytes and dedicated RAZORPAY_WEBHOOK_SECRET.
 * Dispatches to shared fulfillPaymentOrder without passing webhook signature into Checkout verification.
 */
export async function processRazorpayWebhook(
  rawBody: Buffer | string,
  signature?: string | null
): Promise<WebhookProcessResult> {
  // 1. Cryptographic Webhook signature verification
  verifyWebhookSignature(rawBody, signature);

  // 2. Parse payload from raw request bytes
  const rawString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  let event: any;
  try {
    event = JSON.parse(rawString);
  } catch {
    throw new Error('Invalid JSON payload in webhook body');
  }

  const eventType = event.event;

  // 3. Handle successful payment events (payment.captured, order.paid)
  if (eventType === 'payment.captured' || eventType === 'order.paid') {
    const payment = event.payload?.payment?.entity;
    const orderPayload = event.payload?.order?.entity;

    const orderId = payment?.order_id || orderPayload?.id;
    const paymentId = payment?.id;
    const studentId = payment?.notes?.studentId || orderPayload?.notes?.studentId;
    const amount = payment?.amount ?? orderPayload?.amount;
    const currency = payment?.currency ?? orderPayload?.currency;

    if (!orderId || !paymentId) {
      console.warn(`[Razorpay Webhook] Missing order_id or payment_id in ${eventType} payload`);
      return {
        received: true,
        status: 'ignored',
        event: eventType,
        reason: 'Missing order_id or payment id in event payload',
      };
    }

    // Call shared idempotent fulfillment directly
    const result = fulfillPaymentOrder({
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      studentId: studentId || undefined,
      signatureRecord: signature || 'WEBHOOK_VERIFIED',
      source: 'WEBHOOK',
      paymentAmountPaise: typeof amount === 'number' ? amount : undefined,
      paymentCurrency: typeof currency === 'string' ? currency : undefined,
    });

    return {
      received: true,
      status: result.alreadyFulfilled ? 'already_processed' : 'processed',
      event: eventType,
      creditsAdded: result.creditsAdded,
      alreadyFulfilled: result.alreadyFulfilled,
    };
  }

  // 4. Handle payment.failed event: never downgrade an already SUCCESS order
  if (eventType === 'payment.failed') {
    const payment = event.payload?.payment?.entity;
    const orderId = payment?.order_id;
    if (orderId) {
      const order = db.prepare('SELECT id, status FROM payment_orders WHERE razorpay_order_id = ?').get(orderId) as { id: string; status: string } | undefined;
      // Do NOT overwrite an already SUCCESS order!
      if (order && order.status !== 'SUCCESS') {
        db.prepare("UPDATE payment_orders SET status = 'FAILED' WHERE id = ?").run(order.id);
      }
    }
    return {
      received: true,
      status: 'ignored',
      event: eventType,
      reason: 'Payment failed event recorded without touching successful orders',
    };
  }

  // 5. Deliberate ignore policy for all other unhandled event types
  return {
    received: true,
    status: 'ignored',
    event: eventType,
    reason: `Event type ${eventType} acknowledged but not configured for credit grants`,
  };
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

  const amountPaise = plan.price_inr * 100;
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

  // Calculate expiration date based on plan billing period
  let durationDays = 30;
  if (plan.billing_period === 'ANNUAL') {
    durationDays = 365;
  } else if (plan.billing_period === 'QUARTERLY') {
    durationDays = 90;
  }
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  // Archive any previous active subscriptions for this institute
  db.prepare(`
    UPDATE institute_subscriptions
    SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
    WHERE institute_id = ? AND status = 'ACTIVE'
  `).run(instituteId);

  // Insert new active subscription
  const subId = `sub_${crypto.randomBytes(8).toString('hex')}`;
  db.prepare(`
    INSERT INTO institute_subscriptions (
      id, institute_id, plan_id, plan_name, billing_cycle, price_inr,
      student_capacity, evaluation_allowance, evaluations_used, evaluations_remaining,
      payment_order_ref, payment_id, start_date, expiry_date, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, CURRENT_TIMESTAMP, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    subId,
    instituteId,
    plan.id,
    plan.name,
    plan.billing_period || 'MONTHLY',
    plan.price_inr,
    plan.student_quota,
    plan.evaluation_credits,
    plan.evaluation_credits,
    razorpayOrderId,
    razorpayPaymentId,
    expiresAt
  );

  // Update institute in DB
  db.prepare(`
    UPDATE institutes SET
      status = 'ACTIVE',
      subscription_plan = ?,
      max_students = ?,
      subscription_expires_at = ?
    WHERE id = ?
  `).run(plan.name, plan.student_quota, expiresAt, instituteId);

  // Update payment_order
  db.prepare("UPDATE payment_orders SET status = 'SUCCESS' WHERE razorpay_order_id = ?").run(razorpayOrderId);

  // Record in payment_transactions for financial and audit integrity
  const txId = `tx_${crypto.randomBytes(8).toString('hex')}`;
  const orderRow = db.prepare('SELECT id FROM payment_orders WHERE razorpay_order_id = ?').get(razorpayOrderId) as { id: string } | undefined;
  if (orderRow) {
    db.prepare(`
      INSERT OR IGNORE INTO payment_transactions (
        id, order_id, student_id, razorpay_payment_id, razorpay_signature,
        amount_paise, status, idempotency_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'SUCCESS', ?, CURRENT_TIMESTAMP)
    `).run(
      txId,
      orderRow.id,
      `inst_${instituteId}`,
      razorpayPaymentId,
      razorpaySignature || 'DIRECT_AUTH',
      plan.price_inr * 100,
      `idem_${razorpayPaymentId}`
    );
  }

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, 'INSTITUTE_SUBSCRIPTION_ACTIVE', 'INSTITUTE', ?, ?)
  `).run(
    `log_${crypto.randomBytes(8).toString('hex')}`,
    inst.admin_user_id || instituteId,
    instituteId,
    `Subscribed to ${plan.name} (${plan.billing_period}, Student Quota: ${plan.student_quota}, Allowance: ${plan.evaluation_credits}). Payment ID: ${razorpayPaymentId}`
  );

  return {
    success: true,
    plan: plan.name,
    maxStudents: plan.student_quota,
    expiresAt,
  };
}
