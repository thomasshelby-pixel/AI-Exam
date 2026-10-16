import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttemptStudyPhases } from '../services/studyPlannerAttemptPhases.js';

test('creates ordered phases spanning the full exact-date attempt window', () => {
  const phases = createAttemptStudyPhases({
    start_date: '2026-10-17',
    exact_exam_date: '2027-05-10',
    syllabus_completion_percent: 40,
  });
  assert.equal(phases.length, 5);
  assert.equal(phases[0].start_date, '2026-10-17');
  assert.equal(phases[4].end_date, '2027-05-10');
  assert.ok(phases.every((phase, index) => phase.end_date >= phase.start_date &&
    (index === 0 || phase.start_date > phases[index - 1].end_date)));
  assert.ok(phases.reduce((sum, phase) => sum + phase.percentage, 0) >= 99);
  assert.ok(phases.reduce((sum, phase) => sum + phase.percentage, 0) <= 101);
});

test('rebalances syllabus completion when student reports high completion', () => {
  const early = createAttemptStudyPhases({ start_date: '2026-10-17', exact_exam_date: '2027-05-10', syllabus_completion_percent: 20 });
  const late = createAttemptStudyPhases({ start_date: '2026-10-17', exact_exam_date: '2027-05-10', syllabus_completion_percent: 95 });
  assert.ok(late[0].percentage < early[0].percentage);
  assert.equal(late[4].key, 'FINAL_REVISION');
});

test('requires exact exam date and at least fourteen days for attempt-wide roadmap', () => {
  assert.throws(() => createAttemptStudyPhases({ start_date: '2026-10-17', exact_exam_date: '' }), /valid start date and exact exam date/);
  assert.throws(() => createAttemptStudyPhases({ start_date: '2026-10-17', exact_exam_date: '2026-10-20' }), /at least 14 days/);
  assert.throws(() => createAttemptStudyPhases({ start_date: '2026-10-17', exact_exam_date: '2027-05-10', syllabus_completion_percent: 101 }), /between 0 and 100/);
});
