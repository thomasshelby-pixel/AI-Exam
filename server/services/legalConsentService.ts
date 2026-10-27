import crypto from 'node:crypto';
import { db } from '../db.js';

export const CURRENT_TERMS_VERSION = '2.0';
export const CURRENT_PRIVACY_VERSION = '2.0';
export const CURRENT_TERMS_UPDATED_ON = '27 October 2026';
export const CURRENT_PRIVACY_UPDATED_ON = '27 October 2026';

export type LegalConsentDocType = 'TERMS' | 'PRIVACY';

export interface LegalConsentStatus {
  required: boolean;
  termsVersion: string;
  privacyVersion: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  needsAcceptance: boolean;
}

export interface LegalConsentAcceptanceInput {
  userId: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Current consent is tied to a published version, never to a browser-local flag. */
export function getLegalConsentStatus(userId: string, role: string = 'STUDENT'): LegalConsentStatus {
  const normalizedRole = String(role || '').trim().toUpperCase();
  if (normalizedRole !== 'STUDENT') {
    return {
      required: false,
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
      termsAccepted: true,
      privacyAccepted: true,
      needsAcceptance: false,
    };
  }

  const terms = db.prepare(`
    SELECT 1 FROM legal_acknowledgements
    WHERE user_id = ? AND UPPER(doc_type) = 'TERMS' AND version = ?
    LIMIT 1
  `).get(userId, CURRENT_TERMS_VERSION);

  const privacy = db.prepare(`
    SELECT 1 FROM legal_acknowledgements
    WHERE user_id = ? AND UPPER(doc_type) = 'PRIVACY' AND version = ?
    LIMIT 1
  `).get(userId, CURRENT_PRIVACY_VERSION);

  const termsAccepted = Boolean(terms);
  const privacyAccepted = Boolean(privacy);

  return {
    required: true,
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
    termsAccepted,
    privacyAccepted,
    needsAcceptance: !termsAccepted || !privacyAccepted,
  };
}

/** Persist the affirmative choices as server-side, versioned audit records. */
export function recordCurrentLegalAcceptances(input: LegalConsentAcceptanceInput): Array<Record<string, any>> {
  if (!input.userId || input.termsAccepted !== true || input.privacyAccepted !== true) {
    throw new Error('Both the Terms & Conditions and Privacy Policy must be explicitly accepted.');
  }

  const ip = String(input.ipAddress || '').slice(0, 200) || null;
  const userAgent = String(input.userAgent || '').slice(0, 500) || null;
  const timestamp = new Date().toISOString();

  const documents: Array<{ docType: LegalConsentDocType; version: string }> = [
    { docType: 'TERMS', version: CURRENT_TERMS_VERSION },
    { docType: 'PRIVACY', version: CURRENT_PRIVACY_VERSION },
  ];

  for (const document of documents) {
    const id = `ack_${crypto.createHash('sha256')
      .update(`${input.userId}: ${document.docType}: ${document.version}`)
      .digest('hex')
      .slice(0, 36)}`;

    db.prepare(`
      INSERT OR IGNORE INTO legal_acknowledgements
        (id, user_id, doc_type, version, acknowledged_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.userId, document.docType, document.version, timestamp, ip, userAgent);
  }

  return db.prepare(`
    SELECT * FROM legal_acknowledgements
    WHERE user_id = ? AND (
      (UPPER(doc_type) = 'TERMS' AND version = ?)
      OR (UPPER(doc_type) = 'PRIVACY' AND version = ?)
    )
  `).all(input.userId, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION) as Array<Record<string, any>>;
}
