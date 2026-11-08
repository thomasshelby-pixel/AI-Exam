import crypto from 'node:crypto';
import { db } from '../db.js';
import { LEGAL_TERMS_ADDENDUM, LEGAL_PRIVACY_ADDENDUM, LEGAL_PRIVACY_MODEL_IMPROVEMENT_ADDENDUM } from './legalConstants.js';
import { syncRecordToFirestore } from './firestoreSyncService.js';

export const CURRENT_TERMS_VERSION = '2.0';
export const CURRENT_PRIVACY_VERSION = '3.0';
export const CURRENT_TERMS_UPDATED_ON = '27 October 2026';
export const CURRENT_PRIVACY_UPDATED_ON = '08 November 2026';

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

/**
 * Upgrade an existing published document in place without discarding its prior content.
 * This runs before consent status is reported, so existing users are never asked to accept
 * a new version while the publicly linked document still shows the old text.
 */
export function ensureCurrentLegalDocuments(): void {
  const documents = [
    {
      docType: 'TERMS',
      version: CURRENT_TERMS_VERSION,
      updatedOn: CURRENT_TERMS_UPDATED_ON,
      marker: '16. FAIR USE, ANTI-ABUSE AND REVIEW BEFORE FINAL TERMINATION',
      amendment: LEGAL_TERMS_ADDENDUM,
      changelog: 'Fair-use enforcement, free/paid facility abuse, and notice/opportunity-to-respond review clause.',
    },
    {
      docType: 'PRIVACY',
      version: CURRENT_PRIVACY_VERSION,
      updatedOn: CURRENT_PRIVACY_UPDATED_ON,
      marker: '16. SECURITY, ABUSE PREVENTION AND ACCOUNT REVIEW',
      amendment: LEGAL_PRIVACY_ADDENDUM,
      additionalMarker: '17. AI EVALUATION QUALITY, RESEARCH AND SYSTEM IMPROVEMENT',
      additionalAmendment: LEGAL_PRIVACY_MODEL_IMPROVEMENT_ADDENDUM,
      changelog: 'Disclosure of account/security data processing and AI evaluation system development and improvement purposes.',
    },
  ];

  for (const item of documents) {
    const current = db.prepare(`
      SELECT * FROM legal_documents
      WHERE doc_type = ? AND status = 'PUBLISHED'
      ORDER BY published_at DESC, updated_at DESC
      LIMIT 1
    `).get(item.docType) as Record<string, any> | undefined;
    if (!current) continue;

    const content = String(current.content || '');
    const hasAmendment = content.includes(item.marker);
    const hasAdditionalAmendment = !('additionalMarker' in item) || content.includes(String((item as any).additionalMarker));
    const existingVersion = Number.parseFloat(String(current.version || '0'));
    const targetVersion = Number.isFinite(existingVersion) && existingVersion > Number.parseFloat(item.version)
      ? String(current.version)
      : item.version;

    if (hasAmendment && hasAdditionalAmendment && String(current.version) === targetVersion &&
        String(current.last_updated_date || '') === item.updatedOn) continue;

    const additions: string[] = [];
    if (!hasAmendment) additions.push(item.amendment);
    if (!hasAdditionalAmendment && 'additionalAmendment' in item) additions.push(String((item as any).additionalAmendment));
    const updatedContent = additions.length ? `${content.trim()}\n\n${additions.join('\n\n')}\n` : content;
    const oldChangelog = String(current.changelog || '').trim();
    const changelog = oldChangelog.includes(item.changelog)
      ? oldChangelog
      : [oldChangelog, item.changelog].filter(Boolean).join(' | ');

    db.prepare(`
      UPDATE legal_documents
      SET content = ?, version = ?, effective_date = ?, last_updated_date = ?,
          changelog = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'PUBLISHED'
    `).run(updatedContent, targetVersion, item.updatedOn, item.updatedOn, changelog, current.id);

    const updated = db.prepare('SELECT * FROM legal_documents WHERE id = ?').get(current.id) as Record<string, any> | undefined;
    if (updated) {
      void syncRecordToFirestore('legal_documents', String(updated.id), updated)
        .catch((error: unknown) => console.warn('[LegalConsent] Could not sync published legal amendment:', error));
    }
  }
}

/** Current consent is tied to a published version, never to a browser-local flag. */
export function getLegalConsentStatus(userId: string, role: string = 'STUDENT'): LegalConsentStatus {
  ensureCurrentLegalDocuments();
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
    WHERE user_id = ? AND UPPER(doc_type) = 'PRIVACY' AND version IN (?, ?)
    LIMIT 1
  `).get(userId, '2.0', CURRENT_PRIVACY_VERSION);

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
  ensureCurrentLegalDocuments();
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
