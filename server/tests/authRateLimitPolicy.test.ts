import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import {
  otpVerifyRateLimiter,
  passwordResetTokenVerifyRateLimiter,
  mfaEnrollmentVerifyRateLimiter,
} from '../utils/rateLimiter.js';

process.env.NODE_ENV = 'test';

type InvokeResult = {
  statusCode: number;
  headers: Record<string, string>;
  body?: any;
  nextCalled: boolean;
};

function invokeLimiter(
  limiter: (req: Request, res: Response, next: NextFunction) => void,
  ip: string,
  email = 'student@example.com',
): InvokeResult {
  const result: InvokeResult = { statusCode: 200, headers: {}, nextCalled: false };
  const req = {
    ip,
    socket: { remoteAddress: ip },
    headers: {},
    body: { email },
  } as unknown as Request;
  const res = {
    headersSent: false,
    setHeader(name: string, value: string) {
      result.headers[name] = value;
      return this;
    },
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
  } as unknown as Response;
  limiter(req, res, (() => { result.nextCalled = true; }) as NextFunction);
  return result;
}

// Registration OTP verification is 15 attempts per 5 minutes (challenge validity stays 10 minutes).
const otpIp = '198.51.100.211';
const otpFirst = invokeLimiter(otpVerifyRateLimiter, otpIp, 'otp-five-minute@example.com');
assert.equal(otpFirst.headers['RateLimit-Limit'], '15');
assert.ok(Number(otpFirst.headers['RateLimit-Reset']) > 0);
assert.ok(Number(otpFirst.headers['RateLimit-Reset']) <= 300);
assert.equal(otpFirst.statusCode, 200);
for (let attempt = 0; attempt < 14; attempt += 1) {
  const response = invokeLimiter(otpVerifyRateLimiter, otpIp, 'otp-five-minute@example.com');
  assert.equal(response.statusCode, 200, 'first 15 OTP-verification requests should be allowed');
}
const otpBlocked = invokeLimiter(otpVerifyRateLimiter, otpIp, 'otp-five-minute@example.com');
assert.equal(otpBlocked.statusCode, 429);
assert.equal(otpBlocked.body.code, 'RATE_LIMIT_EXCEEDED');

// Password reset link verification now has its own 5-request / 5-minute limiter.
const resetFirst = invokeLimiter(passwordResetTokenVerifyRateLimiter, '198.51.100.212', 'reset-token@example.com');
assert.equal(resetFirst.headers['RateLimit-Limit'], '5');
assert.ok(Number(resetFirst.headers['RateLimit-Reset']) <= 300);
for (let attempt = 0; attempt < 4; attempt += 1) {
  assert.equal(invokeLimiter(passwordResetTokenVerifyRateLimiter, '198.51.100.212', 'reset-token@example.com').statusCode, 200);
}
const resetBlocked = invokeLimiter(passwordResetTokenVerifyRateLimiter, '198.51.100.212', 'reset-token@example.com');
assert.equal(resetBlocked.statusCode, 429);

// MFA enrollment has a shared-store 20-request/IP cap plus a separate per-user
// five-failed-code/15-minute lockout applied in its route handler.
const mfaFirst = invokeLimiter(mfaEnrollmentVerifyRateLimiter, '198.51.100.213');
assert.equal(mfaFirst.headers['RateLimit-Limit'], '20');
assert.ok(Number(mfaFirst.headers['RateLimit-Reset']) <= 900);

console.log('Auth rate-limit policy tests: OTP 5-minute window, reset-token cap, and MFA enrollment cap passed.');
