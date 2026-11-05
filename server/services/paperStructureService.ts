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

export interface ModelTestSourceInventoryDiagnostics {
  sourceType: 'MODEL_TEST_PAPER';
  questionPaperQuestionIds: string[];
  markingSchemeQuestionIds: string[];
  missingMarkQuestionIds: string[];
  missingMcqKeyQuestionIds: string[];
  markingSchemeOnlyQuestionIds: string[];
  /** Parent totals in the Marking Scheme must reconcile to QP-defined child maxima. */
  markingSchemeParentTotalMismatchQuestionIds: string[];
  /** Optional when question-wise Suggested Answer headings are extractable. */
  suggestedAnswerQuestionIds: string[];
  suggestedAnswerMissingQuestionIds: string[];
  suggestedAnswerOnlyQuestionIds: string[];
}

export interface AuthoritativePaperStructure {
  paperTitle: string;
  totalPaperMaxMarks: number; // 100 for CA exams
  questions: PaperStructureQuestion[];
  subQuestions: PaperStructureSubQuestion[];
  mcqs: PaperStructureSubQuestion[];
  sourceInventoryDiagnostics?: ModelTestSourceInventoryDiagnostics;
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
    materialType = '',
  } = options;

  // Model Tests are independently authored. Use their selected source documents
  // instead of the fixed ICAI Taxation Q1–Q8 paper template.
  if (String(materialType).trim().toUpperCase() === 'MODEL_TEST_PAPER') {
    return buildModelTestPaperStructure(options);
  }

  const textCombined = `${markingSchemeText}\n${questionPaperText}\n${suggestedAnswersText}`.toLowerCase();
  const isTaxationPaper =
    subjectName.toLowerCase().includes('tax') ||
    paper.toLowerCase().includes('tax') ||
    textCombined.includes('income tax law') ||
    textCombined.includes('goods and services tax') ||
    textCombined.includes('rudra') ||
    textCombined.includes('dharani');

  if (isTaxationPaper) {
    return buildTaxationPaperStructure(options);
  }

  // Generic algorithmic parser for other CA papers
  return buildGenericPaperStructure(options);
}

/**
 * Extracts verified MCQ answer keys, explanations, and statutory provisions
 * directly from the authoritative Suggested Answers text stored on the server.
 */
