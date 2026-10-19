import { CA_CURRICULUM } from '../../src/data/caCurriculum.js';

export type PlannerCourse = 'CA_FOUNDATION' | 'CA_INTERMEDIATE';
export interface PlannerSubjectOption {
  key: string;
  name: string;
  paperNumber: number;
  group: 'GROUP_1' | 'GROUP_2' | null;
  chapters: string[];
}

const FOUNDATION_CHAPTERS: Record<string, string[]> = {
  'Accounting': [
    'Theoretical Framework', 'Accounting Process', 'Bank Reconciliation Statement',
    'Inventories', 'Depreciation and Amortisation', 'Bills of Exchange and Promissory Notes',
    'Preparation of Final Accounts of Sole Proprietors', 'Financial Statements of Not-for-Profit Organisations',
    'Accounts from Incomplete Records', 'Partnership and LLP Accounts', 'Company Accounts',
  ],
  'Business Laws': [
    'Indian Regulatory Framework', 'The Indian Contract Act, 1872',
    'The Sale of Goods Act, 1930', 'The Indian Partnership Act, 1932',
    'The Limited Liability Partnership Act, 2008', 'The Companies Act, 2013',
    'The Negotiable Instruments Act, 1881',
  ],
  'Quantitative Aptitude': [
    'Ratio and Proportion, Indices and Logarithms', 'Equations', 'Linear Inequalities',
    'Mathematics of Finance', 'Permutations and Combinations', 'Sequence and Series – Arithmetic and Geometric Progressions',
    'Sets, Relations and Functions, Limits and Continuity', 'Basic Applications of Differential and Integral Calculus',
    'Number Series, Coding and Decoding and Odd Man Out', 'Direction Sense Test',
    'Seating Arrangements', 'Blood Relations', 'Statistical Description of Data and Sampling',
    'Measures of Central Tendency and Dispersion', 'Probability', 'Theoretical Distributions',
    'Correlation and Regression', 'Index Numbers',
  ],
  'Business Economics': [
    'Nature and Scope of Business Economics', 'Theory of Demand and Supply',
    'Theory of Production and Cost', 'Price Determination in Different Markets',
    'Business Cycles', 'Determination of National Income', 'Public Finance',
    'Money Market', 'International Trade', 'Indian Economy',
  ],
};

const INTERMEDIATE_SUBJECT_ALIASES: Record<string, string[]> = {
  'Taxation': ['Taxation (Income Tax & GST)', 'Taxation'],
  'Costing': ['Cost and Management Accounting', 'Costing'],
  'Cost and Management Accounting': ['Cost and Management Accounting', 'Costing'],
  'Law': ['Corporate and Other Laws', 'Law'],
  'Corporate and Other Laws': ['Corporate and Other Laws', 'Law'],
  'Audit': ['Auditing and Ethics', 'Audit'],
  'Auditing and Ethics': ['Auditing and Ethics', 'Audit'],
  'Advanced Accounting': ['Advanced Accounting'],
  'Financial Management and Strategic Management': ['Financial Management and Strategic Management', 'FM and SM'],
  'Accounting': ['Accounting'],
  'Business Laws': ['Business Laws'],
  'Quantitative Aptitude': ['Quantitative Aptitude'],
  'Business Economics': ['Business Economics'],
};

