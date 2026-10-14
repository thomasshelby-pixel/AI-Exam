import { db } from '../db.js';
import { CA_CURRICULUM } from '../../src/data/caCurriculum.js';

export interface EvidenceItem {
  id: string; // Stable evidence identifier: `${evalId}_Q${qNum}_${step}`
  evaluationId: string;
  evaluationVersionId: string;
  date: string;
  level: string;
  subjectKey: string;
  subjectName: string;
  paper: string;
  attempt: string;
  questionNumber: string;
  subQuestion?: string;
  marksLost: number;
  observedIssue: string;
  evidenceReference: string;
  deductionReason: string;
  isEstimate?: boolean;
}

export interface RecurringPattern {
  id: string;
  title: string;
  category: string;
  description: string;
  detectionCount: number; // Distinct evaluations where pattern was detected
  evaluationsCount: number; // Total eligible evaluations analysed in current scope
  affectedComponentsCount: number; // Distinct deduction records supporting this pattern
  typicalLoss: string;
  isLossEstimated: boolean; // Indicates if typical loss is an audited fact vs estimate
  examples: string[];
  nextTimeRule: string;
  subjectArea: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence: EvidenceItem[];
}

export interface ImprovedPattern {
  id: string;
  title: string;
  category: string;
  subjectName: string;
  previousOccurrenceCount: number;
  previousEvaluationsCount: number;
  recentStatus: string;
  status: 'IMPROVING' | 'RESOLVED';
  improvementSummary: string;
  evidenceComparison: {
    earlierEvaluationId: string;
    earlierQuestion: string;
    earlierLoss: number;
    recentEvaluationId: string;
    recentQuestion: string;
    recentLoss: number;
    marksRecovered: number;
  };
}

export interface RecoveredMarkItem {
  subjectName: string;
  area: string;
  marksRecovered: number;
  detail: string;
  earlierEvaluationId: string;
  recentEvaluationId: string;
  isEstimate: boolean;
}

export interface SubjectExaminerPatternFlow {
  subjectKey: string;
  subjectName: string;
  subjectCategory: 'LAW' | 'TAX' | 'ACCOUNTS' | 'AUDIT' | 'COSTING' | 'FM' | 'ECONOMICS' | 'QUANT' | 'GENERAL';
  title: string;
  stepFlow: string[];
  evaluationsCount: number;
  hasEvaluations: boolean;
  observedCompliance: string;
  keyObservation: string;
}

export interface SubjectOption {
  key: string;
  name: string;
  paperNumber?: number;
  group?: string;
  evaluationsCount: number;
  hasData: boolean;
}

export interface StudentExaminerProfile {
  studentId: string;
  selectedSubject: string; // 'all' or specific subjectKey / name
  selectedSubjectName: string; // Display label e.g. "All Subjects" or "Taxation (Income Tax & GST)"
  caLevel: string; // 'FOUNDATION' | 'INTERMEDIATE' | 'FINAL'
  availableSubjects: SubjectOption[];
  evaluationsAnalysed: number;
  insufficientHistory: boolean;
  message?: string;
  recurringPatternsCount: number;
  improvedPatternsCount: number;
  attentionNeededCount: number;
  marksRecoveredTotal: number;
  marksRecoveredStatus: 'AVAILABLE' | 'INSUFFICIENT_DATA';
  recurringPatterns: RecurringPattern[];
  improvedPatterns: ImprovedPattern[];
  marksRecovered: RecoveredMarkItem[];
  subjectPatterns: SubjectExaminerPatternFlow[];
  currentFocusAreas: string[];
  lastEvaluationId?: string;
  updatedAt: string;
}

// 11 Canonical Pattern Definitions adhering strictly to ICAI Step Marking Rules
export const PATTERN_DEFINITIONS: Record<
  string,
  {
    title: string;
    category: string;
    description: string;
    nextTimeRule: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
  }
> = {
  incomplete_conclusions: {
    title: 'Incomplete Conclusions',
    category: 'Presentation & Closure',
    description:
      'Missing or abrupt concluding sentence, failure to provide direct unequivocal advice to the client, or omitting the final statement answering the core question requirement.',
    nextTimeRule:
      'ICAI Step Rule: Provision → Application → Conclusion. Dedicate a separate concluding paragraph explicitly addressing the problem requirement.',
    severity: 'HIGH',
  },
  missing_provisions: {
    title: 'Missing Statutory Provisions & Standards',
    category: 'Legal & Regulatory Rigor',
    description:
      'Omitting citations of relevant statutory sections (e.g. Companies Act, Income Tax Act), AS, Ind AS, or Standards on Auditing (SA) required in step marking.',
    nextTimeRule:
      'Cite the governing Section / AS / SA upfront. If exact section number is uncertain, state: "As per the relevant provisions of the Act..." with accurate legal principle.',
    severity: 'HIGH',
  },
  weak_application: {
    title: 'Weak Application to Case Facts',
    category: 'Case-Law Analysis',
    description:
      'Reciting legal provisions, theoretical rules, or tax sections in isolation without actively linking and correlating them to the specific factual matrix given in the problem.',
    nextTimeRule:
      'Apply every element of the statutory condition directly to the facts: "In the given case, Mr. X did Y, which satisfies / contravenes condition Z."',
    severity: 'HIGH',
  },
  missing_working_notes: {
    title: 'Missing or Incomplete Working Notes',
    category: 'Practical & Numerical Papers',
    description:
      'Arriving at figures without transparent, cross-referenced working notes or schedules. In ICAI marking schemes, working notes carry up to 40-50% of step marks.',
    nextTimeRule:
      'Label every working note clearly (WN-1, WN-2). Cross-reference every derived figure in the main answer with its working note reference.',
    severity: 'HIGH',
  },
  calculation_errors: {
    title: 'Calculation & Arithmetic Slips',
    category: 'Numerical Accuracy',
    description:
      'Mathematical inaccuracies, arithmetic slips, or transcription errors in intermediate steps leading to penalized final answers.',
    nextTimeRule:
      'Perform dual verification of arithmetic totals and reconciliation figures before finalizing ledger balances and computation schedules.',
    severity: 'MEDIUM',
  },
  incorrect_treatment: {
    title: 'Incorrect Accounting / Tax Treatment',
    category: 'Technical Classification',
    description:
      'Misclassification of transactions (e.g., capital vs. revenue, wrong head of income, incorrect journal entry, or contravention of standard treatment).',
    nextTimeRule:
      'Verify governing standard criteria before determining balance sheet capitalization, tax head classification, or debit/credit classification.',
    severity: 'HIGH',
  },
  incomplete_coverage: {
    title: 'Incomplete Answer Coverage',
    category: 'Question Completeness',
    description:
      'Answering only partial components of composite questions, overlooking secondary sub-requirements, or omitting disclosures.',
    nextTimeRule:
      'Annotate each sub-question before writing to ensure all parts (e.g. "advise on validity AND calculate penalty") are fully addressed.',
    severity: 'MEDIUM',
  },
  requirement_not_followed: {
    title: 'Question Requirement Not Followed',
    category: 'Exam Discipline',
    description:
      'Preparing an unintended format (e.g., preparing statement of profit & loss instead of journal entries, or discussing theory when computation was demanded).',
    nextTimeRule:
      'Highlight action verbs in the question stem: "Draft Journal Entries", "Compute Tax Liability", "Advise the Board", "Evaluate Options".',
    severity: 'MEDIUM',
  },
  unsupported_assumptions: {
    title: 'Unsupported or Unstated Assumptions',
    category: 'Analytical Precision',
    description:
      'Making arbitrary assumptions without stating them explicitly in the working notes when multiple interpretations exist in ICAI material.',
    nextTimeRule:
      'Where ambiguity exists, explicitly state: "Note: It is assumed that...", referencing ICAI alternate presentation guidelines.',
    severity: 'LOW',
  },
  presentation_issues: {
    title: 'Avoidable Presentation & Formatting Issues',
    category: 'Presentation & Formatting',
    description:
      'Cluttered tabular layouts, missing proper account headings, lack of date/particulars columns, or unorganized rough work.',
    nextTimeRule:
      'Draw neat tabular columns with proper headings, currency signs, and distinct underlines for totals in financial statements.',
    severity: 'LOW',
  },
  conceptual_mistakes: {
    title: 'Repeated Conceptual Deviations',
    category: 'Core Understanding',
    description:
      'Fundamental deviations in core legal, taxation, or accounting concepts that recur across multiple answers.',
    nextTimeRule:
      'Review fundamental conceptual foundations in ICAI Study Material and practice revision test papers (RTPs) for the impacted topic.',
    severity: 'HIGH',
  },
};

