import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStudyPlanDraft,
  parseStudyPlannerRequest,
  STUDY_PLANNER_SUBJECTS,
} from '../services/studyPlannerEngine.js';

test('Foundation accounting revision produces a one-time draft', () => {
  const parsed = parseStudyPlannerRequest(
    'Give me 60 minutes of Accounting revision tomorrow.',
    'CA_FOUNDATION',
  );
  assert.equal(parsed.intent, 'create_study_plan');
  assert.equal(parsed.course, 'CA_FOUNDATION');
  assert.deepEqual(parsed.subjects, ['Accounting']);
  assert.equal(parsed.duration_minutes, 60);
  assert.equal(parsed.date_text, 'tomorrow');
  assert.equal(parsed.schedule_mode, 'one_time');
  assert.equal(parsed.should_call_planner, true);
});

test('Foundation Business Economics timetable is supported', () => {
  const parsed = parseStudyPlannerRequest(
    'Set up a 45-minute Business Economics timetable for today.',
    'CA_FOUNDATION',
  );
  assert.equal(parsed.intent, 'create_study_plan');
  assert.deepEqual(parsed.subjects, ['Business Economics']);
  assert.equal(parsed.duration_minutes, 45);
  assert.equal(parsed.date_text, 'today');
});

test('GST is normalized to Intermediate Taxation', () => {
  const parsed = parseStudyPlannerRequest(
    'I would like 1.5 hours of GST revision today.',
    'CA_INTERMEDIATE',
  );
  assert.equal(parsed.intent, 'create_study_plan');
  assert.deepEqual(parsed.subjects, ['Taxation']);
  assert.equal(parsed.duration_minutes, 90);
});

test('Multiple subjects preserve mention order', () => {
  const parsed = parseStudyPlannerRequest(
    'Make a 2-hour study plan for Taxation and Advanced Accounting tomorrow.',
    'CA_INTERMEDIATE',
  );
  assert.equal(parsed.intent, 'create_study_plan');
  assert.deepEqual(parsed.subjects, ['Taxation', 'Advanced Accounting']);
  assert.equal(parsed.duration_minutes, 120);
  assert.equal(parsed.date_text, 'tomorrow');
});

test('Weekly class schedule parses days, range, and duration but is not persisted', () => {
  const parsed = parseStudyPlannerRequest(
    'Put my Taxation class every Monday from 6 PM to 7 PM.',
    'CA_INTERMEDIATE',
  );
  assert.equal(parsed.intent, 'update_class_schedule');
  assert.deepEqual(parsed.subjects, ['Taxation']);
  assert.equal(parsed.duration_minutes, 60);
  assert.equal(parsed.schedule_mode, 'weekly_recurring');
  assert.equal(parsed.class_time_text, 'Monday, 6 PM to 7 PM');
  assert.equal(parsed.should_call_planner, true);
  assert.equal(createStudyPlanDraft(parsed), null);
});

test('Date override parses explicit class date and target time', () => {
  const parsed = parseStudyPlannerRequest(
    'Move my Advanced Accounting class on 27 October to 8 PM.',
    'CA_INTERMEDIATE',
  );
  assert.equal(parsed.intent, 'update_class_schedule');
  assert.deepEqual(parsed.subjects, ['Advanced Accounting']);
  assert.equal(parsed.date_text, '27 October');
  assert.equal(parsed.schedule_mode, 'date_override');
  assert.equal(parsed.class_time_text, '8 PM');
  assert.equal(parsed.should_call_planner, true);
});

test('Unsupported Foundation subject safely asks for clarification', () => {
  const parsed = parseStudyPlannerRequest(
    'Create a 60-minute Costing revision plan tomorrow.',
    'CA_FOUNDATION',
  );
  assert.equal(parsed.intent, 'clarify');
  assert.deepEqual(parsed.subjects, []);
  assert.equal(parsed.duration_minutes, 60);
  assert.equal(parsed.focus_text, 'Costing');
  assert.equal(parsed.should_call_planner, false);
  assert.ok(parsed.missing_info.length > 0);
});

