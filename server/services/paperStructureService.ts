/**
 * Authoritative Paper Structure Service
 *
 * Mandate:
 * 1. The evaluator MUST obtain the official paper structure from the verified Question Paper
 *    and Cross-Checked Marking Scheme.
 * 2. Normalizes an authoritative hierarchy: Paper -> Section/Division -> Question -> Sub-question -> Max Marks.
 * 3. Q5 MUST NEVER be represented as a single 15-mark question when the official structure
 *    dictates Q5(a) = 10 marks and Q5(b) = 5 marks.
 * 4. Maximum marks are NEVER inferred or invented by AI models.
 */

import {
  toCanonicalQuestionId,
  parseCanonicalQuestionIdentity,
  deduplicateQuestionList,
} from './canonicalQuestionService.js';
import { extractLockedQuestionSlice } from './questionReferenceLock.js';

export interface PaperStructureSubQuestion {
  fullQuestionCode: string; // e.g. 'Q5(a)', 'Q5(b)', 'Q6(a)', 'MCQ1'
  questionNumber: string;   // '5', '6', '1'
  subQuestionNumber?: string; // 'a', 'b', 'c'
  maximumMarks: number;
  compulsory: boolean;
  isMcq: boolean;
  officialKey?: string;     // For MCQs: 'A', 'B', 'C', 'D'
  officialExplanation?: string;
  provision?: string;
  topic?: string;
  /** Exact question wording extracted from the selected authoritative Question Paper. */
  questionText?: string;
  /** Compact answer-reference anchor extracted from the selected Suggested Answers. */
  suggestedAnswerAnchor?: string;
  /** Original label in the source MCQ section, including nested Roman numbering. */
  sourceQuestionLabel?: string;
  section: 'A' | 'B' | 'GENERAL';
  division?: 'A' | 'B';     // 'A' = MCQs, 'B' = Descriptive
}

export interface PaperStructureQuestion {
  questionNumber: string;
  section: 'A' | 'B' | 'GENERAL';
  division: 'A' | 'B';
  compulsory: boolean;
  maximumMarks: number;
  choiceRule?: string;
  subQuestions: PaperStructureSubQuestion[];
}


export interface AuthoritativePaperStructure {
  paperTitle: string;
  totalPaperMaxMarks: number; // 100 for CA exams
  questions: PaperStructureQuestion[];
  subQuestions: PaperStructureSubQuestion[];
  mcqs: PaperStructureSubQuestion[];
}

/**
 * Extracts and normalizes the immutable authoritative paper structure.
 * Pre-configured for known CA papers with verified marking schemes, and includes
 * generic algorithmic parsing for dynamically uploaded papers.
 */
export function getAuthoritativePaperStructure(options: {
  markingSchemeText?: string;
  questionPaperText?: string;
  suggestedAnswersText?: string;
  subjectName?: string;
  paper?: string;
  level?: string;
  officialPaperMaxMarks?: number;
  materialType?: string;
}): AuthoritativePaperStructure {
  const {
    markingSchemeText = '',
    questionPaperText = '',
    suggestedAnswersText = '',
    subjectName = '',
    paper = '',
    officialPaperMaxMarks = 100,
  } = options;

  const textCombined = `${markingSchemeText}\n${questionPaperText}\n${suggestedAnswersText}`.toLowerCase();
  const isTaxationPaper =
    subjectName.toLowerCase().includes('tax') ||
    paper.toLowerCase().includes('tax') ||
    textCombined.includes('income tax law') ||
    textCombined.includes('goods and services tax') ||
    textCombined.includes('rudra') ||
    textCombined.includes('dharani');

  const structure = isTaxationPaper
    ? buildTaxationPaperStructure(options)
    : buildGenericPaperStructure(options);

  // Preserve the exact selected materials alongside the canonical IDs. The
  // page mapper needs real QP wording and SA anchors to identify answers in
  // arbitrary order; IDs and maximum marks alone are not enough.
  return attachQuestionSourceContext(structure, questionPaperText, suggestedAnswersText);
}

/**
 * Enriches canonical question IDs with compact, question-scoped source text.
 * Uses the same parent-scoped extraction rules as examiner reference locking,
 * so an unrelated "(a)" or "(b)" elsewhere in the document cannot be borrowed.
 */
function attachQuestionSourceContext(
  structure: AuthoritativePaperStructure,
  questionPaperText: string,
  suggestedAnswersText: string
): AuthoritativePaperStructure {
  const attach = (question: PaperStructureSubQuestion): PaperStructureSubQuestion => {
    if (question.isMcq && question.sourceQuestionLabel) {
      const objectiveSource = extractObjectiveQuestionPaperBlock(questionPaperText);
      const sourceLabelMatch = question.sourceQuestionLabel.match(/^(?:QUESTION\s*)?(\d{1,2})(?:\s*\(\s*([a-z0-9]+)\s*\))?$/i);
      const qpMcqSlice = sourceLabelMatch
        ? extractLockedQuestionSlice(objectiveSource, sourceLabelMatch[1], sourceLabelMatch[2], 'QP')
        : undefined;
      const answerAnchor = [
        `${question.sourceQuestionLabel}: official option (${question.officialKey || 'UNVERIFIED'})`,
        question.officialExplanation || '',
        question.provision ? `Provision: ${question.provision}` : '',
      ].filter(Boolean).join(' — ');
      return {
        ...question,
        ...(qpMcqSlice?.found && qpMcqSlice.snippet.trim() ? { questionText: qpMcqSlice.snippet.trim() } : {}),
        ...(question.officialKey ? { suggestedAnswerAnchor: answerAnchor } : {}),
      };
    }

    const qpSlice = extractLockedQuestionSlice(
      questionPaperText,
      question.questionNumber,
      question.subQuestionNumber,
      'QP'
    );
    const saSlice = extractLockedQuestionSlice(
      suggestedAnswersText,
      question.questionNumber,
      question.subQuestionNumber,
      'SA'
    );

    return {
      ...question,
      ...(qpSlice.found && qpSlice.snippet.trim()
        ? { questionText: qpSlice.snippet.trim() }
        : {}),
      ...(saSlice.found && saSlice.snippet.trim()
        ? { suggestedAnswerAnchor: saSlice.snippet.trim() }
        : {}),
    };
  };

  return {
    ...structure,
    subQuestions: (structure.subQuestions || []).map(attach),
    mcqs: (structure.mcqs || []).map(attach),
    questions: (structure.questions || []).map((question) => ({
      ...question,
      subQuestions: (question.subQuestions || []).map(attach),
    })),
  };
}

