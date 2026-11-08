import { CA_CURRICULUM } from '../../src/data/caCurriculum.js';
import { getParakhCurriculumPapers, type ParakhCurriculumTrack } from './parakhCurriculumRegistry.js';
import { getPlannerSubjects } from './studyPlannerCurriculum.js';
import { getParakhChapterKnowledgeInventory } from './parakhChapterKnowledgeService.js';
import { getParakhStrategicManagementInventory } from './parakhStrategicManagementKnowledgeService.js';
import { getParakhCostAccountingInventory } from './parakhCostAccountingKnowledgeService.js';
import { getParakhAuditingInventory } from './parakhAuditingKnowledgeService.js';
import { getParakhFoundationAccountingInventory } from './parakhFoundationAccountingKnowledgeService.js';
import { getParakhFoundationBusinessLawInventory } from './parakhFoundationBusinessLawKnowledgeService.js';
import { getParakhFoundationQuantitativeAptitudeInventory } from './parakhFoundationQuantitativeAptitudeKnowledgeService.js';
import { getParakhFoundationBusinessEconomicsInventory } from './parakhFoundationBusinessEconomicsKnowledgeService.js';
import { getParakhAdvancedAccountingInventory } from './parakhAdvancedAccountingKnowledgeService.js';

export type ParakhCoverageLanguage = 'english' | 'hindi' | 'hinglish';

export type ParakhCoveragePaper = {
  course: ParakhCurriculumTrack;
  code: string;
  title: string;
  group: string | null;
  sections: string[];
  sourceUrl: string;
  mappingStatus:
    | 'OFFICIAL_CHAPTER_CATALOGUE_LINKED'
    | 'APP_CHAPTER_INDEX_NOT_ATTEMPT_VERIFIED'
    | 'PROVISIONAL_TOPIC_INDEX_NOT_OFFICIAL_CHAPTERS'
    | 'OFFICIAL_MODULE_MAPPED_CHAPTER_INDEX_PENDING';
  indexKind: 'chapter' | 'topic' | 'none';
  indexEntries: Array<{
    number: number;
    title: string;
    section: string | null;
    contentStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED' | 'MAPPED_ONLY';
    benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED' | 'NOT_CREATED';
  }>;
  authoredChapterCount: number;
  humanReviewedChapterCount: 0;
  benchmarkPromptCount: number;
  humanReviewedBenchmarkCount: 0;
  note: string;
};

export type ParakhCourseCoverageContext = {
  course: ParakhCurriculumTrack;
  paperCode: string;
  paperTitle: string;
  group: string | null;
  section: string | null;
  matchedIndexEntry: string | null;
  mappingStatus: ParakhCoveragePaper['mappingStatus'];
  indexKind: ParakhCoveragePaper['indexKind'];
  sourceUrl: string;
  authoredChapterCount: number;
  humanReviewedChapterCount: 0;
  benchmarkPromptCount: number;
  humanReviewedBenchmarkCount: 0;
};

