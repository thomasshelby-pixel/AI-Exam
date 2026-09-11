import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  uploadFileToCloudStorage,
  downloadFileFromCloudStorage,
  deleteFileFromCloudStorage,
  deleteEvaluationCloudFiles,
  deleteMaterialCloudFiles,
  type CloudFileMetadata,
  type UploadOptions
} from './firebaseCloudStorageService.js';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const DATA_UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads');

// Ensure local temporary working directory exists if needed for stream conversion
try {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(DATA_UPLOADS_DIR)) fs.mkdirSync(DATA_UPLOADS_DIR, { recursive: true });
} catch (err) {
  console.warn('[PersistentStorage] Notice creating directory:', err);
}

export type StoredFileMetadata = CloudFileMetadata;

/**
 * Persistently stores a binary file (PDF, document, image) in Firebase Cloud Storage.
 * Saves ONLY structured metadata and references in Cloud Firestore.
 * STRICTLY NO chunked binary storage in Firestore.
 */
export async function savePersistentFile(
  fileId: string,
  filename: string,
  mimeType: string,
  buffer: Buffer,
  category: 'EVALUATION_ORIGINAL' | 'EVALUATION_CHECKED_COPY' | 'EVALUATION_REPORT' | 'MATERIAL_QUESTION_PAPER' | 'MATERIAL_MODEL_ANSWER' | 'MATERIAL_MARKING_SCHEME' | 'MATERIAL_PRIVATE_INSTITUTE' | 'GENERAL_DOCUMENT' = 'GENERAL_DOCUMENT',
  context?: {
    ownerUserId?: string;
    instituteId?: string | null;
    materialId?: string | null;
    evaluationId?: string | null;
  }
): Promise<CloudFileMetadata> {
  const uploadOptions: UploadOptions = {
    fileId,
    filename,
    mimeType,
    buffer,
    ownerUserId: context?.ownerUserId,
    instituteId: context?.instituteId,
    materialId: context?.materialId,
    evaluationId: context?.evaluationId || (fileId.startsWith('eval_') ? fileId.split('_')[0] + '_' + fileId.split('_')[1] : undefined),
    category,
  };

  // 1. Upload to Firebase Cloud Storage & record structured metadata in Firestore
  const metadata = await uploadFileToCloudStorage(uploadOptions);

  // 2. Also keep local copy in working directory for zero-latency active response handling
  try {
    const localPath1 = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(localPath1, buffer);
    const localPath2 = path.join(DATA_UPLOADS_DIR, filename);
    fs.writeFileSync(localPath2, buffer);
  } catch (err) {
    console.warn('[PersistentStorage] Warning writing local cache:', err);
  }

  return metadata;
}

/**
 * Retrieves a file. First checks local working directory.
 * If absent (e.g., after application restart or fresh deployment),
 * downloads from Firebase Cloud Storage and restores it.
 */
export async function getPersistentFile(
  fileId: string,
  preferredFilename?: string
): Promise<{ buffer: Buffer; metadata?: CloudFileMetadata } | null> {
  const filename = preferredFilename || `${fileId}.pdf`;

  // 1. Check local working directories first
  const candidatePaths = [
    path.join(UPLOADS_DIR, filename),
    path.join(DATA_UPLOADS_DIR, filename),
    path.join(UPLOADS_DIR, `${fileId}_original.pdf`),
    path.join(UPLOADS_DIR, `${fileId}_checked_copy.pdf`),
    path.join(UPLOADS_DIR, `${fileId}_report.pdf`),
    path.join(DATA_UPLOADS_DIR, `${fileId}_original.pdf`),
    path.join(DATA_UPLOADS_DIR, `${fileId}_checked_copy.pdf`),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const buf = fs.readFileSync(p);
        if (buf && buf.length > 0) {
          return { buffer: buf };
        }
      } catch {
        // continue to Cloud Storage
      }
    }
  }

  // 2. Download from Firebase Cloud Storage
  try {
    const downloaded = await downloadFileFromCloudStorage(fileId);
    if (downloaded && downloaded.buffer.length > 0) {
      // Repopulate local working directory
      try {
        const targetPath = path.join(UPLOADS_DIR, downloaded.metadata?.originalFilename || filename);
        fs.writeFileSync(targetPath, downloaded.buffer);
      } catch {
        // ignore
      }
      return downloaded;
    }
  } catch (err) {
    console.warn(`[PersistentStorage] Error fetching ${fileId} from Cloud Storage:`, err);
  }

  return null;
}

/**
 * Permanently deletes a file from Firebase Cloud Storage,
 * deletes its Firestore metadata record, and removes any local file traces.
 */
export async function deletePersistentFile(fileId: string): Promise<boolean> {
  let deletedFromDisk = false;

  // 1. Remove from local directories
  const dirs = [UPLOADS_DIR, DATA_UPLOADS_DIR];
  for (const dir of dirs) {
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.startsWith(fileId)) {
            try {
              fs.unlinkSync(path.join(dir, file));
              deletedFromDisk = true;
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. Remove from Firebase Cloud Storage & Firestore metadata
  try {
    await deleteFileFromCloudStorage(fileId);
  } catch (err) {
    console.warn(`[PersistentStorage] Error deleting from Cloud Storage for ${fileId}:`, err);
  }

  return deletedFromDisk;
}

export {
  deleteEvaluationCloudFiles,
  deleteMaterialCloudFiles
};
