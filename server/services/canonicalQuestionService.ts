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
  canonicalId: string;       // e.g. 'Q3(b)', 'Q4(b)', 'Q1', 'MCQ1', 'Q6(a)(1)'
  questionNumber: string;    // e.g. '3', '4', '1', '6'
  subQuestion?: string;      // e.g. 'b', 'a(1)'
  parentQuestionId: string;  // e.g. 'Q3', 'Q4', 'Q1', 'Q6'
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
export function toCanonicalQuestionId(
  questionNumberInput?: string | number | null,
  subQuestionInput?: string | null
): string {
  const rawQ = String(questionNumberInput || '').trim();
  const rawSub = subQuestionInput ? String(subQuestionInput).trim() : '';

  // 1. MCQ Detection
  const isMcq =
    /^(?:MCQ|OBJECTIVE)/i.test(rawQ) ||
    /MCQ/i.test(rawQ) ||
    rawSub.toUpperCase() === 'MCQ';

  if (isMcq) {
    const num = rawQ.replace(/[^0-9]/g, '') || rawSub.replace(/[^0-9]/g, '') || '1';
    return `MCQ${num}`;
  }

  // 2. Parse rawQ first through canonical identity parser
  const parsedQ = parseCanonicalQuestionIdentity(rawQ);
  if (parsedQ.isMcq) {
    return parsedQ.canonicalId;
  }

  // If rawQ already contains a sub-question (e.g. 'Q3(b)', '3(b)', 'Q4(b)', 'Q6(a)(1)'):
  if (parsedQ.subQuestion) {
    // If rawSub is also provided and differs from parsedQ.subQuestion:
    const cleanRawSub = rawSub.toLowerCase().replace(/[^a-z0-9()]/g, '');
    if (!cleanRawSub || cleanRawSub === parsedQ.subQuestion || parsedQ.subQuestion.startsWith(cleanRawSub)) {
      return parsedQ.canonicalId;
    }
    // If parsedQ was Q6(a) and rawSub is '1' (nested sub-question like Q6(a)(1)):
    if (/^[0-9]+$/i.test(cleanRawSub) || /^[ivx]+$/i.test(cleanRawSub)) {
      return `Q${parsedQ.questionNumber}(${parsedQ.subQuestion}(${cleanRawSub}))`;
    }
    return parsedQ.canonicalId;
  }

  // If rawQ had no sub-question (e.g. '3', 'Q3', 'Question 4'), but rawSub is supplied:
  if (rawSub) {
    const parsedCombined = parseCanonicalQuestionIdentity(`Q${parsedQ.questionNumber}(${rawSub})`);
    return parsedCombined.canonicalId;
  }

  return parsedQ.canonicalId;
}

/**
 * Parses any arbitrary question string into a complete CanonicalQuestionIdentity.
 * Handles:
 * - Alternatives: "Q3(b) (OR)", "Q3(b) OR", "Q3(b) Alternative", "Q4(b) [Option 2]" -> canonicalId: "Q3(b)", isAlternative: true
 * - Separators: "Q3_b", "3.b", "3-b", "Question 3 Part (b)", "Question 3 Part B", "3b" -> "Q3(b)"
 * - Nested: "Q6(a)(1)", "6(a)(2)", "6(a)(i)" -> "Q6(a)(1)"
 * - Accidental duplicate echoes: "Q3(b)(b)" -> "Q3(b)", "Q4(b(b))" -> "Q4(b)"
 * - MCQs: "MCQ 1", "MCQ1", "Objective 1" -> "MCQ1"
 */
