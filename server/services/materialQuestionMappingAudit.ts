import {
  extractOfficialMcqKeysFromSuggestedAnswers,
  extractSubQuestionsFromText,
} from './paperStructureService.js';
import { toCanonicalQuestionId } from './canonicalQuestionService.js';

export type MaterialMappingAuditStatus =
  | 'MATCHED'
  | 'PARTIAL'
  | 'QUESTION_PAPER_NOT_PARSED';

export interface MaterialQuestionMappingAudit {
  status: MaterialMappingAuditStatus;
  statusLabel: string;
  questionPaperIds: string[];
  questionPaperMcqIds: string[];
  questionPaperDescriptiveIds: string[];
  suggestedAnswerIds: string[];
  markingSchemeIds: string[];
  missingFromSuggestedAnswers: string[];
  extraInSuggestedAnswers: string[];
  missingFromMarkingScheme: string[];
  extraInMarkingScheme: string[];
  suggestedAnswerCoveragePercent: number;
  markingSchemeCoveragePercent: number | null;
  markingSchemeIndexed: boolean;
  diagnostics: string[];
}

const MCQ_ID_LINE = /^\s*(?:MCQ|OBJECTIVE)(?:\s*(?:NO\.?)?)?\s*(\d{1,2})\b/i;
const QUESTION_LINE =
  /^\s*(?:(?:QUESTION|Q\.?|ANS(?:WER)?\.?\s+TO\s+QUESTION)\s*)(\d{1,2})(?:\s*\(([a-z0-9]+)\))?(?:\s*([.)\-:]))?\s*(.*)$/i;
const NUMBERED_QUESTION_LINE = /^\s*(\d{1,2})\s*[.)]\s+(.{6,})$/;
const NUMBERED_ANSWER_KEY_LINE = /^\s*\d{1,2}\s*[.)]\s*(?:\([a-d]\)|[a-d]\b)/i;
const SUBQUESTION_LINE = /^\s*\(([a-z])\)\s+(.{4,})$/i;
const MCQ_OPTION_LINE = /^\s*(?:\(([a-d])\)|([a-d])[).])\s+\S+/i;
const SECTION_BOUNDARY =
  /^(?:SECTION\s+[A-Z0-9]+|DIVISION\s+[A-Z0-9]+|PART\s+[IVX0-9]+|DESCRIPTIVE\s+QUESTIONS|OBJECTIVE\s+QUESTIONS)\b/i;

