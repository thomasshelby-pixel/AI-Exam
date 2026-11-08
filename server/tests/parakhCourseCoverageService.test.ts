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
  const fm = inventory.courses.find((course) => course.course === 'CA_INTERMEDIATE')!
    .papers.find((paper) => paper.code === 'INT-G2-P6')!;
  const foundation = inventory.courses.find((course) => course.course === 'CA_FOUNDATION')!;
  const final = inventory.courses.find((course) => course.course === 'CA_FINAL')!;
  const spom = inventory.courses.find((course) => course.course === 'SPOM')!;

  assert.equal(inventory.authoredChapterCount, 14);
  assert.equal(inventory.humanReviewedChapterCount, 0);
  assert.equal(inventory.benchmarkPromptCount, 70);
  assert.equal(inventory.humanReviewedBenchmarkCount, 0);
  assert.equal(fm.indexKind, 'chapter');
  assert.equal(fm.indexEntries.filter((entry) => entry.section === 'Section A: Financial Management' && entry.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED').length, 9);
  assert.equal(fm.indexEntries.filter((entry) => entry.section === 'Section A: Financial Management' && entry.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED').length, 9);
  assert.equal(fm.indexEntries.filter((entry) => entry.section === 'Section B: Strategic Management' && entry.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED').length, 5);
  assert.equal(fm.indexEntries.filter((entry) => entry.section === 'Section B: Strategic Management' && entry.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED').length, 5);
  assert.ok(fm.indexEntries.some((entry) => entry.section === 'Section B: Strategic Management' && entry.title === 'Strategic Analysis: Internal Environment' && entry.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED'));
  assert.ok(foundation.papers.every((paper) => paper.authoredChapterCount === 0));
  assert.ok(final.papers.every((paper) => paper.indexKind === 'topic' || paper.indexKind === 'none'));
  assert.ok(final.papers.every((paper) => paper.mappingStatus === 'PROVISIONAL_TOPIC_INDEX_NOT_OFFICIAL_CHAPTERS'));
  assert.ok(spom.papers.every((paper) => paper.indexKind === 'none' && paper.indexEntries.length === 0));
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

  assert.equal(resolveParakhCoursePaperContext({
    course: 'CA_INTERMEDIATE',
    message: 'Explain GST input tax credit',
  })?.paperCode, 'INT-G1-P3');

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
