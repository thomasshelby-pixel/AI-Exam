import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { db, initDatabase } from '../db.js';
import {
  getStudentSignupPlatformCounts,
  resolveSignupPlatform,
} from '../services/signupPlatformService.js';

async function run() {
  initDatabase();

  const suffix = randomBytes(6).toString('hex');
  const fixtures = [
    { id: `usr_signup_app_${suffix}`, email: `signup-app-${suffix}@example.test`, platform: 'APP', classification: 'NORMAL' },
    { id: `usr_signup_web_${suffix}`, email: `signup-web-${suffix}@example.test`, platform: 'WEB', classification: 'NORMAL' },
    { id: `usr_signup_unknown_${suffix}`, email: `signup-unknown-${suffix}@example.test`, platform: 'UNKNOWN', classification: 'NORMAL' },
    { id: `usr_signup_test_${suffix}`, email: `signup-test-${suffix}@example.test`, platform: 'APP', classification: 'TEST' },
  ];

  const before = getStudentSignupPlatformCounts();
  try {
    for (const fixture of fixtures) {
      db.prepare(`
        INSERT INTO users (
          id, email, password_hash, full_name, role, status,
          account_classification, signup_platform
        ) VALUES (?, ?, 'test-hash', 'Signup Platform Test', 'STUDENT', 'ACTIVE', ?, ?)
      `).run(fixture.id, fixture.email, fixture.classification, fixture.platform);
    }

    const after = getStudentSignupPlatformCounts();
    assert.equal(after.app, before.app + 1, 'one normal APP sign-up should be counted');
    assert.equal(after.web, before.web + 1, 'one WEB sign-up should be counted');
    assert.equal(after.unknown, before.unknown + 1, 'unattributed account should remain UNKNOWN');
    assert.equal(after.total, before.total + 3, 'TEST accounts must be excluded from source totals');

    assert.equal(resolveSignupPlatform({ clientPlatform: 'android_app' }), 'APP');
    assert.equal(resolveSignupPlatform({ clientPlatform: 'WEB' }), 'WEB');
    assert.equal(
      resolveSignupPlatform({
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel Build/ABC; wv) AppleWebKit/537.36 Version/4.0 Chrome/128.0 Mobile Safari/537.36',
      }),
      'APP',
      'legacy Android WebView clients should be identified when possible'
    );
    assert.equal(resolveSignupPlatform({ origin: 'capacitor://localhost' }), 'APP');
    assert.equal(resolveSignupPlatform({ origin: 'https://caexamcheckerai.com' }), 'WEB');
    assert.equal(resolveSignupPlatform({ userAgent: 'curl/8.0' }), 'UNKNOWN');

    console.log('PASS: signup platform attribution, dashboard counts, and test-account exclusion');
  } finally {
    const ids = fixtures.map((fixture) => fixture.id);
    db.prepare(`DELETE FROM users WHERE id IN (${ids.map(() => '?').join(', ')})`).run(...ids);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
