import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCreditPolicyAnalysisReply, buildKnowledgeChatReply, getStudyKnowledgeSubjectInventory, isStudyKnowledgeFollowUp, searchStudyKnowledge } from '../services/studyPlannerKnowledgeService.js';
import {
  assessParakhResponseQuality,
  buildParakhQualityNotice,
  buildParakhSubjectCoverageReport,
  classifyParakhQuestion,
  evaluateParakhQualityBenchmark,
} from '../services/parakhQualityFramework.js';

test('retrieves relevant study guidance without exact wording', () => {
  const result = searchStudyKnowledge({
    message: 'Bhai notes band karke yaad kaise karu?',
    course: 'CA_INTERMEDIATE',
    language: 'hinglish',
  });
  assert.equal(result?.topicId, 'active-recall');
  assert.match(buildKnowledgeChatReply(result!, 'hinglish'), /Active recall/);
});

test('returns language-matched answers', () => {
  const hindi = searchStudyKnowledge({ message: 'याद रखने का तरीका बताओ', course: 'CA_FOUNDATION', language: 'hindi' });
  assert.equal(hindi?.topicId, 'active-recall');
  assert.match(buildKnowledgeChatReply(hindi!, 'hindi'), /याद/);
  const english = searchStudyKnowledge({ message: 'How do I analyse a mock test?', course: 'CA_INTERMEDIATE', language: 'english' });
  assert.equal(english?.topicId, 'mock-analysis');
});

test('supports follow-up requests for examples, simpler explanations and quizzes', () => {
  const history = ['Student: How do I remember provisions?', 'Planner: Topic: Active recall'];
  const example = searchStudyKnowledge({ message: 'Give me an example', course: 'CA_INTERMEDIATE', language: 'english', history });
  assert.equal(example?.mode, 'example');
  assert.equal(example?.topicId, 'active-recall');
  const simpler = searchStudyKnowledge({ message: 'Explain simpler', course: 'CA_INTERMEDIATE', language: 'english', history });
  assert.equal(simpler?.mode, 'simpler');
  const quiz = searchStudyKnowledge({ message: 'Quiz me', course: 'CA_INTERMEDIATE', language: 'english', history });
  assert.equal(quiz?.mode, 'quiz');
});

test('detects short knowledge follow-ups from prefixed or raw assistant topic history', () => {
  assert.equal(isStudyKnowledgeFollowUp('Give me an example', ['Planner: **Topic: Active recall**']), true);
  assert.equal(isStudyKnowledgeFollowUp('Explain simpler', ['**Topic: Active recall**']), true);
  assert.equal(isStudyKnowledgeFollowUp('Quiz me', ['Assistant: **Topic: Active recall**']), true);
  assert.equal(isStudyKnowledgeFollowUp('Tell me more', ['Planner: **Topic: Active recall**']), true);
  assert.equal(isStudyKnowledgeFollowUp('Give me an example', []), false);
  assert.equal(isStudyKnowledgeFollowUp('How do I study accounting?', ['Planner: **Topic: Active recall**']), false);

  const rawHistory = ['**Topic: Active recall**'];
  const result = searchStudyKnowledge({
    message: 'Give me an example',
    course: 'CA_FOUNDATION',
    language: 'english',
    history: rawHistory,
  });
  assert.equal(result?.topicId, 'active-recall');
  assert.equal(result?.mode, 'example');
});

test('recognises topic-specific study techniques', () => {
  const numerical = searchStudyKnowledge({ message: 'How should I practise costing sums?', course: 'CA_INTERMEDIATE', language: 'english' });
  assert.equal(numerical?.topicId, 'numerical-practice');
  const law = searchStudyKnowledge({ message: 'How do I write a law case study answer?', course: 'CA_INTERMEDIATE', language: 'english' });
  assert.equal(law?.topicId, 'law-tax-answer-writing');
  const revision = searchStudyKnowledge({ message: 'How to revise a chapter?', course: 'CA_FOUNDATION', language: 'english' });
  assert.equal(revision?.topicId, 'revision-cycle');
});

