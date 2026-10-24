import crypto from 'crypto';
import { db } from '../db.js';
import { getAllFirestoreDocs, setFirestoreDoc } from './firestoreDbService.js';
import { sendBroadcastNotificationEmail } from './emailService.js';

export interface TargetAudienceEstimate {
  total: number;
  studentsCount: number;
  institutesCount: number;
  byLevel: {
    foundation: number;
    intermediate: number;
    final: number;
    unspecified: number;
  };
  sampleRecipients: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    caLevel?: string;
  }>;
}

export interface BroadcastPayload {
  adminUserId: string;
  adminEmail: string;
  title: string;
  message: string;
  category: 'ANNOUNCEMENT' | 'EXAM_ALERT' | 'FEATURE_UPDATE' | 'MAINTENANCE' | 'URGENT_ALERT' | 'PROMOTIONAL' | 'GENERAL';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  targetAudience: 'ALL' | 'STUDENT' | 'INSTITUTE_ADMIN' | 'STUDENTS_FOUNDATION' | 'STUDENTS_INTERMEDIATE' | 'STUDENTS_FINAL';
  channels: 'IN_APP' | 'EMAIL' | 'IN_APP_AND_EMAIL';
  actionUrl?: string;
  actionLabel?: string;
}

export interface TestNotificationPayload {
  adminUserId: string;
  targetEmail: string;
  title: string;
  message: string;
  category?: 'ANNOUNCEMENT' | 'EXAM_ALERT' | 'FEATURE_UPDATE' | 'MAINTENANCE' | 'URGENT_ALERT' | 'PROMOTIONAL' | 'GENERAL';
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  channels?: 'IN_APP' | 'EMAIL' | 'IN_APP_AND_EMAIL';
  actionUrl?: string;
  actionLabel?: string;
}

interface TargetUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  ca_level?: string;
}

/**
 * Resolves non-deleted, active candidate users for a given target audience specification.
 * Strictly filters out tombstoned accounts.
 */
export function getTargetUsers(targetAudience: string = 'ALL'): TargetUser[] {
  let baseQuery = `
    SELECT u.id, u.email, u.full_name, u.role, sp.ca_level
    FROM users u
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    WHERE u.status != 'DELETED'
      AND u.id NOT IN (SELECT entity_id FROM tombstones WHERE collection_name IN ('users', 'students', 'institutes'))
  `;

  const normalizedAudience = (targetAudience || 'ALL').toUpperCase();

  switch (normalizedAudience) {
    case 'STUDENT':
      baseQuery += ` AND u.role = 'STUDENT'`;
      break;
    case 'INSTITUTE_ADMIN':
      baseQuery += ` AND u.role = 'INSTITUTE_ADMIN'`;
      break;
    case 'STUDENTS_FOUNDATION':
      baseQuery += ` AND u.role = 'STUDENT' AND UPPER(COALESCE(sp.ca_level, '')) = 'FOUNDATION'`;
      break;
    case 'STUDENTS_INTERMEDIATE':
      baseQuery += ` AND u.role = 'STUDENT' AND UPPER(COALESCE(sp.ca_level, '')) = 'INTERMEDIATE'`;
      break;
    case 'STUDENTS_FINAL':
      baseQuery += ` AND u.role = 'STUDENT' AND UPPER(COALESCE(sp.ca_level, '')) = 'FINAL'`;
      break;
    case 'ALL':
    default:
      baseQuery += ` AND u.role IN ('STUDENT', 'INSTITUTE_ADMIN')`;
      break;
  }

  baseQuery += ` ORDER BY u.created_at DESC`;

  try {
    return (db.prepare(baseQuery).all() as unknown) as TargetUser[];
  } catch (err) {
    console.error('[NotificationService] Failed to query target users:', err);
    return [];
  }
}

/**
 * Calculates audience estimate and breakdown before dispatching broadcast.
 */
function buildAudienceEstimate(users: TargetUser[]): TargetAudienceEstimate {
  let studentsCount = 0;
  let institutesCount = 0;
  const byLevel = { foundation: 0, intermediate: 0, final: 0, unspecified: 0 };

  for (const user of users) {
    if (user.role === 'STUDENT') {
      studentsCount++;
      const level = String(user.ca_level || '').toUpperCase();
      if (level === 'FOUNDATION') byLevel.foundation++;
      else if (level === 'INTERMEDIATE') byLevel.intermediate++;
      else if (level === 'FINAL') byLevel.final++;
      else byLevel.unspecified++;
    } else if (user.role === 'INSTITUTE_ADMIN') {
      institutesCount++;
    }
  }

  return {
    total: users.length,
    studentsCount,
    institutesCount,
    byLevel,
    sampleRecipients: users.slice(0, 5).map((user) => ({
      id: user.id,
      email: user.email,
      name: user.full_name || 'User',
      role: user.role,
      caLevel: user.ca_level,
    })),
  };
}

