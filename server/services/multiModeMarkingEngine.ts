import { QuestionEvaluation, MarkingComponent } from '../../src/types/index.js';
import { AuthoritativePaperStructure } from './paperStructureService.js';

export interface ModeScoreSummary {
  checkingMode: 'standard' | 'strict' | 'lenient';
  displayName: string;
  totalMarks: number;
  maximumMarks: number;
  attemptedMaxMarks: number;
  percentage: number;
  attemptedPercentage: number;
  grade: string;
  philosophy: string;
}

export interface MultiModeResult {
  activeMode: 'standard' | 'strict' | 'lenient';
  activeQuestions: QuestionEvaluation[];
  activeTotalMarks: number;
  attemptedMaxMarks: number;
  officialPaperMaxMarks: number;
  modeBreakdown: {
    standard: ModeScoreSummary;
    strict: ModeScoreSummary;
    moderate: ModeScoreSummary;
  };
}

/**
 * Derives Grade from percentage as per ICAI examination guidelines.
 */
function calculateGrade(percentage: number): string {
  if (percentage >= 70) return 'Distinction';
  if (percentage >= 60) return 'Exemption';
  if (percentage >= 50) return 'Pass';
  if (percentage >= 40) return 'Marginal Pass';
  return 'Fail';
}

/**
 * Applies the authoritative multi-mode marking philosophy to an immutable set of questions.
 *
 * Core Mandates:
 * 1. ONE ANSWER SHEET -> ONE COVERAGE MAP -> ONE QUESTION MAPPING -> THREE MARKING MODES.
 * 2. Attempted / evaluable questions and maximum marks are 100% IMMUTABLE across all modes.
 * 3. Strict mode CAN NEVER award higher marks than Standard mode (Strict <= Standard <= Moderate).
 * 4. MCQs are evaluated deterministically against the authoritative key.
 */
