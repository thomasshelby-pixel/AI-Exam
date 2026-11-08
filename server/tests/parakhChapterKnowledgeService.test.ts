import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildParakhChapterKnowledgeReply,
  getParakhChapterKnowledgeInventory,
  PARAKH_FM_RATIO_BENCHMARKS,
  searchParakhChapterKnowledge,
} from '../services/parakhChapterKnowledgeService.js';

const base = {
  course: 'CA_INTERMEDIATE',
  language: 'hinglish' as const,
};

test('maps the complete official CA Intermediate FM Section A chapter list without overstating content coverage', () => {
  const inventory = getParakhChapterKnowledgeInventory();
  assert.equal(inventory.chapterCount, 9);
  assert.equal(inventory.authoredContentCount, 1);
  assert.equal(inventory.humanReviewedContentCount, 0);
  assert.equal(inventory.benchmarkCaseCount, 5);
  assert.equal(inventory.humanReviewedBenchmarkCount, 0);
  assert.equal(inventory.chapters[2].title, 'Financial Analysis and Planning – Ratio Analysis');
  assert.equal(inventory.chapters[8].units.length, 6);
  assert.equal(inventory.chapters.filter((chapter) => chapter.contentStatus === 'MAPPED_ONLY').length, 8);
});

test('retrieves the original Ratio Analysis chapter explanation for current-ratio wording', () => {
  const result = searchParakhChapterKnowledge({ ...base, message: 'Bhai current ratio samjha de' });
  assert.equal(result?.topicId, 'intermediate-fm-chapter-3-ratio-analysis');
  assert.equal(result?.chapterNumber, 3);
  assert.equal(result?.contentReviewStatus, 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED');
  assert.match(result?.answer || '', /Current Ratio/);
  assert.match(result?.answer || '', /Quick Ratio/);
});

test('provides original worked calculations and self-test in all supported languages', () => {
  const english = searchParakhChapterKnowledge({ ...base, language: 'english', message: 'Give me a worked example of ratio analysis' });
  const hindi = searchParakhChapterKnowledge({ ...base, language: 'hindi', message: 'Ratio analysis ka example' });
  const quiz = searchParakhChapterKnowledge({ ...base, message: 'Quiz me on current ratio' });
  assert.equal(english?.mode, 'example');
  assert.match(english?.answer || '', /2\.00 : 1/);
  assert.match(english?.answer || '', /1\.47 : 1/);
  assert.match(english?.answer || '', /6 times/);
  assert.match(hindi?.answer || '', /उदाहरण/);
  assert.equal(quiz?.mode, 'quiz');
  assert.match(quiz?.answer || '', /₹4,80,000/);
});

test('supports simpler explanations and keeps the chapter source visible in the reply', () => {
  const result = searchParakhChapterKnowledge({ ...base, message: 'Explain ratio analysis in simple words' });
  assert.equal(result?.mode, 'simpler');
  const reply = buildParakhChapterKnowledgeReply(result!, 'hinglish');
  assert.match(reply, /original learning explanation/i);
  assert.match(reply, /exact attempt/i);
  assert.equal(result?.source.publisher, 'Institute of Chartered Accountants of India');
  assert.match(result?.source.url || '', /icai\.org\/post\/sm-inter-p6a-may2026/);
});

test('does not serve Intermediate FM chapter content to another course', () => {
  assert.equal(searchParakhChapterKnowledge({
    message: 'Explain ratio analysis',
    course: 'CA_FINAL',
    language: 'english',
  }), null);
  assert.equal(searchParakhChapterKnowledge({
    message: 'Explain ratio analysis',
    course: 'CA_FOUNDATION',
    language: 'english',
  }), null);
});

test('routes attempt-sensitive questions away from the evergreen knowledge draft', () => {
  for (const message of [
    'What is the latest amendment applicable to ratio analysis?',
    'Is this exact treatment applicable for my upcoming attempt?',
    'Tell me current amendments for this chapter',
  ]) {
    assert.equal(searchParakhChapterKnowledge({ ...base, message }), null);
  }
});

test('defines all required benchmark families while explicitly keeping human verification open', () => {
  const families = new Set(PARAKH_FM_RATIO_BENCHMARKS.map((item) => item.family));
  assert.deepEqual([...families].sort(), [
    'core_concept',
    'edge_case_and_common_mistake',
    'exam_style_question',
    'source_sensitive_or_amendment_check',
    'unseen_numerical_or_application',
  ]);
  assert.equal(PARAKH_FM_RATIO_BENCHMARKS.length, 5);
  assert.ok(PARAKH_FM_RATIO_BENCHMARKS.every((item) => item.question.length > 20));
  assert.equal(getParakhChapterKnowledgeInventory().humanReviewedBenchmarkCount, 0);
});

test('current ratio is not confused with current statutory or amendment information', () => {
  const result = searchParakhChapterKnowledge({ ...base, message: 'What is the current ratio?' });
  assert.ok(result);
  assert.equal(searchParakhChapterKnowledge({ ...base, message: 'What are the current GST rates?' }), null);
});
