import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveChapterAssessmentTarget } from '../services/studyPlannerChapterAssessment.js';

const registry = {
  'Taxation (Income Tax & GST)': ['Income from Salaries', 'Capital Gains', 'GST: Supply and Levy', 'GST: Input Tax Credit'],
  'Financial Management and Strategic Management': ['Scope and Objectives of Financial Management', 'Cost of Capital', 'Introduction to Strategic Management', 'Strategic Choices'],
  'Advanced Accounting': ['Accounting Standards', 'Company Accounts'],
  'Corporate and Other Laws': ['Company Law', 'Interpretation of Statutes'],
  'Cost and Management Accounting': ['Cost Sheet', 'Marginal Costing'],
  'Auditing and Ethics': ['Audit Evidence', 'Ethics'],
};

test('resolves focused GST and Income Tax chapter sets without mixing components', () => {
  assert.deepEqual(resolveChapterAssessmentTarget('GST detailed revision', registry)?.chapters, ['GST: Supply and Levy', 'GST: Input Tax Credit']);
  assert.deepEqual(resolveChapterAssessmentTarget('Income Tax detailed revision', registry)?.chapters, ['Income from Salaries', 'Capital Gains']);
});

test('resolves combined Taxation request to all Income Tax and GST chapters', () => {
  assert.equal(resolveChapterAssessmentTarget('Taxation detailed revision', registry)?.chapters.length, 4);
  assert.equal(resolveChapterAssessmentTarget('Income Tax & GST revision', registry)?.chapters.length, 4);
});

test('supports individual and combined FM/SM requests', () => {
  assert.deepEqual(resolveChapterAssessmentTarget('FM revision', registry)?.chapters, ['Scope and Objectives of Financial Management', 'Cost of Capital']);
  assert.deepEqual(resolveChapterAssessmentTarget('SM detailed revision', registry)?.chapters, ['Introduction to Strategic Management', 'Strategic Choices']);
  assert.equal(resolveChapterAssessmentTarget('FM and SM revision', registry)?.chapters.length, 4);
});

test('supports all other individual CA Inter subjects and does not guess a subject', () => {
  assert.equal(resolveChapterAssessmentTarget('Advanced Accounting revision', registry)?.label, 'Advanced Accounting');
  assert.equal(resolveChapterAssessmentTarget('Corporate and Other Laws revision', registry)?.label, 'Corporate and Other Laws');
  assert.equal(resolveChapterAssessmentTarget('Costing detailed revision', registry)?.label, 'Cost and Management Accounting');
  assert.equal(resolveChapterAssessmentTarget('Audit detailed revision', registry)?.label, 'Auditing and Ethics');
  assert.equal(resolveChapterAssessmentTarget('Btao effective revision kaise karu', registry), null);
});