/**
 * Resolve the audience from the durable Firestore account/profile source in production.
 * SQLite remains the development/test source and a fallback only when the Firestore
 * users collection is genuinely empty. A failed cloud query throws rather than silently
 * turning an unavailable data source into a zero-recipient campaign.
 */
export async function getTargetUsersForBroadcast(targetAudience: string = 'ALL'): Promise<TargetUser[]> {
  if (process.env.NODE_ENV !== 'production') return getTargetUsers(targetAudience);

  const [firestoreUsers, firestoreProfiles, firestoreTombstones] = await Promise.all([
    getAllFirestoreDocs<Record<string, any>>('users', { failOnError: true }),
    getAllFirestoreDocs<Record<string, any>>('student_profiles', { failOnError: true }),
    getAllFirestoreDocs<Record<string, any>>('tombstones', { failOnError: true }),
  ]);

  if (firestoreUsers.length === 0) {
    const localFallback = getTargetUsers(targetAudience);
    console.warn('[NotificationService] Firestore users collection is empty; using hydrated local users as a temporary fallback.');
    return localFallback;
  }

  const profilesByUserId = new Map<string, Record<string, any>>();
  for (const profile of firestoreProfiles) {
    const userId = String(profile.user_id || profile.userId || profile.id || '').trim();
    if (userId) profilesByUserId.set(userId, profile);
  }

  const blockedIdentifiers = new Set<string>();
  const addBlocked = (value: unknown) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized) blockedIdentifiers.add(normalized);
  };
  for (const tombstone of firestoreTombstones) {
    const collectionName = String(tombstone.collectionName || tombstone.collection_name || '').trim().toLowerCase();
    const targetId = String(tombstone.targetId || tombstone.target_id || tombstone.entity_id || tombstone.entityId || tombstone.id || '').trim();
    if (!targetId) continue;
    addBlocked(targetId);
    if (collectionName) {
      addBlocked(`${collectionName}_${targetId}`);
      addBlocked(`${collectionName}:${targetId}`);
    }
  }
  try {
    const localTombstones = db.prepare(
      "SELECT collection_name, entity_id FROM tombstones WHERE collection_name IN ('users', 'students', 'institutes')"
    ).all() as Array<{ collection_name: string; entity_id: string }>;
    for (const tombstone of localTombstones) {
      addBlocked(tombstone.entity_id);
      addBlocked(`${tombstone.collection_name}_${tombstone.entity_id}`);
      addBlocked(`${tombstone.collection_name}:${tombstone.entity_id}`);
    }
  } catch (error) {
    console.warn('[NotificationService] Local tombstone lookup warning:', error);
  }

  const normalizedAudience = String(targetAudience || 'ALL').trim().toUpperCase();
  const recipients: TargetUser[] = [];
  for (const record of firestoreUsers) {
    const id = String(record.id || record.user_id || record.userId || '').trim();
    const email = String(record.email || '').trim().toLowerCase();
    const role = String(record.role || record.user_role || 'STUDENT').trim().toUpperCase();
    const status = String(record.status || 'ACTIVE').trim().toUpperCase();
    const profile = profilesByUserId.get(id);
    const caLevel = String(profile?.ca_level || profile?.caLevel || record.ca_level || record.caLevel || '').trim().toUpperCase();

    if (!id || !email || !['STUDENT', 'INSTITUTE_ADMIN'].includes(role) || status === 'DELETED') continue;
    if (
      blockedIdentifiers.has(id.toLowerCase()) ||
      blockedIdentifiers.has(email) ||
      blockedIdentifiers.has(`users_${id.toLowerCase()}`) ||
      blockedIdentifiers.has(`users:${id.toLowerCase()}`) ||
      blockedIdentifiers.has(`students_${id.toLowerCase()}`) ||
      blockedIdentifiers.has(`students:${id.toLowerCase()}`) ||
      blockedIdentifiers.has(`institutes_${id.toLowerCase()}`) ||
      blockedIdentifiers.has(`institutes:${id.toLowerCase()}`)
    ) continue;

    if (normalizedAudience === 'STUDENT' && role !== 'STUDENT') continue;
    if (normalizedAudience === 'INSTITUTE_ADMIN' && role !== 'INSTITUTE_ADMIN') continue;
    if (normalizedAudience === 'STUDENTS_FOUNDATION' && !(role === 'STUDENT' && caLevel === 'FOUNDATION')) continue;
    if (normalizedAudience === 'STUDENTS_INTERMEDIATE' && !(role === 'STUDENT' && caLevel === 'INTERMEDIATE')) continue;
    if (normalizedAudience === 'STUDENTS_FINAL' && !(role === 'STUDENT' && caLevel === 'FINAL')) continue;
    if (normalizedAudience === 'ALL' && !['STUDENT', 'INSTITUTE_ADMIN'].includes(role)) continue;

    recipients.push({
      id,
      email,
      full_name: String(record.full_name || record.fullName || record.display_name || 'User'),
      role,
      ca_level: caLevel || undefined,
    });
  }

  return recipients.sort((a, b) => String(b.id).localeCompare(String(a.id)));
}

