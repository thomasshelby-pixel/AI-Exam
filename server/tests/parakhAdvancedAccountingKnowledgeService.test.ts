import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildParakhAdvancedAccountingReply,
  getParakhAdvancedAccountingInventory,
  PARAKH_ADVANCED_ACCOUNTING_BENCHMARKS,
  searchParakhAdvancedAccountingKnowledge,
} from '../services/parakhAdvancedAccountingKnowledgeService.js';

test('provides original drafts for all 15 ICAI May 2027 Advanced Accounting chapters',()=>{
  const inventory=getParakhAdvancedAccountingInventory();
  assert.equal(inventory.chapterCount,15);
  assert.equal(inventory.authoredContentCount,15);
  assert.equal(inventory.humanReviewedContentCount,0);
  assert.equal(inventory.benchmarkCaseCount,75);
  assert.equal(inventory.humanReviewedBenchmarkCount,0);
  assert.deepEqual(inventory.chapters.map(x=>x.title),[
    'Introduction to Accounting Standards',
    'Framework for Preparation and Presentation of Financial Statements',
    'Applicability of Accounting Standards',
    'Presentation and Disclosures Based Accounting Standards',
    'Assets Based Accounting Standards',
    'Liabilities Based Accounting Standards',
    'Accounting Standards Based on Items Impacting Financial Statements',
    'Revenue Based Accounting Standards',
    'Other Accounting Standards',
    'Accounting Standards for Consolidated Financial Statements',
    'Financial Statements of Companies',
    'Buyback of Securities',
    'Amalgamation of Companies',
    'Internal Reconstruction',
    'Accounting for Branches including Foreign Branches',
  ]);
  assert.ok(inventory.chapters.every(x=>x.contentStatus==='AUTHOR_DRAFT_NOT_HUMAN_VERIFIED'));
  assert.ok(inventory.chapters.every(x=>x.benchmarkStatus==='PROMPTS_DEFINED_NOT_EVALUATED'));
});

test('retrieves every catalogue chapter for CA Intermediate Paper 1 only',()=>{
  const queries=[
    ['Explain introduction to accounting standards',1],
    ['Explain framework for preparation and presentation of financial statements',2],
    ['Explain applicability of accounting standards',3],
    ['Explain AS 3 cash flow statement disclosures',4],
    ['Explain AS 10 property plant equipment',5],
    ['Explain AS 29 provisions contingent liabilities contingent assets',6],
    ['Explain AS 22 accounting taxes on income',7],
    ['Explain AS 9 revenue recognition',8],
    ['Explain government grants accounting',9],
    ['Explain AS 21 consolidated financial statements',10],
    ['Explain financial statements of companies',11],
    ['Explain buyback of securities',12],
    ['Explain amalgamation of companies',13],
    ['Explain internal reconstruction',14],
    ['Explain accounting for branches including foreign branches',15],
  ] as const;
  for(const [message,chapterNumber] of queries){
    const result=searchParakhAdvancedAccountingKnowledge({message,course:'CA_INTERMEDIATE',language:'english'});
    assert.equal(result?.chapterNumber,chapterNumber,message);
    assert.equal(result?.paperCode,'INT-G1-P1');
    assert.equal(result?.contentReviewStatus,'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED');
    assert.equal(result?.benchmarkStatus,'PROMPTS_DEFINED_NOT_EVALUATED');
  }
  assert.equal(searchParakhAdvancedAccountingKnowledge({
    message:'Explain AS 2 valuation inventory',course:'CA_FOUNDATION',language:'english'
  }),null);
});

test('supports English, Hindi, Hinglish and all four learning modes',()=>{
  const cases=[
    {message:'Explain consolidation',language:'english' as const},
    {message:'Branch accounting ko simple language mein samjhao',language:'hinglish' as const},
    {message:'आंतरिक पुनर्गठन का उदाहरण दीजिए',language:'hindi' as const},
    {message:'Quiz me on buyback of securities',language:'english' as const},
  ];
  for(const item of cases){
    const result=searchParakhAdvancedAccountingKnowledge({message:item.message,course:'CA_INTERMEDIATE',language:item.language});
    assert.ok(result);
    assert.ok(result.answer.length>160);
  }
  assert.equal(searchParakhAdvancedAccountingKnowledge({
    message:'Explain buyback of securities example',course:'CA_INTERMEDIATE',language:'english'
  })?.mode,'example');
  assert.equal(searchParakhAdvancedAccountingKnowledge({
    message:'Explain branch accounting in simple words',course:'CA_INTERMEDIATE',language:'english'
  })?.mode,'simpler');
  assert.equal(searchParakhAdvancedAccountingKnowledge({
    message:'Accounting standards पर सवाल पूछो',course:'CA_INTERMEDIATE',language:'hindi'
  })?.mode,'quiz');
});

test('routes current standard, amendment and attempt-specific questions away from evergreen drafts',()=>{
  for(const message of [
    'Is this applicable for May 2027?',
    'What is the latest amendment to AS 10?',
    'Which current accounting standard applies?',
    'What are the latest syllabus exclusions?',
  ]){
    assert.equal(searchParakhAdvancedAccountingKnowledge({message,course:'CA_INTERMEDIATE',language:'english'}),null,message);
  }
});

test('links the official catalogue and clearly discloses unreviewed draft status',()=>{
  const result=searchParakhAdvancedAccountingKnowledge({
    message:'Explain amalgamation of companies',course:'CA_INTERMEDIATE',language:'hinglish'
  })!;
  assert.equal(result.source.url,'https://www.icai.org/post/24303');
  assert.match(result.syllabusApplicability,/May 2027 Exam Onwards/);
  const reply=buildParakhAdvancedAccountingReply(result,'hinglish');
  assert.match(reply,/original PARAKH author draft/i);
  assert.match(reply,/qualified Advanced Accounting reviewer/i);
  assert.match(reply,/applicable AS version/i);
});

test('defines five separate benchmark families for all 15 chapters',()=>{
  assert.equal(PARAKH_ADVANCED_ACCOUNTING_BENCHMARKS.length,75);
  for(let chapter=1;chapter<=15;chapter++){
    const prompts=PARAKH_ADVANCED_ACCOUNTING_BENCHMARKS.filter(x=>x.chapterNumber===chapter);
    assert.equal(prompts.length,5);
    assert.equal(new Set(prompts.map(x=>x.family)).size,5);
    assert.equal(new Set(prompts.map(x=>x.question)).size,5);
  }
});