function canonical(raw: string): string {
  return toCanonicalQuestionId(raw).toUpperCase();
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].map((value) => value.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function removeParentWhenChildrenExist(values: Iterable<string>): string[] {
  const ids = uniqueSorted(values);
  const childParents = new Set<string>();
  for (const id of ids) {
    const match = id.match(/^(Q\d+)\(/i);
    if (match) childParents.add(match[1].toUpperCase());
  }
  return ids.filter((id) => !childParents.has(id.toUpperCase()));
}

function extractQuestionPaperInventory(text: string): {
  allIds: string[];
  mcqIds: string[];
  descriptiveIds: string[];
} {
  if (!text?.trim()) return { allIds: [], mcqIds: [], descriptiveIds: [] };

  const lines = text.replace(/\r/g, '').split('\n');
  const objectiveSectionPresent =
    /multiple\s*choice\s*questions|objective(?:\s*type)?\s*questions|division\s*a\b|mcq/i.test(text);
  const candidates: Array<{ lineIndex: number; questionNumber: string; inlineSub?: string; stem: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.length < 6 || SECTION_BOUNDARY.test(line)) continue;

    let match = line.match(QUESTION_LINE);
    if (match) {
      const questionNumber = String(Number(match[1]));
      if (Number(questionNumber) >= 1 && Number(questionNumber) <= 40) {
        candidates.push({
          lineIndex: i,
          questionNumber,
          inlineSub: match[2] || undefined,
          stem: String(match[4] || '').trim(),
        });
      }
      continue;
    }

    if (NUMBERED_ANSWER_KEY_LINE.test(line)) continue;
    match = line.match(NUMBERED_QUESTION_LINE);
    if (match) {
      const questionNumber = String(Number(match[1]));
      const stem = match[2].trim();
      if (
        Number(questionNumber) >= 1 &&
        Number(questionNumber) <= 40 &&
        !/^\([a-d]\)$/i.test(stem) &&
        !/^(?:page|time|marks?|maximum marks?)\b/i.test(stem)
      ) {
        candidates.push({ lineIndex: i, questionNumber, stem });
      }
    }
  }

  const mcqIds: string[] = [];
  const descriptiveIds: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const nextQuestionLine = candidates[i + 1]?.lineIndex ?? lines.length;
    const scanEnd = Math.min(nextQuestionLine, candidate.lineIndex + 22);
    const windowLines = lines.slice(candidate.lineIndex + 1, scanEnd);
    const optionLines = windowLines.filter((line) => MCQ_OPTION_LINE.test(line));
    const hasOptions = optionLines.length >= 2;
    const isMcq =
      hasOptions &&
      (objectiveSectionPresent || optionLines.length >= 3 || /\b(?:select|choose)\s+the\s+correct\s+option\b/i.test(candidate.stem));

    if (isMcq) {
      mcqIds.push(canonical(`MCQ${candidate.questionNumber}`));
      continue;
    }

    if (candidate.inlineSub) {
      descriptiveIds.push(canonical(`Q${candidate.questionNumber}(${candidate.inlineSub})`));
    } else {
      descriptiveIds.push(canonical(`Q${candidate.questionNumber}`));
    }

    for (const line of windowLines) {
      if (SECTION_BOUNDARY.test(line.trim())) break;
      const child = line.match(SUBQUESTION_LINE);
      if (child) {
        descriptiveIds.push(canonical(`Q${candidate.questionNumber}(${child[1]})`));
      }
    }
  }

  const normalizedMcqIds = uniqueSorted(mcqIds);
  const normalizedDescriptiveIds = removeParentWhenChildrenExist(descriptiveIds);
  return {
    mcqIds: normalizedMcqIds,
    descriptiveIds: normalizedDescriptiveIds,
    allIds: uniqueSorted([...normalizedMcqIds, ...normalizedDescriptiveIds]),
  };
}

