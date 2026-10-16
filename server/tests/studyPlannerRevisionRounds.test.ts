import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdaptiveRevisionRounds } from '../services/studyPlannerRevisionRounds.js';

test('builds ordered revision rounds through the exact exam date and prioritises weak chapters', () => {
  const rounds = createAdaptiveRevisionRounds({
    start_date: '2026-10-17',
    exact_exam_date: '2027-05-10',
    daily_study_hours: 4,
    chapters: [
      { subject: 'Taxation', chapter: 'Salary', strength: 'WEAK' },
      { subject: 'Law', chapter: 'Meetings', strength: 'STRONG' },
      { subject: 'Costing', chapter: 'Marginal Costing', strength: 'MODERATE' },
    ],
  });
  assert.equal(rounds.length, 4);
  assert.equal(rounds[0].key, 'R1');
  assert.equal(rounds[3].key, 'R4');
  assert.equal(rounds[3].end_date, '2027-05-10');
  assert.ok(rounds.every((round, index) => round.days >= 1 && (index === 0 || round.start_date > rounds[index - 1].end_date)));
  assert.equal(rounds[0].chapters[0].chapter, 'Salary');
});

test('reduces the number of rounds when the exam window is short', () => {
  const rounds = createAdaptiveRevisionRounds({
    start_date: '2026-10-17',
    exact_exam_date: '2026-11-20',
    daily_study_hours: 3,
    chapters: [{ subject: 'Law', chapter: 'Company Law', strength: 'WEAK' }],
  });
  assert.equal(rounds.length, 2);
});

test('validates date, daily study hours, and minimum window', () => {
  assert.throws(() => createAdaptiveRevisionRounds({ start_date: '2026-10-17', exact_exam_date: '', daily_study_hours: 4, chapters: [] }), /valid start date/);
  assert.throws(() => createAdaptiveRevisionRounds({ start_date: '2026-10-17', exact_exam_date: '2026-10-20', daily_study_hours: 4, chapters: [] }), /At least 14 days/);
  assert.throws(() => createAdaptiveRevisionRounds({ start_date: '2026-10-17', exact_exam_date: '2026-11-20', daily_study_hours: 0, chapters: [] }), /between 1 and 12/);
});
