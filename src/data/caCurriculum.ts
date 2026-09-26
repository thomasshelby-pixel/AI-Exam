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
  MODEL_TEST_PAPER: {
    label: 'Model Test Paper',
    description: 'Comprehensive full-syllabus question paper with official suggested solutions and step marking.',
  },
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
  QUESTION_PAPER: {
    label: 'Question Paper',
    description: 'Standalone authentic exam question paper for student assessment and step testing.',
  },
  SUGGESTED_ANSWER: {
    label: 'Suggested Answer',
    description: 'Official suggested answer guideline and step-by-step marking rubrics.',
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

export interface CAChapterStructure {
  chapter: string;
  topics: string[];
}

export const CANONICAL_CURRICULUM_HIERARCHY: Record<
  string, // 'CA Foundation' | 'CA Intermediate' | 'CA Final' or 'CA_FOUNDATION' etc
  Record<string, CAChapterStructure[]>
> = {
  CA_FOUNDATION: {
    'Accounting': [
      { chapter: 'Theoretical Framework', topics: ['Meaning and Scope of Accounting', 'Accounting Concepts & Principles', 'Capital and Revenue Expenditures', 'Contingent Assets & Liabilities'] },
      { chapter: 'Accounting Process', topics: ['Journal & Ledger Entries', 'Cash Book & Subsidiary Books', 'Trial Balance Preparation'] },
      { chapter: 'Bank Reconciliation Statement', topics: ['Timing Differences', 'Errors in Cash Book', 'Reconciliation with Overdraft'] },
      { chapter: 'Inventories', topics: ['Cost Formulae (FIFO & Weighted Average)', 'Net Realisable Value Valuation', 'Physical Inventory Reconciliation'] },
      { chapter: 'Depreciation and Amortisation', topics: ['SLM and WDV Methods', 'Change of Method and Useful Life', 'Revaluation of Assets'] },
      { chapter: 'Bills of Exchange & Promissory Notes', topics: ['Trade Bills & Accommodation Bills', 'Dishonour and Noting', 'Renewal and Retirement'] },
      { chapter: 'Final Accounts of Sole Proprietors', topics: ['Trading and Profit & Loss Account', 'Balance Sheet Adjustments', 'Manufacturing Accounts'] },
      { chapter: 'Partnership Accounts', topics: ['Profit Sharing Ratio & Goodwill', 'Admission of Partner', 'Retirement & Death of Partner', 'Dissolution of Firm'] },
      { chapter: 'Company Accounts', topics: ['Issue and Forfeiture of Shares', 'Reissue of Forfeited Shares', 'Issue of Debentures', 'Redemption of Preference Shares'] },
    ],
    'Business Laws': [
      { chapter: 'Indian Regulatory Framework', topics: ['Major Regulatory Bodies (MCA, SEBI, RBI)', 'Sources of Law', 'Court Hierarchy in India'] },
      { chapter: 'The Indian Contract Act, 1872', topics: ['Nature and Essentials of Contract', 'Offer and Acceptance', 'Capacity to Contract & Free Consent', 'Performance of Contract', 'Breach of Contract & Remedies'] },
      { chapter: 'The Sale of Goods Act, 1930', topics: ['Formation of Contract of Sale', 'Conditions and Warranties', 'Transfer of Property and Title', 'Performance and Unpaid Seller Rights'] },
      { chapter: 'The Indian Partnership Act, 1932', topics: ['General Nature of Partnership', 'Rights and Duties of Partners', 'Registration and Dissolution'] },
      { chapter: 'The Limited Liability Partnership Act, 2008', topics: ['Salient Features of LLP', 'Designated Partners & Incorporation', 'Winding up and Dissolution'] },
      { chapter: 'The Companies Act, 2013', topics: ['Essential Characteristics of Company', 'Types of Companies', 'Incorporation & MOA/AOA', 'Doctrine of Indoor Management'] },
    ],
    'Quantitative Aptitude': [
      { chapter: 'Ratio, Proportion, Indices and Logarithms', topics: ['Ratio and Proportion Applications', 'Laws of Indices', 'Properties of Logarithms'] },
      { chapter: 'Equations and Matrices', topics: ['Linear Equations', 'Quadratic Equations', 'Matrix Operations and Determinants'] },
      { chapter: 'Linear Inequalities', topics: ['One Variable & Two Variables Systems', 'Feasible Region Graphs'] },
      { chapter: 'Time Value of Money', topics: ['Simple and Compound Interest', 'Effective Rate of Interest', 'Annuity Regular and Annuity Due', 'Perpetuity and Sinking Fund'] },
      { chapter: 'Permutations and Combinations', topics: ['Fundamental Principles of Counting', 'Factorial Notation', 'Circular Permutations'] },
      { chapter: 'Sequence and Series', topics: ['Arithmetic Progression (AP)', 'Geometric Progression (GP)', 'Sum to Infinite Terms'] },
      { chapter: 'Statistical Description of Data', topics: ['Data Collection & Presentation', 'Frequency Distributions', 'Graphical Representation'] },
      { chapter: 'Measures of Central Tendency and Dispersion', topics: ['Mean Median and Mode', 'Standard Deviation & Variance', 'Coefficient of Variation'] },
      { chapter: 'Probability and Theoretical Distributions', topics: ['Classical & Axiomatic Probability', 'Bayes Theorem', 'Binomial, Poisson & Normal Distributions'] },
      { chapter: 'Correlation and Regression', topics: ['Karl Pearson Coefficient', 'Spearman Rank Correlation', 'Regression Equations and Lines'] },
    ],
    'Business Economics': [
      { chapter: 'Introduction to Business Economics', topics: ['Scope and Nature of Economics', 'Micro vs Macro Economics', 'Basic Economic Problems'] },
      { chapter: 'Theory of Demand and Supply', topics: ['Law of Demand & Elasticity', 'Consumer Behavior & Indifference Curve', 'Supply Elasticity and Equilibrium'] },
      { chapter: 'Theory of Production and Cost', topics: ['Production Function & Law of Variable Proportions', 'Returns to Scale', 'Short-run and Long-run Cost Curves'] },
      { chapter: 'Price Determination in Different Markets', topics: ['Perfect Competition Equilibrium', 'Monopoly & Price Discrimination', 'Monopolistic Competition & Oligopoly'] },
      { chapter: 'Determination of National Income', topics: ['GDP, GNP and National Income Aggregates', 'Keynesian Two, Three and Four Sector Models'] },
      { chapter: 'Public Finance and Monetary Policy', topics: ['Fiscal Policy Instruments', 'Functions of Money & Credit Creation', 'Monetary Policy Tools (Repo, CRR, SLR)'] },
      { chapter: 'International Trade and Exchange Rates', topics: ['Theories of International Trade', 'Tariffs and Non-Tariff Barriers', 'Foreign Exchange Market Mechanics'] },
    ],
  },
  CA_INTERMEDIATE: {
    'Advanced Accounting': [
      { chapter: 'Accounting Standards Framework & Presentation', topics: ['AS 1 Disclosure of Accounting Policies', 'AS 2 Valuation of Inventories', 'AS 3 Cash Flow Statements', 'AS 4 Contingencies and Events Occurring After Balance Sheet Date', 'AS 5 Net Profit or Loss for Period'] },
      { chapter: 'Asset & Depreciation Accounting Standards', topics: ['AS 10 Property Plant and Equipment', 'AS 11 Effects of Changes in Foreign Exchange Rates', 'AS 12 Accounting for Government Grants', 'AS 13 Accounting for Investments', 'AS 16 Borrowing Costs'] },
      { chapter: 'Revenue, Leases & Employee Benefits Standards', topics: ['AS 7 Construction Contracts', 'AS 9 Revenue Recognition', 'AS 15 Employee Benefits', 'AS 18 Related Party Disclosures', 'AS 19 Leases'] },
      { chapter: 'Liability, Tax & Reporting Standards', topics: ['AS 20 Earnings Per Share', 'AS 22 Accounting for Taxes on Income', 'AS 24 Discontinuing Operations', 'AS 26 Intangible Assets', 'AS 28 Impairment of Assets', 'AS 29 Provisions and Contingent Liabilities'] },
      { chapter: 'Company Accounts & Schedule III', topics: ['Financial Statements Preparation under Schedule III', 'Managerial Remuneration', 'Corporate Social Responsibility Accounting'] },
      { chapter: 'Buy Back of Securities', topics: ['Statutory Conditions u/s 68', 'Capital Redemption Reserve (CRR)', 'Accounting Entries for Buy-back'] },
      { chapter: 'Amalgamation and Reconstruction', topics: ['Amalgamation in Nature of Merger & Purchase (AS 14)', 'Internal Reconstruction Scheme & Entries', 'Reduction of Share Capital'] },
      { chapter: 'Branch and Foreign Branch Accounting', topics: ['Dependent and Independent Branches', 'Foreign Currency Branch Translation (AS 11)', 'Debtors and Stock & Debtors Method'] },
    ],
    'Corporate and Other Laws': [
      { chapter: 'Preliminary - Sec 1 to 2', topics: ['Definitions of Key Terms', 'Applicability of Act', 'Company Classification'] },
      { chapter: 'Incorporation of Company - Sec 3 to 22', topics: ['Memorandum and Articles of Association', 'Registered Office Requirements', 'Doctrine of Ultra Vires & Alteration of MOA/AOA'] },
      { chapter: 'Prospectus and Allotment of Securities - Sec 23 to 42', topics: ['Public Offer and Private Placement', 'Shelf & Information Memorandum', 'Misstatements in Prospectus & Liability', 'Allotment of Securities'] },
      { chapter: 'Share Capital and Debentures - Sec 43 to 72', topics: ['Equity and Preference Shares', 'Issue of Sweat Equity & Bonus Shares', 'Reduction of Share Capital', 'Debenture Trust Deed and DRR'] },
      { chapter: 'Acceptance of Deposits - Sec 73 to 76A', topics: ['Prohibition on Acceptance of Deposits', 'Deposits from Members vs Public', 'Repayment of Deposits and Penalties'] },
      { chapter: 'Registration of Charges - Sec 77 to 87', topics: ['Duty to Register Charges', 'Modification and Satisfaction of Charges', 'Rectification by Central Government'] },
      { chapter: 'Management and Administration - Sec 88 to 122', topics: ['Register of Members & Beneficial Ownership', 'Annual Return (Sec 92)', 'Annual General Meeting (AGM) & EGM', 'Notice, Quorum, Proxy & Voting', 'Resolutions and Minutes'] },
      { chapter: 'Declaration and Payment of Dividend - Sec 123 to 127', topics: ['Declaration from Profits & Reserves', 'Unpaid Dividend Account & IEPF Transfer', 'Interim Dividend and Punishments'] },
      { chapter: 'Accounts of Companies - Sec 128 to 137', topics: ['Books of Account Preservation', 'Financial Statements & Board Report', 'Internal Audit (Sec 138)', 'CSR Policy and Expenditure (Sec 135)'] },
      { chapter: 'Audit and Auditors - Sec 138 to 148', topics: ['Appointment and Rotation of Auditors', 'Disqualifications of Auditor (Sec 141)', 'Rights, Duties and Reporting Liabilities', 'Cost Audit Requirements (Sec 148)'] },
      { chapter: 'Foreign Exchange Management Act (FEMA 1999)', topics: ['Current Account Transactions & Rules', 'Capital Account Transactions & Prohibitions', 'Authorized Persons and Adjudication'] },
      { chapter: 'The General Clauses Act, 1897', topics: ['General Definitions', 'Rules of Construction', 'Powers and Functionaries'] },
      { chapter: 'Interpretation of Statutes', topics: ['Primary Rules of Interpretation (Literal, Mischief, Golden)', 'Internal Aids to Construction', 'External Aids to Construction'] },
    ],
    'Taxation': [
      { chapter: 'Basic Concepts & Tax Rates', topics: ['Section 115BAC Default New Tax Regime', 'Rebate u/s 87A and Surcharge', 'Scope of Income & Assessee Types'] },
      { chapter: 'Residential Status & Scope of Total Income', topics: ['Individual Residential Status Criteria', 'Scope of Income for ROR, RNOR, NR', 'Deemed Resident u/s 6(1A)'] },
      { chapter: 'Heads of Income - Salaries', topics: ['Basis of Charge', 'Allowances and Perquisites Valuation', 'Standard Deduction and Retirement Benefits'] },
      { chapter: 'Heads of Income - House Property', topics: ['Annual Value Determination', 'Deduction u/s 24 (Standard & Interest)', 'Co-ownership and Unrealized Rent'] },
      { chapter: 'Heads of Income - Profits & Gains of Business or Profession (PGBP)', topics: ['Depreciation u/s 32 and Additional Depreciation', 'Allowable and Disallowable Expenses', 'Presumptive Taxation (Sec 44AD, 44ADA, 44AE)', 'Maintenance of Accounts & Tax Audit'] },
      { chapter: 'Heads of Income - Capital Gains', topics: ['Short-term vs Long-term Capital Assets', 'Computation u/s 48 and Cost Inflation Index', 'Exemptions u/s 54, 54B, 54EC, 54F', 'Taxation of Listed Securities u/s 111A and 112A'] },
      { chapter: 'Heads of Income - Other Sources', topics: ['Gift Taxation u/s 56(2)(x)', 'Dividend Income Taxation', 'Deductions Allowable'] },
      { chapter: 'Aggregation of Income, Set-off and Carry Forward of Losses', topics: ['Inter-source and Inter-head Adjustments', 'Restrictions on Loss Set-off', 'Carry Forward Time Limits'] },
      { chapter: 'Deductions from Gross Total Income', topics: ['Deductions under Section 80C, 80CCC, 80CCD', 'Section 80D Mediclaim Deductions', 'Section 80G Donations', 'Deductions under New Regime vs Old Regime'] },
      { chapter: 'Computation of Total Income and Tax Liability', topics: ['Gross Total Income Calculation', 'Marginal Relief Application', 'Health and Education Cess'] },
      { chapter: 'Advance Tax, TDS and TCS', topics: ['TDS on Salary, Interest, Contractors, Rent', 'TCS on Sale of Goods & LRS', 'Advance Tax Instalments & Interest u/s 234A/B/C'] },
      { chapter: 'GST - Supply, Charge and Exemption', topics: ['Definition of Supply (Sec 7 CGST)', 'Composite and Mixed Supplies', 'Reverse Charge Mechanism (RCM)', 'Exemptions under Notification 12/2017'] },
      { chapter: 'GST - Time and Value of Supply', topics: ['Time of Supply for Goods and Services', 'Transaction Value Determination u/s 15', 'Discounts and Inclusions'] },
      { chapter: 'GST - Input Tax Credit (ITC)', topics: ['Eligibility and Conditions (Sec 16)', 'Blocked Credits u/s 17(5)', 'Apportionment of ITC (Rules 42 and 43)', 'Order of ITC Utilization (Rule 88A)'] },
      { chapter: 'GST - Invoicing, E-Way Bill and Returns', topics: ['Tax Invoice Rules & E-Invoicing Thresholds', 'E-Way Bill Requirements & Validity', 'Returns (GSTR-1, GSTR-3B) and QRMP Scheme'] },
    ],
    'Cost and Management Accounting': [
      { chapter: 'Introduction to Cost and Management Accounting', topics: ['Cost Concepts and Classification', 'Cost Units and Cost Centers', 'Role of Cost Accounting in Decision Making'] },
      { chapter: 'Material Cost', topics: ['Procurement and Inventory Control (EOQ)', 'Inventory Stock Levels (Re-order, Minimum, Maximum)', 'Methods of Pricing Material Issues (FIFO, Weighted Avg)'] },
      { chapter: 'Employee Cost and Direct Expenses', topics: ['Time Recording and Idle Time Analysis', 'Labor Turnover Rates and Costs', 'Incentive Wage Plans (Halsey, Rowan)'] },
      { chapter: 'Overheads and Activity Based Costing (ABC)', topics: ['Primary and Secondary Distribution of Overheads', 'Absorption Rates Calculation', 'Cost Drivers and Cost Pools in ABC'] },
      { chapter: 'Cost Sheet', topics: ['Preparation of Cost Sheet', 'Prime Cost, Factory Cost and Total Cost', 'Reconciliation of Cost and Financial Profits'] },
      { chapter: 'Cost Accounting Systems', topics: ['Non-integrated Accounting Entries', 'Integrated Accounting Systems', 'Ledgers in Cost Accounting'] },
      { chapter: 'Unit, Batch and Job Costing', topics: ['Costing for Custom Job Orders', 'Economic Batch Quantity (EBQ)'] },
      { chapter: 'Process and Joint/By-products Costing', topics: ['Process Accounts & Normal/Abnormal Loss', 'Equivalent Units of Production (FIFO/Weighted Avg)', 'Apportionment of Joint Costs'] },
      { chapter: 'Service Costing', topics: ['Operating Costing for Transport, Hotels, Hospitals', 'Composite Cost Units (Passenger-KM, Ton-KM)'] },
      { chapter: 'Standard Costing and Variance Analysis', topics: ['Material Cost, Price and Usage Variances', 'Labor Rate, Efficiency and Idle Time Variances', 'Variable and Fixed Overhead Variances'] },
      { chapter: 'Marginal Costing', topics: ['PV Ratio and Break-even Analysis', 'Margin of Safety Computations', 'Make or Buy and Limiting Factor Decisions'] },
      { chapter: 'Budget and Budgetary Control', topics: ['Functional Budgets (Sales, Production, Cash)', 'Flexible Budgeting Techniques', 'Zero Base Budgeting (ZBB)'] },
    ],
    'Auditing and Ethics': [
      { chapter: 'Nature, Objective and Scope of Audit - SA 200', topics: ['Overall Objectives of Independent Auditor', 'Inherent Limitations of Audit', 'Ethical Requirements and Professional Skepticism'] },
      { chapter: 'Audit Strategy, Planning and Program - SA 300', topics: ['Establishment of Overall Audit Strategy', 'Development of Detailed Audit Plan', 'Materiality in Planning and Performing Audit (SA 320)'] },
      { chapter: 'Risk Assessment and Internal Control - SA 315', topics: ['Identifying and Assessing RoMM', 'Components of Internal Control', 'Automated Environment Controls (General & Application)'] },
      { chapter: 'Audit Evidence - SA 500 Series', topics: ['Sufficient Appropriate Audit Evidence', 'External Confirmations (SA 505)', 'Analytical Procedures (SA 520)', 'Audit Sampling Techniques (SA 530)'] },
      { chapter: 'Audit of Items of Financial Statements', topics: ['Verification of Share Capital & Reserves', 'Audit of Borrowings & Current Liabilities', 'Verification of Property Plant & Equipment', 'Audit of Revenue, Trade Receivables & Cash'] },
      { chapter: 'Audit Documentation and Quality Control', topics: ['Audit Documentation Requirements (SA 230)', 'Quality Management for Firms (SQC 1)', 'Auditors Responsibility Relating to Fraud (SA 240)'] },
      { chapter: 'Completion and Audit Report - SA 700 Series', topics: ['Forming an Opinion and Reporting (SA 700)', 'Modifications to the Opinion (SA 705)', 'Emphasis of Matter & Other Matter Paragraphs (SA 706)', 'Key Audit Matters (SA 701)'] },
      { chapter: 'Company Audit Provisions & CARO 2020', topics: ['Statutory Reporting under Sec 143(3)', 'CARO 2020 Reporting Clauses (Clauses i to xxi)', 'Reporting on Internal Financial Controls (IFCoFR)'] },
      { chapter: 'Special Features of Audit of Different Entities', topics: ['Audit of Banks (NPA Classification & Advances)', 'Audit of Non-Banking Financial Companies (NBFCs)', 'Audit of Government Companies & Local Bodies'] },
    ],
    'Financial Management and Strategic Management': [
      { chapter: 'Financial Analysis and Planning - Ratio Analysis', topics: ['Liquidity Ratios (Current, Quick)', 'Solvency and Leverage Ratios', 'Profitability and Turnover Ratios', 'DuPont Analysis'] },
      { chapter: 'Cost of Capital', topics: ['Cost of Equity (CAPM, Dividend Growth)', 'Cost of Preference Shares and Debt', 'Weighted Average Cost of Capital (WACC)'] },
      { chapter: 'Financing Decisions - Capital Structure', topics: ['Net Income and Net Operating Income Theories', 'Modigliani-Miller (MM) Hypothesis', 'EBIT-EPS Indifference Point Analysis'] },
      { chapter: 'Financing Decisions - Leverages', topics: ['Operating Leverage Degree (DOL)', 'Financial Leverage Degree (DFL)', 'Combined Leverage Analysis'] },
      { chapter: 'Investment Decisions - Capital Budgeting', topics: ['NPV, IRR and Modified IRR Techniques', 'Payback Period and Discounted Payback', 'Profitability Index and Capital Rationing'] },
      { chapter: 'Dividend Decisions', topics: ['Walters Model and Gordons Model', 'Modigliani-Miller Dividend Irrelevance', 'Determinants of Dividend Policy'] },
      { chapter: 'Management of Working Capital', topics: ['Operating Cycle and Cash Cycle Computation', 'Treasury and Cash Management Models (Baumol, Miller-Orr)', 'Receivables Management and Factoring'] },
      { chapter: 'Introduction to Strategic Management', topics: ['Strategic Intent (Vision, Mission, Objectives)', 'Strategic Management Process Levels', 'Corporate Governance and Strategy'] },
      { chapter: 'Strategic Analysis - External and Internal', topics: ['Porters Five Forces Industry Analysis', 'SWOT and TOWS Matrix Analysis', 'Value Chain Analysis and Core Competence'] },
      { chapter: 'Strategy Formulation and Implementation', topics: ['Porters Generic Competitive Strategies', 'Growth Strategies (Ansoff Matrix, BCG Matrix)', 'Strategy Implementation and Organizational Structure'] },
    ],
  },
  CA_FINAL: {
    'Financial Reporting': [
      { chapter: 'Ind AS Presentation and Disclosure Standards', topics: ['Ind AS 1 Presentation of Financial Statements', 'Ind AS 7 Statement of Cash Flows', 'Ind AS 8 Accounting Policies and Estimates', 'Ind AS 10 Events After Reporting Period'] },
      { chapter: 'Ind AS Asset Standards', topics: ['Ind AS 16 Property Plant and Equipment', 'Ind AS 23 Borrowing Costs', 'Ind AS 36 Impairment of Assets', 'Ind AS 38 Intangible Assets', 'Ind AS 40 Investment Property'] },
      { chapter: 'Ind AS Revenue and Leases', topics: ['Ind AS 115 Revenue from Contracts with Customers (5-Step Model)', 'Ind AS 116 Leases (Lessee & Lessor Accounting)'] },
      { chapter: 'Ind AS Financial Instruments', topics: ['Classification and Measurement (Ind AS 109)', 'Expected Credit Loss (ECL) Model', 'Hedge Accounting and Derivatives', 'Financial Liabilities vs Equity (Ind AS 32)'] },
      { chapter: 'Business Combinations and Group Accounts', topics: ['Ind AS 103 Business Combinations (Acquisition Method)', 'Ind AS 110 Consolidated Financial Statements', 'Ind AS 111 Joint Arrangements', 'Ind AS 28 Investments in Associates'] },
      { chapter: 'Employee Benefits and Share Based Payments', topics: ['Ind AS 19 Employee Benefits (Defined Benefit Plans)', 'Ind AS 102 Share-based Payment (Equity & Cash Settled)'] },
      { chapter: 'Income Taxes and Segment Reporting', topics: ['Ind AS 12 Income Taxes (Deferred Tax Assets/Liabilities)', 'Ind AS 108 Operating Segments Identification', 'Ind AS 33 Earnings Per Share'] },
    ],
    'Advanced Financial Management': [
      { chapter: 'Financial Policy and Corporate Strategy', topics: ['Strategic Financial Planning', 'Interface of Financial Strategy with Corporate Objectives'] },
      { chapter: 'Risk Management and Value at Risk (VaR)', topics: ['Types of Financial Risks', 'Value at Risk (VaR) Computation', 'Risk Mitigation Frameworks'] },
      { chapter: 'Advanced Capital Budgeting Decisions', topics: ['Adjusted Present Value (APV)', 'Real Options in Capital Budgeting', 'Project Risk Evaluation Techniques'] },
      { chapter: 'Security Analysis and Valuation', topics: ['Fundamental and Technical Analysis', 'Bond Valuation and Duration (Macaulay, Modified)', 'Equity Valuation Models (Free Cash Flow, DDM)'] },
      { chapter: 'Portfolio Management and Mutual Funds', topics: ['Markowitz Portfolio Theory and Efficient Frontier', 'Capital Asset Pricing Model (CAPM) and Arbitrage Pricing Theory', 'Portfolio Performance Evaluation (Sharpe, Treynor, Jensen)'] },
      { chapter: 'Securitization and Derivatives Valuation', topics: ['Securitization Process and Credit Enhancement', 'Futures Contracts Pricing and Hedging', 'Options Pricing (Black-Scholes, Binomial Model)', 'Swaps (Interest Rate and Currency Swaps)'] },
      { chapter: 'Foreign Exchange Exposure and Risk Management', topics: ['Exchange Rate Quotations and Cross Rates', 'Interest Rate Parity (IRP) and Purchasing Power Parity (PPP)', 'Hedging Techniques (Forward Contracts, Money Market Hedge, Currency Options)'] },
      { chapter: 'Mergers, Acquisitions and Corporate Restructuring', topics: ['Corporate Restructuring Motives', 'Valuation of Target Company and Exchange Ratio Determination', 'Post-merger Financial Evaluation and Value Creation'] },
    ],
    'Advanced Auditing, Assurance and Professional Ethics': [
      { chapter: 'Quality Management and Ethics', topics: ['SQC 1 and SA 220 Quality Management for Audits', 'ICAI Code of Ethics Fundamental Principles', 'Chartered Accountants Act 1949 Schedules and Disciplinary Mechanism'] },
      { chapter: 'Audit Strategy, Materiality and Risk Assessment', topics: ['Audit Strategy and Detailed Audit Plan (SA 300)', 'Materiality and Performance Materiality (SA 320)', 'Risk Assessment and Internal Control Evaluation (SA 315, 330)'] },
      { chapter: 'Audit Evidence and Procedures', topics: ['Audit Evidence Considerations (SA 500 series)', 'External Confirmations and Analytical Procedures', 'Using the Work of Internal Auditors and Experts (SA 610, 620)'] },
      { chapter: 'Audit Reporting and Special Engagements', topics: ['Independent Auditors Report Formulation (SA 700, 705, 706)', 'Key Audit Matters Communication (SA 701)', 'Review Engagements (SRE 2400/2410)', 'Assurance Engagements (SAE 3400/3420)'] },
      { chapter: 'Audit of Banks, NBFCs and Public Sector Undertakings', topics: ['Prudential Norms on Income Recognition and Asset Classification (IRAC)', 'Long Form Audit Report (LFAR) Execution', 'Comprehensive and Propriety Audit of PSUs'] },
      { chapter: 'Forensic Accounting, Investigation and Digital Auditing', topics: ['Forensic Audit Techniques and Red Flags', 'Investigation into Company Affairs', 'Digital Auditing Tools, Big Data Analytics and AI in Audit'] },
    ],
    'Direct Tax Laws & International Taxation': [
      { chapter: 'Corporate Taxation and Special Regimes', topics: ['Taxation of Domestic Companies u/s 115BAA/BAB', 'Minimum Alternate Tax (MAT u/s 115JB)', 'Taxation of Firms, LLPs and Non-profit Trusts'] },
      { chapter: 'Assessment Procedures, Search & Penalties', topics: ['Faceless Assessment and Reassessment u/s 147/148', 'Search, Seizure and Requisition Provisions', 'Appeals, Dispute Resolution and Penalty Levies'] },
      { chapter: 'International Taxation and Transfer Pricing', topics: ['Arm’s Length Price Determination Methods', 'Safe Harbour Rules and Advance Pricing Agreements (APA)', 'Secondary Adjustments u/s 92CE and BEPS Action Plans'] },
      { chapter: 'Non-Resident Taxation and DTAA', topics: ['Taxation of Non-Residents and Foreign Companies', 'Withholding Tax Obligations u/s 195', 'Double Taxation Avoidance Agreements (DTAA u/s 90/91)', 'Equalisation Levy and Significant Economic Presence (SEP)'] },
    ],
    'Indirect Tax Laws': [
      { chapter: 'GST - Advanced Supply and Valuation Concepts', topics: ['Valuation Rules under CGST Rules 2017', 'Place of Supply for Cross-Border Goods and Services', 'Export of Goods and Services under LUT/Refund'] },
      { chapter: 'GST - Advanced Input Tax Credit & Refunds', topics: ['Apportionment and Special ITC Provisions', 'Refunds of Unutilized ITC on Inverted Duty and Zero-rated Supplies', 'Job Work Procedures and ITC Mechanics'] },
      { chapter: 'GST - Demand, Recovery, Offences and Penalties', topics: ['Determination of Tax u/s 73 and 74', 'Inspection, Search, Seizure and Arrest Provisions', 'Appeals, Revision and Appellate Tribunal Procedures'] },
      { chapter: 'Customs Law and Foreign Trade Policy', topics: ['Customs Duty Types and Classification Rules', 'Valuation of Imported and Exported Goods Rules', 'Duty Drawback, Warehousing and MOOWR Scheme', 'Foreign Trade Policy 2023 Schemes (RoDTEP, EPCG, Advance Authorisation)'] },
    ],
    'Integrated Business Solutions': [
      { chapter: 'Multidisciplinary Case Analysis 1 - Strategic Governance', topics: ['Corporate Governance Failures Analysis', 'Board Responsibilities and Audit Committee Oversight', 'Statutory Compliance Evaluation across Tax and Law'] },
      { chapter: 'Multidisciplinary Case Analysis 2 - Mergers & Valuation', topics: ['Cross-Functional M&A Evaluation', 'Financial Modelling and Tax Due Diligence', 'Accounting Treatment under Ind AS 103'] },
      { chapter: 'Multidisciplinary Case Analysis 3 - Cross-Border Tax & IRP', topics: ['International Tax Structuring and Transfer Pricing Risks', 'DTAA and BEPS Impact Analysis', 'Forex Exposure Mitigation using Derivatives'] },
      { chapter: 'Multidisciplinary Case Analysis 4 - Solvency and Reorganization', topics: ['Insolvency and Bankruptcy Resolution Scenarios', 'Debt Restructuring and Cash Flow Stress Testing', 'Forensic Audit and Fraud Risk Indicators'] },
    ],
  },
};

/**
 * Normalizes course string representation to canonical key (CA_FOUNDATION, CA_INTERMEDIATE, CA_FINAL).
 */
export function normalizeCourseKey(course: string): 'CA_FOUNDATION' | 'CA_INTERMEDIATE' | 'CA_FINAL' {
  if (!course) return 'CA_INTERMEDIATE';
  const clean = course.toUpperCase().replace(/[\s_-]+/g, '');
  if (clean.includes('FOUNDATION')) return 'CA_FOUNDATION';
  if (clean.includes('FINAL')) return 'CA_FINAL';
  return 'CA_INTERMEDIATE';
}

/**
 * Returns canonical Course display options for dropdowns.
 */
export const CANONICAL_COURSE_OPTIONS = [
  { label: 'CA Foundation', value: 'CA_FOUNDATION' },
  { label: 'CA Intermediate', value: 'CA_INTERMEDIATE' },
  { label: 'CA Final', value: 'CA_FINAL' },
];

/**
 * Retrieves valid subject names for a given course.
 */
export function getCourseSubjects(course: string): string[] {
  const normKey = normalizeCourseKey(course);
  const subjectsMap = CANONICAL_CURRICULUM_HIERARCHY[normKey];
  if (!subjectsMap) return [];
  return Object.keys(subjectsMap);
}

/**
 * Retrieves valid chapter names for a given course and subject.
 */
export function getSubjectChapters(course: string, subjectName: string): string[] {
  const normKey = normalizeCourseKey(course);
  const subjectsMap = CANONICAL_CURRICULUM_HIERARCHY[normKey];
  if (!subjectsMap) return [];

  // Match subject case-insensitively or fuzzy
  const targetSub = Object.keys(subjectsMap).find(
    (s) => s.toLowerCase() === subjectName.toLowerCase() ||
           subjectName.toLowerCase().includes(s.toLowerCase()) ||
           s.toLowerCase().includes(subjectName.toLowerCase())
  );

  if (!targetSub || !subjectsMap[targetSub]) return [];
  return subjectsMap[targetSub].map((c) => c.chapter);
}

/**
 * Retrieves valid topic names for a given course, subject, and chapter.
 */
export function getChapterTopics(course: string, subjectName: string, chapterName: string): string[] {
  const normKey = normalizeCourseKey(course);
  const subjectsMap = CANONICAL_CURRICULUM_HIERARCHY[normKey];
  if (!subjectsMap) return ['Not Applicable'];

  const targetSub = Object.keys(subjectsMap).find(
    (s) => s.toLowerCase() === subjectName.toLowerCase() ||
           subjectName.toLowerCase().includes(s.toLowerCase()) ||
           s.toLowerCase().includes(subjectName.toLowerCase())
  );
  if (!targetSub || !subjectsMap[targetSub]) return ['Not Applicable'];

  const targetChap = subjectsMap[targetSub].find(
    (c) => c.chapter.toLowerCase() === chapterName.toLowerCase() ||
           chapterName.toLowerCase().includes(c.chapter.toLowerCase()) ||
           c.chapter.toLowerCase().includes(chapterName.toLowerCase())
  );

  if (!targetChap || !targetChap.topics || targetChap.topics.length === 0) {
    return ['Not Applicable'];
  }

  return ['Not Applicable', ...targetChap.topics];
}

/**
 * Exact canonical Source Categories for MCQ Arena & Material Library.
 * Note: AI Generation is NOT a source category; it is tracked as a Generation Method.
 */
export const CANONICAL_SOURCE_CATEGORIES = [
  'RTP',
  'MTP',
  'PYQ',
  'ICAI Module',
  'Self-Created',
  'Conceptual Practice',
  'Practical',
  'Other',
] as const;

export type CanonicalSourceCategory = (typeof CANONICAL_SOURCE_CATEGORIES)[number];

/**
 * Returns true if the given Source Category requires the Attempt / Year field.
 * Only RTP, MTP, and PYQ require Attempt / Year.
 * All other source categories (ICAI Module, Self-Created, Conceptual Practice, Practical, Other) must NOT show it.
 */
export function isAttemptRequiredSource(sourceCategory?: string | null): boolean {
  if (!sourceCategory) return false;
  const upper = sourceCategory.toUpperCase().trim();
  return upper === 'RTP' || upper === 'MTP' || upper === 'PYQ';
}

/**
 * Suggested structured Attempt / Year values for RTP, MTP, and PYQ.
 */
export function getAttemptSuggestions(sourceCategory?: string | null): string[] {
  if (!sourceCategory) return [];
  const upper = sourceCategory.toUpperCase().trim();
  if (upper === 'RTP') {
    return ['September 2026', 'May 2026', 'January 2027', 'November 2025', 'May 2025'];
  }
  if (upper === 'MTP') {
    return [
      'May 2026 - Series 1',
      'May 2026 - Series 2',
      'September 2026 - Series 1',
      'September 2026 - Series 2',
      'November 2025 - Series 1',
      'November 2025 - Series 2',
    ];
  }
  if (upper === 'PYQ') {
    return ['May 2025', 'September 2025', 'January 2026', 'November 2024', 'May 2024'];
  }
  return [];
}

