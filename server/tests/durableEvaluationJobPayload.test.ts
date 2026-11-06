import assert from 'node:assert/strict';
import {
  restoreDurableEvaluationJobPayload,
  serializeDurableEvaluationJobPayload,
} from '../services/durableEvaluationJobPayload.js';

const pdfBuffer = Buffer.from('%PDF-1.7\noriginal-pdf-content', 'utf8');
const imageBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

const imageJob = {
  evaluationId: 'eval_durable_image_001',
  studentId: 'student_001',
  fileBase64: imageBuffer.toString('base64'),
  mimeType: 'image/png',
  filename: 'answer-sheet.png',
  pdfBuf: pdfBuffer,
  originalFileStorageConfirmed: true,
  referenceQuestionPaperText: 'Question Paper snapshot stays in the durable payload.',
  referenceSuggestedAnswersText: 'Suggested Answer snapshot stays in the durable payload.',
  markingSchemeText: 'Marking Scheme snapshot stays in the durable payload.',
  creditAlreadyConsumed: true,
  entitlementSource: 'PERSONAL_FREE',
};

const storedPayload = serializeDurableEvaluationJobPayload(imageJob);
assert.equal(storedPayload.evaluationId, imageJob.evaluationId);
assert.equal(storedPayload.mimeType, 'image/png');
assert.equal(storedPayload.creditAlreadyConsumed, true);
assert.equal(storedPayload.referenceQuestionPaperText, imageJob.referenceQuestionPaperText);
assert.equal('fileBase64' in storedPayload, false, 'Large base64 source files must not be copied into Firestore job documents');
assert.equal('pdfBuf' in storedPayload, false, 'PDF binary data must not be copied into Firestore job documents');
assert.equal('originalFileStorageConfirmed' in storedPayload, false, 'Runtime-only storage confirmation must not be persisted as job payload');

const restoredImage = restoreDurableEvaluationJobPayload(storedPayload, pdfBuffer, imageBuffer);
assert.equal(restoredImage.mimeType, 'image/png', 'Restart recovery preserves the exact original image MIME type');
assert.equal(restoredImage.fileBase64, imageBuffer.toString('base64'), 'Restart recovery restores the exact original uploaded image');
assert.deepEqual(restoredImage.pdfBuf, pdfBuffer, 'Checked-copy generation receives the stored normalized PDF');

const pdfPayload = serializeDurableEvaluationJobPayload({
  ...imageJob,
  mimeType: 'application/pdf',
  fileBase64: pdfBuffer.toString('base64'),
  pdfBuf: pdfBuffer,
});
const restoredPdf = restoreDurableEvaluationJobPayload(pdfPayload, pdfBuffer);
assert.equal(restoredPdf.mimeType, 'application/pdf');
assert.equal(restoredPdf.fileBase64, pdfBuffer.toString('base64'));

assert.throws(
  () => serializeDurableEvaluationJobPayload({ referenceQuestionPaperText: 'x'.repeat(2000) }, 1000),
  /EVALUATION_QUEUE_PAYLOAD_TOO_LARGE/,
  'Oversized queue metadata must fail explicitly instead of creating a broken Firestore document',
);

assert.throws(
  () => restoreDurableEvaluationJobPayload(storedPayload, Buffer.alloc(0)),
  /EVALUATION_ORIGINAL_FILE_MISSING/,
  'A job with a missing durable PDF must fail closed',
);

console.log('Durable evaluation job payload tests passed.');
