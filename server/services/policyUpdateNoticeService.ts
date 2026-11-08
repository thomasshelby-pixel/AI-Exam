import crypto from 'node:crypto';
import { db } from '../db.js';
import { CURRENT_PRIVACY_VERSION, ensureCurrentLegalDocuments } from './legalConsentService.js';
import { syncRecordToFirestore } from './firestoreSyncService.js';

export interface PolicyUpdateNoticeStatus {
  version: string;
  acknowledged: boolean;
}

/**
 * This is a delivery/visibility acknowledgement for a policy-change notice.
 * It is deliberately separate from affirmative legal consent records.
 */
export function getPolicyUpdateNoticeStatus(userId: string): PolicyUpdateNoticeStatus {
  ensureCurrentLegalDocuments();
  const row = db.prepare(`
    SELECT 1 FROM policy_update_acknowledgements
    WHERE user_id = ? AND policy_version = ?
    LIMIT 1
  `).get(userId, CURRENT_PRIVACY_VERSION);
  return { version: CURRENT_PRIVACY_VERSION, acknowledged: Boolean(row) };
}

export async function acknowledgePolicyUpdateNotice(input: {
  userId: string;
  policyVersion: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<PolicyUpdateNoticeStatus> {
  ensureCurrentLegalDocuments();
  if (!input.userId) throw new Error('Authenticated user is required.');
  if (input.policyVersion !== CURRENT_PRIVACY_VERSION) {
    throw new Error('The Privacy Policy has changed. Refresh the notice and review the latest version.');
  }

  const id = `policy_notice_${crypto.createHash('sha256')
    .update(`${input.userId}:${input.policyVersion}`)
    .digest('hex')
    .slice(0, 36)}`;
  const record = {
    id,
    user_id: input.userId,
    policy_version: input.policyVersion,
    acknowledged_at: new Date().toISOString(),
    ip_address: String(input.ipAddress || '').slice(0, 200) || null,
    user_agent: String(input.userAgent || '').slice(0, 500) || null,
  };

  db.prepare(`
    INSERT OR IGNORE INTO policy_update_acknowledgements
      (id, user_id, policy_version, acknowledged_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(record.id, record.user_id, record.policy_version, record.acknowledged_at, record.ip_address, record.user_agent);

  const saved = db.prepare(`
    SELECT * FROM policy_update_acknowledgements
    WHERE user_id = ? AND policy_version = ?
    LIMIT 1
  `).get(input.userId, CURRENT_PRIVACY_VERSION) as Record<string, any> | undefined;

  if (saved) {
    await syncRecordToFirestore('policy_update_acknowledgements', String(saved.id), saved)
      .catch((error: unknown) => console.warn('[PolicyUpdateNotice] Could not mirror notice acknowledgement:', error));
  }

  return getPolicyUpdateNoticeStatus(input.userId);
}
