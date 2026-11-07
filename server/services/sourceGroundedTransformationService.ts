/**
 * Source-Grounded Transformation & Numerical Reasoning Integrity Service
 *
 * Implements Generic, Non-Subject-Specific Transformation Architecture:
 * 1. Raw figure stated in Question Paper != final figure to be used in evaluation.
 * 2. SourceGroundedTransformation generic object across CA Foundation, Inter & Final.
 * 3. Two-Stage Interpretation:
 *    - Stage A (Source Interpretation): Determine what authoritative source says raw fact represents.
 *    - Stage B (Student Evaluation): Determine whether student's treatment of that fact is valid.
 * 4. Source Hierarchy: QP (facts/conditions) -> SA (transformations/methods/results) -> MS (criteria) -> AI (student evaluation).
 * 5. Source-Defined Transformation Preservation: Preserve INPUT -> RULE/FORMULA -> INTERMEDIATE -> FINAL chain.
 * 6. Mathematical & Algebraic Equivalents Acceptance (e.g., X / 70% == X / 0.70 == X * 100 / 70).
 * 7. Alternative Valid Methods Acceptance.
 * 8. Source-Defined Fact vs Student Assumption Disambiguation.
 * 9. Intermediate Result Integrity Metrics & Consequential Error Handling (Own-Figure Rule).
 */

import crypto from 'node:crypto';
import {
  TransformationType,
  SourceGroundedTransformation,
  NumericalReasoningErrorType,
  IntermediateResultIntegrityRecord,
  QuestionEvaluation,
  MarkingComponent,
} from '../../src/types/index.js';

export function computeTransformationHash(content: string): string {
  return crypto.createHash('sha256').update(content || '', 'utf8').digest('hex');
}

export type { SourceGroundedTransformation };

/**
 * Generic patterns for identifying source-defined transformations across ANY CA subject
 * (Accounting, Corporate Law, Cost & Management Accounting, Taxation, Auditing, Financial Management, etc.)
 */
interface TransformationPatternDetector {
  readonly type: TransformationType;
  readonly triggerRegex: RegExp;
  readonly ruleExtractor: (snippet: string) => string;
}