const INTERMEDIATE_CHAPTERS: Record<string, string[]> = {
  'Advanced Accounting': [
    'Accounting Standards (AS 1, AS 2, AS 3, AS 4, AS 5)',
    'Accounting Standards (AS 7, AS 9, AS 10, AS 11, AS 12)',
    'Accounting Standards (AS 13, AS 14, AS 16, AS 17, AS 18)',
    'Accounting Standards (AS 19, AS 20, AS 22, AS 24, AS 26, AS 28, AS 29)',
    'Company Accounts', 'Amalgamation of Companies', 'Internal Reconstruction',
    'Branch Accounts', 'Consolidated Financial Statements',
  ],
  'Corporate and Other Laws': [
    'Preliminary and Incorporation of Company', 'Prospectus and Allotment of Securities',
    'Share Capital and Debentures', 'Acceptance of Deposits', 'Registration of Charges',
    'Management and Administration', 'Declaration and Payment of Dividend', 'Accounts of Companies',
    'Audit and Auditors', 'Companies Incorporated Outside India', 'The Limited Liability Partnership Act, 2008',
    'The General Clauses Act, 1897', 'Interpretation of Statutes', 'The Foreign Exchange Management Act, 1999',
  ],
  'Taxation (Income Tax & GST)': [
    'Basic Concepts and Residential Status', 'Income from Salaries', 'Income from House Property',
    'Profits and Gains from Business or Profession', 'Capital Gains', 'Income from Other Sources',
    'Clubbing of Income', 'Set-off and Carry Forward of Losses', 'Deductions from Gross Total Income',
    'Advance Tax, TDS and TCS', 'Return of Income and Self-Assessment', 'GST: Supply and Levy',
    'GST: Place of Supply', 'GST: Exemptions', 'GST: Time and Value of Supply',
    'GST: Input Tax Credit', 'GST: Registration', 'GST: Tax Invoice, Credit and Debit Notes',
    'GST: Accounts and Records', 'GST: E-Way Bill', 'GST: Payment of Tax',
  ],
  'Cost and Management Accounting': [
    'Introduction to Cost and Management Accounting', 'Material Cost', 'Employee Cost', 'Direct Expenses',
    'Overheads', 'Activity Based Costing', 'Cost Sheet', 'Cost Accounting Systems', 'Unit and Batch Costing',
    'Job Costing and Contract Costing', 'Process and Joint Products Costing', 'Service Costing',
    'Standard Costing', 'Marginal Costing', 'Budget and Budgetary Control',
  ],
  'Auditing and Ethics': [
    'Nature, Objective and Scope of Audit', 'Audit Strategy, Planning and Programme',
    'Risk Assessment and Internal Control', 'Audit Evidence', 'Audit Documentation', 'Audit Sampling',
    'Analytical Procedures', 'Audit of Items of Financial Statements', 'Company Audit', 'Audit Report',
    'Audit of Banks', 'Audit of Different Types of Entities', 'Ethics and Terms of Engagement',
    'Standards on Auditing (SA 200 series)', 'Standards on Auditing (SA 300 series)',
    'Standards on Auditing (SA 500 series)', 'Standards on Auditing (SA 700 series)',
  ],
  'Financial Management and Strategic Management': [
    'Scope and Objectives of Financial Management', 'Types of Financing', 'Financial Analysis and Planning',
    'Cost of Capital', 'Capital Structure', 'Leverages', 'Investment Decisions', 'Dividend Decisions',
    'Management of Working Capital', 'Introduction to Strategic Management', 'Strategic Intent and Mission',
    'External and Internal Environment Analysis', 'Industrial and Competitive Analysis', 'Strategic Choices',
    'Strategy Implementation and Evaluation',
  ],
};

export function isSupportedPlannerCourse(course: unknown): course is PlannerCourse {
  return course === 'CA_FOUNDATION' || course === 'CA_INTERMEDIATE';
}

export function getPlannerSubjects(course: PlannerCourse): PlannerSubjectOption[] {
  const registry = course === 'CA_FOUNDATION' ? CA_CURRICULUM.FOUNDATION : CA_CURRICULUM.INTERMEDIATE;
  const chapters = course === 'CA_FOUNDATION' ? FOUNDATION_CHAPTERS : INTERMEDIATE_CHAPTERS;
  return registry.subjects.map((subject) => ({
    key: subject.key,
    name: subject.name,
    paperNumber: subject.paperNumber,
    group: subject.group || null,
    chapters: chapters[subject.name] || [...(subject.keyProvisions || []), ...(subject.accountingStandards || [])],
  }));
}

export function getPlannerChapterRegistry(course: PlannerCourse): Record<string, string[]> {
  return Object.fromEntries(getPlannerSubjects(course).map((subject) => [subject.name, subject.chapters]));
}

export function getPlannerSubjectAliases(subject: string, course: PlannerCourse): string[] {
  const aliases = INTERMEDIATE_SUBJECT_ALIASES[subject] || [subject];
  if (course === 'CA_FOUNDATION') return [subject];
  return aliases;
}

export function isValidPlannerSubject(course: PlannerCourse, subject: string): boolean {
  return getPlannerSubjects(course).some((item) => item.name === subject);
}

export function isValidPlannerChapter(course: PlannerCourse, subject: string, chapter: string): boolean {
  if (chapter === '__SUBJECT_LEVEL__') return isValidPlannerSubject(course, subject);
  return getPlannerSubjects(course).some((item) => item.name === subject && item.chapters.includes(chapter));
}