/**
 * Determine subject category and step chain for subject-specific analysis.
 */
export function getSubjectCategory(
  subjectKey: string,
  subjectName: string
): 'LAW' | 'TAX' | 'ACCOUNTS' | 'AUDIT' | 'COSTING' | 'FM' | 'ECONOMICS' | 'QUANT' | 'GENERAL' {
  const s = `${subjectKey || ''} ${subjectName || ''}`.toLowerCase();
  if (s.includes('tax') || s.includes('direct') || s.includes('indirect') || s.includes('gst')) {
    return 'TAX';
  }
  if (s.includes('law') || s.includes('corporate') || s.includes('jurisprudence') || s.includes('business law')) {
    return 'LAW';
  }
  if (s.includes('audit') || s.includes('ethics') || s.includes('assurance')) {
    return 'AUDIT';
  }
  if (s.includes('cost') || s.includes('costing') || s.includes('management accounting')) {
    return 'COSTING';
  }
  if (s.includes('fm') || s.includes('financial management') || s.includes('afm') || s.includes('strategic management')) {
    return 'FM';
  }
  if (s.includes('economics') || s.includes('business economics')) {
    return 'ECONOMICS';
  }
  if (s.includes('quantitative') || s.includes('math') || s.includes('stats') || s.includes('logical')) {
    return 'QUANT';
  }
  if (s.includes('account') || s.includes('financial reporting') || s.includes('adv_acc')) {
    return 'ACCOUNTS';
  }
  return 'GENERAL';
}

/**
 * Contextualize pattern titles, categories, and next-time rules per subject discipline.
 * Prevents labeling Taxation mistakes as "Case-Law Analysis" or giving legal advice on numerical papers.
 */
export function getContextualizedPatternMeta(
  patternId: string,
  subjectCategory: string
): {
  title: string;
  category: string;
  description: string;
  nextTimeRule: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
} {
  const base = PATTERN_DEFINITIONS[patternId] || {
    title: patternId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    category: 'Exam Performance',
    description: 'Recurring observation noted across multiple evaluations.',
    nextTimeRule: 'Follow ICAI step marking rules and structured presentation.',
    severity: 'MEDIUM' as const,
  };

  if (subjectCategory === 'TAX') {
    if (patternId === 'weak_application') {
      return {
        title: 'Weak Application to Assessee Facts',
        category: 'Tax Provisions & Statutory Application',
        description: 'Applying statutory sections or tax rates in the abstract without correlating specific assessee conditions (e.g. turnover limits, holding periods, residency, or specific transaction dates).',
        nextTimeRule: 'Apply each condition of the governing Section directly to the assessee facts before computing exemptions, deductions, or net tax liability.',
        severity: 'HIGH',
      };
    }
    if (patternId === 'missing_provisions') {
      return {
        title: 'Missing Statutory Sections & Rules',
        category: 'Statutory Tax Rigor',
        description: 'Omitting citations of relevant statutory sections (e.g. Section 115BAC, Sec 54, Sec 194-IA, or CGST Section 16/17) required for full step credit.',
        nextTimeRule: 'Cite the governing Section and Sub-section upfront (e.g., "As per Section 54 of the Income-tax Act, 1961...").',
        severity: 'HIGH',
      };
    }
    if (patternId === 'calculation_errors') {
      return {
        title: 'Tax Computation & Surcharge Slips',
        category: 'Tax Computation Mechanics',
        description: 'Calculation variances, slab rate slips, or omission of cess/surcharge in the final tax liability schedule.',
        nextTimeRule: 'Cross-verify tax slab rates, Rebate u/s 87A, surcharge thresholds, and the mandatory 4% Health and Education Cess.',
        severity: 'MEDIUM',
      };
    }
    if (patternId === 'missing_working_notes') {
      return {
        title: 'Missing Tax Computation Working Notes',
        category: 'Tax Working Notes & Schedules',
        description: 'Stating final taxable income or GST liability without supporting working notes explaining exemptions, deductions, or blocked credit u/s 17(5).',
        nextTimeRule: 'Prepare numbered working notes (WN-1, WN-2) for each income head, exemption calculation, and ITC determination.',
        severity: 'HIGH',
      };
    }
  }

  if (subjectCategory === 'LAW') {
    if (patternId === 'weak_application') {
      return {
        title: 'Weak Application to Case Facts',
        category: 'Legal Reasoning & Fact Correlation',
        description: 'Reciting statutory provisions in isolation without analyzing how each legal condition applies to the parties and events in the question.',
        nextTimeRule: 'Follow the 3-step ICAI structure: Provision → Application to Facts → Unequivocal Client Conclusion.',
        severity: 'HIGH',
      };
    }
    if (patternId === 'incomplete_conclusions') {
      return {
        title: 'Incomplete Concluding Advice',
        category: 'Legal Presentation & Client Advice',
        description: 'Omitting a direct, definitive answer to the specific query posed by the client or question requirement.',
        nextTimeRule: 'Conclude with a clear, standalone paragraph answering the exact question: "Therefore, the company\'s action is valid/invalid because..."',
        severity: 'HIGH',
      };
    }
  }

  if (subjectCategory === 'ACCOUNTS' || subjectCategory === 'COSTING') {
    if (patternId === 'missing_working_notes') {
      return {
        title: 'Missing or Incomplete Working Notes',
        category: 'Practical Working Notes & Schedules',
        description: 'Entering figures in the main statement or cost sheet without transparent, cross-referenced working notes (carrying up to 40% of step marks).',
        nextTimeRule: 'Number every working note (WN-1, WN-2) and explicitly cross-reference the note number next to the main figure.',
        severity: 'HIGH',
      };
    }
    if (patternId === 'calculation_errors') {
      return {
        title: 'Calculation & Arithmetic Slips',
        category: 'Numerical Accuracy',
        description: 'Arithmetic slips in ledger balances, cost allocations, or final financial statement totals.',
        nextTimeRule: 'Double-check reconciliation totals, carry-forward balances, and cost variance formulas before finalizing answers.',
        severity: 'MEDIUM',
      };
    }
    if (patternId === 'weak_application') {
      return {
        title: 'Working Note Alignment to Problem Facts',
        category: 'Numerical Mechanics & Schedules',
        description: 'Omitting case-specific adjustment details in the ledger or schedule workings.',
        nextTimeRule: 'Show the precise arithmetic steps and factual adjustments in your working notes rather than jumping directly to final balances.',
        severity: 'MEDIUM',
      };
    }
  }

  if (subjectCategory === 'AUDIT') {
    if (patternId === 'missing_provisions') {
      return {
        title: 'Missing Standards on Auditing (SA) Citations',
        category: 'Auditing Standards & Compliance',
        description: 'Omitting citations of relevant Standards on Auditing (e.g. SA 200, SA 500, SA 700 series) or CARO 2020 clauses.',
        nextTimeRule: 'State the applicable SA number and standard title upfront before detailing audit procedures.',
        severity: 'HIGH',
      };
    }
    if (patternId === 'weak_application') {
      return {
        title: 'Insufficient Audit Procedure Specificity',
        category: 'Audit Procedures & Evidence',
        description: 'Providing broad theoretical statements rather than specifying practical audit procedures to gather sufficient appropriate audit evidence.',
        nextTimeRule: 'Frame audit answers in actionable procedural steps: "The auditor should inspect, obtain external confirmation, and verify reconciliation..."',
        severity: 'HIGH',
      };
    }
  }

  if (subjectCategory === 'FM') {
    if (patternId === 'missing_working_notes') {
      return {
        title: 'Missing Financial Model Workings',
        category: 'Financial Modeling & Workings',
        description: 'Presenting valuation or capital budgeting figures without showing the cash flow or discount rate derivations.',
        nextTimeRule: 'State the financial formula, show explicit discount factor tables, and display step-wise derivations for NPV, IRR, or WACC.',
        severity: 'HIGH',
      };
    }
  }

  return base;
}

