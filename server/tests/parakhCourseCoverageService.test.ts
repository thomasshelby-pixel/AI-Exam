import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildParakhCourseCoverageNotice,
  getParakhCourseCoverageInventory,
  resolveParakhCoursePaperContext,
} from '../services/parakhCourseCoverageService.js';

test('maps every ICAI New Scheme course track and all 32 paper/module entries', () => {
  const inventory = getParakhCourseCoverageInventory();
  assert.equal(inventory.courseCount, 4);
  assert.equal(inventory.paperCount, 32);
  assert.equal(inventory.courses.length, 4);
  assert.deepEqual(inventory.courses.map((course) => course.course), [
    'CA_FOUNDATION', 'CA_INTERMEDIATE', 'CA_FINAL', 'SPOM',
  ]);
  assert.equal(inventory.courses.find((course) => course.course === 'CA_FOUNDATION')?.paperCount, 4);
  assert.equal(inventory.courses.find((course) => course.course === 'CA_INTERMEDIATE')?.paperCount, 6);
  assert.equal(inventory.courses.find((course) => course.course === 'CA_FINAL')?.paperCount, 6);
  assert.equal(inventory.courses.find((course) => course.course === 'SPOM')?.paperCount, 16);
  assert.equal(inventory.status, 'PAPER_MAP_COMPLETE_CONTENT_COVERAGE_INCOMPLETE');
});

