import test from 'node:test';
import assert from 'node:assert/strict';
import { getClientIp } from '../utils/rateLimiter.js';

test('rate limit client identity ignores a forged X-Forwarded-For header', () => {
  const req = {
    ip: '203.0.113.24',
    socket: { remoteAddress: '10.0.0.5' },
    headers: { 'x-forwarded-for': '8.8.8.8, 1.1.1.1' },
  } as any;

  assert.equal(getClientIp(req), '203.0.113.24');
});

test('rate limit client identity falls back to the socket address without req.ip', () => {
  const req = {
    socket: { remoteAddress: '::ffff:198.51.100.42' },
    headers: { 'x-forwarded-for': '8.8.8.8' },
  } as any;

  assert.equal(getClientIp(req), '198.51.100.42');
});