/**
 * Categorize a question/component issue into one of the 11 recognized patterns.
 * Considers componentType, deductionReason, comment, and subjectCategory.
 */
export function classifyIssue(
  compType: string,
  deductionReason: string,
  questionReason: string,
  missingReq: string,
  comment: string,
  subjectCategory: string = 'GENERAL'
): string | null {
  const upperType = (compType || '').toUpperCase().trim();
  const text = `${deductionReason} ${questionReason} ${missingReq} ${comment}`.toLowerCase();

  // 0. Explicit Component Types take precedence when valid
  if (upperType === 'APPLICATION') return 'weak_application';
  if (upperType === 'CONCLUSION') return 'incomplete_conclusions';
  if (upperType === 'PROVISION' || upperType === 'PRINCIPLE') return 'missing_provisions';
  if (upperType === 'WORKING') return 'missing_working_notes';
  if (upperType === 'CALCULATION') return 'calculation_errors';
  if (upperType === 'ASSUMPTION') return 'unsupported_assumptions';
  if (upperType === 'PRESENTATION') return 'presentation_issues';
  if (upperType === 'TREATMENT') return 'incorrect_treatment';

  // Specific high-priority keyword checks
  if (
    text.includes('facts not correlated') ||
    text.includes('not correlated') ||
    text.includes('weak application') ||
    text.includes('application to fact') ||
    text.includes('substantiate with fact')
  ) {
    return 'weak_application';
  }

  // 1. Calculations & Arithmetic
  if (
    text.includes('calculation error') ||
    text.includes('arithmetic') ||
    text.includes('computation slip') ||
    text.includes('mathematical slip') ||
    text.includes('wrong total') ||
    text.includes('gross up') ||
    text.includes('calculation variance')
  ) {
    return 'calculation_errors';
  }

  // 2. Working Notes
  if (
    text.includes('working note') ||
    text.includes('working notes') ||
    text.includes('workings missing') ||
    text.includes('schedule missing') ||
    text.includes('no working note') ||
    text.includes('supporting workings')
  ) {
    return 'missing_working_notes';
  }

  // 3. Statutory Provisions & Standards
  if (
    text.includes('section not cited') ||
    text.includes('missing section') ||
    text.includes('provision not cited') ||
    text.includes('applicable standard') ||
    text.includes('accounting standard') ||
    text.includes('standards on auditing') ||
    text.includes('sa ') ||
    text.includes('ind as') ||
    text.includes('statutory provision') ||
    text.includes('rule not cited')
  ) {
    return 'missing_provisions';
  }

  // 4. Conclusions & Client Advice
  if (
    text.includes('conclusion missing') ||
    text.includes('incomplete conclusion') ||
    text.includes('no conclusion') ||
    text.includes('concluding sentence') ||
    text.includes('advice to client missing') ||
    text.includes('final conclusion')
  ) {
    return 'incomplete_conclusions';
  }

  // 5. Treatment & Technical Classification
  if (
    text.includes('incorrect treatment') ||
    text.includes('accounting treatment') ||
    text.includes('wrong debit') ||
    text.includes('wrong credit') ||
    text.includes('tax head') ||
    text.includes('blocked credit') ||
    text.includes('set off')
  ) {
    return 'incorrect_treatment';
  }

  // 6. Assumptions
  if (
    text.includes('assumption') ||
    text.includes('unstated assumption') ||
    text.includes('unsupported assumption')
  ) {
    return 'unsupported_assumptions';
  }

  // 7. Presentation & Formatting
  if (
    text.includes('presentation') ||
    text.includes('tabular format') ||
    text.includes('formatting issue') ||
    text.includes('cluttered layout') ||
    text.includes('heading missing')
  ) {
    return 'presentation_issues';
  }

  // 8. Requirement Not Followed
  if (
    text.includes('requirement not followed') ||
    text.includes('not as requested') ||
    text.includes('format required') ||
    text.includes('demanded journal')
  ) {
    return 'requirement_not_followed';
  }

  // 9. Incomplete Coverage
  if (
    text.includes('incomplete answer') ||
    text.includes('partially omitted') ||
    text.includes('sub-question omitted') ||
    text.includes('incomplete coverage')
  ) {
    return 'incomplete_coverage';
  }

  // 10. Conceptual Mistakes
  if (
    text.includes('conceptual') ||
    text.includes('concept error') ||
    text.includes('fundamental error')
  ) {
    return 'conceptual_mistakes';
  }

  return null;
}

/**
 * Standard Subject-specific step frameworks based on ICAI question requirements.
 */
