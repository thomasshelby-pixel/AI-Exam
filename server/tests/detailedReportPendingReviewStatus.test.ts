import assert from 'node:assert/strict';
import { isEvaluationPendingReview } from '../services/detailedReportPdfService.js';

assert.equal(
  isEvaluationPendingReview({ evaluationStatus: 'NEEDS_REVIEW', grade: 'Fail' }, {}),
  true,
  'A database NEEDS_REVIEW state must override a provisional academic Fail grade',
);

assert.equal(
  isEvaluationPendingReview({ certificationStatus: 'REVIEW_REQUIRED' }, {}),
  true,
  'A review-required certification must never be rendered as final pass/fail',
);

assert.equal(
  isEvaluationPendingReview({}, { validationStatus: 'NEEDS_REVIEW' }),
  true,
  'A result JSON validationStatus of NEEDS_REVIEW must trigger provisional report labels',
);

assert.equal(
  isEvaluationPendingReview({}, {
    isTechnicalReviewState: true,
    grade: 'Fail',
  }),
  true,
  'Technical review state must suppress final result classification',
);

assert.equal(
  isEvaluationPendingReview({ evaluationStatus: 'COMPLETED', certificationStatus: 'CERTIFIED', grade: 'Fail' }, {
    validationStatus: 'VERIFIED',
    completionGateReport: { isPassed: true },
    integrityAudit: { hardCompletionGatePassed: true },
  }),
  false,
  'A completed certified evaluation must retain ordinary pass/fail classification',
);

console.log('✅ Pending-review PDF classification regression passed.');
