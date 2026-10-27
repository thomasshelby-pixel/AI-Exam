import crypto from 'node:crypto';
import { deleteFileFromCloudStorage } from './firebaseCloudStorageService.js';
import { deleteEvaluationCloudFiles, deleteStudentCloudFiles } from './persistentStorageService.js';
import {
  deleteFirestoreDocInDatabase,
  getAllFirestoreDocs,
  getAllFirestoreDocsInDatabase,
  getFirestoreDoc,
  queryFirestoreDocs,
  setFirestoreDoc,
} from './firestoreDbService.js';
import { permanentlyDeleteFromFirestore } from './firestoreSyncService.js';

const LEGACY_APP_DATABASE_ID = 'ai-studio-aiexamapp-84322cc5-3d67-4034-bd47-214b89165488';

type FirestoreDoc = Record<string, any> & { id: string };
type CleanupTarget = { collectionName: string; docId: string; userId: string; file?: boolean };

const COLLECTION_LINK_FIELDS: Array<{ collectionName: string; fields: string[] }> = [
  { collectionName: 'student_examiner_profiles', fields: ['student_id', 'user_id'] },
  { collectionName: 'evaluations', fields: ['student_id', 'user_id', 'owner_user_id'] },
  { collectionName: 'user_sessions', fields: ['user_id'] },
  { collectionName: 'student_credit_purchases', fields: ['user_id'] },
  { collectionName: 'credit_ledger', fields: ['student_id', 'user_id'] },
  { collectionName: 'assignment_submissions', fields: ['student_id', 'user_id'] },
  { collectionName: 'institute_memberships', fields: ['student_id', 'user_id'] },
  { collectionName: 'notifications', fields: ['user_id'] },
  { collectionName: 'account_suspensions', fields: ['user_id'] },
  { collectionName: 'revocation_requests', fields: ['user_id'] },
  { collectionName: 'support_tickets', fields: ['user_id'] },
  { collectionName: 'referral_redemptions', fields: ['user_id'] },
  { collectionName: 'trusted_devices', fields: ['user_id'] },
  { collectionName: 'user_device_activity', fields: ['user_id'] },
  { collectionName: 'students_by_code', fields: ['user_id'] },
];

function getUserIdFromTombstone(tombstone: FirestoreDoc): string | null {
  if (String(tombstone.collectionName || '').trim() === 'users' && tombstone.targetId) {
    return String(tombstone.targetId).trim();
  }
  const rawId = String(tombstone.id || '').trim();
  if (rawId.startsWith('users_')) return rawId.slice('users_'.length);
  if (rawId.startsWith('users:')) return rawId.slice('users:'.length);
  return null;
}

function safeReason(userId: string): string {
  return `Orphaned student data cleanup for confirmed deleted account ${userId}`;
}

export interface DeletedAccountReconciliationPreview {
  generatedAt: string;
  tombstonedAccountCount: number;
  linkedDocumentCount: number;
  linkedDocumentsByCollection: Record<string, number>;
  cloudFileMetadataCount: number;
  legacyAppActivityCount: number;
  accounts: Array<{
    userId: string;
    email: string | null;
    displayName: string | null;
    linkedDocumentCount: number;
    cloudFileCount: number;
  }>;
  warnings: string[];
}

/**
 * Reconciles only account IDs that already have a durable users tombstone.
 * It intentionally never infers deletion from a missing SQLite row, because
 * SQLite is a per-instance cache and is not a safe cross-instance source of truth.
 */
