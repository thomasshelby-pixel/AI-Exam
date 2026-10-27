import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from '../db.js';
import {
  uploadFileToCloudStorage,
  downloadFileFromCloudStorage,
  deleteFileFromCloudStorage,
  deleteEvaluationCloudFiles,
  deleteMaterialCloudFiles as deleteMaterialCloudFilesFromFirebase,
  deleteStudentCloudFiles,
  type CloudFileMetadata,
  type UploadOptions
} from './firebaseCloudStorageService.js';
import { sanitizeFilename } from '../utils/fileValidation.js';

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
  const safeFilename = sanitizeFilename(filename);
  const safeFileId = path.basename(fileId).replace(/[^a-zA-Z0-9._\-]/g, '');

  // Keep one local working copy for PDF processing. The durable file is the
  // canonical Cloud Storage object; do not mirror every file into two local
  // directories plus SQLite when cloud persistence succeeds.
  const isEvaluationFile = category === 'EVALUATION_ORIGINAL' ||
    category === 'EVALUATION_CHECKED_COPY' ||
    category === 'EVALUATION_REPORT';
  const localFilename = isEvaluationFile ? `${safeFileId}.pdf` : safeFilename;
  try {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOADS_DIR, localFilename), buffer);
  } catch (err) {
    console.warn('[PersistentStorage] Warning writing local working cache:', err);
  }

  const uploadOptions: UploadOptions = {
    fileId: safeFileId,
    filename: safeFilename,
    mimeType,
    buffer,
    ownerUserId: context?.ownerUserId,
    instituteId: context?.instituteId || undefined,
    materialId: context?.materialId || undefined,
    evaluationId: context?.evaluationId || (safeFileId.startsWith('eval_') ? safeFileId.split('_')[0] + '_' + safeFileId.split('_')[1] : undefined),
    category,
  };

  // Cloud Storage is the single durable file store. Keep a SQLite BLOB only
  // when the cloud object cannot be durably used, as a fallback for recovery.
  const metadata = await uploadFileToCloudStorage(uploadOptions);
  if (metadata.status === 'ACTIVE') {
    try {
      db.prepare('DELETE FROM persistent_file_blobs WHERE file_id = ?').run(safeFileId);
    } catch (dbErr) {
      console.warn('[PersistentStorage] Could not remove obsolete SQLite file duplicate:', dbErr);
    }
  } else {
    try {
      db.prepare(`
        INSERT INTO persistent_file_blobs (
          file_id, filename, mime_type, file_size, category, owner_user_id, evaluation_id, data, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(file_id) DO UPDATE SET
          filename = excluded.filename,
          mime_type = excluded.mime_type,
          file_size = excluded.file_size,
          category = excluded.category,
          owner_user_id = excluded.owner_user_id,
          evaluation_id = excluded.evaluation_id,
          data = excluded.data,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        safeFileId,
        safeFilename,
        mimeType,
        buffer.length,
        category,
        context?.ownerUserId || null,
        context?.evaluationId || (safeFileId.startsWith('eval_') ? safeFileId.split('_')[0] + '_' + safeFileId.split('_')[1] : null),
        buffer
      );
    } catch (dbErr) {
      console.warn('[PersistentStorage] Could not preserve SQLite fallback blob because cloud storage is unavailable:', dbErr);
    }
  }
  return metadata;
}

/**
 * Retrieves a file. Checks:
 * 1. Local working directory / cache
 * 2. SQLite persistent_file_blobs database table
 * 3. Firebase Cloud Storage (re-hydrating local disk & SQLite on retrieval)
 */
export async function getPersistentFile(
  fileId: string,
  preferredFilename?: string
): Promise<{ buffer: Buffer; metadata?: CloudFileMetadata } | null> {
  const safeFileId = path.basename(fileId).replace(/[^a-zA-Z0-9._\-]/g, '');
  const safeFilename = preferredFilename ? sanitizeFilename(preferredFilename) : `${safeFileId}.pdf`;

  // 1. Check the single current working cache, then legacy duplicate paths
  // left by older releases so historical documents remain accessible.
  const candidatePaths = [
    path.join(UPLOADS_DIR, safeFilename),
    path.join(UPLOADS_DIR, `${safeFileId}.pdf`),
    path.join(UPLOADS_DIR, `${safeFileId}_original.pdf`),
    path.join(UPLOADS_DIR, `${safeFileId}_checked_copy.pdf`),
    path.join(UPLOADS_DIR, `${safeFileId}_report.pdf`),
    path.join(DATA_UPLOADS_DIR, safeFilename),
    path.join(DATA_UPLOADS_DIR, `${safeFileId}.pdf`),
    path.join(DATA_UPLOADS_DIR, `${safeFileId}_original.pdf`),
    path.join(DATA_UPLOADS_DIR, `${safeFileId}_checked_copy.pdf`),
    path.join(DATA_UPLOADS_DIR, `${safeFileId}_report.pdf`),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const buf = fs.readFileSync(p);
        if (buf && buf.length > 0) {
          return { buffer: buf };
        }
      } catch {
        // continue
      }
    }
  }

  // 2. Check SQLite persistent_file_blobs database table
  try {
    const blobRow = db.prepare(`
      SELECT data, filename, mime_type, category
      FROM persistent_file_blobs
      WHERE file_id = ? OR file_id = ? OR file_id = ? OR file_id = ?
      LIMIT 1
    `).get(safeFileId, fileId, `${safeFileId}_original`, `${safeFileId}_checked_copy`) as any;

    if (blobRow && blobRow.data) {
      const buf = Buffer.isBuffer(blobRow.data) ? blobRow.data : Buffer.from(blobRow.data);
      if (buf.length > 0) {
        // Restore local working disk caches
        try {
          const targetFilename = blobRow.filename || safeFilename;
          fs.writeFileSync(path.join(UPLOADS_DIR, targetFilename), buf);
          fs.writeFileSync(path.join(DATA_UPLOADS_DIR, targetFilename), buf);
        } catch {}
        return { buffer: buf };
      }
    }
  } catch (dbErr) {
    console.warn(`[PersistentStorage] Notice reading SQLite blob for ${fileId}:`, dbErr);
  }

  // 3. Download from Firebase Cloud Storage
  try {
    const downloaded = await downloadFileFromCloudStorage(fileId);
    if (downloaded && downloaded.buffer.length > 0) {
      // Recreate only a single local working cache. The durable file remains
      // canonical in Cloud Storage, so downloading it must not create SQLite blobs
      // or a second local copy.
      try {
        const metadataFilename = downloaded.metadata?.originalFilename
          ? sanitizeFilename(downloaded.metadata.originalFilename)
          : safeFilename;
        const isEvaluationFile = /_(?:original|checked_copy|report)$/.test(safeFileId);
        const targetFilename = isEvaluationFile ? `${safeFileId}.pdf` : metadataFilename;
        fs.writeFileSync(path.join(UPLOADS_DIR, targetFilename), downloaded.buffer);
        try {
          db.prepare('DELETE FROM persistent_file_blobs WHERE file_id = ? OR file_id = ?').run(safeFileId, fileId);
        } catch {
          // Legacy fallback removal is best-effort after verified cloud download.
        }
      } catch {
        // The downloaded response remains valid even if cache hydration fails.
      }
      return downloaded;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.info(`[PersistentStorage] Notice fetching ${fileId} from Cloud Storage: ${msg}`);
  }

  return null;
}

/**
 * Permanently deletes a file from SQLite, Firebase Cloud Storage,
 * deletes its Firestore metadata record, and removes any local file traces.
 */
export async function deletePersistentFile(fileId: string, explicitPath?: string): Promise<boolean> {
  let deletedFromDisk = false;
  const safeFileId = path.basename(fileId).replace(/[^a-zA-Z0-9._\-]/g, '');

  // 1. Remove from SQLite persistent_file_blobs
  try {
    db.prepare('DELETE FROM persistent_file_blobs WHERE file_id = ? OR file_id = ?').run(safeFileId, fileId);
  } catch (dbErr) {
    console.warn(`[PersistentStorage] Error deleting blob ${fileId} from SQLite:`, dbErr);
  }

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
    await deleteFileFromCloudStorage(fileId, explicitPath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.info(`[PersistentStorage] Notice deleting from Cloud Storage for ${fileId}: ${msg}`);
  }

  return deletedFromDisk;
}

/**
 * Deletes all Cloud Storage files, Firestore metadata, and local disk files associated with a material.
 */
export async function deleteMaterialCloudFiles(materialId: string): Promise<number> {
  const dirs = [UPLOADS_DIR, DATA_UPLOADS_DIR];
  for (const dir of dirs) {
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.includes(materialId)) {
            try {
              fs.unlinkSync(path.join(dir, file));
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

  return await deleteMaterialCloudFilesFromFirebase(materialId);
}

export {
  deleteEvaluationCloudFiles,
  deleteStudentCloudFiles
};
