import crypto from 'node:crypto';
import {
  getAllFirestoreDocs,
  getFirestoreDoc,
  setFirestoreDoc,
  deleteFirestoreDoc,
} from './firestoreDbService.js';
import {
  downloadFileFromCloudStorage,
  uploadFileToCloudStorage,
  deleteCloudStorageObject,
  type CloudFileMetadata,
} from './firebaseCloudStorageService.js';

export type AppReleaseKind = 'APK' | 'OTA';
export type AppReleaseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface AppUpdateRelease {
  id: string;
  kind: AppReleaseKind;
  status: AppReleaseStatus;
  versionName: string;
  versionCode?: number;
  mandatory: boolean;
  releaseNotes: string;
  checksum: string;
  fileId: string;
  storagePath: string;
  storageBucket: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
  publishedAt?: string;
  publishedBy?: string;
  mimeType: string;
}

const RELEASES_COLLECTION = 'app_update_releases';
const CHANNELS_COLLECTION = 'app_update_channels';
export const ANDROID_PACKAGE_ID = 'com.caexamchecker.aiapp';
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function releaseDocumentId(kind: AppReleaseKind, version: string | number): string {
  const cleanVersion = String(version).trim().replace(/[^A-Za-z0-9.+-]/g, '');
  return `${kind}-${cleanVersion}`;
}

function compareSemver(a: string, b: string): number {
  const parse = (value: string) => {
    const [base, prerelease = ''] = value.split('-', 2);
    const parts = base.split('+')[0].split('.').map((part) => Number(part));
    return { parts, prerelease };
  };
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i++) {
    const delta = (left.parts[i] || 0) - (right.parts[i] || 0);
    if (delta !== 0) return delta > 0 ? 1 : -1;
  }
  if (!left.prerelease && right.prerelease) return 1;
  if (left.prerelease && !right.prerelease) return -1;
  return left.prerelease.localeCompare(right.prerelease);
}

export async function getPublishedAppRelease(kind: AppReleaseKind): Promise<AppUpdateRelease | null> {
  const channelId = kind === 'APK' ? 'android_current' : 'ota_current';
  const channel = await getFirestoreDoc<Record<string, any>>(CHANNELS_COLLECTION, channelId, { failOnError: true });
  if (!channel?.releaseId) return null;
  const release = await getFirestoreDoc<AppUpdateRelease>(RELEASES_COLLECTION, String(channel.releaseId), { failOnError: true });
  if (!release || release.status !== 'PUBLISHED' || release.kind !== kind) return null;
  return release;
}

export async function listAppUpdateReleases(): Promise<{ currentApk: AppUpdateRelease | null; currentOta: AppUpdateRelease | null; releases: AppUpdateRelease[] }> {
  const [currentApk, currentOta, releases] = await Promise.all([
    getPublishedAppRelease('APK'),
    getPublishedAppRelease('OTA'),
    getAllFirestoreDocs<AppUpdateRelease>(RELEASES_COLLECTION, { failOnError: true }),
  ]);
  releases.sort((a, b) => String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || '')));
  return { currentApk, currentOta, releases };
}