export function applyMultiModeMarkingPhilosophy(
  baseQuestions: QuestionEvaluation[],
  requestedMode: 'standard' | 'strict' | 'lenient' = 'standard',
  paperStructure?: AuthoritativePaperStructure | number
): MultiModeResult {
  const officialPaperMaxMarks =
    typeof paperStructure === 'number'
      ? paperStructure
      : paperStructure?.totalPaperMaxMarks || 100;

  // Verify attemptedMaxMarks across the immutable question set
  const attemptedMaxMarks = baseQuestions.reduce((sum, q) => sum + (Number(q.maximumMarks) || 0), 0);

  // 1. Build Standard Questions (Balanced ICAI step-marking)
  const standardQuestions: QuestionEvaluation[] = baseQuestions.map((q) => {
    const qMax = Number(q.maximumMarks) || 0;
    const comps = (q.markingComponents || []).map((c) => ({
      ...c,
      marksAwarded: Math.min(Number(c.marksAvailable) || 0, Math.max(0, Number(c.marksAwarded) || 0)),
      marksDeducted: Math.max(0, (Number(c.marksAvailable) || 0) - (Number(c.marksAwarded) || 0)),
    }));
    const awarded = comps.length > 0
      ? Math.min(qMax, comps.reduce((s, c) => s + (c.marksAwarded || 0), 0))
      : Math.min(qMax, Math.max(0, Number(q.marksAwarded) || 0));
    const marksLost = Math.max(0, qMax - awarded);

    return {
      ...q,
      marksAwarded: Math.round(awarded * 4) / 4,
      marksLost: Math.round(marksLost * 4) / 4,
      status: awarded >= qMax ? 'correct' : awarded > 0 ? 'partially_correct' : 'incorrect',
      markingComponents: comps,
    };
  });

  // 2. Build Strict Questions (Rigorous / Harsh ICAI step-marking)
  // Hard Rule: Every component and every question MUST have awarded <= standard awarded.
  const strictQuestions: QuestionEvaluation[] = standardQuestions.map((sq) => {
    const isMcq = Boolean(
      (sq.questionNumber && String(sq.questionNumber).toLowerCase().includes('mcq')) ||
      (sq.subQuestion && String(sq.subQuestion).toLowerCase().includes('mcq')) ||
      sq.topic?.toLowerCase().includes('mcq') ||
      (sq.markingComponents && sq.markingComponents.some((c) => c.componentType === 'MCQ'))
    );

    const qMax = Number(sq.maximumMarks) || 0;

    // MCQs are deterministic: matching option gets full marks, non-matching gets 0
    if (isMcq) {
      return {
        ...sq,
        markingModeApplied: 'strict',
      };
    }

    // For descriptive questions, apply strict ICAI examiner deductions:
    // - Omission of statutory section / sub-section loses provision step credit
    // - Calculation steps with arithmetic slips receive reduced partial credit
    // - Incomplete working notes are penalized
    const strictComponents: MarkingComponent[] = (sq.markingComponents || []).map((c) => {
      const avail = Number(c.marksAvailable) || 0;
      const stdAward = Number(c.marksAwarded) || 0;
      let strictAward = stdAward;

      if (c.componentType === 'PROVISION' || c.componentType === 'PRINCIPLE') {
        if (c.assessment !== 'CORRECT' || (c.deductionReason && /missing|inaccurate|partial/i.test(c.deductionReason))) {
          // Strict: no partial credit for vague or incomplete statutory citation
          strictAward = Math.min(stdAward, Math.round(stdAward * 0.5 * 2) / 2);
        }
      } else if (c.componentType === 'CALCULATION' || c.componentType === 'WORKING') {
        if (c.assessment !== 'CORRECT') {
          // Strict: harsher penalty for calculation slips
          strictAward = Math.min(stdAward, Math.max(0, Math.floor(stdAward * 0.7 * 2) / 2));
        }
      } else if (c.componentType === 'CONCLUSION') {
        if (c.assessment !== 'CORRECT') {
          strictAward = 0;
        }
      } else {
        strictAward = Math.min(stdAward, Math.round(stdAward * 0.8 * 2) / 2);
      }

      // Hard clamp: strict award CAN NEVER EXCEED standard award
      strictAward = Math.min(stdAward, Math.max(0, Math.round(strictAward * 2) / 2));
      const strictDeducted = Math.max(0, avail - strictAward);

      return {
        ...c,
        marksAwarded: strictAward,
        marksDeducted: strictDeducted,
        deductionReason: strictAward < stdAward
          ? (c.deductionReason ? `${c.deductionReason} [Strict ICAI Benchmark: rigorous deduction for omission of statutory section or intermediate note].` : 'Strict ICAI deduction applied for lack of exhaustive technical detail.')
          : c.deductionReason,
      };
    });

    const strictAwarded = strictComponents.length > 0
      ? Math.min(sq.marksAwarded, strictComponents.reduce((s, c) => s + (c.marksAwarded || 0), 0))
      : Math.min(sq.marksAwarded, Math.round(sq.marksAwarded * 0.75 * 2) / 2);
    const strictLost = Math.max(0, qMax - strictAwarded);

    return {
      ...sq,
      marksAwarded: Math.round(strictAwarded * 4) / 4,
      marksLost: Math.round(strictLost * 4) / 4,
      status: strictAwarded >= qMax ? 'correct' : strictAwarded > 0 ? 'partially_correct' : 'incorrect',
      markingComponents: strictComponents,
      reasonForDeduction: strictAwarded < sq.marksAwarded
        ? `Strict mode evaluation: ${Math.round((sq.marksAwarded - strictAwarded) * 4) / 4} additional mark(s) deducted for strict statutory citations and step precision.`
        : sq.reasonForDeduction,
      markingModeApplied: 'strict',
    };
  });

  // 3. Build Moderate / Lenient Questions (Candidate-friendly step-marking)
  // Hard Rule: Every component and every question MUST have awarded >= standard awarded.
  const moderateQuestions: QuestionEvaluation[] = standardQuestions.map((sq) => {
    const isMcq = Boolean(
      (sq.questionNumber && String(sq.questionNumber).toLowerCase().includes('mcq')) ||
      (sq.subQuestion && String(sq.subQuestion).toLowerCase().includes('mcq')) ||
      sq.topic?.toLowerCase().includes('mcq') ||
      (sq.markingComponents && sq.markingComponents.some((c) => c.componentType === 'MCQ'))
    );

    const qMax = Number(sq.maximumMarks) || 0;

    if (isMcq) {
      return {
        ...sq,
        markingModeApplied: 'moderate',
      };
    }

    const modComponents: MarkingComponent[] = (sq.markingComponents || []).map((c) => {
      const avail = Number(c.marksAvailable) || 0;
      const stdAward = Number(c.marksAwarded) || 0;
      let modAward = stdAward;
      let diffCategory: string | undefined = undefined;
      let diffJustification: string | undefined = undefined;

      const evStr = (c.studentEvidence || '').trim();
      const hasMeaningfulEvidence =
        evStr.length > 0 &&
        !/^(?:not calculated|not attempted|unattempted|blank|none cited|left blank|omitted|n\/?a|-|not provided|none)\.?$/i.test(evStr);

      if (stdAward < avail && hasMeaningfulEvidence) {
        const deficit = avail - stdAward;

        // Moderate Mode: Benefit of doubt applies ONLY to identifiable, conceptually sound work
        if (c.assessment === 'PARTIALLY_CORRECT') {
          const rawBenefit = Math.round(deficit * 0.45 * 4) / 4;
          const benefit = Math.max(0.25, rawBenefit);
          modAward = Math.min(avail, stdAward + benefit);

          if (c.componentType === 'PROVISION' || c.componentType === 'PRINCIPLE' || c.componentType === 'CONDITION') {
            diffCategory = 'VALID_CONCEPTUAL_CREDIT';
            diffJustification = `Statutory principle or legal provision partially cited and conceptually understood in candidate evidence: "${evStr.slice(0, 80)}"`;
          } else if (c.componentType === 'CALCULATION' || c.componentType === 'WORKING') {
            diffCategory = sq.consequentialErrorDetected ? 'VALID_CONSEQUENTIAL_MARKING' : 'VALID_PARTIAL_CREDIT';
            diffJustification = `Valid intermediate computational steps or formula presented in evidence: "${evStr.slice(0, 80)}"`;
          } else if (c.componentType === 'APPLICATION' || c.componentType === 'TREATMENT') {
            diffCategory = 'REFERENCE_SUPPORTED_APPLICATION';
            diffJustification = `Application steps grounded in reference materials and factual application in evidence: "${evStr.slice(0, 80)}"`;
          } else {
            diffCategory = 'VALID_ALTERNATIVE_METHOD';
            diffJustification = `Alternative method recognized in ICAI solutions supported by candidate evidence: "${evStr.slice(0, 80)}"`;
          }
        } else if (c.assessment === 'INCORRECT' && sq.consequentialErrorDetected) {
          // Consequential marking allowed when prior step error led to arithmetic divergence
          const rawBenefit = Math.round(deficit * 0.4 * 4) / 4;
          const benefit = Math.max(0.25, rawBenefit);
          modAward = Math.min(avail, stdAward + benefit);
          diffCategory = 'VALID_CONSEQUENTIAL_MARKING';
          diffJustification = `Consequential credit awarded for subsequent methodology despite prior arithmetic slip.`;
        }
        // If assessment === 'INCORRECT' and not consequential, NO marks can be awarded!
      }

      // Hard clamp: moderate award CAN NEVER BE LESS THAN standard award, and NEVER EXCEED component max
      modAward = Math.min(avail, Math.max(stdAward, Math.round(modAward * 2) / 2));
      const modDeducted = Math.max(0, avail - modAward);

      return {
        ...c,
        marksAwarded: modAward,
        marksDeducted: modDeducted,
        modeDifferenceCategory: modAward > stdAward ? diffCategory : undefined,
        modeDifferenceJustification: modAward > stdAward ? diffJustification : undefined,
        deductionReason: modAward > stdAward
          ? (c.deductionReason ? `${c.deductionReason} [Moderate: ${diffCategory || 'VALID_PARTIAL_CREDIT'} - ${diffJustification || 'supported partial credit'}].` : undefined)
          : c.deductionReason,
      };
    });

    const modAwarded = modComponents.length > 0
      ? Math.max(sq.marksAwarded, Math.min(qMax, modComponents.reduce((s, c) => s + (c.marksAwarded || 0), 0)))
      : Math.max(sq.marksAwarded, Math.min(qMax, sq.marksAwarded + Math.round((qMax - sq.marksAwarded) * 0.3 * 2) / 2));
    const modLost = Math.max(0, qMax - modAwarded);

    const qHasDiff = modAwarded > sq.marksAwarded;
    const dominantCategory = modComponents.find((c) => c.modeDifferenceCategory)?.modeDifferenceCategory ||
      (qHasDiff ? 'VALID_PARTIAL_CREDIT' : undefined);
    const dominantJustification = modComponents.find((c) => c.modeDifferenceJustification)?.modeDifferenceJustification ||
      (qHasDiff ? 'Partial credit awarded for candidate-friendly step marking supported by student evidence.' : undefined);

    return {
      ...sq,
      marksAwarded: Math.round(modAwarded * 4) / 4,
      marksLost: Math.round(modLost * 4) / 4,
      status: modAwarded >= qMax ? 'correct' : modAwarded > 0 ? 'partially_correct' : 'incorrect',
      markingComponents: modComponents,
      markingModeApplied: 'moderate',
      modeDifferenceCategory: dominantCategory,
      modeDifferenceJustification: dominantJustification,
    };
  });

  // Calculate totals and verify hard ordering invariant: Strict <= Standard <= Moderate
  const stdTotal = Math.round(standardQuestions.reduce((s, q) => s + (q.marksAwarded || 0), 0) * 4) / 4;
  let strictTotal = Math.round(strictQuestions.reduce((s, q) => s + (q.marksAwarded || 0), 0) * 4) / 4;
  let modTotal = Math.round(moderateQuestions.reduce((s, q) => s + (q.marksAwarded || 0), 0) * 4) / 4;

  // Enforce mathematical invariant
  if (strictTotal > stdTotal) {
    strictTotal = stdTotal;
  }
  if (modTotal < stdTotal) {
    modTotal = stdTotal;
  }

  const stdPct = Math.round((stdTotal / officialPaperMaxMarks) * 1000) / 10;
  const strictPct = Math.round((strictTotal / officialPaperMaxMarks) * 1000) / 10;
  const modPct = Math.round((modTotal / officialPaperMaxMarks) * 1000) / 10;

  const stdAttPct = attemptedMaxMarks > 0 ? Math.round((stdTotal / attemptedMaxMarks) * 1000) / 10 : 0;
  const strictAttPct = attemptedMaxMarks > 0 ? Math.round((strictTotal / attemptedMaxMarks) * 1000) / 10 : 0;
  const modAttPct = attemptedMaxMarks > 0 ? Math.round((modTotal / attemptedMaxMarks) * 1000) / 10 : 0;

  const modeBreakdown = {
    standard: {
      checkingMode: 'standard' as const,
      displayName: 'Standard ICAI Step Marking',
      totalMarks: stdTotal,
      maximumMarks: officialPaperMaxMarks,
      attemptedMaxMarks,
      percentage: stdPct,
      attemptedPercentage: stdAttPct,
      grade: calculateGrade(stdPct),
      philosophy: 'Balanced ICAI examination marking with standard step credit and reasonable statutory deductions.',
    },
    strict: {
      checkingMode: 'strict' as const,
      displayName: 'Strict Evaluator',
      totalMarks: strictTotal,
      maximumMarks: officialPaperMaxMarks,
      attemptedMaxMarks,
      percentage: strictPct,
      attemptedPercentage: strictAttPct,
      grade: calculateGrade(strictPct),
      philosophy: 'Rigorous step marking with strict enforcement of statutory provisions, section citations, and complete working notes.',
    },
    moderate: {
      checkingMode: 'lenient' as const,
      displayName: 'Moderate Evaluator',
      totalMarks: modTotal,
      maximumMarks: officialPaperMaxMarks,
      attemptedMaxMarks,
      percentage: modPct,
      attemptedPercentage: modAttPct,
      grade: calculateGrade(modPct),
      philosophy: 'Candidate-friendly step marking with benefit of doubt for conceptual understanding and intermediate methodology.',
    },
  };

  const activeQuestions =
    requestedMode === 'strict'
      ? strictQuestions
      : requestedMode === 'lenient'
      ? moderateQuestions
      : standardQuestions;

  const activeTotalMarks =
    requestedMode === 'strict'
      ? strictTotal
      : requestedMode === 'lenient'
      ? modTotal
      : stdTotal;

  return {
    activeMode: requestedMode,
    activeQuestions,
    activeTotalMarks,
    attemptedMaxMarks,
    officialPaperMaxMarks,
    modeBreakdown,
  };
}
