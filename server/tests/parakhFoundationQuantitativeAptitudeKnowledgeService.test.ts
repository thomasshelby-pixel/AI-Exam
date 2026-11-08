import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildParakhFoundationQuantitativeAptitudeReply,
  getParakhFoundationQuantitativeAptitudeInventory,
  PARAKH_FOUNDATION_QA_BENCHMARKS,
  searchParakhFoundationQuantitativeAptitudeKnowledge,
} from '../services/parakhFoundationQuantitativeAptitudeKnowledgeService.js';

test('provides all 18 official Paper 3 chapters across three parts', () => {
  const inventory=getParakhFoundationQuantitativeAptitudeInventory();
  assert.equal(inventory.chapterCount,18);
  assert.equal(inventory.authoredContentCount,18);
  assert.equal(inventory.humanReviewedContentCount,0);
  assert.equal(inventory.benchmarkCaseCount,90);
  assert.equal(inventory.humanReviewedBenchmarkCount,0);
  assert.deepEqual(inventory.chapters.find((chapter) => chapter.chapterNumber === 13)?.units, ['Unit II: Sampling']);
  assert.equal(inventory.chapters.filter(x=>x.module==='Business Mathematics').length,8);
  assert.equal(inventory.chapters.filter(x=>x.module==='Logical Reasoning').length,4);
  assert.equal(inventory.chapters.filter(x=>x.module==='Statistics').length,6);
  assert.ok(inventory.chapters.every(x=>x.contentStatus==='AUTHOR_DRAFT_NOT_HUMAN_VERIFIED'));
});

test('retrieves every Foundation Quantitative Aptitude chapter',()=>{
  const queries=[
    ['Explain ratio and proportion, indices and logarithms',1],
    ['Explain equations',2],
    ['Explain linear inequalities',3],
    ['Explain mathematics of finance and compound interest',4],
    ['Explain permutations and combinations',5],
    ['Explain arithmetic progression and geometric progression',6],
    ['Explain sets relations and functions',7],
    ['Explain differentiation and integral calculus',8],
    ['Explain number series and coding and decoding',9],
    ['Explain direction sense test',10],
    ['Explain seating arrangements',11],
    ['Explain blood relations',12],
    ['Explain statistical description of data and sampling',13],
    ['Explain measures of central tendency and dispersion',14],
    ['Explain probability',15],
    ['Explain binomial and poisson theoretical distributions',16],
    ['Explain correlation and regression',17],
    ['Explain index numbers',18],
  ] as const;
  for(const [message,chapter] of queries){
    const result=searchParakhFoundationQuantitativeAptitudeKnowledge({message,course:'CA_FOUNDATION',language:'english'});
    assert.equal(result?.chapterNumber,chapter,message);
    assert.equal(result?.paperCode,'FND-P3');
    assert.equal(result?.contentReviewStatus,'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED');
    assert.equal(result?.benchmarkStatus,'PROMPTS_DEFINED_NOT_EVALUATED');
  }
  assert.equal(searchParakhFoundationQuantitativeAptitudeKnowledge({
    message:'Explain probability',course:'CA_INTERMEDIATE',language:'english'
  }),null);
});

test('supports multilingual content and learning modes',()=>{
  const cases=[
    {message:'Explain mathematics of finance',language:'english' as const},
    {message:'Probability ko simple language mein samjhao',language:'hinglish' as const},
    {message:'दिशा परीक्षण का उदाहरण दीजिए',language:'hindi' as const},
    {message:'Quiz me on correlation and regression',language:'english' as const},
  ];
  for(const item of cases){
    const result=searchParakhFoundationQuantitativeAptitudeKnowledge({message:item.message,course:'CA_FOUNDATION',language:item.language});
    assert.ok(result);
    assert.ok(result.answer.length>160);
  }
  assert.equal(searchParakhFoundationQuantitativeAptitudeKnowledge({
    message:'Explain AP example',course:'CA_FOUNDATION',language:'english'
  })?.mode,'example');
  assert.equal(searchParakhFoundationQuantitativeAptitudeKnowledge({
    message:'Explain probability in simple words',course:'CA_FOUNDATION',language:'english'
  })?.mode,'simpler');
  assert.equal(searchParakhFoundationQuantitativeAptitudeKnowledge({
    message:'Index numbers पर सवाल पूछो',course:'CA_FOUNDATION',language:'hindi'
  })?.mode,'quiz');
});

test('routes exact-attempt and corrigendum queries away from evergreen notes',()=>{
  for(const message of [
    'What is the latest exam pattern?',
    'Is this applicable for May 2027?',
    'What is the latest syllabus corrigendum?',
  ]){
    assert.equal(searchParakhFoundationQuantitativeAptitudeKnowledge({
      message,course:'CA_FOUNDATION',language:'english'
    }),null,message);
  }
});

test('links official ICAI source and discloses draft status',()=>{
  const result=searchParakhFoundationQuantitativeAptitudeKnowledge({
    message:'Explain mathematics of finance',course:'CA_FOUNDATION',language:'hinglish'
  })!;
  assert.equal(result.source.url,'https://www.icai.org/post/24402');
  assert.match(result.syllabusApplicability,/Relevant for May 2027 and Onwards/);
  const reply=buildParakhFoundationQuantitativeAptitudeReply(result,'hinglish');
  assert.match(reply,/original PARAKH draft/i);
  assert.match(reply,/not verified by a qualified mathematics\/statistics academic reviewer/i);
});

test('defines five benchmark families per each of 18 chapters',()=>{
  assert.equal(PARAKH_FOUNDATION_QA_BENCHMARKS.length,90);
  for(let chapter=1;chapter<=18;chapter++){
    const prompts=PARAKH_FOUNDATION_QA_BENCHMARKS.filter(x=>x.chapterNumber===chapter);
    assert.equal(prompts.length,5);
    assert.equal(new Set(prompts.map(x=>x.family)).size,5);
    assert.equal(new Set(prompts.map(x=>x.question)).size,5);
  }
});
