/**
 * Canonical Question Identification, Deduplication, and Hierarchy Service
 *
 * Core Mandates:
 * 1. Stable Canonical Identity: Every question/sub-question has exactly ONE canonical identity:
 *    - canonicalId: e.g. 'Q3(b)', 'Q4(b)', 'Q1', 'MCQ1', 'Q6(a)(1)'
 *    - questionNumber: e.g. '3', '4', '1', '6'
 *    - subQuestion: e.g. 'b', 'a(1)'
 *    - parentQuestionId: e.g. 'Q3', 'Q4', 'Q1', 'Q6'
 * 2. Exactly-Once Rule: For every evaluation run:
 *    ONE canonical sub-question = ONE evaluation result = ONE marks allocation = ONE max-mark value = ONE rendered section.
 * 3. Parent / Child Separation: A parent question (e.g. Q3, Q4, Q5, Q6) must NEVER be evaluated as a separate
 *    descriptive answer when its content is divided into child sub-questions (e.g. Q3(a), Q3(b)).
 * 4. Authoritative Maximum Marks: Exact max marks from Question Paper structure (e.g. Q3(b) = 4, Q4(b) = 4).
 * 5. Structural Deduplication Validation: Verifies that occurrence count for every canonical ID is strictly 1.
 */

export interface CanonicalQuestionIdentity {
  canonicalId: string;       // e.g. 'Q3(b)', 'Q1(a)(ii)', 'Q6(a)(1)(A)'
  questionNumber: string;    // e.g. '3', '4', '1', '6'
  /** Complete sub-part path, e.g. 'a(ii)' for canonical ID Q1(a)(ii). */
  subQuestion?: string;
  /** Every numbering level, preserved independently and in order. */
  subQuestionPath?: string[];
  /** Immediate parent: Q1 for Q1(a), Q1(a) for Q1(a)(ii). */
  parentQuestionId: string;
  isMcq: boolean;
  isAlternative?: boolean;
  alternativeGroup?: string;
}

export interface AuthoritativeSubQuestionReference {
  fullQuestionCode: string;
  questionNumber: string;
  subQuestionNumber?: string;
  maximumMarks: number;
  isMcq?: boolean;
}

/**
 * Normalizes questionNumber and subQuestion into a stable, immutable canonical ID.
 * Examples:
 * - ('3', 'b') -> 'Q3(b)'
 * - ('4', 'B') -> 'Q4(b)'
 * - ('1', undefined) -> 'Q1'
 * - ('MCQ 1', undefined) -> 'MCQ1'
 * - ('6', 'a(1)') -> 'Q6(a)(1)'
 * - ('Question 3(b)', undefined) -> 'Q3(b)'
 * - ('Q3_b', undefined) -> 'Q3(b)'
 * - ('3(b) (OR)', undefined) -> 'Q3(b)'
 * - ('Q3(b)', 'b') -> 'Q3(b)' (prevents duplicate Q3(b)(b) concatenation!)
 * - ('Q4(b)', 'b') -> 'Q4(b)'
 */
function formatCanonicalQuestionId(questionNumber: string, path: string[] = []): string {
  return 'Q' + questionNumber + path.map((part) => '(' + part + ')').join('');
}

function serializeSubQuestionPath(path: string[]): string | undefined {
  if (!path.length) return undefined;
  return path[0] + path.slice(1).map((part) => '(' + part + ')').join('');
}

/**
 * Read every leading numbering token from a question suffix.
 * Supports expanded forms Q1(a)(ii)(1), compact forms Q1(a(ii)(1)),
 * bracket variants, and explicit Part/Sub-part labels. Roman numerals are
 * ordinary identifiers and are never collapsed into their parent.
 */