async function buildCleanupPlan(): Promise<{
  preview: DeletedAccountReconciliationPreview;
  targets: CleanupTarget[];
  fileTargets: Array<{ fileId: string; storagePath?: string; userId: string }>;
  legacyActivityIds: string[];
  tombstonedUserIds: string[];
  evaluationsByUser: Map<string, string[]>;
}> {
  const tombstones = await getAllFirestoreDocs<FirestoreDoc>('tombstones', { failOnError: true });
  const tombstonedUserIds = [...new Set(tombstones.map(getUserIdFromTombstone).filter((id): id is string => Boolean(id)))];
  const targets: CleanupTarget[] = [];
  const fileTargets: Array<{ fileId: string; storagePath?: string; userId: string }> = [];
  const evaluationsByUser = new Map<string, string[]>();
  const accounts: DeletedAccountReconciliationPreview['accounts'] = [];
  const warnings: string[] = [];
  const byCollection: Record<string, number> = {};
  let legacyActivityIds: string[] = [];

  // Keep reconciliation read volume predictable: query only records related to
  // each explicitly deleted user instead of scanning the entire application data.
  for (const userId of tombstonedUserIds) {
    const user = await getFirestoreDoc<FirestoreDoc>('users', userId, { failOnError: true });
    const profile = await getFirestoreDoc<FirestoreDoc>('student_profiles', userId, { failOnError: true });
    const email = String(user?.email || profile?.email || '').trim().toLowerCase() || null;
    const displayName = String(user?.full_name || profile?.full_name || '').trim() || null;
    const userTargets = new Map<string, CleanupTarget>();

    const addTarget = (collectionName: string, docId: string, file = false) => {
      if (!docId) return;
      userTargets.set(`${collectionName}/${docId}`, { collectionName, docId, userId, ...(file ? { file: true } : {}) });
    };

    if (user) addTarget('users', userId);
    if (profile) addTarget('student_profiles', userId);

    for (const spec of COLLECTION_LINK_FIELDS) {
      for (const field of spec.fields) {
        const rows = await queryFirestoreDocs<FirestoreDoc>(
          spec.collectionName,
          [{ field, op: '==', value: userId }],
          { failOnError: true },
        );
        for (const row of rows) addTarget(spec.collectionName, row.id);
      }
    }

    const evaluationIds = [...new Set([...userTargets.values()]
      .filter((target) => target.collectionName === 'evaluations')
      .map((target) => target.docId))];
    evaluationsByUser.set(userId, evaluationIds);

    // Include records that use the account email rather than a user ID.
    if (email) {
      const entitlements = await queryFirestoreDocs<FirestoreDoc>(
        'permanent_free_entitlements',
        [{ field: 'email', op: '==', value: email }],
        { failOnError: true },
      );
      for (const row of entitlements) addTarget('permanent_free_entitlements', row.id);
      const tickets = await queryFirestoreDocs<FirestoreDoc>(
        'support_tickets',
        [{ field: 'email', op: '==', value: email }],
        { failOnError: true },
      );
      for (const row of tickets) addTarget('support_tickets', row.id);
    }

    const filesForUser = await queryFirestoreDocs<FirestoreDoc>(
      'file_storage_metadata',
      [{ field: 'ownerUserId', op: '==', value: userId }],
      { failOnError: true },
    );
    const fileMap = new Map<string, FirestoreDoc>();
    for (const file of filesForUser) fileMap.set(file.id, file);
    for (const evaluationId of evaluationIds) {
      const filesForEvaluation = await queryFirestoreDocs<FirestoreDoc>(
        'file_storage_metadata',
        [{ field: 'evaluationId', op: '==', value: evaluationId }],
        { failOnError: true },
      );
      for (const file of filesForEvaluation) fileMap.set(file.id, file);
    }
    for (const [fileId, file] of fileMap) {
      fileTargets.push({ fileId, storagePath: file.storagePath, userId });
    }

    // IDs are globally unique within their collection; de-duplicate by collection/path.
    for (const target of userTargets.values()) {
      targets.push(target);
      byCollection[target.collectionName] = (byCollection[target.collectionName] || 0) + 1;
    }
    accounts.push({
      userId,
      email,
      displayName,
      linkedDocumentCount: userTargets.size,
      cloudFileCount: fileMap.size,
    });
  }

  // The app used a separate named database before the shared-database migration.
  // Clean only login-activity documents linked to users already tombstoned in the
  // primary authoritative database; preserve all other legacy telemetry.
  if (tombstonedUserIds.length > 0) {
    try {
      const legacyActivity = await getAllFirestoreDocsInDatabase<FirestoreDoc>(
        LEGACY_APP_DATABASE_ID,
        'user_device_activity',
        { failOnError: true },
      );
      const deletedIds = new Set(tombstonedUserIds);
      legacyActivityIds = legacyActivity
        .filter((doc) => deletedIds.has(String(doc.user_id || '')))
        .map((doc) => doc.id);
    } catch (error) {
      warnings.push('Legacy app-database activity could not be scanned. Primary-database cleanup remains available; legacy rows need a separate retry.');
      console.warn('[DeletedAccountReconciliation] Legacy app activity scan failed:', error);
    }
  }

  const cloudFileMetadataCount = fileTargets.length;
  return {
    preview: {
      generatedAt: new Date().toISOString(),
      tombstonedAccountCount: tombstonedUserIds.length,
      linkedDocumentCount: targets.length,
      linkedDocumentsByCollection: byCollection,
      cloudFileMetadataCount,
      legacyAppActivityCount: legacyActivityIds.length,
      accounts: accounts.slice(0, 100),
      warnings,
    },
    targets,
    fileTargets,
    legacyActivityIds,
    tombstonedUserIds,
    evaluationsByUser,
  };
}

