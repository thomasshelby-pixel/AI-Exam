export type ParakhCurriculumTrack =
  | 'CA_FOUNDATION'
  | 'CA_INTERMEDIATE'
  | 'CA_FINAL'
  | 'SPOM';

export interface ParakhCurriculumPaper {
  course: ParakhCurriculumTrack;
  code: string;
  title: string;
  group: string | null;
  sections: string[];
  domainKeys: string[];
  sourceUrl: string;
}

const FOUNDATION_PAGE = 'https://www.icai.org/post/foundation-nset';
const INTERMEDIATE_PAGE = 'https://www.icai.org/post/intermediate-nset';
const FINAL_PAGE = 'https://www.icai.org/post/final-nset';
const SPOM_PAGE = 'https://www.icai.org/post/19162';

/**
 * Official paper-title map for the ICAI New Scheme of Education and Training.
 * This is a curriculum locator, not a substitute for attempt-specific study
 * material, amendments, syllabus exclusions or exam applicability checks.
 */
export const PARAKH_CURRICULUM_PAPERS: ParakhCurriculumPaper[] = [
  {
    course: 'CA_FOUNDATION', code: 'FND-P1', title: 'Accounting', group: null,
    sections: [], domainKeys: ['accounting'], sourceUrl: FOUNDATION_PAGE,
  },
  {
    course: 'CA_FOUNDATION', code: 'FND-P2', title: 'Business Laws', group: null,
    sections: [], domainKeys: ['business_law'], sourceUrl: FOUNDATION_PAGE,
  },
  {
    course: 'CA_FOUNDATION', code: 'FND-P3', title: 'Quantitative Aptitude', group: null,
    sections: [], domainKeys: ['quantitative_aptitude'], sourceUrl: FOUNDATION_PAGE,
  },
  {
    course: 'CA_FOUNDATION', code: 'FND-P4', title: 'Business Economics', group: null,
    sections: [], domainKeys: ['economics'], sourceUrl: FOUNDATION_PAGE,
  },

  {
    course: 'CA_INTERMEDIATE', code: 'INT-G1-P1', title: 'Advanced Accounting', group: 'Group I',
    sections: [], domainKeys: ['accounting'], sourceUrl: INTERMEDIATE_PAGE,
  },
  {
    course: 'CA_INTERMEDIATE', code: 'INT-G1-P2', title: 'Corporate and Other Laws', group: 'Group I',
    sections: [], domainKeys: ['business_law'], sourceUrl: INTERMEDIATE_PAGE,
  },
  {
    course: 'CA_INTERMEDIATE', code: 'INT-G1-P3', title: 'Taxation', group: 'Group I',
    sections: ['Income-tax Law', 'Goods and Services Tax'], domainKeys: ['taxation'], sourceUrl: INTERMEDIATE_PAGE,
  },
  {
    course: 'CA_INTERMEDIATE', code: 'INT-G2-P4', title: 'Cost and Management Accounting', group: 'Group II',
    sections: [], domainKeys: ['cost_accounting'], sourceUrl: INTERMEDIATE_PAGE,
  },
  {
    course: 'CA_INTERMEDIATE', code: 'INT-G2-P5', title: 'Auditing and Ethics', group: 'Group II',
    sections: [], domainKeys: ['auditing'], sourceUrl: INTERMEDIATE_PAGE,
  },
  {
    course: 'CA_INTERMEDIATE', code: 'INT-G2-P6', title: 'Financial Management and Strategic Management', group: 'Group II',
    sections: ['Financial Management', 'Strategic Management'], domainKeys: ['financial_management', 'strategic_management'], sourceUrl: INTERMEDIATE_PAGE,
  },

  {
    course: 'CA_FINAL', code: 'FIN-G1-P1', title: 'Financial Reporting', group: 'Group I',
    sections: [], domainKeys: ['accounting'], sourceUrl: FINAL_PAGE,
  },
  {
    course: 'CA_FINAL', code: 'FIN-G1-P2', title: 'Advanced Financial Management', group: 'Group I',
    sections: [], domainKeys: ['financial_management'], sourceUrl: FINAL_PAGE,
  },
  {
    course: 'CA_FINAL', code: 'FIN-G1-P3', title: 'Advanced Auditing, Assurance and Professional Ethics', group: 'Group I',
    sections: [], domainKeys: ['auditing'], sourceUrl: FINAL_PAGE,
  },
  {
    course: 'CA_FINAL', code: 'FIN-G2-P4', title: 'Direct Tax Laws & International Taxation', group: 'Group II',
    sections: [], domainKeys: ['taxation'], sourceUrl: FINAL_PAGE,
  },
  {
    course: 'CA_FINAL', code: 'FIN-G2-P5', title: 'Indirect Tax Laws', group: 'Group II',
    sections: ['Goods and Services Tax', 'Customs & Foreign Trade Policy'], domainKeys: ['taxation'], sourceUrl: FINAL_PAGE,
  },
  {
    course: 'CA_FINAL', code: 'FIN-G2-P6', title: 'Integrated Business Solutions', group: 'Group II',
    sections: ['Multidisciplinary case study', 'Strategic Management'], domainKeys: ['integrated_business_solutions', 'strategic_management'], sourceUrl: FINAL_PAGE,
  },

  {
    course: 'SPOM', code: 'SPOM-A', title: 'Corporate and Economic Laws', group: 'Set A',
    sections: [], domainKeys: ['business_law'], sourceUrl: SPOM_PAGE,
  },
  {
    course: 'SPOM', code: 'SPOM-B', title: 'Strategic Cost & Performance Management', group: 'Set B',
    sections: [], domainKeys: ['cost_accounting'], sourceUrl: SPOM_PAGE,
  },
  {
    course: 'SPOM', code: 'SPOM-C1', title: 'Risk Management', group: 'Set C',
    sections: [], domainKeys: ['financial_management'], sourceUrl: SPOM_PAGE,
  },
  {
    course: 'SPOM', code: 'SPOM-C2', title: 'Sustainable Development and Sustainability Reporting', group: 'Set C',
    sections: [], domainKeys: ['auditing', 'accounting'], sourceUrl: SPOM_PAGE,
  },
  {
    course: 'SPOM', code: 'SPOM-C3', title: 'Public Finance and Government Accounting', group: 'Set C',
    sections: [], domainKeys: ['accounting', 'economics'], sourceUrl: SPOM_PAGE,
  },
  {
    course: 'SPOM', code: 'SPOM-C4', title: 'The Insolvency and Bankruptcy Code, 2016', group: 'Set C',
    sections: [], domainKeys: ['business_law'], sourceUrl: SPOM_PAGE,
  },
  {
    course: 'SPOM', code: 'SPOM-C5', title: 'International Taxation', group: 'Set C',
    sections: [], domainKeys: ['taxation'], sourceUrl: SPOM_PAGE,
  },
  {
    course: 'SPOM', code: 'SPOM-C6', title: 'The Arbitration and Conciliation Act, 1996', group: 'Set C',
    sections: [], domainKeys: ['business_law'], sourceUrl: SPOM_PAGE,
  },
  {
    course: 'SPOM', code: 'SPOM-C7', title: 'Forensic Accounting', group: 'Set C',
    sections: [], domainKeys: ['accounting', 'auditing'], sourceUrl: SPOM_PAGE,
  },
  {
    course: 'SPOM', code: 'SPOM-C8', title: 'Valuation', group: 'Set C',
    sections: [], domainKeys: ['financial_management', 'accounting'], sourceUrl: SPOM_PAGE,
  },
  {
    course: 'SPOM', code: 'SPOM-C9', title: 'Financial Services and Capital Markets', group: 'Set C',
    sections: [], domainKeys: ['financial_management'], sourceUrl: SPOM_PAGE,
  },
  {
    course: 'SPOM', code: 'SPOM-C10', title: 'Forex and Treasury Management', group: 'Set C',
    sections: [], domainKeys: ['financial_management'], sourceUrl: SPOM_PAGE,
  },
  {
    course: 'SPOM', code: 'SPOM-D1', title: 'The Constitution of India & Art of Advocacy', group: 'Set D',
    sections: [], domainKeys: ['business_law'], sourceUrl: SPOM_PAGE,
  },
  {
    course: 'SPOM', code: 'SPOM-D2', title: 'Psychology & Philosophy', group: 'Set D',
    sections: [], domainKeys: ['general_ca'], sourceUrl: SPOM_PAGE,
  },
  {
    course: 'SPOM', code: 'SPOM-D3', title: 'Entrepreneurship & Start-up Ecosystem', group: 'Set D',
    sections: [], domainKeys: ['strategic_management'], sourceUrl: SPOM_PAGE,
  },
  {
    course: 'SPOM', code: 'SPOM-D4', title: 'Digital Ecosystem and Controls', group: 'Set D',
    sections: [], domainKeys: ['auditing'], sourceUrl: SPOM_PAGE,
  },
];

