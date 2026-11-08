import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildParakhFoundationBusinessEconomicsReply,
  getParakhFoundationBusinessEconomicsInventory,
  PARAKH_FOUNDATION_ECONOMICS_BENCHMARKS,
  searchParakhFoundationBusinessEconomicsKnowledge,
} from '../services/parakhFoundationBusinessEconomicsKnowledgeService.js';

test('provides original drafts for all 10 official Foundation Economics chapters',()=>{
  const inventory=getParakhFoundationBusinessEconomicsInventory();
  assert.equal(inventory.chapterCount,10);
  assert.equal(inventory.authoredContentCount,10);
  assert.equal(inventory.humanReviewedContentCount,0);
  assert.equal(inventory.benchmarkCaseCount,50);
  assert.equal(inventory.humanReviewedBenchmarkCount,0);
  assert.deepEqual(inventory.chapters.map(x=>x.title),[
    'Nature & Scope of Business Economics',
    'Theory of Demand and Supply',
    'Theory of Production and Cost',
    'Price Determination in Different Markets',
    'Determination of National Income',
    'Business Cycles',
    'Public Finance',
    'Money Market',
    'International Trade',
    'Indian Economy',
  ]);
  assert.ok(inventory.chapters.every(x=>x.contentStatus==='AUTHOR_DRAFT_NOT_HUMAN_VERIFIED'));
});

test('retrieves all ten chapters for Foundation Paper 4 only',()=>{
  const queries=[
    ['Explain nature and scope of business economics and opportunity cost',1],
    ['Explain theory of demand and supply and elasticity',2],
    ['Explain theory of production and cost',3],
    ['Explain price determination in perfect competition and monopoly',4],
    ['Explain determination of national income and multiplier',5],
    ['Explain business cycles',6],
    ['Explain public finance and fiscal functions',7],
    ['Explain money market and monetary policy',8],
    ['Explain international trade and comparative advantage',9],
    ['Explain Indian economy and structural transformation',10],
  ] as const;
  for(const [message,chapter] of queries){
    const result=searchParakhFoundationBusinessEconomicsKnowledge({message,course:'CA_FOUNDATION',language:'english'});
    assert.equal(result?.chapterNumber,chapter,message);
    assert.equal(result?.paperCode,'FND-P4');
    assert.equal(result?.contentReviewStatus,'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED');
    assert.equal(result?.benchmarkStatus,'PROMPTS_DEFINED_NOT_EVALUATED');
  }
  assert.equal(searchParakhFoundationBusinessEconomicsKnowledge({
    message:'Explain demand and supply',course:'CA_INTERMEDIATE',language:'english'
  }),null);
});

test('supports multilingual explanation and four teaching modes',()=>{
  const cases=[
    {message:'Explain opportunity cost',language:'english' as const},
    {message:'Demand elasticity ko simple language mein samjhao',language:'hinglish' as const},
    {message:'अंतरराष्ट्रीय व्यापार का उदाहरण दीजिए',language:'hindi' as const},
    {message:'Quiz me on public finance',language:'english' as const},
  ];
  for(const item of cases){
    const result=searchParakhFoundationBusinessEconomicsKnowledge({message:item.message,course:'CA_FOUNDATION',language:item.language});
    assert.ok(result);
    assert.ok(result.answer.length>160);
  }
  assert.equal(searchParakhFoundationBusinessEconomicsKnowledge({
    message:'Explain business cycles example',course:'CA_FOUNDATION',language:'english'
  })?.mode,'example');
  assert.equal(searchParakhFoundationBusinessEconomicsKnowledge({
    message:'Explain public finance in simple words',course:'CA_FOUNDATION',language:'english'
  })?.mode,'simpler');
  assert.equal(searchParakhFoundationBusinessEconomicsKnowledge({
    message:'Money market पर सवाल पूछो',course:'CA_FOUNDATION',language:'hindi'
  })?.mode,'quiz');
});

test('routes current Indian economic data and policy-rate queries away from evergreen notes',()=>{
  for(const message of [
    'What is the latest GDP growth rate in India?',
    'What is current inflation rate?',
    'What is the RBI repo rate now?',
    'What are the latest budget figures?',
    'Give current unemployment data for India',
  ]){
    assert.equal(searchParakhFoundationBusinessEconomicsKnowledge({
      message,course:'CA_FOUNDATION',language:'english'
    }),null,message);
  }
});

test('links the ICAI source and states unreviewed content boundary',()=>{
  const result=searchParakhFoundationBusinessEconomicsKnowledge({
    message:'Explain business cycles',course:'CA_FOUNDATION',language:'hinglish'
  })!;
  assert.equal(result.source.url,'https://www.icai.org/post/sm-foundation-p4-may2027');
  assert.match(result.syllabusApplicability,/Relevant for May 2027 and Onwards/);
  const reply=buildParakhFoundationBusinessEconomicsReply(result,'hinglish');
  assert.match(reply,/original PARAKH author draft/i);
  assert.match(reply,/dated official sources/i);
});

test('defines five benchmark families for all ten chapters',()=>{
  assert.equal(PARAKH_FOUNDATION_ECONOMICS_BENCHMARKS.length,50);
  for(let chapter=1;chapter<=10;chapter++){
    const prompts=PARAKH_FOUNDATION_ECONOMICS_BENCHMARKS.filter(x=>x.chapterNumber===chapter);
    assert.equal(prompts.length,5);
    assert.equal(new Set(prompts.map(x=>x.family)).size,5);
    assert.equal(new Set(prompts.map(x=>x.question)).size,5);
  }
});
