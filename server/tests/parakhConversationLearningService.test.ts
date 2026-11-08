import test from 'node:test';
import assert from 'node:assert/strict';
import { buildParakhConversationLearningSignal } from '../services/parakhConversationLearningService.js';

test('converts a student difficulty statement into an aggregate-only signal', () => {
  const signal = buildParakhConversationLearningSignal({
    message: 'FM me mujhe ratio wala chapter nahi aata hai',
    course: 'CA_INTERMEDIATE',
    subjects: ['Financial Management and Strategic Management'],
    intent: 'general_guidance',
    language: 'hinglish',
  }, new Date('2026-11-08T06:00:00.000Z'));

  assert.deepEqual(signal, {
    day: '2026-11-08',
    course: 'CA_INTERMEDIATE',
    topicKey: 'fm_ratio_analysis',
    intentKey: 'learning_difficulty',
    language: 'hinglish',
  });
  assert.equal(Object.prototype.hasOwnProperty.call(signal || {}, 'message'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(signal || {}, 'studentId'), false);
});

test('classifies revision and exam-strategy topics without retaining raw content', () => {
  const revision = buildParakhConversationLearningSignal({
    message: 'How do I revise GST input tax credit?',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  }, new Date('2026-11-08T06:00:00.000Z'));
  assert.equal(revision?.topicKey, 'gst');
  assert.equal(revision?.intentKey, 'revision');

  const exam = buildParakhConversationLearningSignal({
    message: 'How should I manage time in mock tests?',
    course: 'CA_FOUNDATION',
    language: 'english',
  });
  assert.equal(exam?.topicKey, 'exam_strategy');
  assert.equal(exam?.intentKey, 'exam_strategy');
});

test('does not create a signal for casual chat or an unsupported course', () => {
  assert.equal(buildParakhConversationLearningSignal({
    message: 'kaise ho?',
    course: 'CA_INTERMEDIATE',
    language: 'hinglish',
  }), null);

  assert.equal(buildParakhConversationLearningSignal({
    message: 'Explain GST',
    course: 'UNSUPPORTED',
    language: 'english',
  }), null);
});
