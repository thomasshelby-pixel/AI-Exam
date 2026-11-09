export interface AiDocumentValidationInput {
  isValidAnswerSheet: boolean;
  documentTypeDetected?: string;
  isHandwritten?: boolean;
  rejectionReason?: string;
  details?: string;
}

export interface NormalizedDocumentValidation {
  isValidAnswerSheet: boolean;
  documentTypeDetected: string;
  isHandwritten: boolean;
  rejectionReason?: string;
  details?: string;
}

const explicitNonAnswerDocument = /\b(admit\s*card|hall\s*ticket|registration\s*(?:form|application)|examination\s*application|student\s*(?:id|identity)\s*card|membership\s*card|mark\s*sheet|marksheet|score\s*card|scorecard|certificate|degree|blank\s*(?:pdf|image|page|document)|question\s*paper\s*only|resume|curriculum\s*vitae|invoice|promotional\s*brochure|typed\s*textbook|unrelated\s*document)\b/i;

const explicitNonAnswerReason = /\b(?:this|the)\s+(?:(?:uploaded|attached)\s+)?(?:file|document|upload|image|pdf)?\s*(?:is|appears?\s+to\s+be|was\s+identified\s+as|was\s+classified\s+as)\s+(?:an?\s+)?(?:admit\s*card|hall\s*ticket|registration\s*(?:form|application)|examination\s*application|student\s*(?:id|identity)\s*card|membership\s*card|mark\s*sheet|marksheet|score\s*card|scorecard|certificate|degree|blank\s*(?:pdf|image|page|document)|question\s*paper\s*only|resume|curriculum\s*vitae|invoice|promotional\s*brochure|typed\s*textbook|unrelated\s*document)\b|\b(?:detected|identified|classified)\s+as\s+(?:an?\s+)?(?:admit\s*card|hall\s*ticket|registration\s*(?:form|application)|mark\s*sheet|marksheet|scorecard|certificate|degree|invoice)\b/i;

const handwritingStyleRejection = /\b(illegal|invalid|not\s+acceptable|unacceptable|unsupported|disallowed)?\s*(?:cursive|joined[- ]?up|connected[- ]?script|calligraphy|penmanship|handwriting\s*style|writing\s*style|script\s*style|slanted\s*(?:writing|script)|non[- ]standard\s*(?:lettering|handwriting))\b|\b(?:illegible|unreadable)\s+cursive\b/i;

const answerSheetEvidence = /\b(handwritten|hand\s*written|student\s*answers?|answer\s*sheet|answer\s*booklet|exam\s*answers?|solution\s*work|working\s*notes|journal\s*entries|ledger\s*accounts?)\b/i;

/**
 * Document verification must classify the uploaded document, not grade penmanship.
 * Handwriting style and partial legibility are handled by the page reader. Explicitly
 * disallowed document types remain rejected.
 */
export function normalizeAiAnswerSheetDocumentValidation(
  input: AiDocumentValidationInput,
): NormalizedDocumentValidation {
  const documentType = String(input.documentTypeDetected || '').trim();
  const reason = String(input.rejectionReason || '').trim();
  const details = String(input.details || '').trim();
  const combined = [documentType, reason, details].filter(Boolean).join(' ');

  if (input.isValidAnswerSheet === true) {
    return {
      isValidAnswerSheet: true,
      documentTypeDetected: documentType || 'Handwritten CA Answer Sheet',
      isHandwritten: input.isHandwritten !== false,
    };
  }

  // Never turn an actual non-answer-sheet document into an answer sheet just
  // because the model also mentioned handwriting/cursive in its explanation.
  if (explicitNonAnswerDocument.test(documentType) || explicitNonAnswerReason.test(reason)) {
    return {
      isValidAnswerSheet: false,
      documentTypeDetected: documentType || 'Invalid Document',
      isHandwritten: input.isHandwritten === true,
      rejectionReason: reason || 'This document is not a student CA answer sheet.',
      ...(details ? { details } : {}),
    };
  }

  const styleOnlyRejection = handwritingStyleRejection.test(reason) ||
    handwritingStyleRejection.test(documentType);

  const identifiedAnswerSheet = input.isHandwritten === true && answerSheetEvidence.test(combined);

  if (styleOnlyRejection || identifiedAnswerSheet) {
    return {
      isValidAnswerSheet: true,
      documentTypeDetected: documentType || 'Handwritten CA Answer Sheet (style accepted; page-level reading will determine legibility)',
      isHandwritten: true,
      details: 'Accepted irrespective of cursive, print, slanted, mixed or other handwriting styles. Page-level reading determines which content is legible.',
    };
  }

  return {
    isValidAnswerSheet: false,
    documentTypeDetected: documentType || 'Invalid Document',
    isHandwritten: input.isHandwritten === true,
    rejectionReason: reason || 'The upload could not be verified as a student CA answer sheet.',
    ...(details ? { details } : {}),
  };
}
