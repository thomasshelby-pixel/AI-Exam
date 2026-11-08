import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildParakhAuditingReply,
  getParakhAuditingInventory,
  PARAKH_AUDIT_BENCHMARKS,
  searchParakhAuditingKnowledge,
} from '../services/parakhAuditingKnowledgeService.js';

test('provides original Auditing and Ethics drafts for all 11 May 2027 catalogue chapters', () => {
  const inventory = getParakhAuditingInventory();
  assert.equal(inventory.chapterCount, 11);
  assert.equal(inventory.authoredContentCount, 11);
  assert.equal(inventory.humanReviewedContentCount, 0);
  assert.equal(inventory.benchmarkCaseCount, 55);
  assert.equal(inventory.humanReviewedBenchmarkCount, 0);
  assert.deepEqual(inventory.chapters.map((item) => item.title), [
    'Nature, Objective and Scope of Audit',
    'Audit Strategy, Audit Planning and Audit Programme',
    'Risk Assessment and Internal Control',
    'Audit Evidence',
    'Audit of Items of Financial Statements',
    'Audit Documentation',
    'Completion and Review',
    'Audit Report',
    'Special Features of Audit of Different Type of Entities',
    'Audit of Banks',
    'Ethics and Terms of Audit Engagements',
  ]);
  assert.ok(inventory.chapters.every((item) => item.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED'));
  assert.ok(inventory.chapters.every((item) => item.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED'));
});

test('retrieves all catalogue chapters for CA Intermediate Paper 5 only', () => {
  const queries = [
    ['Explain objective and scope of audit', 1],
    ['Explain audit strategy and audit programme', 2],
    ['Explain audit risk and internal control', 3],
    ['Explain audit evidence sufficiency and appropriateness', 4],
    ['Explain audit assertions for financial statement items', 5],
    ['Explain audit documentation and working papers', 6],
    ['Explain completion and subsequent events', 7],
    ['Explain qualified and adverse audit report', 8],
    ['Explain audit of not for profit entities', 9],
    ['Explain bank audit and audit of advances', 10],
    ['Explain audit ethics and independence threats', 11],
  ] as const;
  for (const [message, chapterNumber] of queries) {
    const result = searchParakhAuditingKnowledge({
      message,
      course: 'CA_INTERMEDIATE',
      language: 'english',
    });
    assert.equal(result?.chapterNumber, chapterNumber, message);
    assert.equal(result?.paperCode, 'INT-G2-P5');
    assert.equal(result?.contentReviewStatus, 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED');
    assert.equal(result?.benchmarkStatus, 'PROMPTS_DEFINED_NOT_EVALUATED');
  }
  assert.equal(searchParakhAuditingKnowledge({
    message: 'Explain audit evidence',
    course: 'CA_FOUNDATION',
    language: 'english',
  }), null);
});

test('supports multilingual answer, example, simpler and quiz modes', () => {
  const cases = [
    { message: 'Explain audit evidence', language: 'english' as const },
    { message: 'Audit risk ko simple language mein samjhao', language: 'hinglish' as const },
    { message: 'ऑडिट रिपोर्ट का उदाहरण दीजिए', language: 'hindi' as const },
    { message: 'Quiz me on audit documentation', language: 'english' as const },
  ];
  for (const item of cases) {
    const result = searchParakhAuditingKnowledge({
      message: item.message,
      course: 'CA_INTERMEDIATE',
      language: item.language,
    });
    assert.ok(result);
    assert.ok(result.answer.length > 160);
  }
  assert.equal(searchParakhAuditingKnowledge({
    message: 'Audit report ka example',
    course: 'CA_INTERMEDIATE',
    language: 'hinglish',
  })?.mode, 'example');
  assert.equal(searchParakhAuditingKnowledge({
    message: 'Explain audit risk in simple words',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  })?.mode, 'simpler');
  assert.equal(searchParakhAuditingKnowledge({
    message: 'Audit evidence पर सवाल पूछो',
    course: 'CA_INTERMEDIATE',
    language: 'hindi',
  })?.mode, 'quiz');
});

test('routes attempt-sensitive standards, ethics and syllabus questions away from evergreen notes', () => {
  for (const message of [
    'Is this applicable for May 2027?',
    'What is the latest SA amendment?',
    'What is the current Code of Ethics requirement?',
    'What are the latest syllabus changes?',
  ]) {
    assert.equal(searchParakhAuditingKnowledge({
      message,
      course: 'CA_INTERMEDIATE',
      language: 'english',
    }), null, message);
  }
});

test('links the official ICAI chapter catalogue and discloses the unreviewed draft state', () => {
  const result = searchParakhAuditingKnowledge({
    message: 'Explain audit report',
    course: 'CA_INTERMEDIATE',
    language: 'hinglish',
  })!;
  assert.equal(result.source.url, 'https://www.icai.org/post/sm-inter-p5-may2027');
  assert.match(result.syllabusApplicability, /May 2027 Exam Onwards/);
  const reply = buildParakhAuditingReply(result, 'hinglish');
  assert.match(reply, /original PARAKH author draft/i);
  assert.match(reply, /qualified audit academic reviewer/i);
  assert.match(reply, /current ICAI source/i);
});

test('defines five benchmark families per auditing chapter', () => {
  assert.equal(PARAKH_AUDIT_BENCHMARKS.length, 55);
  for (let chapter = 1; chapter <= 11; chapter += 1) {
    const prompts = PARAKH_AUDIT_BENCHMARKS.filter((item) => item.chapterNumber === chapter);
    assert.equal(prompts.length, 5);
    assert.equal(new Set(prompts.map((item) => item.family)).size, 5);
    assert.equal(new Set(prompts.map((item) => item.question)).size, 5);
  }
});
