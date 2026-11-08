import crypto from 'node:crypto';
import { db } from '../db.js';
import { CURRENT_PRIVACY_VERSION, ensureCurrentLegalDocuments } from './legalConsentService.js';
import { getFirestoreDoc, setFirestoreDoc } from './firestoreDbService.js';

export interface PolicyUpdateNoticeStatus {
  version: string;
  acknowledged: boolean;
}

function getNoticeId(userId: string, version: string): string {
  return `policy_notice_${crypto.createHash('sha256')
    .update(`${userId}:${version}`)
    .digest('hex')
    .slice(0, 36)}`;
}

/**
 * This is a delivery/visibility acknowledgement for a policy-change notice.
 * It is deliberately separate from affirmative legal consent records.
 *
 * SQLite is a local cache only; the versioned Firestore record is the
 * cross-instance source of truth for whether the notice has been seen.
 */
export async function getPolicyUpdateNoticeStatus(userId: string): Promise<PolicyUpdateNoticeStatus> {
  ensureCurrentLegalDocuments();
  if (!userId) throw new Error('Authenticated user is required.');

  const local = db.prepare(`
    SELECT * FROM policy_update_acknowledgements
    WHERE user_id = ? AND policy_version = ?
    LIMIT 1
  `).get(userId, CURRENT_PRIVACY_VERSION) as Record<string, any> | undefined;
  if (local) return { version: CURRENT_PRIVACY_VERSION, acknowledged: true };

  const shared = await getFirestoreDoc<Record<string, any>>(
    'policy_update_acknowledgements',
    getNoticeId(userId, CURRENT_PRIVACY_VERSION),
  );
  if (!shared || String(shared.policy_version || '') !== CURRENT_PRIVACY_VERSION ||
      String(shared.user_id || '') !== userId) {
    return { version: CURRENT_PRIVACY_VERSION, acknowledged: false };
  }

  db.prepare(`
    INSERT OR IGNORE INTO policy_update_acknowledgements
      (id, user_id, policy_version, acknowledged_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    String(shared.id || getNoticeId(userId, CURRENT_PRIVACY_VERSION)),
    userId,
    CURRENT_PRIVACY_VERSION,
    String(shared.acknowledged_at || new Date().toISOString()),
    shared.ip_address ?? null,
    shared.user_agent ?? null,
  );
  return { version: CURRENT_PRIVACY_VERSION, acknowledged: true };
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

  const id = getNoticeId(input.userId, input.policyVersion);
  const record = {
    id,
    user_id: input.userId,
    policy_version: input.policyVersion,
    acknowledged_at: new Date().toISOString(),
    ip_address: String(input.ipAddress || '').slice(0, 200) || null,
    user_agent: String(input.userAgent || '').slice(0, 500) || null,
  };

  // Do not report the notice as acknowledged until the shared record is durable.
  const sharedSaved = await setFirestoreDoc('policy_update_acknowledgements', record.id, record);
  if (!sharedSaved) {
    throw new Error('We could not save your acknowledgement across app servers. Please retry.');
  }

  db.prepare(`
    INSERT OR IGNORE INTO policy_update_acknowledgements
      (id, user_id, policy_version, acknowledged_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(record.id, record.user_id, record.policy_version, record.acknowledged_at, record.ip_address, record.user_agent);

  return { version: CURRENT_PRIVACY_VERSION, acknowledged: true };
}
