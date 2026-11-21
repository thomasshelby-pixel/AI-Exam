import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  MAX_ANSWER_SHEET_PDF_PAGES,
  validateAnswerSheetUpload,
} from '../utils/answerSheetUploadValidation.js';

async function createPdfBase64(pageCount: number): Promise<string> {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    pdf.addPage();
  }
  const bytes = await pdf.save();
  return Buffer.from(bytes).toString('base64');
}

async function run(): Promise<void> {
  const allowedPdf = await validateAnswerSheetUpload(
    await createPdfBase64(MAX_ANSWER_SHEET_PDF_PAGES),
    'answer-sheet.pdf',
    'application/pdf'
  );
  assert.equal(allowedPdf.valid, true, 'A PDF at the 50-page limit must be accepted');
  if (allowedPdf.valid) {
    assert.equal(allowedPdf.detectedMime, 'application/pdf');
    assert.equal(allowedPdf.pageCount, 50);
  }

  const oversizedPdf = await validateAnswerSheetUpload(
    await createPdfBase64(MAX_ANSWER_SHEET_PDF_PAGES + 1),
    'answer-sheet.pdf',
    'application/pdf'
  );
  assert.equal(oversizedPdf.valid, false);
  if (!oversizedPdf.valid) {
    assert.equal(oversizedPdf.status, 400);
    assert.equal(oversizedPdf.code, 'ANSWER_SHEET_PAGE_LIMIT_EXCEEDED');
    assert.equal(oversizedPdf.pageCount, 51);
  }

  const malformedPdf = Buffer.concat([
    Buffer.from('%PDF'),
    Buffer.alloc(160, 0x20),
  ]).toString('base64');
  const malformedPdfResult = await validateAnswerSheetUpload(
    malformedPdf,
    'broken.pdf',
    'application/pdf'
  );
  assert.equal(malformedPdfResult.valid, false);
  if (!malformedPdfResult.valid) {
    assert.equal(malformedPdfResult.status, 400);
    assert.equal(malformedPdfResult.code, 'ANSWER_SHEET_PDF_INVALID');
  }

  const unsupported = Buffer.alloc(160, 0x41).toString('base64');
  const unsupportedResult = await validateAnswerSheetUpload(
    unsupported,
    'disguised.pdf',
    'application/pdf'
  );
  assert.equal(unsupportedResult.valid, false);
  if (!unsupportedResult.valid) {
    assert.equal(unsupportedResult.status, 415);
    assert.equal(unsupportedResult.code, 'ANSWER_SHEET_UNSUPPORTED_MEDIA_TYPE');
  }

  const validJpegHeader = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.alloc(160, 0x11),
  ]).toString('base64');
  const jpegResult = await validateAnswerSheetUpload(
    validJpegHeader,
    'answer.jpg',
    'image/jpeg'
  );
  assert.equal(jpegResult.valid, true, 'Genuine JPEG magic bytes should remain supported');
  if (jpegResult.valid) {
    assert.equal(jpegResult.detectedMime, 'image/jpeg');
    assert.equal(jpegResult.pageCount, null);
  }

  const validPngHeader = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(160, 0x11),
  ]).toString('base64');
  const pngResult = await validateAnswerSheetUpload(
    validPngHeader,
    'answer.png',
    'image/png'
  );
  assert.equal(pngResult.valid, true, 'Genuine PNG magic bytes should remain supported');
  if (pngResult.valid) {
    assert.equal(pngResult.detectedMime, 'image/png');
    assert.equal(pngResult.pageCount, null);
  }

  const dataUriResult = await validateAnswerSheetUpload(
    `data:application/pdf;base64,${await createPdfBase64(1)}`,
    'answer.pdf',
    'application/pdf'
  );
  assert.equal(dataUriResult.valid, true, 'Base64 PDF data URIs must remain supported');
  if (dataUriResult.valid) {
    assert.equal(dataUriResult.pageCount, 1);
  }

  console.log('Answer-sheet upload security validation regression passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