const CHECKED_AT = '2026-11-08';
const PAPER_ALIASES: Record<string, string[]> = {
  'FND-P1': ['accounting', 'foundation accounts', 'लेखांकन'],
  'FND-P2': ['business law', 'business laws', 'foundation law', 'व्यवसाय कानून', 'व्यापार कानून'],
  'FND-P3': ['quantitative aptitude', 'business mathematics', 'logical reasoning', 'statistics', 'foundation qa', 'मात्रात्मक योग्यता'],
  'FND-P4': ['business economics', 'foundation economics', 'व्यवसाय अर्थशास्त्र'],
  'INT-G1-P1': ['advanced accounting', 'intermediate aa', 'उन्नत लेखांकन'],
  'INT-G1-P2': ['corporate and other laws', 'corporate law', 'intermediate law', 'inter law', 'कंपनी कानून', 'कॉर्पोरेट कानून'],
  'INT-G1-P3': ['taxation', 'income tax', 'gst', 'goods and services tax', 'inter taxation', 'कराधान', 'आयकर', 'जीएसटी'],
  'INT-G2-P4': ['cost and management accounting', 'costing', 'cost accounting', 'inter costing', 'लागत लेखांकन'],
  'INT-G2-P5': ['auditing and ethics', 'audit', 'inter audit', 'लेखापरीक्षा', 'अंकेक्षण'],
  'INT-G2-P6': ['financial management and strategic management', 'fm and sm', 'financial management', 'strategic management', 'fm', 'sm', 'वित्तीय प्रबंधन', 'रणनीतिक प्रबंधन'],
  'FIN-G1-P1': ['financial reporting', 'final fr', 'वित्तीय रिपोर्टिंग'],
  'FIN-G1-P2': ['advanced financial management', 'advanced fm', 'afm', 'final afm', 'उन्नत वित्तीय प्रबंधन'],
  'FIN-G1-P3': ['advanced auditing assurance and professional ethics', 'advanced auditing', 'final audit'],
  'FIN-G2-P4': ['direct tax laws international taxation', 'direct tax', 'international taxation', 'final dt', 'प्रत्यक्ष कर'],
  'FIN-G2-P5': ['indirect tax laws', 'final indirect tax', 'final idt', 'customs', 'अप्रत्यक्ष कर', 'सीमा शुल्क'],
  'FIN-G2-P6': ['integrated business solutions', 'ibs', 'final case study', 'एकीकृत व्यवसाय समाधान'],
  'SPOM-A': ['spom set a', 'set a corporate and economic laws', 'spom corporate and economic laws'],
  'SPOM-B': ['spom set b', 'set b strategic cost', 'strategic cost and performance management'],
  'SPOM-C1': ['risk management', 'spom risk management'],
  'SPOM-C2': ['sustainable development', 'sustainability reporting'],
  'SPOM-C3': ['public finance', 'government accounting'],
  'SPOM-C4': ['insolvency and bankruptcy code', 'ibc'],
  'SPOM-C5': ['spom international taxation'],
  'SPOM-C6': ['arbitration and conciliation act', 'arbitration'],
  'SPOM-C7': ['forensic accounting'],
  'SPOM-C8': ['valuation', 'business valuation'],
  'SPOM-C9': ['financial services and capital markets', 'fscm', 'capital markets'],
  'SPOM-C10': ['forex and treasury management', 'forex', 'treasury management'],
  'SPOM-D1': ['constitution of india', 'art of advocacy'],
  'SPOM-D2': ['psychology and philosophy', 'psychology', 'philosophy'],
  'SPOM-D3': ['entrepreneurship and start up ecosystem', 'entrepreneurship', 'startup ecosystem'],
  'SPOM-D4': ['digital ecosystem and controls', 'digital controls'],
};

