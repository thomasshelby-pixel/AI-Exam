export type ParakhCourseLevel = 'CA_FOUNDATION' | 'CA_INTERMEDIATE' | 'CA_FINAL';

export type ParakhSubjectDomain =
  | 'accounting'
  | 'business_law'
  | 'taxation'
  | 'auditing'
  | 'cost_accounting'
  | 'financial_management'
  | 'strategic_management'
  | 'quantitative_aptitude'
  | 'economics'
  | 'general_ca';

export type ParakhQuestionKind =
  | 'current_information'
  | 'statutory_application'
  | 'numerical'
  | 'conceptual'
  | 'exam_strategy'
  | 'study_planning'
  | 'general';

export type ParakhQualityStatus =
  | 'STRUCTURE_READY'
  | 'PARTIAL_NEEDS_INPUT'
  | 'NEEDS_PRIMARY_SOURCE'
  | 'NEEDS_HUMAN_REVIEW'
  | 'INCOMPLETE';

export interface ParakhSourceReference {
  title?: string;
  url: string;
}

export interface ParakhQualityAssessmentInput {
  question: string;
  answer: string;
  course: ParakhCourseLevel | string;
  subjects?: string[];
  sources?: ParakhSourceReference[];
  knowledgeMatched?: boolean;
}

export interface ParakhQualityAssessment {
  frameworkVersion: '1.0';
  status: ParakhQualityStatus;
  structuralScore: number;
  questionKind: ParakhQuestionKind;
  subjectDomain: ParakhSubjectDomain;
  requiresPrimarySource: boolean;
  primarySources: string[];
  checks: {
    substantiveAnswer: boolean;
    structuredExplanation: boolean;
    topicKnowledgeMatched: boolean;
    numericalWorkings: boolean;
    conclusionOrNextStep: boolean;
    assumptionsDisclosed: boolean;
    primarySourcePresent: boolean;
  };
  limitations: string[];
  factualAccuracyCertified: false;
}

const SUBJECT_DOMAINS: Array<{
  key: ParakhSubjectDomain;
  label: string;
  aliases: string[];
  mappedCourses: ParakhCourseLevel[];
  seededSubjects: string[];
}> = [
  {
    key: 'accounting',
    label: 'Accounting and Financial Reporting',
    aliases: ['accounting', 'accounts', 'financial reporting', 'advanced accounting', 'company accounts'],
    mappedCourses: ['CA_FOUNDATION', 'CA_INTERMEDIATE'],
    seededSubjects: ['Accounting', 'Advanced Accounting'],
  },
  {
    key: 'business_law',
    label: 'Business and Corporate Law',
    aliases: ['business law', 'business laws', 'corporate law', 'company law', 'companies act', 'llp act', 'law'],
    mappedCourses: ['CA_FOUNDATION', 'CA_INTERMEDIATE'],
    seededSubjects: ['Business Laws', 'Corporate and Other Laws'],
  },
  {
    key: 'taxation',
    label: 'Taxation',
    aliases: ['tax', 'taxation', 'income tax', 'direct tax', 'gst', 'indirect tax', 'input tax credit'],
    mappedCourses: ['CA_INTERMEDIATE'],
    seededSubjects: ['Taxation'],
  },
  {
    key: 'auditing',
    label: 'Auditing and Ethics',
    aliases: ['audit', 'auditing', 'auditor', 'auditing and ethics', 'audit evidence', 'audit report'],
    mappedCourses: ['CA_INTERMEDIATE'],
    seededSubjects: ['Auditing and Ethics'],
  },
  {
    key: 'cost_accounting',
    label: 'Cost and Management Accounting',
    aliases: ['costing', 'cost accounting', 'cost and management accounting', 'marginal costing', 'standard costing'],
    mappedCourses: ['CA_INTERMEDIATE'],
    seededSubjects: ['Cost and Management Accounting'],
  },
  {
    key: 'financial_management',
    label: 'Financial Management',
    aliases: ['financial management', 'fm', 'working capital', 'cost of capital', 'capital structure', 'ratio analysis'],
    mappedCourses: ['CA_INTERMEDIATE'],
    seededSubjects: ['Financial Management and Strategic Management'],
  },
  {
    key: 'strategic_management',
    label: 'Strategic Management',
    aliases: ['strategic management', 'sm', 'swot', 'porter', 'pestel', 'value chain'],
    mappedCourses: ['CA_INTERMEDIATE'],
    seededSubjects: ['Financial Management and Strategic Management'],
  },
  {
    key: 'quantitative_aptitude',
    label: 'Quantitative Aptitude and Statistics',
    aliases: ['quantitative aptitude', 'business mathematics', 'statistics', 'logical reasoning', 'probability'],
    mappedCourses: ['CA_FOUNDATION'],
    seededSubjects: ['Quantitative Aptitude'],
  },
  {
    key: 'economics',
    label: 'Business Economics',
    aliases: ['business economics', 'economics', 'demand and supply', 'elasticity', 'market structure'],
    mappedCourses: ['CA_FOUNDATION'],
    seededSubjects: ['Business Economics'],
  },
  {
    key: 'general_ca',
    label: 'Cross-subject CA learning skills',
    aliases: ['ca', 'icai', 'revision', 'mock test', 'exam strategy'],
    mappedCourses: ['CA_FOUNDATION', 'CA_INTERMEDIATE', 'CA_FINAL'],
    seededSubjects: [],
  },
];

