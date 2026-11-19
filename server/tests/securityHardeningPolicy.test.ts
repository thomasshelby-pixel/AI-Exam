import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const server = readFileSync(resolve(process.cwd(), 'server.ts'), 'utf8');
const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const limiter = readFileSync(resolve(process.cwd(), 'server/utils/rateLimiter.ts'), 'utf8');

assert.match(
  server,
  /app\.get\('\/api\/health\/email',\s*authenticateToken,\s*requireRole\('SUPER_ADMIN'\)/,
  'Email diagnostics must require an authenticated Super Admin.',
);
assert.match(
  server,
  /app\.get\('\/api\/health\/persistence',\s*authenticateToken,\s*requireRole\('SUPER_ADMIN'\)/,
  'Persistence diagnostics must require an authenticated Super Admin.',
);
assert.match(
  rules,
  /match \/\{document=\*\*\} \{\s*allow read, write: if false;/,
  'Firestore must have a global client default-deny rule.',
);
assert.doesNotMatch(
  rules,
  /allow\s+(?:read|write|read,\s*write|create|update|delete)\s*:\s*if\s+true\s*;/,
  'No collection-specific rule may reopen direct client access.',
);
assert.match(
  limiter,
  /return req\.ip \|\| req\.socket\.remoteAddress/,
  'Rate limiting must use Express-resolved client identity, not arbitrary forwarding headers.',
);
assert.doesNotMatch(
  limiter,
  /x-forwarded-for.*split\(\s*','\s*\)\[0\]/i,
  'The left-most caller-controlled X-Forwarded-For value must never be trusted directly.',
);

console.log('PASS: sensitive health diagnostics, Firestore client rules and proxy-aware rate-limit policy are hardened.');
