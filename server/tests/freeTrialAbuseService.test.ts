import assert from 'node:assert/strict';
import {
  getTrustedAppHostingClientIp,
  hashFreeTrialSignal,
  normalizeIpAddress,
  signTrialDeviceCookie,
  verifyTrialDeviceCookie,
} from '../services/freeTrialAbuseService.js';

const envBefore = {
  secret: process.env.TRIAL_ABUSE_HMAC_SECRET,
  jwt: process.env.JWT_SECRET,
  session: process.env.SESSION_SECRET,
  nodeEnv: process.env.NODE_ENV,
  xffIndex: process.env.FREE_TRIAL_XFF_CLIENT_IP_INDEX_FROM_RIGHT,
};

try {
  process.env.TRIAL_ABUSE_HMAC_SECRET = 'test-only-secret-for-free-trial-abuse-tests-2026';
  process.env.NODE_ENV = 'production';
  process.env.FREE_TRIAL_XFF_CLIENT_IP_INDEX_FROM_RIGHT = '2';

  // Signed opaque device-cookie validation: valid cookie passes; modified signature fails.
  const nonce = 'a'.repeat(64);
  const signedCookie = signTrialDeviceCookie(nonce);
  assert.ok(signedCookie, 'A configured stable secret should sign the device cookie.');
  assert.equal(verifyTrialDeviceCookie(signedCookie), nonce);
  const pieces = signedCookie.split('.');
  pieces[1] = `${pieces[1][0] === 'a' ? 'b' : 'a'}${pieces[1].slice(1)}`;
  assert.equal(verifyTrialDeviceCookie(pieces.join('.')), null, 'Tampered cookies must not be trusted.');
  assert.equal(verifyTrialDeviceCookie('not-a-signed-cookie'), null);

  // Device/IP signals are keyed, deterministic, and domain-separated.
  const ipHash = hashFreeTrialSignal('ip', '192.0.2.45');
  assert.ok(ipHash);
  assert.equal(hashFreeTrialSignal('ip', '192.0.2.45'), ipHash);
  assert.notEqual(hashFreeTrialSignal('client-device', '192.0.2.45'), ipHash);
  assert.notEqual(hashFreeTrialSignal('ip', '192.0.2.46'), ipHash);
  assert.equal(normalizeIpAddress('::ffff:192.0.2.45'), '192.0.2.45');
  assert.equal(normalizeIpAddress('[2001:db8::1]'), '2001:db8::1');
  assert.equal(normalizeIpAddress('not-an-ip'), null);

  // Ignore any client-controlled leading XFF value and read the trusted client hop
  // relative to the right side of the Google load-balancer chain.
  const trustedIp = getTrustedAppHostingClientIp({
    'x-forwarded-for': '198.51.100.222, 203.0.113.45, 192.0.2.1',
  });
  assert.equal(trustedIp, '203.0.113.45');
  assert.equal(
    getTrustedAppHostingClientIp({ 'x-forwarded-for': '198.51.100.222' }),
    null,
    'In production, a short/unexpected proxy chain must fail closed rather than trust a client-supplied IP.'
  );

  console.log('[PASS] Free-trial cookie signing, privacy-preserving hashes, IP normalization, and trusted XFF parsing.');
} finally {
  if (envBefore.secret === undefined) delete process.env.TRIAL_ABUSE_HMAC_SECRET; else process.env.TRIAL_ABUSE_HMAC_SECRET = envBefore.secret;
  if (envBefore.jwt === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = envBefore.jwt;
  if (envBefore.session === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = envBefore.session;
  if (envBefore.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = envBefore.nodeEnv;
  if (envBefore.xffIndex === undefined) delete process.env.FREE_TRIAL_XFF_CLIENT_IP_INDEX_FROM_RIGHT; else process.env.FREE_TRIAL_XFF_CLIENT_IP_INDEX_FROM_RIGHT = envBefore.xffIndex;
}