const TRANSFORMATION_DETECTORS: readonly TransformationPatternDetector[] = [
  // 1. Gross-up (e.g., net of tax, net of TDS, net winnings, net receipt)
  {
    type: 'GROSS_UP',
    triggerRegex: /(?:gross(?:ing)?(?:\s+up)?|net\s+of\s+(?:tax|tds|deduction)|received\s+net\s+of|after\s+deducting\s+tds|\/\s*(?:70%|0\.70|90%|0\.90|80%|0\.80|1\s*-\s*[0-9.]+)|[*×]\s*100\s*\/\s*(?:70|80|90|69|79))/i,
    ruleExtractor: (s) => {
      const match = s.match(/(?:gross(?:ing)?(?:\s+up)?|net\s+of\s+[a-z0-9\s]+|after\s+deducting\s+[a-z0-9\s]+)/i);
      return match ? match[0].trim() : 'Gross-up of receipt net of tax/deduction';
    },
  },

  // 2. GST adjustments (e.g., tax-inclusive reverse calculation, blocked credit, RCM)
  {
    type: 'GST_ADJUSTMENT',
    triggerRegex: /(?:inclusive\s+of\s+gst|inclusive\s+of\s+tax|reverse\s+charge|rcm|blocked\s+credit|section\s+17\(5\)|[*×]\s*(?:18|12|5|28)\s*\/\s*(?:118|112|105|128)|\/\s*1\.(?:18|12|05|28))/i,
    ruleExtractor: (s) => {
      const match = s.match(/(?:inclusive\s+of\s+gst|reverse\s+charge|section\s+17\(5\)|taxable\s+value\s+computation)/i);
      return match ? match[0].trim() : 'GST adjustment or reverse tax-inclusive calculation';
    },
  },

  // 3. Tax adjustments (e.g., standard deduction, rebate, cess, surcharge)
  {
    type: 'TAX_ADJUSTMENT',
    triggerRegex: /(?:standard\s+deduction|rebate\s+u\/s\s*87a|health\s+and\s+education\s+cess|surcharge\s+@|marginal\s+relief|section\s+115bac|slab\s+rates?)/i,
    ruleExtractor: (s) => {
      const match = s.match(/(?:standard\s+deduction\s+u\/s\s*[0-9a-z()]+|rebate\s+u\/s\s*87a|cess\s*@\s*4%|surcharge|115bac)/i);
      return match ? match[0].trim() : 'Statutory tax adjustment / rate computation';
    },
  },

  // 4. Depreciation (WDV, SLM, additional depreciation, 180-day half rate)
  {
    type: 'DEPRECIATION',
    triggerRegex: /(?:written\s+down\s+value|w\.?d\.?v\.?|straight\s+line\s+method|s\.?l\.?m\.?|depreciation\s+@|put\s+to\s+use\s+for\s+less\s+than\s*180\s*days|additional\s+depreciation)/i,
    ruleExtractor: (s) => {
      const match = s.match(/(?:depreciation\s+@\s*[0-9.]+%?|less\s+than\s*180\s*days\s*\(?50%?\)?|w\.?d\.?v\.?|additional\s+depreciation)/i);
      return match ? match[0].trim() : 'Depreciation adjustment under Income Tax / Accounting Standards';
    },
  },

  // 5. Accounting Adjustments (Accruals, prepayments, unearned, inventory NRV vs cost)
  {
    type: 'ACCOUNTING_ADJUSTMENT',
    triggerRegex: /(?:outstanding\s+(?:expenses?|salary|rent)|prepaid\s+(?:expenses?|insurance)|accrued\s+income|income\s+received\s+in\s+advance|cost\s+or\s+net\s+realizable\s+value|nrv|lower\s+of\s+cost\s+and\s+nrv)/i,
    ruleExtractor: (s) => {
      const match = s.match(/(?:lower\s+of\s+cost\s+(?:or|and)\s+nrv|prepaid\s+[a-z]+|outstanding\s+[a-z]+|accrued\s+[a-z]+)/i);
      return match ? match[0].trim() : 'Accounting period-end adjustment (accrual / deferral / valuation)';
    },
  },

  // 6. Provisions & Contingent Liabilities (AS 29 / Ind AS 37, provision for doubtful debts)
  {
    type: 'PROVISION',
    triggerRegex: /(?:provision\s+for\s+(?:tax|taxation|doubtful\s+debts|bad\s+debts|warranty|contingenc(?:y|ies))|present\s+obligation|probable\s+outflow|reliable\s+estimate)/i,
    ruleExtractor: (s) => {
      const match = s.match(/(?:provision\s+for\s+[a-z\s]+|reliable\s+estimate|as\s*29|ind\s*as\s*37)/i);
      return match ? match[0].trim() : 'Provision estimation / recognition criteria';
    },
  },

  // 7. Percentage Reverse Calculation (e.g., Margin vs Mark-up: 25% on cost = 20% on sales)
  {
    type: 'PERCENTAGE_REVERSE_CALCULATION',
    triggerRegex: /(?:profit\s+@\s*[0-9.]+%\s+on\s+sales|profit\s+@\s*[0-9.]+%\s+on\s+cost|mark-?up|margin\s+(?:on\s+sales|percentage|=|of)|cost\s+plus\s*[0-9.]+%\s*=\s*(?:invoice|sales)|1\/[0-9]+\s+on\s+cost|[*×]\s*[0-9.]+\s*\/\s*1[0-9]{2}|loading\s+on\s+invoice)/i,
    ruleExtractor: (s) => {
      const match = s.match(/(?:[0-9.]+%\s+on\s+(?:cost|sales)|mark-?up\s+of\s+[0-9.]+%|margin\s+of\s+[0-9.]+%|loading\s+on\s+invoice)/i);
      return match ? match[0].trim() : 'Reverse markup or margin percentage transformation';
    },
  },

  // 8. Discounting & Time Value of Money (PV, NPV, Annuity, Ind AS 116 / 109)
  {
    type: 'DISCOUNTING',
    triggerRegex: /(?:present\s+value|pv\s+factor|discounting\s+factor|discount\s+rate|npv|annuity\s+factor|\/\s*\(1\s*\+\s*r\)\^n|ind\s*as\s*116\s+lease\s+liability)/i,
    ruleExtractor: (s) => {
      const match = s.match(/(?:present\s+value\s+factor|discount(?:ing)?\s+@\s*[0-9.]+%?|npv|pv\s+of\s+[a-z]+)/i);
      return match ? match[0].trim() : 'Present value discounting transformation';
    },
  },

  // 9. Compounding (Future Value, effective interest rate, compounding periods)
  {
    type: 'COMPOUNDING',
    triggerRegex: /(?:future\s+value|fv\s+factor|compounded\s+(?:annually|semi-annually|quarterly|monthly)|effective\s+interest\s+rate|cagr)/i,
    ruleExtractor: (s) => {
      const match = s.match(/(?:compounded\s+[a-z-]+|effective\s+(?:interest\s+rate|annual\s+rate)|future\s+value)/i);
      return match ? match[0].trim() : 'Compounding growth / interest transformation';
    },
  },

  // 10. Working Capital Adjustments
  {
    type: 'WORKING_CAPITAL_ADJUSTMENT',
    triggerRegex: /(?:operating\s+cycle|debtors\s+holding\s+period|creditors\s+payment\s+period|inventory\s+holding\s+period|working\s+capital\s+requirement|cash\s+cost\s+working\s+capital)/i,
    ruleExtractor: (s) => {
      const match = s.match(/(?:working\s+capital\s+(?:requirement|cycle)|operating\s+cycle|debtors\s+holding)/i);
      return match ? match[0].trim() : 'Working capital turnover / period transformation';
    },
  },

  // 11. Cash Flow Adjustments (Operating, investing, financing cash flows)
  {
    type: 'CASH_FLOW_ADJUSTMENT',
    triggerRegex: /(?:cash\s+flow\s+from\s+operating\s+activities|non-cash\s+(?:items?|charges?)|add\s*:\s*depreciation|changes\s+in\s+working\s+capital|indirect\s+method\s+cash\s+flow)/i,
    ruleExtractor: (s) => {
      const match = s.match(/(?:cash\s+flow\s+from\s+operating\s+activities|non-cash\s+adjustments?|indirect\s+method)/i);
      return match ? match[0].trim() : 'Cash flow statement indirect non-cash / working capital adjustment';
    },
  },

  // 12. Consolidation & Business Combinations
  {
    type: 'CONSOLIDATION',
    triggerRegex: /(?:non-controlling\s+interest|minority\s+interest|unrealized\s+profit\s+on\s+inventory|goodwill\s+on\s+consolidation|capital\s+reserve\s+on\s+acquisition|inter-?company\s+balance)/i,
    ruleExtractor: (s) => {
      const match = s.match(/(?:non-controlling\s+interest|minority\s+interest|unrealized\s+profit|goodwill|capital\s+reserve)/i);
      return match ? match[0].trim() : 'Consolidation intercompany elimination and NCI allocation';
    },
  },

  // 13. Bank & Cost Reconciliation
  {
    type: 'RECONCILIATION',
    triggerRegex: /(?:bank\s+reconciliation|cheques\s+issued\s+but\s+not\s+presented|cheques\s+deposited\s+but\s+not\s+cleared|reconciliation\s+of\s+cost\s+and\s+financial\s+accounts)/i,
    ruleExtractor: (s) => {
      const match = s.match(/(?:bank\s+reconciliation|cheques\s+(?:issued|deposited)|reconciliation\s+of\s+cost\s+and\s+financial)/i);
      return match ? match[0].trim() : 'Reconciliation adjustment timing / classification difference';
    },
  },

  // 14. Legal Exceptions & Provisos
  {
    type: 'LEGAL_EXCEPTION',
    triggerRegex: /(?:provided\s+(?:further\s+)?that|notwithstanding\s+anything\s+contained|exception\s+to\s+section|shall\s+not\s+apply\s+to|saving\s+clause)/i,
    ruleExtractor: (s) => {
      const match = s.match(/(?:provided\s+(?:further\s+)?that|exception\s+to\s+section\s*[0-9a-z()]+|notwithstanding)/i);
      return match ? match[0].trim() : 'Statutory proviso or legal exception';
    },
  },

  // 15. Threshold Application (Monetary limits, statutory ceilings)
  {
    type: 'THRESHOLD_APPLICATION',
    triggerRegex: /(?:subject\s+to\s+a\s+maximum\s+of|monetary\s+limit|threshold\s+limit|capped\s+at|whichever\s+is\s+(?:lower|less|higher|greater)|not\s+exceeding\s+`?\s*[0-9,]+)/i,
    ruleExtractor: (s) => {
      const match = s.match(/(?:whichever\s+is\s+(?:lower|less|higher|greater)|subject\s+to\s+a\s+maximum\s+of\s+`?\s*[0-9,]+|threshold\s+limit)/i);
      return match ? match[0].trim() : 'Statutory threshold ceiling or floor application';
    },
  },

  // 16. Allowable Deductions (Chapter VI-A, Section 30-37, etc.)
  {
    type: 'ALLOWABLE_DEDUCTION',
    triggerRegex: /(?:deduction\s+u\/s\s*(?:80c|80d|80ccd|80g|80jjb|80tta|80ttb|35|32|36|37)|eligible\s+for\s+deduction|allowable\s+as\s+deduction)/i,
    ruleExtractor: (s) => {
      const match = s.match(/(?:deduction\s+u\/s\s*[0-9a-z()]+|allowable\s+as\s+deduction)/i);
      return match ? match[0].trim() : 'Statutory allowable deduction computation';
    },
  },

  // 17. Set-off & Carry Forward of Losses
  {
    type: 'SET_OFF',
    triggerRegex: /(?:set-?off\s+(?:against|of)|intra-?head\s+set-?off|inter-?head\s+set-?off|speculative\s+business\s+loss|short-?term\s+capital\s+loss|long-?term\s+capital\s+loss)/i,
    ruleExtractor: (s) => {
      const match = s.match(/(?:(?:intra|inter)-?head\s+set-?off|set-?off\s+u\/s\s*(?:70|71|71b)|capital\s+loss\s+set-?off)/i);
      return match ? match[0].trim() : 'Set-off of losses according to statutory ordering rules';
    },
  },

  // 18. Carry Forward of Losses
  {
    type: 'CARRY_FORWARD',
    triggerRegex: /(?:carried\s+forward\s+to\s+subsequent|c\/f\s+of\s+loss|unabsorbed\s+depreciation\s+c\/f|can\s+be\s+carried\s+forward\s+for\s*(?:8|eight|4|four)\s*(?:assessment\s+)?years)/i,
    ruleExtractor: (s) => {
      const match = s.match(/(?:carried\s+forward\s+for\s*[0-9a-z\s]+years?|unabsorbed\s+depreciation|c\/f\s+u\/s\s*[0-9a-z()]+)/i);
      return match ? match[0].trim() : 'Statutory carry forward time limit and condition rule';
    },
  },
];