/** Restrict MCQ QP extraction to the objective/Division A block so a later
 * descriptive question with the same parent number cannot become its stem. */
function extractObjectiveQuestionPaperBlock(questionPaperText: string): string {
  const text = String(questionPaperText || '').replace(/\r/g, '');
  if (!text.trim()) return '';
  const startRegex = /(?:Division\s*A\b|Multiple\s*Choice\s*Questions\b|Objective(?:\s*Type)?\s*Questions\b)/i;
  const endRegex = /(?:Division\s*B\b|Descriptive\s*Questions\b|Section\s*B\b)/i;
  const start = text.search(startRegex);
  if (start < 0) return '';
  const tail = text.slice(start);
  const relativeEnd = tail.slice(1).search(endRegex);
  return relativeEnd >= 0 ? tail.slice(0, relativeEnd + 1) : tail;
}

/**
 * Extracts verified MCQ answer keys, explanations, and statutory provisions
 * directly from the authoritative Suggested Answers text stored on the server.
 */
export function extractOfficialMcqKeysFromSuggestedAnswers(suggestedAnswersText?: string): Map<string, {
  officialKey: string;
  explanation: string;
  provision?: string;
  sourceQuestionLabel?: string;
}> {
  const result = new Map<string, { officialKey: string; explanation: string; provision?: string; sourceQuestionLabel?: string }>();
  if (!suggestedAnswersText || typeof suggestedAnswersText !== 'string') return result;

  // Combined-PYQ splitting deliberately duplicates an ambiguous source into
  // both fields with this marker. It is not safe to treat that duplicated text
  // as an authoritative answer key; the pre-evaluation gate must request review.
  if (/^\s*\[AUTHORITATIVE COMBINED PYQ DOCUMENT - SUGGESTED ANSWERS\]/i.test(suggestedAnswersText)) {
    return result;
  }

  // Require an answer-document heading near the beginning of the selected source,
  // not just a Division A label that may belong to the Question Paper's options.
  const answerDocumentHeader = /(?:SUGGESTED\s+ANSWERS?|MODEL\s+ANSWERS?|ANSWER\s+KEY|OFFICIAL\s+ANSWERS?|ANSWERS?\s+(?:OF|TO)\s+(?:(?:MODEL|QUESTION|EXAMINATION|ICAI|TEST|PAPER)\b))/i;
  if (!answerDocumentHeader.test(suggestedAnswersText.slice(0, 1500))) return result;

  // MCQ keys are accepted only when the source explicitly identifies an objective section.
  // Otherwise a descriptive heading like "Question 1(a)" can be mistaken for MCQ 1.
  const mcqSectionHeader = /(?:Division\s*A\b|Multiple\s*Choice\s*Questions\b|Objective(?:\s*Type)?\s*Questions\b|Section\s*A\b[\s\S]{0,120}(?:MCQ|Objective))/i;
  if (!mcqSectionHeader.test(suggestedAnswersText)) return result;

  const divARegex = /(?:Division\s*A\b|Multiple\s*Choice\s*Questions\b|Objective(?:\s*Type)?\s*Questions\b)[\s\S]*?(?=(?:Division\s*B\b|Section\s*B\b|Descriptive\s*Questions\b|$))/gi;
  const blocks: string[] = [];
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = divARegex.exec(suggestedAnswersText)) !== null) blocks.push(blockMatch[0]);
  const searchTexts = blocks.length > 0 ? blocks : [suggestedAnswersText];
  // ICAI answer keys sometimes group four MCQs inside each numbered question:
  // 1. (i) (a), then (ii) (d), (iii) (c), (iv) (c), followed by 4. (b).
  // Student answer sheets number these sequentially, so Q1(iv) is MCQ 4.
  type ParsedAnswer = { key: string; explanation: string; sourceLabel: string };
  const parentNested = /^\s*(?:QUESTION\s*)?(\d{1,2})(?:\s*[.):-]\s*|\s+)\(\s*(xii|xi|ix|viii|vii|vi|iv|v|iii|ii|i|x)\s*\)\s*\(\s*([a-d])\s*\)(.*)$/i;
  const childNested = /^\s*\(\s*(xii|xi|ix|viii|vii|vi|iv|v|iii|ii|i|x)\s*\)\s*\(\s*([a-d])\s*\)(.*)$/i;
  const standalone = /^\s*(?:(?:MCQ\s*(?:No\.?)?\s*|Question\s*(?:No\.?)?\s*)?)(\d{1,2})(?:\s*[.:)\-]\s*|\s+)\(([a-d])\)(.*)$/i;

  const parseBlock = (block: string): { entries: ParsedAnswer[]; hasNestedGroups: boolean } => {
    const entries: ParsedAnswer[] = [];
    let activeParent = '';
    let hasNestedGroups = false;
    for (const line of block.split(/\r?\n/)) {
      let match = line.match(parentNested);
      if (match) {
        const parent = match[1];
        const romanPart = match[2].toLowerCase();
        activeParent = parent;
        hasNestedGroups = true;
        entries.push({
          key: match[3].toUpperCase(),
          explanation: String(match[4] || '').trim(),
          sourceLabel: 'Question ' + parent + '(' + romanPart + ')',
        });
        continue;
      }

      match = line.match(childNested);
      if (match && activeParent) {
        const romanPart = match[1].toLowerCase();
        entries.push({
          key: match[2].toUpperCase(),
          explanation: String(match[3] || '').trim(),
          sourceLabel: 'Question ' + activeParent + '(' + romanPart + ')',
        });
        continue;
      }

      match = line.match(standalone);
      if (match) {
        activeParent = '';
        entries.push({
          key: match[2].toUpperCase(),
          explanation: String(match[3] || '').trim(),
          sourceLabel: 'Question ' + match[1],
        });
      }
    }
    return { entries, hasNestedGroups };
  };

  const parsedBlocks = searchTexts.map(parseBlock);
  if (parsedBlocks.some((block) => block.hasNestedGroups)) {
    const flattened = parsedBlocks.flatMap((block) => block.entries);
    flattened.forEach((entry, index) => {
      const qNum = String(index + 1);
      const explanation = entry.explanation || ('Suggested answer for ' + entry.sourceLabel + ': option (' + entry.key + ').');
      const provisionMatch = explanation.match(/\b(?:section\s+[0-9]+[A-Z]*(?:\([0-9a-z]+\))*|rule\s+[0-9]+[A-Z]*(?:\([0-9a-z]+\))*|schedule\s+[I|V|X]+(?:\s+para\s+[0-9]+(?:\([a-z]+\))*)?|article\s+[0-9]+)\b/i);
      result.set(qNum, {
        officialKey: entry.key,
        explanation,
        provision: provisionMatch?.[0],
        sourceQuestionLabel: entry.sourceLabel,
      });
    });
    return result;
  }

  // Backward-compatible flat parser: "1. (c)", "2. (d)", and "MCQ 3. (a)".
  for (const block of searchTexts) {
    const mcqRegex = /(?:MCQ\s*(?:No\.?)?\s*|Question\s*(?:No\.?)?\s*)?(\b\d{1,2}\b)\s*[\.:\-)]\s*(?:\(([a-dA-D])\)|([a-dA-D])\b)([\s\S]*?)(?=(?:(?:MCQ\s*(?:No\.?)?\s*|Question\s*(?:No\.?)?\s*)?\b\d{1,2}\b\s*[\.:\-)]\s*(?:\([a-dA-D]\)|[a-dA-D]\b))|$)/gi;
    let match: RegExpExecArray | null;
    while ((match = mcqRegex.exec(block)) !== null) {
      const qNum = match[1];
      const rawKey = (match[2] || match[3] || '').toUpperCase();
      const rawExplanation = (match[4] || '').trim();
      const num = parseInt(qNum, 10);
      if (num < 1 || num > 30 || !['A', 'B', 'C', 'D'].includes(rawKey)) continue;
      const provisionMatch = rawExplanation.match(/\b(?:section\s+[0-9]+[A-Z]*(?:\([0-9a-z]+\))*|rule\s+[0-9]+[A-Z]*(?:\([0-9a-z]+\))*|schedule\s+[I|V|X]+(?:\s+para\s+[0-9]+(?:\([a-z]+\))*)?|article\s+[0-9]+)\b/i);
      result.set(qNum, {
        officialKey: rawKey,
        explanation: rawExplanation,
        provision: provisionMatch?.[0],
        sourceQuestionLabel: `Question ${qNum}`,
      });
    }
  }
  return result;
}