/**
 * Returns an estimate that is consistent with the durable recipient source used by
 * broadcast dispatch. This prevents the preview count and actual send count diverging
 * after App Hosting replaces the local SQLite instance.
 */
export async function estimateRecipientsFromDurableStore(targetAudience: string = 'ALL'): Promise<TargetAudienceEstimate> {
  return buildAudienceEstimate(await getTargetUsersForBroadcast(targetAudience));
}

export function estimateRecipients(targetAudience: string = 'ALL'): TargetAudienceEstimate {
  return buildAudienceEstimate(getTargetUsers(targetAudience));
}

function normalizeSqlTimestamp(value: unknown, fallback: string | null = null): string | null {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  const candidate = value as { toDate?: () => Date };
  if (typeof candidate?.toDate === 'function') {
    try { return candidate.toDate().toISOString(); } catch { return fallback; }
  }
  return String(value);
}

/** Persist notification-centre records that must survive App Hosting instance replacement. */
async function persistNotificationDocument(
  collectionName: string,
  docId: string,
  record: Record<string, any>,
): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') return true;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (await setFirestoreDoc(collectionName, docId, { ...record, id: docId })) return true;
    } catch (error) {
      console.warn(`[NotificationService] Durable write attempt ${attempt} failed for ${collectionName}/${docId}:`, error);
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 150));
  }
  console.error(`[NotificationService] Durable write exhausted retries for ${collectionName}/${docId}.`);
  return false;
}

async function backfillMissingNotificationDocuments(
  collectionName: string,
  rows: Array<Record<string, any>>,
  remoteIds: Set<string>,
  getId: (row: Record<string, any>) => string,
): Promise<void> {
  const missing = rows.filter((row) => {
    const id = getId(row);
    return Boolean(id && !remoteIds.has(id));
  });
  for (let index = 0; index < missing.length; index += 40) {
    const chunk = missing.slice(index, index + 40);
    const results = await Promise.all(chunk.map(async (row) => {
      const id = getId(row);
      return persistNotificationDocument(collectionName, id, row);
    }));
    if (results.some((saved) => !saved)) {
      console.warn(`[NotificationService] Some ${collectionName} records could not be backfilled to Firestore.`);
    }
  }
}

/**
 * Restore notification-centre state from Firestore before the server begins accepting
 * traffic, then backfill records that were already present in SQLite before durable
 * writes were introduced. This prevents campaign counters and notification feeds from
 * resetting to zero whenever an ephemeral hosting instance is replaced.
 */