export function extractOfficialMcqKeysFromSuggestedAnswers(suggestedAnswersText?: string): Map<string, {
  officialKey: string;
  explanation: string;
  provision?: string;
}> {
  const result = new Map<string, { officialKey: string; explanation: string; provision?: string }>();
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

  // Regex 1: Explicit question indicators: "QUESTION 4(b) – 3 MARKS", "Q4(b) [3 Marks]", "Question 6(a)(2) - 3 Marks"
  const regex1 = /(?:QUESTION|Q\.?|Ans(?:wer)?\.?)\s*([0-9]+)(?:\s*\(([a-zA-Z0-9]+(?:\([a-zA-Z0-9]+\))?)\))?\s*(?:[-–—:]|\b|is|\.)\s*(?:(?:for|carrying)?\s*)?(?:\[|\()?([0-9]+(?:\.[0-9]+)?)\s*(?:Marks?|M)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = regex1.exec(text)) !== null) {
    const qNum = match[1];
    const subQ = match[2];
    const marks = parseFloat(match[3]);
    const rawCode = subQ ? `Q${qNum}(${subQ})` : `Q${qNum}`;
    const canon = toCanonicalQuestionId(rawCode);
    if (!seen.has(canon) && marks > 0) {
      seen.add(canon);
      const parsed = parseCanonicalQuestionIdentity(canon);
      subQuestions.push({
        fullQuestionCode: parsed.canonicalId,
        questionNumber: parsed.questionNumber,
        subQuestionNumber: parsed.subQuestion,
        maximumMarks: marks,
        compulsory: parsed.questionNumber === '1' || parsed.questionNumber === '5',
        isMcq: false,
        section: parseInt(parsed.questionNumber, 10) > 4 ? 'B' : 'A',
        division: 'B',
      });
    }
  }

  // Regex 2: Bracketed question indicators at line start: "4(b) - 3 Marks" or "6(a)(2) [3 Marks]"
  const regex2 = /(?:^|\n)\s*([0-9]+)\s*\(([a-zA-Z0-9]+(?:\([a-zA-Z0-9]+\))?)\)\s*[-–—:]?\s*(?:\[|\()?([0-9]+(?:\.[0-9]+)?)\s*(?:Marks?|M)\b/gi;
  while ((match = regex2.exec(text)) !== null) {
    const qNum = match[1];
    const subQ = match[2];
    const marks = parseFloat(match[3]);
    const rawCode = `Q${qNum}(${subQ})`;
    const canon = toCanonicalQuestionId(rawCode);
    if (!seen.has(canon) && marks > 0) {
      seen.add(canon);
      const parsed = parseCanonicalQuestionIdentity(canon);
      subQuestions.push({
        fullQuestionCode: parsed.canonicalId,
        questionNumber: parsed.questionNumber,
        subQuestionNumber: parsed.subQuestion,
        maximumMarks: marks,
        compulsory: parsed.questionNumber === '1' || parsed.questionNumber === '5',
        isMcq: false,
        section: parseInt(parsed.questionNumber, 10) > 4 ? 'B' : 'A',
        division: 'B',
      });
    }
  }

  // Regex 3: Contextual line-by-line scanning: captures "(a) Description [10 Marks]" under "QUESTION 1 – 20 MARKS"
  const lines = text.split('\n');
  let activeParentQNum: string | null = null;
  const parentHeaderRegex = /(?:QUESTION|Q\.?|Ans(?:wer)?\.?)\s*([0-9]+)\b(?!\s*\()/i;
  const childSubQRegex = /^\s*[\(\[]([a-zA-Z0-9]+(?:\([a-zA-Z0-9]+\))?)[\)\]]\s*.*?(?:\[|\()?([0-9]+(?:\.[0-9]+)?)\s*(?:Marks?|M)\b/i;

  for (const line of lines) {
    const pMatch = line.match(parentHeaderRegex);
    if (pMatch) {
      activeParentQNum = pMatch[1];
    }
    if (activeParentQNum) {
      const cMatch = line.match(childSubQRegex);
      if (cMatch) {
        const subQ = cMatch[1];
        const marks = parseFloat(cMatch[2]);
        const rawCode = `Q${activeParentQNum}(${subQ})`;
        const canon = toCanonicalQuestionId(rawCode);
        if (!seen.has(canon) && marks > 0) {
          seen.add(canon);
          const parsed = parseCanonicalQuestionIdentity(canon);
          subQuestions.push({
            fullQuestionCode: parsed.canonicalId,
            questionNumber: parsed.questionNumber,
            subQuestionNumber: parsed.subQuestion,
            maximumMarks: marks,
            compulsory: parsed.questionNumber === '1' || parsed.questionNumber === '5',
            isMcq: false,
            section: parseInt(parsed.questionNumber, 10) > 4 ? 'B' : 'A',
            division: 'B',
          });
        }
      }
    }
  }

  return deduplicateQuestionList(subQuestions);
}

/**
 * Builds a Model Test inventory from the exact selected source documents.
 * No generic six-question fallback is used: an unreadable structure must be
 * surfaced for review rather than silently mapping answers to invented IDs.
 */
interface ModelTestQuestionCandidate {
  fullQuestionCode: string;
  questionNumber: string;
  subQuestionNumber?: string;
  isMcq: boolean;
  /** Printed maximum from this exact source text, when explicitly present. */
  maximumMarks?: number;
}

function toModelTestCandidate(rawCode: string): ModelTestQuestionCandidate | null {
  const parsed = parseCanonicalQuestionIdentity(String(rawCode || '').trim());
  if (!parsed.questionNumber) return null;
  return {
    fullQuestionCode: parsed.canonicalId,
    questionNumber: parsed.questionNumber,
    subQuestionNumber: parsed.subQuestion,
    isMcq: parsed.isMcq,
  };
}

function parseModelTestQuestionHeading(line: string): ModelTestQuestionCandidate | null {
  const match = String(line || '').match(
    /^\s*(?:QUESTION(?:\s+(?:NO\.?|NUMBER)[:#]?)?|Q\.?|QUES(?:TION)?\.?)\s*(?:NO\.?[:#]?\s*)?(\d{1,2})\s*((?:\([a-z0-9]+(?:\([a-z0-9]+\))?\)\s*){0,2})/i
  );
  if (!match) return null;
  const suffix = String(match[2] || '').replace(/\s+/g, '');
  const rawCode = 'Q' + match[1] + suffix;
  return toModelTestCandidate(rawCode);
}

function parseModelTestBareQuestionHeading(line: string): ModelTestQuestionCandidate | null {
  const match = String(line || '').match(/^\s*(\d{1,2})\s*[.)]\s+\S.{3,}/);
  return match ? toModelTestCandidate('Q' + match[1]) : null;
}

function parseModelTestBareSubQuestionHeading(line: string): ModelTestQuestionCandidate | null {
  const value = String(line || '');
  // ICAI-style source text commonly starts a leaf as "1. (a) ...".
  // Also accept compact "1(a) ..." and "1 (a) ..." forms.
  const match = value.match(/^\s{0,3}(\d{1,2})\s*[.)]\s*((?:\([a-z0-9]+(?:\([a-z0-9]+\))?\)\s*){1,2})/i)
    || value.match(/^\s{0,3}(\d{1,2})\s*((?:\([a-z0-9]+(?:\([a-z0-9]+\))?\)\s*){1,2})/i);
  if (!match) return null;
  const suffix = String(match[2] || '').replace(/\s+/g, '');
  return toModelTestCandidate('Q' + match[1] + suffix);
}

function normalizeModelTestSectionHeading(line: string): string {
  let value = String(line || '').trim();
  // A section title may end with its marks, e.g. "(20 Marks)", "[80 marks]"
  // or "- Total: 40 marks". Strip only this trailing metadata.
  value = value.replace(/\s*(?:[-–—:]?\s*)[\[(]?\s*(?:TOTAL\s*)?\d+(?:\.\d+)?\s*(?:MARKS?|M)\s*[\])]?\s*$/i, '');
  value = value.replace(/[()[\]]/g, ' ').replace(/[:\-–—]/g, ' ').replace(/\s+/g, ' ').trim();
  value = value.replace(/^(?:(?:SECTION|DIVISION|PART)\s+[A-Z0-9IVX]+\s+)/i, '');
  return value.trim();
}

function isModelTestMcqSectionHeading(line: string): boolean {
  const normalized = normalizeModelTestSectionHeading(line);
  // Strict full-line match: explanatory prose mentioning MCQs must not switch
  // the parser into objective mode.
  return /^(?:MULTIPLE\s+CHOICE(?:\s+QUESTIONS?)?|MCQS?|OBJECTIVE(?:\s+TYPE)?(?:\s+QUESTIONS?)?)(?:\s+(?:SECTION|PART)\s+[A-Z0-9IVX]+)?$/i.test(normalized);
}

function isModelTestDescriptiveSectionHeading(line: string): boolean {
  const normalized = normalizeModelTestSectionHeading(line);
  return /^(?:DESCRIPTIVE|SUBJECTIVE|LONG\s+ANSWER)(?:\s+QUESTIONS?)?(?:\s+(?:SECTION|PART)\s+[A-Z0-9IVX]+)?$/i.test(normalized);
}

function extractModelTestQuestionPaperInventory(questionPaperText?: string): ModelTestQuestionCandidate[] {
  const lines = String(questionPaperText || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    .split('\n');
  const candidates = new Map<string, ModelTestQuestionCandidate>();
  let activeParent = '';
  let activeSubQuestion = '';
  let lastQuestionHeadingNumber = 0;
  let insideMcqSection = false;
  let activeMarkCandidateId = '';

  const recordMarks = (line: string) => {
    if (!activeMarkCandidateId) return;
    const marks = findExplicitModelTestMarks(line, true);
    if (!marks || marks <= 0) return;
    const existing = candidates.get(activeMarkCandidateId);
    if (existing && existing.maximumMarks === undefined) {
      candidates.set(activeMarkCandidateId, { ...existing, maximumMarks: marks });
    }
  };

  const add = (candidate: ModelTestQuestionCandidate | null, sourceLine = '') => {
    if (!candidate) return;
    const key = candidate.fullQuestionCode.toLowerCase();
    const previous = candidates.get(key);
    const merged = {
      ...candidate,
      maximumMarks: previous?.maximumMarks ?? candidate.maximumMarks,
    };
    candidates.set(key, merged);
    activeMarkCandidateId = key;
    if (!candidate.isMcq) {
      const parsed = parseCanonicalQuestionIdentity(candidate.fullQuestionCode);
      activeParent = parsed.parentQuestionId;
      activeSubQuestion = parsed.subQuestion ? candidate.fullQuestionCode : '';
    } else {
      activeParent = '';
      activeSubQuestion = '';
    }
    recordMarks(sourceLine);
  };

  for (const line of lines) {
    if (isModelTestMcqSectionHeading(line)) {
      insideMcqSection = true;
      activeParent = '';
      activeSubQuestion = '';
      activeMarkCandidateId = '';
      lastQuestionHeadingNumber = 0;
      continue;
    }
    if (isModelTestDescriptiveSectionHeading(line)) {
      insideMcqSection = false;
      activeParent = '';
      activeSubQuestion = '';
      activeMarkCandidateId = '';
      lastQuestionHeadingNumber = 0;
    }

    const explicit = parseModelTestQuestionHeading(line);
    if (explicit) {
      lastQuestionHeadingNumber = Number(explicit.questionNumber);
      add(insideMcqSection && !explicit.subQuestionNumber
        ? toModelTestCandidate('MCQ' + explicit.questionNumber)
        : explicit, line);
      continue;
    }

    const mcqHeading = line.match(/^\s*MCQ\s*(\d{1,2})\b/i);
    const objectiveHeading = insideMcqSection
      ? line.match(/^\s*OBJECTIVE\s*(\d{1,2})\b/i)
      : null;
    if (mcqHeading || objectiveHeading) {
      add(toModelTestCandidate('MCQ' + (mcqHeading || objectiveHeading)![1]), line);
      continue;
    }

    // Some PDF text extractors place the MCQ number alone on its own line
    // and put the question stem on the following line. Accept only a
    // sequential standalone number while already inside an objective section.
    const standaloneObjectiveNumber = insideMcqSection
      ? line.match(/^\s*(?:(?:QUESTION|MCQ)\s*)?(\d{1,2})\s*[.)]?\s*$/i)
      : null;
    if (standaloneObjectiveNumber) {
      const number = Number(standaloneObjectiveNumber[1]);
      if (number >= 1 && number <= 30 && (number === 1 || number === lastQuestionHeadingNumber + 1)) {
        lastQuestionHeadingNumber = number;
        add(toModelTestCandidate('MCQ' + number), line);
        continue;
      }
    }

    // Do not mistake deeply-indented financial-statement/table rows for
    // question subparts. Real part labels in these source PDFs are at the
    // question margin (normally 0–8 spaces); table columns are further in.
    const leadingSpaces = (line.match(/^ */) || [''])[0].length;
    const bareSubQuestion = leadingSpaces <= 8 ? parseModelTestBareSubQuestionHeading(line) : null;
    if (bareSubQuestion) {
      lastQuestionHeadingNumber = Number(bareSubQuestion.questionNumber);
      add(bareSubQuestion, line);
      continue;
    }

    const bare = leadingSpaces <= 3 ? parseModelTestBareQuestionHeading(line) : null;
    if (bare) {
      const number = Number(bare.questionNumber);
      if (number === 1 || number === lastQuestionHeadingNumber + 1) {
        lastQuestionHeadingNumber = number;
        add(insideMcqSection ? toModelTestCandidate('MCQ' + bare.questionNumber) : bare, line);
        continue;
      }
    }

    if (activeParent) {
      const nestedNumeric = line.match(/^[ ]{0,8}\((\d{1,2})\)\s+\S.{1,}/);
      if (nestedNumeric && activeSubQuestion) {
        add(toModelTestCandidate(activeSubQuestion + '(' + nestedNumeric[1] + ')'), line);
        continue;
      }

      const child = line.match(/^[ ]{0,8}(?:\(([a-z])\)|([a-z])\s*[).])\s+\S.{1,}/i);
      if (child) {
        const part = String(child[1] || child[2] || '').toLowerCase();
        if (!(activeSubQuestion && /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i.test(part))) {
          add(toModelTestCandidate(activeParent + '(' + part + ')'), line);
          continue;
        }
      }
    }

    // Maximum marks can be printed at the end of a multi-line question part.
    // They stay attached only to the most recently opened source question ID.
    recordMarks(line);
  }

  const all = Array.from(candidates.values());
  const parentIdsWithChildren = new Set(
    all.filter((candidate) => candidate.subQuestionNumber).map((candidate) => ('Q' + candidate.questionNumber).toLowerCase())
  );
  return all
    .filter((candidate) => candidate.subQuestionNumber || !parentIdsWithChildren.has(candidate.fullQuestionCode.toLowerCase()))
    .sort((left, right) => {
      const qOrder = Number(left.questionNumber) - Number(right.questionNumber);
      if (qOrder) return qOrder;
      return String(left.subQuestionNumber || '').localeCompare(String(right.subQuestionNumber || ''), undefined, { numeric: true });
    });
}

/** Return the descriptive-answer portion of the selected source document. */
function extractModelTestDescriptiveSectionText(
  sourceText?: string,
  sourceKind: 'question-paper' | 'suggested-answers' = 'question-paper',
): string {
  const lines = String(sourceText || '').replace(/\r\n?/g, '\n').split('\n');
  const startIndex = lines.findIndex((line) => sourceKind === 'question-paper'
    ? /^\s*(?:(?:PART|SECTION|DIVISION)\s+(?:II|2|B)\b.*DESCRIPTIVE|DESCRIPTIVE\s+QUESTIONS?)/i.test(line)
    : /^\s*(?:DIVISION\s+B|PART\s+II\b|DESCRIPTIVE\s+(?:ANSWERS?|SOLUTIONS?|QUESTIONS?))/i.test(line));
  return startIndex >= 0 ? lines.slice(startIndex + 1).join('\n') : String(sourceText || '');
}

/** Parse Part I's numbered case-scenario MCQs without treating options as subparts. */
function extractModelTestObjectiveQuestionPaperInventory(questionPaperText?: string): ModelTestQuestionCandidate[] {
  const lines = String(questionPaperText || '').replace(/\r\n?/g, '\n').split('\n');
  const result = new Map<string, ModelTestQuestionCandidate>();
  let inObjectivePart = false;
  let activeRootNumber: number | null = null;
  let activeRootHasRomanChildren = false;
  let lastRootNumber = 0;
  let mcqNumber = 0;

  const addMcq = () => {
    mcqNumber += 1;
    const candidate = toModelTestCandidate('MCQ' + mcqNumber);
    if (candidate) result.set(candidate.fullQuestionCode.toLowerCase(), candidate);
  };
  const flushRoot = () => {
    if (activeRootNumber !== null && !activeRootHasRomanChildren) addMcq();
    activeRootNumber = null;
    activeRootHasRomanChildren = false;
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (!inObjectivePart && /(?:PART|SECTION|DIVISION)\s+(?:I|1|A)\b[^\n]*(?:MCQ|MULTIPLE\s+CHOICE)/i.test(line)) {
      inObjectivePart = true;
      continue;
    }
    if (inObjectivePart && /^\s*(?:(?:PART|SECTION|DIVISION)\s+(?:II|2|B)\b|DESCRIPTIVE\s+QUESTIONS?)/i.test(line)) {
      flushRoot();
      break;
    }
    if (!inObjectivePart && /(?:CASE\s+SCENARIO\s+BASED\s+MCQS?|MULTIPLE\s+CHOICE\s+QUESTIONS?)/i.test(line)) {
      inObjectivePart = true;
      continue;
    }
    if (!inObjectivePart) continue;

    const root = line.match(/^\s{0,3}(?:(?:QUESTION|Q)\s*(?:NO\.?\s*)?)?(\d{1,2})\s*[.)\-:]\s+\S.{2,}/i);
    if (root) {
      const number = Number(root[1]);
      if (number >= 1 && number <= 30 && (number === 1 || number === lastRootNumber + 1)) {
        flushRoot();
        activeRootNumber = number;
        lastRootNumber = number;
        continue;
      }
    }

    // A case-scenario stem may itself contain roman-numbered facts (i., ii.).
    // Count a roman label as an MCQ only when that label owns a complete
    // (a)-(d) option block before the next roman question or numbered root.
    const romanPart = line.match(/^[ ]{0,24}\(?\s*(i|ii|iii|iv|v|vi|vii|viii|ix|x)\s*\)?[.)]\s+\S/i);
    if (romanPart && activeRootNumber !== null) {
      const optionLetters = new Set<string>();
      for (let lookAhead = lineIndex + 1; lookAhead < lines.length; lookAhead++) {
        const nextLine = lines[lookAhead];
        if (/^[ ]{0,24}\(?\s*(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\s*\)?[.)]\s+\S/i.test(nextLine)) break;
        if (/^\s{0,3}(?:(?:QUESTION|Q)\s*(?:NO\.?\s*)?)?\d{1,2}\s*[.)\-:]\s+\S.{2,}/i.test(nextLine)) break;
        const option = nextLine.match(/^[ ]{0,28}\(([a-d])\)\s+\S/i);
        if (option) optionLetters.add(option[1].toLowerCase());
        if (['a', 'b', 'c', 'd'].every((letter) => optionLetters.has(letter))) break;
      }

      if (['a', 'b', 'c', 'd'].every((letter) => optionLetters.has(letter))) {
        activeRootHasRomanChildren = true;
        addMcq();
      }
    }
  }

  if (inObjectivePart) flushRoot();
  return Array.from(result.values());
}

function findExplicitModelTestMarks(line: string, allowBareBracket = false): number | undefined {
  const value = String(line || '');
  const unitMatches = Array.from(value.matchAll(/(\d+(?:\.\d+)?)\s*(?:MARKS?|M)\b/gi));
  if (unitMatches.length > 1 && !/\b(?:TOTAL|MAX(?:IMUM)?(?:\s+MARKS?)?)\b/i.test(value)) {
    // Multiple component marks on a single rubric line are not a total unless
    // the source explicitly labels the total/maximum.
    return undefined;
  }
  if (unitMatches.length > 0) {
    const parsed = Number(unitMatches[unitMatches.length - 1][1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  const totalMatch = value.match(/\b(?:TOTAL|MAX(?:IMUM)?(?:\s+MARKS?)?)\s*[:=]\s*(\d+(?:\.\d+)?)/i);
  if (totalMatch) {
    const parsed = Number(totalMatch[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  if (allowBareBracket) {
    const bracketMatch = value.match(/(?:\[|\()\s*(\d+(?:\.\d+)?)\s*(?:MARKS?|M)?\s*(?:\]|\))\s*$/i)
      || value.match(/[-–—:|]\s*(\d+(?:\.\d+)?)\s*$/)
      || value.match(/(?:\t+| {2,})(\d+(?:\.\d+)?)\s*$/);
    if (bracketMatch) {
      const parsed = Number(bracketMatch[1]);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }
  }
  return undefined;
}

function extractModelTestMarkComponents(line: string): number[] {
  const value = String(line || '').trim();
  if (!value) return [];
  // Ranges, alternatives and "x out of y" are not safely additive components.
  if (/\d+(?:\.\d+)?\s*(?:-|–|—|TO|OR|OUT\s+OF)\s*\d+(?:\.\d+)?\s*(?:MARKS?|M)\b/i.test(value)) {
    return [];
  }
  if (/\b(?:TOTAL|MAX(?:IMUM)?(?:\s+MARKS?)?)\b/i.test(value)) return [];

  const matches = Array.from(value.matchAll(/(\d+(?:\.\d+)?)\s*(?:MARKS?|M)\b/gi));
  const values = matches.map((match) => Number(match[1]));
  if (values.length === 0 || values.some((mark) => !Number.isFinite(mark) || mark <= 0)) return [];
  return values;
}

function splitModelTestMarkingSchemeCells(line: string): string[] {
  const value = String(line || '').trim();
  if (!value) return [];
  if (value.includes('|')) return value.split('|').map((cell) => cell.trim());
  if (value.includes('\t')) return value.split(/\t+/).map((cell) => cell.trim());
  // PDF-to-TXT extractors often preserve table columns as multiple spaces.
  if (/\S\s{2,}\S/.test(value)) return value.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
  return [];
}

function parseModelTestMarkingSchemeIdentityCell(
  value: string,
  activeParent: string,
): ModelTestQuestionCandidate | null {
  const cell = String(value || '').trim();
  if (!cell) return null;
  const explicit = parseModelTestQuestionHeading(cell);
  if (explicit) return explicit;
  const mcq = cell.match(/^MCQ\s*(\d{1,2})$/i);
  if (mcq) return toModelTestCandidate('MCQ' + mcq[1]);
  const bareSubQuestion = parseModelTestBareSubQuestionHeading(cell);
  if (bareSubQuestion) return bareSubQuestion;
  const bareParent = cell.match(/^(?:Q\.?\s*)?(\d{1,2})$/i);
  if (bareParent) return toModelTestCandidate('Q' + bareParent[1]);
  const child = cell.match(/^\(([a-z])\)$/i);
  if (child && activeParent) return toModelTestCandidate(activeParent + '(' + child[1].toLowerCase() + ')');
  return null;
}

function extractModelTestMarkingSchemeAllocations(markingSchemeText?: string): Map<string, ModelTestQuestionCandidate & { maximumMarks: number }> {
  const allocations = new Map<string, ModelTestQuestionCandidate & { maximumMarks: number }>();
  const lines = String(markingSchemeText || '').replace(/\r\n?/g, '\n').split('\n');
  // Use line-anchored identities rather than broad in-text matches, so a
  // narrative reference to another question cannot create an authoritative mark node.

  let activeParent = '';
  let activeLeaf = '';
  let pendingIdentity = '';
  let pendingDirectMarks: number | undefined;
  let pendingComponentMarks = 0;
  let pendingComponentCount = 0;
  let lastQuestionHeadingNumber = 0;
  let insideMcqSection = false;
  let tableQuestionColumn = -1;
  let tableMarksColumn = -1;

  const record = (candidate: ModelTestQuestionCandidate | null, marks: number | undefined) => {
    if (!candidate || !marks || marks <= 0) return;
    const key = candidate.fullQuestionCode.toLowerCase();
    if (!allocations.has(key)) allocations.set(key, { ...candidate, maximumMarks: marks });
  };

  const finalizePending = () => {
    if (!pendingIdentity) return;
    const candidate = toModelTestCandidate(pendingIdentity);
    // An explicit question/sub-question total takes precedence over summed
    // rubric components. Components are used only when no explicit total exists.
    const marks = pendingDirectMarks !== undefined
      ? pendingDirectMarks
      : pendingComponentCount > 0
        ? Number(pendingComponentMarks.toFixed(2))
        : undefined;
    record(candidate, marks);
    pendingIdentity = '';
    pendingDirectMarks = undefined;
    pendingComponentMarks = 0;
    pendingComponentCount = 0;
  };

  const beginPending = (candidate: ModelTestQuestionCandidate | null, sourceLine: string) => {
    finalizePending();
    if (!candidate) return;
    pendingIdentity = candidate.fullQuestionCode;
    const isInlineScoringComponent = /\d+(?:\.\d+)?\s*(?:MARKS?|M)\s+(?:FOR|EACH|PER|ON|WHEN|IF)\b/i.test(sourceLine);
    pendingDirectMarks = isInlineScoringComponent
      ? undefined
      : findExplicitModelTestMarks(sourceLine, true);
    if (pendingDirectMarks === undefined) {
      const components = extractModelTestMarkComponents(sourceLine);
      if (components.length > 0) {
        pendingComponentMarks = components.reduce((sum, mark) => sum + mark, 0);
        pendingComponentCount = components.length;
      }
    }
  };

  for (const line of lines) {
    const cells = splitModelTestMarkingSchemeCells(line);
    if (cells.length >= 2) {
      const normalizedCells = cells.map((cell) => cell.toLowerCase().replace(/[^a-z]/g, ' ').replace(/\s+/g, ' ').trim());
      const questionHeaderIndex = normalizedCells.findIndex((cell) => /^(?:question|question id|question code|question no|question number|ques|q no|no|part|sub question|subpart|item)$/.test(cell));
      const marksHeaderIndex = normalizedCells.findIndex((cell) => /\b(?:maximum marks?|max marks?|marks?|mark allocation|marks allocated|total marks?)\b/.test(cell));
      if (questionHeaderIndex >= 0 && marksHeaderIndex >= 0 && questionHeaderIndex !== marksHeaderIndex) {
        finalizePending();
        tableQuestionColumn = questionHeaderIndex;
        tableMarksColumn = marksHeaderIndex;
        continue;
      }

      if (tableQuestionColumn >= 0 && tableMarksColumn >= 0 &&
          cells[tableQuestionColumn] !== undefined && cells[tableMarksColumn] !== undefined) {
        const identityCell = cells[tableQuestionColumn];
        const markCell = cells[tableMarksColumn];
        const rowCandidate = parseModelTestMarkingSchemeIdentityCell(identityCell, activeParent);
        const markValueMatch = markCell.match(/^\s*[\[(]?\s*(\d+(?:\.\d+)?)\s*(?:MARKS?|M)?\s*[\])]?\s*$/i)
          || markCell.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
        if (rowCandidate && markValueMatch) {
          finalizePending();
          const rowMarks = Number(markValueMatch[1]);
          if (rowMarks > 0) record(rowCandidate, rowMarks);
          const parsedRow = parseCanonicalQuestionIdentity(rowCandidate.fullQuestionCode);
          activeParent = parsedRow.isMcq ? '' : parsedRow.parentQuestionId;
          activeLeaf = parsedRow.subQuestion ? rowCandidate.fullQuestionCode : '';
          continue;
        }
        if (!identityCell && markValueMatch && pendingIdentity && pendingDirectMarks === undefined) {
          const rowMarks = Number(markValueMatch[1]);
          if (rowMarks > 0) {
            pendingComponentMarks += rowMarks;
            pendingComponentCount += 1;
            continue;
          }
        }
      }
    }

    if (isModelTestMcqSectionHeading(line)) {
      finalizePending();
      insideMcqSection = true;
      activeParent = '';
      activeLeaf = '';
      lastQuestionHeadingNumber = 0;
      continue;
    }
    if (isModelTestDescriptiveSectionHeading(line)) {
      finalizePending();
      insideMcqSection = false;
      activeParent = '';
      activeLeaf = '';
      lastQuestionHeadingNumber = 0;
    }

    const explicit = parseModelTestQuestionHeading(line);
    if (explicit) {
      lastQuestionHeadingNumber = Number(explicit.questionNumber);
      const candidate = insideMcqSection && !explicit.subQuestionNumber
        ? toModelTestCandidate('MCQ' + explicit.questionNumber)
        : explicit;
      const parsed = parseCanonicalQuestionIdentity(candidate?.fullQuestionCode || explicit.fullQuestionCode);
      activeParent = parsed.isMcq ? '' : parsed.parentQuestionId;
      activeLeaf = candidate?.subQuestionNumber ? candidate.fullQuestionCode : '';
      beginPending(candidate, line);
      continue;
    }

    const mcq = line.match(/^\s*MCQ\s*(\d{1,2})\b/i);
    const objective = insideMcqSection ? line.match(/^\s*OBJECTIVE\s*(\d{1,2})\b/i) : null;
    if (mcq || objective) {
      const candidate = toModelTestCandidate('MCQ' + (mcq || objective)![1]);
      activeParent = '';
      activeLeaf = candidate?.fullQuestionCode || '';
      beginPending(candidate, line);
      continue;
    }

    const bareSubQuestion = parseModelTestBareSubQuestionHeading(line);
    if (bareSubQuestion) {
      const parsed = parseCanonicalQuestionIdentity(bareSubQuestion.fullQuestionCode);
      activeParent = parsed.parentQuestionId;
      activeLeaf = bareSubQuestion.fullQuestionCode;
      beginPending(bareSubQuestion, line);
      continue;
    }

    const bare = parseModelTestBareQuestionHeading(line);
    if (bare) {
      const number = Number(bare.questionNumber);
      if (number === 1 || number === lastQuestionHeadingNumber + 1) {
        lastQuestionHeadingNumber = number;
        const candidate = insideMcqSection
          ? toModelTestCandidate('MCQ' + bare.questionNumber)
          : bare;
        const parsed = parseCanonicalQuestionIdentity(candidate?.fullQuestionCode || bare.fullQuestionCode);
        activeParent = parsed.isMcq ? '' : parsed.parentQuestionId;
        activeLeaf = candidate?.subQuestionNumber ? candidate.fullQuestionCode : '';
        beginPending(candidate, line);
        continue;
      }
    }

    if (activeParent) {
      // Accept both "(a) ..." and a label-only "(a)" line; the following
      // explicit rubric rows then belong to that sub-question until the next ID.
      const child = line.match(/^\s*(?:\(([a-z])\)|([a-z])\s*[).])(?:\s+.*)?$/i);
      if (child) {
        const part = String(child[1] || child[2] || '').toLowerCase();
        if (!(activeLeaf && /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i.test(part))) {
          const candidate = toModelTestCandidate(activeParent + '(' + part + ')');
          if (candidate) {
            activeLeaf = candidate.fullQuestionCode;
            beginPending(candidate, line);
            continue;
          }
        }
      }

      const nested = line.match(/^\s*\((\d{1,2})\)(?:\s+.*)?$/);
      if (nested && activeLeaf) {
        const candidate = toModelTestCandidate(activeLeaf + '(' + nested[1] + ')');
        if (candidate) {
          activeLeaf = candidate.fullQuestionCode;
          beginPending(candidate, line);
          continue;
        }
      }
    }

    if (pendingIdentity) {
      const compact = line.trim();
      if (!compact) continue;

      // "Total: 4", "Maximum marks = 4", "Total 4 marks" or a standalone
      // "4 Marks" are treated as an explicit total for the active question.
      const standaloneTotal = compact.match(/^(?:(?:TOTAL|MAX(?:IMUM)?(?:\s+MARKS?)?|MARKS?)\s*[:=]?\s*)(\d+(?:\.\d+)?)\s*(?:MARKS?|M)?\.?$/i)
        || compact.match(/^(\d+(?:\.\d+)?)\s*(?:MARKS?|M)\.?$/i);
      const labelledTotal = /\b(?:TOTAL|MAX(?:IMUM)?(?:\s+MARKS?)?)\b/i.test(compact)
        ? findExplicitModelTestMarks(compact, false)
        : undefined;
      const explicitTotal = standaloneTotal ? Number(standaloneTotal[1]) : labelledTotal;
      if (explicitTotal && explicitTotal > 0) {
        pendingDirectMarks = explicitTotal;
        pendingComponentMarks = 0;
        pendingComponentCount = 0;
        continue;
      }

      if (pendingDirectMarks === undefined) {
        const components = extractModelTestMarkComponents(compact);
        if (components.length > 0) {
          pendingComponentMarks += components.reduce((sum, mark) => sum + mark, 0);
          pendingComponentCount += components.length;
        }
      }
    }
  }

  finalizePending();
  return allocations;
}

function extractModelTestMcqMarkValue(
  questionPaperText?: string,
  markingSchemeText?: string,
): number | undefined {
  const paperText = String(questionPaperText || '');
  const schemeText = String(markingSchemeText || '');
  const partTotalMatch = paperText.match(/PART\s+I\b[^\n]{0,120}?\(\s*(\d+(?:\.\d+)?)\s*MARKS?\s*\)/i);
  const totalMarks = partTotalMatch ? Number(partTotalMatch[1]) : undefined;
  const eachMatch = schemeText.match(/\bMCQs?\s+(?:ARE\s+)?MARKED\s+AT\s+(\d+(?:\.\d+)?)\s+MARKS?\s+EACH\b/i)
    || paperText.match(/\b\d+\s+MCQs?\s+OF\s+(\d+(?:\.\d+)?)\s+MARKS?\s+EACH\b/i);
  const eachMarks = eachMatch ? Number(eachMatch[1]) : undefined;
  if (!totalMarks || !eachMarks || totalMarks <= 0 || eachMarks <= 0) return undefined;
  return eachMarks;
}

function buildModelTestPaperStructure(options: {
  markingSchemeText?: string;
  questionPaperText?: string;
  suggestedAnswersText?: string;
  officialPaperMaxMarks?: number;
  level?: string;
}): AuthoritativePaperStructure {
  const questionPaperDescriptiveText = extractModelTestDescriptiveSectionText(options.questionPaperText, 'question-paper');
  const suggestedAnswersDescriptiveText = extractModelTestDescriptiveSectionText(options.suggestedAnswersText, 'suggested-answers');
  const qpDescriptiveCandidates = extractModelTestQuestionPaperInventory(questionPaperDescriptiveText);
  const qpMcqCandidates = extractModelTestObjectiveQuestionPaperInventory(options.questionPaperText);
  const qpCandidates = [...qpMcqCandidates, ...qpDescriptiveCandidates];
  const suggestedAnswerCandidates = extractModelTestQuestionPaperInventory(suggestedAnswersDescriptiveText);
  const markAllocations = extractModelTestMarkingSchemeAllocations(options.markingSchemeText);
  const parsedMcqKeys = extractOfficialMcqKeysFromSuggestedAnswers(options.suggestedAnswersText);
  const mcqMarkValue = extractModelTestMcqMarkValue(options.questionPaperText, options.markingSchemeText);

  // The selected Marking Scheme explicitly states the per-MCQ mark value.
  // Combine it with the Question Paper's Part I total and the QP-parsed
  // objective count; do not assign a mark when those source values disagree.
  const partOneTotalMatch = String(options.questionPaperText || '').match(/PART\s+I\b[^\n]{0,120}?\(\s*(\d+(?:\.\d+)?)\s*MARKS?\s*\)/i);
  const partOneTotal = partOneTotalMatch ? Number(partOneTotalMatch[1]) : undefined;
  const objectiveMarksReconcile = Boolean(
    mcqMarkValue &&
    partOneTotal &&
    qpMcqCandidates.length > 0 &&
    Math.abs(qpMcqCandidates.length * mcqMarkValue - partOneTotal) < 0.01
  );
  if (objectiveMarksReconcile) {
    for (const candidate of qpMcqCandidates) {
      const key = candidate.fullQuestionCode.toLowerCase();
      if (!markAllocations.has(key)) {
        markAllocations.set(key, { ...candidate, maximumMarks: mcqMarkValue! });
      }
    }
  }

  const qpMcqNumbers = new Set(qpCandidates.filter((candidate) => candidate.isMcq).map((candidate) => candidate.questionNumber));
  const qpDescriptiveNumbers = new Set(qpCandidates.filter((candidate) => !candidate.isMcq).map((candidate) => candidate.questionNumber));

  // A selected QP may label objective questions MCQ1..n while the selected MS
  // uses Question 1..n without repeating the objective section heading. Promote
  // Qn to MCQn only when the QP has MCQn, the selected SA has that exact official
  // key, and there is no separate descriptive Qn in the QP.
  for (const questionNumber of qpMcqNumbers) {
    const genericKey = ('q' + questionNumber).toLowerCase();
    const mcqKey = ('mcq' + questionNumber).toLowerCase();
    if (
      markAllocations.has(genericKey) &&
      !markAllocations.has(mcqKey) &&
      parsedMcqKeys.has(questionNumber) &&
      !qpDescriptiveNumbers.has(questionNumber)
    ) {
      const allocation = markAllocations.get(genericKey)!;
      markAllocations.delete(genericKey);
      markAllocations.set(mcqKey, {
        ...allocation,
        fullQuestionCode: 'MCQ' + questionNumber,
        questionNumber,
        subQuestionNumber: 'MCQ',
        isMcq: true,
      });
    }
  }

  const qpChildrenByParent = new Map<string, ModelTestQuestionCandidate[]>();
  for (const candidate of qpCandidates) {
    if (!candidate.isMcq && candidate.subQuestionNumber) {
      const key = candidate.questionNumber;
      qpChildrenByParent.set(key, [...(qpChildrenByParent.get(key) || []), candidate]);
    }
  }

  const msChildrenByParent = new Map<string, Array<ModelTestQuestionCandidate & { maximumMarks: number }>>();
  for (const allocation of markAllocations.values()) {
    if (!allocation.isMcq && allocation.subQuestionNumber) {
      const key = allocation.questionNumber;
      msChildrenByParent.set(key, [...(msChildrenByParent.get(key) || []), allocation]);
    }
  }

  const candidateMap = new Map<string, ModelTestQuestionCandidate>();
  for (const candidate of qpCandidates) {
    if (candidate.isMcq || candidate.subQuestionNumber) {
      candidateMap.set(candidate.fullQuestionCode.toLowerCase(), candidate);
      continue;
    }
    const qpChildren = qpChildrenByParent.get(candidate.questionNumber) || [];
    const msChildren = msChildrenByParent.get(candidate.questionNumber) || [];
    const children = qpChildren.length > 0 ? qpChildren : msChildren;
    if (children.length > 0) {
      for (const child of children) candidateMap.set(child.fullQuestionCode.toLowerCase(), child);
    } else {
      candidateMap.set(candidate.fullQuestionCode.toLowerCase(), candidate);
    }
  }

  const candidateIds = Array.from(candidateMap.values()).sort((left, right) => {
    const qOrder = Number(left.questionNumber) - Number(right.questionNumber);
    if (qOrder) return qOrder;
    return String(left.subQuestionNumber || '').localeCompare(String(right.subQuestionNumber || ''), undefined, { numeric: true });
  });

  const qpParentNumbers = new Set(qpCandidates
    .filter((candidate) => !candidate.isMcq)
    .map((candidate) => candidate.questionNumber));

  const markingSchemeLeafAllocations = Array.from(markAllocations.values()).filter((item) => {
    if (item.isMcq || item.subQuestionNumber) return true;
    // Parent totals are reconciled against QP child maxima below. The parent
    // is not an extra scorable leaf when the Question Paper defines subparts.
    if ((qpChildrenByParent.get(item.questionNumber) || []).length > 0) return false;
    return !Array.from(markAllocations.values()).some((candidate) =>
      candidate.questionNumber === item.questionNumber && Boolean(candidate.subQuestionNumber)
    );
  });

  const markingSchemeOnlyQuestionIds = markingSchemeLeafAllocations
    .filter((item) => {
      if (candidateMap.has(item.fullQuestionCode.toLowerCase())) return false;
      if (!item.isMcq && !item.subQuestionNumber && qpParentNumbers.has(item.questionNumber)) return false;
      return true;
    })
    .map((item) => item.fullQuestionCode)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // QP printed maxima are authoritative for descriptive leaves. The uploaded
  // Derived Evaluation Scheme says these maxima are taken from the QP where
  // printed; the MS parent totals are used to reconcile their sum, not to
  // invent a split among child parts.
  const hasAuthoritativeMaximum = (candidate: ModelTestQuestionCandidate) =>
    (Number(candidate.maximumMarks) > 0) ||
    (Number(markAllocations.get(candidate.fullQuestionCode.toLowerCase())?.maximumMarks) > 0);

  const hasMarkSchemeSupport = (candidate: ModelTestQuestionCandidate) => {
    const exactKey = candidate.fullQuestionCode.toLowerCase();
    const parentKey = ('q' + candidate.questionNumber).toLowerCase();
    return markAllocations.has(exactKey) || markAllocations.has(parentKey);
  };

  const missingMarkQuestionIds = candidateIds
    .filter((item) => !hasAuthoritativeMaximum(item) || !hasMarkSchemeSupport(item))
    .map((item) => item.fullQuestionCode);

  const markingSchemeParentTotalMismatchQuestionIds: string[] = [];
  const parentNumbers = new Set(candidateIds.filter((item) => !item.isMcq).map((item) => item.questionNumber));
  for (const questionNumber of parentNumbers) {
    const parentKey = ('q' + questionNumber).toLowerCase();
    const parentAllocation = markAllocations.get(parentKey);
    const children = candidateIds.filter((item) => !item.isMcq && item.questionNumber === questionNumber);
    if (!parentAllocation) {
      // Without a parent total, every leaf must have an explicit allocation
      // in the selected Marking Scheme itself.
      const allLeavesIndividuallyMarked = children.length > 0 && children.every((item) =>
        Number(markAllocations.get(item.fullQuestionCode.toLowerCase())?.maximumMarks) > 0
      );
      if (!allLeavesIndividuallyMarked) markingSchemeParentTotalMismatchQuestionIds.push('Q' + questionNumber);
      continue;
    }
    if (children.length === 0) continue;
    const allChildMarksPresent = children.every(hasAuthoritativeMaximum);
    const childTotal = children.reduce((sum, item) =>
      sum + Number(item.maximumMarks || markAllocations.get(item.fullQuestionCode.toLowerCase())?.maximumMarks || 0), 0);
    if (!allChildMarksPresent || Math.abs(childTotal - parentAllocation.maximumMarks) > 0.01) {
      markingSchemeParentTotalMismatchQuestionIds.push('Q' + questionNumber);
    }
  }

  const subQuestions: PaperStructureSubQuestion[] = candidateIds
    .filter((candidate) => !candidate.isMcq)
    .map((candidate) => ({
      fullQuestionCode: candidate.fullQuestionCode,
      questionNumber: candidate.questionNumber,
      subQuestionNumber: candidate.subQuestionNumber,
      maximumMarks: Number(candidate.maximumMarks || markAllocations.get(candidate.fullQuestionCode.toLowerCase())?.maximumMarks || 0),
      compulsory: false,
      isMcq: false,
      section: 'GENERAL',
      division: 'B',
    }));

  const questionsMap = new Map<string, PaperStructureQuestion>();
  for (const subQuestion of subQuestions) {
    const key = 'Q' + subQuestion.questionNumber;
    if (!questionsMap.has(key)) {
      questionsMap.set(key, {
        questionNumber: subQuestion.questionNumber,
        section: 'GENERAL',
        division: 'B',
        compulsory: false,
        maximumMarks: 0,
        subQuestions: [],
      });
    }
    const parent = questionsMap.get(key)!;
    parent.maximumMarks += subQuestion.maximumMarks;
    parent.subQuestions.push(subQuestion);
  }

  const mcqQuestionIds = candidateIds.filter((candidate) => candidate.isMcq);
  const mcqs: PaperStructureSubQuestion[] = mcqQuestionIds.map((candidate) => {
    const data = parsedMcqKeys.get(candidate.questionNumber);
    return {
      fullQuestionCode: 'MCQ' + candidate.questionNumber,
      questionNumber: candidate.questionNumber,
      subQuestionNumber: 'MCQ',
      maximumMarks: Number(markAllocations.get(('mcq' + candidate.questionNumber).toLowerCase())?.maximumMarks || (objectiveMarksReconcile ? mcqMarkValue : 0)),
      compulsory: false,
      isMcq: true,
      officialKey: data?.officialKey,
      officialExplanation: data?.explanation,
      provision: data?.provision,
      topic: 'Model Test Multiple Choice Question ' + candidate.questionNumber,
      section: 'GENERAL',
      division: 'A',
    };
  });
  const missingMcqKeyQuestionIds = mcqs
    .filter((question) => !question.officialKey || !['A', 'B', 'C', 'D'].includes(String(question.officialKey).toUpperCase()))
    .map((question) => question.fullQuestionCode);

  const markingSchemeQuestionIds = Array.from(markAllocations.values())
    .map((item) => item.fullQuestionCode)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const questionPaperQuestionIds = candidateIds.map((item) => item.fullQuestionCode);
  // Narrative-style ICAI Suggested Answers often use bare "1. (a)" labels
  // for answers and ordinary numbered table rows. Do not treat these as a
  // complete question-wise identity inventory unless the selected source
  // explicitly labels question headings (Question 1 / Q1). MCQ keys remain
  // independently reconciled from Division A in all cases.
  const suggestedAnswersHaveExplicitQuestionHeadings =
    /^\s*(?:QUESTION(?:\s+(?:NO\.?|NUMBER)[:#]?)?|Q\.?)\s*\d{1,2}\b/im.test(suggestedAnswersDescriptiveText);
  const reconciledSuggestedAnswerCandidates = suggestedAnswersHaveExplicitQuestionHeadings
    ? suggestedAnswerCandidates
    : [];
  const suggestedAnswerIds = new Set(reconciledSuggestedAnswerCandidates.map((item) => item.fullQuestionCode.toLowerCase()));
  for (const questionNumber of parsedMcqKeys.keys()) {
    suggestedAnswerIds.add(('mcq' + questionNumber).toLowerCase());
  }
  const suggestedAnswerQuestionIds = Array.from(suggestedAnswerIds)
    .map((id) => {
      const parsed = parseCanonicalQuestionIdentity(id);
      return parsed.canonicalId;
    })
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const qpIdSet = new Set(questionPaperQuestionIds.map((id) => id.toLowerCase()));
  const saIdSet = new Set(suggestedAnswerQuestionIds.map((id) => id.toLowerCase()));
  const suggestedAnswerDescriptiveIds = suggestedAnswerQuestionIds.filter((id) => !/^MCQ\d+$/i.test(id));
  const qpDescriptiveIds = questionPaperQuestionIds.filter((id) => !/^MCQ\d+$/i.test(id));
  const suggestedAnswerMissingQuestionIds = reconciledSuggestedAnswerCandidates.length > 0
    ? qpDescriptiveIds.filter((id) => !saIdSet.has(id.toLowerCase()))
    : [];
  const suggestedAnswerOnlyQuestionIds = reconciledSuggestedAnswerCandidates.length > 0
    ? suggestedAnswerDescriptiveIds.filter((id) => !qpIdSet.has(id.toLowerCase()))
    : [];

  const diagnostics = {
    sourceType: 'MODEL_TEST_PAPER' as const,
    questionPaperQuestionIds,
    suggestedAnswerQuestionIds,
    suggestedAnswerMissingQuestionIds,
    suggestedAnswerOnlyQuestionIds,
    markingSchemeQuestionIds,
    missingMarkQuestionIds,
    missingMcqKeyQuestionIds,
    markingSchemeOnlyQuestionIds,
    markingSchemeParentTotalMismatchQuestionIds,
  };

  return {
    paperTitle: ('CA ' + (options.level || '') + ' Model Test Paper').replace(/\s+/g, ' ').trim(),
    totalPaperMaxMarks: options.officialPaperMaxMarks || 100,
    questions: Array.from(questionsMap.values()),
    subQuestions,
    mcqs,
    sourceInventoryDiagnostics: diagnostics,
  };
}

/**
 * Generic Parser for arbitrary CA papers using pattern matching on the marking scheme
 */
function buildGenericPaperStructure(options: {
  markingSchemeText?: string;
  questionPaperText?: string;
  suggestedAnswersText?: string;
  officialPaperMaxMarks?: number;
}): AuthoritativePaperStructure {
  const combined = `${options.markingSchemeText || ''}\n${options.questionPaperText || ''}\n${options.suggestedAnswersText || ''}`;
  let subQuestions = extractSubQuestionsFromText(combined);

  // If no structured questions matched, fallback to standard CA 5-question pattern
  if (subQuestions.length === 0) {
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
      topic: `Multiple Choice Question ${qNum}`,
      section: parseInt(qNum, 10) > 8 ? 'B' : 'A',
      division: 'A',
    });
  }

  return {
    paperTitle: 'Chartered Accountancy Examination',
    totalPaperMaxMarks: options.officialPaperMaxMarks || 100,
    questions: Array.from(questionsMap.values()),
    subQuestions,
    mcqs,
  };
}