export function parseCanonicalQuestionIdentity(rawCode: string): CanonicalQuestionIdentity {
  let trimmed = (rawCode || '').trim();

  // MCQ check
  if (/^(?:MCQ|OBJECTIVE)/i.test(trimmed) || /MCQ/i.test(trimmed)) {
    const num = trimmed.replace(/[^0-9]/g, '') || '1';
    return {
      canonicalId: `MCQ${num}`,
      questionNumber: num,
      subQuestion: 'MCQ',
      parentQuestionId: `MCQ${num}`,
      isMcq: true,
      isAlternative: false,
    };
  }

  // Detect and strip alternative indicators: OR, ALTERNATIVE, ALT, OPTION 1/2, CHOICE 1/2
  let isAlternative = false;
  const altRegex = /(?:[\(\[\{]\s*(?:OR|ALT|ALTERNATIVE|OPTION\s*[0-9]+|CHOICE\s*[0-9]+)\s*[\)\]\}]|\b(?:OR|ALT|ALTERNATIVE|OPTION\s*[0-9]+|CHOICE\s*[0-9]+)\b)/gi;
  if (altRegex.test(trimmed)) {
    isAlternative = true;
    trimmed = trimmed.replace(altRegex, ' ').trim();
  }

  // Standard or nested descriptive: "Question 5(a)", "Q5(a)", "5(a)", "5a", "Q6(a)(1)", "6(a)(2)", "Q3_b", "3-b"
  const qMatch = trimmed.match(/^(?:Question\s*|Q\.?\s*|Ans\.?\s*|Answer\s*)?(\d+)\s*(.*)$/i);
  if (qMatch) {
    const qNum = qMatch[1];
    let rest = (qMatch[2] || '').trim();
    let subQ: string | undefined;

    if (rest) {
      // Strip leading punctuation / connectors: "_b", "- b", ". b", " Part (b)", " Part b"
      rest = rest.replace(/^[\s\-_.:/]+/, '').trim();
      rest = rest.replace(/^(?:Part|Sub[- ]?part)\s*/i, '').trim();

      // Check again for alternative tags inside rest
      if (altRegex.test(rest)) {
        isAlternative = true;
        rest = rest.replace(altRegex, ' ').trim();
      }

      // Check for duplicated sub-question concatenation, e.g. (b)(b) or (a)(a)
      const duplicateParenMatch = rest.match(/^\(([a-zA-Z0-9]+)\)\s*\(([a-zA-Z0-9]+)\)/);
      const nestedParenEnclosedMatch = rest.match(/^\(([a-zA-Z0-9]+)\(([a-zA-Z0-9]+)\)\)/);

      if (duplicateParenMatch && duplicateParenMatch[1].toLowerCase() === duplicateParenMatch[2].toLowerCase()) {
        subQ = duplicateParenMatch[1].toLowerCase();
      } else if (duplicateParenMatch) {
        // Legitimate nested sub-question: (a)(1) or (a)(i)
        subQ = `${duplicateParenMatch[1].toLowerCase()}(${duplicateParenMatch[2].toLowerCase()})`;
      } else if (nestedParenEnclosedMatch) {
        if (nestedParenEnclosedMatch[1].toLowerCase() === nestedParenEnclosedMatch[2].toLowerCase()) {
          subQ = nestedParenEnclosedMatch[1].toLowerCase();
        } else {
          subQ = `${nestedParenEnclosedMatch[1].toLowerCase()}(${nestedParenEnclosedMatch[2].toLowerCase()})`;
        }
      } else {
        // Direct nested without outer parens: a(1) or a(i) or a(a)
        const directNestedMatch = rest.match(/^([a-zA-Z0-9]+)\s*\(([a-zA-Z0-9]+)\)/);
        if (directNestedMatch && directNestedMatch[1].toLowerCase() === directNestedMatch[2].toLowerCase()) {
          subQ = directNestedMatch[1].toLowerCase();
        } else if (directNestedMatch) {
          subQ = `${directNestedMatch[1].toLowerCase()}(${directNestedMatch[2].toLowerCase()})`;
        } else {
          // Single bracket: (a) or [a]
          const singleBracket = rest.match(/^[\(\[]([a-zA-Z0-9]+)[\)\]]/);
          if (singleBracket) {
            subQ = singleBracket[1].toLowerCase();
          } else {
            // Direct token: a or b or c or a1 or a2
            const directMatch = rest.match(/^([a-zA-Z](?:\([a-zA-Z0-9]+\)|[0-9]+)?)/);
            if (directMatch) {
              subQ = directMatch[1].toLowerCase();
            }
          }
        }
      }
    }

    // Collapse any inner echo like 'b(b)' into 'b'
    if (subQ) {
      subQ = subQ.replace(/^([a-z])\(\1\)$/i, '$1');
    }

    const canonicalId = subQ ? `Q${qNum}(${subQ})` : `Q${qNum}`;
    return {
      canonicalId,
      questionNumber: qNum,
      subQuestion: subQ,
      parentQuestionId: `Q${qNum}`,
      isMcq: false,
      isAlternative,
    };
  }

  const digits = trimmed.replace(/[^0-9]/g, '') || '1';
  return {
    canonicalId: `Q${digits}`,
    questionNumber: digits,
    subQuestion: undefined,
    parentQuestionId: `Q${digits}`,
    isMcq: false,
    isAlternative,
  };
}

/**
 * Known official baseline maximum marks for standard CA questions when not overridden.
 * Guarantees Q3(b) = 4, Q4(b) = 4, Q3(a) = 6, Q4(a) = 6, etc.
 */
