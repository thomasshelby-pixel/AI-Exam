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
    success: inAppStatus !== 'FAILED' && emailStatus !== 'FAILED',
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
}> {
  const targetUsers = getTargetUsers(payload.targetAudience);
  const campaignId = `cmp_${crypto.randomBytes(8).toString('hex')}`;
  const totalTargeted = targetUsers.length;

  const channels = payload.channels || 'IN_APP_AND_EMAIL';
  const category = payload.category || 'ANNOUNCEMENT';
  const priority = payload.priority || 'NORMAL';

  // Record initial broadcast campaign in DB
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
    payload.adminEmail || payload.adminUserId
  );

  let inAppSent = 0;
  let emailSent = 0;
  let emailFailed = 0;

  const shouldSendInApp = channels === 'IN_APP' || channels === 'IN_APP_AND_EMAIL';
  const shouldSendEmail = channels === 'EMAIL' || channels === 'IN_APP_AND_EMAIL';

  // Fetch all user notification preferences to respect opt-outs
  const userPreferencesMap = new Map<string, { email: boolean; marketing: boolean; inApp: boolean }>();
  try {
    const prefs = db.prepare(`SELECT * FROM user_notification_preferences`).all() as any[];
    for (const p of prefs) {
      userPreferencesMap.set(p.user_id, {
        email: p.email_notifications_enabled === 1,
        marketing: p.marketing_emails_enabled === 1,
        inApp: p.in_app_notifications_enabled === 1,
      });
    }
  } catch (err) {
    console.warn('[NotificationService] Preference check warning:', err);
  }

  // Prepared statements for batch operations
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

  // Process in chunks of 50 to prevent blocking the event loop
  const CHUNK_SIZE = 50;
  for (let i = 0; i < targetUsers.length; i += CHUNK_SIZE) {
    const chunk = targetUsers.slice(i, i + CHUNK_SIZE);

    for (const u of chunk) {
      const uPrefs = userPreferencesMap.get(u.id);

      // --- IN-APP DISPATCH ---
      if (shouldSendInApp) {
        const allowInApp = uPrefs ? uPrefs.inApp : true;
        if (allowInApp) {
          try {
            const notifId = `notif_${crypto.randomBytes(8).toString('hex')}`;
            insertNotifStmt.run(
              notifId,
              u.id,
              payload.title,
              payload.message,
              priority,
              category,
              payload.actionUrl || null,
              payload.actionLabel || null,
              campaignId
            );
            inAppSent++;

            const logId = `dlog_${crypto.randomBytes(8).toString('hex')}`;
            insertDeliveryLogStmt.run(
              logId,
              campaignId,
              u.id,
              u.email,
              u.role,
              'IN_APP',
              'DELIVERED',
              null
            );
          } catch (err: any) {
            console.warn(`[NotificationService] Failed in-app delivery to user ${u.id}:`, err);
            const logId = `dlog_${crypto.randomBytes(8).toString('hex')}`;
            insertDeliveryLogStmt.run(
              logId,
              campaignId,
              u.id,
              u.email,
              u.role,
              'IN_APP',
              'FAILED',
              err.message
            );
          }
        } else {
          const logId = `dlog_${crypto.randomBytes(8).toString('hex')}`;
          insertDeliveryLogStmt.run(
            logId,
            campaignId,
            u.id,
            u.email,
            u.role,
            'IN_APP',
            'SKIPPED',
            'User disabled in-app notifications'
          );
        }
      }

      // --- EMAIL DISPATCH ---
      if (shouldSendEmail) {
        const allowEmail = uPrefs ? uPrefs.email : true;
        const allowMarketing = uPrefs ? uPrefs.marketing : true;

        if (!allowEmail && priority !== 'URGENT') {
          const logId = `dlog_${crypto.randomBytes(8).toString('hex')}`;
          insertDeliveryLogStmt.run(
            logId,
            campaignId,
            u.id,
            u.email,
            u.role,
            'EMAIL',
            'SKIPPED',
            'User opted out of email notifications'
          );
          continue;
        }

        if (category === 'PROMOTIONAL' && !allowMarketing) {
          const logId = `dlog_${crypto.randomBytes(8).toString('hex')}`;
          insertDeliveryLogStmt.run(
            logId,
            campaignId,
            u.id,
            u.email,
            u.role,
            'EMAIL',
            'SKIPPED',
            'User opted out of marketing emails'
          );
          continue;
        }

        try {
          const emailRes = await sendBroadcastNotificationEmail({
            recipient: u.email,
            recipientName: u.full_name || 'Student',
            title: payload.title,
            message: payload.message,
            category,
            priority,
            actionUrl: payload.actionUrl,
            actionLabel: payload.actionLabel,
            campaignId,
            adminId: payload.adminUserId,
          });

          if (emailRes.success) {
            emailSent++;
            const logId = `dlog_${crypto.randomBytes(8).toString('hex')}`;
            insertDeliveryLogStmt.run(
              logId,
              campaignId,
              u.id,
              u.email,
              u.role,
              'EMAIL',
              emailRes.status,
              emailRes.message || null
            );
          } else {
            emailFailed++;
            const logId = `dlog_${crypto.randomBytes(8).toString('hex')}`;
            insertDeliveryLogStmt.run(
              logId,
              campaignId,
              u.id,
              u.email,
              u.role,
              'EMAIL',
              'FAILED',
              emailRes.message || 'SMTP delivery failure'
            );
          }
        } catch (err: any) {
          emailFailed++;
          console.warn(`[NotificationService] Email delivery failure for ${u.email}:`, err);
          const logId = `dlog_${crypto.randomBytes(8).toString('hex')}`;
          insertDeliveryLogStmt.run(
            logId,
            campaignId,
            u.id,
            u.email,
            u.role,
            'EMAIL',
            'FAILED',
            err.message
          );
        }
      }
    }

    // Small micro-yield between chunks if more chunks remain
    if (i + CHUNK_SIZE < targetUsers.length) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  // Update campaign summary stats
  db.prepare(`
    UPDATE broadcast_campaigns
    SET status = 'COMPLETED',
        in_app_sent = ?,
        email_sent = ?,
        email_failed = ?,
        sent_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(inAppSent, emailSent, emailFailed, campaignId);

  // Write immutable audit log
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
      })
    );
  } catch (err) {
    console.warn('[NotificationService] Audit log write warning:', err);
  }

  return {
    success: true,
    campaignId,
    totalTargeted,
    inAppSent,
    emailSent,
    emailFailed,
    status: 'COMPLETED',
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
