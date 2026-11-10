import assert from 'node:assert/strict';
import { hasPersistedDescriptiveStepEvidence } from '../services/canonicalQuestionInventoryService.js';

assert.equal(hasPersistedDescriptiveStepEvidence('Q2(a)', 'DESCRIPTIVE', {
  markingComponents: [],
  stepMarkingBreakdown: [],
}), false, 'An attempted descriptive question with no persisted step evidence must be held for review.');

assert.equal(hasPersistedDescriptiveStepEvidence('Q2(a)', 'DESCRIPTIVE', {
  markingComponents: [{ componentId: 'c1', marksAvailable: 1, marksAwarded: 0 }],
}), true, 'A genuine component row with an explicit zero award is valid evidence for an academic zero.');

assert.equal(hasPersistedDescriptiveStepEvidence('Q2(a)', 'DESCRIPTIVE', {
  stepMarkingBreakdown: [{ step: 'Provision', marksAwarded: 0, maximumMarks: 1 }],
}), true, 'A persisted step breakdown is also valid evidence.');

assert.equal(hasPersistedDescriptiveStepEvidence('MCQ1', 'MCQ', {}), true,
  'Objective MCQ scoring does not require descriptive component breakdowns.');

console.log('✅ Missing descriptive step evidence is withheld instead of certified as zero.');