const BASELINE_AUTHORITATIVE_MAX_MARKS: Record<string, number> = {
  'Q1': 15,
  'Q1(a)': 10,
  'Q1(b)': 4,
  'Q2(a)': 4,
  'Q2(b)': 6,
  'Q3(a)': 6,
  'Q3(b)': 4,
  'Q4(a)': 6,
  'Q4(b)': 4,
  'Q5(a)': 10,
  'Q5(b)': 5,
  'Q6(a)': 3,
  'Q6(b)': 2,
  'Q6(c)': 5,
  'Q7(a)': 5,
  'Q7(b)': 5,
  'Q8(a)': 5,
  'Q8(b)': 5,
};

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
  [key: string]: any;
}>(
  questions: T[],
  paperStructureSubQuestions?: AuthoritativeSubQuestionReference[]
): T[] {
  if (!Array.isArray(questions) || questions.length === 0) {
    return [];
  }

  // 1. Compute canonical identity for each item
  const mapped = questions.map((item) => {
    const raw = item.canonicalId || item.fullQuestionCode || item.questionId;
    const canonId = toCanonicalQuestionId(
      raw || item.questionNumber,
      item.subQuestion || item.subQuestionNumber || item.subQuestionId
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
        const sqCanon = toCanonicalQuestionId(sq.fullQuestionCode || sq.questionNumber, sq.subQuestionNumber);
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

  for (const entry of nonParentDuplicates) {
    const key = entry.canonicalId;
    if (!canonicalMap.has(key)) {
      canonicalMap.set(key, entry);
    } else {
      // Conflict resolution: Choose the more complete / detailed evaluation
      const existing = canonicalMap.get(key)!;
      const existingComps = existing.item.markingComponents?.length || 0;
      const newComps = entry.item.markingComponents?.length || 0;

      // Prefer non-alternative over alternative if both present and equal,
      // or prefer the entry with marking components, or higher marks awarded, or longer feedback
      const existingHasEvidence = existingComps > 0 || (existing.item.marksAwarded || 0) > 0;
      const newHasEvidence = newComps > 0 || (entry.item.marksAwarded || 0) > 0;

      let shouldReplace = false;
      if (!existingHasEvidence && newHasEvidence) {
        shouldReplace = true;
      } else if (newComps > existingComps) {
        shouldReplace = true;
      } else if (newComps === existingComps && (entry.item.marksAwarded || 0) > (existing.item.marksAwarded || 0)) {
        shouldReplace = true;
      } else if (newComps === existingComps && (entry.item.detailedFeedback || '').length > (existing.item.detailedFeedback || '').length) {
        shouldReplace = true;
      }

      if (shouldReplace) {
        canonicalMap.set(key, entry);
      }
    }
  }

  // 5. Authoritative Maximum Marks Alignment
  const authoritativeMaxMap = new Map<string, number>();
  if (Array.isArray(paperStructureSubQuestions)) {
    for (const sq of paperStructureSubQuestions) {
      const canon = toCanonicalQuestionId(sq.fullQuestionCode || sq.questionNumber, sq.subQuestionNumber);
      authoritativeMaxMap.set(canon, sq.maximumMarks);
    }
  }

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

    // Apply authoritative max marks: explicit paper structure first, then item's existing maximumMarks, then baseline fallback
    let authMax: number | undefined = undefined;
    if (authoritativeMaxMap.has(canonicalId)) {
      authMax = authoritativeMaxMap.get(canonicalId);
    } else if (clonedItem.maximumMarks !== undefined && clonedItem.maximumMarks !== null && Number(clonedItem.maximumMarks) > 0) {
      authMax = Number(clonedItem.maximumMarks);
    } else if (clonedItem.maxMarks !== undefined && clonedItem.maxMarks !== null && Number(clonedItem.maxMarks) > 0) {
      authMax = Number(clonedItem.maxMarks);
    } else if (BASELINE_AUTHORITATIVE_MAX_MARKS[canonicalId] !== undefined) {
      authMax = BASELINE_AUTHORITATIVE_MAX_MARKS[canonicalId];
    }

    if (authMax !== undefined) {
      clonedItem.maximumMarks = authMax;
      clonedItem.maxMarks = authMax;
      // Clamp awarded marks to authoritative max
      if (typeof clonedItem.marksAwarded === 'number' && clonedItem.marksAwarded > authMax) {
        clonedItem.marksAwarded = authMax;
      }
      if (typeof clonedItem.marksAwarded === 'number') {
        clonedItem.marksLost = Math.max(0, Math.round((authMax - clonedItem.marksAwarded) * 4) / 4);
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
  questions: Array<{ questionNumber?: string; subQuestion?: string; canonicalId?: string; fullQuestionCode?: string; questionId?: string }>
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
      q.subQuestion
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
