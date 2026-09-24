import path from 'node:path';

export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
export const MIN_UPLOAD_SIZE_BYTES = 100; // 100 bytes

// Magic byte signatures
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // \x89PNG\r\n\x1a\n
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]); // \xFF\xD8\xFF

export type AllowedUploadMime = 'application/pdf' | 'image/jpeg' | 'image/png';

export interface FileValidationResult {
  valid: boolean;
  detectedMime?: AllowedUploadMime;
  sanitizedFilename: string;
  error?: string;
}

/**
 * Sanitizes a filename to prevent path traversal, null-byte injection, and dangerous characters.
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return 'document.pdf';
  }

  // Strip path separators and null bytes
  let clean = path.basename(filename).replace(/\0/g, '').trim();

  // Replace any characters not alphanumeric, dot, dash, underscore, space
  clean = clean.replace(/[^a-zA-Z0-9._\- ]/g, '_');

  // Prevent double extension attacks (e.g. evil.php.pdf, script.sh.png)
  const parts = clean.split('.');
  if (parts.length > 2) {
    const ext = parts.pop()!;
    const nameWithoutExt = parts.join('_').replace(/\./g, '_');
    clean = `${nameWithoutExt}.${ext}`;
  }

  // Ensure file is not empty or just an extension
  if (!clean || clean.startsWith('.')) {
    clean = `upload_${Date.now()}.${clean.replace(/^\./, '') || 'pdf'}`;
  }

  return clean;
}

/**
 * Validates a file buffer using magic byte inspection, size limits, and filename sanitization.
 */
export function validateUploadBuffer(
  buffer: Buffer,
  filename: string,
  _declaredMimeType?: string
): FileValidationResult {
  const sanitized = sanitizeFilename(filename);

  // 1. Size constraints
  if (!buffer || buffer.length < MIN_UPLOAD_SIZE_BYTES) {
    return {
      valid: false,
      sanitizedFilename: sanitized,
      error: 'The uploaded file is empty or corrupted (minimum 100 bytes required).',
    };
  }

  if (buffer.length > MAX_UPLOAD_SIZE_BYTES) {
    return {
      valid: false,
      sanitizedFilename: sanitized,
      error: `File size (${(buffer.length / (1024 * 1024)).toFixed(1)}MB) exceeds the maximum allowed upload limit of 50MB.`,
    };
  }

  // 2. Magic byte verification
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(PDF_MAGIC)) {
    return {
      valid: true,
      detectedMime: 'application/pdf',
      sanitizedFilename: sanitized.endsWith('.pdf') ? sanitized : `${sanitized}.pdf`,
    };
  }

  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    return {
      valid: true,
      detectedMime: 'image/png',
      sanitizedFilename: sanitized.endsWith('.png') ? sanitized : `${sanitized}.png`,
    };
  }

  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(JPEG_MAGIC)) {
    return {
      valid: true,
      detectedMime: 'image/jpeg',
      sanitizedFilename: sanitized.endsWith('.jpg') || sanitized.endsWith('.jpeg')
        ? sanitized
        : `${sanitized}.jpg`,
    };
  }

  return {
    valid: false,
    sanitizedFilename: sanitized,
    error: 'Invalid file format. Uploaded file must be a genuine PDF, JPEG, or PNG document (magic bytes mismatch).',
  };
}

/**
 * Validates base64 data and its magic bytes.
 */
export function validateBase64Upload(
  base64Data: string,
  filename: string,
  declaredMimeType?: string
): FileValidationResult {
  try {
    // Strip optional data URI prefix
    const cleanBase64 = base64Data.includes(',')
      ? base64Data.split(',')[1]
      : base64Data;

    const buffer = Buffer.from(cleanBase64, 'base64');
    return validateUploadBuffer(buffer, filename, declaredMimeType);
  } catch {
    return {
      valid: false,
      sanitizedFilename: sanitizeFilename(filename),
      error: 'Failed to decode base64 file data.',
    };
  }
}

/**
 * Safely resolves a path inside a specified root directory and prevents path traversal.
 */
export function resolveSafePath(baseDir: string, userFileIdOrName: string): string {
  const safeName = path.basename(userFileIdOrName).replace(/[^a-zA-Z0-9._\-]/g, '');
  const resolvedBase = path.resolve(baseDir);
  const targetPath = path.resolve(resolvedBase, safeName);

  if (!targetPath.startsWith(resolvedBase)) {
    throw new Error('Directory traversal attempt blocked.');
  }

  return targetPath;
}
