export interface DurableEvaluationBinaryPayload {
  fileBase64: string;
  mimeType: string;
  pdfBuf: Buffer;
}

export function serializeDurableEvaluationJobPayload(
  job: Record<string, any>,
  maximumBytes = 850_000,
): Record<string, any> {
  const {
    fileBase64: _fileBase64,
    pdfBuf: _pdfBuf,
    originalFileStorageConfirmed: _originalFileStorageConfirmed,
    ...payload
  } = job;
  const serialized = JSON.stringify(payload);
  const byteLength = Buffer.byteLength(serialized, 'utf8');
  if (byteLength > maximumBytes) {
    throw new Error(
      'EVALUATION_QUEUE_PAYLOAD_TOO_LARGE: Reference material is too large for the durable job record. Contact support before retrying.',
    );
  }
  return JSON.parse(serialized);
}

export function restoreDurableEvaluationJobPayload(
  payload: Record<string, any>,
  originalPdfBuffer: Buffer,
  originalUploadBuffer?: Buffer | null,
): DurableEvaluationBinaryPayload {
  if (!Buffer.isBuffer(originalPdfBuffer) || originalPdfBuffer.length === 0) {
    throw new Error('EVALUATION_ORIGINAL_FILE_MISSING: The stored answer-sheet PDF is empty.');
  }
  const source = originalUploadBuffer && originalUploadBuffer.length > 0
    ? originalUploadBuffer
    : originalPdfBuffer;
  const mimeType = originalUploadBuffer && originalUploadBuffer.length > 0
    ? String(payload.mimeType || 'application/octet-stream')
    : 'application/pdf';

  return {
    fileBase64: source.toString('base64'),
    mimeType,
    pdfBuf: originalPdfBuffer,
  };
}
