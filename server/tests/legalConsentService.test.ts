import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db } from '../db.js';
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  getLegalConsentStatus,
  recordCurrentLegalAcceptances,
} from '../services/legalConsentService.js';

const userId = `usr_legal_consent_test_${crypto.randomBytes(8).toString('hex')}`;

const initial = getLegalConsentStatus(userId, 'STUDENT');
assert.equal(initial.required, true);
assert.equal(initial.termsVersion, CURRENT_TERMS_VERSION);
assert.equal(initial.privacyVersion, CURRENT_PRIVACY_VERSION);
assert.equal(initial.termsAccepted, false);
assert.equal(initial.privacyAccepted, false);
assert.equal(initial.needsAcceptance, true);

assert.throws(() => recordCurrentLegalAcceptances({
  userId,
  termsAccepted: true,
  privacyAccepted: false,
}), /Both the Terms/);

recordCurrentLegalAcceptances({
  userId,
  termsAccepted: true,
  privacyAccepted: true,
  ipAddress: '127.0.0.1',
  userAgent: 'legal-consent-test',
});

const finalStatus = getLegalConsentStatus(userId, 'STUDENT');
assert.equal(finalStatus.termsAccepted, true);
assert.equal(finalStatus.privacyAccepted, true);
assert.equal(finalStatus.needsAcceptance, false);

const rows = db.prepare(`
  SELECT doc_type, version, acknowledged_at, ip_address, user_agent
  FROM legal_acknowledgements WHERE user_id = ?
`).all(userId) as Array<{ doc_type: string; version: string; acknowledged_at: string; ip_address: string | null; user_agent: string | null }>;

assert.equal(rows.length, 2);
assert.deepEqual(new Set(rows.map((row) => row.doc_type)), new Set(['TERMS', 'PRIVACY']));
assert.ok(rows.every((row) => row.acknowledged_at && row.version === CURRENT_TERMS_VERSION));
assert.ok(rows.every((row) => row.ip_address === '127.0.0.1' && row.user_agent === 'legal-consent-test'));

console.log('✅ Versioned legal consent, explicit dual-checkbox requirement, and audit storage passed.');
