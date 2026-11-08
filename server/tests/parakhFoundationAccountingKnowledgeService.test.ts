import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildParakhFoundationAccountingReply,
  getParakhFoundationAccountingInventory,
  PARAKH_FOUNDATION_ACCOUNTING_BENCHMARKS,
  reconcileBankStatementFromCashBook,
  searchParakhFoundationAccountingKnowledge,
} from '../services/parakhFoundationAccountingKnowledgeService.js';

test('provides original Foundation Accounting drafts for all 11 official May 2027 catalogue chapters', () => {
  const inventory = getParakhFoundationAccountingInventory();
  assert.equal(inventory.chapterCount, 11);
  assert.equal(inventory.authoredContentCount, 11);
  assert.equal(inventory.humanReviewedContentCount, 0);
  assert.equal(inventory.benchmarkCaseCount, 55);
  assert.equal(inventory.humanReviewedBenchmarkCount, 0);
  assert.deepEqual(inventory.chapters.map((item) => item.title), [
    'Theoretical Framework',
    'Accounting Process',
    'Bank Reconciliation Statement',
    'Inventories',
    'Depreciation and Amortisation',
    'Bills of Exchange and Promissory Notes',
    'Preparation of Final Accounts of Sole Proprietors',
    'Financial Statements of Not-for-Profit Organisations',
    'Accounts from Incomplete Records',
    'Partnership and LLP Accounts',
    'Company Accounts',
  ]);
  assert.ok(inventory.chapters.every((item) => item.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED'));
  assert.ok(inventory.chapters.every((item) => item.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED'));
});

test('retrieves every Foundation Accounting chapter only for CA Foundation', () => {
  const queries = [
    ['Explain accounting concepts and conventions', 1],
    ['Explain journal entries, ledger and trial balance', 2],
    ['Explain bank reconciliation statement', 3],
    ['Explain inventory valuation and NRV', 4],
    ['Explain depreciation and amortisation', 5],
    ['Explain bills of exchange and dishonour', 6],
    ['Explain final accounts of sole proprietors', 7],
    ['Explain receipts and payments versus income and expenditure', 8],
    ['Explain incomplete records and statement of affairs', 9],
    ['Explain partnership admission and sacrificing ratio', 10],
    ['Explain forfeiture and reissue of shares', 11],
  ] as const;
  for (const [message, chapterNumber] of queries) {
    const result = searchParakhFoundationAccountingKnowledge({
      message,
      course: 'CA_FOUNDATION',
      language: 'english',
    });
    assert.equal(result?.chapterNumber, chapterNumber, message);
    assert.equal(result?.paperCode, 'FND-P1');
    assert.equal(result?.section, 'Accounting');
    assert.equal(result?.contentReviewStatus, 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED');
    assert.equal(result?.benchmarkStatus, 'PROMPTS_DEFINED_NOT_EVALUATED');
  }
  assert.equal(searchParakhFoundationAccountingKnowledge({
    message: 'Explain bank reconciliation statement',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  }), null);
});

test('supports multilingual answers and example, simpler and quiz modes', () => {
  const examples = [
    { message: 'Explain accounting concepts', language: 'english' as const, mode: 'answer' as const, minimumLength: 160 },
    { message: 'BRS ko simple language mein samjhao', language: 'hinglish' as const, mode: 'simpler' as const, minimumLength: 50 },
    { message: 'मूल्यह्रास का उदाहरण दीजिए', language: 'hindi' as const, mode: 'example' as const, minimumLength: 60 },
    { message: 'Quiz me on inventory valuation', language: 'english' as const, mode: 'quiz' as const, minimumLength: 50 },
  ];
  for (const item of examples) {
    const result = searchParakhFoundationAccountingKnowledge({
      message: item.message,
      course: 'CA_FOUNDATION',
      language: item.language,
    });
    assert.ok(result);
    assert.equal(result.mode, item.mode, item.message);
    assert.ok(result.answer.length > item.minimumLength, item.message);
  }
  assert.equal(searchParakhFoundationAccountingKnowledge({
    message: 'Explain depreciation example',
    course: 'CA_FOUNDATION',
    language: 'english',
  })?.mode, 'example');
  assert.equal(searchParakhFoundationAccountingKnowledge({
    message: 'Explain journal in simple words',
    course: 'CA_FOUNDATION',
    language: 'english',
  })?.mode, 'simpler');
  assert.equal(searchParakhFoundationAccountingKnowledge({
    message: 'Inventory पर सवाल पूछो',
    course: 'CA_FOUNDATION',
    language: 'hindi',
  })?.mode, 'quiz');
});

test('keeps current standard, corrigendum and attempt-sensitivity away from evergreen drafts', () => {
  for (const message of [
    'Is this applicable for May 2027?',
    'What is the current accounting standard treatment?',
    'Any latest corrigendum to Foundation Accounting?',
    'What are the latest syllabus changes?',
  ]) {
    assert.equal(searchParakhFoundationAccountingKnowledge({
      message,
      course: 'CA_FOUNDATION',
      language: 'english',
    }), null, message);
  }
});

test('BRS helper applies signed-balance direction from cash book to bank statement', () => {
  assert.equal(reconcileBankStatementFromCashBook({
    cashBookBalance: 20000,
    chequesIssuedNotPresented: 5000,
    depositsNotCredited: 3000,
    bankChargesNotRecorded: 500,
  }), 21500);

  assert.equal(reconcileBankStatementFromCashBook({
    cashBookBalance: -10000,
    chequesIssuedNotPresented: 1000,
    depositsNotCredited: 2500,
  }), -11500);

  assert.throws(() => reconcileBankStatementFromCashBook({
    cashBookBalance: Number.NaN,
  }), /finite numbers/);
});

test('defines five distinct benchmark families per Foundation chapter', () => {
  assert.equal(PARAKH_FOUNDATION_ACCOUNTING_BENCHMARKS.length, 55);
  for (let chapter = 1; chapter <= 11; chapter += 1) {
    const prompts = PARAKH_FOUNDATION_ACCOUNTING_BENCHMARKS.filter((item) => item.chapterNumber === chapter);
    assert.equal(prompts.length, 5);
    assert.equal(new Set(prompts.map((item) => item.family)).size, 5);
    assert.equal(new Set(prompts.map((item) => item.question)).size, 5);
  }
});

test('links ICAI Foundation Paper 1 and clearly discloses draft status', () => {
  const result = searchParakhFoundationAccountingKnowledge({
    message: 'Explain depreciation and amortisation',
    course: 'CA_FOUNDATION',
    language: 'hinglish',
  })!;
  assert.equal(result.source.url, 'https://www.icai.org/post/24417');
  assert.match(result.syllabusApplicability, /Relevant for May 2027 and Onwards/);
  const reply = buildParakhFoundationAccountingReply(result, 'hinglish');
  assert.match(reply, /original PARAKH author draft/i);
  assert.match(reply, /qualified CA Accounting reviewer/i);
});
