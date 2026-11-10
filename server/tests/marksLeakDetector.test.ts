import { buildMarksLeakReport } from '../../src/utils/marksLeakDetector.js';
import type { EvaluationResult } from '../../src/types/index.js';

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(`[FAIL] ${label}`);
  console.log(`[PASS] ${label}`);
}

const base = {
  evaluationId: 'test-eval',
  studentName: 'Test Student',
  icaiRegistrationNumber: 'TEST',
  caLevel: 'INTERMEDIATE',
  subjectKey: 'TAX',
  subjectName: 'Taxation',
  materialType: 'MODEL',
  evaluationDate: new Date(0).toISOString(),
  totalMarks: 12,
  maximumMarks: 30,
  percentage: 40,
  grade: 'PASS',
  confidenceScore: 90,
  overallSummary: '',
  strengths: [],
  weaknesses: [],
  topicPerformance: [],
  presentationAnalysis: { score: 0, feedback: '', workingNotesQuality: '', handwritingLegibility: '' },
  accuracyAnalysis: { calculationAccuracy: '', provisionsAccuracy: '', methodologyCorrectness: '' },
  recommendations: [],
  questions: [
    {
      questionNumber: '1',
      fullQuestionCode: 'Q1(a)',
      maximumMarks: 10,
      marksAwarded: 6,
      marksLost: 4,
      status: 'partially_correct',
      detailedFeedback: 'Working and provision explanation incomplete',
      missingRequirements: ['Show depreciation working', 'Explain applicable provision'],
      sourcePages: [2],
      markingComponents: [
        {
          componentId: 'c1',
          componentType: 'WORKING',
          expectedRequirement: 'Show depreciation working',
          studentEvidence: 'Final number only',
          assessment: 'INCORRECT',
          marksAvailable: 2,
          marksAwarded: 0,
          marksDeducted: 2,
          deductionReason: 'Working not shown',
          confidence: 90,
          pageNumber: 2,
        },
        {
          componentId: 'c2',
          componentType: 'PROVISION',
          expectedRequirement: 'Explain section 32',
          studentEvidence: 'Section named only',
          assessment: 'PARTIALLY_CORRECT',
          marksAvailable: 2,
          marksAwarded: 1,
          marksDeducted: 1,
          deductionReason: 'Conditions not explained',
          confidence: 90,
          pageNumber: 2,
        },
      ],
    },
  ],
  canonicalLedger: {
    records: [
      {
        questionId: 'Q2(b)',
        attempted: false,
        maxMarks: 5,
        awardedMarks: 0,
        evaluationStatus: 'UNATTEMPTED',
        sourcePages: [],
        rendered: true,
        counted: true,
        studentPages: [],
      },
    ],
  },
} as unknown as EvaluationResult;

const report = buildMarksLeakReport(base);
assert(report.unattemptedMarks === 5, 'Detects explicitly unattempted canonical question marks');
assert(report.incompleteAnswerMarks === 3, 'Separates missing working and provision explanation marks');
assert(report.totalMarksAtStake === 8, 'Totals evidenced marks at stake once');
assert(report.findings.some((finding) => finding.pages.includes(2)), 'Attaches answer-sheet page evidence');
assert(report.findings.some((finding) => finding.category === 'MISSING_WORKING'), 'Classifies missing workings');
assert(report.findings.some((finding) => finding.category === 'INCOMPLETE_EXPLANATION'), 'Classifies incomplete explanations');

const optionalOnly = {
  ...base,
  evaluationRunPackage: {
    questionInventory: {
      totalPaperMaxMarks: 30,
      items: [
        { questionId: 'Q2(b)', maxMarks: 5, isRequiredOrOptional: 'OPTIONAL', isAlternative: false },
      ],
    },
    scoreLedger: {
      records: [{
        questionId: 'Q2(b)',
        attempted: false,
        maxMarks: 5,
        awardedMarks: 0,
        evaluationStatus: 'UNATTEMPTED',
        sourcePages: [],
        rendered: true,
        counted: false,
      }],
    },
  },
} as unknown as EvaluationResult;
const optionalReport = buildMarksLeakReport(optionalOnly);
assert(optionalReport.unattemptedMarks === 0,
  'An intentionally unselected optional question is not reported as lost marks.');
assert(optionalReport.totalMarksAtStake === 3,
  'Optional-question exclusion does not remove independently evidenced component losses.');

const staleDeduction = {
  ...base,
  maximumMarks: 2,
  questions: [{
    questionNumber: '1',
    fullQuestionCode: 'Q1(a)',
    maximumMarks: 2,
    marksAwarded: 0,
    marksLost: 9,
    status: 'partially_correct',
    detailedFeedback: 'Component deduction needs canonical bounding.',
    missingRequirements: [],
    markingComponents: [{
      componentId: 'oversized-old-deduction',
      componentType: 'WORKING',
      expectedRequirement: 'Show the calculation',
      studentEvidence: 'Final number only',
      assessment: 'INCORRECT',
      marksAvailable: 2,
      marksAwarded: 0,
      marksDeducted: 9,
      deductionReason: 'Historic stored deduction exceeds the allocation.',
      confidence: 90,
    }],
  }],
  canonicalLedger: { records: [] },
} as unknown as EvaluationResult;
const staleDeductionReport = buildMarksLeakReport(staleDeduction);
assert(staleDeductionReport.totalMarksAtStake === 2,
  'A stale component deduction is capped at its component and canonical question maximum.');
assert(staleDeductionReport.totalMarksAtStake <= staleDeduction.maximumMarks,
  'Question findings cannot exceed the authoritative question maximum.');

const oversizedPaperLedger = Array.from({ length: 25 }, (_, index) => ({
  questionId: `Q${index + 1}`,
  attempted: false,
  maxMarks: 5,
  awardedMarks: 0,
  evaluationStatus: 'UNATTEMPTED',
  sourcePages: [],
  studentPages: [],
  rendered: true,
  counted: false,
  isAlternative: false,
}));
const oversizedPaper = {
  ...base,
  maximumMarks: 100,
  questions: [],
  evaluationRunPackage: {
    questionInventory: {
      totalPaperMaxMarks: 100,
      items: oversizedPaperLedger.map((record) => ({
        questionId: record.questionId,
        maxMarks: 5,
        isRequiredOrOptional: 'REQUIRED',
        isAlternative: false,
      })),
    },
    scoreLedger: { records: oversizedPaperLedger },
  },
  canonicalLedger: { records: [] },
} as unknown as EvaluationResult;
const oversizedPaperReport = buildMarksLeakReport(oversizedPaper);
assert(oversizedPaperReport.totalMarksAtStake === 100,
  'Marks-at-stake total cannot exceed the paper maximum even when source records overrun it.');
assert(oversizedPaperReport.technicalReviewCount > 0,
  'A paper-level cap raises an explicit technical-review finding instead of silently hiding the conflict.');

console.log('Marks Leak Detector tests passed.');