const PRIMARY_SOURCE_HOSTS = [
  'icai.org',
  'icai-cds.org',
  'incometax.gov.in',
  'incometaxindia.gov.in',
  'cbic.gov.in',
  'gst.gov.in',
  'mca.gov.in',
  'indiacode.nic.in',
  'egazette.nic.in',
  'rbi.org.in',
  'sebi.gov.in',
];

function normalizeText(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function containsAlias(text: string, alias: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedAlias = normalizeText(alias);
  if (!normalizedText || !normalizedAlias) return false;
  return (' ' + normalizedText + ' ').includes(' ' + normalizedAlias + ' ');
}

export function resolveParakhSubjectDomain(
  question: string,
  subjects: string[] = [],
): ParakhSubjectDomain {
  const questionFmSignal = /\b(fm|financial management|ratio analysis|working capital|cost of capital|capital structure)\b/i.test(question);
  const questionSmSignal = /\b(sm|strategic management|swot|porter|pestel|value chain)\b/i.test(question);
  if (questionFmSignal && !questionSmSignal) return 'financial_management';
  if (questionSmSignal && !questionFmSignal) return 'strategic_management';

  const supplied = subjects.join(' ');
  const text = question + ' ' + supplied;
  for (const domain of SUBJECT_DOMAINS) {
    if (domain.key === 'general_ca') continue;
    if (domain.aliases.some((alias) => containsAlias(question, alias) || containsAlias(supplied, alias))) return domain.key;
  }
  return 'general_ca';
}

function isCurrentInformationQuestion(question: string): boolean {
  if (/\bcurrent\s+ratio\b/i.test(question)) return false;
  return /\b(latest|most recent|currently applicable|as of today|as on today|today's|recent amendment|latest amendment|latest notification|latest circular|current rate|current limit|current due date|effective from|in force as of|finance act 20\d{2}|assessment year 20\d{2}|previous year 20\d{2})\b/i.test(question);
}

function isStatutoryApplicationQuestion(question: string, domain: ParakhSubjectDomain): boolean {
  if (!['business_law', 'taxation'].includes(domain)) return false;
  return /\b(section|sub[- ]?section|rule|notification|circular|rate|limit|deduction|exemption|taxability|eligible|eligibility|penalty|interest|due date|applicability|finance act|provision|amendment|residential status|input tax credit)\b/i.test(question);
}

function isNumericalQuestion(question: string): boolean {
  return /\b(calculate|compute|work out|find the value|determine the amount|solve|numerical|problem|sum|working note|should the firm|net benefit|payback|irr|npv|break even|break-even|ratio|variance)\b/i.test(question)
    || /(?:₹|rs\.?|inr|\$)\s*[\d,]+/i.test(question)
    || /\d[\d,]*(?:\.\d+)?\s*(?:%|days?|units?|years?)\b/i.test(question);
}

export function classifyParakhQuestion(
  question: string,
  subjects: string[] = [],
): { kind: ParakhQuestionKind; domain: ParakhSubjectDomain; requiresPrimarySource: boolean } {
  const domain = resolveParakhSubjectDomain(question, subjects);
  if (isCurrentInformationQuestion(question)) {
    return { kind: 'current_information', domain, requiresPrimarySource: true };
  }
  if (isStatutoryApplicationQuestion(question, domain)) {
    return { kind: 'statutory_application', domain, requiresPrimarySource: true };
  }
  if (isNumericalQuestion(question)) {
    return { kind: 'numerical', domain, requiresPrimarySource: false };
  }
  if (/\b(study plan|timetable|schedule|study routine|roadmap|daily plan|weekly plan)\b/i.test(question)) {
    return { kind: 'study_planning', domain, requiresPrimarySource: false };
  }
  if (/\b(mock|past paper|previous year|time management|answer presentation|exam strategy|attempt strategy)\b/i.test(question)) {
    return { kind: 'exam_strategy', domain, requiresPrimarySource: false };
  }
  if (/\b(what is|what are|explain|define|meaning|difference between|why|how does|how do|samjhao|kya hai|kaise)\b/i.test(question)) {
    return { kind: 'conceptual', domain, requiresPrimarySource: false };
  }
  return { kind: 'general', domain, requiresPrimarySource: false };
}

function isPrimarySourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return PRIMARY_SOURCE_HOSTS.some((domain) => host === domain || host.endsWith('.' + domain));
  } catch {
    return false;
  }
}

