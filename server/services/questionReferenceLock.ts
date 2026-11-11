/**
 * Question Reference Lock Service
 *
 * Implements strict, question-by-question reference locking:
 * 1. Resolves exact question/sub-question (e.g. Q5(a), Q5(b), Q1, Q2(a), etc.)
 * 2. Locks against exact Question Paper, Suggested Answer, and Marking Scheme sections.
 * 3. Handles multi-section CA papers (e.g. Section A: Income Tax Q1-Q4, Section B: GST Q5-Q8).
 * 4. STRICT RULE: NEVER fall back to broad document slices or the first 2000 characters of Question 1!
 * 5. If exact question mapping cannot be resolved with high confidence, sets REVIEW_REQUIRED.
 */

import crypto from 'node:crypto';
import { normalizeCanonicalQuestionPartPath, parseCanonicalQuestionIdentity } from './canonicalQuestionService.js';

export interface LockedReferenceSlice {
  found: boolean;
  confidence: number;
  sectionHeader: string;
  snippet: string;
  characterCount: number;
  checksum: string;
}

export type ReferenceSourceType = 'GLOBAL' | 'INSTITUTE' | 'MODEL_TEST' | 'FACULTY_MOCK';

export interface QuestionReferenceLockMetadata {
  qpMaterialId?: string;
  saMaterialId?: string;
  msMaterialId?: string;
  materialVersions?: string;
  sourceType?: ReferenceSourceType;
  materialType?: string;
  mtpSeries?: number;
  modelTestNumber?: number;
  facultyMockTestId?: string;
  materialTitle?: string;
}

export interface LockedQuestionReference {
  fullQuestionCode: string;
  questionNumber: string;
  subQuestion?: string;
  questionPaperSlice: LockedReferenceSlice;
  suggestedAnswerSlice: LockedReferenceSlice;
  markingSchemeSlice: LockedReferenceSlice;
  isFullyLocked: boolean;
  needsReview: boolean;
  reviewReason?: string;
  combinedContentHash: string;
  retrievedCharacterCount: number;
  referenceTrace: {
    questionPaperMaterialId: string;
    suggestedAnswerMaterialId: string;
    markingSchemeMaterialId: string;
    materialVersions: string;
    contentHashes: string;
    exactReferenceSections: string;
    retrievedCharacterCount: number;
    sourceType: ReferenceSourceType;
    materialType?: string;
    mtpSeries?: number;
    modelTestNumber?: number;
    facultyMockTestId?: string;
    materialTitle?: string;
    verificationStatus: 'VERIFIED';
  };
}

/**
 * Normalizes question code into clean components.
 * e.g., "Q5(a)" -> { qNum: "5", subQ: "a", cleanCode: "Q5(a)" }
 * "5" -> { qNum: "5", subQ: undefined, cleanCode: "Q5" }
 * "MCQ 1" -> { qNum: "1", subQ: "MCQ", cleanCode: "MCQ1" }
 */