test('follow-up resolves to the most recently discussed topic', () => {
  const history = [
    'Planner: **Topic: Active recall**',
    'Student: How should I analyse a mock test?',
    'Planner: **Topic: Mock test analysis**',
  ];
  const result = searchStudyKnowledge({ message: 'Give me an example', course: 'CA_INTERMEDIATE', language: 'english', history });
  assert.equal(result?.topicId, 'mock-analysis');
});

test('example and quiz follow-ups remain available for gated numerical and Law topics', () => {
  const numericalHistory = [
    'Student: How should I practise costing sums?',
    'Planner: **Topic: Numerical subject practice**',
  ];
  const numericalExample = searchStudyKnowledge({
    message: 'Give me an example',
    course: 'CA_INTERMEDIATE',
    language: 'english',
    history: numericalHistory,
  });
  assert.equal(numericalExample?.topicId, 'numerical-practice');
  assert.equal(numericalExample?.mode, 'example');

  const numericalMore = searchStudyKnowledge({
    message: 'Tell me more',
    course: 'CA_INTERMEDIATE',
    language: 'english',
    history: numericalHistory,
  });
  assert.equal(numericalMore?.topicId, 'numerical-practice');

  const lawHistory = [
    'Student: How do I write a Business Laws case study answer?',
    'Planner: **Topic: Law and Tax answer writing**',
  ];
  const lawExample = searchStudyKnowledge({
    message: 'Give me an example',
    course: 'CA_FOUNDATION',
    language: 'english',
    history: lawHistory,
  });
  assert.equal(lawExample?.topicId, 'law-tax-answer-writing');
  assert.equal(lawExample?.mode, 'example');
});

test('does not confuse a costing concept question with a request for numerical practice', () => {
  const result = searchStudyKnowledge({ message: 'What is marginal costing?', course: 'CA_INTERMEDIATE', language: 'english' });
  assert.equal(result, null);
});

test('does not answer current or attempt-sensitive statutory questions from generic knowledge', () => {
  assert.equal(searchStudyKnowledge({ message: 'What is the current GST rate for this supply?', course: 'CA_INTERMEDIATE', language: 'english' }), null);
  assert.equal(searchStudyKnowledge({ message: 'What is the latest Finance Act amendment?', course: 'CA_INTERMEDIATE', language: 'english' }), null);
});

test('enforces explicit subject boundaries between Foundation and Intermediate', () => {
  const foundationCosting = searchStudyKnowledge({
    message: 'How should I practise costing sums?',
    course: 'CA_FOUNDATION',
    language: 'english',
  });
  assert.equal(foundationCosting, null);

  const intermediateCosting = searchStudyKnowledge({
    message: 'How should I practise costing sums?',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  });
  assert.equal(intermediateCosting?.topicId, 'numerical-practice');

  const foundationAccounting = searchStudyKnowledge({
    message: 'How should I practise Accounting sums?',
    course: 'CA_FOUNDATION',
    language: 'english',
  });
  assert.equal(foundationAccounting?.topicId, 'numerical-practice');

  const intermediateAccounting = searchStudyKnowledge({
    message: 'How should I practise Accounting sums?',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  });
  assert.equal(intermediateAccounting?.topicId, 'numerical-practice');

  const foundationAdvancedAccounting = searchStudyKnowledge({
    message: 'How should I practise Advanced Accounting sums?',
    course: 'CA_FOUNDATION',
    language: 'english',
  });
  assert.equal(foundationAdvancedAccounting, null);

  const foundationBusinessLaws = searchStudyKnowledge({
    message: 'How do I write a Business Laws case study answer?',
    course: 'CA_FOUNDATION',
    language: 'english',
  });
  assert.equal(foundationBusinessLaws?.topicId, 'law-tax-answer-writing');

  const foundationGst = searchStudyKnowledge({
    message: 'How do I write a GST answer?',
    course: 'CA_FOUNDATION',
    language: 'english',
  });
  assert.equal(foundationGst, null);

  const intermediateGst = searchStudyKnowledge({
    message: 'How do I write a GST answer?',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  });
  assert.equal(intermediateGst?.topicId, 'law-tax-answer-writing');
});