function hasStructuredExplanation(answer: string): boolean {
  return /(?:^|\n)\s*(?:\d+[.)]|[-*•])\s+/m.test(answer)
    || /\b(step\s*1|firstly|first,|then,|finally,)\b/i.test(answer);
}

function hasNumericalWorkings(answer: string): boolean {
  const hasNumericEvidence = /(?:₹|rs\.?|inr|\$)\s*[\d,]+|\b\d+(?:\.\d+)?\s*%|\b\d+(?:\.\d+)?\s*(?:days?|units?|years?)\b/i.test(answer);
  const hasWorkingLanguage = /\b(formula|working|calculation|calculated|incremental|total|net benefit|average collection|contribution|bad debt|receivable|variance|step)\b/i.test(answer);
  return hasNumericEvidence && hasWorkingLanguage;
}

function hasConclusionOrNextStep(answer: string): boolean {
  return /\b(final answer|answer|conclusion|therefore|hence|decision|accept|reject|net benefit|next step|please provide|share the missing|send the exact)\b/i.test(answer);
}

function disclosesAssumptionsOrMissingInputs(answer: string): boolean {
  return /\b(assumption|assume|assuming|missing|not provided|depends on|based on the data|given data|provided figures|cannot determine|please provide|need one more|remaining information)\b/i.test(answer);
}

