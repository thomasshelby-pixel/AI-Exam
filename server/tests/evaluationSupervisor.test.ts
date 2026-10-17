import {
  runEvaluationSupervisor,
  type EvaluationSupervisorParams,
  type EvaluationSupervisorDependencies,
} from '../services/evaluationSupervisorService.js';
import type { EvaluationResult, QuestionEvaluation } from '../../src/types/index.js';
import type { AnswerCoverageMap } from '../services/answerSheetCoverageService.js';
import type { AuthoritativePaperStructure } from '../services/paperStructureService.js';

let total = 0;
let passed = 0;

function assert(condition: boolean, name: string, detail?: string): void {
  total++;
  if (condition) {
    passed++;
    console.log('[PASS] ' + name);
  } else {
    console.error('[FAIL] ' + name + (detail ? ' — ' + detail : ''));
    process.exitCode = 1;
  }
}

function makeQuestion(marksAwarded = 4): QuestionEvaluation {
  return {
    questionNumber: '1',
    subQuestion: 'a',
    canonicalId: 'Q1(a)',
    fullQuestionCode: 'Q1(a)',
    maximumMarks: 5,
    marksAwarded,
    marksLost: 5 - marksAwarded,
    status: marksAwarded === 5 ? 'correct' : marksAwarded > 0 ? 'partially_correct' : 'incorrect',
    detailedFeedback: 'The response was assessed against the supplied marking rubric.',
    reasonForDeduction: marksAwarded < 5 ? 'One requirement was incomplete.' : 'Full marks.',
    markingComponents: [],
  };
}

function makeCoverage(): AnswerCoverageMap {
  return {
    totalPages: 1,
    pages: [],
    attemptedQuestions: [{
      fullQuestionCode: 'Q1(a)',
      questionNumber: '1',
      subQuestionNumber: 'a',
      pages: [1],
      status: 'ATTEMPTED_READABLE',
      studentSnippet: 'The student answer includes a relevant calculation.',
      isMcq: false,
    }],
    allDetectedCodes: ['Q1(a)'],
    unmappedPages: [],
    unclearPages: [],
    coveredPages: [1],
    is100PercentCovered: true,
    mcqSelections: {},
  } as AnswerCoverageMap;
}

function makeStructure(): AuthoritativePaperStructure {
  return {
    paperTitle: 'Test Paper',
    totalPaperMaxMarks: 5,
    questions: [],
    subQuestions: [{
      fullQuestionCode: 'Q1(a)',
      questionNumber: '1',
      subQuestionNumber: 'a',
      maximumMarks: 5,
      compulsory: true,
      isMcq: false,
      section: 'GENERAL',
    }],
    mcqs: [],
  };
}

function makeResult(question?: QuestionEvaluation, validationStatus: 'VALID' | 'NEEDS_REVIEW' = 'VALID'): EvaluationResult {
  return {
    evaluationId: 'supervisor-test',
    studentName: 'Test Candidate',
    icaiRegistrationNumber: 'Not provided',
    caLevel: 'INTERMEDIATE',
    subjectKey: 'advanced-accounts',
    subjectName: 'Advanced Accounting',
    materialType: 'MTP',
    evaluationDate: new Date().toISOString(),
    totalMarks: question?.marksAwarded || 0,
    maximumMarks: 5,
    officialPaperMaxMarks: 5,
    percentage: question ? (question.marksAwarded / 5) * 100 : 0,
    grade: 'Pass',
    confidenceScore: 90,
    overallSummary: 'Test evaluation',
    strengths: [],
    weaknesses: [],
    topicPerformance: [],
    recommendations: [],
    questions: question ? [question] : [],
    validationStatus,
    validationErrors: question ? [] : ['ATTEMPTED_ANSWER_DROPPED: Question Q1(a) was detected but not evaluated.'],
    certificationStatus: question ? 'CERTIFIED' : 'VERIFICATION_REQUIRED',
    downloadsUnlocked: Boolean(question),
  } as EvaluationResult;
}

function makeParams(
  evaluationResult: EvaluationResult,
  coverageMap?: AnswerCoverageMap
): EvaluationSupervisorParams {
  return {
    evaluationResult,
    pdfBuffer: Buffer.from('fake PDF bytes for injected evaluator'),
    paperStructure: makeStructure(),
    questionPaperText: 'Question 1(a): Calculate the amount. (5 marks)',
    suggestedAnswersText: 'Question 1(a) Suggested Answer: correct calculation and result.',
    markingSchemeText: 'Question 1(a): calculation 3 marks, conclusion 2 marks.',
    checkingMode: 'standard',
    level: 'INTERMEDIATE',
    subjectName: 'Advanced Accounting',
    officialPaperMaxMarks: 5,
    paper: 'Paper 1',
    subjectKey: 'advanced-accounts',
    coverageMap,
  };
}

