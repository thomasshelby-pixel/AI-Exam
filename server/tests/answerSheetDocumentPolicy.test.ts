import assert from 'node:assert/strict';
import { normalizeAiAnswerSheetDocumentValidation } from '../services/answerSheetDocumentPolicy.js';

const cursiveRejectedByOldVerifier = normalizeAiAnswerSheetDocumentValidation({
  isValidAnswerSheet: false,
  documentTypeDetected: 'Invalid Handwritten Document',
  isHandwritten: true,
  rejectionReason: 'Illegal cursive writing detected; handwriting style is not accepted.',
});
assert.equal(cursiveRejectedByOldVerifier.isValidAnswerSheet, true);
assert.equal(cursiveRejectedByOldVerifier.isHandwritten, true);

const joinedUpWriting = normalizeAiAnswerSheetDocumentValidation({
  isValidAnswerSheet: false,
  documentTypeDetected: 'Handwritten CA Answer Sheet',
  isHandwritten: false,
  rejectionReason: 'Joined-up / cursive writing is not legible enough.',
});
assert.equal(joinedUpWriting.isValidAnswerSheet, true);
assert.equal(joinedUpWriting.isHandwritten, true);

const partiallyReadable = normalizeAiAnswerSheetDocumentValidation({
  isValidAnswerSheet: false,
  documentTypeDetected: 'Student Handwritten Answer Sheet',
  isHandwritten: true,
  rejectionReason: 'Some handwriting is difficult to read.',
});
assert.equal(partiallyReadable.isValidAnswerSheet, true, 'Partial legibility is for page-level reading, not whole-document rejection.');

const realAdmitCard = normalizeAiAnswerSheetDocumentValidation({
  isValidAnswerSheet: false,
  documentTypeDetected: 'Admit Card / Hall Ticket',
  isHandwritten: false,
  rejectionReason: 'This is an admit card.',
});
assert.equal(realAdmitCard.isValidAnswerSheet, false, 'Explicit non-answer-sheet documents must remain rejected.');

const realMarksheet = normalizeAiAnswerSheetDocumentValidation({
  isValidAnswerSheet: false,
  documentTypeDetected: 'Marksheet / Certificate',
  isHandwritten: false,
  rejectionReason: 'This is a marksheet.',
});
assert.equal(realMarksheet.isValidAnswerSheet, false);

const unrelatedInvoice = normalizeAiAnswerSheetDocumentValidation({
  isValidAnswerSheet: false,
  documentTypeDetected: 'Invoice',
  isHandwritten: false,
  rejectionReason: 'This is an unrelated invoice.',
});
assert.equal(unrelatedInvoice.isValidAnswerSheet, false);

const unrelatedGenericDocument = normalizeAiAnswerSheetDocumentValidation({
  isValidAnswerSheet: false,
  documentTypeDetected: 'Unrelated Document',
  isHandwritten: false,
  rejectionReason: 'No student examination answers are present.',
});
assert.equal(unrelatedGenericDocument.isValidAnswerSheet, false);

console.log('Handwriting-style tolerant document validation tests passed.');
