import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildParakhFoundationBusinessLawReply,
  getParakhFoundationBusinessLawInventory,
  PARAKH_FOUNDATION_LAW_BENCHMARKS,
  searchParakhFoundationBusinessLawKnowledge,
} from '../services/parakhFoundationBusinessLawKnowledgeService.js';

test('provides seven Foundation Business Laws conceptual chapter drafts', () => {
  const inventory = getParakhFoundationBusinessLawInventory();
  assert.equal(inventory.chapterCount, 7);
  assert.equal(inventory.authoredContentCount, 7);
  assert.equal(inventory.humanReviewedContentCount, 0);
  assert.equal(inventory.benchmarkCaseCount, 35);
  assert.equal(inventory.humanReviewedBenchmarkCount, 0);
  assert.deepEqual(inventory.chapters.map((item) => item.title), [
    'Indian Regulatory Framework',
    'The Indian Contract Act, 1872',
    'The Sale of Goods Act, 1930',
    'The Indian Partnership Act, 1932',
    'The Limited Liability Partnership Act, 2008',
    'The Companies Act, 2013',
    'The Negotiable Instruments Act, 1881',
  ]);
  assert.ok(inventory.chapters.every((item) => item.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED'));
  assert.ok(inventory.chapters.every((item) => item.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED'));
});

test('retrieves each chapter only for CA Foundation Paper 2', () => {
  const cases = [
    ['Explain Indian regulatory framework', 1],
    ['Explain the Indian Contract Act and consideration', 2],
    ['Explain Sale of Goods Act and unpaid seller', 3],
    ['Explain Indian Partnership Act and mutual agency', 4],
    ['Explain Limited Liability Partnership Act', 5],
    ['Explain Companies Act and company incorporation', 6],
    ['Explain Negotiable Instruments Act', 7],
  ] as const;
  for (const [message, chapterNumber] of cases) {
    const result = searchParakhFoundationBusinessLawKnowledge({
      message,
      course: 'CA_FOUNDATION',
      language: 'english',
    });
    assert.equal(result?.chapterNumber, chapterNumber, message);
    assert.equal(result?.paperCode, 'FND-P2');
    assert.equal(result?.section, 'Business Laws');
    assert.equal(result?.contentReviewStatus, 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED');
    assert.equal(result?.benchmarkStatus, 'PROMPTS_DEFINED_NOT_EVALUATED');
  }
  assert.equal(searchParakhFoundationBusinessLawKnowledge({
    message: 'Explain Indian Contract Act',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  }), null);
});

test('supports English, Hindi and Hinglish content with answer, example, simpler and quiz modes', () => {
  const cases = [
    { message: 'Explain nature of contract', language: 'english' as const },
    { message: 'Sale of Goods Act ko simple language mein samjhao', language: 'hinglish' as const },
    { message: 'साझेदारी अधिनियम का उदाहरण दीजिए', language: 'hindi' as const },
    { message: 'Quiz me on LLP Act', language: 'english' as const },
  ];
  for (const item of cases) {
    const result = searchParakhFoundationBusinessLawKnowledge({
      message: item.message,
      course: 'CA_FOUNDATION',
      language: item.language,
    });
    assert.ok(result);
    assert.ok(result.answer.length > 180);
  }
  assert.equal(searchParakhFoundationBusinessLawKnowledge({
    message: 'Companies Act ka example',
    course: 'CA_FOUNDATION',
    language: 'hinglish',
  })?.mode, 'example');
  assert.equal(searchParakhFoundationBusinessLawKnowledge({
    message: 'Contract Act in simple words',
    course: 'CA_FOUNDATION',
    language: 'english',
  })?.mode, 'simpler');
  assert.equal(searchParakhFoundationBusinessLawKnowledge({
    message: 'Negotiable Instruments Act पर सवाल पूछो',
    course: 'CA_FOUNDATION',
    language: 'hindi',
  })?.mode, 'quiz');
});

test('routes exact legal currency questions away from evergreen drafts', () => {
  for (const message of [
    'What is the latest amendment to Companies Act?',
    'Which section number applies to this issue?',
    'What is the limitation period under current law?',
    'What is the penalty for non-compliance?',
    'What is the prescribed filing deadline?',
    'Is this applicable for May 2027?',
  ]) {
    assert.equal(searchParakhFoundationBusinessLawKnowledge({
      message,
      course: 'CA_FOUNDATION',
      language: 'english',
    }), null, message);
  }
});

test('links the official May 2027 Paper 2 source and discloses conceptual draft status', () => {
  const result = searchParakhFoundationBusinessLawKnowledge({
    message: 'Explain Indian Contract Act',
    course: 'CA_FOUNDATION',
    language: 'hinglish',
  })!;
  assert.equal(result.source.url, 'https://www.icai.org/post/24381');
  assert.match(result.syllabusApplicability, /Relevant for May 2027 and Onwards/);
  const reply = buildParakhFoundationBusinessLawReply(result, 'hinglish');
  assert.match(reply, /conceptual author draft/i);
  assert.match(reply, /qualified CA law reviewer/i);
  assert.match(reply, /current bare Act/i);
});

test('defines five separate benchmark families for all seven chapters', () => {
  assert.equal(PARAKH_FOUNDATION_LAW_BENCHMARKS.length, 35);
  for (let chapter = 1; chapter <= 7; chapter += 1) {
    const prompts = PARAKH_FOUNDATION_LAW_BENCHMARKS.filter((item) => item.chapterNumber === chapter);
    assert.equal(prompts.length, 5);
    assert.equal(new Set(prompts.map((item) => item.family)).size, 5);
    assert.equal(new Set(prompts.map((item) => item.question)).size, 5);
  }
});
