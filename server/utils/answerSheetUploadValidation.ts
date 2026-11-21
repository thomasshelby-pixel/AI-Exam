import { PDFDocument } from 'pdf-lib';
import {
  AllowedUploadMime,
  validateUploadBuffer,
} from './fileValidation.js';

export const MAX_ANSWER_SHEET_PDF_PAGES = 50;

export type AnswerSheetUploadValidationResult =
  | {
      valid: true;
      buffer: Buffer;
      normalizedBase64: string;
      detectedMime: AllowedUploadMime;
      pageCount: number | null;
    }
  | {
      valid: false;
      status: 400 | 413 | 415;
      code: string;
      error: string;
      pageCount?: number;
    };

/**
 * Validate answer-sheet bytes before any Gemini request, credit reservation,
 * local file write, or persistent-storage upload.
 *
 * The declared MIME type is intentionally not trusted: the actual file type
 * is derived from the file's magic bytes.
 */
export async function validateAnswerSheetUpload(
  fileBase64: unknown,
  filename: string,
  _declaredMimeType?: string
): Promise<AnswerSheetUploadValidationResult> {
  if (typeof fileBase64 !== 'string' || !fileBase64.trim()) {
    return {
      valid: false,
      status: 400,
      code: 'ANSWER_SHEET_FILE_REQUIRED',
      error: 'A valid PDF, JPEG, or PNG answer sheet is required.',
    };
  }

  const rawValue = fileBase64.trim();
  const dataUriMatch = rawValue.match(/^data:[^,]*;base64,([\s\S]+)$/i);
  const encoded = (dataUriMatch ? dataUriMatch[1] : rawValue).replace(/\s/g, '');

  if (
    !encoded ||
    encoded.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  ) {
    return {
      valid: false,
      status: 400,
      code: 'ANSWER_SHEET_BASE64_INVALID',
      error: 'The uploaded answer sheet is not valid base64 data. Please upload the file again.',
    };
  }

  const buffer = Buffer.from(encoded, 'base64');
  const fileValidation = validateUploadBuffer(buffer, filename, _declaredMimeType);

  if (!fileValidation.valid) {
    const error = fileValidation.error || 'The uploaded file could not be validated.';
    if (error.includes('exceeds the maximum allowed upload limit')) {
      return {
        valid: false,
        status: 413,
        code: 'ANSWER_SHEET_FILE_TOO_LARGE',
        error,
      };
    }

    if (error.includes('magic bytes mismatch')) {
      return {
        valid: false,
        status: 415,
        code: 'ANSWER_SHEET_UNSUPPORTED_MEDIA_TYPE',
        error: 'Unsupported file type. Upload a genuine PDF, JPEG, or PNG file.',
      };
    }

    return {
      valid: false,
      status: 400,
      code: 'ANSWER_SHEET_FILE_INVALID',
      error,
    };
  }

  const detectedMime = fileValidation.detectedMime as AllowedUploadMime;
  let pageCount: number | null = null;

  if (detectedMime === 'application/pdf') {
    try {
      const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
      pageCount = pdf.getPageCount();
    } catch {
      return {
        valid: false,
        status: 400,
        code: 'ANSWER_SHEET_PDF_INVALID',
        error: 'The uploaded file has a PDF signature but could not be opened as a valid PDF. Please export or scan it again.',
      };
    }

    if (pageCount <= 0) {
      return {
        valid: false,
        status: 400,
        code: 'ANSWER_SHEET_PDF_EMPTY',
        error: 'The uploaded PDF contains no pages.',
        pageCount,
      };
    }

    if (pageCount > MAX_ANSWER_SHEET_PDF_PAGES) {
      return {
        valid: false,
        status: 400,
        code: 'ANSWER_SHEET_PAGE_LIMIT_EXCEEDED',
        error: `Answer sheet exceeds the maximum limit of ${MAX_ANSWER_SHEET_PDF_PAGES} pages. Please compress or split your submission.`,
        pageCount,
      };
    }
  }

  return {
    valid: true,
    buffer,
    normalizedBase64: buffer.toString('base64'),
    detectedMime,
    pageCount,
  };
}
