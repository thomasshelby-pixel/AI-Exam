import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAuthPortalScope, isAuthPortalRoleAllowed } from '../services/authPortalRole.js';

test('portal scope only narrows login to an existing role', () => {
  assert.equal(parseAuthPortalScope(undefined), null);
  assert.equal(parseAuthPortalScope(''), null);
  assert.equal(parseAuthPortalScope('student'), 'STUDENT');
  assert.equal(parseAuthPortalScope('SUPER_ADMIN'), 'SUPER_ADMIN');
  assert.equal(parseAuthPortalScope('INSTITUTE_ADMIN'), 'INVALID');
  assert.equal(parseAuthPortalScope({ role: 'SUPER_ADMIN' }), 'INVALID');

  assert.equal(isAuthPortalRoleAllowed('STUDENT', 'STUDENT'), true);
  assert.equal(isAuthPortalRoleAllowed('SUPER_ADMIN', 'STUDENT'), false);
  assert.equal(isAuthPortalRoleAllowed('MCQ_ADMIN', 'STUDENT'), false);
  assert.equal(isAuthPortalRoleAllowed('SUPER_ADMIN', 'SUPER_ADMIN'), true);
  assert.equal(isAuthPortalRoleAllowed('ADMIN', 'SUPER_ADMIN'), true);
  assert.equal(isAuthPortalRoleAllowed('STUDENT', 'SUPER_ADMIN'), false);
  assert.equal(isAuthPortalRoleAllowed('STUDENT', null), true);
});

test('login source contains no hard-coded or environment password bypass', () => {
  const source = readFileSync(new URL('../routes/authRoutes.ts', import.meta.url), 'utf8');
  assert.equal(source.includes('ADMIN_PASSWORD'), false);
  assert.equal(source.includes('envAdminPass'), false);
  assert.equal(source.includes('BgMi@2006'), false);
});

test('public sign-in page does not advertise the private operations entry', () => {
  const source = readFileSync(new URL('../../src/pages/auth/UnifiedAuthPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /ops-gate-73e1b4/i);
  assert.doesNotMatch(source, /PrivateAdminAccessPage/);
});

test('private back-office route is registered but has no public navigation entry', () => {
  const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  const publicAuthSource = readFileSync(new URL('../../src/pages/auth/UnifiedAuthPage.tsx', import.meta.url), 'utf8');
  assert.equal(appSource.includes('path="/ops-gate-73e1b4"'), true);
  assert.doesNotMatch(publicAuthSource, /ops-gate-73e1b4|PrivateAdminAccessPage/i);
  assert.equal(appSource.includes('Navigate to="/login?redirect=/admin/dashboard"'), false);
});