export async function previewDeletedAccountReconciliation(): Promise<DeletedAccountReconciliationPreview> {
  const { preview } = await buildCleanupPlan();
  return preview;
}

export async function executeDeletedAccountReconciliation(actor: {
  id: string;
  email?: string;
}): Promise<{
  runId: string;
  deletedDocuments: number;
  deletedCloudFiles: number;
  deletedLegacyActivity: number;
  skippedAccounts: number;
  preview: DeletedAccountReconciliationPreview;
}> {
  const plan = await buildCleanupPlan();
  const { preview } = plan;
  const runId = `deleted_cleanup_${crypto.randomBytes(10).toString('hex')}`;
  const deletedByCollection: Record<string, number> = {};
  let deletedDocuments = 0;
  let deletedCloudFiles = 0;
  let deletedLegacyActivity = 0;
  let skippedAccounts = 0;

  // Remove underlying Cloud Storage files first. If access is denied, keep the
  // associated account metadata in the report rather than silently claiming success.
  for (const target of plan.fileTargets) {
    const success = await deleteFileFromCloudStorage(target.fileId, target.storagePath);
    if (success) deletedCloudFiles += 1;
    else {
      preview.warnings.push(`Cloud file ${target.fileId} could not be confirmed deleted. Check Cloud Storage permissions and retry if needed.`);
    }
  }

  for (const target of plan.targets) {
    const deleted = await permanentlyDeleteFromFirestore(
      target.collectionName,
      target.docId,
      safeReason(target.userId),
      { failOnError: true },
    );
    if (deleted) {
      deletedDocuments += 1;
      deletedByCollection[target.collectionName] = (deletedByCollection[target.collectionName] || 0) + 1;
    }
  }

  // Cloud helper catches most underlying errors; explicitly re-run the evaluation
  // and owner cleanup to remove files whose metadata was created by older flows.
  for (const userId of plan.tombstonedUserIds) {
    for (const evaluationId of plan.evaluationsByUser.get(userId) || []) {
      try {
        await deleteEvaluationCloudFiles(evaluationId);
      } catch (error) {
        preview.warnings.push(`Evaluation file cleanup failed for ${evaluationId}.`);
        console.warn('[DeletedAccountReconciliation] Evaluation file cleanup failed:', error);
      }
    }
    try {
      await deleteStudentCloudFiles(userId);
    } catch (error) {
      preview.warnings.push(`Student file cleanup failed for ${userId}.`);
      console.warn('[DeletedAccountReconciliation] Student file cleanup failed:', error);
    }
  }

  for (const docId of plan.legacyActivityIds) {
    const removed = await deleteFirestoreDocInDatabase(
      LEGACY_APP_DATABASE_ID,
      'user_device_activity',
      docId,
    );
    if (!removed) {
      preview.warnings.push(`Legacy app activity document ${docId} could not be deleted.`);
    } else {
      deletedLegacyActivity += 1;
    }
  }

  const unresolvedUserIds: string[] = [];
  for (const userId of plan.tombstonedUserIds) {
    const remaining = await getFirestoreDoc<FirestoreDoc>('users', userId, { failOnError: true });
    if (remaining) unresolvedUserIds.push(userId);
  }
  skippedAccounts = unresolvedUserIds.length;
  if (unresolvedUserIds.length) {
    preview.warnings.push(`Some tombstoned user records are still visible: ${unresolvedUserIds.slice(0, 20).join(', ')}`);
  }

  const auditRecord = {
    id: runId,
    runId,
    actorUserId: actor.id,
    actorEmail: actor.email || null,
    createdAt: new Date().toISOString(),
    tombstonedAccountCount: preview.tombstonedAccountCount,
    plannedDocuments: preview.linkedDocumentCount,
    deletedDocuments,
    deletedDocumentsByCollection: deletedByCollection,
    plannedCloudFiles: preview.cloudFileMetadataCount,
    deletedCloudFiles,
    legacyActivityPlanned: preview.legacyAppActivityCount,
    deletedLegacyActivity,
    unresolvedUserIds,
    warnings: preview.warnings,
  };
  const auditSaved = await setFirestoreDoc('admin_cleanup_runs', runId, auditRecord);
  if (!auditSaved) {
    preview.warnings.push('Cleanup completed, but the audit record could not be saved to Firestore.');
  }

  return {
    runId,
    deletedDocuments,
    deletedCloudFiles,
    deletedLegacyActivity,
    skippedAccounts,
    preview,
  };
}