function getSubjectStepFlow(
  subjectKey: string,
  subjectName: string,
  subjectCategory: string
): { title: string; stepFlow: string[] } {
  switch (subjectCategory) {
    case 'LAW':
      return {
        title: subjectName || 'Corporate and Other Laws',
        stepFlow: [
          'Legal Issue & Fact Matrix',
          'Governing Statutory Provision & Rules',
          'Application of Law to Facts',
          'Direct Concluding Advice',
        ],
      };
    case 'TAX':
      return {
        title: subjectName || 'Taxation (Income Tax & GST)',
        stepFlow: [
          'Governing Statutory Section & Thresholds',
          'Computation Schedules & Exemptions / ITC',
          'Tax Treatment & Set-off / Surcharge',
          'Net Tax Liability / Final Conclusion',
        ],
      };
    case 'ACCOUNTS':
      return {
        title: subjectName || 'Advanced Accounting',
        stepFlow: [
          'Applicable Standard / Policy (AS/Ind AS)',
          'Working Notes & Schedules',
          'Ledger Entries & Adjustments',
          'Final Balance / Financial Statements',
        ],
      };
    case 'AUDIT':
      return {
        title: subjectName || 'Auditing and Ethics',
        stepFlow: [
          'Auditing Standard (SA / SQC / CARO)',
          'Mandatory Audit Procedures',
          'Evaluation of Audit Evidence',
          'Auditor Reporting & Opinion',
        ],
      };
    case 'COSTING':
      return {
        title: subjectName || 'Cost and Management Accounting',
        stepFlow: [
          'Costing Methodology & Formula',
          'Detailed Workings & Cost Sheet',
          'Variance / Marginal Calculation',
          'Management Decision & Summary',
        ],
      };
    case 'FM':
      return {
        title: subjectName || 'Financial Management and Strategic Management',
        stepFlow: [
          'Financial Formula & Model',
          'Cash Flow / Rate Determination',
          'Computation (NPV / IRR / WACC)',
          'Strategic Decision & Recommendation',
        ],
      };
    case 'ECONOMICS':
      return {
        title: subjectName || 'Business Economics',
        stepFlow: [
          'Economic Concept & Model',
          'Market Determinants & Graph Logic',
          'Application to Scenario',
          'Concluding Assessment',
        ],
      };
    case 'QUANT':
      return {
        title: subjectName || 'Quantitative Aptitude',
        stepFlow: [
          'Formula Identification',
          'Step-by-step Substitution',
          'Intermediate Calculation',
          'Final Numerical Solution',
        ],
      };
    default:
      return {
        title: subjectName || 'Comprehensive Evaluation',
        stepFlow: ['Concept / Rule', 'Detailed Workings', 'Application', 'Final Result'],
      };
  }
}

/**
 * Subject match helper for strict server-side filtering.
 */
export function matchesSubject(
  filter: string | undefined,
  evalSubjectKey: string,
  evalSubjectName: string
): boolean {
  if (!filter || filter.toLowerCase() === 'all') return true;
  const f = filter.toLowerCase().trim();
  const k = (evalSubjectKey || '').toLowerCase().trim();
  const n = (evalSubjectName || '').toLowerCase().trim();

  if (k === f || n === f) return true;

  const normF = f.replace(/[^a-z0-9]/g, '');
  const normK = k.replace(/[^a-z0-9]/g, '');
  const normN = n.replace(/[^a-z0-9]/g, '');

  if (normK === normF || normN === normF) return true;

  // Specific canonical mappings
  if (normF.includes('tax') || f === 'inter_taxation') {
    return normK.includes('tax') || normN.includes('tax');
  }
  if (normF.includes('law') || f === 'inter_corporate_law') {
    return normK.includes('law') || normN.includes('law');
  }
  if (normF.includes('accounting') || normF.includes('account') || f === 'inter_advanced_accounting') {
    return normK.includes('account') || normN.includes('account');
  }
  if (normF.includes('audit') || f === 'inter_auditing') {
    return normK.includes('audit') || normN.includes('audit');
  }
  if (normF.includes('cost') || f === 'inter_costing') {
    return normK.includes('cost') || normN.includes('cost');
  }
  if (normF.includes('fm') || normF.includes('financialmanagement') || f === 'inter_fm_sm') {
    return normK.includes('fm') || normN.includes('financialmanagement') || normK.includes('afm');
  }
  if (normF.includes('economics') || f === 'foundation_business_economics') {
    return normK.includes('econ') || normN.includes('econ');
  }
  if (normF.includes('quant') || f === 'foundation_quantitative_aptitude') {
    return normK.includes('quant') || normN.includes('quant');
  }

  return normK.includes(normF) || normN.includes(normF) || normF.includes(normK) || normF.includes(normN);
}

/**
 * Level match helper ensuring student CA level isolates evaluation history.
 */
export function matchesLevel(evalLevel: string, studentCaLevel: string): boolean {
  if (!evalLevel || !studentCaLevel) return true;
  const el = evalLevel.toUpperCase().replace(/[^A-Z]/g, '');
  const sl = studentCaLevel.toUpperCase().replace(/[^A-Z]/g, '');

  if (sl.includes('FOUNDATION') || el.includes('FOUNDATION')) {
    return (sl.includes('FOUNDATION') && el.includes('FOUNDATION')) || sl === el;
  }
  if (sl.includes('FINAL') || el.includes('FINAL')) {
    return (sl.includes('FINAL') && el.includes('FINAL')) || sl === el;
  }
  if (sl.includes('INTER') || el.includes('INTER')) {
    return (sl.includes('INTER') && el.includes('INTER')) || sl === el;
  }
  return el === sl;
}

/**
 * Compute the Personal Examiner Profile from the student's authoritative evaluation records.
 * Supports strict subject-wise filtering, course awareness, deduplication, and evidence fidelity.
 */