export function getParakhCurriculumPapers(course?: ParakhCurriculumTrack): ParakhCurriculumPaper[] {
  return PARAKH_CURRICULUM_PAPERS
    .filter((paper) => !course || paper.course === course)
    .map((paper) => ({ ...paper, sections: [...paper.sections], domainKeys: [...paper.domainKeys] }));
}

export function getParakhCurriculumSummary(): {
  scheme: 'ICAI_NEW_SCHEME_OF_EDUCATION_AND_TRAINING';
  checkedAt: '2026-11-08';
  status: 'OFFICIAL_PAPER_MAPPING_ONLY';
  knowledgeCoverageVerified: false;
  courses: Array<{
    course: ParakhCurriculumTrack;
    title: string;
    paperCount: number;
    sourceUrl: string;
    papers: ParakhCurriculumPaper[];
  }>;
  limitations: string[];
} {
  const labels: Array<[ParakhCurriculumTrack, string]> = [
    ['CA_FOUNDATION', 'CA Foundation'],
    ['CA_INTERMEDIATE', 'CA Intermediate'],
    ['CA_FINAL', 'CA Final'],
    ['SPOM', 'Self-Paced Online Modules'],
  ];
  return {
    scheme: 'ICAI_NEW_SCHEME_OF_EDUCATION_AND_TRAINING',
    checkedAt: '2026-11-08',
    status: 'OFFICIAL_PAPER_MAPPING_ONLY',
    knowledgeCoverageVerified: false,
    courses: labels.map(([course, title]) => {
      const papers = getParakhCurriculumPapers(course);
      return {
        course,
        title,
        paperCount: papers.length,
        sourceUrl: papers[0]?.sourceUrl || 'https://www.icai.org/post/study-material-nset',
        papers,
      };
    }),
    limitations: [
      'This registry maps official paper titles and broad domains only; it does not establish chapter-level knowledge or benchmark coverage.',
      'Always select the study material, amendments, RTP/MTP and applicability for the student’s exact examination attempt.',
      'The official ICAI course pages are the source of truth if this registry becomes outdated.',
    ],
  };
}
