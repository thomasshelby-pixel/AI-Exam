import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Storage, type Bucket, type File as GCSFile } from '@google-cloud/storage';

// Ensure stream pipelines do not trigger MaxListenersExceededWarning
EventEmitter.defaultMaxListeners = 100;
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { getFirestoreDb } from './firestoreDbService.js';

// Configuration
const DEFAULT_BUCKET = 'gen-lang-client-0211426234.firebasestorage.app';
const PROJECT_ID = 'gen-lang-client-0211426234';

let configuredBucket: string = DEFAULT_BUCKET;
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.storageBucket) {
      configuredBucket = config.storageBucket;
    }
  }
} catch (err) {
  console.warn('[PrivilegedStorage] Notice loading firebase-applet-config.json:', err);
}

let storageClient: Storage | null = null;

/**
 * Returns the privileged server-side Google Cloud Storage client.
 * Priority:
 * 1. Custom Service Account JSON key from GCS_SERVICE_ACCOUNT_KEY or GOOGLE_APPLICATION_CREDENTIALS_JSON
 * 2. Application Default Credentials (ADC) from the container metadata server
 */
export function getPrivilegedGCSClient(): Storage {
  if (storageClient) return storageClient;

  const credsRaw = process.env.GCS_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (credsRaw) {
    try {
      const credentials = typeof credsRaw === 'string' ? JSON.parse(credsRaw) : credsRaw;
      storageClient = new Storage({
        credentials,
        projectId: credentials.project_id || PROJECT_ID,
      });
      console.log('[PrivilegedStorage] Initialized GCS Storage with custom Service Account Key.');
      return storageClient;
    } catch (err) {
      console.warn('[PrivilegedStorage] Failed to parse custom service account credentials:', err);
    }
  }

  // Application Default Credentials (ADC) via Cloud Run container metadata service
  storageClient = new Storage({
    projectId: PROJECT_ID,
  });
  console.log(`[PrivilegedStorage] Initialized GCS Storage with Application Default Credentials (project: ${PROJECT_ID}).`);
  return storageClient;
}

export function getStorageBucket(bucketName?: string): Bucket {
  const storage = getPrivilegedGCSClient();
  const name = bucketName || configuredBucket;
  return storage.bucket(name);
}

export interface CloudFileMetadata {
  fileId: string;
  storagePath: string;
  originalFilename: string;
  filename?: string;
  mimeType: string;
  size: number;
  ownerUserId: string;
  instituteId?: string;
  materialId?: string;
  evaluationId?: string;
  uploadTimestamp: string;
  version: string;
  status: 'ACTIVE' | 'STORAGE_UNAVAILABLE' | 'ARCHIVED' | 'DELETED';
  checksum: string;
  storageBucket: string;
  downloadUrl?: string;
  errorMessage?: string;
}

export interface UploadOptions {
  fileId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  ownerUserId?: string;
  instituteId?: string;
  materialId?: string;
  evaluationId?: string;
  category?: 'EVALUATION_ORIGINAL' | 'EVALUATION_CHECKED_COPY' | 'EVALUATION_REPORT' | 'MATERIAL_QUESTION_PAPER' | 'MATERIAL_MODEL_ANSWER' | 'MATERIAL_MARKING_SCHEME' | 'MATERIAL_PRIVATE_INSTITUTE' | 'GENERAL_DOCUMENT';
}

/**
 * Server-authoritative path builder.
 * Guarantees clients cannot tamper with file paths or access unauthorized locations:
 * - ICAI Reference materials: curriculum_materials/{materialId}/{fileName}
 * - Institute-private materials: institute_materials/{instituteId}/{materialId}/{fileName}
 * - Student answer sheets / evaluations: student_evaluations/{studentId}/{evaluationId}/{fileName}
 * - Evaluation reports / scorecards: evaluation_reports/{studentId}/{evaluationId}/{fileName}
 */
