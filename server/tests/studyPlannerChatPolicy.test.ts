import test from 'node:test';
import assert from 'node:assert/strict';
import { getCourseUnderDevelopmentReply, resolveBareTopicClarification, shouldPrioritizeChapterAssessment } from '../services/studyPlannerChatPolicy.js';

test('explains when SM shorthand conflicts with a CA Final planner profile', () => {
  assert.equal(resolveBareTopicClarification('CA_FINAL', 'sm'), 'FINAL_SM_MISMATCH');
  assert.equal(resolveBareTopicClarification('CA_FINAL', 'Strategic Management'), 'FINAL_SM_MISMATCH');
});

test('recognises bare SM shorthand for CA Intermediate without inventing a study plan', () => {
  assert.equal(resolveBareTopicClarification('CA_INTERMEDIATE', 'SM'), 'INTERMEDIATE_SM');
  assert.equal(resolveBareTopicClarification('CA_INTERMEDIATE', 'FM-SM'), 'INTERMEDIATE_SM');
  assert.equal(resolveBareTopicClarification('CA_INTERMEDIATE', 'Taxation'), null);
});

test('chapter assessment runs before generic plan scope for GST detailed revision', () => {
  assert.equal(shouldPrioritizeChapterAssessment({
    course: 'CA_INTERMEDIATE',
    hasTarget: true,
    conversationText: 'GST detailed revision',
    priorScopeQuestion: false,
  }), true);
});

test('a reply to an already displayed plan-scope prompt is not treated as a fresh assessment request', () => {
  assert.equal(shouldPrioritizeChapterAssessment({
    course: 'CA_INTERMEDIATE',
    hasTarget: true,
    conversationText: 'GST detailed revision. Daily/weekly plan (next 7 days)',
    priorScopeQuestion: true,
  }), false);
});

test('chapter assessment supports Foundation and Intermediate, but needs a matching topic', () => {
  assert.equal(shouldPrioritizeChapterAssessment({
    course: 'CA_FINAL',
    hasTarget: true,
    conversationText: 'GST detailed revision',
    priorScopeQuestion: false,
  }), false);
  assert.equal(shouldPrioritizeChapterAssessment({
    course: 'CA_FOUNDATION',
    hasTarget: true,
    conversationText: 'Accounting detailed revision',
    priorScopeQuestion: false,
  }), true);
  assert.equal(shouldPrioritizeChapterAssessment({
    course: 'CA_INTERMEDIATE',
    hasTarget: false,
    conversationText: 'study plan',
    priorScopeQuestion: false,
  }), false);
});


test('returns the fixed coming-soon response for CA Final only', () => {
  assert.match(getCourseUnderDevelopmentReply('CA_FINAL') || '', /Coming soon for CA Final — under development/);
  assert.equal(getCourseUnderDevelopmentReply('CA_FOUNDATION'), null);
  assert.equal(getCourseUnderDevelopmentReply('CA_INTERMEDIATE'), null);
});
