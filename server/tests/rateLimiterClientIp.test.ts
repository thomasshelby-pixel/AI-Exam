import { strict as assert } from 'node:assert';
import type { Request } from 'express';
import { getClientIp } from '../utils/rateLimiter.js';

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    ip: '203.0.113.25',
    headers: { 'x-forwarded-for': '198.51.100.99, 192.0.2.50' },
    socket: { remoteAddress: '10.0.0.8' },
    ...overrides,
  } as unknown as Request;
}

assert.equal(
  getClientIp(makeRequest()),
  '203.0.113.25',
  'rate-limit key uses Express-resolved client IP, not spoofable X-Forwarded-For'
);
assert.equal(
  getClientIp(makeRequest({ ip: undefined, socket: { remoteAddress: '10.0.0.8' } as any })),
  '10.0.0.8',
  'socket address is the fallback when Express has no resolved IP'
);

console.log('Rate limiter client-IP tests: 2/2 passed.');
