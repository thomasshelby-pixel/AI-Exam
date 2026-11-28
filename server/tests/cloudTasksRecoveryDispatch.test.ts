import assert from 'node:assert/strict';
import { buildCloudEvaluationTaskId } from '../services/cloudTasksService.js';

const evaluationId = 'eval_recovery_123';

assert.equal(
  buildCloudEvaluationTaskId(evaluationId),
  'evaluation-' + evaluationId,
  'Ordinary dispatches should keep their deterministic idempotency key',
);

const firstRecoveryDispatch = buildCloudEvaluationTaskId(evaluationId, 'recovery-attempt-1');
const secondRecoveryDispatch = buildCloudEvaluationTaskId(evaluationId, 'recovery-attempt-2');

assert.notEqual(
  firstRecoveryDispatch,
  secondRecoveryDispatch,
  'Explicit recovery attempts must receive distinct Cloud Tasks task names',
);
assert.match(firstRecoveryDispatch, /^evaluation-eval_recovery_123-recovery-attempt-1$/);
assert.match(secondRecoveryDispatch, /^evaluation-eval_recovery_123-recovery-attempt-2$/);

assert.throws(
  () => buildCloudEvaluationTaskId('bad/id'),
  /Invalid evaluation ID/,
  'Task identity must reject invalid evaluation IDs',
);
assert.throws(
  () => buildCloudEvaluationTaskId(evaluationId, '***'),
  /Invalid Cloud Tasks dispatch ID/,
  'Task identity must reject empty sanitized dispatch IDs',
);

console.log('✅ Cloud Tasks recovery dispatch identity tests passed.');