export function calculateStudentExaminerProfile(
  studentId: string,
  subjectFilter?: string
): StudentExaminerProfile {
  // 1. Determine Student CA Level
  let caLevel: string = 'INTERMEDIATE';
  try {
    const prof = db
      .prepare(`SELECT ca_level FROM student_profiles WHERE user_id = ?`)
      .get(studentId) as { ca_level?: string } | undefined;
    if (prof?.ca_level) {
      caLevel = prof.ca_level.toUpperCase();
    } else {
      const latestEval = db
        .prepare(`SELECT level FROM evaluations WHERE student_id = ? ORDER BY created_at DESC LIMIT 1`)
        .get(studentId) as { level?: string } | undefined;
      if (latestEval?.level) {
        caLevel = latestEval.level.toUpperCase();
      }
    }
  } catch {
    // ignore
  }

  // Fallback to INTERMEDIATE if not FOUNDATION or FINAL
  if (caLevel !== 'FOUNDATION' && caLevel !== 'FINAL') {
    caLevel = 'INTERMEDIATE';
  }

  // 2. Fetch all completed evaluations for this student and filter strictly by active CA level
  const allCandidateRows = db
    .prepare(`
      SELECT 
        id, 
        level, 
        subject_key, 
        subject_name, 
        attempt, 
        total_marks, 
        maximum_marks, 
        percentage, 
        grade, 
        status, 
        result_json, 
        current_evaluation_version_id, 
        created_at, 
        completed_at
      FROM evaluations
      WHERE student_id = ? AND status = 'COMPLETED' AND result_json IS NOT NULL
      ORDER BY created_at ASC
    `)
    .all(studentId) as Array<{
    id: string;
    level: string;
    subject_key: string;
    subject_name: string;
    attempt: string;
    total_marks: number;
    maximum_marks: number;
    percentage: number;
    grade: string;
    status: string;
    result_json: string;
    current_evaluation_version_id?: string;
    created_at: string;
    completed_at?: string;
  }>;

  // Strict Level Isolation: Only include evaluations matching the student's active CA level
  const allRows = allCandidateRows.filter((r) => matchesLevel(r.level, caLevel));

  // 3. Build Course-Aware Available Subjects for the student's CA level
  const curriculumLevel = (caLevel === 'FOUNDATION'
    ? CA_CURRICULUM.FOUNDATION
    : caLevel === 'FINAL'
    ? CA_CURRICULUM.FINAL
    : CA_CURRICULUM.INTERMEDIATE);

  const availableSubjects: SubjectOption[] = curriculumLevel.subjects.map((s) => {
    const count = allRows.filter((r) => matchesSubject(s.key, r.subject_key, r.subject_name)).length;
    return {
      key: s.key,
      name: s.name,
      paperNumber: s.paperNumber,
      group: s.group,
      evaluationsCount: count,
      hasData: count > 0,
    };
  });

  // Determine active subject filter
  const isAllSubjects = !subjectFilter || subjectFilter.toLowerCase() === 'all';
  let selectedSubject = isAllSubjects ? 'all' : subjectFilter;
  let selectedSubjectName = 'All Subjects';

  if (!isAllSubjects) {
    const matchedSub = availableSubjects.find((s) => matchesSubject(selectedSubject, s.key, s.name));
    if (matchedSub) {
      selectedSubjectName = matchedSub.name;
    } else {
      selectedSubjectName = selectedSubject;
    }
  }

  // Filter rows based on selectedSubject
  const rows = isAllSubjects
    ? allRows
    : allRows.filter((r) => matchesSubject(selectedSubject, r.subject_key, r.subject_name));

  const evaluationsAnalysed = rows.length;
  const nowIso = new Date().toISOString();
  const levelTitle =
    caLevel === 'FOUNDATION'
      ? 'CA Foundation'
      : caLevel === 'FINAL'
      ? 'CA Final'
      : 'CA Intermediate';

  // If 0 evaluations in this scope -> clean, truthful empty state
  if (evaluationsAnalysed === 0) {
    const flowMeta = !isAllSubjects
      ? getSubjectStepFlow(selectedSubject, selectedSubjectName, getSubjectCategory(selectedSubject, selectedSubjectName))
      : { title: 'All Subjects', stepFlow: ['Concept / Rule', 'Detailed Workings', 'Application', 'Final Result'] };

    return {
      studentId,
      selectedSubject,
      selectedSubjectName,
      caLevel,
      availableSubjects,
      evaluationsAnalysed: 0,
      insufficientHistory: true,
      message: isAllSubjects
        ? `No evaluation history available for ${levelTitle} yet. No completed evaluations found. Upload an answer sheet to begin building your examiner profile for this level.`
        : `No evaluation history available for ${selectedSubjectName} in ${levelTitle} yet. No completed evaluations found for this subject. Upload an answer sheet to audit your step compliance against official ICAI suggested answer patterns.`,
      recurringPatternsCount: 0,
      improvedPatternsCount: 0,
      attentionNeededCount: 0,
      marksRecoveredTotal: 0,
      marksRecoveredStatus: 'INSUFFICIENT_DATA',
      recurringPatterns: [],
      improvedPatterns: [],
      marksRecovered: [],
      subjectPatterns: isAllSubjects
        ? availableSubjects.map((s) => ({
            subjectKey: s.key,
            subjectName: s.name,
            subjectCategory: getSubjectCategory(s.key, s.name),
            title: s.name,
            stepFlow: getSubjectStepFlow(s.key, s.name, getSubjectCategory(s.key, s.name)).stepFlow,
            evaluationsCount: 0,
            hasEvaluations: false,
            observedCompliance: `No completed evaluations in ${levelTitle} yet`,
            keyObservation: `Upload a paper for ${s.name} (${levelTitle}) to audit your step compliance against official ICAI suggested answer patterns.`,
          }))
        : [
            {
              subjectKey: selectedSubject,
              subjectName: selectedSubjectName,
              subjectCategory: getSubjectCategory(selectedSubject, selectedSubjectName),
              title: flowMeta.title,
              stepFlow: flowMeta.stepFlow,
              evaluationsCount: 0,
              hasEvaluations: false,
              observedCompliance: `No completed evaluations in ${levelTitle} yet`,
              keyObservation: `Upload a paper for ${selectedSubjectName} (${levelTitle}) to audit your step compliance against official ICAI suggested answer patterns.`,
            },
          ],
      currentFocusAreas: [],
      updatedAt: nowIso,
    };
  }

  // If 1 evaluation in this scope -> Insufficient history for recurrence (< 2 distinct evaluations)
  if (evaluationsAnalysed < 2) {
    const r0 = rows[0];
    const cat0 = getSubjectCategory(r0.subject_key, r0.subject_name);
    const flowMeta0 = getSubjectStepFlow(r0.subject_key, r0.subject_name, cat0);

    return {
      studentId,
      selectedSubject,
      selectedSubjectName,
      caLevel,
      availableSubjects,
      evaluationsAnalysed: 1,
      insufficientHistory: true,
      message: `Your Personal Examiner Profile is building for ${selectedSubjectName}. 1 evaluation has been analysed; recurring patterns are only established after ≥2 distinct evaluations to ensure strict evidence-based accuracy.`,
      recurringPatternsCount: 0,
      improvedPatternsCount: 0,
      attentionNeededCount: 0,
      marksRecoveredTotal: 0,
      marksRecoveredStatus: 'INSUFFICIENT_DATA',
      recurringPatterns: [],
      improvedPatterns: [],
      marksRecovered: [],
      subjectPatterns: [
        {
          subjectKey: r0.subject_key,
          subjectName: r0.subject_name,
          subjectCategory: cat0,
          title: flowMeta0.title,
          stepFlow: flowMeta0.stepFlow,
          evaluationsCount: 1,
          hasEvaluations: true,
          observedCompliance: 'Baseline Established (1 evaluation)',
          keyObservation: 'Complete a second evaluation in this subject to verify recurring step-marking patterns.',
        },
      ],
      currentFocusAreas: [],
      lastEvaluationId: r0.id,
      updatedAt: nowIso,
    };
  }

  // Parse all evaluation results
  interface ParsedEval {
    row: (typeof rows)[0];
    result: any;
    date: string;
  }

  const parsedEvals: ParsedEval[] = [];
  for (const r of rows) {
    try {
      const parsed = typeof r.result_json === 'string' ? JSON.parse(r.result_json) : r.result_json;
      if (parsed && typeof parsed === 'object') {
        parsedEvals.push({
          row: r,
          result: parsed,
          date: r.completed_at || r.created_at,
        });
      }
    } catch {
      // ignore corrupt json
    }
  }

  // Map of patternId -> { evidence: EvidenceItem[], evalIds: Set<string>, subjectKeys: Set<string>, totalLoss: number, isEstimated: boolean }
  const patternMap = new Map<
    string,
    {
      evidence: EvidenceItem[];
      evalIds: Set<string>;
      subjectKeys: Set<string>;
      totalLoss: number;
      isEstimated: boolean;
    }
  >();

  // Map of evalIndex -> Set of patternIds detected in that evaluation
  const evalPatternsDetected = new Map<number, Set<string>>();

  // Also collect subject step flow compliance
  const subjectStepStats: Record<
    string,
    {
      totalAnswers: number;
      stepDeficiencies: Record<string, number>;
      subjects: Set<string>;
    }
  > = {
    LAW: { totalAnswers: 0, stepDeficiencies: {}, subjects: new Set() },
    TAX: { totalAnswers: 0, stepDeficiencies: {}, subjects: new Set() },
    ACCOUNTS: { totalAnswers: 0, stepDeficiencies: {}, subjects: new Set() },
    AUDIT: { totalAnswers: 0, stepDeficiencies: {}, subjects: new Set() },
    COSTING: { totalAnswers: 0, stepDeficiencies: {}, subjects: new Set() },
    FM: { totalAnswers: 0, stepDeficiencies: {}, subjects: new Set() },
    ECONOMICS: { totalAnswers: 0, stepDeficiencies: {}, subjects: new Set() },
    QUANT: { totalAnswers: 0, stepDeficiencies: {}, subjects: new Set() },
    GENERAL: { totalAnswers: 0, stepDeficiencies: {}, subjects: new Set() },
  };

  const seenEvidenceIds = new Set<string>();

  parsedEvals.forEach((pe, evalIndex) => {
    const evalId = pe.row.id;
    const versionId = pe.row.current_evaluation_version_id || 'v1';
    const subjKey = pe.row.subject_key || 'SUBJECT';
    const subjName = pe.row.subject_name || 'Subject';
    const lvl = pe.row.level || caLevel;
    const att = pe.row.attempt || 'Recent Attempt';
    const subjCat = getSubjectCategory(subjKey, subjName);

    subjectStepStats[subjCat].subjects.add(subjName);

    const patternsThisEval = new Set<string>();
    evalPatternsDetected.set(evalIndex, patternsThisEval);

    const questions: any[] = pe.result.questions || pe.result.questionEvaluations || [];

    questions.forEach((q: any) => {
      subjectStepStats[subjCat].totalAnswers++;

      const qNum = String(q.questionNumber || q.id || 'Q');
      const qLoss =
        Number(q.marksLost) ||
        Math.max(0, (Number(q.maximumMarks) || 0) - (Number(q.marksAwarded) || 0));
      const qReason = q.reasonForDeduction || q.deductionReason || '';
      const missingReq = Array.isArray(q.missingRequirements) ? q.missingRequirements.join('; ') : '';
      const comment = q.examinerComment || q.detailedFeedback || q.comment || '';

      const comps: any[] =
        q.markingComponents ||
        q.structuredEvidence?.markingComponents ||
        q.stepMarkingBreakdown ||
        q.components ||
        [];

      if (comps.length > 0) {
        comps.forEach((comp: any, compIdx: number) => {
          const cType = (comp.componentType || '').toString();
          // Never count MCQ single choices as descriptive step-marking habit unless specified
          if (cType.toUpperCase() === 'MCQ') {
            return;
          }

          const cLoss =
            Number(comp.marksDeducted ?? comp.marksLost) ||
            Math.max(
              0,
              (Number(comp.marksAvailable ?? comp.maxMarks ?? 0) - Number(comp.marksAwarded ?? 0))
            );

          const assessment = (comp.assessment || comp.status || '').toString().toUpperCase();
          const isAssessmentDeficient =
            assessment === 'PARTIALLY_CORRECT' ||
            assessment === 'INCORRECT' ||
            assessment === 'OMITTED';

          // STRICT DEFICIENCY CHECK:
          // A step is deficient ONLY if marks were lost (cLoss > 0) OR assessment indicates an actual deficiency with score deduction.
          // Correct steps with 0 mark loss are NEVER marked deficient!
          const isDeficient =
            cLoss > 0 ||
            (isAssessmentDeficient && Number(comp.marksAwarded ?? 0) < Number(comp.marksAvailable ?? 0));

          if (!isDeficient) {
            return; // Not deficient, skip
          }

          // Authoritative deduction reason: NEVER use expectedRequirement as deduction reason!
          const deductionReason =
            comp.deductionReason ||
            comp.examinerRemark ||
            (cLoss > 0 && comp.comment ? comp.comment : '') ||
            qReason ||
            'Step requirement incomplete under ICAI rubric';

          const patternId = classifyIssue(cType, deductionReason, qReason, missingReq, comment, subjCat);
          if (patternId) {
            // Stable deduplication key
            const stepId = comp.componentId || comp.step || comp.stepNumber || compIdx;
            const evidenceId = `${evalId}_Q${qNum}_${stepId}`;
            if (seenEvidenceIds.has(evidenceId)) {
              return;
            }
            seenEvidenceIds.add(evidenceId);

            patternsThisEval.add(patternId);

            // Update subject step stats
            subjectStepStats[subjCat].stepDeficiencies[patternId] =
              (subjectStepStats[subjCat].stepDeficiencies[patternId] || 0) + 1;

            if (!patternMap.has(patternId)) {
              patternMap.set(patternId, {
                evidence: [],
                evalIds: new Set(),
                subjectKeys: new Set(),
                totalLoss: 0,
                isEstimated: false,
              });
            }

            const entry = patternMap.get(patternId)!;
            entry.evalIds.add(evalId);
            entry.subjectKeys.add(subjName);
            entry.totalLoss += cLoss;

            entry.evidence.push({
              id: evidenceId,
              evaluationId: evalId,
              evaluationVersionId: versionId,
              date: pe.date,
              level: lvl,
              subjectKey: subjKey,
              subjectName: subjName,
              paper: pe.row.id,
              attempt: att,
              questionNumber: qNum,
              subQuestion: comp.componentName || comp.stepTitle || comp.stepName || undefined,
              marksLost: Number(cLoss.toFixed(2)),
              observedIssue: deductionReason,
              evidenceReference: comp.studentEvidence || 'Answer sheet submission',
              deductionReason,
              isEstimate: false,
            });
          }
        });
      } else if (qLoss > 0) {
        // Fallback when question doesn't have explicit markingComponents array
        const patternId = classifyIssue('GENERAL', qReason, qReason, missingReq, comment, subjCat);
        if (patternId) {
          const evidenceId = `${evalId}_Q${qNum}_main`;
          if (!seenEvidenceIds.has(evidenceId)) {
            seenEvidenceIds.add(evidenceId);

            patternsThisEval.add(patternId);
            subjectStepStats[subjCat].stepDeficiencies[patternId] =
              (subjectStepStats[subjCat].stepDeficiencies[patternId] || 0) + 1;

            if (!patternMap.has(patternId)) {
              patternMap.set(patternId, {
                evidence: [],
                evalIds: new Set(),
                subjectKeys: new Set(),
                totalLoss: 0,
                isEstimated: true,
              });
            }

            const entry = patternMap.get(patternId)!;
            entry.evalIds.add(evalId);
            entry.subjectKeys.add(subjName);
            entry.totalLoss += qLoss;

            entry.evidence.push({
              id: evidenceId,
              evaluationId: evalId,
              evaluationVersionId: versionId,
              date: pe.date,
              level: lvl,
              subjectKey: subjKey,
              subjectName: subjName,
              paper: pe.row.id,
              attempt: att,
              questionNumber: qNum,
              marksLost: Number(qLoss.toFixed(2)),
              observedIssue: qReason || missingReq || 'Question step requirement not fully satisfied',
              evidenceReference: 'Answer sheet submission',
              deductionReason: qReason || 'Marks lost in step evaluation',
              isEstimate: true,
            });
          }
        }
      }
    });
  });

  // Calculate RECURRING patterns:
  // Strictly requires evaluationIds.size >= 2 (spanning at least 2 distinct evaluations)
  const recurringPatterns: RecurringPattern[] = [];
  const latestEvalIndex = parsedEvals.length - 1;
  const latestEval = parsedEvals[latestEvalIndex];
  const latestPatterns = evalPatternsDetected.get(latestEvalIndex) || new Set<string>();

  const improvedPatterns: ImprovedPattern[] = [];
  const recoveredMarksList: RecoveredMarkItem[] = [];

  for (const [patternId, data] of patternMap.entries()) {
    const isRecurring = data.evalIds.size >= 2;

    // Determine representative subject category for contextualizing title/category/rule
    const primarySubjCat = isAllSubjects
      ? getSubjectCategory('', Array.from(data.subjectKeys)[0] || '')
      : getSubjectCategory(selectedSubject, selectedSubjectName);

    const meta = getContextualizedPatternMeta(patternId, primarySubjCat);

    if (isRecurring) {
      const avgLoss = data.evidence.length > 0 ? data.totalLoss / data.evidence.length : 1.0;
      const minLoss = Math.min(...data.evidence.map((e) => e.marksLost));
      const maxLoss = Math.max(...data.evidence.map((e) => e.marksLost));

      const typicalLoss =
        data.evidence.length > 1 && minLoss !== maxLoss
          ? `${minLoss.toFixed(1)} – ${maxLoss.toFixed(1)} marks / question`
          : `${avgLoss.toFixed(1)} marks / question`;

      const uniqueExamples = Array.from(
        new Set(data.evidence.map((e) => (e.subQuestion ? `${e.questionNumber} (${e.subQuestion})` : e.questionNumber)))
      ).slice(0, 4);

      recurringPatterns.push({
        id: patternId,
        title: meta.title,
        category: meta.category,
        description: meta.description,
        detectionCount: data.evalIds.size,
        evaluationsCount: evaluationsAnalysed,
        affectedComponentsCount: data.evidence.length,
        typicalLoss,
        isLossEstimated: data.isEstimated,
        examples: uniqueExamples,
        nextTimeRule: meta.nextTimeRule,
        subjectArea: Array.from(data.subjectKeys).join(', ') || selectedSubjectName,
        severity: meta.severity,
        evidence: data.evidence,
      });

      // Check if pattern has legitimately IMPROVED in the latest evaluation
      // Strict rule:
      // 1. Must have been detected in >= 2 earlier evaluations.
      // 2. The latest evaluation must be of the SAME subject (or compatible subject scope) to be comparable!
      // 3. Issue was NOT detected in the latest evaluation.
      const earlierEvidence = data.evidence.filter((e) => e.evaluationId !== latestEval.row.id);
      const earlierDistinctEvals = new Set(earlierEvidence.map((e) => e.evaluationId));

      const isSameSubjectOrAll =
        isAllSubjects || matchesSubject(selectedSubject, latestEval.row.subject_key, latestEval.row.subject_name);

      if (earlierDistinctEvals.size >= 2 && !latestPatterns.has(patternId) && isSameSubjectOrAll) {
        const worstEarlier = earlierEvidence[0];
        const baselineLoss = worstEarlier ? worstEarlier.marksLost : 1.0;
        const recovered = Number(baselineLoss.toFixed(1));

        improvedPatterns.push({
          id: patternId,
          title: meta.title,
          category: meta.category,
          subjectName: latestEval.row.subject_name || selectedSubjectName,
          previousOccurrenceCount: earlierEvidence.length,
          previousEvaluationsCount: earlierDistinctEvals.size,
          recentStatus: 'Not detected in latest evaluation',
          status: 'IMPROVING',
          improvementSummary: `Earlier evaluations: ${earlierEvidence.length} recurring deductions across ${earlierDistinctEvals.size} papers. Recent evaluation (${latestEval.row.id}): Defect absent. Status: Verified improvement.`,
          evidenceComparison: {
            earlierEvaluationId: worstEarlier?.evaluationId || 'eval_earlier',
            earlierQuestion: worstEarlier?.questionNumber || 'Q',
            earlierLoss: baselineLoss,
            recentEvaluationId: latestEval.row.id,
            recentQuestion: 'Comparable step in recent submission',
            recentLoss: 0,
            marksRecovered: recovered,
          },
        });

        recoveredMarksList.push({
          subjectName: latestEval.row.subject_name || selectedSubjectName,
          area: meta.title,
          marksRecovered: recovered,
          detail: `${recovered} marks preserved compared with previous deduction in ${worstEarlier?.questionNumber || 'prior question'} (${worstEarlier?.evaluationId || 'earlier paper'}).`,
          earlierEvaluationId: worstEarlier?.evaluationId || 'eval_earlier',
          recentEvaluationId: latestEval.row.id,
          isEstimate: false,
        });
      }
    }
  }

  // Build Subject-Specific Step Flows
  const subjectPatterns: SubjectExaminerPatternFlow[] = [];

  // If a specific subject is selected, build the authoritative step flow for that subject
  if (!isAllSubjects) {
    const activeSubjKey = selectedSubject;
    const activeSubjName = selectedSubjectName;
    const cat = getSubjectCategory(activeSubjKey, activeSubjName);
    const flowMeta = getSubjectStepFlow(activeSubjKey, activeSubjName, cat);

    const stats = subjectStepStats[cat] || { totalAnswers: 0, stepDeficiencies: {}, subjects: new Set() };
    const totalDeficiencies = Object.values(stats.stepDeficiencies).reduce((a, b) => a + b, 0);

    let observation = 'Consistent compliance across recommended ICAI answer steps.';
    if (stats.stepDeficiencies['missing_provisions'] > 0) {
      observation = `Statutory / standard section citations omitted in ${stats.stepDeficiencies['missing_provisions']} answer component(s).`;
    } else if (stats.stepDeficiencies['missing_working_notes'] > 0) {
      observation = `Working note cross-references absent in ${stats.stepDeficiencies['missing_working_notes']} computation step(s).`;
    } else if (stats.stepDeficiencies['calculation_errors'] > 0) {
      observation = `Arithmetic / calculation variances noted in ${stats.stepDeficiencies['calculation_errors']} step(s).`;
    } else if (stats.stepDeficiencies['incomplete_conclusions'] > 0) {
      observation = `Concluding sentences omitted in ${stats.stepDeficiencies['incomplete_conclusions']} instance(s).`;
    } else if (stats.stepDeficiencies['weak_application'] > 0) {
      observation = `Factual correlation deficiencies noted in ${stats.stepDeficiencies['weak_application']} step(s).`;
    }

    const complianceRate = Math.max(40, 100 - totalDeficiencies * 8);

    subjectPatterns.push({
      subjectKey: activeSubjKey,
      subjectName: activeSubjName,
      subjectCategory: cat,
      title: flowMeta.title,
      stepFlow: flowMeta.stepFlow,
      evaluationsCount: evaluationsAnalysed,
      hasEvaluations: true,
      observedCompliance: `${complianceRate}% Step Consistency`,
      keyObservation: observation,
    });
  } else {
    // All Subjects overview: include all categories evaluated
    const activeCats: Array<'LAW' | 'TAX' | 'ACCOUNTS' | 'AUDIT' | 'COSTING' | 'FM'> = [
      'LAW',
      'TAX',
      'ACCOUNTS',
      'AUDIT',
      'COSTING',
      'FM',
    ];

    for (const cat of activeCats) {
      const stats = subjectStepStats[cat];
      const hasData = stats.totalAnswers > 0;
      const count = allRows.filter((r) => getSubjectCategory(r.subject_key, r.subject_name) === cat).length;
      const flowMeta = getSubjectStepFlow(cat.toLowerCase(), Array.from(stats.subjects)[0] || cat, cat);

      if (hasData) {
        const totalDeficiencies = Object.values(stats.stepDeficiencies).reduce((a, b) => a + b, 0);
        let observation = 'Good step compliance across evaluated answer components.';
        if (stats.stepDeficiencies['missing_provisions'] > 0) {
          observation = `Statutory / standard citations omitted in ${stats.stepDeficiencies['missing_provisions']} component(s).`;
        } else if (stats.stepDeficiencies['missing_working_notes'] > 0) {
          observation = `Working notes missing in ${stats.stepDeficiencies['missing_working_notes']} computation step(s).`;
        } else if (stats.stepDeficiencies['calculation_errors'] > 0) {
          observation = `Calculation slips noted in ${stats.stepDeficiencies['calculation_errors']} step(s).`;
        } else if (stats.stepDeficiencies['incomplete_conclusions'] > 0) {
          observation = `Incomplete conclusions in ${stats.stepDeficiencies['incomplete_conclusions']} answer(s).`;
        }

        subjectPatterns.push({
          subjectKey: cat.toLowerCase(),
          subjectName: flowMeta.title,
          subjectCategory: cat,
          title: flowMeta.title,
          stepFlow: flowMeta.stepFlow,
          evaluationsCount: count,
          hasEvaluations: true,
          observedCompliance: `${Math.max(40, 100 - totalDeficiencies * 8)}% Step Consistency`,
          keyObservation: observation,
        });
      }
    }
  }

  // Sort recurring patterns by frequency ratio, severity, and evidence count
  const severityOrder: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  recurringPatterns.sort((a, b) => {
    const freqA = a.detectionCount / (a.evaluationsCount || 1);
    const freqB = b.detectionCount / (b.evaluationsCount || 1);
    if (freqB !== freqA) return freqB - freqA;
    const sevDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
    if (sevDiff !== 0) return sevDiff;
    return b.affectedComponentsCount - a.affectedComponentsCount;
  });

  const improvedIds = new Set(improvedPatterns.map((ip) => ip.id));
  const attentionNeededPatterns = recurringPatterns.filter((rp) => !improvedIds.has(rp.id));
  const currentFocusAreas = attentionNeededPatterns.map((rp) => rp.title);

  const marksRecoveredTotal = Number(
    recoveredMarksList.reduce((sum, item) => sum + item.marksRecovered, 0).toFixed(1)
  );

  const marksRecoveredStatus: 'AVAILABLE' | 'INSUFFICIENT_DATA' =
    recoveredMarksList.length > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA';

  return {
    studentId,
    selectedSubject,
    selectedSubjectName,
    caLevel,
    availableSubjects,
    evaluationsAnalysed,
    insufficientHistory: false,
    recurringPatternsCount: recurringPatterns.length,
    improvedPatternsCount: improvedPatterns.length,
    attentionNeededCount: attentionNeededPatterns.length,
    marksRecoveredTotal,
    marksRecoveredStatus,
    recurringPatterns,
    improvedPatterns,
    marksRecovered: recoveredMarksList,
    subjectPatterns,
    currentFocusAreas,
    lastEvaluationId: parsedEvals[latestEvalIndex]?.row.id,
    updatedAt: nowIso,
  };
}