test('allows general numerical practice for both supported courses', () => {
  for (const course of ['CA_FOUNDATION', 'CA_INTERMEDIATE'] as const) {
    const result = searchStudyKnowledge({
      message: 'How do I improve my numerical practice?',
      course,
      language: 'english',
    });
    assert.equal(result?.topicId, 'numerical-practice');
  }
});

test('retrieves subject-specific Foundation and Intermediate study strategies', () => {
  const qa = searchStudyKnowledge({
    message: 'How should I revise probability?',
    course: 'CA_FOUNDATION',
    language: 'english',
  });
  assert.equal(qa?.topicId, 'foundation-qa-strategy');

  const economics = searchStudyKnowledge({
    message: 'How do I study demand and supply?',
    course: 'CA_FOUNDATION',
    language: 'english',
  });
  assert.equal(economics?.topicId, 'foundation-economics-strategy');

  const audit = searchStudyKnowledge({
    message: 'How do I prepare audit evidence?',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  });
  assert.equal(audit?.topicId, 'intermediate-audit-strategy');

  const fmSm = searchStudyKnowledge({
    message: 'How should I revise Financial Management and Strategic Management?',
    course: 'CA_INTERMEDIATE',
    language: 'english',
  });
  assert.equal(fmSm?.topicId, 'intermediate-fm-sm-strategy');

  assert.equal(searchStudyKnowledge({
    message: 'What is probability?',
    course: 'CA_FOUNDATION',
    language: 'english',
  }), null);
  assert.equal(searchStudyKnowledge({
    message: 'How do I prepare audit evidence?',
    course: 'CA_FOUNDATION',
    language: 'english',
  }), null);
});


test('teaches Ratio Analysis from zero for an Intermediate FM difficulty statement', () => {
  const result = searchStudyKnowledge({
    message: 'FM me mujhe ratio wala chapter nahi aata hai',
    course: 'CA_INTERMEDIATE',
    language: 'hinglish',
  });
  assert.equal(result?.topicId, 'intermediate-fm-ratio-analysis');
  assert.equal(result?.mode, 'simpler');
  assert.match(buildKnowledgeChatReply(result!, 'hinglish'), /ratio ko do numbers ke beech ka relationship/i);
  assert.match(buildKnowledgeChatReply(result!, 'hinglish'), /Current Ratio/);
});

test('a generic Explain an FM concept action continues from the ratio topic in recent student turns', () => {
  const result = searchStudyKnowledge({
    message: 'Explain a FM concept',
    course: 'CA_INTERMEDIATE',
    language: 'hinglish',
    history: [
      'Student: FM me help kr skte ho',
      'Student: FM me mujhe ratio wala chapter nahi aata hai',
    ],
  });
  assert.equal(result?.topicId, 'intermediate-fm-ratio-analysis');
  assert.equal(result?.mode, 'answer');
  assert.match(buildKnowledgeChatReply(result!, 'hinglish'), /Liquidity/);
});

test('Ratio Analysis is not returned for a course where the FM-SM subject is unavailable', () => {
  const result = searchStudyKnowledge({
    message: 'FM me mujhe ratio wala chapter nahi aata hai',
    course: 'CA_FOUNDATION',
    language: 'hinglish',
  });
  assert.equal(result, null);
});