test('keeps original FM chapter drafts distinct from mapped-only subjects and unreviewed benchmarks', () => {
  const inventory = getParakhCourseCoverageInventory();
  const intermediate = inventory.courses.find((course) => course.course === 'CA_INTERMEDIATE')!;
  assert.equal(intermediate.authoredChapterCount, 94);
  assert.equal(intermediate.benchmarkPromptCount, 470);
  const advancedAccounting = intermediate.papers.find((paper) => paper.code === 'INT-G1-P1')!;
  assert.equal(advancedAccounting.mappingStatus, 'OFFICIAL_CHAPTER_CATALOGUE_LINKED');
  assert.equal(advancedAccounting.indexEntries.length, 15);
  assert.equal(advancedAccounting.authoredChapterCount, 15);
  assert.equal(advancedAccounting.benchmarkPromptCount, 75);
  const fm = intermediate
    .papers.find((paper) => paper.code === 'INT-G2-P6')!;
  const foundation = inventory.courses.find((course) => course.course === 'CA_FOUNDATION')!;
  const foundationAccounting = foundation.papers.find((paper) => paper.code === 'FND-P1')!;
  assert.equal(foundationAccounting.mappingStatus, 'OFFICIAL_CHAPTER_CATALOGUE_LINKED');
  assert.equal(foundationAccounting.indexEntries.length, 11);
  assert.equal(foundationAccounting.authoredChapterCount, 11);
  assert.equal(foundationAccounting.benchmarkPromptCount, 55);
  const foundationLaws = foundation.papers.find((paper) => paper.code === 'FND-P2')!;
  assert.equal(foundationLaws.mappingStatus, 'OFFICIAL_CHAPTER_CATALOGUE_LINKED');
  assert.equal(foundationLaws.indexEntries.length, 7);
  assert.equal(foundationLaws.authoredChapterCount, 7);
  assert.equal(foundationLaws.benchmarkPromptCount, 35);
  const foundationQa = foundation.papers.find((paper) => paper.code === 'FND-P3')!;
  assert.equal(foundationQa.mappingStatus, 'OFFICIAL_CHAPTER_CATALOGUE_LINKED');
  assert.equal(foundationQa.indexEntries.length, 18);
  assert.equal(foundationQa.authoredChapterCount, 18);
  assert.equal(foundationQa.benchmarkPromptCount, 90);
  const foundationEconomics = foundation.papers.find((paper) => paper.code === 'FND-P4')!;
  assert.equal(foundationEconomics.mappingStatus, 'OFFICIAL_CHAPTER_CATALOGUE_LINKED');
  assert.equal(foundationEconomics.indexEntries.length, 10);
  assert.equal(foundationEconomics.authoredChapterCount, 10);
  assert.equal(foundationEconomics.benchmarkPromptCount, 50);
  const corporateLaw = intermediate.papers.find((paper) => paper.code === 'INT-G1-P2')!;
  assert.equal(corporateLaw.mappingStatus, 'OFFICIAL_CHAPTER_CATALOGUE_LINKED');
  assert.equal(corporateLaw.indexEntries.length, 15);
  assert.equal(corporateLaw.authoredChapterCount, 15);
  assert.equal(corporateLaw.benchmarkPromptCount, 75);
  assert.ok(corporateLaw.indexEntries.some((entry) => entry.title === 'The Foreign Exchange Management Act, 1999'));
  const taxation = intermediate.papers.find((paper) => paper.code === 'INT-G1-P3')!;
  assert.equal(taxation.mappingStatus, 'OFFICIAL_CHAPTER_CATALOGUE_LINKED');
  assert.equal(taxation.indexEntries.length, 24);
  assert.equal(taxation.authoredChapterCount, 24);
  assert.equal(taxation.benchmarkPromptCount, 120);
  assert.equal(taxation.indexEntries.filter((entry) => entry.section === 'Section A: Income-tax Law').length, 9);
  assert.equal(taxation.indexEntries.filter((entry) => entry.section === 'Section B: Goods and Services Tax').length, 15);
  assert.ok(taxation.indexEntries.every((entry) => entry.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED'));
  assert.ok(taxation.indexEntries.every((entry) => entry.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED'));
  const final = inventory.courses.find((course) => course.course === 'CA_FINAL')!;
  const spom = inventory.courses.find((course) => course.course === 'SPOM')!;

  assert.equal(inventory.authoredChapterCount, 140);
  assert.equal(inventory.humanReviewedChapterCount, 0);
  assert.equal(inventory.benchmarkPromptCount, 700);
  assert.equal(foundation.authoredChapterCount, 46);
  assert.equal(foundation.benchmarkPromptCount, 230);
  assert.equal(inventory.humanReviewedBenchmarkCount, 0);
  assert.equal(fm.indexKind, 'chapter');
  assert.equal(fm.indexEntries.filter((entry) => entry.section === 'Section A: Financial Management' && entry.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED').length, 9);
  assert.equal(fm.indexEntries.filter((entry) => entry.section === 'Section A: Financial Management' && entry.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED').length, 9);
  assert.equal(fm.indexEntries.filter((entry) => entry.section === 'Section B: Strategic Management' && entry.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED').length, 5);
  assert.equal(fm.indexEntries.filter((entry) => entry.section === 'Section B: Strategic Management' && entry.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED').length, 5);
  assert.ok(fm.indexEntries.some((entry) => entry.section === 'Section B: Strategic Management' && entry.title === 'Strategic Analysis: Internal Environment' && entry.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED'));
  assert.ok(foundation.papers.filter((paper) => !['FND-P1', 'FND-P2', 'FND-P3', 'FND-P4'].includes(paper.code)).every((paper) => paper.authoredChapterCount === 0));
  assert.ok(final.papers.every((paper) => paper.indexKind === 'topic' || paper.indexKind === 'none'));
  assert.ok(final.papers.every((paper) => paper.mappingStatus === 'PROVISIONAL_TOPIC_INDEX_NOT_OFFICIAL_CHAPTERS'));
  assert.ok(spom.papers.every((paper) => paper.indexKind === 'none' && paper.indexEntries.length === 0));
  const costing = inventory.courses.find((course) => course.course === 'CA_INTERMEDIATE')!
    .papers.find((paper) => paper.code === 'INT-G2-P4')!;
  assert.equal(costing.mappingStatus, 'OFFICIAL_CHAPTER_CATALOGUE_LINKED');
  assert.equal(costing.indexEntries.length, 15);
  assert.equal(costing.authoredChapterCount, 15);
  assert.equal(costing.benchmarkPromptCount, 75);
  assert.ok(costing.indexEntries.every((entry) => entry.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED'));
  const auditing = inventory.courses.find((course) => course.course === 'CA_INTERMEDIATE')!
    .papers.find((paper) => paper.code === 'INT-G2-P5')!;
  assert.equal(auditing.mappingStatus, 'OFFICIAL_CHAPTER_CATALOGUE_LINKED');
  assert.equal(auditing.indexEntries.length, 11);
  assert.equal(auditing.authoredChapterCount, 11);
  assert.equal(auditing.benchmarkPromptCount, 55);
  assert.ok(auditing.indexEntries.every((entry) => entry.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED'));
});

test('does not present topic metadata as official chapter titles or SPOM module content', () => {
  const inventory = getParakhCourseCoverageInventory();
  const finalAfm = inventory.courses.find((course) => course.course === 'CA_FINAL')!
    .papers.find((paper) => paper.code === 'FIN-G1-P2')!;
  const spomA = inventory.courses.find((course) => course.course === 'SPOM')!
    .papers.find((paper) => paper.code === 'SPOM-A')!;
  assert.equal(finalAfm.indexKind, 'topic');
  assert.match(finalAfm.note, /not official ICAI chapter titles/i);
  assert.equal(spomA.indexKind, 'none');
  assert.match(spomA.note, /chapter\/unit contents have not yet been indexed/i);
});

test('resolves a paper using the authenticated course context, without cross-course leakage', () => {
  assert.equal(resolveParakhCoursePaperContext({
    course: 'CA_FOUNDATION',
    message: 'Explain Accounting',
  })?.paperCode, 'FND-P1');
  const foundationAccounting = resolveParakhCoursePaperContext({
    course: 'CA_FOUNDATION',
    message: 'Explain depreciation and amortisation',
  });
  assert.equal(foundationAccounting?.paperCode, 'FND-P1');
  assert.equal(foundationAccounting?.matchedIndexEntry, 'Depreciation and Amortisation');
  assert.equal(foundationAccounting?.authoredChapterCount, 11);
  assert.equal(foundationAccounting?.benchmarkPromptCount, 55);
  assert.equal(foundationAccounting?.sourceUrl, 'https://www.icai.org/post/24417');
  const foundationLaw = resolveParakhCoursePaperContext({
    course: 'CA_FOUNDATION',
    message: 'Explain Indian Contract Act and consideration',
  });
  assert.equal(foundationLaw?.paperCode, 'FND-P2');
  assert.equal(foundationLaw?.matchedIndexEntry, 'The Indian Contract Act, 1872');
  assert.equal(foundationLaw?.authoredChapterCount, 7);
  assert.equal(foundationLaw?.benchmarkPromptCount, 35);
  assert.equal(foundationLaw?.sourceUrl, 'https://www.icai.org/post/24381');
  const foundationQa = resolveParakhCoursePaperContext({
    course: 'CA_FOUNDATION',
    message: 'Explain probability and theoretical distributions',
  });
  assert.equal(foundationQa?.paperCode, 'FND-P3');
  assert.equal(foundationQa?.matchedIndexEntry, 'Probability');
  assert.equal(foundationQa?.authoredChapterCount, 18);
  assert.equal(foundationQa?.benchmarkPromptCount, 90);
  assert.equal(foundationQa?.sourceUrl, 'https://www.icai.org/post/24402');
  const foundationEconomics = resolveParakhCoursePaperContext({
    course: 'CA_FOUNDATION',
    message: 'Explain demand and supply elasticity',
  });
  assert.equal(foundationEconomics?.paperCode, 'FND-P4');
  assert.equal(foundationEconomics?.matchedIndexEntry, 'Theory of Demand and Supply');
  assert.equal(foundationEconomics?.authoredChapterCount, 10);
  assert.equal(foundationEconomics?.benchmarkPromptCount, 50);
  assert.equal(foundationEconomics?.sourceUrl, 'https://www.icai.org/post/24403');

  const advancedAccounting = resolveParakhCoursePaperContext({
    course: 'CA_INTERMEDIATE',
    message: 'Explain amalgamation of companies',
  });
  assert.equal(advancedAccounting?.paperCode, 'INT-G1-P1');
  assert.equal(advancedAccounting?.matchedIndexEntry, 'Amalgamation of Companies');
  assert.equal(advancedAccounting?.authoredChapterCount, 15);
  assert.equal(advancedAccounting?.benchmarkPromptCount, 75);
  assert.equal(advancedAccounting?.sourceUrl, 'https://www.icai.org/post/24303');

  assert.equal(resolveParakhCoursePaperContext({
    course: 'CA_INTERMEDIATE',
    message: 'Explain GST input tax credit',
  })?.paperCode, 'INT-G1-P3');
  const corporateLawContext = resolveParakhCoursePaperContext({
    course: 'CA_INTERMEDIATE',
    message: 'Explain incorporation of company',
  });
  assert.equal(corporateLawContext?.paperCode, 'INT-G1-P2');
  assert.equal(corporateLawContext?.matchedIndexEntry, 'Incorporation of Company and Matters Incidental Thereto');
  assert.equal(corporateLawContext?.authoredChapterCount, 15);
  assert.equal(corporateLawContext?.benchmarkPromptCount, 75);
  assert.equal(corporateLawContext?.sourceUrl, 'https://www.icai.org/post/24331');
  const incomeTaxContext = resolveParakhCoursePaperContext({
    course: 'CA_INTERMEDIATE',
    message: 'Explain residential status and scope of total income',
  });
  assert.equal(incomeTaxContext?.paperCode, 'INT-G1-P3');
  assert.equal(incomeTaxContext?.matchedIndexEntry, 'Residential Status and Scope of Total Income');
  assert.equal(incomeTaxContext?.section, 'Section A: Income-tax Law');
  assert.equal(incomeTaxContext?.sourceUrl, 'https://www.icai.org/post/24313');
  assert.equal(incomeTaxContext?.benchmarkPromptCount, 45);
  const gstContext = resolveParakhCoursePaperContext({
    course: 'CA_INTERMEDIATE',
    message: 'Explain input tax credit',
  });
  assert.equal(gstContext?.paperCode, 'INT-G1-P3');
  assert.equal(gstContext?.matchedIndexEntry, 'Input Tax Credit');
  assert.equal(gstContext?.section, 'Section B: Goods and Services Tax');
  assert.equal(gstContext?.sourceUrl, 'https://www.icai.org/post/24360');
  assert.equal(gstContext?.benchmarkPromptCount, 75);
  assert.equal(resolveParakhCoursePaperContext({
    course: 'CA_INTERMEDIATE',
    message: 'Explain cost sheet and material cost',
  })?.paperCode, 'INT-G2-P4');
  assert.equal(resolveParakhCoursePaperContext({
    course: 'CA_INTERMEDIATE',
    message: 'Explain audit evidence and audit report',
  })?.paperCode, 'INT-G2-P5');

  assert.equal(resolveParakhCoursePaperContext({
    course: 'CA_FINAL',
    message: 'Explain Financial Reporting',
  })?.paperCode, 'FIN-G1-P1');

  assert.equal(resolveParakhCoursePaperContext({
    course: 'CA_FINAL',
    message: 'Explain SPOM Set A',
  })?.paperCode, 'SPOM-A');
  assert.equal(resolveParakhCoursePaperContext({
    course: 'CA_FINAL',
    message: 'Explain SPOM forensic accounting',
  })?.paperCode, 'SPOM-C7');

  assert.equal(resolveParakhCoursePaperContext({
    course: 'CA_FINAL',
    message: 'Explain Intermediate taxation',
  }), null);
});

test('resolves FM chapter context and returns section-level status for Strategic Management', () => {
  const fm = resolveParakhCoursePaperContext({
    course: 'CA_INTERMEDIATE',
    message: 'Explain investment decisions',
  });
  assert.equal(fm?.paperCode, 'INT-G2-P6');
  assert.equal(fm?.matchedIndexEntry, 'Investment Decisions');
  assert.equal(fm?.section, 'Section A: Financial Management');
  assert.equal(fm?.authoredChapterCount, 14);
  assert.equal(fm?.benchmarkPromptCount, 70);

  const sm = resolveParakhCoursePaperContext({
    course: 'CA_INTERMEDIATE',
    message: 'Explain Strategic Management',
  });
  assert.equal(sm?.paperCode, 'INT-G2-P6');
  assert.equal(sm?.section, 'Section B: Strategic Management');
  assert.equal(sm?.sourceUrl, 'https://www.icai.org/post/sm-inter-p6b-may2027');
  assert.equal(resolveParakhCoursePaperContext({
    course: 'CA_INTERMEDIATE',
    message: 'Explain Strategic Management',
  })?.section, 'Section B: Strategic Management');
  assert.equal(resolveParakhCoursePaperContext({
    course: 'CA_INTERMEDIATE',
    message: 'Explain Financial Management',
  })?.section, 'Section A: Financial Management');
  assert.equal(sm?.humanReviewedChapterCount, 0);
  assert.equal(sm?.authoredChapterCount, 14);
  assert.equal(sm?.benchmarkPromptCount, 70);
  assert.equal(sm?.sourceUrl, 'https://www.icai.org/post/sm-inter-p6b-may2027');
  const costing = resolveParakhCoursePaperContext({
    course: 'CA_INTERMEDIATE',
    message: 'Explain cost sheet',
  });
  assert.equal(costing?.paperCode, 'INT-G2-P4');
  assert.equal(costing?.matchedIndexEntry, 'Cost Sheet');
  assert.equal(costing?.authoredChapterCount, 15);
  assert.equal(costing?.benchmarkPromptCount, 75);
  assert.equal(costing?.sourceUrl, 'https://icai.org/post/24297');
  const auditing = resolveParakhCoursePaperContext({
    course: 'CA_INTERMEDIATE',
    message: 'Explain audit documentation',
  });
  assert.equal(auditing?.paperCode, 'INT-G2-P5');
  assert.equal(auditing?.matchedIndexEntry, 'Audit Documentation');
  assert.equal(auditing?.authoredChapterCount, 11);
  assert.equal(auditing?.benchmarkPromptCount, 55);
  assert.equal(auditing?.sourceUrl, 'https://www.icai.org/post/sm-inter-p5-may2027');
});

test('creates language-specific and honest coverage notices for mapped-only papers', () => {
  const context = resolveParakhCoursePaperContext({
    course: 'CA_FINAL',
    message: 'Explain Advanced Financial Management',
  })!;
  const english = buildParakhCourseCoverageNotice(context, 'english');
  const hindi = buildParakhCourseCoverageNotice(context, 'hindi');
  const hinglish = buildParakhCourseCoverageNotice(context, 'hinglish');
  assert.match(english, /provisional topic pointers/i);
  assert.match(english, /not official chapter titles/i);
  assert.match(english, /human-reviewed benchmark/i);
  assert.match(hindi, /provisional topic pointers/);
  assert.match(hinglish, /dedicated PARAKH lesson/i);
  assert.equal(buildParakhCourseCoverageNotice({
    ...context,
    mappingStatus: 'OFFICIAL_CHAPTER_CATALOGUE_LINKED',
    section: 'Section A: Financial Management',
  }, 'english'), '');
});