export function assessParakhResponseQuality(
  input: ParakhQualityAssessmentInput,
): ParakhQualityAssessment {
  const question = String(input.question || '');
  const answer = String(input.answer || '');
  const sources = Array.isArray(input.sources) ? input.sources : [];
  const classification = classifyParakhQuestion(question, input.subjects || []);
  const safeSources = sources
    .map((source) => String(source.url || '').trim())
    .filter((url) => /^https:\/\//i.test(url));
  const primarySources = safeSources.filter(isPrimarySourceUrl);
  const substantiveAnswer = answer.trim().length >= 80;
  const structuredExplanation = hasStructuredExplanation(answer);
  const topicKnowledgeMatched = Boolean(input.knowledgeMatched);
  const numericalWorkings = classification.kind === 'numerical'
    ? hasNumericalWorkings(answer)
    : true;
  const conclusionOrNextStep = hasConclusionOrNextStep(answer);
  const assumptionsDisclosed = classification.kind !== 'numerical'
    || disclosesAssumptionsOrMissingInputs(answer);
  const primarySourcePresent = primarySources.length > 0;

  let structuralScore = 0;
  if (substantiveAnswer) structuralScore += 20;
  if (structuredExplanation) structuralScore += 15;
  if (topicKnowledgeMatched) structuralScore += 20;
  if (numericalWorkings) structuralScore += 20;
  if (conclusionOrNextStep) structuralScore += 10;
  if (assumptionsDisclosed) structuralScore += 10;
  if (primarySourcePresent) structuralScore += 5;
  structuralScore = Math.max(0, Math.min(100, structuralScore));

  let status: ParakhQualityStatus = 'STRUCTURE_READY';
  if (classification.requiresPrimarySource && !primarySourcePresent) {
    status = 'NEEDS_PRIMARY_SOURCE';
  } else if (classification.kind === 'numerical' && numericalWorkings && assumptionsDisclosed
    && /\b(missing|not provided|please provide|cannot determine|need one more|depends on)\b/i.test(answer)) {
    status = 'PARTIAL_NEEDS_INPUT';
  } else if (!substantiveAnswer || (classification.kind === 'numerical' && !numericalWorkings)) {
    status = 'INCOMPLETE';
  } else if (!topicKnowledgeMatched && safeSources.length === 0) {
    status = 'NEEDS_HUMAN_REVIEW';
  } else if (!structuredExplanation || !conclusionOrNextStep) {
    status = 'NEEDS_HUMAN_REVIEW';
  }

  const limitations = [
    'This gate checks response structure and evidence signals; it does not prove factual correctness or mathematical validity.',
  ];
  if (classification.requiresPrimarySource && !primarySourcePresent) {
    limitations.push('A current/statutory answer needs a current primary-source reference before it can be treated as verified.');
  }
  if (classification.kind === 'numerical' && status === 'PARTIAL_NEEDS_INPUT') {
    limitations.push('The answer must keep the decision conditional until the missing inputs are supplied.');
  }
  if (!topicKnowledgeMatched && safeSources.length === 0) {
    limitations.push('No subject-specific knowledge entry or source was matched; human review is required.');
  }

  return {
    frameworkVersion: '1.0',
    status,
    structuralScore,
    questionKind: classification.kind,
    subjectDomain: classification.domain,
    requiresPrimarySource: classification.requiresPrimarySource,
    primarySources,
    checks: {
      substantiveAnswer,
      structuredExplanation,
      topicKnowledgeMatched,
      numericalWorkings,
      conclusionOrNextStep,
      assumptionsDisclosed,
      primarySourcePresent,
    },
    limitations,
    factualAccuracyCertified: false,
  };
}

export interface ParakhSubjectCoverageRow {
  domain: ParakhSubjectDomain;
  label: string;
  seededSubjects: string[];
  guidanceStatus: 'PARTIAL_GUIDANCE_SEEDED' | 'KNOWLEDGE_GAP' | 'GENERAL_GUIDANCE_ONLY';
  benchmarkFamiliesRequired: string[];
  completeVerifiedCoverage: false;
  caFinalCurriculumMapping: 'NOT_MAPPED_IN_CURRENT_REGISTRY';
}


const REQUIRED_BENCHMARK_FAMILIES = [...PARAKH_QUALITY_BENCHMARK_FAMILIES];

export function buildParakhSubjectCoverageReport(
  knowledgeSubjects: string[] = [],
): {
  frameworkVersion: '1.0';
  overallStatus: 'FOUNDATION_IN_PROGRESS';
  automaticModelTraining: false;
  humanReviewRequiredForKnowledgeChanges: true;
  subjectDomains: ParakhSubjectCoverageRow[];
} {
  const normalizedSubjects = knowledgeSubjects.map(normalizeText);
  const subjectDomains = SUBJECT_DOMAINS
    .filter((domain) => domain.key !== 'general_ca')
    .map((domain): ParakhSubjectCoverageRow => {
      const seededSubjects = domain.seededSubjects.filter((subject) =>
        normalizedSubjects.includes(normalizeText(subject)),
      );
      return {
        domain: domain.key,
        label: domain.label,
        seededSubjects,
        guidanceStatus: seededSubjects.length
          ? 'PARTIAL_GUIDANCE_SEEDED'
          : 'KNOWLEDGE_GAP',
        benchmarkFamiliesRequired: [...REQUIRED_BENCHMARK_FAMILIES],
        completeVerifiedCoverage: false,
        caFinalCurriculumMapping: 'NOT_MAPPED_IN_CURRENT_REGISTRY',
      };
    });

  return {
    frameworkVersion: '1.0',
    overallStatus: 'FOUNDATION_IN_PROGRESS',
    automaticModelTraining: false,
    humanReviewRequiredForKnowledgeChanges: true,
    subjectDomains,
  };
}


export interface ParakhQualityBenchmarkSpec {
  id: string;
  question: string;
  course: ParakhCourseLevel;
  expectedQuestionKind: ParakhQuestionKind;
  requiredPatterns?: string[];
  forbiddenPatterns?: string[];
  requiresPrimarySource?: boolean;
}

export interface ParakhQualityBenchmarkResult {
  id: string;
  passed: boolean;
  assessment: ParakhQualityAssessment;
  failedRequirements: string[];
}

/**
 * A deterministic benchmark harness for repeatable answer-shape and evidence checks.
 * Subject owners must add verified answer fixtures; passing this harness alone does
 * not certify that the answer's facts, calculations or ICAI treatment are correct.
 */
export function evaluateParakhQualityBenchmark(
  spec: ParakhQualityBenchmarkSpec,
  answer: string,
  sources: ParakhSourceReference[] = [],
  knowledgeMatched = false,
): ParakhQualityBenchmarkResult {
  const assessment = assessParakhResponseQuality({
    question: spec.question,
    answer,
    course: spec.course,
    sources,
    knowledgeMatched,
  });
  const failedRequirements: string[] = [];
  if (assessment.questionKind !== spec.expectedQuestionKind) {
    failedRequirements.push('question_kind');
  }
  for (const pattern of spec.requiredPatterns || []) {
    if (!new RegExp(pattern, 'i').test(answer)) failedRequirements.push('required_pattern:' + pattern);
  }
  for (const pattern of spec.forbiddenPatterns || []) {
    if (new RegExp(pattern, 'i').test(answer)) failedRequirements.push('forbidden_pattern:' + pattern);
  }
  if (spec.requiresPrimarySource && !assessment.checks.primarySourcePresent) {
    failedRequirements.push('primary_source_required');
  }
  if (!['STRUCTURE_READY', 'PARTIAL_NEEDS_INPUT'].includes(assessment.status)) {
    failedRequirements.push('quality_gate:' + assessment.status);
  }
  return {
    id: spec.id,
    passed: failedRequirements.length === 0,
    assessment,
    failedRequirements,
  };
}

export const PARAKH_QUALITY_BENCHMARK_FAMILIES = [
  'core_concept',
  'unseen_numerical_or_application',
  'exam_style_question',
  'edge_case_and_common_mistake',
  'source_sensitive_or_amendment_check',
] as const;