export async function hydrateNotificationCentreFromFirestore(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return;

  const [remoteCampaigns, remoteNotifications, remoteLogs, remotePreferences] = await Promise.all([
    getAllFirestoreDocs<Record<string, any>>('broadcast_campaigns', { failOnError: true }),
    getAllFirestoreDocs<Record<string, any>>('notifications', { failOnError: true }),
    getAllFirestoreDocs<Record<string, any>>('notification_delivery_logs', { failOnError: true }),
    getAllFirestoreDocs<Record<string, any>>('user_notification_preferences', { failOnError: true }),
  ]);

  const campaignIds = new Set<string>();
  const notificationIds = new Set<string>();
  const deliveryLogIds = new Set<string>();
  const preferenceIds = new Set<string>();

  for (const row of remoteCampaigns) {
    const id = String(row.id || '').trim();
    if (!id) continue;
    campaignIds.add(id);
    db.prepare(`
      INSERT INTO broadcast_campaigns (
        id, title, message, category, priority, target_audience, channels,
        action_url, action_label, status, total_targeted, in_app_sent, email_sent,
        email_failed, created_by, sent_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        message = excluded.message,
        category = excluded.category,
        priority = excluded.priority,
        target_audience = excluded.target_audience,
        channels = excluded.channels,
        action_url = excluded.action_url,
        action_label = excluded.action_label,
        status = excluded.status,
        total_targeted = excluded.total_targeted,
        in_app_sent = excluded.in_app_sent,
        email_sent = excluded.email_sent,
        email_failed = excluded.email_failed,
        created_by = excluded.created_by,
        sent_at = excluded.sent_at
    `).run(
      id,
      String(row.title || 'Notification'),
      String(row.message || ''),
      String(row.category || 'ANNOUNCEMENT'),
      String(row.priority || 'NORMAL'),
      String(row.target_audience || row.targetAudience || 'ALL'),
      String(row.channels || 'IN_APP_AND_EMAIL'),
      row.action_url ?? row.actionUrl ?? null,
      row.action_label ?? row.actionLabel ?? null,
      String(row.status || 'COMPLETED'),
      Number(row.total_targeted ?? row.totalTargeted ?? 0),
      Number(row.in_app_sent ?? row.inAppSent ?? 0),
      Number(row.email_sent ?? row.emailSent ?? 0),
      Number(row.email_failed ?? row.emailFailed ?? 0),
      row.created_by ?? row.createdBy ?? null,
      normalizeSqlTimestamp(row.sent_at ?? row.sentAt),
      normalizeSqlTimestamp(row.created_at ?? row.createdAt),
    );
  }

  for (const row of remoteNotifications) {
    const id = String(row.id || '').trim();
    const userId = String(row.user_id || row.userId || '').trim();
    if (!id || !userId) continue;
    const activeUser = db.prepare("SELECT id FROM users WHERE id = ? AND status != 'DELETED'").get(userId);
    if (!activeUser) continue;
    notificationIds.add(id);
    db.prepare(`
      INSERT INTO notifications (
        id, user_id, title, message, type, priority, category, action_url,
        action_label, campaign_id, read, is_read, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        message = excluded.message,
        type = excluded.type,
        priority = excluded.priority,
        category = excluded.category,
        action_url = excluded.action_url,
        action_label = excluded.action_label,
        campaign_id = excluded.campaign_id,
        read = MAX(notifications.read, excluded.read),
        is_read = MAX(notifications.is_read, excluded.is_read)
    `).run(
      id, userId, String(row.title || 'Notification'), String(row.message || ''),
      String(row.type || 'SYSTEM'), String(row.priority || 'NORMAL'),
      String(row.category || 'SYSTEM'), row.action_url ?? row.actionUrl ?? null,
      row.action_label ?? row.actionLabel ?? null, row.campaign_id ?? row.campaignId ?? null,
      row.read ? 1 : 0, row.is_read ? 1 : (row.read ? 1 : 0),
      normalizeSqlTimestamp(row.created_at ?? row.createdAt),
    );
  }

  for (const row of remoteLogs) {
    const id = String(row.id || '').trim();
    const userId = String(row.user_id || row.userId || '').trim();
    if (!id || !userId) continue;
    deliveryLogIds.add(id);
    db.prepare(`
      INSERT INTO notification_delivery_logs (
        id, campaign_id, user_id, recipient_email, recipient_role, channel, status, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
      ON CONFLICT(id) DO UPDATE SET
        campaign_id = excluded.campaign_id,
        recipient_email = excluded.recipient_email,
        recipient_role = excluded.recipient_role,
        channel = excluded.channel,
        status = excluded.status,
        error_message = excluded.error_message
    `).run(
      id, row.campaign_id ?? row.campaignId ?? null, userId,
      row.recipient_email ?? row.recipientEmail ?? null,
      row.recipient_role ?? row.recipientRole ?? null,
      String(row.channel || 'IN_APP'), String(row.status || 'UNKNOWN'),
      row.error_message ?? row.errorMessage ?? null,
      normalizeSqlTimestamp(row.created_at ?? row.createdAt),
    );
  }

  const preferenceFlag = (value: unknown): number => {
    if (value === undefined || value === null) return 1;
    return value === true || value === 1 || value === '1' ? 1 : 0;
  };
  for (const row of remotePreferences) {
    const userId = String(row.user_id || row.userId || row.id || '').trim();
    if (!userId) continue;
    preferenceIds.add(userId);
    db.prepare(`
      INSERT INTO user_notification_preferences (
        user_id, email_notifications_enabled, marketing_emails_enabled,
        in_app_notifications_enabled, updated_at
      ) VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
      ON CONFLICT(user_id) DO UPDATE SET
        email_notifications_enabled = excluded.email_notifications_enabled,
        marketing_emails_enabled = excluded.marketing_emails_enabled,
        in_app_notifications_enabled = excluded.in_app_notifications_enabled,
        updated_at = excluded.updated_at
    `).run(
      userId,
      preferenceFlag(row.email_notifications_enabled ?? row.emailNotificationsEnabled),
      preferenceFlag(row.marketing_emails_enabled ?? row.marketingEmailsEnabled),
      preferenceFlag(row.in_app_notifications_enabled ?? row.inAppNotificationsEnabled),
      normalizeSqlTimestamp(row.updated_at ?? row.updatedAt),
    );
  }

  // Preserve locally existing history from before the Firestore mirror was introduced.
  const localCampaigns = db.prepare('SELECT * FROM broadcast_campaigns').all() as Array<Record<string, any>>;
  const localNotifications = db.prepare(`
    SELECT n.* FROM notifications n
    INNER JOIN users u ON u.id = n.user_id
    WHERE u.status != 'DELETED'
  `).all() as Array<Record<string, any>>;
  const localLogs = db.prepare(`
    SELECT l.* FROM notification_delivery_logs l
    INNER JOIN users u ON u.id = l.user_id
    WHERE u.status != 'DELETED'
  `).all() as Array<Record<string, any>>;
  const localPreferences = db.prepare('SELECT * FROM user_notification_preferences').all() as Array<Record<string, any>>;

  await Promise.all([
    backfillMissingNotificationDocuments('broadcast_campaigns', localCampaigns, campaignIds, (row) => String(row.id || '')),
    backfillMissingNotificationDocuments('notifications', localNotifications, notificationIds, (row) => String(row.id || '')),
    backfillMissingNotificationDocuments('notification_delivery_logs', localLogs, deliveryLogIds, (row) => String(row.id || '')),
    backfillMissingNotificationDocuments('user_notification_preferences', localPreferences, preferenceIds, (row) => String(row.user_id || '')),
  ]);

  console.log(`[NotificationService] Restored ${remoteCampaigns.length} campaigns, ${remoteNotifications.length} notifications, ${remoteLogs.length} delivery logs, and ${remotePreferences.length} preference records from Firestore.`);
}

