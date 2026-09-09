import { CALevel, MaterialType, ModelGroup } from '../types';

export interface CASubjectInfo {
  key: string;
  name: string;
  paperNumber: number;
  group?: 'GROUP_1' | 'GROUP_2';
  mode: 'descriptive' | 'mcq' | 'integrated';
  maximumMarks: number;
  isMcqOnly?: boolean;
  hasMcqSection?: boolean;
  mcqNegativeMarking: boolean; // false for Inter/Final, true for Foundation MCQs
  accountingStandards?: string[];
  keyProvisions?: string[];
}

export const CA_CURRICULUM: Record<CALevel, {
  label: string;
  description: string;
  subjects: CASubjectInfo[];
}> = {
  FOUNDATION: {
    label: 'CA Foundation',
    description: 'Entry-level examination covering core accounting, business laws, quantitative methods, and economics.',
    subjects: [
      {
        key: 'foundation_accounting',
        name: 'Accounting',
        paperNumber: 1,
        mode: 'descriptive',
        maximumMarks: 100,
        isMcqOnly: false,
        mcqNegativeMarking: false,
        keyProvisions: ['Accounting Concepts', 'Bank Reconciliation Statement', 'Inventories', 'Depreciation', 'Bills of Exchange', 'Final Accounts', 'Partnership', 'Company Accounts'],
      },
      {
        key: 'foundation_business_law',
        name: 'Business Laws',
        paperNumber: 2,
        mode: 'descriptive',
        maximumMarks: 100,
        isMcqOnly: false,
        mcqNegativeMarking: false,
        keyProvisions: ['Indian Regulatory Framework', 'Indian Contract Act 1872', 'Sale of Goods Act 1930', 'Indian Partnership Act 1932', 'LLP Act 2008', 'Companies Act 2013'],
      },
      {
        key: 'foundation_quantitative_aptitude',
        name: 'Quantitative Aptitude',
        paperNumber: 3,
        mode: 'mcq',
        maximumMarks: 100,
        isMcqOnly: true,
        mcqNegativeMarking: true, // -0.25 negative marking for incorrect MCQs under ICAI rules
        keyProvisions: ['Ratio and Proportion', 'Time Value of Money', 'Permutations & Combinations', 'Probability', 'Theoretical Distributions', 'Correlation and Regression'],
      },
      {
        key: 'foundation_business_economics',
        name: 'Business Economics',
        paperNumber: 4,
        mode: 'mcq',
        maximumMarks: 100,
        isMcqOnly: true,
        mcqNegativeMarking: true, // -0.25 negative marking for incorrect MCQs under ICAI rules
        keyProvisions: ['Demand and Supply Analysis', 'Theory of Consumer Behavior', 'Theory of Production and Cost', 'Price Determination', 'National Income', 'Public Finance', 'Money Market', 'International Trade'],
      },
    ],
  },
  INTERMEDIATE: {
    label: 'CA Intermediate',
    description: 'Comprehensive mid-level exam under ICAI New Scheme (6 papers divided across Group 1 and Group 2).',
    subjects: [
      {
        key: 'inter_advanced_accounting',
        name: 'Advanced Accounting',
        paperNumber: 1,
        group: 'GROUP_1',
        mode: 'integrated',
        maximumMarks: 100,
        hasMcqSection: true,
        mcqNegativeMarking: false, // NO NEGATIVE MARKING FOR INTER
        accountingStandards: ['AS 1', 'AS 2', 'AS 3', 'AS 4', 'AS 5', 'AS 7', 'AS 9', 'AS 10', 'AS 11', 'AS 12', 'AS 13', 'AS 14', 'AS 16', 'AS 17', 'AS 18', 'AS 19', 'AS 20', 'AS 22', 'AS 24', 'AS 26', 'AS 28', 'AS 29'],
      },
      {
        key: 'inter_corporate_law',
        name: 'Corporate and Other Laws',
        paperNumber: 2,
        group: 'GROUP_1',
        mode: 'integrated',
        maximumMarks: 100,
        hasMcqSection: true,
        mcqNegativeMarking: false, // NO NEGATIVE MARKING FOR INTER
        keyProvisions: ['Companies Act 2013 (Sections 1 to 148)', 'Foreign Exchange Management Act (FEMA 1999)', 'General Clauses Act 1897', 'Interpretation of Statutes'],
      },
      {
        key: 'inter_taxation',
        name: 'Taxation (Income Tax & GST)',
        paperNumber: 3,
        group: 'GROUP_1',
        mode: 'integrated',
        maximumMarks: 100,
        hasMcqSection: true,
        mcqNegativeMarking: false, // NO NEGATIVE MARKING FOR INTER
        keyProvisions: ['Income Tax Act 1961 (Salaries, House Property, PGBP, Capital Gains, Other Sources, Set-off, Deductions Ch VI-A, TDS/TCS)', 'CGST Act 2017 & IGST Act 2017 (Levy, Supply, RCM, ITC, Value of Supply, Time of Supply, Invoices, E-way bill)'],
      },
      {
        key: 'inter_costing',
        name: 'Cost and Management Accounting',
        paperNumber: 4,
        group: 'GROUP_2',
        mode: 'integrated',
        maximumMarks: 100,
        hasMcqSection: true,
        mcqNegativeMarking: false, // NO NEGATIVE MARKING FOR INTER
        keyProvisions: ['Material Cost', 'Employee Cost', 'Overheads & Activity Based Costing (ABC)', 'Cost Sheet', 'Cost Accounting Systems', 'Unit & Batch Costing', 'Job & Contract Costing', 'Process & Joint/By-products', 'Service Costing', 'Standard Costing', 'Marginal Costing', 'Budget & Budgetary Control'],
      },
      {
        key: 'inter_auditing',
        name: 'Auditing and Ethics',
        paperNumber: 5,
        group: 'GROUP_2',
        mode: 'integrated',
        maximumMarks: 100,
        hasMcqSection: true,
        mcqNegativeMarking: false, // NO NEGATIVE MARKING FOR INTER
        accountingStandards: ['SA 200', 'SA 210', 'SA 220', 'SA 230', 'SA 240', 'SA 250', 'SA 260', 'SA 300', 'SA 315', 'SA 320', 'SA 330', 'SA 500', 'SA 501', 'SA 505', 'SA 520', 'SA 530', 'SA 550', 'SA 700', 'SA 705', 'SA 706', 'SQC 1'],
        keyProvisions: ['CARO 2020', 'Audit Documentation and Evidence', 'Audit Sampling', 'Internal Audit and Control', 'Audit of Items of Financial Statements', 'Audit of Banks', 'ICAI Code of Ethics'],
      },
      {
        key: 'inter_fm_sm',
        name: 'Financial Management and Strategic Management',
        paperNumber: 6,
        group: 'GROUP_2',
        mode: 'integrated',
        maximumMarks: 100,
        hasMcqSection: true,
        mcqNegativeMarking: false, // NO NEGATIVE MARKING FOR INTER
        keyProvisions: ['Financial Management: Ratios, Cost of Capital, Capital Structure Theories, Leverages, Investment Decisions (NPV/IRR), Dividend Decisions, Working Capital Management', 'Strategic Management: Strategic Intent, Environmental Analysis, Strategy Formulation, Implementation & Execution'],
      },
    ],
  },
  FINAL: {
    label: 'CA Final',
    description: 'The pinnacle qualification of Chartered Accountancy under ICAI New Scheme (6 advanced papers).',
    subjects: [
      {
        key: 'final_fr',
        name: 'Financial Reporting',
        paperNumber: 1,
        group: 'GROUP_1',
        mode: 'integrated',
        maximumMarks: 100,
        hasMcqSection: true,
        mcqNegativeMarking: false, // NO NEGATIVE MARKING FOR FINAL
        accountingStandards: ['Ind AS 1', 'Ind AS 2', 'Ind AS 7', 'Ind AS 16', 'Ind AS 19', 'Ind AS 20', 'Ind AS 21', 'Ind AS 23', 'Ind AS 24', 'Ind AS 33', 'Ind AS 36', 'Ind AS 37', 'Ind AS 38', 'Ind AS 102', 'Ind AS 103 (Business Combinations)', 'Ind AS 109/32/107 (Financial Instruments)', 'Ind AS 115 (Revenue)', 'Ind AS 116 (Leases)'],
      },
      {
        key: 'final_afm',
        name: 'Advanced Financial Management',
        paperNumber: 2,
        group: 'GROUP_1',
        mode: 'integrated',
        maximumMarks: 100,
        hasMcqSection: true,
        mcqNegativeMarking: false, // NO NEGATIVE MARKING FOR FINAL
        keyProvisions: ['Financial Policy & Corporate Strategy', 'Risk Management & Value at Risk (VaR)', 'Security Analysis & Valuation', 'Portfolio Management & Mutual Funds', 'Securitization', 'Derivatives Analysis & Valuation (Futures, Options, Swaps)', 'Foreign Exchange Exposure & Risk Management', 'International Financial Management', 'Interest Rate Risk Management', 'Mergers, Acquisitions & Corporate Restructuring', 'Startup Finance'],
      },
      {
        key: 'final_advanced_auditing',
        name: 'Advanced Auditing, Assurance and Professional Ethics',
        paperNumber: 3,
        group: 'GROUP_1',
        mode: 'integrated',
        maximumMarks: 100,
        hasMcqSection: true,
        mcqNegativeMarking: false, // NO NEGATIVE MARKING FOR FINAL
        accountingStandards: ['Standards on Auditing (SA 200 to SA 810 series)', 'Standards on Review Engagements (SRE 2400/2410)', 'Standards on Assurance Engagements (SAE 3400/3402/3420)', 'Standards on Related Services (SRS 4400/4410)'],
        keyProvisions: ['ICAI Chartered Accountants Act 1949 & Code of Ethics (First and Second Schedules)', 'CARO 2020', 'Audit of NBFCs and PSU Audits', 'Audit of Consolidated Financial Statements', 'Due Diligence, Investigation & Forensic Accounting', 'Internal Audit, Management and Operational Audit', 'ESG Assurance and Digital Auditing'],
      },
      {
        key: 'final_direct_tax',
        name: 'Direct Tax Laws & International Taxation',
        paperNumber: 4,
        group: 'GROUP_2',
        mode: 'integrated',
        maximumMarks: 100,
        hasMcqSection: true,
        mcqNegativeMarking: false, // NO NEGATIVE MARKING FOR FINAL
        keyProvisions: ['Income Tax Act 1961 - Corporate Taxation, MAT u/s 115JB, Section 115BAA/BAB', 'Business Restructuring, Amalgamation & Demerger', 'Charitable Trusts & Non-profit institutions', 'Assessment Procedures, Reassessment u/s 148, Search & Seizure', 'Appeals, Revision, Penalties, Prosecution', 'Transfer Pricing (Arm’s Length Price, Safe Harbour Rules, Secondary Adjustment)', 'Double Taxation Relief (DTAA u/s 90/91)', 'Equalisation Levy, Model Tax Conventions (OECD & UN)', 'Base Erosion & Profit Shifting (BEPS Actions)'],
      },
      {
        key: 'final_indirect_tax',
        name: 'Indirect Tax Laws',
        paperNumber: 5,
        group: 'GROUP_2',
        mode: 'integrated',
        maximumMarks: 100,
        hasMcqSection: true,
        mcqNegativeMarking: false, // NO NEGATIVE MARKING FOR FINAL
        keyProvisions: ['Goods and Services Tax (CGST/IGST): Input Tax Credit (Sections 16, 17, 18)', 'Valuation Rules, Place of Supply of Goods and Services', 'Zero-rated supplies, Exports, SEZ, LUT and Refunds', 'Job work, Electronic Commerce Operator (Section 9(5), 52)', 'Anti-profiteering, Inspection, Search, Seizure, Arrest, Demand & Recovery', 'Customs Act 1962: Classification, Valuation, Customs Duty Computations, Drawback, Warehousing', 'Foreign Trade Policy (FTP 2023): RoDTEP, EPCG, Advance Authorisation'],
      },
      {
        key: 'final_ibs',
        name: 'Integrated Business Solutions (Multidisciplinary Case Study)',
        paperNumber: 6,
        group: 'GROUP_2',
        mode: 'integrated',
        maximumMarks: 100,
        hasMcqSection: true,
        mcqNegativeMarking: false, // NO NEGATIVE MARKING FOR FINAL
        keyProvisions: ['Multidisciplinary Case Analysis integrating Financial Reporting, AFM, Auditing, Corporate Law, Direct Tax, and Indirect Tax', 'Case Study Evaluation on Strategic Corporate Governance and Solvency'],
      },
    ],
  },
};

