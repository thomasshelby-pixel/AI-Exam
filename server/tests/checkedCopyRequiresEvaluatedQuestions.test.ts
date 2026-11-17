import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  countCompletedQuestionEvaluations,
  generateCheckedCopyPdf,
} from '../services/pdfCheckedCopyService.js';

const noEvaluation = {
  validationStatus: 'NEEDS_REVIEW',
  certificationStatus: 'REVIEW_REQUIRED',
  questions: [],
  evaluationRunPackage: {
    evaluationRecords: [
      {
        questionId: 'Q1(a)',
        evaluationStatus: 'FAILED_TO_EVALUATE',
        evaluated: false,
        attempted: true,
        awardedMarks: 0,
        maxMarks: 5,
      },
    ],
  },
};

assert.equal(
  countCompletedQuestionEvaluations(noEvaluation),
  0,
  'A technical failure with a placeholder 0 is not an academic evaluation.',
);

const genuinelyEvaluatedZero = {
  validationStatus: 'NEEDS_REVIEW',
  certificationStatus: 'REVIEW_REQUIRED',
  evaluationRunPackage: {
    evaluationRecords: [
      {
        questionId: 'Q4(c)',
        evaluationStatus: 'EVALUATED',
        evaluated: true,
        attempted: true,
        awardedMarks: 0,
        maxMarks: 4,
      },
    ],
  },
};

assert.equal(
  countCompletedQuestionEvaluations(genuinelyEvaluatedZero),
  1,
  'A genuinely evaluated zero-mark answer is still a completed academic evaluation.',
);

assert.equal(
  countCompletedQuestionEvaluations({
    questions: [{ canonicalId: 'Q2(a)', status: 'incorrect', marksAwarded: 0, maximumMarks: 4 }],
  }),
  1,
  'A legacy result with a completed incorrect evaluation and zero marks remains valid.',
);

const original = await PDFDocument.create();
original.addPage([595.28, 841.89]);
const originalPdf = Buffer.from(await original.save());

await assert.rejects(
  () => generateCheckedCopyPdf(
    { id: 'eval_no_question_evaluations_test', level: 'INTERMEDIATE', subjectName: 'Auditing' },
    noEvaluation,
    originalPdf,
  ),
  /CHECKED_COPY_NO_EVALUATED_QUESTIONS/,
  'The checked-copy generator must refuse a PDF when no question received academic evaluation.',
);

console.log('✅ Checked Copy creation requires at least one completed question evaluation; genuine academic zeros remain supported.');
