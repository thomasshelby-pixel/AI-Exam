import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildParakhCostAccountingReply,
  calculateCostSheetTotals,
  getParakhCostAccountingInventory,
  PARAKH_COST_BENCHMARKS,
  searchParakhCostAccountingKnowledge,
} from '../services/parakhCostAccountingKnowledgeService.js';

test('provides original Cost Accounting drafts for all 15 May 2027 catalogue chapters', () => {
  const inventory = getParakhCostAccountingInventory();
  assert.equal(inventory.chapterCount, 15);
  assert.equal(inventory.authoredContentCount, 15);
  assert.equal(inventory.humanReviewedContentCount, 0);
  assert.equal(inventory.benchmarkCaseCount, 75);
  assert.equal(inventory.humanReviewedBenchmarkCount, 0);
  assert.deepEqual(inventory.chapters.map((item) => item.title), [
    'Introduction to Cost and Management Accounting',
    'Material Cost',
    'Employee Cost and Direct Expenses',
    'Overheads – Absorption Costing Method',
    'Activity Based Costing',
    'Cost Sheet',
    'Cost Accounting Systems',
    'Unit & Batch Costing',
    'Job Costing',
    'Process & Operation Costing',
    'Joint Products and By Products',
    'Service Costing',
    'Standard Costing',
    'Marginal Costing',
    'Budgets and Budgetary Control',
  ]);
  assert.ok(inventory.chapters.every((item) => item.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED'));
  assert.ok(inventory.chapters.every((item) => item.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED'));
});

test('retrieves each chapter in the correct course and paper', () => {
  const queries = [
    ['Explain material cost and EOQ', 2],
    ['Explain Halsey plan and Rowan plan', 3],
    ['Explain overhead absorption and machine hour rate', 4],
    ['Explain Activity Based Costing and cost drivers', 5],
    ['Explain cost sheet', 6],
    ['Explain job costing', 9],
    ['Explain process costing and equivalent units', 10],
    ['Explain joint products and by products', 11],
    ['Explain service costing', 12],
    ['Explain standard costing material variance', 13],
    ['Explain marginal costing and break even point', 14],
    ['Explain budgets and budgetary control', 15],
  ] as const;
  for (const [message, chapterNumber] of queries) {
    const result = searchParakhCostAccountingKnowledge({
      message,
      course: 'CA_INTERMEDIATE',
      language: 'english',
    });
    assert.equal(result?.chapterNumber, chapterNumber, message);
    assert.equal(result?.paperCode, 'INT-G2-P4');
    assert.equal(result?.contentReviewStatus, 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED');
    assert.equal(result?.benchmarkStatus, 'PROMPTS_DEFINED_NOT_EVALUATED');
  }
  assert.equal(searchParakhCostAccountingKnowledge({
    message: 'Explain EOQ',
    course: 'CA_FOUNDATION',
    language: 'english',
  }), null);
});

test('supports English, Hindi, Hinglish and all four learning modes', () => {
  const cases = [
    { message: 'Explain material cost', language: 'english' as const, mode: 'answer' as const, minimumLength: 180 },
    { message: 'EOQ ko simple language mein samjhao', language: 'hinglish' as const, mode: 'simpler' as const, minimumLength: 80 },
    { message: 'लागत पत्रक का उदाहरण दीजिए', language: 'hindi' as const, mode: 'example' as const, minimumLength: 100 },
    { message: 'Quiz me on marginal costing', language: 'english' as const, mode: 'quiz' as const, minimumLength: 100 },
  ];
  for (const item of cases) {
    const result = searchParakhCostAccountingKnowledge({
      message: item.message,
      course: 'CA_INTERMEDIATE',
      language: item.language,
    });
    assert.ok(result);
    assert.equal(result.mode, item.mode, item.message);
    assert.ok(result.answer.length > item.minimumLength, item.message);
    if (result.mode === 'quiz') assert.match(result.answer, /[?؟]/);
  }
  assert.equal(searchParakhCostAccountingKnowledge({
    message: 'Cost sheet ka example',
    course: 'CA_INTERMEDIATE',
    language: 'hinglish',
  })?.mode, 'example');
  assert.equal(searchParakhCostAccountingKnowledge({
    message: 'Explain EOQ in simple words',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  })?.mode, 'simpler');
  assert.equal(searchParakhCostAccountingKnowledge({
    message: 'Material cost पर सवाल पूछो',
    course: 'CA_INTERMEDIATE',
    language: 'hindi',
  })?.mode, 'quiz');
});

test('keeps attempt-sensitive law or syllabus checks away from evergreen notes', () => {
  for (const message of [
    'Is this applicable for May 2027?',
    'What are the latest syllabus changes?',
    'Any amendment to marginal costing?',
  ]) {
    assert.equal(searchParakhCostAccountingKnowledge({
      message,
      course: 'CA_INTERMEDIATE',
      language: 'english',
    }), null, message);
  }
});

test('cost sheet calculator reconciles the original worked illustration', () => {
  const totals = calculateCostSheetTotals({
    directMaterialConsumed: 50000,
    directLabour: 20000,
    directExpenses: 5000,
    factoryOverheads: 15000,
    openingWorkInProgress: 4000,
    closingWorkInProgress: 3000,
    productionAdministrationOverheads: 9000,
    openingFinishedGoods: 8000,
    closingFinishedGoods: 10000,
    sellingDistributionOverheads: 7000,
  });
  assert.deepEqual(totals, {
    primeCost: 75000,
    worksCost: 91000,
    costOfProduction: 100000,
    costOfGoodsSold: 98000,
    costOfSales: 105000,
  });
  assert.throws(() => calculateCostSheetTotals({
    directMaterialConsumed: -1,
    directLabour: 1,
    directExpenses: 1,
    factoryOverheads: 1,
  }), /finite, non-negative/);
});

test('defines five separate benchmark families per chapter', () => {
  assert.equal(PARAKH_COST_BENCHMARKS.length, 75);
  for (let chapter = 1; chapter <= 15; chapter += 1) {
    const prompts = PARAKH_COST_BENCHMARKS.filter((item) => item.chapterNumber === chapter);
    assert.equal(prompts.length, 5);
    assert.equal(new Set(prompts.map((item) => item.family)).size, 5);
    assert.equal(new Set(prompts.map((item) => item.question)).size, 5);
  }
});

test('links official ICAI material and discloses draft status', () => {
  const result = searchParakhCostAccountingKnowledge({
    message: 'Explain cost sheet',
    course: 'CA_INTERMEDIATE',
    language: 'hinglish',
  })!;
  assert.equal(result.source.url, 'https://icai.org/post/24297');
  assert.match(result.syllabusApplicability, /May 2027 Exam Onwards/);
  const reply = buildParakhCostAccountingReply(result, 'hinglish');
  assert.match(reply, /original PARAKH author draft/i);
  assert.match(reply, /qualified CA cost-accounting reviewer/i);
});