/**
 * Persist the student's personal examiner profile to SQLite so it survives restarts, deployments, and re-queries.
 */
export function updateStudentExaminerProfile(
  studentId: string,
  subjectFilter?: string
): StudentExaminerProfile {
  const profile = calculateStudentExaminerProfile(studentId, subjectFilter);

  // Cache the 'all' profile in the persistent student_examiner_profiles table
  if (!subjectFilter || subjectFilter.toLowerCase() === 'all') {
    try {
      db.prepare(`
        INSERT INTO student_examiner_profiles (
          student_id,
          evaluations_analysed,
          recurring_patterns_count,
          improved_patterns_count,
          attention_needed_count,
          marks_recovered_total,
          profile_data_json,
          last_evaluation_id,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(student_id) DO UPDATE SET
          evaluations_analysed = excluded.evaluations_analysed,
          recurring_patterns_count = excluded.recurring_patterns_count,
          improved_patterns_count = excluded.improved_patterns_count,
          attention_needed_count = excluded.attention_needed_count,
          marks_recovered_total = excluded.marks_recovered_total,
          profile_data_json = excluded.profile_data_json,
          last_evaluation_id = excluded.last_evaluation_id,
          updated_at = excluded.updated_at
      `).run(
        studentId,
        profile.evaluationsAnalysed,
        profile.recurringPatternsCount,
        profile.improvedPatternsCount,
        profile.attentionNeededCount,
        profile.marksRecoveredTotal,
        JSON.stringify(profile),
        profile.lastEvaluationId || null,
        profile.updatedAt
      );
    } catch (err) {
      console.error('Failed to persist student examiner profile to database:', err);
    }
  }

  return profile;
}

