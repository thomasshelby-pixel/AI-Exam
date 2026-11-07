import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKnowledgeChatReply, searchStudyKnowledge } from '../services/studyPlannerKnowledgeService.js';

test('retrieves relevant study guidance without exact wording', () => {
  const result = searchStudyKnowledge({
    message: 'Bhai notes band karke yaad kaise karu?',
    course: 'CA_INTERMEDIATE',
    language: 'hinglish',
  });
  assert.equal(result?.topicId, 'active-recall');
  assert.match(buildKnowledgeChatReply(result!, 'hinglish'), /Active recall/);
});

test('returns language-matched answers', () => {
  const hindi = searchStudyKnowledge({ message: 'याद रखने का तरीका बताओ', course: 'CA_FOUNDATION', language: 'hindi' });
  assert.equal(hindi?.topicId, 'active-recall');
  assert.match(buildKnowledgeChatReply(hindi!, 'hindi'), /याद/);
  const english = searchStudyKnowledge({ message: 'How do I analyse a mock test?', course: 'CA_INTERMEDIATE', language: 'english' });
  assert.equal(english?.topicId, 'mock-analysis');
});

test('supports follow-up requests for examples, simpler explanations and quizzes', () => {
  const history = ['Student: How do I remember provisions?', 'Planner: Topic: Active recall'];
  const example = searchStudyKnowledge({ message: 'Give me an example', course: 'CA_INTERMEDIATE', language: 'english', history });
  assert.equal(example?.mode, 'example');
  assert.equal(example?.topicId, 'active-recall');
  const simpler = searchStudyKnowledge({ message: 'Explain simpler', course: 'CA_INTERMEDIATE', language: 'english', history });
  assert.equal(simpler?.mode, 'simpler');
  const quiz = searchStudyKnowledge({ message: 'Quiz me', course: 'CA_INTERMEDIATE', language: 'english', history });
  assert.equal(quiz?.mode, 'quiz');
});

test('recognises topic-specific study techniques', () => {
  const numerical = searchStudyKnowledge({ message: 'How should I practise costing sums?', course: 'CA_INTERMEDIATE', language: 'english' });
  assert.equal(numerical?.topicId, 'numerical-practice');
  const law = searchStudyKnowledge({ message: 'How do I write a law case study answer?', course: 'CA_INTERMEDIATE', language: 'english' });
  assert.equal(law?.topicId, 'law-tax-answer-writing');
  const revision = searchStudyKnowledge({ message: 'How to revise a chapter?', course: 'CA_FOUNDATION', language: 'english' });
  assert.equal(revision?.topicId, 'revision-cycle');
});

test('follow-up resolves to the most recently discussed topic', () => {
  const history = [
    'Planner: **Topic: Active recall**',
    'Student: How should I analyse a mock test?',
    'Planner: **Topic: Mock test analysis**',
  ];
  const result = searchStudyKnowledge({ message: 'Give me an example', course: 'CA_INTERMEDIATE', language: 'english', history });
  assert.equal(result?.topicId, 'mock-analysis');
});

test('does not confuse a costing concept question with a request for numerical practice', () => {
  const result = searchStudyKnowledge({ message: 'What is marginal costing?', course: 'CA_INTERMEDIATE', language: 'english' });
  assert.equal(result, null);
});

test('does not answer current or attempt-sensitive statutory questions from generic knowledge', () => {
  assert.equal(searchStudyKnowledge({ message: 'What is the current GST rate for this supply?', course: 'CA_INTERMEDIATE', language: 'english' }), null);
  assert.equal(searchStudyKnowledge({ message: 'What is the latest Finance Act amendment?', course: 'CA_INTERMEDIATE', language: 'english' }), null);
});

test('enforces explicit subject boundaries between Foundation and Intermediate', () => {
  const foundationCosting = searchStudyKnowledge({
    message: 'How should I practise costing sums?',
    course: 'CA_FOUNDATION',
    language: 'english',
  });
  assert.equal(foundationCosting, null);

  const intermediateCosting = searchStudyKnowledge({
    message: 'How should I practise costing sums?',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  });
  assert.equal(intermediateCosting?.topicId, 'numerical-practice');

  const foundationAccounting = searchStudyKnowledge({
    message: 'How should I practise Accounting sums?',
    course: 'CA_FOUNDATION',
    language: 'english',
  });
  assert.equal(foundationAccounting?.topicId, 'numerical-practice');

  const intermediateAccounting = searchStudyKnowledge({
    message: 'How should I practise Accounting sums?',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  });
  assert.equal(intermediateAccounting?.topicId, 'numerical-practice');

  const foundationAdvancedAccounting = searchStudyKnowledge({
    message: 'How should I practise Advanced Accounting sums?',
    course: 'CA_FOUNDATION',
    language: 'english',
  });
  assert.equal(foundationAdvancedAccounting, null);

  const foundationBusinessLaws = searchStudyKnowledge({
    message: 'How do I write a Business Laws case study answer?',
    course: 'CA_FOUNDATION',
    language: 'english',
  });
  assert.equal(foundationBusinessLaws?.topicId, 'law-tax-answer-writing');

  const foundationGst = searchStudyKnowledge({
    message: 'How do I write a GST answer?',
    course: 'CA_FOUNDATION',
    language: 'english',
  });
  assert.equal(foundationGst, null);

  const intermediateGst = searchStudyKnowledge({
    message: 'How do I write a GST answer?',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  });
  assert.equal(intermediateGst?.topicId, 'law-tax-answer-writing');
});

test('allows general numerical practice for both supported courses', () => {
  for (const course of ['CA_FOUNDATION', 'CA_INTERMEDIATE'] as const) {
    const result = searchStudyKnowledge({
      message: 'How do I improve my numerical practice?',
      course,
      language: 'english',
    });
    assert.equal(result?.topicId, 'numerical-practice');
  }
});
