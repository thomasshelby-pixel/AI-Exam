import assert from 'node:assert/strict';
import { buildMaterialQuestionMappingAudit } from '../services/materialQuestionMappingAudit.js';

const questionPaper = `
FOUNDATION COURSE
PAPER 4 - BUSINESS ECONOMICS
PART I - MULTIPLE CHOICE QUESTIONS
1. What was the main objective of the Fiscal Responsibility and Budget Management Act?
   (a) Achieve fiscal surplus
   (b) Stop money laundering
   (c) Eliminate fiscal deficit
   (d) Eliminate revenue deficit
2. Which of the following is an economic indicator?
   (a) National income
   (b) Rainfall only
   (c) Population only
   (d) None of these
PART II - DESCRIPTIVE QUESTIONS
Question 5 - 10 Marks
(a) Explain the meaning of demand and its determinants.
(b) Explain the law of demand with a suitable example.
`;

const suggestedAnswers = `
SUGGESTED ANSWERS
DIVISION A - MULTIPLE CHOICE QUESTIONS
1. (c) Eliminate fiscal deficit.
2. (a) National income.
DIVISION B - DESCRIPTIVE QUESTIONS
Question 5(a) - 4 Marks
Demand means the quantity consumers are willing and able to purchase.
Question 5(b) - 6 Marks
The law of demand explains the inverse relationship between price and quantity demanded.
`;

const markingScheme = `
MARKING SCHEME
MCQ1 - 2 Marks
MCQ2 - 2 Marks
Question 5(a) - 4 Marks
Question 5(b) - 6 Marks
`;

const matched = buildMaterialQuestionMappingAudit({
  questionPaperText: questionPaper,
  suggestedAnswersText: suggestedAnswers,
  markingSchemeText: markingScheme,
});
assert.equal(matched.status, 'MATCHED', JSON.stringify(matched, null, 2));
assert.deepEqual(matched.questionPaperMcqIds, ['MCQ1', 'MCQ2']);
assert.deepEqual(matched.questionPaperDescriptiveIds, ['Q5(a)', 'Q5(b)']);
assert.deepEqual(matched.questionPaperIds, ['MCQ1', 'MCQ2', 'Q5(a)', 'Q5(b)']);
assert.deepEqual(matched.missingFromSuggestedAnswers, []);
assert.deepEqual(matched.extraInSuggestedAnswers, []);
assert.deepEqual(matched.missingFromMarkingScheme, []);
assert.equal(matched.suggestedAnswerCoveragePercent, 100);
assert.equal(matched.markingSchemeCoveragePercent, 100);

// A missing MCQ key and an answer-only question must be visible as distinct mapping defects.
const incompleteAnswers = `
SUGGESTED ANSWERS
DIVISION A - MULTIPLE CHOICE QUESTIONS
1. (c) Correct option.
DIVISION B - DESCRIPTIVE QUESTIONS
Question 5(a) - 4 Marks
Answer to 5(a).
Question 5(b) - 6 Marks
Answer to 5(b).
Question 9 - 2 Marks
An unexpected extra answer.
`;
const incomplete = buildMaterialQuestionMappingAudit({
  questionPaperText: questionPaper,
  suggestedAnswersText: incompleteAnswers,
  markingSchemeText: 'MARKING SCHEME\\nMCQ1 - 2 Marks\\nQuestion 5(a) - 4 Marks',
});
assert.equal(incomplete.status, 'PARTIAL');
assert.ok(incomplete.missingFromSuggestedAnswers.includes('MCQ2'));
assert.ok(incomplete.extraInSuggestedAnswers.includes('Q9'));
assert.ok(incomplete.missingFromMarkingScheme.includes('Q5(b)'));

// Question-paper parsing does not use a CA subject-specific template.
// The same generic numbering/options format must work at every course level.
for (const course of [
  { level: 'FOUNDATION', subject: 'Business Economics' },
  { level: 'INTERMEDIATE', subject: 'Cost and Management Accounting' },
  { level: 'FINAL', subject: 'Advanced Financial Management' },
]) {
  const audit = buildMaterialQuestionMappingAudit({
    questionPaperText: questionPaper.replace('BUSINESS ECONOMICS', course.subject.toUpperCase()),
    suggestedAnswers,
    markingScheme,
  });
  assert.equal(audit.status, 'MATCHED', `${course.level} / ${course.subject} must use the same format-neutral audit.`);
}

const unreadable = buildMaterialQuestionMappingAudit({
  questionPaperText: 'Question paper source exists but has no extractable question identities.',
  suggestedAnswersText: 'Suggested answers are present.',
  markingSchemeText: 'General marking guidelines apply.',
});
assert.equal(unreadable.status, 'QUESTION_PAPER_NOT_PARSED');
assert.equal(unreadable.questionPaperIds.length, 0);
assert.ok(unreadable.diagnostics.some((message) => message.includes('could not be independently extracted')));

const missingMarkingScheme = buildMaterialQuestionMappingAudit({
  questionPaperText: questionPaper,
  suggestedAnswers,
  markingSchemeText: 'General marking principles: award marks for relevant steps and explanations.',
});
assert.equal(missingMarkingScheme.status, 'PARTIAL');
assert.equal(missingMarkingScheme.markingSchemeIndexed, false);
assert.equal(missingMarkingScheme.markingSchemeCoveragePercent, null);

console.log('Material question mapping audit tests passed.');
