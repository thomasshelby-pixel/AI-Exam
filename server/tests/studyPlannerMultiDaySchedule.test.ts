import test from 'node:test';
import assert from 'node:assert/strict';
import { createMultiDayStudyPlan } from '../services/studyPlannerMultiDaySchedule.js';

const priorities = [
  { subject: 'Advanced Accounting', chapter: 'Company Accounts', strength: 'WEAK', priority_score: 100 },
  { subject: 'Taxation', chapter: 'Income from Salaries', strength: 'MODERATE', priority_score: 55 },
  { subject: 'Corporate and Other Laws', chapter: 'Share Capital', strength: 'STRONG', priority_score: 15 },
];

test('creates a seven-day timetable with session times and daily hour target', () => {
  const plan = createMultiDayStudyPlan({
    start_date: '2026-10-17', daily_study_hours: 4, study_start_time: '06:00',
    preferred_end_time: '22:00', attempt: 'May 2027', priorities,
  });
  assert.equal(plan.end_date, '2026-10-23');
  assert.equal(plan.attempt, 'May 2027');
  assert.equal(plan.daily_study_minutes, 240);
  assert.ok(plan.sessions.length > 7);
  assert.ok(plan.sessions.every(s => s.start_time && s.end_time && s.date >= plan.start_date && s.date <= plan.end_date));
  assert.ok(plan.sessions.every(s => s.start_time >= '06:00' && s.end_time <= '22:00'));
  assert.ok(new Set(plan.sessions.map(s => s.date)).size > 1);
});

test('distributes rated chapters across days and does not invent unrated chapters', () => {
  const plan = createMultiDayStudyPlan({
    start_date: '2026-10-17', daily_study_hours: 2, study_start_time: '06:00',
    preferred_end_time: '22:00', attempt: 'May 2027', priorities: [priorities[0]],
  });
  assert.deepEqual(new Set(plan.sessions.map(s => s.chapter)), new Set(['Company Accounts']));
  assert.ok(new Set(plan.sessions.map(s => s.date)).size > 1);
});

test('exact exam date is optional and shortens the planning window when inside seven days', () => {
  const plan = createMultiDayStudyPlan({
    start_date: '2026-10-17', daily_study_hours: 2, study_start_time: '06:00',
    preferred_end_time: '22:00', attempt: 'May 2027', exact_exam_date: '2026-10-19', priorities,
  });
  assert.equal(plan.end_date, '2026-10-19');
  assert.equal(plan.exact_exam_date, '2026-10-19');
  assert.ok(plan.sessions.every(s => s.date <= '2026-10-19'));
});

test('rejects invalid attempt, clock ranges, and dates', () => {
  const base = { start_date: '2026-10-17', daily_study_hours: 4, study_start_time: '06:00', preferred_end_time: '22:00', attempt: 'May 2027', priorities };
  assert.throws(() => createMultiDayStudyPlan({ ...base, study_start_time: '23:00' }), /end must be later/);
  assert.throws(() => createMultiDayStudyPlan({ ...base, attempt: 'soon' }), /supported CA attempt/);
  assert.throws(() => createMultiDayStudyPlan({ ...base, start_date: '2026-02-30' }), /valid YYYY-MM-DD/);
});

test('fixed weekly class blocks are skipped when placing study sessions', () => {
  const plan = createMultiDayStudyPlan({
    start_date: '2026-10-17', daily_study_hours: 2, study_start_time: '06:00',
    preferred_end_time: '22:00', attempt: 'May 2027', priorities,
    class_mode: 'fixed',
    class_blocks: [{ day_of_week: 6, start_time: '09:00', end_time: '13:00', label: 'Coaching' }],
  });
  const saturdaySessions = plan.sessions.filter(s => s.date === '2026-10-17');
  assert.ok(saturdaySessions.every(s => s.end_time <= '09:00' || s.start_time >= '13:00'));
  assert.equal(plan.class_mode, 'fixed');
});

test('no-class and flexible class modes are supported without inventing fixed blocks', () => {
  for (const class_mode of ['none', 'flexible'] as const) {
    const plan = createMultiDayStudyPlan({
      start_date: '2026-10-17', daily_study_hours: 2, study_start_time: '06:00',
      preferred_end_time: '22:00', attempt: 'May 2027', priorities, class_mode,
    });
    assert.equal(plan.class_mode, class_mode);
  }
});
