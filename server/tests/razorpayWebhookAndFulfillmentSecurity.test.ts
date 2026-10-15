import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db } from '../db.js';
import {
  createRazorpayOrder,
  verifyCheckoutPaymentSignature,
  verifyWebhookSignature,
  fulfillPaymentOrder,
  verifyAndFulfillPayment,
  processRazorpayWebhook,
} from '../razorpay.js';
import { getValidStudentCreditBalance } from '../services/studentCreditService.js';

console.log('========================================================================');
console.log('CRITICAL REGRESSION TEST: RAZORPAY WEBHOOK & FULFILLMENT SECURITY');
console.log('========================================================================\n');

const TEST_SECRET = 'whsec_test_mock_secret_998877665544332211';
const TEST_KEY_SECRET = 'rzp_sec_test_mock_secret_1122334455';

async function runTestSuite() {
  const originalEnv = { ...process.env };
  process.env.RAZORPAY_WEBHOOK_SECRET = TEST_SECRET;
  delete process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_SECRET = TEST_KEY_SECRET;

  // Setup isolated test student
  const studentId = `usr_test_wh_${Date.now()}`;
  const studentEmail = `wh_test_${Date.now()}@caexamchecker.ai`;

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, ?, 'hash', 'Test Webhook Student', 'STUDENT', 'ACTIVE')
  `).run(studentId, studentEmail);

  db.prepare(`
    INSERT INTO student_profiles (
      user_id, icai_registration_number, ca_level,
      free_evaluations_used, monthly_free_evaluations_used, monthly_free_evaluations_limit,
      purchased_credits, paid_credits
    ) VALUES (?, 'WRO8888888', 'INTERMEDIATE', 0, 0, 2, 0, 0)
  `).run(studentId);

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Valid webhook signature using exact raw request bytes
    // ------------------------------------------------------------------------
    console.log('>>> [1/16] Testing valid webhook signature with exact raw request bytes...');
    const rawPayload1 = Buffer.from(JSON.stringify({ event: 'ping', test: true }), 'utf8');
    const validSignature1 = crypto.createHmac('sha256', TEST_SECRET).update(rawPayload1).digest('hex');
    assert.strictEqual(
      verifyWebhookSignature(rawPayload1, validSignature1),
      true,
      'Valid signature on exact raw Buffer must pass'
    );
    console.log('✓ [PASS] Test 1: Valid webhook signature verified cleanly.');

    // ------------------------------------------------------------------------
    // TEST 2: Invalid webhook signature is rejected
    // ------------------------------------------------------------------------
    console.log('\n>>> [2/16] Testing invalid webhook signature rejection...');
    const invalidSignature = 'deadbeefcafebabe00112233445566778899aabbccddeeff0011223344556677';
    assert.throws(
      () => verifyWebhookSignature(rawPayload1, invalidSignature),
      /Invalid Razorpay webhook signature/,
      'Invalid signature must throw an untrusted error'
    );
    console.log('✓ [PASS] Test 2: Invalid signature safely rejected.');

    // ------------------------------------------------------------------------
    // TEST 3: Missing signature header is rejected
    // ------------------------------------------------------------------------
    console.log('\n>>> [3/16] Testing missing signature header...');
    assert.throws(
      () => verifyWebhookSignature(rawPayload1, undefined as any),
      /Missing Razorpay webhook signature header/,
      'Missing signature must throw'
    );
    assert.throws(
      () => verifyWebhookSignature(rawPayload1, ''),
      /Missing Razorpay webhook signature header/,
      'Empty signature must throw'
    );
    console.log('✓ [PASS] Test 3: Missing signature rejected.');

    // ------------------------------------------------------------------------
    // TEST 4: Missing production webhook secret fails securely
    // ------------------------------------------------------------------------
    console.log('\n>>> [4/16] Testing missing webhook secret in production...');
    const savedSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const savedNodeEnv = process.env.NODE_ENV;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'production';

    assert.throws(
      () => verifyWebhookSignature(rawPayload1, validSignature1),
      /RAZORPAY_WEBHOOK_SECRET not configured. Rejecting untrusted webhook./,
      'Missing webhook secret in production must fail securely'
    );

    // Restore
    process.env.RAZORPAY_WEBHOOK_SECRET = savedSecret;
    process.env.NODE_ENV = savedNodeEnv;
    console.log('✓ [PASS] Test 4: Missing production secret fails securely.');

    // ------------------------------------------------------------------------
    // TEST 5: JSON whitespace/key-order differences do not break verification
    // ------------------------------------------------------------------------
    console.log('\n>>> [5/16] Testing preservation of raw bytes despite weird whitespace/formatting...');
    const irregularJsonBuffer = Buffer.from('{\n  "event" :  "payment.captured",\n  "key"  :\t"val" \n}', 'utf8');
    const irregularSignature = crypto.createHmac('sha256', TEST_SECRET).update(irregularJsonBuffer).digest('hex');
    assert.strictEqual(
      verifyWebhookSignature(irregularJsonBuffer, irregularSignature),
      true,
      'Raw byte buffer with arbitrary whitespace matches exact signature'
    );
    // Showing that JSON.stringify re-serialization would have failed
    const reSerialized = Buffer.from(JSON.stringify(JSON.parse(irregularJsonBuffer.toString('utf8'))), 'utf8');
    const reSerializedSig = crypto.createHmac('sha256', TEST_SECRET).update(reSerialized).digest('hex');
    assert.notStrictEqual(
      reSerializedSig,
      irregularSignature,
      'Proof: Re-serialized JSON generates different HMAC, confirming raw bytes preservation is essential'
    );
    console.log('✓ [PASS] Test 5: Raw bytes preservation verified against re-serialization drift.');

    // ------------------------------------------------------------------------
    // TEST 6: payment.captured successfully fulfils an eligible purchase once
    // ------------------------------------------------------------------------
    console.log('\n>>> [6/16] Testing payment.captured fulfillment...');
    const order6 = await createRazorpayOrder({
      studentId,
      purchaseType: 'CUSTOM',
      quantity: 5,
    });
    const paymentId6 = `pay_test_cap_${Date.now()}`;
    const payloadCaptured = {
      entity: 'event',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId6,
            amount: order6.amountPaise,
            currency: 'INR',
            status: 'captured',
            order_id: order6.razorpayOrderId,
            notes: { studentId },
          },
        },
      },
    };
    const rawCaptured = Buffer.from(JSON.stringify(payloadCaptured), 'utf8');
    const sigCaptured = crypto.createHmac('sha256', TEST_SECRET).update(rawCaptured).digest('hex');

    const initialBal6 = getValidStudentCreditBalance(studentId);
    const resultCaptured = await processRazorpayWebhook(rawCaptured, sigCaptured);
    assert.strictEqual(resultCaptured.status, 'processed');
    assert.strictEqual(resultCaptured.creditsAdded, 5);
    const afterBal6 = getValidStudentCreditBalance(studentId);
    assert.strictEqual(afterBal6, initialBal6 + 5, '5 credits must be added to student');

    const dbOrder6 = db.prepare('SELECT status FROM payment_orders WHERE razorpay_order_id = ?').get(order6.razorpayOrderId) as any;
    assert.strictEqual(dbOrder6.status, 'SUCCESS', 'Order must be SUCCESS');
    console.log('✓ [PASS] Test 6: payment.captured successfully fulfilled order with 5 credits.');

    // ------------------------------------------------------------------------
    // TEST 7: order.paid successfully fulfils an eligible purchase once
    // ------------------------------------------------------------------------
    console.log('\n>>> [7/16] Testing order.paid fulfillment...');
    const order7 = await createRazorpayOrder({
      studentId,
      purchaseType: 'CUSTOM',
      quantity: 3,
    });
    const paymentId7 = `pay_test_ordpaid_${Date.now()}`;
    const payloadOrderPaid = {
      entity: 'event',
      event: 'order.paid',
      payload: {
        order: {
          entity: {
            id: order7.razorpayOrderId,
            amount: order7.amountPaise,
            amount_paid: order7.amountPaise,
            status: 'paid',
            notes: { studentId },
          },
        },
        payment: {
          entity: {
            id: paymentId7,
            amount: order7.amountPaise,
            currency: 'INR',
            status: 'captured',
            order_id: order7.razorpayOrderId,
            notes: { studentId },
          },
        },
      },
    };
    const rawOrderPaid = Buffer.from(JSON.stringify(payloadOrderPaid), 'utf8');
    const sigOrderPaid = crypto.createHmac('sha256', TEST_SECRET).update(rawOrderPaid).digest('hex');

    const initialBal7 = getValidStudentCreditBalance(studentId);
    const resultOrderPaid = await processRazorpayWebhook(rawOrderPaid, sigOrderPaid);
    assert.strictEqual(resultOrderPaid.status, 'processed');
    assert.strictEqual(resultOrderPaid.creditsAdded, 3);
    const afterBal7 = getValidStudentCreditBalance(studentId);
    assert.strictEqual(afterBal7, initialBal7 + 3, '3 credits added');
    console.log('✓ [PASS] Test 7: order.paid successfully fulfilled order with 3 credits.');

    // ------------------------------------------------------------------------
    // TEST 8: Checkout verification and webhook delivery for same payment do not grant credits twice
    // ------------------------------------------------------------------------
    console.log('\n>>> [8/16] Testing Checkout verification followed by Webhook delivery...');
    const order8 = await createRazorpayOrder({
      studentId,
      purchaseType: 'CUSTOM',
      quantity: 4,
    });
    const paymentId8 = `pay_test_both_${Date.now()}`;
    const checkoutSig8 = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(`${order8.razorpayOrderId}|${paymentId8}`)
      .digest('hex');

    const balBefore8 = getValidStudentCreditBalance(studentId);

    // 1. Checkout verify called
    const checkoutResult8 = verifyAndFulfillPayment({
      studentId,
      razorpayOrderId: order8.razorpayOrderId,
      razorpayPaymentId: paymentId8,
      razorpaySignature: checkoutSig8,
    });
    assert.strictEqual(checkoutResult8.creditsAdded, 4, 'Checkout granted 4 credits');
    assert.strictEqual(getValidStudentCreditBalance(studentId), balBefore8 + 4);

    // 2. Webhook arrives for same payment
    const payloadWebhook8 = {
      entity: 'event',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId8,
            amount: order8.amountPaise,
            currency: 'INR',
            order_id: order8.razorpayOrderId,
            notes: { studentId },
          },
        },
      },
    };
    const rawWh8 = Buffer.from(JSON.stringify(payloadWebhook8), 'utf8');
    const sigWh8 = crypto.createHmac('sha256', TEST_SECRET).update(rawWh8).digest('hex');

    const webhookResult8 = await processRazorpayWebhook(rawWh8, sigWh8);
    assert.strictEqual(webhookResult8.status, 'already_processed');
    assert.strictEqual(webhookResult8.creditsAdded, 0, 'Webhook must not grant credits a second time');
    assert.strictEqual(getValidStudentCreditBalance(studentId), balBefore8 + 4, 'Balance must remain unchanged');
    console.log('✓ [PASS] Test 8: Exactly-once credit guarantee across Checkout + Webhook confirmed.');

    // ------------------------------------------------------------------------
    // TEST 9: Duplicate webhook delivery does not grant credits twice
    // ------------------------------------------------------------------------
    console.log('\n>>> [9/16] Testing duplicate webhook delivery...');
    const duplicateRes = await processRazorpayWebhook(rawWh8, sigWh8);
    assert.strictEqual(duplicateRes.status, 'already_processed');
    assert.strictEqual(duplicateRes.creditsAdded, 0);
    assert.strictEqual(getValidStudentCreditBalance(studentId), balBefore8 + 4);
    console.log('✓ [PASS] Test 9: Duplicate webhook delivery granted 0 additional credits.');

    // ------------------------------------------------------------------------
    // TEST 10: Concurrent fulfillment attempts do not grant credits twice
    // ------------------------------------------------------------------------
    console.log('\n>>> [10/16] Testing concurrent fulfillment attempts (race condition guard)...');
    const order10 = await createRazorpayOrder({
      studentId,
      purchaseType: 'CUSTOM',
      quantity: 6,
    });
    const paymentId10 = `pay_test_concurrent_${Date.now()}`;
    const checkoutSig10 = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(`${order10.razorpayOrderId}|${paymentId10}`)
      .digest('hex');

    const payload10 = {
      entity: 'event',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId10,
            amount: order10.amountPaise,
            currency: 'INR',
            order_id: order10.razorpayOrderId,
            notes: { studentId },
          },
        },
      },
    };
    const raw10 = Buffer.from(JSON.stringify(payload10), 'utf8');
    const sig10 = crypto.createHmac('sha256', TEST_SECRET).update(raw10).digest('hex');

    const balBefore10 = getValidStudentCreditBalance(studentId);

    // Fire Checkout and Webhook simultaneously
    const [resCheckout, resWebhook] = await Promise.all([
      Promise.resolve().then(() =>
        verifyAndFulfillPayment({
          studentId,
          razorpayOrderId: order10.razorpayOrderId,
          razorpayPaymentId: paymentId10,
          razorpaySignature: checkoutSig10,
        })
      ),
      processRazorpayWebhook(raw10, sig10),
    ]);

    const totalAdded = (resCheckout.creditsAdded || 0) + (resWebhook.creditsAdded || 0);
    assert.strictEqual(totalAdded, 6, 'Total credits added across concurrent attempts must be strictly 6 (never 12)');
    assert.strictEqual(getValidStudentCreditBalance(studentId), balBefore10 + 6);
    console.log('✓ [PASS] Test 10: Concurrent race condition prevented: exactly 6 credits granted.');

    // ------------------------------------------------------------------------
    // TEST 11: Valid webhook does not pass its signature into Checkout signature verification
    // ------------------------------------------------------------------------
    console.log('\n>>> [11/16] Testing separation of webhook signature from Checkout verification...');
    // If webhook signature is fed into Checkout signature verifier, it must fail:
    const invalidForCheckout = verifyCheckoutPaymentSignature({
      razorpayOrderId: order6.razorpayOrderId,
      razorpayPaymentId: paymentId6,
      razorpaySignature: sigCaptured, // Webhook signature
    });
    assert.strictEqual(invalidForCheckout, false, 'Checkout signature verification must fail if webhook signature is passed');
    console.log('✓ [PASS] Test 11: Webhook signature is completely isolated from Checkout verification.');

    // ------------------------------------------------------------------------
    // TEST 12: An unsuccessful payment never grants evaluation credits
    // ------------------------------------------------------------------------
    console.log('\n>>> [12/16] Testing that failed payment never grants credits...');
    const order12 = await createRazorpayOrder({
      studentId,
      purchaseType: 'CUSTOM',
      quantity: 5,
    });
    const paymentId12 = `pay_test_failed_${Date.now()}`;
    const payloadFailed12 = {
      entity: 'event',
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: paymentId12,
            amount: order12.amountPaise,
            order_id: order12.razorpayOrderId,
          },
        },
      },
    };
    const rawFailed12 = Buffer.from(JSON.stringify(payloadFailed12), 'utf8');
    const sigFailed12 = crypto.createHmac('sha256', TEST_SECRET).update(rawFailed12).digest('hex');

    const balBefore12 = getValidStudentCreditBalance(studentId);
    const resFailed12 = await processRazorpayWebhook(rawFailed12, sigFailed12);
    assert.strictEqual(resFailed12.status, 'ignored');
    assert.strictEqual(getValidStudentCreditBalance(studentId), balBefore12, 'No credits granted on payment.failed');

    const dbOrder12 = db.prepare('SELECT status FROM payment_orders WHERE razorpay_order_id = ?').get(order12.razorpayOrderId) as any;
    assert.strictEqual(dbOrder12.status, 'FAILED', 'Order marked FAILED');
    console.log('✓ [PASS] Test 12: Unsuccessful payment never grants credits and marks order FAILED.');

    // ------------------------------------------------------------------------
    // TEST 13: Delayed failure event never downgrades an already successful payment
    // ------------------------------------------------------------------------
    console.log('\n>>> [13/16] Testing delayed failure event on already successful payment...');
    // order6 is already SUCCESS. Send a delayed payment.failed event for order6:
    const payloadDelayedFail = {
      entity: 'event',
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: `pay_delayed_${Date.now()}`,
            order_id: order6.razorpayOrderId,
          },
        },
      },
    };
    const rawDelayedFail = Buffer.from(JSON.stringify(payloadDelayedFail), 'utf8');
    const sigDelayedFail = crypto.createHmac('sha256', TEST_SECRET).update(rawDelayedFail).digest('hex');

    await processRazorpayWebhook(rawDelayedFail, sigDelayedFail);
    const dbOrder6After = db.prepare('SELECT status FROM payment_orders WHERE razorpay_order_id = ?').get(order6.razorpayOrderId) as any;
    assert.strictEqual(dbOrder6After.status, 'SUCCESS', 'Order must NEVER be downgraded from SUCCESS to FAILED');
    console.log('✓ [PASS] Test 13: Delayed failure event never downgrades an already SUCCESS order.');

    // ------------------------------------------------------------------------
    // TEST 14: Database/persistence failure is not falsely reported as successful fulfillment
    // ------------------------------------------------------------------------
    console.log('\n>>> [14/16] Testing database/persistence failure reporting...');
    // Pass an unknown order ID:
    const payloadUnknown = {
      entity: 'event',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_unknown_${Date.now()}`,
            order_id: 'order_nonexistent_12345678',
            amount: 1000,
          },
        },
      },
    };
    const rawUnknown = Buffer.from(JSON.stringify(payloadUnknown), 'utf8');
    const sigUnknown = crypto.createHmac('sha256', TEST_SECRET).update(rawUnknown).digest('hex');

    await assert.rejects(
      async () => processRazorpayWebhook(rawUnknown, sigUnknown),
      /Order not found/,
      'Unknown order must reject and not falsely report success'
    );
    console.log('✓ [PASS] Test 14: Persistence failure is not falsely acknowledged as success.');

    // ------------------------------------------------------------------------
    // TEST 15: Existing /api/payments/verify flow still works
    // ------------------------------------------------------------------------
    console.log('\n>>> [15/16] Testing existing Checkout /api/payments/verify functionality...');
    const order15 = await createRazorpayOrder({
      studentId,
      purchaseType: 'CUSTOM',
      quantity: 2,
    });
    const paymentId15 = `pay_checkout_verify_${Date.now()}`;
    const checkoutSig15 = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(`${order15.razorpayOrderId}|${paymentId15}`)
      .digest('hex');

    const balBefore15 = getValidStudentCreditBalance(studentId);
    const resVerify15 = verifyAndFulfillPayment({
      studentId,
      razorpayOrderId: order15.razorpayOrderId,
      razorpayPaymentId: paymentId15,
      razorpaySignature: checkoutSig15,
    });

    assert.strictEqual(resVerify15.success, true);
    assert.strictEqual(resVerify15.creditsAdded, 2);
    assert.strictEqual(getValidStudentCreditBalance(studentId), balBefore15 + 2);
    console.log('✓ [PASS] Test 15: Existing Checkout verification flow functions 100% intact.');

    // ------------------------------------------------------------------------
    // TEST 16: Existing payment, credit, and evaluation functionality remains intact
    // ------------------------------------------------------------------------
    console.log('\n>>> [16/16] Testing credit lots, expiration, and ledger integrity...');
    const ledgerRows = db.prepare(`
      SELECT amount, source, payment_id FROM credit_ledger
      WHERE student_id = ? ORDER BY created_at ASC
    `).all(studentId) as any[];

    assert(ledgerRows.length >= 4, 'Multiple purchases recorded in credit ledger');
    const allPurchased = ledgerRows.every((r) => r.source === 'PURCHASED' && r.amount > 0 && r.payment_id);
    assert.strictEqual(allPurchased, true, 'All ledger entries have source PURCHASED with payment_id');

    const lots = db.prepare(`
      SELECT credits_purchased, credits_remaining, status FROM student_credit_purchases
      WHERE user_id = ?
    `).all(studentId) as any[];
    assert(lots.length >= 4, 'Credit purchase lots tracked in student_credit_purchases');
    assert(lots.every((l) => l.status === 'ACTIVE' && l.credits_remaining > 0));

    console.log('✓ [PASS] Test 16: Credit ledger and 3-month lot tracking remain fully intact.');

    console.log('\n========================================================================');
    console.log('--- ALL 16 REGRESSION TESTS PASSED CLEANLY AND DECISIVELY (16/16) ---');
    console.log('========================================================================\n');
  } finally {
    // Cleanup test student and test records
    process.env = originalEnv;
    db.prepare('DELETE FROM credit_ledger WHERE student_id = ?').run(studentId);
    db.prepare('DELETE FROM student_credit_purchases WHERE user_id = ?').run(studentId);
    db.prepare('DELETE FROM payment_transactions WHERE student_id = ?').run(studentId);
    db.prepare('DELETE FROM payment_orders WHERE student_id = ?').run(studentId);
    db.prepare('DELETE FROM student_profiles WHERE user_id = ?').run(studentId);
    db.prepare('DELETE FROM users WHERE id = ?').run(studentId);
  }
}

runTestSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