test('works through a credit-policy numerical and asks for discount uptake instead of inventing it', () => {
  const question = "The current credit sales of a firm is ₹20,00,000 and the firm still has an unutilized capacity. In order to boost its sales, the firm is willing to relax its credit policy. The firm proposes a new credit policy of 2/15 net 60 days as against the present policy of 1/15 net 45 days. The firm expects an increase in the sales by 15%. However, it is also expected that bad debts will go up to 2.5% of sales from 1.5%. The contribution to sales ratio of the firm is 25%. The firm's tax rate is 30% and the firm requires an after tax return of 12% on its investment. Should the firm change the credit policy?";
  const answer = buildCreditPolicyAnalysisReply(question, 'english');
  assert.ok(answer);
  assert.match(answer, /₹23,00,000/);
  assert.match(answer, /₹75,000/);
  assert.match(answer, /₹57,500/);
  assert.match(answer, /₹27,500/);
  assert.match(answer, /₹33,250/);
  assert.match(answer, /percentage of customers taking the 1% discount/i);
  assert.match(answer, /12% after-tax required return/i);
  assert.doesNotMatch(answer, /firm should (?:accept|reject)/i);
  assert.match(answer, /Under the current policy/i);
  assert.match(answer, /2% discount/i);
  const finalAnswer = buildCreditPolicyAnalysisReply('Current policy 40%, proposed policy 60%', 'english', [question]);
  assert.ok(finalAnswer);
  assert.match(finalAnswer, /Average collection period: current 33\\.00 days; proposed 33\\.00 days/);
  assert.match(finalAnswer, /Net annual benefit: ₹17,089/);
  assert.match(finalAnswer, /Decision: ACCEPT/);

});

test('does not guess a credit-policy decision when the required problem data is absent', () => {
  assert.equal(buildCreditPolicyAnalysisReply('Should I change my credit policy?', 'english'), null);
});


test('quality gate marks the credit-policy numerical as partial until missing uptake is supplied', () => {
  const question = "The current credit sales of a firm is ₹20,00,000 and the firm proposes a new credit policy of 2/15 net 60 days against 1/15 net 45 days. Sales increase by 15%, bad debts rise to 2.5% from 1.5%, contribution to sales ratio is 25%, tax is 30%, and required after-tax return is 12%. Should the firm change the credit policy?";
  const answer = buildCreditPolicyAnalysisReply(question, 'english');
  assert.ok(answer);
  const assessment = assessParakhResponseQuality({
    question,
    answer,
    course: 'CA_INTERMEDIATE',
    subjects: ['Financial Management and Strategic Management'],
    knowledgeMatched: true,
  });
  assert.equal(assessment.questionKind, 'numerical');
  assert.equal(assessment.subjectDomain, 'financial_management');
  assert.equal(assessment.status, 'PARTIAL_NEEDS_INPUT');
  assert.equal(assessment.checks.numericalWorkings, true);
  assert.equal(assessment.checks.assumptionsDisclosed, true);
  assert.equal(assessment.factualAccuracyCertified, false);
});

test('current statutory questions require an authoritative primary source, not just a search result', () => {
  const question = 'What is the latest GST rate applicable to this supply?';
  const noSource = assessParakhResponseQuality({
    question,
    answer: 'The latest rate must be checked against the current official notification before applying it. Do not rely on an old summary.',
    course: 'CA_INTERMEDIATE',
    subjects: ['Taxation'],
    knowledgeMatched: false,
  });
  assert.equal(noSource.questionKind, 'current_information');
  assert.equal(noSource.requiresPrimarySource, true);
  assert.equal(noSource.status, 'NEEDS_PRIMARY_SOURCE');

  const withPrimarySource = assessParakhResponseQuality({
    question,
    answer: 'The applicable rate is stated in the official notification. Check the exact supply classification, effective date and any exemption before selecting the rate. Apply the primary notification to the facts.',
    course: 'CA_INTERMEDIATE',
    subjects: ['Taxation'],
    sources: [{ title: 'CBIC notification', url: 'https://www.cbic.gov.in/notifications/example' }],
    knowledgeMatched: true,
  });
  assert.equal(withPrimarySource.checks.primarySourcePresent, true);
  assert.notEqual(withPrimarySource.status, 'NEEDS_PRIMARY_SOURCE');
});