function extractExplicitSourceIds(text: string, allowNumberedHeadings: boolean): string[] {
  if (!text?.trim()) return [];
  const ids: string[] = [];

  for (const line of text.replace(/\r/g, '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || SECTION_BOUNDARY.test(trimmed)) continue;

    let mcqMatch = trimmed.match(MCQ_ID_LINE);
    if (mcqMatch) {
      ids.push(canonical(`MCQ${Number(mcqMatch[1])}`));
      continue;
    }

    let match = trimmed.match(QUESTION_LINE);
    if (match) {
      const base = `Q${Number(match[1])}`;
      ids.push(canonical(match[2] ? `${base}(${match[2]})` : base));
      continue;
    }

    if (allowNumberedHeadings) {
      if (NUMBERED_ANSWER_KEY_LINE.test(trimmed)) continue;
      match = trimmed.match(NUMBERED_QUESTION_LINE);
      if (match && !/^\([a-d]\)$/i.test(match[2].trim())) {
        ids.push(canonical(`Q${Number(match[1])}`));
      }
    }
  }

  const marked = extractSubQuestionsFromText(text);
  for (const item of marked) {
    ids.push(canonical(item.fullQuestionCode || item.questionNumber));
  }
  return removeParentWhenChildrenExist(ids);
}

/**
 * Read-only diagnostic for admin material inspection. It compares question IDs
 * independently extracted from the official QP, Suggested Answers and Marking
 * Scheme. It deliberately does not alter material status or evaluator behavior.
 */
export function buildMaterialQuestionMappingAudit(options: {
  questionPaperText?: string;
  suggestedAnswersText?: string;
  markingSchemeText?: string;
}): MaterialQuestionMappingAudit {
  const questionPaperText = String(options.questionPaperText || '');
  const suggestedAnswersText = String(options.suggestedAnswersText || '');
  const markingSchemeText = String(options.markingSchemeText || '');

  const qp = extractQuestionPaperInventory(questionPaperText);
  const suggestedIds = extractExplicitSourceIds(suggestedAnswersText, true);
  const officialMcqKeys = extractOfficialMcqKeysFromSuggestedAnswers(suggestedAnswersText);
  for (const qNum of officialMcqKeys.keys()) {
    suggestedIds.push(canonical(`MCQ${qNum}`));
  }
  const saIds = removeParentWhenChildrenExist(suggestedIds);
  const msIds = extractExplicitSourceIds(markingSchemeText, true);

  const qpSet = new Set(qp.allIds);
  const saSet = new Set(saIds);
  const msSet = new Set(msIds);
  const missingFromSuggestedAnswers = qp.allIds.filter((id) => !saSet.has(id));
  const extraInSuggestedAnswers = saIds.filter((id) => !qpSet.has(id));
  const missingFromMarkingScheme = msIds.length
    ? qp.allIds.filter((id) => !msSet.has(id))
    : [];
  const extraInMarkingScheme = msIds.filter((id) => !qpSet.has(id));
  const suggestedAnswerCoveragePercent = qp.allIds.length
    ? Math.round(((qp.allIds.length - missingFromSuggestedAnswers.length) / qp.allIds.length) * 100)
    : 0;
  const markingSchemeCoveragePercent = qp.allIds.length && msIds.length
    ? Math.round(((qp.allIds.length - missingFromMarkingScheme.length) / qp.allIds.length) * 100)
    : null;

  const diagnostics: string[] = [];
  if (!questionPaperText.trim()) diagnostics.push('Question Paper text is empty.');
  else if (!qp.allIds.length) diagnostics.push('Question IDs could not be independently extracted from the Question Paper text.');
  if (!suggestedAnswersText.trim()) diagnostics.push('Suggested Answers text is empty.');
  else if (!saIds.length) diagnostics.push('No question-wise Suggested Answer IDs or recognized MCQ answer keys were found.');
  if (!markingSchemeText.trim()) diagnostics.push('Marking Scheme text is empty.');
  else if (!msIds.length) diagnostics.push('Marking Scheme text has no independently recognized question-wise IDs; it may contain only a general rubric.');
  if (missingFromSuggestedAnswers.length) {
    diagnostics.push(`Suggested Answers are missing ${missingFromSuggestedAnswers.length} Question Paper ID(s).`);
  }
  if (extraInSuggestedAnswers.length) {
    diagnostics.push(`Suggested Answers contain ${extraInSuggestedAnswers.length} ID(s) not found in the Question Paper.`);
  }
  if (missingFromMarkingScheme.length) {
    diagnostics.push(`Marking Scheme is missing ${missingFromMarkingScheme.length} question-wise ID(s).`);
  }
  if (extraInMarkingScheme.length) {
    diagnostics.push(`Marking Scheme contains ${extraInMarkingScheme.length} ID(s) not found in the Question Paper.`);
  }

  const status: MaterialMappingAuditStatus = !qp.allIds.length
    ? 'QUESTION_PAPER_NOT_PARSED'
    : missingFromSuggestedAnswers.length ||
        extraInSuggestedAnswers.length ||
        (msIds.length > 0 && (missingFromMarkingScheme.length || extraInMarkingScheme.length)) ||
        !saIds.length ||
        !msIds.length
      ? 'PARTIAL'
      : 'MATCHED';

  return {
    status,
    statusLabel: status === 'MATCHED'
      ? 'SOURCE IDS MATCHED'
      : status === 'PARTIAL'
        ? 'MAPPING NEEDS REVIEW'
        : 'QUESTION PAPER IDS NOT PARSED',
    questionPaperIds: qp.allIds,
    questionPaperMcqIds: qp.mcqIds,
    questionPaperDescriptiveIds: qp.descriptiveIds,
    suggestedAnswerIds: saIds,
    markingSchemeIds: msIds,
    missingFromSuggestedAnswers,
    extraInSuggestedAnswers,
    missingFromMarkingScheme,
    extraInMarkingScheme,
    suggestedAnswerCoveragePercent,
    markingSchemeCoveragePercent,
    markingSchemeIndexed: msIds.length > 0,
    diagnostics,
  };
}
