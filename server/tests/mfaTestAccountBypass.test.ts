import assert from 'node:assert/strict';
import { isConfiguredInstituteTestAccountMfaBypass } from '../services/mfaTestAccountBypass.js';

const enabledEnv = {
  ENABLE_TEST_ACCOUNT_MFA_BYPASS: 'true',
  MFA_TEST_BYPASS_EMAIL: 'test@gmail.com',
};
const designatedTestAdmin = {
  email: 'test@gmail.com',
  role: 'INSTITUTE_ADMIN',
  status: 'ACTIVE',
  account_classification: 'TEST',
};

assert.equal(
  isConfiguredInstituteTestAccountMfaBypass(designatedTestAdmin, enabledEnv),
  true,
  'The designated active TEST Institute Admin may bypass MFA.',
);

assert.equal(
  isConfiguredInstituteTestAccountMfaBypass({
    ...designatedTestAdmin,
    email: 'TEST@gmail.com',
  }, enabledEnv),
  true,
  'The exact allowlisted email comparison is case-insensitive.',
);

assert.equal(
  isConfiguredInstituteTestAccountMfaBypass({
    ...designatedTestAdmin,
    email: 'another@gmail.com',
  }, enabledEnv),
  false,
  'Other Institute Admin accounts must keep mandatory MFA.',
);

assert.equal(
  isConfiguredInstituteTestAccountMfaBypass({
    ...designatedTestAdmin,
    role: 'SUPER_ADMIN',
  }, enabledEnv),
  false,
  'The test exception must never apply to Super Admin.',
);

assert.equal(
  isConfiguredInstituteTestAccountMfaBypass({
    ...designatedTestAdmin,
    status: 'SUSPENDED',
  }, enabledEnv),
  false,
  'Suspended accounts must not receive a bypass.',
);

assert.equal(
  isConfiguredInstituteTestAccountMfaBypass({
    ...designatedTestAdmin,
    account_classification: 'NORMAL',
  }, enabledEnv),
  false,
  'The designated email must also be persisted as a TEST account.',
);

assert.equal(
  isConfiguredInstituteTestAccountMfaBypass(designatedTestAdmin, {}),
  true,
  'The exact designated TEST account must still work when App Hosting has not injected optional YAML flags.',
);

assert.equal(
  isConfiguredInstituteTestAccountMfaBypass({
    ...designatedTestAdmin,
    email: 'another@gmail.com',
    account_classification: 'TEST',
  }, { ENABLE_TEST_ACCOUNT_MFA_BYPASS: 'true', MFA_TEST_BYPASS_EMAIL: 'other@gmail.com' }),
  true,
  'An alternate email is supported only when explicitly configured and TEST-classified.',
);

assert.equal(
  isConfiguredInstituteTestAccountMfaBypass({
    ...designatedTestAdmin,
    email: 'another@gmail.com',
  }, { MFA_TEST_BYPASS_EMAIL: 'another@gmail.com' }),
  false,
  'An email setting without explicit enablement and TEST classification is insufficient.',
);

console.log('✅ Test Institute Admin MFA bypass guard tests passed.');