test('subject readiness reports partial seed guidance without claiming complete CA coverage', () => {
  const report = buildParakhSubjectCoverageReport([
    'Accounting',
    'Business Laws',
    'Taxation',
    'Auditing and Ethics',
    'Financial Management and Strategic Management',
  ]);
  const accounting = report.subjectDomains.find((item) => item.domain === 'accounting');
  const taxation = report.subjectDomains.find((item) => item.domain === 'taxation');
  assert.equal(report.overallStatus, 'FOUNDATION_IN_PROGRESS');
  assert.equal(accounting?.guidanceStatus, 'PARTIAL_GUIDANCE_SEEDED');
  assert.equal(taxation?.guidanceStatus, 'PARTIAL_GUIDANCE_SEEDED');
  assert.equal(accounting?.completeVerifiedCoverage, false);
  assert.equal(accounting?.caFinalCurriculumMapping, 'NOT_MAPPED_IN_CURRENT_REGISTRY');
  assert.equal(report.automaticModelTraining, false);
  assert.equal(report.humanReviewRequiredForKnowledgeChanges, true);
});

test('benchmark harness checks required answer evidence without certifying factual accuracy', () => {
  const result = evaluateParakhQualityBenchmark({
    id: 'gst-current-primary-source',
    question: 'What is the latest GST rate for this supply?',
    course: 'CA_INTERMEDIATE',
    expectedQuestionKind: 'current_information',
    requiredPatterns: ['effective date', 'official notification'],
    forbiddenPatterns: ['always 18%'],
    requiresPrimarySource: true,
  }, '1. Check the official notification for the exact supply classification.\n2. Verify the effective date and any exemption before applying the stated rate.\nConclusion: apply the rate only after the supply facts match the published notification.', [
    { title: 'CBIC notification', url: 'https://cbic.gov.in/notifications/example' },
  ], true);
  assert.equal(result.passed, true);
  assert.deepEqual(result.failedRequirements, []);
  assert.equal(result.assessment.factualAccuracyCertified, false);
});

test('subject classifier distinguishes Financial Management and Strategic Management', () => {
  assert.equal(classifyParakhQuestion('Explain current ratio in FM', ['Financial Management and Strategic Management']).domain, 'financial_management');
  assert.equal(classifyParakhQuestion('Explain SWOT analysis in SM', ['Financial Management and Strategic Management']).domain, 'strategic_management');
  assert.equal(classifyParakhQuestion('How should I prepare audit evidence?', ['Auditing and Ethics']).domain, 'auditing');
});


test('authored subject inventory is reported as guidance seed data, not complete syllabus coverage', () => {
  const subjects = getStudyKnowledgeSubjectInventory();
  assert.ok(subjects.includes('Accounting'));
  assert.ok(subjects.includes('Taxation'));
  assert.ok(subjects.includes('Financial Management and Strategic Management'));
  assert.ok(subjects.includes('Auditing and Ethics'));
});


test('student-facing quality notices disclose primary-source, coverage and incomplete-answer limitations', () => {
  const base = {
    frameworkVersion: '1.0' as const,
    structuralScore: 20,
    questionKind: 'statutory_application' as const,
    subjectDomain: 'taxation' as const,
    requiresPrimarySource: true,
    primarySources: [],
    checks: {
      substantiveAnswer: true,
      structuredExplanation: false,
      topicKnowledgeMatched: false,
      numericalWorkings: true,
      conclusionOrNextStep: false,
      assumptionsDisclosed: true,
      primarySourcePresent: false,
    },
    limitations: [],
    factualAccuracyCertified: false as const,
  };
  assert.match(buildParakhQualityNotice({ ...base, status: 'NEEDS_PRIMARY_SOURCE' }, 'hinglish'), /verified official primary source/i);
  assert.match(buildParakhQualityNotice({ ...base, status: 'NEEDS_HUMAN_REVIEW' }, 'english'), /verified subject-specific reference/i);
  assert.match(buildParakhQualityNotice({ ...base, status: 'INCOMPLETE' }, 'hindi'), /complete worked answer/i);
  assert.equal(buildParakhQualityNotice({ ...base, status: 'STRUCTURE_READY' }, 'english'), '');
});