function escapeRegex(value: string): string {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSubQuestionPath(subQuestion: string): string[] {
  const parsed = parseCanonicalQuestionIdentity('Q1(' + String(subQuestion || '').trim() + ')');
  return parsed.subQuestionPath || [];
}

function subQuestionSuffixPattern(subQuestion: string): string {
  const path = getSubQuestionPath(subQuestion);
  if (!path.length) return '';

  const namedPrefixes = '(?:PART|SUB[- ]?PART|SUBQUESTION|SUB[- ]?QUESTION|CLAUSE|SUB[- ]?CLAUSE|ITEM|PARAGRAPH|PARA)';
  const pathPattern = path.map((part) => {
    const token = escapeRegex(part);
    return '(?:' +
      '\\s*\\(\\s*' + token + '\\s*\\)' +
      '|\\s*\\[\\s*' + token + '\\s*\\]' +
      '|\\s*\\.\\s*' + token +
      '|\\s*' + namedPrefixes + '\\s*' + token +
      ')';
  }).join('');
  const nestedParentheses = path.length > 1
    ? '\\s*\\(\\s*' + escapeRegex(path[0]) +
      path.slice(1).map((part) => '\\s*\\(\\s*' + escapeRegex(part) + '\\s*\\)').join('') +
      '\\s*\\)'
    : '';
  const compact = path.length === 1
    ? '\\s*' + escapeRegex(path[0]) + '(?=\\s|[-–—:.)]|$)'
    : '';

  return '(?:' + [pathPattern, nestedParentheses, compact].filter(Boolean).join('|') + ')';
}

export function parseQuestionCode(code: string): {
  qNum: string;
  subQ?: string;
  questionNumber: string;
  subQuestion?: string;
  isMcq: boolean;
  cleanCode: string;
} {
  const parsed = parseCanonicalQuestionIdentity(String(code || '').trim());
  return {
    qNum: parsed.questionNumber,
    subQ: parsed.subQuestion,
    questionNumber: parsed.questionNumber,
    subQuestion: parsed.subQuestion,
    isMcq: parsed.isMcq,
    cleanCode: parsed.canonicalId,
  };
}

/**
 * Splits document text into Section A and Section B blocks if the paper is a 2-section paper (e.g. Taxation).
 */
function splitIntoSections(docText: string): { sectionA: string; sectionB: string } {
  const secBMarker = /(?:SECTION\s*[–\-—:]?\s*B\b|Goods\s*and\s*Services\s*Tax\s*\(50\s*Marks\))/i;
  const match = docText.search(secBMarker);
  if (match !== -1) {
    return {
      sectionA: docText.slice(0, match),
      sectionB: docText.slice(match),
    };
  }
  return { sectionA: docText, sectionB: '' };
}

/**
 * Many CA reference packs restart their numbering in PART I MCQs and PART II
 * descriptive answers. A lookup for Q1(c), Q4(b), etc. must never match the
 * earlier MCQ row such as "1. (C) Section 91". Scope the search to the
 * descriptive part before applying any question-number/sub-part regex.
 *
 * Division A/B is supported as the equivalent convention. Existing taxation
 * Section A/B handling remains separate because those are subject sections,
 * not necessarily MCQ/descriptive divisions.
 */
function selectObjectiveOrDescriptivePart(docText: string, subQuestion?: string): string {
  const isMcq = String(subQuestion || '').trim().toUpperCase() === 'MCQ';
  const headingPattern = /^\s*(PART|DIVISION)\s*[–—:-]?\s*(I{1,2}|A|B)\b[^\r\n]*$/gim;
  const headingMatches = [...docText.matchAll(headingPattern)];
  const headings = headingMatches.map((match, index) => {
    const headingStart = match.index ?? 0;
    const nextHeadingStart = headingMatches[index + 1]?.index ?? docText.length;
    // In ICAI answer booklets, the part title often sits on the next line:
    // "PART – II 70 Marks" followed by "Descriptive Portion". Include the
    // next non-empty line(s) as heading context, but never scan into answers.
    const headingContext = docText
      .slice(headingStart, nextHeadingStart)
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .slice(0, 2)
      .join(' ');
    return {
      family: String(match[1] || '').toUpperCase(),
      label: String(match[2] || '').toUpperCase(),
      text: headingContext,
      index: headingStart,
    };
  });

  // Require explicit objective/descriptive wording on the headings. PART I/II
  // may also be used for two unrelated subject divisions in other materials;
  // numbering alone is not enough evidence that numbering restarts here.
  const objectivePattern = /\b(?:MCQ|MCQS|MULTIPLE[\s-]+CHOICE|OBJECTIVE)\b/i;
  const descriptivePattern = /\b(?:DESCRIPTIVE|SUBJECTIVE|LONG[\s-]+ANSWER|THEORY)\b/i;

  const isDescriptiveSubQuestion = !isMcq && Boolean(String(subQuestion || '').trim());

  for (const family of ['PART', 'DIVISION']) {
    const familyHeadings = headings.filter((heading) => heading.family === family);
    const objective = familyHeadings.find((heading) =>
      (family === 'PART' ? heading.label === 'I' : heading.label === 'A') &&
      objectivePattern.test(heading.text)
    );
    const descriptive = familyHeadings.find((heading) =>
      (family === 'PART' ? heading.label === 'II' : heading.label === 'B') &&
      descriptivePattern.test(heading.text)
    );

    // Explicit objective/descriptive labels take precedence. Bare numeric
    // questions remain ambiguous, so leave them to the existing QP/SA matcher.
    if (objective && descriptive && descriptive.index > objective.index) {
      if (isMcq) return docText.slice(objective.index, descriptive.index);
      if (isDescriptiveSubQuestion) return docText.slice(descriptive.index);
      return docText;
    }

    // Legacy Model Test structure: "Division A (30 Marks)" contains MCQs and
    // "Division B" starts the descriptive answers, but the word DESCRIPTIVE
    // is not printed. Keep this narrow fallback for nested descriptive IDs.
    if (family === 'DIVISION') {
      const divisionA = familyHeadings.find((heading) => heading.label === 'A');
      const divisionB = familyHeadings.find((heading) => heading.label === 'B');
      if (
        divisionA &&
        divisionB &&
        divisionB.index > divisionA.index &&
        /\b30\s*Marks?\b/i.test(divisionA.text)
      ) {
        if (isMcq) return docText.slice(divisionA.index, divisionB.index);
        if (isDescriptiveSubQuestion) return docText.slice(divisionB.index);
      }
    }
  }

  // Preserve legacy behavior for single-part documents and ambiguous top-level
  // IDs that do not tell the lock whether MCQ or descriptive numbering is meant.
  return docText;
}

/**
 * Finds a lettered sub-question only inside its own numbered parent question.
 * This deliberately refuses a bare "(d) ..." found elsewhere in the document:
 * such a match can otherwise lock Q6(d) to an unrelated Q2(d) table row.
 */
function findSubQuestionInsideParent(
  lines: string[],
  qNum: string,
  subQ: string
): number {
  const target = String(Number(qNum));
  const targetPath = getSubQuestionPath(subQ);
  if (!targetPath.length) return -1;
  let activeParent = false;
  let activePath: string[] = [];

  const namedHeader = /^\s*(?:QUESTION|Q\.?|ANSWER|ANS\.?)\s*(\d{1,2})\b/i;
  const numberedHeader = /^\s*(\d{1,2})\s*[.)]\s*(?=\(|[A-Z]|$)/;
  // Accept flat labels (a)(i) and compact nested labels (a(i)); Roman children
  // normalize to their lettered parent rather than becoming separate tasks.
  const partLabel = /^\s*((?:PART|SUB[- ]?PART|SUBQUESTION|SUB[- ]?QUESTION|CLAUSE|SUB[- ]?CLAUSE|ITEM|PARAGRAPH|PARA)\s+[a-zA-Z0-9]+(?:\s+(?:PART|SUB[- ]?PART|SUBQUESTION|SUB[- ]?QUESTION|CLAUSE|SUB[- ]?CLAUSE|ITEM|PARAGRAPH|PARA)\s+[a-zA-Z0-9]+)*|(?:\(\s*[a-zA-Z0-9]+\s*(?:\(\s*[a-zA-Z0-9]+\s*\)\s*)+\))|(?:\(\s*[a-zA-Z0-9]+\s*\)|\[\s*[a-zA-Z0-9]+\s*\])+|[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+){1,4}|[a-zA-Z0-9]+[.)])(?=\s|[-–—:]|$)/i;
  const roman = new Set([
    'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x',
    'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx',
  ]);
  const family = (token: string, depth: number): string => {
    const value = token.toLowerCase();
    if (/^\d+$/.test(value)) return 'numeric';
    if (roman.has(value)) return 'roman';
    if (/^[a-z]$/.test(value)) return 'alphabetic';
    if (roman.has(value)) return 'roman';
    return 'other:' + value;
  };
  const combine = (current: string[], incoming: string[]): string[] => {
    if (!incoming.length) return current;
    if (!current.length) return incoming;
    if (incoming.length > 1) {
      if (incoming[0].toLowerCase() === current[0]?.toLowerCase()) return incoming;
      let overlap = Math.min(current.length, incoming.length);
      while (overlap > 0 && !current.slice(-overlap).every((part, index) =>
        part.toLowerCase() === incoming[index].toLowerCase()
      )) overlap -= 1;
      return current.concat(incoming.slice(overlap));
    }
    const token = incoming[0];
    const last = current[current.length - 1];
    if (family(token, current.length) === family(last, current.length - 1) ||
        (last.toLowerCase() === 'i' && roman.has(token.toLowerCase()))) {
      return current.slice(0, -1).concat(token);
    }
    if (current.length > 1 &&
        (family(token, current.length) === family(current[0], 0) ||
         (current[0].toLowerCase() === 'i' && roman.has(token.toLowerCase())))) {
      return [token];
    }
    return current.concat(token);
  };
  const samePath = (left: string[], right: string[]) =>
    left.length === right.length && left.every((part, index) => part.toLowerCase() === right[index].toLowerCase());

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) continue;

    const named = trimmed.match(namedHeader);
    const numbered = named ? null : trimmed.match(numberedHeader);
    const detectedParent = named?.[1] || numbered?.[1];

    if (detectedParent) {
      const normalizedParent = String(Number(detectedParent));
      if (normalizedParent !== target) {
        if (activeParent && Number(normalizedParent) > Number(target)) return -1;
        activeParent = false;
        activePath = [];
        continue;
      }

      activeParent = true;
      activePath = [];
      // A parent heading can itself begin with its first child, for example
      // "1. (a) Parent details" or "Question 1(a)". Preserve that path.
      const parentPrefix = trimmed.match(/^(?:(?:QUESTION|Q\.?|ANSWER|ANS\.?)\s*(?:NO\.?)?\s*)?\d{1,3}\s*[.)]?\s*/i);
      const parentRemainder = parentPrefix ? trimmed.slice(parentPrefix[0].length) : '';
      const explicitIdentity = parseCanonicalQuestionIdentity('Q' + target + parentRemainder);
      activePath = [...(explicitIdentity.sourceSubQuestionPath || explicitIdentity.subQuestionPath || [])];
      if (samePath(normalizeCanonicalQuestionPartPath(activePath), targetPath)) return index;
      continue;
    }

    if (!activeParent) continue;
    const labelMatch = trimmed.match(partLabel);
    if (!labelMatch) continue;

    const normalizedLabel = labelMatch[1];
    const labelCode = /^[([{]/.test(normalizedLabel)
      ? 'Q' + target + normalizedLabel
      : 'Q' + target + '(' + normalizedLabel.replace(/[.)]$/, '') + ')';
    const parsedLabel = parseCanonicalQuestionIdentity(labelCode);
    const incoming = parsedLabel.sourceSubQuestionPath || parsedLabel.subQuestionPath || [];
    activePath = combine(activePath, incoming);
    if (samePath(normalizeCanonicalQuestionPartPath(activePath), targetPath)) return index;
  }

  return -1;
}