/**
 * Retrieve the student's personal examiner profile from SQLite (or compute live on demand).
 */
export function getStudentExaminerProfile(
  studentId: string,
  subjectFilter?: string
): StudentExaminerProfile {
  // If a specific subject is requested, compute live on demand with strict filtering
  if (subjectFilter && subjectFilter.toLowerCase() !== 'all') {
    return calculateStudentExaminerProfile(studentId, subjectFilter);
  }

  // Otherwise check cached profile for 'all'
  try {
    const profRow = db
      .prepare(`SELECT ca_level FROM student_profiles WHERE user_id = ?`)
      .get(studentId) as { ca_level?: string } | undefined;
    const currentCaLevel = (profRow?.ca_level || 'INTERMEDIATE').toUpperCase();

    const row = db
      .prepare(`SELECT profile_data_json FROM student_examiner_profiles WHERE student_id = ?`)
      .get(studentId) as { profile_data_json: string } | undefined;

    if (row?.profile_data_json) {
      const parsed = JSON.parse(row.profile_data_json);
      // Ensure availableSubjects and caLevel are refreshed and strictly match student's current CA level
      if (
        parsed.availableSubjects &&
        parsed.caLevel &&
        parsed.caLevel.toUpperCase() === currentCaLevel
      ) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error fetching cached examiner profile, computing live:', err);
  }

  return updateStudentExaminerProfile(studentId);
}
