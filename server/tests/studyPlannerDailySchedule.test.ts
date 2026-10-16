import test from 'node:test';
import assert from 'node:assert/strict';
import { createDailyStudySchedule } from '../services/studyPlannerDailySchedule.js';

const priorities = [
  { subject: 'Taxation', chapter: 'Capital Gains', strength: 'WEAK', priority_score: 92 },
  { subject: 'Cost and Management Accounting', chapter: 'Marginal Costing', strength: 'MODERATE', priority_score: 65 },
];

test('daily schedule uses exact available study minutes and ranks weak chapters first', () => {
  const plan = createDailyStudySchedule({ date: '2026-10-18', available_minutes: 180, priorities });
  assert.equal(plan.scheduled_minutes, 180);
  assert.equal(plan.unscheduled_minutes, 0);
  assert.equal(plan.sessions.reduce((sum, session) => sum + session.minutes, 0), 180);
  assert.equal(plan.sessions[0].chapter, 'Capital Gains');
  assert.ok(plan.sessions.every((session) => session.minutes > 0));
});

test('daily schedule does not invent chapters when no ratings exist', () => {
  const plan = createDailyStudySchedule({ date: '2026-10-18', available_minutes: 90, priorities: [] });
  assert.equal(plan.sessions.length, 0);
  assert.equal(plan.scheduled_minutes, 0);
  assert.equal(plan.unscheduled_minutes, 90);
  assert.match(plan.assumptions[0], /Rate at least one chapter/i);
});

test('duplicate chapter ratings are de-duplicated and stronger priority wins', () => {
  const plan = createDailyStudySchedule({
    date: '2026-10-18',
    available_minutes: 60,
    priorities: [
      { subject: 'Taxation', chapter: 'Salary', strength: 'STRONG', priority_score: 15 },
      { subject: 'Taxation', chapter: 'Salary', strength: 'WEAK', priority_score: 100 },
    ],
  });
  assert.equal(new Set(plan.sessions.map((session) => session.chapter)).size, 1);
  assert.ok(plan.sessions.every((session) => session.priority_score === 100));
});

test('invalid date and out-of-range study time are rejected', () => {
  assert.throws(() => createDailyStudySchedule({ date: '2026-02-30', available_minutes: 60, priorities }), /valid YYYY-MM-DD/);
  assert.throws(() => createDailyStudySchedule({ date: '2026-10-18', available_minutes: 20, priorities }), /between 30 and 720/);
});

test('activity blocks conserve each allocated slot', () => {
  const plan = createDailyStudySchedule({ date: '2026-10-18', available_minutes: 51, priorities });
  assert.equal(plan.scheduled_minutes, 51);
  assert.equal(plan.sessions.reduce((sum, session) => sum + session.minutes, 0), 51);
  assert.deepEqual(new Set(plan.sessions.map((session) => session.activity)), new Set(['CONCEPT_REVIEW', 'QUESTION_PRACTICE', 'ACTIVE_RECALL']));
});
