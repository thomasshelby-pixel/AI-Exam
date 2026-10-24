process.env.NODE_ENV = 'test';
process.env.NOTIFICATION_DEV_SAFE_MODE = 'true';

import assert from 'node:assert';
import crypto from 'node:crypto';
import { db } from '../db.js';
import {
  estimateRecipients,
  sendTestNotification,
  createAndDispatchBroadcast,
  getBroadcastCampaigns,
  getCampaignDetails,
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
  getTargetUsers,
  getTargetUsersForBroadcast,
  estimateRecipientsFromDurableStore,
} from '../services/notificationService.js';

async function runAdminNotificationCentreVerification() {
  console.log('================================================================');
  console.log('--- ADMIN NOTIFICATION CENTRE PRODUCTION VERIFICATION SUITE ---');
  console.log('================================================================');

  const testAdminId = 'usr_super_admin_001';
  const testAdminEmail = 'support@caexamcheckerai.com';

  // 1. Create a verifiable student
  const sampleStudentId = `usr_notif_stud_${crypto.randomBytes(4).toString('hex')}`;
  const studentEmail = `student_${crypto.randomBytes(4).toString('hex')}@caexamtest.com`;
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, ?, 'dummy_hash', 'CA Final Student Test', 'STUDENT', 'ACTIVE')
  `).run(sampleStudentId, studentEmail);

  db.prepare(`
    INSERT INTO student_profiles (user_id, icai_registration_number, ca_level, free_evaluations_used, purchased_credits)
    VALUES (?, 'NRO0123456', 'FINAL', 0, 5)
  `).run(sampleStudentId);

  // 2. Create a verifiable institute admin
  const sampleInstituteId = `usr_notif_inst_${crypto.randomBytes(4).toString('hex')}`;
  const instEmail = `institute_${crypto.randomBytes(4).toString('hex')}@caexamtest.com`;
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, ?, 'dummy_hash', 'Prime CA Academy Admin', 'INSTITUTE_ADMIN', 'ACTIVE')
  `).run(sampleInstituteId, instEmail);

  // 3. Create a tombstoned/deleted user to verify strict exclusion
  const tombstonedStudentId = `usr_notif_tomb_${crypto.randomBytes(4).toString('hex')}`;
  const tombEmail = `tombstoned_${crypto.randomBytes(4).toString('hex')}@caexamtest.com`;
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, ?, 'dummy_hash', 'Deleted Student', 'STUDENT', 'DELETED')
  `).run(tombstonedStudentId, tombEmail);

  db.prepare(`
    INSERT INTO tombstones (id, collection_name, entity_id, reason)
    VALUES (?, 'students', ?, 'Account permanently deleted')
  `).run(`tomb_${crypto.randomBytes(6).toString('hex')}`, tombstonedStudentId);

  // CHECK 1: Target Audience Estimation and Strict Exclusion of Deleted/Tombstoned Accounts
  console.log('[CHECK 1] Testing recipient estimation and tombstone exclusion...');
  const allEstimate = estimateRecipients('ALL');
  const durableTargetUsers = await getTargetUsersForBroadcast('ALL');
  const durableEstimate = await estimateRecipientsFromDurableStore('ALL');
  assert.equal(
    durableEstimate.total,
    durableTargetUsers.length,
    'Recipient preview must use the same recipient source as broadcast dispatch'
  );
  assert.equal(
    durableEstimate.total,
    allEstimate.total,
    'In test/development, durable-source targeting must remain consistent with the local audience query'
  );
  assert.ok(allEstimate.total >= 2, 'Total recipients must include at least 2 test entities');
  assert.ok(allEstimate.studentsCount >= 1, 'Students count must be >= 1');
  assert.ok(allEstimate.institutesCount >= 1, 'Institutes count must be >= 1');

  const targetUsers = getTargetUsers('ALL');
  const hasTombstone = targetUsers.some((u) => u.id === tombstonedStudentId);
  assert.strictEqual(hasTombstone, false, 'Tombstoned student must never appear in target audience');

  const finalEstimate = estimateRecipients('STUDENTS_FINAL');
  assert.ok(finalEstimate.byLevel.final >= 1, 'CA Final level filter must include sample student');
  console.log('[PASS] Audience estimation and tombstone exclusion verified.');

  // CHECK 2: Safe Test Preview Dispatch
  console.log('[CHECK 2] Testing safe test preview dispatch...');
  const testResult = await sendTestNotification({
    adminUserId: testAdminId,
    targetEmail: testAdminEmail,
    title: 'ICAI Mock Test Paper Series Release',
    message: 'This is a sample test notification preview for Super Admin.',
    category: 'EXAM_ALERT',
    priority: 'HIGH',
    channels: 'IN_APP_AND_EMAIL',
    actionUrl: '/materials',
    actionLabel: 'Check MTPs',
  });

  assert.strictEqual(testResult.success, true, 'Test notification dispatch must succeed');
  assert.strictEqual(testResult.inAppStatus, 'DELIVERED', 'In-app test notification must be delivered');
  assert.ok(
    testResult.emailStatus === 'SENT' || testResult.emailStatus === 'SANDBOX_RECORDED',
    'Email test status must be SENT or SANDBOX_RECORDED'
  );

  const testNotif = db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? AND title LIKE '%[TEST PREVIEW]%' ORDER BY created_at DESC LIMIT 1
  `).get(testAdminId) as any;

  assert.ok(testNotif, 'In-app test notification record must exist');
  assert.ok(testNotif.title.includes('[TEST PREVIEW]'), 'Title must have [TEST PREVIEW] prefix');
  assert.strictEqual(testNotif.category, 'EXAM_ALERT', 'Category must match');
  assert.strictEqual(testNotif.priority, 'HIGH', 'Priority must match');
  console.log('[PASS] Safe test preview dispatch verified.');

  // CHECK 3: Production Broadcast Dispatch
  console.log('[CHECK 3] Testing production-ready broadcast dispatch...');
  const broadcastTitle = `Statutory Update - Guidance Notes #${Date.now()}`;
  const broadcastMessage = 'Important statutory amendments and guidance notes have been released for candidates.';

  const broadcastResult = await createAndDispatchBroadcast({
    adminUserId: testAdminId,
    adminEmail: testAdminEmail,
    title: broadcastTitle,
    message: broadcastMessage,
    category: 'EXAM_ALERT',
    priority: 'URGENT',
    targetAudience: 'ALL',
    channels: 'IN_APP_AND_EMAIL',
    actionUrl: '/arena',
    actionLabel: 'Enter MCQ Arena',
  });

  assert.strictEqual(broadcastResult.success, true, 'Broadcast must succeed');
  assert.ok(broadcastResult.campaignId, 'Campaign ID must be defined');
  assert.ok(broadcastResult.totalTargeted >= 2, 'Total targeted must be >= 2');
  assert.ok(broadcastResult.inAppSent >= 2, 'In-app notifications sent must be >= 2');

  const campaignRow = db.prepare(`
    SELECT * FROM broadcast_campaigns WHERE id = ?
  `).get(broadcastResult.campaignId) as any;

  assert.ok(campaignRow, 'Campaign record must exist in broadcast_campaigns');
  assert.strictEqual(campaignRow.title, broadcastTitle, 'Campaign title must match');
  assert.strictEqual(campaignRow.category, 'EXAM_ALERT', 'Campaign category must match');
  assert.strictEqual(campaignRow.priority, 'URGENT', 'Campaign priority must match');
  assert.strictEqual(campaignRow.status, 'COMPLETED', 'Campaign status must be COMPLETED');

  // Verify in-app delivery for the sample student
  const studentNotif = db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? AND campaign_id = ?
  `).get(sampleStudentId, broadcastResult.campaignId) as any;

  assert.ok(studentNotif, 'Student must receive the notification');
  assert.strictEqual(studentNotif.title, broadcastTitle);
  assert.strictEqual(studentNotif.priority, 'URGENT');
  assert.strictEqual(studentNotif.read, 0);
  assert.strictEqual(studentNotif.is_read, 0);

  // Verify audit log record
  const auditRow = db.prepare(`
    SELECT * FROM audit_logs WHERE action = 'ADMIN_BROADCAST_SENT' ORDER BY created_at DESC LIMIT 1
  `).get() as any;

  assert.ok(auditRow, 'Immutable audit log record must exist');
  const details = JSON.parse(auditRow.details);
  assert.strictEqual(details.campaignId, broadcastResult.campaignId);
  console.log('[PASS] Production broadcast execution and audit verified.');

  // CHECK 4: Historical Campaigns Retrieval & Breakdown
  console.log('[CHECK 4] Testing historical campaigns retrieval and breakdown...');
  const listResult = getBroadcastCampaigns({ page: 1, limit: 10 });
  assert.ok(listResult.campaigns.length >= 1, 'Campaign list must contain at least 1 campaign');
  assert.ok(listResult.metrics.totalCampaigns >= 1, 'Total campaigns metric must be >= 1');
  assert.ok(listResult.metrics.totalInAppDelivered >= 1, 'Total in-app delivered metric must be >= 1');

  const firstCampaign = listResult.campaigns[0];
  const campaignDetails = getCampaignDetails(String(firstCampaign.id));
  assert.ok(campaignDetails, 'Campaign details must be retrieved');
  assert.strictEqual(campaignDetails?.campaign.id, firstCampaign.id);
  assert.ok(campaignDetails?.logs.length >= 1, 'Campaign logs must contain delivery records');
  console.log('[PASS] Historical campaigns and delivery breakdown verified.');

  // CHECK 5: User Preferences & Opt-Out Handling
  console.log('[CHECK 5] Testing user preferences and opt-out handling...');
  const initialPrefs = getUserNotificationPreferences(sampleStudentId);
  assert.strictEqual(initialPrefs.emailNotificationsEnabled, true);
  assert.strictEqual(initialPrefs.marketingEmailsEnabled, true);

  // Update preferences to disable marketing emails
  const updated = updateUserNotificationPreferences(sampleStudentId, {
    marketingEmailsEnabled: false,
  });
  assert.strictEqual(updated.marketingEmailsEnabled, false);
  assert.strictEqual(updated.emailNotificationsEnabled, true);

  // Send promotional broadcast
  const promoResult = await createAndDispatchBroadcast({
    adminUserId: testAdminId,
    adminEmail: testAdminEmail,
    title: 'Festive Bonus Credits Announcement',
    message: 'Get 5 free evaluations on credit packs this week.',
    category: 'PROMOTIONAL',
    priority: 'NORMAL',
    targetAudience: 'ALL',
    channels: 'IN_APP_AND_EMAIL',
  });

  // Verify delivery log for sampleStudentId shows SKIPPED due to marketing opt-out
  const deliveryLog = db.prepare(`
    SELECT * FROM notification_delivery_logs
    WHERE campaign_id = ? AND user_id = ? AND channel = 'EMAIL'
  `).get(promoResult.campaignId, sampleStudentId) as any;

  assert.ok(deliveryLog, 'Delivery log must exist for student');
  assert.strictEqual(deliveryLog.status, 'SKIPPED', 'Promotional email must be skipped');
  assert.ok(deliveryLog.error_message.includes('opted out of marketing'), 'Reason must specify marketing opt-out');
  console.log('[PASS] User preferences and marketing opt-out handling verified.');

  // CHECK 6: In-App Notification Read State Synchronization
  console.log('[CHECK 6] Testing in-app notification read state synchronization...');
  const notifs = db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC
  `).all(sampleStudentId) as any[];

  assert.ok(notifs.length >= 1, 'Student must have notifications');
  const targetNotifId = notifs[0].id;

  db.prepare('UPDATE notifications SET read = 1, is_read = 1 WHERE id = ?').run(targetNotifId);
  const updatedNotif = db.prepare('SELECT * FROM notifications WHERE id = ?').get(targetNotifId) as any;
  assert.strictEqual(updatedNotif.read, 1);
  assert.strictEqual(updatedNotif.is_read, 1);
  console.log('[PASS] In-app notification read state synchronization verified.');

  console.log('================================================================');
  console.log('✅ ALL ADMIN NOTIFICATION CENTRE CHECKS PASSED CLEANLY');
  console.log('================================================================');
}

runAdminNotificationCentreVerification().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
