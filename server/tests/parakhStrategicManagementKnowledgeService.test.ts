import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildParakhStrategicManagementReply,
  getParakhStrategicManagementInventory,
  PARAKH_SM_BENCHMARKS,
  searchParakhStrategicManagementKnowledge,
} from '../services/parakhStrategicManagementKnowledgeService.js';

test('provides five original Strategic Management chapter drafts across three languages', () => {
  const inventory = getParakhStrategicManagementInventory();
  assert.equal(inventory.chapterCount, 5);
  assert.equal(inventory.authoredContentCount, 5);
  assert.equal(inventory.humanReviewedContentCount, 0);
  assert.equal(inventory.benchmarkCaseCount, 25);
  assert.equal(inventory.humanReviewedBenchmarkCount, 0);
  assert.deepEqual(inventory.chapters.map((chapter) => chapter.title), [
    'Introduction to Strategic Management',
    'Strategic Analysis: External Environment',
    'Strategic Analysis: Internal Environment',
    'Strategic Choices',
    'Strategy Implementation and Evaluation',
  ]);
  assert.ok(inventory.chapters.every((chapter) => chapter.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED'));
});

test('retrieves all five official catalogue chapters for CA Intermediate only', () => {
  const prompts = [
    ['Explain introduction to strategic management', 1],
    ['Explain PESTEL and Porter five forces', 2],
    ['Explain VRIO and SWOT analysis', 3],
    ['Explain Ansoff matrix and strategic choices', 4],
    ['Explain balanced scorecard and strategy evaluation', 5],
  ] as const;
  for (const [message, chapterNumber] of prompts) {
    const result = searchParakhStrategicManagementKnowledge({
      message,
      course: 'CA_INTERMEDIATE',
      language: 'english',
    });
    assert.equal(result?.chapterNumber, chapterNumber, message);
    assert.equal(result?.section, 'Section B: Strategic Management');
    assert.equal(result?.paperCode, 'INT-G2-P6');
    assert.equal(result?.contentReviewStatus, 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED');
    assert.equal(result?.benchmarkStatus, 'PROMPTS_DEFINED_NOT_EVALUATED');
  }
  assert.equal(searchParakhStrategicManagementKnowledge({
    message: 'Explain SWOT',
    course: 'CA_FOUNDATION',
    language: 'english',
  }), null);
});

test('returns English, Hindi and Hinglish lesson content with all four modes', () => {
  const examples = [
    { message: 'Explain PESTEL', language: 'english' as const },
    { message: 'PESTEL ko simple language mein samjhao', language: 'hinglish' as const },
    { message: 'SWOT analysis का उदाहरण दीजिए', language: 'hindi' as const },
    { message: 'Quiz me on balanced scorecard', language: 'english' as const },
    { message: 'Ansoff matrix ka example', language: 'hinglish' as const },
  ];
  for (const item of examples) {
    const result = searchParakhStrategicManagementKnowledge({
      message: item.message,
      course: 'CA_INTERMEDIATE',
      language: item.language,
    });
    assert.ok(result);
    assert.ok(result.answer.length > 180);
  }
  assert.equal(searchParakhStrategicManagementKnowledge({
    message: 'PESTEL quiz me',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  })?.mode, 'quiz');
  assert.equal(searchParakhStrategicManagementKnowledge({
    message: 'Porter five forces example',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  })?.mode, 'example');
  assert.equal(searchParakhStrategicManagementKnowledge({
    message: 'Explain SWOT in simple words',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  })?.mode, 'simpler');
  assert.equal(searchParakhStrategicManagementKnowledge({
    message: 'PESTEL पर सवाल पूछो',
    course: 'CA_INTERMEDIATE',
    language: 'hindi',
  })?.mode, 'quiz');
  assert.equal(searchParakhStrategicManagementKnowledge({
    message: 'SWOT analysis को आसान भाषा में समझाओ',
    course: 'CA_INTERMEDIATE',
    language: 'hindi',
  })?.mode, 'simpler');
  assert.equal(searchParakhStrategicManagementKnowledge({
    message: 'Porter five forces का उदाहरण',
    course: 'CA_INTERMEDIATE',
    language: 'hindi',
  })?.mode, 'example');
});

test('does not answer attempt-sensitive syllabus or amendment questions from evergreen drafts', () => {
  for (const message of [
    'Is the latest syllabus changed?',
    'Is this applicable for May 2027?',
    'Any amendment to Strategic Management?',
    'What is the latest chapter list?',
  ]) {
    assert.equal(searchParakhStrategicManagementKnowledge({
      message,
      course: 'CA_INTERMEDIATE',
      language: 'english',
    }), null, message);
  }
});

test('links the current official Paper 6B catalogue and discloses draft status', () => {
  const result = searchParakhStrategicManagementKnowledge({
    message: 'Explain strategic choices',
    course: 'CA_INTERMEDIATE',
    language: 'hinglish',
  })!;
  assert.equal(result.source.url, 'https://www.icai.org/post/sm-inter-p6b-may2027');
  assert.match(result.syllabusApplicability, /May 2027 Exam Onwards/);
  const reply = buildParakhStrategicManagementReply(result, 'hinglish');
  assert.match(reply, /original author draft/i);
  assert.match(reply, /qualified CA academic reviewer/i);
  assert.match(reply, /May 2027 exam onwards/i);
});

test('defines five distinct benchmark families per Strategic Management chapter', () => {
  assert.equal(PARAKH_SM_BENCHMARKS.length, 25);
  for (let chapter = 1; chapter <= 5; chapter += 1) {
    const prompts = PARAKH_SM_BENCHMARKS.filter((item) => item.chapterNumber === chapter);
    assert.equal(prompts.length, 5);
    assert.equal(new Set(prompts.map((item) => item.family)).size, 5);
    assert.equal(new Set(prompts.map((item) => item.question)).size, 5);
  }
});