/**
 * Authoritative Structure for CA Intermediate Paper 3: Taxation
 * Total Marks: 100
 * Section A: Income Tax Law (50 Marks)
 *   Division A: MCQs 1 to 8 (15 Marks)
 *   Division B: Descriptive (35 Marks) - Q1 Compulsory (15m), Q2 (4+6=10), Q3 (6+4=10), Q4 (6+4=10) (Attempt any 2 of Q2, Q3, Q4)
 * Section B: GST (50 Marks)
 *   Division A: MCQs 9 to 16 (15 Marks)
 *   Division B: Descriptive (35 Marks) - Q5 Compulsory (10+5=15m), Q6 (3+2+5=10), Q7 (5+5=10), Q8 (5+5=10) (Attempt any 2 of Q6, Q7, Q8)
 */
function buildTaxationPaperStructure(options: {
  markingSchemeText?: string;
  questionPaperText?: string;
  suggestedAnswersText?: string;
  officialPaperMaxMarks?: number;
}): AuthoritativePaperStructure {
  // Extract verified keys from the actual uploaded Suggested Answers
  const parsedKeys = extractOfficialMcqKeysFromSuggestedAnswers(options.suggestedAnswersText);

  // Only keys parsed from this exact uploaded Suggested Answer are authoritative.
  // Missing keys remain empty and are blocked by validatePreEvaluationGate().
  // Never reuse hardcoded answers from a different attempt, MTP series, or paper.
  const getKey = (qNum: string) => parsedKeys.get(qNum)?.officialKey || '';
  const getExplanation = (qNum: string) => parsedKeys.get(qNum)?.explanation || '';
  const getProvision = (qNum: string) => parsedKeys.get(qNum)?.provision || '';

  const subQuestions: PaperStructureSubQuestion[] = [
    // ----------------------------------------------------
    // Section A - Division A: MCQs (15 Marks)
    // ----------------------------------------------------
    { fullQuestionCode: 'MCQ1', questionNumber: '1', subQuestionNumber: 'MCQ', maximumMarks: 2, compulsory: true, isMcq: true, officialKey: getKey('1'), officialExplanation: getExplanation('1'), provision: getProvision('1'), topic: 'Section A - Case Scenario MCQ 1 (Interest on borrowed capital & taxable income)', section: 'A', division: 'A' },
    { fullQuestionCode: 'MCQ2', questionNumber: '2', subQuestionNumber: 'MCQ', maximumMarks: 2, compulsory: true, isMcq: true, officialKey: getKey('2'), officialExplanation: getExplanation('2'), provision: getProvision('2'), topic: 'Section A - Case Scenario MCQ 2 (Net taxable income from house property)', section: 'A', division: 'A' },
    { fullQuestionCode: 'MCQ3', questionNumber: '3', subQuestionNumber: 'MCQ', maximumMarks: 2, compulsory: true, isMcq: true, officialKey: getKey('3'), officialExplanation: getExplanation('3'), provision: getProvision('3'), topic: 'Section A - Case Scenario MCQ 3 (Deduction on self-occupied residential unit u/s 24(b))', section: 'A', division: 'A' },
    { fullQuestionCode: 'MCQ4', questionNumber: '4', subQuestionNumber: 'MCQ', maximumMarks: 2, compulsory: true, isMcq: true, officialKey: getKey('4'), officialExplanation: getExplanation('4'), provision: getProvision('4'), topic: 'Section A - Independent MCQ 4 (Residential status u/s 6(1) & 6(6))', section: 'A', division: 'A' },
    { fullQuestionCode: 'MCQ5', questionNumber: '5', subQuestionNumber: 'MCQ', maximumMarks: 2, compulsory: true, isMcq: true, officialKey: getKey('5'), officialExplanation: getExplanation('5'), provision: getProvision('5'), topic: 'Section A - Independent MCQ 5 (TDS requirement on rent u/s 194-IB)', section: 'A', division: 'A' },
    { fullQuestionCode: 'MCQ6', questionNumber: '6', subQuestionNumber: 'MCQ', maximumMarks: 2, compulsory: true, isMcq: true, officialKey: getKey('6'), officialExplanation: getExplanation('6'), provision: getProvision('6'), topic: 'Section A - Independent MCQ 6 (Advance tax liability threshold u/s 208)', section: 'A', division: 'A' },
    { fullQuestionCode: 'MCQ7', questionNumber: '7', subQuestionNumber: 'MCQ', maximumMarks: 2, compulsory: true, isMcq: true, officialKey: getKey('7'), officialExplanation: getExplanation('7'), provision: getProvision('7'), topic: 'Section A - Independent MCQ 7 (Disallowance for payments to MSEs u/s 43B(h))', section: 'A', division: 'A' },
    { fullQuestionCode: 'MCQ8', questionNumber: '8', subQuestionNumber: 'MCQ', maximumMarks: 1, compulsory: true, isMcq: true, officialKey: getKey('8'), officialExplanation: getExplanation('8'), provision: getProvision('8'), topic: 'Section A - Independent MCQ 8 (Tax on deemed income u/s 115BBE)', section: 'A', division: 'A' },

    // ----------------------------------------------------
    // Section A - Division B: Descriptive (35 Marks)
    // ----------------------------------------------------
    { fullQuestionCode: 'Q1', questionNumber: '1', subQuestionNumber: undefined, maximumMarks: 15, compulsory: true, isMcq: false, topic: 'Total Income and Tax Liability of Ms. Sana', section: 'A', division: 'B' },
    { fullQuestionCode: 'Q2(a)', questionNumber: '2', subQuestionNumber: 'a', maximumMarks: 4, compulsory: false, isMcq: false, topic: 'Capital Gains Tax Liability (Jewellery & Property)', section: 'A', division: 'B' },
    { fullQuestionCode: 'Q2(b)', questionNumber: '2', subQuestionNumber: 'b', maximumMarks: 6, compulsory: false, isMcq: false, topic: 'Residential Status & Total Income of Mr. Kabir', section: 'A', division: 'B' },
    { fullQuestionCode: 'Q3(a)', questionNumber: '3', subQuestionNumber: 'a', maximumMarks: 6, compulsory: false, isMcq: false, topic: 'Taxable Salary of Mr. Vikram', section: 'A', division: 'B' },
    { fullQuestionCode: 'Q3(b)', questionNumber: '3', subQuestionNumber: 'b', maximumMarks: 4, compulsory: false, isMcq: false, topic: 'Return Filing Requirements u/s 139(1)', section: 'A', division: 'B' },
    { fullQuestionCode: 'Q4(a)', questionNumber: '4', subQuestionNumber: 'a', maximumMarks: 6, compulsory: false, isMcq: false, topic: 'Gross Total Income & Carry Forward Losses u/s 115BAC (Mr. Sharma)', section: 'A', division: 'B' },
    { fullQuestionCode: 'Q4(b)', questionNumber: '4', subQuestionNumber: 'b', maximumMarks: 4, compulsory: false, isMcq: false, topic: 'Updated Return u/s 139(8A) / TDS & TCS', section: 'A', division: 'B' },

    // ----------------------------------------------------
    // Section B - Division A: MCQs (15 Marks)
    // ----------------------------------------------------
    { fullQuestionCode: 'MCQ9', questionNumber: '9', subQuestionNumber: 'MCQ', maximumMarks: 2, compulsory: true, isMcq: true, officialKey: getKey('9'), officialExplanation: getExplanation('9'), provision: getProvision('9'), topic: 'Section B - GST Case Scenario MCQ 9 (Tax on commercial & residential renting)', section: 'B', division: 'A' },
    { fullQuestionCode: 'MCQ10', questionNumber: '10', subQuestionNumber: 'MCQ', maximumMarks: 2, compulsory: true, isMcq: true, officialKey: getKey('10'), officialExplanation: getExplanation('10'), provision: getProvision('10'), topic: 'Section B - GST Case Scenario MCQ 10 (Del-credere agent supply value under Rule 28)', section: 'B', division: 'A' },
    { fullQuestionCode: 'MCQ11', questionNumber: '11', subQuestionNumber: 'MCQ', maximumMarks: 2, compulsory: true, isMcq: true, officialKey: getKey('11'), officialExplanation: getExplanation('11'), provision: getProvision('11'), topic: 'Section B - GST Case Scenario MCQ 11 (ECO delivery services tax liability u/s 9(5))', section: 'B', division: 'A' },
    { fullQuestionCode: 'MCQ12', questionNumber: '12', subQuestionNumber: 'MCQ', maximumMarks: 2, compulsory: true, isMcq: true, officialKey: getKey('12'), officialExplanation: getExplanation('12'), provision: getProvision('12'), topic: 'Section B - GST Independent MCQ 12 (Taxable value of supply for September)', section: 'B', division: 'A' },
    { fullQuestionCode: 'MCQ13', questionNumber: '13', subQuestionNumber: 'MCQ', maximumMarks: 2, compulsory: true, isMcq: true, officialKey: getKey('13'), officialExplanation: getExplanation('13'), provision: getProvision('13'), topic: 'Section B - GST Independent MCQ 13 (ITC eligibility under section 16/17)', section: 'B', division: 'A' },
    { fullQuestionCode: 'MCQ14', questionNumber: '14', subQuestionNumber: 'MCQ', maximumMarks: 2, compulsory: true, isMcq: true, officialKey: getKey('14'), officialExplanation: getExplanation('14'), provision: getProvision('14'), topic: 'Section B - GST Independent MCQ 14 (Time of supply for continuous supply u/s 31(5))', section: 'B', division: 'A' },
    { fullQuestionCode: 'MCQ15', questionNumber: '15', subQuestionNumber: 'MCQ', maximumMarks: 2, compulsory: true, isMcq: true, officialKey: getKey('15'), officialExplanation: getExplanation('15'), provision: getProvision('15'), topic: 'Section B - GST Independent MCQ 15 (Classification of construction vs sale of building)', section: 'B', division: 'A' },
    { fullQuestionCode: 'MCQ16', questionNumber: '16', subQuestionNumber: 'MCQ', maximumMarks: 1, compulsory: true, isMcq: true, officialKey: getKey('16'), officialExplanation: getExplanation('16'), provision: getProvision('16'), topic: 'Section B - GST Independent MCQ 16 (Debit note adjustment u/s 34)', section: 'B', division: 'A' },

    // ----------------------------------------------------
    // Section B - Division B: Descriptive (35 Marks)
    // CRITICAL: Q5(a) = 10 Marks, Q5(b) = 5 Marks (Total 15m)
    // ----------------------------------------------------
    { fullQuestionCode: 'Q5(a)', questionNumber: '5', subQuestionNumber: 'a', maximumMarks: 10, compulsory: true, isMcq: false, topic: 'Net GST Payable in Cash (M/s Rudra)', section: 'B', division: 'B' },
    { fullQuestionCode: 'Q5(b)', questionNumber: '5', subQuestionNumber: 'b', maximumMarks: 5, compulsory: true, isMcq: false, topic: 'Taxability of Indian Railways Services', section: 'B', division: 'B' },
    { fullQuestionCode: 'Q6(a)', questionNumber: '6', subQuestionNumber: 'a', maximumMarks: 3, compulsory: false, isMcq: false, topic: 'Place of Supply (Services on Conveyance - Girdhar Gopal)', section: 'B', division: 'B' },
    { fullQuestionCode: 'Q6(b)', questionNumber: '6', subQuestionNumber: 'b', maximumMarks: 2, compulsory: false, isMcq: false, topic: 'Place of Supply (Installation of Goods - Mizu Electronics)', section: 'B', division: 'B' },
    { fullQuestionCode: 'Q6(c)', questionNumber: '6', subQuestionNumber: 'c', maximumMarks: 5, compulsory: false, isMcq: false, topic: 'GST Exemptions (Legal Services, Parking, Student Transport, Maintenance)', section: 'B', division: 'B' },
    { fullQuestionCode: 'Q7(a)', questionNumber: '7', subQuestionNumber: 'a', maximumMarks: 5, compulsory: false, isMcq: false, topic: 'E-Way Bill (Composition Dealer Restriction - Dhaniram)', section: 'B', division: 'B' },
    { fullQuestionCode: 'Q7(b)', questionNumber: '7', subQuestionNumber: 'b', maximumMarks: 5, compulsory: false, isMcq: false, topic: 'Order of Discharge of GST Liability u/s 49(8) (Mr. Dharam)', section: 'B', division: 'B' },
    { fullQuestionCode: 'Q8(a)', questionNumber: '8', subQuestionNumber: 'a', maximumMarks: 5, compulsory: false, isMcq: false, topic: 'Food & Beverages at Cinema / Guest Anchors', section: 'B', division: 'B' },
    { fullQuestionCode: 'Q8(b)', questionNumber: '8', subQuestionNumber: 'b', maximumMarks: 5, compulsory: false, isMcq: false, topic: 'Rule 88D - ITC Difference', section: 'B', division: 'B' },
  ];

  // Check if text provides explicit overrides for questions (e.g. Q4(b) carrying 3 marks or Q6(a)(2) carrying 3 marks)
  const combinedText = `${options.markingSchemeText || ''}\n${options.questionPaperText || ''}\n${options.suggestedAnswersText || ''}`;
  const parsedExplicit = extractSubQuestionsFromText(combinedText);
  const overrideMap = new Map<string, number>();
  for (const pe of parsedExplicit) {
    const canonKey = toCanonicalQuestionId(pe.fullQuestionCode || pe.questionNumber, pe.subQuestionNumber);
    overrideMap.set(canonKey, pe.maximumMarks);
  }

  for (const sq of subQuestions) {
    const canonKey = toCanonicalQuestionId(sq.fullQuestionCode || sq.questionNumber, sq.subQuestionNumber);
    if (overrideMap.has(canonKey)) {
      sq.maximumMarks = overrideMap.get(canonKey)!;
    }
  }

  // If parsedExplicit contains sub-sub questions (like Q6(a)(1) or Q6(a)(2)), remove parent placeholder like Q6(a)
  const hasSubSub = (parentCode: string) => {
    const canonP = toCanonicalQuestionId(parentCode);
    return parsedExplicit.some((pe) => {
      const canonChild = toCanonicalQuestionId(pe.fullQuestionCode || pe.questionNumber, pe.subQuestionNumber);
      return canonChild !== canonP && canonChild.startsWith(`${canonP}(`);
    });
  };
  let finalSubQuestions = subQuestions.filter((sq) => !hasSubSub(sq.fullQuestionCode));

  for (const pe of parsedExplicit) {
    const peCanon = toCanonicalQuestionId(pe.fullQuestionCode || pe.questionNumber, pe.subQuestionNumber);
    if (!finalSubQuestions.some((s) => toCanonicalQuestionId(s.fullQuestionCode || s.questionNumber, s.subQuestionNumber) === peCanon)) {
      finalSubQuestions.push(pe);
    }
  }

  // Authoritative deduplication and parent-child elimination
  finalSubQuestions = deduplicateQuestionList(finalSubQuestions);

  // Group into Questions
  const questionsMap = new Map<string, PaperStructureQuestion>();

  for (const sq of finalSubQuestions) {
    if (sq.isMcq) continue;

    const key = `SEC_${sq.section}_Q${sq.questionNumber}`;
    if (!questionsMap.has(key)) {
      questionsMap.set(key, {
        questionNumber: sq.questionNumber,
        section: sq.section,
        division: sq.division || 'B',
        compulsory: sq.compulsory,
        maximumMarks: 0,
        choiceRule:
          sq.questionNumber === '1' || sq.questionNumber === '5'
            ? 'Compulsory Question'
            : sq.section === 'A'
            ? 'Attempt any TWO of Q2, Q3 and Q4'
            : 'Attempt any TWO of Q6, Q7 and Q8',
        subQuestions: [],
      });
    }

    const q = questionsMap.get(key)!;
    q.maximumMarks += sq.maximumMarks;
    q.subQuestions.push(sq);
  }

  const mcqs = finalSubQuestions.filter((sq) => sq.isMcq);

  return {
    paperTitle: 'CA Intermediate – Paper 3: Taxation',
    totalPaperMaxMarks: options.officialPaperMaxMarks || 100,
    questions: Array.from(questionsMap.values()),
    subQuestions: finalSubQuestions,
    mcqs,
  };
}