function parseLeadingSubQuestionPath(input: string): string[] {
  let rest = String(input || '').trim();
  const path: string[] = [];
  if (!rest) return path;

  const stripPartPrefix = () => {
    const prefix = rest.match(/^\s*(?:(?:SUB[- ]?PART|SUBQUESTION|SUB QUESTION|PART)\s*)+/i);
    if (!prefix) return false;
    rest = rest.slice(prefix[0].length);
    return true;
  };
  const skipWhitespace = () => {
    const match = rest.match(/^\s+/);
    if (match) rest = rest.slice(match[0].length);
  };

  const parseGroup = (): string[] => {
    const opening = rest[0];
    const closing = opening === '(' ? ')' : opening === '[' ? ']' : '}';
    if (!['(', '[', '{'].includes(opening)) return [];
    rest = rest.slice(1);
    skipWhitespace();
    const token = rest.match(/^[\p{L}\p{N}]+/u);
    if (!token) return [];
    const parts = [token[0].normalize('NFKC').toLowerCase()];
    rest = rest.slice(token[0].length);

    while (rest.length) {
      skipWhitespace();
      if (rest[0] === '(' || rest[0] === '[' || rest[0] === '{') {
        const nested = parseGroup();
        if (!nested.length) break;
        parts.push(...nested);
        continue;
      }
      if (rest[0] === closing) rest = rest.slice(1);
      break;
    }
    return parts;
  };

  let first = true;
  while (rest.length) {
    skipWhitespace();
    stripPartPrefix();
    skipWhitespace();
    if (!rest) break;

    if (['(', '[', '{'].includes(rest[0])) {
      const group = parseGroup();
      if (!group.length) break;
      path.push(...group);
      first = false;
      continue;
    }

    const direct = rest.match(/^[\p{L}\p{N}]+/u);
    if (!direct) break;
    const token = direct[0].normalize('NFKC').toLowerCase();
    const tail = rest.slice(direct[0].length);
    const hasBoundary = !tail || /^[\s).:\-–—/]/u.test(tail) || /^[([{]/u.test(tail);
    const hasExplicitPartPrefix = first && /^(?:SUB[- ]?PART|SUBQUESTION|SUB QUESTION|PART)\b/i.test(input.trim());
    // Do not mistake the first word of ordinary question text ("Calculate…")
    // for a part label. Direct labels are accepted only with a numbering
    // separator, a nested level, or a short standalone code.
    if ((!hasBoundary || token.length > 4) && !hasExplicitPartPrefix) break;
    path.push(token);
    rest = tail;
    first = false;
    if (rest[0] === ')' || rest[0] === ']' || rest[0] === '}') rest = rest.slice(1);
  }

  return path;
}

/**
 * Normalize a question plus optional sub-part into a stable hierarchical ID.
 * Matching is exact: a missing nested part is never silently downgraded to
 * its parent or to a similarly-prefixed sibling.
 */
export function toCanonicalQuestionId(
  questionNumberInput?: string | number | null,
  subQuestionInput?: string | null,
  paperStructureSubQuestions?: AuthoritativeSubQuestionReference[]
): string {
  const rawQ = String(questionNumberInput || '').trim();
  const rawSub = String(subQuestionInput || '').trim();
  const isMcq =
    /^(?:MCQ|OBJECTIVE)/i.test(rawQ) ||
    /MCQ/i.test(rawQ) ||
    rawSub.toUpperCase() === 'MCQ';
  if (isMcq) {
    const num = rawQ.replace(/[^0-9]/g, '') || rawSub.replace(/[^0-9]/g, '') || '1';
    return 'MCQ' + num;
  }

  const parsedQ = parseCanonicalQuestionIdentity(rawQ);
  if (parsedQ.isMcq) return parsedQ.canonicalId;
  let finalCanonId = parsedQ.canonicalId;

  if (rawSub) {
    const rawSubPath = parseLeadingSubQuestionPath(
      /^[([{]/.test(rawSub) ? rawSub : '(' + rawSub + ')'
    );
    const currentPath = parsedQ.subQuestionPath || [];
    const samePath = rawSubPath.length === currentPath.length &&
      rawSubPath.every((part, index) => part === currentPath[index]);

    if (!currentPath.length) {
      if (rawSubPath.length) finalCanonId = formatCanonicalQuestionId(parsedQ.questionNumber, rawSubPath);
    } else if (!samePath && rawSubPath.length) {
      const candidate = formatCanonicalQuestionId(parsedQ.questionNumber, currentPath.concat(rawSubPath));
      const exists = Array.isArray(paperStructureSubQuestions) &&
        paperStructureSubQuestions.some((item) => item.fullQuestionCode.toLowerCase() === candidate.toLowerCase());
      if (exists) finalCanonId = candidate;
    }
  }

  if (Array.isArray(paperStructureSubQuestions) && paperStructureSubQuestions.length > 0) {
    const exact = paperStructureSubQuestions.find(
      (item) => item.fullQuestionCode.toLowerCase() === finalCanonId.toLowerCase()
    );
    if (exact) return exact.fullQuestionCode;
  }
  return finalCanonId;
}

/**
 * Parses any arbitrary question string into a complete CanonicalQuestionIdentity.
 * Handles:
 * - Alternatives: "Q3(b) (OR)", "Q3(b) OR", "Q3(b) Alternative", "Q4(b) [Option 2]" -> canonicalId: "Q3(b)", isAlternative: true
 * - Separators: "Q3_b", "3.b", "3-b", "Question 3 Part (b)", "Question 3 Part B", "3b" -> "Q3(b)"
 * - Nested / Roman clause: "Q3(b(iiiiv))", "3(b)(iii)", "3(b)(1)", "b(b)" -> canonicalId: "Q3(b)", subQuestion: "b"
 * - MCQs: "MCQ 1", "MCQ1", "Objective 1" -> "MCQ1"
 */
export function parseCanonicalQuestionIdentity(rawCode: string): CanonicalQuestionIdentity {
  let trimmed = String(rawCode || '').trim();

  if (/^(?:MCQ|OBJECTIVE)/i.test(trimmed) || /MCQ/i.test(trimmed)) {
    const num = trimmed.replace(/[^0-9]/g, '') || '1';
    return {
      canonicalId: 'MCQ' + num,
      questionNumber: num,
      subQuestion: 'MCQ',
      subQuestionPath: ['MCQ'],
      parentQuestionId: 'MCQ' + num,
      isMcq: true,
      isAlternative: false,
    };
  }

  let isAlternative = false;
  const altPattern = /(?:[\(\[\{]\s*(?:OR|ALT|ALTERNATIVE|OPTION\s*[0-9]+|CHOICE\s*[0-9]+)\s*[\)\]\}]|\b(?:OR|ALT|ALTERNATIVE|OPTION\s*[0-9]+|CHOICE\s*[0-9]+)\b)/i;
  if (altPattern.test(trimmed)) {
    isAlternative = true;
    trimmed = trimmed.replace(/(?:[\(\[\{]\s*(?:OR|ALT|ALTERNATIVE|OPTION\s*[0-9]+|CHOICE\s*[0-9]+)\s*[\)\]\}]|\b(?:OR|ALT|ALTERNATIVE|OPTION\s*[0-9]+|CHOICE\s*[0-9]+)\b)/gi, ' ').trim();
  }

  const qMatch = trimmed.match(/^(?:Question\s*|Q\.?\s*|Ans\.?\s*|Answer\s*)?(\d+)\s*(.*)$/i);
  if (qMatch) {
    const questionNumber = qMatch[1];
    const rest = (qMatch[2] || '').trim().replace(/^[\s\-_.:/]+/, '');
    const path = parseLeadingSubQuestionPath(rest);
    return {
      canonicalId: formatCanonicalQuestionId(questionNumber, path),
      questionNumber,
      subQuestion: serializeSubQuestionPath(path),
      subQuestionPath: path,
      parentQuestionId: formatCanonicalQuestionId(questionNumber, path.slice(0, -1)),
      isMcq: false,
      isAlternative,
    };
  }

  const digits = trimmed.replace(/[^0-9]/g, '') || '1';
  return {
    canonicalId: 'Q' + digits,
    questionNumber: digits,
    subQuestion: undefined,
    subQuestionPath: [],
    parentQuestionId: 'Q' + digits,
    isMcq: false,
    isAlternative,
  };
}

/**
 * Generic deduplication engine for any list of questions in the evaluation pipeline.
 *
 * Rules strictly enforced:
 * 1. Canonical Key Normalization: Group strictly by canonicalId using toCanonicalQuestionId.
 * 2. Parent / Child Rule: If ANY child sub-question (e.g. Q3(b), Q4(a), Q5(a), Q6(a)(1)) exists,
 *    its parent question/container (e.g. Q3, Q4, Q5, Q6(a)) is completely removed.
 * 3. Exactly-Once Rule: If multiple records exist for the same canonicalId (including alternative branches),
 *    keeps exactly ONE authoritative evaluation (the one with actual candidate evidence / step components).
 * 4. Maximum Marks Authority: Authoritative official paper scheme takes precedence (e.g. Q3(b) = 4, Q4(b) = 4).
 * 5. MCQ Integrity: MCQ questionNumber is preserved as 'MCQ X' for seamless reporting and filtering.
 */
export function deduplicateQuestionList<T extends {
  questionNumber?: string;
  subQuestion?: string;
  subQuestionNumber?: string;
  questionId?: string;
  subQuestionId?: string;
  parentQuestionId?: string;
  canonicalId?: string;
  fullQuestionCode?: string;
  maximumMarks?: number;
  maxMarks?: number;
  marksAwarded?: number;
  marksLost?: number;
  markingComponents?: any[];
  pages?: number[] | any;
  studentSnippet?: string;
  detailedFeedback?: string;
  technicalEvaluation?: string;
  [key: string]: any;
}>(
  questions: T[],
  paperStructureSubQuestions?: AuthoritativeSubQuestionReference[]
): T[] {
  if (!Array.isArray(questions) || questions.length === 0) {
    return [];
  }

  // 1. Compute canonical identity for each item using authoritative paper structure
  const mapped = questions.map((item) => {
    const raw = item.canonicalId || item.fullQuestionCode || item.questionId;
    const canonId = toCanonicalQuestionId(
      raw || item.questionNumber,
      item.subQuestion || item.subQuestionNumber || item.subQuestionId,
      paperStructureSubQuestions
    );
    const parsed = parseCanonicalQuestionIdentity(canonId);
    return {
      item,
      canonicalId: parsed.canonicalId,
      questionNumber: parsed.questionNumber,
      subQuestion: parsed.subQuestion,
      parentQuestionId: parsed.parentQuestionId,
      isMcq: parsed.isMcq,
      isAlternative: parsed.isAlternative,
    };
  });

  // 2. Identify parent questions/containers that have child sub-questions
  // Collect all canonical IDs that exist among children
  const nonMcqCanonicalIds = new Set<string>();
  for (const m of mapped) {
    if (!m.isMcq) nonMcqCanonicalIds.add(m.canonicalId);
  }
  if (Array.isArray(paperStructureSubQuestions)) {
    for (const sq of paperStructureSubQuestions) {
      if (!sq.isMcq) {
        const sqCanon = toCanonicalQuestionId(sq.fullQuestionCode || sq.questionNumber, sq.subQuestionNumber, paperStructureSubQuestions);
        nonMcqCanonicalIds.add(sqCanon);
      }
    }
  }

  // A question C is a child of P if C starts with P + '(' (e.g. 'Q3(b)' is child of 'Q3', 'Q6(a)(1)' is child of 'Q6(a)')
  const parentContainerIds = new Set<string>();
  for (const childId of nonMcqCanonicalIds) {
    for (const potentialParentId of nonMcqCanonicalIds) {
      if (childId !== potentialParentId && childId.startsWith(`${potentialParentId}(`)) {
        parentContainerIds.add(potentialParentId);
      }
    }
  }
  // Also collect main questions where children exist
  for (const m of mapped) {
    if (!m.isMcq && m.subQuestion) {
      parentContainerIds.add(`Q${m.questionNumber}`);
    }
  }
  if (Array.isArray(paperStructureSubQuestions)) {
    for (const sq of paperStructureSubQuestions) {
      if (!sq.isMcq && sq.subQuestionNumber) {
        parentContainerIds.add(`Q${sq.questionNumber}`);
      }
    }
  }

  // 3. Filter out parent questions that have child sub-questions
  // If Q3(b) exists, drop generic 'Q3'; if Q6(a)(1) exists, drop generic 'Q6(a)'
  const nonParentDuplicates = mapped.filter((m) => {
    if (m.isMcq) return true;
    if (parentContainerIds.has(m.canonicalId)) {
      // Parent container must not be evaluated as a duplicate descriptive leaf answer
      return false;
    }
    return true;
  });

  // 4. Group by canonicalId to enforce Exactly-Once Rule
  const canonicalMap = new Map<string, typeof nonParentDuplicates[0]>();

  // Extract authoritative max marks map in advance
  const authoritativeMaxMap = new Map<string, number>();
  if (Array.isArray(paperStructureSubQuestions)) {
    for (const sq of paperStructureSubQuestions) {
      const canon = toCanonicalQuestionId(sq.fullQuestionCode || sq.questionNumber, sq.subQuestionNumber, paperStructureSubQuestions);
      authoritativeMaxMap.set(canon, sq.maximumMarks);
    }
  }

  for (const entry of nonParentDuplicates) {
    const key = entry.canonicalId;
    if (!canonicalMap.has(key)) {
      canonicalMap.set(key, entry);
    } else {
      // Conflict resolution: Merge evidence, components, and pages between duplicate records
      const existing = canonicalMap.get(key)!;
      const existingMax = (existing.item.maximumMarks !== undefined && existing.item.maximumMarks !== null && Number(existing.item.maximumMarks) > 0)
        ? Number(existing.item.maximumMarks)
        : (existing.item.maxMarks !== undefined && existing.item.maxMarks !== null && Number(existing.item.maxMarks) > 0)
        ? Number(existing.item.maxMarks)
        : undefined;
      const entryMax = (entry.item.maximumMarks !== undefined && entry.item.maximumMarks !== null && Number(entry.item.maximumMarks) > 0)
        ? Number(entry.item.maximumMarks)
        : (entry.item.maxMarks !== undefined && entry.item.maxMarks !== null && Number(entry.item.maxMarks) > 0)
        ? Number(entry.item.maxMarks)
        : undefined;
      const targetMax = authoritativeMaxMap.get(key) ?? existingMax ?? entryMax;

      // 4A. Merge pages
      const existingPages = Array.isArray(existing.item.pages) ? existing.item.pages : [];
      const entryPages = Array.isArray(entry.item.pages) ? entry.item.pages : [];
      if (entryPages.length > 0) {
        existing.item.pages = Array.from(new Set([...existingPages, ...entryPages])).sort((a: number, b: number) => a - b);
      }

      // 4B. Merge student snippets
      if (entry.item.studentSnippet && !existing.item.studentSnippet?.includes(entry.item.studentSnippet)) {
        existing.item.studentSnippet = (existing.item.studentSnippet ? `${existing.item.studentSnippet}\n\n` : '') + entry.item.studentSnippet;
      }

      // 4C. Merge marking components and steps
      const existingComps: any[] = existing.item.markingComponents || [];
      const newComps: any[] = entry.item.markingComponents || [];

      if (newComps.length > 0 || existingComps.length > 0) {
        const seenCompKeys = new Set(existingComps.map((c) => c.componentId || c.expectedRequirement));
        const combinedComps = [...existingComps];
        for (const nc of newComps) {
          const compKey = nc.componentId || nc.expectedRequirement;
          if (!seenCompKeys.has(compKey)) {
            seenCompKeys.add(compKey);
            combinedComps.push(nc);
          }
        }

        // Generic Pruning: If a component was flagged as "not attempted" / "omitted" because of chunking/page splits,
        // but another component in the combined pool actually evaluated candidate evidence for that subpart/clause,
        // prune the unattempted placeholder component.
        const attemptedClauses = new Set<string>();
        for (const c of combinedComps) {
          const isUnattempted = (c.marksAwarded === 0 || c.marksAwarded === undefined) &&
            /(?:not attempted|unattempted|not answered|omitted|no candidate step)/i.test(
              `${c.deductionReason || ''} ${c.studentEvidence || ''} ${c.annotationInstructions || ''}`
            );
          const clauseMatch = `${c.componentId || ''} ${c.expectedRequirement || ''}`.match(/(?:part[_\s]*|clause[_\s]*|\()([ivx]+|[0-9]+)(?:\)|\b|_)/i);
          if (clauseMatch && !isUnattempted) {
            attemptedClauses.add(clauseMatch[1].toLowerCase());
          }
        }

        const mergedComps = combinedComps.filter((c) => {
          const isUnattempted = (c.marksAwarded === 0 || c.marksAwarded === undefined) &&
            /(?:not attempted|unattempted|not answered|omitted|no candidate step)/i.test(
              `${c.deductionReason || ''} ${c.studentEvidence || ''} ${c.annotationInstructions || ''}`
            );
          if (!isUnattempted) return true;
          const clauseMatch = `${c.componentId || ''} ${c.expectedRequirement || ''}`.match(/(?:part[_\s]*|clause[_\s]*|\()([ivx]+|[0-9]+)(?:\)|\b|_)/i);
          if (clauseMatch && attemptedClauses.has(clauseMatch[1].toLowerCase())) {
            // Superseded placeholder
            return false;
          }
          return true;
        });

        existing.item.markingComponents = mergedComps;

        // Recalculate marks awarded based on merged unique components
        const sumAwarded = mergedComps.reduce((acc, c) => acc + (Number(c.marksAwarded) || 0), 0);
        const roundedSum = Math.round(sumAwarded * 4) / 4;
        existing.item.marksAwarded = targetMax === undefined ? roundedSum : Math.min(targetMax, roundedSum);
      } else {
        // If neither had components, combine marks awarded up to max marks
        const combinedMarks = (existing.item.marksAwarded || 0) + (entry.item.marksAwarded || 0);
        const roundedCombined = Math.round(combinedMarks * 4) / 4;
        existing.item.marksAwarded = targetMax === undefined ? roundedCombined : Math.min(targetMax, roundedCombined);
      }

      // 4D. Merge feedback
      if (entry.item.detailedFeedback && !existing.item.detailedFeedback?.includes(entry.item.detailedFeedback)) {
        existing.item.detailedFeedback = (existing.item.detailedFeedback ? `${existing.item.detailedFeedback}\n` : '') + entry.item.detailedFeedback;
      }
      if (entry.item.technicalEvaluation && !existing.item.technicalEvaluation?.includes(entry.item.technicalEvaluation)) {
        existing.item.technicalEvaluation = (existing.item.technicalEvaluation ? `${existing.item.technicalEvaluation}\n` : '') + entry.item.technicalEvaluation;
      }
    }
  }

  // 5. Authoritative Maximum Marks Alignment
  const result: T[] = [];
  for (const [canonicalId, entry] of canonicalMap.entries()) {
    const clonedItem: T = { ...entry.item };

    // Set canonical fields
    clonedItem.questionNumber = entry.isMcq ? `MCQ ${entry.questionNumber}` : entry.questionNumber;
    clonedItem.subQuestion = entry.isMcq ? 'MCQ' : entry.subQuestion;
    clonedItem.canonicalId = canonicalId;
    clonedItem.questionId = canonicalId;
    clonedItem.subQuestionId = entry.isMcq ? 'MCQ' : entry.subQuestion;
    clonedItem.parentQuestionId = entry.parentQuestionId;
    clonedItem.fullQuestionCode = canonicalId;

    // Apply authoritative max marks where supplied. No question-number defaults are used.
    let authMax: number | undefined = undefined;
    if (authoritativeMaxMap.has(canonicalId)) {
      authMax = authoritativeMaxMap.get(canonicalId);
    } else if (clonedItem.maximumMarks !== undefined && clonedItem.maximumMarks !== null && Number(clonedItem.maximumMarks) > 0) {
      authMax = Number(clonedItem.maximumMarks);
    } else if (clonedItem.maxMarks !== undefined && clonedItem.maxMarks !== null && Number(clonedItem.maxMarks) > 0) {
      authMax = Number(clonedItem.maxMarks);
    }

    if (authMax !== undefined) {
      clonedItem.maximumMarks = authMax;
      clonedItem.maxMarks = authMax;
      // Clamp awarded marks to authoritative max
      if (typeof clonedItem.marksAwarded === 'number' && clonedItem.marksAwarded > authMax) {
        clonedItem.marksAwarded = authMax;
      }
      if (typeof clonedItem.marksAwarded === 'number') {
        const itemFlags = Array.isArray(clonedItem.flags) ? clonedItem.flags : [];
        const requiresHumanReview =
          clonedItem.status === 'unclear' ||
          itemFlags.includes('REVIEW_REQUIRED') ||
          itemFlags.includes('FAILED_TO_EVALUATE') ||
          itemFlags.includes('TECHNICAL_FAILURE') ||
          itemFlags.includes('MODEL_UNCERTAIN');
        // An unresolved evaluation's marksLost is provisional, not a confirmed
        // academic deduction. Preserve it through canonical deduplication.
        clonedItem.marksLost = requiresHumanReview
          ? Math.max(0, Math.min(authMax, Math.round((Number(clonedItem.marksLost) || 0) * 4) / 4))
          : Math.max(0, Math.round((authMax - clonedItem.marksAwarded) * 4) / 4);
      }
    }

    result.push(clonedItem);
  }

  // Sort canonically: MCQs first (1..16), then descriptive questions (Q1, Q2(a), Q2(b), Q3(a), Q3(b), etc.)
  result.sort((a, b) => {
    const aCanon = parseCanonicalQuestionIdentity(a.canonicalId || a.fullQuestionCode || '');
    const bCanon = parseCanonicalQuestionIdentity(b.canonicalId || b.fullQuestionCode || '');

    if (aCanon.isMcq && !bCanon.isMcq) return -1;
    if (!aCanon.isMcq && bCanon.isMcq) return 1;

    const aNum = parseInt(aCanon.questionNumber, 10) || 0;
    const bNum = parseInt(bCanon.questionNumber, 10) || 0;
    if (aNum !== bNum) return aNum - bNum;

    const aSub = aCanon.subQuestion || '';
    const bSub = bCanon.subQuestion || '';
    return aSub.localeCompare(bSub);
  });

  return result;
}

/**
 * Validates that every canonical question ID occurs EXACTLY ONCE.
 * Throws an error or returns validation failure if duplicates or parent/child collisions remain.
 */
export function validateQuestionDeduplication(
  questions: Array<{ questionNumber?: string; subQuestion?: string; canonicalId?: string; fullQuestionCode?: string; questionId?: string }>,
  paperStructureSubQuestions?: AuthoritativeSubQuestionReference[]
): {
  isValid: boolean;
  duplicateIds: string[];
  parentChildCollisions: string[];
  details: string;
} {
  const counts = new Map<string, number>();
  const nonMcqCanonicalIds = new Set<string>();

  for (const q of questions) {
    const canonId = toCanonicalQuestionId(
      q.canonicalId || q.fullQuestionCode || q.questionId || q.questionNumber,
      q.subQuestion,
      paperStructureSubQuestions
    );
    counts.set(canonId, (counts.get(canonId) || 0) + 1);

    const parsed = parseCanonicalQuestionIdentity(canonId);
    if (!parsed.isMcq) {
      nonMcqCanonicalIds.add(canonId);
    }
  }

  const duplicateIds: string[] = [];
  for (const [id, count] of counts.entries()) {
    if (count > 1) {
      duplicateIds.push(id);
    }
  }

  // Check parent-child collisions: e.g. 'Q3' when 'Q3(b)' exists, or 'Q6(a)' when 'Q6(a)(1)' exists
  const parentChildCollisions: string[] = [];
  for (const childId of nonMcqCanonicalIds) {
    for (const potentialParentId of nonMcqCanonicalIds) {
      if (childId !== potentialParentId && childId.startsWith(`${potentialParentId}(`)) {
        if (!parentChildCollisions.includes(potentialParentId)) {
          parentChildCollisions.push(potentialParentId);
        }
      }
    }
  }

  const isValid = duplicateIds.length === 0 && parentChildCollisions.length === 0;
  const details = isValid
    ? 'All question evaluations have strictly unique canonical identities (occurrence count = 1).'
    : `Deduplication Validation Failed: Duplicates [${duplicateIds.join(', ')}], Parent-Child collisions [${parentChildCollisions.join(', ')}]`;

  return {
    isValid,
    duplicateIds,
    parentChildCollisions,
    details,
  };
}