export async function uploadAppUpdateRelease(input: {
  kind: AppReleaseKind;
  versionName: string;
  versionCode?: number;
  mandatory?: boolean;
  releaseNotes?: string;
  otaChecksum?: string;
  buffer: Buffer;
  uploadedBy: string;
}): Promise<AppUpdateRelease> {
  const kind = input.kind;
  const versionName = String(input.versionName || '').trim();
  const versionCode = input.versionCode;
  if (kind !== 'APK' && kind !== 'OTA') throw new Error('Release type must be APK or OTA.');
  if (!SEMVER_RE.test(versionName)) throw new Error('Version must use semantic versioning, for example 1.2.3.');
  if (!input.buffer?.length) throw new Error('The uploaded release file is empty.');
  const fileBytes = input.buffer;
  const computedSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');

  if (kind === 'APK') {
    if (!Number.isSafeInteger(versionCode) || Number(versionCode) < 1) {
      throw new Error('Android version code must be a positive integer.');
    }
    if (fileBytes[0] !== 0x50 || fileBytes[1] !== 0x4b) {
      throw new Error('The APK does not have a valid Android APK/ZIP signature.');
    }
    if (fileBytes.length > 100 * 1024 * 1024) throw new Error('APK exceeds the 100 MB upload limit.');
  } else {
    if (fileBytes[0] !== 0x50 || fileBytes[1] !== 0x4b || !fileBytes.includes(Buffer.from('index.html'))) {
      throw new Error('OTA upload must be a Capgo-compatible ZIP bundle containing index.html.');
    }
    const suppliedOtaChecksum = String(input.otaChecksum || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(suppliedOtaChecksum)) {
      throw new Error('Provide the 64-character checksum printed by the Capgo CLI when creating the OTA ZIP.');
    }
    if (suppliedOtaChecksum !== computedSha256) {
      throw new Error('The Capgo CLI checksum does not match the uploaded OTA ZIP. Recreate the bundle and use its matching SHA-256 checksum.');
    }
    if (fileBytes.length > 45 * 1024 * 1024) throw new Error('OTA bundle exceeds the 45 MB upload limit.');
  }

  const releaseId = releaseDocumentId(kind, kind === 'APK' ? Number(versionCode) : versionName);
  const existing = await getFirestoreDoc<AppUpdateRelease>(RELEASES_COLLECTION, releaseId, { failOnError: true });
  if (existing) throw new Error(`Release ${releaseId} already exists. Use a new version rather than replacing a release.`);

  const filename = kind === 'APK'
    ? `Exam-Checker-AI-${versionName}-${versionCode}.apk`
    : `exam-checker-ai-live-${versionName}.zip`;
  const fileId = kind === 'APK' ? `app_android_apk_v${versionCode}` : `app_ota_bundle_v${versionName.replace(/[^A-Za-z0-9.-]/g, '-')}`;
  const mimeType = kind === 'APK' ? 'application/vnd.android.package-archive' : 'application/zip';
  const cloud: CloudFileMetadata = await uploadFileToCloudStorage({
    fileId,
    filename,
    mimeType,
    buffer: fileBytes,
    ownerUserId: input.uploadedBy,
    category: kind === 'APK' ? 'APP_RELEASE_APK' : 'APP_RELEASE_OTA',
  });
  if (cloud.status !== 'ACTIVE') {
    throw new Error(`Release upload could not be verified in Cloud Storage: ${cloud.errorMessage || cloud.status}. No release was published.`);
  }

  const release: AppUpdateRelease = {
    id: releaseId,
    kind,
    status: 'DRAFT',
    versionName,
    ...(kind === 'APK' ? { versionCode: Number(versionCode) } : {}),
    mandatory: Boolean(input.mandatory),
    releaseNotes: String(input.releaseNotes || '').trim().slice(0, 4000),
    checksum: computedSha256,
    fileId: cloud.fileId,
    storagePath: cloud.storagePath,
    storageBucket: cloud.storageBucket,
    sizeBytes: cloud.size,
    uploadedAt: new Date().toISOString(),
    uploadedBy: String(input.uploadedBy || 'SUPER_ADMIN'),
    mimeType,
  };

  const saved = await setFirestoreDoc(RELEASES_COLLECTION, releaseId, release);
  if (!saved) {
    throw new Error('The file was uploaded, but its release record could not be saved to Firestore. Check storage consistency before retrying.');
  }
  const verified = await getFirestoreDoc<AppUpdateRelease>(RELEASES_COLLECTION, releaseId, { failOnError: true });
  if (!verified || verified.fileId !== fileId || verified.checksum !== release.checksum) {
    throw new Error('Release metadata read-back verification failed. The release remains unpublished.');
  }
  return verified;
}

export async function publishAppUpdateRelease(releaseId: string, actorId: string): Promise<AppUpdateRelease> {
  const release = await getFirestoreDoc<AppUpdateRelease>(RELEASES_COLLECTION, releaseId, { failOnError: true });
  if (!release || release.status !== 'DRAFT') throw new Error('Only a validated draft release can be published.');

  const kind = release.kind;
  const channelId = kind === 'APK' ? 'android_current' : 'ota_current';
  const previous = await getPublishedAppRelease(kind);

  if (kind === 'APK') {
    // Before the first Admin-managed release there may still be an older APK
    // installed on student devices. The legacy release used versionCode 1 by
    // default; enforce a configurable baseline so the first published update
    // cannot accidentally have the same/lower Android version code.
    const configuredBaseline = Number(process.env.LEGACY_ANDROID_VERSION_CODE || 1);
    const safeBaseline = Number.isSafeInteger(configuredBaseline) && configuredBaseline >= 1
      ? configuredBaseline
      : 1;
    const requiredBaseline = Math.max(
      safeBaseline,
      previous ? Number(previous.versionCode) || 0 : 0,
    );
    if (!Number.isSafeInteger(Number(release.versionCode)) || Number(release.versionCode) <= requiredBaseline) {
      throw new Error(`Android version code must be higher than the installed/published baseline (${requiredBaseline}).`);
    }
  }
  if (kind === 'OTA' && previous && compareSemver(release.versionName, previous.versionName) <= 0) {
    throw new Error('OTA bundle version must be newer than the currently published bundle. For a rollback, publish the previous contents under a higher version.');
  }

  const publishedAt = new Date().toISOString();
  const published: AppUpdateRelease = { ...release, status: 'PUBLISHED', publishedAt, publishedBy: actorId };
  if (!(await setFirestoreDoc(RELEASES_COLLECTION, releaseId, published))) {
    throw new Error('Could not save published release metadata.');
  }
  const channelSaved = await setFirestoreDoc(CHANNELS_COLLECTION, channelId, {
    id: channelId,
    kind,
    releaseId,
    versionName: release.versionName,
    versionCode: release.versionCode ?? null,
    updatedAt: publishedAt,
    updatedBy: actorId,
  });
  if (!channelSaved) {
    await setFirestoreDoc(RELEASES_COLLECTION, releaseId, { ...release, status: 'DRAFT' });
    throw new Error('Could not switch the live release channel. The new release has been returned to draft.');
  }
  const channelVerified = await getFirestoreDoc<Record<string, any>>(CHANNELS_COLLECTION, channelId, { failOnError: true });
  if (channelVerified?.releaseId !== releaseId) {
    throw new Error('Release channel verification failed. Please inspect the active release before retrying.');
  }

  if (previous && previous.id !== releaseId) {
    await setFirestoreDoc(RELEASES_COLLECTION, previous.id, { ...previous, status: 'ARCHIVED' });
  }
  return published;
}

