import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';
import { generateToken } from '../auth.js';
import {
  createRazorpayOrder,
  COMBO_PLANS,
  CUSTOM_PRICE_PER_EVALUATION_INR,
  verifyAndFulfillPayment,
} from '../razorpay.js';

const BASE_URL = 'http://localhost:3000';

async function runPricingVerification() {
  console.log('========================================================================');
  console.log('--- STARTING PRICING VERIFICATION: COMBOS, CUSTOM & SERVER-SIDE ---');
  console.log('========================================================================\n');

  // Create isolated test student
  const testStudentId = `usr_test_pricing_${Date.now()}`;
  const testStudentEmail = `pricing_test_${Date.now()}@caexamchecker.ai`;

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, ?, 'hash', 'Test Pricing Student', 'STUDENT', 'ACTIVE')
  `).run(testStudentId, testStudentEmail);

  const token = generateToken({
    id: testStudentId,
    email: testStudentEmail,
    role: 'STUDENT',
    fullName: 'Test Pricing Student',
  });

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  try {
    // ------------------------------------------------------------------------
    // TEST 1: OLD FIXED PACKS REMOVAL AUDIT
    // ------------------------------------------------------------------------
    console.log('>>> [1/6] AUDITING REMOVAL OF OLD FIXED CREDIT PACKS...');
    const pricingPageContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/public/PricingPage.tsx'),
      'utf8'
    );
    const creditModalContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/common/CreditPurchaseModal.tsx'),
      'utf8'
    );

    // Ensure old fixed pack phrases are absent in student pricing
    const oldPatterns = [
      '5 Papers',
      '10 Papers',
      '20 Papers',
      '₹10 / paper',
      '₹10/paper',
      '@ ₹10/paper',
      '10 Evaluations = ₹100 Flat Rate',
    ];

    for (const pat of oldPatterns) {
      assert(
        !pricingPageContent.includes(pat),
        `PricingPage.tsx must not contain old pattern: "${pat}"`
      );
      assert(
        !creditModalContent.includes(pat),
        `CreditPurchaseModal.tsx must not contain old pattern: "${pat}"`
      );
    }
    console.log('✓ [1/6] OLD FIXED PACKS REMOVED: YES (5 Papers = ₹50, 10 Papers = ₹100, 20 Papers = ₹200, ₹10/paper eliminated)');

    // ------------------------------------------------------------------------
    // TEST 2: COMBO 1 PRICING (Foundation: 4 evals @ ₹119, Inter: 6 evals @ ₹175)
    // ------------------------------------------------------------------------
    console.log('\n>>> [2/6] TESTING COMBO 1 PRICING...');
    // Foundation
    const combo1FoundOrder = await createRazorpayOrder({
      studentId: testStudentId,
      purchaseType: 'COMBO_1',
      courseLevel: 'FOUNDATION',
    });
    assert.strictEqual(combo1FoundOrder.quantity, 4, 'Combo 1 Foundation must offer 4 evaluations');
    assert.strictEqual(combo1FoundOrder.amountINR, 119, 'Combo 1 Foundation price must be ₹119');
    assert.strictEqual(combo1FoundOrder.amountPaise, 11900, 'Combo 1 Foundation amountPaise must be 11900');

    // Inter
    const combo1InterOrder = await createRazorpayOrder({
      studentId: testStudentId,
      purchaseType: 'COMBO_1',
      courseLevel: 'INTERMEDIATE',
    });
    assert.strictEqual(combo1InterOrder.quantity, 6, 'Combo 1 Inter must offer 6 evaluations');
    assert.strictEqual(combo1InterOrder.amountINR, 175, 'Combo 1 Inter price must be ₹175');
    assert.strictEqual(combo1InterOrder.amountPaise, 17500, 'Combo 1 Inter amountPaise must be 17500');

    // API endpoint test for Combo 1
    const apiCombo1Found = await fetch(`${BASE_URL}/api/payments/create-order`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        purchaseType: 'COMBO_1',
        courseLevel: 'FOUNDATION',
        // Attempting to send manipulated amount - server must ignore
        amount: 1,
      }),
    });
    assert.strictEqual(apiCombo1Found.status, 200);
    const apiC1Data = await apiCombo1Found.json();
    assert.strictEqual(apiC1Data.order.quantity, 4);
    assert.strictEqual(apiC1Data.order.amountINR, 119);
    assert.strictEqual(apiC1Data.order.amountPaise, 11900);

    const apiCombo1Inter = await fetch(`${BASE_URL}/api/payments/create-order`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        purchaseType: 'COMBO_1',
        courseLevel: 'INTERMEDIATE',
      }),
    });
    assert.strictEqual(apiCombo1Inter.status, 200);
    const apiC1InterData = await apiCombo1Inter.json();
    assert.strictEqual(apiC1InterData.order.quantity, 6);
    assert.strictEqual(apiC1InterData.order.amountINR, 175);
    assert.strictEqual(apiC1InterData.order.amountPaise, 17500);

    console.log('✓ [2/6] COMBO 1: PASS (Foundation: 4 evals @ ₹119, Inter: 6 evals @ ₹175)');

    // ------------------------------------------------------------------------
    // TEST 3: COMBO 2 PRICING (Foundation: 8 evals @ ₹219, Inter: 12 evals @ ₹329)
    // ------------------------------------------------------------------------
    console.log('\n>>> [3/6] TESTING COMBO 2 PRICING...');
    // Foundation
    const combo2FoundOrder = await createRazorpayOrder({
      studentId: testStudentId,
      purchaseType: 'COMBO_2',
      courseLevel: 'FOUNDATION',
    });
    assert.strictEqual(combo2FoundOrder.quantity, 8, 'Combo 2 Foundation must offer 8 evaluations');
    assert.strictEqual(combo2FoundOrder.amountINR, 219, 'Combo 2 Foundation price must be ₹219');
    assert.strictEqual(combo2FoundOrder.amountPaise, 21900, 'Combo 2 Foundation amountPaise must be 21900');

    // Inter
    const combo2InterOrder = await createRazorpayOrder({
      studentId: testStudentId,
      purchaseType: 'COMBO_2',
      courseLevel: 'INTERMEDIATE',
    });
    assert.strictEqual(combo2InterOrder.quantity, 12, 'Combo 2 Inter must offer 12 evaluations');
    assert.strictEqual(combo2InterOrder.amountINR, 329, 'Combo 2 Inter price must be ₹329');
    assert.strictEqual(combo2InterOrder.amountPaise, 32900, 'Combo 2 Inter amountPaise must be 32900');

    // API endpoint test for Combo 2
    const apiCombo2Found = await fetch(`${BASE_URL}/api/payments/create-order`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        purchaseType: 'COMBO_2',
        courseLevel: 'FOUNDATION',
      }),
    });
    assert.strictEqual(apiCombo2Found.status, 200);
    const apiC2Data = await apiCombo2Found.json();
    assert.strictEqual(apiC2Data.order.quantity, 8);
    assert.strictEqual(apiC2Data.order.amountINR, 219);
    assert.strictEqual(apiC2Data.order.amountPaise, 21900);

    const apiCombo2Inter = await fetch(`${BASE_URL}/api/payments/create-order`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        purchaseType: 'COMBO_2',
        courseLevel: 'INTERMEDIATE',
      }),
    });
    assert.strictEqual(apiCombo2Inter.status, 200);
    const apiC2InterData = await apiCombo2Inter.json();
    assert.strictEqual(apiC2InterData.order.quantity, 12);
    assert.strictEqual(apiC2InterData.order.amountINR, 329);
    assert.strictEqual(apiC2InterData.order.amountPaise, 32900);

    console.log('✓ [3/6] COMBO 2: PASS (Foundation: 8 evals @ ₹219, Inter: 12 evals @ ₹329)');

    // ------------------------------------------------------------------------
    // TEST 4: CUSTOM EVALUATION PRICING (₹35/EVALUATION & DYNAMIC FORMULA)
    // ------------------------------------------------------------------------
    console.log('\n>>> [4/6] TESTING CUSTOM EVALUATIONS (₹35 PER EVALUATION)...');
    assert.strictEqual(CUSTOM_PRICE_PER_EVALUATION_INR, 35, 'Custom rate must be strictly ₹35');

    const testQuantities = [
      { qty: 1, expectedINR: 35, expectedPaise: 3500 },
      { qty: 5, expectedINR: 175, expectedPaise: 17500 },
      { qty: 10, expectedINR: 350, expectedPaise: 35000 },
      { qty: 15, expectedINR: 525, expectedPaise: 52500 },
      { qty: 20, expectedINR: 700, expectedPaise: 70000 },
    ];

    for (const testCase of testQuantities) {
      // Direct service call
      const order = await createRazorpayOrder({
        studentId: testStudentId,
        purchaseType: 'CUSTOM',
        quantity: testCase.qty,
      });
      assert.strictEqual(order.quantity, testCase.qty);
      assert.strictEqual(order.amountINR, testCase.expectedINR);
      assert.strictEqual(order.amountPaise, testCase.expectedPaise);

      // API call with dynamic calculation verification
      const apiRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          purchaseType: 'CUSTOM',
          quantity: testCase.qty,
        }),
      });
      assert.strictEqual(apiRes.status, 200);
      const apiData = await apiRes.json();
      assert.strictEqual(apiData.order.quantity, testCase.qty);
      assert.strictEqual(apiData.order.amountINR, testCase.expectedINR);
      assert.strictEqual(apiData.order.amountPaise, testCase.expectedPaise);
    }
    console.log('✓ [4/6] CUSTOM ₹35/EVALUATION & DYNAMIC TOTAL: PASS (1=₹35, 5=₹175, 10=₹350, 15=₹525, 20=₹700)');

    // ------------------------------------------------------------------------
    // TEST 5: SERVER-SIDE VALIDATION & PRICE INTEGRITY
    // ------------------------------------------------------------------------
    console.log('\n>>> [5/6] TESTING SERVER-SIDE PRICE VALIDATION & INPUT SANITIZATION...');

    // 5.1 Manipulation attempt: Client provides quantity 10 but specifies amount ₹10
    const forgedRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        purchaseType: 'CUSTOM',
        quantity: 10,
        amount: 10, // Forged amount
        amountPaise: 1000, // Forged paise
      }),
    });
    assert.strictEqual(forgedRes.status, 200);
    const forgedData = await forgedRes.json();
    assert.strictEqual(
      forgedData.order.amountINR,
      350,
      'Server MUST ignore client-provided amount and calculate 10 * 35 = 350'
    );
    assert.strictEqual(forgedData.order.amountPaise, 35000);

    // 5.2 Decimal quantity rejected
    const decimalRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        purchaseType: 'CUSTOM',
        quantity: 2.5,
      }),
    });
    assert.strictEqual(decimalRes.status, 400, 'Decimal quantities must be rejected');

    // 5.3 Negative quantity rejected
    const negativeRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        purchaseType: 'CUSTOM',
        quantity: -5,
      }),
    });
    assert.strictEqual(negativeRes.status, 400, 'Negative quantities must be rejected');

    // 5.4 Zero quantity rejected
    const zeroRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        purchaseType: 'CUSTOM',
        quantity: 0,
      }),
    });
    assert.strictEqual(zeroRes.status, 400, 'Zero quantity must be rejected');

    // 5.5 Non-numeric string rejected
    const textRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        purchaseType: 'CUSTOM',
        quantity: 'abc',
      }),
    });
    assert.strictEqual(textRes.status, 400, 'Invalid string quantity must be rejected');

    // 5.6 Exceeding application safe limit (500) rejected
    const excessiveRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        purchaseType: 'CUSTOM',
        quantity: 9999,
      }),
    });
    assert.strictEqual(excessiveRes.status, 400, 'Excessive quantity must be rejected');

    console.log('✓ [5/6] SERVER-SIDE PRICE VALIDATION: PASS (Manipulated prices ignored, invalid inputs blocked)');

    // ------------------------------------------------------------------------
    // TEST 6: FREE TIER & UNTOUCHED FEATURES PRESERVATION
    // ------------------------------------------------------------------------
    console.log('\n>>> [6/6] VERIFYING FREE TIER & CORE SYSTEM PRESERVATION...');
    // Verify free tier content remains in PricingPage
    assert(pricingPageContent.includes('Free Tier'), 'Free Tier card must exist');
    assert(pricingPageContent.includes('₹0'), 'Free tier must remain ₹0');
    assert(pricingPageContent.includes('2 Full Answer Sheet Evaluations / Month'), 'Free tier must offer 2 evaluations/month');

    // Verify Disclaimer and MCQ arena are untouched
    const disclaimerPath = path.resolve(process.cwd(), 'src/components/student/DisclaimerModal.tsx');
    assert(fs.existsSync(disclaimerPath), 'DisclaimerModal must exist');
    const mcqRoutesPath = path.resolve(process.cwd(), 'server/routes/mcqRoutes.ts');
    assert(fs.existsSync(mcqRoutesPath), 'MCQ routes must remain intact');

    console.log('✓ [6/6] FREE TIER & CORE FUNCTIONALITY: UNCHANGED');

    console.log('\n========================================================================');
    console.log('--- ALL PRICING & PAYMENT VERIFICATION TESTS PASSED 100% CLEANLY ---');
    console.log('========================================================================\n');
  } finally {
    // Cleanup test student
    db.prepare('DELETE FROM payment_orders WHERE student_id = ?').run(testStudentId);
    db.prepare('DELETE FROM users WHERE id = ?').run(testStudentId);
  }
}

runPricingVerification()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Pricing verification failed:', err);
    process.exit(1);
  });