/**
 * Universal Sub-Question and Max Marks Extractor from official scheme/question paper text.
 * Accurately extracts questions like:
 * "QUESTION 1 – 15 MARKS", "QUESTION 4(b) – 3 MARKS", "Q6(a)(1) - 2 MARKS", "Q6(a)(2) - 3 MARKS", "4(b) [3 Marks]"
 */
export function extractSubQuestionsFromText(text: string): PaperStructureSubQuestion[] {
  const subQuestions: PaperStructureSubQuestion[] = [];
  if (!text || typeof text !== 'string') return subQuestions;

  const seen = new Set<string>();
  const addQuestion = (questionNumber: string, subQuestion: string | undefined, maximumMarks: number) => {
    if (!questionNumber || !Number.isFinite(maximumMarks) || maximumMarks <= 0) return;
    const rawCode = subQuestion ? 'Q' + questionNumber + '(' + subQuestion + ')' : 'Q' + questionNumber;
    const canonicalId = toCanonicalQuestionId(rawCode);
    if (seen.has(canonicalId)) return;
    seen.add(canonicalId);
    const parsed = parseCanonicalQuestionIdentity(canonicalId);
    subQuestions.push({
      fullQuestionCode: parsed.canonicalId,
      questionNumber: parsed.questionNumber,
      subQuestionNumber: parsed.subQuestion,
      maximumMarks,
      compulsory: parsed.questionNumber === '1' || parsed.questionNumber === '5',
      isMcq: false,
      section: parseInt(parsed.questionNumber, 10) > 4 ? 'B' : 'A',
      division: 'B',
    });
  };

  const extractMarks = (value: string): number | undefined => {
    const source = String(value || '');
    const match =
      source.match(/(?:\[\s*|\(\s*)([0-9]+(?:\.[0-9]+)?)\s*(?:Marks?|M)\b/i) ||
      source.match(/\b([0-9]+(?:\.[0-9]+)?)\s*(?:Marks?|M)\b/i) ||
      source.match(/\b(?:Marks?|M)\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/i) ||
      source.match(/\b(?:carries?|carrying|worth|allotted)\s+([0-9]+(?:\.[0-9]+)?)(?:\s*(?:Marks?|M))?\b/i);
    const valueText = match?.[1];
    if (!valueText) return undefined;
    const marks = Number(valueText);
    return Number.isFinite(marks) && marks > 0 ? marks : undefined;
  };

  // Explicit parent/part labels, including "QUESTION NO. 1 (a) carries 5 marks".
  const explicitRegex = /(?:QUESTION\s*(?:NO\.?\s*)?|Q\.?|Ans(?:wer)?\.?)\s*([0-9]+)(?:\s*(?:(?:PART|SUB[- ]?PART)\s*)?\(\s*([a-zA-Z0-9]+(?:\([a-zA-Z0-9]+\))?)\s*\))?\s*(?:[-–—:]|\b|is|carries?|carrying|worth|allotted|\.)\s*(?:(?:for|carrying|carries|worth|allotted|of)?\s*)?(?:\[\s*|\(\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:Marks?|M)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = explicitRegex.exec(text)) !== null) {
    addQuestion(match[1], match[2], Number(match[3]));
  }

  // Explicit Q1(a) lines can place the allocation after descriptive wording:
  // "Q1(a) Calculate NPV — 5 marks" or "Question 1 Part (b): 4 marks".
  const explicitPartRegex = /(?:QUESTION\s*(?:NO\.?\s*)?|Q\.?|Ans(?:wer)?\.?)\s*([0-9]+)\s*(?:(?:PART|SUB[- ]?PART)\s*)?\(\s*([a-zA-Z0-9]+(?:\([a-zA-Z0-9]+\))?)\s*\)([^\r\n]*)/gi;
  while ((match = explicitPartRegex.exec(text)) !== null) {
    const marks = extractMarks(match[3]);
    if (marks !== undefined) addQuestion(match[1], match[2], marks);
  }

  // Numeric line labels: "4(b) - 3 Marks", "6(a)(2) [3 Marks]".
  const numericRegex = /(?:^|\n)\s*([0-9]+)\s*\(([a-zA-Z0-9]+(?:\([a-zA-Z0-9]+\))?)\)\s*[-–—:]?\s*(?:\[\s*|\(\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:Marks?|M)\b/gi;
  while ((match = numericRegex.exec(text)) !== null) {
    addQuestion(match[1], match[2], Number(match[3]));
  }

  // Contextual formats under a parent heading:
  // "(a) Description [10 Marks]", "a) Description — 5 marks",
  // "Part (b): Description (4 Marks)" and "Sub-part (i) — Marks: 2".
  const lines = text.split(/\r?\n/);
  let activeParentQNum: string | null = null;
  const parentHeaderRegex = /^\s*(?:QUESTION\s*(?:NO\.?\s*)?|Q\.?|Ans(?:wer)?\.?)\s*([0-9]+)\b(?!\s*(?:\(|PART\b|SUB[- ]?PART\b))/i;
  const childSubQRegex = /^\s*(?:(?:PART|SUB[- ]?PART|SUBQUESTION|SUB QUESTION)\s*)?(?:\(\s*([a-zA-Z0-9]+(?:\([a-zA-Z0-9]+\))?)\s*\)|\[\s*([a-zA-Z0-9]+(?:\([a-zA-Z0-9]+\))?)\s*\]|([a-zA-Z0-9]+)\s*[.)])(?:\s*[-–—:]\s*|\s+|$)/i;

  for (const line of lines) {
    if (/^\s*(?:SUGGESTED\s+ANSWERS?|MODEL\s+ANSWERS?|ANSWER\s+KEY|MARKING\s+SCHEME|QUESTION\s+PAPER)\b/i.test(line)) {
      activeParentQNum = null;
    }

    const parentMatch = line.match(parentHeaderRegex);
    if (parentMatch) activeParentQNum = parentMatch[1];

    if (!activeParentQNum) continue;
    const childMatch = line.match(childSubQRegex);
    if (!childMatch) continue;

    const subQuestion = childMatch[1] || childMatch[2] || childMatch[3];
    const remainder = line.slice(childMatch[0].length);
    const marks = extractMarks(remainder);
    if (marks !== undefined) addQuestion(activeParentQNum, subQuestion, marks);
  }

  return deduplicateQuestionList(subQuestions);
}
interface OptionalAttemptSelectionRule {
  allowedCount: number;
  questionNumbers: string[];
  choiceRule: string;
}

const ATTEMPT_COUNT_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function parseAttemptCount(value: string): number {
  const normalized = String(value || '').trim().toLowerCase();
  return /^\d+$/.test(normalized) ? Number(normalized) : (ATTEMPT_COUNT_WORDS[normalized] || 0);
}

/**
 * Read optional-question selection only from explicit Question Paper / Marking
 * Scheme wording. If the source does not identify an unambiguous allowed set,
 * return null rather than guessing from conventional CA paper layouts.
 */
export function extractOptionalAttemptSelectionRule(
  questionPaperText: string,
  markingSchemeText: string,
  availableQuestionNumbers: string[],
): OptionalAttemptSelectionRule | null {
  const sourceText = `${questionPaperText || ''}\n${markingSchemeText || ''}`;
  if (!sourceText.trim()) return null;

  const available = [...new Set(availableQuestionNumbers.map((value) => String(Number(value))))]
    .filter((value) => /^\d+$/.test(value))
    .sort((left, right) => Number(left) - Number(right));
  if (!available.length) return null;

  const directPattern = /\b(?:attempt|answer)\s+any\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s+(?:questions?\s+)?(?:of|from)\s+(?:questions?\s*)?((?:Q\s*)?\d{1,2}(?:(?:\s*,\s*|\s+and\s+|\s+to\s+|\s*-\s*)(?:Q\s*)?\d{1,2})*)/i;
  const directMatch = sourceText.match(directPattern);

  let allowedCount = 0;
  let allowedNumbers: string[] = [];
  let expectedRangeLength = 0;

  if (directMatch) {
    allowedCount = parseAttemptCount(directMatch[1]);
    const tail = directMatch[2];
    const numbers = (tail.match(/\d{1,2}/g) || []).map((value) => Number(value));
    if (/\bto\b|\s-\s/i.test(tail) && numbers.length >= 2) {
      const from = Math.min(numbers[0], numbers[1]);
      const to = Math.max(numbers[0], numbers[1]);
      if (to - from <= 20) {
        expectedRangeLength = to - from + 1;
        allowedNumbers = Array.from({ length: expectedRangeLength }, (_, index) => String(from + index));
      }
    } else {
      allowedNumbers = [...new Set(numbers.map(String))];
    }
  } else {
    // Example: "Question No. 1 is compulsory. Answer any four questions
    // from the remaining five." Derive the remaining parent IDs only when
    // the explicit compulsory IDs and the stated remaining count reconcile.
    const remainingMatch = sourceText.match(
      /\b(?:attempt|answer)\s+any\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s+questions?\s+from\s+(?:the\s+)?remaining\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/i,
    );
    if (!remainingMatch) return null;

    allowedCount = parseAttemptCount(remainingMatch[1]);
    const statedRemainingCount = parseAttemptCount(remainingMatch[2]);
    const compulsoryMatches = Array.from(sourceText.matchAll(
      /\b(?:question\s*(?:no\.?\s*)?|q\.?\s*)(\d{1,2})\s*(?:is|shall\s+be)\s+compulsory\b/gi,
    ));
    const compulsoryNumbers = new Set(compulsoryMatches.map((match) => String(Number(match[1]))));
    allowedNumbers = available.filter((number) => !compulsoryNumbers.has(number));
    if (!compulsoryNumbers.size || allowedNumbers.length !== statedRemainingCount) return null;
  }

  allowedNumbers = [...new Set(allowedNumbers)]
    .filter((number) => available.includes(number))
    .sort((left, right) => Number(left) - Number(right));
  if (!Number.isInteger(allowedCount) || allowedCount < 1 ||
      allowedNumbers.length < 2 || allowedNumbers.some((number) => !available.includes(number)) ||
      (expectedRangeLength > 0 && allowedNumbers.length !== expectedRangeLength)) {
    return null;
  }
  if (directMatch) {
    const rawNumbers = (directMatch[2].match(/\d{1,2}/g) || []).map((value) => Number(value));
    if (rawNumbers.some((number) => !available.includes(String(number)))) return null;
  }
  if (allowedCount >= allowedNumbers.length) return null;

  const choiceRule = `Attempt any ${allowedCount} of ${allowedNumbers.map((number) => `Q${number}`).join(', ')}`;
  return { allowedCount, questionNumbers: allowedNumbers, choiceRule };
}

function buildGenericPaperStructure(options: {
  markingSchemeText?: string;
  questionPaperText?: string;
  suggestedAnswersText?: string;
  officialPaperMaxMarks?: number;
  materialType?: string;
}): AuthoritativePaperStructure {
  const combined = `${options.markingSchemeText || ''}\n${options.questionPaperText || ''}\n${options.suggestedAnswersText || ''}`;
  let subQuestions = extractSubQuestionsFromText(combined);

  // Preserve the existing PYQ/MTP fallback behaviour. Model Tests use the
  // same parser, but an unparseable independently authored source must not be
  // assigned fabricated Q1-Q6 identities or maximum marks.
  const isModelTest = String(options.materialType || '').trim().toUpperCase() === 'MODEL_TEST_PAPER';
  if (subQuestions.length === 0 && !isModelTest) {
    for (let i = 1; i <= 6; i++) {
      subQuestions.push({
        fullQuestionCode: `Q${i}`,
        questionNumber: `${i}`,
        maximumMarks: i === 1 ? 20 : 16,
        compulsory: i === 1,
        isMcq: false,
        section: 'A',
        division: 'B',
      });
    }
  }

  subQuestions = deduplicateQuestionList(subQuestions);

  const questionsMap = new Map<string, PaperStructureQuestion>();
  for (const sq of subQuestions) {
    const key = `Q${sq.questionNumber}`;
    if (!questionsMap.has(key)) {
      questionsMap.set(key, {
        questionNumber: sq.questionNumber,
        section: sq.section,
        division: sq.division || 'B',
        compulsory: sq.compulsory,
        maximumMarks: 0,
        subQuestions: [],
      });
    }
    const q = questionsMap.get(key)!;
    q.maximumMarks += sq.maximumMarks;
    q.subQuestions.push(sq);
  }

  // Check if any MCQs are in the suggested answers
  const parsedMcqs = extractOfficialMcqKeysFromSuggestedAnswers(options.suggestedAnswersText);
  const mcqs: PaperStructureSubQuestion[] = [];
  for (const [qNum, data] of parsedMcqs.entries()) {
    mcqs.push({
      fullQuestionCode: `MCQ${qNum}`,
      questionNumber: qNum,
      subQuestionNumber: 'MCQ',
      maximumMarks: 2,
      compulsory: true,
      isMcq: true,
      officialKey: data.officialKey,
      officialExplanation: data.explanation,
      sourceQuestionLabel: data.sourceQuestionLabel,
      topic: `Multiple Choice Question ${qNum}`,
      section: parseInt(qNum, 10) > 8 ? 'B' : 'A',
      division: 'A',
    });
  }

  const baseQuestions = Array.from(questionsMap.values());
  const attemptRule = extractOptionalAttemptSelectionRule(
    String(options.questionPaperText || ''),
    String(options.markingSchemeText || ''),
    baseQuestions.map((question) => question.questionNumber),
  );
  const optionalQuestionNumbers = new Set(attemptRule?.questionNumbers || []);
  const questions = attemptRule
    ? baseQuestions.map((question) => optionalQuestionNumbers.has(String(Number(question.questionNumber)))
      ? { ...question, compulsory: false, choiceRule: attemptRule.choiceRule }
      : question)
    : baseQuestions;

  return {
    paperTitle: 'Chartered Accountancy Examination',
    totalPaperMaxMarks: options.officialPaperMaxMarks || 100,
    questions,
    subQuestions,
    mcqs,
  };
}