export async function getDownloadableAppRelease(kind: AppReleaseKind, version?: string): Promise<AppUpdateRelease | null> {
  if (!version) return getPublishedAppRelease(kind);
  const releaseId = releaseDocumentId(kind, version);
  const release = await getFirestoreDoc<AppUpdateRelease>(RELEASES_COLLECTION, releaseId, { failOnError: true });
  if (!release || release.kind !== kind || !['PUBLISHED', 'ARCHIVED'].includes(release.status)) return null;
  return release;
}

export async function downloadAppUpdateRelease(release: AppUpdateRelease): Promise<Buffer> {
  const file = await downloadFileFromCloudStorage(release.fileId);
  if (!file?.buffer?.length) throw new Error('The published update file could not be downloaded from Cloud Storage.');
  const computed = crypto.createHash('sha256').update(file.buffer).digest('hex');
  if (computed.toLowerCase() !== String(release.checksum || '').toLowerCase()) {
    throw new Error(
      release.kind === 'APK'
        ? 'APK checksum verification failed. Download has been blocked.'
        : 'OTA bundle checksum verification failed. Download has been blocked.'
    );
  }
  if (release.kind === 'OTA' && file.buffer.length !== release.sizeBytes) {
    throw new Error('OTA bundle size verification failed. Download has been blocked.');
  }
  return file.buffer;
}

export function shouldServeOtaUpdate(
  appInfo: Record<string, unknown>,
  release: AppUpdateRelease | null,
): boolean {
  if (!release || release.kind !== 'OTA' || release.status !== 'PUBLISHED') return false;
  if (String(appInfo.platform || '').toLowerCase() !== 'android') return false;
  if (String(appInfo.app_id || '') !== ANDROID_PACKAGE_ID) return false;
  const current = String(appInfo.version_name || '').trim();
  if (!current || current === 'builtin') return true;
  if (!SEMVER_RE.test(current)) return true;
  return compareSemver(release.versionName, current) > 0;
}


/**
 * Permanently removes archived APK releases from both Cloud Storage and Firestore.
 * The live APK channel is checked independently and can never be removed here.
 * Metadata is retained whenever physical deletion fails, preventing orphaned-file
 * paths from being lost during a permissions or transient storage failure.
 */
export async function deletePreviousApkReleases(): Promise<{ deletedCount: number; freedBytes: number; skippedCount: number }> {
  const [currentApk, releases] = await Promise.all([
    getPublishedAppRelease('APK'),
    getAllFirestoreDocs<AppUpdateRelease>(RELEASES_COLLECTION, { failOnError: true }),
  ]);
  const candidates = releases.filter((release) =>
    release.kind === 'APK' &&
    release.status === 'ARCHIVED' &&
    release.id !== currentApk?.id
  );

  let deletedCount = 0;
  let freedBytes = 0;
  let skippedCount = 0;

  for (const release of candidates) {
    try {
      if (!release.storagePath || !release.storagePath.startsWith('app_releases/android/')) {
        throw new Error('Release storage path is missing or outside the Android release directory.');
      }

      // Delete the binary first. If this fails, leave all metadata intact.
      await deleteCloudStorageObject(release.storagePath, release.storageBucket);
      const metadataDeleted = await deleteFirestoreDoc('file_storage_metadata', release.fileId);
      if (!metadataDeleted) {
        throw new Error('Cloud file metadata could not be removed after the binary was deleted.');
      }
      const releaseDeleted = await deleteFirestoreDoc(RELEASES_COLLECTION, release.id);
      if (!releaseDeleted) {
        throw new Error('Release history metadata could not be removed.');
      }

      deletedCount += 1;
      freedBytes += Math.max(0, Number(release.sizeBytes) || 0);
    } catch (error) {
      skippedCount += 1;
      console.warn(`[AppUpdates] Could not fully delete archived APK release ${release.id}:`, error);
    }
  }

  return { deletedCount, freedBytes, skippedCount };
}