test('Missing course and subject never call the planner', () => {
  const parsed = parseStudyPlannerRequest(
    'Please plan my study for tomorrow. I can study for two hours.',
  );
  assert.equal(parsed.intent, 'clarify');
  assert.equal(parsed.course, null);
  assert.equal(parsed.duration_minutes, 120);
  assert.equal(parsed.date_text, 'tomorrow');
  assert.equal(parsed.should_call_planner, false);
});

test('CA Final is explicitly out of scope', () => {
  const parsed = parseStudyPlannerRequest(
    'I am preparing for CA Final. Make a three-hour Audit revision plan.',
  );
  assert.equal(parsed.intent, 'out_of_scope');
  assert.equal(parsed.course, 'CA_FINAL');
  assert.equal(parsed.should_call_planner, false);
  assert.equal(createStudyPlanDraft(parsed), null);
});

test('General advice request does not create a timetable', () => {
  const parsed = parseStudyPlannerRequest(
    "Give me general advice on spaced revision, but don't create a timetable.",
    'CA_INTERMEDIATE',
  );
  assert.equal(parsed.intent, 'general_guidance');
  assert.equal(parsed.should_call_planner, false);
  assert.deepEqual(parsed.subjects, []);
});

test('Mock score slash notation attaches to the named subject', () => {
  const parsed = parseStudyPlannerRequest(
    'I scored 35/50 in my Taxation mock. Please prioritise revision.',
    'CA_INTERMEDIATE',
  );
  assert.equal(parsed.intent, 'prioritize_chapters');
  assert.deepEqual(parsed.subjects, ['Taxation']);
  assert.deepEqual(parsed.performance_data, [
    { subject: 'Taxation', score: 35, max_score: 50 },
  ]);
  assert.equal(parsed.should_call_planner, true);
});

test('Study progress request parses but does not create a study plan', () => {
  const parsed = parseStudyPlannerRequest(
    'I revised Accounting for one hour. Log my progress.',
    'CA_FOUNDATION',
  );
  assert.equal(parsed.intent, 'log_study_progress');
  assert.deepEqual(parsed.subjects, ['Accounting']);
  assert.equal(parsed.duration_minutes, 60);
  assert.equal(parsed.should_call_planner, true);
  assert.equal(createStudyPlanDraft(parsed), null);
});

test('Explicit course conflicting with the selected course asks for confirmation', () => {
  const parsed = parseStudyPlannerRequest(
    'I am a CA Intermediate student. Make a 60-minute Taxation revision plan.',
    'CA_FOUNDATION',
  );
  assert.equal(parsed.intent, 'clarify');
  assert.equal(parsed.course, 'CA_INTERMEDIATE');
  assert.deepEqual(parsed.missing_info, ['confirm the selected CA course']);
  assert.equal(parsed.should_call_planner, false);
});

test('Empty request safely asks for the study goal', () => {
  const parsed = parseStudyPlannerRequest('', 'CA_FOUNDATION');
  assert.equal(parsed.intent, 'clarify');
  assert.deepEqual(parsed.missing_info, ['study goal']);
  assert.equal(parsed.should_call_planner, false);
});

test('Generated draft allocations sum to the requested duration and are explicitly unsaved', () => {
  const parsed = parseStudyPlannerRequest(
    'Make a 2-hour study plan for Taxation and Advanced Accounting tomorrow.',
    'CA_INTERMEDIATE',
  );
  const plan = createStudyPlanDraft(parsed);
  assert.ok(plan);
  assert.equal(plan.total_minutes, 120);
  assert.equal(plan.sessions.reduce((sum, session) => sum + session.minutes, 0), 120);
  assert.equal(plan.saved, false);
  assert.deepEqual(plan.subjects, ['Taxation', 'Advanced Accounting']);
});

test('Subject registry includes Foundation and Intermediate subjects', () => {
  assert.equal(STUDY_PLANNER_SUBJECTS.CA_FOUNDATION.length, 4);
  assert.equal(STUDY_PLANNER_SUBJECTS.CA_INTERMEDIATE.length, 6);
});
