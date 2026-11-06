import assert from 'node:assert/strict';
import {
  isDurableQueueLeaseExpired,
  serializeEvaluationJobForDurableQueue,
} from '../services/asyncEvaluationService.js';

const evaluationJob: any = {
  evaluationId: 'eval_durable_queue_unit_test',
  studentId: 'student_durable_queue_unit_test',
  studentName: 'Queue Test Student',
  icaiRegistrationNumber: 'N/A',
  level: 'INTERMEDIATE',
  materialType: 'MODEL_TEST_PAPER',
  subjectKey: 'inter_business_economics',
  subjectName: 'Business Economics',
  checkingMode: 'standard',
  fileBase64: Buffer.from('fake-pdf').toString('base64'),
  mimeType: 'application/pdf',
  filename: 'answer-sheet.pdf',
  pdfBuf: Buffer.from('fake-pdf'),
  referenceQuestionPaperText: 'Question 1. Test question',
  referenceSuggestedAnswersText: 'Suggested answers for Question 1',
  markingSchemeText: 'Question 1 - 10 Marks',
  entitlementSource: 'PERSONAL_FREE',
  requestedEvalSource: 'PUBLIC',
  creditAlreadyConsumed: true,
};

const durablePayload = serializeEvaluationJobForDurableQueue(evaluationJob);
assert.equal(durablePayload.evaluationId, evaluationJob.evaluationId);
assert.equal(durablePayload.referenceQuestionPaperText, evaluationJob.referenceQuestionPaperText);
assert.equal(durablePayload.referenceSuggestedAnswersText, evaluationJob.referenceSuggestedAnswersText);
assert.equal(durablePayload.pdfBuf, undefined, 'Binary PDF buffer is not duplicated in job JSON');
assert.equal(durablePayload.fileBase64, undefined, 'Base64 PDF is not duplicated in job JSON');
assert.ok(
  !JSON.stringify(durablePayload).includes('fake-pdf'),
  'Serialized queue payload must not contain PDF binary data'
);

const now = Date.now();
assert.equal(
  isDurableQueueLeaseExpired({ status: 'QUEUED' }, now),
  true,
  'QUEUED jobs are immediately claimable'
);
assert.equal(
  isDurableQueueLeaseExpired({
    status: 'RUNNING',
    leaseExpiresAt: new Date(now + 60_000).toISOString(),
  }, now),
  false,
  'A worker with a live lease cannot be claimed by another instance'
);
assert.equal(
  isDurableQueueLeaseExpired({
    status: 'RUNNING',
    leaseExpiresAt: new Date(now - 1_000).toISOString(),
  }, now),
  true,
  'A stale RUNNING lease can be reclaimed after an instance restart'
);
assert.equal(
  isDurableQueueLeaseExpired({ status: 'RUNNING', leaseExpiresAt: null }, now),
  true,
  'A RUNNING job without a lease is recoverable'
);
assert.equal(
  isDurableQueueLeaseExpired({ status: 'COMPLETED' }, now),
  false,
  'Terminal jobs are not claimable'
);

console.log('Durable evaluation queue lease and payload tests passed.');
