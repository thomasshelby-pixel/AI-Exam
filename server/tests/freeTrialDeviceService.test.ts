import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Request, Response } from 'express';
import { getOrIssueFreeTrialDeviceSignals } from '../services/freeTrialDeviceService.js';

function makeResponse() {
  let cookieHeader: string | string[] | undefined;
  const response = {
    setHeader(name: string, value: string | string[]) {
      if (name.toLowerCase() === 'set-cookie') cookieHeader = value;
      return response;
    },
    getCookieHeader: () => cookieHeader,
  };
  return response as unknown as Response & { getCookieHeader: () => string | string[] | undefined };
}

function makeRequest(headers: Record<string, string> = {}) {
  return { headers } as unknown as Request;
}

test('free-trial cookie is signed, HttpOnly and stable for the same browser', () => {
  const before = {
    secret: process.env.TRIAL_ABUSE_HMAC_SECRET,
    jwt: process.env.JWT_SECRET,
    session: process.env.SESSION_SECRET,
    nodeEnv: process.env.NODE_ENV,
  };

  try {
    process.env.TRIAL_ABUSE_HMAC_SECRET = 'test-only-secret-for-free-trial-device-claims-2026';
    delete process.env.JWT_SECRET;
    delete process.env.SESSION_SECRET;
    process.env.NODE_ENV = 'production';

    const firstResponse = makeResponse();
    const first = getOrIssueFreeTrialDeviceSignals(
      makeRequest({ 'x-device-id': 'stable-device-id' }),
      firstResponse,
    );
    assert.match(first.deviceCookieHash || '', /^[a-f0-9]{64}$/);
    assert.match(first.clientDeviceHash || '', /^[a-f0-9]{64}$/);

    const header = firstResponse.getCookieHeader();
    const setCookie = Array.isArray(header) ? header[0] : header;
    assert.ok(setCookie);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /SameSite=Lax/);

    const cookiePair = setCookie.split(';')[0];
    const second = getOrIssueFreeTrialDeviceSignals(
      makeRequest({ cookie: cookiePair, 'x-device-id': 'stable-device-id' }),
      makeResponse(),
    );
    assert.deepEqual(second, first, 'same signed cookie and client device ID should map to the same keyed hashes');

    const sameCookieDifferentClient = getOrIssueFreeTrialDeviceSignals(
      makeRequest({ cookie: cookiePair, 'x-device-id': 'another-device-id' }),
      makeResponse(),
    );
    assert.equal(sameCookieDifferentClient.deviceCookieHash, first.deviceCookieHash);
    assert.notEqual(sameCookieDifferentClient.clientDeviceHash, first.clientDeviceHash);

    const cookieValue = decodeURIComponent(cookiePair.slice(cookiePair.indexOf('=') + 1));
    const [nonce] = cookieValue.split('.');
    const tamperedCookie = `ca_free_trial_device=${encodeURIComponent(nonce + '.' + '0'.repeat(64))}`;
    const tampered = getOrIssueFreeTrialDeviceSignals(
      makeRequest({ cookie: tamperedCookie, 'x-device-id': 'stable-device-id' }),
      makeResponse(),
    );
    assert.notEqual(tampered.deviceCookieHash, first.deviceCookieHash, 'tampered cookie must not retain the same device claim');
  } finally {
    if (before.secret === undefined) delete process.env.TRIAL_ABUSE_HMAC_SECRET; else process.env.TRIAL_ABUSE_HMAC_SECRET = before.secret;
    if (before.jwt === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = before.jwt;
    if (before.session === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = before.session;
    if (before.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before.nodeEnv;
  }
});

test('trial denial remains persistent through monthly resets and Firestore hydration', () => {
  const studentCredit = readFileSync(new URL('../services/studentCreditService.ts', import.meta.url), 'utf8');
  const authRoutes = readFileSync(new URL('../routes/authRoutes.ts', import.meta.url), 'utf8');
  const database = readFileSync(new URL('../db.ts', import.meta.url), 'utf8');
  const hydration = readFileSync(new URL('../services/firestoreSyncService.ts', import.meta.url), 'utf8');

  assert.match(authRoutes, /free_trial_eligible, created_at, updated_at/);
  assert.match(authRoutes, /reserveFreeTrialForAccount/);
  assert.match(authRoutes, /finalizeFreeTrialForAccount/);
  assert.match(studentCredit, /SELECT free_trial_eligible FROM users WHERE id = \?/);
  assert.match(studentCredit, /const freeTrialLimit = trialEligible \? 2 : 0/);
  assert.match(database, /addColumnIfNotExists\('users', 'free_trial_eligible', 'INTEGER NOT NULL DEFAULT 1'\)/);
  assert.match(hydration, /free_trial_eligible = CASE WHEN users\.free_trial_eligible = 1 THEN 1 ELSE excluded\.free_trial_eligible END/);
});
