import assert from 'node:assert/strict';
import { isConfiguredInstituteTestAccountMfaBypass } from '../services/mfaTestAccountBypass.js';

const enabledEnv = {
  ENABLE_TEST_ACCOUNT_MFA_BYPASS: 'true',
  MFA_TEST_BYPASS_EMAIL: 'test@gmail.com',
};

assert.equal(
  isConfiguredInstituteTestAccountMfaBypass({
    email: 'test@gmail.com',
    role: 'INSTITUTE_ADMIN',
    status: 'ACTIVE',
  }, enabledEnv),
  true,
  'The explicitly configured active test Institute Admin may bypass MFA.',
);

assert.equal(
  isConfiguredInstituteTestAccountMfaBypass({
    email: 'TEST@gmail.com',
    role: 'INSTITUTE_ADMIN',
    status: 'ACTIVE',
  }, enabledEnv),
  true,
  'The exact allowlisted email comparison is case-insensitive.',
);

assert.equal(
  isConfiguredInstituteTestAccountMfaBypass({
    email: 'another@gmail.com',
    role: 'INSTITUTE_ADMIN',
    status: 'ACTIVE',
  }, enabledEnv),
  false,
  'Other Institute Admin accounts must keep mandatory MFA.',
);

assert.equal(
  isConfiguredInstituteTestAccountMfaBypass({
    email: 'test@gmail.com',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
  }, enabledEnv),
  false,
  'The test exception must never apply to Super Admin.',
);

assert.equal(
  isConfiguredInstituteTestAccountMfaBypass({
    email: 'test@gmail.com',
    role: 'INSTITUTE_ADMIN',
    status: 'SUSPENDED',
  }, enabledEnv),
  false,
  'Suspended accounts must not receive a bypass.',
);

assert.equal(
  isConfiguredInstituteTestAccountMfaBypass({
    email: 'test@gmail.com',
    role: 'INSTITUTE_ADMIN',
    status: 'ACTIVE',
  }, { MFA_TEST_BYPASS_EMAIL: 'test@gmail.com' }),
  false,
  'The email alone is insufficient without explicit deployment opt-in.',
);

assert.equal(
  isConfiguredInstituteTestAccountMfaBypass({
    email: 'test@gmail.com',
    role: 'INSTITUTE_ADMIN',
    status: 'ACTIVE',
  }, { ...enabledEnv, MFA_TEST_BYPASS_EMAIL: 'other@gmail.com' }),
  false,
  'The bypass cannot be transferred to an unconfigured address.',
);

console.log('✅ Test Institute Admin MFA bypass guard tests passed.');
