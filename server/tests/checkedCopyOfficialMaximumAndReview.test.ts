import assert from 'node:assert/strict';
import { calculateCheckedCopyResultSummary } from '../services/pdfCheckedCopyService.js';

const provisional = calculateCheckedCopyResultSummary({
  evalData: {
    id: 'checked-copy-provisional',
    level: 'INTERMEDIATE',
    subjectName: 'Advanced Accounting',
    maximumMarks: 30,
    evaluationStatus: 'NEEDS_REVIEW',
  },
  resultJson: {
    maximumMarks: 100,
    officialPaperMaxMarks: 100,
    validationStatus: 'NEEDS_REVIEW',
  },
  runPkg: {
    scoreLedger: { totalMaxMarks: 30 },
    questionInventory: { totalPaperMaxMarks: 100 },
  },
  totalAwarded: 30,
});
assert.equal(provisional.maxMarks, 100, 'Checked-copy denominator must use the full official paper maximum.');
assert.equal(provisional.attemptedMaxMarks, 30, 'Attempted subtotal remains available separately.');
assert.equal(provisional.percentage, 30, 'Percentage must use the official 100-mark paper denominator.');
assert.equal(provisional.isReviewPending, true);
assert.equal(provisional.resultStatus, 'NEEDS REVIEW', 'A review-held result must not receive a final academic grade.');

const finalized = calculateCheckedCopyResultSummary({
  evalData: {
    id: 'checked-copy-finalized',
    level: 'INTERMEDIATE',
    subjectName: 'Advanced Accounting',
    maximumMarks: 30,
    evaluationStatus: 'NEEDS_REVIEW',
    adminReviewStatus: 'AFFIRMED',
  },
  resultJson: {
    maximumMarks: 100,
    officialPaperMaxMarks: 100,
    validationStatus: 'NEEDS_REVIEW',
  },
  runPkg: {
    scoreLedger: { totalMaxMarks: 30 },
    questionInventory: { totalPaperMaxMarks: 100 },
  },
  totalAwarded: 65,
});
assert.equal(finalized.isReviewPending, false, 'A final examiner decision must supersede stale validation flags.');
assert.equal(finalized.resultStatus, 'EXEMPTION');
assert.equal(finalized.percentage, 65);

const legacy = calculateCheckedCopyResultSummary({
  evalData: { id: 'checked-copy-legacy', level: 'FINAL', subjectName: 'Audit', maximumMarks: 100 },
  resultJson: {},
  totalAwarded: 42,
});
assert.equal(legacy.maxMarks, 100);
assert.equal(legacy.resultStatus, 'PASS');

console.log('Checked-copy official maximum and pending-review result tests passed.');
