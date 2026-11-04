import assert from 'node:assert/strict';
import { calculateCheckedCopyResultSummary } from '../services/pdfCheckedCopyService.js';

const provisional = calculateCheckedCopyResultSummary({
  evalData: {
    id: 'eval_checked_copy_test',
    level: 'INTERMEDIATE',
    subjectName: 'Advanced Accounting',
    maximumMarks: 30,
    validationStatus: 'NEEDS_REVIEW',
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

assert.equal(provisional.maxMarks, 100, 'Attempted maximum must never replace the official paper maximum');
assert.equal(provisional.percentage, 30, '30 attempted marks on a 100-mark paper is 30%, not 100%');
assert.equal(provisional.isReviewPending, true);
assert.equal(provisional.resultStatus, 'NEEDS REVIEW', 'Review-pending copies must not show PASS/FAIL/EXEMPTION');

const affirmed = calculateCheckedCopyResultSummary({
  evalData: {
    id: 'eval_checked_copy_test',
    level: 'INTERMEDIATE',
    subjectName: 'Advanced Accounting',
    maximumMarks: 30,
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
  totalAwarded: 30,
});

assert.equal(affirmed.isReviewPending, false, 'A final examiner decision supersedes stale validation flags');
assert.equal(affirmed.resultStatus, 'FAIL', 'Only a final examiner-confirmed score may receive an academic classification');

console.log('✅ Checked-copy official maximum / pending-review result regression passed.');
