import assert from 'node:assert/strict';
import { isInstituteMfaGateRequired } from '../../src/utils/instituteMfaGate.js';

assert.equal(
  isInstituteMfaGateRequired({
    role: 'INSTITUTE_ADMIN',
    mfaMandatory: false,
  }),
  false,
  'An explicit server-issued MFA exemption must bypass the Institute Portal setup gate.',
);

assert.equal(
  isInstituteMfaGateRequired({
    role: 'INSTITUTE_ADMIN',
    mfaMandatory: true,
  }),
  true,
  'A regular Institute Admin must remain blocked until MFA is complete.',
);

assert.equal(
  isInstituteMfaGateRequired({
    role: 'INSTITUTE_ADMIN',
  }),
  true,
  'Missing MFA policy must fail closed for older/stale user payloads.',
);

assert.equal(
  isInstituteMfaGateRequired({
    role: 'INSTITUTE',
  }),
  true,
  'Legacy INSTITUTE role remains MFA-protected by default.',
);

assert.equal(
  isInstituteMfaGateRequired({
    role: 'STUDENT',
    mfaMandatory: false,
  }),
  false,
  'Student accounts do not use the Institute Portal MFA gate.',
);

console.log('PASS: Institute Portal respects explicit server MFA exemptions while failing closed for normal admins.');
