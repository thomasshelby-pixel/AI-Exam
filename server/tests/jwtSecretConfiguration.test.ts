import assert from 'node:assert/strict';
import { resolveJwtSecret } from '../config/jwtSecret.js';

assert.throws(
  () => resolveJwtSecret({ NODE_ENV: 'production' }),
  /JWT_SECRET environment variable is missing/,
  'Production must fail closed when no signing secret is configured.',
);

const configured = resolveJwtSecret({
  NODE_ENV: 'production',
  JWT_SECRET: 'a-production-secret-that-is-provided-by-the-secret-manager',
});
assert.equal(
  configured,
  'a-production-secret-that-is-provided-by-the-secret-manager',
  'Production must use the configured secret unchanged.',
);

const ephemeralA = resolveJwtSecret({ NODE_ENV: 'test' });
const ephemeralB = resolveJwtSecret({ NODE_ENV: 'test' });
assert.equal(ephemeralA.length, 128, 'The ephemeral development key must be 64 random bytes encoded as hex.');
assert.notEqual(ephemeralA, ephemeralB, 'A new process-local key must be generated when no environment key exists.');

console.log('PASS: JWT secret configuration fails closed in production and has no hardcoded fallback.');