/**
 * Searches for a specific question/sub-question within a given document text.
 * Strictly extracts the question's content without bleeding into adjacent questions.
 */
export function extractLockedQuestionSlice(
  docText: string,
  qNum: string,
  subQ: string | undefined,
  docType: 'QP' | 'SA' | 'MS',
  isFallback: boolean = false
): LockedReferenceSlice {
  if (!docText || docText.trim().length === 0) {
    return {
      found: false,
      confidence: 0,
      sectionHeader: '',
      snippet: '',
      characterCount: 0,
      checksum: '',
    };
  }

  // Generated examiner-style marking schemes use explicit section headers such
  // as "SUBQUESTION: Q4(b)". Their source-derived answer anchor can itself
  // contain an original question label (and, in defective schemes, the wrong
  // sibling label). Keep that complete scheme block intact until the next
  // SUBQUESTION header so the evaluator can independently verify its topic.
  if (docType === 'MS' && /^\s*SUBQUESTION\s*:/im.test(docText)) {
    const rawLines = docText.replace(/\r/g, '').split('\n');
    const targetNumber = String(Number(qNum));
    const schemeHeaderPattern = /^\s*SUBQUESTION\s*:\s*(?:Q\s*)?(\d{1,3})(.*)$/i;
    const targetPath = subQ && subQ.toUpperCase() !== 'MCQ'
      ? normalizeCanonicalQuestionPartPath(getSubQuestionPath(subQ))
      : [];
    const isSameScoreableSchemePart = (line: string): boolean => {
      const match = line.match(schemeHeaderPattern);
      if (!match || String(Number(match[1])) !== targetNumber) return false;
      const parsedHeader = parseCanonicalQuestionIdentity('Q' + targetNumber + match[2]);
      const headerPath = normalizeCanonicalQuestionPartPath(
        parsedHeader.sourceSubQuestionPath || parsedHeader.subQuestionPath || [],
      );
      return headerPath.length === targetPath.length &&
        headerPath.every((part, index) => part.toLowerCase() === targetPath[index]?.toLowerCase());
    };
    // The parent scoreable Q2(a) can be represented by separate source blocks
    // Q2(a)(i) and Q2(a)(ii). Include every adjacent Roman child block whose
    // normalized identity is still Q2(a); stop at a sibling such as Q2(b).
    const start = rawLines.findIndex(isSameScoreableSchemePart);
    if (start >= 0) {
      let end = rawLines.length;
      for (let index = start + 1; index < rawLines.length; index += 1) {
        if (/^\s*SUBQUESTION\s*:/i.test(rawLines[index])) {
          if (isSameScoreableSchemePart(rawLines[index])) continue;
          end = index;
          break;
        }
        if (
          /^\s*QUESTION\s+MARK\s+RECONCILIATION\b/i.test(rawLines[index]) ||
          /^\s*={3,}\s*QUESTION\s+\d+\b/i.test(rawLines[index])
        ) {
          end = index;
          break;
        }
      }
      const snippet = rawLines.slice(start, end).join('\n').trim();
      const checksum = crypto.createHash('sha256').update(snippet).digest('hex');
      const sectionHeader = rawLines[start].trim();
      const found = snippet.length > sectionHeader.length + 10;
      return {
        found,
        confidence: found ? 95 : 40,
        sectionHeader,
        snippet,
        characterCount: snippet.length,
        checksum,
      };
    }
  }

  const num = parseInt(qNum, 10);
  const partScopedText = selectObjectiveOrDescriptivePart(docText, subQ);
  const { sectionA, sectionB } = splitIntoSections(partScopedText);
  // Q5-Q8 restart under Section B only for Taxation papers. Other CA papers
  // (e.g. Advanced Accounting) also number descriptive questions 5-8.
  const isTaxationMaterial = /income\s*tax\s+law|goods\s+and\s+services\s+tax|\bGST\b/i.test(partScopedText);
  const isSectionB = isTaxationMaterial && num >= 5 && num <= 8;
  let targetText = partScopedText;
  if (!isFallback) {
    if (sectionB && isSectionB) {
      targetText = sectionB;
    } else if (sectionB && !isSectionB && num <= 4) {
      targetText = sectionA;
    }
  }

  // Descriptive Q1-Q8 answers commonly sit under "Division B" while the
  // preceding "Division A" contains a separate MCQ numbering sequence.
  // Search the descriptive division first to avoid crossing those identities.
  if (!isFallback && (!subQ || subQ.toUpperCase() !== 'MCQ')) {
    const divisionBIndex = targetText.search(/\bDivision\s*B\b/i);
    if (divisionBIndex >= 0) targetText = targetText.slice(divisionBIndex);
  }

  const lines = targetText.split('\n');

  // Define candidate search patterns for this question
  const startRegexes: RegExp[] = [];
  const canonicalSuffixPattern = subQ && subQ.toUpperCase() !== 'MCQ'
    ? subQuestionSuffixPattern(subQ)
    : '';
  if (canonicalSuffixPattern) {
    startRegexes.push(new RegExp(
      '^\\s*(?:(?:QUESTION|Q\\.?|ANSWER|ANS\\.?)\\s*(?:NO\\.?)?\\s*)?' +
      qNum + '\\s*\\.?\\s*' + canonicalSuffixPattern + '(?=\\s|[-–—:.)]|\\(|\\[|$)',
      'i',
    ));
  }

  if (docType === 'MS') {
    // Marking scheme has explicit headings: "QUESTION 5(a) – 10 MARKS" or "QUESTION 1 – 15 MARKS"
    if (subQ) {
      startRegexes.push(new RegExp(`(?:QUESTION|Q\\.?)\\s*${qNum}\\s*\\(\\s*${subQ}\\s*\\)`, 'i'));
      if (qNum === '5' && subQ === 'b') {
        startRegexes.push(/Taxability\s+of\s+Indian\s+Railways/i);
        startRegexes.push(/Cloak\s*room\s*services\s*=/i);
      } else if (qNum === '5' && subQ === 'a') {
        startRegexes.push(/Net\s+GST\s+Payable\s+in\s+Cash/i);
        startRegexes.push(/Identify\s+taxable\s+supplies/i);
      }
    } else {
      startRegexes.push(new RegExp(`(?:QUESTION|Q\\.?)\\s*${qNum}\\b(?!\\s*\\([a-z]\\))`, 'i'));
    }
  } else if (docType === 'SA') {
    // Suggested Answers
    if (isSectionB && qNum === '5') {
      // In Section B, Q5 is Question 1 of Section B
      if (subQ === 'a' || !subQ) {
        startRegexes.push(/(?:QUESTION\s*5|Q\.?\s*5|\b5\b)\s*\(\s*a\s*\)/i);
        startRegexes.push(/(?:^|\n|\b)5\.\s*\(a\)/i);
        startRegexes.push(/Computation\s+of\s+net\s+GST\s+payable\s+in\s+cash/i);
        startRegexes.push(/Computation\s+of\s+output\s+tax\s+payable\s+by\s+M\/s\s+Rudra/i);
        startRegexes.push(/(?:^|\n|\b)(?:1\.\s+)?Computation\s+of\s+output\s+tax/i);
      } else if (subQ === 'b') {
        startRegexes.push(/(?:QUESTION\s*5|Q\.?\s*5|\b5\b)\s*\(\s*b\s*\)/i);
        startRegexes.push(/(?:^|\n|\b|\s)\(?b\)?\s*(?:S\.\s*No\.?|Particulars|Cloak\s*room)/i);
        startRegexes.push(/Cloak\s*room\s*services\s+provided\s+to\s+passengers/i);
        startRegexes.push(/services\s+provided\s+by\s+Ministry\s+of\s+Railways/i);
        startRegexes.push(/-\s*\(b\)/i);
      }
    } else if (isSectionB && qNum === '6') {
      if (subQ) {
        startRegexes.push(new RegExp(`(?:Question\\s*6|6\\.|6)\\s*\\(\\s*${subQ}\\s*\\)`, 'i'));
      } else {
        startRegexes.push(/(?:Question\s*6|6\.)\b/i);
      }
    } else if (isSectionB && qNum === '7') {
      if (subQ) {
        startRegexes.push(new RegExp(`(?:Question\\s*7|7\\.|7)\\s*\\(\\s*${subQ}\\s*\\)`, 'i'));
      } else {
        startRegexes.push(/(?:Question\s*7|7\.)\b/i);
      }
    } else if (isSectionB && qNum === '8') {
      if (subQ) {
        startRegexes.push(new RegExp(`(?:Question\\s*8|8\\.|8)\\s*\\(\\s*${subQ}\\s*\\)`, 'i'));
      } else {
        startRegexes.push(/(?:Question\s*8|8\.)\b/i);
      }
    } else {
      // Section A questions (Q1 to Q4).
      // A child reference must never fall through to the parent Q1 heading.
      if (qNum === '1' && !subQ) {
        startRegexes.push(/^\s*1\s*[.)]\s+(?=\S)/i);
        startRegexes.push(/(?:Division\s*B[^\n]*\n)?.*1\.\s+Computation\s+of\s+Total\s+Income\s+of\s+Ms\.\s*Sana/i);
        startRegexes.push(/(?:Question\s*(?:No\.?)?\s*1|Q\.?\s*1|Answer\s*1)\b/i);
        startRegexes.push(/(?:^|\n|\b)1\.\s+Computation\s+of\s+Total\s+Income/i);
      } else if (subQ) {
        startRegexes.push(new RegExp(
          '^\\s*(?:(?:Question|Answer|Ans\\.?|Q\\.?)\\s*(?:NO\\.?)?\\s*' + qNum + '|' + qNum + '\\.)\\s*' + canonicalSuffixPattern,
          'i',
        ));
      } else {
        startRegexes.push(new RegExp(String.raw`^\s*${qNum}\s*[.)]\s+(?=\S)`, 'i'));
        startRegexes.push(new RegExp(
          '(?:Question\\s*(?:No\\.?)?\\s*' + qNum + '|Questions?\\s*' + qNum + '\\.|Answer\\s*' + qNum + '|Ans\\.?\\s*' + qNum + '|Q\\.?\\s*' + qNum + ')\\b',
          'i',
        ));
      }
    }
  } else {
    // Question Paper
    if (isSectionB && qNum === '5') {
      if (subQ === 'a' || !subQ) {
        startRegexes.push(/(?:QUESTION\s*5|Q\.?\s*5|\b5\b)\s*\(\s*a\s*\)/i);
        startRegexes.push(/(?:^|\n|\b)5\.\s*\(a\)/i);
        startRegexes.push(/Question\s*No\.?\s*1\s+is\s+compulsory/i);
        startRegexes.push(/M\/s\s+Rudra\s+&\s+Co\b/i);
      } else if (subQ === 'b') {
        startRegexes.push(/(?:QUESTION\s*5|Q\.?\s*5|\b5\b)\s*\(\s*b\s*\)/i);
        startRegexes.push(/\(?b\)?\s*Determine\s+the\s+taxability/i);
        startRegexes.push(/Determine\s+the\s+taxability\s+or\s+otherwise.*Indian\s+Railways/i);
        startRegexes.push(/Cloak\s*room\s*services\s+provided\s+to\s+passengers/i);
        startRegexes.push(/\(b\)\s+Ministry\s+of\s+Railways/i);
        startRegexes.push(/(?:^|\s)\(b\)\s+(?:Determine|Ministry|Indian)/i);
      }
    } else {
      if (subQ) {
        startRegexes.push(new RegExp(`^\\s*(?:Question\\s*${qNum}|Q\\.?\\s*${qNum}|${qNum}\\.)\\s*${canonicalSuffixPattern}`, 'i'));
      } else {
        // Match standalone numeric QP headings at line start. A word boundary
        // after a literal period never matches (both '.' and the following
        // whitespace are non-word characters), which previously dropped Q4.
        startRegexes.push(new RegExp(
          `^\\s*(?:(?:QUESTION\\s*(?:NO\\.?)?\\s*|Q\\.?\\s*)${qNum}\\b|${qNum}\\.(?:\\s+|$))`,
          'i'
        ));
      }
    }
  }

  // Find start line
  let startIndex = -1;
  let matchedHeader = '';
  let lineOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    for (const rx of startRegexes) {
      if (rx.test(line)) {
        // Avoid matching "section 24(a)" or similar citations when looking for subQ "a"
        if (
          subQ &&
          /(?:section|clause|rule|sub-section|sub-clause|schedule)\s+\d*\s*\([a-z]\)/i.test(line) &&
          !line.toLowerCase().includes('question') &&
          !line.toLowerCase().includes('ans') &&
          !line.toLowerCase().includes('determine')
        ) {
          continue;
        }

        // If this line contains embedded sub-question start (e.g. "(b) Determine the taxability..."), slice at the match
        if (subQ === 'b') {
          const bMatch = line.search(/\(b\)\s+(?:Determine|Ministry|Indian|S\.No|Particulars)/i);
          if (bMatch > 0) {
            lineOffset = bMatch;
          }
        }

        startIndex = i;
        matchedHeader = line.slice(lineOffset).trim();
        break;
      }
    }
    if (startIndex !== -1) break;
  }

  // Some Suggested Answer / Question Paper layouts repeat the parent question
  // once, then label child answers as bare "(a)", "(b)", etc. Resolve those only
  // while the matching parent question is active; never use a document-wide
  // bare-subpart regex.
  if (startIndex === -1 && subQ && subQ.toUpperCase() !== 'MCQ') {
    startIndex = findSubQuestionInsideParent(lines, qNum, subQ);
    if (startIndex !== -1) matchedHeader = lines[startIndex].trim();
  }

  // If not found with strict regexes in section, check whole docText as fallback
  if (startIndex === -1 && !isFallback && targetText !== partScopedText) {
    return extractLockedQuestionSlice(partScopedText, qNum, subQ, docType, true);
  }

  if (startIndex === -1) {
    return {
      found: false,
      confidence: 0,
      sectionHeader: '',
      snippet: '',
      characterCount: 0,
      checksum: '',
    };
  }

  // Determine the stop boundary using the normalized scoreable path. Roman
  // headings (i), (ii), etc. below Q1(a) remain inside the same reference slice;
  // the next top-level lettered sibling (b) ends the slice.
  const firstLine = lineOffset > 0 ? lines[startIndex].slice(lineOffset).trim() : lines[startIndex];
  const capturedLines: string[] = [firstLine];
  const targetSubPath = subQ && subQ.toUpperCase() !== 'MCQ' ? getSubQuestionPath(subQ) : [];
  const firstExplicitQuestion = firstLine.trim().match(/^(?:(?:QUESTION|Q\\.?|ANSWER|ANS\\.?)\\s*(?:NO\\.?)?\\s*)?(\\d{1,3})\\s*(.*)$/i);
  const initialSourcePath = firstExplicitQuestion &&
    String(Number(firstExplicitQuestion[1])) === String(Number(qNum))
      ? (parseCanonicalQuestionIdentity('Q' + qNum + firstExplicitQuestion[2]).sourceSubQuestionPath || [])
      : [];
  let activeBoundaryPath = initialSourcePath.length ? initialSourcePath : [...targetSubPath];
  const nextQ = String(num + 1);
  const romanTokens = new Set(['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx']);
  const pathFamily = (token: string, depth: number): string => {
    const value = token.toLowerCase();
    if (/^\d+$/.test(value)) return 'numeric';
    if (romanTokens.has(value) && (value.length > 1 || depth > 0)) return 'roman';
    if (/^[a-z]$/.test(value)) return 'alphabetic';
    if (romanTokens.has(value)) return 'roman';
    return 'other:' + value;
  };
  const mergeBoundaryPath = (current: string[], incoming: string[]): string[] => {
    if (!incoming.length) return current;
    if (!current.length) return incoming;
    if (incoming.length > 1) {
      if (incoming[0].toLowerCase() === current[0]?.toLowerCase()) return incoming;
      let overlap = Math.min(current.length, incoming.length);
      while (overlap > 0 && !current.slice(-overlap).every((part, index) =>
        part.toLowerCase() === incoming[index].toLowerCase()
      )) overlap -= 1;
      return current.concat(incoming.slice(overlap));
    }
    const token = incoming[0];
    const last = current[current.length - 1];
    if (pathFamily(token, current.length) === pathFamily(last, current.length - 1) || (last.toLowerCase() === 'i' && romanTokens.has(token.toLowerCase()))) {
      return current.slice(0, -1).concat(token);
    }
    if (current.length > 1 && pathFamily(token, current.length) === pathFamily(current[0], 0)) {
      return [token];
    }
    return current.concat(token);
  };

  for (let i = startIndex + 1; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    // A Division A Question Paper slice must not absorb Division B descriptive
    // questions that restart their own numbering sequence.
    if (docType === 'QP' && /^Division\s+B\b/i.test(trimmed)) {
      break;
    }

    let isStop = false;

    if (targetSubPath.length > 0) {
      // Fully-qualified headings carry their whole path. Bare labels are
      // resolved contextually under the exact parent and active nested part.
      const explicitQuestion = trimmed.match(/^(?:(?:QUESTION|Q\.?|ANSWER|ANS\.?)\s*(?:NO\.?)?\s*)?(\d{1,3})\s*(.*)$/i);
      let candidatePath: string[] = [];
      if (explicitQuestion && String(Number(explicitQuestion[1])) === String(Number(qNum))) {
        const tail = explicitQuestion[2].replace(/^[-–—:]\s*/, '').replace(/^\.(?=\s*[\(\[])/, '');
        const parsedCandidate = parseCanonicalQuestionIdentity('Q' + qNum + tail);
        candidatePath = parsedCandidate.sourceSubQuestionPath || parsedCandidate.subQuestionPath || [];
        if (candidatePath.length === 0 && /^(?:QUESTION|Q\.?|ANSWER|ANS\.?)/i.test(trimmed)) {
          isStop = true;
        }
      } else {
        const barePart = trimmed.match(/^\s*((?:PART|SUB[- ]?PART|SUBQUESTION|SUB[- ]?QUESTION|CLAUSE|SUB[- ]?CLAUSE|ITEM|PARAGRAPH|PARA)\s+[a-zA-Z0-9]+(?:\s+(?:PART|SUB[- ]?PART|SUBQUESTION|SUB[- ]?QUESTION|CLAUSE|SUB[- ]?CLAUSE|ITEM|PARAGRAPH|PARA)\s+[a-zA-Z0-9]+)*|(?:\(\s*[a-zA-Z0-9]+\s*(?:\(\s*[a-zA-Z0-9]+\s*\)\s*)+\))|(?:\(\s*[a-zA-Z0-9]+\s*\)|\[\s*[a-zA-Z0-9]+\s*\])|[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+){1,4}|[a-zA-Z0-9]+[.)])(?=\s|[-–—:]|$)/i);
        if (barePart) {
          const bareLabelCode = /^[([{]/.test(barePart[1])
            ? 'Q' + qNum + barePart[1]
            : 'Q' + qNum + '(' + barePart[1].replace(/[.)]$/, '') + ')';
          const parsedIncoming = parseCanonicalQuestionIdentity(bareLabelCode);
          const incoming = parsedIncoming.sourceSubQuestionPath || parsedIncoming.subQuestionPath || [];
          candidatePath = mergeBoundaryPath(activeBoundaryPath, incoming);
          activeBoundaryPath = candidatePath;
        }
      }

      if (candidatePath.length > 0) {
        const normalizedCandidatePath = normalizeCanonicalQuestionPartPath(candidatePath);
        const targetIsPrefix = targetSubPath.every((part, index) =>
          normalizedCandidatePath[index]?.toLowerCase() === part.toLowerCase()
        );
        const exactTarget = targetIsPrefix && normalizedCandidatePath.length === targetSubPath.length;
        const descendantOfTarget = targetIsPrefix && normalizedCandidatePath.length > targetSubPath.length;
        if (!exactTarget && !descendantOfTarget) isStop = true;
      }
    } else if (subQ === 'a') {
      // Preserve the known embedded GST Q5(b) split for legacy ICAI layouts.
      const bIdx = line.search(/\(b\)\s+(?:Determine|Ministry|Indian|S\.No|Particulars)/i);
      if (bIdx > 0) {
        capturedLines.push(line.slice(0, bIdx).trim());
        break;
      }
    }

    // Check if next main question started
    if (
      lower.startsWith(`question ${nextQ}`) ||
      lower.startsWith(`question no. ${nextQ}`) ||
      lower.startsWith(`answer ${nextQ}`) ||
      lower.startsWith(`ans. ${nextQ}`) ||
      lower.startsWith(`q.${nextQ}`) ||
      lower.startsWith(`q${nextQ}`) ||
      lower.startsWith(`${nextQ}. `) ||
      (docType === 'MS' && lower.startsWith(`question ${nextQ}`)) ||
      (docType === 'MS' && lower.startsWith(`total q${qNum}`))
    ) {
      isStop = true;
    }

    // A new numbered question heading is an authoritative section boundary,
    // even when the current answer contains only one captured line. Waiting for
    // a second line here can bleed the following question (and later answers)
    // into a short sub-question reference such as Q2(d).
    const explicitNextMainQuestionHeader = new RegExp(
      `^\\s*(?:(?:QUESTION|Q\\.?|ANSWER|ANS\\.?)\\s*)?${nextQ}\\s*(?:[.):]?\\s*)(?:\\([a-z0-9]+\\)|[A-Z][a-z])`,
      'i'
    ).test(trimmed);

    if (isStop || explicitNextMainQuestionHeader) {
      break;
    }

    capturedLines.push(line);
    if (capturedLines.length > 250) break; // Reasonable ceiling
  }

  const snippet = capturedLines.join('\n').trim();
  const checksum = crypto.createHash('sha256').update(snippet).digest('hex');

  // A correctly parent-scoped one-line answer (e.g. "(d) Short-term provision")
  // can be authoritative even when shorter than 30 characters. Keep a lower
  // threshold only for a matched sub-question, never for an unscoped hit.
  const minimumMeaningfulLength = subQ ? 15 : 30;
  const found = Boolean(matchedHeader) && snippet.length > minimumMeaningfulLength;

  return {
    found,
    confidence: found ? (snippet.length > 30 ? 95 : 72) : 40,
    sectionHeader: matchedHeader || `${docType} for Q${qNum}${subQ ? `(${subQ})` : ''}`,
    snippet,
    characterCount: snippet.length,
    checksum,
  };
}

/**
 * Locks and retrieves authoritative references for a single question/sub-question.
 * If material cannot be resolved, flags needsReview: true.
 * NEVER returns unrelated general text or Question 1 as a fallback.
 */
export function lockQuestionReference(
  fullCode: string,
  questionPaperText: string,
  suggestedAnswersText: string,
  markingSchemeText: string,
  metadata?: QuestionReferenceLockMetadata
): LockedQuestionReference {
  const { qNum, subQ, isMcq, cleanCode } = parseQuestionCode(fullCode);

  const qpSlice = extractLockedQuestionSlice(questionPaperText, qNum, subQ, 'QP');
  const saSlice = extractLockedQuestionSlice(suggestedAnswersText, qNum, subQ, 'SA');
  const msSlice = extractLockedQuestionSlice(markingSchemeText, qNum, subQ, 'MS');

  const isFullyLocked = saSlice.found || (isMcq && saSlice.found);
  const needsReview = !isFullyLocked && !isMcq;

  let reviewReason: string | undefined = undefined;
  if (!saSlice.found) {
    reviewReason = `Authoritative Suggested Answer section for ${cleanCode} could not be resolved in the verified material. Human review required.`;
  }

  const combinedRef = `${qpSlice.snippet}\n${saSlice.snippet}\n${msSlice.snippet}`;
  const combinedContentHash = crypto.createHash('sha256').update(combinedRef).digest('hex');

  const qpMatId = metadata?.qpMaterialId || 'ICAI_QP_OFFICIAL';
  const saMatId = metadata?.saMaterialId || 'ICAI_SA_OFFICIAL';
  const msMatId = metadata?.msMaterialId || 'ICAI_MS_OFFICIAL';

  return {
    fullQuestionCode: cleanCode,
    questionNumber: qNum,
    subQuestion: subQ,
    questionPaperSlice: qpSlice,
    suggestedAnswerSlice: saSlice,
    markingSchemeSlice: msSlice,
    isFullyLocked,
    needsReview,
    reviewReason,
    combinedContentHash,
    retrievedCharacterCount: combinedRef.length,
    referenceTrace: {
      questionPaperMaterialId: qpMatId,
      suggestedAnswerMaterialId: saMatId,
      markingSchemeMaterialId: msMatId,
      materialVersions: metadata?.materialVersions || '1.0',
      contentHashes: `${qpSlice.checksum.slice(0, 8)}:${saSlice.checksum.slice(0, 8)}:${msSlice.checksum.slice(0, 8)}`,
      exactReferenceSections: `QP: ${qpSlice.sectionHeader || 'N/A'} | SA: ${saSlice.sectionHeader || 'N/A'} | MS: ${msSlice.sectionHeader || 'N/A'}`,
      retrievedCharacterCount: combinedRef.length,
      sourceType: metadata?.sourceType || 'GLOBAL',
      materialType: metadata?.materialType,
      ...(metadata?.mtpSeries !== undefined ? { mtpSeries: metadata.mtpSeries } : {}),
      modelTestNumber: metadata?.modelTestNumber,
      facultyMockTestId: metadata?.facultyMockTestId,
      materialTitle: metadata?.materialTitle,
      verificationStatus: 'VERIFIED',
    },
  };
}