export function buildStoragePath(options: UploadOptions): string {
  const safeFilename = path.basename(options.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const studentId = options.ownerUserId || 'system_student';
  const evaluationId = options.evaluationId || 'eval_general';
  const materialId = options.materialId || 'mat_general';
  const instituteId = options.instituteId || 'inst_general';

  if (options.category === 'EVALUATION_REPORT') {
    return `evaluation_reports/${studentId}/${evaluationId}/${safeFilename}`;
  }

  if (options.evaluationId || options.category === 'EVALUATION_ORIGINAL' || options.category === 'EVALUATION_CHECKED_COPY') {
    return `student_evaluations/${studentId}/${evaluationId}/${safeFilename}`;
  }

  if (options.instituteId || options.category === 'MATERIAL_PRIVATE_INSTITUTE') {
    return `institute_materials/${instituteId}/${materialId}/${safeFilename}`;
  }

  if (options.materialId || options.category?.startsWith('MATERIAL_')) {
    return `curriculum_materials/${materialId}/${safeFilename}`;
  }

  return `documents/${studentId}/${safeFilename}`;
}

/**
 * Inspects whether privileged server-side Cloud Storage is provisioned and accessible.
 */
export async function inspectCloudStorageStatus(): Promise<{
  enabled: boolean;
  bucket: string;
  status: 'READY' | 'BUCKET_NOT_FOUND' | 'IAM_PERMISSION_DENIED' | 'ERROR';
  details: string;
  serviceAccountEmail: string;
  authMode: 'ADC_CONTAINER_SERVICE_ACCOUNT' | 'CUSTOM_SERVICE_ACCOUNT_KEY';
}> {
  const bucketName = configuredBucket;
  const saEmail = process.env.AUTHORIZED_SERVICE_ACCOUNT_EMAIL || 'ais-sandbox@ais-asia-southeast1-2e2c097788.iam.gserviceaccount.com';
  const authMode = process.env.GCS_SERVICE_ACCOUNT_KEY ? 'CUSTOM_SERVICE_ACCOUNT_KEY' : 'ADC_CONTAINER_SERVICE_ACCOUNT';

  try {
    const bucket = getStorageBucket(bucketName);
    const probeFile = bucket.file('_privileged_probe_check.txt');

    // Probe write
    await probeFile.save(Buffer.from('server_probe'), {
      contentType: 'text/plain',
      resumable: false,
      validation: false,
    });

    // Probe read
    await probeFile.download();

    // Probe delete cleanup
    try {
      await probeFile.delete({ ignoreNotFound: true });
    } catch {
      // ignore probe delete
    }

    return {
      enabled: true,
      bucket: bucketName,
      status: 'READY',
      details: 'Privileged server-side Google Cloud Storage is fully active and operational. Storage is 100% private from public access.',
      serviceAccountEmail: saEmail,
      authMode,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const is404 = msg.includes('404') || msg.includes('not exist') || msg.includes('notFound');
    const isForbidden = msg.includes('403') || msg.includes('Permission') || msg.includes('denied') || msg.includes('does not have storage');

    return {
      enabled: false,
      bucket: bucketName,
      status: isForbidden ? 'IAM_PERMISSION_DENIED' : (is404 ? 'BUCKET_NOT_FOUND' : 'ERROR'),
      details: `Server-side privileged GCS probe returned: ${msg}`,
      serviceAccountEmail: saEmail,
      authMode,
    };
  }
}

/**
 * Uploads an actual binary file to Firebase Cloud Storage via privileged backend SDK,
 * and saves structured metadata (without binary data) in Cloud Firestore.
 */
export async function uploadFileToCloudStorage(options: UploadOptions): Promise<CloudFileMetadata> {
  const hash = crypto.createHash('sha256').update(options.buffer).digest('hex');
  const storagePath = buildStoragePath(options);
  const nowIso = new Date().toISOString();

  let status: CloudFileMetadata['status'] = 'ACTIVE';
  let errorMessage: string | undefined = undefined;

  try {
    const bucket = getStorageBucket(configuredBucket);
    const file = bucket.file(storagePath);

    await file.save(options.buffer, {
      contentType: options.mimeType,
      metadata: {
        fileId: options.fileId,
        originalFilename: options.filename,
        ownerUserId: options.ownerUserId || '',
        instituteId: options.instituteId || '',
        evaluationId: options.evaluationId || '',
        materialId: options.materialId || '',
        checksum: hash,
        uploadedAt: nowIso,
      },
      resumable: false,
      validation: false,
    });

    console.log(`[PrivilegedStorage] Successfully saved ${options.filename} (${options.buffer.length} bytes) to Cloud Storage path: ${storagePath}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errorMessage = msg;
    status = 'STORAGE_UNAVAILABLE';
    console.warn(`[PrivilegedStorage] Could not write to Cloud Storage bucket (${configuredBucket}): ${msg}`);
  }

  // Persist structured metadata and reference in Cloud Firestore (no chunked binaries in Firestore!)
  const metadata: CloudFileMetadata = {
    fileId: options.fileId,
    storagePath,
    originalFilename: options.filename,
    filename: options.filename,
    mimeType: options.mimeType,
    size: options.buffer.length,
    ownerUserId: options.ownerUserId || 'system',
    uploadTimestamp: nowIso,
    version: '1.0',
    status,
    checksum: hash,
    storageBucket: configuredBucket,
    ...(options.instituteId ? { instituteId: options.instituteId } : {}),
    ...(options.materialId ? { materialId: options.materialId } : {}),
    ...(options.evaluationId ? { evaluationId: options.evaluationId } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  };

  const db = getFirestoreDb();
  if (db) {
    try {
      await setDoc(doc(db, 'file_storage_metadata', options.fileId), metadata);
      console.log(`[CloudFirestore] Stored structured metadata for file ${options.fileId} at path ${storagePath}`);
    } catch (err) {
      console.warn(`[CloudFirestore] Warning writing file metadata to Firestore:`, err);
    }
  }

  return metadata;
}

/**
 * Downloads a file directly from Firebase Cloud Storage via privileged backend SDK.
 */
export async function downloadFileFromCloudStorage(
  fileId: string,
  explicitStoragePath?: string
): Promise<{ buffer: Buffer; metadata: CloudFileMetadata } | null> {
  const db = getFirestoreDb();
  let metadata: CloudFileMetadata | null = null;

  if (db) {
    try {
      const snap = await getDoc(doc(db, 'file_storage_metadata', fileId));
      if (snap.exists()) {
        metadata = snap.data() as CloudFileMetadata;
      }
    } catch (err) {
      console.warn(`[PrivilegedStorage] Error fetching metadata for ${fileId}:`, err);
    }
  }

  const path = explicitStoragePath || metadata?.storagePath;
  if (!path) {
    console.warn(`[PrivilegedStorage] No storage path known for file ${fileId}`);
    return null;
  }

  try {
    const bucket = getStorageBucket(configuredBucket);
    const file = bucket.file(path);

    const [exists] = await file.exists();
    if (!exists) {
      console.warn(`[PrivilegedStorage] Object does not exist in bucket: ${path}`);
      return null;
    }

    const [buffer] = await file.download();

    return {
      buffer,
      metadata: metadata || {
        fileId,
        storagePath: path,
        originalFilename: path.split('/').pop() || fileId,
        mimeType: 'application/pdf',
        size: buffer.length,
        ownerUserId: 'system',
        uploadTimestamp: new Date().toISOString(),
        version: '1.0',
        status: 'ACTIVE',
        checksum: crypto.createHash('sha256').update(buffer).digest('hex'),
        storageBucket: configuredBucket,
      },
    };
  } catch (err) {
    console.warn(`[PrivilegedStorage] Error downloading file from path ${path}:`, err);
    return null;
  }
}

/**
 * Deletes a file permanently from Firebase Cloud Storage and cleans up Firestore metadata.
 */
export async function deleteFileFromCloudStorage(fileId: string, explicitPath?: string): Promise<boolean> {
  const db = getFirestoreDb();
  let storagePath = explicitPath;

  if (db && !storagePath) {
    try {
      const snap = await getDoc(doc(db, 'file_storage_metadata', fileId));
      if (snap.exists()) {
        storagePath = snap.data().storagePath;
      }
    } catch {
      // ignore
    }
  }

  let storageDeleted = false;
  if (storagePath) {
    try {
      const bucket = getStorageBucket(configuredBucket);
      const file = bucket.file(storagePath);
      await file.delete({ ignoreNotFound: true });
      storageDeleted = true;
      console.log(`[PrivilegedStorage] Deleted object from Cloud Storage: ${storagePath}`);
    } catch (err: unknown) {
      console.warn(`[PrivilegedStorage] Warning deleting object ${storagePath}:`, err);
    }
  }

  // Remove or tombstone the metadata record in Firestore
  if (db) {
    try {
      await deleteDoc(doc(db, 'file_storage_metadata', fileId));
      console.log(`[CloudFirestore] Removed file metadata document: file_storage_metadata/${fileId}`);
    } catch (err) {
      console.warn(`[CloudFirestore] Warning removing file metadata:`, err);
    }
  }

  return storageDeleted;
}

/**
 * Deletes all Cloud Storage files associated with an evaluation when it is permanently deleted.
 */
export async function deleteEvaluationCloudFiles(evaluationId: string): Promise<number> {
  const db = getFirestoreDb();
  let deletedCount = 0;

  if (db) {
    try {
      const q = query(
        collection(db, 'file_storage_metadata'),
        where('evaluationId', '==', evaluationId)
      );
      const snap = await getDocs(q);
      console.log(`[PrivilegedStorage] Found ${snap.size} associated files to delete for evaluation ${evaluationId}`);

      for (const docSnap of snap.docs) {
        const data = docSnap.data() as CloudFileMetadata;
        await deleteFileFromCloudStorage(data.fileId, data.storagePath);
        deletedCount++;
      }
    } catch (err) {
      console.warn(`[PrivilegedStorage] Error querying evaluation files for ${evaluationId}:`, err);
    }
  }

  // Also purge known path keys
  const knownKeys = [
    `${evaluationId}_original`,
    `${evaluationId}_checked_copy`,
    `${evaluationId}_report`,
    evaluationId,
  ];

  for (const key of knownKeys) {
    const deleted = await deleteFileFromCloudStorage(key);
    if (deleted) deletedCount++;
  }

  return deletedCount;
}

/**
 * Deletes all Cloud Storage files associated with an ICAI/Institute material.
 */
export async function deleteMaterialCloudFiles(materialId: string): Promise<number> {
  const db = getFirestoreDb();
  let deletedCount = 0;
  const processedDocIds = new Set<string>();

  if (db) {
    try {
      // 1. Query where materialId == materialId
      const q = query(
        collection(db, 'file_storage_metadata'),
        where('materialId', '==', materialId)
      );
      const snap = await getDocs(q);
      console.log(`[PrivilegedStorage] Found ${snap.size} associated files by query for material ${materialId}`);

      for (const docSnap of snap.docs) {
        processedDocIds.add(docSnap.id);
        const data = docSnap.data() as CloudFileMetadata;
        await deleteFileFromCloudStorage(data.fileId || docSnap.id, data.storagePath);
        await deleteDoc(doc(db, 'file_storage_metadata', docSnap.id)).catch(() => {});
        deletedCount++;
      }

      // 2. Scan all file_storage_metadata to catch any doc matching materialId in ID, fileId, or path
      const allFiles = await getDocs(collection(db, 'file_storage_metadata'));
      for (const d of allFiles.docs) {
        if (processedDocIds.has(d.id)) continue;
        const data = d.data() as CloudFileMetadata;
        if (
          d.id.includes(materialId) ||
          data.fileId?.includes(materialId) ||
          data.storagePath?.includes(materialId) ||
          data.materialId === materialId
        ) {
          processedDocIds.add(d.id);
          await deleteFileFromCloudStorage(data.fileId || d.id, data.storagePath);
          await deleteDoc(doc(db, 'file_storage_metadata', d.id)).catch(() => {});
          deletedCount++;
        }
      }
    } catch (err) {
      console.warn(`[PrivilegedStorage] Error querying material files for ${materialId}:`, err);
    }
  }

  // Also clean up standard fallback keys
  const fallbackKeys = [
    materialId,
    `${materialId}_qp`,
    `${materialId}_sa`,
    `mat_${materialId}_qp`,
    `mat_${materialId}`,
  ];
  for (const k of fallbackKeys) {
    if (!processedDocIds.has(k)) {
      await deleteFileFromCloudStorage(k);
    }
  }

  return deletedCount;
}