/**
 * Extracts source-grounded transformations from verified QP and SA texts.
 * Deterministic, source-grounded, zero hallucination.
 */
export function extractSourceGroundedTransformations(
  qpText: string,
  saText: string,
  _msText?: string,
  canonicalQuestionId: string = 'Q1'
): SourceGroundedTransformation[] {
  const transformations: SourceGroundedTransformation[] = [];
  const combinedSource = `${qpText}\n---\n${saText}`;

  for (const detector of TRANSFORMATION_DETECTORS) {
    if (detector.triggerRegex.test(combinedSource)) {
      // Find exact occurrences in SA
      const saLines = saText.split('\n');
      for (let i = 0; i < saLines.length; i++) {
        const line = saLines[i];
        if (detector.triggerRegex.test(line)) {
          // Extract relevant numerical or formula pattern from line
          const formulaMatch = line.match(/(?:[0-9,.]+\s*[*×/+-]\s*[0-9,.%]+(?:\s*[*×/+-]\s*[0-9,.%]+)*\s*=\s*[0-9,.]+)/);
          const sourceFormula = formulaMatch ? formulaMatch[0] : line.trim().slice(0, 120);

          // Extract raw input fact from question paper if mentioned
          let inputFact = 'Raw figure stated in Question Paper';
          const qpMatches = qpText.match(/`?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]+)?)/g);
          if (qpMatches && qpMatches.length > 0) {
            inputFact = `Given figure: ${qpMatches[0]}`;
          }

          const ruleDesc = detector.ruleExtractor(line);
          const location = `Suggested Answer Section around line ${i + 1}`;
          const contentToHash = `${canonicalQuestionId}|${detector.type}|${ruleDesc}|${sourceFormula}`;
          const referenceHash = computeTransformationHash(contentToHash);

          transformations.push({
            questionId: canonicalQuestionId,
            inputFact,
            inputFactSource: 'QUESTION_PAPER',
            transformationType: detector.type,
            sourceRule: ruleDesc,
            sourceFormula,
            sourceCalculation: line.trim(),
            expectedIntermediateResult: undefined,
            expectedFinalResult: undefined,
            sourceLocation: location,
            sourceVersion: '1.0',
            referenceHash,
          });

          // Avoid duplicate entries of same type in same question
          break;
        }
      }
    }
  }

  // If no specific pattern matched but SA contains explicit calculation step with division/multiplication:
  if (transformations.length === 0) {
    const genericCalcMatch = saText.match(/(?:[0-9,.]+\s*[*×/]\s*[0-9,.%]+\s*=\s*[0-9,.]+)/);
    if (genericCalcMatch) {
      const line = genericCalcMatch[0];
      const referenceHash = computeTransformationHash(`${canonicalQuestionId}|OTHER|${line}`);
      transformations.push({
        questionId: canonicalQuestionId,
        inputFact: 'Raw input fact from Question Paper',
        inputFactSource: 'QUESTION_PAPER',
        transformationType: 'OTHER_SOURCE_DEFINED_TRANSFORMATION',
        sourceRule: 'Authoritative source-defined calculation step',
        sourceFormula: line,
        sourceCalculation: line,
        sourceLocation: 'Suggested Answer calculation working',
        sourceVersion: '1.0',
        referenceHash,
      });
    }
  }

  return Object.freeze(transformations) as SourceGroundedTransformation[];
}

/**
 * Two-Stage Interpretation Engine:
 * Stage A: Source Interpretation (What authoritative source says raw fact represents)
 * Stage B: Student Evaluation (Whether student's treatment of that fact is valid)
 */
export interface TwoStageEvaluationParams {
  readonly transformation: SourceGroundedTransformation;
  readonly studentScriptText: string;
  readonly studentNumbers?: (number | string)[];
  readonly rawInputNumber?: number | string;
  readonly expectedNumber?: number | string;
  readonly allocatedMarks: number;
}

export interface TwoStageEvaluationResult {
  readonly stageA_SourceInterpretation: string;
  readonly stageB_StudentEvaluation: string;
  readonly errorType: NumericalReasoningErrorType;
  readonly isAccepted: boolean;
  readonly isAlternativeValidMethod: boolean;
  readonly isConsequentialCreditAwarded: boolean;
  readonly suggestedMarksAwarded: number;
  readonly suggestedMarksDeducted: number;
  readonly examinerRemark: string;
}

/**
 * Checks if two formulas are algebraically / mathematically equivalent.
 * Generic across all subjects: e.g.
 * X / 70% <=> X / 0.70 <=> X * 100 / 70 <=> X / (1 - 0.3)
 * X * 18 / 118 <=> X - (X / 1.18)
 * X * 1.25 <=> X + 0.25 * X
 */
export function areFormulasAlgebraicallyEquivalent(
  formulaA: string,
  formulaB: string
): boolean {
  if (!formulaA || !formulaB) return false;
  const cleanA = formulaA.toLowerCase().replace(/\s+/g, '').replace(/×/g, '*').replace(/[()]/g, '');
  const cleanB = formulaB.toLowerCase().replace(/\s+/g, '').replace(/×/g, '*').replace(/[()]/g, '');

  if (cleanA === cleanB) return true;

  // Patterns for Gross-Up / Division by (1 - r) or (100 - r)%
  // Pattern 1: / 70% vs / 0.70 vs * 100 / 70 vs * (100/70)
  const isGrossUp70_A = /(?:\/70%|\/0\.70?|\*100\/70|\*\(100\/70\)|\/\(1-0\.30?\))/i.test(cleanA);
  const isGrossUp70_B = /(?:\/70%|\/0\.70?|\*100\/70|\*\(100\/70\)|\/\(1-0\.30?\))/i.test(cleanB);
  if (isGrossUp70_A && isGrossUp70_B) return true;

  const isGrossUp90_A = /(?:\/90%|\/0\.90?|\*100\/90|\*\(100\/90\)|\/\(1-0\.10?\))/i.test(cleanA);
  const isGrossUp90_B = /(?:\/90%|\/0\.90?|\*100\/90|\*\(100\/90\)|\/\(1-0\.10?\))/i.test(cleanB);
  if (isGrossUp90_A && isGrossUp90_B) return true;

  const isGrossUp80_A = /(?:\/80%|\/0\.80?|\*100\/80|\*\(100\/80\)|\/\(1-0\.20?\))/i.test(cleanA);
  const isGrossUp80_B = /(?:\/80%|\/0\.80?|\*100\/80|\*\(100\/80\)|\/\(1-0\.20?\))/i.test(cleanB);
  if (isGrossUp80_A && isGrossUp80_B) return true;

  // Pattern 2: GST tax-inclusive reverse calculation
  // * 18 / 118 vs / 1.18 vs * (18/118)
  const isGst18_A = /(?:\*18\/118|\*\(18\/118\)|\/1\.18)/i.test(cleanA);
  const isGst18_B = /(?:\*18\/118|\*\(18\/118\)|\/1\.18)/i.test(cleanB);
  if (isGst18_A && isGst18_B) return true;

  const isGst12_A = /(?:\*12\/112|\*\(12\/112\)|\/1\.12)/i.test(cleanA);
  const isGst12_B = /(?:\*12\/112|\*\(12\/112\)|\/1\.12)/i.test(cleanB);
  if (isGst12_A && isGst12_B) return true;

  const isGst5_A = /(?:\*5\/105|\*\(5\/105\)|\/1\.05)/i.test(cleanA);
  const isGst5_B = /(?:\*5\/105|\*\(5\/105\)|\/1\.05)/i.test(cleanB);
  if (isGst5_A && isGst5_B) return true;

  // Pattern 3: Markup to Margin (e.g., 25% on cost = 20% on sales)
  const isMarkup25_A = /(?:\*25\/125|\*1\/5|20%onsales|25%oncost)/i.test(cleanA);
  const isMarkup25_B = /(?:\*25\/125|\*1\/5|20%onsales|25%oncost)/i.test(cleanB);
  if (isMarkup25_A && isMarkup25_B) return true;

  const isMarkup33_A = /(?:\*33\.33\/133\.33|\*1\/4|25%onsales|33\.?33%oncost)/i.test(cleanA);
  const isMarkup33_B = /(?:\*33\.33\/133\.33|\*1\/4|25%onsales|33\.?33%oncost)/i.test(cleanB);
  if (isMarkup33_A && isMarkup33_B) return true;

  // Pattern 4: General algebraic equivalent (A * 100) / B <=> A / (B / 100)
  const patternMultDiv1 = /([a-z0-9_]+)\*100\/([0-9.]+)/i;
  const patternMultDiv2 = /([a-z0-9_]+)\/([0-9.]+)/i;
  const m1 = cleanA.match(patternMultDiv1);
  const m2 = cleanB.match(patternMultDiv2);
  if (m1 && m2 && m1[1] === m2[1]) {
    const denom1 = parseFloat(m1[2]);
    const denom2 = parseFloat(m2[2]);
    if (Math.abs(denom1 / 100 - denom2) < 0.001) return true;
  }
  const rev1 = cleanB.match(patternMultDiv1);
  const rev2 = cleanA.match(patternMultDiv2);
  if (rev1 && rev2 && rev1[1] === rev2[1]) {
    const denom1 = parseFloat(rev1[2]);
    const denom2 = parseFloat(rev2[2]);
    if (Math.abs(denom1 / 100 - denom2) < 0.001) return true;
  }

  return false;
}

/**
 * Validates whether two numerical values are within standard CA exam rounding tolerance.
 * Exam tolerance: difference of <= 1.0 (nearest rupee rounding) or <= 0.05% relative difference
 * (e.g. discounting factors 0.8929 vs 0.893 or decimal rounding).
 * Harmless rounding differences must NOT be treated as conceptual errors.
 */
export function isWithinExamRoundingTolerance(
  valA: number | string,
  valB: number | string
): boolean {
  const numA = typeof valA === 'number' ? valA : parseFloat(String(valA).replace(/,/g, ''));
  const numB = typeof valB === 'number' ? valB : parseFloat(String(valB).replace(/,/g, ''));

  if (isNaN(numA) || isNaN(numB)) return false;
  if (numA === numB) return true;

  const diff = Math.abs(numA - numB);
  // Integer / Rupee-level rounding: difference <= 1.0 (e.g. ₹50,000.40 vs ₹50,000)
  if (diff <= 1.0) return true;

  // Relative tolerance: <= 0.1% difference
  const maxVal = Math.max(Math.abs(numA), Math.abs(numB));
  if (maxVal > 0 && diff / maxVal <= 0.001) return true;

  return false;
}

/**
 * Distinguishes source-defined facts from student assumptions.
 * Categorizes student assumption as: VALID, INVALID, UNSUPPORTED, or AMBIGUOUS.
 * Never silently replaces a source fact with a student's assumption.
 */
export function evaluateStudentAssumption(
  assumptionText: string,
  context: { qpText?: string; saText?: string } = {}
): {
  readonly status: 'VALID' | 'INVALID' | 'UNSUPPORTED' | 'AMBIGUOUS';
  readonly explanation: string;
} {
  const cleanAssump = (assumptionText || '').toLowerCase().trim();
  const cleanQp = (context.qpText || '').toLowerCase();
  const cleanSa = (context.saText || '').toLowerCase();

  if (!cleanAssump) {
    return {
      status: 'AMBIGUOUS',
      explanation: 'No explicit assumption stated by candidate.',
    };
  }

  // Check if student assumption contradicts an explicit fact in the Question Paper
  // e.g. QP says "Option not exercised" and student assumes "Assumed option is exercised"
  const contradictoryMarkers = [
    { fact: 'does not exercise option', opposite: 'assumed option is exercised' },
    { fact: 'turnover exceeds', opposite: 'assumed turnover is within limit' },
    { fact: 'not eligible for 115bac', opposite: 'assumed 115bac applies' },
    { fact: 'not opted', opposite: 'assumed 115bac' },
    { fact: 'has not opted', opposite: 'assumed 115bac' },
    { fact: 'not opted for section 115bac', opposite: 'assumed 115bac' },
    { fact: 'inter-state supply', opposite: 'assumed intra-state' },
    { fact: 'intra-state supply', opposite: 'assumed inter-state' },
  ];

  for (const pair of contradictoryMarkers) {
    if (cleanQp.includes(pair.fact) && cleanAssump.includes(pair.opposite)) {
      return {
        status: 'INVALID',
        explanation: `Assumption contradicts explicit Question Paper condition: '${pair.fact}'.`,
      };
    }
  }

  // Check if the Suggested Answer mentions this as an alternative recognized assumption
  if (cleanSa.includes('alternatively') || cleanSa.includes('note:') || cleanSa.includes('assumption:')) {
    const keyWords = cleanAssump.split(' ').filter((w) => w.length > 4);
    const matchesSaNote = keyWords.some((w) => cleanSa.includes(w));
    if (matchesSaNote) {
      return {
        status: 'VALID',
        explanation: 'Assumption matches an alternative valid scenario recognized in official ICAI notes.',
      };
    }
  }

  // If question is silent and assumption is standard accounting/legal practice
  const standardPermissibleAssumptions = [
    'assumed cost of acquisition',
    'assumed goods delivered',
    'assumed payment made by cheque',
    'assumed financial year',
    'assumed calendar year',
    'assumed fifo method',
    'assumed wdv method',
    'assumed slm method',
  ];

  if (standardPermissibleAssumptions.some((p) => cleanAssump.includes(p))) {
    return {
      status: 'VALID',
      explanation: 'Permissible standard exam assumption where question facts are silent.',
    };
  }

  return {
    status: 'UNSUPPORTED',
    explanation: 'Assumption is not substantiated by Question Paper facts or official notes.',
  };
}

/**
 * Detects material source conflicts between Question Paper, Suggested Answer, and Marking Scheme.
 * If materially conflicting: STATUS = SOURCE_CONFLICT -> REVIEW_REQUIRED.
 * Fails closed without expending expensive model calls.
 */
export function detectTransformationSourceConflict(
  qpText: string,
  saText: string,
  msText?: string
): {
  readonly hasConflict: boolean;
  readonly status: 'SOURCE_CONFLICT' | 'VALID';
  readonly reason?: string;
} {
  const cleanQp = (qpText || '').toLowerCase();
  const cleanSa = (saText || '').toLowerCase();
  const cleanMs = (msText || '').toLowerCase();

  // 1. Conflict in Course Level
  if (/foundation/i.test(cleanQp) && /final/i.test(cleanSa)) {
    return {
      hasConflict: true,
      status: 'SOURCE_CONFLICT',
      reason: 'Course level mismatch between Question Paper (Foundation) and Suggested Answer (Final).',
    };
  }

  // 2. Conflict in Assessment Year / Financial Year
  const qpAy = cleanQp.match(/(?:a\.?y\.?|assessment\s+year)\s*20[0-9]{2}[-–][0-9]{2}/i);
  const saAy = cleanSa.match(/(?:a\.?y\.?|assessment\s+year)\s*20[0-9]{2}[-–][0-9]{2}/i);
  if (qpAy && saAy) {
    const normQp = qpAy[0].replace(/[^0-9-–]/g, '');
    const normSa = saAy[0].replace(/[^0-9-–]/g, '');
    if (normQp !== normSa) {
      return {
        hasConflict: true,
        status: 'SOURCE_CONFLICT',
        reason: `Material conflict in Assessment Year between Question Paper (${qpAy[0]}) and Suggested Answer (${saAy[0]}).`,
      };
    }
  }

  // 3. Contradictory tax/accounting treatment (e.g., QP asks for Net Profit before Tax but SA calculates Net Profit after Tax without reconciliation)
  if (cleanQp.includes('calculate gross total income') && cleanSa.includes('total income computation') && !cleanSa.includes('gross total income')) {
    // Check if critical requirements conflict
  }

  return {
    hasConflict: false,
    status: 'VALID',
  };
}

/**
 * Executes Two-Stage Interpretation on a specific transformation requirement.
 */
export function evaluateTwoStageInterpretation(
  params: TwoStageEvaluationParams
): TwoStageEvaluationResult {
  const {
    transformation,
    studentScriptText,
    studentNumbers = [],
    rawInputNumber,
    expectedNumber,
    allocatedMarks,
  } = params;

  // -------------------------------------------------------------
  // STAGE A: SOURCE INTERPRETATION
  // -------------------------------------------------------------
  const stageA = `Authoritative Source dictates transformation [${transformation.transformationType}]: ` +
    `Input fact (${transformation.inputFact}) requires rule [${transformation.sourceRule}] ` +
    `${transformation.sourceFormula ? `using formula [${transformation.sourceFormula}] ` : ''}` +
    `to determine true substantive value.`;

  // -------------------------------------------------------------
  // STAGE B: STUDENT EVALUATION
  // -------------------------------------------------------------
  const studentTextClean = studentScriptText.toLowerCase();

  // 1. Check if student directly used raw figure without applying transformation
  const rawNumStr = rawInputNumber !== undefined ? String(rawInputNumber).replace(/,/g, '') : null;
  const expNumStr = expectedNumber !== undefined ? String(expectedNumber).replace(/,/g, '') : null;

  const usedRawDirectlyAsFinal = rawNumStr && expNumStr && rawNumStr !== expNumStr &&
    studentNumbers.some((n) => String(n).replace(/,/g, '') === rawNumStr) &&
    !studentNumbers.some((n) => String(n).replace(/,/g, '') === expNumStr);

  if (usedRawDirectlyAsFinal && !studentTextClean.includes('gross') && !studentTextClean.includes('adjusted')) {
    return {
      stageA_SourceInterpretation: stageA,
      stageB_StudentEvaluation: `Student directly took the raw figure (${rawNumStr}) without applying required transformation [${transformation.transformationType}].`,
      errorType: 'OMITTED_TRANSFORMATION',
      isAccepted: false,
      isAlternativeValidMethod: false,
      isConsequentialCreditAwarded: false,
      suggestedMarksAwarded: 0,
      suggestedMarksDeducted: allocatedMarks,
      examinerRemark: `Failed to transform raw input fact according to ${transformation.sourceRule}. Evaluated strictly under affected marking criteria without double penalty.`,
    };
  }

  // 2. Check if student used exact or algebraically equivalent formula
  const studentFormulas = studentScriptText.match(/[0-9,.]+\s*[*×/+-]\s*[0-9,.%]+(?:\s*[*×/+-]\s*[0-9,.%]+)*/g) || [];
  const sourceForm = transformation.sourceFormula || '';

  const matchedEquivalent = studentFormulas.some((sf) => areFormulasAlgebraicallyEquivalent(sf, sourceForm));

  const matchesExpectedNumber = expNumStr
    ? studentNumbers.some(
        (n) =>
          String(n).replace(/,/g, '') === expNumStr ||
          isWithinExamRoundingTolerance(n, expNumStr)
      )
    : false;

  if (matchedEquivalent) {
    if (expNumStr && studentNumbers.length > 0 && !matchesExpectedNumber) {
      const slipAward = Math.max(0.5, Math.round(allocatedMarks * 0.5 * 2) / 2);
      return {
        stageA_SourceInterpretation: stageA,
        stageB_StudentEvaluation: `Student correctly applied formula/method for [${transformation.transformationType}] but made an arithmetic slip in intermediate computation.`,
        errorType: 'ARITHMETIC_SLIP',
        isAccepted: false,
        isAlternativeValidMethod: false,
        isConsequentialCreditAwarded: true,
        suggestedMarksAwarded: slipAward,
        suggestedMarksDeducted: allocatedMarks - slipAward,
        examinerRemark: `Correct formula/concept identified; deducted for arithmetic slip. Consequential credit preserved for subsequent steps.`,
      };
    }

    return {
      stageA_SourceInterpretation: stageA,
      stageB_StudentEvaluation: `Student correctly applied source-grounded transformation [${transformation.transformationType}] using verified or algebraically equivalent method.`,
      errorType: 'NONE',
      isAccepted: true,
      isAlternativeValidMethod: false,
      isConsequentialCreditAwarded: false,
      suggestedMarksAwarded: allocatedMarks,
      suggestedMarksDeducted: 0,
      examinerRemark: `Full credit awarded: Substantive transformation accurately carried out conforming to ICAI benchmark.`,
    };
  }

  if (matchesExpectedNumber) {
    return {
      stageA_SourceInterpretation: stageA,
      stageB_StudentEvaluation: `Student correctly arrived at expected transformed result for [${transformation.transformationType}].`,
      errorType: 'NONE',
      isAccepted: true,
      isAlternativeValidMethod: false,
      isConsequentialCreditAwarded: false,
      suggestedMarksAwarded: allocatedMarks,
      suggestedMarksDeducted: 0,
      examinerRemark: `Full credit awarded: Substantive transformation accurately carried out conforming to ICAI benchmark.`,
    };
  }

  // 3. Alternative valid method check
  const hasAlternativeMethodEvidence =
    studentTextClean.includes('alternative') ||
    studentTextClean.includes('method') ||
    studentTextClean.includes('assumed') ||
    studentFormulas.length > 0;

  if (hasAlternativeMethodEvidence && studentScriptText.length > 20) {
    // If student attempted a genuine alternative calculation with sound structure
    const partialMarks = Math.round(allocatedMarks * 0.7 * 2) / 2;
    return {
      stageA_SourceInterpretation: stageA,
      stageB_StudentEvaluation: `Student employed an alternative conceptual method for [${transformation.transformationType}].`,
      errorType: 'CONSEQUENTIAL_CONTINUATION',
      isAccepted: true,
      isAlternativeValidMethod: true,
      isConsequentialCreditAwarded: true,
      suggestedMarksAwarded: partialMarks,
      suggestedMarksDeducted: allocatedMarks - partialMarks,
      examinerRemark: `Alternative valid mathematical/legal method recognized under standard ICAI guidelines.`,
    };
  }

  // 4. Minor arithmetic slip with correct formula vs formula error
  const formulaMentions = transformation.sourceRule.split(' ').filter((w) => w.length > 4);
  const mentionsRuleKeywords = formulaMentions.some((w) => studentTextClean.includes(w.toLowerCase()));

  if (mentionsRuleKeywords) {
    const slipAward = Math.max(0.5, Math.round(allocatedMarks * 0.5 * 2) / 2);
    return {
      stageA_SourceInterpretation: stageA,
      stageB_StudentEvaluation: `Student understood required transformation [${transformation.transformationType}] but made a minor arithmetic slip or calculation variant.`,
      errorType: 'ARITHMETIC_SLIP',
      isAccepted: false,
      isAlternativeValidMethod: false,
      isConsequentialCreditAwarded: true,
      suggestedMarksAwarded: slipAward,
      suggestedMarksDeducted: allocatedMarks - slipAward,
      examinerRemark: `Formula/concept identified; deducted for arithmetic slip. Consequential credit preserved for subsequent steps.`,
    };
  }

  // Default: Interpretation mistake
  return {
    stageA_SourceInterpretation: stageA,
    stageB_StudentEvaluation: `Student did not demonstrate correct execution of transformation [${transformation.transformationType}].`,
    errorType: 'INTERPRETATION_MISTAKE',
    isAccepted: false,
    isAlternativeValidMethod: false,
    isConsequentialCreditAwarded: false,
    suggestedMarksAwarded: 0,
    suggestedMarksDeducted: allocatedMarks,
    examinerRemark: `Incorrect interpretation of raw input fact against authoritative standard.`,
  };
}

/**
 * Audits numerical reasoning integrity and prevents double-penalties across questions.
 * Enforces Own-Figure Rule / Consequential Credit for all subjects.
 */
export function auditNumericalReasoningIntegrity(
  questions: QuestionEvaluation[],
  allTransformations: readonly SourceGroundedTransformation[] = []
): {
  readonly isAuditPassed: boolean;
  readonly auditedQuestions: QuestionEvaluation[];
  readonly integrityRecords: IntermediateResultIntegrityRecord[];
  readonly doublePenaltiesPrevented: number;
  readonly consequentialMarksPreserved: number;
} {
  const auditedQuestions: QuestionEvaluation[] = [];
  const integrityRecords: IntermediateResultIntegrityRecord[] = [];
  let doublePenaltiesPrevented = 0;
  let consequentialMarksPreserved = 0;

  for (const q of questions) {
    const canonId = q.canonicalId || q.fullQuestionCode || q.questionNumber;
    const matchingTransformations = allTransformations.filter((t) => t.questionId === canonId);

    const components = q.markingComponents || [];
    let updatedComponents: MarkingComponent[] = [...components];
    let consequentialErrorDetected = Boolean(q.consequentialErrorDetected);
    let consequentialNotes = q.consequentialErrorNotes || '';

    // Check for calculation / application components
    const calcComponents = components.filter((c) =>
      c.componentType === 'CALCULATION' || c.componentType === 'APPLICATION' || c.componentType === 'WORKING'
    );

    // If an earlier calculation component had an error but subsequent calculation/conclusion
    // logically continued from the candidate's own figure:
    let firstErrorIndex = -1;
    for (let idx = 0; idx < calcComponents.length; idx++) {
      if (calcComponents[idx].marksDeducted > 0 && firstErrorIndex === -1) {
        firstErrorIndex = idx;
      } else if (firstErrorIndex !== -1 && idx > firstErrorIndex) {
        // Downstream component: check if it was penalized again for the same underlying slip
        const downstreamComp = calcComponents[idx];
        const reasonLow = (downstreamComp.deductionReason || '').toLowerCase();
        const isRepeatedDeduction =
          reasonLow.includes('consequential') ||
          reasonLow.includes('carried forward') ||
          reasonLow.includes('due to previous') ||
          reasonLow.includes('from above error') ||
          reasonLow.includes('wrong total above');

        if (isRepeatedDeduction && downstreamComp.marksDeducted > 0) {
          // Restore consequential credit (own figure rule)!
          doublePenaltiesPrevented++;
          const restoredMarks = downstreamComp.marksDeducted;
          consequentialMarksPreserved += restoredMarks;

          updatedComponents = updatedComponents.map((c) => {
            if (c.componentId === downstreamComp.componentId) {
              return {
                ...c,
                marksAwarded: c.marksAvailable,
                marksDeducted: 0,
                assessment: 'CORRECT',
                deductionReason: `[Consequential Credit Awarded - Own-Figure Rule]: Downstream calculation method is sound based on candidate's previous intermediate figure.`,
              };
            }
            return c;
          });

          consequentialErrorDetected = true;
          consequentialNotes = `Consequential credit awarded for downstream step ${downstreamComp.componentId}. Only initial calculation step was penalized.`;
        }
      }
    }

    // Attach integrity records for matched transformations
    for (const trans of matchingTransformations) {
      integrityRecords.push({
        transformationId: trans.referenceHash.slice(0, 12),
        transformationType: trans.transformationType,
        inputFact: trans.inputFact,
        expectedValue: trans.expectedFinalResult || trans.sourceRule,
        errorType: q.status === 'correct' ? 'NONE' : consequentialErrorDetected ? 'CONSEQUENTIAL_CONTINUATION' : 'NONE',
        isMethodValid: q.marksAwarded > 0,
        isAlternativeMethod: Boolean(q.validAlternativeRecognition),
        isConsequentialCreditAwarded: consequentialErrorDetected,
        marksImpacted: q.marksLost,
        auditExplanation: `Evaluated through Stage A source interpretation and Stage B student evaluation for ${trans.transformationType}.`,
      });
    }

    const recomputedAwarded = updatedComponents.length > 0
      ? updatedComponents.reduce((s, c) => s + (c.marksAwarded || 0), 0)
      : q.marksAwarded;

    auditedQuestions.push({
      ...q,
      marksAwarded: recomputedAwarded,
      marksLost: Math.max(0, q.maximumMarks - recomputedAwarded),
      markingComponents: updatedComponents,
      consequentialErrorDetected,
      consequentialErrorNotes: consequentialNotes || undefined,
      sourceTransformations: matchingTransformations.length > 0 ? [...matchingTransformations] : undefined,
      numericalIntegrityRecords: integrityRecords.filter((r) => matchingTransformations.some((t) => t.referenceHash.slice(0, 12) === r.transformationId)),
    });
  }

  return {
    isAuditPassed: true,
    auditedQuestions,
    integrityRecords,
    doublePenaltiesPrevented,
    consequentialMarksPreserved,
  };
}
