import { db } from '../db.js';

export interface EvidenceItem {
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
}

export interface RecurringPattern {
  id: string;
  title: string;
  category: string;
  description: string;
  detectionCount: number;
  evaluationsCount: number;
  typicalLoss: string;
  examples: string[];
  nextTimeRule: string;
  subjectArea: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence: EvidenceItem[];
}

export interface ImprovedPattern {
  id: string;
  title: string;
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
  };
}

export interface RecoveredMarkItem {
  subjectName: string;
  area: string;
  marksRecovered: number;
  detail: string;
  earlierEvaluationId: string;
  recentEvaluationId: string;
}

export interface SubjectExaminerPatternFlow {
  subjectCategory: 'LAW' | 'TAX' | 'ACCOUNTS' | 'AUDIT' | 'GENERAL';
  title: string;
  stepFlow: string[];
  observedCompliance: string;
  keyObservation: string;
}

export interface StudentExaminerProfile {
  studentId: string;
  evaluationsAnalysed: number;
  insufficientHistory: boolean;
  message?: string;
  recurringPatternsCount: number;
  improvedPatternsCount: number;
  attentionNeededCount: number;
  marksRecoveredTotal: number;
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
      'Reciting legal provisions or theory in isolation without actively linking and correlating them to the specific factual matrix given in the problem.',
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
 * Categorize a question/component issue into one of the 11 recognized patterns.
 */
export function classifyIssue(
  compType: string,
  deductionReason: string,
  questionReason: string,
  missingReq: string,
  comment: string
): string | null {
  // 0. Explicit Component Types take highest priority
  const upperType = (compType || '').toUpperCase().trim();
  if (upperType === 'CONCLUSION') return 'incomplete_conclusions';
  if (upperType === 'PROVISION' || upperType === 'PRINCIPLE') return 'missing_provisions';
  if (upperType === 'APPLICATION') return 'weak_application';
  if (upperType === 'WORKING') return 'missing_working_notes';
  if (upperType === 'CALCULATION') return 'calculation_errors';
  if (upperType === 'ASSUMPTION') return 'unsupported_assumptions';
  if (upperType === 'PRESENTATION') return 'presentation_issues';

  const combined = `${compType} ${deductionReason} ${questionReason} ${missingReq} ${comment}`.toLowerCase();

  // 1. Conclusion
  if (
    compType.toUpperCase() === 'CONCLUSION' ||
    combined.includes('conclusion missing') ||
    combined.includes('incomplete conclusion') ||
    combined.includes('no conclusion') ||
    combined.includes('concluding sentence') ||
    combined.includes('advice to client missing') ||
    combined.includes('final conclusion')
  ) {
    return 'incomplete_conclusions';
  }

  // 2. Provisions & Statutory citations
  if (
    compType.toUpperCase() === 'PROVISION' ||
    compType.toUpperCase() === 'PRINCIPLE' ||
    combined.includes('section not cited') ||
    combined.includes('missing section') ||
    combined.includes('provision not cited') ||
    combined.includes('applicable standard') ||
    combined.includes('accounting standard') ||
    combined.includes('ind as') ||
    combined.includes('statutory provision') ||
    combined.includes('standards on auditing') ||
    combined.includes('sa ')
  ) {
    return 'missing_provisions';
  }

  // 3. Application to case facts
  if (
    compType.toUpperCase() === 'APPLICATION' ||
    combined.includes('application to facts') ||
    combined.includes('weak application') ||
    combined.includes('facts not correlated') ||
    combined.includes('not linked to facts') ||
    combined.includes('factual correlation') ||
    combined.includes('substantiate with facts')
  ) {
    return 'weak_application';
  }

  // 4. Working notes
  if (
    compType.toUpperCase() === 'WORKING' ||
    combined.includes('working note') ||
    combined.includes('working notes') ||
    combined.includes('workings missing') ||
    combined.includes('schedule missing') ||
    combined.includes('no working note') ||
    combined.includes('supporting workings')
  ) {
    return 'missing_working_notes';
  }

  // 5. Calculation error
  if (
    compType.toUpperCase() === 'CALCULATION' ||
    combined.includes('calculation error') ||
    combined.includes('arithmetic') ||
    combined.includes('mathematical slip') ||
    combined.includes('wrong total') ||
    combined.includes('computation slip')
  ) {
    return 'calculation_errors';
  }

  // 6. Treatment
  if (
    compType.toUpperCase() === 'TREATMENT' ||
    combined.includes('incorrect treatment') ||
    combined.includes('accounting treatment') ||
    combined.includes('wrong debit') ||
    combined.includes('wrong credit') ||
    combined.includes('tax head') ||
    combined.includes('tds treatment')
  ) {
    return 'incorrect_treatment';
  }

  // 7. Presentation
  if (
    compType.toUpperCase() === 'PRESENTATION' ||
    combined.includes('presentation') ||
    combined.includes('tabular format') ||
    combined.includes('formatting issue') ||
    combined.includes('cluttered layout')
  ) {
    return 'presentation_issues';
  }

  // 8. Requirement not followed
  if (
    combined.includes('requirement not followed') ||
    combined.includes('not as requested') ||
    combined.includes('format required') ||
    combined.includes('demanded journal')
  ) {
    return 'requirement_not_followed';
  }

  // 9. Assumptions
  if (
    combined.includes('assumption') ||
    combined.includes('unstated assumption') ||
    combined.includes('unsupported assumption')
  ) {
    return 'unsupported_assumptions';
  }

  // 10. Incomplete coverage
  if (
    combined.includes('incomplete answer') ||
    combined.includes('partially omitted') ||
    combined.includes('sub-question omitted') ||
    combined.includes('incomplete coverage')
  ) {
    return 'incomplete_coverage';
  }

  // 11. Conceptual
  if (
    combined.includes('conceptual') ||
    combined.includes('concept error') ||
    combined.includes('fundamental error')
  ) {
    return 'conceptual_mistakes';
  }

  return null;
}

/**
 * Determine subject category and step chain for subject-specific analysis.
 */
function getSubjectCategory(subjectKey: string, subjectName: string): 'LAW' | 'TAX' | 'ACCOUNTS' | 'AUDIT' | 'GENERAL' {
  const s = `${subjectKey} ${subjectName}`.toLowerCase();
  if (s.includes('law') || s.includes('corporate') || s.includes('jurisprudence') || s.includes('business law')) {
    return 'LAW';
  }
  if (s.includes('tax') || s.includes('direct') || s.includes('indirect') || s.includes('gst')) {
    return 'TAX';
  }
  if (
    s.includes('account') ||
    s.includes('financial reporting') ||
    s.includes('cost') ||
    s.includes('fm') ||
    s.includes('financial management') ||
    s.includes('afm')
  ) {
    return 'ACCOUNTS';
  }
  if (s.includes('audit') || s.includes('ethics') || s.includes('assurance')) {
    return 'AUDIT';
  }
  return 'GENERAL';
}

/**
 * Compute the Personal Examiner Profile from the student's authoritative evaluation records.
 * Adheres strictly to:
 * - Version safety: each evaluation counted once (V1/V2 recheck does not double count)
 * - Insufficient history rule (< 2 evaluations = building state, 0 recurring patterns)
 * - Recurring criteria: MUST span >= 2 distinct evaluations
 * - Zero psychological/personality inferences
 * - Evidence linkage on all recurring patterns
 */
export function calculateStudentExaminerProfile(studentId: string): StudentExaminerProfile {
  // Query only completed evaluations with result_json
  // Notice: evaluations table holds the authoritative current version (v1 or v2). Each evaluation row is unique by evaluation id.
  const rows = db
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

  const evaluationsAnalysed = rows.length;
  const nowIso = new Date().toISOString();

  // Insufficient history handling (< 2 evaluations)
  if (evaluationsAnalysed < 2) {
    return {
      studentId,
      evaluationsAnalysed,
      insufficientHistory: true,
      message:
        evaluationsAnalysed === 0
          ? 'Your Personal Examiner Profile is building. Complete a few evaluations to identify recurring mark-loss patterns.'
          : 'Your Personal Examiner Profile is building. 1 evaluation has been analysed; recurring patterns are only established after multiple evaluations to prevent false assumptions.',
      recurringPatternsCount: 0,
      improvedPatternsCount: 0,
      attentionNeededCount: 0,
      marksRecoveredTotal: 0,
      recurringPatterns: [],
      improvedPatterns: [],
      marksRecovered: [],
      subjectPatterns: [],
      currentFocusAreas: [],
      lastEvaluationId: rows[rows.length - 1]?.id,
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

  // Map of patternId -> { evidence: EvidenceItem[], evalIds: Set<string>, subjectKeys: Set<string>, totalLoss: number }
  const patternMap = new Map<
    string,
    {
      evidence: EvidenceItem[];
      evalIds: Set<string>;
      subjectKeys: Set<string>;
      totalLoss: number;
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
    GENERAL: { totalAnswers: 0, stepDeficiencies: {}, subjects: new Set() },
  };

  parsedEvals.forEach((pe, evalIndex) => {
    const evalId = pe.row.id;
    const versionId = pe.row.current_evaluation_version_id || 'v1';
    const subjKey = pe.row.subject_key || 'SUBJECT';
    const subjName = pe.row.subject_name || 'Subject';
    const lvl = pe.row.level || 'INTERMEDIATE';
    const att = pe.row.attempt || 'Recent Attempt';
    const subjCat = getSubjectCategory(subjKey, subjName);

    subjectStepStats[subjCat].subjects.add(subjName);

    const patternsThisEval = new Set<string>();
    evalPatternsDetected.set(evalIndex, patternsThisEval);

    const questions: any[] = pe.result.questions || pe.result.questionEvaluations || [];

    questions.forEach((q: any) => {
      subjectStepStats[subjCat].totalAnswers++;

      const qNum = q.questionNumber || q.id || 'Q';
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
        comps.forEach((comp: any) => {
          const cType = (comp.componentType || '').toString();
          const cLoss =
            Number(comp.marksDeducted ?? comp.marksLost) ||
            Math.max(
              0,
              (Number(comp.marksAvailable ?? comp.maxMarks ?? 0) - Number(comp.marksAwarded ?? 0))
            );
          const cReason = comp.deductionReason || comp.expectedRequirement || comp.comment || '';
          const assessment = comp.assessment || comp.status;

          const isDeficient =
            cLoss > 0 ||
            assessment === 'PARTIALLY_CORRECT' ||
            assessment === 'INCORRECT' ||
            assessment === 'OMITTED' ||
            (Boolean(cReason) &&
              !cReason.toLowerCase().includes('accurately') &&
              !cReason.toLowerCase().includes('valid conclusion'));

          if (isDeficient) {
            const patternId = classifyIssue(cType, cReason, qReason, missingReq, comment);
            if (patternId) {
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
                });
              }

              const entry = patternMap.get(patternId)!;
              entry.evalIds.add(evalId);
              entry.subjectKeys.add(subjName);
              entry.totalLoss += cLoss > 0 ? cLoss : 0.5;

              entry.evidence.push({
                evaluationId: evalId,
                evaluationVersionId: versionId,
                date: pe.date,
                level: lvl,
                subjectKey: subjKey,
                subjectName: subjName,
                paper: pe.row.id,
                attempt: att,
                questionNumber: qNum,
                subQuestion: comp.componentName || comp.stepTitle,
                marksLost: cLoss > 0 ? cLoss : 0.5,
                observedIssue: cReason || comp.expectedRequirement || qReason || 'Step requirement incomplete',
                evidenceReference: comp.studentEvidence || 'Answer sheet submission',
                deductionReason: cReason || qReason || 'Step deduction applied under ICAI guidelines',
              });
            }
          }
        });
      } else if (qLoss > 0) {
        // Fallback when question doesn't have explicit markingComponents array
        const patternId = classifyIssue('GENERAL', qReason, qReason, missingReq, comment);
        if (patternId) {
          patternsThisEval.add(patternId);
          subjectStepStats[subjCat].stepDeficiencies[patternId] =
            (subjectStepStats[subjCat].stepDeficiencies[patternId] || 0) + 1;

          if (!patternMap.has(patternId)) {
            patternMap.set(patternId, {
              evidence: [],
              evalIds: new Set(),
              subjectKeys: new Set(),
              totalLoss: 0,
            });
          }

          const entry = patternMap.get(patternId)!;
          entry.evalIds.add(evalId);
          entry.subjectKeys.add(subjName);
          entry.totalLoss += qLoss;

          entry.evidence.push({
            evaluationId: evalId,
            evaluationVersionId: versionId,
            date: pe.date,
            level: lvl,
            subjectKey: subjKey,
            subjectName: subjName,
            paper: pe.row.id,
            attempt: att,
            questionNumber: qNum,
            marksLost: qLoss,
            observedIssue: qReason || missingReq || 'Question requirement not fully satisfied',
            evidenceReference: 'Answer sheet submission',
            deductionReason: qReason || 'Marks lost in step evaluation',
          });
        }
      }
    });
  });

  // Calculate RECURRING patterns:
  // Strictly requires evaluationIds.size >= 2 (spanning at least 2 distinct evaluations)
  const recurringPatterns: RecurringPattern[] = [];
  const latestEvalIndex = parsedEvals.length - 1;
  const latestPatterns = evalPatternsDetected.get(latestEvalIndex) || new Set<string>();

  const improvedPatterns: ImprovedPattern[] = [];
  const recoveredMarksList: RecoveredMarkItem[] = [];

  for (const [patternId, data] of patternMap.entries()) {
    const isRecurring = data.evalIds.size >= 2;
    const def = PATTERN_DEFINITIONS[patternId] || {
      title: patternId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      category: 'Exam Performance',
      description: 'Recurring observation noted across multiple evaluations.',
      nextTimeRule: 'Follow ICAI step marking rules and structured presentation.',
      severity: 'MEDIUM' as const,
    };

    if (isRecurring) {
      const avgLoss = data.evidence.length > 0 ? (data.totalLoss / data.evidence.length).toFixed(1) : '1.0';
      const typicalLoss =
        data.evidence.length > 1
          ? `0.5 – ${(Number(avgLoss) * 1.5).toFixed(1)} marks / question`
          : `${avgLoss} marks / question`;

      const uniqueExamples = Array.from(new Set(data.evidence.map((e) => e.questionNumber))).slice(0, 4);

      recurringPatterns.push({
        id: patternId,
        title: def.title,
        category: def.category,
        description: def.description,
        detectionCount: data.evalIds.size,
        evaluationsCount: evaluationsAnalysed,
        typicalLoss,
        examples: uniqueExamples,
        nextTimeRule: def.nextTimeRule,
        subjectArea: Array.from(data.subjectKeys).join(', ') || 'Core Subjects',
        severity: def.severity,
        evidence: data.evidence,
      });

      // Check if pattern has IMPROVED in the latest evaluation
      // (Was detected in >= 2 earlier evaluations, but NOT detected in latest evaluation)
      const detectedInEarlier = Array.from(data.evalIds).some((eid) => eid !== parsedEvals[latestEvalIndex].row.id);
      const notInLatest = !latestPatterns.has(patternId);

      if (detectedInEarlier && notInLatest && parsedEvals.length >= 2) {
        const earlierEvidence = data.evidence.filter(
          (e) => e.evaluationId !== parsedEvals[latestEvalIndex].row.id
        );
        const worstEarlier = earlierEvidence[0];

        improvedPatterns.push({
          id: patternId,
          title: def.title,
          previousOccurrenceCount: earlierEvidence.length,
          previousEvaluationsCount: data.evalIds.size,
          recentStatus: 'Not detected in latest evaluation',
          status: 'IMPROVING',
          improvementSummary: `Previous evaluations: ${earlierEvidence.length} recurring misses. Recent evaluation: Issue not detected. Status: Improving.`,
          evidenceComparison: {
            earlierEvaluationId: worstEarlier?.evaluationId || 'eval_prev',
            earlierQuestion: worstEarlier?.questionNumber || 'Q',
            earlierLoss: worstEarlier?.marksLost || 1.5,
            recentEvaluationId: parsedEvals[latestEvalIndex].row.id,
            recentQuestion: 'Comparable step in recent submission',
            recentLoss: 0,
          },
        });

        // Compute factual marks recovered (earlierLoss - 0)
        const recovered = worstEarlier ? worstEarlier.marksLost : 1.5;
        recoveredMarksList.push({
          subjectName: parsedEvals[latestEvalIndex].row.subject_name || 'Evaluated Paper',
          area: def.title,
          marksRecovered: recovered,
          detail: `${recovered} marks recovered compared with earlier evaluated answer in ${worstEarlier?.questionNumber || 'prior question'}.`,
          earlierEvaluationId: worstEarlier?.evaluationId || 'eval_earlier',
          recentEvaluationId: parsedEvals[latestEvalIndex].row.id,
        });
      }
    }
  }

  // Calculate Subject Step Flow Patterns (Law, Tax, Accounts, Audit)
  const subjectPatterns: SubjectExaminerPatternFlow[] = [];

  // LAW
  if (subjectStepStats.LAW.totalAnswers > 0) {
    const concLoss = subjectStepStats.LAW.stepDeficiencies['incomplete_conclusions'] || 0;
    const provLoss = subjectStepStats.LAW.stepDeficiencies['missing_provisions'] || 0;
    const appLoss = subjectStepStats.LAW.stepDeficiencies['weak_application'] || 0;
    const obs =
      concLoss > 0
        ? `Incomplete conclusions observed in ${concLoss} answer component${concLoss > 1 ? 's' : ''} after statutory provision.`
        : provLoss > 0
        ? `Statutory section citation omitted in ${provLoss} component${provLoss > 1 ? 's' : ''}.`
        : 'Good step compliance across Provision, Application, and Conclusion.';

    subjectPatterns.push({
      subjectCategory: 'LAW',
      title: 'Law & Corporate Governance',
      stepFlow: ['Provision', 'Application', 'Conclusion'],
      observedCompliance: `${Math.max(0, 100 - (concLoss + provLoss + appLoss) * 12)}% Step Consistency`,
      keyObservation: obs,
    });
  }

  // TAX
  if (subjectStepStats.TAX.totalAnswers > 0) {
    const workLoss = subjectStepStats.TAX.stepDeficiencies['missing_working_notes'] || 0;
    const calcLoss = subjectStepStats.TAX.stepDeficiencies['calculation_errors'] || 0;
    const obs =
      workLoss > 0
        ? `Missing working notes in ${workLoss} computation step${workLoss > 1 ? 's' : ''}.`
        : calcLoss > 0
        ? `Calculation variance noted in ${calcLoss} tax calculation step${calcLoss > 1 ? 's' : ''}.`
        : 'Consistent adherence to tax computation schedules & working notes.';

    subjectPatterns.push({
      subjectCategory: 'TAX',
      title: 'Direct & Indirect Taxation',
      stepFlow: ['Provision', 'Computation', 'Treatment', 'Conclusion'],
      observedCompliance: `${Math.max(0, 100 - (workLoss + calcLoss) * 12)}% Step Consistency`,
      keyObservation: obs,
    });
  }

  // ACCOUNTS
  if (subjectStepStats.ACCOUNTS.totalAnswers > 0) {
    const workLoss = subjectStepStats.ACCOUNTS.stepDeficiencies['missing_working_notes'] || 0;
    const calcLoss = subjectStepStats.ACCOUNTS.stepDeficiencies['calculation_errors'] || 0;
    const treatLoss = subjectStepStats.ACCOUNTS.stepDeficiencies['incorrect_treatment'] || 0;
    const obs =
      workLoss > 0
        ? `Working note cross-references absent in ${workLoss} ledger adjustment${workLoss > 1 ? 's' : ''}.`
        : treatLoss > 0
        ? `Standard accounting treatment discrepancies noted in ${treatLoss} instance${treatLoss > 1 ? 's' : ''}.`
        : 'Balanced working notes and adjustment calculations.';

    subjectPatterns.push({
      subjectCategory: 'ACCOUNTS',
      title: 'Accounting & Cost Management',
      stepFlow: ['Working', 'Adjustment', 'Calculation', 'Final Answer'],
      observedCompliance: `${Math.max(0, 100 - (workLoss + calcLoss + treatLoss) * 12)}% Step Consistency`,
      keyObservation: obs,
    });
  }

  // AUDIT
  if (subjectStepStats.AUDIT.totalAnswers > 0) {
    const stdLoss = subjectStepStats.AUDIT.stepDeficiencies['missing_provisions'] || 0;
    const appLoss = subjectStepStats.AUDIT.stepDeficiencies['weak_application'] || 0;
    const obs =
      stdLoss > 0
        ? `SA standard reference absent in ${stdLoss} audit procedure response${stdLoss > 1 ? 's' : ''}.`
        : appLoss > 0
        ? `General theoretical statements given instead of audit procedure application in ${appLoss} component${appLoss > 1 ? 's' : ''}.`
        : 'Structured presentation aligning with Standards on Auditing.';

    subjectPatterns.push({
      subjectCategory: 'AUDIT',
      title: 'Auditing & Assurance',
      stepFlow: ['Standard/Provision', 'Explanation', 'Application', 'Conclusion'],
      observedCompliance: `${Math.max(0, 100 - (stdLoss + appLoss) * 12)}% Step Consistency`,
      keyObservation: obs,
    });
  }

  // Sort recurring patterns by frequency ratio, severity, and evidence count
  const severityOrder: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  recurringPatterns.sort((a, b) => {
    const freqA = a.detectionCount / (a.evaluationsCount || 1);
    const freqB = b.detectionCount / (b.evaluationsCount || 1);
    if (freqB !== freqA) return freqB - freqA;
    const sevDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
    if (sevDiff !== 0) return sevDiff;
    return b.evidence.length - a.evidence.length;
  });

  // Attention needed count: recurring patterns that are NOT currently in improved list
  const improvedIds = new Set(improvedPatterns.map((ip) => ip.id));
  const attentionNeededPatterns = recurringPatterns.filter((rp) => !improvedIds.has(rp.id));

  // Current focus areas
  const currentFocusAreas = attentionNeededPatterns.map((rp) => rp.title);

  // Total marks recovered
  const marksRecoveredTotal = Number(
    recoveredMarksList.reduce((sum, item) => sum + item.marksRecovered, 0).toFixed(1)
  );

  return {
    studentId,
    evaluationsAnalysed,
    insufficientHistory: false,
    recurringPatternsCount: recurringPatterns.length,
    improvedPatternsCount: improvedPatterns.length,
    attentionNeededCount: attentionNeededPatterns.length,
    marksRecoveredTotal,
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
export function updateStudentExaminerProfile(studentId: string): StudentExaminerProfile {
  const profile = calculateStudentExaminerProfile(studentId);

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

  return profile;
}

/**
 * Retrieve the student's personal examiner profile from SQLite (or compute & save if not yet cached).
 */
export function getStudentExaminerProfile(studentId: string): StudentExaminerProfile {
  try {
    const row = db
      .prepare(`SELECT profile_data_json FROM student_examiner_profiles WHERE student_id = ?`)
      .get(studentId) as { profile_data_json: string } | undefined;

    if (row?.profile_data_json) {
      return JSON.parse(row.profile_data_json);
    }
  } catch (err) {
    console.error('Error fetching cached examiner profile, computing live:', err);
  }

  return updateStudentExaminerProfile(studentId);
}