/** Persist an updated notification read-state so it survives the next deployment. */
export async function syncNotificationReadStateToFirestore(userId: string, notificationId?: string): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') return true;
  const rows = notificationId
    ? db.prepare('SELECT * FROM notifications WHERE user_id = ? AND id = ?').all(userId, notificationId) as Array<Record<string, any>>
    : db.prepare('SELECT * FROM notifications WHERE user_id = ?').all(userId) as Array<Record<string, any>>;
  let allSaved = true;
  for (let index = 0; index < rows.length; index += 40) {
    const chunk = rows.slice(index, index + 40);
    const saved = await Promise.all(chunk.map((row) => persistNotificationDocument('notifications', String(row.id), row)));
    if (saved.some((result) => !result)) allSaved = false;
  }
  return allSaved;
}

/**
 * Sends a single test notification to the designated admin email and account.
 */
export async function sendTestNotification(payload: TestNotificationPayload): Promise<{
  success: boolean;
  inAppStatus: string;
  emailStatus: string;
  message: string;
}> {
  const channels = (payload.channels || 'IN_APP_AND_EMAIL').toUpperCase();
  const testTitle = `[TEST PREVIEW] ${payload.title}`;
  let inAppStatus = 'SKIPPED';
  let emailStatus = 'SKIPPED';

  // 1. In-App Test Dispatch (to the calling Super Admin user)
  if (channels === 'IN_APP' || channels === 'IN_APP_AND_EMAIL') {
    try {
      const notifId = `notif_test_${crypto.randomBytes(6).toString('hex')}`;
      db.prepare(`
        INSERT INTO notifications (
          id, user_id, title, message, type, priority, category, action_url, action_label, is_read, read, created_at
        ) VALUES (?, ?, ?, ?, 'SYSTEM', ?, ?, ?, ?, 0, 0, CURRENT_TIMESTAMP)
      `).run(
        notifId,
        payload.adminUserId,
        testTitle,
        payload.message,
        payload.priority || 'NORMAL',
        payload.category || 'ANNOUNCEMENT',
        payload.actionUrl || null,
        payload.actionLabel || null
      );
      const notificationRow = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notifId) as Record<string, any> | undefined;
      if (!notificationRow || !(await persistNotificationDocument('notifications', notifId, notificationRow))) {
        db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(notifId, payload.adminUserId);
        throw new Error('The test notification could not be saved to durable storage.');
      }
      inAppStatus = 'DELIVERED';
    } catch (err: any) {
      console.warn('[NotificationService] In-app test notification error:', err);
      inAppStatus = `FAILED: ${err.message}`;
    }
  }

  // 2. Email Test Dispatch
  if (channels === 'EMAIL' || channels === 'IN_APP_AND_EMAIL') {
    try {
      const emailRes = await sendBroadcastNotificationEmail({
        recipient: payload.targetEmail,
        recipientName: 'Administrator (Test Preview)',
        title: testTitle,
        message: payload.message,
        category: payload.category || 'ANNOUNCEMENT',
        priority: payload.priority || 'NORMAL',
        actionUrl: payload.actionUrl,
        actionLabel: payload.actionLabel,
        adminId: payload.adminUserId,
      });
      emailStatus = emailRes.status;
    } catch (err: any) {
      console.warn('[NotificationService] Email test notification error:', err);
      emailStatus = `FAILED: ${err.message}`;
    }
  }

  return {
    success: !inAppStatus.startsWith('FAILED') && !emailStatus.startsWith('FAILED'),
    inAppStatus,
    emailStatus,
    message: `Test notification dispatched (In-App: ${inAppStatus}, Email: ${emailStatus})`,
  };
}

/**
 * Creates and safely executes a full broadcast campaign with batch processing,
 * preference checking, in-app insertion, email dispatch, and delivery audit logging.
 */
