import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildParakhChapterKnowledgeReply,
  getParakhChapterKnowledgeInventory,
  PARAKH_FM_RATIO_BENCHMARKS,
  PARAKH_FM_CHAPTER_BENCHMARKS,
  searchParakhChapterKnowledge,
} from '../services/parakhChapterKnowledgeService.js';

const base = {
  course: 'CA_INTERMEDIATE',
  language: 'hinglish' as const,
};

test('maps the complete official CA Intermediate FM Section A chapter list without overstating content coverage', () => {
  const inventory = getParakhChapterKnowledgeInventory();
  assert.equal(inventory.chapterCount, 9);
  assert.equal(inventory.authoredContentCount, 9);
  assert.equal(inventory.humanReviewedContentCount, 0);
  assert.equal(inventory.benchmarkCaseCount, 45);
  assert.equal(inventory.humanReviewedBenchmarkCount, 0);
  assert.equal(inventory.chapters[2].title, 'Financial Analysis and Planning – Ratio Analysis');
  assert.equal(inventory.chapters[8].units.length, 6);
  assert.equal(inventory.chapters.filter((chapter) => chapter.contentStatus === 'MAPPED_ONLY').length, 0);
  assert.ok(inventory.chapters.every((chapter) => chapter.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED'));
  assert.ok(inventory.chapters.every((chapter) => chapter.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED'));
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
  assert.match(reply, /original authored draft/i);
  assert.match(reply, /not yet been independently reviewed/i);
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
  const families = new Set(PARAKH_FM_CHAPTER_BENCHMARKS.map((item) => item.family));
  assert.deepEqual([...families].sort(), [
    'core_concept',
    'edge_case_and_common_mistake',
    'exam_style_question',
    'source_sensitive_or_amendment_check',
    'unseen_numerical_or_application',
  ]);
  assert.equal(PARAKH_FM_RATIO_BENCHMARKS.length, 5);
  assert.equal(PARAKH_FM_CHAPTER_BENCHMARKS.length, 45);
  assert.deepEqual([...new Set(PARAKH_FM_CHAPTER_BENCHMARKS.map((item) => item.chapterNumber))].sort(), [1,2,3,4,5,6,7,8,9]);
  for (const chapterNumber of [1,2,3,4,5,6,7,8,9]) {
    const cases = PARAKH_FM_CHAPTER_BENCHMARKS.filter((item) => item.chapterNumber === chapterNumber);
    assert.equal(cases.length, 5);
    assert.equal(new Set(cases.map((item) => item.question)).size, 5, 'each benchmark family must have a distinct question');
  }
  assert.ok(PARAKH_FM_RATIO_BENCHMARKS.every((item) => item.question.length > 20));
  assert.equal(getParakhChapterKnowledgeInventory().humanReviewedBenchmarkCount, 0);
});



test('retrieves original chapter explanations across all nine Financial Management chapters', () => {
  const cases = [
    ['Explain the wealth maximisation objective', 1, 'intermediate-fm-chapter-1-scope-objectives', /Investment.*Financing.*Dividend/is],
    ['Explain types of financing', 2, 'intermediate-fm-chapter-2-types-financing', /owners|equity/i],
    ['Explain cost of capital', 4, 'intermediate-fm-chapter-4-cost-of-capital', /WACC|weighted average/i],
    ['Explain capital structure', 5, 'intermediate-fm-chapter-5-capital-structure', /debt|equity/i],
    ['Explain operating leverage', 6, 'intermediate-fm-chapter-6-leverages', /DOL|Operating Leverage/i],
    ['Explain NPV in capital budgeting', 7, 'intermediate-fm-chapter-7-investment-decisions', /NPV|present value/i],
    ['Explain dividend decision', 8, 'intermediate-fm-chapter-8-dividend-decision', /retained|distributed/i],
    ['Explain working capital management', 9, 'intermediate-fm-chapter-9-working-capital', /Current Assets|operating cycle/i],
  ] as const;
  for (const [message, chapterNumber, topicId, pattern] of cases) {
    const result = searchParakhChapterKnowledge({ ...base, message });
    assert.equal(result?.chapterNumber, chapterNumber, message);
    assert.equal(result?.topicId, topicId, message);
    assert.match(result?.answer || '', pattern, message);
    assert.equal(result?.contentReviewStatus, 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED');
    assert.equal(result?.benchmarkStatus, 'PROMPTS_DEFINED_NOT_EVALUATED');
  }
});

test('calculates original chapter examples for cost of capital, leverage, investment and dividends', () => {
  const wacc = searchParakhChapterKnowledge({ ...base, message: 'Give me an example of WACC' });
  const leverage = searchParakhChapterKnowledge({ ...base, message: 'Show an example of degree of combined leverage' });
  const npv = searchParakhChapterKnowledge({ ...base, message: 'Give a worked example of NPV' });
  const dividend = searchParakhChapterKnowledge({ ...base, message: 'Give an example of dividend payout ratio' });
  const workingCapital = searchParakhChapterKnowledge({ ...base, message: 'Show working capital operating cycle example' });
  assert.match(wacc?.answer || '', /11\.4%/);
  assert.match(leverage?.answer || '', /8 times/);
  assert.match(npv?.answer || '', /4,132\.23/);
  assert.match(dividend?.answer || '', /30%/);
  assert.match(workingCapital?.answer || '', /75 days/);
});

test('provides language-specific simpler explanations and quizzes for chapter packs', () => {
  const simple = searchParakhChapterKnowledge({ ...base, language: 'hindi', message: 'Explain cost of capital in simple words' });
  const quiz = searchParakhChapterKnowledge({ ...base, message: 'Quiz me on capital structure' });
  assert.equal(simple?.mode, 'simpler');
  assert.match(simple?.answer || '', /कीमत/);
  assert.equal(quiz?.mode, 'quiz');
  assert.match(quiz?.answer || '', /EBIT/);
  assert.match(buildParakhChapterKnowledgeReply(quiz!, 'hinglish'), /authored draft/i);
  assert.match(buildParakhChapterKnowledgeReply(quiz!, 'hinglish'), /independently verify nahi kiya/i);
});

test('matches Hindi-script and Hinglish aliases for core FM topics', () => {
  const hindiRatio = searchParakhChapterKnowledge({ ...base, language: 'hindi', message: 'चालू अनुपात समझाइए' });
  const hindiCapitalCost = searchParakhChapterKnowledge({ ...base, language: 'hindi', message: 'पूंजी की लागत समझाओ' });
  const hindiDividend = searchParakhChapterKnowledge({ ...base, language: 'hindi', message: 'लाभांश नीति क्या है' });
  const hinglishWorkingCapital = searchParakhChapterKnowledge({ ...base, message: 'working capital kya hai bhai' });
  assert.equal(hindiRatio?.chapterNumber, 3);
  assert.equal(hindiCapitalCost?.chapterNumber, 4);
  assert.equal(hindiDividend?.chapterNumber, 8);
  assert.equal(hinglishWorkingCapital?.chapterNumber, 9);
});

test('current ratio is not confused with current statutory or amendment information', () => {
  const result = searchParakhChapterKnowledge({ ...base, message: 'What is the current ratio?' });
  assert.ok(result);
  assert.equal(searchParakhChapterKnowledge({ ...base, message: 'What are the current GST rates?' }), null);
});