function makeReferenceSnippet(found: boolean) {
  return {
    qpSnippet: 'Question 1(a)',
    saSnippet: 'Suggested answer for Q1(a)',
    msSnippet: '5 marks',
    retrievedCharacterCount: 40,
    contentHash: 'test-hash',
    foundInMaterial: found,
    markingSchemeSection: 'Q1(a)',
    suggestedAnswerSection: 'Q1(a)',
    verifiedTruthSnippet: 'Verified reference',
    questionPaperFound: found,
    suggestedAnswerFound: found,
    markingSchemeFound: found,
    referenceNeedsReview: !found,
  };
}

async function run(): Promise<void> {
  console.log('--- Evaluation Supervisor Correction Loop Tests ---');

  // 1. A structurally sound evaluation passes without invoking any correction model.
  {
    let calls = 0;
    const dependencies: EvaluationSupervisorDependencies = {
      evaluateChunk: async () => {
        calls++;
        return makeQuestion();
      },
    };
    const result = await runEvaluationSupervisor(makeParams(makeResult(makeQuestion())), dependencies);
    const audit = (result.integrityAudit as any)?.supervisor;
    assert(audit?.status === 'PASS', 'A clean result passes the supervisor audit');
    assert(audit?.correctionRoundsUsed === 0, 'A clean result uses zero correction rounds');
    assert(calls === 0, 'A clean result does not incur an extra model call');
  }

  // 2. A missing attempted question is retried using its original answer pages and locked references.
  {
    let calls = 0;
    const dependencies: EvaluationSupervisorDependencies = {
      extractReferenceSnippets: () => makeReferenceSnippet(true),
      evaluateChunk: async (context) => {
        calls++;
        assert(context.supervisorCorrectionAttempt === 1, 'Correction attempt number is supplied to the evaluator');
        assert(Boolean(context.supervisorIssues?.length), 'Specific supervisor findings are supplied to the evaluator');
        return makeQuestion(4);
      },
      reprocessIntegrity: (result) => {
        const totalMarks = result.questions.reduce((sum, question) => sum + Number(question.marksAwarded || 0), 0);
        return {
          ...result,
          totalMarks,
          percentage: (totalMarks / 5) * 100,
          validationStatus: 'VALID',
          validationErrors: [],
          certificationStatus: 'CERTIFIED',
          downloadsUnlocked: true,
        };
      },
    };
    const result = await runEvaluationSupervisor(
      makeParams(makeResult(undefined, 'NEEDS_REVIEW'), makeCoverage()),
      dependencies
    );
    const audit = (result.integrityAudit as any)?.supervisor;
    assert(calls === 1, 'A missing readable answer is sent for one targeted correction');
    assert(result.questions.length === 1, 'The corrected attempted question is restored to the evaluation');
    assert(result.questions[0].canonicalId === 'Q1(a)', 'Correction keeps the authoritative question identity');
    assert(result.questions[0].maximumMarks === 5, 'Correction keeps the authoritative maximum marks');
    assert(result.totalMarks === 4, 'Total marks are recalculated from corrected question marks');
    assert(audit?.status === 'PASS', 'The corrected evaluation passes a second audit');
    assert(audit?.correctionRoundsUsed === 1, 'Correction-round telemetry is recorded');
    assert(result.downloadsUnlocked === true, 'A passing corrected result retains its approved delivery state');
  }

  // 3. Missing/mismatched authoritative references must fail closed, never trigger an AI guess.
  {
    let calls = 0;
    const dependencies: EvaluationSupervisorDependencies = {
      extractReferenceSnippets: () => makeReferenceSnippet(false),
      evaluateChunk: async () => {
        calls++;
        return makeQuestion();
      },
    };
    const result = await runEvaluationSupervisor(
      makeParams(makeResult(undefined, 'NEEDS_REVIEW'), makeCoverage()),
      dependencies
    );
    const audit = (result.integrityAudit as any)?.supervisor;
    assert(calls === 0, 'No correction model call occurs when authoritative references cannot be locked');
    assert(audit?.status === 'HUMAN_REVIEW', 'A reference mismatch requires human review');
    assert(result.validationStatus === 'NEEDS_REVIEW', 'A reference mismatch blocks certification');
    assert(result.downloadsUnlocked === false, 'A reference mismatch keeps downloads locked');
    assert(audit?.unresolvedIssues.some((issue: string) => issue.includes('SUPERVISOR_REFERENCE_LOCK_INCOMPLETE')), 'The precise reference-lock issue is recorded');
  }

  console.log('Supervisor test result: ' + passed + '/' + total + ' passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
