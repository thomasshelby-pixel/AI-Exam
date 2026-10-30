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
console.log('Marks Leak Detector tests passed.');
