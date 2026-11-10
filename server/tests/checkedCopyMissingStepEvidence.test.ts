import assert from 'node:assert/strict';
import { resolveCheckedCopyReviewState } from '../services/pdfCheckedCopyService.js';

const missingComponents: any = {
  questionId: 'Q2(a)(i)',
  questionType: 'DESCRIPTIVE',
  evaluationStatus: 'NEEDS_REVIEW',
  reviewRequired: true,
  markingComponents: [],
  stepMarkingBreakdown: [],
};
const withheld = resolveCheckedCopyReviewState(missingComponents);
assert.equal(withheld.reviewRequired, true);
assert.match(withheld.reviewReason || '', /not an academic zero/i,
  'A missing step breakdown must render as score withheld, not as a fabricated 0-mark examiner decision.');

const genuinelyEvaluatedZero: any = {
  questionId: 'Q4(c)',
  questionType: 'DESCRIPTIVE',
  evaluationStatus: 'EVALUATED',
  reviewRequired: false,
  markingComponents: [{
    componentId: 'Q4c_c1',
    expectedRequirement: 'Explain the statutory distinction.',
    studentEvidence: 'No response written for this requirement.',
    assessment: 'OMITTED',
    marksAvailable: 4,
    marksAwarded: 0,
  }],
};
assert.equal(resolveCheckedCopyReviewState(genuinelyEvaluatedZero).reviewRequired, false,
  'A real zero with persisted component evidence remains an academic zero.');

const objectiveQuestion: any = {
  questionId: 'MCQ1',
  questionType: 'MCQ',
  evaluationStatus: 'EVALUATED',
  reviewRequired: false,
  markingComponents: [],
};
assert.equal(resolveCheckedCopyReviewState(objectiveQuestion).reviewRequired, false,
  'MCQ records are not forced into descriptive step-evidence review.');

console.log('✅ Checked-copy review state never fabricates descriptive zero-mark breakdowns.');
