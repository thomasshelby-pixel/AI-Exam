import assert from 'node:assert/strict';
import { initDatabase, db, hashPassword } from '../db.js';
import { normalizePhoneToE164 } from '../services/smsService.js';
import { consumePendingPhoneRegistration, isStudentPhoneRegistered, savePendingPhoneRegistration } from '../services/studentPhoneRegistrationService.js';
import { verifyMsg91WidgetAccessToken } from '../services/msg91Service.js';

async function run() {
  initDatabase();

  assert.equal(normalizePhoneToE164('9876543210').canonicalPhoneE164, '+919876543210');
  assert.equal(normalizePhoneToE164('+91 98765-43210').canonicalPhoneE164, '+919876543210');
  assert.equal(normalizePhoneToE164('not-a-phone').canonicalPhoneE164, null);
  console.log('[PASS] Indian mobile number normalization.');

  const email = `msg91-phone-test-${Date.now()}@example.invalid`;
  const secondEmail = `msg91-phone-test-secondary-${Date.now()}@example.invalid`;
  const phone = `+9198765${String(Date.now()).slice(-5)}`;

  try {
    const pending = savePendingPhoneRegistration({
      email,
      fullName: 'MSG91 Integration Test',
      passwordHash: hashPassword('NotARealPassword123!'),
      phone,
      icaiRegistrationNumber: 'CRO0123456',
      caLevel: 'INTERMEDIATE',
      clientIp: '127.0.0.1',
    });
    assert.equal(pending.success, true, pending.message);
    assert.equal(isStudentPhoneRegistered(phone), false);

    const duplicatePending = savePendingPhoneRegistration({
      email: secondEmail,
      fullName: 'Duplicate Phone Test',
      passwordHash: hashPassword('NotARealPassword123!'),
      phone,
      icaiRegistrationNumber: 'NRO0123456',
      caLevel: 'INTERMEDIATE',
    });
    assert.equal(duplicatePending.success, false, 'One phone must not be reserved by two pending registrations');

    const wrongNumber = consumePendingPhoneRegistration(email, '+919999999999');
    assert.equal(wrongNumber.success, false);
    assert.match(wrongNumber.message, /does not match/i);

    const consumed = consumePendingPhoneRegistration(email, phone);
    assert.equal(consumed.success, true, consumed.message);
    assert.equal(consumed.registrationData?.email, email);
    assert.equal(
      db.prepare('SELECT email FROM student_phone_registration_pending WHERE email = ?').get(email),
      undefined,
      'Consumed pending registration should be deleted'
    );
    console.log('[PASS] Pending phone challenge binds to the verified number and enforces pending-number uniqueness.');

    const previousAuthkey = process.env.MSG91_AUTHKEY;
    const originalFetch = globalThis.fetch;
    try {
      delete process.env.MSG91_AUTHKEY;
      const unconfigured = await verifyMsg91WidgetAccessToken('dummy.jwt.token');
      assert.equal(unconfigured.success, false);
      assert.match(unconfigured.error || '', /not configured/i);

      process.env.MSG91_AUTHKEY = 'unit-test-authkey';
      let requestBody: any = null;
      globalThis.fetch = (async (_input: any, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body || '{}'));
        return new Response(JSON.stringify({ type: 'success', message: '919876543210' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch;

      const verified = await verifyMsg91WidgetAccessToken('dummy.jwt.token');
      assert.equal(verified.success, true);
      assert.equal(verified.phoneE164, '+919876543210');
      assert.equal(requestBody.authkey, 'unit-test-authkey');
      assert.equal(requestBody['access-token'], 'dummy.jwt.token');

      globalThis.fetch = (async () => new Response(JSON.stringify({
        type: 'error', code: '201', message: 'AuthenticationFailure',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

      const failed = await verifyMsg91WidgetAccessToken('dummy.jwt.token');
      assert.equal(failed.success, false, 'HTTP 200 with provider error body must fail closed');
      console.log('[PASS] MSG91 token validation fails closed and checks the provider response body.');
    } finally {
      globalThis.fetch = originalFetch;
      if (previousAuthkey === undefined) delete process.env.MSG91_AUTHKEY;
      else process.env.MSG91_AUTHKEY = previousAuthkey;
    }
  } finally {
    db.prepare('DELETE FROM student_phone_registration_pending WHERE email IN (?, ?)').run(email, secondEmail);
  }

  console.log('\nMSG91 phone OTP security tests completed.');
}

run().catch((error) => {
  console.error('[FAIL] MSG91 phone OTP security tests failed:', error);
  process.exitCode = 1;
});
