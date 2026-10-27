import crypto from 'node:crypto';
import { db } from '../db.js';

export type RequiredLegalDocType = 'TERMS' | 'PRIVACY';

export interface RequiredLegalPolicyVersions {
  TERMS: string;
  PRIVACY: string;
}

/** Return the currently published Terms and Privacy versions, with a fail-safe baseline. */
export function getRequiredLegalPolicyVersions(): RequiredLegalPolicyVersions {
  const resolve = (docType: RequiredLegalDocType, fallback: string): string => {
    try {
      const row = db.prepare(`
        SELECT version
        FROM legal_documents
        WHERE doc_type = ? AND status = 'PUBLISHED'
        ORDER BY datetime(COALESCE(published_at, updated_at, created_at)) DESC, updated_at DESC
        LIMIT 1
      `).get(docType) as { version?: string } | undefined;
      return String(row?.version || fallback).trim() || fallback;
    } catch {
      return fallback;
    }
  };

  return {
    TERMS: resolve('TERMS', '2.0'),
    PRIVACY: resolve('PRIVACY', '2.0'),
  };
}

export function hasRequiredLegalPolicyConsent(userId: string): boolean {
  if (!userId) return false;
  const versions = getRequiredLegalPolicyVersions();

  try {
    const terms = db.prepare(`
      SELECT 1 FROM legal_acknowledgements
      WHERE user_id = ? AND doc_type = 'TERMS' AND version = ?
      LIMIT 1
    `).get(userId, versions.TERMS);
    const privacy = db.prepare(`
      SELECT 1 FROM legal_acknowledgements
      WHERE user_id = ? AND doc_type = 'PRIVACY' AND version = ?
      LIMIT 1
    `).get(userId, versions.PRIVACY);
    return Boolean(terms && privacy);
  } catch {
    // Fail closed if the consent ledger cannot be queried.
    return false;
  }
}

export function recordRequiredLegalPolicyConsent(params: {
  userId: string;
  termsVersion: string;
  privacyVersion: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): { TERMS: string; PRIVACY: string } {
  const versions = getRequiredLegalPolicyVersions();
  if (params.termsVersion !== versions.TERMS || params.privacyVersion !== versions.PRIVACY) {
    throw new Error('LEGAL_POLICY_VERSION_CHANGED');
  }

  const insert = db.prepare(`
    INSERT INTO legal_acknowledgements (id, user_id, doc_type, version, acknowledged_at, ip_address, user_agent)
    SELECT ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM legal_acknowledgements
      WHERE user_id = ? AND doc_type = ? AND version = ?
    )
  `);

  for (const docType of ['TERMS', 'PRIVACY'] as const) {
    const version = versions[docType];
    insert.run(
      `ack_${crypto.randomUUID()}`,
      params.userId,
      docType,
      version,
      (params.ipAddress || '').slice(0, 100),
      (params.userAgent || '').slice(0, 500),
      params.userId,
      docType,
      version
    );
  }

  return versions;
}