export const MATERIAL_TYPE_CONFIG: Record<MaterialType, {
  label: string;
  description: string;
}> = {
  MODEL: {
    label: 'Model Test Paper',
    description: 'Comprehensive full-syllabus question paper with official suggested solutions and step marking.',
  },
  MTP: {
    label: 'Mock Test Paper (MTP)',
    description: 'ICAI series mock exam simulating actual exam conditions for the current attempt.',
  },
  RTP: {
    label: 'Revision Test Paper (RTP)',
    description: 'ICAI RTP questions and recent statutory amendments / practical case studies.',
  },
  PYQ: {
    label: 'Previous Year Question Paper (PYQ)',
    description: 'Actual past ICAI exam question papers with suggested guideline solutions.',
  },
};

export const MODEL_GROUP_OPTIONS: Record<ModelGroup, string> = {
  GROUP_1: 'Model Test – Group 1 Papers',
  GROUP_2: 'Model Test – Group 2 Papers',
  OTHER: 'Model Test – Specialized / Other Papers',
};

export interface CASubject extends CASubjectInfo {
  id: string;
  level: CALevel;
}

export const CA_SUBJECTS: CASubject[] = [
  ...CA_CURRICULUM.FOUNDATION.subjects.map((s) => ({ ...s, id: s.key, level: 'FOUNDATION' as CALevel })),
  ...CA_CURRICULUM.INTERMEDIATE.subjects.map((s) => ({ ...s, id: s.key, level: 'INTERMEDIATE' as CALevel })),
  ...CA_CURRICULUM.FINAL.subjects.map((s) => ({ ...s, id: s.key, level: 'FINAL' as CALevel })),
];