export async function createAndDispatchBroadcast(payload: BroadcastPayload): Promise<{
  success: boolean;
  campaignId: string;
  totalTargeted: number;
  inAppSent: number;
  emailSent: number;
  emailFailed: number;
  status: string;
  error?: string;
  persistenceWarning?: boolean;
}> {
  // Resolve the audience from Firestore in production, using the same durable source
  // as the admin recipient preview. Never record a successful campaign with zero targets.
  const targetUsers = await getTargetUsersForBroadcast(payload.targetAudience);
  const campaignId = `cmp_${crypto.randomBytes(8).toString('hex')}`;
  const totalTargeted = targetUsers.length;

  if (totalTargeted === 0) {
    return {
      success: false,
      campaignId: '',
      totalTargeted: 0,
      inAppSent: 0,
      emailSent: 0,
      emailFailed: 0,
      status: 'NO_RECIPIENTS',
      error: 'No eligible recipients were found for this audience. Refresh the recipient preview and verify that active users are synced to the database before sending.',
    };
  }

  const channels = payload.channels || 'IN_APP_AND_EMAIL';
  const category = payload.category || 'ANNOUNCEMENT';
  const priority = payload.priority || 'NORMAL';

  db.prepare(`
    INSERT INTO broadcast_campaigns (
      id, title, message, category, priority, target_audience, channels,
      action_url, action_label, status, total_targeted, in_app_sent, email_sent, email_failed,
      created_by, sent_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SENDING', ?, 0, 0, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    campaignId,
    payload.title,
    payload.message,
    category,
    priority,
    payload.targetAudience,
    channels,
    payload.actionUrl || null,
    payload.actionLabel || null,
    totalTargeted,
    payload.adminEmail || payload.adminUserId,
  );

  const initialCampaign = db.prepare('SELECT * FROM broadcast_campaigns WHERE id = ?').get(campaignId) as Record<string, any>;
  if (!(await persistNotificationDocument('broadcast_campaigns', campaignId, initialCampaign))) {
    db.prepare("UPDATE broadcast_campaigns SET status = 'PERSISTENCE_FAILED' WHERE id = ?").run(campaignId);
    return {
      success: false,
      campaignId,
      totalTargeted,
      inAppSent: 0,
      emailSent: 0,
      emailFailed: 0,
      status: 'PERSISTENCE_ERROR',
      error: 'The broadcast could not be safely recorded in durable storage, so delivery was not started. Please retry after database connectivity is restored.',
    };
  }

  let inAppSent = 0;
  let emailSent = 0;
  let emailFailed = 0;

  const shouldSendInApp = channels === 'IN_APP' || channels === 'IN_APP_AND_EMAIL';
  const shouldSendEmail = channels === 'EMAIL' || channels === 'IN_APP_AND_EMAIL';

  const userPreferencesMap = new Map<string, { email: boolean; marketing: boolean; inApp: boolean }>();
  try {
    const preferences = db.prepare('SELECT * FROM user_notification_preferences').all() as any[];
    for (const preference of preferences) {
      userPreferencesMap.set(preference.user_id, {
        email: preference.email_notifications_enabled === 1,
        marketing: preference.marketing_emails_enabled === 1,
        inApp: preference.in_app_notifications_enabled === 1,
      });
    }
  } catch (error) {
    console.warn('[NotificationService] Preference check warning:', error);
  }

  const insertNotifStmt = db.prepare(`
    INSERT INTO notifications (
      id, user_id, title, message, type, priority, category, action_url, action_label, campaign_id, is_read, read, created_at
    ) VALUES (?, ?, ?, ?, 'SYSTEM', ?, ?, ?, ?, ?, 0, 0, CURRENT_TIMESTAMP)
  `);

  const insertDeliveryLogStmt = db.prepare(`
    INSERT INTO notification_delivery_logs (
      id, campaign_id, user_id, recipient_email, recipient_role, channel, status, error_message, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const recordDeliveryLog = async (
    logId: string,
    user: TargetUser,
    channel: 'IN_APP' | 'EMAIL',
    status: string,
    errorMessage: string | null,
  ): Promise<void> => {
    insertDeliveryLogStmt.run(
      logId,
      campaignId,
      user.id,
      user.email,
      user.role,
      channel,
      status,
      errorMessage,
    );
    const logRow = db.prepare('SELECT * FROM notification_delivery_logs WHERE id = ?').get(logId) as Record<string, any> | undefined;
    if (logRow && !(await persistNotificationDocument('notification_delivery_logs', logId, logRow))) {
      // Notification delivery itself is not reclassified based on audit-log persistence.
      console.error(`[NotificationService] Delivery log ${logId} could not be durably persisted.`);
    }
  };

  const CHUNK_SIZE = 50;
  for (let index = 0; index < targetUsers.length; index += CHUNK_SIZE) {
    const chunk = targetUsers.slice(index, index + CHUNK_SIZE);

    for (const user of chunk) {
      const preferences = userPreferencesMap.get(user.id);

      if (shouldSendInApp) {
        const allowInApp = preferences ? preferences.inApp : true;
        if (!allowInApp) {
          await recordDeliveryLog(
            `dlog_${crypto.randomBytes(8).toString('hex')}`,
            user,
            'IN_APP',
            'SKIPPED',
            'User disabled in-app notifications',
          );
        } else {
          const notificationId = `notif_${crypto.randomBytes(8).toString('hex')}`;
          let notificationInserted = false;
          try {
            insertNotifStmt.run(
              notificationId,
              user.id,
              payload.title,
              payload.message,
              priority,
              category,
              payload.actionUrl || null,
              payload.actionLabel || null,
              campaignId,
            );
            notificationInserted = true;
            const notificationRow = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notificationId) as Record<string, any> | undefined;
            if (!notificationRow || !(await persistNotificationDocument('notifications', notificationId, notificationRow))) {
              throw new Error('The notification could not be durably saved to Firestore.');
            }

            inAppSent++;
            await recordDeliveryLog(
              `dlog_${crypto.randomBytes(8).toString('hex')}`,
              user,
              'IN_APP',
              'DELIVERED',
              null,
            );
          } catch (error: any) {
            if (notificationInserted) {
              try { db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(notificationId, user.id); } catch {}
            }
            console.warn(`[NotificationService] Failed durable in-app delivery to user ${user.id}:`, error);
            await recordDeliveryLog(
              `dlog_${crypto.randomBytes(8).toString('hex')}`,
              user,
              'IN_APP',
              'FAILED',
              error?.message || 'In-app notification persistence failed',
            );
          }
        }
      }

      if (shouldSendEmail) {
        const allowEmail = preferences ? preferences.email : true;
        const allowMarketing = preferences ? preferences.marketing : true;

        if (!allowEmail && priority !== 'URGENT') {
          await recordDeliveryLog(
            `dlog_${crypto.randomBytes(8).toString('hex')}`,
            user,
            'EMAIL',
            'SKIPPED',
            'User opted out of email notifications',
          );
          continue;
        }

        if (category === 'PROMOTIONAL' && !allowMarketing) {
          await recordDeliveryLog(
            `dlog_${crypto.randomBytes(8).toString('hex')}`,
            user,
            'EMAIL',
            'SKIPPED',
            'User opted out of marketing emails',
          );
          continue;
        }

        try {
          const emailResult = await sendBroadcastNotificationEmail({
            recipient: user.email,
            recipientName: user.full_name || 'Student',
            title: payload.title,
            message: payload.message,
            category,
            priority,
            actionUrl: payload.actionUrl,
            actionLabel: payload.actionLabel,
            campaignId,
            adminId: payload.adminUserId,
          });

          if (emailResult.success) {
            emailSent++;
            await recordDeliveryLog(
              `dlog_${crypto.randomBytes(8).toString('hex')}`,
              user,
              'EMAIL',
              emailResult.status,
              emailResult.message || null,
            );
          } else {
            emailFailed++;
            await recordDeliveryLog(
              `dlog_${crypto.randomBytes(8).toString('hex')}`,
              user,
              'EMAIL',
              'FAILED',
              emailResult.message || 'SMTP delivery failure',
            );
          }
        } catch (error: any) {
          emailFailed++;
          console.warn(`[NotificationService] Email delivery failure for ${user.email}:`, error);
          await recordDeliveryLog(
            `dlog_${crypto.randomBytes(8).toString('hex')}`,
            user,
            'EMAIL',
            'FAILED',
            error?.message || 'Email delivery failure',
          );
        }
      }
    }

    if (index + CHUNK_SIZE < targetUsers.length) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  db.prepare(`
    UPDATE broadcast_campaigns
    SET status = 'COMPLETED',
        in_app_sent = ?,
        email_sent = ?,
        email_failed = ?,
        sent_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(inAppSent, emailSent, emailFailed, campaignId);

  const completedCampaign = db.prepare('SELECT * FROM broadcast_campaigns WHERE id = ?').get(campaignId) as Record<string, any>;
  const campaignPersisted = await persistNotificationDocument('broadcast_campaigns', campaignId, completedCampaign);
  if (!campaignPersisted) {
    // The notification/email attempts have already happened. Do not tell the operator
    // to resend blindly: that could duplicate user emails or in-app notices.
    console.error(`[NotificationService] Final campaign summary failed to persist for ${campaignId}.`);
  }

  try {
    const auditId = `audit_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'ADMIN_BROADCAST_SENT', 'BROADCAST_CAMPAIGN', ?, ?, CURRENT_TIMESTAMP)
    `).run(
      auditId,
      payload.adminUserId,
      campaignId,
      JSON.stringify({
        campaignId,
        title: payload.title,
        audience: payload.targetAudience,
        channels: payload.channels,
        priority: payload.priority,
        totalTargeted,
        inAppSent,
        emailSent,
        emailFailed,
      }),
    );
  } catch (error) {
    console.warn('[NotificationService] Audit log write warning:', error);
  }

  return {
    success: true,
    campaignId,
    totalTargeted,
    inAppSent,
    emailSent,
    emailFailed,
    status: campaignPersisted ? 'COMPLETED' : 'COMPLETED_WITH_PERSISTENCE_WARNING',
    persistenceWarning: !campaignPersisted,
  };
}

/**
 * Returns historical broadcast campaigns with summary stats.
 */
export function getBroadcastCampaigns(options: {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
}) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;

  let whereClauses: string[] = ['1=1'];
  const params: any[] = [];

  if (options.search && options.search.trim()) {
    whereClauses.push('(title LIKE ? OR message LIKE ?)');
    const term = `%${options.search.trim()}%`;
    params.push(term, term);
  }

  if (options.category && options.category !== 'ALL') {
    whereClauses.push('category = ?');
    params.push(options.category);
  }

  const whereSql = whereClauses.join(' AND ');

  const totalRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM broadcast_campaigns WHERE ${whereSql}
  `).get(...params) as { cnt: number };

  const campaigns = db.prepare(`
    SELECT * FROM broadcast_campaigns
    WHERE ${whereSql}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  // Aggregate stats
  const statsRow = db.prepare(`
    SELECT 
      COUNT(*) as totalCampaigns,
      COALESCE(SUM(total_targeted), 0) as totalTargetedAllTime,
      COALESCE(SUM(in_app_sent), 0) as totalInAppDelivered,
      COALESCE(SUM(email_sent), 0) as totalEmailsDelivered,
      COALESCE(SUM(email_failed), 0) as totalEmailsFailed
    FROM broadcast_campaigns
  `).get() as any;

  // Active users count
  const activeReachRow = db.prepare(`
    SELECT COUNT(*) as activeReach
    FROM users
    WHERE status != 'DELETED'
      AND role IN ('STUDENT', 'INSTITUTE_ADMIN')
      AND id NOT IN (SELECT entity_id FROM tombstones WHERE collection_name IN ('users', 'students', 'institutes'))
  `).get() as { activeReach: number };

  return {
    campaigns,
    pagination: {
      page,
      limit,
      totalCount: totalRow?.cnt || 0,
      totalPages: Math.ceil((totalRow?.cnt || 0) / limit),
    },
    metrics: {
      totalCampaigns: statsRow?.totalCampaigns || 0,
      totalTargetedAllTime: statsRow?.totalTargetedAllTime || 0,
      totalInAppDelivered: statsRow?.totalInAppDelivered || 0,
      totalEmailsDelivered: statsRow?.totalEmailsDelivered || 0,
      totalEmailsFailed: statsRow?.totalEmailsFailed || 0,
      activeAudienceReach: activeReachRow?.activeReach || 0,
    },
  };
}

/**
 * Returns single campaign details and delivery logs breakdown.
 */
export function getCampaignDetails(campaignId: string) {
  const campaign = db.prepare(`
    SELECT * FROM broadcast_campaigns WHERE id = ?
  `).get(campaignId);

  if (!campaign) return null;

  const logs = db.prepare(`
    SELECT * FROM notification_delivery_logs
    WHERE campaign_id = ?
    ORDER BY created_at DESC
    LIMIT 200
  `).all(campaignId);

  const statusBreakdown = db.prepare(`
    SELECT channel, status, COUNT(*) as count
    FROM notification_delivery_logs
    WHERE campaign_id = ?
    GROUP BY channel, status
  `).all(campaignId);

  return {
    campaign,
    logs,
    statusBreakdown,
  };
}

/**
 * Get or update user notification preferences
 */
export function getUserNotificationPreferences(userId: string) {
  let prefs = db.prepare(`
    SELECT * FROM user_notification_preferences WHERE user_id = ?
  `).get(userId) as any;

  if (!prefs) {
    db.prepare(`
      INSERT OR IGNORE INTO user_notification_preferences (
        user_id, email_notifications_enabled, marketing_emails_enabled, in_app_notifications_enabled
      ) VALUES (?, 1, 1, 1)
    `).run(userId);
    prefs = {
      user_id: userId,
      email_notifications_enabled: 1,
      marketing_emails_enabled: 1,
      in_app_notifications_enabled: 1,
    };
  }

  return {
    emailNotificationsEnabled: prefs.email_notifications_enabled === 1,
    marketingEmailsEnabled: prefs.marketing_emails_enabled === 1,
    inAppNotificationsEnabled: prefs.in_app_notifications_enabled === 1,
  };
}

export function updateUserNotificationPreferences(
  userId: string,
  updates: {
    emailNotificationsEnabled?: boolean;
    marketingEmailsEnabled?: boolean;
    inAppNotificationsEnabled?: boolean;
  }
) {
  getUserNotificationPreferences(userId); // ensure row exists

  const current = getUserNotificationPreferences(userId);
  const emailVal = updates.emailNotificationsEnabled !== undefined ? (updates.emailNotificationsEnabled ? 1 : 0) : (current.emailNotificationsEnabled ? 1 : 0);
  const mktVal = updates.marketingEmailsEnabled !== undefined ? (updates.marketingEmailsEnabled ? 1 : 0) : (current.marketingEmailsEnabled ? 1 : 0);
  const inAppVal = updates.inAppNotificationsEnabled !== undefined ? (updates.inAppNotificationsEnabled ? 1 : 0) : (current.inAppNotificationsEnabled ? 1 : 0);

  db.prepare(`
    UPDATE user_notification_preferences
    SET email_notifications_enabled = ?,
        marketing_emails_enabled = ?,
        in_app_notifications_enabled = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(emailVal, mktVal, inAppVal, userId);

  return getUserNotificationPreferences(userId);
}
