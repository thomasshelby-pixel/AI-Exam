import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getParakhIntermediateLawTaxInventory,
  PARAKH_INTERMEDIATE_LAW_TAX_BENCHMARKS,
  searchParakhIntermediateLawTaxKnowledge,
} from '../services/parakhIntermediateLawTaxKnowledgeService.js';

test('authors source-linked chapter drafts for all missing Intermediate Paper 2 and Paper 3 sections', () => {
  const inventory = getParakhIntermediateLawTaxInventory();
  assert.equal(inventory.totalChapterCount, 39);
  assert.equal(inventory.totalAuthoredContentCount, 39);
  assert.equal(inventory.totalBenchmarkPromptCount, 195);
  assert.equal(inventory.humanReviewedContentCount, 0);
  assert.equal(inventory.humanReviewedBenchmarkCount, 0);
  assert.deepEqual(inventory.papers.map((paper) => [paper.paperCode, paper.chapterCount, paper.benchmarkPromptCount]), [
    ['INT-G1-P2', 15, 75],
    ['INT-G1-P3', 9, 45],
    ['INT-G1-P3', 15, 75],
  ]);
  assert.ok(inventory.papers.every((paper) => paper.chapters.every((chapter) => chapter.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED')));
  assert.ok(inventory.papers.every((paper) => paper.chapters.every((chapter) => chapter.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED')));
});

test('routes representative Company Law, Other Laws, Income-tax and GST concepts to the correct paper and section', () => {
  const cases = [
    ['Explain incorporation of company', 2, 'INT-G1-P2', 'Part I: Company Law and Limited Liability Partnership Law'],
    ['Explain prospectus and allotment of securities', 3, 'INT-G1-P2', 'Part I: Company Law and Limited Liability Partnership Law'],
    ['Explain FEMA capital account transaction', 3, 'INT-G1-P2', 'Part II: Other Laws'],
    ['Explain FEMA current account transaction', 3, 'INT-G1-P2', 'Part II: Other Laws'],
    ['Explain residential status and scope of total income', 2, 'INT-G1-P3', 'Section A: Income-tax Law'],
    ['Explain income from house property', 3, 'INT-G1-P3', 'Section A: Income-tax Law'],
    ['Explain income of other persons included in total income', 4, 'INT-G1-P3', 'Section A: Income-tax Law'],
    ['Explain supply under GST', 2, 'INT-G1-P3', 'Section B: Goods and Services Tax'],
    ['Explain place of supply for services', 4, 'INT-G1-P3', 'Section B: Goods and Services Tax'],
    ['Explain input tax credit', 8, 'INT-G1-P3', 'Section B: Goods and Services Tax'],
  ] as const;
  for (const [message, chapterNumber, paperCode, section] of cases) {
    const result = searchParakhIntermediateLawTaxKnowledge({
      message, course: 'CA_INTERMEDIATE', language: 'english',
    });
    assert.ok(result, message);
    assert.equal(result.chapterNumber, chapterNumber, message);
    assert.equal(result.paperCode, paperCode, message);
    assert.equal(result.section, section, message);
    assert.equal(result.contentReviewStatus, 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED');
    assert.equal(result.benchmarkStatus, 'PROMPTS_DEFINED_NOT_EVALUATED');
    assert.ok(result.source.url.startsWith('https://www.icai.org/'));
  }
});

test('supports English, Hindi, Hinglish, example, simpler and quiz response modes', () => {
  const english = searchParakhIntermediateLawTaxKnowledge({
    message: 'Explain incorporation of company',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  });
  assert.ok(english && english.answer.length > 180);
  assert.equal(english?.mode, 'answer');
  const hindi = searchParakhIntermediateLawTaxKnowledge({
    message: 'GST में input tax credit समझाइए',
    course: 'CA_INTERMEDIATE',
    language: 'hindi',
  });
  assert.ok(hindi && hindi.answer.length > 100);
  assert.equal(hindi?.mode, 'answer');
  const hinglish = searchParakhIntermediateLawTaxKnowledge({
    message: 'Explain FEMA capital account transaction',
    course: 'CA_INTERMEDIATE',
    language: 'hinglish',
  });
  assert.ok(hinglish && hinglish.answer.length > 100);
  assert.equal(hinglish?.mode, 'answer');
  const example = searchParakhIntermediateLawTaxKnowledge({
    message: 'Give an example of e-way bill',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  });
  assert.equal(example?.mode, 'example');
  assert.ok((example?.answer || '').length > 50);
  assert.match(example?.answer || '', /transporter/i);
  const simpler = searchParakhIntermediateLawTaxKnowledge({
    message: 'Explain place of supply in simple words',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  });
  assert.equal(simpler?.mode, 'simpler');
  assert.ok((simpler?.answer || '').length > 40);
  assert.match(simpler?.answer || '', /^In simple terms:/);
  const quiz = searchParakhIntermediateLawTaxKnowledge({
    message: 'Quiz me on input tax credit',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  });
  assert.equal(quiz?.mode, 'quiz');
  assert.ok((quiz?.answer || '').length > 40);
  assert.match(quiz?.answer || '', /\?/);
});

test('does not leak Intermediate law or taxation packs across courses or answer attempt-sensitive rules from evergreen drafts', () => {
  assert.equal(searchParakhIntermediateLawTaxKnowledge({
    message: 'Explain input tax credit',
    course: 'CA_FOUNDATION',
    language: 'english',
  }), null);
  for (const message of [
    'What is the latest GST rate?',
    'What is the current income tax slab?',
    'Explain the latest amendment in company law',
    'What is the due date for filing this return?',
    'Which section 16 applies to this transaction?',
    'What is the current threshold for registration?',
  ]) {
    assert.equal(searchParakhIntermediateLawTaxKnowledge({
      message, course: 'CA_INTERMEDIATE', language: 'english',
    }), null, message);
  }
});

test('defines five distinct benchmark prompt families per authored chapter without claiming evaluation', () => {
  assert.equal(PARAKH_INTERMEDIATE_LAW_TAX_BENCHMARKS.length, 195);
  const perChapter = new Map<string, typeof PARAKH_INTERMEDIATE_LAW_TAX_BENCHMARKS>();
  for (const prompt of PARAKH_INTERMEDIATE_LAW_TAX_BENCHMARKS) {
    const list = perChapter.get(prompt.chapterKey) || [];
    perChapter.set(prompt.chapterKey, [...list, prompt]);
    assert.equal(prompt.status, 'PROMPT_ONLY_NOT_EVALUATED');
  }
  assert.equal(perChapter.size, 39);
  for (const prompts of perChapter.values()) {
    assert.equal(prompts.length, 5);
    assert.equal(new Set(prompts.map((item) => item.family)).size, 5);
    assert.equal(new Set(prompts.map((item) => item.question)).size, 5);
  }
});
