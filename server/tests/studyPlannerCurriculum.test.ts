import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPlannerSubjects,
  getPlannerChapterRegistry,
  getPlannerSubjectAliases,
  isSupportedPlannerCourse,
  isValidPlannerChapter,
  isValidPlannerSubject,
} from '../services/studyPlannerCurriculum.js';

test('Foundation curriculum exposes all four papers with chapter options', () => {
  const subjects = getPlannerSubjects('CA_FOUNDATION');
  assert.deepEqual(subjects.map((subject) => subject.name), [
    'Accounting', 'Business Laws', 'Quantitative Aptitude', 'Business Economics',
  ]);
  assert.ok(subjects.every((subject) => subject.chapters.length > 0));
  assert.ok(subjects.find((subject) => subject.name === 'Accounting')?.chapters.includes('Bank Reconciliation Statement'));
  assert.ok(subjects.find((subject) => subject.name === 'Quantitative Aptitude')?.chapters.includes('Blood Relations'));
  assert.ok(subjects.find((subject) => subject.name === 'Quantitative Aptitude')?.chapters.includes('Statistical Description of Data and Sampling'));
});

test('Intermediate curriculum preserves all six subjects and detailed chapter options', () => {
  const subjects = getPlannerSubjects('CA_INTERMEDIATE');
  assert.equal(subjects.length, 6);
  assert.ok(subjects.find((subject) => subject.name === 'Cost and Management Accounting')?.chapters.includes('Marginal Costing'));
  assert.ok(subjects.find((subject) => subject.name === 'Taxation (Income Tax & GST)')?.chapters.some((chapter) => chapter.startsWith('GST:')));
});

test('course scope explicitly excludes CA Final', () => {
  assert.equal(isSupportedPlannerCourse('CA_FOUNDATION'), true);
  assert.equal(isSupportedPlannerCourse('CA_INTERMEDIATE'), true);
  assert.equal(isSupportedPlannerCourse('CA_FINAL'), false);
  assert.equal(isSupportedPlannerCourse('foundation'), false);
});

test('chapter validation is course-scoped and rejects cross-course chapters', () => {
  assert.equal(isValidPlannerSubject('CA_FOUNDATION', 'Accounting'), true);
  assert.equal(isValidPlannerChapter('CA_FOUNDATION', 'Accounting', 'Bank Reconciliation Statement'), true);
  assert.equal(isValidPlannerChapter('CA_FOUNDATION', 'Accounting', 'Marginal Costing'), false);
  assert.equal(isValidPlannerChapter('CA_INTERMEDIATE', 'Cost and Management Accounting', 'Marginal Costing'), true);
  assert.equal(isValidPlannerChapter('CA_INTERMEDIATE', 'Cost and Management Accounting', '__SUBJECT_LEVEL__'), true);
  assert.equal(isValidPlannerSubject('CA_INTERMEDIATE', 'Quantitative Aptitude'), false);
});

test('Foundation subject aliases do not cross-map into Intermediate subjects', () => {
  assert.deepEqual(getPlannerSubjectAliases('Accounting', 'CA_FOUNDATION'), ['Accounting']);
  assert.deepEqual(getPlannerSubjectAliases('Costing', 'CA_INTERMEDIATE'), ['Cost and Management Accounting', 'Costing']);
  assert.ok(getPlannerChapterRegistry('CA_FOUNDATION')['Business Laws'].length > 0);
});
