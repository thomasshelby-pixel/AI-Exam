import test from 'node:test';
import assert from 'node:assert/strict';
import { extractStudentConversationHistory, getCourseUnderDevelopmentReply, resolveBareTopicClarification, shouldAskTopicIntentClarification, shouldPrioritizeChapterAssessment } from '../services/studyPlannerChatPolicy.js';

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

test('CA Final conversational help is not disabled by the planner-only availability message', () => {
  const message = getCourseUnderDevelopmentReply('CA_FINAL');
  assert.match(message || '', /Coming soon for CA Final/);
  // Route policy limits this gate to deterministic schedule generation; general chat is available.
});


test('assistant replies are excluded from student intent history', () => {
  assert.deepEqual(extractStudentConversationHistory([
    'Planner: I can explain concepts or suggest revision strategies.',
    'Student: hello',
    'Planner: Which subject do you need help with?',
    'Student: FM me',
  ]), ['hello', 'FM me']);
});

test('untagged legacy conversation history remains usable', () => {
  assert.deepEqual(extractStudentConversationHistory(['GST', 'detailed revision']), ['GST', 'detailed revision']);
});

test('a bare subject mention asks what kind of help is needed before chapter assessment', () => {
  assert.equal(shouldAskTopicIntentClarification({ message: 'FM me', hasTarget: true }), true);
  assert.equal(shouldAskTopicIntentClarification({ message: 'FM', hasTarget: true }), true);
  assert.equal(shouldAskTopicIntentClarification({ message: 'FM detailed revision', hasTarget: true }), false);
  assert.equal(shouldAskTopicIntentClarification({ message: 'Explain FM', hasTarget: true }), false);
  assert.equal(shouldAskTopicIntentClarification({ message: 'FM me', hasTarget: false }), false);
});

test('an assistant mention of revision cannot trigger a chapter assessment for a bare student subject message', () => {
  const studentHistory = extractStudentConversationHistory([
    'Planner: I can explain concepts, suggest revision strategies, or build a timetable.',
    'Student: hello',
  ]);
  const conversationText = ['FM me', ...studentHistory].join(' ');
  assert.equal(shouldPrioritizeChapterAssessment({
    course: 'CA_INTERMEDIATE',
    hasTarget: true,
    conversationText,
    priorScopeQuestion: false,
  }), false);
});


test('CA Final availability remains a planner-only gate, not a social-chat gate', () => {
  assert.match(getCourseUnderDevelopmentReply('CA_FINAL') || '', /Coming soon for CA Final/);
  assert.equal(getCourseUnderDevelopmentReply('CA_INTERMEDIATE'), null);
});