function normalize(value: string): string {
  return String(value || '').toLocaleLowerCase('en-IN')
    .normalize('NFKC')
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function containsPhrase(haystack: string, needle: string): boolean {
  const text = ' ' + normalize(haystack) + ' ';
  const phrase = normalize(needle);
  return Boolean(phrase) && text.includes(' ' + phrase + ' ');
}


function getIndexEntryAliases(title: string): string[] {
  const normalized = normalize(title);
  const withoutLeadingArticle = normalized.replace(/^(?:the|a|an)\\s+/, '');
  const withoutTrailingYear = withoutLeadingArticle.replace(/\\s+(?:18|19|20)\\d{2}$/, '').trim();
  return Array.from(new Set([title, withoutLeadingArticle, withoutTrailingYear].filter(Boolean)));
}

function matchesIndexEntry(text: string, title: string): boolean {
  return getIndexEntryAliases(title).some((alias) => containsPhrase(text, alias));
}

function foundationOrIntermediateIndex(course: 'CA_FOUNDATION' | 'CA_INTERMEDIATE', paperNumber: number) {
  return getPlannerSubjects(course).find((subject) => subject.paperNumber === paperNumber) || null;
}

function getPaperIndex(paper: ReturnType<typeof getParakhCurriculumPapers>[number]): {
  indexKind: ParakhCoveragePaper['indexKind'];
  mappingStatus: ParakhCoveragePaper['mappingStatus'];
  entries: Array<{ number: number; title: string; section: string | null; authored: boolean; benchmarked: boolean }>;
  note: string;
} {
  if (paper.course === 'CA_INTERMEDIATE' && paper.code === 'INT-G1-P1') {
    const advancedAccounting = getParakhAdvancedAccountingInventory();
    return {
      indexKind: 'chapter',
      mappingStatus: 'OFFICIAL_CHAPTER_CATALOGUE_LINKED',
      entries: advancedAccounting.chapters.map((chapter) => ({
        number: chapter.chapterNumber,
        title: chapter.title,
        section: chapter.module,
        authored: chapter.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED',
        benchmarked: chapter.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED',
      })),
      note: 'The 15 chapters are linked to the official ICAI Intermediate Paper 1 catalogue headed Applicable for May 2027 Exam Onwards. Original English/Hindi/Hinglish drafts and benchmark prompts exist for all 15, but none has human-reviewed content or answer keys. Verify exact AS applicability and exclusions for the student attempt.',
    };
  }
  if (paper.course === 'CA_FOUNDATION' && paper.code === 'FND-P3') {
    const qa = getParakhFoundationQuantitativeAptitudeInventory();
    return {
      indexKind: 'chapter',
      mappingStatus: 'OFFICIAL_CHAPTER_CATALOGUE_LINKED',
      entries: qa.chapters.map((chapter) => ({
        number: chapter.chapterNumber,
        title: chapter.title,
        section: chapter.module,
        authored: chapter.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED',
        benchmarked: chapter.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED',
      })),
      note: 'The 18 chapters are linked to the official ICAI Foundation Paper 3 page marked Relevant for May 2027 and Onwards Examination. Original English/Hindi/Hinglish teaching drafts and benchmark prompts exist for all chapters; none has human-reviewed content or answer keys.',
    };
  }
  if (paper.course === 'CA_FOUNDATION' && paper.code === 'FND-P4') {
    const economics = getParakhFoundationBusinessEconomicsInventory();
    return {
      indexKind: 'chapter',
      mappingStatus: 'OFFICIAL_CHAPTER_CATALOGUE_LINKED',
      entries: economics.chapters.map((chapter) => ({
        number: chapter.chapterNumber,
        title: chapter.title,
        section: chapter.module,
        authored: chapter.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED',
        benchmarked: chapter.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED',
      })),
      note: 'The 10 chapters are linked to the official ICAI Foundation Paper 4 page marked Relevant for May 2027 and Onwards Examination. Original English/Hindi/Hinglish teaching drafts and benchmark prompts exist for all chapters; none has human-reviewed content or answer keys. Current Indian economic data is not embedded and must be sourced for the requested period.',
    };
  }
  if (paper.course === 'CA_FOUNDATION' && paper.code === 'FND-P2') {
    const laws = getParakhFoundationBusinessLawInventory();
    return {
      indexKind: 'chapter',
      mappingStatus: 'OFFICIAL_CHAPTER_CATALOGUE_LINKED',
      entries: laws.chapters.map((chapter) => ({
        number: chapter.chapterNumber,
        title: chapter.title,
        section: chapter.module,
        authored: chapter.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED',
        benchmarked: chapter.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED',
      })),
      note: 'The seven chapters are linked to the official ICAI Foundation Paper 2 page marked Relevant for May 2027 and Onwards Examination. Original English/Hindi/Hinglish conceptual drafts and benchmark prompts exist for all seven, but none has human-reviewed content or answer keys. Statutory sections, amendments, penalties, limitation and deadlines require current primary-source verification.',
    };
  }

  if (paper.course === 'CA_FOUNDATION' && paper.code === 'FND-P1') {
    const accounting = getParakhFoundationAccountingInventory();
    return {
      indexKind: 'chapter',
      mappingStatus: 'OFFICIAL_CHAPTER_CATALOGUE_LINKED',
      entries: accounting.chapters.map((chapter) => ({
        number: chapter.chapterNumber,
        title: chapter.title,
        section: chapter.module,
        authored: chapter.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED',
        benchmarked: chapter.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED',
      })),
      note: 'The 11 chapters are linked to the official ICAI Foundation Paper 1 page marked Relevant for May 2027 and Onwards Examination. Original English/Hindi/Hinglish drafts and benchmark prompts exist for all 11, but none has human-reviewed content or answer keys. Confirm exact attempt edition and corrigendum.',
    };
  }

  if (paper.course === 'CA_FOUNDATION' || paper.course === 'CA_INTERMEDIATE') {
    const plannerIndex = foundationOrIntermediateIndex(paper.course, Number(paper.code.match(/P(\d+)$/)?.[1] || 0));
    if (paper.course === 'CA_INTERMEDIATE' && paper.code === 'INT-G2-P5') {
      const audit = getParakhAuditingInventory();
      return {
        indexKind: 'chapter',
        mappingStatus: 'OFFICIAL_CHAPTER_CATALOGUE_LINKED',
        entries: audit.chapters.map((chapter) => ({
          number: chapter.chapterNumber,
          title: chapter.title,
          section: chapter.module,
          authored: chapter.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED',
          benchmarked: chapter.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED',
        })),
        note: 'The 11 chapters are linked to the official ICAI Paper 5 catalogue headed Applicable for May 2027 Exam Onwards. Original English/Hindi/Hinglish drafts and benchmark prompts exist for all 11, but none has human-reviewed content or answer keys. Current SA, reporting, ethics and bank requirements must be verified for the exact attempt.',
      };
    }
    if (paper.course === 'CA_INTERMEDIATE' && paper.code === 'INT-G2-P4') {
      const cost = getParakhCostAccountingInventory();
      return {
        indexKind: 'chapter',
        mappingStatus: 'OFFICIAL_CHAPTER_CATALOGUE_LINKED',
        entries: cost.chapters.map((chapter) => ({
          number: chapter.chapterNumber,
          title: chapter.title,
          section: chapter.module,
          authored: chapter.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED',
          benchmarked: chapter.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED',
        })),
        note: 'The 15 chapters are linked to the official ICAI Paper 4 catalogue headed Applicable for May 2027 Exam Onwards. Original English/Hindi/Hinglish drafts and benchmark prompts exist for all 15, but none has human-reviewed content or answer keys. Exact attempt applicability must be confirmed.',
      };
    }
    if (paper.course === 'CA_INTERMEDIATE' && paper.code === 'INT-G2-P6') {
      const fm = getParakhChapterKnowledgeInventory();
      const sm = getParakhStrategicManagementInventory();
      return {
        indexKind: 'chapter',
        mappingStatus: 'OFFICIAL_CHAPTER_CATALOGUE_LINKED',
        entries: [
          ...fm.chapters.map((chapter) => ({
            number: chapter.chapterNumber,
            title: chapter.title,
            section: 'Section A: Financial Management',
            authored: chapter.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED',
            benchmarked: chapter.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED',
          })),
          ...sm.chapters.map((chapter) => ({
            number: chapter.chapterNumber,
            title: chapter.title,
            section: 'Section B: Strategic Management',
            authored: chapter.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED',
            benchmarked: chapter.benchmarkStatus === 'PROMPTS_DEFINED_NOT_EVALUATED',
          })),
        ],
        note: 'Section A (Financial Management) has nine original chapter drafts and 45 benchmark prompts; Section B (Strategic Management) has five original chapter drafts and 25 prompts. Both sets are unreviewed. Paper 6B content is mapped to the ICAI page headed Applicable for May 2027 Exam Onwards; exact attempt applicability must be rechecked.',
      };
    }
    const chapters = plannerIndex?.chapters || [];
    return {
      indexKind: chapters.length ? 'chapter' : 'none',
      mappingStatus: 'APP_CHAPTER_INDEX_NOT_ATTEMPT_VERIFIED',
      entries: chapters.map((title, index) => ({
        number: index + 1,
        title,
        section: paper.sections.length === 1 ? paper.sections[0] : null,
        authored: false,
        benchmarked: false,
      })),
      note: chapters.length
        ? 'Chapter labels are reused from the application curriculum index. They are not yet checked chapter-by-chapter against the student’s exact examination attempt, and no subject-specific authored lesson is released through this pack.'
        : 'Only the official paper is mapped; its chapter index has not yet been imported.',
    };
  }

  if (paper.course === 'CA_FINAL') {
    const subject = CA_CURRICULUM.FINAL.subjects.find((item) => item.paperNumber === Number(paper.code.match(/P(\d+)$/)?.[1] || 0));
    const topics = [...(subject?.keyProvisions || []), ...(subject?.accountingStandards || [])];
    return {
      indexKind: topics.length ? 'topic' : 'none',
      mappingStatus: 'PROVISIONAL_TOPIC_INDEX_NOT_OFFICIAL_CHAPTERS',
      entries: topics.map((title, index) => ({
        number: index + 1,
        title,
        section: null,
        authored: false,
        benchmarked: false,
      })),
      note: 'These are broad topic pointers from the application subject metadata, not official ICAI chapter titles. Official chapter-level mapping and attempt applicability still need to be imported and checked.',
    };
  }

  return {
    indexKind: 'none',
    mappingStatus: 'OFFICIAL_MODULE_MAPPED_CHAPTER_INDEX_PENDING',
    entries: [],
    note: 'The official SPOM module/paper is mapped, but chapter/unit contents have not yet been indexed here. The student must follow the current ICAI module and applicable examination instructions.',
  };
}

export function getParakhCourseCoverageInventory(): {
  checkedAt: string;
  scheme: 'ICAI_NEW_SCHEME_OF_EDUCATION_AND_TRAINING';
  status: 'PAPER_MAP_COMPLETE_CONTENT_COVERAGE_INCOMPLETE';
  courseCount: number;
  paperCount: number;
  chapterIndexCount: number;
  provisionalTopicIndexCount: number;
  authoredChapterCount: number;
  humanReviewedChapterCount: 0;
  benchmarkPromptCount: number;
  humanReviewedBenchmarkCount: 0;
  courses: Array<{
    course: ParakhCurriculumTrack;
    title: string;
    paperCount: number;
    chapterIndexCount: number;
    authoredChapterCount: number;
    benchmarkPromptCount: number;
    papers: ParakhCoveragePaper[];
  }>;
  limitations: string[];
} {
  const curriculum = getParakhCurriculumPapers();
  const chapterInventory = getParakhChapterKnowledgeInventory();
  const courseLabels: Array<[ParakhCurriculumTrack, string]> = [
    ['CA_FOUNDATION', 'CA Foundation'],
    ['CA_INTERMEDIATE', 'CA Intermediate'],
    ['CA_FINAL', 'CA Final'],
    ['SPOM', 'Self-Paced Online Modules'],
  ];
  const papers: ParakhCoveragePaper[] = curriculum.map((paper) => {
    const index = getPaperIndex(paper);
    const indexEntries = index.entries.map((entry) => ({
      number: entry.number,
      title: entry.title,
      section: entry.section,
      contentStatus: entry.authored ? 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED' as const : 'MAPPED_ONLY' as const,
      benchmarkStatus: entry.benchmarked ? 'PROMPTS_DEFINED_NOT_EVALUATED' as const : 'NOT_CREATED' as const,
    }));
    const authoredChapterCount = indexEntries.filter((entry) => entry.contentStatus === 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED').length;
    // Every authored chapter currently has five distinct benchmark prompts.
    const benchmarkPromptCount = index.entries.filter((entry) => entry.benchmarked).length * 5;
    return {
      course: paper.course,
      code: paper.code,
      title: paper.title,
      group: paper.group,
      sections: [...paper.sections],
      sourceUrl: paper.sourceUrl,
      mappingStatus: index.mappingStatus,
      indexKind: index.indexKind,
      indexEntries,
      authoredChapterCount,
      humanReviewedChapterCount: 0,
      benchmarkPromptCount,
      humanReviewedBenchmarkCount: 0,
      note: index.note,
    };
  });

  const courses = courseLabels.map(([course, title]) => {
    const coursePapers = papers.filter((paper) => paper.course === course);
    return {
      course,
      title,
      paperCount: coursePapers.length,
      chapterIndexCount: coursePapers.reduce((sum, paper) => sum + (paper.indexKind === 'chapter' ? paper.indexEntries.length : 0), 0),
      authoredChapterCount: coursePapers.reduce((sum, paper) => sum + paper.authoredChapterCount, 0),
      benchmarkPromptCount: coursePapers.reduce((sum, paper) => sum + paper.benchmarkPromptCount, 0),
      papers: coursePapers,
    };
  });

  return {
    checkedAt: CHECKED_AT,
    scheme: 'ICAI_NEW_SCHEME_OF_EDUCATION_AND_TRAINING',
    status: 'PAPER_MAP_COMPLETE_CONTENT_COVERAGE_INCOMPLETE',
    courseCount: courses.length,
    paperCount: papers.length,
    chapterIndexCount: courses.reduce((sum, course) => sum + course.chapterIndexCount, 0),
    provisionalTopicIndexCount: papers.reduce((sum, paper) => sum + (paper.indexKind === 'topic' ? paper.indexEntries.length : 0), 0),
    authoredChapterCount: papers.reduce((sum, paper) => sum + paper.authoredChapterCount, 0),
    humanReviewedChapterCount: 0,
    benchmarkPromptCount: papers.reduce((sum, paper) => sum + paper.benchmarkPromptCount, 0),
    humanReviewedBenchmarkCount: 0,
    courses,
    limitations: [
      'A paper map or application chapter index is not equivalent to a complete lesson bank.',
      'Original authored content covers Foundation Papers 1–4 (11 Accounting, 7 Business Laws, 18 Quantitative Aptitude and 10 Business Economics chapters) and Intermediate Papers 4–6 (15 Cost Accounting, 11 Auditing, 9 FM and 5 SM chapters); none is human-reviewed.',
      'Foundation Papers 1–4 and Intermediate Papers 4–6 have source-linked chapter catalogues; other Foundation and Intermediate chapter labels are reused from the app curriculum and still need attempt-specific ICAI verification.',
      'CA Final entries are provisional topic pointers, not official chapter titles.',
      'SPOM papers are mapped at module level only; chapter/unit indexing is pending.',
      'Benchmark prompts are not held-out answer-key evaluations. Human-reviewed benchmark count is zero.',
      'Current statutes, tax rates, amendments, exclusions and attempt-specific applicability must be checked against the exact ICAI material and primary legal sources.',
      'No extra AI provider, paid model call, student-chat transcript ingestion or automatic model-weight training is introduced by this coverage registry.',
    ],
  };
}

export function resolveParakhCoursePaperContext(input: {
  message: string;
  course: string;
  subjects?: string[];
}): ParakhCourseCoverageContext | null {
  const message = String(input.message || '').trim();
  const course = input.course as ParakhCurriculumTrack;
  if (!message || !['CA_FOUNDATION', 'CA_INTERMEDIATE', 'CA_FINAL', 'SPOM'].includes(course)) return null;

  const requestsSpomModule = course === 'CA_FINAL' && /\bspom\b/i.test(message);
  const curriculum = requestsSpomModule
    ? [...getParakhCurriculumPapers('CA_FINAL'), ...getParakhCurriculumPapers('SPOM')]
    : getParakhCurriculumPapers(course);
  const suppliedSubjects = (input.subjects || []).join(' ');
  const candidates: Array<{
    paper: ReturnType<typeof getParakhCurriculumPapers>[number];
    score: number;
    matchedIndexEntry: string | null;
    matchedSection: string | null;
  }> = [];

  for (const paper of curriculum) {
    const sectionTitles = paper.sections.map((section) => section.replace(/^Section [A-Z]:\\s*/i, '').trim());
    const aliases = [paper.title, ...(PAPER_ALIASES[paper.code] || []), ...paper.sections, ...sectionTitles];
    const matchedAliases = aliases.filter((alias) => containsPhrase(message, alias) || containsPhrase(suppliedSubjects, alias));
    const index = getPaperIndex(paper);
    const matchedEntries = index.entries.filter((entry) =>
      matchesIndexEntry(message, entry.title) || matchesIndexEntry(suppliedSubjects, entry.title),
    );
    const matchedSections = paper.sections.filter((section) => {
      const title = section.replace(/^Section [A-Z]:\\s*/i, '').trim();
      return containsPhrase(message, title) || containsPhrase(suppliedSubjects, title);
    });
    if (!matchedAliases.length && !matchedEntries.length) continue;
    const longestAlias = matchedAliases.reduce((max, alias) => Math.max(max, normalize(alias).length), 0);
    const score = longestAlias * 2
      + matchedEntries.reduce((sum, entry) => sum + normalize(entry.title).length, 0)
      + matchedSections.reduce((sum, section) => sum + normalize(section).length * 2, 0);
    const matchedSection = matchedSections.length === 1
      ? paper.code === 'INT-G2-P6' && !/^Section [A-Z]:/i.test(matchedSections[0])
        ? (matchedSections[0] === 'Strategic Management' ? 'Section B: ' : 'Section A: ') + matchedSections[0]
        : matchedSections[0]
      : null;
    candidates.push({
      paper,
      score,
      matchedIndexEntry: matchedEntries.length === 1 ? matchedEntries[0].title : null,
      matchedSection,
    });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) return null;
  const winner = candidates[0];
  const index = getPaperIndex(winner.paper);
  const resolvedSection = winner.matchedIndexEntry
    ? index.entries.find((entry) => entry.title === winner.matchedIndexEntry)?.section || winner.matchedSection || winner.paper.sections[0] || null
    : winner.matchedSection || winner.paper.sections[0] || null;
  const paper6SectionB = winner.paper.code === 'INT-G2-P6' && resolvedSection === 'Section B: Strategic Management';
  const paper6SectionA = winner.paper.code === 'INT-G2-P6' && resolvedSection === 'Section A: Financial Management';
  const intermediateCostPaper = winner.paper.code === 'INT-G2-P4';
  const intermediateAuditPaper = winner.paper.code === 'INT-G2-P5';
  const foundationAccountingPaper = winner.paper.code === 'FND-P1';
  const foundationBusinessLawPaper = winner.paper.code === 'FND-P2';
  const foundationQuantitativePaper = winner.paper.code === 'FND-P3';
  const foundationEconomicsPaper = winner.paper.code === 'FND-P4';
  const intermediateAdvancedAccountingPaper = winner.paper.code === 'INT-G1-P1';
  return {
    course: winner.paper.course,
    paperCode: winner.paper.code,
    paperTitle: winner.paper.title,
    group: winner.paper.group,
    section: resolvedSection,
    matchedIndexEntry: winner.matchedIndexEntry,
    mappingStatus: index.mappingStatus,
    indexKind: index.indexKind,
    sourceUrl: intermediateAdvancedAccountingPaper ? getParakhAdvancedAccountingInventory().sourceUrl
      : foundationEconomicsPaper ? getParakhFoundationBusinessEconomicsInventory().sourceUrl
      : foundationQuantitativePaper ? getParakhFoundationQuantitativeAptitudeInventory().sourceUrl
        : foundationBusinessLawPaper ? getParakhFoundationBusinessLawInventory().sourceUrl
          : foundationAccountingPaper ? getParakhFoundationAccountingInventory().sourceUrl
        : intermediateAuditPaper ? getParakhAuditingInventory().sourceUrl
        : intermediateCostPaper ? getParakhCostAccountingInventory().sourceUrl
        : paper6SectionB ? getParakhStrategicManagementInventory().sourceUrl
        : paper6SectionA ? getParakhChapterKnowledgeInventory().sourceUrl : winner.paper.sourceUrl,
    authoredChapterCount: index.entries.filter((entry) => entry.authored).length,
    humanReviewedChapterCount: 0,
    benchmarkPromptCount: winner.paper.code === 'INT-G1-P1' ? getParakhAdvancedAccountingInventory().benchmarkCaseCount
      : winner.paper.code === 'FND-P2' ? getParakhFoundationBusinessLawInventory().benchmarkCaseCount
      : winner.paper.code === 'FND-P3' ? getParakhFoundationQuantitativeAptitudeInventory().benchmarkCaseCount
        : winner.paper.code === 'FND-P4' ? getParakhFoundationBusinessEconomicsInventory().benchmarkCaseCount
          : winner.paper.code === 'FND-P1' ? getParakhFoundationAccountingInventory().benchmarkCaseCount
        : winner.paper.code === 'INT-G2-P6'
        ? getParakhChapterKnowledgeInventory().benchmarkCaseCount + getParakhStrategicManagementInventory().benchmarkCaseCount
        : winner.paper.code === 'INT-G2-P4' ? getParakhCostAccountingInventory().benchmarkCaseCount
          : winner.paper.code === 'INT-G2-P5' ? getParakhAuditingInventory().benchmarkCaseCount : 0,
    humanReviewedBenchmarkCount: 0,
  };
}

export function buildParakhCourseCoverageNotice(
  context: ParakhCourseCoverageContext,
  language: ParakhCoverageLanguage,
): string {
  const subject = context.matchedIndexEntry
    ? '“' + context.matchedIndexEntry + '”'
    : 'this paper';
  if (context.mappingStatus === 'OFFICIAL_CHAPTER_CATALOGUE_LINKED'
      && ['Section A: Financial Management', 'Section B: Strategic Management'].includes(context.section || '')) return '';
  if (language === 'hindi') {
    return '\n\n**पाठ्यक्रम coverage note:** यह प्रश्न ' + context.paperTitle + ' से जुड़ा है' +
      (context.section ? ' (' + context.section + ')' : '') + '। ' +
      (context.indexKind === 'topic'
        ? 'उपलब्ध सूची provisional topic pointers है, official chapter list नहीं।'
        : context.indexKind === 'none'
          ? 'इस module का chapter/unit index अभी उपलब्ध नहीं है।'
          : 'chapter index उपलब्ध है, लेकिन इसे आपके exact attempt के ICAI material से अभी verify नहीं किया गया है।') +
      ' इस topic का dedicated PARAKH lesson और reviewed benchmark अभी उपलब्ध नहीं है; legal, tax या amendment वाले answer को current official source से जाँचना ज़रूरी है।';
  }
  if (language === 'hinglish') {
    return '\n\n**Syllabus coverage note:** Ye question ' + context.paperTitle + ' se linked hai' +
      (context.section ? ' (' + context.section + ')' : '') + '. ' +
      (context.indexKind === 'topic'
        ? 'Jo list available hai woh provisional topic pointers hain, official chapter list nahi.'
        : context.indexKind === 'none'
          ? 'Is SPOM/module ka chapter-unit index abhi available nahi hai.'
          : 'Chapter index available hai, lekin exact exam attempt ke ICAI material se abhi verify nahi hua.') +
      ' Is topic ka dedicated PARAKH lesson aur human-reviewed benchmark abhi available nahi hai. Law/tax/amendment answers ko current official source se verify karna zaroori hai.';
  }
  return '\n\n**Syllabus coverage note:** This question appears to relate to ' + context.paperTitle +
    (context.section ? ' (' + context.section + ')' : '') + '. ' +
    (context.indexKind === 'topic'
      ? 'The available list contains provisional topic pointers, not official chapter titles.'
      : context.indexKind === 'none'
        ? 'A chapter/unit index for this module has not yet been imported.'
        : 'A chapter index exists, but it has not yet been verified against the ICAI material for your exact attempt.') +
    ' A dedicated PARAKH lesson and human-reviewed benchmark for this topic are not yet available. Verify law, tax and amendment answers against current official sources.';
}
